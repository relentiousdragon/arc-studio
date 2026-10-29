import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildBotArchive } from '../src/export/BotArchive.js';
//
function readZipEntry(archive, targetName) {
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const headerEnd = offset + 30 + nameLength + extraLength;
    const name = archive.toString('utf8', offset + 30, offset + 30 + nameLength);
    const data = archive.subarray(headerEnd, headerEnd + compressedSize);
    if (name === targetName) {
      return compressionMethod === 8 ? inflateRawSync(data).toString('utf8') : data.toString('utf8');
    }
    offset = headerEnd + compressedSize;
  }
  throw new Error(`Missing archive entry ${targetName}`);
}

function listZipEntries(archive) {
  const entries = new Set();
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const headerEnd = offset + 30 + nameLength + extraLength;
    entries.add(archive.toString('utf8', offset + 30, offset + 30 + nameLength));
    offset = headerEnd + compressedSize;
  }
  return entries;
}

function extractZipEntries(archive, directory) {
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const compressionMethod = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const headerEnd = offset + 30 + nameLength + extraLength;
    const name = archive.toString('utf8', offset + 30, offset + 30 + nameLength);
    const compressedData = archive.subarray(headerEnd, headerEnd + compressedSize);
    const data = compressionMethod === 8 ? inflateRawSync(compressedData) : compressedData;
    const target = path.join(directory, ...name.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    offset = headerEnd + compressedSize;
  }
}

test('standalone bot export refreshes APP_LATENCY at intervals and falls back to zero', () => {
  const archive = buildBotArchive([], [{
    id: 'project_var_app_latency',
    name: 'APP_LATENCY',
    type: 'number',
    initialValue: 0,
    systemManaged: true
  }]);
  const runtime = readZipEntry(archive, 'src/index.js');
  const variables = JSON.parse(readZipEntry(archive, 'project-variables.json'));

  assert.match(runtime, /project_var_app_latency/);
  assert.match(runtime, /setInterval\(async \(\) =>/);
  assert.match(runtime, /performance\.now\(\)/);
  assert.match(runtime, /appLatency = 0/);
  assert.match(runtime, /}, 30000\)/);
  assert.equal(variables[0].initialValue, 0);
});

test('standalone bot export updates gateway latency on heartbeat and uptime while running', () => {
  const archive = buildBotArchive([], [
    { id: 'project_var_gateway_latency', name: 'GATEWAY_LATENCY', type: 'number', initialValue: 0 },
    { id: 'project_var_bot_uptime', name: 'BOT_UPTIME', type: 'number', initialValue: 0 }
  ]);
  const runtime = readZipEntry(archive, 'src/index.js');

  assert.match(runtime, /project_var_gateway_latency/);
  assert.match(runtime, /client\.on\('heartbeatLatency'/);
  assert.match(runtime, /project_var_bot_uptime/);
  assert.match(runtime, /setInterval\(\(\) =>/);
  assert.match(runtime, /botUptimeStartedAt = performance\.now\(\)/);
  assert.match(runtime, /projectVariableValues\.set\(botUptimeVariable\.id, 0\)/);
});

test('standalone bot export includes modular node schemas and their runtime dependencies', () => {
  const archive = buildBotArchive([{
    id: 'network-export',
    nodes: [{ id: 'request', type: 'action_web_retry', data: {} }],
    connections: []
  }]);
  const entries = listZipEntries(archive);
  const graphRunner = readZipEntry(archive, 'src/engine/GraphRunner.js');
  const nodeRegistry = readZipEntry(archive, 'src/engine/NodeRegistry.js');
  const nodeIndex = readZipEntry(archive, 'src/engine/nodes/index.js');
  const networkRuntime = readZipEntry(archive, 'src/engine/nodes/runtime/network.js');
  const dataRuntime = readZipEntry(archive, 'src/engine/nodes/runtime/data.js');
  const retrySchema = readZipEntry(archive, 'src/engine/nodes/web-network/action_web_retry.js');

  assert.match(graphRunner, /import\('\.\/nodes\/runtime\/network\.js'\)/);
  assert.match(nodeRegistry, /nodes\/index\.js/);
  assert.match(nodeIndex, /web-network\/action_web_retry\.js/);
  assert.match(networkRuntime, /SafeHttpRequest\.js/);
  assert.match(dataRuntime, /export function evaluateDataNode/);
  assert.ok(entries.has('src/engine/SafeHttpRequest.js'));
  assert.ok(!entries.has('src/engine/nodes/runtime/crypto.js'));
  assert.ok(!entries.has('src/security/CryptoEngine.js'));
  assert.match(retrySchema, /"type": "action_web_retry"/);
});

test('standalone bot export packages only runtime modules required by graph node types', () => {
  const archive = buildBotArchive([{
    id: 'minimal-export',
    nodes: [{ id: 'delay', type: 'delay', data: {} }],
    connections: []
  }]);
  const entries = listZipEntries(archive);

  for (const module of ['builders.js', 'control_flow.js', 'data.js', 'logic.js']) {
    assert.ok(entries.has(`src/engine/nodes/runtime/${module}`), `${module} is required by the core runtime`);
  }
  for (const module of [
    'crypto.js', 'network.js', 'discord_presence.js', 'discord_messages.js',
    'discord_interactions.js', 'discord_guild.js'
  ]) {
    assert.ok(!entries.has(`src/engine/nodes/runtime/${module}`), `${module} is unused by this graph`);
  }
  assert.ok(!entries.has('src/engine/SafeHttpRequest.js'));
  assert.ok(!entries.has('src/security/CryptoEngine.js'));
});

test('standalone bot export stores graph and node IDs without display names', () => {
  const archive = buildBotArchive([{
    id: 'graph_id_123',
    name: 'Private Graph Display Name',
    nodes: [{
      id: 'node_id_456',
      type: 'delay',
      label: 'Private Node Display Name',
      data: { name: 'Runtime data remains available' }
    }],
    connections: []
  }]);
  const graphs = JSON.parse(readZipEntry(archive, 'graphs.json'));
  const runtime = readZipEntry(archive, 'src/index.js');

  assert.equal(graphs[0].id, 'graph_id_123');
  assert.equal(Object.hasOwn(graphs[0], 'name'), false);
  assert.equal(graphs[0].nodes[0].id, 'node_id_456');
  assert.equal(Object.hasOwn(graphs[0].nodes[0], 'label'), false);
  assert.equal(graphs[0].nodes[0].data.name, 'Runtime data remains available');
  assert.doesNotMatch(readZipEntry(archive, 'graphs.json'), /Private (?:Graph|Node) Display Name/);
  assert.match(runtime, /failure\.graphId/);
  assert.match(runtime, /failure\.nodeId/);
  assert.doesNotMatch(runtime, /failure\.graphName|failure\.nodeLabel/);
});

test('standalone bot export includes crypto runtime and engine only when crypto nodes are used', () => {
  const archive = buildBotArchive([{
    id: 'crypto-export',
    nodes: [{ id: 'hash', type: 'action_crypto_hash', data: {} }],
    connections: []
  }]);
  const entries = listZipEntries(archive);
  const cryptoRuntime = readZipEntry(archive, 'src/engine/nodes/runtime/crypto.js');

  assert.ok(entries.has('src/security/CryptoEngine.js'));
  assert.match(cryptoRuntime, /CryptoEngine\.js/);
});

test('selectively exported GraphRunner loads and executes its included action runtime', async () => {
  const archive = buildBotArchive([{
    id: 'presence-export',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'presence', type: 'action_set_presence', data: { status: 'idle' } }
    ],
    connections: [{ sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'presence', targetPinId: 'exec' }]
  }]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-selective-bot-export-'));

  try {
    extractZipEntries(archive, directory);
    fs.mkdirSync(path.join(directory, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(directory, 'chezcord'), path.join(directory, 'node_modules/chezcord'), 'dir');
    const { GraphRunner } = await import(pathToFileURL(path.join(directory, 'src/engine/GraphRunner.js')).href);
    const presences = [];
    const result = await GraphRunner.execute({
      id: 'presence-export',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        { id: 'presence', type: 'action_set_presence', data: { status: 'idle' } }
      ],
      connections: [{ sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'presence', targetPinId: 'exec' }]
    }, 'MESSAGE_CREATE', {}, { client: { setPresence: (presence) => presences.push(presence) }, log: () => {} });

    assert.equal(result.error, null);
    assert.equal(presences.length, 1);
    assert.equal(presences[0].status, 'idle');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('standalone bot export contains all relative engine imports', () => {
  const archive = buildBotArchive([]);
  const entries = listZipEntries(archive);
  for (const entry of entries) {
    if (!entry.startsWith('src/engine/') || !entry.endsWith('.js')) continue;
    const source = readZipEntry(archive, entry);
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(entry), match[1]));
      assert.ok(entries.has(target), `${entry} imports missing archive entry ${target}`);
    }
  }
});

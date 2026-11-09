import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildBotArchive, verifyBotArchiveIntegrity, generateThirdPartyLicenses, findPluginLicense } from '../src/export/BotArchive.js';
//
const require = createRequire(import.meta.url);
function installedPackageRoot(name) {
  let directory = path.dirname(require.resolve(name));
  while (!fs.existsSync(path.join(directory, 'package.json'))) directory = path.dirname(directory);
  return directory;
}
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
    nodes: [
      { id: 'request', type: 'action_web_retry', data: {} },
      { id: 'guild-member-permissions', type: 'action_get_guild_member_permissions', data: {} },
      { id: 'guild-role-permissions', type: 'action_get_guild_role_permissions', data: {} },
      { id: 'channel-member-permissions', type: 'action_get_channel_member_permissions', data: {} },
      { id: 'channel-role-permissions', type: 'action_get_channel_role_permissions', data: {} }
    ],
    connections: []
  }]);
  const entries = listZipEntries(archive);
  const graphRunner = readZipEntry(archive, 'src/engine/GraphRunner.js');
  const nodeRegistry = readZipEntry(archive, 'src/engine/NodeRegistry.js');
  const nodeSchemaDefinitions = readZipEntry(archive, 'src/engine/NodeSchemaDefinitions.js');
  const nodeIndex = readZipEntry(archive, 'src/engine/nodes/index.js');
  const networkRuntime = readZipEntry(archive, 'src/engine/nodes/runtime/network.js');
  const dataRuntime = readZipEntry(archive, 'src/engine/nodes/runtime/data.js');
  const guildRuntime = readZipEntry(archive, 'src/engine/nodes/runtime/discord_guild.js');
  const retrySchema = readZipEntry(archive, 'src/engine/nodes/web-network/action_web_retry.js');

  assert.match(graphRunner, /import\('\.\/nodes\/runtime\/network\.js'\)/);
  assert.match(nodeSchemaDefinitions, /nodes\/index\.js/);
  assert.match(nodeIndex, /web-network\/action_web_retry\.js/);
  assert.match(networkRuntime, /SafeHttpRequest\.js/);
  assert.match(dataRuntime, /export function evaluateDataNode/);
  assert.match(guildRuntime, /getGuildMemberPermissions/);
  assert.match(guildRuntime, /getGuildRolePermissions/);
  assert.match(guildRuntime, /getChannelMemberPermissions/);
  assert.match(guildRuntime, /getChannelRolePermissions/);
  assert.ok(entries.has('src/engine/SafeHttpRequest.js'));
  for (const type of [
    'action_get_guild_member_permissions', 'action_get_guild_role_permissions',
    'action_get_channel_member_permissions', 'action_get_channel_role_permissions'
  ]) assert.ok(entries.has(`src/engine/nodes/discord-actions/${type}.js`));
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
    'crypto.js', 'network.js', 'console_log.js', 'discord_presence.js', 'discord_messages.js',
    'discord_interactions.js', 'discord_guild.js'
  ]) {
    assert.ok(!entries.has(`src/engine/nodes/runtime/${module}`), `${module} is unused by this graph`);
  }
  assert.ok(!entries.has('src/engine/SafeHttpRequest.js'));
  assert.ok(!entries.has('src/security/CryptoEngine.js'));
});

test('standalone bot export preserves disabled graphs and excludes their commands and runtime', () => {
  const archive = buildBotArchive([{
    id: 'disabled-slash',
    enabled: false,
    nodes: [
      { id: 'slash', type: 'event_slash_command', data: { commandName: 'sleep', description: 'Disabled command' } },
      { id: 'presence', type: 'action_set_presence', data: { status: 'idle' } }
    ],
    connections: []
  }]);
  const exportedGraphs = JSON.parse(readZipEntry(archive, 'graphs.json'));
  const exportedRuntime = readZipEntry(archive, 'src/engine/GraphRunner.js');
  const exportedMain = readZipEntry(archive, 'src/index.js');

  assert.equal(exportedGraphs[0].enabled, false);
  assert.match(exportedMain, /if \(graph\.enabled === false\) continue;/);
  assert.match(exportedMain, /disabledCommandKeys/);
  assert.match(exportedRuntime, /graph\?\.enabled === false/);
  assert.ok(!listZipEntries(archive).has('src/engine/nodes/runtime/discord_presence.js'));
});

test('standalone bot export includes the console log runtime when its nodes are used', () => {
  const archive = buildBotArchive([{
    id: 'console-export',
    nodes: [{ id: 'warn', type: 'action_console_warn', data: { message: 'Warning' } }],
    connections: []
  }]);

  assert.ok(listZipEntries(archive).has('src/engine/nodes/runtime/console_log.js'));
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
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const moduleDirectory = path.join(directory, 'node_modules');
    fs.mkdirSync(moduleDirectory, { recursive: true });
    for (const name of Object.keys(manifest.dependencies)) {
      const source = name === 'chezcord' ? path.join(directory, 'chezcord') : installedPackageRoot(name);
      fs.symlinkSync(source, path.join(moduleDirectory, name), 'dir');
    }
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

test('standalone bot export integrity manifest excludes mutable env file', () => {
  const archive = buildBotArchive([], []);
  assert.equal(verifyBotArchiveIntegrity(archive), true);

  const manifest = JSON.parse(readZipEntry(archive, 'integrity.json'));
  assert.equal(Object.hasOwn(manifest.files, '.env'), false, '.env should not be in integrity manifest');
  assert.ok(Object.hasOwn(manifest.files, 'src/index.js'), 'src/index.js should be in integrity manifest');
});

test('standalone bot export includes THIRD-PARTY-LICENSES.md and chezcord LICENSE', () => {
  const archive = buildBotArchive([], []);
  const entries = listZipEntries(archive);

  assert.ok(entries.has('THIRD-PARTY-LICENSES.md'));
  assert.ok(entries.has('chezcord/LICENSE'));
  assert.ok(entries.has('LICENSE'));

  const licenses = readZipEntry(archive, 'THIRD-PARTY-LICENSES.md');
  assert.match(licenses, /Chezcord/);
  assert.match(licenses, /Apache-2\.0/);
});

test('standalone bot export documents plugin licenses and bundles license file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-plugin-license-test-'));
  try {
    fs.writeFileSync(path.join(tempDir, 'LICENSE'), 'MIT License\n\nCopyright 2026 Test Plugin Author\n');
    fs.writeFileSync(path.join(tempDir, 'runtime.js'), 'export function execute() {}\n');
    const adapter = {
      directory: tempDir,
      manifest: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        kind: 'host-adapter',
        author: 'Test Author',
        license: 'MIT',
        nodes: [{ type: 'arc.test_node', label: 'Test Node', inputs: [], outputs: [] }],
        runtime: { module: 'runtime.js', execute: 'execute' },
        export: { dependencies: { 'test-pkg': '^1.0.0' }, runtimeConfig: {} },
        thirdPartyNotices: [
          { name: 'helper-lib', version: '2.0.0', license: 'BSD-3-Clause', notice: 'Copyright Helper Lib' }
        ]
      }
    };
    const archive = buildBotArchive(
      [{ id: 'g1', nodes: [{ id: 'n1', type: 'arc.test_node' }], connections: [] }],
      [],
      [adapter]
    );
    const entries = listZipEntries(archive);
    assert.ok(entries.has('plugins/test-plugin/LICENSE'));
    assert.ok(entries.has('THIRD-PARTY-LICENSES.md'));

    const licenses = readZipEntry(archive, 'THIRD-PARTY-LICENSES.md');
    assert.match(licenses, /Test Plugin/);
    assert.match(licenses, /MIT License/);
    assert.match(licenses, /helper-lib/);
    assert.match(licenses, /BSD-3-Clause/);
    assert.match(licenses, /test-pkg/);

    const readme = readZipEntry(archive, 'README.md');
    assert.match(readme, /THIRD-PARTY-LICENSES\.md/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

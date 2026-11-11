import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import test from 'node:test';
//s
function readZipEntry(archive, targetName) {
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const headerEnd = offset + 30 + nameLength + extraLength;
    const name = archive.toString('utf8', offset + 30, offset + 30 + nameLength);
    const bytes = archive.subarray(headerEnd, headerEnd + compressedSize);
    if (name === targetName) return method === 8 ? inflateRawSync(bytes) : bytes;
    offset = headerEnd + compressedSize;
  }
  throw new Error(`Missing archive entry ${targetName}`);
}

test('catalog host adapter export files are installed and included in bot archives', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-plugin-export-test-'));
  const previousDataDir = process.env.ARC_DATA_DIR;
  const previousPluginsPath = process.env.ARC_PLUGINS_PATH;
  const previousFetch = globalThis.fetch;
  process.env.ARC_DATA_DIR = dataDir;
  delete process.env.ARC_PLUGINS_PATH;

  try {
    const runtime = 'export async function executeFixture() { return {}; }\n';
    const license = 'MIT License\nFixture license text.\n';
    const runtimeSha256 = createHash('sha256').update(runtime).digest('hex');
    const permissions = [{
      id: 'fixture.access',
      name: 'Fixture access',
      description: 'Allow fixture adapter nodes to run.'
    }];
    const node = {
      type: 'arc.fixture.ping',
      label: 'Fixture Ping',
      category: 'Fixture',
      description: 'Exercise the adapter export path.',
      color: '#36a981',
      inputs: [{ id: 'exec', label: 'Exec', type: 'exec' }],
      outputs: [{ id: 'exec', label: 'Exec', type: 'exec' }]
    };
    const manifest = {
      schemaVersion: 1,
      kind: 'host-adapter',
      id: 'arc.fixture',
      name: 'Fixture Adapter',
      version: '1.0.0',
      minArcStudioVersion: '2026.1.1-alpha.6',
      description: 'Test host adapter export file installation.',
      author: 'ARC tests',
      license: 'MIT',
      runtime: { module: 'runtime.js', execute: 'executeFixture', sha256: runtimeSha256 },
      export: {
        files: ['LICENSE'],
        dependencies: {},
        runtimeConfig: { __projectDir: { value: 'exported-bot' } }
      },
      permissions,
      settingsSchema: [],
      thirdPartyNotices: [],
      runtimeDependencies: [],
      npmDependencies: [],
      nodes: [{ ...node, requiredPermission: 'fixture.access' }]
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const registryEntry = {
      kind: 'host-adapter',
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      tags: [],
      arcApiVersion: 1,
      minArcStudioVersion: manifest.minArcStudioVersion,
      commit: 'a'.repeat(40),
      path: 'adapters/fixture/arc-plugin.json',
      sha256: createHash('sha256').update(manifestBytes).digest('hex'),
      runtimeSha256,
      nodeTypes: [node.type],
      permissions,
      settingsSchema: [],
      thirdPartyNotices: [],
      runtimeDependencies: [],
      npmDependencies: [],
      dependencyLockSha256: '',
      dependencyPackageCount: 0
    };
    const registry = { schemaVersion: 1, plugins: [registryEntry] };
    globalThis.fetch = async (input) => {
      const url = String(input);
      let bytes;
      if (url.endsWith('/main/registry.json')) bytes = Buffer.from(JSON.stringify(registry));
      else if (url.endsWith('/adapters/fixture/arc-plugin.json')) bytes = manifestBytes;
      else if (url.endsWith('/adapters/fixture/runtime.js')) bytes = Buffer.from(runtime);
      else if (url.endsWith('/adapters/fixture/LICENSE')) bytes = Buffer.from(license);
      else throw new Error(`Unexpected plugin download URL: ${url}`);
      return new Response(bytes, { status: 200 });
    };

    const { PluginStore } = await import('../src/engine/PluginStore.js');
    const { buildBotArchive } = await import('../src/export/BotArchive.js');
    PluginStore.setRepository('https://github.com/arc-tests/plugin-catalog');
    await PluginStore.install(manifest.id, null, {
      permissions: ['fixture.access'],
      hostCodeConfirmed: true,
      ownerApprovedHostCode: true
    });

    const graph = {
      id: 'fixture-graph',
      nodes: [{ id: 'node-1', type: node.type, data: {} }],
      connections: []
    };
    const adapters = PluginStore.exportAdapters([graph]);
    assert.equal(fs.readFileSync(path.join(adapters[0].directory, 'LICENSE'), 'utf8'), license);

    const archive = buildBotArchive([graph], [], adapters);
    assert.equal(readZipEntry(archive, 'plugins/arc.fixture/LICENSE').toString('utf8'), license);
    assert.equal(readZipEntry(archive, 'src/plugins/arc.fixture/runtime.js').toString('utf8'), runtime);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDataDir === undefined) delete process.env.ARC_DATA_DIR;
    else process.env.ARC_DATA_DIR = previousDataDir;
    if (previousPluginsPath === undefined) delete process.env.ARC_PLUGINS_PATH;
    else process.env.ARC_PLUGINS_PATH = previousPluginsPath;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

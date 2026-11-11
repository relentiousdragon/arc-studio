import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
//
test('local host adapter folders install declared files and register their nodes', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-local-host-adapter-'));
  const projectDir = path.join(dataDir, 'project');
  const previousDataDir = process.env.ARC_DATA_DIR;
  const previousPluginsPath = process.env.ARC_PLUGINS_PATH;
  process.env.ARC_DATA_DIR = dataDir;
  delete process.env.ARC_PLUGINS_PATH;

  try {
    const { PluginStore } = await import('../src/engine/PluginStore.js');
    const runtime = Buffer.from('export async function executeFixture(type, inputs) { return { type, inputs }; }\n');
    const license = Buffer.from('MIT License\nFixture adapter license.\n');
    const manifest = {
      schemaVersion: 1,
      kind: 'host-adapter',
      id: 'arc.local-fixture',
      name: 'Local Fixture',
      version: '1.0.0',
      minArcStudioVersion: '2026.1.1-alpha.6',
      description: 'Exercise local host adapter folder imports.',
      author: 'ARC tests',
      license: 'MIT',
      runtime: {
        module: 'runtime.js',
        execute: 'executeFixture',
        sha256: (await import('node:crypto')).createHash('sha256').update(runtime).digest('hex')
      },
      export: { files: ['LICENSE'], dependencies: {}, runtimeConfig: {} },
      permissions: [{
        id: 'fixture.read',
        name: 'Read fixture data',
        description: 'Allow fixture adapter nodes to read project data.'
      }],
      settingsSchema: [],
      thirdPartyNotices: [],
      runtimeDependencies: [],
      npmDependencies: [],
      nodes: [{
        type: 'arc.local-fixture.run',
        requiredPermission: 'fixture.read',
        label: 'Run Fixture',
        category: 'Fixture',
        description: 'Run the local adapter fixture.',
        color: '#36a981',
        inputs: [
          { id: 'exec', label: 'Exec', type: 'exec' },
          { id: 'value', label: 'Value', type: 'string' }
        ],
        outputs: [
          { id: 'exec', label: 'Exec', type: 'exec' },
          { id: 'value', label: 'Value', type: 'string' }
        ]
      }]
    };

    await assert.rejects(PluginStore.importLocalHostAdapter(manifest, runtime, [], '', {
      projectDir,
      permissions: ['fixture.read'],
      hostCodeConfirmed: true,
      ownerApprovedHostCode: false
    }), /Only the project owner or a workspace admin/);

    const installed = await PluginStore.importLocalHostAdapter(manifest, runtime, [
      { relativePath: 'LICENSE', bytes: license }
    ], '', {
      projectDir,
      permissions: ['fixture.read'],
      installedBy: 'owner',
      hostCodeConfirmed: true,
      ownerApprovedHostCode: true
    });

    assert.equal(installed.kind, 'host-adapter');
    assert.equal(installed.sourceType, 'local');
    assert.deepEqual(PluginStore.projectPermissions(projectDir, manifest.id), ['fixture.read']);
    assert.equal(fs.readFileSync(path.join(dataDir, 'plugin-adapters', manifest.id, 'LICENSE'), 'utf8'), license.toString('utf8'));
    assert.deepEqual(
      await PluginStore.executeAdapter('arc.local-fixture.run', { value: 'ready' }, { projectDir }),
      { type: 'arc.local-fixture.run', inputs: { value: 'ready' } }
    );
  } finally {
    if (previousDataDir === undefined) delete process.env.ARC_DATA_DIR;
    else process.env.ARC_DATA_DIR = previousDataDir;
    if (previousPluginsPath === undefined) delete process.env.ARC_PLUGINS_PATH;
    else process.env.ARC_PLUGINS_PATH = previousPluginsPath;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

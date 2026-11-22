import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { createArcArchive, isArcArchive, readArcArchive } from '../src/storage/ArcArchive.js';
import { createArcArchiveStream, createEncryptedArcProjectArchiveStream } from '../src/storage/ArcArchiveStream.js';
import { inspectArcProjectArchive, prepareArcProjectImport } from '../src/storage/ArcArchiveFile.js';
import { ProjectMediaStore } from '../src/engine/ProjectMediaStore.js';
import { ProjectStore } from '../src/storage/ProjectStore.js';

const imageData = 'data:image/png;base64,iVBORw0KGgo=';
//
async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function streamedProjectFixture() {
  const id = 'media_11111111-1111-4111-8111-111111111111';
  const name = `attachments/${id}.bin`;
  const media = Buffer.from('streamed project media');
  const sha256 = createHash('sha256').update(media).digest('hex');
  return {
    payload: {
      format: 'arc-project', version: 1, project: { name: 'Stream fixture' },
      files: {
        'graphs.json': { graphs: [{ id: 'graph_fixture', nodes: [{ id: 'node_fixture', data: { attachments: [{ assetId: id, filename: 'data.bin' }] } }], connections: [] }] },
        'media-assets.json': [{ id, filename: 'data.bin', contentType: 'application/octet-stream', size: media.length, sha256, data: `arc-attachment://${name}?mime=application%2Foctet-stream` }]
      }
    },
    sources: new Map([[name, { bytes: media, expectedSha256: sha256 }]])
  };
}

test('streamed ZIP64 project archives restore media references and verify content hashes', async () => {
  const { payload, sources } = streamedProjectFixture();
  const archive = await collectStream(await createArcArchiveStream(payload, sources));
  assert.equal(isArcArchive(archive), true);
  const restored = await readArcArchive(archive, 'arc-project');
  assert.equal(restored.files['media-assets.json'][0].data, 'data:application/octet-stream;base64,c3RyZWFtZWQgcHJvamVjdCBtZWRpYQ==');
});

test('streamed encrypted ZIP64 exports decrypt and reject modified authentication tags', async () => {
  const { payload, sources } = streamedProjectFixture();
  const password = 'correct horse battery staple';
  const archive = await collectStream(await createEncryptedArcProjectArchiveStream(payload, sources, password));
  const envelope = await readArcArchive(archive, 'arc-project');
  assert.equal(envelope.format, 'arc-project-encrypted');
  const restored = await ProjectStore.prototype.decryptProjectBundle.call({}, envelope, password);
  assert.equal(restored.project.name, payload.project.name);
  assert.equal(restored.files['media-assets.json'][0].data, 'data:application/octet-stream;base64,c3RyZWFtZWQgcHJvamVjdCBtZWRpYQ==');
  await assert.rejects(ProjectStore.prototype.decryptProjectBundle.call({}, { ...envelope, tag: Buffer.alloc(16).toString('base64') }, password), /incorrect or.*damaged/);
});

test('disk staged project import keeps media IDs and copies archive assets with bounded buffers', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arc-project-import-'));
  try {
    const { payload, sources } = streamedProjectFixture();
    const archivePath = path.join(directory, 'project.arcproject');
    await pipeline(await createArcArchiveStream(payload, sources), fs.createWriteStream(archivePath, { mode: 0o600 }));
    const inspection = await inspectArcProjectArchive(archivePath);
    assert.equal(inspection.encrypted, false);
    const prepared = await prepareArcProjectImport(archivePath, { stagingDirectory: directory });
    const projectRoot = path.join(directory, 'projects');
    const store = Object.create(ProjectStore.prototype);
    store.projects = [];
    store.maxProjects = null;
    store.directory = (id) => path.join(projectRoot, id);
    store.persist = () => {};
    const project = await store.importProjectFromArchive(prepared.bundle, prepared.sources, { trusted: true, allowOldVersion: true });
    const savedAssets = JSON.parse(fs.readFileSync(path.join(store.directory(project.id), 'media-assets.json'), 'utf8'));
    const savedGraphs = JSON.parse(fs.readFileSync(path.join(store.directory(project.id), 'graphs.json'), 'utf8'));
    const media = new ProjectMediaStore(store.directory(project.id)).getBytes('media_11111111-1111-4111-8111-111111111111');
    assert.equal(savedAssets[0].id, 'media_11111111-1111-4111-8111-111111111111');
    assert.equal(Object.hasOwn(savedAssets[0], 'data'), false);
    assert.equal(savedGraphs.graphs[0].nodes[0].data.attachments[0].assetId, savedAssets[0].id);
    assert.deepEqual(media.bytes, Buffer.from('streamed project media'));
    const cancelledStore = Object.create(ProjectStore.prototype);
    cancelledStore.projects = [];
    cancelledStore.maxProjects = null;
    cancelledStore.directory = (id) => path.join(directory, 'cancelled-projects', id);
    cancelledStore.persist = () => {};
    const controller = new AbortController();
    controller.abort(new Error('Project import cancelled.'));
    await assert.rejects(cancelledStore.importProjectFromArchive(prepared.bundle, prepared.sources, { trusted: true, allowOldVersion: true, signal: controller.signal }));
    assert.equal(cancelledStore.projects.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(directory, 'cancelled-projects')), []);
    await prepared.cleanup();
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('asynchronous media validation rejects missing blobs instead of exporting an empty library', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arc-media-validation-'));
  try {
    await fs.promises.writeFile(path.join(directory, 'media-assets.json'), JSON.stringify([{
      id: 'media_11111111-1111-4111-8111-111111111111',
      filename: 'missing.bin',
      contentType: 'application/octet-stream',
      size: 16,
      sha256: '0'.repeat(64)
    }]));
    await assert.rejects(new ProjectMediaStore(directory).listAsync(), /media library could not be read/);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('encrypted disk staged imports retain ciphertext after password errors and honor cancellation', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arc-encrypted-import-'));
  try {
    const { payload, sources } = streamedProjectFixture();
    const archivePath = path.join(directory, 'encrypted.arcproject');
    await pipeline(await createEncryptedArcProjectArchiveStream(payload, sources, 'correct horse battery staple'), fs.createWriteStream(archivePath, { mode: 0o600 }));
    assert.equal((await inspectArcProjectArchive(archivePath)).encrypted, true);
    await assert.rejects(prepareArcProjectImport(archivePath, { stagingDirectory: directory }), (error) => error.code === 'PROJECT_PASSWORD_REQUIRED');
    await assert.rejects(prepareArcProjectImport(archivePath, { password: 'wrong password value', stagingDirectory: directory }), (error) => error.code === 'PROJECT_PASSWORD_INVALID');
    assert.equal(fs.existsSync(archivePath), true);
    const prepared = await prepareArcProjectImport(archivePath, { password: 'correct horse battery staple', stagingDirectory: directory });
    assert.equal(prepared.bundle.format, 'arc-project');
    await prepared.cleanup();

    const cancelledArchivePath = path.join(directory, 'cancelled.arcproject');
    await pipeline(await createArcArchiveStream(payload, sources), fs.createWriteStream(cancelledArchivePath, { mode: 0o600 }));
    const controller = new AbortController();
    controller.abort(new Error('Project import cancelled.'));
    await assert.rejects(inspectArcProjectArchive(cancelledArchivePath, { signal: controller.signal }));
    await assert.rejects(prepareArcProjectImport(cancelledArchivePath, { stagingDirectory: directory, signal: controller.signal }));
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

test('graph archives store attachments as separate ZIP entries and restore them intact', async () => {
  const graph = {
    format: 'arc-graph', version: 1,
    graph: { id: 'graph_one', nodes: [{ id: 'node_one', data: { attachments: [{ filename: 'pixel.png', contentType: 'image/png', data: imageData }] } }], connections: [] },
    integrity: { algorithm: 'sha256', digest: 'fixture' }
  };
  const archive = await createArcArchive(graph);
  assert.equal(isArcArchive(archive), true);
  assert.equal(new TextDecoder().decode(archive).includes(imageData), false);
  const restored = await readArcArchive(archive, 'arc-graph');
  assert.equal(restored.graph.nodes[0].data.attachments[0].data, imageData);
});

test('encrypted project archives keep attachment bytes inside AES GCM ciphertext', async () => {
  const password = 'correct horse battery staple';
  const bundle = {
    format: 'arc-project', version: 1, project: { name: 'Archive fixture' },
    files: { 'graphs.json': { graphs: [{ nodes: [{ data: { attachments: [{ filename: 'pixel.png', contentType: 'image/png', data: imageData }] } }] }] } }
  };
  const plaintextArchive = await createArcArchive(bundle);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('arc-studio-encrypted-project-v1'));
  const encryptedBytes = Buffer.concat([cipher.update(plaintextArchive), cipher.final()]);
  const envelope = {
    format: 'arc-project-encrypted', version: 3, cipher: 'aes-256-gcm', kdf: 'scrypt', N: 131072, r: 8, p: 1,
    salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encryptedBytes.toString('base64')
  };
  const fileArchive = await createArcArchive(envelope);
  const parsedEnvelope = await readArcArchive(fileArchive, 'arc-project');
  const restored = await ProjectStore.prototype.decryptProjectBundle.call({}, parsedEnvelope, password);
  assert.equal(restored.files['graphs.json'].graphs[0].nodes[0].data.attachments[0].data, imageData);
  await assert.rejects(ProjectStore.prototype.decryptProjectBundle.call({}, { ...parsedEnvelope, version: 2 }, password), /not supported/);
});

test('encrypted project archives decode multi megabyte ciphertext', async () => {
  const data = Buffer.alloc(4 * 1024 * 1024, 0x5a).toString('base64');
  const archive = await createArcArchive({
    format: 'arc-project-encrypted', version: 3, cipher: 'aes-256-gcm', kdf: 'scrypt', N: 131072, r: 8, p: 1,
    salt: Buffer.alloc(16).toString('base64'), iv: Buffer.alloc(12).toString('base64'), tag: Buffer.alloc(16).toString('base64'), data
  });
  const envelope = await readArcArchive(archive, 'arc-project');
  assert.equal(envelope.data, data);
});

test('server encrypted project archives keep all project metadata inside authenticated ciphertext', async () => {
  const password = 'correct horse battery staple';
  const bundle = {
    format: 'arc-project', version: 1,
    project: { name: 'Archive fixture', createdWithVersion: '2026.1.1-nightly.11', exportedAt: '2026-11-22T00:00:00.000Z' },
    files: { 'graphs.json': { graphs: [{ nodes: [{ data: { secret: 'never expose this value' } }] }] } }
  };
  const archive = await ProjectStore.prototype.exportProjectArchive.call({ exportProject: () => bundle }, 'project_fixture', { password });
  const envelope = await readArcArchive(archive, 'arc-project');
  assert.equal(envelope.version, 3);
  assert.equal(Object.hasOwn(envelope, 'project'), false);
  assert.equal(JSON.stringify(envelope).includes('Archive fixture'), false);
  assert.equal(JSON.stringify(envelope).includes('2026.1.1-nightly.11'), false);
  assert.equal(JSON.stringify(envelope).includes('never expose this value'), false);
  const restored = await ProjectStore.prototype.decryptProjectBundle.call({}, envelope, password);
  assert.deepEqual(restored.project, bundle.project);
  assert.equal(restored.files['graphs.json'].graphs[0].nodes[0].data.secret, 'never expose this value');
  await assert.rejects(ProjectStore.prototype.decryptProjectBundle.call({}, { ...envelope, tag: Buffer.alloc(16).toString('base64') }, password), /incorrect or.*damaged/);
});

test('archive import rejects legacy JSON and detects modified entries', async () => {
  await assert.rejects(readArcArchive(Buffer.from('{"format":"arc-project"}'), 'arc-project'), /supported ARC archive/);
  const archive = await createArcArchive({ format: 'arc-graph', version: 1, graph: { nodes: [], connections: [] } });
  const damaged = archive.slice();
  damaged[45] ^= 0xff;
  await assert.rejects(readArcArchive(damaged, 'arc-graph'));
});

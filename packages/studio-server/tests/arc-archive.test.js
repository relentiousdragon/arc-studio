import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { createArcArchive, isArcArchive, readArcArchive } from '../src/storage/ArcArchive.js';
import { ProjectStore } from '../src/storage/ProjectStore.js';

const imageData = 'data:image/png;base64,iVBORw0KGgo=';
//
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

test('archive import rejects legacy JSON and detects modified entries', async () => {
  await assert.rejects(readArcArchive(Buffer.from('{"format":"arc-project"}'), 'arc-project'), /supported ARC archive/);
  const archive = await createArcArchive({ format: 'arc-graph', version: 1, graph: { nodes: [], connections: [] } });
  const damaged = archive.slice();
  damaged[45] ^= 0xff;
  await assert.rejects(readArcArchive(damaged, 'arc-graph'));
});

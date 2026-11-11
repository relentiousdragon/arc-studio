import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ActivityStore } from '../src/security/ActivityStore.js';
//
test('activity webhook delivery status persists and stale in progress records are closed on restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-activity-store-'));
  const filePath = path.join(directory, 'activity.json');
  try {
    const store = new ActivityStore(filePath);
    const entry = store.record({ id: 'owner', username: 'Owner' }, 'graph.updated', 'Updated a graph');
    assert.equal(store.updateWebhookStatus(entry.id, 'in_progress'), true);
    assert.equal(store.list()[0].webhookDelivery, 'in_progress');

    const restartedStore = new ActivityStore(filePath);
    assert.equal(restartedStore.list()[0].webhookDelivery, 'failed');
    assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8'))[0].webhookDelivery, 'failed');
    assert.equal(restartedStore.updateWebhookStatus(entry.id, 'sent'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('activity entries keep only valid HTTPS actor avatars', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-activity-avatar-'));
  try {
    const store = new ActivityStore(path.join(directory, 'activity.json'));
    const valid = store.record({ id: 'editor', username: 'Editor', avatar: 'https://example.com/avatar.png' }, 'account.signed_in', 'Signed in');
    const invalid = store.record({ id: 'viewer', username: 'Viewer', avatar: 'data:image/png;base64,abc' }, 'account.signed_in', 'Signed in');
    assert.equal(valid.actor.avatarUrl, 'https://example.com/avatar.png');
    assert.equal(Object.hasOwn(invalid.actor, 'avatarUrl'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('separate project activity files do not share entries and can import matching legacy records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-project-activity-'));
  try {
    const alpha = new ActivityStore(path.join(directory, 'alpha', 'activity.json'));
    const beta = new ActivityStore(path.join(directory, 'beta', 'activity.json'));
    alpha.importLegacyEntries([{ id: 'legacy_alpha', summary: 'Alpha history', details: { projectName: 'Alpha project' } }]);
    alpha.record({ id: 'owner', username: 'Owner' }, 'graph.updated', 'Alpha graph update');
    beta.record({ id: 'owner', username: 'Owner' }, 'graph.updated', 'Beta graph update');

    assert.deepEqual(alpha.list().map((entry) => entry.summary), ['Alpha graph update', 'Alpha history']);
    assert.deepEqual(beta.list().map((entry) => entry.summary), ['Beta graph update']);
    assert.equal(beta.importLegacyEntries([{ id: 'ignored', summary: 'Do not overwrite' }]), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

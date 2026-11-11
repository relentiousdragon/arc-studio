import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ActivityWebhookDispatcher, ActivityWebhookStore } from '../src/security/ActivityWebhook.js';
//
function temporarySettingsPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-activity-webhook-'));
  return { directory, filePath: path.join(directory, 'activity-webhook.json') };
}

test('environment webhook is enabled by default and its URL is not returned', () => {
  const { directory, filePath } = temporarySettingsPath();
  try {
    const secretUrl = 'https://discord.com/api/webhooks/12345678901234567/secret-webhook-token';
    const store = new ActivityWebhookStore(filePath, secretUrl);
    assert.deepEqual(store.settings(), { source: 'environment', configured: true, environmentConfigured: true, enabled: true });
    assert.equal(JSON.stringify(store.settings()).includes('secret-webhook-token'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('workspace webhook replacement is encrypted and returned only as status', () => {
  const { directory, filePath } = temporarySettingsPath();
  try {
    const secretUrl = 'https://discord.com/api/webhooks/12345678901234567/secret-workspace-token';
    const store = new ActivityWebhookStore(filePath, '');
    const status = store.update({ url: secretUrl });
    const saved = fs.readFileSync(filePath, 'utf8');
    assert.equal(status.source, 'workspace');
    assert.equal(status.enabled, true);
    assert.equal(saved.includes(secretUrl), false);
    assert.equal(JSON.stringify(status).includes('secret-workspace-token'), false);
    const reloaded = new ActivityWebhookStore(filePath, '');
    assert.equal(reloaded.settings().configured, true);
    assert.equal(reloaded.settings().enabled, true);
    assert.throws(() => reloaded.update({ url: 'https://discord.com.evil.example/api/webhooks/id/token' }), /valid Discord webhook URL/);
    assert.throws(() => reloaded.update({ url: 'http://discord.com/api/webhooks/id/token' }), /valid Discord webhook URL/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('activity delivery uses a concise embed and a timestamp without exposing webhook URL', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { status: 204, ok: true };
  };
  const secretUrl = 'https://discord.com/api/webhooks/12345678901234567/secret-delivery-token';
  const store = {
    isEnabled: () => true,
    getDeliveryUrl: () => secretUrl
  };
  const deliveryStatuses = [];
  const dispatcher = new ActivityWebhookDispatcher(store, (_id, status) => deliveryStatuses.push(status));
  dispatcher.enqueue({
    timestamp: '2026-10-21T10:00:00.000Z',
    actor: { username: 'ARC Studio' },
    action: 'graph.updated',
    summary: 'Updated - graph “Welcome”, saved, ready',
    details: { projectName: 'Community Bot', graphName: 'Welcome' }
  }, 'https://raw.githubusercontent.com/relentiousdragon/arc-studio/main/packages/studio-client/public/arc.png');
  for (let attempt = 0; attempt < 30 && !request; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(request);
  assert.equal(request.url, secretUrl);
  assert.equal(request.options.redirect, 'error');
  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.avatar_url, 'https://raw.githubusercontent.com/relentiousdragon/arc-studio/main/packages/studio-client/public/arc.png');
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].author.name, 'ARC Studio');
  assert.equal(payload.embeds[0].author.icon_url, undefined);
  assert.equal(payload.embeds[0].description, 'Updated - graph “Welcome”, saved, ready');
  assert.deepEqual(payload.embeds[0].fields, [{ name: 'Item', value: 'Welcome', inline: true }]);
  assert.equal(payload.embeds[0].footer.text, 'ARC Studio  •  Community Bot');
  assert.equal(payload.embeds[0].timestamp, '2026-10-21T10:00:00.000Z');
  assert.equal(payload.embeds[0].thumbnail, undefined);
  for (let attempt = 0; attempt < 30 && deliveryStatuses.at(-1) !== 'success'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(deliveryStatuses, ['in_progress', 'success']);
});

test('sign-in activity includes known client build details in the Discord embed', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  let request;
  globalThis.fetch = async (_url, options) => {
    request = options;
    return { status: 204, ok: true };
  };
  const dispatcher = new ActivityWebhookDispatcher({
    isEnabled: () => true,
    getDeliveryUrl: () => 'https://discord.com/api/webhooks/id/token'
  });
  dispatcher.enqueue({
    actor: { id: 'editor-1', username: 'Editor', avatarUrl: 'https://studio.example.com/api/activity-avatars/editor-1.png?initial=E' },
    action: 'account.signed_in',
    summary: 'Signed in to the workspace',
    details: { projectName: 'TEST PROJET', clientVersion: '2026.1.1-nightly.7', clientPlatform: 'macOS', clientArchitecture: 'arm64' }
  });
  for (let attempt = 0; attempt < 30 && !request; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(request);
  const embed = JSON.parse(request.body).embeds[0];
  assert.deepEqual(embed.author, { name: 'Editor', icon_url: 'https://studio.example.com/api/activity-avatars/editor-1.png?initial=E' });
  assert.equal(embed.color, 0x10b981);
  assert.deepEqual(embed.fields, [{ name: 'Client', value: '2026.1.1-nightly.7 · macOS · arm64', inline: true }]);
  assert.equal(embed.footer.text, 'ARC Studio  •  TEST PROJET');
});

test('activity embed uses a fixed color except for sign-in and sign-out', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body).embeds[0]);
    return { status: 204, ok: true };
  };
  const dispatcher = new ActivityWebhookDispatcher({
    isEnabled: () => true,
    getDeliveryUrl: () => 'https://discord.com/api/webhooks/id/token'
  });
  for (const action of ['graph.created', 'account.signed_out']) {
    dispatcher.enqueue({ actor: { id: 'user-1', username: 'Editor' }, action, summary: action, timestamp: new Date().toISOString() });
    for (let attempt = 0; attempt < 150 && requests.length < (action === 'graph.created' ? 1 : 2); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.equal(requests[0].color, 0x3b82f6);
  assert.equal(requests[1].color, 0xef4444);
  assert.equal(requests[0].author.icon_url, undefined);
  assert.equal(requests[1].author.icon_url, undefined);
});

test('terminal webhook delivery errors update status without logging a failure notification', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  globalThis.fetch = async () => ({ status: 400, ok: false });
  const statuses = [];
  const dispatcher = new ActivityWebhookDispatcher({ isEnabled: () => true, getDeliveryUrl: () => 'https://discord.com/api/webhooks/id/token' }, (_id, status) => statuses.push(status));
  dispatcher.enqueue({ id: 'activity-test', summary: 'Changed a graph', actor: { username: 'Owner' }, timestamp: new Date().toISOString() });
  for (let attempt = 0; attempt < 30 && statuses.at(-1) !== 'failed'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(statuses, ['in_progress', 'failed']);
});

test('activity delivery waits for Discord Retry-After before retrying', async (context) => {
  const previousFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = previousFetch; });
  const requestTimes = [];
  globalThis.fetch = async () => {
    requestTimes.push(Date.now());
    if (requestTimes.length === 1) {
      return {
        status: 429,
        ok: false,
        headers: { get: (name) => name === 'retry-after' ? '1' : null },
        json: async () => ({ retry_after: 1 })
      };
    }
    return { status: 204, ok: true };
  };
  const dispatcher = new ActivityWebhookDispatcher({ isEnabled: () => true, getDeliveryUrl: () => 'https://discord.com/api/webhooks/id/token' });
  dispatcher.enqueue({ summary: 'A graph changed', actor: { username: 'Owner' }, timestamp: new Date().toISOString() });
  for (let attempt = 0; attempt < 100 && requestTimes.length < 1; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requestTimes.length, 1);
  dispatcher.settingsChanged();
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(requestTimes.length, 1);
  for (let attempt = 0; attempt < 100 && requestTimes.length < 2; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requestTimes.length, 2);
  assert.ok(requestTimes[1] - requestTimes[0] >= 950);
});

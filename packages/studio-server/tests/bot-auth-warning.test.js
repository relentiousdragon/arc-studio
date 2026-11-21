import assert from 'node:assert/strict';
import test from 'node:test';
import { BotManager } from '../src/engine/BotManager.js';
//
function makeManager(token = 'configured-token') {
  const messages = [];
  const logs = [];
  const manager = Object.create(BotManager.prototype);
  Object.assign(manager, {
    status: 'DISCONNECTED',
    discordUnauthorizedCount: 0,
    discordAuthWarning: null,
    trackedRestClients: new WeakSet(),
    getBotToken: () => token,
    broadcastWS: (message) => messages.push(message),
    log: (level, message) => logs.push({ level, message })
  });
  return { manager, messages, logs };
}

function makeRest(token, outcomes) {
  return {
    token,
    async request(_method, _endpoint, options = {}) {
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      if (options.auth === false && outcome?.status === 401) throw outcome;
      return outcome;
    }
  };
}

async function requestUnauthorized(rest) {
  await assert.rejects(rest.request('GET', '/users/@me'), { status: 401 });
}

test('warns once after three consecutive authenticated Discord 401 responses', async () => {
  const { manager, messages, logs } = makeManager();
  const rest = manager.trackDiscordRESTClient(makeRest('configured-token', [
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 })
  ]));

  await requestUnauthorized(rest);
  await requestUnauthorized(rest);
  assert.equal(manager.discordAuthWarning, null);
  await requestUnauthorized(rest);

  assert.equal(manager.discordAuthWarning.message, 'Discord returned HTTP 401 Unauthorized on three consecutive authenticated API requests using this project’s bot token. Check the token configured for this project.');
  assert.equal(manager.discordUnauthorizedCount, 3);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].payload.discordAuthWarning, manager.discordAuthWarning);
  assert.equal(logs.filter((entry) => entry.level === 'WARN').length, 1);

  await requestUnauthorized(rest);
  assert.equal(messages.length, 1);
});

test('clears the warning only after an authenticated request succeeds', async () => {
  const { manager, messages } = makeManager();
  const rest = manager.trackDiscordRESTClient(makeRest('configured-token', [
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Forbidden'), { status: 403 }),
    new Error('Network unavailable'),
    { id: 'application' }
  ]));

  await requestUnauthorized(rest);
  await requestUnauthorized(rest);
  await requestUnauthorized(rest);
  await assert.rejects(rest.request('GET', '/guilds'), { status: 403 });
  assert.ok(manager.discordAuthWarning);
  await assert.rejects(rest.request('GET', '/guilds'));
  assert.ok(manager.discordAuthWarning);
  await rest.request('GET', '/users/@me');

  assert.equal(manager.discordAuthWarning, null);
  assert.equal(manager.discordUnauthorizedCount, 0);
  assert.equal(messages.at(-1).payload.discordAuthWarning, null);
});

test('ignores unauthenticated requests and REST clients for unconfigured tokens', async () => {
  const { manager } = makeManager();
  const unauthenticated = manager.trackDiscordRESTClient(makeRest(null, [
    Object.assign(new Error('Unauthorized'), { status: 401 })
  ]));
  await assert.rejects(unauthenticated.request('POST', '/interactions', { auth: false }), { status: 401 });

  const candidateToken = manager.trackDiscordRESTClient(makeRest('candidate-token', [
    Object.assign(new Error('Unauthorized'), { status: 401 })
  ]));
  await requestUnauthorized(candidateToken);

  assert.equal(manager.discordUnauthorizedCount, 0);
  assert.equal(manager.discordAuthWarning, null);
});

test('tracks unauthorized responses independently for each project manager', async () => {
  const first = makeManager('project-one-token');
  const second = makeManager('project-two-token');
  const firstRest = first.manager.trackDiscordRESTClient(makeRest('project-one-token', [
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    Object.assign(new Error('Unauthorized'), { status: 401 })
  ]));

  await requestUnauthorized(firstRest);
  await requestUnauthorized(firstRest);
  await requestUnauthorized(firstRest);

  assert.ok(first.manager.discordAuthWarning);
  assert.equal(second.manager.discordAuthWarning, null);
});

test('clears the counter and warning when the configured project token changes', () => {
  const messages = [];
  const manager = Object.create(BotManager.prototype);
  Object.assign(manager, {
    encryptedBotToken: null,
    botProfile: null,
    status: 'DISCONNECTED',
    discordUnauthorizedCount: 3,
    discordAuthWarning: { title: 'Unauthorized', message: 'Repeated 401 responses.' },
    broadcastWS: (message) => messages.push(message)
  });
  manager.setBotToken('first-token', false);
  manager.discordUnauthorizedCount = 3;
  manager.discordAuthWarning = { title: 'Unauthorized', message: 'Repeated 401 responses.' };

  manager.setBotToken('second-token', false);

  assert.equal(manager.getBotToken(), 'second-token');
  assert.equal(manager.discordUnauthorizedCount, 0);
  assert.equal(manager.discordAuthWarning, null);
  assert.equal(messages.at(-1).payload.discordAuthWarning, null);
});

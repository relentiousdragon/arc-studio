import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GatewayIntents,
  GatewayCapabilities,
  GatewayOpcodes,
  ButtonStyles,
  ComponentTypes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  RateLimiter,
  RESTClient,
  InteractionAlreadyAcknowledgedError,
  InteractionSecurity,
  Client,
  GatewayShard,
  CDN
} from '../src/index.js';
import crypto from 'node:crypto';

describe('Constants & Bitfields', () => {
  test('Gateway Intents bitfield calculation', () => {
    const combined = GatewayIntents.GUILDS | GatewayIntents.GUILD_MESSAGES | GatewayIntents.MESSAGE_CONTENT;
    assert.equal(typeof combined, 'number');
    assert.equal(Boolean(combined & GatewayIntents.GUILDS), true);
    assert.equal(Boolean(combined & GatewayIntents.GUILD_MESSAGES), true);
    assert.equal(Boolean(combined & GatewayIntents.MESSAGE_CONTENT), true);
    assert.equal(Boolean(combined & GatewayIntents.GUILD_VOICE_STATES), false);
  });

  test('Gateway Opcodes mapping', () => {
    assert.equal(GatewayOpcodes.DISPATCH, 0);
    assert.equal(GatewayOpcodes.IDENTIFY, 2);
    assert.equal(GatewayOpcodes.HELLO, 10);
    assert.equal(GatewayOpcodes.HEARTBEAT_ACK, 11);
  });

  test('Gateway channel obfuscation capability is opt in on IDENTIFY', () => {
    const OriginalWebSocket = globalThis.WebSocket;
    const sent = [];
    class MockWebSocket {
      static OPEN = 1;
      constructor() { this.readyState = MockWebSocket.OPEN; }
      send(message) { sent.push(JSON.parse(message)); }
      close() { this.readyState = 3; }
    }
    globalThis.WebSocket = MockWebSocket;
    try {
      const defaultShard = new GatewayShard({ token: 'default-capabilities' });
      defaultShard.ws = new MockWebSocket();
      defaultShard.sendIdentify();
      assert.equal(Object.hasOwn(sent[0].d, 'capabilities'), false);
      defaultShard.destroy();

      const optedInShard = new GatewayShard({ token: 'obfuscation-capability', capabilities: GatewayCapabilities.CHANNEL_OBFUSCATION });
      optedInShard.ws = new MockWebSocket();
      optedInShard.sendIdentify();
      assert.equal(sent[1].d.capabilities, 1 << 15);
      optedInShard.destroy();
    } finally {
      globalThis.WebSocket = OriginalWebSocket;
    }
  });

  test('CDN helper funcs', () => {
    const avatarUrl = CDN.avatar('123456789012345678', 'abcdef123456');
    assert.match(avatarUrl, /https:\/\/cdn\.discordapp\.com\/avatars\/123456789012345678\/abcdef123456\.png/);

    const defaultAvatarUrl = CDN.avatar('123456789012345678', null);
    assert.match(defaultAvatarUrl, /https:\/\/cdn\.discordapp\.com\/embed\/avatars\//);
  });
});

describe('EmbedBuilder', () => {
  test('produces compliant JSON payload', () => {
    const embed = new EmbedBuilder()
      .setTitle('Test Embed')
      .setDescription('Visual Node Execution')
      .setColor('#5865F2')
      .addField('Status', 'Active', true)
      .toJSON();

    assert.equal(embed.title, 'Test Embed');
    assert.equal(embed.description, 'Visual Node Execution');
    assert.equal(embed.color, 0x5865f2);
    assert.deepEqual(embed.fields, [{ name: 'Status', value: 'Active', inline: true }]);
  });
});

describe('Component Builders', () => {
  test('ActionRow and Button builder JSON output', () => {
    const btn = new ButtonBuilder()
      .setCustomId('btn_run')
      .setLabel('Execute Node')
      .setStyle(ButtonStyles.SUCCESS);

    const row = new ActionRowBuilder().addComponents(btn).toJSON();

    assert.equal(row.type, ComponentTypes.ACTION_ROW);
    assert.equal(row.components.length, 1);
    assert.equal(row.components[0].type, ComponentTypes.BUTTON);
    assert.equal(row.components[0].custom_id, 'btn_run');
    assert.equal(row.components[0].style, ButtonStyles.SUCCESS);
  });
});

describe('RateLimiter', () => {
  test('normalizes parameterized Discord route IDs into generalized bucket keys', () => {
    const limiter = new RateLimiter();
    const key1 = limiter.getRouteKey('/channels/123456789012345678/messages', 'POST');
    const key2 = limiter.getRouteKey('/channels/987654321098765432/messages', 'POST');
    assert.equal(key1, key2);
    assert.equal(key1, 'POST:/channels/:id/messages');
  });

  test('handles rate limit header responses', () => {
    const limiter = new RateLimiter();
    const key = 'GET:/users/@me';
    const mockHeaders = new Headers({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset-after': '2.5'
    });

    limiter.handleHeaders(key, mockHeaders, 200, {});
    const bucket = limiter.buckets.get(key);
    assert.ok(bucket);
    assert.equal(bucket.remaining, 0);
    assert.ok(bucket.resetAt > Date.now());
  });
});

describe('Client & RESTClient', () => {
  test('instantiates Client without errors', () => {
    const client = new Client();
    assert.ok(client.rest instanceof RESTClient);
    assert.equal(client.user, null);
    assert.equal(client.ws, null);
  });

  test('creates standalone and message based threads through Discord channel routes', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: `thread-${calls.length}`, parent_id: 'channel-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    try {
      const rest = new RESTClient({ token: 'test-token', apiBase: 'https://discord.test/api/v10' });
      await rest.createThread('channel-1', {
        name: 'Private topic',
        type: 'private',
        autoArchiveDuration: 4320,
        rateLimitPerUser: 30,
        invitable: false,
        reason: 'Support discussion'
      });
      await rest.createThreadFromMessage('channel-1', 'message-1', {
        name: 'Message discussion',
        autoArchiveDuration: 1440
      });
      assert.equal(calls[0].url, 'https://discord.test/api/v10/channels/channel-1/threads');
      assert.equal(calls[0].init.method, 'POST');
      assert.deepEqual(JSON.parse(calls[0].init.body), {
        name: 'Private topic',
        type: 12,
        auto_archive_duration: 4320,
        rate_limit_per_user: 30,
        invitable: false
      });
      assert.equal(calls[0].init.headers['X-Audit-Log-Reason'], 'Support%20discussion');
      assert.equal(calls[1].url, 'https://discord.test/api/v10/channels/channel-1/messages/message-1/threads');
      assert.deepEqual(JSON.parse(calls[1].init.body), {
        name: 'Message discussion',
        auto_archive_duration: 1440
      });
      assert.throws(() => rest.createThread('channel-1', { name: 'Bad type', type: 'forum' }), /public or private/);
      assert.throws(() => rest.createThread('channel-1', { name: 'Bad duration', autoArchiveDuration: 10 }), /auto archive duration/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('gets guild and channel member and role permissions', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ permissions: '12345678901234567890' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    try {
      const rest = new RESTClient({ token: 'test-token', apiBase: 'https://discord.test/api/v10' });
      const results = await Promise.all([
        rest.getGuildMemberPermissions('guild-1', 'user-1'),
        rest.getGuildRolePermissions('guild-1', 'role-1'),
        rest.getChannelMemberPermissions('channel-1', 'user-1', { implicit: false }),
        rest.getChannelRolePermissions('channel-1', 'role-1')
      ]);

      assert.deepEqual(results, Array.from({ length: 4 }, () => ({ permissions: '12345678901234567890' })));
      assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), [
        '/api/v10/guilds/guild-1/permissions/member/user-1',
        '/api/v10/guilds/guild-1/permissions/role/role-1',
        '/api/v10/channels/channel-1/permissions/member/user-1',
        '/api/v10/channels/channel-1/permissions/role/role-1'
      ]);
      assert.equal(new URL(calls[2].url).searchParams.get('implicit'), 'false');
      assert.equal(new URL(calls[3].url).searchParams.get('implicit'), 'true');
      assert.throws(() => rest.getGuildMemberPermissions('', 'user-1'), /IDs are required/);
      assert.throws(() => rest.getChannelRolePermissions('channel-1', ''), /IDs are required/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('reconnects without duplicate dispatches and removes shard listeners on destroy', async () => {
    const OriginalWebSocket = globalThis.WebSocket;
    const sockets = [];
    class MockWebSocket {
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) {
        this.url = url;
        this.readyState = 0;
        sockets.push(this);
      }

      send() {}

      close(code = 1000, reason = '') {
        this.readyState = MockWebSocket.CLOSED;
        this.onclose?.({ code, reason });
      }

      receive(payload) {
        this.onmessage?.({ data: JSON.stringify(payload) });
      }
    }

    globalThis.WebSocket = MockWebSocket;
    const client = new Client({ token: 'gateway-lifecycle-test' });
    let rawDispatches = 0;
    let messages = 0;
    client.on('gatewayDispatch', () => { rawDispatches += 1; });
    client.on('messageCreate', () => { messages += 1; });

    try {
      await client.login();
      const shard = client.ws;
      const firstSocket = sockets[0];
      shard.scheduleReconnect = () => {};
      firstSocket.close(1006, 'test reconnect');
      shard.connect();

      const activeSocket = sockets[1];
      const dispatch = { op: GatewayOpcodes.DISPATCH, s: 1, t: 'MESSAGE_CREATE', d: { id: 'message-1' } };
      firstSocket.receive(dispatch);
      activeSocket.receive(dispatch);
      assert.equal(rawDispatches, 1);
      assert.equal(messages, 1);

      client.destroy();
      assert.equal(shard.eventNames().length, 0);
      activeSocket.receive({ ...dispatch, s: 2, d: { id: 'message-2' } });
      assert.equal(rawDispatches, 1);
      assert.equal(messages, 1);
    } finally {
      client.destroy();
      globalThis.WebSocket = OriginalWebSocket;
    }
  });

  test('replacing a login disposes the previous Gateway shard', async () => {
    const OriginalWebSocket = globalThis.WebSocket;
    const sockets = [];
    class MockWebSocket {
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
      send() {}
      close(code = 1000, reason = '') { this.readyState = MockWebSocket.CLOSED; this.onclose?.({ code, reason }); }
      receive(payload) { this.onmessage?.({ data: JSON.stringify(payload) }); }
    }

    globalThis.WebSocket = MockWebSocket;
    const client = new Client({ token: 'gateway-relogin-test' });
    let messages = 0;
    client.on('messageCreate', () => { messages += 1; });

    try {
      await client.login();
      const oldShard = client.ws;
      const oldSocket = sockets[0];
      await client.login();
      const activeSocket = sockets[1];
      assert.notEqual(client.ws, oldShard);
      assert.equal(oldShard.eventNames().length, 0);

      const dispatch = { op: GatewayOpcodes.DISPATCH, s: 1, t: 'MESSAGE_CREATE', d: { id: 'message-1' } };
      oldSocket.receive(dispatch);
      activeSocket.receive(dispatch);
      assert.equal(messages, 1);
    } finally {
      client.destroy();
      globalThis.WebSocket = OriginalWebSocket;
    }
  });

  test('allows only one interaction response attempt, including concurrent calls', async () => {
    const originalFetch = globalThis.fetch;
    let releaseFetch;
    let calls = 0;
    const fetchGate = new Promise((resolve) => { releaseFetch = resolve; });
    globalThis.fetch = async () => {
      calls += 1;
      await fetchGate;
      return new Response(null, { status: 204 });
    };

    const rest = new RESTClient({ apiBase: 'https://discord.ack-test/api/v10' });
    try {
      const firstResponse = rest.createInteractionResponse('interaction-1', 'test-token', { type: 4, data: { content: 'first' } });
      assert.throws(
        () => rest.deferInteractionReply('interaction-1', 'test-token'),
        (error) => error instanceof InteractionAlreadyAcknowledgedError && error.code === 'INTERACTION_ALREADY_ACKNOWLEDGED'
      );
      releaseFetch();
      await firstResponse;
      assert.equal(calls, 1);
    } finally {
      releaseFetch();
      globalThis.fetch = originalFetch;
    }
  });

  test('does not retry an interaction acknowledgement after a network error', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('connection lost');
    };

    const rest = new RESTClient({ apiBase: 'https://discord.ack-network-test/api/v10' });
    try {
      await assert.rejects(rest.createInteractionResponse('interaction-2', 'test-token', { type: 4, data: { content: 'once' } }), /connection lost/);
      assert.throws(
        () => rest.createInteractionResponse('interaction-2', 'test-token', { type: 4, data: { content: 'retry' } }),
        InteractionAlreadyAcknowledgedError
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('returns a rate limit error without retrying an interaction acknowledgement', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ retry_after: 30 }), {
        status: 429,
        headers: { 'content-type': 'application/json' }
      });
    };

    const rest = new RESTClient({ apiBase: 'https://discord.ack-rate-limit-test/api/v10' });
    try {
      await assert.rejects(
        rest.createInteractionResponse('interaction-3', 'test-token', { type: 4, data: { content: 'once' } }),
        (error) => error.status === 429
      );
      assert.equal(calls, 1);
      assert.throws(
        () => rest.createInteractionResponse('interaction-3', 'test-token', { type: 4, data: { content: 'retry' } }),
        InteractionAlreadyAcknowledgedError
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('uses application emoji routes for app-owned emoji mgmt', async () => {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: '456', name: 'wave', items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    try {
      const rest = new RESTClient({ token: 'test-token', apiBase: 'https://discord.test/api/v10' });
      await rest.getApplicationEmojis('123');
      await rest.createApplicationEmoji('123', { name: 'wave', image: 'data:image/png;base64,AA==' });
      await rest.deleteApplicationEmoji('123', '456');
      assert.match(calls[0].url, /\/applications\/123\/emojis$/);
      assert.equal(calls[1].init.method, 'POST');
      assert.deepEqual(JSON.parse(calls[1].init.body), { name: 'wave', image: 'data:image/png;base64,AA==' });
      assert.match(calls[2].url, /\/applications\/123\/emojis\/456$/);
      assert.equal(calls[2].init.method, 'DELETE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('InteractionSecurity (Ed25519 Webhook Verification)', () => {
  test('validates authentic Discord interaction signature and rejects tampered ones', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
    const timestamp = Date.now().toString();
    const rawBody = JSON.stringify({ type: 1 });

    const signature = InteractionSecurity.signInteraction(privateKey, timestamp, rawBody);

    const valid = InteractionSecurity.verifyInteraction({
      publicKey: rawPub,
      signature,
      timestamp,
      rawBody
    });
    assert.equal(valid, true);

    const tamperedBody = InteractionSecurity.verifyInteraction({
      publicKey: rawPub,
      signature,
      timestamp,
      rawBody: JSON.stringify({ type: 2 })
    });
    assert.equal(tamperedBody, false);

    const tamperedSig = InteractionSecurity.verifyInteraction({
      publicKey: rawPub,
      signature: '0'.repeat(128),
      timestamp,
      rawBody
    });
    assert.equal(tamperedSig, false);
  });
});

describe('Client presence updates', () => {
  test('partial updates preserve the existing online status and activity fields', () => {
    const client = new Client();
    let sentPresence;
    client.ws = { updatePresence: (presence) => { sentPresence = presence; } };

    client.setPresence({ status: 'dnd', activities: [{ name: 'Working', type: 0 }] });
    client.setPresence({ activities: [{ name: 'Custom Status', type: 4, state: 'Hello', emoji: { name: 'sparkles', id: '123456789012345678' } }] });

    assert.equal(sentPresence.status, 'dnd');
    assert.deepEqual(sentPresence.activities, [{ name: 'Custom Status', type: 4, state: 'Hello', emoji: { name: 'sparkles', id: '123456789012345678' } }]);
    assert.equal(client.presence.status, 'dnd');
  });
});

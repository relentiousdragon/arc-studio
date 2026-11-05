import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { executeDiscordGuildNode, isDiscordGuildNodeType } from '../src/engine/nodes/runtime/discord_guild.js';
//
function createGuildHarness(type, data = {}, dependencies = {}) {
  const outputs = new Map();
  const logs = [];
  return {
    outputs,
    logs,
    execute: () => executeDiscordGuildNode({ type, data }, {
      resolveInput: (pinId, fallback) => data[pinId] ?? fallback,
      isInputConnected: (pinId) => dependencies.connectedInputs?.includes(pinId) || false,
      rest: dependencies.rest || {},
      client: dependencies.client,
      setOutput: (pinId, value) => outputs.set(pinId, value),
      log: (message) => logs.push(message)
    })
  };
}

test('guild runtime fetches users, servers, and members with normalized outputs', async () => {
  const calls = [];
  const user = createGuildHarness('action_fetch_user', { user_id: 'user-1' }, {
    rest: { getUser: async (...args) => {
      calls.push(['user', ...args]);
      return { id: 'user-1', username: 'Ada', bot: false, public_flags: 16 };
    } }
  });
  assert.equal(await user.execute(), true);
  assert.equal(user.outputs.get('username'), 'Ada');
  assert.equal(user.outputs.get('user_id_out'), 'user-1');
  assert.equal(user.outputs.get('public_flags'), 16);

  const guild = createGuildHarness('action_fetch_guild', { guild_id: 'guild-1' }, {
    rest: { getGuild: async (...args) => {
      calls.push(['guild', ...args]);
      return { id: 'guild-1', name: 'Arc', approximate_member_count: 42, features: ['COMMUNITY'] };
    } }
  });
  await guild.execute();
  assert.deepEqual(calls[1], ['guild', 'guild-1', { withCounts: true }]);
  assert.equal(guild.outputs.get('member_count'), 42);
  assert.deepEqual(guild.outputs.get('features'), ['COMMUNITY']);

  const member = createGuildHarness('action_fetch_member', { guild_id: 'guild-1', user_id: 'user-1' }, {
    rest: { getGuildMember: async (...args) => {
      calls.push(['member', ...args]);
      return { user: { id: 'user-1', username: 'Ada' }, roles: ['role-1'], deaf: true };
    } }
  });
  await member.execute();
  assert.deepEqual(calls[2], ['member', 'guild-1', 'user-1']);
  assert.equal(member.outputs.get('username'), 'Ada');
  assert.deepEqual(member.outputs.get('roles'), ['role-1']);
  assert.equal(member.outputs.get('deaf'), true);

  const channel = createGuildHarness('action_fetch_channel', { channel_id: 'channel-1' }, {
    rest: { getChannel: async () => ({
      id: 'channel-1', flags: 1 << 17, position: 4,
      permission_overwrites: [{ id: 'role-1', allow: '1024', deny: '0', type: 0 }]
    }) }
  });
  await channel.execute();
  assert.equal(channel.outputs.get('flags'), 1 << 17);
  assert.equal(channel.outputs.get('obfuscated'), true);
  assert.equal(channel.outputs.get('position'), 4);
  assert.equal(channel.outputs.get('overwrite_count'), 1);
  assert.deepEqual(channel.outputs.get('permission_overwrites'), [{ id: 'role-1', allow: '1024', deny: '0', type: 0 }]);

  const role = createGuildHarness('action_fetch_role', { guild_id: 'guild-1', role_id: 'role-1' }, {
    rest: { getGuildRole: async () => ({
      id: 'role-1', name: 'Moderators', color: 0xff0000, position: 2, permissions: '8',
      hoist: true, managed: false, mentionable: true, tags: { bot_id: 'app-1' }
    }) }
  });
  await role.execute();
  assert.equal(role.outputs.get('name'), 'Moderators');
  assert.equal(role.outputs.get('color_hex'), '#ff0000');
  assert.equal(role.outputs.get('position'), 2);
  assert.equal(role.outputs.get('permissions'), '8');
  assert.deepEqual(role.outputs.get('tags'), { bot_id: 'app-1' });
});

test('guild runtime fetches member and role permission bitfields', async () => {
  const calls = [];
  const cases = [
    ['action_get_guild_member_permissions', { guild_id: 'guild-1', user_id: 'user-1' }, 'getGuildMemberPermissions', ['guild-1', 'user-1']],
    ['action_get_guild_role_permissions', { guild_id: 'guild-1', role_id: 'role-1' }, 'getGuildRolePermissions', ['guild-1', 'role-1']],
    ['action_get_channel_member_permissions', { channel_id: 'channel-1', user_id: 'user-1', implicit: false }, 'getChannelMemberPermissions', ['channel-1', 'user-1', { implicit: false }]],
    ['action_get_channel_role_permissions', { channel_id: 'channel-1', role_id: 'role-1' }, 'getChannelRolePermissions', ['channel-1', 'role-1', { implicit: true }]]
  ];

  for (const [type, data, method, expectedArgs] of cases) {
    assert.equal(isDiscordGuildNodeType(type), true);
    const node = createGuildHarness(type, data, {
      rest: { [method]: async (...args) => {
        calls.push([method, ...args]);
        return { permissions: '12345678901234567890' };
      } }
    });
    assert.equal(await node.execute(), true);
    assert.equal(node.outputs.get('permissions'), '12345678901234567890');
    assert.equal(node.outputs.get('success'), true);
    assert.deepEqual(calls.at(-1), [method, ...expectedArgs]);
  }
});

test('guild runtime creates channels and roles and applies role changes', async () => {
  const calls = [];
  const channel = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: '  announcements  ',
    channel_type: 'announcement',
    parent_id: 'category-1',
    topic: 'News',
    permission_overwrites: [{ id: 'role-1', allow: '1024', deny: '0', type: 0 }],
    reason: 'setup'
  }, {
    rest: { createGuildChannel: async (...args) => {
      calls.push(['channel', ...args]);
      return { id: 'channel-1' };
    } }
  });
  await channel.execute();
  assert.deepEqual(calls[0], ['channel', 'guild-1', {
    name: 'announcements',
    type: 5,
    parent_id: 'category-1',
    permission_overwrites: [{ id: 'role-1', allow: '1024', deny: '0', type: 0 }],
    topic: 'News'
  }, 'setup']);
  assert.equal(channel.outputs.get('channel_id'), 'channel-1');

  const role = createGuildHarness('action_create_role', {
    guild_id: 'guild-1',
    name: 'Moderators',
    color: 0xffffff,
    permissions: '8',
    hoist: true,
    mentionable: false,
    reason: 'setup'
  }, {
    rest: { createGuildRole: async (...args) => {
      calls.push(['role', ...args]);
      return { id: 'role-1' };
    } }
  });
  await role.execute();
  assert.deepEqual(calls[1], ['role', 'guild-1', {
    name: 'Moderators',
    color: 0xffffff,
    permissions: '8',
    hoist: true,
    mentionable: false
  }, 'setup']);
  assert.equal(role.outputs.get('role_id'), 'role-1');

  const memberRole = createGuildHarness('action_member_role', {
    guild_id: 'guild-1',
    user_id: 'user-1',
    role_id: 'role-1',
    operation: 'remove',
    reason: 'cleanup'
  }, {
    rest: { removeGuildMemberRole: async (...args) => calls.push(['member-role', ...args]) }
  });
  await memberRole.execute();
  assert.deepEqual(calls[2], ['member-role', 'guild-1', 'user-1', 'role-1', 'cleanup']);

  const studioOverwrites = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'rules',
    channel_type: 0,
    category_id: 'category-1',
    position: 3,
    overwriteCount: 1,
    target_id_1: 'role-1',
    target_type_1: 0,
    allow_1: [],
    deny_1: []
  }, {
    rest: { createGuildChannel: async (...args) => {
      calls.push(['studio-overwrites', ...args]);
      return { id: 'channel-2' };
    } }
  });
  await studioOverwrites.execute();
  assert.deepEqual(calls[3], ['studio-overwrites', 'guild-1', {
    name: 'rules',
    type: 0,
    parent_id: 'category-1',
    permission_overwrites: [{ id: 'role-1', type: 0 }],
    position: 3
  }, '']);
});

test('guild runtime applies thread and voice operations and preserves connected input semantics', async () => {
  const calls = [];
  const editThread = createGuildHarness('action_edit_channel', {
    thread_id: 'thread-1',
    archived: false,
    auto_archive_duration: 4320
  }, {
    connectedInputs: ['thread_id'],
    rest: { modifyChannel: async (...args) => {
      calls.push(['edit-thread', ...args]);
      return { id: 'thread-1' };
    } }
  });
  await editThread.execute();
  assert.deepEqual(calls[0], ['edit-thread', 'thread-1', {
    archived: false,
    auto_archive_duration: 4320
  }, '']);
  assert.equal(editThread.outputs.get('channel_id_out'), 'thread-1');

  const voiceStatus = createGuildHarness('action_voice_channel_status', {
    channel_id: 'voice-1',
    status: '  '
  }, {
    rest: { setVoiceChannelStatus: async (...args) => calls.push(['voice-status', ...args]) }
  });
  await voiceStatus.execute();
  assert.deepEqual(calls[1], ['voice-status', 'voice-1', '  ', '']);

  const voiceState = createGuildHarness('action_voice_state', {
    guild_id: 'guild-1',
    channel_id: 'voice-1',
    self_mute: true,
    self_deaf: false
  }, {
    client: { setVoiceChannel: (...args) => calls.push(['voice-state', ...args]) }
  });
  await voiceState.execute();
  assert.deepEqual(calls[2], ['voice-state', 'guild-1', 'voice-1', { selfMute: true, selfDeaf: false }]);
});

test('guild runtime validates request inputs and safely handles moderation failures', async () => {
  const invalidRole = createGuildHarness('action_create_role', {
    guild_id: 'guild-1',
    name: 'Bad',
    permissions: '1; delete'
  }, { rest: { createGuildRole: async () => assert.fail('Invalid permissions must not reach REST.') } });
  await assert.rejects(invalidRole.execute(), /decimal permission bitfield/);

  const moderation = createGuildHarness('action_moderate_member', {
    guild_id: 'guild-1',
    user_id: 'invalid',
    operation: 'ban'
  }, { rest: { banGuildMember: async () => assert.fail('Invalid member ID must not reach REST.') } });
  assert.equal(await moderation.execute(), 'failure');
  assert.equal(moderation.outputs.get('success'), false);
  assert.match(moderation.outputs.get('error'), /valid member ID/);

  assert.equal(isDiscordGuildNodeType('action_edit_channel'), true);
  assert.equal(isDiscordGuildNodeType('action_send_message'), false);
  assert.equal(await executeDiscordGuildNode({ type: 'unknown', data: {} }, {
    resolveInput: (_pinId, fallback) => fallback,
    rest: {},
    setOutput: () => {},
    log: () => {}
  }), false);
});

test('GraphRunner routes moderation errors through the failure execution output', async () => {
  const calls = [];
  const graph = {
    id: 'moderation-failure-route',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'moderate', type: 'action_moderate_member', data: { guild_id: 'guild-1', user_id: 'invalid', operation: 'ban' } },
      { id: 'notify', type: 'action_send_message', data: { channel_id: 'channel-1', content: 'Moderation failed' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'moderate', targetPinId: 'exec' },
      { sourceNodeId: 'moderate', sourcePinId: 'failure_exec', targetNodeId: 'notify', targetPinId: 'exec' }
    ]
  };
  const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {}, {
    mock: true,
    rest: {
      createMessage: async (...args) => calls.push(args),
      banGuildMember: async () => assert.fail('Invalid member ID must not reach REST.')
    },
    log: () => {}
  });

  assert.equal(result.error, null);
  assert.deepEqual(calls, [['channel-1', { content: 'Moderation failed' }]]);
});

test('guild runtime creates channels with numeric Discord types and per-type fields', async () => {
  const calls = [];
  const forum = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'ideas board',
    channel_type: 15,
    topic: 'Post ideas',
    flags: 1 << 4,
    default_auto_archive_duration: 10080
  }, {
    rest: { createGuildChannel: async (...args) => {
      calls.push(['forum', ...args]);
      return { id: 'forum-1' };
    } }
  });
  await forum.execute();
  assert.deepEqual(calls[0], ['forum', 'guild-1', {
    name: 'ideas board',
    type: 15,
    topic: 'Post ideas',
    flags: 16,
    default_auto_archive_duration: 10080
  }, '']);
  assert.equal(forum.outputs.get('channel_id'), 'forum-1');
  assert.equal(forum.outputs.get('success'), true);

  const media = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'clip reel',
    channel_type: 'media',
    available_tags: [{ name: 'Clips' }]
  }, {
    rest: { createGuildChannel: async (...args) => {
      calls.push(['media', ...args]);
      return { id: 'media-1' };
    } }
  });
  await media.execute();
  assert.deepEqual(calls[1], ['media', 'guild-1', {
    name: 'clip reel',
    type: 16,
    available_tags: [{ name: 'Clips' }]
  }, '']);

  const voice = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'voice lounge',
    channel_type: 2,
    bitrate: 96000,
    user_limit: 15,
    nsfw: true,
    rate_limit_per_user: 5
  }, {
    rest: { createGuildChannel: async (...args) => {
      calls.push(['voice', ...args]);
      return { id: 'voice-1' };
    } }
  });
  await voice.execute();
  assert.deepEqual(calls[2], ['voice', 'guild-1', {
    name: 'voice lounge',
    type: 2,
    bitrate: 96000,
    user_limit: 15,
    nsfw: true,
    rate_limit_per_user: 5
  }, '']);

  const category = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'category folder',
    channel_type: 4,
    flags: 32
  }, {
    rest: { createGuildChannel: async (...args) => {
      calls.push(['category', ...args]);
      return { id: 'category-1' };
    } }
  });
  await category.execute();
  assert.deepEqual(calls[3], ['category', 'guild-1', {
    name: 'category folder',
    type: 4
  }, '']);

  const badType = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'not creatable',
    channel_type: 1
  }, {
    rest: { createGuildChannel: async () => { calls.push(['bad']); return { id: 'never' }; } }
  });
  await assert.rejects(badType.execute(), /valid Discord channel type/);

  const badFlags = createGuildHarness('action_create_channel', {
    guild_id: 'guild-1',
    name: 'bad flags',
    channel_type: 0,
    flags: -4
  }, {
    rest: { createGuildChannel: async () => ({ id: 'never' }) }
  });
  await assert.rejects(badFlags.execute(), /non negative bitfield/);

  const privateThread = createGuildHarness('action_create_thread', {
    channel_id: 'parent-1',
    name: 'Private help',
    thread_type: 12,
    invitable: false
  }, {
    rest: { createThread: async (...args) => {
      calls.push(['thread', ...args]);
      return { id: 'thread-1', parent_id: args[0] };
    } }
  });
  await privateThread.execute();
  assert.equal(privateThread.outputs.get('thread_id'), 'thread-1');
  assert.deepEqual(calls[4][2].type, 'private');
  assert.deepEqual(calls[4][2].invitable, false);
});

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

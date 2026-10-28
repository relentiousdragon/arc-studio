import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { BotManager } from '../src/engine/BotManager.js';
//
describe('thread graph actions', () => {
  it('creates a thread from a channel and sends the next message into that thread', async () => {
    const calls = [];
    const graph = {
      id: 'thread-flow',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        { id: 'create', type: 'action_create_thread', data: { name: 'Help thread', thread_type: 'public' } },
        { id: 'send', type: 'action_send_message', data: { content: 'Follow up' } }
      ],
      connections: [
        { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'create', targetPinId: 'exec' },
        { sourceNodeId: 'event', sourcePinId: 'channel_id', targetNodeId: 'create', targetPinId: 'channel_id' },
        { sourceNodeId: 'create', sourcePinId: 'exec', targetNodeId: 'send', targetPinId: 'exec' },
        { sourceNodeId: 'create', sourcePinId: 'thread_id', targetNodeId: 'send', targetPinId: 'thread_id' }
      ]
    };
    const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', { channel_id: 'parent-channel' }, {
      mock: true,
      rest: {
        createThread: async (channelId, options) => {
          calls.push({ type: 'createThread', channelId, options });
          return { id: 'created-thread', parent_id: channelId };
        },
        createMessage: async (channelId, payload) => {
          calls.push({ type: 'createMessage', channelId, payload });
          return { id: 'sent-message' };
        }
      }
    });

    assert.equal(result.error, null);
    assert.deepEqual(calls, [
      { type: 'createThread', channelId: 'parent-channel', options: {
        name: 'Help thread',
        type: 'public',
        autoArchiveDuration: 1440,
        rateLimitPerUser: 0,
        invitable: true,
        reason: ''
      } },
      { type: 'createMessage', channelId: 'created-thread', payload: { content: 'Follow up' } }
    ]);
  });

  it('creates a public thread when a message ID is connected, ignoring private-only options', async () => {
    const calls = [];
    const graph = {
      id: 'message-thread-flow',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        { id: 'create', type: 'action_create_thread', data: { name: 'Discussion', thread_type: 'private', invitable: false } }
      ],
      connections: [
        { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'create', targetPinId: 'exec' },
        { sourceNodeId: 'event', sourcePinId: 'channel_id', targetNodeId: 'create', targetPinId: 'channel_id' },
        { sourceNodeId: 'event', sourcePinId: 'message_id', targetNodeId: 'create', targetPinId: 'message_id' }
      ]
    };
    const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {
      channel_id: 'parent-channel',
      id: 'message-1'
    }, {
      rest: {
        createThread: async (...args) => {
          calls.push({ method: 'createThread', args });
          throw new Error('A message based thread must not use the standalone thread route.');
        },
        createThreadFromMessage: async (...args) => {
          calls.push({ method: 'createThreadFromMessage', args });
          return { id: 'message-thread', parent_id: 'parent-channel' };
        }
      }
    });

    assert.equal(result.error, null);
    assert.deepEqual(calls, [{
      method: 'createThreadFromMessage',
      args: ['parent-channel', 'message-1', {
        name: 'Discussion',
        autoArchiveDuration: 1440,
        rateLimitPerUser: 0,
        reason: ''
      }]
    }]);
  });

  it('does not fall back to standalone creation when the connected message ID is empty', async () => {
    let standaloneCreateCalled = false;
    const graph = {
      id: 'empty-message-thread-flow',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        { id: 'create', type: 'action_create_thread', data: { name: 'Discussion' } }
      ],
      connections: [
        { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'create', targetPinId: 'exec' },
        { sourceNodeId: 'event', sourcePinId: 'channel_id', targetNodeId: 'create', targetPinId: 'channel_id' },
        { sourceNodeId: 'event', sourcePinId: 'message_id', targetNodeId: 'create', targetPinId: 'message_id' }
      ]
    };
    const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', { channel_id: 'parent-channel' }, {
      rest: {
        createThread: async () => { standaloneCreateCalled = true; },
        createThreadFromMessage: async () => { throw new Error('Unexpected request.'); }
      }
    });

    assert.match(result.error, /needs a message ID/);
    assert.equal(standaloneCreateCalled, false);
  });

  it('edits a thread using only thread fields and preserves regular channel editing', async () => {
    const calls = [];
    const threadGraph = {
      id: 'edit-thread-flow',
      nodes: [{
        id: 'event',
        type: 'event_message_create'
      }, {
        id: 'edit',
        type: 'action_edit_channel',
        data: {
          thread_id: 'thread-1',
          name: 'Updated thread',
          topic: 'must not be sent',
          parent_id: 'must not be sent',
          permission_overwrites: [{ id: 'must-not-be-sent' }],
          rate_limit_per_user: 8,
          archived: true,
          locked: false,
          invitable: false,
          auto_archive_duration: 4320,
          nsfw: true,
          bitrate: 64000
        }
      }],
      connections: [{ sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'edit', targetPinId: 'exec' }]
    };
    const threadResult = await GraphRunner.execute(threadGraph, 'MESSAGE_CREATE', { channel_id: 'parent-channel' }, {
      rest: { modifyChannel: async (...args) => { calls.push(args); return { id: args[0] }; } }
    });
    assert.equal(threadResult.error, null);
    assert.deepEqual(calls[0], ['thread-1', {
      name: 'Updated thread',
      rate_limit_per_user: 8,
      archived: true,
      locked: false,
      invitable: false,
      auto_archive_duration: 4320
    }, '']);

    const channelGraph = {
      id: 'edit-channel-flow',
      nodes: [{
        id: 'event',
        type: 'event_message_create'
      }, {
        id: 'edit',
        type: 'action_edit_channel',
        data: { channel_id: 'channel-1', topic: 'Updated topic', nsfw: true }
      }],
      connections: [{ sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'edit', targetPinId: 'exec' }]
    };
    const channelResult = await GraphRunner.execute(channelGraph, 'MESSAGE_CREATE', { channel_id: 'parent-channel' }, {
      rest: { modifyChannel: async (...args) => { calls.push(args); return { id: args[0] }; } }
    });
    assert.equal(channelResult.error, null);
    assert.deepEqual(calls[1], ['channel-1', { topic: 'Updated topic', nsfw: true }, '']);
  });

  it('reports exact thread permissions for command deployment review', () => {
    const requirements = BotManager.prototype.getCommandPermissionRequirements.call({}, [
      {
        nodes: [
          { id: 'send', type: 'action_send_message', data: { thread_id: 'thread-id' } },
          { id: 'create', type: 'action_create_thread', data: { thread_type: 'private' } },
          { id: 'start', type: 'action_start_thread_from_message' }
        ],
        connections: []
      }
    ]);
    assert.deepEqual(new Set(requirements), new Set([
      'View Channels',
      'Send Messages',
      'Send Messages in Threads',
      'Create Private Threads',
      'Create Public Threads'
    ]));
  });
});

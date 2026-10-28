import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GraphRunner } from '../src/engine/GraphRunner.js';
//
describe('template inputs and streaming presence', () => {
  it('resolves an unrecognized template through a dynamic interaction reply socket', async () => {
    const replies = [];
    const graph = {
      id: 'template-reply',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        { id: 'reply', type: 'action_reply_interaction', data: { interaction_token: 'test-token', content: 'Hello {{response}}' } }
      ],
      connections: [
        { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'reply', targetPinId: 'exec' },
        { sourceNodeId: 'event', sourcePinId: 'content', targetNodeId: 'reply', targetPinId: 'slot_response' }
      ]
    };

    const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', { content: 'from the event' }, {
      rest: {
        createInteractionResponse: async (...args) => replies.push(args)
      }
    });

    assert.equal(result.error, null);
    assert.equal(replies[0][2].data.content, 'Hello from the event');
  });

  it('sends a stream URL with streaming bot presence', async () => {
    const presences = [];
    const graph = {
      id: 'stream-presence',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        { id: 'presence', type: 'action_set_presence', data: { activity_type: '{{kind}}', activity_text: 'Live now', stream_url: 'https://twitch.tv/example' } }
      ],
      connections: [
        { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'presence', targetPinId: 'exec' },
        { sourceNodeId: 'event', sourcePinId: 'content', targetNodeId: 'presence', targetPinId: 'slot_kind' }
      ]
    };

    const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', { content: '1' }, {
      client: { setPresence: (presence) => presences.push(presence) }
    });

    assert.equal(result.error, null);
    assert.deepEqual(presences[0].activities, [{ name: 'Live now', type: 1, url: 'https://twitch.tv/example' }]);
  });

  it('exposes the Discord self_stream voice state field as a boolean event socket', async () => {
    const steps = [];
    const graph = {
      id: 'voice-self-stream',
      nodes: [{ id: 'voice', type: 'event_voice_state_update' }],
      connections: []
    };

    const result = await GraphRunner.execute(graph, 'VOICE_STATE_UPDATE', { user_id: 'user-1', self_stream: true }, {
      debug: true,
      onDebugStep: (step) => steps.push(step)
    });

    assert.equal(result.error, null);
    assert.deepEqual(steps[0].outputs.find((output) => output.pinId === 'self_stream'), {
      pinId: 'self_stream',
      label: 'Self Streaming',
      value: true
    });
  });

  it('resolves nested object properties and array elements through dynamic template argument sockets', async () => {
    const replies = [];
    const graph = {
      id: 'template-nested-slots',
      nodes: [
        { id: 'event', type: 'event_message_create' },
        {
          id: 'user_data',
          type: 'data_parse_json',
          data: { json: JSON.stringify({ profile: { name: 'Ada Lovelace' } }) }
        },
        {
          id: 'items_data',
          type: 'data_array_create',
          data: { item_1: 'first', item_2: 'second', item_3: 'third' }
        },
        {
          id: 'reply',
          type: 'action_reply_interaction',
          data: {
            interaction_token: 'test-token',
            content: 'User: {{user.profile.name}} · Pick: {{items[1]}} · Mention: <@{{user_id}}>'
          }
        }
      ],
      connections: [
        { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'reply', targetPinId: 'exec' },
        { sourceNodeId: 'user_data', sourcePinId: 'value', targetNodeId: 'reply', targetPinId: 'slot_user' },
        { sourceNodeId: 'items_data', sourcePinId: 'array', targetNodeId: 'reply', targetPinId: 'slot_items' },
        { sourceNodeId: 'event', sourcePinId: 'author_id', targetNodeId: 'reply', targetPinId: 'slot_user_id' }
      ]
    };

    const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', { id: 'msg-1', author: { id: '987654321', username: 'ada' } }, {
      mock: true,
      rest: {
        createInteractionResponse: async (...args) => replies.push(args)
      }
    });

    assert.equal(result.error, null);
    assert.equal(replies[0][2].data.content, 'User: Ada Lovelace · Pick: second · Mention: <@987654321>');
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { MockGateway } from '../src/engine/MockGateway.js';
import { executeDiscordMessageNode } from '../src/engine/nodes/runtime/discord_messages.js';
//
test('reaction action nodes call the matching Discord reaction operation', async () => {
  const calls = [];
  const rest = Object.fromEntries([
    'addMessageReaction', 'removeOwnMessageReaction', 'removeUserMessageReaction',
    'removeAllMessageReactionsForEmoji', 'removeAllMessageReactions'
  ].map((name) => [name, async (...args) => calls.push([name, ...args])]));
  const run = async (type, data = {}) => {
    const outputs = new Map();
    await executeDiscordMessageNode({ type, data }, {
      resolveInput: (pin, fallback) => data[pin] ?? fallback,
      rest,
      setOutput: (pin, value) => outputs.set(pin, value),
      log: () => {}
    });
    assert.equal(outputs.get('success'), true);
  };
  await run('action_add_reaction', { channel_id: '12345678901234567', message_id: '22345678901234567', emoji: '🔥' });
  await run('action_remove_reaction', { channel_id: '12345678901234567', message_id: '22345678901234567', emoji: '🔥', target: 'own' });
  await run('action_remove_reaction', { channel_id: '12345678901234567', message_id: '22345678901234567', emoji: '🔥', user_id: '32345678901234567', target: 'user', reason: 'cleanup' });
  await run('action_remove_reaction', { channel_id: '12345678901234567', message_id: '22345678901234567', emoji: '🔥', target: 'emoji' });
  await run('action_remove_reaction', { channel_id: '12345678901234567', message_id: '22345678901234567', target: 'all' });
  assert.deepEqual(calls, [
    ['addMessageReaction', '12345678901234567', '22345678901234567', '🔥'],
    ['removeOwnMessageReaction', '12345678901234567', '22345678901234567', '🔥'],
    ['removeUserMessageReaction', '12345678901234567', '22345678901234567', '🔥', '32345678901234567', 'cleanup'],
    ['removeAllMessageReactionsForEmoji', '12345678901234567', '22345678901234567', '🔥'],
    ['removeAllMessageReactions', '12345678901234567', '22345678901234567']
  ]);
});

test('offline simulation records reaction actions without calling Discord', async () => {
  const outputs = [];
  const mockRest = new MockGateway().createMockREST(outputs);
  await mockRest.addMessageReaction('channel', 'message', '🔥');
  await mockRest.removeUserMessageReaction('channel', 'message', '🔥', 'user', 'cleanup');
  await mockRest.removeAllMessageReactions('channel', 'message');
  assert.deepEqual(outputs.map(({ type }) => type), [
    'ADD_MESSAGE_REACTION', 'REMOVE_USER_MESSAGE_REACTION', 'REMOVE_ALL_MESSAGE_REACTIONS'
  ]);
});

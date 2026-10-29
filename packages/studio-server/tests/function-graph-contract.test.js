import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateFunctionGraphEntry, getFunctionGraphArguments } from '../src/engine/FunctionGraphContract.js';
import { validateDiscordSemanticValue } from '../src/engine/DiscordValueValidation.js';

test('migrates legacy Function Input nodes into one entry while preserving data and execution wires', () => {
  const graph = {
    id: 'legacy-function',
    graphType: 'function',
    nodes: [
      { id: 'input-a', type: 'function_input', data: { paramId: 'a', name: 'A', valueType: 'number', defaultValue: 2 } },
      { id: 'input-b', type: 'function_input', data: { paramId: 'b', name: 'B', valueType: 'number', defaultValue: 3 } },
      { id: 'action', type: 'action_send_message' }
    ],
    connections: [
      { sourceNodeId: 'input-a', sourcePinId: 'value', targetNodeId: 'action', targetPinId: 'content' },
      { sourceNodeId: 'input-b', sourcePinId: 'value', targetNodeId: 'action', targetPinId: 'channel_id' },
      { sourceNodeId: 'input-b', sourcePinId: 'exec', targetNodeId: 'action', targetPinId: 'exec' }
    ]
  };

  const migrated = migrateFunctionGraphEntry(graph);
  assert.equal(migrated.nodes.filter((node) => node.type === 'function_input').length, 1);
  assert.deepEqual(getFunctionGraphArguments(migrated).map(({ paramId, name }) => ({ paramId, name })), [
    { paramId: 'a', name: 'A' },
    { paramId: 'b', name: 'B' }
  ]);
  assert.deepEqual(migrated.connections, [
    { sourceNodeId: 'input-a', sourcePinId: 'arg_a', targetNodeId: 'action', targetPinId: 'content' },
    { sourceNodeId: 'input-a', sourcePinId: 'arg_b', targetNodeId: 'action', targetPinId: 'channel_id' },
    { sourceNodeId: 'input-a', sourcePinId: 'exec', targetNodeId: 'action', targetPinId: 'exec' }
  ]);
});

test('validates Discord IDs and interaction token values while allowing mock simulator IDs', () => {
  assert.equal(validateDiscordSemanticValue('1', 'channel_id', 'Channel ID'), '1');
  assert.equal(validateDiscordSemanticValue('123456789012345678', 'channel_id', 'Channel ID'), '123456789012345678');
  assert.equal(validateDiscordSemanticValue('18446744073709551615', 'channel_id', 'Channel ID'), '18446744073709551615');
  assert.throws(() => validateDiscordSemanticValue('18446744073709551616', 'channel_id', 'Channel ID'), /valid positive Discord snowflake ID/);
  assert.throws(() => validateDiscordSemanticValue('channel-1', 'channel_id', 'Channel ID'), /valid positive Discord snowflake ID/);
  assert.throws(() => validateDiscordSemanticValue('token with spaces', 'interaction_token', 'Interaction token'), /valid Discord interaction token/);
  assert.equal(validateDiscordSemanticValue('channel-1', 'channel_id', 'Channel ID', { simulation: true }), 'channel-1');
});

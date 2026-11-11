import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeDefinitions } from '../../studio-server/src/engine/NodeSchemaDefinitions.js';
import { resolveInferredObjectProperties } from '../src/core/objectPropertySuggestions.js';
//
function infer(sourceNode, sourcePin, targetPin = 'value') {
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const definitions = new Map([[sourceNode.id, {
    outputs: sourceNode.outputs || NodeDefinitions[sourceNode.type]?.outputs || [{ id: sourcePin, type: 'object' }]
  }]]);
  const incoming = new Map([[targetPin, { sourceNodeId: sourceNode.id, sourcePinId: sourcePin }]]);
  return resolveInferredObjectProperties(targetPin, incoming, nodes, definitions);
}

const keys = (properties) => properties.map((property) => property.key);

test('does not infer properties without a connected object output', () => {
  assert.deepEqual(resolveInferredObjectProperties('object', new Map(), new Map(), new Map()), []);
  assert.deepEqual(infer({
    id: 'channel-event',
    type: 'event_channel_create'
  }, 'channel_id'), []);
});

test('offers Discord message, channel, and guild properties from connected object schemas', () => {
  assert.ok(keys(infer({ id: 'message-event', type: 'event_message_create' }, 'message')).includes('flags'));
  assert.ok(keys(infer({ id: 'user-command', type: 'event_user_command' }, 'target_user')).includes('username'));
  assert.ok(keys(infer({ id: 'channel-source', type: 'action_fetch_channel' }, 'channel')).includes('permission_overwrites'));
  const guildProperties = keys(infer({ id: 'guild-source', type: 'action_fetch_guild' }, 'guild'));
  assert.ok(guildProperties.includes('features'));
  assert.ok(guildProperties.includes('flags'));
});

test('infers declared slash command argument names from its options object', () => {
  const properties = infer({
    id: 'slash-event',
    type: 'event_slash_command',
    data: {
      options: [
        { name: 'target', description: 'User to check', type: 6 },
        { name: 'ban', type: 1, options: [{ name: 'reason', description: 'Why to ban', type: 3 }] },
        { name: 'moderation', type: 2, options: [{ name: 'timeout', type: 1, options: [{ name: 'duration', type: 4 }] }] }
      ]
    },
    outputs: [{ id: 'options', type: 'object' }]
  }, 'options');
  const target = properties.find((property) => property.key === 'target');
  const reason = properties.find((property) => property.key === 'reason');
  assert.equal(target.label, 'User');
  assert.equal(target.desc, 'User to check');
  assert.equal(reason.desc, 'Why to ban');
  assert.ok(keys(properties).includes('duration'));
  assert.ok(keys(properties).includes('$subcommand'));
  assert.ok(keys(properties).includes('$subcommand_group'));
});

test('uses the connected JSON parse source to suggest nested paths', () => {
  const properties = infer({
    id: 'json-source',
    type: 'data_parse_json',
    data: { json: '{"server":{"flags":["community"]},"members":[{"name":"Ada"}]}' },
    outputs: [{ id: 'value', type: 'object' }]
  }, 'value');
  assert.ok(keys(properties).includes('server.flags'));
  assert.ok(keys(properties).includes('members[0].name'));
});

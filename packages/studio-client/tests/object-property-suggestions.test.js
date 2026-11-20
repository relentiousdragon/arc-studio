import assert from 'node:assert/strict';
import test from 'node:test';
import { NodeDefinitions } from '../../studio-server/src/engine/NodeSchemaDefinitions.js';
import { getConnectedTemplateInputPaths, resolveInferredObjectProperties } from '../src/core/objectPropertySuggestions.js';
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

test('exposes connected object properties as template paths for dynamic arg sockets', () => {
  const sourceNode = { id: 'channel-source', type: 'action_fetch_channel' };
  const incoming = new Map([['arg_1', { sourceNodeId: sourceNode.id, sourcePinId: 'channel' }]]);
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const definitions = new Map([[sourceNode.id, { outputs: NodeDefinitions[sourceNode.type].outputs }]]);
  const paths = getConnectedTemplateInputPaths(
    [{ id: 'arg_1', label: 'arg1' }],
    incoming,
    nodes,
    definitions
  );
  assert.ok(paths.some((item) => item.path === 'arg1.name'));
  assert.ok(paths.some((item) => item.path === 'arg1.permission_overwrites'));
});

test('suggests slash command option fields beneath a connected arg socket', () => {
  const sourceNode = {
    id: 'slash-event',
    type: 'event_slash_command',
    data: { options: [{ name: 'target', type: 6 }, { name: 'reason', type: 3 }] }
  };
  const incoming = new Map([['arg_1', { sourceNodeId: sourceNode.id, sourcePinId: 'options' }]]);
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const definitions = new Map([[sourceNode.id, { outputs: NodeDefinitions[sourceNode.type].outputs }]]);
  const paths = getConnectedTemplateInputPaths([{ id: 'arg_1' }], incoming, nodes, definitions);
  assert.ok(paths.some((item) => item.path === 'arg1.target'));
  assert.ok(paths.some((item) => item.path === 'arg1.target.value'));
  assert.ok(paths.some((item) => item.path === 'arg1.target.name'));
  assert.ok(paths.some((item) => item.path === 'arg1.target.username'));
  assert.ok(paths.some((item) => item.path === 'arg1.target.id'));
  assert.ok(paths.some((item) => item.path === 'arg1.reason'));
  assert.ok(paths.some((item) => item.path === 'arg1.reason.value'));
  assert.ok(paths.some((item) => item.path === 'arg1.reason.name'));

  const autoNode = { id: 'auto-event', type: 'event_slash_autocomplete' };
  const autoIncoming = new Map([['arg_1', { sourceNodeId: autoNode.id, sourcePinId: 'options' }]]);
  const autoNodes = new Map([[sourceNode.id, sourceNode], [autoNode.id, autoNode]]);
  const autoDefinitions = new Map([[sourceNode.id, { outputs: NodeDefinitions[sourceNode.type].outputs }], [autoNode.id, { outputs: NodeDefinitions[autoNode.type].outputs }]]);
  const autoPaths = getConnectedTemplateInputPaths([{ id: 'arg_1' }], autoIncoming, autoNodes, autoDefinitions);
  assert.ok(autoPaths.some((item) => item.path === 'arg1.reason.value'));
});

test('infers properties from individual slash command option pins', () => {
  const sourceNode = {
    id: 'slash-event',
    type: 'event_slash_command',
    data: {
      options: [
        { name: 'target', type: 6 },
        { name: 'channel', type: 7 },
        { name: 'role', type: 8 },
        { name: 'attachment', type: 11 },
        { name: 'color', type: 3, choices: [{ name: 'Red', value: 'red' }, { name: 'Blue', value: 'blue' }] },
        { name: 'query', type: 3, autocomplete: true }
      ]
    }
  };
  const userProps = infer(sourceNode, 'option_target');
  assert.ok(keys(userProps).includes('value'));
  assert.ok(keys(userProps).includes('name'));
  assert.ok(keys(userProps).includes('username'));
  assert.ok(keys(userProps).includes('id'));
  assert.ok(keys(userProps).includes('avatar'));

  const channelProps = infer(sourceNode, 'option_channel');
  assert.ok(keys(channelProps).includes('value'));
  assert.ok(keys(channelProps).includes('name'));
  assert.ok(keys(channelProps).includes('type'));

  const roleProps = infer(sourceNode, 'option_role');
  assert.ok(keys(roleProps).includes('value'));
  assert.ok(keys(roleProps).includes('name'));
  assert.ok(keys(roleProps).includes('color'));

  const attachmentProps = infer(sourceNode, 'option_attachment');
  assert.ok(keys(attachmentProps).includes('value'));
  assert.ok(keys(attachmentProps).includes('name'));
  assert.ok(keys(attachmentProps).includes('filename'));
  assert.ok(keys(attachmentProps).includes('url'));

  const choiceProps = infer(sourceNode, 'option_color');
  assert.ok(keys(choiceProps).includes('value'));
  assert.ok(keys(choiceProps).includes('name'));
  assert.ok(!keys(choiceProps).includes('red'));
  assert.ok(!keys(choiceProps).includes('blue'));

  const autoProps = infer(sourceNode, 'option_query');
  assert.ok(keys(autoProps).includes('value'));
  assert.ok(keys(autoProps).includes('name'));
  assert.match(autoProps.find((p) => p.key === 'value')?.desc || '', /Autocomplete/);
});

test('infers properties from function input arguments', () => {
  const functionNode = {
    id: 'fn-input',
    type: 'function_input',
    data: {
      arguments: [
        { name: 'author_user', valueType: 'user_id' },
        { name: 'target_channel', valueType: 'channel_id' },
        { name: 'config', valueType: 'object', defaultValue: '{"theme":"dark","retries":3}' }
      ]
    }
  };
  const userProps = infer(functionNode, 'fn-input_argument_1');
  assert.ok(keys(userProps).includes('username'));
  assert.ok(keys(userProps).includes('id'));

  const channelProps = infer(functionNode, 'fn-input_argument_2');
  assert.ok(keys(channelProps).includes('name'));
  assert.ok(keys(channelProps).includes('type'));

  const configProps = infer(functionNode, 'fn-input_argument_3');
  assert.ok(keys(configProps).includes('theme'));
  assert.ok(keys(configProps).includes('retries'));
});

test('suggests keys from the initial value of a connected object variable', () => {
  const sourceNode = { id: 'variable-source', type: 'variable_get', data: { variableId: 'settings' } };
  const incoming = new Map([['arg_1', { sourceNodeId: sourceNode.id, sourcePinId: 'value' }]]);
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const definitions = new Map([[sourceNode.id, { outputs: [{ id: 'value', type: 'object' }] }]]);
  const paths = getConnectedTemplateInputPaths(
    [{ id: 'arg_1' }],
    incoming,
    nodes,
    definitions,
    [{ id: 'settings', initialValue: { channel: { name: 'general' }, enabled: true } }]
  );
  assert.ok(paths.some((item) => item.path === 'arg1.channel.name'));
  assert.ok(paths.some((item) => item.path === 'arg1.enabled'));
});

test('exposes connected object properties for unresolved template variable sockets', () => {
  const sourceNode = { id: 'message-source', type: 'event_message_create' };
  const incoming = new Map([['slot_target', { sourceNodeId: sourceNode.id, sourcePinId: 'message' }]]);
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const definitions = new Map([[sourceNode.id, { outputs: NodeDefinitions[sourceNode.type].outputs }]]);
  const paths = getConnectedTemplateInputPaths([], incoming, nodes, definitions);
  assert.ok(paths.some((item) => item.path === 'target.content'));
  assert.ok(paths.some((item) => item.path === 'target.author.username'));
});

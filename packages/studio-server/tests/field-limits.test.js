import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { fieldLimitWarning } from '../src/engine/FieldLimits.js';
//
const contentPin = { id: 'content', label: 'Message content', type: 'string' };
const channelPin = { id: 'channel_id', label: 'Channel ID', type: 'string', semanticType: 'channel_id' };
const numberPin = { id: 'duration_minutes', label: 'Timeout', type: 'number' };

test('warns when resolved text is over a Discord field limit', () => {
  const warning = fieldLimitWarning({ nodeType: 'action_send_message', pin: contentPin, value: 'x'.repeat(2100) });
  assert.match(warning, /2100 characters/);
  assert.match(warning, /2000 character limit/);
  assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin: contentPin, value: 'x'.repeat(2000) }), '');
  assert.equal(fieldLimitWarning({ nodeType: 'build_embed', pin: { id: 'title', type: 'string' }, value: 'x'.repeat(300) }).includes('256 character limit'), true);
});

test('warns when a resolved id or number does not match its field', () => {
  assert.match(fieldLimitWarning({ nodeType: 'action_send_message', pin: channelPin, value: 'general' }), /channel ID/);
  assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin: channelPin, value: '123456789012345678' }), '');
  assert.match(fieldLimitWarning({ nodeType: 'action_moderate_member', pin: numberPin, value: 'soon' }), /not a number/);
  assert.equal(fieldLimitWarning({ nodeType: 'action_moderate_member', pin: numberPin, value: '10' }), '');
  assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin: channelPin, value: '{{channel.id}}' }), '');
  assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin: channelPin, value: '' }), '');
});

test('does not warn on dynamic or flexibly typed sockets', () => {
  const argPin = { id: 'arg_3', label: 'arg3', type: 'arg' };
  const slotPin = { id: 'slot_name', label: 'name slot', type: 'any' };
  const numberSlotPin = { id: 'value_4', label: 'Value', type: 'number' };
  const argumentPin = { id: 'argument_2', label: 'Legal Argument 2', type: 'object' };
  for (const pin of [argPin, slotPin, numberSlotPin, argumentPin]) {
    assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin, value: 'not a channel id at all' }), '');
  }
  assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin: { id: 'item_7', label: 'Item 7', type: 'any' }, value: 'x'.repeat(3000) }), '');
  assert.equal(fieldLimitWarning({ nodeType: 'action_send_message', pin: { id: 'anything', label: 'F', type: 'variable' }, value: 'general' }), '');
});

test('graph runs log a warning when a resolved value breaks a field rule', async () => {
  const lines = [];
  const graph = {
    id: 'graph-field-warning',
    nodes: [
      { id: 'event', type: 'event_message_create', data: {} },
      { id: 'reply', type: 'action_reply_interaction', data: { content: 'x'.repeat(2100), interaction_id: '123456789012345678', interaction_token: 'token' } }
    ],
    connections: [{ id: 'wire', sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'reply', targetPinId: 'exec' }]
  };
  await GraphRunner.execute(graph, 'MESSAGE_CREATE', { id: 'message-1', content: 'hi', channel_id: '123456789012345678', author: { id: '7', username: 'ada' } }, {
    variablesState: new Map(),
    projectVariables: [],
    projectVariablesState: new Map(),
    rest: { createInteractionResponse: async () => ({}), editInteractionResponse: async () => ({}) },
    log: (message) => lines.push(String(message))
  });
  assert.ok(lines.some((line) => line.includes('[Warning]') && line.includes('character limit')), lines.join('\n'));
});

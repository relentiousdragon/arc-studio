import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { buildEventTemplateValues, eventTemplatePaths } from '../src/engine/EventTemplatePaths.js';
import { NodeDefinitions, getNodeRegistryPayload } from '../src/engine/NodeRegistry.js';
//
test('every event node advertises built in template paths', () => {
  const events = Object.values(NodeDefinitions).filter((definition) => definition.gatewayEvent);
  assert.ok(events.length >= 40, `expected the event catalog, found ${events.length}`);
  for (const definition of events) {
    assert.ok(Array.isArray(definition.templatePaths), `${definition.type} is missing template paths`);
    assert.ok(definition.templatePaths.length > 0, `${definition.type} has no template paths`);
    for (const item of definition.templatePaths) {
      assert.equal(typeof item.path, 'string');
      assert.match(item.path, /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z0-9_$]+)*$/);
      assert.ok(item.label);
    }
  }
  const registry = getNodeRegistryPayload();
  assert.ok(registry.definitions.event_slash_command.templatePaths.length > 0);
  assert.equal(registry.definitions.variable_create.templatePaths, undefined);
});

test('common event shortcuts are offered for messages and interactions', () => {
  const messagePaths = eventTemplatePaths('event_message_create').map((item) => item.path);
  for (const path of ['author.username', 'author.id', 'guild.name', 'channel.id', 'content', 'message.id']) assert.ok(messagePaths.includes(path), path);
  const interactionPaths = eventTemplatePaths('event_button_click').map((item) => item.path);
  for (const path of ['interaction.custom_id', 'user.username', 'guild.name', 'channel.id']) assert.ok(interactionPaths.includes(path), path);
  const modalPaths = eventTemplatePaths('event_modal_submit').map((item) => item.path);
  assert.ok(modalPaths.includes('interaction.fields'));
  const threadPaths = eventTemplatePaths('event_thread_create').map((item) => item.path);
  assert.ok(threadPaths.includes('thread.name'));
});

test('event template values resolve users, servers, channels, and interactions', () => {
  const values = buildEventTemplateValues('event_message_create', {
    id: 'message-1', content: 'hi', channel_id: '55', guild_id: '88',
    author: { id: '7', username: 'ada', global_name: 'Ada' }
  }, {
    guild: { id: '88', name: 'Arc Guild' },
    channel: { id: '55', name: 'general', type: 0 }
  });
  assert.equal(values.author.username, 'ada');
  assert.equal(values.author.display_name, 'Ada');
  assert.equal(values.author.mention, '<@7>');
  assert.equal(values.user.username, 'ada');
  assert.equal(values.guild.name, 'Arc Guild');
  assert.equal(values.channel.id, '55');
  assert.equal(values.channel.name, 'general');
  assert.equal(values.message.id, 'message-1');
  assert.equal(values.event.content, 'hi');

  const interaction = buildEventTemplateValues('event_slash_command', {
    id: 'interaction-1', token: 'token-1', application_id: 'app-1', type: 2, channel_id: '55',
    data: { name: 'admin', options: [{ name: 'amount', type: 4, value: 5 }] },
    member: { user: { id: '7', username: 'ada' }, nick: 'Ada' }
  });
  assert.equal(interaction.interaction.command_name, 'admin');
  assert.equal(interaction.interaction.options.amount, 5);
  assert.equal(interaction.user.username, 'ada');
  assert.equal(interaction.member.nick, 'Ada');

  const modal = buildEventTemplateValues('event_modal_submit', {
    id: 'interaction-2', data: { custom_id: 'arc_modal', components: [{ component: { custom_id: 'email' }, value: 'ada@example.com' }] }
  });
  assert.equal(modal.interaction.custom_id, 'arc_modal');
  assert.equal(modal.interaction.fields.email, 'ada@example.com');
});

test('graphs render event template roots from the event that fired', async () => {
  const created = [];
  const graph = {
    id: 'graph-event-paths',
    nodes: [
      { id: 'event', type: 'event_message_create', data: {} },
      { id: 'create', type: 'variable_create', data: { name: 'user_{{author.username}}_{{channel.id}}', scope: 'graph', valueType: 'number', value: 1, persist: true } }
    ],
    connections: [{ id: 'wire', sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'create', targetPinId: 'exec' }]
  };
  const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {
    id: 'message-1', content: 'hi', channel_id: '55', guild_id: '88',
    author: { id: '7', username: 'ada' }
  }, {
    variablesState: new Map(),
    projectVariables: [],
    projectVariablesState: new Map(),
    resolveGuildDirectory: (id) => id === '88' ? { id: '88', name: 'Arc Guild' } : null,
    resolveChannelDirectory: (id) => id === '55' ? { id: '55', name: 'general' } : null,
    onVariableCreated: (variable) => created.push(variable)
  });
  assert.equal(result.error, null);
  assert.deepEqual(created.map((variable) => variable.name), ['user_ada_55']);
});

test('graphs render server and channel names from the cached directory', async () => {
  const lines = [];
  const graph = {
    id: 'graph-event-directory',
    nodes: [
      { id: 'event', type: 'event_message_create', data: {} },
      { id: 'log', type: 'action_console_log', data: { message: '{{author.username}} in {{channel.name}} of {{guild.name}} ({{channel.id}})' } }
    ],
    connections: [{ id: 'wire', sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'log', targetPinId: 'exec' }]
  };
  const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {
    id: 'message-1', content: 'hi', channel_id: '55', guild_id: '88', author: { id: '7', username: 'ada' }
  }, {
    variablesState: new Map(),
    projectVariables: [],
    projectVariablesState: new Map(),
    resolveGuildDirectory: (id) => id === '88' ? { id: '88', name: 'Arc Guild' } : null,
    resolveChannelDirectory: (id) => id === '55' ? { id: '55', name: 'general' } : null,
    log: (message) => lines.push(String(message))
  });
  assert.equal(result.error, null);
  assert.ok(lines.includes('ada in general of Arc Guild (55)'), lines.join('\n'));
});

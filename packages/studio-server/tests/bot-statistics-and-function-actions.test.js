import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BotManager } from '../src/engine/BotManager.js';
import { GraphRunner } from '../src/engine/GraphRunner.js';
//
function makeStatisticsManager(directory) {
  const messages = [];
  const project = { id: 'project-test', disabledBuiltInVariables: [] };
  const manager = Object.create(BotManager.prototype);
  Object.assign(manager, {
    project,
    projectVariablesPath: path.join(directory, 'variables.json'),
    projectStore: {
      projects: [project],
      persist: () => {}
    },
    projectVariables: [
      { id: 'project_var_bot_statistics', name: 'BOT_STATISTICS', type: 'object', initialValue: {}, systemManaged: true }
    ],
    projectVariableStates: new Map([
      ['project_var_bot_statistics', {}],
      ['project_var_gateway_latency', 24]
    ]),
    mockProjectVariableStates: new Map(),
    disabledBuiltInProjectVariables: new Set(),
    commandStatistics: {
      getSettings: () => ({ enabled: true, uniqueUsers: true, returningUsers: true, retentionDays: 30 }),
      getSummary: () => ({ commands: [{ name: 'ping', totalUses: 25 }], totalUses: 25 }),
      getCommandDetails: () => [{ name: 'ping', totalUses: 25 }]
    },
    gatewayMetrics: { latencyMs: 24, averageLatencyMs: 26, jitterMs: 2, lastHeartbeatAt: Date.now() },
    broadcastWS: (message) => messages.push(message)
  });
  return { manager, messages };
}

test('BOT_STATISTICS stores command statistics snapshot and updates project state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-bot-statistics-test-'));
  try {
    const { manager, messages } = makeStatisticsManager(directory);

    const snapshot = manager.updateBotStatistics();

    assert.equal(typeof snapshot, 'object');
    assert.equal(snapshot.totalUses, 25);
    assert.equal(snapshot.gatewayLatencyMs, 24);

    assert.deepEqual(manager.projectVariables[0].initialValue, snapshot);
    assert.deepEqual(manager.projectVariableStates.get('project_var_bot_statistics'), snapshot);
    assert.equal(messages.length > 0, true);
    assert.deepEqual(messages.at(-1).payload.variables[0].initialValue, snapshot);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('BOT_STATISTICS deleted by user is marked disabled and not overwritten by system updates', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-bot-statistics-test-'));
  try {
    const { manager } = makeStatisticsManager(directory);

    manager.setProjectVariables([]);
    assert.equal(manager.disabledBuiltInProjectVariables.has('BOT_STATISTICS'), true);

    manager.setProjectVariables([
      { id: 'project_var_custom_123', name: 'BOT_STATISTICS', type: 'object', initialValue: { custom: true } }
    ]);

    manager.updateBotStatistics();

    assert.deepEqual(manager.projectVariables[0].initialValue, { custom: true });
    assert.equal(manager.projectVariables[0].systemManaged, undefined);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('restoreBuiltInProjectVariable restores deleted system variable or reports conflict', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-bot-statistics-test-'));
  try {
    const { manager } = makeStatisticsManager(directory);

    manager.setProjectVariables([]);
    assert.equal(manager.projectVariables.length, 0);
    assert.equal(manager.disabledBuiltInProjectVariables.has('BOT_STATISTICS'), true);

    const result = manager.restoreBuiltInProjectVariable('BOT_STATISTICS');
    assert.equal(result.success, true);
    assert.equal(result.variables.some((v) => v.name === 'BOT_STATISTICS'), true);
    assert.equal(manager.disabledBuiltInProjectVariables.has('BOT_STATISTICS'), false);
    assert.equal(manager.projectVariables.some((v) => v.name === 'BOT_STATISTICS'), true);

    manager.setProjectVariables([]);
    manager.setProjectVariables([
      { id: 'project_var_user_created', name: 'BOT_STATISTICS', type: 'object', initialValue: { custom: true } }
    ]);
    assert.throws(
      () => manager.restoreBuiltInProjectVariable('BOT_STATISTICS'),
      /A custom variable named BOT_STATISTICS already exists/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('one function input can drive Discord actions without a return node', async () => {
  const sentMessages = [];
  const mockRest = {
    createMessage: async (channelId, payload) => {
      sentMessages.push({ channelId, payload });
      return { id: `msg_${Date.now()}`, ...payload };
    }
  };

  const functionGraph = {
    id: 'func_send_alert',
    name: 'Send Alert Function',
    graphType: 'function',
    nodes: [
      {
        id: 'func_input',
        type: 'function_input',
        data: { arguments: [
          { paramId: 'channel_id', name: 'channel_id', valueType: 'channel_id', defaultValue: '' },
          { paramId: 'alert_text', name: 'alert_text', valueType: 'string', defaultValue: '' }
        ] }
      },
      {
        id: 'func_action_send',
        type: 'action_send_message',
        data: { content: 'Default alert' }
      },
    ],
    connections: [
      { sourceNodeId: 'func_input', sourcePinId: 'exec', targetNodeId: 'func_action_send', targetPinId: 'exec' },
      { sourceNodeId: 'func_input', sourcePinId: 'arg_channel_id', targetNodeId: 'func_action_send', targetPinId: 'channel_id' },
      { sourceNodeId: 'func_input', sourcePinId: 'arg_alert_text', targetNodeId: 'func_action_send', targetPinId: 'content' }
    ]
  };

  const mainGraph = {
    id: 'main_graph',
    nodes: [
      {
        id: 'event_trigger',
        type: 'event_message_create'
      },
      {
        id: 'call_alert_func',
        type: 'function_call',
        data: { graphId: 'func_send_alert' }
      }
    ],
    connections: [
      { sourceNodeId: 'event_trigger', sourcePinId: 'exec', targetNodeId: 'call_alert_func', targetPinId: 'exec' },
      { sourceNodeId: 'event_trigger', sourcePinId: 'channel_id', targetNodeId: 'call_alert_func', targetPinId: 'arg_channel_id' },
      { sourceNodeId: 'event_trigger', sourcePinId: 'content', targetNodeId: 'call_alert_func', targetPinId: 'arg_alert_text' }
    ]
  };

  const result = await GraphRunner.execute(mainGraph, 'MESSAGE_CREATE', {
    channel_id: '123456789012345678',
    content: 'Emergency system alert'
  }, {
    rest: mockRest,
    mock: true,
    resolveFunctionGraph: (id) => id === 'func_send_alert' ? functionGraph : null
  });

  assert.equal(result.error, null);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].channelId, '123456789012345678');
  assert.equal(sentMessages[0].payload.content, 'Emergency system alert');
});

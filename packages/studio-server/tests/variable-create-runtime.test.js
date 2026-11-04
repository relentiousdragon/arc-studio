import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
//
const readyNode = () => ({ id: 'ready', type: 'event_bot_ready', data: {} });
const createNode = (id, data) => ({ id, type: 'variable_create', data });
const execWire = (targetNodeId = 'create') => ({ id: `wire-exec-${targetNodeId}`, sourceNodeId: 'ready', sourcePinId: 'exec', targetNodeId, targetPinId: 'exec' });

function context(overrides = {}) {
  return {
    variablesState: new Map(),
    projectVariables: [],
    projectVariablesState: new Map(),
    ...overrides
  };
}

test('Create Variable makes a graph variable when the graph runs', async () => {
  const created = [];
  const state = new Map();
  const graph = {
    id: 'graph-create',
    nodes: [readyNode(), createNode('create', { name: 'greeting', scope: 'graph', valueType: 'string', value: 'hello', persist: true })],
    connections: [execWire()]
  };

  const result = await GraphRunner.execute(graph, 'READY', {}, context({ variablesState: state, onVariableCreated: (variable) => created.push(variable) }));

  assert.equal(result.error, null);
  assert.equal(created.length, 1);
  assert.equal(created[0].name, 'greeting');
  assert.equal(created[0].scope, 'graph');
  assert.equal(created[0].type, 'string');
  assert.equal(state.get('nodevar_create'), 'hello');
});

test('Create Variable leaves an existing variable and its value untouched', async () => {
  const created = [];
  const state = new Map([['nodevar_create', 'keep me']]);
  const graph = {
    id: 'graph-existing',
    variables: [{ id: 'nodevar_create', name: 'greeting', type: 'string', initialValue: 'keep me', persist: true }],
    nodes: [readyNode(), createNode('create', { name: 'greeting', scope: 'graph', valueType: 'string', value: 'replaced', persist: true })],
    connections: [execWire()]
  };

  const result = await GraphRunner.execute(graph, 'READY', {}, context({ variablesState: state, onVariableCreated: (variable) => created.push(variable) }));

  assert.equal(result.error, null);
  assert.equal(created.length, 0);
  assert.equal(state.get('nodevar_create'), 'keep me');
});

test('Create Variable renders template names and follows a connected name socket', async () => {
  const created = [];
  const graph = {
    id: 'graph-template',
    variables: [{ id: 'var_who', name: 'who', type: 'string', initialValue: 'ada', persist: true }],
    nodes: [
      readyNode(),
      createNode('create', { name: 'user_{{who}}', scope: 'graph', valueType: 'string', value: 'x', persist: true }),
      { id: 'name-source', type: 'value_text', data: { value: 'wired_name' } },
      createNode('create-wired', { name: 'ignored', scope: 'graph', valueType: 'string', value: '', persist: true })
    ],
    connections: [
      execWire('create'),
      execWire('create-wired'),
      { id: 'wire-name', sourceNodeId: 'name-source', sourcePinId: 'value', targetNodeId: 'create-wired', targetPinId: 'name' }
    ]
  };

  const result = await GraphRunner.execute(graph, 'READY', {}, context({ onVariableCreated: (variable) => created.push(variable) }));

  assert.equal(result.error, null);
  assert.deepEqual(created.map((variable) => variable.name).sort(), ['user_ada', 'wired_name']);
});

test('Create Variable can create a project variable at runtime', async () => {
  const created = [];
  const projectState = new Map();
  const graph = {
    id: 'graph-project',
    nodes: [readyNode(), createNode('create', { name: 'shared_total', scope: 'project', valueType: 'number', value: 3, persist: true })],
    connections: [execWire()]
  };

  const result = await GraphRunner.execute(graph, 'READY', {}, context({ projectVariablesState: projectState, onVariableCreated: (variable) => created.push(variable) }));

  assert.equal(result.error, null);
  assert.equal(created.length, 1);
  assert.equal(created[0].scope, 'project');
  assert.equal(created[0].type, 'number');
  assert.equal(projectState.get(created[0].id), 3);
});

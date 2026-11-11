import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGraphStatePatch } from '../src/engine/GraphStatePatch.js';
//
test('graph patches merge one client node edit with another client node edit', () => {
  const base = {
    id: 'graph',
    nodes: [
      { id: 'a', data: { first: 'old', second: 'old' } },
      { id: 'b', data: { text: 'old' } }
    ],
    connections: []
  };
  const current = {
    ...base,
    nodes: [
      base.nodes[0],
      { id: 'b', data: { text: 'changed remotely' } }
    ]
  };
  const editedNode = { id: 'a', data: { first: 'changed locally', second: 'old' } };
  const result = applyGraphStatePatch(current, {
    version: 1,
    fields: [],
    collections: [{
      key: 'nodes',
      changes: [{
        id: 'a',
        beforeExists: true,
        before: base.nodes[0],
        afterExists: true,
        after: editedNode
      }]
    }]
  });

  assert.deepEqual(result.nodes, [
    editedNode,
    { id: 'b', data: { text: 'changed remotely' } }
  ]);
});

test('a concurrent node edit survives another collaborator deleting that node', () => {
  const currentNode = { id: 'a', data: { text: 'edited remotely' } };
  const result = applyGraphStatePatch({
    id: 'graph',
    nodes: [currentNode],
    connections: []
  }, {
    version: 1,
    fields: [],
    collections: [{
      key: 'nodes',
      changes: [{
        id: 'a',
        beforeExists: true,
        before: { id: 'a', data: { text: 'original' } },
        afterExists: false
      }]
    }]
  });

  assert.deepEqual(result.nodes, [currentNode]);
});

test('graph patches reject prototype and identity field writes', () => {
  assert.throws(() => applyGraphStatePatch({ id: 'graph' }, {
    version: 1,
    fields: [{ key: '__proto__', beforeExists: false, afterExists: true, after: { polluted: true } }],
    collections: []
  }), /invalid field operation/);
  assert.throws(() => applyGraphStatePatch({ id: 'graph' }, {
    version: 1,
    fields: [{ key: 'id', beforeExists: true, before: 'graph', afterExists: true, after: 'other' }],
    collections: []
  }), /invalid field operation/);
});

test('graph patches preserve nested __proto__ data without changing object prototypes', () => {
  const base = JSON.parse('{"id":"graph","nodes":[{"id":"node","data":{"text":"before"}}],"connections":[]}');
  const current = JSON.parse('{"id":"graph","nodes":[{"id":"node","data":{"text":"before","remote":"kept"}}],"connections":[]}');
  const editedNode = JSON.parse('{"id":"node","data":{"text":"after","__proto__":{"marker":"value"}}}');
  const result = applyGraphStatePatch(current, {
    version: 1,
    fields: [],
    collections: [{
      key: 'nodes',
      changes: [{
        id: 'node',
        beforeExists: true,
        before: base.nodes[0],
        afterExists: true,
        after: editedNode
      }]
    }]
  });
  const data = result.nodes[0].data;

  assert.equal(Object.getPrototypeOf(data), Object.prototype);
  assert.equal(Object.hasOwn(data, '__proto__'), true);
  assert.deepEqual(data.__proto__, { marker: 'value' });
  assert.equal(data.remote, 'kept');
  assert.equal(({}).marker, undefined);
});

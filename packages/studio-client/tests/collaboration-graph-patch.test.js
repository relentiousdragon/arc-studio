import assert from 'node:assert/strict';
import test from 'node:test';
import { createCollaborationGraphPatch } from '../src/core/collaborationGraphPatch.js';
//
test('collaboration graph patches include only changed entities and graph fields', () => {
  const base = {
    id: 'graph',
    name: 'Main',
    nodes: [
      { id: 'node-a', x: 10, data: { text: 'before' } },
      { id: 'node-b', x: 20, data: { text: 'unchanged' } }
    ],
    connections: [{ id: 'wire-a', sourceNodeId: 'node-a' }]
  };
  const next = {
    ...base,
    name: 'Renamed',
    nodes: [
      { id: 'node-a', x: 10, data: { text: 'after' } },
      base.nodes[1]
    ]
  };

  assert.deepEqual(createCollaborationGraphPatch(base, next), {
    version: 1,
    fields: [{ key: 'name', beforeExists: true, before: 'Main', afterExists: true, after: 'Renamed' }],
    collections: [{
      key: 'nodes',
      changes: [{
        id: 'node-a',
        beforeExists: true,
        before: base.nodes[0],
        afterExists: true,
        after: next.nodes[0]
      }]
    }]
  });
});

test('collaboration graph patches fall back to a field for reordered entities', () => {
  const base = { id: 'graph', nodes: [{ id: 'a' }, { id: 'b' }] };
  const next = { id: 'graph', nodes: [{ id: 'b' }, { id: 'a' }] };

  assert.deepEqual(createCollaborationGraphPatch(base, next), {
    version: 1,
    fields: [{ key: 'nodes', beforeExists: true, before: base.nodes, afterExists: true, after: next.nodes }],
    collections: []
  });
});

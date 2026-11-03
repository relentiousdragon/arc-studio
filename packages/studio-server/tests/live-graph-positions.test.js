import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNodePositions, normalizeNodePositions, rebaseNodePositions } from '../src/engine/LiveGraphPositions.js';
//
test('normalizeNodePositions keeps valid unique positions and drops unsafe values', () => {
  const positions = normalizeNodePositions([
    { id: 'node_a', x: 12.4, y: -8.6 },
    { id: 'node_a', x: 400, y: 400 },
    { id: 'node_b', x: 'not-a-number', y: 4 },
    { id: 'node_c', x: 2, y: 3 },
    { id: '', x: 1, y: 1 },
    null,
    { id: 'node_d', x: 2_000_000, y: 3 }
  ]);

  assert.deepEqual(positions, [{ id: 'node_a', x: 12, y: -9 }, { id: 'node_c', x: 2, y: 3 }]);
  assert.deepEqual(normalizeNodePositions('nope'), []);
});

test('applyNodePositions moves matching nodes and preserves everything else', () => {
  const graph = { id: 'graph_1', nodes: [{ id: 'a', x: 0, y: 0, data: { content: 'x' } }, { id: 'b', x: 5, y: 5 }], connections: [{ id: 'c' }] };
  const next = applyNodePositions(graph, [{ id: 'a', x: 40, y: 60 }, { id: 'missing', x: 1, y: 1 }]);

  assert.notEqual(next, graph);
  assert.deepEqual(next.nodes[0], { id: 'a', x: 40, y: 60, data: { content: 'x' } });
  assert.equal(next.nodes[1], graph.nodes[1]);
  assert.equal(next.connections, graph.connections);
  assert.equal(applyNodePositions(graph, [{ id: 'a', x: 0, y: 0 }]), graph);
});

test('rebaseNodePositions keeps newer live moves over a stale whole graph save', () => {
  const incoming = { id: 'graph_1', nodes: [{ id: 'a', x: 0, y: 0, data: { content: 'local edit' } }, { id: 'b', x: 10, y: 10 }] };
  const live = { id: 'graph_1', nodes: [{ id: 'a', x: 300, y: 120 }, { id: 'b', x: 10, y: 10 }] };
  const rebased = rebaseNodePositions(incoming, live, { a: 7 }, 5);

  assert.equal(rebased.nodes[0].x, 300);
  assert.equal(rebased.nodes[0].y, 120);
  assert.equal(rebased.nodes[0].data.content, 'local edit');
  assert.equal(rebased.nodes[1], incoming.nodes[1]);
});

test('rebaseNodePositions leaves nodes alone when the save already saw the move', () => {
  const incoming = { id: 'graph_1', nodes: [{ id: 'a', x: 0, y: 0 }] };
  const live = { id: 'graph_1', nodes: [{ id: 'a', x: 300, y: 120 }] };

  assert.equal(rebaseNodePositions(incoming, live, { a: 7 }, 7), incoming);
  assert.equal(rebaseNodePositions(incoming, live, {}, 0), incoming);
  assert.equal(rebaseNodePositions(incoming, null, { a: 9 }, 0), incoming);
});

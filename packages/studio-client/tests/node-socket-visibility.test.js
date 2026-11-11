import assert from 'node:assert/strict';
import test from 'node:test';
import { getNodesNearInputSockets, getVisibleNodeSockets } from '../src/core/nodeSocketVisibility.js';

const makePins = (count) => [
  { id: 'exec', type: 'exec' },
  ...Array.from({ length: count }, (_value, index) => ({ id: `pin-${index + 1}`, type: 'string' }))
];
//
test('shows eleven data sockets and keeps execution sockets outside the limit', () => {
  const { entries, hiddenCount } = getVisibleNodeSockets(makePins(12), new Set());

  assert.deepEqual(entries.map(({ pin }) => pin.id), [
    'exec', 'pin-1', 'pin-2', 'pin-3', 'pin-4', 'pin-5', 'pin-6', 'pin-7', 'pin-8', 'pin-9', 'pin-10', 'pin-11'
  ]);
  assert.equal(hiddenCount, 1);
});

test('keeps socket order when showing a connected socket beyond the initial eleven', () => {
  const { entries, hiddenCount } = getVisibleNodeSockets(makePins(14), new Set(['pin-13']));

  assert.deepEqual(entries.map(({ pin }) => pin.id), [
    'exec', 'pin-1', 'pin-2', 'pin-3', 'pin-4', 'pin-5', 'pin-6',
    'pin-7', 'pin-8', 'pin-9', 'pin-10', 'pin-11', 'pin-12', 'pin-13'
  ]);
  assert.equal(hiddenCount, 1);
});

test('shows every socket when expanded or when the setting is disabled', () => {
  const pins = makePins(12);

  assert.equal(getVisibleNodeSockets(pins, new Set(), true).entries.length, pins.length);
  assert.equal(getVisibleNodeSockets(pins, new Set(), false, false).entries.length, pins.length);
});

test('auto reveals nearby input sockets while dragging from another node', () => {
  const nodes = [
    { nodeId: 'target-near', rect: { left: 100, right: 180, top: 100, bottom: 180 } },
    { nodeId: 'target-far', rect: { left: 250, right: 320, top: 100, bottom: 180 } },
    { nodeId: 'wire-source', rect: { left: 100, right: 180, top: 100, bottom: 180 } }
  ];

  assert.deepEqual(getNodesNearInputSockets({ x: 90, y: 120 }, nodes, 'wire-source'), ['target-near']);
  assert.deepEqual(getNodesNearInputSockets({ x: 120, y: 90 }, nodes, 'wire-source'), ['target-near']);
  assert.deepEqual(getNodesNearInputSockets({ x: 120, y: 190 }, nodes, 'wire-source'), ['target-near']);
});

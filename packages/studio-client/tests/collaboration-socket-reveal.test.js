import assert from 'node:assert/strict';
import test from 'node:test';
import { getRemoteSocketRevealByNode } from '../src/core/collaborationSocketReveal.js';
//
test('remote wire drags reveal the source and compatible target socket columns', () => {
  const reveal = getRemoteSocketRevealByNode([{
    action: {
      kind: 'wire-drag',
      nodeId: 'source',
      direction: 'output',
      snapTarget: { nodeId: 'target', pinId: 'input' }
    }
  }]);

  assert.deepEqual([...reveal], [
    ['source', { inputs: false, outputs: true }],
    ['target', { inputs: true, outputs: false }]
  ]);
});

test('socket reveals remain visible across collaborator selection and cursor idle updates', () => {
  const reveal = getRemoteSocketRevealByNode([{
    action: { kind: 'selection', socketReveals: [{ nodeId: 'node', column: 'inputs' }, { nodeId: 'node', column: 'outputs' }] }
  }]);

  assert.deepEqual(reveal.get('node'), { inputs: true, outputs: true });

  const idleReveal = getRemoteSocketRevealByNode([{
    action: { kind: 'idle', socketReveals: [{ nodeId: 'node', column: 'inputs' }] }
  }]);
  assert.deepEqual(idleReveal.get('node'), { inputs: true, outputs: false });

  const cleared = getRemoteSocketRevealByNode([{
    action: { kind: 'cursor', socketReveals: [] }
  }]);
  assert.equal(cleared.size, 0);
});

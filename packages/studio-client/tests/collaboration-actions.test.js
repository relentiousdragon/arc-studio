import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRemoteCollaborationActions } from '../src/core/collaborationActions.js';

test('remote action batches keep the newest action per collaborator', () => {
  const current = [{ userId: 'one', projectId: 'p', graphId: 'g', action: { kind: 'cursor', x: 1 } }];
  const first = { userId: 'two', projectId: 'p', graphId: 'g', action: { kind: 'cursor', x: 2 } };
  const latest = { userId: 'two', projectId: 'p', graphId: 'g', action: { kind: 'cursor', x: 3 } };
  const result = mergeRemoteCollaborationActions(current, [first, latest], 'p', 'g');

  assert.deepEqual(result, [current[0], latest]);
  assert.deepEqual(current, [{ userId: 'one', projectId: 'p', graphId: 'g', action: { kind: 'cursor', x: 1 } }]);
});

test('remote action batches ignore actions from another room', () => {
  const current = [{ userId: 'one', projectId: 'p', graphId: 'g' }];

  assert.equal(mergeRemoteCollaborationActions(current, [
    { userId: 'two', projectId: 'other', graphId: 'g' },
    { userId: 'three', projectId: 'p', graphId: 'other' }
  ], 'p', 'g'), current);
});

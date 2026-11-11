import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCollaborativeValue } from '../src/core/collaborationMerge.js';
//
test('a remote deletion does not erase a concurrent local node edit', () => {
  const base = [{ id: 'node', data: { text: 'original' } }];
  const local = [{ id: 'node', data: { text: 'local edit' } }];

  assert.deepEqual(mergeCollaborativeValue(base, local, []), local);
});

test('an unchanged local node accepts a remote deletion', () => {
  const base = [{ id: 'node', data: { text: 'original' } }];

  assert.deepEqual(mergeCollaborativeValue(base, base, []), []);
});

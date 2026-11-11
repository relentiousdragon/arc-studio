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

test('collaborative merges preserve nested __proto__ data without changing object prototypes', () => {
  const base = JSON.parse('{"data":{"text":"before"}}');
  const local = JSON.parse('{"data":{"text":"before","local":"kept"}}');
  const remote = JSON.parse('{"data":{"text":"after","__proto__":{"marker":"value"}}}');
  const result = mergeCollaborativeValue(base, local, remote);
  const data = result.data;

  assert.equal(Object.getPrototypeOf(data), Object.prototype);
  assert.equal(Object.hasOwn(data, '__proto__'), true);
  assert.deepEqual(data.__proto__, { marker: 'value' });
  assert.equal(data.local, 'kept');
  assert.equal(({}).marker, undefined);
});

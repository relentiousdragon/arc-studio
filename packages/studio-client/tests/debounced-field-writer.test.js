import assert from 'node:assert/strict';
import test from 'node:test';
import { createDebouncedFieldWriter } from '../src/core/debouncedFieldWriter.js';

test('debounced field writer commits only the latest scheduled value', async () => {
  const committed = [];
  const writer = createDebouncedFieldWriter((value) => committed.push(value), 10);

  writer.schedule('first');
  writer.schedule('latest');
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(committed, ['latest']);
});

test('debounced field writer flushes immediately and can cancel a pending value', async () => {
  const committed = [];
  const writer = createDebouncedFieldWriter((value) => committed.push(value), 10);

  writer.schedule('flush');
  assert.equal(writer.flush(), true);
  writer.schedule('cancel');
  assert.equal(writer.cancel(), true);
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(committed, ['flush']);
});

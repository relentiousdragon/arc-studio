import assert from 'node:assert/strict';
import test from 'node:test';
import { getRemoteCursorInterpolationDuration } from '../src/core/collaborationMotion.js';
//
test('remote cursor smoothing adapts to update gaps within a small latency bound', () => {
  assert.equal(getRemoteCursorInterpolationDuration(1000, 1032), 25.6);
  assert.equal(getRemoteCursorInterpolationDuration(1000, 1200), 110);
  assert.equal(getRemoteCursorInterpolationDuration(1000, 990), 20);
});

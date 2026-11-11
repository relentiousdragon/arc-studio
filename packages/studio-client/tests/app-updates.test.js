import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyArcUpdate, compareArcVersions, getArcVersionDistance } from '../src/core/appUpdates.js';
//
test('stable four-part ARC versions follow matching nightly builds', () => {
  for (const [stable, nightly] of [
    ['2026.1.1.1', '2026.1.1-nightly.999'],
    ['2026.1.2.1', '2026.1.2-nightly.999']
  ]) {
    assert.equal(compareArcVersions(stable, nightly), 1);
    assert.equal(compareArcVersions(nightly, stable), -1);
  }
});

test('ARC versions compare year, release, minor, and patch in order', () => {
  assert.equal(compareArcVersions('2026.1.2-nightly.1', '2026.1.1.1'), 1);
  assert.equal(compareArcVersions('2026.1.1.2', '2026.1.1.1'), 1);
  assert.equal(compareArcVersions('2026.1.1', '2026.1.1.0'), 0);
  assert.equal(compareArcVersions('2026.1.1.1', '2026.1.1.0'), 1);
  assert.equal(getArcVersionDistance('2026.1.1.2', '2026.1.1.1'), 1);
  assert.equal(classifyArcUpdate('2026.1.1.2', '2026.1.1.1'), 'maintenance');
});

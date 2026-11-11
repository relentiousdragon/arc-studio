import assert from 'node:assert/strict';
import test from 'node:test';
import { getArcReleaseChannel, getTauriVersion, parseArcVersion } from '../../../scripts/arc-version.mjs';
//
test('ARC stable versions use a SemVer encoding for Tauri', () => {
  assert.equal(getTauriVersion('2026.1.1.1'), '2026.1.1-stable.1');
  assert.equal(getTauriVersion('2026.1.1.0'), '2026.1.1-stable.0');
  assert.equal(getArcReleaseChannel('2026.1.1.1'), 'stable');
});

test('ARC Nightly versions keep their SemVer prerelease for Tauri', () => {
  assert.equal(getTauriVersion('2026.1.2-nightly.11'), '2026.1.2-nightly.11');
  assert.equal(getArcReleaseChannel('2026.1.2-nightly.11'), 'nightly');
});

test('ARC release version parsing rejects invalid stable patch formats', () => {
  assert.equal(parseArcVersion('2026.1.1.1-nightly.2'), null);
  assert.equal(parseArcVersion('2026.01.1.1'), null);
  assert.equal(parseArcVersion('2026.1.1-nightly.01'), null);
});

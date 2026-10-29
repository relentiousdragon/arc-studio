import assert from 'node:assert/strict';
import test from 'node:test';
import rootPackage from '../../../package.json' with { type: 'json' };
import { isArcStudioClientVersionAllowed } from '../src/versioning/arcProjectCompatibility.js';
//
test('the configured minimum client version is accepted and older clients are rejected', () => {
  const minimum = rootPackage.arcStudio.minimumClientVersion;
  const prereleaseBuild = /^(.*\.)(\d+)$/.exec(minimum);
  const olderVersion = prereleaseBuild && Number(prereleaseBuild[2]) > 0
    ? `${prereleaseBuild[1]}${Number(prereleaseBuild[2]) - 1}`
    : '2025.0.0';
  assert.equal(isArcStudioClientVersionAllowed(minimum, minimum), true);
  assert.equal(isArcStudioClientVersionAllowed(olderVersion, minimum), false);
  assert.equal(isArcStudioClientVersionAllowed(rootPackage.version, minimum), true);
});

test('stable clients are ordered after prereleases of the same release', () => {
  assert.equal(isArcStudioClientVersionAllowed('2026.1.1', '2026.1.1-nightly.8'), true);
  assert.equal(isArcStudioClientVersionAllowed('2026.1.0', '2026.1.1-nightly.8'), false);
});

test('missing and invalid client versions are rejected', () => {
  assert.equal(isArcStudioClientVersionAllowed(undefined, '2026.1.1-nightly.8'), false);
  assert.equal(isArcStudioClientVersionAllowed('not-a-version', '2026.1.1-nightly.8'), false);
});

import studioPackage from '../../package.json' with { type: 'json' };
//
export const currentArcStudioVersion = studioPackage.version;

function parseArcVersion(value) {
  const match = String(value || '').replace(/^v/i, '').match(/^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const prerelease = match[2]?.split('.') || null;
  if (prerelease?.some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))) return null;
  const core = match[1].split('.').map(Number);
  if (core.length === 3) core.push(0);
  return { core, prerelease };
}

export function compareArcStudioVersions(candidate, current) {
  const next = parseArcVersion(candidate);
  const installed = parseArcVersion(current);
  if (!next || !installed) return null;
  for (let index = 0; index < 4; index += 1) {
    if (next.core[index] !== installed.core[index]) return next.core[index] > installed.core[index] ? 1 : -1;
  }
  if (!next.prerelease && installed.prerelease) return 1;
  if (next.prerelease && !installed.prerelease) return -1;
  if (!next.prerelease && !installed.prerelease) return 0;
  for (let index = 0; index < Math.max(next.prerelease.length, installed.prerelease.length); index += 1) {
    if (next.prerelease[index] === undefined) return -1;
    if (installed.prerelease[index] === undefined) return 1;
    const nextPart = next.prerelease[index];
    const installedPart = installed.prerelease[index];
    const nextNumber = /^\d+$/.test(nextPart) ? Number(nextPart) : null;
    const installedNumber = /^\d+$/.test(installedPart) ? Number(installedPart) : null;
    if (nextNumber !== null && installedNumber !== null && nextNumber !== installedNumber) return nextNumber > installedNumber ? 1 : -1;
    if (nextNumber !== null && installedNumber === null) return -1;
    if (nextNumber === null && installedNumber !== null) return 1;
    const order = nextPart.localeCompare(installedPart);
    if (order) return order > 0 ? 1 : -1;
  }
  return 0;
}

export function isArcStudioClientVersionAllowed(candidate, minimum) {
  const order = compareArcStudioVersions(candidate, minimum);
  return order !== null && order >= 0;
}

export function projectVersionAge(createdWithVersion, currentVersion = currentArcStudioVersion) {
  const created = parseArcVersion(createdWithVersion);
  const current = parseArcVersion(currentVersion);
  if (!created || !current) return { veryOld: true, unknown: true };
  if (compareArcStudioVersions(createdWithVersion, currentVersion) >= 0) return { veryOld: false, unknown: false };
  if (created.core[0] !== current.core[0] || created.core[1] !== current.core[1] || created.core[2] !== current.core[2]) {
    if (created.core[0] !== current.core[0] || created.core[1] !== current.core[1]) return { veryOld: true, unknown: false };
    return { veryOld: current.core[2] - created.core[2] >= 10, unknown: false };
  }
  if (!created.prerelease) return { veryOld: false, unknown: false };
  if (!current.prerelease) return { veryOld: false, unknown: false };
  const sameLabel = created.prerelease.slice(0, -1).join('.') === current.prerelease.slice(0, -1).join('.');
  const createdSequence = Number(created.prerelease.at(-1));
  const currentSequence = Number(current.prerelease.at(-1));
  return {
    veryOld: sameLabel && Number.isFinite(createdSequence) && Number.isFinite(currentSequence) && currentSequence - createdSequence >= 10,
    unknown: false
  };
}

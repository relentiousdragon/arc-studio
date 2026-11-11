const numericIdentifier = /^(0|[1-9]\d*)$/;
const identifier = /^[0-9A-Za-z-]+$/;
//
export function parseArcVersion(value) {
  const version = String(value || '').trim().replace(/^v/i, '');
  if (!version) return null;

  const plusIndex = version.indexOf('+');
  const withoutBuild = plusIndex === -1 ? version : version.slice(0, plusIndex);
  const build = plusIndex === -1 ? null : version.slice(plusIndex + 1);
  if (plusIndex !== -1 && (build.includes('+') || !build.split('.').every((part) => identifier.test(part)))) return null;

  const hyphenIndex = withoutBuild.indexOf('-');
  const coreText = hyphenIndex === -1 ? withoutBuild : withoutBuild.slice(0, hyphenIndex);
  const prerelease = hyphenIndex === -1 ? null : withoutBuild.slice(hyphenIndex + 1);
  const core = coreText.split('.');
  if (![3, 4].includes(core.length) || !core.every((part) => numericIdentifier.test(part))) return null;
  if (core.length === 4 && prerelease) return null;
  if (prerelease && !prerelease.split('.').every((part) => identifier.test(part)
    && (!/^\d+$/.test(part) || part.length === 1 || !part.startsWith('0')))) return null;

  return { version, core, prerelease, build };
}

export function getArcReleaseChannel(value) {
  const parsed = parseArcVersion(value);
  return parsed?.prerelease ? 'nightly' : parsed ? 'stable' : null;
}

export function getTauriVersion(value) {
  const parsed = parseArcVersion(value);
  if (!parsed) throw new Error(`Invalid ARC Studio version: ${value || '(empty)'}`);
  const build = parsed.build ? `+${parsed.build}` : '';
  if (parsed.prerelease) return `${parsed.core.join('.')}-${parsed.prerelease}${build}`;
  const [year, release, minor, patch = '0'] = parsed.core;
  return `${year}.${release}.${minor}-stable.${patch}${build}`;
}

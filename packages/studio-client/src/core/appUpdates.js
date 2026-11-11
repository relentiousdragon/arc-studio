function parseArcVersion(value) {
  const match = String(value || '').replace(/^v/i, '').match(/^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const pre = match[2] ? match[2].split('.') : null;
  if (pre?.some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))) return null;
  const core = match[1].split('.').map(Number);
  if (core.length === 3) core.push(0);
  return { core, pre };
}

function comparePrerelease(next, installed) {
  if (!next && installed) return 1;
  if (next && !installed) return -1;
  if (!next && !installed) return 0;
  const length = Math.max(next.length, installed.length);
  for (let index = 0; index < length; index += 1) {
    if (next[index] === undefined) return -1;
    if (installed[index] === undefined) return 1;
    const nextNumber = /^\d+$/.test(next[index]) ? Number(next[index]) : null;
    const currentNumber = /^\d+$/.test(installed[index]) ? Number(installed[index]) : null;
    if (nextNumber !== null && currentNumber !== null && nextNumber !== currentNumber) return nextNumber > currentNumber ? 1 : -1;
    if (nextNumber !== null && currentNumber === null) return -1;
    if (nextNumber === null && currentNumber !== null) return 1;
    if (next[index] !== installed[index]) return next[index] > installed[index] ? 1 : -1;
  }
  return 0;
}

export function compareArcVersions(candidate, current) {
  const next = parseArcVersion(candidate);
  const installed = parseArcVersion(current);
  if (!next || !installed) return null;
  for (let index = 0; index < 4; index += 1) {
    if (next.core[index] !== installed.core[index]) return next.core[index] > installed.core[index] ? 1 : -1;
  }
  return comparePrerelease(next.pre, installed.pre);
}

export function getArcVersionDistance(candidate, current) {
  const next = parseArcVersion(candidate);
  const installed = parseArcVersion(current);
  if (!next || !installed) return null;
  if (next.core[0] !== installed.core[0]) return Math.abs(next.core[0] - installed.core[0]) * 1_000_000;
  if (next.core[1] !== installed.core[1]) return Math.abs(next.core[1] - installed.core[1]) * 10_000;
  if (next.core[2] !== installed.core[2]) return Math.abs(next.core[2] - installed.core[2]) * 100;
  if (next.core[3] !== installed.core[3]) return Math.abs(next.core[3] - installed.core[3]);
  if (!next.pre && !installed.pre) return 0;
  if (!next.pre || !installed.pre) return 1;
  const trailingNumber = (parts) => /^\d+$/.test(parts.at(-1) || '') ? Number(parts.at(-1)) : null;
  const nextNumber = trailingNumber(next.pre);
  const installedNumber = trailingNumber(installed.pre);
  const nextStem = nextNumber === null ? next.pre : next.pre.slice(0, -1);
  const installedStem = installedNumber === null ? installed.pre : installed.pre.slice(0, -1);
  if (nextNumber !== null && installedNumber !== null && nextStem.join('.') === installedStem.join('.')) return Math.abs(nextNumber - installedNumber);
  return next.pre.join('.') === installed.pre.join('.') ? 0 : 1;
}

export function classifyArcUpdate(candidate, current) {
  const next = parseArcVersion(candidate);
  const installed = parseArcVersion(current);
  if (!next || !installed) return 'maintenance';
  if (next.core[0] !== installed.core[0] || next.core[1] !== installed.core[1]) return 'major';
  if (next.core[2] !== installed.core[2]) return 'feature';
  return 'maintenance';
}

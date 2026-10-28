import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { compareArcStudioVersions } from '../versioning/arcProjectCompatibility.js';
//
export const MIN_CLIENT_BUILD_MEMORY_BYTES = 1500 * 1_000_000;

export function getClientStartupAction({ clientCurrent, availableMemoryBytes, forceServerOnly = false }) {
  if (forceServerOnly) return 'server-only';
  if (clientCurrent) return 'serve';
  return 'build';
}

function readOptionalText(filename, readFileSync) {
  try {
    return readFileSync(filename, 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function unescapeMountPath(value) {
  return value.replace(/\\([0-7]{3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function getCgroupMemoryFiles(readFileSync) {
  const membership = readOptionalText('/proc/self/cgroup', readFileSync);
  const mountInfo = readOptionalText('/proc/self/mountinfo', readFileSync);
  const files = [];
  if (membership && mountInfo) {
    const groups = membership.split('\n').map((line) => {
      const [hierarchy, controllers, groupPath] = line.split(':');
      if (!groupPath) return null;
      if (hierarchy === '0' && !controllers) return { type: 'cgroup2', groupPath };
      if (controllers?.split(',').includes('memory')) return { type: 'cgroup', groupPath };
      return null;
    }).filter(Boolean);
    for (const line of mountInfo.split('\n')) {
      const fields = line.split(' ');
      const separator = fields.indexOf('-');
      if (separator < 0) continue;
      const type = fields[separator + 1];
      const group = groups.find((candidate) => candidate.type === type
        && (type === 'cgroup2' || fields[separator + 3]?.split(',').includes('memory')));
      if (!group) continue;
      const mountRoot = path.posix.normalize(unescapeMountPath(fields[3]));
      const groupPath = path.posix.normalize(group.groupPath);
      const relativePath = path.posix.relative(mountRoot, groupPath);
      if (relativePath === '..' || relativePath.startsWith(`..${path.posix.sep}`) || path.posix.isAbsolute(relativePath)) continue;
      const mountPoint = path.posix.normalize(unescapeMountPath(fields[4]));
      const directory = path.posix.join(mountPoint, relativePath);
      files.push(type === 'cgroup2'
        ? [path.posix.join(directory, 'memory.max'), path.posix.join(directory, 'memory.current')]
        : [path.posix.join(directory, 'memory.limit_in_bytes'), path.posix.join(directory, 'memory.usage_in_bytes')]);
    }
  }
  files.push(
    ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.current'],
    ['/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.usage_in_bytes']
  );
  return [...new Map(files.map((pair) => [pair.join('\0'), pair])).values()];
}

function readCgroupAvailableMemory([limitFile, usageFile], readFileSync) {
  const limitText = readOptionalText(limitFile, readFileSync);
  if (limitText === null) return { found: false };
  if (limitText === 'max') return { found: true, unlimited: true };
  const limit = Number(limitText);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    if (Number.isFinite(limit) && limit >= 2 ** 60) return { found: true, unlimited: true };
    return { found: true, unknown: true };
  }
  const usageText = readOptionalText(usageFile, readFileSync);
  const usage = Number(usageText);
  if (usageText === null || !Number.isSafeInteger(usage) || usage < 0) return { found: true, unknown: true };
  return { found: true, available: Math.max(0, limit - usage) };
}

export function getAvailableMemoryBytes({ freeMemory = os.freemem(), readFileSync = fs.readFileSync } = {}) {
  try {
    for (const files of getCgroupMemoryFiles(readFileSync)) {
      const cgroup = readCgroupAvailableMemory(files, readFileSync);
      if (!cgroup.found) continue;
      if (cgroup.unknown) return null;
      if (!cgroup.unlimited) return Math.min(freeMemory, cgroup.available);
    }
  } catch (error) {
    if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
    return freeMemory;
  }
  return freeMemory;
}

export function inspectClientBuild({ clientIndex, logoPaths, markerFile, minimumVersion, existsSync = fs.existsSync, readFileSync = fs.readFileSync }) {
  if (!existsSync(clientIndex) || logoPaths.some((filename) => !existsSync(filename))) {
    return { available: false, version: null, current: false };
  }
  const html = readFileSync(clientIndex, 'utf8');
  const bundleReferences = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((match) => match[1]);
  if (!bundleReferences.length || bundleReferences.some((reference) => {
    const relativePath = reference.replace(/^\/+/, '').split(/[?#]/)[0];
    return !existsSync(path.resolve(path.dirname(clientIndex), relativePath));
  })) {
    return { available: false, version: null, current: false };
  }
  let version = '';
  try {
    version = readFileSync(markerFile, 'utf8').trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const order = compareArcStudioVersions(version, minimumVersion);
  return { available: true, version: version || null, current: order !== null && order >= 0 };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailableMemoryBytes, getClientStartupAction, inspectClientBuild, MIN_CLIENT_BUILD_MEMORY_BYTES } from '../src/engine/clientStartup.js';

const memoryFiles = new Map([
  ['/sys/fs/cgroup/memory.max', String(3 * 1024 ** 3)],
  ['/sys/fs/cgroup/memory.current', String(2 * 1024 ** 3)]
]);

test('available build memory respects the cgroup limit', () => {
  const available = getAvailableMemoryBytes({
    freeMemory: 4 * 1024 ** 3,
    readFileSync: (filename) => {
      if (!memoryFiles.has(filename)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return memoryFiles.get(filename);
    }
  });
  assert.equal(available, 1024 ** 3);
  assert.equal(available < MIN_CLIENT_BUILD_MEMORY_BYTES, true);
});

test('available build memory falls back to operating system free memory without cgroup files', () => {
  const available = getAvailableMemoryBytes({
    freeMemory: 3 * 1024 ** 3,
    readFileSync: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }
  });
  assert.equal(available, 3 * 1024 ** 3);
});

test('available memory uses the current process cgroup mount path', () => {
  const files = new Map([
    ['/proc/self/cgroup', '0::/tenant/container-1\n'],
    ['/proc/self/mountinfo', '29 23 0:26 /tenant /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n'],
    ['/sys/fs/cgroup/container-1/memory.max', String(5 * 1024 ** 3)],
    ['/sys/fs/cgroup/container-1/memory.current', String(4 * 1024 ** 3)]
  ]);
  const available = getAvailableMemoryBytes({
    freeMemory: 3 * 1024 ** 3,
    readFileSync: (filename) => {
      if (!files.has(filename)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(filename);
    }
  });
  assert.equal(available, 1024 ** 3);
});

test('available memory supports a mounted cgroup v1 memory controller', () => {
  const files = new Map([
    ['/proc/self/cgroup', '5:cpu,memory:/docker/container-1\n'],
    ['/proc/self/mountinfo', '31 23 0:27 /docker /sys/fs/cgroup/memory rw,relatime - cgroup cgroup rw,memory\n'],
    ['/sys/fs/cgroup/memory/container-1/memory.limit_in_bytes', String(5 * 1024 ** 3)],
    ['/sys/fs/cgroup/memory/container-1/memory.usage_in_bytes', String(4 * 1024 ** 3)]
  ]);
  const available = getAvailableMemoryBytes({
    freeMemory: 3 * 1024 ** 3,
    readFileSync: (filename) => {
      if (!files.has(filename)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(filename);
    }
  });
  assert.equal(available, 1024 ** 3);
});

test('permission denied while inspecting container limits falls back to Node host memory', () => {
  for (const code of ['EACCES', 'EPERM']) {
    assert.equal(getAvailableMemoryBytes({
      freeMemory: 4 * 1024 ** 3,
      readFileSync: () => { throw Object.assign(new Error('permission denied'), { code }); }
    }), 4 * 1024 ** 3);
  }
});

test('client startup serves current assets and still attempts builds below the memory floor', () => {
  assert.equal(getClientStartupAction({ clientCurrent: true, availableMemoryBytes: 0 }), 'serve');
  assert.equal(MIN_CLIENT_BUILD_MEMORY_BYTES, 1_500_000_000);
  assert.equal(getClientStartupAction({ clientCurrent: false, availableMemoryBytes: MIN_CLIENT_BUILD_MEMORY_BYTES }), 'build');
  assert.equal(getClientStartupAction({ clientCurrent: false, availableMemoryBytes: MIN_CLIENT_BUILD_MEMORY_BYTES - 1 }), 'build');
  assert.equal(getClientStartupAction({ clientCurrent: false, availableMemoryBytes: null }), 'build');
  assert.equal(getClientStartupAction({ clientCurrent: true, forceServerOnly: true }), 'server-only');
});

test('a client build is current only when the index, logos, and compatible version marker exist', () => {
  const files = new Map([
    ['/client/index.html', '<script src="/assets/index-a.js"></script><link href="/assets/index-a.css">'],
    ['/client/assets/index-a.js', ''],
    ['/client/assets/index-a.css', ''],
    ['/client/arc.png', ''],
    ['/client/nightly-icon.png', ''],
    ['/client/.arc-studio-version', '2026.1.1-nightly.8']
  ]);
  const options = {
    clientIndex: '/client/index.html',
    logoPaths: ['/client/arc.png', '/client/nightly-icon.png'],
    markerFile: '/client/.arc-studio-version',
    minimumVersion: '2026.1.1-nightly.8',
    existsSync: (filename) => files.has(filename),
    readFileSync: (filename) => {
      if (!files.has(filename)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(filename);
    }
  };

  assert.deepEqual(inspectClientBuild(options), { available: true, version: '2026.1.1-nightly.8', current: true });
  files.set(options.markerFile, '2026.1.1-nightly.7');
  assert.deepEqual(inspectClientBuild(options), { available: true, version: '2026.1.1-nightly.7', current: false });
  files.delete('/client/assets/index-a.js');
  assert.deepEqual(inspectClientBuild(options), { available: false, version: null, current: false });
  files.set('/client/assets/index-a.js', '');
  files.delete(options.markerFile);
  assert.deepEqual(inspectClientBuild(options), { available: true, version: null, current: false });
});

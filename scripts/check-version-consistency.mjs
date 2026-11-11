import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTauriVersion } from './arc-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const expected = String(readJson('package.json').version || '').trim();
if (!expected) throw new Error('Root package.json is missing its version.');
const expectedTauriVersion = getTauriVersion(expected);

const actual = new Map([
  ['packages/studio-client/package.json', readJson('packages/studio-client/package.json').version],
  ['packages/studio-server/package.json', readJson('packages/studio-server/package.json').version],
  ['packages/studio-desktop/package.json', readJson('packages/studio-desktop/package.json').version],
]);
actual.set('packages/studio-desktop/src-tauri/tauri.conf.json', readJson('packages/studio-desktop/src-tauri/tauri.conf.json').version);
const cargoManifest = fs.readFileSync(path.join(root, 'packages/studio-desktop/src-tauri/Cargo.toml'), 'utf8');
const cargoPackage = cargoManifest.match(/^\[package\]\r?\n([\s\S]*?)(?=^\[)/m)?.[1];
actual.set('packages/studio-desktop/src-tauri/Cargo.toml', cargoPackage?.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1]);
const cargoLockPath = path.join(root, 'packages/studio-desktop/src-tauri/Cargo.lock');
if (fs.existsSync(cargoLockPath)) {
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
  actual.set('packages/studio-desktop/src-tauri/Cargo.lock (arc-studio-desktop)', cargoLock.match(/\[\[package\]\]\r?\nname\s*=\s*"arc-studio-desktop"\r?\nversion\s*=\s*"([^"]+)"/)?.[1]);
}
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = readJson('package-lock.json');
  actual.set('package-lock.json', lock.version);
  actual.set('package-lock.json packages[""]', lock.packages?.['']?.version);
  for (const name of ['studio-client', 'studio-server', 'studio-desktop']) {
    const key = `packages/${name}`;
    if (lock.packages?.[key]) actual.set(`package-lock.json packages["${key}"]`, lock.packages[key].version);
  }
}
const drift = [...actual].filter(([file, version]) => version !== (file.includes('src-tauri/') ? expectedTauriVersion : expected));
if (drift.length) {
  console.error(`ARC version drift: root package.json is ${expected}.`);
  for (const [file, version] of drift) console.error(`  ${file}: ${version ?? '(missing)'}`);
  console.error('Run `npm run sync:version` and commit the updated manifests.');
  process.exitCode = 1;
} else {
  console.log(`ARC version ${expected} is consistent across package and Tauri manifests.`);
}

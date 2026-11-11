import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTauriVersion, parseArcVersion } from './arc-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(rootPackage.version || '').trim();
if (parseArcVersion(version)?.version !== version) {
  throw new Error(`Root package.json has an invalid ARC version: ${version || '(empty)'}`);
}
const tauriVersion = getTauriVersion(version);
for (const relativePath of [
  'packages/studio-client/package.json',
  'packages/studio-server/package.json',
  'packages/studio-desktop/package.json'
]) {
  const filename = path.join(root, relativePath);
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(filename, `${JSON.stringify(manifest, null, 2)}\n`);
}
const tauriConfigPath = path.join(root, 'packages/studio-desktop/src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = tauriVersion;
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
const cargoManifestPath = path.join(root, 'packages/studio-desktop/src-tauri/Cargo.toml');
const cargoManifest = fs.readFileSync(cargoManifestPath, 'utf8');
const packageSection = /(^\[package\]\r?\n)([\s\S]*?)(?=^\[)/m;
if (!packageSection.test(cargoManifest)) throw new Error('Could not find [package] in the Tauri Cargo.toml.');
const syncedCargoManifest = cargoManifest.replace(packageSection, (section, header, body) => {
  if (!/^version\s*=\s*"[^"]+"\s*$/m.test(body)) throw new Error('Could not find package version in the Tauri Cargo.toml.');
  return `${header}${body.replace(/^version\s*=\s*"[^"]+"\s*$/m, `version = "${tauriVersion}"`)}`;
});
fs.writeFileSync(cargoManifestPath, syncedCargoManifest);
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  for (const packagePath of ['packages/studio-client', 'packages/studio-server', 'packages/studio-desktop']) {
    if (lock.packages?.[packagePath]) lock.packages[packagePath].version = version;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}
const cargoLockPath = path.join(root, 'packages/studio-desktop/src-tauri/Cargo.lock');
if (fs.existsSync(cargoLockPath)) {
  const cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
  const desktopPackage = /(\[\[package\]\]\r?\nname\s*=\s*"arc-studio-desktop"\r?\nversion\s*=\s*")[^"]+("\s*\r?\n)/;
  if (!desktopPackage.test(cargoLock)) throw new Error('Could not find arc-studio-desktop package in Cargo.lock.');
  fs.writeFileSync(cargoLockPath, cargoLock.replace(desktopPackage, `$1${tauriVersion}$2`));
}
process.stdout.write(`ARC Studio version ${version} synced to client and server manifests. Tauri: ${tauriVersion}.\n`);

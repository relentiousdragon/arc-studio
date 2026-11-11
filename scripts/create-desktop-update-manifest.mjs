import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import rootPackage from '../package.json' with { type: 'json' };
import studioClient from '../packages/studio-client/package.json' with { type: 'json' };
import studioServer from '../packages/studio-server/package.json' with { type: 'json' };
import studioDesktop from '../packages/studio-desktop/package.json' with { type: 'json' };
import tauriConfig from '../packages/studio-desktop/src-tauri/tauri.conf.json' with { type: 'json' };
import { getArcReleaseChannel, getTauriVersion, parseArcVersion } from './arc-version.mjs';

const [releaseTag = process.env.GITHUB_REF_NAME, repository = process.env.GITHUB_REPOSITORY, releaseDirectory = 'release-assets'] = process.argv.slice(2);
const parsedTag = parseArcVersion(releaseTag);
if (!parsedTag || parsedTag.version !== String(releaseTag).replace(/^v/i, '')) throw new Error('Pass the ARC Studio version tag, for example v2026.1.1.1 or v2026.1.1-nightly.11.');
if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is missing or invalid.');
if (!fs.existsSync(releaseDirectory)) throw new Error(`Release artifact folder not found: ${releaseDirectory}`);
if (parsedTag.version !== rootPackage.version) throw new Error(`Release tag ${releaseTag} does not match root package version ${rootPackage.version}.`);
const channel = getArcReleaseChannel(rootPackage.version);
const expectedChannel = getArcReleaseChannel(parsedTag.version);
if (channel !== expectedChannel) throw new Error(`Release tag channel (${expectedChannel}) does not match root version channel (${channel}).`);
execFileSync(process.execPath, ['scripts/check-version-consistency.mjs'], { stdio: 'inherit' });
const expectedUpdaterEndpoint = channel === 'nightly'
  ? `https://github.com/${repository}/releases/download/nightly/latest.json`
  : `https://github.com/${repository}/releases/latest/download/latest.json`;
if (tauriConfig.plugins?.updater?.requireSignedVersion !== true || !tauriConfig.plugins?.updater?.pubkey) {
  throw new Error('Tauri updater signing must remain enabled with a configured public key.');
}
for (const [name, version] of Object.entries({ 'studio-client': studioClient.version, 'studio-server': studioServer.version, 'studio-desktop': studioDesktop.version })) {
  if (version !== rootPackage.version) throw new Error(`${name} version ${version} does not match root version ${rootPackage.version}.`);
}

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile()) files.push(fullPath);
  }
}
walk(releaseDirectory);

const expectedBuilds = new Map([
  ['universal-apple-darwin', { platform: 'darwin', architecture: 'universal' }],
  ['x86_64-pc-windows-msvc', { platform: 'win32', architecture: 'x64' }],
  ['aarch64-pc-windows-msvc', { platform: 'win32', architecture: 'arm64' }],
  ['x86_64-unknown-linux-gnu', { platform: 'linux', architecture: 'x64' }],
  ['aarch64-unknown-linux-gnu', { platform: 'linux', architecture: 'arm64' }]
]);
const buildInfoFiles = files.filter((file) => path.basename(file) === 'arc-build-info.json');
if (buildInfoFiles.length !== expectedBuilds.size) throw new Error(`Expected ${expectedBuilds.size} platform build metadata files, found ${buildInfoFiles.length}.`);
const seenTargets = new Set();
const builds = [];
for (const file of buildInfoFiles) {
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (info.schemaVersion !== 1 || info.version !== rootPackage.version || info.channel !== channel || info.updaterEndpoint !== expectedUpdaterEndpoint) {
    throw new Error(`${path.basename(path.dirname(file))}/arc-build-info.json does not match release version/channel (${rootPackage.version} · ${channel}).`);
  }
  const expectedBuild = expectedBuilds.get(info.target);
  if (!expectedBuild || expectedBuild.platform !== info.platform || expectedBuild.architecture !== info.architecture || seenTargets.has(info.target)) {
    throw new Error(`Unexpected, duplicate, or mismatched desktop build metadata: ${info.target} (${info.platform}).`);
  }
  if (!file.includes(info.target)) throw new Error(`Build metadata for ${info.target} was uploaded with the wrong platform artifact.`);
  seenTargets.add(info.target);
  builds.push({ target: info.target, platform: info.platform, architecture: info.architecture });
}
for (const target of expectedBuilds.keys()) if (!seenTargets.has(target)) throw new Error(`Missing platform build metadata for ${target}.`);

const installerExtensions = new Map([
  ['universal-apple-darwin', '.dmg'],
  ['x86_64-pc-windows-msvc', '.exe'],
  ['aarch64-pc-windows-msvc', '.exe'],
  ['x86_64-unknown-linux-gnu', '.AppImage'],
  ['aarch64-unknown-linux-gnu', '.AppImage']
]);
for (const [marker, extension] of installerExtensions) {
  const installers = files.filter((file) => file.includes(marker) && file.toLowerCase().endsWith(extension.toLowerCase()));
  if (installers.length !== 1) throw new Error(`Expected one installer for ${marker}, found ${installers.length}.`);
}
for (const marker of ['x86_64-unknown-linux-gnu', 'aarch64-unknown-linux-gnu']) {
  const packages = files.filter((file) => file.includes(marker) && file.endsWith('.deb'));
  if (packages.length !== 1) throw new Error(`Expected one Debian package for ${marker}, found ${packages.length}.`);
}

const artifactFor = (targetMarker, suffix) => {
  const matches = files.filter((file) => file.includes(targetMarker) && path.basename(file).endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Expected one ${suffix} update artifact for ${targetMarker}, found ${matches.length}.`);
  return matches[0];
};
const publishedAssetName = (name) => name.replace(/ /g, '.');
const signedArtifact = (artifactPath) => {
  const basename = path.basename(artifactPath);
  const originalName = basename.replace(/-unsigned(?=\.(?:exe|AppImage)$)/, '');
  const signaturePath = files.find((file) => path.dirname(file) === path.dirname(artifactPath) && path.basename(file) === `${originalName}.sig`);
  if (!signaturePath) throw new Error(`Missing Tauri signature for ${basename}.`);
  const signature = fs.readFileSync(signaturePath, 'utf8').trim();
  if (!signature || signature.length < 80) throw new Error(`Tauri signature is empty or invalid for ${basename}.`);
  return {
    signature,
    url: `https://github.com/${repository}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(publishedAssetName(basename))}`
  };
};

const macBundle = artifactFor('universal-apple-darwin', '.app.tar.gz');
const winBundle = artifactFor('x86_64-pc-windows-msvc', '.exe');
const winArmBundle = artifactFor('aarch64-pc-windows-msvc', '.exe');
const linuxX64Bundle = artifactFor('x86_64-unknown-linux-gnu', '.AppImage');
const linuxArmBundle = artifactFor('aarch64-unknown-linux-gnu', '.AppImage');
const platforms = {
  'darwin-aarch64': signedArtifact(macBundle),
  'darwin-x86_64': signedArtifact(macBundle),
  'windows-x86_64': signedArtifact(winBundle),
  'windows-aarch64': signedArtifact(winArmBundle),
  'linux-x86_64': signedArtifact(linuxX64Bundle),
  'linux-aarch64': signedArtifact(linuxArmBundle)
};
const version = rootPackage.version;
const manifest = {
  version: getTauriVersion(version),
  notes: `ARC Studio ${version}`,
  pub_date: new Date().toISOString(),
  platforms
};
fs.writeFileSync(path.join(releaseDirectory, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of buildInfoFiles) fs.rmSync(file);
const buildInfo = {
  schemaVersion: 1,
  version,
  channel,
  updaterEndpoint: expectedUpdaterEndpoint,
  builds: builds.sort((left, right) => left.target.localeCompare(right.target))
};
fs.writeFileSync(path.join(releaseDirectory, 'arc-build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(`Created updater manifest for ARC Studio ${version} (${Object.keys(platforms).length} targets).`);

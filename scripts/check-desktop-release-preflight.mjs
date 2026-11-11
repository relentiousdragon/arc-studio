import { execFileSync } from 'node:child_process';
import rootPackage from '../package.json' with { type: 'json' };
import tauriConfig from '../packages/studio-desktop/src-tauri/tauri.conf.json' with { type: 'json' };
import { getArcReleaseChannel, parseArcVersion } from './arc-version.mjs';

const tag = String(process.argv[2] || process.env.GITHUB_REF_NAME || '');
const tagVersion = parseArcVersion(tag);
if (!tagVersion || tagVersion.version !== tag.replace(/^v/i, '')) throw new Error(`Invalid desktop release tag "${tag}". Use v<root-version>, for example v${rootPackage.version}.`);
if (tagVersion.version !== rootPackage.version) throw new Error(`Release tag ${tag} does not match root package version ${rootPackage.version}.`);

const channel = getArcReleaseChannel(tagVersion.version);
const prerelease = channel === 'nightly';
if (tauriConfig.plugins?.updater?.requireSignedVersion !== true || !tauriConfig.plugins?.updater?.pubkey) {
  throw new Error('Tauri updater releases require signed versions and a configured public key.');
}
const repository = process.env.GITHUB_REPOSITORY || 'relentiousdragon/arc-studio';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error(`Invalid GitHub release repository: ${repository}.`);

execFileSync(process.execPath, ['scripts/check-version-consistency.mjs'], { stdio: 'inherit' });
console.log(`Desktop release preflight passed: ${tag} · ${channel} · ${repository} · ${prerelease ? 'prerelease' : 'latest stable'}.`);

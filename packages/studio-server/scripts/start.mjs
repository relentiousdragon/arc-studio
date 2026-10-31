import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClientStartupAction, inspectClientBuild } from '../src/engine/clientStartup.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const clientDist = path.join(repositoryRoot, 'packages/studio-client/dist');
const clientIndex = path.join(clientDist, 'index.html');
const logoPaths = [path.join(clientDist, 'arc.png'), path.join(clientDist, 'nightly-icon.png')];
const clientBuildVersionFile = path.join(clientDist, '.arc-studio-version');
const serverOnly = process.argv.includes('--server-only') || process.env.ARC_SERVER_ONLY === '1';
const desktopMode = process.env.ARC_DESKTOP_MODE === '1';
const rootPackage = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const minimumClientBuildVersion = rootPackage.version;
let runServerOnly = serverOnly;
//
function enableServerOnly(message) {
  console.warn(`[ARC Studio] ${message}`);
  console.warn('[ARC Studio] Starting in server-only mode. The workspace connection page will remain available, and the browser editor build will be retried at next startup.');
  runServerOnly = true;
}

function getBuildStatus() {
  try {
    return inspectClientBuild({
      clientIndex,
      logoPaths,
      markerFile: clientBuildVersionFile,
      minimumVersion: minimumClientBuildVersion
    });
  } catch (error) {
    if (!['EACCES', 'EPERM'].includes(error.code)) throw error;
    return { available: false, version: null, current: false, inspectionDenied: true };
  }
}

if (!serverOnly && !desktopMode) {
  if (typeof minimumClientBuildVersion !== 'string' || !minimumClientBuildVersion.trim()) {
    throw new Error('Could not determine the ARC Studio version for the web client build.');
  }
  let buildStatus = getBuildStatus();
  if (buildStatus.inspectionDenied) {
    enableServerOnly('Startup could not inspect the existing browser client because access was denied.');
  } else if (getClientStartupAction({ clientCurrent: buildStatus.current }) === 'serve') {
    console.log(`[ARC Studio] Using the existing ARC Studio ${buildStatus.version} browser client.`);
  } else {
    console.log('[ARC Studio] Building the web client before startup...');
    const isWindows = process.platform === 'win32';
    const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build:client'], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      shell: isWindows
    });
    if (result.error) {
      enableServerOnly(`Could not build the browser editor: ${result.error.message}`);
    } else if (result.status !== 0) {
      const outcome = result.status === null ? `signal ${result.signal || 'unknown'}` : `status ${result.status}`;
      enableServerOnly(`Browser editor build ended with ${outcome}.`);
    } else {
      buildStatus = getBuildStatus();
      if (buildStatus.inspectionDenied) enableServerOnly('Browser editor assets could not be inspected because access was denied.');
      else if (!buildStatus.current) enableServerOnly('Browser editor build completed without a current, verified client bundle.');
    }
  }
}

if (!serverOnly && desktopMode && (!fs.existsSync(clientIndex) || logoPaths.some((filename) => !fs.existsSync(filename)))) {
  console.log('[ARC Studio] Desktop web assets are missing, building them before startup...');
  const isWindows = process.platform === 'win32';
  const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build:client'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: isWindows
  });
  if (result.error) throw new Error(`Could not build the web client: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!fs.existsSync(clientIndex) || logoPaths.some((filename) => !fs.existsSync(filename))) {
    throw new Error('Web client build did not produce the expected Studio assets.');
  }
}

if (runServerOnly) process.env.ARC_SERVER_ONLY = '1';
await import('../src/index.js');

// contributors: @relentiousdragon

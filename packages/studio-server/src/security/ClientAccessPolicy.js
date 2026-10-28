import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../storage.js';
import { CLIENT_PROTOCOL_VERSION } from '../engine/NodeRegistryContract.js';

const SETTINGS_FILE = path.join(dataDir, 'client-access.json');
const TAURI_ORIGINS = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']);
//
function normalizeSettings(value) {
  return { allowUnknownClients: value?.allowUnknownClients === true };
}

export function readClientAccessSettings() {
  try { return normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))); }
  catch { return normalizeSettings(null); }
}

export function writeClientAccessSettings(patch) {
  const settings = normalizeSettings({ ...readClientAccessSettings(), ...patch });
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const temporaryFile = `${SETTINGS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryFile, SETTINGS_FILE);
  return settings;
}

function firstHeaderValue(value) {
  return String(value || '').split(',')[0].trim().toLowerCase();
}

export function isArcStudioOrigin(origin, headers = {}) {
  if (typeof origin !== 'string' || !origin) return false;
  const normalizedOrigin = origin.replace(/\/$/, '').toLowerCase();
  if (TAURI_ORIGINS.has(normalizedOrigin)) return true;
  let parsedOrigin;
  try { parsedOrigin = new URL(normalizedOrigin); } catch { return false; }
  const expectedHosts = [firstHeaderValue(headers['x-forwarded-host']), firstHeaderValue(headers.host)].filter(Boolean);
  if (expectedHosts.includes(parsedOrigin.host)) return true;
  const originIsLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname);
  const requestIsLoopback = expectedHosts.some((host) => /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host));
  return originIsLoopback && requestIsLoopback;
}

export function isArcStudioClientIdentity(identity) {
  return identity?.product === 'arc-studio'
    && identity?.protocolVersion === CLIENT_PROTOCOL_VERSION
    && typeof identity.version === 'string'
    && Number.isInteger(identity.nodeSchemaVersion)
    && Number.isInteger(identity.nodeRegistryProtocolVersion)
    && Array.isArray(identity.nodeRegistryFeatures)
    && identity.nodeRegistryFeatures.every((feature) => typeof feature === 'string');
}

export function isKnownArcStudioClient(identity, origin, headers = {}) {
  return isArcStudioClientIdentity(identity) && isArcStudioOrigin(origin, headers);
}

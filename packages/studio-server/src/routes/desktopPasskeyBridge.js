import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentModulePath = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BRIDGE_HTML_PATH = path.resolve(currentModulePath, '../../public/passkey-bridge.html');
export const PASSKEY_BRIDGE_STATE_PARAM = 'arc_passkey_state';
export const PASSKEY_BRIDGE_PURPOSE_PARAM = 'arc_passkey_purpose';
//
export function isDesktopPasskeyBridgeRequest(query = {}) {
  const state = query[PASSKEY_BRIDGE_STATE_PARAM];
  const purpose = query[PASSKEY_BRIDGE_PURPOSE_PARAM];
  return (typeof state === 'string' && state.length > 0) || (typeof purpose === 'string' && purpose.length > 0);
}

export function createDesktopPasskeyBridgeHandler({ htmlPath = DEFAULT_BRIDGE_HTML_PATH, logo = '/arc.png', releaseChannel = 'stable', readFileSync = fs.readFileSync } = {}) {
  let cachedHtml = null;
  let cachedLogo = logo;
  let cachedChannel = releaseChannel;
  return (_req, res, next) => {
    try {
      if (!cachedHtml || cachedLogo !== logo || cachedChannel !== releaseChannel) {
        cachedHtml = readFileSync(htmlPath, 'utf8')
          .replaceAll('__LOGO__', logo)
          .replaceAll('__RELEASE_CHANNEL__', releaseChannel);
        cachedLogo = logo;
        cachedChannel = releaseChannel;
      }
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.type('html').send(cachedHtml);
    } catch (error) {
      next(error);
    }
  };
}

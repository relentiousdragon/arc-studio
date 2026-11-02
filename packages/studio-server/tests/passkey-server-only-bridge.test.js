import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { createDesktopPasskeyBridgeHandler, isDesktopPasskeyBridgeRequest } from '../src/routes/desktopPasskeyBridge.js';

const bridgeHtmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/passkey-bridge.html');
//
function createResponseStub() {
  const headers = new Map();
  let contentType = '';
  let body = null;
  const result = {
    set(header, value) {
      headers.set(header, value);
      return result;
    },
    type(value) {
      contentType = value;
      return result;
    },
    send(value) {
      body = value;
      return result;
    },
    get headers() {
      return headers;
    },
    get contentType() {
      return contentType;
    },
    get body() {
      return body;
    }
  };
  return result;
}

test('the desktop passkey handoff request is detected from both query params', () => {
  assert.equal(isDesktopPasskeyBridgeRequest({ arc_passkey_state: 'x'.repeat(50), arc_passkey_purpose: 'authentication' }), true);
  assert.equal(isDesktopPasskeyBridgeRequest({ arc_passkey_state: 'x'.repeat(50) }), true);
  assert.equal(isDesktopPasskeyBridgeRequest({ arc_passkey_purpose: 'registration' }), true);
  assert.equal(isDesktopPasskeyBridgeRequest({}), false);
  assert.equal(isDesktopPasskeyBridgeRequest({ arc_passkey_state: '', arc_passkey_purpose: '' }), false);
  assert.equal(isDesktopPasskeyBridgeRequest({ arc_passkey_state: 42 }), false);
  assert.equal(isDesktopPasskeyBridgeRequest(), false);
});

test('the bridge page is statically served with the release channel baked in', async () => {
  const handler = createDesktopPasskeyBridgeHandler({ logo: '/arc.png', releaseChannel: 'stable' });
  const stableResponse = createResponseStub();
  await handler({}, stableResponse, () => {});
  assert.equal(stableResponse.contentType, 'html');
  assert.match(stableResponse.headers.get('Cache-Control'), /no-store/);
  assert.match(stableResponse.headers.get('Pragma'), /no-cache/);
  assert.equal(stableResponse.body.includes("const channel = 'stable'"), true);
  assert.equal(stableResponse.body.includes('/arc.png'), true);
  assert.equal(stableResponse.body.includes('__LOGO__'), false);
  assert.equal(stableResponse.body.includes('__RELEASE_CHANNEL__'), false);

  const nightlyHandler = createDesktopPasskeyBridgeHandler({ logo: '/nightly-icon.png', releaseChannel: 'nightly' });
  const nightlyResponse = createResponseStub();
  await nightlyHandler({}, nightlyResponse, () => {});
  assert.equal(nightlyResponse.body.includes("const channel = 'nightly'"), true);
  assert.equal(nightlyResponse.body.includes('/nightly-icon.png'), true);
});

test('the bridge html keeps the disk copy untouched by channel rendering', () => {
  const raw = fs.readFileSync(bridgeHtmlPath, 'utf8');
  assert.equal(raw.includes('__LOGO__'), true);
  assert.equal(raw.includes('__RELEASE_CHANNEL__'), true);
});

test('the bridge page talks to the desktop handoff routes and validates the deep link callback', () => {
  const raw = fs.readFileSync(bridgeHtmlPath, 'utf8');
  for (const endpoint of [
    "'/api/auth/passkeys/desktop/login/options'",
    "'/api/auth/passkeys/desktop/login/verify'",
    "'/api/auth/passkeys/desktop/login/continue'",
    "'/api/auth/passkeys/desktop/register/options'",
    "'/api/auth/passkeys/desktop/register/verify'"
  ]) {
    assert.equal(raw.includes(endpoint), true, `missing endpoint ${endpoint}`);
  }
  assert.equal(raw.includes("'arcstudio:'"), true);
  assert.equal(raw.includes('passkey/callback'), true);
  assert.equal(raw.includes("params.get('arc_passkey_state')"), true);
  assert.equal(raw.includes("params.get('arc_passkey_purpose')"), true);
  assert.equal(raw.includes('navigator.credentials.get'), true);
  assert.equal(raw.includes('navigator.credentials.create'), true);
  assert.equal(raw.includes('const publicKey = { ...options, challenge:'), true);
  assert.equal(raw.includes("params.get('arc_passkey_embedded')"), true);
  assert.equal(raw.includes('if (embedded) return'), true);
  assert.equal((raw.match(/window\.location\.href = callbackUrl/g) || []).length, 1);
});

test('the bridge page stays self contained and does not store secrets', () => {
  const raw = fs.readFileSync(bridgeHtmlPath, 'utf8');
  assert.equal(/src="https?:\/\//.test(raw), false);
  assert.equal(/href="https?:\/\//.test(raw), false);
  assert.equal(raw.includes('import '), false);
  assert.equal(raw.includes('eval('), false);
  assert.equal(raw.includes('innerHTML'), false);
  assert.equal(raw.includes('sessionStorage'), false);
  assert.equal(raw.includes('localStorage'), false);
  assert.equal(raw.includes('document.cookie'), false);
});

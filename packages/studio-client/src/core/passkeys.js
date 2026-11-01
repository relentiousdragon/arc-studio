import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { apiUrl } from './api.js';
import { getClientBuildInfo } from './clientBuildInfo.js';
//
export function isWebPasskeyAvailable() {
  try {
    return Boolean(window.isSecureContext) && browserSupportsWebAuthn();
  } catch {
    return false;
  }
}

function readPayload(response) {
  return response.json().catch(() => ({}));
}

function workspaceError(response, payload, fallback) {
  const error = new Error(payload?.error || payload?.detail || fallback);
  error.status = response.status;
  error.code = typeof payload?.code === 'string' ? payload.code : '';
  return error;
}

export async function passkeyRequest(url, { method = 'POST', body, token = '' } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'x-arc-token': token } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Could not reach the workspace. Check the connection and try again.');
  }
  const payload = await readPayload(response);
  if (!response.ok) throw workspaceError(response, payload, 'The workspace could not complete this passkey request.');
  return payload;
}

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function authenticateWithPasskey({ rememberMe = false, onReplacementPending } = {}) {
  const clientBuild = await getClientBuildInfo();
  const ceremony = await passkeyRequest(apiUrl('/api/auth/passkeys/authentication/options'), {
    body: { clientBuild }
  });
  if (!ceremony?.ceremonyId || !ceremony?.options) throw new Error('The workspace returned an invalid passkey request.');
  let credential;
  try {
    credential = await startAuthentication({ optionsJSON: ceremony.options });
  } catch (error) {
    throw passkeyCeremonyError(error, 'Passkey sign in was cancelled or timed out.');
  }
  let result = await passkeyRequest(apiUrl('/api/auth/passkeys/authentication/verify'), {
    body: { ceremonyId: ceremony.ceremonyId, response: credential, rememberMe: rememberMe === true, clientBuild }
  });
  for (let attempt = 0; result?.replacementPending && attempt < 12; attempt += 1) {
    onReplacementPending?.(result);
    const retryAt = Number(result.retryAt);
    await wait(Math.max(250, Math.min(1500, (Number.isFinite(retryAt) ? retryAt - Date.now() : 500) + 150)));
    result = await passkeyRequest(apiUrl('/api/auth/passkeys/authentication/continue'), {
      body: { pendingId: result.pendingId, clientBuild }
    });
  }
  if (result?.replacementPending) throw new Error('The other session did not sign out in time. Try again.');
  if (typeof result?.token !== 'string' || !result?.user) throw new Error('The workspace returned an invalid passkey sign in response.');
  return result;
}

export async function registerWebPasskey({ authToken, password, name = '' }) {
  if (!authToken) throw new Error('Sign in before adding a passkey.');
  if (!password) throw new Error('Enter your current password.');
  const clientBuild = await getClientBuildInfo();
  const ceremony = await passkeyRequest(apiUrl('/api/auth/passkeys/registration/options'), {
    token: authToken,
    body: { password, clientBuild }
  });
  if (!ceremony?.ceremonyId || !ceremony?.options) throw new Error('The workspace returned an invalid passkey request.');
  let credential;
  try {
    credential = await startRegistration({ optionsJSON: ceremony.options });
  } catch (error) {
    throw passkeyCeremonyError(error, 'Passkey setup was cancelled or timed out.');
  }
  const result = await passkeyRequest(apiUrl('/api/auth/passkeys/registration/verify'), {
    token: authToken,
    body: { ceremonyId: ceremony.ceremonyId, response: credential, name: name.trim(), clientBuild }
  });
  return result;
}

export async function listPasskeys(authToken) {
  if (!authToken) return [];
  const result = await passkeyRequest(apiUrl('/api/auth/passkeys'), { method: 'GET', token: authToken });
  return Array.isArray(result?.passkeys) ? result.passkeys : [];
}

export async function removePasskey(authToken, recordId) {
  if (!authToken) throw new Error('Sign in before removing a passkey.');
  const result = await passkeyRequest(apiUrl(`/api/auth/passkeys/${encodeURIComponent(recordId)}`), {
    method: 'DELETE',
    token: authToken
  });
  return Array.isArray(result?.passkeys) ? result.passkeys : [];
}

export function passkeyCeremonyError(error, fallback) {
  if (error?.name === 'NotAllowedError') return new Error(fallback);
  if (error?.name === 'InvalidStateError') return new Error('This passkey is already registered on this device.');
  if (error?.name === 'SecurityError') return new Error('Passkeys need HTTPS or localhost. Check the workspace address.');
  if (error?.name === 'NotSupportedError') return new Error('This browser or device does not support passkeys.');
  if (error?.name === 'ConstraintError') return new Error('This device could not create a passkey with the required security settings.');
  if (error?.message) return error;
  return new Error(fallback);
}

export function describePasskeyError(error, fallback) {
  if (!error) return fallback;
  if (error.name === 'NotAllowedError') return 'Passkey sign in was cancelled or timed out. Try again.';
  if (error.name === 'SecurityError') return 'Passkeys need HTTPS or localhost. Check the workspace address.';
  if (error.name === 'NotSupportedError') return 'This browser or device does not support passkeys.';
  if (error.name === 'AbortError') return 'Passkey sign in was cancelled.';
  return error.message || fallback;
}

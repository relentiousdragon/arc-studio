import { normalizeWorkspaceUrl } from './api.js';
import { getClientBuildInfo } from './clientBuildInfo.js';
//
const STORAGE_KEY = 'arc_desktop_passkey_flows';
const FLOW_TTL_MS = 9 * 60 * 1000;
const MAX_PENDING_FLOWS = 4;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CALLBACK_PROTOCOL = 'arcstudio:';
const WAIT_POLL_INTERVAL_MS = 1500;
const WAIT_POLL_MAX_MS = 6.5 * 60 * 1000;
const waitPoll = { state: '', timer: 0, startedAt: 0 };
const ticketListeners = new Set();

function isDesktopRuntime() {
  return Boolean(window.__ARC_STUDIO_CONFIG__?.desktop)
    && typeof window.__TAURI_INTERNALS__?.invoke === 'function';
}

function randomBase64Url(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function readFlows() {
  let parsed;
  try { parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const now = Date.now();
  const flows = {};
  for (const [state, flow] of Object.entries(parsed)) {
    if (!STATE_PATTERN.test(state) || !flow || typeof flow !== 'object' || Array.isArray(flow)) continue;
    if (flow.state !== state
      || !STATE_PATTERN.test(String(flow.codeVerifier || ''))
      || !['authentication', 'registration'].includes(flow.kind)
      || typeof flow.origin !== 'string'
      || !Number.isFinite(flow.createdAt)
      || !Number.isFinite(flow.expiresAt)
      || flow.expiresAt <= now) continue;
    flows[state] = {
      state,
      codeVerifier: flow.codeVerifier,
      origin: flow.origin,
      kind: flow.kind,
      persistSession: flow.persistSession === true,
      createdAt: flow.createdAt,
      expiresAt: flow.expiresAt
    };
  }
  return flows;
}

function writeFlows(flows) {
  const entries = Object.values(flows)
    .filter((flow) => flow.expiresAt > Date.now())
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_PENDING_FLOWS);
  try {
    if (!entries.length) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries.map((flow) => [flow.state, flow]))));
  } catch {}
}

export function isDesktopPasskeyAvailable() {
  return isDesktopRuntime();
}

export function peekDesktopPasskeyFlow(state) {
  if (!STATE_PATTERN.test(String(state || ''))) return null;
  return readFlows()[state] || null;
}

export function removeDesktopPasskeyFlow(state) {
  const flows = readFlows();
  if (!flows[state]) return;
  delete flows[state];
  writeFlows(flows);
}

export function cancelDesktopPasskeyFlows() {
  stopDesktopPasskeyWaitPoller();
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

function stopDesktopPasskeyWaitPoller() {
  if (waitPoll.timer) window.clearTimeout(waitPoll.timer);
  waitPoll.timer = 0;
  waitPoll.state = '';
  waitPoll.startedAt = 0;
}

function startDesktopPasskeyWaitPoller(state) {
  stopDesktopPasskeyWaitPoller();
  waitPoll.state = state;
  waitPoll.startedAt = Date.now();
  const poll = async () => {
    if (waitPoll.state !== state) return;
    const flow = peekDesktopPasskeyFlow(state);
    if (!flow) return stopDesktopPasskeyWaitPoller();
    let payload = null;
    try {
      const clientBuild = await getClientBuildInfo();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`${flow.origin}/api/auth/passkeys/desktop/wait`, {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, clientBuild })
        });
        payload = await response.json().catch(() => null);
      } finally { window.clearTimeout(timeout); }
    } catch {}
    if (waitPoll.state !== state) return;
    if (payload && payload.pending === false && typeof payload.ticket === 'string' && TICKET_PATTERN.test(payload.ticket)) {
      stopDesktopPasskeyWaitPoller();
      await emitDesktopPasskeyNotice({ state, ticket: payload.ticket });
      return;
    }
    if ((payload?.expired === true) || Date.now() - waitPoll.startedAt >= WAIT_POLL_MAX_MS) {
      stopDesktopPasskeyWaitPoller();
      await emitDesktopPasskeyNotice({ state, ended: true });
      return;
    }
    waitPoll.timer = window.setTimeout(poll, WAIT_POLL_INTERVAL_MS);
  };
  waitPoll.timer = window.setTimeout(poll, WAIT_POLL_INTERVAL_MS);
}

async function emitDesktopPasskeyNotice(notice) {
  try {
    for (const handler of Array.from(ticketListeners)) await handler(notice);
  } catch {}
}

export function subscribeDesktopPasskeyTickets(handler) {
  if (typeof handler !== 'function') return () => {};
  ticketListeners.add(handler);
  return () => ticketListeners.delete(handler);
}

export async function beginDesktopPasskey({ kind, workspaceOrigin, authToken = '', password = '', name = '', persistSession = true }) {
  if (!isDesktopRuntime()) throw new Error('Passkey browser handoff is available only in the ARC Studio desktop app.');
  if (!['authentication', 'registration'].includes(kind)) throw new Error('Choose a valid passkey action.');
  const origin = normalizeWorkspaceUrl(workspaceOrigin);
  if (kind === 'registration' && (!authToken || !password)) throw new Error('Sign in and confirm your password before adding a passkey.');

  const state = randomBase64Url();
  const codeVerifier = randomBase64Url();
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const clientBuild = await getClientBuildInfo();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let payload;
  try {
    const response = await fetch(`${origin}/api/auth/passkeys/desktop/${kind === 'registration' ? 'register' : 'login'}/start`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(kind === 'registration' ? { 'x-arc-token': authToken } : {})
      },
      body: JSON.stringify({
        workspaceOrigin: origin,
        state,
        codeChallenge,
        clientBuild,
        ...(kind === 'registration'
          ? { password, name: String(name || '').trim().slice(0, 64) }
          : { rememberMe: persistSession === true })
      })
    });
    payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'The workspace could not start a desktop passkey request.');
      error.status = response.status;
      error.code = typeof payload.code === 'string' ? payload.code : '';
      throw error;
    }
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The workspace did not respond in time.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  let authorizeUrl;
  try { authorizeUrl = new URL(String(payload.authorizeUrl || '')); }
  catch { throw new Error('The workspace returned an invalid passkey address.'); }
  const expectedPurpose = kind === 'registration' ? 'registration' : 'authentication';
  if (authorizeUrl.origin !== origin
    || authorizeUrl.pathname !== '/'
    || authorizeUrl.searchParams.get('arc_passkey_state') !== state
    || authorizeUrl.searchParams.get('arc_passkey_purpose') !== expectedPurpose) {
    throw new Error('The workspace returned an invalid passkey address.');
  }

  const flows = readFlows();
  const now = Date.now();
  flows[state] = {
    state,
    codeVerifier,
    origin,
    kind,
    persistSession: kind === 'authentication' && persistSession === true,
    createdAt: now,
    expiresAt: now + FLOW_TTL_MS
  };
  writeFlows(flows);

  try {
    await window.__TAURI_INTERNALS__.invoke('open_passkey_auth_url', { url: authorizeUrl.toString() });
  } catch (error) {
    removeDesktopPasskeyFlow(state);
    throw new Error(error?.message || 'Could not open your browser for the passkey request.');
  }
  startDesktopPasskeyWaitPoller(state);
  return { state };
}

export async function redeemDesktopPasskey({ state, ticket }) {
  const flow = peekDesktopPasskeyFlow(state);
  if (!flow) {
    const error = new Error('This passkey request is no longer active. Start again from ARC Studio.');
    error.code = 'PASSKEY_FLOW_MISSING';
    throw error;
  }
  if (!TICKET_PATTERN.test(String(ticket || ''))) throw new Error('This passkey response is invalid. Start again from ARC Studio.');
  const clientBuild = await getClientBuildInfo();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response;
  let payload;
  try {
    response = await fetch(`${flow.origin}/api/auth/passkeys/desktop/redeem`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, ticket, codeVerifier: flow.codeVerifier, clientBuild })
    });
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The workspace did not respond in time.');
    throw new Error('Could not reach the workspace to finish the passkey request.');
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    if (![408, 429, 500, 502, 503, 504].includes(response.status)) removeDesktopPasskeyFlow(state);
    throw new Error(payload.error || 'The workspace could not finish the passkey request.');
  }
  removeDesktopPasskeyFlow(state);
  if (payload.kind !== flow.kind) throw new Error('The workspace returned the wrong passkey response.');
  if (flow.kind === 'authentication' && (typeof payload.token !== 'string' || !payload.user)) {
    throw new Error('The workspace returned an invalid passkey sign in response.');
  }
  if (flow.kind === 'registration' && !Array.isArray(payload.passkeys)) {
    throw new Error('The workspace could not confirm the new passkey.');
  }
  return { ...payload, flow };
}

export function parseDesktopPasskeyCallback(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl || '')); }
  catch { return null; }
  if (url.protocol !== CALLBACK_PROTOCOL) return null;
  const route = `${url.hostname}/${url.pathname}`.replace(/\/+/g, '/').replace(/^\//, '').toLowerCase();
  if (route !== 'passkey/callback') return null;
  const state = url.searchParams.get('state') || '';
  const ticket = url.searchParams.get('ticket') || '';
  if (!STATE_PATTERN.test(state) || !TICKET_PATTERN.test(ticket)) return null;
  return { state, ticket };
}

export async function subscribeDesktopPasskeyCallbacks(handler, onError = () => {}) {
  if (!isDesktopRuntime()) return () => {};
  let disposed = false;
  let unlisten = null;
  try {
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
    if (disposed) return () => {};
    try {
      const urls = await getCurrent();
      if (!disposed && Array.isArray(urls) && urls.length) handler(urls);
    } catch {}
    unlisten = await onOpenUrl((urls) => {
      if (!disposed && Array.isArray(urls)) handler(urls);
    });
    if (disposed) {
      try { unlisten(); } catch {}
      unlisten = null;
    }
  } catch (error) {
    if (!disposed) onError(error);
  }
  return () => {
    disposed = true;
    if (unlisten) {
      try { unlisten(); } catch {}
      unlisten = null;
    }
  };
}

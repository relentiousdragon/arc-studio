import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PasskeyService, getWebAuthnOrigin } from '../src/security/PasskeyService.js';
import { PasskeyStore } from '../src/security/PasskeyStore.js';
import { UserStore } from '../src/security/UserStore.js';

const base64url = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('base64url');
//
function desktopService(clock) {
  return new PasskeyService({
    userStore: { users: [] },
    passkeyStore: { getCredentialIdsForUser: () => [] },
    now: () => clock.now
  });
}

function startDesktopFlow(service, { purpose = 'authentication', userId = '' } = {}) {
  const state = base64url();
  const codeVerifier = base64url();
  const result = service.createDesktopFlow({
    workspaceOrigin: 'https://studio.example.com',
    state,
    codeChallenge: sha256(codeVerifier),
    purpose,
    userId,
    passkeyName: 'Browser passkey',
    rememberMe: false
  });
  return { state, codeVerifier, result };
}

function callbackTicket(service, flow, state) {
  const issued = service.issueDesktopTicket(flow, 'authentication', {
    token: 'session-token',
    user: { id: 'admin_1', username: 'owner' }
  });
  const callback = new URL(issued.callbackUrl);
  assert.equal(callback.protocol, 'arcstudio:');
  assert.equal(`${callback.hostname}${callback.pathname}`, 'passkey/callback');
  assert.equal(callback.searchParams.get('state'), state);
  return callback.searchParams.get('ticket');
}

test('passkey storage persists public credential data with owner only permissions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-passkeys-'));
  const filePath = path.join(directory, 'webauthn-credentials.json');
  try {
    const store = new PasskeyStore({ filePath });
    const publicKey = Buffer.alloc(64, 7);
    const passkeys = store.add('user-1', {
      id: Buffer.from('credential-id').toString('base64url'),
      publicKey,
      counter: 1,
      transports: ['internal', 'usb', 'unknown'],
      deviceType: 'multiDevice',
      backedUp: true
    }, { name: 'MacBook Touch ID' });

    assert.equal(passkeys.length, 1);
    assert.equal(passkeys[0].name, 'MacBook Touch ID');
    assert.deepEqual(store.getCredentialIdsForUser('user-1'), [{
      id: Buffer.from('credential-id').toString('base64url'),
      transports: ['internal', 'usb']
    }]);
    assert.equal(store.listForUser('other-user').length, 0);
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);

    const stored = JSON.parse(await readFile(filePath, 'utf8'))[0];
    assert.equal(stored.publicKey, publicKey.toString('base64url'));
    assert.equal(Object.hasOwn(stored, 'privateKey'), false);
    assert.throws(() => store.add('user-1', {
      id: stored.credentialId,
      publicKey,
      counter: 1
    }), /already registered/);

    const reopened = new PasskeyStore({ filePath });
    assert.deepEqual(reopened.findByCredentialId(stored.credentialId).publicKeyBytes, publicKey);
    assert.equal(reopened.removeForUser('other-user', passkeys[0].id), false);
    assert.equal(reopened.removeForUser('user-1', passkeys[0].id), true);
    assert.equal(reopened.findByCredentialId(stored.credentialId), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('WebAuthn origin accepts HTTPS domains and localhost development only', () => {
  assert.deepEqual(getWebAuthnOrigin({ headers: { origin: 'https://studio.example.com' } }), {
    origin: 'https://studio.example.com',
    rpID: 'studio.example.com'
  });
  assert.deepEqual(getWebAuthnOrigin({ headers: { origin: 'https://studio.example.com:8443' } }), {
    origin: 'https://studio.example.com:8443',
    rpID: 'studio.example.com'
  });
  assert.deepEqual(getWebAuthnOrigin({ headers: { origin: 'http://localhost:5173' } }), {
    origin: 'http://localhost:5173',
    rpID: 'localhost'
  });
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'http://studio.example.com' } }), /HTTPS workspace origin/);
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'https://studio.example.com/path' } }), /HTTPS workspace origin/);
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'https://studio.example.com/' } }), /HTTPS workspace origin/);
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'https://user:pass@studio.example.com' } }), /HTTPS workspace origin/);
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'https://127.0.0.1:8443' } }), /domain name or localhost/);
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'http://[::1]:3000' } }), /HTTPS workspace origin/);
  assert.throws(() => getWebAuthnOrigin({ headers: { origin: 'null' } }), /valid browser origin/);
});

test('passkey ceremonies are one shot and expire after three minutes', async () => {
  const clock = { now: 1_000_000 };
  const service = desktopService(clock);
  const { ceremonyId, options } = await service.authenticationOptions({
    headers: { origin: 'https://studio.example.com' }
  });
  assert.match(options.challenge, /^[A-Za-z0-9_-]{16,}$/);
  assert.ok(service.getCeremony(ceremonyId, 'authentication', 'https://studio.example.com'));
  assert.equal(service.getCeremony(ceremonyId, 'registration', 'https://studio.example.com'), null);
  assert.equal(service.getCeremony(ceremonyId, 'authentication', 'https://other.example.com'), null);

  clock.now += 3 * 60 * 1000 + 1;
  assert.equal(service.getCeremony(ceremonyId, 'authentication', 'https://studio.example.com'), null);
});

test('desktop tickets require the matching state and PKCE verifier and cannot replay', () => {
  const clock = { now: 2_000_000 };
  const service = desktopService(clock);
  const { state, codeVerifier } = startDesktopFlow(service);
  const flow = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, state);
  assert.ok(flow);
  assert.equal(service.getDesktopFlow({ headers: { origin: 'https://other.example.com' } }, state), null);

  const ticket = callbackTicket(service, flow, state);
  assert.deepEqual(service.redeemDesktopTicket({ state, ticket, codeVerifier }), {
    kind: 'authentication',
    token: 'session-token',
    user: { id: 'admin_1', username: 'owner' }
  });
  assert.throws(() => service.redeemDesktopTicket({ state, ticket, codeVerifier }), /invalid or has expired/);
});

test('desktop tickets reject a different state verifier origin or expired answer', () => {
  const clock = { now: 3_000_000 };
  const service = desktopService(clock);
  const first = startDesktopFlow(service);
  const second = startDesktopFlow(service);
  const firstFlow = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, first.state);
  const firstTicket = callbackTicket(service, firstFlow, first.state);

  const secondFlow = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, second.state);
  assert.ok(secondFlow);
  assert.throws(
    () => service.redeemDesktopTicket({ state: second.state, ticket: firstTicket, codeVerifier: first.codeVerifier }),
    /invalid or has expired/
  );

  const retryFlow = startDesktopFlow(service);
  const retry = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, retryFlow.state);
  const retryTicket = callbackTicket(service, retry, retryFlow.state);
  assert.throws(
    () => service.redeemDesktopTicket({ state: retryFlow.state, ticket: retryTicket, codeVerifier: second.codeVerifier }),
    /invalid or has expired/
  );

  const expiredFlow = startDesktopFlow(service);
  const expired = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, expiredFlow.state);
  const expiredTicket = callbackTicket(service, expired, expiredFlow.state);
  clock.now += 60 * 1000 + 1;
  assert.throws(
    () => service.redeemDesktopTicket({ state: expiredFlow.state, ticket: expiredTicket, codeVerifier: expiredFlow.codeVerifier }),
    /invalid or has expired/
  );
});

test('desktop wait exposes the issued ticket once and stops after redemption', () => {
  const clock = { now: 6_000_000 };
  const service = desktopService(clock);
  const { state, codeVerifier } = startDesktopFlow(service);
  assert.equal(service.peekDesktopTicket(state), null);
  assert.equal(service.peekDesktopTicket(base64url()), null);
  assert.equal(service.peekDesktopTicket('short'), null);

  const flow = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, state);
  const ticket = callbackTicket(service, flow, state);
  assert.deepEqual(service.peekDesktopTicket(state), {
    ticket,
    kind: 'authentication',
    expiresAt: clock.now + 60 * 1000
  });

  assert.deepEqual(service.redeemDesktopTicket({ state, ticket, codeVerifier }), {
    kind: 'authentication',
    token: 'session-token',
    user: { id: 'admin_1', username: 'owner' }
  });
  assert.equal(service.peekDesktopTicket(state), null);

  const registrationFlow = (() => {
    const value = startDesktopFlow(service);
    const record = service.getDesktopFlow({ headers: { origin: 'https://studio.example.com' } }, value.state);
    service.issueDesktopTicket(record, 'registration', { passkeys: [] });
    return value.state;
  })();
  assert.deepEqual(service.peekDesktopTicket(registrationFlow).kind, 'registration');
  clock.now += 60 * 1000 + 1;
  assert.equal(service.peekDesktopTicket(registrationFlow), null);
});

test('desktop flow validation rejects unsafe origins and weak state values', () => {
  const clock = { now: 4_000_000 };
  const service = desktopService(clock);
  const base = {
    state: base64url(),
    codeChallenge: base64url(),
    rememberMe: false
  };
  assert.throws(() => service.createDesktopFlow({ ...base, workspaceOrigin: 'https://studio.example.com/path' }), /workspace origin/);
  assert.throws(() => service.createDesktopFlow({ ...base, workspaceOrigin: 'http://studio.example.com' }), /HTTPS workspace origin/);
  assert.throws(() => service.createDesktopFlow({ ...base, workspaceOrigin: 'https://user:pass@studio.example.com' }), /workspace origin/);
  assert.throws(() => service.createDesktopFlow({ ...base, workspaceOrigin: 'https://studio.example.com', state: 'short' }), /state or verifier/);
  assert.throws(() => service.createDesktopFlow({ ...base, workspaceOrigin: 'https://studio.example.com', purpose: 'registration' }), /flow is invalid/);
});

test('pending passkey state is capped to keep public endpoints bounded', () => {
  const clock = { now: 5_000_000 };
  const service = desktopService(clock);
  for (let index = 0; index < 520; index += 1) {
    service.createDesktopFlow({
      workspaceOrigin: 'https://studio.example.com',
      state: base64url(),
      codeChallenge: base64url(),
      rememberMe: false
    });
  }
  assert.ok(service.desktopFlows.size <= 512);
  for (let index = 0; index < 2100; index += 1) {
    service.saveCeremony({ challenge: base64url() }, { purpose: 'authentication', origin: 'https://studio.example.com', rpID: 'studio.example.com' });
  }
  assert.ok(service.ceremonies.size <= 2048);
});

test('passkey sign in uses the same session rules as password sign in', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-passkey-user-'));
  try {
    const userStore = new UserStore({ dataPath: path.join(directory, 'users.json') });
    const setup = userStore.createPrimaryAdmin({
      username: 'owner',
      password: 'correct horse battery staple',
      workspaceName: 'Passkey Test'
    });
    userStore.endSession(setup.token);

    const session = userStore.loginWithPasskey(setup.user.id, true);
    assert.equal(typeof session.token, 'string');
    assert.equal(session.user.id, setup.user.id);
    assert.equal(userStore.validateSession(session.token)?.id, setup.user.id);

    const limited = userStore.createUser({ username: 'newcomer', password: 'temporary password', mustChangePassword: true });
    assert.throws(() => userStore.loginWithPasskey(limited.id, false), /Change your password before signing in with a passkey/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('signing out revokes the signed session token instead of rebuilding it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-passkey-logout-'));
  try {
    const userStore = new UserStore({ dataPath: path.join(directory, 'users.json') });
    const owner = userStore.createPrimaryAdmin({
      username: 'owner',
      password: 'correct horse battery staple',
      workspaceName: 'Logout Test'
    });
    const worker = userStore.createUser({ username: 'worker', password: 'another password', role: 'viewer' });
    const workerSession = userStore.login('worker', 'another password', false);

    assert.equal(userStore.validateSession(owner.token)?.id, owner.user.id);
    userStore.endSession(owner.token);
    assert.equal(userStore.validateSession(owner.token), null);
    assert.equal(userStore.validateSession(workerSession.token)?.id, worker.id);

    const nextOwnerSession = userStore.loginWithPasskey(owner.user.id, false);
    assert.equal(userStore.validateSession(nextOwnerSession.token)?.id, owner.user.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

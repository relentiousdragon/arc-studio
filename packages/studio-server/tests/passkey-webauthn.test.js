import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PasskeyService } from '../src/security/PasskeyService.js';
import { PasskeyStore } from '../src/security/PasskeyStore.js';
import { UserStore } from '../src/security/UserStore.js';

const ORIGIN = 'https://studio.example.com';
const RP_ID = 'studio.example.com';
const request = { headers: { origin: ORIGIN } };
//
function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function cborHead(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  if (length < 0x10000) {
    const buffer = Buffer.from([(major << 5) | 25, 0, 0]);
    buffer.writeUInt16BE(length, 1);
    return buffer;
  }
  const buffer = Buffer.alloc(5);
  buffer[0] = (major << 5) | 26;
  buffer.writeUInt32BE(length, 1);
  return buffer;
}

function cbor(value) {
  if (typeof value === 'number') {
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === 'string') {
    const encoded = Buffer.from(value, 'utf8');
    return Buffer.concat([cborHead(3, encoded.length), encoded]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([cborHead(2, value.length), value]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([cborHead(4, value.length), ...value.map(cbor)]);
  }
  if (value instanceof Map) {
    const parts = [cborHead(5, value.size)];
    for (const [key, item] of value) parts.push(cbor(key), cbor(item));
    return Buffer.concat(parts);
  }
  throw new TypeError(`Cannot encode ${typeof value} as CBOR.`);
}

function createVirtualAuthenticator({ rpID = RP_ID, counter = 0 } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = crypto.randomBytes(32);
  const coseKey = cbor(new Map([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')]
  ]));
  let signCount = counter;

  const clientData = (type, challenge) => base64url(JSON.stringify({
    type,
    challenge,
    origin: ORIGIN,
    crossOrigin: false
  }));

  const authData = ({ flags, includeCredential = false, count = signCount }) => {
    const rpIdHash = crypto.createHash('sha256').update(rpID).digest();
    const counterBuffer = Buffer.alloc(4);
    counterBuffer.writeUInt32BE(count);
    const head = Buffer.concat([rpIdHash, Buffer.from([flags]), counterBuffer]);
    if (!includeCredential) return head;
    const length = Buffer.alloc(2);
    length.writeUInt16BE(credentialId.length);
    return Buffer.concat([head, Buffer.alloc(16), length, credentialId, coseKey]);
  };

  return {
    credentialId,
    get signCount() { return signCount; },
    attestation(challenge) {
      const encodedClientData = clientData('webauthn.create', challenge);
      const registrationData = authData({ flags: 0x45, includeCredential: true });
      const attestationObject = cbor(new Map([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', registrationData]
      ]));
      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: encodedClientData,
          attestationObject: base64url(attestationObject),
          transports: ['internal', 'hybrid']
        }
      };
    },
    assertion(challenge, { increment = true, counter } = {}) {
      if (increment) signCount += 1;
      const encodedClientData = clientData('webauthn.get', challenge);
      const authenticatorData = authData({ flags: 0x05, count: counter ?? signCount });
      const clientDataHash = crypto.createHash('sha256').update(Buffer.from(encodedClientData, 'base64url')).digest();
      const signature = crypto.sign('sha256', Buffer.concat([authenticatorData, clientDataHash]), privateKey);
      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: encodedClientData,
          authenticatorData: base64url(authenticatorData),
          signature: base64url(signature),
          userHandle: base64url('ignored-by-the-service')
        }
      };
    }
  };
}

async function createService(directory) {
  const userStore = new UserStore({ dataPath: path.join(directory, 'users.json') });
  const setup = userStore.createPrimaryAdmin({
    username: 'owner',
    password: 'correct horse battery staple',
    workspaceName: 'Passkey Ceremony'
  });
  userStore.endSession(setup.token);
  const passkeyStore = new PasskeyStore({ filePath: path.join(directory, 'webauthn-credentials.json') });
  const service = new PasskeyService({ userStore, passkeyStore });
  return { userStore, passkeyStore, service, user: userStore.users.find((item) => item.id === setup.user.id) };
}

test('a verified passkey registers, signs in, and advances the signature counter', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-webauthn-'));
  try {
    const { userStore, passkeyStore, service, user } = await createService(directory);
    const authenticator = createVirtualAuthenticator();

    const registration = await service.registrationOptions(user, request);
    const registered = await service.verifyRegistration(
      user,
      request,
      registration.ceremonyId,
      authenticator.attestation(registration.options.challenge),
      'Test security key'
    );
    assert.equal(registered.passkeys.length, 1);
    assert.equal(registered.passkeys[0].name, 'Test security key');
    assert.deepEqual(registered.passkeys[0].transports, ['internal', 'hybrid']);
    assert.equal(registered.passkeys[0].deviceType, 'singleDevice');
    assert.equal(registered.passkeys[0].backedUp, false);

    const stored = passkeyStore.findByCredentialId(base64url(authenticator.credentialId));
    assert.ok(stored);
    assert.equal(stored.counter, 0);
    assert.ok(stored.publicKeyBytes.length > 65);

    const options = await service.authenticationOptions(request);
    const session = await service.verifyAuthentication(
      request,
      options.ceremonyId,
      authenticator.assertion(options.options.challenge),
      false
    );
    assert.equal(typeof session.token, 'string');
    assert.equal(session.user.id, user.id);
    assert.equal(userStore.validateSession(session.token)?.id, user.id);
    assert.equal(passkeyStore.findByCredentialId(base64url(authenticator.credentialId)).counter, 1);
    assert.ok(passkeyStore.listForUser(user.id)[0].lastUsedAt);

    userStore.endSession(session.token);
    const replayOptions = await service.authenticationOptions(request);
    const replay = authenticator.assertion(replayOptions.options.challenge);
    const replaySession = await service.verifyAuthentication(request, replayOptions.ceremonyId, replay, false);
    assert.equal(typeof replaySession.token, 'string');
    await assert.rejects(() => service.verifyAuthentication(request, replayOptions.ceremonyId, replay), /expired/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('passkey verification rejects mismatched origins, challenges, and stale counters', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-webauthn-'));
  try {
    const { service, user } = await createService(directory);
    const authenticator = createVirtualAuthenticator({ counter: 5 });

    const registration = await service.registrationOptions(user, request);
    await assert.rejects(
      () => service.verifyRegistration(
        user,
        { headers: { origin: 'https://evil.example.com' } },
        registration.ceremonyId,
        authenticator.attestation(registration.options.challenge)
      ),
      /expired/
    );
    const registered = await service.verifyRegistration(
      user,
      request,
      registration.ceremonyId,
      authenticator.attestation(registration.options.challenge)
    );
    assert.equal(registered.passkeys.length, 1);

    const wrongChallenge = await service.authenticationOptions(request);
    await assert.rejects(
      () => service.verifyAuthentication(
        request,
        wrongChallenge.ceremonyId,
        authenticator.assertion('a-completely-different-challenge')
      ),
      /challenge|could not be verified/
    );

    const wrongOrigin = await service.authenticationOptions(request);
    await assert.rejects(
      () => service.verifyAuthentication(
        { headers: { origin: 'https://other.example.com' } },
        wrongOrigin.ceremonyId,
        authenticator.assertion(wrongOrigin.options.challenge)
      ),
      /expired/
    );

    const firstLogin = await service.authenticationOptions(request);
    const session = await service.verifyAuthentication(
      request,
      firstLogin.ceremonyId,
      authenticator.assertion(firstLogin.options.challenge)
    );
    assert.equal(typeof session.token, 'string');

    const stale = await service.authenticationOptions(request);
    await assert.rejects(
      () => service.verifyAuthentication(
        request,
        stale.ceremonyId,
        authenticator.assertion(stale.options.challenge, { increment: false, counter: 6 })
      ),
      /counter|could not be verified/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('an unregistered or foreign passkey cannot sign in to the workspace', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-webauthn-'));
  try {
    const registered = createVirtualAuthenticator();
    const stranger = createVirtualAuthenticator();
    const user = { id: 'user_owner', username: 'owner' };
    const userStore = {
      users: [user],
      loginWithPasskey: () => ({ token: 'token', user })
    };
    const service = new PasskeyService({
      userStore,
      passkeyStore: new PasskeyStore({ filePath: path.join(directory, 'isolated.json') })
    });

    const options = await service.registrationOptions(user, request);
    await service.verifyRegistration(user, request, options.ceremonyId, registered.attestation(options.options.challenge), 'Owner key');

    const loginOptions = await service.authenticationOptions(request);
    await assert.rejects(
      () => service.verifyAuthentication(request, loginOptions.ceremonyId, stranger.assertion(loginOptions.options.challenge)),
      /not registered with this workspace/
    );

    const validOptions = await service.authenticationOptions(request);
    const session = await service.verifyAuthentication(request, validOptions.ceremonyId, registered.assertion(validOptions.options.challenge));
    assert.equal(session.token, 'token');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

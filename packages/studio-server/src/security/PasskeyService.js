import crypto from 'node:crypto';
import { isIP } from 'node:net';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from '@simplewebauthn/server';

const CEREMONY_TTL_MS = 3 * 60 * 1000;
const PENDING_LOGIN_TTL_MS = 60 * 1000;
const DESKTOP_FLOW_TTL_MS = 5 * 60 * 1000;
const DESKTOP_TICKET_TTL_MS = 60 * 1000;
const DESKTOP_HEARTBEAT_LIVENESS_MS = 90 * 1000;
const MAX_PENDING_CEREMONIES = 2048;
const MAX_PENDING_LOGINS = 256;
const MAX_DESKTOP_FLOWS = 512;
const MAX_DESKTOP_TICKETS = 512;
const MAX_CREDENTIALS_PER_USER = 20;
const RP_NAME = 'ARC Studio';
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('base64url');
//
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function pruneOldest(map, limit) {
  if (map.size <= limit) return;
  for (const key of map.keys()) {
    if (map.size <= limit) break;
    map.delete(key);
  }
}

export function getWebAuthnOrigin(request) {
  const rawOrigin = request?.headers?.origin;
  if (typeof rawOrigin !== 'string' || rawOrigin.length > 512) throw new Error('Passkey requests require a valid browser origin.');
  let parsed;
  try { parsed = new URL(rawOrigin); } catch { throw new Error('Passkey requests require a valid browser origin.'); }
  const localHttp = parsed.protocol === 'http:' && parsed.hostname === 'localhost';
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.origin !== rawOrigin || parsed.username || parsed.password) {
    throw new Error('Passkeys require the exact HTTPS workspace origin.');
  }
  const bareHostname = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  if (!bareHostname || isIP(bareHostname)) {
    throw new Error('Passkeys require a domain name or localhost. IP addresses cannot host passkeys.');
  }
  return { origin: parsed.origin, rpID: parsed.hostname };
}

function getDesktopWorkspaceOrigin(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('The desktop passkey flow needs a valid workspace origin.'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
    throw new Error('The desktop passkey flow needs a workspace origin without a path, credentials, or query.');
  }
  return getWebAuthnOrigin({ headers: { origin: parsed.origin } }).origin;
}

function cleanPasskeyName(value) {
  return String(value || 'Passkey').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64) || 'Passkey';
}

export class PasskeyService {
  constructor({ userStore, passkeyStore, now = Date.now } = {}) {
    if (!userStore || !passkeyStore) throw new TypeError('PasskeyService needs user and credential stores.');
    this.userStore = userStore;
    this.passkeyStore = passkeyStore;
    this.now = now;
    this.ceremonies = new Map();
    this.pendingLogins = new Map();
    this.desktopFlows = new Map();
    this.desktopTickets = new Map();
  }

  prunePending() {
    const now = this.now();
    for (const [id, ceremony] of this.ceremonies) if (ceremony.expiresAt <= now) this.ceremonies.delete(id);
    for (const [id, login] of this.pendingLogins) if (login.expiresAt <= now) this.pendingLogins.delete(id);
    for (const [id, flow] of this.desktopFlows) if (flow.expiresAt <= now) this.desktopFlows.delete(id);
    for (const [id, ticket] of this.desktopTickets) if (ticket.expiresAt <= now) this.desktopTickets.delete(id);
    pruneOldest(this.ceremonies, MAX_PENDING_CEREMONIES);
    pruneOldest(this.pendingLogins, MAX_PENDING_LOGINS);
    pruneOldest(this.desktopFlows, MAX_DESKTOP_FLOWS);
    pruneOldest(this.desktopTickets, MAX_DESKTOP_TICKETS);
  }

  saveCeremony(options, details) {
    this.prunePending();
    const id = crypto.randomBytes(24).toString('base64url');
    const now = this.now();
    this.ceremonies.set(id, {
      ...details,
      challenge: options.challenge,
      createdAt: now,
      expiresAt: now + CEREMONY_TTL_MS
    });
    pruneOldest(this.ceremonies, MAX_PENDING_CEREMONIES);
    return { ceremonyId: id, options };
  }

  getCeremony(ceremonyId, purpose, origin) {
    const ceremony = this.ceremonies.get(String(ceremonyId || ''));
    if (!ceremony || ceremony.expiresAt <= this.now()) return null;
    if (ceremony.purpose !== purpose || ceremony.origin !== origin) return null;
    return ceremony;
  }

  async registrationOptions(user, request) {
    const { origin, rpID } = getWebAuthnOrigin(request);
    const existing = this.passkeyStore.getCredentialIdsForUser(user.id);
    if (existing.length >= MAX_CREDENTIALS_PER_USER) throw new Error(`An account can have at most ${MAX_CREDENTIALS_PER_USER} passkeys.`);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: String(user.username),
      userDisplayName: String(user.username),
      userID: Buffer.from(String(user.id)),
      attestationType: 'none',
      excludeCredentials: existing,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required'
      }
    });
    return this.saveCeremony(options, { purpose: 'registration', userId: user.id, origin, rpID });
  }

  async verifyRegistration(user, request, ceremonyId, response, name) {
    const { origin } = getWebAuthnOrigin(request);
    const ceremony = this.getCeremony(ceremonyId, 'registration', origin);
    if (!ceremony || ceremony.userId !== user.id) throw new Error('This passkey registration has expired. Start again.');
    this.ceremonies.delete(String(ceremonyId));
    if (!response || typeof response !== 'object') throw new Error('Passkey registration could not be verified.');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: ceremony.origin,
      expectedRPID: ceremony.rpID,
      requireUserVerification: true
    });
    if (!verification.verified || !verification.registrationInfo?.userVerified) throw new Error('Passkey registration could not be verified.');
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    if (!credential) throw new Error('Passkey registration could not be verified.');
    const passkeys = this.passkeyStore.add(user.id, {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp
    }, { name: cleanPasskeyName(name || ceremony.passkeyName) });
    return { success: true, passkeys };
  }

  async authenticationOptions(request, { clientBuild } = {}) {
    const { origin, rpID } = getWebAuthnOrigin(request);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
    return this.saveCeremony(options, {
      purpose: 'authentication', origin, rpID,
      clientBuild: clientBuild && typeof clientBuild === 'object' ? clientBuild : null
    });
  }

  async verifyAuthentication(request, ceremonyId, response, rememberMe = false) {
    const { origin } = getWebAuthnOrigin(request);
    const ceremony = this.getCeremony(ceremonyId, 'authentication', origin);
    if (!ceremony) throw new Error('This passkey sign in has expired. Start again.');
    this.ceremonies.delete(String(ceremonyId));
    if (!response || typeof response !== 'object' || typeof response.id !== 'string') throw new Error('Passkey sign in could not be verified.');
    const passkey = this.passkeyStore.findByCredentialId(response.id);
    if (!passkey) throw new Error('This passkey is not registered with this workspace.');
    const user = this.userStore.users.find((item) => item.id === passkey.userId);
    if (!user || user.mustChangePassword) throw new Error('This passkey cannot sign in to this account.');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: ceremony.origin,
      expectedRPID: ceremony.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: passkey.publicKeyBytes,
        counter: passkey.counter,
        transports: passkey.transports
      },
      requireUserVerification: true
    });
    if (!verification.verified || !verification.authenticationInfo?.userVerified) throw new Error('Passkey sign in could not be verified.');
    this.passkeyStore.updateAuthentication(passkey.credentialId, {
      counter: verification.authenticationInfo.newCounter,
      deviceType: verification.authenticationInfo.credentialDeviceType,
      backedUp: verification.authenticationInfo.credentialBackedUp
    });
    return this.beginAuthenticatedLogin(user.id, rememberMe === true);
  }

  beginAuthenticatedLogin(userId, rememberMe) {
    const result = this.userStore.loginWithPasskey(userId, rememberMe);
    if (!result.replacementPending) return result;
    const pendingId = crypto.randomBytes(24).toString('base64url');
    const pending = {
      userId,
      rememberMe,
      createdAt: this.now(),
      expiresAt: this.now() + PENDING_LOGIN_TTL_MS
    };
    this.pendingLogins.set(pendingId, pending);
    pruneOldest(this.pendingLogins, MAX_PENDING_LOGINS);
    return { replacementPending: true, pendingId, retryAt: result.retryAt };
  }

  continueAuthenticatedLogin(pendingId) {
    const pending = this.pendingLogins.get(String(pendingId || ''));
    if (!pending || pending.expiresAt <= this.now()) throw new Error('This passkey sign in has expired. Start again.');
    const result = this.userStore.loginWithPasskey(pending.userId, pending.rememberMe);
    if (result.replacementPending) return { replacementPending: true, pendingId, retryAt: result.retryAt };
    this.pendingLogins.delete(String(pendingId));
    return result;
  }

  createDesktopFlow({ workspaceOrigin, state, codeChallenge, clientBuild, rememberMe = true, purpose = 'authentication', userId = '', passkeyName = '' }) {
    const origin = getDesktopWorkspaceOrigin(workspaceOrigin);
    if (!PKCE_PATTERN.test(String(state || '')) || !PKCE_PATTERN.test(String(codeChallenge || ''))) {
      throw new Error('The desktop passkey state or verifier challenge is invalid.');
    }
    if (!['authentication', 'registration'].includes(purpose) || (purpose === 'registration' && !userId)) {
      throw new Error('The desktop passkey flow is invalid.');
    }
    const stateHash = digest(state);
    this.prunePending();
    if (this.desktopFlows.has(stateHash)) throw new Error('The desktop passkey flow already exists. Start again from ARC Studio.');
    const now = this.now();
    this.desktopFlows.set(stateHash, {
      stateHash,
      state,
      codeChallenge,
      workspaceOrigin: origin,
      clientBuild: clientBuild && typeof clientBuild === 'object' ? clientBuild : null,
      purpose,
      userId: purpose === 'registration' ? userId : '',
      passkeyName: cleanPasskeyName(passkeyName),
      rememberMe: rememberMe === true,
      createdAt: now,
      expiresAt: now + DESKTOP_FLOW_TTL_MS,
      ceremonyId: null,
      pendingLoginId: null
    });
    pruneOldest(this.desktopFlows, MAX_DESKTOP_FLOWS);
    return {
      state,
      authorizeUrl: `${origin}/?arc_passkey_state=${encodeURIComponent(state)}&arc_passkey_purpose=${purpose}`
    };
  }

  getDesktopFlow(request, state) {
    const flow = this.desktopFlows.get(digest(String(state || '')));
    if (!flow || flow.expiresAt <= this.now()) return null;
    const { origin } = getWebAuthnOrigin(request);
    if (flow.workspaceOrigin !== origin) return null;
    return flow;
  }

  async desktopAuthenticationOptions(request, state) {
    const flow = this.getDesktopFlow(request, state);
    if (!flow || flow.purpose !== 'authentication') throw new Error('This desktop passkey request has expired. Start again from ARC Studio.');
    const ceremony = await this.authenticationOptions(request, { clientBuild: flow.clientBuild });
    flow.ceremonyId = ceremony.ceremonyId;
    return ceremony;
  }

  async desktopRegistrationOptions(request, state, user) {
    const flow = this.getDesktopFlow(request, state);
    if (!flow || flow.purpose !== 'registration' || flow.userId !== user.id) {
      throw new Error('This desktop passkey request has expired. Start again from ARC Studio.');
    }
    const ceremony = await this.registrationOptions(user, request);
    const record = this.ceremonies.get(ceremony.ceremonyId);
    if (record) record.passkeyName = flow.passkeyName;
    flow.ceremonyId = ceremony.ceremonyId;
    return ceremony;
  }

  async completeDesktopAuthentication(request, state, ceremonyId, response) {
    const flow = this.getDesktopFlow(request, state);
    if (!flow || flow.ceremonyId !== ceremonyId || flow.purpose !== 'authentication') {
      throw new Error('This desktop passkey request has expired. Start again from ARC Studio.');
    }
    const login = await this.verifyAuthentication(request, ceremonyId, response, flow.rememberMe);
    if (login.replacementPending) {
      flow.pendingLoginId = login.pendingId;
      return { replacementPending: true, retryAfter: 500 };
    }
    return this.issueDesktopTicket(flow, 'authentication', login);
  }

  async completeDesktopRegistration(request, state, ceremonyId, user, response) {
    const flow = this.getDesktopFlow(request, state);
    if (!flow || flow.purpose !== 'registration' || flow.userId !== user.id || flow.ceremonyId !== ceremonyId) {
      throw new Error('This desktop passkey request has expired. Start again from ARC Studio.');
    }
    const result = await this.verifyRegistration(user, request, ceremonyId, response, flow.passkeyName);
    return this.issueDesktopTicket(flow, 'registration', { passkeys: result.passkeys });
  }

  continueDesktopAuthentication(request, state) {
    const flow = this.getDesktopFlow(request, state);
    if (!flow?.pendingLoginId) throw new Error('This desktop passkey request has expired. Start again from ARC Studio.');
    const login = this.continueAuthenticatedLogin(flow.pendingLoginId);
    if (login.replacementPending) return { replacementPending: true, retryAfter: 500 };
    flow.pendingLoginId = null;
    return this.issueDesktopTicket(flow, 'authentication', login);
  }

  issueDesktopTicket(flow, kind, result) {
    this.prunePending();
    const ticket = crypto.randomBytes(32).toString('base64url');
    this.desktopTickets.set(digest(ticket), {
      stateHash: flow.stateHash,
      codeChallenge: flow.codeChallenge,
      kind,
      ticket,
      result,
      createdAt: this.now(),
      expiresAt: this.now() + DESKTOP_TICKET_TTL_MS
    });
    pruneOldest(this.desktopTickets, MAX_DESKTOP_TICKETS);
    this.desktopFlows.delete(flow.stateHash);
    return {
      success: true,
      callbackUrl: `arcstudio://passkey/callback?state=${encodeURIComponent(flow.state)}&ticket=${encodeURIComponent(ticket)}`
    };
  }

  findDesktopTicket(stateHash) {
    for (const record of this.desktopTickets.values()) {
      if (record.stateHash !== stateHash || record.expiresAt <= this.now()) continue;
      return record;
    }
    return null;
  }

  peekDesktopTicket(state) {
    const stateValue = String(state || '');
    if (!PKCE_PATTERN.test(stateValue)) return null;
    const record = this.findDesktopTicket(digest(stateValue));
    if (!record) return null;
    return { ticket: record.ticket, kind: record.kind, expiresAt: record.expiresAt };
  }

  touchDesktopFlow(state) {
    const stateValue = String(state || '');
    if (!PKCE_PATTERN.test(stateValue)) throw new Error('The desktop passkey state is invalid.');
    const stateHash = digest(stateValue);
    const now = this.now();
    if (this.findDesktopTicket(stateHash)) return { pending: false };
    const flow = this.desktopFlows.get(stateHash);
    if (!flow || flow.expiresAt <= now) return { pending: false };
    flow.browserSeenAt = now;
    return { pending: true, expiresInSeconds: Math.max(1, Math.ceil((flow.expiresAt - now) / 1000)) };
  }

  describeDesktopFlow(state) {
    const stateValue = String(state || '');
    if (!PKCE_PATTERN.test(stateValue)) return { pending: false, expired: true };
    const stateHash = digest(stateValue);
    const now = this.now();
    const ticketRecord = this.findDesktopTicket(stateHash);
    if (ticketRecord) return { pending: false, ticket: ticketRecord.ticket, kind: ticketRecord.kind };
    const flow = this.desktopFlows.get(stateHash);
    if (!flow || flow.expiresAt <= now) return { pending: false, expired: true };
    if (flow.browserSeenAt && now - flow.browserSeenAt > DESKTOP_HEARTBEAT_LIVENESS_MS) {
      return { pending: false, expired: true };
    }
    return { pending: true, expiresInSeconds: Math.max(1, Math.ceil((flow.expiresAt - now) / 1000)) };
  }

  redeemDesktopTicket({ state, ticket, codeVerifier }) {
    if (!PKCE_PATTERN.test(String(state || ''))
      || !PKCE_PATTERN.test(String(codeVerifier || ''))
      || !TICKET_PATTERN.test(String(ticket || ''))) {
      throw new Error('This desktop passkey response is invalid. Start again from ARC Studio.');
    }
    const ticketHash = digest(ticket);
    const record = this.desktopTickets.get(ticketHash);
    if (!record || record.expiresAt <= this.now()
      || !safeEqual(record.stateHash, digest(state))
      || !safeEqual(record.codeChallenge, digest(codeVerifier))) {
      throw new Error('This desktop passkey response is invalid or has expired. Start again from ARC Studio.');
    }
    this.desktopTickets.delete(ticketHash);
    return { kind: record.kind, ...record.result };
  }
}

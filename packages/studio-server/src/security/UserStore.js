import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { serverConfig } from '../config.js';
import { dataDir } from '../storage.js';
//
export const RolePermissions = Object.freeze({
  admin: ['*'],
  editor: ['graphs:read', 'graphs:write', 'simulation:run', 'logs:read'],
  operator: ['graphs:read', 'bot:control', 'emojis:upload', 'simulation:run', 'logs:read'],
  viewer: ['graphs:read', 'logs:read']
});
export const WorkspacePermissions = Object.freeze([...new Set(Object.values(RolePermissions).flat().filter((permission) => permission !== '*'))]);

export class UserStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.dataPath = options.dataPath || path.join(dataDir, 'users.json');
    this.users = [];
    this.setupCompleted = false;
    this.workspaceName = serverConfig.desktopMode ? 'Local Workspace' : 'ARC Studio Workspace';
    this.sessions = new Map(); // token -> { userId, expiresAt }
    this.pendingSessionReplacements = new Map();
    this.sessionDurationMs = 24 * 60 * 60 * 1000; // 24h
    this.rememberedSessionDurationMs = 30 * 24 * 60 * 60 * 1000; // 30d

    this.ensureDataFile();
    this.loadState();
    this.invalidateSessionsOnStartup();
  }

  invalidateSessionsOnStartup() {
    if (!this.users.length) return;
    const now = Date.now();
    let changed = false;
    for (const user of this.users) {
      if (serverConfig.desktopMode && user.activeSessionRememberMe === true
        && user.activeSessionId && Number(user.activeSessionExpiresAt) > now) continue;
      user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
      delete user.activeSessionId;
      delete user.activeSessionExpiresAt;
      delete user.activeSessionRememberMe;
      changed = true;
    }
    this.sessions.clear();
    if (changed) this.saveState();
  }

  ensureDataFile() {
    const dir = path.dirname(this.dataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dataPath)) {
      const initialData = {
        setupCompleted: false,
        users: []
      };
      fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2), { mode: 0o600 });
    }
  }

  loadState() {
    try {
      const content = fs.readFileSync(this.dataPath, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        this.users = data;
        this.setupCompleted = data.length > 0;
      } else {
        this.users = data.users || [];
        this.setupCompleted = Boolean(data.setupCompleted);
        if (!serverConfig.desktopMode && typeof data.workspaceName === 'string' && data.workspaceName.trim()) {
          this.workspaceName = data.workspaceName.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 35) || 'ARC Studio Workspace';
        }
      }
      if (serverConfig.desktopMode && this.setupCompleted && !this.hasLocalAccount()) {
        const legacyOwner = this.users.find((user) => user.role === 'admin' && user.isPrimaryAdmin === undefined);
        if (legacyOwner) legacyOwner.isPrimaryAdmin = true;
      }
    } catch {
      this.users = [];
      this.setupCompleted = false;
    }
  }

  saveState() {
    const payload = {
      setupCompleted: this.setupCompleted,
      workspaceName: serverConfig.desktopMode ? 'Local Workspace' : this.workspaceName,
      users: this.users
    };
    fs.writeFileSync(this.dataPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  }

  isSetupCompleted() {
    if (serverConfig.desktopMode) return this.hasLocalAccount();
    return this.setupCompleted && this.users.length > 0;
  }

  hasLocalAccount() {
    return this.users.some((user) => user.isPrimaryAdmin === true);
  }

  getLocalAccount() {
    return this.users.find((user) => user.isPrimaryAdmin === true) || null;
  }

  hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  verifyPassword(password, user) {
    const hash = this.hashPassword(password, user.salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
  }

  getSessionDuration(rememberMe = false) {
    return rememberMe ? this.rememberedSessionDurationMs : this.sessionDurationMs;
  }

  generateToken(userId, rememberMe = false, nonce = crypto.randomBytes(16).toString('hex')) {
    const timestamp = Date.now();
    const user = this.users.find((item) => item.id === userId);
    const authVersion = Number.isInteger(user?.authVersion) ? user.authVersion : 0;
    const payload = `${userId}:${timestamp}:${nonce}:${rememberMe ? '1' : '0'}:${authVersion}`;
    const hmac = crypto.createHmac('sha256', serverConfig.sessionSecret).update(payload).digest('hex');
    return `${Buffer.from(payload).toString('base64url')}.${hmac}`;
  }

  createSession(user, rememberMe = false) {
    const now = Date.now();
    const duration = this.getSessionDuration(rememberMe);
    const sessionId = crypto.randomBytes(16).toString('hex');
    user.activeSessionId = sessionId;
    user.activeSessionExpiresAt = now + duration;
    user.activeSessionRememberMe = rememberMe === true;
    for (const [token, session] of this.sessions) {
      if (session.userId === user.id) this.sessions.delete(token);
    }
    const token = this.generateToken(user.id, rememberMe, sessionId);
    this.sessions.set(token, {
      userId: user.id,
      authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0,
      sessionId,
      expiresAt: user.activeSessionExpiresAt
    });
    this.saveState();
    return token;
  }

  endSession(token) {
    const session = this.sessions.get(token);
    let sessionId = session?.sessionId || null;
    if (!sessionId && token?.includes('.')) {
      try { sessionId = Buffer.from(token.split('.')[0], 'base64url').toString('utf8').split(':')[2] || null; } catch {}
    }
    const userId = session?.userId || (token?.includes('.') ? (() => {
      try { return Buffer.from(token.split('.')[0], 'base64url').toString('utf8').split(':')[0] || null; } catch { return null; }
    })() : null);
    this.sessions.delete(token);
    const user = this.users.find((item) => item.id === userId);
    if (user && sessionId && user.activeSessionId === sessionId) {
      user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
      delete user.activeSessionId;
      delete user.activeSessionExpiresAt;
      delete user.activeSessionRememberMe;
      for (const [existingToken, existingSession] of this.sessions) {
        if (existingSession.userId === user.id) this.sessions.delete(existingToken);
      }
      this.saveState();
    }
  }

  completeFirstTimeSetup({ masterKey, username, password, workspaceName, rememberMe = false }) {
    if (this.isSetupCompleted()) {
      throw new Error('Initial setup has already been completed.');
    }

    if (!masterKey || masterKey.trim() !== serverConfig.setupKey) {
      throw new Error('Invalid master setup key.');
    }

    return this.createPrimaryAdmin({ username, password, workspaceName, rememberMe });
  }

  completeDesktopSetup({ username, password, rememberMe = false }) {
    if (!serverConfig.desktopMode) {
      throw new Error('Local desktop setup is available only in the desktop app.');
    }
    if (this.hasLocalAccount()) {
      throw new Error('Initial setup has already been completed.');
    }

    return this.createPrimaryAdmin({ username: username || 'Admin', password, workspaceName: 'Local Workspace', rememberMe });
  }

  createPrimaryAdmin({ username, password, workspaceName, rememberMe = false }) {
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const cleanUser = String(username || 'Admin').trim().toLowerCase();
    if (cleanUser.length < 2 || cleanUser.length > 32 || /[\u0000-\u001f\u007f]/.test(cleanUser)) {
      throw new Error('Username must be 2 to 32 characters and cannot contain control characters.');
    }
    const matchingDesktopUser = serverConfig.desktopMode
      ? this.users.find((user) => String(user.username || '').toLowerCase() === cleanUser)
      : null;
    if (!serverConfig.desktopMode && this.users.some((user) => String(user.username || '').toLowerCase() === cleanUser)) {
      throw new Error(`User "${cleanUser}" already exists.`);
    }

    if (!serverConfig.desktopMode) {
      const cleanWorkspaceName = String(workspaceName || '').trim();
      if (cleanWorkspaceName.length < 2 || cleanWorkspaceName.length > 35 || !/^[A-Za-z0-9][A-Za-z0-9 _-]{1,34}$/.test(cleanWorkspaceName)) {
        throw new Error('Workspace name must be 2 to 35 characters and use only letters, numbers, spaces, hyphens, or underscores.');
      }
      this.workspaceName = cleanWorkspaceName;
    } else {
      this.workspaceName = 'Local Workspace';
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const primaryAdmin = {
      id: matchingDesktopUser?.id || `admin_${Date.now()}`,
      username: cleanUser,
      salt,
      passwordHash: this.hashPassword(password, salt),
      role: 'admin',
      permissions: ['*'],
      isPrimaryAdmin: true,
      authVersion: (Number(matchingDesktopUser?.authVersion) || 0) + (matchingDesktopUser ? 1 : 0),
      createdAt: matchingDesktopUser?.createdAt || new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    this.users = serverConfig.desktopMode
      ? [...this.users.filter((user) => String(user.username || '').toLowerCase() !== cleanUser), primaryAdmin]
      : [primaryAdmin];
    this.setupCompleted = true;
    this.saveState();

    const sessionToken = this.createSession(primaryAdmin, rememberMe);

    const { salt: _, passwordHash: __, activeSessionId: ___, activeSessionExpiresAt: ____, activeSessionRememberMe: _____, ...publicProfile } = primaryAdmin;
    return { token: sessionToken, user: publicProfile };
  }

  createUser({ username, password, role = 'editor', mustChangePassword = false }) {
    if (!this.isSetupCompleted()) {
      throw new Error('First-time setup must be completed first.');
    }

    const cleanUser = username.trim().toLowerCase();
    if (this.users.some((u) => u.username.toLowerCase() === cleanUser)) {
      throw new Error(`User "${cleanUser}" already exists.`);
    }

    if (!RolePermissions[role]) {
      throw new Error(`Invalid role "${role}". Supported: ${Object.keys(RolePermissions).join(', ')}`);
    }

    if (typeof mustChangePassword !== 'boolean') {
      throw new Error('The require password change option must be true or false.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const newUser = {
      id: `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      username: cleanUser,
      salt,
      passwordHash: this.hashPassword(password, salt),
      role,
      permissions: RolePermissions[role],
      isPrimaryAdmin: false,
      mustChangePassword,
      authVersion: 0,
      createdAt: new Date().toISOString()
    };

    this.users.push(newUser);
    this.saveState();

    const { salt: _, passwordHash: __, ...publicProfile } = newUser;
    return publicProfile;
  }

  login(username, password, rememberMe = false) {
    if (!this.isSetupCompleted()) {
      throw new Error('Setup has not been completed. Please run first-time setup.');
    }

    const user = this.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) {
      throw new Error('Invalid username or password.');
    }

    if (!this.verifyPassword(password, user)) {
      const error = new Error('Invalid username or password.');
      if (user.isPrimaryAdmin === true) error.ownerPasswordIncorrect = true;
      throw error;
    }

    return this.createAuthenticatedSession(user, rememberMe);
  }

  loginWithPasskey(userId, rememberMe = false) {
    if (!this.isSetupCompleted()) throw new Error('Setup has not been completed. Please run first-time setup.');
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('Invalid passkey.');
    if (user.mustChangePassword) throw new Error('Change your password before signing in with a passkey.');
    return this.createAuthenticatedSession(user, rememberMe);
  }

  createAuthenticatedSession(user, rememberMe = false) {
    if (user.activeSessionId && Number(user.activeSessionExpiresAt) > Date.now()) {
      let pending = this.pendingSessionReplacements.get(user.id);
      if (!pending) {
        const requestId = crypto.randomUUID();
        const expiresAt = Date.now() + 5000;
        pending = { requestId, expiresAt, timer: null };
        pending.timer = setTimeout(() => this.finishSessionReplacement(user.id, requestId), expiresAt - Date.now());
        pending.timer.unref?.();
        this.pendingSessionReplacements.set(user.id, pending);
        this.emit('sessionReplacementPending', { userId: user.id, expiresAt });
      } else if (Date.now() >= pending.expiresAt) {
        this.finishSessionReplacement(user.id, pending.requestId);
      }
      if (user.activeSessionId) return { replacementPending: true, requestId: pending.requestId, retryAt: pending.expiresAt };
    }
    delete user.activeSessionId;
    delete user.activeSessionExpiresAt;
    delete user.activeSessionRememberMe;

    user.lastLoginAt = new Date().toISOString();
    this.saveState();

    const sessionToken = this.createSession(user, rememberMe);

    const { salt: _, passwordHash: __, activeSessionId: ___, activeSessionExpiresAt: ____, activeSessionRememberMe: _____, ...profile } = user;
    return { token: sessionToken, user: profile };
  }

  finishSessionReplacement(userId, requestId) {
    const pending = this.pendingSessionReplacements.get(userId);
    if (!pending || pending.requestId !== requestId) return false;
    clearTimeout(pending.timer);
    this.pendingSessionReplacements.delete(userId);
    const user = this.users.find((item) => item.id === userId);
    if (!user?.activeSessionId) return false;
    user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
    delete user.activeSessionId;
    delete user.activeSessionExpiresAt;
    delete user.activeSessionRememberMe;
    for (const [token, session] of this.sessions) if (session.userId === userId) this.sessions.delete(token);
    this.saveState();
    this.emit('sessionReplaced', { userId });
    return true;
  }

  expireUserSession(userId, reason = 'idle') {
    const user = this.users.find((item) => item.id === userId);
    if (!user || !user.activeSessionId) return false;
    user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
    delete user.activeSessionId;
    delete user.activeSessionExpiresAt;
    delete user.activeSessionRememberMe;
    for (const [token, session] of this.sessions) if (session.userId === userId) this.sessions.delete(token);
    this.saveState();
    this.emit('sessionExpired', { userId, reason });
    return true;
  }
//
  validateSession(token) {
    if (!token) return null;

    let signedPayload = null;
    if (token.includes('.')) {
      try {
        const [payloadB64, signature] = token.split('.');
        signedPayload = Buffer.from(payloadB64, 'base64url').toString('utf8');
        const expectedSig = crypto.createHmac('sha256', serverConfig.sessionSecret).update(signedPayload).digest('hex');
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expectedSig, 'hex');
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          return null;
        }
      } catch {
        return null;
      }
    }

    let session = this.sessions.get(token);
    if (!session && signedPayload) {
      const [userId, issuedAtRaw, nonce, rememberFlag, authVersionRaw] = signedPayload.split(':');
      const tokenAuthVersion = authVersionRaw === undefined ? 0 : Number(authVersionRaw);
      const issuedAt = Number(issuedAtRaw);
      const rememberMe = rememberFlag === '1';
      const expiresAt = issuedAt + this.getSessionDuration(rememberMe);
      if (!userId || !nonce || !Number.isFinite(issuedAt) || issuedAt > Date.now() || Date.now() > expiresAt) return null;
      const tokenUser = this.users.find((user) => user.id === userId);
      if (!tokenUser || tokenAuthVersion !== (Number.isInteger(tokenUser.authVersion) ? tokenUser.authVersion : 0)) return null;
      session = { userId, authVersion: tokenAuthVersion, sessionId: nonce, expiresAt, rememberMe };
      this.sessions.set(token, session);
    }
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }

    const user = this.users.find((u) => u.id === session.userId);
    if (!user) return null;

    const sessionAuthVersion = Number.isInteger(session.authVersion) ? session.authVersion : 0;
    if (sessionAuthVersion !== (Number.isInteger(user.authVersion) ? user.authVersion : 0)) return null;

    if (!user.activeSessionId && session.sessionId) {
      user.activeSessionId = session.sessionId;
      user.activeSessionExpiresAt = session.expiresAt;
      user.activeSessionRememberMe = session.rememberMe === true;
      this.saveState();
    }
    if (!session.sessionId || user.activeSessionId !== session.sessionId) return null;

    const { salt: _, passwordHash: __, activeSessionId: ___, activeSessionExpiresAt: ____, activeSessionRememberMe: _____, ...profile } = user;
    return profile;
  }

  listUsers() {
    return this.users.map(({ salt, passwordHash, activeSessionId, activeSessionExpiresAt, activeSessionRememberMe, ...safe }) => ({
      ...safe,
      hasActiveSession: Boolean(activeSessionId && activeSessionExpiresAt > Date.now())
    }));
  }

  setActiveProject(userId, projectId) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found.');
    user.activeProjectId = projectId;
    this.saveState();
    const { salt, passwordHash, activeSessionId, activeSessionExpiresAt, activeSessionRememberMe, ...profile } = user;
    return profile;
  }

  resetPassword(userId, password, { requireChange = true } = {}) {
    if (typeof password !== 'string' || password.length < 6) throw new Error('Password must be at least 6 characters.');
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found.');
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.passwordHash = this.hashPassword(password, salt);
    user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
    delete user.activeSessionId;
    delete user.activeSessionExpiresAt;
    delete user.activeSessionRememberMe;
    user.mustChangePassword = requireChange;
    this.saveState();
    const { salt: _salt, passwordHash: _passwordHash, ...profile } = user;
    return profile;
  }

  updateUserPermissions(userId, requestedPermissions, { actorUserId } = {}) {
    if (!Array.isArray(requestedPermissions)) throw new Error('Choose a valid set of permissions.');
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found.');
    if (user.isPrimaryAdmin) throw new Error('The primary workspace owner permissions cannot be changed.');
    if (actorUserId && actorUserId === userId) throw new Error('You cannot change your own permissions.');
    const selected = [...new Set(requestedPermissions)];
    const invalid = selected.find((permission) => !WorkspacePermissions.includes(permission));
    if (invalid) throw new Error(`Invalid permission "${invalid}".`);

    const normalized = selected.length === WorkspacePermissions.length
      ? ['*']
      : selected.sort();
    const matchesRole = Object.entries(RolePermissions)
      .find(([, permissions]) => permissions.length === normalized.length && permissions.every((permission) => normalized.includes(permission)));
    user.permissions = normalized;
    user.role = matchesRole?.[0] || 'custom';
    this.saveState();
    const { salt: _, passwordHash: __, activeSessionId: ___, activeSessionExpiresAt: ____, activeSessionRememberMe: _____, ...profile } = user;
    profile.hasActiveSession = Boolean(user.activeSessionId && user.activeSessionExpiresAt > Date.now());
    this.emit('permissionsUpdated', { user: profile });
    return profile;
  }

  revokeUserSession(userId) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found.');
    if (user.isPrimaryAdmin) throw new Error('The primary workspace owner session cannot be revoked from Team access.');
    if (!user.activeSessionId) return false;
    user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
    delete user.activeSessionId;
    delete user.activeSessionExpiresAt;
    delete user.activeSessionRememberMe;
    for (const [token, session] of this.sessions) if (session.userId === user.id) this.sessions.delete(token);
    this.saveState();
    this.emit('sessionRevoked', { userId: user.id });
    return true;
  }

  changePassword(userId, password) {
    const user = this.users.find((item) => item.id === userId);
    if (!user) throw new Error('User not found.');
    if (typeof password !== 'string' || password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (user.mustChangePassword && this.verifyPassword(password, user)) {
      throw new Error('Choose a password different from your current password.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.passwordHash = this.hashPassword(password, salt);
    user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
    user.mustChangePassword = false;
    delete user.activeSessionId;
    delete user.activeSessionExpiresAt;
    delete user.activeSessionRememberMe;
    this.saveState();
    const { salt: _salt, passwordHash: _passwordHash, ...profile } = user;
    return profile;
  }

  renamePrimaryAdmin(userId, username) {
    const user = this.users.find((item) => item.id === userId);
    if (!user || user.isPrimaryAdmin !== true) throw new Error('Only the primary workspace owner can rename this account.');

    const cleanUser = String(username ?? '').trim().toLowerCase();
    if (cleanUser.length < 2 || cleanUser.length > 32 || /[\u0000-\u001f\u007f]/.test(cleanUser)) {
      throw new Error('Username must be 2 to 32 characters and cannot contain control characters.');
    }
    if (this.users.some((item) => item.id !== user.id && String(item.username || '').toLowerCase() === cleanUser)) {
      throw new Error(`Username "${cleanUser}" is already in use.`);
    }

    const lastChangedAt = Date.parse(user.usernameChangedAt || '');
    const availableAt = Number.isFinite(lastChangedAt) ? lastChangedAt + 10 * 60 * 1000 : 0;
    if (cleanUser !== String(user.username || '').toLowerCase() && Date.now() < availableAt) {
      const error = new Error('You can rename the owner account once every 10 minutes.');
      error.retryAfterMs = availableAt - Date.now();
      error.availableAt = availableAt;
      throw error;
    }

    const changed = cleanUser !== String(user.username || '').toLowerCase();
    if (changed) {
      user.username = cleanUser;
      user.usernameChangedAt = new Date().toISOString();
      this.saveState();
    }
    const { salt: _salt, passwordHash: _passwordHash, activeSessionId: _activeSessionId, activeSessionExpiresAt: _activeSessionExpiresAt, activeSessionRememberMe: _activeSessionRememberMe, ...profile } = user;
    if (changed) this.emit('usernameUpdated', { user: profile });
    return { user: profile, changed, availableAt: changed ? Date.parse(user.usernameChangedAt) + 10 * 60 * 1000 : availableAt };
  }

  deleteUser(id) {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    if (this.users[idx].isPrimaryAdmin) throw new Error('Cannot delete the primary administrator account');
    this.users.splice(idx, 1);
    for (const [token, session] of this.sessions) if (session.userId === id) this.sessions.delete(token);
    this.saveState();
  }
}

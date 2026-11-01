import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../storage.js';

const MAX_PASSKEYS_PER_USER = 20;
const CREDENTIAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,2048}$/;
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{1,8192}$/;
const VALID_TRANSPORTS = new Set(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);
//
function safeLabel(value) {
  return String(value || 'Passkey')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 64) || 'Passkey';
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object'
    || typeof record.userId !== 'string'
    || typeof record.credentialId !== 'string'
    || !CREDENTIAL_ID_PATTERN.test(record.credentialId)
    || typeof record.publicKey !== 'string'
    || !PUBLIC_KEY_PATTERN.test(record.publicKey)
    || !Number.isSafeInteger(record.counter) || record.counter < 0) return null;
  return {
    recordId: typeof record.recordId === 'string' && /^[a-f0-9-]{36}$/i.test(record.recordId) ? record.recordId : crypto.randomUUID(),
    userId: record.userId,
    credentialId: record.credentialId,
    publicKey: record.publicKey,
    counter: record.counter,
    transports: Array.isArray(record.transports) ? [...new Set(record.transports.filter((item) => VALID_TRANSPORTS.has(item)))].slice(0, 8) : [],
    deviceType: record.deviceType === 'singleDevice' ? 'singleDevice' : 'multiDevice',
    backedUp: record.backedUp === true,
    name: safeLabel(record.name),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
    lastUsedAt: typeof record.lastUsedAt === 'string' ? record.lastUsedAt : null
  };
}

export class PasskeyStore {
  constructor({ filePath = path.join(dataDir, 'webauthn-credentials.json') } = {}) {
    this.filePath = path.resolve(filePath);
    this.credentials = new Map();
    this.load();
  }

  load() {
    if (!fs.existsSync(this.filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed)) throw new TypeError('Passkey credential storage is invalid.');
    const normalized = parsed.map(normalizeRecord);
    if (normalized.some((record) => !record)) throw new TypeError('Passkey credential storage contains an invalid record.');
    for (const record of normalized) {
      if (this.credentials.has(record.credentialId)) throw new TypeError('Passkey credential storage contains a duplicate credential.');
      this.credentials.set(record.credentialId, record);
    }
  }

  save() {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(directory, 0o700); } catch {}
    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify([...this.credentials.values()], null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      fs.chmodSync(temporaryPath, 0o600);
      fs.renameSync(temporaryPath, this.filePath);
      fs.chmodSync(this.filePath, 0o600);
    } finally {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
  }

  listForUser(userId) {
    return [...this.credentials.values()]
      .filter((credential) => credential.userId === userId)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
      .map(({ recordId, name, createdAt, lastUsedAt, deviceType, backedUp, transports }) => ({
        id: recordId, name, createdAt, lastUsedAt, deviceType, backedUp, transports: [...transports]
      }));
  }

  getCredentialIdsForUser(userId) {
    return [...this.credentials.values()]
      .filter((credential) => credential.userId === userId)
      .map((credential) => ({ id: credential.credentialId, transports: [...credential.transports] }));
  }

  findByCredentialId(credentialId) {
    const record = this.credentials.get(String(credentialId || ''));
    return record ? {
      ...record,
      publicKeyBytes: Buffer.from(record.publicKey, 'base64url'),
      transports: [...record.transports]
    } : null;
  }

  add(userId, credential, { name } = {}) {
    if (typeof userId !== 'string' || !userId) throw new TypeError('A user ID is required for a passkey.');
    const credentialId = String(credential?.id || '');
    const publicKeyBytes = Buffer.from(credential?.publicKey || []);
    const counter = Number(credential?.counter);
    if (!CREDENTIAL_ID_PATTERN.test(credentialId)
      || publicKeyBytes.length < 32 || publicKeyBytes.length > 4096
      || !Number.isSafeInteger(counter) || counter < 0) {
      throw new TypeError('The verified passkey credential is invalid.');
    }
    if (this.credentials.has(credentialId)) throw new Error('This passkey is already registered.');
    if (this.listForUser(userId).length >= MAX_PASSKEYS_PER_USER) throw new Error(`An account can have at most ${MAX_PASSKEYS_PER_USER} passkeys.`);
    const record = {
      recordId: crypto.randomUUID(),
      userId,
      credentialId,
      publicKey: publicKeyBytes.toString('base64url'),
      counter,
      transports: Array.isArray(credential.transports) ? [...new Set(credential.transports.filter((item) => VALID_TRANSPORTS.has(item)))].slice(0, 8) : [],
      deviceType: credential.deviceType === 'singleDevice' ? 'singleDevice' : 'multiDevice',
      backedUp: credential.backedUp === true,
      name: safeLabel(name),
      createdAt: new Date().toISOString(),
      lastUsedAt: null
    };
    this.credentials.set(credentialId, record);
    this.save();
    return this.listForUser(userId);
  }

  updateAuthentication(credentialId, { counter, deviceType, backedUp } = {}) {
    const record = this.credentials.get(String(credentialId || ''));
    if (!record) return false;
    if (!Number.isSafeInteger(counter) || counter < 0) throw new TypeError('The passkey counter is invalid.');
    record.counter = counter;
    record.deviceType = deviceType === 'singleDevice' ? 'singleDevice' : 'multiDevice';
    record.backedUp = backedUp === true;
    record.lastUsedAt = new Date().toISOString();
    this.save();
    return true;
  }

  removeForUser(userId, recordId) {
    const entry = [...this.credentials.entries()].find(([, record]) => record.userId === userId && record.recordId === recordId);
    if (!entry) return false;
    this.credentials.delete(entry[0]);
    this.save();
    return true;
  }

  removeUser(userId) {
    let changed = false;
    for (const [credentialId, record] of this.credentials) {
      if (record.userId !== userId) continue;
      this.credentials.delete(credentialId);
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }
}
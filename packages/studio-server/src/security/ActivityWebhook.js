import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../storage.js';
import { serverConfig } from '../config.js';
import { CryptoEngine } from './CryptoEngine.js';

const settingsPath = path.join(dataDir, 'activity-webhook.json');
const WEBHOOK_AAD = 'arc-activity-webhook-v1';
const MAX_QUEUE_SIZE = 250;
const MIN_SEND_INTERVAL_MS = 1000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
//
function parseWebhookUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Enter a valid Discord webhook URL.');
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Enter a valid Discord webhook URL.'); }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(host)
    || url.username || url.password || url.port || url.hash
    || parts.length !== 4 || parts[0] !== 'api' || parts[1] !== 'webhooks' || !parts[2] || !parts[3]) {
    throw new Error('Enter a valid Discord webhook URL from discord.com.');
  }
  return url.href;
}

function cleanText(value, limit = 256) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/https?:\/\/\S+/gi, '[link]').trim().slice(0, limit) || 'Unknown';
}

function actorAvatarUrl(actor) {
  try {
    const parsed = new URL(String(actor?.avatarUrl || ''));
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href;
  } catch {}
  return '';
}

function embedForActivity(entry) {
  const action = String(entry?.action || '');
  const color = action === 'account.signed_in' ? 0x10b981
    : action === 'account.signed_out' ? 0xef4444
      : 0x3b82f6;
  const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
  const projectName = cleanText(details.projectName || details.projectId, 128);
  const itemName = details.graphName || details.embedName || details.pluginName || details.snapshotName || details.templateName;
  const clientDetails = action === 'account.signed_in'
    ? [details.clientVersion, details.clientPlatform, details.clientArchitecture].filter(Boolean).map((value) => cleanText(value, 64)).join(' · ')
    : '';
  const fields = [];
  if (itemName) fields.push({ name: 'Item', value: cleanText(itemName, 128), inline: true });
  if (clientDetails) fields.push({ name: 'Client', value: clientDetails, inline: true });
  const timestamp = new Date(entry?.timestamp || Date.now());
  const authorAvatarUrl = actorAvatarUrl(entry?.actor);
  return {
    author: {
      name: cleanText(entry?.actor?.username, 128),
      ...(authorAvatarUrl ? { icon_url: authorAvatarUrl } : {})
    },
    description: cleanText(entry?.summary, 2048),
    color,
    ...(fields.length ? { fields } : {}),
    footer: { text: projectName === 'Unknown' ? 'ARC Studio' : `ARC Studio  •  ${projectName}` },
    timestamp: (Number.isNaN(timestamp.getTime()) ? new Date() : timestamp).toISOString()
  };
}

export class ActivityWebhookStore {
  constructor(filePath = settingsPath, environmentUrl = serverConfig.activityWebhookUrl) {
    this.filePath = filePath;
    this.environmentUrl = String(environmentUrl || '').trim();
    this.enabled = null;
    this.encryptedUrl = '';
    this.cachedResolution = null;
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (typeof saved?.enabled === 'boolean') this.enabled = saved.enabled;
      if (typeof saved?.encryptedUrl === 'string' && CryptoEngine.isEncrypted(saved.encryptedUrl)) this.encryptedUrl = saved.encryptedUrl;
    } catch {}
  }

  #environmentUrl() {
    if (!this.environmentUrl) return '';
    try { return parseWebhookUrl(this.environmentUrl); }
    catch { return ''; }
  }

  #workspaceUrl() {
    if (!this.encryptedUrl) return '';
    try {
      const decrypted = CryptoEngine.decrypt(this.encryptedUrl, serverConfig.botTokenEncryptionKey, WEBHOOK_AAD);
      return parseWebhookUrl(decrypted);
    } catch { return ''; }
  }

  #resolve() {
    if (this.cachedResolution) return this.cachedResolution;
    const workspaceUrl = this.#workspaceUrl();
    const environmentUrl = this.#environmentUrl();
    const url = workspaceUrl || environmentUrl;
    this.cachedResolution = {
      url,
      source: workspaceUrl ? 'workspace' : environmentUrl ? 'environment' : 'none',
      configured: Boolean(url),
      environmentConfigured: Boolean(environmentUrl),
      enabled: Boolean(url) && (this.enabled === null ? true : this.enabled)
    };
    return this.cachedResolution;
  }

  settings() {
    const { source, configured, environmentConfigured, enabled } = this.#resolve();
    return { source, configured, environmentConfigured, enabled };
  }

  isEnabled() {
    return this.#resolve().enabled;
  }

  getDeliveryUrl() {
    return this.#resolve().url;
  }

  update(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid activity webhook settings.');
    if (options.enabled !== undefined && typeof options.enabled !== 'boolean') throw new Error('Choose whether activity delivery is enabled.');
    if (options.url !== undefined && typeof options.url !== 'string') throw new Error('Enter a valid Discord webhook URL.');
    if (options.clearUrl === true && String(options.url || '').trim()) throw new Error('Choose a URL or clear the saved URL.');

    const previous = { enabled: this.enabled, encryptedUrl: this.encryptedUrl };
    if (options.clearUrl === true) this.encryptedUrl = '';
    else if (typeof options.url === 'string' && options.url.trim()) {
      const url = parseWebhookUrl(options.url);
      this.encryptedUrl = CryptoEngine.encrypt(url, serverConfig.botTokenEncryptionKey, WEBHOOK_AAD);
      if (this.enabled === null && options.enabled === undefined) this.enabled = true;
    }
    if (typeof options.enabled === 'boolean') this.enabled = options.enabled;
    this.cachedResolution = null;
    try { this.#persist(); }
    catch (error) {
      this.enabled = previous.enabled;
      this.encryptedUrl = previous.encryptedUrl;
      this.cachedResolution = null;
      throw new Error(`Could not save activity webhook settings: ${error.message}`);
    }
    return this.settings();
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify({ enabled: this.enabled, encryptedUrl: this.encryptedUrl }), { mode: 0o600 });
      fs.renameSync(temporaryPath, this.filePath);
      try { fs.chmodSync(this.filePath, 0o600); } catch {}
    } finally {
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    }
  }
}

export class ActivityWebhookDispatcher {
  constructor(store, onStatusChange = () => {}) {
    this.store = store;
    this.onStatusChange = onStatusChange;
    this.queue = [];
    this.timer = null;
    this.sending = false;
    this.nextSendAt = 0;
  }

  enqueue(entry, avatarUrl = '') {
    if (!this.store.isEnabled()) return false;
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      const droppedIndex = this.sending ? 1 : 0;
      const [dropped] = this.queue.splice(droppedIndex, 1);
      this.#setStatus(dropped?.entry, 'failed');
    }
    let safeAvatarUrl = '';
    try {
      const parsedAvatarUrl = new URL(String(avatarUrl || ''));
      if (parsedAvatarUrl.protocol === 'https:' && !parsedAvatarUrl.username && !parsedAvatarUrl.password) safeAvatarUrl = parsedAvatarUrl.href;
    } catch {}
    this.queue.push({ entry, avatarUrl: safeAvatarUrl, failures: 0 });
    this.#setStatus(entry, 'in_progress');
    this.#schedule(0);
    return true;
  }

  settingsChanged() {
    if (!this.store.isEnabled()) {
      clearTimeout(this.timer);
      this.timer = null;
      if (!this.sending) {
        for (const pending of this.queue) this.#setStatus(pending.entry, 'failed');
        this.queue.length = 0;
      }
      return;
    }
    this.#schedule(0);
  }

  #schedule(delay) {
    if (!this.queue.length || this.sending) return;
    clearTimeout(this.timer);
    const wait = Math.max(0, Number(delay) || 0, this.nextSendAt - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.#sendNext();
    }, Math.min(MAX_TIMER_DELAY_MS, wait));
  }

  async #sendNext() {
    if (this.sending) return;
    if (this.nextSendAt > Date.now()) {
      this.#schedule(this.nextSendAt - Date.now());
      return;
    }
    if (!this.store.isEnabled()) { this.queue.length = 0; return; }
    const pending = this.queue[0];
    if (!pending) return;
    this.sending = true;
    let nextDelay = MIN_SEND_INTERVAL_MS;
    try {
      const response = await fetch(this.storeUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'ARC Studio',
          ...(pending.avatarUrl ? { avatar_url: pending.avatarUrl } : {}),
          embeds: [embedForActivity(pending.entry)],
          allowed_mentions: { parse: [] }
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000)
      });
      if (response.status === 429) {
        const body = await response.json().catch(() => null);
        const retryAfter = Math.max(
          Number(response.headers.get('retry-after')) || 0,
          Number(body?.retry_after) || 0,
          1
        );
        nextDelay = Math.ceil(retryAfter * 1000);
        this.nextSendAt = Math.max(this.nextSendAt, Date.now() + nextDelay);
      } else if (response.ok) {
        this.queue.shift();
        this.#setStatus(pending.entry, 'success');
        this.nextSendAt = Date.now() + MIN_SEND_INTERVAL_MS;
      } else if (response.status >= 500 && pending.failures < 2) {
        pending.failures += 1;
        nextDelay = 3000 * pending.failures;
      } else {
        this.queue.shift();
        this.#setStatus(pending.entry, 'failed');
      }
    } catch {
      if (pending.failures < 2) {
        pending.failures += 1;
        nextDelay = 3000 * pending.failures;
      } else {
        this.queue.shift();
        this.#setStatus(pending.entry, 'failed');
      }
    } finally {
      this.sending = false;
      if (!this.store.isEnabled()) {
        for (const queued of this.queue) this.#setStatus(queued.entry, 'failed');
        this.queue.length = 0;
      }
      else this.#schedule(nextDelay);
    }
  }

  storeUrl() {
    return this.store.getDeliveryUrl();
  }

  #setStatus(entry, status) {
    try { this.onStatusChange(entry?.id, status, entry); } catch {}
  }
}

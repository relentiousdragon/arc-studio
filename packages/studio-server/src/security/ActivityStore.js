import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from '../storage.js';

const activityPath = path.join(dataDir, 'activity.json');
const MAX_ENTRIES = 5000;
//
export class ActivityStore {
  constructor(filePath = activityPath) {
    this.filePath = filePath;
    this.entries = [];
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.entries = Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
      let changed = false;
      for (const entry of this.entries) {
        if (entry?.webhookDelivery === 'in_progress') {
          entry.webhookDelivery = 'failed';
          changed = true;
        }
      }
      if (changed) {
        try { this.persist(); } catch {}
      }
    } catch {
      this.entries = [];
    }
  }

  record(user, action, summary, details = {}) {
    let avatarUrl = '';
    try {
      const avatar = new URL(String(user?.avatar || ''));
      if (avatar.protocol === 'https:' && !avatar.username && !avatar.password && avatar.href.length <= 2048) avatarUrl = avatar.href;
    } catch {}
    const entry = {
      id: `activity_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      actor: {
        id: String(user?.id || ''),
        username: String(user?.username || 'Unknown'),
        ...(avatarUrl ? { avatarUrl } : {})
      },
      action: String(action).slice(0, 48),
      summary: String(summary).slice(0, 240),
      details
    };
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, MAX_ENTRIES);
    this.persist();
    return entry;
  }

  updateWebhookStatus(entryId, status) {
    if (!['in_progress', 'success', 'failed'].includes(status)) return false;
    const entry = this.entries.find((item) => item.id === entryId);
    if (!entry) return false;
    entry.webhookDelivery = status;
    this.persist();
    return true;
  }

  importLegacyEntries(entries) {
    if (this.entries.length || !Array.isArray(entries)) return false;
    this.entries = entries.slice(0, MAX_ENTRIES).map((entry) => entry?.webhookDelivery === 'in_progress'
      ? { ...entry, webhookDelivery: 'failed' }
      : entry);
    if (this.entries.length) this.persist();
    return this.entries.length > 0;
  }

  list(limit = 100) {
    return this.entries.slice(0, Math.max(1, Math.min(250, Number(limit) || 100)));
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.entries), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    try { fs.chmodSync(this.filePath, 0o600); } catch {}
  }
}

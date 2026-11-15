import fs from 'node:fs';
import path from 'node:path';
import { logsDir } from '../storage.js';
//
export class Logger {
  /**
   * @param {object} [options]
   * @param {string} [options.logsDir]
   * @param {number|string} [options.retentionDays=7] - 7 default, up to 30 or 'forever' / 0
   * @param {string} [options.filePrefix='arc-studio-']
   * @param {boolean} [options.writeConsole=true]
   */
  constructor(options = {}) {
    this.logsDir = options.logsDir || logsDir;
    this.retentionDays = options.retentionDays ?? (process.env.LOG_RETENTION_DAYS || 7);
    this.filePrefix = options.filePrefix || 'arc-studio-';
    this.writeConsole = options.writeConsole ?? true;
    this.listeners = new Set();

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    this.redactRetainedMessageContent();
    this.currentDate = this.getDateString();
    this.currentLogPath = this.getLogFilePath(this.currentDate);
    this.writeStream = fs.createWriteStream(this.currentLogPath, { flags: 'a', mode: 0o600 });
    this.writeStream.on('error', () => {});

    this.pruneOldLogs();
  }

  getDateString(date = new Date()) {
    return date.toISOString().split('T')[0];
  }

  getLogFilePath(dateStr) {
    return path.join(this.logsDir, `${this.filePrefix}${dateStr}.log`);
  }

  setProjectScope(logsDir, retentionDays = null, filePrefix = null) {
    const nextDir = path.resolve(logsDir);
    const nextRetention = retentionDays ?? (process.env.LOG_RETENTION_DAYS || 7);
    const nextPrefix = filePrefix || this.filePrefix;
    if (this.logsDir === nextDir && String(this.retentionDays) === String(nextRetention) && this.filePrefix === nextPrefix) return;
    this.writeStream?.end();
    this.logsDir = nextDir;
    this.retentionDays = nextRetention;
    this.filePrefix = nextPrefix;
    fs.mkdirSync(this.logsDir, { recursive: true, mode: 0o700 });
    this.redactRetainedMessageContent();
    this.currentDate = this.getDateString();
    this.currentLogPath = this.getLogFilePath(this.currentDate);
    this.writeStream = fs.createWriteStream(this.currentLogPath, { flags: 'a', mode: 0o600 });
    this.writeStream.on('error', () => {});
    this.pruneOldLogs();
  }

  checkDateRollover() {
    const today = this.getDateString();
    if (today !== this.currentDate) {
      this.currentDate = today;
      if (this.writeStream) {
        this.writeStream.end();
      }
      this.currentLogPath = this.getLogFilePath(this.currentDate);
      this.writeStream = fs.createWriteStream(this.currentLogPath, { flags: 'a', mode: 0o600 });
      this.writeStream.on('error', () => {});
      this.pruneOldLogs();
    }
  }

  onLog(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(callback) {
    if (!this.writeStream) { callback?.(); return; }
    this.writeStream.end(callback);
    this.writeStream = null;
  }

  redactRetainedMessageContent() {
    try {
      for (const file of fs.readdirSync(this.logsDir)) {
        if (!file.endsWith('.log')) continue;
        if (this.filePrefix && !file.startsWith(this.filePrefix)) continue;
        const filePath = path.join(this.logsDir, file);
        const original = fs.readFileSync(filePath, 'utf8');
        const records = original.split(/(?=^\[[^\r\n]+\]\s+\[[A-Z]+\s*\]\s+)/m);
        const sanitized = records.map((record) => record.replace(
          /^(\[[^\]\r\n]+\]\s+\[[A-Z]+\s*\]\s+)Message received from [^:\r\n]+: [\s\S]*$/,
          '$1Message event received.\n'
        )).join('');
        if (sanitized !== original) fs.writeFileSync(filePath, sanitized, { mode: 0o600 });
      }
    } catch (error) {
      console.error('Could not redact message content from retained logs:', error.message);
    }
  }

  log(level, message, meta = null) {
    this.checkDateRollover();

    const timestamp = new Date().toISOString();
    const cleanLevel = level.toUpperCase();
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      level: cleanLevel,
      message,
      meta
    };

    // console ANSI output
    const colorMap = {
      INFO: '\x1b[36m',     // Cyan
      DEBUG: '\x1b[90m',    // Gray
      WARN: '\x1b[33m',     // Yellow
      ERROR: '\x1b[31m',    // Red
      GATEWAY: '\x1b[35m',  // Magenta
      MOCK: '\x1b[32m',     // Green
      EXECUTION: '\x1b[34m' // Blue
    };
    const color = colorMap[cleanLevel] || '\x1b[37m';
    const reset = '\x1b[0m';
    const timeStr = timestamp.split('T')[1].replace('Z', '');
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';

    if (this.writeConsole) {
      console.log(`\x1b[90m[${timeStr}]\x1b[0m ${color}[${cleanLevel}]${reset} ${message}${metaStr}`);
    }

    const fileLine = `[${timestamp}] [${cleanLevel}] ${message}${metaStr}\n`;
    if (this.writeStream) {
      this.writeStream.write(fileLine);
    }

    // WebSocket broadcaster
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {}
    }

    return entry;
  }

  info(msg, meta) { return this.log('INFO', msg, meta); }
  debug(msg, meta) { return this.log('DEBUG', msg, meta); }
  warn(msg, meta) { return this.log('WARN', msg, meta); }
  error(msg, meta) { return this.log('ERROR', msg, meta); }
  gateway(msg, meta) { return this.log('GATEWAY', msg, meta); }
  mock(msg, meta) { return this.log('MOCK', msg, meta); }
  execution(msg, meta) { return this.log('EXECUTION', msg, meta); }

  pruneOldLogs() {
    if (String(this.retentionDays).toLowerCase() === 'forever' || Number(this.retentionDays) === 0) {
      return; // Keep forever
    }

    const retentionDays = Math.min(365, Math.max(1, parseInt(this.retentionDays, 10) || 7));
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    try {
      const files = fs.readdirSync(this.logsDir);
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        if (this.filePrefix && !file.startsWith(this.filePrefix)) continue;
        const filePath = path.join(this.logsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          if (this.writeConsole) {
            console.log(`\x1b[90m[Log Rotation] Pruned expired log file: ${file}\x1b[0m`);
          }
        }
      }
    } catch (err) {
      console.error('Error during log pruning:', err.message);
    }
  }

  listLogFiles() {
    try {
      const files = fs.readdirSync(this.logsDir)
        .filter((f) => f.endsWith('.log') && (!this.filePrefix || f.startsWith(this.filePrefix)))
        .map((f) => {
          const stats = fs.statSync(path.join(this.logsDir, f));
          return {
            filename: f,
            sizeBytes: stats.size,
            sizeKb: Math.round(stats.size / 1024),
            updatedAt: stats.mtime.toISOString()
          };
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      return files;
    } catch {
      return [];
    }
  }

  readLogFile(filename, maxLines = 500) {
    const safeName = path.basename(filename);
    if (!safeName.endsWith('.log') || (this.filePrefix && !safeName.startsWith(this.filePrefix))) {
      throw new Error(`Log file ${safeName} does not exist`);
    }
    const targetPath = path.join(this.logsDir, safeName);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Log file ${safeName} does not exist`);
    }

    const content = fs.readFileSync(targetPath, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-maxLines).join('\n');
  }
}

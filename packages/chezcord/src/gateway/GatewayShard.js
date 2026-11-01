import { EventEmitter } from 'node:events';
import {
  GATEWAY_BASE,
  GatewayOpcodes,
  GatewayCloseCodes,
  FatalCloseCodes,
  GatewayIntents
} from '../constants.js';
//
export const ShardStatus = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  HANDSHAKING: 'HANDSHAKING',
  IDENTIFYING: 'IDENTIFYING',
  RESUMING: 'RESUMING',
  READY: 'READY'
});

export class GatewayShard extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.token
   * @param {number} [options.intents]
  * @param {number} [options.capabilities]
   * @param {number} [options.shardId=0]
   * @param {number} [options.totalShards=1]
   */
  constructor(options) {
    super();
    this.token = options.token;
    this.intents = options.intents ?? (GatewayIntents.GUILDS | GatewayIntents.GUILD_MESSAGES | GatewayIntents.MESSAGE_CONTENT);
    this.capabilities = options.capabilities ?? 0;
    this.shardId = options.shardId ?? 0;
    this.totalShards = options.totalShards ?? 1;

    /** @type {WebSocket|null} */
    this.ws = null;
    this.status = ShardStatus.DISCONNECTED;

    this.sessionId = null;
    this.resumeGatewayUrl = null;
    this.sequence = null;

    this.heartbeatInterval = null;
    this.heartbeatTimer = null;
    this.lastHeartbeatAck = true;
    this.lastHeartbeatSentAt = 0;
    this.heartbeatStartTimer = null;
    this.invalidSessionTimer = null;
    this.reconnectTimer = null;
    this.lastHeartbeatLatencyMs = null;
    this.lastCloseCode = null;
    this.lastCloseReason = '';
    this.lastSessionResumed = null;
    this.resumeCount = 0;
    this.reconnectAttempts = 0;
    this.destroyed = false;
  }

  connect() {
    if (this.destroyed || this.ws) return;
    this.status = ShardStatus.CONNECTING;
    this.emit('status', this.status);
    this.emitDiagnostics();

    const gatewayUrl = (this.sessionId && this.resumeGatewayUrl)
      ? `${this.resumeGatewayUrl}?v=10&encoding=json`
      : GATEWAY_BASE;

    this.emit('debug', `[Shard ${this.shardId}] Connecting to ${gatewayUrl}`);

    let socket;
    try {
      socket = new globalThis.WebSocket(gatewayUrl);
      this.ws = socket;
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      if (this.destroyed || this.ws !== socket) return;
      this.status = ShardStatus.HANDSHAKING;
      this.emit('status', this.status);
      this.emit('debug', `[Shard ${this.shardId}] WebSocket connection established`);
    };

    socket.onmessage = (event) => {
      if (this.destroyed || this.ws !== socket) return;
      try {
        const payload = JSON.parse(event.data);
        this.handleMessage(payload);
      } catch (err) {
        this.emit('error', new Error(`Failed to parse gateway payload: ${err.message}`));
      }
    };

    socket.onerror = () => {
      if (this.destroyed || this.ws !== socket) return;
      this.emit('debug', `[Shard ${this.shardId}] WebSocket error`);
    };

    socket.onclose = (event) => {
      if (this.destroyed || this.ws !== socket) return;
      this.ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      this.handleClose(event.code, event.reason);
    };
  }

  /**
   * @param {object} payload
   */
  handleMessage(payload) {
    if (this.destroyed) return;
    const { op, d, s, t } = payload;

    if (s !== null && s !== undefined) {
      this.sequence = s;
    }

    switch (op) {
      case GatewayOpcodes.HELLO: {
        this.heartbeatInterval = d.heartbeat_interval;
        this.startHeartbeat();

        if (this.sessionId && this.sequence !== null) {
          this.sendResume();
        } else {
          this.sendIdentify();
        }
        break;
      }

      case GatewayOpcodes.HEARTBEAT_ACK: {
        if (this.lastHeartbeatSentAt > 0) {
          const latencyMs = Math.max(0, Date.now() - this.lastHeartbeatSentAt);
          this.lastHeartbeatLatencyMs = latencyMs;
          this.emit('heartbeatLatency', latencyMs);
          this.emitDiagnostics();
          this.lastHeartbeatSentAt = 0;
        }
        this.lastHeartbeatAck = true;
        this.emit('debug', `[Shard ${this.shardId}] Heartbeat acknowledged (ACK)`);
        break;
      }

      case GatewayOpcodes.HEARTBEAT: {
        this.sendHeartbeat();
        break;
      }

      case GatewayOpcodes.RECONNECT: {
        this.emit('debug', `[Shard ${this.shardId}] Discord requested RECONNECT`);
        this.closeAndReconnect(GatewayCloseCodes.UNKNOWN_ERROR, true);
        break;
      }

      case GatewayOpcodes.INVALID_SESSION: {
        const resumable = Boolean(d);
        this.emit('debug', `[Shard ${this.shardId}] Invalid session. Resumable: ${resumable}`);
        if (!resumable) {
          this.sessionId = null;
          this.sequence = null;
          this.resumeGatewayUrl = null;
        }
        clearTimeout(this.invalidSessionTimer);
        this.invalidSessionTimer = setTimeout(() => {
          this.invalidSessionTimer = null;
          if (resumable) {
            this.sendResume();
          } else {
            this.sendIdentify();
          }
        }, Math.floor(Math.random() * 4000) + 1000);
        break;
      }

      case GatewayOpcodes.DISPATCH: {
        this.handleDispatch(t, d);
        break;
      }

      default:
        this.emit('debug', `[Shard ${this.shardId}] Unhandled Opcode: ${op}`);
    }
  }

  /**
   * @param {string} eventName
   * @param {any} data
   */
  handleDispatch(eventName, data) {
    if (this.destroyed) return;
    this.emit('dispatch', eventName, data);
    if (eventName === 'READY') {
      this.sessionId = data.session_id;
      this.resumeGatewayUrl = data.resume_gateway_url;
      this.status = ShardStatus.READY;
      this.reconnectAttempts = 0;
      this.lastSessionResumed = false;
      this.emit('status', this.status);
      this.emitDiagnostics();
      this.emit('READY', data);
      this.emit('debug', `[Shard ${this.shardId}] Shard READY. Connected as ${data.user.username}#${data.user.discriminator || '0'}`);
      return;
    }

    if (eventName === 'RESUMED') {
      this.status = ShardStatus.READY;
      this.reconnectAttempts = 0;
      this.lastSessionResumed = true;
      this.resumeCount += 1;
      this.emit('status', this.status);
      this.emitDiagnostics();
      this.emit('RESUMED');
      this.emit('debug', `[Shard ${this.shardId}] Session resumed successfully`);
      return;
    }

    this.emit(eventName, data);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    clearTimeout(this.heartbeatStartTimer);
    this.lastHeartbeatAck = true;

    const jitter = Math.floor(Math.random() * this.heartbeatInterval);
    this.heartbeatStartTimer = setTimeout(() => {
      this.heartbeatStartTimer = null;
      if (this.status === ShardStatus.DISCONNECTED || this.destroyed) return;
      this.sendHeartbeat();
      this.heartbeatTimer = setInterval(() => {
        if (!this.lastHeartbeatAck) {
          this.emit('debug', `[Shard ${this.shardId}] Heartbeat ACK missed! Triggering zombie reconnect.`);
          this.closeAndReconnect(GatewayCloseCodes.UNKNOWN_ERROR, true);
          return;
        }
        this.sendHeartbeat();
      }, this.heartbeatInterval);
    }, jitter);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendHeartbeat() {
    this.lastHeartbeatAck = false;
    this.lastHeartbeatSentAt = Date.now();
    this.send(GatewayOpcodes.HEARTBEAT, this.sequence);
  }

  sendIdentify() {
    this.status = ShardStatus.IDENTIFYING;
    this.emit('status', this.status);
    this.emit('debug', `[Shard ${this.shardId}] Sending IDENTIFY with intents: ${this.intents}`);

    this.send(GatewayOpcodes.IDENTIFY, {
      token: this.token,
      intents: this.intents,
      ...(this.capabilities ? { capabilities: this.capabilities } : {}),
      properties: {
        os: process.platform,
        browser: 'chezcord',
        device: 'chezcord'
      },
      shard: [this.shardId, this.totalShards]
    });
  }

  sendResume() {
    this.status = ShardStatus.RESUMING;
    this.emit('status', this.status);
    this.emit('debug', `[Shard ${this.shardId}] Sending RESUME (session: ${this.sessionId}, seq: ${this.sequence})`);

    this.send(GatewayOpcodes.RESUME, {
      token: this.token,
      session_id: this.sessionId,
      seq: this.sequence
    });
  }

  /**
   * @param {object} presence
   */
  updatePresence(presence) {
    this.send(GatewayOpcodes.PRESENCE_UPDATE, {
      since: presence.since ?? null,
      activities: presence.activities ?? [],
      status: presence.status ?? 'online',
      afk: presence.afk ?? false
    });
  }

  /**
   * @param {number} op
   * @param {any} d
   */
  send(op, d) {
    if (this.ws && this.ws.readyState === globalThis.WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op, d }));
    }
  }

  handleClose(code, reason) {
    if (this.destroyed) return;
    this.stopHeartbeat();
    clearTimeout(this.heartbeatStartTimer);
    clearTimeout(this.invalidSessionTimer);
    this.heartbeatStartTimer = null;
    this.invalidSessionTimer = null;
    this.status = ShardStatus.DISCONNECTED;
    this.emit('status', this.status);
    this.lastCloseCode = Number.isFinite(Number(code)) ? Number(code) : null;
    this.lastCloseReason = String(reason || '').slice(0, 200);
    this.emitDiagnostics();
    this.emit('debug', `[Shard ${this.shardId}] Closed with code ${code}: ${reason || 'No reason'}`);

    if (FatalCloseCodes.has(code)) {
      const err = new Error(`Discord Gateway Fatal Close Code ${code}: ${reason}`);
      this.emit('fatalError', err);
      this.destroy();
      return;
    }

    this.scheduleReconnect();
  }

  closeAndReconnect(code = GatewayCloseCodes.UNKNOWN_ERROR, resume = true) {
    this.stopHeartbeat();
    if (!resume) {
      this.sessionId = null;
      this.sequence = null;
    }
    if (this.ws) {
      try {
        this.ws.close(code);
      } catch {}
    }
  }

  scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectAttempts++;
    const delay = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.emit('debug', `[Shard ${this.shardId}] Scheduling reconnect attempt #${this.reconnectAttempts} in ${Math.round(delay)}ms`);
    this.emitDiagnostics();

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
        this.connect();
      }
    }, delay);
  }

  getDiagnostics() {
    return {
      shardId: this.shardId,
      status: this.status,
      reconnectAttempts: this.reconnectAttempts,
      lastCloseCode: this.lastCloseCode,
      lastCloseReason: this.lastCloseReason,
      heartbeatLatencyMs: this.lastHeartbeatLatencyMs,
      sessionResumed: this.lastSessionResumed,
      resumeCount: this.resumeCount,
      hasResumableSession: Boolean(this.sessionId && this.sequence !== null)
    };
  }

  emitDiagnostics() {
    this.emit('diagnostics', this.getDiagnostics());
  }
//
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    clearTimeout(this.heartbeatStartTimer);
    clearTimeout(this.invalidSessionTimer);
    clearTimeout(this.reconnectTimer);
    this.heartbeatStartTimer = null;
    this.invalidSessionTimer = null;
    this.reconnectTimer = null;
    this.stopHeartbeat();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close(1000);
      } catch {}
    }
    const wasDisconnected = this.status === ShardStatus.DISCONNECTED;
    this.status = ShardStatus.DISCONNECTED;
    try {
      if (!wasDisconnected) this.emit('status', this.status);
    } finally {
      this.removeAllListeners();
    }
  }
}

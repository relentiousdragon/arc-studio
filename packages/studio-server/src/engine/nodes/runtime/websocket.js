import { EventEmitter } from 'node:events';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import WebSocket from 'ws';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_CONNECTIONS = 32;
const EVENT_NAMES = new Set(['WEBSOCKET_OPEN', 'WEBSOCKET_MESSAGE', 'WEBSOCKET_CLOSE', 'WEBSOCKET_ERROR']);
//
function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 0 || b === 168)
      || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51)
      || a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  return (normalized.startsWith('2') || normalized.startsWith('3'))
    && !normalized.startsWith('2001:db8:') && !normalized.startsWith('2001:0:')
    && !normalized.startsWith('2002:') && !normalized.startsWith('::ffff:');
}

async function resolvePublicAddress(hostname) {
  const normalizedHost = hostname.replace(/^\[|\]$/g, '');
  const family = isIP(normalizedHost);
  const addresses = family ? [{ address: normalizedHost, family }] : await lookup(normalizedHost, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error('WebSocket connections to local, private, reserved, or non-public addresses are blocked.');
  }
  return addresses[0];
}

function parseProtocols(value) {
  const protocols = Array.isArray(value) ? value : String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (protocols.length > 10 || protocols.some((protocol) => typeof protocol !== 'string' || protocol.length > 128 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(protocol))) {
    throw new Error('Protocols must be a comma separated list of valid WebSocket protocol names.');
  }
  return protocols;
}

export class GraphWebSocketManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map();
  }

  async connect(connectionId, rawUrl, rawProtocols = '', timeoutMs = 10000) {
    const id = String(connectionId || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id)) throw new Error('Connection ID must start with a letter or number and contain at most 64 characters.');
    if (this.connections.size >= MAX_CONNECTIONS && !this.connections.has(id)) throw new Error(`A project can have at most ${MAX_CONNECTIONS} open WebSocket connections.`);
    const url = new URL(String(rawUrl || ''));
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw new Error('Enter a valid ws:// or wss:// URL without embedded credentials.');
    const protocols = parseProtocols(rawProtocols);
    const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1000, Math.min(60000, Math.trunc(Number(timeoutMs)))) : 10000;
    const address = await resolvePublicAddress(url.hostname);
    this.close(id, 1000, 'Replaced by a new connection');
    const socket = new WebSocket(url, protocols.length ? protocols : undefined, {
      handshakeTimeout: timeout,
      maxPayload: MAX_MESSAGE_BYTES,
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, [address])
        : callback(null, address.address, address.family)
    });
    const connection = { id, url: url.href, socket, opened: false };
    this.connections.set(id, connection);
    socket.on('open', () => {
      connection.opened = true;
      this.emitEvent('WEBSOCKET_OPEN', { connectionId: id, url: url.href });
    });
    socket.on('message', (payload, isBinary) => {
      const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      if (bytes.length > MAX_MESSAGE_BYTES) return socket.close(1009, 'Message too large');
      this.emitEvent('WEBSOCKET_MESSAGE', {
        connectionId: id,
        url: url.href,
        isBinary: Boolean(isBinary),
        data: isBinary ? bytes.toString('base64') : bytes.toString('utf8'),
        byteLength: bytes.length
      });
    });
    socket.on('close', (code, reason) => {
      if (this.connections.get(id) === connection) this.connections.delete(id);
      this.emitEvent('WEBSOCKET_CLOSE', { connectionId: id, url: url.href, code, reason: reason.toString('utf8').slice(0, 123), wasClean: code === 1000 });
    });
    socket.on('error', (error) => this.emitEvent('WEBSOCKET_ERROR', { connectionId: id, url: url.href, error: String(error?.message || 'WebSocket connection error').slice(0, 500) }));

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail(new Error(`WebSocket connection timed out after ${timeout} ms.`)), timeout);
      const onOpen = () => finish(resolve);
      const onError = (error) => fail(new Error(String(error?.message || 'WebSocket connection failed').slice(0, 500)));
      const onClose = (code) => fail(new Error(`WebSocket connection closed before opening with code ${code}.`));
      const finish = (complete) => {
        clearTimeout(timer);
        socket.off('open', onOpen);
        socket.off('error', onError);
        socket.off('close', onClose);
        complete();
      };
      const fail = (error) => {
        finish(() => {
          if (this.connections.get(id) === connection) this.connections.delete(id);
          try { socket.terminate(); } catch {}
          reject(error);
        });
      };
      socket.once('open', onOpen);
      socket.once('error', onError);
      socket.once('close', onClose);
    });
    return { connectionId: id, url: url.href };
  }

  async send(connectionId, data, isBinary = false) {
    const connection = this.connections.get(String(connectionId || '').trim());
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) throw new Error('That WebSocket connection is not open.');
    let payload = String(data ?? '');
    if (isBinary) {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) throw new Error('Binary messages must use valid base64 data.');
      payload = Buffer.from(payload, 'base64');
    }
    if (Buffer.byteLength(payload) > MAX_MESSAGE_BYTES) throw new Error('WebSocket messages are limited to 1 MiB.');
    await new Promise((resolve, reject) => connection.socket.send(payload, { binary: Boolean(isBinary) }, (error) => error ? reject(error) : resolve()));
    return true;
  }

  close(connectionId, code = 1000, reason = '') {
    const id = String(connectionId || '').trim();
    const connection = this.connections.get(id);
    if (!connection) return false;
    const closeCode = Number(code);
    const closeReason = String(reason || '').slice(0, 123);
    if (!Number.isInteger(closeCode) || !(closeCode === 1000 || closeCode >= 3000 && closeCode <= 4999)) throw new Error('Use close code 1000 or a code from 3000 through 4999.');
    if (connection.socket.readyState === WebSocket.OPEN || connection.socket.readyState === WebSocket.CONNECTING) connection.socket.close(closeCode, closeReason);
    else this.connections.delete(id);
    return true;
  }

  closeAll() {
    for (const id of [...this.connections.keys()]) {
      try { this.close(id, 1000, 'Bot stopped'); } catch {}
    }
    this.connections.clear();
  }

  emitEvent(eventName, payload) {
    if (EVENT_NAMES.has(eventName)) this.emit('event', { eventName, payload });
  }
}

export async function executeWebSocketNode(node, { resolveInput, setOutput, context, log }) {
  const manager = context.webSockets;
  const connectionId = String(resolveInput('connection_id', node.data?.connection_id || 'main')).trim();
  try {
    if (!manager || context.mock) throw new Error('WebSocket nodes are disabled in the Offline Simulator.');
    if (node.type === 'action_websocket_connect') {
      const connection = await manager.connect(connectionId, resolveInput('url', node.data?.url || ''), resolveInput('protocols', node.data?.protocols || ''), resolveInput('timeout_ms', node.data?.timeout_ms || 10000));
      setOutput('connection_id_out', connection.connectionId);
      setOutput('success', true);
      setOutput('error', '');
      log(`[Connect WebSocket] Connected as ${connection.connectionId}.`);
      return 'success';
    }
    if (node.type === 'action_websocket_send') {
      await manager.send(connectionId, resolveInput('data', node.data?.data || ''), Boolean(resolveInput('is_binary', node.data?.is_binary || false)));
      setOutput('success', true);
      setOutput('error', '');
      log(`[Send WebSocket Message] Sent a message on ${connectionId}.`);
      return 'success';
    }
    if (node.type === 'action_websocket_close') {
      if (!manager.close(connectionId, resolveInput('code', node.data?.code || 1000), resolveInput('reason', node.data?.reason || ''))) throw new Error('That WebSocket connection is not open.');
      setOutput('success', true);
      setOutput('error', '');
      log(`[Close WebSocket] Closed ${connectionId}.`);
      return 'success';
    }
  } catch (error) {
    const message = String(error?.message || 'WebSocket action failed.').slice(0, 500);
    setOutput('success', false);
    setOutput('error', message);
    log(`[${node.label || node.type}] ${message}`);
    return 'failure';
  }
  return 'failure';
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const servers = new Map();
const pendingWebResponses = new Map();
const MAX_TEMPLATE_BYTES = 256 * 1024;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_PENDING_WEB_RESPONSES = 256;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BLOCKED_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor', 'process', 'global', 'globalThis', 'require', 'module']);
const DEFAULT_CONTENT_TYPES = Object.freeze({
  '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.ejs': 'text/html; charset=utf-8',
  '.gif': 'image/gif', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg', '.otf': 'font/otf', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.wav': 'audio/wav', '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.xml': 'application/xml; charset=utf-8', '.zip': 'application/zip'
});
const BLOCKED_RESPONSE_HEADERS = new Set(['connection', 'content-length', 'host', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const ROUTE_METHODS = ALLOWED_METHODS;
//
function safeText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return String(value);
}

function escapeHtml(value) {
  return safeText(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function parsePath(expression) {
  const source = String(expression || '').trim();
  const parts = [];
  let index = 0;
  const root = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source);
  if (!root) throw new Error('EJS expressions must start with a local value name.');
  parts.push(root[0]);
  index = root[0].length;
  while (index < source.length) {
    if (source[index] === '.') {
      const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index + 1));
      if (!match) throw new Error('Invalid EJS property path.');
      parts.push(match[0]);
      index += match[0].length + 1;
      continue;
    }
    if (source[index] === '[') {
      const match = /^\[(?:\s*(?:"([^"\\]*)"|'([^'\\]*)'|(\d+))\s*)\]/.exec(source.slice(index));
      if (!match) throw new Error('EJS brackets must contain a quoted property name or array index.');
      parts.push(match[1] ?? match[2] ?? Number(match[3]));
      index += match[0].length;
      continue;
    }
    throw new Error('Only local value lookups are supported in EJS expressions.');
  }
  if (parts.some((part) => typeof part === 'string' && BLOCKED_PROPERTIES.has(part))) throw new Error('This EJS property is not available.');
  return parts;
}

function resolveLocal(locals, expression) {
  const [root, ...path] = parsePath(expression);
  if (!Object.hasOwn(locals, root)) return undefined;
  let value = locals[root];
  for (const key of path) {
    if (value == null || !['object', 'string'].includes(typeof value) || !Object.hasOwn(Object(value), key)) return undefined;
    value = value[key];
  }
  return value;
}

export function renderSafeEjs(template, locals = {}, escapeValues = true) {
  const source = String(template ?? '');
  if (Buffer.byteLength(source, 'utf8') > MAX_TEMPLATE_BYTES) throw new Error('The response template exceeds 256 KB.');
  const tagCheck = source.replaceAll('<%%', '').replaceAll('%%>', '').replace(/<%[=#-]?[\s\S]*?%>/g, '');
  if (tagCheck.includes('<%') || tagCheck.includes('%>')) throw new Error('The EJS template contains an unclosed or unsupported tag.');
  const rendered = source.replace(/<%%|%%>|<%([=#-]?)([\s\S]*?)%>/g, (token, mode, expression) => {
    if (token === '<%%') return '<%';
    if (token === '%%>') return '%>';
    if (mode === '#') return '';
    if (mode === '-') throw new Error('Unescaped EJS output is disabled. Use <%= value %> for escaped output.');
    if (mode !== '=') throw new Error('Executable EJS tags are disabled. Use <%= value %> for data lookups.');
    const value = resolveLocal(locals, expression);
    if (mode === '=' && escapeValues === 'json') return JSON.stringify(value === undefined ? null : value);
    return escapeValues === true ? escapeHtml(value) : safeText(value);
  });
  if (Buffer.byteLength(rendered, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('The rendered response exceeds 20 MB.');
  return rendered;
}

function renderEjsValue(value, locals, depth = 0) {
  if (depth > 32) throw new Error('JSON response nesting exceeds 32 levels.');
  if (typeof value === 'string') return /<%/.test(value) ? renderSafeEjs(value, locals, false) : value;
  if (Array.isArray(value)) return value.map((item) => renderEjsValue(item, locals, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderEjsValue(item, locals, depth + 1)]));
  return value;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('Request body exceeds 16 KB.'), { statusCode: 413 }));
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      if (/^application\/json(?:\s*;|$)/i.test(String(request.headers['content-type'] || ''))) {
        try { return resolve(JSON.parse(raw)); }
        catch { return reject(Object.assign(new Error('Request body contains invalid JSON.'), { statusCode: 400 })); }
      }
      resolve(raw);
    });
    request.on('error', reject);
  });
}

function sendError(response, status, message, method = '') {
  const body = JSON.stringify({ error: message });
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function projectKey(context) {
  return String(context?.projectDir || 'default-project');
}

function serverKey(context, graphId, serverId) {
  return `${projectKey(context)}:${String(graphId || 'default-graph')}:${String(serverId || '')}`;
}

function normalizeRoutePath(value) {
  const routePath = String(value || '');
  if (!routePath.startsWith('/') || routePath.startsWith('//') || routePath.length > 512 || routePath.includes('?') || routePath.includes('#') || routePath.includes('\\') || /[\u0000-\u0020\u007f]/.test(routePath)) throw new Error('Every route and file path must start with one / and exclude query strings, fragments, whitespace, and backslashes.');
  if (routePath.split('/').some((part) => part === '.' || part === '..')) throw new Error('Route and file paths cannot contain dot segments.');
  return routePath;
}

function validateRoutePattern(routePath) {
  if (routePath.split('/').some((part) => part.includes(':') && !/^:[A-Za-z_][A-Za-z0-9_]*$/.test(part))) throw new Error('Route parameters must be full path segments with names such as :userId.');
  const parameters = routePath.split('/').filter((part) => part.startsWith(':'));
  if (new Set(parameters).size !== parameters.length) throw new Error('Route parameter names must be unique within a path.');
  return routePath;
}

function normalizeBindHost(value) {
  const host = String(value || '').trim();
  if (host.toLowerCase() === 'localhost') return '127.0.0.1';
  if (net.isIP(host)) return host;
  throw new Error('Bind Host must be localhost or an IP address. Hostnames are not allowed.');
}

function normalizeContent(content, contentType = '', status = 200, headers = {}) {
  if (content === undefined || content === null) content = '';
  const isJsonBody = typeof content === 'object' && !Buffer.isBuffer(content);
  const inferredContentType = isJsonBody ? 'application/json; charset=utf-8' : '';
  const type = String(contentType || inferredContentType).trim();
  if (type && (type.length > 128 || /[\r\n]/.test(type))) throw new Error('A route content type is invalid.');
  if (isJsonBody && !isJsonContentType(type)) throw new Error('JSON object responses must use an application/json content type.');
  const statusCode = Number(status ?? 200);
  if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode > 599) throw new Error('A route status must be an integer from 200 to 599.');
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Route headers must be a JSON object.');
  const safeHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || BLOCKED_RESPONSE_HEADERS.has(lower) || ['content-type', 'x-content-type-options'].includes(lower) || lower.startsWith('proxy-') || /[\r\n]/.test(String(value))) throw new Error(`Route response header ${name} is invalid or restricted.`);
    safeHeaders[lower] = String(value).slice(0, 4096);
  }
  return { body: content, contentType: type, status: statusCode, headers: safeHeaders, isJsonBody };
}

function responseHeaders(value) {
  let headers;
  try { headers = JSON.parse(String(value || '{}')); }
  catch { throw new Error('Response headers must contain valid JSON.'); }
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Response headers must be a JSON object.');
  return headers;
}

function webRequestKey(context, graphId, requestId) {
  return `${projectKey(context)}:${String(graphId || '')}:${String(requestId || '')}`;
}

function createPendingWebResponse(entry, request, response, requestId, context, graphId) {
  const key = webRequestKey(context, graphId, requestId);
  let resolveCompletion;
  let completed = false;
  let timeout;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  const pending = {
    complete(normalized) {
      if (completed) return false;
      completed = true;
      clearTimeout(timeout);
      pendingWebResponses.delete(key);
      entry.pendingResponses.delete(pending);
      const noBody = [204, 205, 304].includes(normalized.status);
      const payloadValue = normalized.isJsonBody ? JSON.stringify(normalized.body) : normalized.body;
      const payload = noBody ? Buffer.alloc(0) : Buffer.isBuffer(payloadValue) ? payloadValue : Buffer.from(String(payloadValue ?? ''), 'utf8');
      if (payload.length > MAX_RESPONSE_BYTES) {
        sendError(response, 413, 'Response exceeds 20 MB.', request.method);
      } else {
        response.writeHead(normalized.status, {
          ...normalized.headers,
          'content-type': normalized.contentType || 'application/octet-stream',
          ...(!noBody ? { 'content-length': payload.length } : {}),
          'cache-control': normalized.headers['cache-control'] || 'no-store',
          'x-content-type-options': 'nosniff'
        });
        response.end(request.method === 'HEAD' ? undefined : payload);
      }
      resolveCompletion();
      return true;
    },
    fail(status, message) {
      if (completed) return false;
      completed = true;
      clearTimeout(timeout);
      pendingWebResponses.delete(key);
      entry.pendingResponses.delete(pending);
      if (!response.headersSent) sendError(response, status, message, request.method);
      else response.destroy();
      resolveCompletion();
      return true;
    },
    completion
  };
  pendingWebResponses.set(key, pending);
  entry.pendingResponses.add(pending);
  timeout = setTimeout(() => pending.fail(504, 'The graph did not respond before the request timed out.'), 30000);
  timeout.unref?.();
  return pending;
}

function secretDigest(value) {
  return createHash('sha256').update(String(value), 'utf8').digest();
}

function matchesBearerToken(request, expectedDigest) {
  const authorization = String(request.headers.authorization || '');
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return false;
  return timingSafeEqual(secretDigest(match[1]), expectedDigest);
}

function isJsonContentType(contentType) {
  return /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(String(contentType || '').trim());
}

function routeKey(method, routePath) {
  return `${method}:${routePath}`;
}

function routePatternKey(method, routePath) {
  return routeKey(method, routePath.split('/').map((part) => part.startsWith(':') ? ':' : part).join('/'));
}

function readBearerToken(value) {
  const token = String(value ?? '').trim();
  if (!token) return '';
  if (/\{\{[\s\S]*?\}\}/.test(token) || /\{\{[^}]*$/.test(token)) {
    throw new Error('Bearer token template did not resolve. Check its variables and environment references.');
  }
  if (token.length > 4096 || /\s/.test(token)) throw new Error('Bearer token must be at most 4,096 characters with no whitespace.');
  return token;
}

function parseServerManifest(routesValue, filesValue) {
  if (Buffer.byteLength(String(routesValue || ''), 'utf8') > 5 * 1024 * 1024 || Buffer.byteLength(String(filesValue || ''), 'utf8') > 5 * 1024 * 1024) throw new Error('Route and file configuration must each stay within 5 MB.');
  let routes;
  let files;
  try { routes = JSON.parse(String(routesValue || '[]')); }
  catch { throw new Error('Routes must contain valid JSON.'); }
  try { files = JSON.parse(String(filesValue || '{}')); }
  catch { throw new Error('Static Files must contain valid JSON.'); }
  if (!Array.isArray(routes) || routes.length > 100) throw new Error('Routes must be a JSON array with no more than 100 entries.');
  if (!files || typeof files !== 'object' || Array.isArray(files) || Object.keys(files).length > 100) throw new Error('Static Files must be a JSON object with no more than 100 entries.');
  const normalizedRoutes = routes.map((route, index) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) throw new Error(`Route ${index + 1} must be a JSON object.`);
    const method = String(route.method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw new Error(`Route ${index + 1} uses an unsupported HTTP method.`);
    return {
      method,
      path: validateRoutePattern(normalizeRoutePath(route.path || '/')),
      isEjs: route.ejs === true || route.template === true || String(route.path || '').toLowerCase().endsWith('.ejs') || /<%/.test(String(route.body ?? '')),
      ...normalizeContent(route.body ?? '', route.contentType || route.content_type || '', route.status ?? 200, route.headers || {})
    };
  });
  const normalizedFiles = new Map();
  let totalBytes = 0;
  for (const [filePath, file] of Object.entries(files)) {
    const key = normalizeRoutePath(filePath);
    if (normalizedFiles.has(key)) throw new Error(`Static file path ${key} is defined more than once.`);
    const descriptor = typeof file === 'string' ? { body: file } : file;
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) throw new Error(`Static file ${key} must be text or a JSON object.`);
    const normalized = normalizeContent(descriptor.body ?? descriptor.content ?? '', descriptor.contentType || descriptor.content_type || DEFAULT_CONTENT_TYPES[path.extname(key).toLowerCase()] || '', descriptor.status ?? 200, descriptor.headers || {});
    normalized.asset = typeof descriptor.asset === 'string' ? descriptor.asset.trim() : '';
    if (normalized.asset && (descriptor.body !== undefined || descriptor.content !== undefined)) throw new Error(`Static file ${key} cannot set both asset and body content.`);
    if (descriptor.ejs === true || path.extname(key).toLowerCase() === '.ejs') normalized.isEjs = true;
    totalBytes += Buffer.byteLength(normalized.isJsonBody ? JSON.stringify(normalized.body) : String(normalized.body));
    if (totalBytes > 5 * 1024 * 1024) throw new Error('Static file contents exceed the 5 MB total limit.');
    normalizedFiles.set(key, normalized);
  }
  const routeKeys = new Set();
  for (const route of normalizedRoutes) {
    const key = routePatternKey(route.method, route.path);
    if (routeKeys.has(key)) throw new Error(`Route ${route.method} ${route.path} is defined more than once.`);
    routeKeys.add(key);
  }
  for (const route of normalizedRoutes) {
    if (['GET', 'HEAD'].includes(route.method) && [...normalizedFiles.keys()].some((filePath) => matchRoute(route.path, filePath))) {
      throw new Error(`Route ${route.method} ${route.path} shadows a static file path.`);
    }
  }
  return { routes: normalizedRoutes, files: normalizedFiles };
}

function matchRoute(routePath, requestPath) {
  const routeSegments = routePath.split('/');
  const requestSegments = requestPath.split('/');
  if (routeSegments.length !== requestSegments.length) return null;
  const params = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    if (routeSegment.startsWith(':') && /^[A-Za-z_][A-Za-z0-9_]*$/.test(routeSegment.slice(1))) {
      params[routeSegment.slice(1)] = requestSegments[index];
    } else if (routeSegment !== requestSegments[index]) return null;
  }
  return params;
}

function readManagedMediaAsset(asset, context) {
  if (!asset || typeof asset.id !== 'string' || !/^media_[0-9a-f-]{36}$/i.test(asset.id) || !context?.projectDir) return null;
  try {
    if (!asset || typeof asset.contentType !== 'string' || /[\r\n]/.test(asset.contentType)) return null;
    const bytes = fs.readFileSync(path.join(path.resolve(context.projectDir, 'media'), `${asset.id}.bin`));
    if (bytes.length > MAX_RESPONSE_BYTES || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) return null;
    return { bytes, contentType: asset.contentType };
  } catch { return null; }
}

function readProjectMediaManifest(context) {
  if (!context?.projectDir) return [];
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(context.projectDir, 'media-assets.json'), 'utf8'));
    return Array.isArray(metadata) ? metadata : [];
  } catch { return []; }
}

function resolveManagedMediaFile(source, context) {
  if (typeof source !== 'string' || !context?.projectDir) return null;
  const mediaDir = path.resolve(context.projectDir, 'media');
  const resolved = path.resolve(source);
  if (path.dirname(resolved) !== mediaDir) return null;
  const id = path.basename(resolved, path.extname(resolved));
  if (!/^media_[0-9a-f-]{36}$/i.test(id) || path.extname(resolved).toLowerCase() !== '.bin') return null;
  const asset = readProjectMediaManifest(context).find((item) => item.id === id);
  return readManagedMediaAsset(asset, context);
}

function resolveManagedMediaAsset(filename, context) {
  const reference = String(filename || '').trim();
  const matches = readProjectMediaManifest(context).filter((item) => item.id === reference
    || String(item.filename || '').toLowerCase() === reference.toLowerCase());
  if (matches.length !== 1) return null;
  return readManagedMediaAsset(matches[0], context);
}

function isProjectMediaPath(source, context) {
  if (typeof source !== 'string' || !context?.projectDir || !path.isAbsolute(source)) return false;
  const mediaDir = path.resolve(context.projectDir, 'media');
  return path.resolve(source).startsWith(`${mediaDir}${path.sep}`);
}

async function stopEntry(key, entry) {
  if (entry.closePromise) return entry.closePromise;
  entry.cancelled = true;
  for (const pending of [...(entry.pendingResponses || [])]) pending.fail(503, 'The web server is stopping.');
  if (!entry.server.listening) {
    servers.delete(key);
    return;
  }
  entry.closePromise = new Promise((resolve, reject) => entry.server.close((error) => error ? reject(error) : resolve()))
    .finally(() => servers.delete(key));
  return entry.closePromise;
}

async function startServer(node, runtime) {
  const { resolveInput, setOutput, context, log } = runtime;
  const fail = (message) => {
    setOutput('started', false);
    setOutput('port', 0);
    setOutput('web_server_id', '');
    setOutput('url', '');
    setOutput('error', message);
    log(`[Web Server] Failed to start: ${message}`, 'WARN');
    return true;
  };
  if (context?.mock) {
    fail('Web servers are disabled in the Offline Simulator.');
    return true;
  }
  const port = Number(resolveInput('port', 3001));
  let host;
  try { host = normalizeBindHost(resolveInput('host', '127.0.0.1')); }
  catch (error) { return fail(error.message); }
  let routePath;
  try { routePath = normalizeRoutePath(String(resolveInput('path', '/')).trim() || '/'); }
  catch (error) { return fail(`Route path is invalid: ${error.message}`); }
  const method = String(resolveInput('method', 'GET')).trim().toUpperCase();
  const status = Number(resolveInput('status', 200));
  const contentType = String(resolveInput('content_type', 'text/html; charset=utf-8')).trim();
  const template = String(resolveInput('template', ''));
  let manifest;
  try { manifest = parseServerManifest(resolveInput('routes_json', '[]'), resolveInput('files_json', '{}')); }
  catch (error) { return fail(error.message || 'Server route configuration is invalid.'); }
  if (!Number.isInteger(port) || port < 0 || port > 65535) return fail('Port must be an integer from 0 to 65535.');
  if (!ALLOWED_METHODS.has(method)) return fail('Choose GET, HEAD, POST, PUT, PATCH, DELETE, or OPTIONS.');
  if (!Number.isInteger(status) || status < 200 || status > 599) return fail('Response status must be an integer from 200 to 599.');
  if (!contentType || contentType.length > 128 || /[\r\n]/.test(contentType)) return fail('Content type is invalid.');
  const key = serverKey(context, runtime.graphId, node.id);
  const current = servers.get(key);
  if (current) {
    try { await stopEntry(key, current); }
    catch (error) { return fail(`Could not replace the existing server: ${error.message}`); }
  }
  const hasLegacyInlineConfig = ['path', 'method', 'status', 'content_type', 'template', 'routes_json', 'files_json']
    .some((pinId) => Object.hasOwn(node.data || {}, pinId) || runtime.hasInput?.(pinId));
  const safeConfig = { host, port, routePath, method, status, contentType, template, legacyFallback: hasLegacyInlineConfig, ...manifest };
  const routeTable = new Map(safeConfig.routes.map((route) => [routePatternKey(route.method, route.path), route]));
  const graphRequestRoutes = [];
  const graphConnections = runtime.graph?.connections || [];
  for (const requestNode of runtime.graph?.nodes || []) {
    if (requestNode.type !== 'event_web_server_request') continue;
    const serverConnection = graphConnections.find((connection) => connection.targetNodeId === requestNode.id && connection.targetPinId === 'web_server_id');
    if (serverConnection?.sourceNodeId !== node.id || serverConnection.sourcePinId !== 'web_server_id') continue;
    const requestMethod = String(requestNode.data?.method || 'GET').trim().toUpperCase();
    let requestPath;
    try { requestPath = validateRoutePattern(normalizeRoutePath(requestNode.data?.path || '/')); }
    catch (error) { return fail(`On Web Request route is invalid: ${error.message}`); }
    if (!ALLOWED_METHODS.has(requestMethod)) return fail(`On Web Request route ${requestPath} uses an unsupported method.`);
    const requestKey = routePatternKey(requestMethod, requestPath);
    if (routeTable.has(requestKey) || graphRequestRoutes.some((route) => routePatternKey(route.method, route.path) === requestKey)) {
      return fail(`On Web Request route ${requestMethod} ${requestPath} is already registered.`);
    }
    if (['GET', 'HEAD'].includes(requestMethod) && [...manifest.files.keys()].some((filePath) => matchRoute(requestPath, filePath))) {
      return fail(`On Web Request route ${requestPath} shadows a static file path.`);
    }
    let authToken;
    const resolvedAuthToken = runtime.resolveNodeInput
      ? runtime.resolveNodeInput(requestNode, 'auth_token', requestNode.data?.auth_token)
      : requestNode.data?.auth_token;
    try { authToken = readBearerToken(resolvedAuthToken); }
    catch (error) { return fail(`On Web Request route ${requestPath}: ${error.message}`); }
    graphRequestRoutes.push({
      method: requestMethod,
      path: requestPath,
      graphRequest: true,
      routeId: requestNode.id,
      ...(authToken ? { authDigest: secretDigest(authToken) } : {})
    });
  }
  for (const route of graphRequestRoutes) routeTable.set(routePatternKey(route.method, route.path), route);
  const fileTable = new Map(safeConfig.files);
  const entry = {
    server: null, host, port, starting: true, cancelled: false,
    routes: routeTable, files: fileTable, graphId: runtime.graphId, serverId: node.id,
    dispatchGraphEvent: runtime.dispatchGraphEvent, pendingResponses: new Set()
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      let requestPath;
      if (/%(?:2f|5c|00)/i.test(url.pathname)) return sendError(response, 400, 'Request path uses an encoded separator or null byte.', request.method);
      try { requestPath = decodeURIComponent(url.pathname); }
      catch { return sendError(response, 400, 'Request path is malformed.', request.method); }
      if (/[\u0000-\u001f\u007f]/.test(requestPath) || requestPath.includes('\\') || requestPath.split('/').some((part) => part === '.' || part === '..')) return sendError(response, 400, 'Request path is invalid.', request.method);
      let selected = null;
      const routes = [...entry.routes.values()];
      for (const allowGetForHead of [false, request.method === 'HEAD']) {
        for (const route of routes) {
          const params = matchRoute(route.path, requestPath);
          const methodMatches = route.method === request.method || allowGetForHead && route.method === 'GET';
          if (params && methodMatches) { selected = { ...route, params }; break; }
        }
        if (selected) break;
      }
      const staticFile = entry.files.get(requestPath);
      if (!selected && staticFile && ['GET', 'HEAD'].includes(request.method)) selected = { ...staticFile, params: {}, isEjs: staticFile.isEjs || path.extname(requestPath).toLowerCase() === '.ejs' };
      if (!selected && safeConfig.legacyFallback && requestPath === routePath) {
        const methodMatches = method === request.method || method === 'GET' && request.method === 'HEAD';
        if (!methodMatches) {
          response.setHeader('allow', method === 'GET' ? 'GET, HEAD' : method);
          return sendError(response, 405, 'Method not allowed.');
        }
        selected = { body: template, contentType, status, headers: {}, isEjs: true, params: {} };
      }
      if (!selected) {
        const matchingRoutes = routes.filter((route) => matchRoute(route.path, requestPath));
        const routeExists = matchingRoutes.length > 0 || staticFile;
        if (routeExists) {
          const allowed = [...new Set(matchingRoutes.map((route) => route.method))];
          response.setHeader('allow', [...new Set([...allowed, ...(staticFile ? ['GET', 'HEAD'] : allowed.includes('GET') ? ['HEAD'] : [])])].join(', '));
          return sendError(response, 405, 'Method not allowed.', request.method);
        }
        return sendError(response, 404, 'Route not found.', request.method);
      }
      if (selected.authDigest && !matchesBearerToken(request, selected.authDigest)) {
        request.resume();
        response.setHeader('www-authenticate', 'Bearer');
        return sendError(response, 401, 'A valid bearer token is required.', request.method);
      }
      if (selected.graphRequest && entry.pendingResponses.size >= MAX_PENDING_WEB_RESPONSES) {
        request.resume();
        return sendError(response, 503, 'The web server is handling too many requests.', request.method);
      }
      const body = ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? null : await readRequestBody(request);
      const query = {};
      for (const [name, rawValue] of url.searchParams) {
        const value = /token|secret|password|authorization|cookie|api[_-]?key/i.test(name) ? '[REDACTED]' : rawValue;
        if (Object.hasOwn(query, name)) query[name] = Array.isArray(query[name]) ? [...query[name], value] : [query[name], value];
        else query[name] = value;
      }
      const publicUrl = new URL(request.url || '/', 'http://localhost');
      for (const name of new Set(publicUrl.searchParams.keys())) {
        if (/token|secret|password|authorization|cookie|api[_-]?key/i.test(name)) publicUrl.searchParams.set(name, '[REDACTED]');
      }
      const requestInfo = {
        method: request.method,
        url: `${publicUrl.pathname}${publicUrl.search}`,
        path: requestPath,
        headers: Object.fromEntries(Object.entries(request.headers).filter(([name]) => !/authorization|cookie|token|secret|password|api[_-]?key/i.test(name)).map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value || '']))
      };
      const locals = { query, request: requestInfo, params: selected.params || {}, body };
      for (let index = 1; index <= 50; index += 1) locals[`arg${index}`] = safeConfig[`arg${index}`] ?? '';
      if (selected.graphRequest) {
        if (typeof entry.dispatchGraphEvent !== 'function') return sendError(response, 503, 'Graph request handlers are unavailable in this runtime.', request.method);
        const requestId = randomUUID();
        const pending = createPendingWebResponse(entry, request, response, requestId, context, runtime.graphId);
        const payload = {
          requestId,
          routeId: selected.routeId,
          webServerId: entry.serverId,
          method: request.method,
          path: requestPath,
          query,
          params: selected.params || {},
          headers: requestInfo.headers,
          body,
          request: requestInfo
        };
        Promise.resolve(entry.dispatchGraphEvent('WEB_SERVER_REQUEST', payload, runtime.graphId))
          .then(() => pending.fail(500, 'The request flow finished without a Respond to Web Request node.'))
          .catch(() => pending.fail(500, 'The request flow could not be completed.'));
        await pending.completion;
        return;
      }
      const mediaContents = selected.asset
        ? resolveManagedMediaAsset(selected.asset, context)
        : resolveManagedMediaFile(selected.body, context);
      if (mediaContents === null && (selected.asset || isProjectMediaPath(selected.body, context))) {
        log(`[Web Server] ${request.method} ${requestPath} failed because linked project media could not be verified or resolved.`, 'WARN');
        return sendError(response, 500, 'The linked project media file could not be verified, is missing, or has an ambiguous filename.', request.method);
      }
      const source = mediaContents === null ? selected.body : mediaContents.bytes;
      const payloadValue = selected.isJsonBody
        ? JSON.stringify(renderEjsValue(source, locals))
        : selected.isEjs ? renderSafeEjs(Buffer.isBuffer(source) ? source.toString('utf8') : source, locals, isJsonContentType(selected.contentType || mediaContents?.contentType) ? 'json' : true) : source;
      const responseHasNoBody = [204, 205, 304].includes(selected.status);
      const payload = responseHasNoBody ? Buffer.alloc(0) : Buffer.isBuffer(payloadValue) ? payloadValue : Buffer.from(String(payloadValue ?? ''), 'utf8');
      if (payload.length > MAX_RESPONSE_BYTES) return sendError(response, 413, 'Response exceeds 20 MB.', request.method);
      response.writeHead(selected.status, {
        ...selected.headers,
        'content-type': selected.contentType || (selected.isEjs ? 'text/html; charset=utf-8' : '') || mediaContents?.contentType || DEFAULT_CONTENT_TYPES[path.extname(requestPath).toLowerCase()] || 'application/octet-stream',
        ...(!responseHasNoBody ? { 'content-length': payload.length } : {}),
        'cache-control': selected.headers['cache-control'] || 'no-store',
        'x-content-type-options': 'nosniff',
        ...(request.method === 'OPTIONS' ? { allow: 'OPTIONS' } : {})
      });
      response.end(request.method === 'HEAD' ? undefined : payload);
    } catch (error) {
      const routeLabel = String(request.url || '/').split('?')[0].slice(0, 512);
      log(`[Web Server] ${request.method} ${routeLabel} failed: ${error.message || 'Response handling error.'}`, 'WARN');
      if (!response.headersSent) sendError(response, error.statusCode || 500, error.statusCode ? error.message : 'The response template could not be rendered.', request.method);
      else response.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = MAX_PENDING_WEB_RESPONSES;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  entry.server = server;
  servers.set(key, entry);
  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen({ port, host, exclusive: true });
    });
  } catch (error) {
    entry.starting = false;
    if (servers.get(key) === entry) servers.delete(key);
    return fail(error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Choose another port or stop the process using it.`
      : error.code === 'EACCES' ? `Permission denied while binding ${host}:${port}.` : `Could not bind ${host}:${port}: ${error.message}`);
  }
  entry.starting = false;
  if (entry.cancelled) {
    if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
    return fail('The project stopped while the web server was starting.');
  }
  const activePort = server.address()?.port || port;
  for (let index = 1; index <= 50; index += 1) safeConfig[`arg${index}`] = resolveInput(`arg_${index}`, '');
  entry.port = activePort;
  const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const address = `http://${displayHost}:${activePort}${routePath}`;
  setOutput('started', true);
  setOutput('port', activePort);
  setOutput('web_server_id', node.id);
  setOutput('url', address);
  setOutput('error', '');
  log(`[Web Server] Listening on ${address}${displayHost !== host ? ` (bound to ${host})` : ''}.`);
  return true;
}

function findProjectServer(context, graphId, serverId) {
  const normalizedId = String(serverId || '').trim();
  return normalizedId ? servers.get(serverKey(context, graphId, normalizedId)) : null;
}

function registerRoute(node, runtime) {
  const { resolveInput, setOutput, context, log } = runtime;
  const fail = (message) => {
    setOutput('registered', false);
    setOutput('error', message);
    log(`[Web Server] Route registration failed: ${message}`, 'WARN');
    return true;
  };
  if (context?.mock) return fail('Web routes are disabled in the Offline Simulator.');
  const entry = findProjectServer(context, runtime.graphId, resolveInput('web_server_id', node.data?.web_server_id));
  if (!entry || entry.cancelled || !entry.server?.listening) return fail('Start the selected web server before registering routes.');
  const method = String(resolveInput('method', 'GET')).trim().toUpperCase();
  let routePath;
  try { routePath = validateRoutePattern(normalizeRoutePath(resolveInput('path', '/'))); }
  catch (error) { return fail(error.message); }
  if (!ROUTE_METHODS.has(method)) return fail('Choose GET, HEAD, POST, PUT, PATCH, DELETE, or OPTIONS.');
  const status = Number(resolveInput('status', 200));
  const contentType = String(resolveInput('content_type', 'text/html; charset=utf-8')).trim();
  const template = String(resolveInput('response', ''));
  let authToken;
  try { authToken = readBearerToken(resolveInput('auth_token', node.data?.auth_token)); }
  catch (error) { return fail(error.message); }
  if (!Number.isInteger(status) || status < 200 || status > 599) return fail('Response status must be an integer from 200 to 599.');
  if (!contentType || contentType.length > 128 || /[\r\n]/.test(contentType)) return fail('Response content type is invalid.');
  if (Buffer.byteLength(template, 'utf8') > MAX_TEMPLATE_BYTES) return fail('The response template exceeds 256 KB.');
  let normalized;
  try { normalized = normalizeContent(template, contentType, status, responseHeaders(resolveInput('headers_json', '{}'))); }
  catch (error) { return fail(error.message); }
  const key = routePatternKey(method, routePath);
  const shadowsFile = ['GET', 'HEAD'].includes(method) && [...entry.files.keys()].some((filePath) => matchRoute(routePath, filePath));
  if (entry.routes.has(key) || shadowsFile) {
    return fail(`${method} ${routePath} is already registered on this web server.`);
  }
  if (entry.routes.size + entry.files.size >= 200) return fail('This web server already has the maximum of 200 routes and files.');
  entry.routes.set(key, {
    ...normalized,
    path: routePath,
    method,
    isEjs: true,
    params: {},
    ...(authToken ? { authDigest: secretDigest(authToken) } : {})
  });
  setOutput('registered', true);
  setOutput('error', '');
  log(`[Web Server] Registered ${method} ${routePath}${authToken ? ' with bearer authentication' : ' without authentication'}.`, authToken ? 'INFO' : 'WARN');
  return true;
}

function respondToWebRequest(node, runtime) {
  const { resolveInput, setOutput, context, log } = runtime;
  const fail = (message) => {
    setOutput('responded', false);
    setOutput('error', message);
    log(`[Web Server] Response failed: ${message}`, 'WARN');
    return true;
  };
  const requestId = String(resolveInput('request_id', node.data?.request_id) || '').trim();
  if (context?.mock) {
    try {
      const normalized = normalizeContent(
        resolveInput('body', node.data?.body ?? ''),
        String(resolveInput('content_type', node.data?.content_type || 'application/json; charset=utf-8')).trim(),
        resolveInput('status', node.data?.status ?? 200),
        responseHeaders(resolveInput('headers_json', node.data?.headers_json || '{}'))
      );
      const payload = normalized.isJsonBody ? structuredClone(normalized.body) : normalized.body;
      if (Buffer.byteLength(Buffer.isBuffer(payload) ? payload : String(payload ?? ''), 'utf8') > MAX_RESPONSE_BYTES) return fail('Response exceeds 20 MB.');
      context.interceptedOutputs?.push({
        type: 'WEB_SERVER_RESPONSE',
        requestId,
        status: normalized.status,
        contentType: normalized.contentType || 'application/octet-stream',
        headers: normalized.headers,
        body: payload,
        timestamp: new Date().toISOString()
      });
      setOutput('responded', true);
      setOutput('error', '');
      return true;
    } catch (error) {
      return fail(error.message || 'The simulated response is invalid.');
    }
  }
  const pending = pendingWebResponses.get(webRequestKey(context, runtime.graphId, requestId));
  if (!pending) return fail('This HTTP request is no longer waiting for a response.');
  try {
    const normalized = normalizeContent(
      resolveInput('body', node.data?.body ?? ''),
      String(resolveInput('content_type', node.data?.content_type || 'application/json; charset=utf-8')).trim(),
      resolveInput('status', node.data?.status ?? 200),
      responseHeaders(resolveInput('headers_json', node.data?.headers_json || '{}'))
    );
    if (!pending.complete(normalized)) return fail('This HTTP request already received a response.');
    setOutput('responded', true);
    setOutput('error', '');
    return true;
  } catch (error) {
    pending.fail(500, 'The configured graph response is invalid.');
    return fail(error.message || 'The response is invalid.');
  }
}

function registerStaticFile(node, runtime) {
  const { resolveInput, setOutput, context, log } = runtime;
  const fail = (message) => {
    setOutput('registered', false);
    setOutput('error', message);
    log(`[Web Server] Static file registration failed: ${message}`, 'WARN');
    return true;
  };
  if (context?.mock) return fail('Static file routes are disabled in the Offline Simulator.');
  const entry = findProjectServer(context, runtime.graphId, resolveInput('web_server_id', node.data?.web_server_id));
  if (!entry || entry.cancelled || !entry.server?.listening) return fail('Start the selected web server before registering static files.');
  let routePath;
  try { routePath = normalizeRoutePath(resolveInput('path', '/')); }
  catch (error) { return fail(error.message); }
  const asset = String(resolveInput('asset', '') || '').trim();
  if (!asset || asset.length > 512 || /[\r\n\0]/.test(asset)) return fail('Choose an uploaded project media asset for this path.');
  const mediaMatches = readProjectMediaManifest(context).filter((item) => item.id === asset
    || String(item.filename || '').toLowerCase() === asset.toLowerCase());
  if (mediaMatches.length !== 1) return fail('The selected project media file is missing or has an ambiguous filename.');
  const mediaAsset = mediaMatches[0];
  let authToken;
  try { authToken = readBearerToken(resolveInput('auth_token', node.data?.auth_token)); }
  catch (error) { return fail(error.message); }
  const contentType = String(resolveInput('content_type', '')).trim();
  const status = Number(resolveInput('status', 200));
  let normalized;
  try { normalized = normalizeContent('', contentType, status, responseHeaders(resolveInput('headers_json', '{}'))); }
  catch (error) { return fail(error.message); }
  if (entry.files.has(routePath) || [...entry.routes.values()].some((route) => ['GET', 'HEAD'].includes(route.method) && matchRoute(route.path, routePath))) {
    return fail(`GET ${routePath} is already registered on this web server.`);
  }
  if (entry.routes.size + entry.files.size >= 200) return fail('This web server already has the maximum of 200 routes and files.');
  entry.files.set(routePath, {
    ...normalized,
    asset: mediaAsset.id,
    isEjs: path.extname(mediaAsset.filename || '').toLowerCase() === '.ejs' || path.extname(routePath).toLowerCase() === '.ejs',
    ...(authToken ? { authDigest: secretDigest(authToken) } : {})
  });
  setOutput('registered', true);
  setOutput('error', '');
  log(`[Web Server] Registered static file ${routePath} from project media.`);
  return true;
}

async function stopOneServer(node, runtime) {
  const { resolveInput, setOutput, context, log } = runtime;
  if (context?.mock) {
    setOutput('stopped', false);
    setOutput('error', 'Web servers are disabled in the Offline Simulator.');
    return true;
  }
  const serverId = String(resolveInput('web_server_id', node.data?.web_server_id) || '').trim();
  const entry = findProjectServer(context, runtime.graphId, serverId);
  if (!entry) {
    setOutput('stopped', false);
    setOutput('error', serverId ? 'The selected web server is not running in this project.' : 'Choose a web server to stop.');
    return true;
  }
  try {
    await stopEntry(serverKey(context, runtime.graphId, serverId), entry);
    setOutput('stopped', true);
    setOutput('error', '');
    log(`[Web Server] Stopped server ${serverId}.`);
  } catch (error) {
    setOutput('stopped', false);
    setOutput('error', error.message || 'Could not stop the selected web server.');
    log(`[Web Server] Stop failed: ${error.message || 'Unknown error.'}`, 'WARN');
  }
  return true;
}

export async function closeProjectWebServers(projectDir = 'default-project') {
  const prefix = `${String(projectDir)}:`;
  const entries = [...servers.entries()].filter(([key]) => key.startsWith(prefix));
  const results = await Promise.allSettled(entries.map(([key, entry]) => stopEntry(key, entry)));
  return results.filter((result) => result.status === 'fulfilled').length;
}

export async function closeGraphWebServers(projectDir = 'default-project', graphId = '') {
  const prefix = `${String(projectDir)}:${String(graphId)}:`;
  const entries = [...servers.entries()].filter(([key]) => key.startsWith(prefix));
  const results = await Promise.allSettled(entries.map(([key, entry]) => stopEntry(key, entry)));
  return results.filter((result) => result.status === 'fulfilled').length;
}

export async function closeAllWebServers() {
  const results = await Promise.allSettled([...servers.entries()].map(([key, entry]) => stopEntry(key, entry)));
  return results.filter((result) => result.status === 'fulfilled').length;
}

export async function executeWebServerNode(node, runtime) {
  const { setOutput, context, log } = runtime;
  if (node?.type === 'action_web_server_start') return startServer(node, runtime);
  if (node?.type === 'action_web_server_route') return registerRoute(node, runtime);
  if (node?.type === 'action_web_server_static_file') return registerStaticFile(node, runtime);
  if (node?.type === 'action_web_server_response') return respondToWebRequest(node, runtime);
  if (node?.type === 'action_web_server_stop_one') return stopOneServer(node, runtime);
  if (node?.type !== 'action_web_server_stop') return false;
  if (context?.mock) {
    setOutput('stopped', 0);
    setOutput('error', 'Web servers are disabled in the Offline Simulator.');
    log('[Web Server] Stop skipped in Offline Simulator.', 'WARN');
    return true;
  }
  try {
    const stopped = await closeProjectWebServers(projectKey(context));
    setOutput('stopped', stopped);
    setOutput('error', '');
    log(`[Web Server] Stopped ${stopped} project server${stopped === 1 ? '' : 's'}.`);
  } catch (error) {
    setOutput('stopped', 0);
    setOutput('error', error.message || 'Could not stop project web servers.');
    log(`[Web Server] Stop failed: ${error.message || 'Unknown error.'}`, 'WARN');
  }
  return true;
}

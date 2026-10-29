import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, sep } from 'node:path';
import fs from 'node:fs';

import { serverConfig } from './config.js';
import { Logger } from './engine/Logger.js';
import { UserStore } from './security/UserStore.js';
import { StartupDiagnostics } from './engine/StartupDiagnostics.js';
import { BotManager } from './engine/BotManager.js';
import { createApiRouter } from './routes/api.js';
import { createBotManagerProxy } from './engine/RequestBotManager.js';
import { CollaborationLastSeen } from './storage/CollaborationLastSeen.js';
import { isArcStudioClientVersionAllowed } from './versioning/arcProjectCompatibility.js';
import { NodeDefinitions, NODE_SCHEMA_VERSION, CLIENT_PROTOCOL_VERSION, getNodeRegistryPayload } from './engine/NodeRegistry.js';
import { getNodeRegistryCompatibility, getNodeRegistryRequiredFeatures, NODE_REGISTRY_PROTOCOL_VERSION } from './engine/NodeRegistryContract.js';
import { isKnownArcStudioClient, readClientAccessSettings } from './security/ClientAccessPolicy.js';
import { getActiveCollaborators, getCollaboratorColor, MAX_REALTIME_COLLABORATORS } from './engine/CollaborationLimits.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = new Logger();
const requiredNodeRegistryFeatures = () => getNodeRegistryRequiredFeatures(Object.values(NodeDefinitions));
//
function sendWebSocketProblem(ws, { code, status, title, detail, extensions = {} }) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const requestId = randomUUID();
  ws.send(JSON.stringify({
    type: 'PROBLEM',
    protocolVersion: CLIENT_PROTOCOL_VERSION,
    payload: {
      type: `urn:arc-studio:problem:${String(code || 'websocket-error').toLowerCase().replace(/[^a-z0-9.-]+/g, '-')}`,
      code,
      status,
      title,
      detail,
      instance: `urn:arc-studio:request:${requestId}`,
      requestId,
      retryable: status >= 500,
      ...extensions
    }
  }));
}

const diagnostics = StartupDiagnostics.run();
const requiredEnvironmentFailure = diagnostics.checks.find((check) => check.name === 'Environment Variables' && check.status === 'FAIL');
if (requiredEnvironmentFailure) {
  const message = `[Startup] ${requiredEnvironmentFailure.message}. Set the value in .env or the server environment before starting ARC Studio.`;
  console.error(message);
  logger.log('ERROR', message);
  await new Promise((resolveClose) => logger.close(resolveClose));
  process.exit(1);
}
const userStore = new UserStore();
const collaborationLastSeen = new CollaborationLastSeen();

const app = express();
const server = http.createServer(app);
let websocketProxyWarningLogged = false;
server.on('upgrade', (request, socket) => {
  let pathname = '';
  try { pathname = new URL(request.url || '/', 'http://localhost').pathname; } catch {}
  if (pathname && pathname !== '/ws' && !websocketProxyWarningLogged) {
    websocketProxyWarningLogged = true;
    logger.log('WARN', `Received a WebSocket upgrade request for ${pathname}. ARC Studio expects /ws.`);
  }
  if (pathname && pathname !== '/ws') socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 40 * 1024 * 1024 });
//
const liveGraphStates = new Map();
const liveGraphAutosaveTimers = new Map();
const liveGraphAutosaveFailures = new Set();
const liveCollaborationActions = new Map();
const liveGraphChatBubbles = new Map();
const liveCanvasArrows = new Map();
const liveCollaborationStudioDrafts = new Map();
const liveNoteEditLocks = new Map();
const recentProjectGraphUse = new Map();
let collaborationActionRevision = 0;
const nextCollaborationActionRevision = () => ++collaborationActionRevision;
const NOTE_EDIT_LOCK_TTL_MS = 15_000;
const COLLAB_CURSOR_IDLE_MS = 30_000;
const activeWorkspaceCollaborators = () => getActiveCollaborators(wss.clients, WebSocket.OPEN);
const collaboratorColor = (id) => getCollaboratorColor(id, activeWorkspaceCollaborators());
const collaborationRoomKey = (projectId, graphId) => `${projectId}:${graphId}`;
const sendToCollaborationRoom = (roomKey, data, excludedClient = null) => {
  const serialized = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client !== excludedClient && client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcRoomKey === roomKey) client.send(serialized);
  }
};
const removeGraphChatBubble = (roomKey, bubbleId) => {
  const room = liveGraphChatBubbles.get(roomKey);
  const entry = room?.get(bubbleId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  room.delete(bubbleId);
  if (!room.size) liveGraphChatBubbles.delete(roomKey);
  sendToCollaborationRoom(roomKey, { type: 'GRAPH_CHAT_EXPIRED', payload: { projectId: entry.bubble.projectId, graphId: entry.bubble.graphId, id: bubbleId } });
  return true;
};
const removeCanvasArrow = (roomKey, arrowId, type = 'CANVAS_ARROW_EXPIRED') => {
  const room = liveCanvasArrows.get(roomKey);
  const entry = room?.get(arrowId);
  if (!entry) return false;
  clearTimeout(entry.timer);
  room.delete(arrowId);
  if (!room.size) liveCanvasArrows.delete(roomKey);
  sendToCollaborationRoom(roomKey, { type, payload: { projectId: entry.arrow.projectId, graphId: entry.arrow.graphId, id: arrowId } });
  return true;
};
const sendCanvasArrowSnapshot = (client, roomKey) => {
  const room = liveCanvasArrows.get(roomKey);
  const arrows = [...(room?.values() || [])].map(({ arrow }) => arrow).filter((arrow) => arrow.expiresAt > Date.now());
  if (arrows.length) client.send(JSON.stringify({ type: 'CANVAS_ARROWS_SYNC', payload: { arrows } }));
};
const canvasArrowPoint = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y)
  && Math.abs(value.x) <= 1_000_000 && Math.abs(value.y) <= 1_000_000
  ? { x: Math.round(value.x), y: Math.round(value.y) }
  : null;
const collaborationRoleRank = (role) => ({ viewer: 1, operator: 2, editor: 3, admin: 4 }[String(role || '').toLowerCase()] || 0);
const canManageLockedCanvasArrow = (user, arrow, projectId) => Boolean(user && arrow && (
  arrow.createdById === user.id
  || projectStore.projects.find((project) => project.id === projectId)?.ownerId === user.id
  || collaborationRoleRank(user.role) > collaborationRoleRank(arrow.createdByRole)
));
const sendGraphChatSnapshot = (client, roomKey) => {
  const room = liveGraphChatBubbles.get(roomKey);
  if (!room) return;
  const now = Date.now();
  for (const [bubbleId, entry] of room) {
    if (entry.bubble.expiresAt <= now) removeGraphChatBubble(roomKey, bubbleId);
    else client.send(JSON.stringify({ type: 'GRAPH_CHAT_BUBBLE', payload: entry.bubble }));
  }
};
const noteLockSnapshot = (roomKey) => [...(liveNoteEditLocks.get(roomKey)?.values() || [])]
  .map(({ timer, socket, note, ...lock }) => lock);
const sameCollaborationValue = (left, right) => {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => sameCollaborationValue(value, right[index]));
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => Object.hasOwn(right, key) && sameCollaborationValue(left[key], right[key]));
};
const cloneCollaborationValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function mergeConcurrentGraphValue(base, current, incoming) {
  if (sameCollaborationValue(incoming, base)) return cloneCollaborationValue(current);
  if (sameCollaborationValue(current, base) || sameCollaborationValue(incoming, current)) return cloneCollaborationValue(incoming);
  if (base && current && incoming && !Array.isArray(base) && !Array.isArray(current) && !Array.isArray(incoming)
    && typeof base === 'object' && typeof current === 'object' && typeof incoming === 'object') {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(incoming)])) {
      const value = mergeConcurrentGraphValue(base[key], current[key], incoming[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if ([base, current, incoming].every((value) => Array.isArray(value) && value.every((item) => item && typeof item === 'object' && item.id != null))) {
    const baseById = new Map(base.map((item) => [item.id, item]));
    const currentById = new Map(current.map((item) => [item.id, item]));
    const incomingById = new Map(incoming.map((item) => [item.id, item]));
    const order = [...current.map((item) => item.id), ...incoming.map((item) => item.id)].filter((id, index, ids) => ids.indexOf(id) === index);
    const result = [];
    for (const id of order) {
      const value = mergeConcurrentGraphValue(baseById.get(id), currentById.get(id), incomingById.get(id));
      if (value !== undefined) result.push(value);
    }
    return result;
  }
  return cloneCollaborationValue(incoming);
}
const publishNoteEditLocks = (roomKey) => {
  const [projectId, ...graphParts] = roomKey.split(':');
  sendToCollaborationRoom(roomKey, {
    type: 'NOTE_EDIT_LOCKS_UPDATED',
    payload: { projectId, graphId: graphParts.join(':'), locks: noteLockSnapshot(roomKey) }
  });
};
function publishPresence() {
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.readyState !== WebSocket.OPEN || !client.arcPresence) continue;
    const peers = [...wss.clients].filter((peer) => peer !== client && peer.arcAuthenticated && peer.readyState === WebSocket.OPEN
      && peer.arcPresence?.projectId === client.arcPresence.projectId && peer.arcPresence?.graphId === client.arcPresence.graphId)
      .map((peer) => ({ id: peer.arcUser?.id, username: peer.arcUser?.username, color: peer.arcColor || collaboratorColor(peer.arcUser?.id) }))
      .filter((user) => user.id && user.username)
      .filter((user, index, users) => users.findIndex((item) => item.id === user.id) === index);
    client.send(JSON.stringify({ type: 'COLLABORATORS_UPDATED', payload: peers }));
  }
  const projectUsers = new Map();
  for (const peer of wss.clients) {
    if (!peer.arcAuthenticated || peer.readyState !== WebSocket.OPEN || !peer.arcProjectId || !peer.arcUser?.username) continue;
    const members = projectUsers.get(peer.arcProjectId) || [];
    if (!members.some((member) => member.id === peer.arcUser.id)) members.push({ id: peer.arcUser.id, username: peer.arcUser.username });
    projectUsers.set(peer.arcProjectId, members);
  }
  const payload = Object.fromEntries(projectUsers);
  for (const client of wss.clients) if (client.arcAuthenticated && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'PROJECT_USERS_UPDATED', payload }));
  const projectIds = new Set([...wss.clients].filter((client) => client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcProjectId).map((client) => client.arcProjectId));
  for (const projectId of projectIds) publishProjectCollaboration(projectId);
}
function publishProjectCollaboration(projectId) {
  if (!projectId) return;
  const clients = [...wss.clients].filter((client) => client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcProjectId === projectId);
  if (!clients.length) return;
  const users = new Map();
  for (const client of clients) {
    const user = client.arcUser;
    if (!user?.id || !user.username) continue;
    let collaborator = users.get(user.id);
    if (!collaborator) {
      collaborator = { userId: user.id, username: user.username, color: client.arcColor || collaboratorColor(user.id), graphIds: [] };
      users.set(user.id, collaborator);
    }
    const graphId = client.arcPresence?.projectId === projectId ? client.arcPresence.graphId : '';
    if (graphId && !collaborator.graphIds.includes(graphId)) collaborator.graphIds.push(graphId);
  }
  const openGraphIds = new Set();
  let tabsInitialized = false;
  for (const client of clients) {
    tabsInitialized ||= client.arcTabsInitialized === true;
    for (const graphId of client.arcOpenGraphIds || []) openGraphIds.add(graphId);
  }
  const now = Date.now();
  for (const client of clients) {
    const currentUserId = String(client.arcUser?.id || '');
    const activity = new Map(collaborationLastSeen.graphSnapshot(projectId, currentUserId).map((entry) => [entry.graphId, entry]));
    const addOtherUserActivity = (graphId, userId, updatedAt) => {
      if (!graphId || !userId || String(userId) === currentUserId) return;
      const previous = activity.get(graphId);
      if (!previous || Number(previous.updatedAt) < Number(updatedAt)) activity.set(graphId, { graphId, userId: String(userId), updatedAt });
    };
    for (const state of liveGraphStates.values()) {
      if (state.projectId !== projectId || now - state.updatedAt > 30 * 60 * 1000 || !state.user?.id) continue;
      addOtherUserActivity(state.graphId, state.user.id, state.updatedAt);
    }
    for (const [key, entry] of recentProjectGraphUse) {
      if (!key.startsWith(`${projectId}:`)) continue;
      if (now - entry.updatedAt > 30 * 60 * 1000) { recentProjectGraphUse.delete(key); continue; }
      addOtherUserActivity(entry.graphId, entry.userId, entry.updatedAt);
    }
    client.send(JSON.stringify({
      type: 'PROJECT_COLLABORATION_UPDATED',
      payload: {
        projectId,
        graphIds: [...openGraphIds].slice(0, 12),
        tabsInitialized,
        graphActivity: [...activity.values()],
        projectLastSeen: collaborationLastSeen.projectSnapshot(currentUserId),
        users: [...users.values()]
      }
    }));
  }
}

function clearDeletedGraphCollaboration(projectId, graphId) {
  if (!projectId || !graphId) return;
  const key = `${projectId}:${graphId}`;
  const room = collaborationRoomKey(projectId, graphId);
  clearTimeout(liveGraphAutosaveTimers.get(key));
  liveGraphAutosaveTimers.delete(key);
  liveGraphAutosaveFailures.delete(key);
  const actions = liveCollaborationActions.get(room);
  if (actions) {
    for (const userId of actions.keys()) sendToCollaborationRoom(room, {
      type: 'COLLAB_ACTION_CLEARED',
      payload: { userId, projectId, graphId, revision: nextCollaborationActionRevision() }
    });
    liveCollaborationActions.delete(room);
  }
  liveGraphStates.delete(key);
  liveCollaborationStudioDrafts.delete(room);
  const locks = liveNoteEditLocks.get(room);
  if (locks) for (const lock of locks.values()) clearTimeout(lock.timer);
  liveNoteEditLocks.delete(room);
  const bubbles = liveGraphChatBubbles.get(room);
  if (bubbles) for (const entry of bubbles.values()) clearTimeout(entry.timer);
  liveGraphChatBubbles.delete(room);
  recentProjectGraphUse.delete(key);

  const message = JSON.stringify({ type: 'GRAPH_DELETED', payload: { projectId, graphId } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcProjectId !== projectId) continue;
    client.arcOpenGraphIds?.delete(graphId);
    if (client.arcPresence?.projectId === projectId && client.arcPresence.graphId === graphId) {
      client.arcPresence = null;
      client.arcRoomKey = null;
      clearTimeout(client.arcActionExpiry);
      client.arcActionExpiry = null;
    }
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
  publishPresence();
}
function broadcastProjectLastSeen() {
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.readyState !== WebSocket.OPEN) continue;
    const payload = collaborationLastSeen.projectSnapshot(client.arcUser?.id || '');
    client.send(JSON.stringify({ type: 'PROJECT_LAST_SEEN_UPDATED', payload }));
  }
}

const desktopOrigins = (process.env.ARC_CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors(desktopOrigins.length ? {
  origin(origin, callback) {
    if (!origin || desktopOrigins.includes(origin)) callback(null, true);
    else callback(new Error('This origin is not allowed to access the local Studio service.'));
  }
} : undefined));
app.use(express.json({ limit: '40mb' }));

function broadcast(data) {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.arcAuthenticated && client.readyState === WebSocket.OPEN) {
      if (data?.type === 'NODE_REGISTRY_UPDATED') {
        const compatibility = getNodeRegistryCompatibility(client.arcClientIdentity, requiredNodeRegistryFeatures());
        if (!compatibility.compatible) {
          sendWebSocketProblem(client, {
            code: 'NODE_REGISTRY_INCOMPATIBLE', status: 426, title: 'Node registry update required',
            detail: 'The workspace node catalog now uses features that this client cannot display safely. Update ARC Studio to a compatible build.',
            extensions: { nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION, unsupportedFeatures: compatibility.unsupportedFeatures, requiredFeatures: compatibility.requiredFeatures }
          });
          client.close(1008, 'Node registry update required.');
          continue;
        }
      }
      client.send(json);
    }
  }
}

function broadcastProject(projectId, data) {
  if (!projectId) return;
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.arcAuthenticated && client.arcProjectId === projectId && client.readyState === WebSocket.OPEN) client.send(json);
  }
}

function notifyUser(userId, data) {
  const json = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.arcAuthenticated && client.arcUser?.id === userId && client.readyState === WebSocket.OPEN) client.send(json);
  }
}

userStore.on('sessionReplacementPending', ({ userId, expiresAt }) => notifyUser(userId, {
  type: 'SESSION_REPLACEMENT_PENDING',
  payload: { expiresAt }
}));
userStore.on('sessionReplaced', ({ userId }) => notifyUser(userId, { type: 'SESSION_REPLACED' }));
userStore.on('sessionExpired', ({ userId, reason }) => notifyUser(userId, { type: 'SESSION_IDLE_EXPIRED', payload: { reason } }));
userStore.on('permissionsUpdated', ({ user }) => {
  const payload = JSON.stringify({ type: 'USER_PERMISSIONS_UPDATED', payload: { user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions || [] } } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcUser?.id !== user.id || client.readyState !== WebSocket.OPEN) continue;
    client.arcUser = { ...client.arcUser, role: user.role, permissions: user.permissions || [] };
    client.send(payload);
  }
});
userStore.on('usernameUpdated', ({ user }) => {
  const payload = JSON.stringify({ type: 'USER_PROFILE_UPDATED', payload: { user: { id: user.id, username: user.username } } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcUser?.id !== user.id || client.readyState !== WebSocket.OPEN) continue;
    client.arcUser = { ...client.arcUser, username: user.username };
    client.send(payload);
  }
  publishPresence();
});
userStore.on('sessionRevoked', ({ userId }) => {
  const payload = JSON.stringify({ type: 'SESSION_REVOKED', payload: { reason: 'admin' } });
  for (const client of wss.clients) {
    if (!client.arcAuthenticated || client.arcUser?.id !== userId || client.readyState !== WebSocket.OPEN) continue;
    client.send(payload, () => client.close(1008, 'Session ended by a workspace administrator.'));
  }
});

logger.onLog((entry) => {
  broadcast({ type: 'LOG_ENTRY', payload: entry });
});

const botManager = new BotManager({ broadcastWS: broadcast, logger });
const projectStore = botManager.projectStore;
const userBotManagers = new Map();
const managerForUser = (user) => {
  const requestedId = projectStore.projects.some((project) => project.id === user?.activeProjectId) ? user.activeProjectId : projectStore.activeProjectId;
  const managerKey = requestedId;
  let manager = userBotManagers.get(managerKey);
  if (!manager) {
    manager = new BotManager({
      projectStore,
      projectId: requestedId,
      logger,
      broadcastWS(message) {
        const json = JSON.stringify(message);
        for (const client of wss.clients) {
          if (client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcPresence?.projectId === requestedId) client.send(json);
        }
      }
    });
    userBotManagers.set(managerKey, manager);
  }
  return manager;
};
managerForUser.stopOtherGateways = async (currentManager) => {
  for (const manager of userBotManagers.values()) {
    if (manager !== currentManager && (manager.status === 'ONLINE' || manager.status === 'CONNECTING')) manager.stopBot();
  }
  if (botManager !== currentManager && (botManager.status === 'ONLINE' || botManager.status === 'CONNECTING')) botManager.stopBot();
};
const scopedBotManager = createBotManagerProxy(botManager);

function scheduleLiveGraphAutosave(projectId, graphId, delayMs = 1200) {
  const key = `${projectId}:${graphId}`;
  if (liveGraphAutosaveTimers.has(key)) return;
  const timer = setTimeout(() => {
    liveGraphAutosaveTimers.delete(key);
    const state = liveGraphStates.get(key);
    if (!state?.graph || projectStore.projects.find((project) => project.id === projectId)?.id !== projectId) return;
    try {
      const manager = managerForUser({ activeProjectId: projectId });
      if (manager.deletedGraphIds?.has(graphId)) return;
      const saved = manager.saveGraph(graphId, state.graph, { quiet: true });
      liveGraphAutosaveFailures.delete(key);
      const latest = liveGraphStates.get(key);
      if (latest?.revision === state.revision) {
        sendToCollaborationRoom(key, { type: 'GRAPH_AUTOSAVED', payload: { projectId, graphId, revision: state.revision, savedAt: Date.now() } });
      }
      return saved;
    } catch (error) {
      if (!liveGraphAutosaveFailures.has(key)) {
        liveGraphAutosaveFailures.add(key);
        logger.log('ERROR', `Could not auto-save collaborative graph ${graphId}: ${error.message}`);
        sendToCollaborationRoom(key, { type: 'GRAPH_AUTOSAVE_FAILED', payload: { projectId, graphId, message: 'The workspace could not save this graph yet. It will retry automatically.' } });
      }
      scheduleLiveGraphAutosave(projectId, graphId, 5000);
    }
  }, delayMs);
  timer.unref?.();
  liveGraphAutosaveTimers.set(key, timer);
}

function flushLiveGraphAutosaves() {
  for (const [key, timer] of liveGraphAutosaveTimers) {
    clearTimeout(timer);
    liveGraphAutosaveTimers.delete(key);
    const state = liveGraphStates.get(key);
    if (!state?.graph) continue;
    try {
      const manager = managerForUser({ activeProjectId: state.projectId });
      if (manager.deletedGraphIds?.has(state.graphId)) continue;
      manager.saveGraph(state.graphId, state.graph, { quiet: true });
    }
    catch (error) { logger.log('ERROR', `Could not flush collaborative graph ${state.graphId} during shutdown: ${error.message}`); }
  }
}

const idleDisconnectTimer = !serverConfig.desktopMode ? setInterval(() => {
  const now = Date.now();
  for (const user of userStore.users) {
    if (!user.activeSessionId) continue;
    const activeSockets = [...wss.clients].filter((client) => client.arcAuthenticated && client.arcUser?.id === user.id && client.readyState === WebSocket.OPEN);
    if (!activeSockets.length) continue;
    const project = projectStore.projects.find((item) => item.id === user.activeProjectId) || projectStore.projects.find((item) => item.id === activeSockets[0].arcProjectId);
    const timeoutMinutes = Number.isInteger(project?.idleDisconnectMinutes) ? project.idleDisconnectMinutes : 15;
    if (timeoutMinutes === 0) continue;
    const timeoutMs = timeoutMinutes * 60_000;
    if (activeSockets.every((socket) => now - (socket.arcLastActivityAt || socket.arcAuthenticatedAt || now) >= timeoutMs)) {
      userStore.expireUserSession(user.id, 'idle');
    }
  }
}, 15_000) : null;
idleDisconnectTimer?.unref?.();

app.use('/api', createApiRouter(
  scopedBotManager,
  userStore,
  logger,
  managerForUser,
  broadcast,
  (userId) => [...wss.clients].some((client) => client.arcAuthenticated && client.arcUser?.id === userId && client.readyState === WebSocket.OPEN),
  clearDeletedGraphCollaboration,
  (projectId, graph) => {
    const state = liveGraphStates.get(`${projectId}:${graph?.id}`);
    if (state?.graph && !sameCollaborationValue(state.graph, graph)) scheduleLiveGraphAutosave(projectId, graph.id, 100);
  },
  broadcastProject,
  () => {
    for (const client of wss.clients) {
      if (!client.arcAuthenticated || client.arcKnownClient !== false || client.readyState !== WebSocket.OPEN) continue;
      sendWebSocketProblem(client, { code: 'CLIENT_NOT_ALLOWED', status: 403, title: 'Client not allowed', detail: 'The workspace owner disabled unknown clients.' });
      client.close(1008, 'Unknown clients are disabled.');
    }
  }
));

app.use('/api', (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  const requestId = randomUUID();
  const code = typeof error?.type === 'string' && /^[a-z0-9_-]+$/i.test(error.type) ? error.type.toUpperCase() : `HTTP_${status}`;
  const title = http.STATUS_CODES[status] || 'Request failed';
  const detail = status >= 500 ? 'The server could not complete the request.' : String(error?.message || title);
  if (status >= 500) logger.log('ERROR', `[API] requestId=${requestId} status=${status} path=${req.path} code=${code}`);
  res.status(status).type('application/problem+json').set('X-Request-Id', requestId).json({
    type: `urn:arc-studio:problem:${code.toLowerCase().replace(/[^a-z0-9.-]+/g, '-')}`,
    title,
    status,
    detail,
    instance: req.path,
    requestId,
    code,
    error: detail
  });
});

app.all('/ws', (req, res) => {
  if (!websocketProxyWarningLogged) {
    websocketProxyWarningLogged = true;
    logger.log('WARN', 'Received a normal HTTP request at /ws. The reverse proxy must forward WebSocket upgrades, not only HTTP requests.');
  }
  res.status(426).json({ error: 'ARC Studio collaboration requires a WebSocket upgrade at /ws. Check reverse proxy WebSocket upgrade settings.' });
});

const clientDistPath = resolve(__dirname, '../../studio-client/dist');
const serverOnlyMode = process.env.ARC_SERVER_ONLY === '1';
if (!serverOnlyMode && fs.existsSync(clientDistPath)) {
  const studioHtmlPath = resolve(clientDistPath, 'index.html');
  const sendStudioPage = (req, res, next) => {
    try {
      const isNightly = String(serverConfig.version).includes('-');
      const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
      const protocol = ['http', 'https'].includes(forwardedProtocol) ? forwardedProtocol : req.protocol;
      const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
      const imageName = isNightly ? 'nightly-icon.png' : 'arc.png';
      const imageUrl = host ? new URL(`/${imageName}`, `${protocol}://${host}`).href : `/${imageName}`;
      let html = fs.readFileSync(studioHtmlPath, 'utf8');
      html = html.replace(/(<meta property="og:image" content=")[^"]+("\s*\/>)/, (_match, prefix, suffix) => `${prefix}${imageUrl}${suffix}`);
      html = html.replace(/(<meta name="twitter:image" content=")[^"]+("\s*\/>)/, (_match, prefix, suffix) => `${prefix}${imageUrl}${suffix}`);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  };
  app.get('/', sendStudioPage);
  app.use(express.static(clientDistPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
      } else if (filePath.includes(`${sep}assets${sep}`)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('/assets/*', (_req, res) => {
    res.set('Cache-Control', 'no-store').status(404).type('text/plain').send('ARC Studio client asset not found. Refresh the page to load the current version.');
  });
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      sendStudioPage(req, res, (error) => {
        if (error) logger.log('ERROR', `Could not serve Studio page: ${error.message}`);
        if (!res.headersSent) res.status(500).send('Could not load ARC Studio.');
      });
    }
  });
} else if (serverOnlyMode) {
  const clientPublicPath = resolve(__dirname, '../../studio-client/public');
  const serverOnlyHtmlPath = resolve(__dirname, '../public/server-only.html');
  const offlineHtmlPath = resolve(clientPublicPath, 'offline.html');
  const serviceWorkerPath = resolve(clientPublicPath, 'service-worker.js');
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
  const sendStaticFile = (filename, contentType, cacheControl) => (_req, res, next) => {
    res.set('Cache-Control', cacheControl);
    res.type(contentType).sendFile(filename, (error) => {
      if (error) next(error);
    });
  };
  const sendServerOnlyPage = (req, res, next) => {
    try {
      const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
      const protocol = ['http', 'https'].includes(forwardedProtocol) ? forwardedProtocol : req.protocol;
      const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
      const host = forwardedHost || req.get('host');
      const workspaceUrl = new URL('/', `${protocol}://${host}`).href;
      const isNightly = String(serverConfig.version).includes('-');
      const logo = isNightly ? '/nightly-icon.png' : '/arc.png';
      const html = fs.readFileSync(serverOnlyHtmlPath, 'utf8')
        .replaceAll('__WORKSPACE_URL__', escapeHtml(workspaceUrl))
        .replaceAll('__SERVER_VERSION__', escapeHtml(serverConfig.version))
        .replaceAll('__CHEZCORD_VERSION__', escapeHtml(serverConfig.chezcordVersion))
        .replaceAll('__LOGO__', logo)
        .replaceAll('__RELEASE_CHANNEL__', isNightly ? 'nightly' : 'stable');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.type('html').send(html);
    } catch (error) {
      next(error);
    }
  };
  app.get('/', sendServerOnlyPage);
  app.get('/service-worker.js', sendStaticFile(serviceWorkerPath, 'javascript', 'no-cache'));
  app.get('/offline.html', sendStaticFile(offlineHtmlPath, 'html', 'no-cache'));
  app.get('/arc.png', sendStaticFile(resolve(clientPublicPath, 'arc.png'), 'png', 'public, max-age=86400'));
  app.get('/nightly-icon.png', sendStaticFile(resolve(clientPublicPath, 'nightly-icon.png'), 'png', 'public, max-age=86400'));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) return sendServerOnlyPage(req, res, next);
    return next();
  });
}
//
wss.on('connection', (ws, request) => {
  ws.arcAuthenticated = false;
  ws.arcClientOrigin = String(request.headers.origin || '');
  ws.arcRequestHeaders = request.headers;
  ws.arcOpenGraphIds = new Set();
  ws.arcTabsInitialized = false;
  const authTimeout = setTimeout(() => {
    if (!ws.arcAuthenticated && ws.readyState === WebSocket.OPEN) ws.close(1008, 'Authentication required.');
  }, 5000);
  authTimeout.unref?.();
  const clearCollaborationAction = (leaveRoom = true, clearDrafts = true, studioId = '') => {
    clearTimeout(ws.arcActionExpiry);
    ws.arcActionExpiry = null;
    const roomKey = ws.arcRoomKey;
    if (!roomKey || !ws.arcUser?.id) return;
    const room = liveCollaborationActions.get(roomKey);
    const previous = room?.get(ws.arcUser.id);
    if (room?.delete(ws.arcUser.id)) sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_CLEARED', payload: { userId: ws.arcUser.id, projectId: previous?.projectId || '', graphId: previous?.graphId || '', revision: nextCollaborationActionRevision() } }, ws);
    if (!room?.size) liveCollaborationActions.delete(roomKey);
    if (clearDrafts) {
      const drafts = liveCollaborationStudioDrafts.get(roomKey);
      if (drafts) {
        for (const [key, draft] of drafts) if (draft.userId === ws.arcUser.id && (!studioId || draft.action.studioId === studioId)) drafts.delete(key);
        if (!drafts.size) liveCollaborationStudioDrafts.delete(roomKey);
      }
    }
    if (leaveRoom) ws.arcRoomKey = null;
  };
  const scheduleCollaborationActionExpiry = () => {
    clearTimeout(ws.arcActionExpiry);
    const roomKey = ws.arcRoomKey;
    if (!roomKey || !ws.arcUser?.id) { ws.arcActionExpiry = null; return; }
    ws.arcActionExpiry = setTimeout(() => {
      const activeRoom = liveCollaborationActions.get(roomKey);
      const active = activeRoom?.get(ws.arcUser?.id);
      if (active?.action?.selectedNodeIds?.length) {
        const selection = {
          ...active,
          action: { kind: 'selection', mode: 'select', selectedNodeIds: active.action.selectedNodeIds, ...(active.action.cursor ? { cursor: active.action.cursor, cursorIdle: true } : {}) },
          updatedAt: Date.now(),
          revision: nextCollaborationActionRevision()
        };
        activeRoom.set(ws.arcUser.id, selection);
        sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: selection }, ws);
      } else if (active?.action?.cursor) {
        const idleCursor = { ...active, action: { kind: 'idle', cursor: active.action.cursor }, updatedAt: Date.now(), revision: nextCollaborationActionRevision() };
        activeRoom.set(ws.arcUser.id, idleCursor);
        sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: idleCursor }, ws);
      } else clearCollaborationAction(false, false);
      ws.arcActionExpiry = null;
    }, COLLAB_CURSOR_IDLE_MS);
    ws.arcActionExpiry.unref?.();
  };
  const removeNoteEditLock = (roomKey, noteId, { expired = false } = {}) => {
    const room = liveNoteEditLocks.get(roomKey);
    const lock = room?.get(noteId);
    if (!lock) return false;
    clearTimeout(lock.timer);
    room.delete(noteId);
    if (!room.size) liveNoteEditLocks.delete(roomKey);
    if (expired && lock.socket?.readyState === WebSocket.OPEN) {
      const graph = liveGraphStates.get(`${lock.projectId}:${lock.graphId}`)?.graph;
      const note = graph?.notes?.find((item) => item.id === noteId) || lock.note || null;
      lock.socket.send(JSON.stringify({ type: 'NOTE_EDIT_LOCK_LOST', payload: { projectId: lock.projectId, graphId: lock.graphId, noteId, note } }));
    }
    publishNoteEditLocks(roomKey);
    return true;
  };
  const clearNoteEditLocksForSocket = (socket, roomFilter = null, deferUntilExpiry = false) => {
    const changedRooms = new Set();
    for (const [roomKey, room] of liveNoteEditLocks) {
      if (roomFilter && roomFilter !== roomKey) continue;
      for (const [noteId, lock] of room) {
        if (lock.socket !== socket) continue;
        if (deferUntilExpiry && lock.expiresAt > Date.now()) continue;
        clearTimeout(lock.timer);
        room.delete(noteId);
        changedRooms.add(roomKey);
      }
      if (!room.size) liveNoteEditLocks.delete(roomKey);
    }
    for (const roomKey of changedRooms) publishNoteEditLocks(roomKey);
  };
  ws.on('close', () => { clearTimeout(authTimeout); clearCollaborationAction(); clearNoteEditLocksForSocket(ws, null, true); publishPresence(); });
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!ws.arcAuthenticated) {
        if (msg.type === 'AUTH' && msg.protocolVersion !== CLIENT_PROTOCOL_VERSION) {
          sendWebSocketProblem(ws, { code: 'CLIENT_PROTOCOL_INCOMPATIBLE', status: 426, title: 'Client protocol update required', detail: 'Update the client to a build that supports this workspace protocol.', extensions: { requiredProtocolVersion: CLIENT_PROTOCOL_VERSION } });
          ws.close(1008, 'Client protocol update required.');
          return;
        }
        if (msg.type === 'AUTH' && !isArcStudioClientVersionAllowed(msg.clientVersion, serverConfig.minimumClientVersion)) {
          sendWebSocketProblem(ws, { code: 'CLIENT_VERSION_BLOCKED', status: 426, title: 'Client update required', detail: `Update ARC Studio to ${serverConfig.minimumClientVersion} or newer.`, extensions: { clientVersion: typeof msg.clientVersion === 'string' ? msg.clientVersion : null, minimumVersion: serverConfig.minimumClientVersion } });
          ws.close(1008, 'Client update required.');
          return;
        }
        const clientRegistry = msg.clientIdentity || msg;
        const registryCompatibility = getNodeRegistryCompatibility(clientRegistry, requiredNodeRegistryFeatures());
        if (msg.type === 'AUTH' && !registryCompatibility.compatible) {
          sendWebSocketProblem(ws, {
            code: 'NODE_REGISTRY_INCOMPATIBLE', status: 426, title: 'Node registry update required',
            detail: 'This workspace uses node registry features that this client cannot display safely. Update ARC Studio to a compatible build.',
            extensions: { nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION, unsupportedFeatures: registryCompatibility.unsupportedFeatures, requiredFeatures: registryCompatibility.requiredFeatures }
          });
          ws.close(1008, 'Node registry update required.');
          return;
        }
        const user = msg.type === 'AUTH' ? userStore.validateSession(msg.token) : null;
        if (!user) {
          if (msg.type === 'AUTH' && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'SESSION_EXPIRED' }));
          ws.close(1008, 'Authentication required.');
          return;
        }
        if (user.mustChangePassword) {
          ws.close(1008, 'Change your password before continuing.');
          return;
        }
        const knownArcClient = isKnownArcStudioClient(msg.clientIdentity, ws.arcClientOrigin, ws.arcRequestHeaders)
          && msg.clientIdentity.version === msg.clientVersion
          && msg.clientIdentity.nodeRegistryProtocolVersion === NODE_REGISTRY_PROTOCOL_VERSION;
        if (!serverConfig.desktopMode && !knownArcClient && readClientAccessSettings().allowUnknownClients !== true) {
          sendWebSocketProblem(ws, { code: 'CLIENT_NOT_ALLOWED', status: 403, title: 'Client not allowed', detail: 'This workspace only accepts ARC Studio clients. Ask the workspace owner to allow unknown clients.' });
          ws.close(1008, 'Client not allowed.');
          return;
        }
        const activeCollaborators = activeWorkspaceCollaborators();
        if (!activeCollaborators.some((collaborator) => collaborator.userId === user.id)
          && activeCollaborators.length >= MAX_REALTIME_COLLABORATORS) {
          sendWebSocketProblem(ws, {
            code: 'COLLABORATOR_LIMIT_REACHED', status: 429, title: 'Workspace is full',
            detail: `This workspace allows up to ${MAX_REALTIME_COLLABORATORS} real-time collaborators. Wait for someone to disconnect before joining.`
          });
          ws.close(1008, 'Workspace collaborator limit reached.');
          return;
        }
        const assignedColor = getCollaboratorColor(user.id, activeCollaborators);
        ws.arcKnownClient = knownArcClient;
        ws.arcAuthenticated = true;
        ws.arcAuthenticatedAt = Date.now();
        ws.arcLastActivityAt = ws.arcAuthenticatedAt;
        ws.arcToken = msg.token;
        ws.arcClientIdentity = msg.clientIdentity || msg;
        ws.arcUser = { id: user.id, username: user.username, role: user.role, permissions: user.permissions || [] };
        ws.arcProjectId = projectStore.projects.some((project) => project.id === user.activeProjectId) ? user.activeProjectId : projectStore.activeProjectId;
        collaborationLastSeen.record(ws.arcProjectId, '', ws.arcUser);
        ws.arcManager = managerForUser({ ...user, activeProjectId: ws.arcProjectId });
        ws.arcColor = assignedColor;
        clearTimeout(authTimeout);
        ws.send(JSON.stringify({
          type: 'INIT_STATE',
          protocolVersion: CLIENT_PROTOCOL_VERSION,
          payload: {
            botStatus: ws.arcManager.status,
            botMetrics: ws.arcManager.gatewayMetrics,
            botProfile: ws.arcManager.botProfile ? { ...ws.arcManager.botProfile, intentSummary: ws.arcManager.getIntentPlan() } : null,
            discordAuthWarning: ws.arcManager.discordAuthWarning || null,
            logs: ws.arcManager.getLogs().slice(-100),
            graphs: ws.arcManager.getGraphs(),
            graphLibrary: ws.arcManager.getGraphLibrary(),
            projects: ws.arcManager.getProjects(),
            projectVariables: ws.arcManager.getProjectVariables(),
            version: serverConfig.version,
            nodeSchemaVersion: NODE_SCHEMA_VERSION,
            nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
            nodeRegistryRevision: getNodeRegistryPayload().registryRevision,
            nodeRegistryFeatures: requiredNodeRegistryFeatures(),
            chezcordVersion: serverConfig.chezcordVersion,
            collaborationFeatures: { transientCanvasMotion: true },
            collaboratorColor: ws.arcColor,
            diagnostics,
            projectLastSeen: collaborationLastSeen.projectSnapshot(ws.arcUser?.id || '')
          }
        }));
        publishPresence();
      } else if (msg.type !== 'AUTH') {
        const currentUser = userStore.validateSession(ws.arcToken);
        if (!currentUser) {
          ws.arcAuthenticated = false;
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'SESSION_EXPIRED' }));
          ws.close(1008, 'Session expired or permissions changed. Sign in again.');
          return;
        }
        ws.arcUser = { id: currentUser.id, username: currentUser.username, role: currentUser.role, permissions: currentUser.permissions || [] };
        if (msg.type === 'PING') {
          ws.send(JSON.stringify({
            type: 'PONG',
            timestamp: Date.now(),
            ...(Number.isInteger(msg.pingId) ? { pingId: msg.pingId } : {}),
            ...(Number.isFinite(msg.clientSentAt) ? { clientSentAt: msg.clientSentAt } : {})
          }));
        } else if (msg.type === 'USER_ACTIVITY') {
        ws.arcLastActivityAt = Date.now();
        if (collaborationLastSeen.record(ws.arcProjectId, ws.arcPresence?.graphId || '', ws.arcUser)) {
          broadcastProjectLastSeen();
          publishProjectCollaboration(ws.arcProjectId);
        }
        const room = ws.arcRoomKey && liveCollaborationActions.get(ws.arcRoomKey);
        const active = room?.get(ws.arcUser?.id);
        if (active?.action?.cursor && (active.action.kind === 'idle' || active.action.cursorIdle)) {
          const action = { ...active.action };
          if (action.kind === 'idle') { action.kind = 'cursor'; action.mode = 'move'; }
          delete action.cursorIdle;
          const resumed = { ...active, action, updatedAt: Date.now(), revision: nextCollaborationActionRevision() };
          room.set(ws.arcUser.id, resumed);
          sendToCollaborationRoom(ws.arcRoomKey, { type: 'COLLAB_ACTION_UPDATED', payload: resumed }, ws);
          scheduleCollaborationActionExpiry();
        } else if (ws.arcActionExpiry) scheduleCollaborationActionExpiry();
      } else if (['PROJECT_TABS_SYNC', 'PROJECT_TAB_OPEN', 'PROJECT_TAB_CLOSE'].includes(msg.type)) {
        const projectId = ws.arcProjectId;
        if (!projectId || !projectStore.projects.some((project) => project.id === projectId)) return;
        const availableGraphIds = new Set(ws.arcManager.getGraphs().map((graph) => graph.id));
        const isSync = msg.type === 'PROJECT_TABS_SYNC';
        const requestedIds = isSync && Array.isArray(msg.graphIds) ? msg.graphIds.slice(0, 12) : [msg.graphId];
        const requestedSet = new Set(requestedIds.filter((id) => typeof id === 'string'));
        const graphSnapshots = isSync && Array.isArray(msg.graphs) ? msg.graphs.slice(0, 12) : msg.type === 'PROJECT_TAB_OPEN' && msg.graph ? [msg.graph] : [];
        const snapshotBytes = graphSnapshots.reduce((size, graph) => {
          try { return size + JSON.stringify(graph).length; } catch { return size; }
        }, 0);
        if (snapshotBytes > (isSync ? 20_000_000 : 30_000_000)) return;
        let acceptedSnapshots = 0;
        for (const candidate of graphSnapshots) {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !requestedSet.has(candidate.id)
            || availableGraphIds.has(candidate.id) || ws.arcManager.deletedGraphIds?.has(candidate.id)
            || typeof candidate.id !== 'string' || candidate.id.length > 100
            || !Array.isArray(candidate.nodes) || !Array.isArray(candidate.connections)
            || candidate.nodes.length > 2000 || candidate.connections.length > 10000) continue;
          if (!ws.arcUser?.permissions?.includes('*') && !ws.arcUser?.permissions?.includes('graphs:write')) continue;
          let serialized;
          let safeCandidate;
          try {
            safeCandidate = ws.arcManager.protectGraphSecrets(candidate);
            serialized = JSON.stringify(safeCandidate);
          } catch { continue; }
          if (serialized.length > 30_000_000) continue;
          const graphKey = `${projectId}:${candidate.id}`;
          if (!liveGraphStates.has(graphKey)) {
            const graph = safeCandidate;
            liveGraphStates.set(graphKey, { projectId, graphId: graph.id, graph, revision: 0, updatedAt: Date.now(), user: { id: ws.arcUser.id, username: ws.arcUser.username }, serializedGraph: serialized, history: [{ revision: 0, graph }] });
            scheduleLiveGraphAutosave(projectId, graph.id);
          }
          const sharedGraph = liveGraphStates.get(graphKey)?.graph;
          if (sharedGraph) {
            const message = JSON.stringify({ type: 'PROJECT_TAB_GRAPH_UPDATED', payload: { projectId, graph: sharedGraph } });
            for (const client of wss.clients) if (client.arcAuthenticated && client.readyState === WebSocket.OPEN && client.arcProjectId === projectId) client.send(message);
          }
          availableGraphIds.add(candidate.id);
          acceptedSnapshots += 1;
        }
        let changed = false;
        let rejectedForLimit = false;
        if (isSync) {
          ws.arcOpenGraphIds = new Set();
          ws.arcTabsInitialized = true;
        }
        for (const graphId of requestedIds) {
          if (typeof graphId !== 'string' || graphId.length > 100 || ws.arcManager.deletedGraphIds?.has(graphId)) continue;
          if (msg.type === 'PROJECT_TAB_CLOSE') {
            changed = ws.arcOpenGraphIds.delete(graphId) || changed;
            continue;
          }
          const available = availableGraphIds.has(graphId) || liveGraphStates.has(`${projectId}:${graphId}`);
          if (!available) continue;
          if (!ws.arcOpenGraphIds.has(graphId)) {
            const projectOpenIds = new Set([...wss.clients]
              .filter((client) => client.arcAuthenticated && client.arcProjectId === projectId)
              .flatMap((client) => [...(client.arcOpenGraphIds || [])]));
            if (projectOpenIds.size < 12 || projectOpenIds.has(graphId)) {
              ws.arcOpenGraphIds.add(graphId);
              changed = true;
            } else rejectedForLimit = true;
          }
        }
        for (const graphId of ws.arcOpenGraphIds) {
          if (availableGraphIds.has(graphId)) continue;
          const liveState = liveGraphStates.get(`${projectId}:${graphId}`);
          if (liveState?.graph) ws.send(JSON.stringify({ type: 'PROJECT_TAB_GRAPH_UPDATED', payload: { projectId, graph: liveState.graph } }));
          else { ws.arcOpenGraphIds.delete(graphId); changed = true; }
        }
        if (isSync) for (const graphId of requestedIds) {
          if (typeof graphId === 'string' && ws.arcManager.deletedGraphIds?.has(graphId)) {
            ws.send(JSON.stringify({ type: 'GRAPH_DELETED', payload: { projectId, graphId } }));
          }
        }
        if (msg.type === 'PROJECT_TAB_OPEN' && typeof msg.graphId === 'string' && ws.arcManager.deletedGraphIds?.has(msg.graphId)) {
          ws.send(JSON.stringify({ type: 'GRAPH_DELETED', payload: { projectId, graphId: msg.graphId } }));
        } else if (msg.type === 'PROJECT_TAB_OPEN' && typeof msg.graphId === 'string' && rejectedForLimit) {
          ws.send(JSON.stringify({ type: 'PROJECT_TAB_REJECTED', payload: { projectId, graphId: msg.graphId, reason: 'limit', message: 'The shared workspace already has 12 open graphs. Close a shared tab before opening another.' } }));
        } else if (msg.type === 'PROJECT_TAB_OPEN' && typeof msg.graphId === 'string'
          && (ws.arcManager.deletedGraphIds?.has(msg.graphId) || (!availableGraphIds.has(msg.graphId) && !liveGraphStates.has(`${projectId}:${msg.graphId}`)))) {
          ws.send(JSON.stringify({ type: 'PROJECT_TAB_REJECTED', payload: { projectId, graphId: msg.graphId, reason: 'unavailable', message: 'This unsaved graph could not be shared. Save it first, then reopen it.' } }));
        }
        if (changed || isSync || acceptedSnapshots) publishProjectCollaboration(projectId);
      } else if (msg.type === 'PRESENCE') {
        const projectId = typeof msg.projectId === 'string' && projectStore.projects.some((project) => project.id === msg.projectId) ? msg.projectId : '';
        if (projectId && projectId !== ws.arcProjectId) {
          const owner = userStore.users.find((item) => item.id === ws.arcUser.id);
          if (owner) owner.activeProjectId = projectId;
          ws.arcProjectId = projectId;
          ws.arcManager = managerForUser({ ...ws.arcUser, activeProjectId: projectId });
          if (owner) userStore.saveState();
        }
        let graphId = typeof msg.graphId === 'string' && msg.graphId.length <= 100 ? msg.graphId : '';
        if (graphId && ws.arcManager.deletedGraphIds?.has(graphId)) graphId = '';
        const nextRoomKey = projectId && graphId ? collaborationRoomKey(projectId, graphId) : null;
        if (ws.arcRoomKey !== nextRoomKey) {
          clearNoteEditLocksForSocket(ws, ws.arcRoomKey);
          clearCollaborationAction();
        }
        ws.arcPresence = projectId && graphId ? { projectId, graphId } : null;
        ws.arcRoomKey = nextRoomKey;
        const lastSeenUpdated = collaborationLastSeen.record(projectId, graphId, ws.arcUser);
        if (projectId && graphId) {
          const now = Date.now();
          recentProjectGraphUse.set(`${projectId}:${graphId}`, { projectId, graphId, userId: ws.arcUser.id, username: ws.arcUser.username, updatedAt: now });
        }
        if (nextRoomKey) {
          const room = liveCollaborationActions.get(nextRoomKey);
          if (room) for (const action of room.values()) ws.send(JSON.stringify({ type: 'COLLAB_ACTION_UPDATED', payload: action }));
          ws.send(JSON.stringify({ type: 'NOTE_EDIT_LOCKS_UPDATED', payload: { projectId, graphId, locks: noteLockSnapshot(nextRoomKey) } }));
          sendGraphChatSnapshot(ws, nextRoomKey);
          sendCanvasArrowSnapshot(ws, nextRoomKey);
        }
        let liveState = ws.arcPresence ? liveGraphStates.get(`${projectId}:${graphId}`) : null;
        if (ws.arcPresence && !liveState) {
          const initialGraph = ws.arcManager.getGraphs().find((graph) => graph.id === graphId);
          if (initialGraph) {
            const serializedGraph = JSON.stringify(initialGraph);
            liveState = { projectId, graphId, graph: initialGraph, revision: 0, updatedAt: Date.now(), user: null, serializedGraph, history: [{ revision: 0, graph: initialGraph }] };
            liveGraphStates.set(`${projectId}:${graphId}`, liveState);
          }
        }
        if (liveState) {
          const payload = { ...liveState };
          delete payload.serializedGraph;
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload }));
        } else if (ws.arcPresence) ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: { projectId, graphId, ready: true, revision: 0 } }));
        publishPresence();
        if (lastSeenUpdated) broadcastProjectLastSeen();
      } else if (msg.type === 'NOTE_EDIT_LOCK_REQUEST' || msg.type === 'NOTE_EDIT_LOCK_RELEASE') {
        const roomKey = ws.arcRoomKey;
        const actionProjectId = typeof msg.projectId === 'string' ? msg.projectId : '';
        const actionGraphId = typeof msg.graphId === 'string' ? msg.graphId : '';
        const noteId = typeof msg.noteId === 'string' ? msg.noteId : '';
        if (!roomKey || !ws.arcPresence || actionProjectId !== ws.arcPresence.projectId || actionGraphId !== ws.arcPresence.graphId
          || !noteId || noteId.length > 100) return;
        if (msg.type === 'NOTE_EDIT_LOCK_RELEASE') {
          const room = liveNoteEditLocks.get(roomKey);
          if (room?.get(noteId)?.socket === ws) removeNoteEditLock(roomKey, noteId);
          return;
        }
        const now = Date.now();
        if (!ws.arcNoteLockRate || now - ws.arcNoteLockRate.windowAt >= 1000) ws.arcNoteLockRate = { windowAt: now, count: 0 };
        if (++ws.arcNoteLockRate.count > 20) return;
        const permissions = ws.arcUser?.permissions || [];
        if (!permissions.includes('*') && !permissions.includes('graphs:write')) return;
        const clientId = typeof msg.clientId === 'string' && msg.clientId.length <= 120 ? msg.clientId : '';
        if (!clientId) return;
        const liveState = liveGraphStates.get(`${actionProjectId}:${actionGraphId}`);
        const sourceGraph = liveState?.graph || ws.arcManager.getGraphs().find((graph) => graph.id === actionGraphId);
        const note = sourceGraph?.notes?.find((item) => item.id === noteId);
        if (!note) {
          ws.send(JSON.stringify({ type: 'NOTE_EDIT_LOCK_REJECTED', payload: { projectId: actionProjectId, graphId: actionGraphId, noteId, message: 'This note is no longer in the graph.' } }));
          return;
        }
        let room = liveNoteEditLocks.get(roomKey);
        if (!room) { room = new Map(); liveNoteEditLocks.set(roomKey, room); }
        const existing = room.get(noteId);
        if (existing && existing.expiresAt <= now) removeNoteEditLock(roomKey, noteId, { expired: true });
        const current = liveNoteEditLocks.get(roomKey)?.get(noteId);
        if (current && (current.socket !== ws || current.clientId !== clientId || current.userId !== ws.arcUser.id)) {
          ws.send(JSON.stringify({ type: 'NOTE_EDIT_LOCKS_UPDATED', payload: { projectId: actionProjectId, graphId: actionGraphId, locks: noteLockSnapshot(roomKey) } }));
          return;
        }
        const isRenewal = Boolean(current);
        if (current) clearTimeout(current.timer);
        const lock = {
          projectId: actionProjectId,
          graphId: actionGraphId,
          noteId,
          userId: ws.arcUser.id,
          username: ws.arcUser.username,
          color: ws.arcColor || collaboratorColor(ws.arcUser.id),
          clientId,
          expiresAt: now + NOTE_EDIT_LOCK_TTL_MS,
          socket: ws,
          note: JSON.parse(JSON.stringify(note))
        };
        lock.timer = setTimeout(() => {
          if (liveNoteEditLocks.get(roomKey)?.get(noteId) === lock) removeNoteEditLock(roomKey, noteId, { expired: true });
        }, NOTE_EDIT_LOCK_TTL_MS + 10);
        lock.timer.unref?.();
        room = liveNoteEditLocks.get(roomKey) || new Map();
        room.set(noteId, lock);
        liveNoteEditLocks.set(roomKey, room);
        publishNoteEditLocks(roomKey);
      } else if (msg.type === 'GRAPH_CHAT_SEND' || msg.type === 'GRAPH_CHAT_MOVE') {
        const roomKey = ws.arcRoomKey;
        const payload = msg.payload;
        const projectId = typeof msg.projectId === 'string' ? msg.projectId : '';
        const graphId = typeof msg.graphId === 'string' ? msg.graphId : '';
        if (!roomKey || !ws.arcPresence || projectId !== ws.arcPresence.projectId || graphId !== ws.arcPresence.graphId
          || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
        const graphExists = liveGraphStates.has(`${projectId}:${graphId}`)
          || ws.arcManager?.getGraphs().some((graph) => graph.id === graphId);
        if (!graphExists) return;
        const point = payload.position;
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
          || Math.abs(point.x) > 1_000_000 || Math.abs(point.y) > 1_000_000) return;
        const now = Date.now();
        if (msg.type === 'GRAPH_CHAT_SEND') {
          const recent = (ws.arcGraphChatSendTimes || []).filter((time) => now - time < 10_000);
          if (recent.length >= 5) {
            ws.arcGraphChatSendTimes = recent;
            ws.send(JSON.stringify({ type: 'GRAPH_CHAT_REJECTED', payload: {
              clientActionId: typeof payload.clientActionId === 'string' ? payload.clientActionId.slice(0, 120) : '',
              reason: 'rate-limit', message: 'Please wait a moment before sending another canvas message.'
            } }));
            return;
          }
          recent.push(now);
          ws.arcGraphChatSendTimes = recent;
          const content = Array.from(typeof payload.content === 'string' ? payload.content.trim() : '').slice(0, 280).join('');
          if (!content) return;
          const length = Array.from(content).length;
          const stayMs = Math.min(20_000, 5_000 + Math.ceil((length / 280) * 15_000));
          const fadeMs = Math.min(2_000, 500 + Math.ceil((length / 280) * 1_500));
          const bubble = {
            id: randomUUID(),
            clientActionId: typeof payload.clientActionId === 'string' ? payload.clientActionId.slice(0, 120) : '',
            projectId,
            graphId,
            userId: ws.arcUser.id,
            username: ws.arcUser.username,
            color: ws.arcColor || collaboratorColor(ws.arcUser.id),
            content,
            x: point.x,
            y: point.y,
            createdAt: now,
            stayMs,
            fadeMs,
            expiresAt: now + stayMs + fadeMs
          };
          let room = liveGraphChatBubbles.get(roomKey);
          if (!room) { room = new Map(); liveGraphChatBubbles.set(roomKey, room); }
          room.set(bubble.id, { bubble, timer: null });
          const entry = room.get(bubble.id);
          entry.timer = setTimeout(() => removeGraphChatBubble(roomKey, bubble.id), stayMs + fadeMs + 10);
          entry.timer.unref?.();
          sendToCollaborationRoom(roomKey, { type: 'GRAPH_CHAT_BUBBLE', payload: bubble });
          return;
        }
        const bubbleId = typeof payload.id === 'string' ? payload.id : '';
        const entry = liveGraphChatBubbles.get(roomKey)?.get(bubbleId);
        if (!entry || entry.bubble.userId !== ws.arcUser.id || entry.bubble.expiresAt <= now) return;
        if (!ws.arcGraphChatMoveTimes || now - ws.arcGraphChatMoveTimes.windowAt >= 1000) ws.arcGraphChatMoveTimes = { windowAt: now, count: 0 };
        if (++ws.arcGraphChatMoveTimes.count > 30) return;
        entry.bubble = {
          ...entry.bubble, x: point.x, y: point.y,
          clientActionId: typeof payload.clientActionId === 'string' ? payload.clientActionId.slice(0, 120) : ''
        };
        sendToCollaborationRoom(roomKey, { type: 'GRAPH_CHAT_BUBBLE', payload: entry.bubble });
      } else if (msg.type === 'CANVAS_ARROW_ACTION') {
        const roomKey = ws.arcRoomKey;
        const payload = msg.payload;
        const projectId = typeof msg.projectId === 'string' ? msg.projectId : '';
        const graphId = typeof msg.graphId === 'string' ? msg.graphId : '';
        const permissions = ws.arcUser?.permissions || [];
        const operation = payload?.operation;
        if (!roomKey || !ws.arcPresence || projectId !== ws.arcPresence.projectId || graphId !== ws.arcPresence.graphId
          || !payload || typeof payload !== 'object' || Array.isArray(payload)) return;
        if (['lock', 'unlock'].includes(operation) && !permissions.includes('*') && !permissions.includes('graphs:write')) return;
        const graphExists = liveGraphStates.has(`${projectId}:${graphId}`)
          || ws.arcManager?.getGraphs().some((graph) => graph.id === graphId);
        if (!graphExists) return;
        const now = Date.now();
        if (!ws.arcCanvasArrowRate || now - ws.arcCanvasArrowRate.windowAt >= 1000) ws.arcCanvasArrowRate = { windowAt: now, count: 0 };
        if (++ws.arcCanvasArrowRate.count > 40) return;
        let room = liveCanvasArrows.get(roomKey);
        if (operation === 'create') {
          const recent = (ws.arcCanvasArrowCreateTimes || []).filter((time) => now - time < 10_000);
          if (recent.length >= 20) return;
          ws.arcCanvasArrowCreateTimes = [...recent, now];
          const start = canvasArrowPoint(payload.start);
          const end = canvasArrowPoint(payload.end);
          if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 8 || (room?.size || 0) >= 300) return;
          const arrow = {
            id: randomUUID(),
            clientActionId: typeof payload.clientActionId === 'string' ? payload.clientActionId.slice(0, 120) : '',
            projectId,
            graphId,
            start,
            end,
            color: ws.arcColor || collaboratorColor(ws.arcUser.id),
            createdBy: ws.arcUser.username,
            createdById: ws.arcUser.id,
            createdByRole: ws.arcUser.role,
            createdAt: now,
            expiresAt: now + 12_000,
            locked: false
          };
          if (!room) { room = new Map(); liveCanvasArrows.set(roomKey, room); }
          const entry = { arrow, timer: null };
          entry.timer = setTimeout(() => removeCanvasArrow(roomKey, arrow.id), 12_010);
          entry.timer.unref?.();
          room.set(arrow.id, entry);
          sendToCollaborationRoom(roomKey, { type: 'CANVAS_ARROW_UPDATED', payload: arrow });
          return;
        }
        const arrowId = typeof payload.id === 'string' ? payload.id : '';
        if (operation !== 'move-many' && (!arrowId || arrowId.length > 100)) return;
        if (operation === 'move-many') {
          if (!Array.isArray(payload.arrows) || payload.arrows.length > 300) return;
          if (!ws.arcCanvasArrowMoveBudget || now - ws.arcCanvasArrowMoveBudget.windowAt >= 1000) {
            ws.arcCanvasArrowMoveBudget = { windowAt: now, count: 0 };
          }
          if (ws.arcCanvasArrowMoveBudget.count + payload.arrows.length > 300) return;
          ws.arcCanvasArrowMoveBudget.count += payload.arrows.length;
          const moves = payload.arrows.flatMap((item) => {
            const id = typeof item?.id === 'string' && item.id.length <= 100 ? item.id : '';
            const start = canvasArrowPoint(item?.start);
            const end = canvasArrowPoint(item?.end);
            const entry = liveCanvasArrows.get(roomKey)?.get(id);
            return entry && entry.arrow.expiresAt > now && start && end && Math.hypot(end.x - start.x, end.y - start.y) >= 8
              ? [{ entry, start, end, clientActionId: typeof item.clientActionId === 'string' ? item.clientActionId.slice(0, 120) : '' }]
              : [];
          });
          for (const move of moves) {
            move.entry.arrow = { ...move.entry.arrow, start: move.start, end: move.end, clientActionId: move.clientActionId };
            sendToCollaborationRoom(roomKey, { type: 'CANVAS_ARROW_UPDATED', payload: move.entry.arrow });
          }
          return;
        }
        if (operation === 'lock' || operation === 'unlock') {
          const key = `${projectId}:${graphId}`;
          let state = liveGraphStates.get(key);
          if (!state) {
            const graph = ws.arcManager?.getGraphs().find((item) => item.id === graphId);
            if (!graph) return;
            const serializedGraph = JSON.stringify(graph);
            state = { projectId, graphId, graph, revision: 0, updatedAt: now, user: null, serializedGraph, history: [{ revision: 0, graph }] };
            liveGraphStates.set(key, state);
          }
          if (operation === 'lock') {
            const entry = liveCanvasArrows.get(roomKey)?.get(arrowId);
            if (!entry || entry.arrow.expiresAt <= now || !canManageLockedCanvasArrow(ws.arcUser, entry.arrow, projectId)) return;
            if ((state.graph.arrows || []).filter((item) => item?.locked).length >= 300) {
              ws.send(JSON.stringify({ type: 'CANVAS_ARROW_REJECTED', payload: { projectId, graphId, id: arrowId, message: 'This graph already has the maximum of 300 saved arrows.' } }));
              return;
            }
            const arrow = { ...entry.arrow, locked: true, expiresAt: null };
            const arrows = [...(state.graph.arrows || []).filter((item) => item.id !== arrow.id), arrow];
            const graph = { ...state.graph, arrows };
            removeCanvasArrow(roomKey, arrowId);
            const serializedGraph = JSON.stringify(graph);
            const revision = state.revision + 1;
            const nextState = {
              projectId, graphId, graph, revision, updatedAt: now,
              user: { id: ws.arcUser.id, username: ws.arcUser.username },
              serializedGraph,
              history: [...(state.history || []), { revision, graph }].slice(-(serializedGraph.length <= 1_000_000 ? 8 : 2))
            };
            liveGraphStates.set(key, nextState);
            const syncPayload = { ...nextState, sourceUserId: ws.arcUser.id };
            delete syncPayload.serializedGraph;
            delete syncPayload.history;
            sendToCollaborationRoom(roomKey, { type: 'GRAPH_STATE_SYNC', payload: syncPayload });
            return;
          }
          const savedArrow = (state.graph.arrows || []).find((item) => item.id === arrowId && item.locked);
          if (!savedArrow || !canManageLockedCanvasArrow(ws.arcUser, savedArrow, projectId)) return;
          const graph = { ...state.graph, arrows: state.graph.arrows.filter((item) => item.id !== arrowId) };
          const serializedGraph = JSON.stringify(graph);
          const revision = state.revision + 1;
          const nextState = {
            projectId, graphId, graph, revision, updatedAt: now,
            user: { id: ws.arcUser.id, username: ws.arcUser.username },
            serializedGraph,
            history: [...(state.history || []), { revision, graph }].slice(-(serializedGraph.length <= 1_000_000 ? 8 : 2))
          };
          liveGraphStates.set(key, nextState);
          const syncPayload = { ...nextState, sourceUserId: ws.arcUser.id };
          delete syncPayload.serializedGraph;
          delete syncPayload.history;
          sendToCollaborationRoom(roomKey, { type: 'GRAPH_STATE_SYNC', payload: syncPayload });
          const unlockedArrow = { ...savedArrow, locked: false, createdAt: now, expiresAt: now + 12_000 };
          if (!room) { room = new Map(); liveCanvasArrows.set(roomKey, room); }
          const entry = { arrow: unlockedArrow, timer: null };
          entry.timer = setTimeout(() => removeCanvasArrow(roomKey, arrowId), 12_010);
          entry.timer.unref?.();
          room.set(arrowId, entry);
          sendToCollaborationRoom(roomKey, { type: 'CANVAS_ARROW_UPDATED', payload: unlockedArrow });
          return;
        }
        const entry = liveCanvasArrows.get(roomKey)?.get(arrowId);
        if (!entry || entry.arrow.expiresAt <= now) return;
        if (operation === 'delete') {
          removeCanvasArrow(roomKey, arrowId, 'CANVAS_ARROW_DELETED');
          return;
        }
        if (operation !== 'move') return;
        const start = canvasArrowPoint(payload.start);
        const end = canvasArrowPoint(payload.end);
        if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 8) return;
        entry.arrow = {
          ...entry.arrow, start, end,
          clientActionId: typeof payload.clientActionId === 'string' ? payload.clientActionId.slice(0, 120) : ''
        };
        sendToCollaborationRoom(roomKey, { type: 'CANVAS_ARROW_UPDATED', payload: entry.arrow });
      } else if (msg.type === 'COLLAB_ACTION') {
        const roomKey = ws.arcRoomKey;
        const action = msg.action;
        const permissions = ws.arcUser?.permissions || [];
        if (!roomKey || !ws.arcPresence || msg.projectId !== ws.arcPresence.projectId || msg.graphId !== ws.arcPresence.graphId
          || !action || typeof action !== 'object' || Array.isArray(action)) return;
        if (ws.arcManager?.deletedGraphIds?.has(msg.graphId)) return;
        const now = Date.now();
        const kind = action.kind;
        if (!['cursor', 'selection', 'node-drag', 'note-drag', 'wire-drag', 'arrow-drag', 'library-drag', 'navigation', 'node-edit', 'studio-focus', 'studio-draft', 'studio-cursor', 'idle'].includes(kind)) return;
        if (!ws.arcActionRates || now - ws.arcActionRates.windowAt >= 1000) ws.arcActionRates = { windowAt: now, counts: Object.create(null) };
        const rateGroup = kind === 'studio-draft' ? 'studio-draft' : ['cursor', 'selection', 'node-drag', 'note-drag', 'wire-drag', 'arrow-drag', 'library-drag'].includes(kind) ? 'canvas' : 'other';
        ws.arcActionRates.counts[rateGroup] = (ws.arcActionRates.counts[rateGroup] || 0) + 1;
        const limit = rateGroup === 'studio-draft' ? 30 : rateGroup === 'canvas' ? 90 : 35;
        if (ws.arcActionRates.counts[rateGroup] > limit) return;
        const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 1_000_000 && Math.abs(value.y) <= 1_000_000 ? { x: value.x, y: value.y } : null;
        const positions = (value) => Array.isArray(value) ? value.slice(0, 50).flatMap((item) => {
          if (!item || typeof item.id !== 'string' || item.id.length > 100) return [];
          const position = point(item);
          return position ? [{ id: item.id, x: Math.round(position.x), y: Math.round(position.y) }] : [];
        }) : [];
        if (kind === 'idle') {
          const cursor = point(action.cursor);
          if (!cursor) { clearCollaborationAction(false, true, typeof action.studioId === 'string' ? action.studioId : ''); return; }
          const room = liveCollaborationActions.get(roomKey) || new Map();
          const envelope = { userId: ws.arcUser.id, username: ws.arcUser.username, color: ws.arcColor || collaboratorColor(ws.arcUser.id), projectId: ws.arcPresence.projectId, graphId: ws.arcPresence.graphId, action: { kind: 'idle', cursor }, updatedAt: now, revision: nextCollaborationActionRevision() };
          room.set(ws.arcUser.id, envelope);
          liveCollaborationActions.set(roomKey, room);
          sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: envelope }, ws);
          clearTimeout(ws.arcActionExpiry);
          ws.arcActionExpiry = null;
          return;
        }
        const readOnlyCollaboration = ['cursor', 'selection', 'navigation', 'studio-focus', 'studio-cursor'].includes(kind);
        if ((Array.isArray(action.nodePositions) || Array.isArray(action.notePositions)) && !permissions.includes('*') && !permissions.includes('graphs:write')) return;
        if (!readOnlyCollaboration && !permissions.includes('*') && !permissions.includes('graphs:write')) return;
        let cleanAction;
        if (kind === 'navigation') {
          cleanAction = { kind: 'navigation', label: typeof action.label === 'string' ? action.label.slice(0, 32) : 'Navigating menus' };
        } else if (['cursor', 'selection', 'node-drag', 'note-drag', 'wire-drag', 'arrow-drag', 'library-drag'].includes(kind)) {
          const cursor = point(action.cursor);
          if (kind !== 'selection' && !cursor) return;
          cleanAction = { kind, ...(cursor ? { cursor } : {}), mode: typeof action.mode === 'string' ? action.mode.slice(0, 24) : kind };
          if (Array.isArray(action.selectedNodeIds)) cleanAction.selectedNodeIds = action.selectedNodeIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 2000);
          if (Array.isArray(action.selectedNoteIds)) cleanAction.selectedNoteIds = action.selectedNoteIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 2000);
          if (Array.isArray(action.selectedArrowIds)) cleanAction.selectedArrowIds = action.selectedArrowIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 300);
          const nodePositions = positions(action.nodePositions);
          const notePositions = positions(action.notePositions);
          if (nodePositions.length) cleanAction.nodePositions = nodePositions;
          if (notePositions.length) cleanAction.notePositions = notePositions;
          if (kind === 'selection' && action.selectionRect && typeof action.selectionRect === 'object') {
            const left = Number(action.selectionRect.left); const top = Number(action.selectionRect.top);
            const right = Number(action.selectionRect.right); const bottom = Number(action.selectionRect.bottom);
            if ([left, top, right, bottom].every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000) && right >= left && bottom >= top) {
              cleanAction.selectionRect = { left, top, right, bottom };
            }
          }
          if (kind === 'library-drag') {
            if (typeof action.nodeType !== 'string' || action.nodeType.length > 100) return;
            cleanAction.nodeType = action.nodeType;
            cleanAction.label = typeof action.label === 'string' ? action.label.slice(0, 80) : '';
          }
          if (kind === 'node-drag' && Array.isArray(action.nodeIds)) cleanAction.nodeIds = action.nodeIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 50);
          if (kind === 'note-drag') {
            if (typeof action.noteId === 'string') cleanAction.noteId = action.noteId.slice(0, 100);
            if (Array.isArray(action.noteIds)) cleanAction.noteIds = action.noteIds.filter((id) => typeof id === 'string' && id.length <= 100).slice(0, 50);
            const notePositions = positions(action.notePositions);
            if (notePositions.length) cleanAction.notePositions = notePositions;
          }
          if (kind === 'wire-drag') {
            const start = point(action.start);
            if (!start) return;
            cleanAction.start = start;
            cleanAction.pinType = typeof action.pinType === 'string' ? action.pinType.slice(0, 32) : 'any';
          }
          if (kind === 'arrow-drag') {
            const start = point(action.start);
            if (!start) return;
            cleanAction.start = start;
          }
          if (kind === 'node-edit' && typeof action.nodeId === 'string') cleanAction.nodeId = action.nodeId.slice(0, 100);
        } else if (kind === 'studio-draft') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !['embed', 'text', 'arguments'].includes(action.studioType) || !action.draft || typeof action.draft !== 'object' || Array.isArray(action.draft)) return;
          let serialized;
          try { serialized = JSON.stringify(action.draft); } catch { return; }
          if (serialized.length > 300_000) return;
          cleanAction = { kind, studioId: action.studioId, studioType: action.studioType, draft: JSON.parse(serialized) };
          if (Number.isInteger(action.draft.caret) && action.draft.caret >= 0 && action.draft.caret <= 1_000_000) cleanAction.draft.caret = action.draft.caret;
        } else if (kind === 'studio-cursor') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !Number.isInteger(action.caret) || action.caret < 0 || action.caret > 1_000_000) return;
          cleanAction = { kind, studioId: action.studioId, caret: action.caret };
        } else if (kind === 'studio-focus') {
          if (typeof action.studioId !== 'string' || action.studioId.length > 240 || !['embed', 'text', 'arguments'].includes(action.studioType)) return;
          cleanAction = { kind, studioId: action.studioId, studioType: action.studioType, label: typeof action.label === 'string' ? action.label.slice(0, 80) : '' };
        } else if (kind === 'node-edit') {
          if (typeof action.nodeId !== 'string' || action.nodeId.length > 100) return;
          cleanAction = { kind, nodeId: action.nodeId.slice(0, 100), mode: 'text' };
        } else cleanAction = { kind: 'idle' };
        const room = liveCollaborationActions.get(roomKey) || new Map();
        const priorAction = room.get(ws.arcUser.id)?.action;
        if (kind !== 'idle' && !cleanAction.cursor && priorAction?.cursor) cleanAction.cursor = priorAction.cursor;
        if (kind !== 'idle' && !Array.isArray(cleanAction.selectedNodeIds) && Array.isArray(priorAction?.selectedNodeIds)) cleanAction.selectedNodeIds = priorAction.selectedNodeIds;
        const envelope = { userId: ws.arcUser.id, username: ws.arcUser.username, color: ws.arcColor || collaboratorColor(ws.arcUser.id), projectId: ws.arcPresence.projectId, graphId: ws.arcPresence.graphId, action: cleanAction, updatedAt: now, revision: nextCollaborationActionRevision() };
        if (kind === 'studio-draft') {
          const drafts = liveCollaborationStudioDrafts.get(roomKey) || new Map();
          drafts.set(`${ws.arcUser.id}:${cleanAction.studioId}`, envelope);
          liveCollaborationStudioDrafts.set(roomKey, drafts);
        } else if (kind === 'studio-focus' || kind === 'studio-cursor') {
          const drafts = liveCollaborationStudioDrafts.get(roomKey);
          const requestedStudioId = cleanAction.studioId;
          if (drafts) for (const draft of drafts.values()) {
            if (draft.userId !== ws.arcUser.id && draft.action.studioId === requestedStudioId) {
              ws.send(JSON.stringify({ type: 'COLLAB_ACTION_UPDATED', payload: { ...draft, updatedAt: now, revision: nextCollaborationActionRevision() } }));
            }
          }
        }
        room.set(ws.arcUser.id, envelope);
        liveCollaborationActions.set(roomKey, room);
        sendToCollaborationRoom(roomKey, { type: 'COLLAB_ACTION_UPDATED', payload: envelope }, ws);
        scheduleCollaborationActionExpiry();
      } else if (msg.type === 'GRAPH_STATE') {
        const payload = msg.payload || msg;
        const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
        const graph = payload.graph;
        const permissions = ws.arcUser?.permissions || [];
        const rejectGraphState = (message) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'GRAPH_STATE_REJECTED', payload: { graphId: payload.graphId, message } }));
        };
        if (!permissions.includes('*') && !permissions.includes('graphs:write')) {
          rejectGraphState('Your account has read-only graph access. Ask a workspace admin for graph edit permission.');
          return;
        }
        if (!ws.arcPresence || projectId !== ws.arcProjectId || projectId !== ws.arcPresence.projectId || payload.graphId !== ws.arcPresence.graphId) {
          rejectGraphState('Open the graph in this workspace before editing it collaboratively.');
          return;
        }
        if (ws.arcManager?.deletedGraphIds?.has(payload.graphId)) {
          rejectGraphState('This graph was deleted. Close the stale tab and open a current graph.');
          return;
        }
        if (!graph || graph.id !== payload.graphId || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections)
          || graph.nodes.length > 2000 || graph.connections.length > 10000) {
          rejectGraphState('This graph update is invalid or exceeds the collaboration limits.');
          return;
        }
        const key = `${projectId}:${graph.id}`;
        const graphExists = ws.arcOpenGraphIds?.has(graph.id)
          || ws.arcManager.getGraphs().some((item) => item.id === graph.id)
          || liveGraphStates.has(key);
        if (!graphExists) {
          rejectGraphState('This graph is no longer open in the workspace. Reopen it before editing.');
          return;
        }
        for (const [stateKey, stateValue] of liveGraphStates) {
          if (Date.now() - stateValue.updatedAt > 30 * 60 * 1000) liveGraphStates.delete(stateKey);
        }
        let previous = liveGraphStates.get(key);
        if (!previous) {
          const initialGraph = ws.arcManager.getGraphs().find((item) => item.id === graph.id);
          if (initialGraph) {
            const initialSerialized = JSON.stringify(initialGraph);
            previous = { projectId, graphId: graph.id, graph: initialGraph, revision: 0, updatedAt: Date.now(), user: null, serializedGraph: initialSerialized, history: [{ revision: 0, graph: initialGraph }] };
            liveGraphStates.set(key, previous);
          }
        }
        let candidateGraph = ws.arcManager.protectGraphSecrets(graph);
        const baseRevision = Number(payload.baseRevision);
        if (previous && Number.isInteger(baseRevision) && baseRevision !== previous.revision) {
          const baseState = previous.history?.find((entry) => entry.revision === baseRevision);
          if (baseState) candidateGraph = mergeConcurrentGraphValue(baseState.graph, previous.graph, candidateGraph);
          else {
            const syncPayload = { ...previous, resync: true };
            delete syncPayload.serializedGraph;
            delete syncPayload.history;
            ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: syncPayload }));
            return;
          }
        }
        if (Array.isArray(candidateGraph.notes)) candidateGraph.notes = candidateGraph.notes.map((note) => ({ ...note }));
        const previousNotes = new Map((previous?.graph?.notes || []).map((note) => [note.id, note]));
        const incomingNotes = Array.isArray(candidateGraph.notes)
          ? candidateGraph.notes
          : (previous?.graph?.notes || []).map((note) => ({ ...note }));
        const incomingById = new Map(incomingNotes.map((note) => [note.id, note]));
        const roomKey = collaborationRoomKey(projectId, graph.id);
        const locks = liveNoteEditLocks.get(roomKey);
        let adjustedNotes = false;
        const rejectedNoteEdits = [];
        for (const noteId of new Set([...previousNotes.keys(), ...incomingById.keys(), ...(locks?.keys() || [])])) {
          const previousNote = previousNotes.get(noteId);
          const incomingNote = incomingById.get(noteId);
          const lock = locks?.get(noteId);
          if (lock && lock.expiresAt <= Date.now()) removeNoteEditLock(roomKey, noteId, { expired: true });
          const activeLock = liveNoteEditLocks.get(roomKey)?.get(noteId);
          const ownsLock = activeLock && activeLock.socket === ws && activeLock.clientId === payload.clientId
            && activeLock.userId === ws.arcUser.id;
          if (activeLock && !ownsLock) {
            const authoritative = activeLock.note || previousNote;
            if (!authoritative) continue;
            if (!incomingNote || !sameCollaborationValue(incomingNote, authoritative)) {
              if (incomingNote) {
                const index = incomingNotes.findIndex((item) => item.id === noteId);
                incomingNotes[index] = JSON.parse(JSON.stringify(authoritative));
                incomingById.set(noteId, incomingNotes[index]);
              } else {
                incomingNotes.push(JSON.parse(JSON.stringify(authoritative)));
                incomingById.set(noteId, incomingNotes[incomingNotes.length - 1]);
              }
              rejectedNoteEdits.push({ noteId, note: authoritative });
              adjustedNotes = true;
            }
          } else if (previousNote && incomingNote && incomingNote.text !== previousNote.text && !ownsLock) {
            incomingNote.text = previousNote.text;
            if (Object.hasOwn(previousNote, 'editedAt')) incomingNote.editedAt = previousNote.editedAt;
            else delete incomingNote.editedAt;
            if (Object.hasOwn(previousNote, 'editedBy')) incomingNote.editedBy = previousNote.editedBy;
            else delete incomingNote.editedBy;
            rejectedNoteEdits.push({ noteId, note: incomingNote });
            adjustedNotes = true;
          }
          if (ownsLock && incomingNote) activeLock.note = JSON.parse(JSON.stringify(incomingNote));
          if (ownsLock && !incomingNote) removeNoteEditLock(roomKey, noteId);
        }
        if (Array.isArray(graph.notes) || adjustedNotes || Array.isArray(previous?.graph?.notes)) candidateGraph.notes = incomingNotes;
        const previousArrows = (previous?.graph?.arrows || []).filter((arrow) => arrow?.locked === true);
        const incomingArrows = Array.isArray(candidateGraph.arrows) ? candidateGraph.arrows : previousArrows;
        const incomingArrowById = new Map(incomingArrows.filter((arrow) => typeof arrow?.id === 'string').map((arrow) => [arrow.id, arrow]));
        const nextArrows = [];
        const rejectedCanvasArrowIds = [];
        const validLockedArrow = (arrow) => {
          const start = canvasArrowPoint(arrow?.start);
          const end = canvasArrowPoint(arrow?.end);
          return arrow && typeof arrow.id === 'string' && arrow.id.length <= 100 && arrow.locked === true
            && start && end && Math.hypot(end.x - start.x, end.y - start.y) >= 8
            && typeof arrow.createdById === 'string' && arrow.createdById.length <= 100
            && typeof arrow.createdBy === 'string' && arrow.createdBy.length <= 80
            && typeof arrow.color === 'string' && /^#[0-9a-f]{6}$/i.test(arrow.color);
        };
        const previousArrowIds = new Set(previousArrows.map((arrow) => arrow.id));
        for (const previousArrow of previousArrows) {
          const incomingArrow = incomingArrowById.get(previousArrow.id);
          if ((!incomingArrow || !sameCollaborationValue(incomingArrow, previousArrow))
            && !canManageLockedCanvasArrow(ws.arcUser, previousArrow, projectId)) {
            nextArrows.push(previousArrow);
            rejectedCanvasArrowIds.push(previousArrow.id);
          } else if (incomingArrow && validLockedArrow(incomingArrow)) {
            nextArrows.push({
              ...previousArrow,
              start: canvasArrowPoint(incomingArrow.start),
              end: canvasArrowPoint(incomingArrow.end)
            });
          }
        }
        for (const incomingArrow of incomingArrows) {
          if (previousArrowIds.has(incomingArrow?.id) || !validLockedArrow(incomingArrow)
            || incomingArrow.createdById !== ws.arcUser.id) continue;
          if (nextArrows.length >= 300) {
            rejectedCanvasArrowIds.push(incomingArrow.id);
            continue;
          }
          nextArrows.push({
            ...incomingArrow,
            start: canvasArrowPoint(incomingArrow.start),
            end: canvasArrowPoint(incomingArrow.end),
            createdBy: ws.arcUser.username,
            createdByRole: ws.arcUser.role
          });
        }
        if (Array.isArray(graph.arrows) || previousArrows.length) candidateGraph.arrows = nextArrows;
        const serializedGraph = JSON.stringify(candidateGraph);
        const reportRejectedNoteEdits = () => {
          for (const rejected of rejectedNoteEdits) ws.send(JSON.stringify({ type: 'NOTE_EDIT_REJECTED', payload: { projectId, graphId: graph.id, ...rejected } }));
          if (rejectedCanvasArrowIds.length) ws.send(JSON.stringify({
            type: 'CANVAS_ARROW_REJECTED',
            payload: { projectId, graphId: graph.id, ids: rejectedCanvasArrowIds, message: 'Only the arrow creator or a project owner with higher permission can change a locked arrow.' }
          }));
        };
        if (previous?.serializedGraph === serializedGraph) {
          const syncPayload = { ...previous, clientId: payload.clientId, syncId: payload.syncId || null, sourceUserId: ws.arcUser.id };
          delete syncPayload.serializedGraph;
          delete syncPayload.history;
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: syncPayload }));
          ws.send(JSON.stringify({ type: 'GRAPH_STATE_ACK', payload: { graphId: graph.id, revision: previous.revision, syncId: payload.syncId || null } }));
          reportRejectedNoteEdits();
          return;
        }
        const revision = (previous?.revision || 0) + 1;
        const state = {
          projectId,
          graphId: graph.id,
          graph: candidateGraph,
          revision,
          updatedAt: Date.now(),
          user: { id: ws.arcUser.id, username: ws.arcUser.username },
          serializedGraph,
          history: [...(previous?.history || (previous ? [{ revision: previous.revision, graph: previous.graph }] : [])), { revision, graph: candidateGraph }].slice(-(serializedGraph.length <= 1_000_000 ? 8 : 2))
        };
        liveGraphStates.set(key, state);
        scheduleLiveGraphAutosave(projectId, graph.id);
        reportRejectedNoteEdits();
        const syncPayload = { ...state, clientId: payload.clientId, syncId: payload.syncId || null, sourceUserId: ws.arcUser.id };
        delete syncPayload.serializedGraph;
        delete syncPayload.history;
        const message = JSON.stringify({ type: 'GRAPH_STATE_SYNC', payload: syncPayload });
        for (const client of wss.clients) {
          if (client.arcAuthenticated && client.readyState === WebSocket.OPEN
            && client.arcPresence?.projectId === projectId && client.arcPresence?.graphId === graph.id) client.send(message);
        }
        ws.send(JSON.stringify({ type: 'GRAPH_STATE_ACK', payload: { graphId: graph.id, revision: state.revision, syncId: payload.syncId || null } }));
        publishProjectCollaboration(projectId);
        }
      }
    } catch {}
  });
});

server.listen(serverConfig.port, serverConfig.host, () => {
  const activePort = server.address()?.port || serverConfig.port;
  const portFile = process.env.ARC_PORT_FILE?.trim();
  if (portFile) {
    try {
      fs.mkdirSync(dirname(portFile), { recursive: true });
      fs.writeFileSync(portFile, String(activePort), { mode: 0o600 });
    } catch (error) {
      logger.log('ERROR', `Could not publish the local server port: ${error.message}`);
    }
  }
  const localUrl = `http://${serverConfig.host}:${activePort}`;

  const retention = logger.retentionDays === 'forever' || Number(logger.retentionDays) === 0 ? 'forever' : `${logger.retentionDays}d`;
  console.log(`\n==============================================================================`);
  console.log(`   █████╗ ██████╗  ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ `);
  console.log(`  ██╔══██╗██╔══██╗██╔════╝      ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗`);
  console.log(`  ███████║██████╔╝██║     █████╗███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║`);
  console.log(`  ██╔══██║██╔══██╗██║     ╚════╝╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║`);
  console.log(`  ██║  ██║██║  ██║╚██████╗      ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝`);
  console.log(`  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ `);
  console.log(`==============================================================================`);
  console.log(`  ★ ARC Studio:            v${serverConfig.version}`);
  console.log(`  ★ Chezcord:              v${serverConfig.chezcordVersion}`);
  console.log(`──────────────────────────────────────────────────────────────────────────────`);
  const bannerLabel = (label) => `  ➜ ${label.padEnd(24)} `;
  console.log(`${bannerLabel(`${serverOnlyMode ? 'API / WebSocket' : 'Web Studio'}:`)}${localUrl}`);
  console.log(`${bannerLabel('WebSocket:')}${localUrl.replace(/^http/, 'ws')}/ws`);
  console.log(`${bannerLabel('Loaded ' + Object.keys(NodeDefinitions).length + ' Nodes')}`);
  console.log(`${bannerLabel('Setup:')}${userStore.isSetupCompleted() ? 'Complete' : 'Required'}`);
  console.log(`${bannerLabel('Master Setup Key:')}Hidden`);
  console.log(`${bannerLabel('Project Log Retention:')}${retention}`);
  console.log(`==============================================================================`);
  for (const check of diagnostics.checks.filter((item) => item.status !== 'PASS')) console.log(`  ${check.status} ${check.name}: ${check.message}`);
  const loopbackHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(serverConfig.host.toLowerCase());
  if (loopbackHost && activePort !== 3000) {
    const warning = `Server binds to ${serverConfig.host}:${activePort}. If a reverse proxy exposes this workspace, point its upstream here and forward WebSocket upgrades for /ws with the path unchanged. successful login only confirms HTTP access.`;
    console.warn(`  WARN Reverse proxy: ${warning}`);
    logger.log('WARN', warning);
  }
  if (serverConfig.wasSecretAutoGenerated) console.log('  INFO Session secret generated.');
  console.log('\n');
});
//
if (process.env.ARC_DESKTOP_MODE === '1') {
  let controlBuffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    controlBuffer = `${controlBuffer}${chunk}`.slice(-128);
    if (controlBuffer.includes('ARC_STUDIO_SHUTDOWN')) {
      controlBuffer = '';
      flushLiveGraphAutosaves();
      botManager.stopBot();
      botManager.flushStatistics();
      for (const manager of new Set(userBotManagers.values())) {
        manager.stopBot();
        manager.flushStatistics();
      }
      for (const client of wss.clients) client.close(1001, 'ARC Studio is closing');
      wss.close();
      const forceExit = setTimeout(() => process.exit(0), 3000);
      forceExit.unref();
      server.close(() => logger.close(() => process.exit(0)));
    }
  });
}

let shutdownStarted = false;
const shutdownServer = () => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  flushLiveGraphAutosaves();
  clearInterval(idleDisconnectTimer);
  for (const client of wss.clients) client.close(1001, 'ARC Studio server is shutting down');
  wss.close();
  const forceExit = setTimeout(() => process.exit(0), 5000);
  forceExit.unref();
  server.close(() => logger.close(() => process.exit(0)));
};
process.once('SIGINT', shutdownServer);
process.once('SIGTERM', shutdownServer);

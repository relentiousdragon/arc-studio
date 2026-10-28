import { Router } from 'express';
import { STATUS_CODES } from 'node:http';
import { serverConfig } from '../config.js';
import { createAuthMiddleware, requirePermission } from '../auth.js';
import { NodeDefinitions, NODE_SCHEMA_VERSION, CLIENT_PROTOCOL_VERSION, getNodeRegistryPayload } from '../engine/NodeRegistry.js';
import { getNodeRegistryCompatibility, getNodeRegistryRequiredFeatures, NODE_REGISTRY_PROTOCOL_VERSION } from '../engine/NodeRegistryContract.js';
import { MockGateway } from '../engine/MockGateway.js';
import { StartupDiagnostics } from '../engine/StartupDiagnostics.js';
import { CryptoEngine } from '../security/CryptoEngine.js';
import { buildBotArchive, verifyBotArchiveIntegrity } from '../export/BotArchive.js';
import { PluginStore } from '../engine/PluginStore.js';
import { downloadSafeHttpFile } from '../engine/SafeHttpRequest.js';
import { EmbedStore } from '../engine/EmbedStore.js';
import { ActivityStore } from '../security/ActivityStore.js';
import { ActivityWebhookDispatcher, ActivityWebhookStore } from '../security/ActivityWebhook.js';
import { StarterProjects } from '../storage/StarterProjects.js';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from '../storage.js';
import { botManagerContext } from '../engine/RequestBotManager.js';
import { stableJson } from '../storage/Integrity.js';
import { readClientAccessSettings, writeClientAccessSettings, isArcStudioOrigin, isArcStudioClientIdentity } from '../security/ClientAccessPolicy.js';
import { isArcStudioClientVersionAllowed } from '../versioning/arcProjectCompatibility.js';
//
const ACTIVITY_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/relentiousdragon/arc-studio/main/packages/studio-client/public/arc.png';

function graphNodeChanges(previous, next) {
  const before = new Map((previous?.nodes || []).filter((node) => node && typeof node === 'object').map((node) => [node.id, node]));
  const after = new Map((next?.nodes || []).filter((node) => node && typeof node === 'object').map((node) => [node.id, node]));
  const changes = [];
  for (const node of next?.nodes || []) {
    if (!node || typeof node !== 'object') continue;
    const oldNode = before.get(node.id);
    const name = String(node.data?.embedName || node.label || node.type || 'Node').slice(0, 80);
    if (!oldNode) changes.push({ change: 'added', id: String(node.id || '').slice(0, 100), name, type: String(node.type || '').slice(0, 80) });
    else if (JSON.stringify(oldNode) !== JSON.stringify(node)) {
      const fields = Object.keys({ ...oldNode, ...node }).filter((key) => key !== 'data' && JSON.stringify(oldNode[key]) !== JSON.stringify(node[key]));
      const oldData = oldNode.data && typeof oldNode.data === 'object' ? oldNode.data : {};
      const newData = node.data && typeof node.data === 'object' ? node.data : {};
      for (const key of Object.keys({ ...oldData, ...newData })) {
        if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) fields.push(`data.${key}`);
      }
      changes.push({ change: 'updated', id: String(node.id || '').slice(0, 100), name, type: String(node.type || '').slice(0, 80), fields: fields.slice(0, 20) });
    }
  }
  for (const node of previous?.nodes || []) {
    if (!node || typeof node !== 'object') continue;
    if (!after.has(node.id)) changes.push({ change: 'removed', id: String(node.id || '').slice(0, 100), name: String(node.data?.embedName || node.label || node.type || 'Node').slice(0, 80), type: String(node.type || '').slice(0, 80) });
  }
  return changes;
}

export function createApiRouter(botManager, userStore, logger, managerForUser = () => botManager, broadcastWorkspace = () => {}, isUserOnline = () => false, clearDeletedGraphCollaboration = () => {}, onGraphSaved = () => {}, broadcastProject = () => {}, disconnectUnknownClients = () => {}) {
  const router = Router();
  router.use((req, res, next) => {
    const requestId = randomUUID();
    res.locals.arcRequestId = requestId;
    res.set('X-Request-Id', requestId);
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body) && typeof body.type !== 'string') {
        const code = typeof body.code === 'string' ? body.code : `HTTP_${res.statusCode}`;
        const typeSlug = code.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'http-error';
        res.type('application/problem+json');
        body = {
          ...body,
          type: `urn:arc-studio:problem:${typeSlug}`,
          title: STATUS_CODES[res.statusCode] || 'Request failed',
          status: res.statusCode,
          detail: typeof body.detail === 'string' ? body.detail : typeof body.error === 'string' ? body.error : STATUS_CODES[res.statusCode] || 'Request failed',
          instance: req.path,
          requestId
        };
        if (res.statusCode >= 500) logger.log('ERROR', `[API] requestId=${requestId} status=${res.statusCode} path=${req.path} code=${code}`);
      }
      return json(body);
    };
    next();
  });
  const botExportCache = new Map();
  const botExportRuns = new Map();
  const publishBotExport = (projectId, payload) => broadcastProject(projectId, { type: 'BOT_EXPORT_PROGRESS', payload: { projectId, ...payload } });
  const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
  const authMiddleware = createAuthMiddleware(userStore);
  const registryFeatures = () => getNodeRegistryRequiredFeatures(Object.values(NodeDefinitions));
  const registryRevision = () => getNodeRegistryPayload().registryRevision;
  const registryCompatibility = (client) => getNodeRegistryCompatibility(client, registryFeatures());
  const publishRegistryChange = (previousRevision) => {
    const nextRevision = registryRevision();
    if (nextRevision !== previousRevision) {
      broadcastWorkspace({ type: 'NODE_REGISTRY_UPDATED', protocolVersion: CLIENT_PROTOCOL_VERSION, payload: { registryRevision: nextRevision } });
    }
  };
  const embedStores = new Map();
  const getEmbedStore = () => {
    const filePath = path.join(botManager.projectDir, 'embeds.json');
    if (!embedStores.has(filePath)) embedStores.set(filePath, new EmbedStore(filePath));
    return embedStores.get(filePath);
  };
  const activityStores = new Map();
  const legacyActivityPath = path.join(dataDir, 'activity.json');
  const activityStoreForProject = (projectManager = botManager) => {
    const projectId = String(projectManager?.project?.id || 'default');
    if (activityStores.has(projectId)) return activityStores.get(projectId);
    const projectDirectory = projectManager?.projectDir || botManager.projectDir;
    const filePath = path.join(projectDirectory, 'activity.json');
    const store = new ActivityStore(filePath);
    if (!fs.existsSync(filePath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(legacyActivityPath, 'utf8'));
        const projectName = projectManager?.project?.name || '';
        const firstProjectId = projectManager?.projectStore?.projects?.[0]?.id;
        const matchingEntries = (Array.isArray(legacy) ? legacy : []).filter((entry) => {
          if (entry?.details?.projectId) return entry.details.projectId === projectId;
          if (entry?.details?.projectName) return entry.details.projectName === projectName;
          return projectId === firstProjectId;
        });
        store.importLegacyEntries(matchingEntries);
      } catch {}
    }
    activityStores.set(projectId, store);
    return store;
  };
  const activityWebhookStore = new ActivityWebhookStore();
  const activityWebhookDispatcher = new ActivityWebhookDispatcher(activityWebhookStore, (entryId, status, entry) => activityStores.get(entry?.details?.projectId)?.updateWebhookStatus(entryId, status));
  const resetPasswordAttempts = new Map();
  const releaseNotesCache = new Map();
  const recordTeamActivity = (req, action, summary, details) => {
    if (serverConfig.desktopMode || (userStore.listUsers().length < 2 && !activityWebhookStore.isEnabled())) return;
    try {
      let projectManager = managerForUser(req.user) || botManager;
      const requestedProjectId = String(details?.projectId || '');
      if (requestedProjectId && projectManager?.projectStore?.projects?.some((project) => project.id === requestedProjectId)) {
        projectManager = managerForUser({ ...req.user, activeProjectId: requestedProjectId }) || projectManager;
      }
      const projectId = String(projectManager?.project?.id || 'default');
      const projectName = projectManager?.project?.name || 'Workspace';
      const activityStore = activityStoreForProject(projectManager);
      const entry = activityStore.record(req.user, action, summary, { ...(details || {}), projectId, projectName: details?.projectName || projectName });
      activityWebhookDispatcher.enqueue(entry, ACTIVITY_WEBHOOK_AVATAR_URL);
    }
    catch (error) { logger.log('ERROR', `Could not record team activity: ${error.message}`); }
  };
  const installedPluginsForResponse = (projectManager = botManager) => {
    const showInstaller = !serverConfig.desktopMode && userStore.listUsers().length > 1;
    return PluginStore.installed().map((plugin) => ({
      ...plugin,
      grantedPermissions: PluginStore.projectPermissions(projectManager.projectDir, plugin.id),
      installedBy: showInstaller
        ? plugin.installedBy || activityStoreForProject(projectManager).entries.find((entry) => ['plugin.installed', 'plugin.imported'].includes(entry.action) && entry.details?.pluginId === plugin.id)?.actor?.username || null
        : null
    }));
  };
  const installerForResponse = (plugin) => installedPluginsForResponse().find((item) => item.id === plugin.id)?.installedBy || null;

  // Public Endpoints

  router.get('/release-notes/:version', async (req, res) => {
    const version = String(req.params.version || '');
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
      return res.status(400).json({ error: 'Invalid ARC Studio version.' });
    }

    const cached = releaseNotesCache.get(version);
    if (cached && cached.expiresAt > Date.now()) {
      res.set('Cache-Control', 'public, max-age=900');
      return res.json(cached.payload);
    }

    const requestGitHub = async (url) => {
      const response = await fetch(url, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ARC-Studio-release-notes' },
        signal: AbortSignal.timeout(8000)
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
      return response.json();
    };

    try {
      const tags = [`v${version}`, version];
      let release = null;
      for (const tag of tags) {
        release = await requestGitHub(`https://api.github.com/repos/relentiousdragon/arc-studio/releases/tags/${encodeURIComponent(tag)}`);
        if (release) break;
      }
      if (!release) return res.status(404).json({ error: 'No GitHub release exists for this ARC Studio version.' });

      const payload = {
        version,
        title: String(release.name || `ARC Studio ${version}`).slice(0, 200),
        notes: String(release.body || '').trim().slice(0, 12000) || 'This release does not include release notes.',
        url: typeof release.html_url === 'string' ? release.html_url : `https://github.com/relentiousdragon/arc-studio/releases/tag/v${encodeURIComponent(version)}`
      };
      releaseNotesCache.set(version, { payload, expiresAt: Date.now() + 15 * 60_000 });
      while (releaseNotesCache.size > 32) releaseNotesCache.delete(releaseNotesCache.keys().next().value);
      res.set('Cache-Control', 'public, max-age=900');
      return res.json(payload);
    } catch (error) {
      logger.log('WARN', `Could not load GitHub release notes for ${version}: ${error.message}`);
      return res.status(502).json({ error: 'Could not load release notes from GitHub.' });
    }
  });

  router.get('/health', (req, res) => {
    const registry = getNodeRegistryPayload();
    res.json({
      status: 'ok',
      version: serverConfig.version,
      minimumClientVersion: serverConfig.minimumClientVersion,
      nodeSchemaVersion: NODE_SCHEMA_VERSION,
      nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
      nodeRegistryRevision: registry.registryRevision,
      chezcordVersion: serverConfig.chezcordVersion,
      port: serverConfig.port,
      isSetupCompleted: userStore.isSetupCompleted()
    });
  });

  router.get('/system/status', (req, res) => {
    const registry = getNodeRegistryPayload();
    res.json({
      isSetupCompleted: userStore.isSetupCompleted(),
      hasLocalAccount: !serverConfig.desktopMode || userStore.hasLocalAccount(),
      localUsername: serverConfig.desktopMode ? userStore.getLocalAccount()?.username || null : null,
      workspaceName: userStore.workspaceName,
      canResetPrimaryAdminWithMasterKey: userStore.isSetupCompleted() && !serverConfig.desktopMode && !serverConfig.isDefaultKey,
      version: serverConfig.version,
      minimumClientVersion: serverConfig.minimumClientVersion,
      nodeSchemaVersion: NODE_SCHEMA_VERSION,
      nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
      nodeRegistryRevision: registry.registryRevision,
      nodeRegistryRequiredFeatures: registry.requiredFeatures,
      chezcordVersion: serverConfig.chezcordVersion,
      collaborationFeatures: { transientCanvasMotion: true },
      supportedNodeTypes: Object.values(NodeDefinitions).map((definition) => definition.type)
    });
  });

  router.post('/auth/setup', (req, res) => {
    const { masterKey, username, password, workspaceName, rememberMe } = req.body;
    const clientBuild = req.body?.clientBuild;
    if (!clientBuild || typeof clientBuild.version !== 'string'
      || !isArcStudioClientVersionAllowed(clientBuild.version, serverConfig.minimumClientVersion)) {
      return res.status(426).json({ error: `Connect using ARC Studio ${serverConfig.minimumClientVersion} or newer to set up this workspace.`, code: 'CLIENT_VERSION_BLOCKED', minimumVersion: serverConfig.minimumClientVersion, nodeSchemaVersion: NODE_SCHEMA_VERSION });
    }
    if (!isArcStudioClientIdentity(clientBuild)) return res.status(426).json({ error: 'This client does not support the workspace client protocol.', code: 'CLIENT_PROTOCOL_INCOMPATIBLE', requiredProtocolVersion: CLIENT_PROTOCOL_VERSION });
    const registryCheck = registryCompatibility(clientBuild);
    if (!registryCheck.compatible) return res.status(426).json({ error: 'This workspace uses node registry features that this client cannot display safely. Update ARC Studio to a compatible build.', code: 'NODE_REGISTRY_INCOMPATIBLE', minimumVersion: serverConfig.minimumClientVersion, nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION, unsupportedFeatures: registryCheck.unsupportedFeatures });
    if (!isArcStudioOrigin(req.headers.origin, req.headers)) return res.status(403).json({ error: 'Workspace setup is available only from ARC Studio.', code: 'CLIENT_NOT_ALLOWED' });
    try {
      const session = userStore.completeFirstTimeSetup({ masterKey, username, password, workspaceName, rememberMe: rememberMe === true });
      logger.info(`First-time setup completed successfully! Primary administrator created: "${session.user.username}"`);
      res.json({ success: true, ...session });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/auth/desktop-setup', (req, res) => {
    if (!serverConfig.desktopMode) return res.status(404).json({ error: 'Route not found.' });
    try {
      const session = userStore.completeDesktopSetup({ ...(req.body || {}), rememberMe: req.body?.rememberMe === true });
      logger.info(`Local workspace initialized for "${session.user.username}"`);
      res.json({ success: true, ...session });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/auth/login', (req, res) => {
    const { username, password, rememberMe, clientBuild } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (!clientBuild || typeof clientBuild.version !== 'string'
      || !isArcStudioClientVersionAllowed(clientBuild.version, serverConfig.minimumClientVersion)) {
      return res.status(426).json({ error: `Update ARC Studio to ${serverConfig.minimumClientVersion} or newer to sign in.`, code: 'CLIENT_VERSION_BLOCKED', minimumVersion: serverConfig.minimumClientVersion, nodeSchemaVersion: NODE_SCHEMA_VERSION });
    }
    if (clientBuild.protocolVersion !== CLIENT_PROTOCOL_VERSION) return res.status(426).json({ error: 'This client does not support the workspace client protocol.', code: 'CLIENT_PROTOCOL_INCOMPATIBLE', requiredProtocolVersion: CLIENT_PROTOCOL_VERSION });
    const registryCheck = registryCompatibility(clientBuild);
    if (!registryCheck.compatible) return res.status(426).json({ error: 'This workspace uses node registry features that this client cannot display safely. Update ARC Studio to a compatible build.', code: 'NODE_REGISTRY_INCOMPATIBLE', minimumVersion: serverConfig.minimumClientVersion, nodeRegistryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION, unsupportedFeatures: registryCheck.unsupportedFeatures });
    const knownClient = isArcStudioClientIdentity(clientBuild) && isArcStudioOrigin(req.headers.origin, req.headers);
    if ((serverConfig.desktopMode && !isArcStudioClientIdentity(clientBuild))
      || (!serverConfig.desktopMode && !knownClient && readClientAccessSettings().allowUnknownClients !== true)) {
      return res.status(403).json({ error: 'This workspace only accepts ARC Studio clients. Ask the workspace owner to allow unknown clients if you need to connect with other software.', code: 'CLIENT_NOT_ALLOWED' });
    }

    try {
      const session = userStore.login(username, password, rememberMe === true);
      if (session.replacementPending) return res.status(202).json({
        replacementPending: true,
        requestId: session.requestId,
        retryAt: session.retryAt
      });
      logger.info(`User logged in: ${session.user.username} (role: ${session.user.role})`);
      const buildVersion = typeof clientBuild?.version === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(clientBuild.version)
        ? clientBuild.version
        : '';
      const buildPlatform = ['Windows', 'Linux', 'macOS'].includes(clientBuild?.platform) ? clientBuild.platform : '';
      const buildArchitecture = ['x64', 'x86', 'arm64', 'arm'].includes(clientBuild?.architecture) ? clientBuild.architecture : '';
      recordTeamActivity({ user: session.user }, 'account.signed_in', 'Signed in to the workspace', {
        ...(buildVersion ? { clientVersion: buildVersion } : {}),
        ...(buildPlatform ? { clientPlatform: buildPlatform } : {}),
        ...(buildArchitecture ? { clientArchitecture: buildArchitecture } : {})
      });
      res.json({ success: true, ...session });
    } catch (err) {
      const ownerPasswordIncorrect = !serverConfig.desktopMode && err.ownerPasswordIncorrect === true;
      res.status(401).json({ error: err.message, ...(ownerPasswordIncorrect ? { ownerPasswordIncorrect: true } : {}) });
    }
  });

  const allowPasswordResetAttempt = (req, res) => {
    const now = Date.now();
    const attemptKey = req.ip || 'local';
    const attempt = resetPasswordAttempts.get(attemptKey);
    if (attempt && now - attempt.startedAt < 5 * 60 * 1000 && attempt.count >= 8) {
      res.status(429).json({ error: 'Too many attempts. Wait a few minutes and try again.' });
      return false;
    }
    const bucket = !attempt || now - attempt.startedAt >= 5 * 60 * 1000 ? { startedAt: now, count: 0 } : attempt;
    bucket.count += 1;
    resetPasswordAttempts.set(attemptKey, bucket);
    return true;
  };

  router.post('/auth/desktop-reset-check', (req, res) => {
    if (!serverConfig.desktopMode) return res.sendStatus(404);
    if (!allowPasswordResetAttempt(req, res)) return;
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const owner = userStore.getLocalAccount();
    if (!owner || owner.isPrimaryAdmin !== true || owner.username.toLowerCase() !== username.toLowerCase()
      || !password || !userStore.verifyPassword(password, owner)) {
      return res.status(401).json({ error: 'The local owner password is incorrect.' });
    }
    resetPasswordAttempts.delete(req.ip || 'local');
    res.json({ success: true });
  });

  router.post('/auth/desktop-reset-data', (req, res) => {
    if (!serverConfig.desktopMode || !serverConfig.desktopDevMode) return res.sendStatus(404);
    if (!allowPasswordResetAttempt(req, res)) return;
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const owner = userStore.getLocalAccount();
    if (!owner || owner.isPrimaryAdmin !== true || owner.username.toLowerCase() !== username.toLowerCase()
      || !password || !userStore.verifyPassword(password, owner)) {
      return res.status(401).json({ error: 'The local owner password is incorrect.' });
    }

    try {
      botManager.stopBot();
      botManager.flushStatistics();
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (error) {
      logger.log('ERROR', `Could not reset the local development workspace: ${error.message}`);
      return res.status(500).json({ error: 'Could not remove the local workspace data.' });
    }
    resetPasswordAttempts.delete(req.ip || 'local');
    res.json({ success: true });
    res.once('finish', () => setTimeout(() => process.exit(75), 150));
  });

  router.post('/auth/desktop-reset-password', (req, res) => {
    if (!serverConfig.desktopMode) return res.sendStatus(404);
    if (!allowPasswordResetAttempt(req, res)) return;
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
    const user = userStore.getLocalAccount();
    if (!user || user.isPrimaryAdmin !== true || user.username.toLowerCase() !== username.toLowerCase()) {
      return res.status(400).json({ error: 'The local owner account could not be found.' });
    }
    try {
      userStore.resetPassword(user.id, password, { requireChange: false });
      resetPasswordAttempts.delete(req.ip || 'local');
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/auth/reset-primary-admin-password', (req, res) => {
    if (serverConfig.desktopMode || serverConfig.isDefaultKey || !userStore.isSetupCompleted()) return res.sendStatus(404);
    if (!allowPasswordResetAttempt(req, res)) return;
    const masterKey = String(req.body?.masterKey || '');
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    if (!masterKey || masterKey !== serverConfig.setupKey) return res.status(401).json({ error: 'The master key is incorrect.' });
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
    const owner = userStore.users.find((item) => item.isPrimaryAdmin);
    if (!owner) return res.status(404).json({ error: 'The owner account could not be found.' });
    try {
      userStore.resetPassword(owner.id, password, { requireChange: true });
      resetPasswordAttempts.delete(req.ip || 'local');
      res.json({ success: true });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
//
  router.use(authMiddleware);
  router.use((req, res, next) => {
    const manager = managerForUser(req.user);
    botManagerContext.run(manager, next);
  });

  router.get('/auth/me', (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/client-access', (req, res) => {
    if (serverConfig.desktopMode) return res.sendStatus(404);
    if (req.user?.isPrimaryAdmin !== true) return res.status(403).json({ error: 'Only the primary workspace owner can view client access settings.' });
    res.json(readClientAccessSettings());
  });

  router.patch('/client-access', (req, res) => {
    if (serverConfig.desktopMode) return res.sendStatus(404);
    if (req.user?.isPrimaryAdmin !== true) return res.status(403).json({ error: 'Only the primary workspace owner can change client access settings.' });
    if (typeof req.body?.allowUnknownClients !== 'boolean') return res.status(400).json({ error: 'allowUnknownClients must be a boolean.' });
    try {
      const settings = writeClientAccessSettings({ allowUnknownClients: req.body.allowUnknownClients });
      if (!settings.allowUnknownClients) disconnectUnknownClients();
      res.json({ success: true, ...settings });
    }
    catch (error) { res.status(500).json({ error: error.message || 'Could not save client access settings.' }); }
  });

  router.post('/auth/logout', (req, res) => {
    const token = req.headers['x-arc-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token;
    userStore.endSession(token);
    res.json({ success: true });
  });

  router.post('/auth/change-password', (req, res) => {
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
    try {
      const user = userStore.changePassword(req.user.id, password);
      const storedUser = userStore.users.find((item) => item.id === user.id);
      const token = userStore.createSession(storedUser, false);
      res.json({ success: true, user, token });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.patch('/auth/username', (req, res) => {
    if (serverConfig.desktopMode) return res.sendStatus(404);
    if (req.user.isPrimaryAdmin !== true) return res.status(403).json({ error: 'Only the primary workspace owner can rename this account.' });
    try {
      const result = userStore.renamePrimaryAdmin(req.user.id, req.body?.username);
      if (result.changed) {
        logger.info(`Primary workspace owner renamed their account to "${result.user.username}"`);
        recordTeamActivity({ ...req, user: result.user }, 'account.renamed', `Renamed the owner account to ${result.user.username}`, { previousUsername: req.user.username, username: result.user.username });
      }
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(error.retryAfterMs ? 429 : 400).json({ error: error.message, ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs, availableAt: error.availableAt } : {}) });
    }
  });

  router.get('/projects', requirePermission('graphs:read'), (_req, res) => {
    res.json(botManager.getProjects());
  });

  router.get('/projects/templates', requirePermission('graphs:read'), (_req, res) => {
    res.json({ templates: StarterProjects.map(({ id, name, description, icon, highlights, setup }) => ({ id, name, description, icon, highlights, setup })) });
  });

  router.get('/projects/:projectId/export', requirePermission('graphs:read'), (req, res) => {
    try {
      const projectManager = managerForUser({ ...req.user, activeProjectId: req.params.projectId }) || botManager;
      const bundle = botManager.projectStore.exportProject(req.params.projectId, {
        includeSecrets: req.query.includeSecrets === '1',
        secretValueResolver: (scope, graphId, variableId) => projectManager.getSecretValue(scope, graphId, variableId)
      });
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${bundle.project.name}.arcproject`)}`);
      res.json(bundle);
    } catch (error) { res.status(404).json({ error: error.message }); }
  });

  router.post('/projects/:projectId/export/encrypted', requirePermission('graphs:read'), (req, res) => {
    try {
      const projectManager = managerForUser({ ...req.user, activeProjectId: req.params.projectId }) || botManager;
      const bundle = botManager.projectStore.exportEncryptedProject(req.params.projectId, req.body?.password, {
        includeSecrets: req.body?.includeSecrets === true,
        secretValueResolver: (scope, graphId, variableId) => projectManager.getSecretValue(scope, graphId, variableId)
      });
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${botManager.projectStore.projects.find((item) => item.id === req.params.projectId)?.name || 'project'}.arcproject`)}`);
      res.json(bundle);
    } catch (error) { res.status(400).json({ error: error.message || 'Could not encrypt the project export.' }); }
  });

  router.post('/projects/import', requirePermission('graphs:write'), (req, res) => {
    try {
      const submittedBundle = req.body?.bundle;
      const bundle = submittedBundle?.format === 'arc-project-encrypted'
        ? botManager.projectStore.decryptProjectBundle(submittedBundle, req.body?.password)
        : submittedBundle;
      const integrityWarning = !bundle?.integrity;
      const project = botManager.projectStore.importProject(bundle, { trusted: req.body?.trusted === true, allowOldVersion: req.body?.allowOldVersion === true, ownerId: req.user.id });
      managerForUser({ ...req.user, activeProjectId: project.id })?.importProjectSecretValues();
      recordTeamActivity(req, 'project.imported', `Imported project “${project.name}”`, { projectId: project.id });
      broadcastWorkspace({ type: 'PROJECTS_UPDATED', payload: botManager.projectStore.list() });
      res.json({ success: true, project, integrityWarning, ...botManager.getProjects() });
    } catch (error) {
      if (error.code === 'PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED' || error.code === 'PROJECT_REQUIRES_NEWER_ARC') {
        return res.status(409).json({ error: error.message, code: error.code, projectVersion: error.projectVersion || null, currentVersion: error.currentVersion || null, unknownProjectVersion: error.unknownProjectVersion === true });
      }
      res.status(400).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
  });

  router.patch('/projects/settings', requirePermission('*'), (req, res) => {
    if (serverConfig.desktopMode) return res.sendStatus(404);
    try {
      const value = req.body?.maxProjects === 'unlimited' ? null : Number(req.body?.maxProjects);
      const maxProjects = botManager.projectStore.setMaxProjects(value);
      broadcastWorkspace({ type: 'PROJECTS_UPDATED', payload: botManager.projectStore.list() });
      res.json({ success: true, maxProjects, ...botManager.getProjects() });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/projects/idle-disconnect', requirePermission('graphs:read'), (req, res) => {
    if (serverConfig.desktopMode) return res.json({ projectId: botManager.project.id, idleDisconnectMinutes: 0, exempt: true });
    const project = botManager.project;
    res.json({ projectId: project.id, idleDisconnectMinutes: project.idleDisconnectMinutes ?? 15 });
  });

  router.patch('/projects/idle-disconnect', requirePermission('graphs:read'), (req, res) => {
    if (serverConfig.desktopMode) return res.json({ success: true, idleDisconnectMinutes: 0, exempt: true });
    try {
      const project = botManager.project;
      if (project.ownerId !== req.user.id && !req.user.permissions?.includes('*')) return res.status(403).json({ error: 'Only this project’s owner or a workspace admin can change its idle timeout.' });
      const value = Number(req.body?.idleDisconnectMinutes);
      const minutes = botManager.projectStore.setIdleDisconnectMinutes(botManager.project.id, value);
      broadcastWorkspace({ type: 'PROJECTS_UPDATED', payload: botManager.projectStore.list() });
      res.json({ success: true, projectId: botManager.project.id, idleDisconnectMinutes: minutes });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/projects/log-retention', requirePermission('graphs:read'), (req, res) => {
    const project = botManager.project;
    res.json({ projectId: project.id, retentionDays: project.logRetentionDays ?? null, effectiveRetentionDays: project.logRetentionDays ?? (process.env.LOG_RETENTION_DAYS || 7) });
  });

  router.patch('/projects/log-retention', requirePermission('*'), (req, res) => {
    const value = req.body?.retentionDays;
    if (value !== null && ![1, 7, 14, 30, 90, 365, 'forever'].includes(value)) return res.status(400).json({ error: 'Choose the global default or a supported retention period.' });
    try { res.json({ success: true, projectId: botManager.project.id, effectiveRetentionDays: botManager.setProjectLogRetention(value), override: value }); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.post('/projects/initialize', requirePermission('graphs:write'), (req, res) => {
    try {
      const project = botManager.projectStore.initializeFirstProject(req.body?.name, req.body?.templateId || 'blank', req.user.id);
      botManager.switchProject(project.id);
      userStore.setActiveProject(req.user.id, project.id);
      const embeds = getEmbedStore().list();
      res.json({ success: true, project, ...botManager.getProjects(), graphs: botManager.getGraphs(), graphLibrary: botManager.getGraphLibrary(), botProfile: botManager.botProfile, embeds });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.post('/projects', requirePermission('graphs:write'), (req, res) => {
    try {
      const project = botManager.projectStore.create(req.body?.name, req.body?.templateId, req.user.id);
      recordTeamActivity(req, 'project.created', `Created project “${project.name}”`, { projectId: project.id });
      broadcastWorkspace({ type: 'PROJECTS_UPDATED', payload: botManager.projectStore.list() });
      res.json({ success: true, project, ...botManager.getProjects() });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.post('/projects/:projectId/activate', requirePermission('graphs:write'), (req, res) => {
    try {
      const project = botManager.projectStore.projects.find((item) => item.id === req.params.projectId);
      if (!project) throw new Error('That project no longer exists.');
      userStore.setActiveProject(req.user.id, project.id);
      recordTeamActivity(req, 'project.opened', `Opened project “${project.name}”`, { projectId: project.id });
      const selectedManager = managerForUser({ ...req.user, activeProjectId: project.id });
      const selectedEmbedStore = new EmbedStore(path.join(selectedManager.projectDir, 'embeds.json'));
      const embeds = selectedEmbedStore.list();
      res.json({ success: true, project, ...selectedManager.getProjects(), graphs: selectedManager.getGraphs(), graphLibrary: selectedManager.getGraphLibrary(), projectVariables: selectedManager.getProjectVariables(), botProfile: selectedManager.botProfile, botStatus: selectedManager.status, botMetrics: selectedManager.gatewayMetrics, logs: selectedManager.getLogs().slice(-100), embeds });
    } catch (error) {
      logger.log('ERROR', `Could not activate project ${req.params.projectId}: ${error.message}`);
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/projects/:projectId', requirePermission('graphs:write'), (req, res) => {
    try {
      const project = botManager.projectStore.projects.find((item) => item.id === req.params.projectId);
      if (!project) throw new Error('That project no longer exists.');
      if (botManager.projectStore.projects.length <= 1) throw new Error('Keep at least one project in this workspace.');
      if (String(req.body?.confirmName || '').trim() !== project.name) throw new Error('Enter the project name exactly to confirm deletion.');
      if (userStore.users.some((user) => user.id !== req.user.id && user.activeProjectId === project.id)) throw new Error('Another workspace user is currently using this project. Ask them to switch projects first.');
      if (project.id === botManager.project.id) {
        const fallback = botManager.projectStore.projects.find((item) => item.id !== project.id);
        userStore.setActiveProject(req.user.id, fallback.id);
        botManager.switchProject(fallback.id);
      }
      if (project.id === botManager.projectStore.activeProjectId) {
        const fallback = botManager.projectStore.projects.find((item) => item.id !== project.id);
        botManager.projectStore.activate(fallback.id);
      }
      const deleted = botManager.projectStore.delete(project.id, req.body?.confirmName);
      recordTeamActivity(req, 'project.deleted', `Deleted project “${deleted.name}”`, { projectId: deleted.id });
      const embeds = getEmbedStore().list();
      botManager.broadcastWS({ type: 'EMBEDS_UPDATED', payload: { embeds } });
      broadcastWorkspace({ type: 'PROJECTS_UPDATED', payload: botManager.projectStore.list() });
      res.json({ success: true, deletedProjectId: deleted.id, ...botManager.getProjects(), graphs: botManager.getGraphs(), graphLibrary: botManager.getGraphLibrary(), botProfile: botManager.botProfile, embeds });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  router.get('/system/diagnostics', (req, res) => {
    const diagnostics = StartupDiagnostics.run();
    res.json(diagnostics);
  });

  if (!serverConfig.desktopMode) {
    router.get('/users', requirePermission('*'), (req, res) => {
      res.json({ users: userStore.listUsers() });
    });

    router.post('/users', requirePermission('*'), (req, res) => {
      try {
        const user = userStore.createUser(req.body);
        logger.info(`Created sub-user "${user.username}" with role "${user.role}"`);
        recordTeamActivity(req, 'account.created', `Added ${user.username} to the workspace`, { username: user.username, role: user.role });
        res.json({ success: true, user });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

    router.post('/users/:id/reset-password', requirePermission('*'), (req, res) => {
      const password = String(req.body?.password || '');
      const confirmPassword = String(req.body?.confirmPassword || '');
      if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
      try {
        const user = userStore.resetPassword(req.params.id, password, { requireChange: true });
        recordTeamActivity(req, 'account.password_reset', `Reset the password for ${user.username}`, { username: user.username });
        res.json({ success: true, user });
      } catch (error) { res.status(400).json({ error: error.message }); }
    });

    router.patch('/users/:id/permissions', requirePermission('*'), (req, res) => {
      try {
        const user = userStore.updateUserPermissions(req.params.id, req.body?.permissions, { actorUserId: req.user.id });
        const sessionOnline = user.hasActiveSession && isUserOnline(user.id);
        const sessionInvalidated = user.hasActiveSession && !sessionOnline;
        if (user.hasActiveSession && !sessionOnline) {
          userStore.revokeUserSession(user.id);
          user.hasActiveSession = false;
        }
        logger.info(`Updated workspace permissions for "${user.username}" (${user.role})`);
        recordTeamActivity(req, 'account.permissions_updated', `Updated permissions for ${user.username}`, { username: user.username, role: user.role, permissions: user.permissions });
        res.json({ success: true, user, sessionOnline, sessionInvalidated });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    router.post('/users/:id/logout', requirePermission('*'), (req, res) => {
      try {
        const signedOut = userStore.revokeUserSession(req.params.id);
        res.json({ success: true, signedOut });
      } catch (error) {
        res.status(/not found/.test(error.message) ? 404 : 400).json({ error: error.message || 'Could not sign out this account.' });
      }
    });

    router.delete('/users/:id', requirePermission('*'), (req, res) => {
      try {
        const target = userStore.listUsers().find((user) => user.id === req.params.id);
        if (target && !target.isPrimaryAdmin) recordTeamActivity(req, 'account.removed', `Removed ${target.username} from the workspace`, { username: target.username });
        userStore.deleteUser(req.params.id);
        logger.info(`Deleted sub-user ${req.params.id}`);
        res.json({ success: true });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });

  router.get('/activity', requirePermission('graphs:read'), (req, res) => {
    res.json({ activity: userStore.listUsers().length > 1 ? activityStoreForProject(managerForUser(req.user)).list(req.query.limit) : [] });
    });
  }

  router.get('/activity-webhook/settings', requirePermission('*'), (req, res) => {
    if (serverConfig.desktopMode) return res.sendStatus(404);
    if (req.user?.isPrimaryAdmin !== true) return res.status(403).json({ error: 'Only the primary workspace owner can manage the activity webhook.' });
    res.json(activityWebhookStore.settings());
  });

  router.put('/activity-webhook/settings', requirePermission('*'), (req, res) => {
    if (serverConfig.desktopMode) return res.sendStatus(404);
    if (req.user?.isPrimaryAdmin !== true) return res.status(403).json({ error: 'Only the primary workspace owner can manage the activity webhook.' });
    try {
      const settings = activityWebhookStore.update(req.body);
      activityWebhookDispatcher.settingsChanged();
      recordTeamActivity(req, 'activity.webhook_updated', 'Updated Discord activity webhook settings', {});
      res.json(settings);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not save activity webhook settings.' });
    }
  });

  router.get('/embeds', (req, res) => {
    res.json({ embeds: getEmbedStore().list() });
  });

  router.post('/embeds', requirePermission('graphs:write'), (req, res) => {
    try {
      const previous = getEmbedStore().list().find((embed) => embed.id === req.body?.id);
      const embed = getEmbedStore().save(req.body);
      const assetBlocks = embed.kind === 'components-v2' ? embed.componentsV2Layout : embed.blocks;
      const blockTypes = [...new Set(assetBlocks.map((block) => block?.type).filter((type) => typeof type === 'string'))].slice(0, 40);
      const assetLabel = embed.kind === 'components-v2' ? 'Components V2 asset' : 'embed';
      recordTeamActivity(req, previous ? 'embed.updated' : 'embed.created', `${previous ? 'Updated' : 'Created'} ${assetLabel} “${embed.name}”`, { embedId: embed.id, embedName: embed.name, blockCount: assetBlocks.length, blockTypes });
      const embeds = getEmbedStore().list();
      botManager.broadcastWS({ type: 'EMBEDS_UPDATED', payload: { embeds } });
      res.json({ success: true, embed, embeds });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not save this embed.' });
    }
  });

  router.delete('/embeds/:embedId', requirePermission('graphs:write'), (req, res) => {
    const embed = getEmbedStore().delete(req.params.embedId);
    if (!embed) return res.status(404).json({ error: 'Embed not found.' });
    recordTeamActivity(req, 'embed.deleted', `Deleted embed “${embed.name}”`, { embedId: embed.id, embedName: embed.name });
    const embeds = getEmbedStore().list();
    botManager.broadcastWS({ type: 'EMBEDS_UPDATED', payload: { embeds } });
    res.json({ success: true, embeds });
  });

  // Bot State
  router.get('/bot/state', (req, res) => {
    const permissions = req.user?.permissions || [];
    const canExportBotToken = req.user?.isPrimaryAdmin === true
      || (serverConfig.showBotTokenExportOptionToAuthorizedUsers && (permissions.includes('*') || permissions.includes('bot:control')));
    res.json({
      status: botManager.status,
      profile: botManager.botProfile,
      intents: botManager.getIntentPlan?.() || [],
      discordAuthWarning: botManager.discordAuthWarning || null,
      hasToken: Boolean(botManager.getBotToken()),
      canExportBotToken
    });
  });

  router.get('/bot/intents', requirePermission('bot:control'), async (req, res) => {
    const manager = managerForUser(req.user);
    const intents = await manager.refreshIntentPlan?.(req.query.refresh === '1') || manager.getIntentPlan?.() || [];
    res.json({ intents });
  });

  const getBotApplicationContext = async () => {
    const token = botManager.getBotToken();
    if (!token) throw new Error('Configure a bot token first.');
    const rest = botManager.createTrackedRESTClient(token);
    let application = botManager.botProfile?.application;
    if (!application?.id) application = await rest.getCurrentApplication();
    if (!application?.id) throw new Error('Discord did not return an application ID for this bot.');
    if (botManager.botProfile) {
      botManager.botProfile = { ...botManager.botProfile, application };
      botManager.persistBotConfig?.();
    }
    return { rest, application };
  };
// Bot Emojis
  router.get('/bot/emojis', requirePermission('bot:control'), async (req, res) => {
    try {
      const { rest, application } = await getBotApplicationContext();
      const result = await rest.getApplicationEmojis(application.id);
      const items = Array.isArray(result?.items) ? result.items : [];
      botManager.applicationEmojis = items;
      res.json({ applicationId: application.id, emojis: items, total: items.length, limit: 2000 });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.post('/bot/emojis', requirePermission('emojis:upload'), async (req, res) => {
    const { name, image } = req.body || {};
    const safeName = typeof name === 'string' ? name.trim() : '';
    if (!/^[A-Za-z0-9_]{2,32}$/.test(safeName)) {
      return res.status(400).json({ error: 'Emoji names must be 2–32 letters, numbers, or underscores.' });
    }
    const match = typeof image === 'string' && image.match(/^data:image\/(png|gif|jpeg|webp|avif);base64,([A-Za-z0-9+/]+={0,2})$/i);
    if (!match) return res.status(400).json({ error: 'Choose a valid PNG, GIF, JPEG, WebP, or AVIF image.' });
    const imageBytes = Buffer.from(match[2], 'base64');
    if (!imageBytes.length || imageBytes.length > 256 * 1024) {
      return res.status(413).json({ error: 'Emoji images must be smaller than 256 KiB.' });
    }
    try {
      const { rest, application } = await getBotApplicationContext();
      const result = await rest.getApplicationEmojis(application.id);
      if ((result?.items?.length || 0) >= 2000) return res.status(409).json({ error: 'This app has reached Discord’s 2,000 emoji limit.' });
      const emoji = await rest.createApplicationEmoji(application.id, { name: safeName, image });
      botManager.applicationEmojis = [...(botManager.applicationEmojis || []).filter((item) => item.id !== emoji.id), emoji];
      logger.info(`Uploaded app emoji :${emoji.name}: (${emoji.id}) to application ${application.id}`);
      res.json({ success: true, emoji });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.delete('/bot/emojis/:emojiId', requirePermission('emojis:upload'), async (req, res) => {
    try {
      const { rest, application } = await getBotApplicationContext();
      await rest.deleteApplicationEmoji(application.id, req.params.emojiId);
      botManager.applicationEmojis = (botManager.applicationEmojis || []).filter((item) => item.id !== req.params.emojiId);
      logger.info(`Deleted app emoji ${req.params.emojiId} from application ${application.id}`);
      res.json({ success: true });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.post('/bot/verify-token', requirePermission('bot:control'), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    try {
      const profile = await botManager.verifyAndFetchProfile(token.trim());
      res.json({ success: true, profile });
    } catch (err) {
      res.status(400).json({ error: err.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.get('/bot/guilds', async (req, res) => {
    const token = botManager.getBotToken();
    if (!token) {
      return res.status(400).json({ error: 'Bot token not configured.' });
    }
    try {
      const rest = botManager.createTrackedRESTClient(token);
      const guilds = await rest.getCurrentUserGuilds({ limit: 100 });
      res.json({ guilds });
    } catch (err) {
      res.status(500).json({ error: err.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

// Guild Emojis
  router.get('/bot/guilds/:guildId/emojis', async (req, res) => {
    const token = botManager.getBotToken();
    if (!token) {
      return res.status(400).json({ error: 'Bot token not configured.' });
    }
    try {
      const rest = botManager.createTrackedRESTClient(token);
      const emojis = await rest.getGuildEmojis(req.params.guildId);
      res.json({ emojis });
    } catch (err) {
      res.status(500).json({ error: err.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.post('/bot/guilds/:guildId/emojis', requirePermission('emojis:upload'), async (req, res) => {
    const token = botManager.getBotToken();
    if (!token) {
      return res.status(400).json({ error: 'Bot token not configured.' });
    }
    const { name, image, roles } = req.body;
    if (!name || !image) {
      return res.status(400).json({ error: 'Emoji name and image are required.' });
    }

    try {
      const rest = botManager.createTrackedRESTClient(token);
      const created = await rest.createGuildEmoji(req.params.guildId, { name, image, roles: roles || [] });
      logger.info(`Custom emoji :${created.name}: uploaded to guild ${req.params.guildId}`);
      res.json({ success: true, emoji: created });
    } catch (err) {
      res.status(500).json({ error: err.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  // Cryptography & Security Engine API
  router.post('/crypto/encrypt', requirePermission('graphs:write'), (req, res) => {
    const { plaintext, passphrase, aad } = req.body;
    if (plaintext === undefined || plaintext === null) {
      return res.status(400).json({ error: 'Plaintext is required' });
    }
    try {
      const envelope = CryptoEngine.encrypt(plaintext, passphrase || null, aad || null);
      res.json({ success: true, envelope, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA512' });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/crypto/decrypt', requirePermission('graphs:write'), (req, res) => {
    const { envelope, passphrase, aad } = req.body;
    if (!envelope) return res.status(400).json({ error: 'Envelope is required' });
    try {
      const decrypted = CryptoEngine.decrypt(envelope, passphrase || null, aad || null);
      res.json({ success: true, decrypted });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/crypto/hash', (req, res) => {
    const { data, algorithm = 'sha256' } = req.body;
    if (data === undefined || data === null) return res.status(400).json({ error: 'Data is required' });
    try {
      const hash = CryptoEngine.hash(data, algorithm);
      res.json({ success: true, hash, algorithm });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/crypto/random-token', (req, res) => {
    const { bytes = 32, encoding = 'hex' } = req.body;
    const token = CryptoEngine.randomToken(Number(bytes), encoding);
    res.json({ success: true, token, bytes, encoding });
  });

  // Bot Lifecycle Controls
  router.post('/bot/start', requirePermission('bot:control'), async (req, res) => {
    try {
      await managerForUser.stopOtherGateways?.(botManager);
      await botManager.startBot();
      res.json({ success: true, status: botManager.status, intents: botManager.getIntentPlan?.() || [] });
    } catch (err) {
      res.status(500).json({ error: err.message, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.post('/bot/stop', requirePermission('bot:control'), (req, res) => {
    botManager.stopBot();
    res.json({ success: true, status: botManager.status });
  });

  router.post('/bot/commands/deploy', requirePermission('bot:control'), async (req, res) => {
    try {
      const result = await botManager.deploySlashCommands(req.body?.graphs, req.body?.planHash);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, retryAfterMs: err.retryAfterMs, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.post('/bot/commands/preview', requirePermission('bot:control'), async (req, res) => {
    try {
      const plan = await botManager.previewSlashCommands(req.body?.graphs);
      res.json({ success: true, ...plan });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message, retryAfterMs: err.retryAfterMs, discordAuthWarning: botManager.discordAuthWarning || null });
    }
  });

  router.get('/bot/statistics/settings', requirePermission('bot:control'), (req, res) => {
    res.json({ settings: botManager.commandStatistics.getSettings() });
  });

  router.patch('/bot/statistics/settings', requirePermission('bot:control'), (req, res) => {
    const body = req.body || {};
    const patch = {};
    for (const key of ['enabled', 'commandUsage', 'uniqueUsers', 'returningUsers']) {
      if (typeof body[key] === 'boolean') patch[key] = body[key];
    }
    if ([30, 90, 180, 365, 'forever'].includes(body.retentionDays)) patch.retentionDays = body.retentionDays;
    res.json({ success: true, settings: botManager.updateCommandStatisticsSettings(patch) });
  });

  router.get('/bot/statistics', requirePermission('bot:control'), (req, res) => {
    const days = req.query.days;
    const command = typeof req.query.command === 'string' ? req.query.command.slice(0, 100) : '';
    if (command) return res.json({ statistics: botManager.getCommandStatistic(command, { days }) });
    res.json({ statistics: botManager.getCommandStatistics({ days }) });
  });

  // Node Registry Metadata
  router.get('/nodes/registry', (req, res) => {
    const registry = getNodeRegistryPayload();
    res.set('ETag', `"${registry.registryRevision}"`);
    res.set('Cache-Control', 'private, no-cache');
    res.vary('Authorization');
    res.vary('x-arc-token');
    res.vary('Origin');
    if (req.fresh) return res.status(304).end();
    return res.json(registry);
  });

  router.get('/plugins/catalog', async (req, res) => {
    try {
      const manager = managerForUser(req.user);
      const plugins = await PluginStore.catalog();
      res.json({ studioVersion: serverConfig.version, plugins: plugins.map((plugin) => ({ ...plugin, grantedPermissions: PluginStore.projectPermissions(manager.projectDir, plugin.id) })) });
    }
    catch (error) { res.status(502).json({ error: error.message || 'Could not reach the ARC plugin catalog.' }); }
  });

  router.get('/plugins/installed', (req, res) => {
    res.json({ plugins: installedPluginsForResponse(managerForUser(req.user)) });
  });

  router.put('/plugins/:pluginId/permissions', requirePermission('graphs:write'), (req, res) => {
    try {
      const manager = managerForUser(req.user);
      if (manager.project.ownerId !== req.user.id && !req.user.permissions?.includes('*')) return res.status(403).json({ error: 'Only the project owner or a workspace admin can grant plugin permissions.' });
      const permissions = PluginStore.setProjectPermissions(manager.projectDir, req.params.pluginId, req.body?.permissions);
      res.json({ success: true, grantedPermissions: permissions, installed: installedPluginsForResponse(manager) });
    } catch (error) {
      res.status(/not installed/.test(error.message) ? 404 : 400).json({ error: error.message || 'Could not update plugin permissions.' });
    }
  });

  router.get('/plugins/:pluginId/settings', requirePermission('graphs:read'), (req, res) => {
    try {
      const plugin = PluginStore.installed().find((item) => item.id === req.params.pluginId);
      if (!plugin) return res.status(404).json({ error: 'Plugin is not installed.' });
      const manager = managerForUser(req.user);
      if (manager.project.ownerId !== req.user.id && !req.user.permissions?.includes('*')) return res.status(403).json({ error: 'Only this project’s owner or a workspace admin can view connection settings.' });
      res.json({ projectId: manager.project.id, ...PluginStore.publicProjectSettings(manager.projectDir, plugin.id) });
    } catch (error) { res.status(400).json({ error: error.message || 'Could not load plugin settings.' }); }
  });

  router.put('/plugins/:pluginId/settings', requirePermission('graphs:write'), (req, res) => {
    try {
      const plugin = PluginStore.installed().find((item) => item.id === req.params.pluginId);
      if (!plugin) return res.status(404).json({ error: 'Plugin is not installed.' });
      const manager = managerForUser(req.user);
      if (manager.project.ownerId !== req.user.id && !req.user.permissions?.includes('*')) return res.status(403).json({ error: 'Only this project’s owner or a workspace admin can change plugin connection settings.' });
      if (req.body?.projectId && req.body.projectId !== manager.project.id) return res.status(409).json({ error: 'The active project changed before these settings were saved. Reopen Plugin Store and try again.' });
      res.json({ success: true, projectId: manager.project.id, ...PluginStore.saveProjectSettings(manager.projectDir, plugin.id, { ...(req.body?.values || {}), clearSecrets: req.body?.clearSecrets }) });
    } catch (error) { res.status(400).json({ error: error.message || 'Could not save plugin settings.' }); }
  });

  router.get('/plugins/source', (_req, res) => {
    res.json({ repository: PluginStore.repository() });
  });

  router.patch('/plugins/source', requirePermission('*'), (req, res) => {
    try {
      if (req.body?.trustConfirmed !== true) return res.status(400).json({ error: 'Confirm that you trust this plugin repository before saving it.' });
      const repository = PluginStore.setRepository(req.body?.repositoryUrl);
      recordTeamActivity(req, 'plugin.source_changed', `Changed the plugin source to ${repository.url}`, { repositoryUrl: repository.url });
      res.json({ success: true, repository });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not save the plugin repository.' });
    }
  });

  router.post('/plugins/auto-update', requirePermission('graphs:write'), async (_req, res) => {
    const previousRevision = registryRevision();
    try {
      const result = await PluginStore.autoUpdate(botManager);
      publishRegistryChange(previousRevision);
      const manager = managerForUser(_req.user);
      res.json({ ...result, installed: installedPluginsForResponse(manager), updated: result.updated.map((plugin) => ({ ...plugin, installedBy: installerForResponse(plugin) })) });
    }
    catch (error) { res.status(502).json({ error: error.message || 'Could not check for plugin updates.' }); }
  });

  router.post('/plugins/import-local', requirePermission('graphs:write'), (req, res) => {
    const previousRevision = registryRevision();
    try {
      if (req.body?.trustConfirmed !== true) return res.status(400).json({ error: 'Confirm that you trust this local plugin before importing it.' });
      const plugin = PluginStore.importLocal(req.body?.pack, botManager, { autoUpdate: req.body?.autoUpdate !== false, installedBy: req.user?.username });
      publishRegistryChange(previousRevision);
      recordTeamActivity(req, 'plugin.imported', `Imported plugin pack “${plugin.name || plugin.id}”`, { pluginId: plugin.id, pluginName: plugin.name || '' });
      res.json({ success: true, plugin: { ...plugin, installedBy: installerForResponse(plugin) }, installed: installedPluginsForResponse(managerForUser(req.user)) });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not import this local plugin pack.' });
    }
  });

  router.post('/plugins/import-adapter', requirePermission('graphs:write'), (req, res) => {
    const previousRevision = registryRevision();
    try {
      if (req.body?.trustConfirmed !== true) return res.status(400).json({ error: 'Confirm that you trust this local plugin adapter before importing it.' });
      const plugin = PluginStore.importLocalAdapter(req.body?.manifest, req.body?.wasmBase64, { autoUpdate: req.body?.autoUpdate !== false, installedBy: req.user?.username });
      publishRegistryChange(previousRevision);
      recordTeamActivity(req, 'plugin.imported', `Imported WebAssembly adapter “${plugin.name || plugin.id}”`, { pluginId: plugin.id, pluginName: plugin.name || '' });
      res.json({ success: true, plugin: { ...plugin, installedBy: installerForResponse(plugin) }, installed: installedPluginsForResponse(managerForUser(req.user)) });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not import this WebAssembly adapter.' });
    }
  });

  router.post('/plugins/:pluginId/install', requirePermission('graphs:write'), async (req, res) => {
    const previousRevision = registryRevision();
    try {
      if (req.body?.trustConfirmed !== true) return res.status(400).json({ error: 'Confirm that you trust this plugin source before installing it.' });
      const manager = managerForUser(req.user);
      const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
      if (permissions.length && manager.project.ownerId !== req.user.id && !req.user.permissions?.includes('*')) return res.status(403).json({ error: 'Only the project owner or a workspace admin can grant plugin permissions.' });
      const plugin = await PluginStore.install(req.params.pluginId, manager, {
        autoUpdate: req.body?.autoUpdate !== false,
        installedBy: req.user?.username,
        projectDir: manager.projectDir,
        permissions,
        expectedVersion: String(req.body?.expectedVersion || ''),
        expectedSha256: String(req.body?.expectedSha256 || ''),
        expectedRepositoryUrl: String(req.body?.expectedRepositoryUrl || ''),
        hostCodeConfirmed: req.body?.hostCodeConfirmed === true,
        ownerApprovedHostCode: manager.project.ownerId === req.user.id || req.user.permissions?.includes('*') === true
      });
      publishRegistryChange(previousRevision);
      recordTeamActivity(req, 'plugin.installed', `Installed plugin pack “${plugin.name || plugin.id}”`, { pluginId: plugin.id, pluginName: plugin.name || '' });
      res.json({ success: true, plugin: { ...plugin, grantedPermissions: PluginStore.projectPermissions(manager.projectDir, plugin.id), installedBy: installerForResponse(plugin) }, installed: installedPluginsForResponse(manager) });
    } catch (error) {
      const status = /used by/.test(error.message) ? 409 : /not listed/.test(error.message) ? 404 : /already installed/.test(error.message) ? 200 : 400;
      res.status(status).json({ error: error.message || 'Could not install this plugin.' });
    }
  });

  router.delete('/plugins/:pluginId', requirePermission('graphs:write'), (req, res) => {
    const previousRevision = registryRevision();
    try {
      const plugin = PluginStore.installed().find((item) => item.id === req.params.pluginId);
      PluginStore.uninstall(req.params.pluginId, botManager);
      publishRegistryChange(previousRevision);
      recordTeamActivity(req, 'plugin.removed', `Removed plugin pack “${plugin?.name || req.params.pluginId}”`, { pluginId: req.params.pluginId, pluginName: plugin?.name || '' });
      res.json({ success: true, installed: installedPluginsForResponse(managerForUser(req.user)) });
    } catch (error) {
      res.status(/used by/.test(error.message) ? 409 : 400).json({ error: error.message || 'Could not uninstall this plugin.' });
    }
  });

  // Graph Workspaces & Tabs
  router.get('/variables/project', requirePermission('graphs:read'), (_req, res) => {
    res.json({
      projectId: botManager.project.id,
      variables: botManager.getProjectVariables(),
      disabledBuiltInVariables: [...botManager.disabledBuiltInProjectVariables]
    });
  });

  router.post('/variables/project/restore-builtin', requirePermission('graphs:write'), (req, res) => {
    try {
      const result = botManager.restoreBuiltInProjectVariable(req.body?.name);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not restore system variable.' });
    }
  });

  router.put('/variables/project', requirePermission('graphs:write'), (req, res) => {
    try {
      if (req.body?.projectId && req.body.projectId !== botManager.project.id) return res.status(409).json({ error: 'The active project changed before these variables were saved. Refresh the sidebar and try again.' });
      const variables = botManager.setProjectVariables(req.body?.variables);
      res.json({ success: true, projectId: botManager.project.id, variables });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not save project variables.' });
    }
  });

  router.get('/graphs', (req, res) => {
    res.json({ graphs: botManager.getGraphs() });
  });

  router.get('/graphs/library', (req, res) => {
    res.json(botManager.getGraphLibrary());
  });

  router.post('/graphs/:tabId/snapshots', requirePermission('graphs:write'), (req, res) => {
    try {
      const automatic = req.body?.automatic === true;
      const snapshot = botManager.createGraphSnapshot(req.params.tabId, req.body?.graph, req.body?.name, {
        automatic,
        retentionHours: req.body?.retentionHours
      });
      recordTeamActivity(req, 'graph.snapshot', `Saved snapshot “${snapshot.name}”`, { graphId: req.params.tabId, snapshotId: snapshot.id, snapshotName: snapshot.name });
      res.json({ success: true, snapshot, ...botManager.getGraphLibrary() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/graphs/snapshots/:snapshotId', requirePermission('graphs:write'), (req, res) => {
    botManager.deleteGraphSnapshot(req.params.snapshotId);
    res.json({ success: true, ...botManager.getGraphLibrary() });
  });

  router.post('/graphs/templates', requirePermission('graphs:write'), (req, res) => {
    try {
      const template = botManager.saveGraphTemplate(req.body?.graph, req.body?.name);
      recordTeamActivity(req, 'graph.template', `Saved graph template “${template.name}”`, { graphId: template.id, templateName: template.name });
      res.json({ success: true, template, ...botManager.getGraphLibrary() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/graphs/templates/:templateId', requirePermission('graphs:write'), (req, res) => {
    botManager.deleteGraphTemplate(req.params.templateId);
    res.json({ success: true, ...botManager.getGraphLibrary() });
  });

  router.patch('/graphs/default', requirePermission('graphs:write'), (req, res) => {
    try {
      const defaultGraphId = botManager.setDefaultGraph(req.body?.graphId);
      res.json({ success: true, defaultGraphId });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/graphs/export/bot.zip', requirePermission('graphs:read'), async (req, res) => {
    const includeBotToken = req.body?.includeBotToken === true;
    const includeCryptoSecret = req.body?.includeCryptoSecret === true;
    const permissions = req.user?.permissions || [];
    const canExportBotToken = req.user?.isPrimaryAdmin === true
      || (serverConfig.showBotTokenExportOptionToAuthorizedUsers && (permissions.includes('*') || permissions.includes('bot:control')));
    if (includeBotToken && !canExportBotToken) {
      return res.status(403).json({ error: 'Only the primary owner can include the bot token in exports unless ARC_SHOW_BOT_TOKEN_EXPORT_OPTION is enabled for bot-control accounts.' });
    }
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : botManager.project.id;
    const project = botManager.projectStore.projects.find((item) => item.id === projectId);
    if (!project) return res.status(404).json({ error: 'That project no longer exists.' });
    const isActiveProject = projectId === botManager.project.id;
    if (includeBotToken && !isActiveProject) return res.status(400).json({ error: 'Switch to the project whose bot token you want to include, then export again.' });
    const botToken = includeBotToken ? botManager.getBotToken() : null;
    if (includeBotToken && !botToken) return res.status(400).json({ error: 'No bot token is configured for this project.' });
    if (botExportRuns.has(projectId)) return res.status(409).json({ error: 'A bot export is already running for this project.', code: 'BOT_EXPORT_IN_PROGRESS' });
    const exportId = typeof req.body?.exportId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(req.body.exportId) ? req.body.exportId : randomUUID();
    const startedAt = Date.now();
    botExportRuns.set(projectId, exportId);
    const report = (stage, progress, message) => publishBotExport(projectId, { exportId, stage, progress, message, status: 'running' });
    report('preparing', 8, 'Preparing saved project data');
    try {
      let projectGraphs = botManager.getGraphs();
      let projectVariables = botManager.getProjectVariables();
      if (!isActiveProject) {
        const projectDirectory = botManager.projectStore.directory(projectId);
        const graphPath = path.join(projectDirectory, 'graphs.json');
        if (fs.existsSync(graphPath)) {
          const stored = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
          const savedGraphs = Array.isArray(stored) ? stored : stored.graphs;
          projectGraphs = Array.isArray(savedGraphs) ? savedGraphs : [];
        } else projectGraphs = [];
        const variablesPath = path.join(projectDirectory, 'project-variables.json');
        if (fs.existsSync(variablesPath)) {
          const storedVariables = JSON.parse(fs.readFileSync(variablesPath, 'utf8'));
          projectVariables = Array.isArray(storedVariables) ? storedVariables : [];
        } else projectVariables = [];
      }
      const exportGraphs = projectGraphs.map((graph) => ({
        ...graph,
        variables: Array.isArray(graph.variables) ? graph.variables.filter((variable) => variable?.secret !== true) : graph.variables
      }));
      projectVariables = projectVariables.filter((variable) => variable?.secret !== true);
      const projectOwner = userStore.users.find((user) => user.id === project.ownerId);
      const adapters = PluginStore.exportAdapters(exportGraphs);
      const exportSettings = {
        includeCryptoSecret,
        includeBotToken,
        projectName: project.name,
        projectAuthor: projectOwner?.username || req.user?.username || 'Unknown',
        logRetentionDays: project.logRetentionDays ?? process.env.LOG_RETENTION_DAYS ?? 7,
        statisticsSettings: botManager.commandStatistics.getSettings()
      };
      const fingerprintInput = { graphs: exportGraphs, projectVariables, adapters, project: project.name, owner: exportSettings.projectAuthor, logRetentionDays: exportSettings.logRetentionDays, statisticsSettings: exportSettings.statisticsSettings, includeCryptoSecret, includeBotToken, botTokenDigest: includeBotToken ? createHash('sha256').update(botToken).digest('hex') : '' };
      const fingerprint = createHash('sha256').update(stableJson(fingerprintInput)).digest('hex');
      const cacheKey = `${projectId}:${fingerprint}`;
      let archive;
      const cached = botExportCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        archive = cached.archive;
        report('checking-cache', 72, 'Using saved export and checking its integrity');
        await nextTurn();
      } else {
        if (cached) botExportCache.delete(cacheKey);
        report('zipping', 38, 'Building the bot ZIP');
        await nextTurn();
        archive = buildBotArchive(exportGraphs, projectVariables, adapters, { ...exportSettings, ...(includeBotToken ? { botToken } : {}) });
      }
      report('verifying', 88, cached && cached.expiresAt > Date.now() ? 'Verifying cached archive integrity' : 'Verifying SHA-256 file records');
      await nextTurn();
      verifyBotArchiveIntegrity(archive);
      if (!cached || cached.expiresAt <= Date.now()) {
        for (const key of botExportCache.keys()) if (key.startsWith(`${projectId}:`)) botExportCache.delete(key);
        botExportCache.set(cacheKey, { archive, expiresAt: Date.now() + 30 * 60 * 1000 });
      }
      const remainingDisplayMs = Math.max(0, 500 - (Date.now() - startedAt));
      if (remainingDisplayMs) await new Promise((resolve) => setTimeout(resolve, remainingDisplayMs));
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="arc-bot-export.zip"');
      res.setHeader('Content-Length', archive.length);
      res.send(archive);
      publishBotExport(projectId, { exportId, stage: 'complete', progress: 100, message: cached && cached.expiresAt > Date.now() ? 'Cached bot export is ready' : 'Bot export is ready', status: 'complete' });
    } catch (error) {
      publishBotExport(projectId, { exportId, stage: 'failed', progress: 100, message: error.message || 'Could not create bot export', status: 'failed' });
      res.status(500).json({ error: `Could not create bot export: ${error.message}` });
    } finally {
      if (botExportRuns.get(projectId) === exportId) botExportRuns.delete(projectId);
    }
  });

  router.post('/graphs/import', requirePermission('graphs:write'), (req, res) => {
    const source = req.body?.graph;
    if (!source || !Array.isArray(source.nodes) || !Array.isArray(source.connections)) {
      return res.status(400).json({ error: 'Choose a valid ARC Studio graph JSON file.' });
    }
    if (source.nodes.length > 2000 || source.connections.length > 10000) {
      return res.status(413).json({ error: 'This graph is too large to import.' });
    }
    try {
      const id = `graph_import_${randomUUID()}`;
      const name = String(source.name || 'Imported graph').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Imported graph';
      const graph = { ...source, id, name };
      delete graph.isDirty;
      const saved = botManager.saveGraph(id, graph);
      recordTeamActivity(req, 'graph.imported', `Imported graph “${saved.name}”`, { graphId: saved.id, graphName: saved.name, graphType: saved.graphType || 'event', nodeCount: saved.nodes.length });
      res.status(201).json({ success: true, graph: saved });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not import this graph.' });
    }
  });

  router.post('/graphs/attachment-url', requirePermission('graphs:write'), async (req, res) => {
    const sourceUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!sourceUrl) return res.status(400).json({ error: 'Enter a URL for the attachment.' });
    try {
      const { bytes, contentType } = await downloadSafeHttpFile(sourceUrl);
      let filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
      if (!filename) {
        try { filename = decodeURIComponent(new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() || 'attachment.bin'); }
        catch { filename = 'attachment.bin'; }
      }
      filename = filename.replace(/[\\/\0-\x1f]/g, '_').slice(0, 100) || 'attachment.bin';
      res.json({ success: true, file: { filename, contentType, data: `data:${contentType};base64,${bytes.toString('base64')}` } });
    } catch (error) {
      res.status(/exceeds the .* download limit/i.test(error.message) ? 413 : 400).json({ error: error.message || 'Could not download this attachment.' });
    }
  });

  router.post('/graphs/:tabId', requirePermission('graphs:write'), (req, res) => {
    try {
      if (botManager.deletedGraphIds?.has(req.params.tabId)) {
        return res.status(409).json({ error: 'This graph was deleted. Create a new graph instead of saving a stale tab.' });
      }
      const previous = botManager.getGraphs().find((graph) => graph.id === req.params.tabId) || null;
      const saved = botManager.saveGraph(req.params.tabId, req.body);
      onGraphSaved(botManager.project?.id, saved);
      const changedNodes = graphNodeChanges(previous, saved);
      const connectionsChanged = JSON.stringify(previous?.connections || []) !== JSON.stringify(saved.connections || []);
      const variablesChanged = JSON.stringify(previous?.variables || []) !== JSON.stringify(saved.variables || []);
      const nameChanged = previous?.name !== saved.name;
      if (!previous || changedNodes.length || connectionsChanged || variablesChanged || nameChanged) {
        recordTeamActivity(req, previous ? 'graph.updated' : 'graph.created', `${previous ? 'Updated' : 'Created'} graph “${saved.name || saved.id}”${changedNodes.length ? ` · ${changedNodes.length} node${changedNodes.length === 1 ? '' : 's'} changed` : ''}`, {
          graphId: saved.id,
          graphName: saved.name || saved.id,
          graphType: saved.graphType || 'event',
          nodeCounts: {
            added: changedNodes.filter((node) => node.change === 'added').length,
            updated: changedNodes.filter((node) => node.change === 'updated').length,
            removed: changedNodes.filter((node) => node.change === 'removed').length
          },
          changedNodes: changedNodes.slice(0, 50),
          connectionsChanged,
          variablesChanged,
          nameChanged
        });
      }
      const saveClientId = typeof req.headers['x-arc-save-client-id'] === 'string' && req.headers['x-arc-save-client-id'].length > 0 && req.headers['x-arc-save-client-id'].length <= 120
        ? req.headers['x-arc-save-client-id']
        : undefined;
      botManager.broadcastWS({ type: 'GRAPH_UPDATED', payload: { graph: saved, updatedBy: req.user?.username || 'Workspace member', saveClientId } });
      res.json({ success: true, graph: saved });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/graphs/:tabId', requirePermission('graphs:write'), (req, res) => {
    const graph = botManager.getGraphs().find((item) => item.id === req.params.tabId);
    botManager.deleteGraph(req.params.tabId);
    clearDeletedGraphCollaboration(botManager.project.id, req.params.tabId);
    if (graph) recordTeamActivity(req, 'graph.deleted', `Deleted graph “${graph.name || graph.id}”`, { graphId: graph.id, graphName: graph.name || graph.id, nodeCount: (graph.nodes || []).length });
    res.json({ success: true, ...botManager.getGraphLibrary() });
  });

  // Mock Simulator Endpoints
  router.get('/mock/presets', (req, res) => {
    res.json({ presets: MockGateway.getPresetTemplates() });
  });

  router.post('/mock/inject', requirePermission('simulation:run'), async (req, res) => {
    const { tabId, eventName, payload } = req.body;
    if (!eventName || !payload) {
      return res.status(400).json({ error: 'eventName and payload are required' });
    }

    try {
      const result = await botManager.injectMockEvent(tabId, eventName, payload, req.body?.graph, null, req.body?.graphs);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/mock/debug/start', requirePermission('simulation:run'), (req, res) => {
    const { tabId, eventName, payload } = req.body || {};
    if (!tabId || !eventName || !payload) return res.status(400).json({ error: 'tabId, eventName, and payload are required.' });
    try {
      res.json({ success: true, ...botManager.startMockDebug(tabId, eventName, payload, req.body?.graph, req.body?.runId, req.body?.graphs) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/mock/debug/:runId/advance', requirePermission('simulation:run'), (req, res) => {
    try {
      res.json(botManager.advanceMockDebug(req.params.runId, req.body?.action === 'continue' ? 'continue' : 'step'));
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  // Logs Buffer
  router.get('/logs', (req, res) => {
    res.json({ logs: botManager.getLogs() });
  });

  router.delete('/logs', requirePermission('bot:control'), (req, res) => {
    botManager.clearLogs();
    res.json({ success: true });
  });

  // Historical Log Files
  router.get('/logs/files', (req, res) => {
    const files = logger.listLogFiles();
    res.json({ files });
  });

  router.get('/logs/files/:filename', (req, res) => {
    try {
      const content = logger.readLogFile(req.params.filename, parseInt(req.query.lines || '500', 10));
      res.type('text/plain').send(content);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  return router;
}

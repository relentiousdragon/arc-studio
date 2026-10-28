import { Client, CommandStatistics, GatewayIntents, RESTClient } from 'chezcord';
import { registerAsyncEventHandler } from './AsyncEventHandler.js';
import { MockGateway } from './MockGateway.js';
import { GraphRunner } from './GraphRunner.js';
import { GraphWebSocketManager } from './nodes/runtime/websocket.js';
import { startCronScheduler } from './CronSchedule.js';
import { waitForGatewayReady } from './GatewayReadyWaiter.js';
import { NodeDefinitions } from './NodeRegistry.js';
import { CryptoEngine } from '../security/CryptoEngine.js';
import { serverConfig } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ProjectStore } from '../storage/ProjectStore.js';
import { envFilePath } from '../storage.js';
import { findFocusedSlashOption, findSlashParameter, flattenSlashParameters, getFocusedSlashOptionPath, normalizeSlashCommandOptions, validateSlashCommandOptions } from './SlashCommandOptions.js';

const botConfigAad = 'arc-studio-bot-config-v1';
const botTokenAad = 'arc-studio-bot-token-v1';
const VERIFIED_BOT_FLAG = 1 << 16;
const APP_LATENCY_VARIABLE_ID = 'project_var_app_latency';
const GATEWAY_LATENCY_VARIABLE_ID = 'project_var_gateway_latency';
const BOT_UPTIME_VARIABLE_ID = 'project_var_bot_uptime';
const BOT_STATISTICS_VARIABLE_ID = 'project_var_bot_statistics';
const APP_LATENCY_INTERVAL_MS = 30_000;
const BOT_UPTIME_INTERVAL_MS = 1_000;
const SECRET_VARIABLE_MASK = '••••••';
//
function isDiscordVerifiedBot(user) {
  const rawFlags = user?.public_flags ?? user?.flags;
  if (rawFlags === undefined || rawFlags === null || rawFlags === '') return false;
  const flags = Number(rawFlags);
  return Number.isSafeInteger(flags) && flags >= 0 && (flags & VERIFIED_BOT_FLAG) !== 0;
}

function redactSecret(message, secret) {
  const text = String(message || 'Token verification failed.');
  return secret ? text.split(secret).join('[redacted]') : text;
}

function removePlaintextDefaultBotToken() {
  try {
    if (!fs.existsSync(envFilePath)) return;
    const original = fs.readFileSync(envFilePath, 'utf8');
    const sanitized = original.replace(/^\s*(?:export\s+)?DISCORD_BOT_TOKEN\s*=.*(?:\r?\n|$)/gm, '');
    if (sanitized === original) return;
    fs.writeFileSync(envFilePath, sanitized, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(envFilePath, 0o600); } catch {}
  } catch (error) {
    console.error('[Security] Could not remove the plaintext Discord bot token from the environment file. Remove DISCORD_BOT_TOKEN manually after confirming the token is saved.');
  }
}

export class BotManager {
  /**
   * @param {object} options
   * @param {Function} options.broadcastWS
   */
  constructor(options = {}) {
    this.broadcastWS = options.broadcastWS || (() => {});
    this.logger = options.logger || null;
    this.projectStore = options.projectStore || new ProjectStore();
    this.project = this.projectStore.projects.find((item) => item.id === options.projectId) || this.projectStore.active();
    this.disabledBuiltInProjectVariables = new Set(Array.isArray(this.project.disabledBuiltInVariables) ? this.project.disabledBuiltInVariables : []);
    this.setProjectPaths();
    this.secretValues = new Map();
    this.secretEnvelopes = new Map();
    this.loadSecretStore();
    this.encryptedBotToken = null;
    /** @type {Client|null} */
    this.client = null;
    this.restRateLimitListener = null;
    this.stopCronScheduler = null;
    this.graphRunAbortController = null;
    this.graphRunControllers = new Map();
    this.startBotPromise = null;
    this.botStartGeneration = 0;
    this.discordUnauthorizedCount = 0;
    this.discordAuthWarning = null;
    this.trackedRestClients = new WeakSet();
    this.status = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | ONLINE | ERROR
    this.botUptimeStartedAt = null;
    this.botUptimeInterval = null;
    this.gatewayMetrics = { latencyMs: null, averageLatencyMs: null, jitterMs: null, lastHeartbeatAt: null, rateLimitedUntil: 0, rateLimitScope: null };
    this.gatewayLatencySamples = [];
    this.botProfile = null;
    this.intentPlanLastRefreshAt = 0;
    this.intentPlanRefreshPromise = null;
    this.applicationEmojis = [];
    this.loadBotConfig();
    this.commandDeploymentLastAt = 0;
    this.commandDeploymentInFlight = false;
    this.debugRuns = new Map();
    if (serverConfig.defaultBotToken) {
      this.setBotToken(serverConfig.defaultBotToken, true);
      removePlaintextDefaultBotToken();
      serverConfig.defaultBotToken = null;
      process.env.DISCORD_BOT_TOKEN = '';
    }
    this.mockGateway = new MockGateway();
    this.graphWebSockets = new GraphWebSocketManager();
    this.webSocketDispatchGraphEvent = null;
    this.graphWebSockets.on('event', ({ eventName, payload }) => {
      this.webSocketDispatchGraphEvent?.(eventName, payload).catch((error) => this.log('ERROR', `WebSocket graph event ${eventName} failed: ${error.message}`));
    });
    this.logs = [];
    this.maxLogs = 500;
    this.statisticsSaveTimer = null;
    let statisticsState = {};
    try { statisticsState = JSON.parse(fs.readFileSync(this.statisticsStorePath, 'utf8')); } catch {}
    this.commandStatistics = new CommandStatistics({ state: statisticsState, onChange: () => this.scheduleStatisticsSave() });
    this.projectVariables = this.loadProjectVariables();

    // Active multi-tab graphs Map<tabId, GraphData>
    this.graphs = new Map();
    this.variableStates = new Map();
    this.mockVariableStates = new Map();
    this.projectVariableStates = new Map();
    this.mockProjectVariableStates = new Map();
    this.ensureAppLatencyVariable();
    this.ensureGatewayLatencyVariable();
    this.ensureBotUptimeVariable();
    this.ensureBotStatisticsVariable();
    this.deletedGraphIds = new Set();
    if (!this.project.emptyStart) this.initDefaultGraphs();
    this.loadSavedGraphs();
    const legacyPingGraph = this.graphs.get('tab_ping_pong');
    const legacyPingCheck = legacyPingGraph?.nodes?.find((node) => node.type === 'compare_text' && node.label === 'Check !ping');
    if (legacyPingCheck && !String(legacyPingCheck.data?.text_b || '').trim()) {
      legacyPingCheck.data = { ...legacyPingCheck.data, text_b: '!ping', operator: 'equals' };
    }
    const slashStarter = this.graphs.get('tab_slash_help');
    const slashEvent = slashStarter?.nodes?.find((node) => node.type === 'event_slash_command');
    if (slashEvent) slashEvent.data = { commandName: 'help', description: 'Show help and bot information.', ...slashEvent.data };
    this.graphTemplates = [];
    this.graphSnapshots = [];
    this.defaultGraphId = this.project.emptyStart ? '' : 'tab_slash_help';
    this.loadGraphLibrary();
    this.startAppLatencyMonitor();
    if (this.botProfile) this.botProfile.intentSummary = this.getIntentPlan();
  }

  setProjectPaths() {
    const directory = this.projectStore.directory(this.project.id);
    this.projectDir = directory;
    this.graphStorePath = path.join(directory, 'graphs.json');
    this.graphLibraryPath = path.join(directory, 'graph-library.json');
    this.botConfigPath = path.join(directory, 'bot-config.json');
    this.statisticsStorePath = path.join(directory, 'statistics.json');
    this.projectVariablesPath = path.join(directory, 'project-variables.json');
    this.secretStorePath = path.join(directory, 'secrets.json');
    this.logger?.setProjectScope(path.join(directory, 'logs'), this.project.logRetentionDays ?? null);
  }

  setProjectLogRetention(retentionDays) {
    this.project.logRetentionDays = retentionDays;
    const storedProject = this.projectStore.projects.find((item) => item.id === this.project.id);
    if (storedProject) storedProject.logRetentionDays = retentionDays;
    this.projectStore.persist();
    this.logger?.setProjectScope(path.join(this.projectDir, 'logs'), retentionDays);
    return retentionDays ?? (process.env.LOG_RETENTION_DAYS || 7);
  }

  getProjects() { return { ...this.projectStore.list(), activeProjectId: this.project.id }; }

  switchProject(id) {
    if (this.status === 'ONLINE' || this.status === 'CONNECTING') throw new Error('Stop the gateway before switching projects.');
    this.stopBotUptime();
    this.graphWebSockets.closeAll();
    this.webSocketDispatchGraphEvent = null;
    if (id !== this.project.id) {
      this.discordUnauthorizedCount = 0;
      this.discordAuthWarning = null;
      this.flushStatistics();
      this.persistGraphs();
      this.persistGraphLibrary();
      this.persistBotConfig();
    }
    const project = this.projectStore.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    this.project = { ...project };
    this.disabledBuiltInProjectVariables = new Set(Array.isArray(project.disabledBuiltInVariables) ? project.disabledBuiltInVariables : []);
    fs.mkdirSync(this.projectStore.directory(id), { recursive: true, mode: 0o700 });
    this.setProjectPaths();
    this.loadSecretStore();
    this.projectVariables = this.loadProjectVariables();
    this.encryptedBotToken = null;
    this.botProfile = null;
    this.applicationEmojis = [];
    this.graphs = new Map();
    this.deletedGraphIds = new Set();
    this.variableStates = new Map();
    this.mockVariableStates = new Map();
    this.projectVariableStates = new Map();
    this.mockProjectVariableStates = new Map();
    this.ensureAppLatencyVariable();
    this.ensureGatewayLatencyVariable();
    this.ensureBotUptimeVariable();
    this.ensureBotStatisticsVariable();
    if (!this.project.emptyStart) this.initDefaultGraphs();
    this.loadSavedGraphs();
    this.graphTemplates = [];
    this.graphSnapshots = [];
    this.defaultGraphId = this.project.emptyStart ? '' : 'tab_slash_help';
    this.loadGraphLibrary();
    this.loadBotConfig();
    if (serverConfig.defaultBotToken && !this.getBotToken()) {
      this.setBotToken(serverConfig.defaultBotToken, true);
      removePlaintextDefaultBotToken();
      serverConfig.defaultBotToken = null;
      process.env.DISCORD_BOT_TOKEN = '';
    }
    let statisticsState = {};
    try { statisticsState = JSON.parse(fs.readFileSync(this.statisticsStorePath, 'utf8')); } catch {}
    this.commandStatistics = new CommandStatistics({ state: statisticsState, onChange: () => this.scheduleStatisticsSave() });
    this.refreshAppLatency().catch((error) => this.log('WARN', `Could not refresh APP_LATENCY: ${error.message}`));
    this.updateBotStatistics();
    if (this.botProfile) this.botProfile.intentSummary = this.getIntentPlan();
    this.broadcastWS({ type: 'PROJECT_CHANGED', payload: { ...this.getProjects(), graphs: this.getGraphs(), graphLibrary: this.getGraphLibrary(), projectVariables: this.getProjectVariables(), botProfile: this.botProfile, discordAuthWarning: this.discordAuthWarning } });
    return this.project;
  }

  getBotToken() {
    if (!this.encryptedBotToken) return null;
    try {
      return CryptoEngine.decrypt(this.encryptedBotToken, serverConfig.botTokenEncryptionKey, botTokenAad);
    } catch {
      return null;
    }
  }

  createTrackedRESTClient(token = this.getBotToken()) {
    return this.trackDiscordRESTClient(new RESTClient({ token }));
  }

  trackDiscordRESTClient(rest) {
    if (!rest || typeof rest.request !== 'function' || this.trackedRestClients.has(rest)) return rest;
    this.trackedRestClients.add(rest);
    const request = rest.request.bind(rest);
    rest.request = async (...args) => {
      const requestOptions = args[2] || {};
      const authenticated = requestOptions.auth !== false && Boolean(rest.token);
      try {
        const result = await request(...args);
        if (authenticated) this.recordDiscordAuthResult(200, rest.token);
        return result;
      } catch (error) {
        if (authenticated) this.recordDiscordAuthResult(error?.status, rest.token);
        throw error;
      }
    };
    return rest;
  }

  recordDiscordAuthResult(status, token) {
    if (!token || token !== this.getBotToken()) return;
    if (status === 401) {
      this.discordUnauthorizedCount = Math.min(3, this.discordUnauthorizedCount + 1);
      if (this.discordUnauthorizedCount === 3 && !this.discordAuthWarning) {
        this.discordAuthWarning = {
          title: 'Discord rejected the bot token',
          message: 'Discord returned HTTP 401 Unauthorized on three consecutive authenticated API requests using this project’s bot token. Check the token configured for this project. This warning does not block Gateway startup or command deployment review.'
        };
        this.log('WARN', this.discordAuthWarning.message);
        this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, discordAuthWarning: this.discordAuthWarning } });
      }
      return;
    }
    if (Number.isInteger(status)) this.discordUnauthorizedCount = 0;
    if (status >= 200 && status < 300 && this.discordAuthWarning) {
      this.discordAuthWarning = null;
      this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, discordAuthWarning: null } });
      this.log('INFO', 'Discord authenticated API request succeeded; cleared the bot token warning.');
    }
  }

  publishGatewayMetrics() {
    this.broadcastWS({ type: 'BOT_METRICS', payload: { ...this.gatewayMetrics } });
  }

  resetGatewayLatency() {
    this.updateGatewayLatency(0);
    this.gatewayLatencySamples = [];
    this.gatewayMetrics = { ...this.gatewayMetrics, latencyMs: null, averageLatencyMs: null, jitterMs: null, lastHeartbeatAt: null };
    this.publishGatewayMetrics();
  }

  recordGatewayLatency(latencyMs) {
    this.updateGatewayLatency(latencyMs);
    this.gatewayLatencySamples = [...this.gatewayLatencySamples.slice(-9), latencyMs];
    const samples = this.gatewayLatencySamples;
    const averageLatencyMs = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
    const jitterMs = samples.length > 1
      ? Math.round(samples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - samples[index]), 0) / (samples.length - 1))
      : 0;
    this.gatewayMetrics = { ...this.gatewayMetrics, latencyMs, averageLatencyMs, jitterMs, lastHeartbeatAt: Date.now() };
    this.publishGatewayMetrics();
  }

  ensureAppLatencyVariable() {
    return this.ensureManagedProjectVariable('APP_LATENCY', APP_LATENCY_VARIABLE_ID);
  }

  ensureGatewayLatencyVariable() {
    return this.ensureManagedProjectVariable('GATEWAY_LATENCY', GATEWAY_LATENCY_VARIABLE_ID);
  }

  ensureBotUptimeVariable() {
    return this.ensureManagedProjectVariable('BOT_UPTIME', BOT_UPTIME_VARIABLE_ID);
  }

  ensureBotStatisticsVariable() {
    return this.ensureManagedProjectVariable('BOT_STATISTICS', BOT_STATISTICS_VARIABLE_ID, {
      type: 'object',
      initialValue: this.getBotStatisticsSnapshot()
    });
  }

  getBotStatisticsSnapshot() {
    const summary = this.commandStatistics ? this.commandStatistics.getSummary() : { commands: [], totalUses: 0 };
    const uptimeSeconds = this.botUptimeStartedAt === null
      ? 0
      : Math.floor((performance.now() - this.botUptimeStartedAt) / 1_000);
    const appLatencyMs = this.projectVariableStates?.get(APP_LATENCY_VARIABLE_ID) ?? 0;
    const gatewayLatencyMs = this.projectVariableStates?.get(GATEWAY_LATENCY_VARIABLE_ID) ?? 0;
    return {
      uptimeSeconds,
      appLatencyMs,
      gatewayLatencyMs,
      ...summary
    };
  }

  ensureManagedProjectVariable(name, id, { type = 'number', initialValue = 0 } = {}) {
    if (this.disabledBuiltInProjectVariables.has(name)) return false;
    if (this.projectVariables.some((variable) => variable.name?.toLowerCase() === name.toLowerCase() && variable.id !== id)) return false;
    const existing = this.projectVariables.find((variable) => variable.id === id);
    if (existing?.name === name && existing.type === type && (type === 'number' ? Number.isFinite(existing.initialValue) : existing.initialValue !== undefined)) {
      existing.systemManaged = true;
      return false;
    }
    const value = { id, name, type, initialValue, systemManaged: true };
    const next = existing
      ? this.projectVariables.map((variable) => variable.id === id ? { ...variable, ...value } : variable)
      : [...this.projectVariables, value];
    this.setProjectVariables(next, { allowManagedVariableUpdate: true });
    return true;
  }

  updateManagedProjectVariable(id, value) {
    const variable = this.projectVariables.find((item) => item.id === id);
    if (!variable) return value;
    if (variable.type === 'object') {
      const objectValue = value && typeof value === 'object' && !Array.isArray(value) ? structuredClone(value) : {};
      const serialized = JSON.stringify(objectValue);
      const changed = JSON.stringify(variable.initialValue) !== serialized
        || [this.projectVariableStates, this.mockProjectVariableStates].some((state) => JSON.stringify(state?.get(id)) !== serialized);
      variable.initialValue = objectValue;
      variable.systemManaged = true;
      for (const state of [this.projectVariableStates, this.mockProjectVariableStates]) state?.set(id, structuredClone(objectValue));
      if (changed) this.broadcastWS({
        type: 'PROJECT_VARIABLES_UPDATED',
        payload: { projectId: this.project.id, variables: this.getProjectVariables() }
      });
      return objectValue;
    }
    const numericValue = Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
    const changed = Number(variable.initialValue) !== numericValue
      || [this.projectVariableStates, this.mockProjectVariableStates].some((state) => state?.get(id) !== numericValue);
    variable.initialValue = numericValue;
    variable.systemManaged = true;
    for (const state of [this.projectVariableStates, this.mockProjectVariableStates]) state?.set(id, numericValue);
    if (changed) this.broadcastWS({
      type: 'PROJECT_VARIABLES_UPDATED',
      payload: { projectId: this.project.id, variables: this.getProjectVariables() }
    });
    return numericValue;
  }

  updateAppLatency(value) {
    const res = this.updateManagedProjectVariable(APP_LATENCY_VARIABLE_ID, value);
    this.updateBotStatistics();
    return res;
  }

  updateGatewayLatency(value) {
    const res = this.updateManagedProjectVariable(GATEWAY_LATENCY_VARIABLE_ID, value);
    this.updateBotStatistics();
    return res;
  }

  updateBotUptime() {
    const uptimeSeconds = this.botUptimeStartedAt === null
      ? 0
      : Math.floor((performance.now() - this.botUptimeStartedAt) / 1_000);
    const res = this.updateManagedProjectVariable(BOT_UPTIME_VARIABLE_ID, uptimeSeconds);
    this.updateBotStatistics();
    return res;
  }

  updateBotStatistics() {
    return this.updateManagedProjectVariable(BOT_STATISTICS_VARIABLE_ID, this.getBotStatisticsSnapshot());
  }

  startBotUptime() {
    if (this.botUptimeInterval) clearInterval(this.botUptimeInterval);
    this.botUptimeStartedAt = performance.now();
    this.updateBotUptime();
    this.botUptimeInterval = setInterval(() => this.updateBotUptime(), BOT_UPTIME_INTERVAL_MS);
    this.botUptimeInterval.unref?.();
  }

  stopBotUptime() {
    if (this.botUptimeInterval) clearInterval(this.botUptimeInterval);
    this.botUptimeInterval = null;
    this.botUptimeStartedAt = null;
    this.updateBotUptime();
  }

  async refreshAppLatency() {
    const token = this.getBotToken();
    if (!token) {
      this.updateAppLatency(0);
      return 0;
    }
    if (this.appLatencyProbeInFlight) {
      if (this.appLatencyProbeToken !== token) this.appLatencyProbePending = true;
      return this.projectVariableStates?.get(APP_LATENCY_VARIABLE_ID) ?? 0;
    }
    this.appLatencyProbeInFlight = true;
    this.appLatencyProbeToken = token;
    const startedAt = performance.now();
    try {
      await this.createTrackedRESTClient(token).getCurrentApplication();
      if (token !== this.getBotToken()) return 0;
      return this.updateAppLatency(performance.now() - startedAt);
    } catch {
      if (token === this.getBotToken()) this.updateAppLatency(0);
      return 0;
    } finally {
      this.appLatencyProbeInFlight = false;
      this.appLatencyProbeToken = '';
      if (this.appLatencyProbePending) {
        this.appLatencyProbePending = false;
        queueMicrotask(() => {
          this.refreshAppLatency().catch((error) => this.log('WARN', `Could not refresh APP_LATENCY: ${error.message}`));
        });
      }
    }
  }

  startAppLatencyMonitor() {
    if (this.appLatencyMonitor) clearInterval(this.appLatencyMonitor);
    this.appLatencyMonitor = setInterval(() => {
      this.refreshAppLatency().catch((error) => this.log('WARN', `Could not refresh APP_LATENCY: ${error.message}`));
    }, APP_LATENCY_INTERVAL_MS);
    this.appLatencyMonitor.unref?.();
    this.refreshAppLatency().catch((error) => this.log('WARN', `Could not refresh APP_LATENCY: ${error.message}`));
  }

  loadBotConfig() {
    try {
      fs.mkdirSync(path.dirname(this.botConfigPath), { recursive: true, mode: 0o700 });
      try { fs.chmodSync(path.dirname(this.botConfigPath), 0o700); } catch {}
      if (!fs.existsSync(this.botConfigPath)) return;
      try { fs.chmodSync(this.botConfigPath, 0o600); } catch {}
      const serialized = fs.readFileSync(this.botConfigPath, 'utf8');
      let stored;
      let needsReEncryption = false;
      try {
        stored = CryptoEngine.decryptObject(serialized, serverConfig.botTokenEncryptionKey, botConfigAad);
      } catch {
        stored = CryptoEngine.decryptObject(serialized, null, botConfigAad);
        needsReEncryption = true;
      }
      this.encryptedBotToken = typeof stored.token === 'string'
        ? CryptoEngine.encrypt(stored.token, serverConfig.botTokenEncryptionKey, botTokenAad)
        : null;
      if (stored.profile && typeof stored.profile === 'object') {
        const { verified: _legacyVerified, tokenMasked: _legacyTokenMasked, token: _legacyToken, access_token: _legacyAccessToken, refresh_token: _legacyRefreshToken, ...profile } = stored.profile;
        this.botProfile = {
          ...profile,
          verifiedBot: isDiscordVerifiedBot(profile)
        };
      } else {
        this.botProfile = null;
      }
      if (needsReEncryption && this.encryptedBotToken) this.persistBotConfig();
    } catch {
      this.encryptedBotToken = null;
      this.botProfile = null;
    }
  }

  persistBotConfig() {
    const token = this.getBotToken();
    if (!token) {
      try { fs.unlinkSync(this.botConfigPath); } catch {}
      return;
    }
    fs.mkdirSync(path.dirname(this.botConfigPath), { recursive: true, mode: 0o700 });
    try { fs.chmodSync(path.dirname(this.botConfigPath), 0o700); } catch {}
    const temporaryPath = `${this.botConfigPath}.tmp`;
    const envelope = CryptoEngine.encryptObject({ token, profile: this.botProfile }, serverConfig.botTokenEncryptionKey, botConfigAad);
    fs.writeFileSync(temporaryPath, envelope, { mode: 0o600 });
    try { fs.chmodSync(temporaryPath, 0o600); } catch {}
    fs.renameSync(temporaryPath, this.botConfigPath);
    try { fs.chmodSync(this.botConfigPath, 0o600); } catch {}
  }

  setBotToken(token, persist = true) {
    const normalizedToken = token ? String(token).trim() : '';
    const changed = (this.getBotToken() || '') !== normalizedToken;
    if (changed) {
      this.discordUnauthorizedCount = 0;
      if (this.discordAuthWarning) {
        this.discordAuthWarning = null;
        this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, discordAuthWarning: null } });
      }
    }
    if (!token) {
      this.encryptedBotToken = null;
    } else {
      this.encryptedBotToken = CryptoEngine.encrypt(normalizedToken, serverConfig.botTokenEncryptionKey, botTokenAad);
    }
    if (persist) this.persistBotConfig();
    if (changed && this.projectVariableStates instanceof Map) {
      this.refreshAppLatency().catch((error) => this.log('WARN', `Could not refresh APP_LATENCY: ${error.message}`));
    }
  }

  setBroadcast(fn) {
    this.broadcastWS = fn;
  }

  scheduleStatisticsSave() {
    if (this.statisticsSaveTimer) clearTimeout(this.statisticsSaveTimer);
    this.statisticsSaveTimer = setTimeout(() => {
      this.statisticsSaveTimer = null;
      this.flushStatistics();
    }, 500);
    this.statisticsSaveTimer.unref?.();
  }

  flushStatistics() {
    if (this.statisticsSaveTimer) clearTimeout(this.statisticsSaveTimer);
    this.statisticsSaveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.statisticsStorePath), { recursive: true, mode: 0o700 });
      const temporaryPath = `${this.statisticsStorePath}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(this.commandStatistics.exportState()), { mode: 0o600 });
      fs.renameSync(temporaryPath, this.statisticsStorePath);
      try { fs.chmodSync(this.statisticsStorePath, 0o600); } catch {}
    } catch (error) {
      this.log?.('ERROR', `Could not save command statistics: ${error.message}`);
    }
    this.updateBotStatistics();
  }

  getCommandStatistics(options) {
    return this.commandStatistics.getSummary(options);
  }

  getCommandStatistic(name, options) {
    return this.commandStatistics.getCommand(name, options);
  }

  updateCommandStatisticsSettings(settings) {
    const updated = this.commandStatistics.updateSettings(settings);
    this.updateBotStatistics();
    return updated;
  }

  log(level, message, meta = null) {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(), // INFO, DEBUG, WARN, ERROR, GATEWAY, MOCK, EXECUTION
      message,
      meta
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.broadcastWS({
      type: 'LOG_ENTRY',
      payload: entry
    });
  }

  getLogs() {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.broadcastWS({ type: 'LOGS_CLEARED' });
  }

  initDefaultGraphs() {
    this.graphs.set('tab_ping_pong', {
      id: 'tab_ping_pong',
      name: 'Message: Ping Pong',
      description: 'Replies Pong whenever user types !ping',
      nodes: [
        {
          id: 'node_event_1',
          type: 'event_message_create',
          label: 'On Message Create',
          x: 80,
          y: 120,
          data: {}
        },
        {
          id: 'node_comp_1',
          type: 'compare_text',
          label: 'Check !ping',
          x: 400,
          y: 200,
          data: { text_b: '!ping', operator: 'equals' }
        },
        {
          id: 'node_branch_1',
          type: 'branch_if',
          label: 'If Matches',
          x: 680,
          y: 120,
          data: {}
        },
        {
          id: 'node_send_1',
          type: 'action_send_message',
          label: 'Send Pong!',
          x: 950,
          y: 120,
          data: { content: '🏓 Pong!!' }
        }
      ],
      connections: [
        // Event exec -> Branch exec
        { id: 'c1', sourceNodeId: 'node_event_1', sourcePinId: 'exec', targetNodeId: 'node_branch_1', targetPinId: 'exec' },
        // Event content -> Compare text_a
        { id: 'c2', sourceNodeId: 'node_event_1', sourcePinId: 'content', targetNodeId: 'node_comp_1', targetPinId: 'text_a' },
        // Compare result -> Branch condition
        { id: 'c3', sourceNodeId: 'node_comp_1', sourcePinId: 'result', targetNodeId: 'node_branch_1', targetPinId: 'condition' },
        // Branch true -> Send message exec
        { id: 'c4', sourceNodeId: 'node_branch_1', sourcePinId: 'true_exec', targetNodeId: 'node_send_1', targetPinId: 'exec' },
        // Event channel_id -> Send message channel_id
        { id: 'c5', sourceNodeId: 'node_event_1', sourcePinId: 'channel_id', targetNodeId: 'node_send_1', targetPinId: 'channel_id' }
      ]
    });

    this.graphs.set('tab_slash_help', {
      id: 'tab_slash_help',
      name: 'Slash: /help',
      description: 'Handles /help slash command with rich embed',
      nodes: [
        {
          id: 'node_event_slash',
          type: 'event_slash_command',
          label: 'On Slash Command',
          x: 80,
          y: 120,
          data: { commandName: 'help', description: 'Show help and bot information.' }
        },
        {
          id: 'node_embed_help',
          type: 'build_embed',
          label: 'Help Embed',
          x: 420,
          y: 260,
          data: {
            title: 'ARC Studio Info',
            description: 'put stuff here.',
            color: '#5865F2',
            footer_text: 'Built with ARC Studio'
          }
        },
        {
          id: 'node_reply_slash',
          type: 'action_reply_interaction',
          label: 'Reply Embed',
          x: 780,
          y: 120,
          data: { content: 'Here is your help info:' }
        }
      ],
      connections: [
        { id: 'cs1', sourceNodeId: 'node_event_slash', sourcePinId: 'exec', targetNodeId: 'node_reply_slash', targetPinId: 'exec' },
        { id: 'cs2', sourceNodeId: 'node_event_slash', sourcePinId: 'interaction_id', targetNodeId: 'node_reply_slash', targetPinId: 'interaction_id' },
        { id: 'cs3', sourceNodeId: 'node_event_slash', sourcePinId: 'interaction_token', targetNodeId: 'node_reply_slash', targetPinId: 'interaction_token' }
      ]
    });
  }

  loadSavedGraphs() {
    try {
      if (!fs.existsSync(this.graphStorePath)) return;
      const stored = JSON.parse(fs.readFileSync(this.graphStorePath, 'utf8'));
      const savedGraphs = Array.isArray(stored) ? stored : stored.graphs;
      if (Array.isArray(savedGraphs)) {
        for (const graph of savedGraphs) {
          if (graph && typeof graph.id === 'string' && Array.isArray(graph.nodes) && Array.isArray(graph.connections)) {
            this.graphs.set(graph.id, graph);
          }
        }
      }
      if (Array.isArray(stored.deletedIds)) {
        this.deletedGraphIds = new Set(stored.deletedIds.filter((id) => typeof id === 'string'));
        for (const id of this.deletedGraphIds) this.graphs.delete(id);
      }
    } catch (error) {
      this.log('ERROR', `Could not load saved graphs: ${error.message}`);
    }
  }

  persistGraphs() {
    fs.mkdirSync(path.dirname(this.graphStorePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.graphStorePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      graphs: this.getGraphs(),
      deletedIds: [...this.deletedGraphIds]
    }, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.graphStorePath);
  }

  getGraphs() {
    const graphs = Array.from(this.graphs.values());
    const slashDefaultIndex = graphs.findIndex((graph) => graph.id === 'tab_slash_help');
    if (slashDefaultIndex > 0) graphs.unshift(...graphs.splice(slashDefaultIndex, 1));
    return graphs;
  }

  getDesiredSlashCommands(graphs = this.getGraphs()) {
    const definitions = graphs.flatMap((graph) => (graph.nodes || [])
      .filter((node) => node.type === 'event_slash_command')
      .map((node) => ({ graph, node })));
    const desired = [];
    const errors = [];
    const seen = new Set();
    if (!definitions.length) errors.push('Add a slash command event node to a graph before deploying.');
    if (definitions.length > 100) errors.push('Discord allows up to 100 global slash commands per application.');
    for (const { graph, node } of definitions) {
      const rawName = String(node.data?.commandName || '').trim();
      const name = rawName.toLowerCase();
      const description = String(node.data?.description || '').trim();
      const graphName = graph.name || 'Untitled graph';
      if (!/^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(name) || name !== rawName) {
        errors.push(`Graph "${graphName}" has an invalid slash command name. Use 1–32 lowercase letters, numbers, hyphens, underscores, or apostrophes, without a leading slash.`);
        continue;
      }
      if (!description || Array.from(description).length > 100) {
        errors.push(`/${name} needs a description between 1 and 100 characters.`);
        continue;
      }
      if (seen.has(name)) {
        errors.push(`More than one graph defines /${name}. Slash command names must be unique.`);
        continue;
      }
      seen.add(name);
      const defaultMemberPermissions = node.data?.defaultMemberPermissions === undefined || node.data?.defaultMemberPermissions === ''
        ? undefined : String(node.data.defaultMemberPermissions);
      if (defaultMemberPermissions !== undefined && !/^\d{1,20}$/.test(defaultMemberPermissions)) {
        errors.push(`/${name} has an invalid default member permission bitfield.`);
        continue;
      }
      const integrationTypes = Array.isArray(node.data?.integrationTypes) ? [...new Set(node.data.integrationTypes.map(Number))] : undefined;
      const contexts = Array.isArray(node.data?.contexts) ? [...new Set(node.data.contexts.map(Number))] : undefined;
      if (integrationTypes && (!integrationTypes.length || integrationTypes.some((value) => ![0, 1].includes(value)))) {
        errors.push(`/${name} has an invalid integration type. Choose server install, user install, or both.`);
        continue;
      }
      if (contexts && (!contexts.length || contexts.some((value) => ![0, 1, 2].includes(value)))) {
        errors.push(`/${name} has an invalid interaction context.`);
        continue;
      }
      if (contexts?.includes(2) && integrationTypes && !integrationTypes.includes(1)) {
        errors.push(`/${name} uses private-channel context, which requires user installation.`);
        continue;
      }
      const rawOptions = Array.isArray(node.data?.options) ? node.data.options : [];
      const optionErrors = validateSlashCommandOptions(rawOptions, name);
      if (optionErrors.length) {
        errors.push(...optionErrors);
        continue;
      }
      const dynamicAutocompleteMissing = flattenSlashParameters(rawOptions).some(({ option }) => option.autocomplete && option.dynamicAutocomplete)
        && (!(graph.nodes || []).some((item) => item.type === 'event_slash_autocomplete') || !(graph.nodes || []).some((item) => item.type === 'action_respond_autocomplete'));
      if (dynamicAutocompleteMissing) {
        errors.push(`/${name} uses graph-generated suggestions but its graph needs On Command Autocomplete and Respond to Autocomplete nodes.`);
        continue;
      }
      const commandOptions = normalizeSlashCommandOptions(rawOptions);
      desired.push({
        name,
        description,
        type: 1,
        ...(commandOptions.length ? { options: commandOptions } : {}),
        ...(defaultMemberPermissions !== undefined ? { default_member_permissions: defaultMemberPermissions } : {}),
        ...(integrationTypes ? { integration_types: integrationTypes } : {}),
        ...(contexts ? { contexts } : {})
      });
    }
    return { desired, errors };
  }

  getCommandPlanHash(commands, graphs = []) {
    const reviewedWorkspace = graphs.map((graph) => ({ id: graph.id, name: graph.name, graphType: graph.graphType, variables: graph.variables || [], nodes: graph.nodes || [], connections: graph.connections || [] }));
    return createHash('sha256').update(JSON.stringify({ commands, graphs: reviewedWorkspace })).digest('hex');
  }

  getCommandPermissionRequirements(graphs) {
    const permissions = new Set();
    for (const graph of graphs) for (const node of graph.nodes || []) {
      if (['action_send_message', 'action_edit_message', 'action_edit_components'].includes(node.type)) {
        permissions.add('View Channels');
        permissions.add('Send Messages');
        if (node.type === 'action_send_message'
          && (String(node.data?.thread_id || '').trim() || graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'thread_id'))) {
          permissions.add('Send Messages in Threads');
        }
      }
      if (node.type === 'action_create_thread') {
        permissions.add('View Channels');
        const typeIsWired = graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'thread_type');
        const threadType = String(node.data?.thread_type || 'public').toLowerCase();
        if (typeIsWired || !['public', 'private'].includes(threadType)) {
          permissions.add('Create Public Threads');
          permissions.add('Create Private Threads');
        } else permissions.add(threadType === 'private' ? 'Create Private Threads' : 'Create Public Threads');
      }
      if (node.type === 'action_start_thread_from_message') {
        for (const permission of ['View Channels', 'Send Messages', 'Create Public Threads']) permissions.add(permission);
      }
    }
    if (graphs.some((graph) => (graph.nodes || []).some((node) => ['action_send_message', 'action_edit_message'].includes(node.type) && graph.connections?.some((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'embed')))) permissions.add('Embed Links');
    return [...permissions];
  }

  async previewSlashCommands(graphsOverride = null) {
    const token = this.getBotToken();
    if (!token) throw new Error('Configure a bot token before reviewing commands.');
    const graphs = Array.isArray(graphsOverride) ? graphsOverride : this.getGraphs();
    if (graphs.length > 300 || graphs.some((graph) => !graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.connections) || graph.nodes.length > 2000)) {
      throw new Error('The workspace is too large or contains an invalid graph. Save the graphs and try again.');
    }
    const { desired, errors } = this.getDesiredSlashCommands(graphs);
    const rest = this.createTrackedRESTClient(token);
    let application = this.botProfile?.application || null;
    try {
      const freshApplication = await rest.getCurrentApplication();
      if (freshApplication?.id) {
        application = { ...application, id: freshApplication.id };
        if (freshApplication.flags !== undefined) application.flags = freshApplication.flags;
        if (freshApplication.flags_new !== undefined) application.flags_new = freshApplication.flags_new;
        if (this.botProfile) {
          this.botProfile = { ...this.botProfile, application };
          this.botProfile.intentSummary = this.getIntentPlan(graphs);
          this.persistBotConfig();
          this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, user: this.botProfile } });
        }
      }
    } catch (error) {
      if (!application?.id) throw error;
    }
    if (!application?.id) throw new Error('Discord did not return an application ID for this bot.');
    const current = await rest.getGlobalApplicationCommands(application.id);
    const currentCommands = (Array.isArray(current) ? current : []).filter((command) => Number(command.type || 1) === 1);
    const currentByName = new Map(currentCommands.map((command) => [String(command.name || '').toLowerCase(), command]));
    const desiredByName = new Map(desired.map((command) => [command.name, command]));
    const managed = new Set(this.botProfile?.managedSlashCommandNames || []);
    const created = desired.filter((command) => !currentByName.has(command.name));
    const updated = desired.filter((command) => {
      const existing = currentByName.get(command.name);
      return existing && (existing.description !== command.description
        || (existing.default_member_permissions || undefined) !== (command.default_member_permissions || undefined)
        || JSON.stringify(existing.integration_types || undefined) !== JSON.stringify(command.integration_types || undefined)
        || JSON.stringify(existing.contexts || undefined) !== JSON.stringify(command.contexts || undefined));
    });
    const unchanged = desired.filter((command) => {
      const existing = currentByName.get(command.name);
      return existing && existing.description === command.description
        && (existing.default_member_permissions || undefined) === (command.default_member_permissions || undefined)
        && JSON.stringify(existing.integration_types || undefined) === JSON.stringify(command.integration_types || undefined)
        && JSON.stringify(existing.contexts || undefined) === JSON.stringify(command.contexts || undefined);
    });
    const removed = currentCommands.filter((command) => managed.has(String(command.name || '').toLowerCase()) && !desiredByName.has(String(command.name || '').toLowerCase()));
    const intentPlan = this.getIntentPlan(graphs);
    return {
      valid: errors.length === 0,
      errors,
      applicationId: application.id,
      commands: desired,
      changes: { created, updated, unchanged, removed: removed.map(({ name }) => ({ name })), preserved: currentCommands.filter((command) => !managed.has(String(command.name || '').toLowerCase()) && !desiredByName.has(String(command.name || '').toLowerCase())).map(({ name }) => ({ name })) },
      planHash: this.getCommandPlanHash(desired, graphs),
      intents: intentPlan.filter((intent) => intent.required),
      permissions: this.getCommandPermissionRequirements(graphs),
      noChanges: !created.length && !updated.length && !removed.length,
      discordAuthWarning: this.discordAuthWarning
    };
  }

  async deploySlashCommands(graphsOverride = null, expectedPlanHash = null) {
    const token = this.getBotToken();
    if (!token) throw new Error('Configure a bot token before deploying commands.');
    if (this.commandDeploymentInFlight) {
      const error = new Error('A command deployment is already in progress.');
      error.status = 429;
      error.retryAfterMs = 30_000;
      throw error;
    }
    const retryAfterMs = this.commandDeploymentLastAt + 30_000 - Date.now();
    if (retryAfterMs > 0) {
      const error = new Error('Command deployment is cooling down. Try again in ' + Math.ceil(retryAfterMs / 1000) + ' seconds.');
      error.status = 429;
      error.retryAfterMs = retryAfterMs;
      throw error;
    }

    const graphs = Array.isArray(graphsOverride) ? graphsOverride : this.getGraphs();
    const { desired, errors } = this.getDesiredSlashCommands(graphs);
    if (errors.length) throw new Error(errors.join(' '));
    if (expectedPlanHash && expectedPlanHash !== this.getCommandPlanHash(desired, graphs)) {
      const error = new Error('The workspace changed after review. Review the deployment again before applying it.');
      error.status = 409;
      throw error;
    }

    this.commandDeploymentInFlight = true;
    this.commandDeploymentLastAt = Date.now();
    try {
      const rest = this.createTrackedRESTClient(token);
      const application = this.botProfile?.application?.id
        ? this.botProfile.application
        : await rest.getCurrentApplication();
      if (!application?.id) throw new Error('Discord did not return an application ID for this bot.');
      const current = await rest.getGlobalApplicationCommands(application.id);
      const desiredByName = new Map(desired.map((command) => [command.name, command]));
      const previouslyManaged = new Set(this.botProfile?.managedSlashCommandNames || []);
      const preserved = (Array.isArray(current) ? current : []).flatMap((command) => {
        const commandName = String(command.name || '').toLowerCase();
        const isGraphManaged = Number(command.type || 1) === 1 && previouslyManaged.has(commandName);
        if (isGraphManaged && !desiredByName.has(commandName)) return [];
        const payload = {};
        for (const field of ['name', 'name_localizations', 'description', 'description_localizations', 'options', 'default_member_permissions', 'dm_permission', 'default_permission', 'integration_types', 'contexts', 'nsfw', 'type']) {
          if (command[field] !== undefined) payload[field] = command[field];
        }
        if (Number(command.type || 1) === 1 && desiredByName.has(commandName)) return [{ ...payload, ...desiredByName.get(commandName) }];
        return [payload];
      });
      const existingNames = new Set((Array.isArray(current) ? current : [])
        .filter((command) => Number(command.type || 1) === 1)
        .map((command) => String(command.name).toLowerCase()));
      for (const command of desired) if (!existingNames.has(command.name)) preserved.push(command);

      const deployed = await rest.bulkOverwriteGlobalApplicationCommands(application.id, preserved);
      if (this.botProfile) {
        this.botProfile = { ...this.botProfile, application, managedSlashCommandNames: desired.map((command) => command.name) };
        this.persistBotConfig();
      }
      return {
        applicationId: application.id,
        deployed: desired.length,
        created: desired.filter((command) => !existingNames.has(command.name)).length,
        commands: (Array.isArray(deployed) ? deployed : []).filter((command) => Number(command.type || 1) === 1).length
      };
    } finally {
      this.commandDeploymentInFlight = false;
    }
  }

  loadGraphLibrary() {
    try {
      if (!fs.existsSync(this.graphLibraryPath)) return;
      const stored = JSON.parse(fs.readFileSync(this.graphLibraryPath, 'utf8'));
      if (Array.isArray(stored.templates)) this.graphTemplates = stored.templates.filter((graph) => graph && typeof graph.id === 'string' && Array.isArray(graph.nodes) && Array.isArray(graph.connections));
      if (Array.isArray(stored.snapshots)) this.graphSnapshots = stored.snapshots.filter((snapshot) => snapshot && typeof snapshot.id === 'string' && typeof snapshot.graphId === 'string' && snapshot.graph && Array.isArray(snapshot.graph.nodes) && Array.isArray(snapshot.graph.connections));
      if (typeof stored.defaultGraphId === 'string') this.defaultGraphId = stored.defaultGraphId;
    } catch (error) {
      this.log('ERROR', `Could not load graph library settings: ${error.message}`);
    }
  }

  persistGraphLibrary() {
    fs.mkdirSync(path.dirname(this.graphLibraryPath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.graphLibraryPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ defaultGraphId: this.defaultGraphId, templates: this.graphTemplates, snapshots: this.graphSnapshots }, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.graphLibraryPath);
  }

  getGraphLibrary() {
    return { templates: this.graphTemplates, defaultGraphId: this.defaultGraphId, snapshots: this.graphSnapshots };
  }

  createGraphSnapshot(graphId, graphData, name, options = {}) {
    if (!graphData || graphData.id !== graphId || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.connections)) {
      throw new TypeError('A snapshot must include the selected graph and its nodes and connections.');
    }
    const graph = this.protectGraphSecrets(graphData);
    delete graph.isDirty;
    const automatic = options.automatic === true;
    const retentionHours = automatic ? Number(options.retentionHours ?? 12) : null;
    if (automatic && retentionHours !== 0 && (!Number.isFinite(retentionHours) || retentionHours < 12 || retentionHours > 8760)) {
      throw new TypeError('Automatic snapshot history must be between 12 hours and 365 days, or 0 for forever.');
    }
    const fingerprint = automatic ? createHash('sha256').update(JSON.stringify(graph)).digest('hex') : null;
    const now = Date.now();
    if (automatic) {
      if (retentionHours > 0) {
        const cutoff = now - retentionHours * 60 * 60 * 1000;
        this.graphSnapshots = this.graphSnapshots.filter((item) => !item.automatic || Date.parse(item.createdAt) >= cutoff);
      }
      const previous = this.graphSnapshots.find((item) => item.graphId === graphId && item.automatic);
      const previousFingerprint = previous?.fingerprint || (previous?.graph ? createHash('sha256').update(JSON.stringify(previous.graph)).digest('hex') : null);
      if (previousFingerprint === fingerprint) {
        this.persistGraphLibrary();
        return null;
      }
    }
    const snapshot = {
      id: `snapshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      graphId,
      graphName: String(graph.name || 'Untitled graph').slice(0, 80),
      name: automatic ? 'Automatic checkpoint' : String(name || '').trim().slice(0, 80) || `Checkpoint ${new Date().toLocaleString()}`,
      createdAt: new Date().toISOString(),
      graph,
      ...(automatic ? { automatic: true, retentionHours, fingerprint } : {})
    };
    this.graphSnapshots = [snapshot, ...this.graphSnapshots];
    const keptForGraph = this.graphSnapshots.filter((item) => item.graphId === graphId && !item.automatic);
    for (const excess of keptForGraph.slice(50)) this.graphSnapshots = this.graphSnapshots.filter((item) => item.id !== excess.id);
    if (automatic && retentionHours > 0) {
      const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
      this.graphSnapshots = this.graphSnapshots.filter((item) => !item.automatic || Date.parse(item.createdAt) >= cutoff);
    }
    this.persistGraphLibrary();
    return snapshot;
  }

  deleteGraphSnapshot(snapshotId) {
    this.graphSnapshots = this.graphSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    this.persistGraphLibrary();
  }

  saveGraphTemplate(graphData, name) {
    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.connections)) throw new TypeError('A graph template must include nodes and connections arrays.');
    const template = this.protectGraphSecrets({ ...graphData, id: `template_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: String(name || graphData.name || 'Untitled template').trim().slice(0, 80), isTemplate: true, updatedAt: new Date().toISOString() });
    delete template.isDirty;
    this.graphTemplates = [template, ...this.graphTemplates];
    this.persistGraphLibrary();
    return template;
  }

  deleteGraphTemplate(templateId) {
    this.graphTemplates = this.graphTemplates.filter((template) => template.id !== templateId);
    const secretPrefix = `graph:${templateId}:`;
    this.setSecretValues([], [...this.secretValues.keys()].filter((key) => key.startsWith(secretPrefix)));
    if (this.defaultGraphId === templateId) this.defaultGraphId = 'tab_slash_help';
    this.persistGraphLibrary();
  }

  setDefaultGraph(graphId) {
    if (!graphId || graphId === 'tab_slash_help') {
      this.defaultGraphId = 'tab_slash_help';
      this.persistGraphLibrary();
      this.broadcastWS({ type: 'GRAPH_LIBRARY_UPDATED', payload: this.getGraphLibrary() });
      return this.defaultGraphId;
    }
    const exists = this.graphs.has(graphId) || this.graphTemplates.some((template) => template.id === graphId);
    if (!exists) throw new Error('Choose a saved graph or template as the default.');
    this.defaultGraphId = graphId;
    this.persistGraphLibrary();
    this.broadcastWS({ type: 'GRAPH_LIBRARY_UPDATED', payload: this.getGraphLibrary() });
    return graphId;
  }

  getVariableState(graph, mode = 'live') {
    const states = mode === 'mock' ? this.mockVariableStates : this.variableStates;
    if (!states.has(graph.id)) states.set(graph.id, new Map());
    const state = states.get(graph.id);
    for (const variable of graph.variables || []) if (variable?.secret && !state.has(variable.id)) {
      const secret = this.getSecretValue('graph', graph.id, variable.id);
      if (secret !== undefined) state.set(variable.id, structuredClone(secret));
    }
    return state;
  }

  loadProjectVariables() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.projectVariablesPath, 'utf8'));
      return Array.isArray(stored) ? stored.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string') : [];
    } catch { return []; }
  }

  getProjectVariables() { return this.projectVariables.map((variable) => ({ ...variable, ...(variable.secret ? { initialValue: SECRET_VARIABLE_MASK } : {}) })); }

  secretStoreKey(scope, graphId, variableId) {
    return scope === 'project' ? `project:${variableId}` : `graph:${graphId}:${variableId}`;
  }

  secretStoreAad(key) { return `arc-secret-variable-v1:${this.project.id}:${key}`; }

  loadSecretStore() {
    this.secretValues = new Map();
    this.secretEnvelopes = new Map();
    try {
      if (!fs.existsSync(this.secretStorePath)) return;
      try { fs.chmodSync(this.secretStorePath, 0o600); } catch {}
      const stored = JSON.parse(fs.readFileSync(this.secretStorePath, 'utf8'));
      for (const [key, envelope] of Object.entries(stored?.entries || {})) {
        try {
          const parsed = CryptoEngine.decryptObject(envelope, serverConfig.botTokenEncryptionKey, this.secretStoreAad(key));
          if (parsed && Object.hasOwn(parsed, 'value')) {
            this.secretValues.set(key, parsed.value);
            this.secretEnvelopes.set(key, envelope);
          }
        } catch {
          if (Array.isArray(this.logs)) this.log('WARN', 'An encrypted project variable could not be opened. Reenter its value in Variables.');
          else console.warn('[Security] An encrypted project variable could not be opened. Reenter its value in Variables.');
        }
      }
    } catch {}
  }

  persistSecretStore() {
    fs.mkdirSync(path.dirname(this.secretStorePath), { recursive: true, mode: 0o700 });
    try { fs.chmodSync(path.dirname(this.secretStorePath), 0o700); } catch {}
    const entries = Object.fromEntries(this.secretEnvelopes);
    const temporaryPath = `${this.secretStorePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, entries }, null, 2), { mode: 0o600 });
    try { fs.chmodSync(temporaryPath, 0o600); } catch {}
    fs.renameSync(temporaryPath, this.secretStorePath);
    try { fs.chmodSync(this.secretStorePath, 0o600); } catch {}
  }

  getSecretValue(scope, graphId, variableId) {
    return this.secretValues.get(this.secretStoreKey(scope, graphId, variableId));
  }

  importProjectSecretValues() {
    const updates = [];
    const sanitizeGraph = (graph, secretGraphId = graph?.id, importValues = true) => {
      if (!graph || !Array.isArray(graph.variables)) return graph;
      let changed = false;
      const variables = graph.variables.map((variable) => {
        if (!variable || typeof variable !== 'object' || !Object.hasOwn(variable, 'secretValue')) return variable;
        changed = true;
        const safe = { ...variable };
        if (safe.secret === true) {
          if (importValues) {
            updates.push([this.secretStoreKey('graph', secretGraphId, safe.id), structuredClone(safe.secretValue)]);
            safe.secretStored = true;
            safe.initialValue = SECRET_VARIABLE_MASK;
          } else delete safe.secretStored;
        }
        delete safe.secretValue;
        return safe;
      });
      return changed ? { ...graph, variables } : graph;
    };
    let graphsChanged = false;
    this.graphs = new Map([...this.graphs].map(([id, graph]) => {
      const safe = sanitizeGraph(graph, id);
      if (safe !== graph) graphsChanged = true;
      return [id, safe];
    }));
    if (graphsChanged) this.persistGraphs();
    let libraryChanged = false;
    this.graphTemplates = this.graphTemplates.map((graph) => {
      const safe = sanitizeGraph(graph, graph.id);
      if (safe !== graph) libraryChanged = true;
      return safe;
    });
    this.graphSnapshots = this.graphSnapshots.map((snapshot) => {
      const graph = sanitizeGraph(snapshot.graph, snapshot.graphId, false);
      if (graph === snapshot.graph) return snapshot;
      libraryChanged = true;
      return { ...snapshot, graph };
    });
    if (libraryChanged) this.persistGraphLibrary();
    let projectVariablesChanged = false;
    this.projectVariables = this.projectVariables.map((variable) => {
      if (!variable || typeof variable !== 'object' || !Object.hasOwn(variable, 'secretValue')) return variable;
      projectVariablesChanged = true;
      const safe = { ...variable };
      if (safe.secret === true) {
        updates.push([this.secretStoreKey('project', '', safe.id), structuredClone(safe.secretValue)]);
        safe.secretStored = true;
        safe.initialValue = SECRET_VARIABLE_MASK;
      }
      delete safe.secretValue;
      return safe;
    });
    if (projectVariablesChanged) {
      const temporaryPath = `${this.projectVariablesPath}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(this.projectVariables, null, 2), { mode: 0o600 });
      fs.renameSync(temporaryPath, this.projectVariablesPath);
    }
    this.setSecretValues(updates);
    return updates.length;
  }

  setSecretValues(updates, removals = []) {
    let changed = false;
    for (const [key, value] of updates) {
      if (!this.secretValues.has(key) || JSON.stringify(this.secretValues.get(key)) !== JSON.stringify(value)) {
        const storedValue = structuredClone(value);
        this.secretValues.set(key, storedValue);
        this.secretEnvelopes.set(key, CryptoEngine.encryptObject({ value: storedValue }, serverConfig.botTokenEncryptionKey, this.secretStoreAad(key)));
        changed = true;
      }
    }
    for (const key of removals) {
      const removedValue = this.secretValues.delete(key);
      const removedEnvelope = this.secretEnvelopes.delete(key);
      if (removedValue || removedEnvelope) changed = true;
    }
    if (changed) this.persistSecretStore();
    return changed;
  }

  protectGraphSecrets(graphData) {
    if (!graphData || typeof graphData.id !== 'string' || !Array.isArray(graphData.variables)) return graphData;
    const next = structuredClone(graphData);
    const existing = this.graphs.get(next.id);
    const oldVariables = new Map((existing?.variables || []).map((variable) => [variable.id, variable]));
    const secretUpdates = [];
    const changedSecrets = [];
    next.variables = next.variables.map((variable) => {
      if (!variable || typeof variable.id !== 'string') return variable;
      const previous = oldVariables.get(variable.id);
      const secret = Boolean(variable.secret || previous?.secret);
      if (!secret) { delete variable.secretValue; return variable; }
      const key = this.secretStoreKey('graph', next.id, variable.id);
      let value;
      if (Object.hasOwn(variable, 'secretValue')) value = variable.secretValue;
      else if (this.secretValues.has(key)) value = this.secretValues.get(key);
      else if (!previous?.secret && variable.initialValue !== SECRET_VARIABLE_MASK) value = variable.initialValue;
      else value = variable.type === 'number' ? 0 : variable.type === 'boolean' ? false : variable.type === 'array' ? [] : variable.type === 'object' ? {} : '';
      secretUpdates.push([key, value]);
      if (JSON.stringify(this.secretValues.get(key)) !== JSON.stringify(value)) changedSecrets.push([variable.id, value]);
      const safe = { ...variable, secret: true, secretStored: true, initialValue: SECRET_VARIABLE_MASK };
      delete safe.secretValue;
      return safe;
    });
    this.setSecretValues(secretUpdates);
    for (const [variableId, value] of changedSecrets) for (const states of [this.variableStates, this.mockVariableStates]) {
      const state = states?.get(next.id);
      if (state) state.set(variableId, structuredClone(value));
    }
    return next;
  }

  setProjectVariables(variables, { allowDiscordAppIdUpdate = false, allowAppLatencyUpdate = false, allowManagedVariableUpdate = false } = {}) {
    this.secretValues ||= new Map();
    this.secretEnvelopes ||= new Map();
    this.projectVariableStates ||= new Map();
    this.mockProjectVariableStates ||= new Map();
    if (!Array.isArray(variables) || variables.length > 100) throw new TypeError('A project can have at most 100 shared variables.');
    const names = new Set();
    const existingVariables = new Map(this.projectVariables.map((variable) => [variable.id, variable]));
    const secretUpdates = new Map();
    const next = variables.map((item) => {
      const name = String(item?.name || '').trim().slice(0, 64);
      const type = ['string', 'number', 'boolean', 'array', 'object'].includes(item?.type) ? item.type : '';
      if (!item || typeof item.id !== 'string' || !/^project_var_[A-Za-z0-9_-]{1,100}$/.test(item.id)) throw new TypeError(`A project variable has an invalid ID. (${item.id})`);
      if (!name) throw new TypeError('Every project variable needs a name.');
      const previousVariable = existingVariables.get(item.id);
      const secret = Boolean(item.secret || previousVariable?.secret);
      const defaultSecretValue = type === 'number' ? 0 : type === 'boolean' ? false : type === 'array' ? [] : type === 'object' ? {} : '';
      const requestedValue = secret
        ? Object.hasOwn(item, 'secretValue') ? item.secretValue
          : previousVariable?.secret && this.getSecretValue('project', '', item.id) !== undefined ? this.getSecretValue('project', '', item.id)
            : item.initialValue === SECRET_VARIABLE_MASK ? defaultSecretValue : item.initialValue
        : item.initialValue;
      const validName = /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name);
      const discordAppIdVariable = item.id === 'project_var_discord_app_id';
      const appLatencyVariable = item.id === APP_LATENCY_VARIABLE_ID;
      const gatewayLatencyVariable = item.id === GATEWAY_LATENCY_VARIABLE_ID;
      const botUptimeVariable = item.id === BOT_UPTIME_VARIABLE_ID;
      const botStatisticsVariable = item.id === BOT_STATISTICS_VARIABLE_ID;
      const managedVariableName = discordAppIdVariable ? 'DISCORD_APP_ID'
        : appLatencyVariable ? 'APP_LATENCY'
          : gatewayLatencyVariable ? 'GATEWAY_LATENCY'
            : botUptimeVariable ? 'BOT_UPTIME'
              : botStatisticsVariable ? 'BOT_STATISTICS' : '';
      const managedVariable = Boolean(managedVariableName);
      if (secret && managedVariable) throw new TypeError('ARC managed variables cannot be marked secret.');
      if (discordAppIdVariable && this.disabledBuiltInProjectVariables.has('DISCORD_APP_ID')) {
        throw new TypeError('ARC no longer owns DISCORD_APP_ID in this project. Recreate it as a regular project variable.');
      }
      if (managedVariable && this.disabledBuiltInProjectVariables.has(managedVariableName)) {
        throw new TypeError(`ARC no longer owns ${managedVariableName} in this project. Recreate it as a regular project variable.`);
      }
      if (managedVariable && !existingVariables.has(item.id) && !allowManagedVariableUpdate
        && !(appLatencyVariable && allowAppLatencyUpdate)) throw new TypeError(`${managedVariableName} is managed by ARC.`);
      const reservedManagedName = ['DISCORD_APP_ID', 'APP_LATENCY', 'GATEWAY_LATENCY', 'BOT_UPTIME', 'BOT_STATISTICS'].includes(name);
      const matchingManagedId = ({
        DISCORD_APP_ID: 'project_var_discord_app_id',
        APP_LATENCY: APP_LATENCY_VARIABLE_ID,
        GATEWAY_LATENCY: GATEWAY_LATENCY_VARIABLE_ID,
        BOT_UPTIME: BOT_UPTIME_VARIABLE_ID,
        BOT_STATISTICS: BOT_STATISTICS_VARIABLE_ID
      })[name];
      if (reservedManagedName && item.id !== matchingManagedId && !this.disabledBuiltInProjectVariables.has(name)) {
        throw new TypeError(`${name} is reserved for the ARC managed project variable.`);
      }
      if (!validName && !reservedManagedName) throw new TypeError(`Project variable “${name}” must start and end with a letter or number, with letters, numbers, hyphens, or underscores inside.`);
      if (!type) throw new TypeError(`Project variable “${name}” has an unsupported type.`);
      const expectedType = (managedVariableName === 'BOT_STATISTICS' || name === 'BOT_STATISTICS') ? 'object' : 'number';
      if ((managedVariable || reservedManagedName) && type !== expectedType) throw new TypeError(`${managedVariableName || name} must be a ${expectedType} variable.`);
      if (managedVariable && name !== managedVariableName) throw new TypeError(`The ${managedVariableName} variable name cannot be changed.`);
      const previousReserved = existingVariables.get(item.id);
      if (discordAppIdVariable && previousReserved && !allowDiscordAppIdUpdate
        && String(requestedValue) !== String(previousReserved.initialValue)) throw new TypeError('DISCORD_APP_ID is managed by the connected Discord application and cannot be edited.');
      if (names.has(name.toLowerCase())) throw new TypeError(`Project variable name “${name}” is used more than once.`);
      names.add(name.toLowerCase());
      let initialValue;
      if (discordAppIdVariable) {
        initialValue = String(requestedValue ?? '');
        if (!/^\d{15,22}$/.test(initialValue)) throw new TypeError('DISCORD_APP_ID must be a valid Discord application ID.');
      } else if (managedVariable && previousReserved && !allowManagedVariableUpdate
        && !(appLatencyVariable && allowAppLatencyUpdate)
        && !(discordAppIdVariable && allowDiscordAppIdUpdate)) {
        const currentValue = this.projectVariableStates?.get(item.id) ?? previousReserved.initialValue;
        if (type === 'object') {
          initialValue = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue) ? structuredClone(currentValue) : {};
        } else {
          initialValue = Number(currentValue) || 0;
        }
      } else if (type === 'number') initialValue = Number.isFinite(Number(requestedValue)) ? Number(requestedValue) : 0;
      else if (type === 'boolean') initialValue = Boolean(requestedValue);
      else if (type === 'array' || type === 'object') {
        const valid = type === 'array' ? Array.isArray(requestedValue) : requestedValue && typeof requestedValue === 'object' && !Array.isArray(requestedValue);
        if (!valid) throw new TypeError(`Project variable “${name}” needs a JSON ${type}.`);
        const serialized = JSON.stringify(requestedValue);
        if (serialized.length > 10000) throw new TypeError(`Project variable “${name}” exceeds the 10,000 character JSON limit.`);
        initialValue = JSON.parse(serialized);
      } else initialValue = String(requestedValue ?? '').slice(0, 10000);
      if (secret) {
        const key = this.secretStoreKey('project', '', item.id);
        const previousSecretValue = this.getSecretValue('project', '', item.id);
        let secretValue = Object.hasOwn(item, 'secretValue') ? item.secretValue
          : previousVariable?.secret && previousSecretValue !== undefined ? previousSecretValue : initialValue;
        if (type === 'number') secretValue = Number.isFinite(Number(secretValue)) ? Number(secretValue) : 0;
        else if (type === 'boolean') secretValue = Boolean(secretValue);
        else if (type === 'array' || type === 'object') {
          const valid = type === 'array' ? Array.isArray(secretValue) : secretValue && typeof secretValue === 'object' && !Array.isArray(secretValue);
          if (!valid || JSON.stringify(secretValue).length > 10000) throw new TypeError(`Secret project variable “${name}” needs a JSON ${type} under 10,000 characters.`);
          secretValue = JSON.parse(JSON.stringify(secretValue));
        } else secretValue = String(secretValue ?? '').slice(0, 10000);
        secretUpdates.set(key, secretValue);
        initialValue = SECRET_VARIABLE_MASK;
      }
      return { id: item.id, name, type, initialValue, ...(secret ? { secret: true, secretStored: true } : {}), ...(managedVariable ? { systemManaged: true } : {}), updatedAt: new Date().toISOString() };
    });
    const previousById = new Map(this.projectVariables.map((variable) => [variable.id, variable]));
    const secretChangedIds = new Set(next.filter((variable) => variable.secret).filter((variable) =>
      JSON.stringify(this.getSecretValue('project', '', variable.id)) !== JSON.stringify(secretUpdates.get(this.secretStoreKey('project', '', variable.id)))
    ).map((variable) => variable.id));
    const activeSecretKeys = new Set(next.filter((variable) => variable.secret).map((variable) => this.secretStoreKey('project', '', variable.id)));
    const removedSecretKeys = [...this.secretValues.keys()].filter((key) => key.startsWith('project:') && !activeSecretKeys.has(key));
    this.setSecretValues(secretUpdates, removedSecretKeys);
    if (previousById.has('project_var_discord_app_id') && !next.some((variable) => variable.id === 'project_var_discord_app_id')) {
      this.disabledBuiltInProjectVariables.add('DISCORD_APP_ID');
      const projectRecord = this.projectStore.projects.find((item) => item.id === this.project.id);
      if (projectRecord) projectRecord.disabledBuiltInVariables = [...this.disabledBuiltInProjectVariables];
      this.project.disabledBuiltInVariables = [...this.disabledBuiltInProjectVariables];
      this.projectStore.persist();
    }
    for (const [variableId, name] of [
      [APP_LATENCY_VARIABLE_ID, 'APP_LATENCY'],
      [GATEWAY_LATENCY_VARIABLE_ID, 'GATEWAY_LATENCY'],
      [BOT_UPTIME_VARIABLE_ID, 'BOT_UPTIME'],
      [BOT_STATISTICS_VARIABLE_ID, 'BOT_STATISTICS']
    ]) {
      if (!previousById.has(variableId) || next.some((variable) => variable.id === variableId)) continue;
      this.disabledBuiltInProjectVariables.add(name);
      const projectRecord = this.projectStore.projects.find((item) => item.id === this.project.id);
      if (projectRecord) projectRecord.disabledBuiltInVariables = [...this.disabledBuiltInProjectVariables];
      this.project.disabledBuiltInVariables = [...this.disabledBuiltInProjectVariables];
      this.projectStore.persist();
    }
    for (const state of [this.projectVariableStates, this.mockProjectVariableStates]) {
      for (const variable of next) {
        const previous = previousById.get(variable.id);
        if (secretChangedIds.has(variable.id)) {
          state.set(variable.id, structuredClone(this.getSecretValue('project', '', variable.id)));
        } else if (!previous || previous.type !== variable.type || JSON.stringify(previous.initialValue) !== JSON.stringify(variable.initialValue)) {
          state.set(variable.id, structuredClone(variable.secret ? this.getSecretValue('project', '', variable.id) : variable.initialValue));
        }
      }
    }
    this.projectVariables = next;
    const temporaryPath = `${this.projectVariablesPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.projectVariablesPath);
    const activeIds = new Set(next.map((item) => item.id));
    for (const state of [this.projectVariableStates, this.mockProjectVariableStates]) {
      for (const variableId of state.keys()) if (!activeIds.has(variableId)) state.delete(variableId);
    }
    this.broadcastWS({ type: 'PROJECT_VARIABLES_UPDATED', payload: { projectId: this.project.id, variables: this.getProjectVariables() } });
    return this.getProjectVariables();
  }

  ensureDiscordAppIdVariable(applicationId) {
    const id = String(applicationId || '').trim();
    if (!/^\d{15,22}$/.test(id) || this.disabledBuiltInProjectVariables.has('DISCORD_APP_ID')) return false;
    if (this.projectVariables.some((variable) => variable.name?.toLowerCase() === 'discord_app_id' && variable.id !== 'project_var_discord_app_id')) return false;
    const existing = this.projectVariables.find((variable) => variable.id === 'project_var_discord_app_id');
    const value = { id: 'project_var_discord_app_id', name: 'DISCORD_APP_ID', type: 'number', initialValue: id };
    if (existing && String(existing.initialValue) === id) return false;
    const next = existing
      ? this.projectVariables.map((variable) => variable.id === value.id ? { ...variable, ...value } : variable)
      : [...this.projectVariables, value];
    this.setProjectVariables(next, { allowDiscordAppIdUpdate: true });
    return true;
  }

  restoreBuiltInProjectVariable(name) {
    const normalized = String(name || '').trim().toUpperCase();
    const known = ['APP_LATENCY', 'GATEWAY_LATENCY', 'BOT_UPTIME', 'BOT_STATISTICS', 'DISCORD_APP_ID'];
    if (!known.includes(normalized)) {
      throw new TypeError(`Unknown system variable “${name}”.`);
    }
    const matchingManagedId = ({
      DISCORD_APP_ID: 'project_var_discord_app_id',
      APP_LATENCY: APP_LATENCY_VARIABLE_ID,
      GATEWAY_LATENCY: GATEWAY_LATENCY_VARIABLE_ID,
      BOT_UPTIME: BOT_UPTIME_VARIABLE_ID,
      BOT_STATISTICS: BOT_STATISTICS_VARIABLE_ID
    })[normalized];

    const conflicting = this.projectVariables.find((variable) => variable.name.toLowerCase() === normalized.toLowerCase() && variable.id !== matchingManagedId);
    if (conflicting) {
      throw new Error(`A custom variable named ${normalized} already exists. Delete it before restoring the system variable.`);
    }

    this.disabledBuiltInProjectVariables.delete(normalized);
    const projectRecord = this.projectStore.projects.find((item) => item.id === this.project.id);
    if (projectRecord) projectRecord.disabledBuiltInVariables = [...this.disabledBuiltInProjectVariables];
    this.project.disabledBuiltInVariables = [...this.disabledBuiltInProjectVariables];
    this.projectStore.persist();

    if (normalized === 'APP_LATENCY') {
      this.ensureAppLatencyVariable();
      this.refreshAppLatency().catch(() => {});
    } else if (normalized === 'GATEWAY_LATENCY') {
      this.ensureGatewayLatencyVariable();
    } else if (normalized === 'BOT_UPTIME') {
      this.ensureBotUptimeVariable();
      this.updateBotUptime();
    } else if (normalized === 'BOT_STATISTICS') {
      this.ensureBotStatisticsVariable();
      this.updateBotStatistics();
    } else if (normalized === 'DISCORD_APP_ID') {
      const activeToken = this.getBotToken();
      let detectedId = this.botProfile?.application?.id || this.botProfile?.id || '';
      if (!detectedId && activeToken) {
        try {
          const first = activeToken.split('.')[0];
          const decoded = Buffer.from(first, 'base64').toString('utf8');
          if (/^\d{15,22}$/.test(decoded)) detectedId = decoded;
        } catch {}
      }
      if (detectedId) {
        this.ensureDiscordAppIdVariable(detectedId);
      } else {
        this.ensureManagedProjectVariable('DISCORD_APP_ID', 'project_var_discord_app_id', { type: 'number', initialValue: 0 });
      }
    }

    this.broadcastWS({
      type: 'PROJECT_VARIABLES_UPDATED',
      payload: { projectId: this.project.id, variables: this.getProjectVariables() }
    });

    return {
      success: true,
      variables: this.getProjectVariables(),
      disabledBuiltInVariables: [...this.disabledBuiltInProjectVariables]
    };
  }

  getProjectVariableState(mode = 'live') {
    const state = mode === 'mock' ? this.mockProjectVariableStates : this.projectVariableStates;
    for (const variable of this.projectVariables) if (variable.secret && !state.has(variable.id)) {
      const secret = this.getSecretValue('project', '', variable.id);
      if (secret !== undefined) state.set(variable.id, structuredClone(secret));
    }
    return state;
  }

  saveGraph(tabId, graphData, { quiet = false } = {}) {
    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.connections)) {
      throw new TypeError('A graph must include nodes and connections arrays.');
    }
    graphData = this.protectGraphSecrets(graphData);
    if (Array.isArray(graphData.variables)) {
      const activeSecretKeys = new Set(graphData.variables.filter((variable) => variable?.secret).map((variable) => this.secretStoreKey('graph', tabId, variable.id)));
      this.setSecretValues([], [...this.secretValues.keys()].filter((key) => key.startsWith(`graph:${tabId}:`) && !activeSecretKeys.has(key)));
    }
    if (Array.isArray(graphData.variables)) {
      if (graphData.variables.length > 100) throw new TypeError('A graph can have at most 100 variables.');
      const names = new Set();
      const existingVariables = new Map((this.graphs.get(tabId)?.variables || []).map((variable) => [variable.id, variable]));
      for (const variable of graphData.variables) {
        const name = String(variable?.name || '').trim();
        const validName = /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name);
        if (!validName) throw new TypeError('Variable names must start and end with a letter or number, with letters, numbers, hyphens, or underscores inside.');
        if (names.has(name.toLowerCase())) throw new TypeError(`Variable name “${name}” is used more than once.`);
        names.add(name.toLowerCase());
        const type = variable?.type;
        if (!['string', 'number', 'boolean', 'array', 'object'].includes(type)) throw new TypeError(`Variable “${name}” has an unsupported type.`);
        if (type === 'array' || type === 'object') {
          const value = variable.secret ? this.getSecretValue('graph', tabId, variable.id) : variable.initialValue;
          const valid = type === 'array' ? Array.isArray(value) : value && typeof value === 'object' && !Array.isArray(value);
          if (!valid || JSON.stringify(value).length > 10000) throw new TypeError(`Variable “${name}” needs a JSON ${type} under 10,000 characters.`);
        } else if (type === 'string' && String(variable.secret ? this.getSecretValue('graph', tabId, variable.id) ?? '' : variable.initialValue ?? '').length > 10000) throw new TypeError(`Variable “${name}” exceeds the 10,000 character value limit.`);
      }
      for (const node of graphData.nodes.filter((item) => item?.type === 'variable_create')) {
        const name = String(node.data?.name || '').trim();
        const validName = /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name);
        if (!validName) throw new TypeError('Create Variable names must start and end with a letter or number, with letters, numbers, hyphens, or underscores inside.');
        if (names.has(name.toLowerCase())) throw new TypeError(`Variable name “${name}” is used more than once.`);
        names.add(name.toLowerCase());
      }
    }
    const previousGraph = this.graphs.get(tabId);
    if (Array.isArray(graphData.variables)) {
      const previousVariables = new Map((previousGraph?.variables || []).map((variable) => [variable.id, variable]));
      for (const states of [this.variableStates, this.mockVariableStates]) {
        let state = states.get(tabId);
        if (!state) continue;
        const nextIds = new Set();
        for (const variable of graphData.variables) {
          nextIds.add(variable.id);
          const previous = previousVariables.get(variable.id);
          const nextInitialValue = variable.secret ? this.getSecretValue('graph', tabId, variable.id) : variable.initialValue;
          const previousInitialValue = previous?.secret ? this.getSecretValue('graph', tabId, variable.id) : previous?.initialValue;
          if (!previous || previous.type !== variable.type || previous.persist !== variable.persist || JSON.stringify(previousInitialValue) !== JSON.stringify(nextInitialValue)) {
            state.set(variable.id, structuredClone(nextInitialValue));
          }
        }
        for (const variableId of state.keys()) if (!nextIds.has(variableId)) state.delete(variableId);
      }
    }
    this.deletedGraphIds.delete(tabId);
    this.graphs.set(tabId, { ...graphData, id: tabId, updatedAt: new Date().toISOString() });
    this.persistGraphs();
    if (this.botProfile) {
      this.botProfile.intentSummary = this.getIntentPlan();
      this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, user: this.botProfile } });
    }
    if (!quiet) this.log('INFO', `Saved visual graph tab: "${graphData.name || tabId}"`);
    return this.graphs.get(tabId);
  }

  deleteGraph(tabId) {
    for (const controller of this.graphRunControllers.get(tabId) || []) controller.abort();
    this.graphRunControllers.delete(tabId);
    this.graphs.delete(tabId);
    this.deletedGraphIds.add(tabId);
    this.variableStates.delete(tabId);
    this.mockVariableStates.delete(tabId);
    const secretPrefix = `graph:${tabId}:`;
    this.setSecretValues([], [...this.secretValues.keys()].filter((key) => key.startsWith(secretPrefix)));
    this.persistGraphs();
    if (this.botProfile) {
      this.botProfile.intentSummary = this.getIntentPlan();
      this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, user: this.botProfile } });
    }
    if (this.defaultGraphId === tabId) {
      this.defaultGraphId = 'tab_slash_help';
      this.persistGraphLibrary();
    }
    this.log('INFO', `Removed graph tab "${tabId}"`);
  }

  /**
   * @param {string} token
   */
  async verifyAndFetchProfile(token) {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) throw new Error('Token is required.');
    this.log('INFO', 'Verifying Discord Bot Token via Chezcord REST client...');
    const rest = this.createTrackedRESTClient(cleanToken);

    try {
      const user = await rest.getCurrentUser();
      let app = null;
      try {
        app = await rest.getCurrentApplication();
      } catch (e) {
        // perm
      }

      this.botProfile = {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        discriminator: user.discriminator,
        avatar: user.avatar,
        banner: user.banner || app?.banner || app?.cover_image || null,
        bot: user.bot,
        flags: user.flags,
        public_flags: user.public_flags,
        verifiedBot: isDiscordVerifiedBot(user),
        application: app
          ? {
              id: app.id,
              name: app.name,
              description: app.description,
              icon: app.icon,
              banner: app.banner,
              cover_image: app.cover_image,
              bot_public: app.bot_public,
              bot_require_code_grant: app.bot_require_code_grant,
              install_params: app.install_params,
              flags: app.flags,
              flags_new: app.flags_new
            }
          : null
      };
      this.botProfile.intentSummary = this.getIntentPlan();

      this.setBotToken(cleanToken);
      try {
        this.ensureDiscordAppIdVariable(app?.id || user.id);
      } catch (error) {
        this.log('WARN', `Could not add the Discord application ID project variable: ${error.message}`);
      }
      this.log('INFO', `Verified Discord bot: ${user.username}#${user.discriminator || '0'} (ID: ${user.id})`);
      return this.botProfile;
    } catch (err) {
      const safeMessage = redactSecret(err?.message, cleanToken);
      this.log('ERROR', `Bot token verification failed: ${safeMessage}`);
      const safeError = new Error(safeMessage);
      if (Number.isInteger(err?.status)) safeError.status = err.status;
      throw safeError;
    }
  }

  async startBot(token = null) {
    if (this.startBotPromise) return this.startBotPromise;
    const pendingStart = this.startBotInternal(token);
    this.startBotPromise = pendingStart;
    try {
      return await pendingStart;
    } finally {
      if (this.startBotPromise === pendingStart) this.startBotPromise = null;
    }
  }

  async startBotInternal(token = null) {
    const requestedToken = token ? String(token) : null;
    const configuredToken = this.getBotToken();
    if (this.client && ['CONNECTING', 'ONLINE'].includes(this.status) && (!requestedToken || requestedToken === configuredToken)) return this.client;
    const startGeneration = ++this.botStartGeneration;
    this.graphWebSockets.closeAll();
    this.webSocketDispatchGraphEvent = null;
    this.stopCronScheduler?.();
    this.stopCronScheduler = null;
    if (requestedToken) this.setBotToken(requestedToken);
    const activeToken = this.getBotToken();
    if (!activeToken) {
      throw new Error('No Discord Bot Token configured. Provide one in setup.');
    }

    if (!this.botProfile) await this.verifyAndFetchProfile(activeToken);
    else {
      try { this.ensureDiscordAppIdVariable(this.botProfile.application?.id || this.botProfile.id); }
      catch (error) { this.log('WARN', `Could not add the Discord application ID project variable: ${error.message}`); }
    }

    await this.refreshIntentPlan(true);
    if (startGeneration !== this.botStartGeneration) return null;

    this.graphRunAbortController?.abort();
    this.graphRunAbortController = new AbortController();
    const runSignal = this.graphRunAbortController.signal;

    if (this.restRateLimitListener) {
      this.client?.rest.rateLimiter.off('rateLimit', this.restRateLimitListener);
      this.restRateLimitListener = null;
    }
    if (this.client) {
      this.client.destroy();
    }

    this.status = 'CONNECTING';
    this.startBotUptime();
    this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status } });
    this.log('GATEWAY', 'Initiating Chezcord Gateway connection...');

    const intentPlan = this.getIntentPlan();
    const missingPrivileged = intentPlan.filter((intent) => intent.privileged && intent.required && intent.portalEnabled === false);
    if (missingPrivileged.length) {
      this.log('WARN', `Connecting without ${missingPrivileged.map((intent) => intent.label).join(' and ')} privileged intent${missingPrivileged.length === 1 ? '' : 's'}; related graph events and data may be unavailable.`);
    }
    const intents = intentPlan.filter((intent) => intent.required && !(intent.privileged && intent.portalEnabled === false)).reduce((value, intent) => value | intent.bit, 0);
    if (this.botProfile) this.botProfile.intentSummary = intentPlan;
    this.client = new Client({ token: activeToken, intents });
    this.trackDiscordRESTClient(this.client.rest);
    if (!this.applicationEmojis.length && this.botProfile?.application?.id) {
      try {
        const emojiResult = await this.client.rest.getApplicationEmojis(this.botProfile.application.id);
        this.applicationEmojis = Array.isArray(emojiResult?.items) ? emojiResult.items : [];
      } catch (error) {
        this.log('WARN', `App emojis could not be loaded for text templates: ${error.message}`);
      }
    }
    this.resetGatewayLatency();
    this.client.on('heartbeatLatency', (latencyMs) => this.recordGatewayLatency(latencyMs));
    this.restRateLimitListener = ({ rateLimitedUntil, scope }) => {
      this.gatewayMetrics = { ...this.gatewayMetrics, rateLimitedUntil, rateLimitScope: scope };
      this.publishGatewayMetrics();
      this.log('WARN', `Discord API rate limit active (${scope}); pausing API requests until ${new Date(rateLimitedUntil).toISOString()}.`);
    };
    this.client.rest.rateLimiter.on('rateLimit', this.restRateLimitListener);
    this.publishGatewayMetrics();

    const activeReadyGraphRuns = new Set();
    const recentGatewayEvents = new Map();
    const dispatchGraphEvent = async (eventName, payload, onlyGraphId = null, sharedInteractionState = null) => {
      const normalizedEventName = ['SLASH_COMMAND', 'BUTTON_CLICK', 'SELECT_MENU', 'MODAL_SUBMIT'].includes(eventName) ? 'INTERACTION_CREATE' : eventName;
      const eventId = ['MESSAGE_CREATE', 'INTERACTION_CREATE'].includes(normalizedEventName)
        ? payload?.id || payload?.message?.id || payload?.interaction?.id
        : null;
      if (eventId && !onlyGraphId) {
        const dedupeKey = `${normalizedEventName}:${eventId}`;
        const now = Date.now();
        for (const [key, timestamp] of recentGatewayEvents) if (now - timestamp > 120000) recentGatewayEvents.delete(key);
        if (recentGatewayEvents.has(dedupeKey)) return;
        recentGatewayEvents.set(dedupeKey, now);
        while (recentGatewayEvents.size > 5000) recentGatewayEvents.delete(recentGatewayEvents.keys().next().value);
      }
      const interactionState = normalizedEventName === 'INTERACTION_CREATE'
        ? sharedInteractionState || { applicationId: payload?.application_id || '', acknowledged: false, deferred: false, pending: null }
        : null;
      const listeningGraphs = [...this.graphs.values()].filter((graph) => graph.graphType !== 'function'
        && (!onlyGraphId || graph.id === onlyGraphId)
        && (graph.nodes || []).some((node) => NodeDefinitions[node.type]?.gatewayEvent === normalizedEventName
          && (!String(normalizedEventName).startsWith('WEBSOCKET_') || !String(node.data?.filter_connection_id || '').trim()
            || String(node.data.filter_connection_id).trim() === String(payload?.connectionId || ''))));
      await Promise.all(listeningGraphs.map(async (graph) => {
        if (this.graphs.get(graph.id) !== graph) return;
        const isReadyEvent = normalizedEventName === 'READY';
        if (isReadyEvent && activeReadyGraphRuns.has(graph.id)) return;
        if (isReadyEvent) activeReadyGraphRuns.add(graph.id);
        const graphController = new AbortController();
        const graphControllers = this.graphRunControllers.get(graph.id) || new Set();
        graphControllers.add(graphController);
        this.graphRunControllers.set(graph.id, graphControllers);
        const abortWithBot = () => graphController.abort();
        if (runSignal.aborted) graphController.abort();
        else runSignal.addEventListener('abort', abortWithBot, { once: true });
        try {
          const result = await GraphRunner.execute(graph, eventName, payload, {
            projectDir: this.projectDir,
            rest: this.client.rest,
            client: this.client,
            webSockets: this.graphWebSockets,
            resolveFunctionGraph: (graphId) => this.graphs.get(graphId),
            variablesState: this.getVariableState(graph),
            projectVariables: this.projectVariables,
            projectVariablesState: this.getProjectVariableState(),
            getGraphVariableState: (targetGraph) => this.getVariableState(targetGraph),
            getSecretVariableValue: (variableId, scope, sourceGraph) => this.getSecretValue(scope, scope === 'project' ? '' : sourceGraph?.id, variableId),
            appEmojis: this.applicationEmojis,
            interactionState,
            canDeploySlashCommands: () => {
              let permissions = 0n;
              try { permissions = BigInt(String(payload?.member?.permissions || 0)); } catch {}
              return (permissions & 8n) !== 0n || (permissions & 32n) !== 0n;
            },
            deploySlashCommands: () => this.deploySlashCommands(),
            signal: graphController.signal,
            waitForGateway: (timeoutMs, signal) => this.status === 'ONLINE'
              ? Promise.resolve(true)
              : waitForGatewayReady(this.client, timeoutMs, signal),
            onNodeExecution: ({ graphId, nodeId }) => this.broadcastWS({ type: 'GRAPH_EXECUTION_PULSE', payload: { tabId: graphId, nodeIds: [nodeId] } }),
            onNodeError: (failure) => {
              this.log('ERROR', `Graph “${failure.graphName}” failed at node “${failure.nodeLabel}” (${failure.nodeId}): ${failure.error}`, { graphId: failure.graphId, nodeId: failure.nodeId, nodeLabel: failure.nodeLabel });
              this.broadcastWS({ type: 'GRAPH_NODE_ERROR', payload: failure });
            },
            log: (message) => this.log('EXECUTION', message)
          });
          if (!graphController.signal.aborted && result.executedNodeIds.length > 0) {
            this.broadcastWS({ type: 'GRAPH_EXECUTION_PULSE', payload: { tabId: graph.id, nodeIds: result.executedNodeIds } });
          }
        } catch (error) {
          if (error?.name !== 'AbortError' && !graphController.signal.aborted) {
            this.log('ERROR', `Graph “${graph.name || graph.id}” failed while handling ${normalizedEventName}: ${error.message}`);
          }
        } finally {
          runSignal.removeEventListener('abort', abortWithBot);
          const activeControllers = this.graphRunControllers.get(graph.id);
          activeControllers?.delete(graphController);
          if (!activeControllers?.size) this.graphRunControllers.delete(graph.id);
          if (isReadyEvent) activeReadyGraphRuns.delete(graph.id);
        }
      }));
    };

    this.client.on('status', (s) => {
      this.log('GATEWAY', `Gateway status change: ${s}`);
    });

    this.client.on('debug', (msg) => {
      this.log('DEBUG', msg);
    });

    this.client.on('ready', () => {
      this.status = 'ONLINE';
      this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, user: this.client.user } });
      this.log('INFO', `Bot is ONLINE as ${this.client.user.username}`);
      dispatchGraphEvent('READY', { user: this.client.user }).catch((error) => this.log('ERROR', `Bot-ready graph failed: ${error.message}`));
      this.stopCronScheduler?.();
      this.stopCronScheduler = startCronScheduler({
        getGraphs: () => [...this.graphs.values()],
        dispatch: (graph, _node, payload) => dispatchGraphEvent('CRON_TICK', payload, graph.id),
        onError: ({ graph, node, error }) => {
          const failure = { graphId: graph.id, graphName: graph.name || graph.id, nodeId: node.id, nodeLabel: node.label || 'On Schedule', error };
          this.log('ERROR', `Graph “${failure.graphName}” has an invalid cron schedule at node “${failure.nodeLabel}”: ${error}`, { graphId: failure.graphId, nodeId: failure.nodeId, nodeLabel: failure.nodeLabel });
          this.broadcastWS({ type: 'GRAPH_NODE_ERROR', payload: failure });
        }
      });
    });

    registerAsyncEventHandler(this.client, 'messageCreate', async (msg) => {
      if (msg.author?.id === this.client.user?.id) return;
      this.log('INFO', 'Message event received, dispatching to matching graphs.');
      await dispatchGraphEvent('MESSAGE_CREATE', msg);
    }, (error, eventName) => this.log('ERROR', `Discord ${eventName} event failed: ${error?.message || String(error)}`, {
      httpStatus: error?.status,
      discordCode: error?.code
    }));

    registerAsyncEventHandler(this.client, 'interactionCreate', async (interaction) => {
      this.log('INFO', `Interaction received: Type ${interaction.type}`);
      if (Number(interaction.type) === 4) {
        const commandName = String(interaction.data?.name || '').toLowerCase();
        const graph = [...this.graphs.values()].find((item) => (item.nodes || []).some((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === commandName));
        const commandNode = graph?.nodes?.find((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === commandName);
        const focusedPath = getFocusedSlashOptionPath(interaction.data?.options || []);
        const focused = focusedPath?.length ? focusedPath[focusedPath.length - 1] : '';
        const option = findSlashParameter(commandNode?.data?.options, focusedPath || []);
        if (option?.autocomplete && option.dynamicAutocomplete && graph?.nodes?.some((node) => node.type === 'event_slash_autocomplete')) {
          const interactionState = { applicationId: interaction.application_id || '', acknowledged: false, deferred: false, pending: null };
          await dispatchGraphEvent('INTERACTION_CREATE', interaction, graph.id, interactionState);
          if (!interactionState.acknowledged) {
            try { await this.client.rest.createInteractionResponse(interaction.id, interaction.token, { type: 8, data: { choices: [] } }); }
            catch (error) { this.log('WARN', `Autocomplete response failed for /${commandName}: ${error.message}`); }
          }
          return;
        }
        const typed = String(findFocusedSlashOption(interaction.data?.options || [])?.value ?? '').toLocaleLowerCase();
        const choices = option?.autocomplete && Array.isArray(option.choices)
          ? option.choices.filter((choice) => String(choice.name || '').toLocaleLowerCase().includes(typed)).slice(0, 25).map((choice) => ({
            name: String(choice.name || '').slice(0, 100),
            value: Number(option.type) === 4 ? Number.parseInt(choice.value, 10) : Number(option.type) === 10 ? Number(choice.value) : String(choice.value ?? '').slice(0, 100)
          }))
          : [];
        try {
          await this.client.rest.createInteractionResponse(interaction.id, interaction.token, { type: 8, data: { choices } });
        } catch (error) {
          this.log('WARN', `Autocomplete response failed for /${commandName}: ${error.message}`);
        }
        return;
      }
      if (interaction.type === 2 && Number(interaction.data?.type || 1) === 1) {
        this.commandStatistics.recordCommand({
          name: interaction.data?.name,
          userId: interaction.member?.user?.id || interaction.user?.id,
          timestamp: Date.now()
        });
      }

      await dispatchGraphEvent('INTERACTION_CREATE', interaction);
    }, (error, eventName) => this.log('ERROR', `Discord ${eventName} event failed: ${error?.message || String(error)}`, {
      httpStatus: error?.status,
      discordCode: error?.code
    }));

    registerAsyncEventHandler(this.client, 'guildMemberAdd', async (member) => {
      await dispatchGraphEvent('GUILD_MEMBER_ADD', member);
    }, (error, eventName) => this.log('ERROR', `Discord ${eventName} event failed: ${error?.message || String(error)}`, {
      httpStatus: error?.status,
      discordCode: error?.code
    }));

    this.client.on('gatewayDispatch', (eventName, payload) => {
      if (['READY', 'MESSAGE_CREATE', 'INTERACTION_CREATE', 'GUILD_MEMBER_ADD'].includes(eventName)) return;
      const graphNeedsEvent = [...this.graphs.values()].some((graph) => graph.graphType !== 'function'
        && (graph.nodes || []).some((node) => NodeDefinitions[node.type]?.gatewayEvent === eventName));
      if (!graphNeedsEvent) return;
      dispatchGraphEvent(eventName, payload).catch((error) => this.log('ERROR', `Graph event ${eventName} failed: ${error.message}`));
    });

    this.client.on('fatalError', (err) => {
      this.stopCronScheduler?.();
      this.stopCronScheduler = null;
      this.graphRunAbortController?.abort();
      this.graphWebSockets.closeAll();
      this.webSocketDispatchGraphEvent = null;
      this.stopBotUptime();
      this.status = 'ERROR';
      this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, error: err.message } });
      this.log('ERROR', `Fatal Gateway Error: ${err.message}`);
    });

    try {
      await this.client.login();
      if (startGeneration === this.botStartGeneration && !runSignal.aborted) {
        dispatchGraphEvent('BOT_STARTUP', { gatewayConnected: this.status === 'ONLINE' })
          .catch((error) => this.log('ERROR', `Bot-startup graph failed: ${error.message}`));
      }
    } catch (err) {
      this.graphRunAbortController?.abort();
      this.stopBotUptime();
      this.status = 'ERROR';
      this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, error: err.message } });
      this.log('ERROR', `Login failed: ${err.message}`);
      throw err;
    }
  }

  getIntentPlan(graphs = [...this.graphs.values()]) {
    const requiredIntents = new Set(graphs.flatMap((graph) => (graph.nodes || [])
      .flatMap((node) => NodeDefinitions[node.type]?.gatewayIntents || [])));
    const appFlags = this.botProfile?.application?.flags_new ?? this.botProfile?.application?.flags;
    let flags = null;
    try { if (appFlags !== undefined && appFlags !== null) flags = BigInt(appFlags); } catch {}
    const hasFlag = (bit) => flags === null ? null : Boolean(flags & (1n << BigInt(bit)));
    const configured = (...bits) => {
      const states = bits.map(hasFlag);
      if (states.includes(true)) return true;
      return states.includes(null) ? null : false;
    };
    const intentInfo = {
      GUILDS: ['Guilds', false, true], GUILD_MEMBERS: ['Guild members', true, configured(14, 15)],
      GUILD_MODERATION: ['Server moderation', false, true], GUILD_EMOJIS_AND_STICKERS: ['Server emojis and stickers', false, true],
      GUILD_INTEGRATIONS: ['Integrations', false, true], GUILD_WEBHOOKS: ['Webhooks', false, true], GUILD_INVITES: ['Invites', false, true],
      GUILD_VOICE_STATES: ['Voice states', false, true], GUILD_PRESENCES: ['Presence updates', true, configured(12, 13)],
      GUILD_MESSAGES: ['Guild messages', false, true], GUILD_MESSAGE_REACTIONS: ['Guild reactions', false, true],
      GUILD_MESSAGE_TYPING: ['Guild typing', false, true], DIRECT_MESSAGES: ['Direct messages', false, true],
      DIRECT_MESSAGE_REACTIONS: ['Direct message reactions', false, true], DIRECT_MESSAGE_TYPING: ['Direct message typing', false, true],
      MESSAGE_CONTENT: ['Message content', true, configured(18, 19)], GUILD_SCHEDULED_EVENTS: ['Scheduled events', false, true],
      AUTO_MODERATION_CONFIGURATION: ['AutoMod configuration', false, true], AUTO_MODERATION_EXECUTION: ['AutoMod actions', false, true]
    };
    return Object.entries(GatewayIntents).map(([key, bit]) => ({
      key, label: intentInfo[key]?.[0] || key.replaceAll('_', ' ').toLowerCase(),
      required: key === 'GUILDS' || requiredIntents.has(key),
      privileged: intentInfo[key]?.[1] || false,
      portalEnabled: intentInfo[key]?.[2] === undefined ? true : intentInfo[key][2],
      bit
    }));
  }

  async refreshIntentPlan(force = false) {
    const token = this.getBotToken();
    if (!token) return this.getIntentPlan();
    if (this.intentPlanRefreshPromise) return this.intentPlanRefreshPromise;
    if (!force && Date.now() - this.intentPlanLastRefreshAt < 60_000) return this.getIntentPlan();
    this.intentPlanLastRefreshAt = Date.now();
    this.intentPlanRefreshPromise = (async () => {
      try {
        const application = await this.createTrackedRESTClient(token).getCurrentApplication();
        if (application && this.botProfile) {
          const previous = this.botProfile.application || {};
          this.botProfile = {
            ...this.botProfile,
            application: {
              ...previous,
              id: application.id || previous.id,
              ...(application.flags !== undefined ? { flags: application.flags } : {}),
              ...(application.flags_new !== undefined ? { flags_new: application.flags_new } : {})
            }
          };
    this.webSocketDispatchGraphEvent = dispatchGraphEvent;
          this.botProfile.intentSummary = this.getIntentPlan();
          this.persistBotConfig();
          this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status, user: this.botProfile } });
        }
      } catch (error) {
        this.log('WARN', `Could not refresh Discord privileged intent status: ${error.message}`);
      } finally {
        this.intentPlanRefreshPromise = null;
      }
      return this.getIntentPlan();
    })();
    return this.intentPlanRefreshPromise;
  }

  stopBot() {
    this.botStartGeneration += 1;
    this.stopCronScheduler?.();
    this.stopCronScheduler = null;
    this.graphRunAbortController?.abort();
    this.graphRunAbortController = null;
    this.graphWebSockets.closeAll();
    this.webSocketDispatchGraphEvent = null;
    this.stopBotUptime();
    this.resetGatewayLatency();
    if (this.client) {
      if (this.restRateLimitListener) this.client.rest.rateLimiter.off('rateLimit', this.restRateLimitListener);
      this.restRateLimitListener = null;
      this.client.destroy();
      this.client = null;
    }
    this.status = 'DISCONNECTED';
    this.broadcastWS({ type: 'BOT_STATUS', payload: { status: this.status } });
    this.log('INFO', 'Bot disconnected from Gateway.');
  }

  /**
   * Offline Testing Environment
   * @param {string} tabId
   * @param {string} eventName
   * @param {object} customPayload
   */
  startMockDebug(tabId, eventName, customPayload, graphOverride = null, requestedRunId = null, graphOverrides = null) {
    if (this.debugRuns.size >= 3) throw new Error('Three debug sessions are already active. Finish one before starting another.');
    const runId = typeof requestedRunId === 'string' && /^debug_[\w-]{8,80}$/.test(requestedRunId)
      ? requestedRunId
      : `debug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (this.debugRuns.has(runId)) throw new Error('This debug session is already running.');
    const session = { runId, paused: false, continue: false, resume: null, timer: null };
    this.debugRuns.set(runId, session);
    this.injectMockEvent(tabId, eventName, customPayload, graphOverride, session, graphOverrides).then((result) => {
      this.broadcastWS({ type: 'MOCK_DEBUG_FINISHED', payload: { runId, result } });
    }).catch((error) => {
      this.broadcastWS({ type: 'MOCK_DEBUG_FINISHED', payload: { runId, error: error.message } });
    }).finally(() => {
      clearTimeout(session.timer);
      this.debugRuns.delete(runId);
    });
    return { runId };
  }

  advanceMockDebug(runId, action = 'step') {
    const session = this.debugRuns.get(runId);
    if (!session) throw new Error('Debug session has ended.');
    if (action === 'continue') session.continue = true;
    if (session.resume) {
      clearTimeout(session.timer);
      session.paused = false;
      const resume = session.resume;
      session.resume = null;
      resume();
    }
    return { success: true };
  }

  async injectMockEvent(tabId, eventName, customPayload, graphOverride = null, debugSession = null, graphOverrides = null) {
    const startTime = Date.now();
    this.log('MOCK', `[Offline Simulator] Injecting mock ${eventName} event into tab: "${tabId}"`);

    const graph = graphOverride?.id === tabId && Array.isArray(graphOverride.nodes)
      ? graphOverride
      : this.graphs.get(tabId) || Array.from(this.graphs.values())[0];
    if (!graph) {
      throw new Error(`Graph tab "${tabId}" not found for simulation.`);
    }

    const interceptedOutputs = [];
    const mockREST = this.mockGateway.createMockREST(interceptedOutputs);
    const functionGraphLookup = new Map(this.graphs);
    if (Array.isArray(graphOverrides)) for (const candidate of graphOverrides) if (candidate && typeof candidate.id === 'string') functionGraphLookup.set(candidate.id, candidate);

    const result = await GraphRunner.execute(graph, eventName, customPayload, {
      projectDir: this.projectDir,
      rest: mockREST,
      client: {
        setPresence: (p) => {
          interceptedOutputs.push({ type: 'PRESENCE_UPDATE', payload: p, timestamp: new Date().toISOString() });
        },
        setVoiceChannel: (guildId, channelId, options) => {
          interceptedOutputs.push({ type: 'VOICE_STATE_UPDATE', guildId, channelId, options, timestamp: new Date().toISOString() });
        }
      },
      resolveFunctionGraph: (graphId) => functionGraphLookup.get(graphId),
      variablesState: this.getVariableState(graph, 'mock'),
      projectVariables: this.projectVariables,
      projectVariablesState: this.getProjectVariableState('mock'),
      getGraphVariableState: (targetGraph) => this.getVariableState(targetGraph, 'mock'),
      getSecretVariableValue: (variableId, scope, sourceGraph) => this.getSecretValue(scope, scope === 'project' ? '' : sourceGraph?.id, variableId),
      appEmojis: this.applicationEmojis,
      mock: true,
      debug: Boolean(debugSession),
      onDebugStep: debugSession ? async (step) => {
        this.broadcastWS({ type: 'MOCK_DEBUG_STEP', payload: { runId: debugSession.runId, tabId: graph.id, step } });
        if (debugSession.continue) return;
        debugSession.paused = true;
        await new Promise((resolve) => {
          debugSession.resume = resolve;
          debugSession.timer = setTimeout(() => {
            debugSession.continue = true;
            debugSession.resume = null;
            resolve();
          }, 120_000);
          debugSession.timer.unref?.();
        });
      } : undefined,
      log: (msg) => this.log('MOCK', msg)
    });

    const elapsed = Date.now() - startTime;
    this.log('MOCK', `[Offline Simulator] Simulation completed in ${elapsed}ms. Output actions generated: ${interceptedOutputs.length}`);

    this.broadcastWS({
      type: 'GRAPH_EXECUTION_PULSE',
      payload: { tabId: graph.id, nodeIds: result.executedNodeIds }
    });

    return {
      success: !result.error,
      tabId: graph.id,
      eventName,
      executedNodeIds: result.executedNodeIds,
      traces: result.traces,
      debugSteps: result.debugSteps || [],
      interceptedOutputs,
      elapsedMs: elapsed,
      error: result.error
    };
  }
}

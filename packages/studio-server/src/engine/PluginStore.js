import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataDir } from '../storage.js';
import { NodeDefinitions, registerAdapterNodeDefinitions, registerFailedNodeTypes } from './NodeRegistry.js';
import { FUNCTION_ARGUMENT_VALUE_TYPES, functionArgumentPinId, functionInputPinType, getFunctionGraphArguments, getFunctionInputArguments } from './FunctionGraphContract.js';
import { inspectAdapterBytes, runWasmAdapter } from './WasmAdapterRuntime.js';
import { CryptoEngine } from '../security/CryptoEngine.js';
import { serverConfig } from '../config.js';

const DEFAULT_REPOSITORY_URL = 'https://github.com/relentiousdragon/arc-plugins';
const MAX_REGISTRY_BYTES = 1024 * 1024;
const MAX_PACK_BYTES = 1024 * 1024;
const MAX_FUNCTIONS = 64;
const MAX_NODES = 128;
const MAX_CONNECTIONS = 512;
const MAX_ADAPTER_DEPENDENCIES = 16;
const MAX_ADAPTER_LOCK_BYTES = 2 * 1024 * 1024;
const MAX_ADAPTER_LOCK_PACKAGES = 256;
const MAX_ADAPTER_INSTALL_BYTES = 200 * 1024 * 1024;
const LEGACY_MIN_ARC_VERSION = '2026.1.1.0';
const pluginRepositoryRoot = process.env.ARC_PLUGINS_PATH?.trim()
  ? path.resolve(process.env.ARC_PLUGINS_PATH.trim())
  : null;
const bundledAdapterRoot = pluginRepositoryRoot ? path.join(pluginRepositoryRoot, 'adapters') : null;
const localHostAdapters = loadBundledHostAdapters(bundledAdapterRoot);
const hostAdapterRuntimePromises = new Map();
const installedPath = path.join(dataDir, 'installed-plugins.json');
const settingsPath = path.join(dataDir, 'plugin-store-settings.json');
const adapterRoot = path.join(dataDir, 'plugin-adapters');
const PROJECT_PERMISSION_DEFINITIONS = new Map([...localHostAdapters.values()].flatMap((plugin) => plugin.permissions.map((permission) => [permission.id, permission])));
if (PROJECT_PERMISSION_DEFINITIONS.size !== [...localHostAdapters.values()].reduce((total, plugin) => total + plugin.permissions.length, 0)) throw new Error('Local host adapters declare duplicate project permission IDs.');
const LOCAL_HOST_ADAPTERS = new Map([...localHostAdapters].map(([id, plugin]) => [id, plugin]));
const allowedNode = (type) => type === 'function_input'
  || type === 'function_return'
  || type === 'function_call'
  || type === 'function_math'
  || type === 'format_text'
  || type === 'compare_text'
  || type.startsWith('math_')
  || type.startsWith('logic_')
  || type.startsWith('value_')
  || type.startsWith('data_')
  || type.startsWith('variable_');
const registryCache = new Map();
const registryRequests = new Map();
//
function normalizeRepositoryUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); }
  catch { throw new Error('Enter an HTTPS GitHub or GitLab repository URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.port && parsed.port !== '443')) {
    throw new Error('Use a public HTTPS repository URL without credentials, query parameters, or a custom port.');
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'gitlab.com') throw new Error('Plugin repositories must be hosted on github.com or gitlab.com.');
  let parts;
  try { parts = parsed.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part)); }
  catch { throw new Error('The repository URL contains invalid path encoding.'); }
  if (parts.at(-1)?.toLowerCase().endsWith('.git')) parts[parts.length - 1] = parts.at(-1).slice(0, -4);
  const validPart = (part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== '.' && part !== '..';
  if (parts.length < 2 || parts.some((part) => !validPart(part)) || (host === 'github.com' && parts.length !== 2)) {
    throw new Error(host === 'github.com'
      ? 'Enter a GitHub repository URL in the form https://github.com/owner/repository.'
      : 'Enter a GitLab project URL in the form https://gitlab.com/group/project.');
  }
  const url = `https://${host}/${parts.join('/')}`;
  return { provider: host === 'github.com' ? 'github' : 'gitlab', path: parts.join('/'), url };
}

function readPluginSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    return normalizeRepositoryUrl(value.repositoryUrl || DEFAULT_REPOSITORY_URL);
  } catch { return normalizeRepositoryUrl(DEFAULT_REPOSITORY_URL); }
}

function writePluginSettings(repository) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ repositoryUrl: repository.url }, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, settingsPath);
}

function registryUrl(repository) {
  return repository.provider === 'github'
    ? `https://raw.githubusercontent.com/${repository.path}/main/registry.json`
    : `https://gitlab.com/${repository.path}/-/raw/main/registry.json`;
}

function artifactUrl(repository, commit, filePath) {
  return repository.provider === 'github'
    ? `https://raw.githubusercontent.com/${repository.path}/${commit}/${filePath}`
    : `https://gitlab.com/${repository.path}/-/raw/${commit}/${filePath}`;
}

function sourceFileUrl(repository, commit, filePath) {
  return repository.provider === 'github'
    ? `https://github.com/${repository.path}/tree/${commit}/${filePath}`
    : `https://gitlab.com/${repository.path}/-/tree/${commit}/${filePath}`;
}

function readInstalled() {
  try {
    const saved = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    let changed = false;
    for (const plugin of Object.values(saved)) {
      if (!plugin || typeof plugin !== 'object') continue;
      if (plugin.autoUpdate === undefined) plugin.autoUpdate = true;
      if (plugin.minArcStudioVersion === undefined) { plugin.minArcStudioVersion = LEGACY_MIN_ARC_VERSION; changed = true; }
      if (plugin.sourceType === 'catalog' && !plugin.repositoryUrl) plugin.repositoryUrl = DEFAULT_REPOSITORY_URL;
      if (!plugin.installationId) { plugin.installationId = randomUUID(); changed = true; }
      if (LOCAL_HOST_ADAPTERS.has(plugin.id) && !Array.isArray(plugin.permissions)) { plugin.permissions = LOCAL_HOST_ADAPTERS.get(plugin.id).permissions; changed = true; }
      if (!plugin.sourceTrust) {
        plugin.sourceTrust = plugin.sourceType === 'builtin' ? 'bundled' : plugin.sourceType === 'local' ? 'local' : isDefaultRepository(plugin.repositoryUrl) ? 'default' : 'custom';
        changed = true;
      }
    }
    if (changed) writeInstalled(saved);
    return saved;
  } catch { return {}; }
}

function adapterDirectory(pluginId, version) {
  return path.join(adapterRoot, pluginId, version);
}

function hostAdapterDirectory(pluginId) {
  return path.join(adapterRoot, pluginId);
}

function validateNpmDependencies(value, pluginId = 'Adapter') {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ADAPTER_DEPENDENCIES) throw new Error(`${pluginId} may declare at most ${MAX_ADAPTER_DEPENDENCIES} npm dependencies.`);
  const names = new Set();
  return value.map((item) => {
    const name = String(item?.name || '');
    const version = String(item?.version || '');
    if (!/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version) || names.has(name)) {
      throw new Error(`${pluginId} declares an invalid or duplicate npm dependency. Use an exact package version.`);
    }
    names.add(name);
    return { name, version };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function inspectNpmLock(bytes, dependencies, pluginId) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ADAPTER_LOCK_BYTES) throw new Error(`${pluginId} dependency lockfile exceeds the 2 MiB limit.`);
  let lock;
  try { lock = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`${pluginId} dependency lockfile is not valid JSON.`); }
  const root = lock?.packages?.[''];
  if (!root || ![2, 3].includes(lock.lockfileVersion) || !/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][a-z0-9._-]{0,127}$/i.test(root.name || '') || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(root.version || '')) {
    throw new Error(`${pluginId} must include a package-lock.json created with npm lockfile version 2 or 3.`);
  }
  const expected = Object.fromEntries(dependencies.map(({ name, version }) => [name, version]));
  if (JSON.stringify(Object.entries(root.dependencies || {}).sort(([a], [b]) => a.localeCompare(b))) !== JSON.stringify(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b))) || Object.keys(root.devDependencies || {}).length) {
    throw new Error(`${pluginId} package-lock.json dependencies must exactly match the adapter manifest, dev dependencies are not supported.`);
  }
  const packages = Object.entries(lock.packages).filter(([key]) => key !== '');
  if (!packages.length || packages.length > MAX_ADAPTER_LOCK_PACKAGES) throw new Error(`${pluginId} lockfile must contain 1–${MAX_ADAPTER_LOCK_PACKAGES} packages.`);
  for (const [key, item] of packages) {
    if (!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(key)
      || !item || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(item.version || '')
      || typeof item.resolved !== 'string' || typeof item.integrity !== 'string'
      || item.link || item.hasInstallScript || !/^sha512-[A-Za-z0-9+/]+=*$/.test(item.integrity)) {
      throw new Error(`${pluginId} lockfile contains an unpinned package or one requiring install scripts.`);
    }
    let resolved;
    try { resolved = new URL(item.resolved); } catch { throw new Error(`${pluginId} lockfile contains an invalid package URL.`); }
    if (resolved.protocol !== 'https:' || resolved.hostname !== 'registry.npmjs.org' || resolved.username || resolved.password) {
      throw new Error(`${pluginId} dependencies must be pinned to the public npm registry.`);
    }
  }
  return { lock, packageCount: packages.length };
}

function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), 'npm/node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../node_modules/npm/bin/npm-cli.js')
  ].filter(Boolean);
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const executable of process.platform === 'win32' ? ['npm.cmd', 'npm'] : ['npm']) {
      const file = path.join(directory, executable);
      try {
        const resolved = fs.realpathSync(file);
        if (resolved.endsWith('.js') && fs.existsSync(resolved)) candidates.push(resolved);
      } catch { /* check next path  entry */ }
    }
  }
  return candidates.find((candidate) => candidate.endsWith('.js') && fs.existsSync(candidate)) || '';
}

async function installNpmDependencies(stagedDirectory, stageRoot, dependencies, lockBytes, pluginId) {
  const { lock, packageCount } = inspectNpmLock(lockBytes, dependencies, pluginId);
  const npmCli = resolveNpmCli();
  if (!npmCli) throw new Error('A compatible npm CLI is not available in this ARC Studio installation.');
  fs.writeFileSync(path.join(stagedDirectory, 'package.json'), JSON.stringify({
    name: lock.packages[''].name,
    version: lock.packages[''].version,
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(dependencies.map(({ name, version }) => [name, version]))
  }, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(stagedDirectory, 'package-lock.json'), lockBytes, { mode: 0o600 });
  const configPath = path.join(stageRoot, 'npmrc');
  const cachePath = path.join(stageRoot, 'npm-cache');
  fs.writeFileSync(configPath, 'ignore-scripts=true\naudit=false\nfund=false\n', { mode: 0o600 });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', '--fetch-retries=0', '--fetch-timeout=30000', '--maxsockets=4', '--registry=https://registry.npmjs.org/'], {
      cwd: stagedDirectory,
      env: { ...process.env, npm_config_userconfig: configPath, npm_config_cache: cachePath, npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_registry: 'https://registry.npmjs.org/' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    }, 120000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      error ? reject(error) : resolve();
    };
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-12000); });
    child.on('error', (error) => finish(new Error(`Could not start npm for ${pluginId}: ${error.message}`)));
    child.on('close', (code) => finish(timedOut
      ? new Error(`${pluginId} dependency installation timed out after 120 seconds.`)
      : code === 0 ? null : new Error(`${pluginId} dependencies could not be installed${stderr.trim() ? `: ${stderr.trim().slice(-1800)}` : '.'}`)));
  });
  fs.rmSync(cachePath, { recursive: true, force: true });
  let totalBytes = 0;
  const measure = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const itemPath = path.join(directory, item.name);
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) measure(itemPath);
      else if (item.isFile()) totalBytes += fs.statSync(itemPath).size;
      if (totalBytes > MAX_ADAPTER_INSTALL_BYTES) throw new Error(`${pluginId} installed dependencies exceed the 200 MiB limit.`);
    }
  };
  measure(path.join(stagedDirectory, 'node_modules'));
  return packageCount;
}

function projectSettingAad(projectDir, pluginId, fieldId) {
  return `plugin-settings:${path.basename(projectDir)}:${pluginId}:${fieldId}`;
}

function validateThirdPartyNotices(notices) {
  if (notices === undefined) return [];
  if (!Array.isArray(notices) || notices.length > 20) throw new Error('Plugin third-party notices must be a list of at most 20 entries.');
  return notices.map((item) => {
    if (!item || typeof item !== 'object' || !String(item.name || '').trim() || !String(item.license || '').trim()) throw new Error('A third-party notice needs a name and license.');
    let sourceUrl = '';
    try {
      const url = new URL(String(item.sourceUrl || ''));
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      sourceUrl = url.href;
    } catch { throw new Error('Third-party notice links must use HTTPS.'); }
    return {
      name: String(item.name).trim().slice(0, 100),
      version: String(item.version || '').slice(0, 40),
      license: String(item.license).trim().slice(0, 100),
      sourceUrl,
      notice: String(item.notice || '').slice(0, 8000)
    };
  });
}

function validatePluginSettingsSchema(schema) {
  if (schema === undefined) return [];
  if (!Array.isArray(schema) || schema.length > 40) throw new Error('Plugin settings schema must contain at most 40 fields.');
  const ids = new Set();
  return schema.map((field) => {
    if (!field || !/^[a-z][a-zA-Z0-9_]{0,47}$/.test(field.id || '') || ids.has(field.id) || !['string', 'number', 'boolean'].includes(field.type) || !String(field.label || '').trim()) throw new Error('Plugin settings contain an invalid or duplicate field.');
    ids.add(field.id);
    const normalized = {
      id: field.id,
      label: String(field.label).trim().slice(0, 80),
      type: field.type,
      secret: field.secret === true,
      required: field.required === true,
      ...(field.group ? { group: String(field.group).slice(0, 48) } : {}),
      ...(field.type === 'number' && Number.isFinite(Number(field.min)) ? { min: Number(field.min) } : {}),
      ...(field.type === 'number' && Number.isFinite(Number(field.max)) ? { max: Number(field.max) } : {})
    };
    if (field.defaultValue !== undefined && !normalized.secret) {
      if (field.type === 'number' && Number.isFinite(Number(field.defaultValue))) normalized.defaultValue = Number(field.defaultValue);
      else if (field.type === 'boolean' && typeof field.defaultValue === 'boolean') normalized.defaultValue = field.defaultValue;
      else if (field.type === 'string' && typeof field.defaultValue === 'string') normalized.defaultValue = field.defaultValue.slice(0, 512);
    }
    return normalized;
  });
}

function loadBundledHostAdapters(root, { builtIn = false } = {}) {
  const adapters = new Map();
  if (!root || !fs.existsSync(root)) return adapters;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, entry.name);
    const manifestPath = path.join(directory, 'arc-plugin.json');
    if (!fs.existsSync(manifestPath)) continue;
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { throw new Error(`Bundled host adapter manifest is invalid: ${entry.name}.`); }
    if (manifest.kind !== 'host-adapter') continue;
    if (manifest.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(manifest.id || '') || manifest.id !== entry.name && manifest.id !== `arc.${entry.name}` || !String(manifest.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '') || !Array.isArray(manifest.nodes) || !manifest.nodes.length || !Array.isArray(manifest.permissions)) {
      throw new Error(`Bundled host adapter manifest is invalid: ${entry.name}.`);
    }
    const permissions = manifest.permissions.map((permission) => {
      if (!permission || !/^[a-z][a-z0-9.-]{1,63}$/.test(permission.id || '') || !String(permission.name || '').trim() || !String(permission.description || '').trim()) throw new Error(`Bundled host adapter ${manifest.id} declares an invalid permission.`);
      return { id: permission.id, name: String(permission.name).trim().slice(0, 100), description: String(permission.description).trim().slice(0, 400), ...(permission.required === true ? { required: true } : {}) };
    });
    if (new Set(permissions.map(({ id }) => id)).size !== permissions.length) throw new Error(`Bundled host adapter ${manifest.id} declares duplicate permissions.`);
    const nodeTypes = new Set();
    const nodes = manifest.nodes.map((node) => {
      if (!node || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(node.type || '') || nodeTypes.has(node.type) || !String(node.label || '').trim() || !Array.isArray(node.inputs) || !Array.isArray(node.outputs)) throw new Error(`Bundled host adapter ${manifest.id} has an invalid node definition.`);
      if (node.requiredPermission && !permissions.some((permission) => permission.id === node.requiredPermission)) throw new Error(`Bundled host adapter ${manifest.id} references an undeclared permission.`);
      nodeTypes.add(node.type);
      return { ...node, pluginAdapter: true, pluginId: manifest.id, hostAdapter: manifest.id };
    });
    const runtime = manifest.runtime;
    if (!runtime || typeof runtime.module !== 'string' || path.basename(runtime.module) !== runtime.module || !runtime.module.endsWith('.js') || typeof runtime.execute !== 'string' || !/^[$A-Z_a-z][$\w]*$/.test(runtime.execute) || !/^[a-f0-9]{64}$/i.test(runtime.sha256 || '') || runtime.closeProject !== undefined && (typeof runtime.closeProject !== 'string' || !/^[$A-Z_a-z][$\w]*$/.test(runtime.closeProject))) {
      throw new Error(`Bundled host adapter ${manifest.id} has an invalid runtime declaration.`);
    }
    const runtimePath = path.join(directory, runtime.module);
    if (!fs.existsSync(runtimePath) || !fs.statSync(runtimePath).isFile() || createHash('sha256').update(fs.readFileSync(runtimePath)).digest('hex') !== runtime.sha256.toLowerCase()) throw new Error(`Bundled host adapter ${manifest.id} runtime file is missing or has a digest mismatch.`);
    if (!Array.isArray(manifest.runtimeDependencies) || manifest.runtimeDependencies.length > 16 || manifest.runtimeDependencies.some((dependency) => typeof dependency !== 'string' || !/^(?:@[-\w.]+\/)?[-\w.]+$/.test(dependency))) throw new Error(`Bundled host adapter ${manifest.id} has an invalid runtime dependency list.`);
    const npmDependencies = validateNpmDependencies(manifest.npmDependencies, manifest.name);
    if (npmDependencies.some(({ name }) => manifest.runtimeDependencies.includes(name))) throw new Error(`Bundled host adapter ${manifest.id} lists a dependency as both ARC-provided and npm-installed.`);
    const settingsSchema = validatePluginSettingsSchema(manifest.settingsSchema);
    const plugin = {
      ...manifest,
      permissions,
      nodes,
      settingsSchema,
      tags: Array.isArray(manifest.tags) ? manifest.tags.map((tag) => String(tag).slice(0, 32)).slice(0, 12) : [],
      arcApiVersion: Number.isInteger(manifest.arcApiVersion) ? manifest.arcApiVersion : 1,
      repositoryUrl: manifest.repositoryUrl || DEFAULT_REPOSITORY_URL,
      sourceUrl: manifest.sourceUrl || `https://github.com/relentiousdragon/arc-plugins/tree/main/adapters/${entry.name}`,
      builtIn,
      directory
    };
    if (adapters.has(plugin.id)) throw new Error(`Duplicate bundled host adapter ID “${plugin.id}”.`);
    adapters.set(plugin.id, plugin);
  }
  return adapters;
}

function loadHostAdapterRuntime(plugin) {
  if (!hostAdapterRuntimePromises.has(plugin.id)) {
    const modulePath = path.join(plugin.directory, plugin.runtime.module);
    const promise = import(pathToFileURL(modulePath).href).catch((error) => {
      hostAdapterRuntimePromises.delete(plugin.id);
      throw new Error(`${plugin.name} runtime is unavailable: ${error.message || 'check the bundled adapter files.'}`);
    });
    hostAdapterRuntimePromises.set(plugin.id, promise);
  }
  return hostAdapterRuntimePromises.get(plugin.id);
}

function installedHostAdapter(pluginId) {
  return LOCAL_HOST_ADAPTERS.get(pluginId) || loadBundledHostAdapters(adapterRoot, { builtIn: false }).get(pluginId) || null;
}

function parseArcVersion(version) {
  const match = String(version || '').trim().replace(/^v/i, '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const prerelease = match[4] ? match[4].split('.') : null;
  if (prerelease?.some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))) return null;
  return { core: match.slice(1, 4).map((part) => BigInt(part)), prerelease };
}

function compareArcVersions(leftVersion, rightVersion) {
  const left = parseArcVersion(leftVersion);
  const right = parseArcVersion(rightVersion);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] > right.core[index] ? 1 : -1;
  }
  if (!left.prerelease && !right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const a = BigInt(leftPart); const b = BigInt(rightPart);
      if (a !== b) return a > b ? 1 : -1;
    } else if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    else if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizedMinimumVersion(version, pluginId = 'Plugin') {
  const minimum = version ?? LEGACY_MIN_ARC_VERSION;
  if (!parseArcVersion(minimum)) throw new Error(`${pluginId} needs a valid minArcStudioVersion (SemVer).`);
  return String(minimum).replace(/^v/i, '');
}

function declaredMinimumVersion(version, pluginId = 'Plugin') {
  if (typeof version !== 'string' || !version.trim()) throw new Error(`${pluginId} must declare minArcStudioVersion.`);
  return normalizedMinimumVersion(version, pluginId);
}

function assertArcStudioCompatible(pluginId, minimumVersion) {
  const required = normalizedMinimumVersion(minimumVersion, pluginId);
  const comparison = compareArcVersions(serverConfig.version, required);
  if (comparison === null) throw new Error(`Cannot check ${pluginId} compatibility because the ARC Studio version is invalid.`);
  if (comparison < 0) throw new Error(`${pluginId} requires ARC Studio ${required} or newer. This workspace is running ${serverConfig.version}.`);
  return required;
}

function studioCompatibility(minimumVersion, pluginName = 'Plugin') {
  const required = normalizedMinimumVersion(minimumVersion, pluginName);
  const comparison = compareArcVersions(serverConfig.version, required);
  return { minArcStudioVersion: required, studioCompatible: comparison !== null && comparison >= 0, studioVersion: serverConfig.version };
}

function validateAdapterManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== 'wasm-adapter' || manifest.adapterApiVersion !== 1) {
    throw new Error('Choose a compiled ARC WebAssembly adapter manifest using adapter API version 1.');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.wasmSha256 || '')) throw new Error('The adapter manifest must include the SHA-256 digest for adapter.wasm.');
  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(manifest.id || '') || !String(manifest.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version || '')) {
    throw new Error('The adapter needs a valid ID, name, and SemVer version.');
  }
  if (manifest.wasmArtifact !== 'adapter.wasm' || manifest.capabilities?.length || manifest.permissions?.length) throw new Error('WebAssembly adapters cannot request host permissions or capabilities.');
  if (!Array.isArray(manifest.nodes) || !manifest.nodes.length || manifest.nodes.length > 32) throw new Error('An adapter must define 1–32 nodes.');
  const nodeTypes = new Set();
  const validatePins = (pins, group) => {
    if (!Array.isArray(pins) || pins.length > 32) throw new Error(`Adapter ${group} must contain at most 32 pins.`);
    const ids = new Set();
    for (const pin of pins) {
      if (!pin || !/^[a-z][a-z0-9_]{0,47}$/.test(pin.id || '') || ids.has(pin.id) || !['string', 'number', 'boolean', 'exec'].includes(pin.type) || typeof pin.label !== 'string') throw new Error(`Adapter ${group} contains an invalid pin.`);
      if (pin.type === 'exec' && (pin.id !== 'exec' || (group === 'outputs' && pin.id !== 'exec'))) throw new Error('Execution pins must use the ID “exec”.');
      if (pin.type === 'exec' && pin.defaultValue !== undefined) throw new Error('Execution pins cannot have default values.');
      if (pin.defaultValue !== undefined && !['string', 'number', 'boolean'].includes(typeof pin.defaultValue)) throw new Error(`Adapter pin ${pin.id} has an invalid default value.`);
      ids.add(pin.id);
    }
    return pins.map((pin) => ({ id: pin.id, label: pin.label.slice(0, 80), type: pin.type, ...(pin.defaultValue !== undefined ? { defaultValue: pin.defaultValue } : {}), ...(['json', 'json-schema'].includes(pin.editor) && pin.type === 'string' ? { editor: pin.editor } : {}) }));
  };
  return {
    schemaVersion: 1,
    kind: 'wasm-adapter',
    id: manifest.id,
    name: String(manifest.name).trim().slice(0, 80),
    description: String(manifest.description || '').slice(0, 500),
    author: String(manifest.author || '').slice(0, 100),
    license: String(manifest.license || '').slice(0, 60),
    thirdPartyNotices: validateThirdPartyNotices(manifest.thirdPartyNotices),
    settingsSchema: validatePluginSettingsSchema(manifest.settingsSchema),
    version: manifest.version,
    minArcStudioVersion: declaredMinimumVersion(manifest.minArcStudioVersion, manifest.name || manifest.id),
    adapterApiVersion: 1,
    wasmArtifact: 'adapter.wasm',
    wasmSha256: manifest.wasmSha256.toLowerCase(),
    capabilities: [],
    limits: {
      inputBytes: Math.max(1, Math.min(1_048_576, Number(manifest.limits?.inputBytes) || 1_048_576)),
      outputBytes: Math.max(1024, Math.min(8_388_608, Number(manifest.limits?.outputBytes) || 5_242_880)),
      timeoutMs: Math.max(100, Math.min(10_000, Number(manifest.limits?.timeoutMs) || 5000))
    },
    nodes: manifest.nodes.map((node) => {
      if (!node || !/^[a-z0-9][a-z0-9.-]{1,95}$/.test(node.type || '')) throw new Error(`Adapter node type “${node?.type || '(missing)'}” must use lowercase letters, digits, dots, and hyphens.`);
      if (!node.type.startsWith(`${manifest.id}.`)) throw new Error(`Adapter node type “${node.type}” must start with “${manifest.id}.”.`);
      if (nodeTypes.has(node.type)) throw new Error(`Adapter node type “${node.type}” is duplicated.`);
      if (typeof node.label !== 'string' || !node.label.trim()) throw new Error(`Adapter node ${node.type} needs a label.`);
      nodeTypes.add(node.type);
      const inputs = validatePins(node.inputs, 'inputs');
      const outputs = validatePins(node.outputs, 'outputs');
      if (!inputs.some((pin) => pin.id === 'exec' && pin.type === 'exec') || !outputs.some((pin) => pin.id === 'exec' && pin.type === 'exec')) throw new Error(`Adapter node ${node.type} must have execution input and output pins.`);
      if (inputs.some((pin) => pin.type === 'exec' && pin.id !== 'exec') || outputs.some((pin) => pin.type === 'exec' && pin.id !== 'exec')) throw new Error('Adapter execution pins must be named “exec”.');
      return {
        type: node.type,
        label: node.label.trim().slice(0, 80),
        category: String(node.category || 'Plugins').slice(0, 48),
        description: String(node.description || '').slice(0, 300),
        color: /^#[0-9a-f]{6}$/i.test(node.color || '') ? node.color : '#36a981',
        inputs,
        outputs,
        pluginAdapter: true,
        pluginId: manifest.id
      };
    })
  };
}

function registerInstalledAdapters() {
  const definitions = [];
  const failedNodeTypes = new Set();
  const markFailed = (nodes = []) => {
    for (const node of nodes) if (typeof node?.type === 'string' && node.type.trim()) failedNodeTypes.add(node.type);
  };
  for (const plugin of Object.values(readInstalled())) {
    if (plugin.kind === 'host-adapter' && LOCAL_HOST_ADAPTERS.has(plugin.id)) {
      const bundled = LOCAL_HOST_ADAPTERS.get(plugin.id);
      try {
        assertArcStudioCompatible(plugin.name || plugin.id, plugin.minArcStudioVersion || bundled.minArcStudioVersion);
        definitions.push(...bundled.nodes);
      } catch { markFailed(plugin.nodes || bundled.nodes); }
      continue;
    }
    if (plugin.kind === 'host-adapter') {
      try {
        const adapter = installedHostAdapter(plugin.id);
        if (adapter) {
          assertArcStudioCompatible(adapter.name, adapter.minArcStudioVersion);
          definitions.push(...adapter.nodes);
        } else markFailed(plugin.nodes);
      } catch { markFailed(plugin.nodes); }
      continue;
    }
    if (plugin.kind !== 'wasm-adapter') continue;
    const manifestPath = path.join(adapterDirectory(plugin.id, plugin.version), 'arc-plugin.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const validated = validateAdapterManifest(manifest);
      assertArcStudioCompatible(validated.name, validated.minArcStudioVersion);
      definitions.push(...validated.nodes);
    } catch { markFailed(plugin.nodes); }
  }
  registerAdapterNodeDefinitions(definitions);
  registerFailedNodeTypes([...failedNodeTypes]);
}

registerInstalledAdapters();

function writeInstalled(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporary = `${installedPath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, installedPath);
}

function normalizePermissionGrant(pluginId, requested = [], permissionCatalog = null) {
  if (!Array.isArray(requested) || requested.length > 16) throw new Error('Plugin permissions must be a list of at most 16 capabilities.');
  const declaredPermissions = permissionCatalog || LOCAL_HOST_ADAPTERS.get(pluginId)?.permissions || readInstalled()[pluginId]?.permissions || [];
  const declared = new Set(declaredPermissions.map((permission) => permission.id));
  const granted = new Set();
  for (const permission of requested) {
    if (typeof permission !== 'string' || !declared.has(permission) || granted.has(permission)) throw new Error(`Plugin “${pluginId}” requested an unsupported permission.`);
    granted.add(permission);
  }
  return [...granted];
}

function readProjectPermissionFile(projectDir) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(projectDir, 'plugin-permissions.json'), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function writeProjectPermissionFile(projectDir, value) {
  fs.mkdirSync(projectDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(projectDir, 'plugin-permissions.json');
  const temporary = `${filePath}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function isDefaultRepository(repositoryUrl) {
  try { return normalizeRepositoryUrl(repositoryUrl).url === DEFAULT_REPOSITORY_URL; }
  catch { return false; }
}

async function readJson(url, maxBytes) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ARC-Studio-Plugin-Store' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status} while loading plugin data.`);
  const body = await readLimited(response, maxBytes);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new Error('GitHub returned invalid JSON for this plugin file.'); }
}

async function readLimited(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(`Plugin data exceeds the ${maxBytes.toLocaleString()} byte limit.`);
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body[Symbol.asyncIterator]();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.next();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.return?.();
      throw new Error(`Plugin data exceeds the ${maxBytes.toLocaleString()} byte limit.`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function validateRegistry(registry, defaultRepository) {
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.plugins) || registry.plugins.length > 500) {
    throw new Error('The plugin registry must use schema version 1 and contain at most 500 entries.');
  }
  const ids = new Set();
  return registry.plugins.map((entry) => {
    if (!entry || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(entry.id || '') || ids.has(entry.id)) throw new Error('The plugin registry contains an invalid or duplicate plugin ID.');
    const kind = entry.kind || 'graph-pack';
    if (!['graph-pack', 'host-adapter', 'wasm-adapter'].includes(kind) || (entry.capabilities !== undefined && (!Array.isArray(entry.capabilities) || entry.capabilities.length))) throw new Error(`Plugin ${entry.id} requests an unsupported host integration.`);
    if (kind === 'graph-pack' && entry.permissions?.length) throw new Error(`Function graph pack ${entry.id} cannot request host permissions.`);
    if (kind === 'host-adapter' && (!Array.isArray(entry.permissions) || !entry.permissions.length || entry.permissions.length > 16 || !/^[a-f0-9]{64}$/i.test(entry.runtimeSha256 || ''))) throw new Error(`Host adapter ${entry.id} must declare permissions and a runtime SHA-256 digest.`);
    if (kind === 'wasm-adapter' && ((entry.permissions?.length || 0) > 0 || !/^[a-f0-9]{64}$/i.test(entry.wasmSha256 || '') || !Array.isArray(entry.nodeTypes) || !entry.nodeTypes.length)) throw new Error(`WebAssembly adapter ${entry.id} must declare its module digest and node types and cannot request host permissions.`);
    const permissions = kind === 'host-adapter' ? entry.permissions.map((permission) => {
      if (!permission || !/^[a-z][a-z0-9.-]{1,63}$/.test(permission.id || '') || !String(permission.name || '').trim() || !String(permission.description || '').trim()) throw new Error(`Host adapter ${entry.id} declares an invalid permission.`);
      return { id: permission.id, name: String(permission.name).trim().slice(0, 100), description: String(permission.description).trim().slice(0, 400), ...(permission.required === true ? { required: true } : {}) };
    }) : [];
    if (new Set(permissions.map((permission) => permission.id)).size !== permissions.length) throw new Error(`Host adapter ${entry.id} declares duplicate permissions.`);
    const runtimeDependencies = kind === 'host-adapter' ? entry.runtimeDependencies : undefined;
    if (runtimeDependencies !== undefined && (!Array.isArray(runtimeDependencies) || runtimeDependencies.length > MAX_ADAPTER_DEPENDENCIES || runtimeDependencies.some((name) => typeof name !== 'string' || !/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)))) throw new Error(`Host adapter ${entry.id} has an invalid ARC runtime dependency list.`);
    const npmDependencies = kind === 'host-adapter' ? validateNpmDependencies(entry.npmDependencies, entry.id) : [];
    const dependencyLockSha256 = kind === 'host-adapter' ? String(entry.dependencyLockSha256 || '').toLowerCase() : '';
    const dependencyPackageCount = kind === 'host-adapter' ? Number(entry.dependencyPackageCount || 0) : 0;
    if (npmDependencies.length && (!/^[a-f0-9]{64}$/.test(dependencyLockSha256) || !Number.isInteger(dependencyPackageCount) || dependencyPackageCount < npmDependencies.length || dependencyPackageCount > MAX_ADAPTER_LOCK_PACKAGES)) throw new Error(`Host adapter ${entry.id} must pin its npm lockfile and dependency count.`);
    if (!npmDependencies.length && (dependencyLockSha256 || dependencyPackageCount)) throw new Error(`Host adapter ${entry.id} declares lockfile metadata without npm dependencies.`);
    ids.add(entry.id);
    if (!String(entry.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version || '')) throw new Error(`Plugin ${entry.id} needs a name and valid SemVer version.`);
    if (entry.arcApiVersion !== 1) throw new Error(`Plugin ${entry.id} requires an unsupported ARC plugin API version.`);
    if (!/^[a-f0-9]{40}$/i.test(entry.commit || '') || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) throw new Error(`Plugin ${entry.id} needs a full commit SHA and SHA-256 digest.`);
    const repository = normalizeRepositoryUrl(entry.repositoryUrl || entry.repository || defaultRepository.url);
    const hostAdapterPath = `adapters/${entry.id.startsWith('arc.') ? entry.id.slice(4) : entry.id}/arc-plugin.json`;
    const validPath = kind === 'graph-pack'
      ? typeof entry.path === 'string' && entry.path.startsWith(`packs/${entry.id}/`) && /^packs\/[a-z0-9.-]+\/[A-Za-z0-9._/-]+$/.test(entry.path)
      : entry.path === hostAdapterPath;
    if (!validPath || entry.path.split('/').some((part) => part === '.' || part === '..')) throw new Error(`Plugin ${entry.id} has an invalid artifact path.`);
    if (kind !== 'graph-pack' && (entry.nodeTypes.some((type) => typeof type !== 'string' || !type.startsWith(`${entry.id}.`)) || new Set(entry.nodeTypes).size !== entry.nodeTypes.length)) throw new Error(`Adapter ${entry.id} must publish unique, namespaced node types in the catalogue.`);
    return {
      id: entry.id,
      kind,
      name: String(entry.name).trim().slice(0, 80),
      version: entry.version,
      description: String(entry.description || '').slice(0, 500),
      author: String(entry.author || '').slice(0, 100),
      license: String(entry.license || '').slice(0, 60),
      thirdPartyNotices: validateThirdPartyNotices(entry.thirdPartyNotices),
      settingsSchema: validatePluginSettingsSchema(entry.settingsSchema),
      ...(kind === 'host-adapter' ? { permissions, nodeTypes: entry.nodeTypes, runtimeSha256: entry.runtimeSha256.toLowerCase(), ...(runtimeDependencies !== undefined ? { runtimeDependencies } : {}), npmDependencies, dependencyLockSha256, dependencyPackageCount } : {}),
      ...(kind === 'wasm-adapter' ? { nodeTypes: entry.nodeTypes, wasmSha256: entry.wasmSha256.toLowerCase() } : {}),
      minArcStudioVersion: declaredMinimumVersion(entry.minArcStudioVersion, entry.name || entry.id),
      tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string').slice(0, 12).map((tag) => tag.slice(0, 32)) : [],
      arcApiVersion: entry.arcApiVersion,
      commit: entry.commit.toLowerCase(),
      path: entry.path,
      sha256: entry.sha256.toLowerCase(),
      repositoryUrl: repository.url,
      sourceUrl: sourceFileUrl(repository, entry.commit, entry.path)
    };
  });
}

async function getRegistry(force = false) {
  const repository = readPluginSettings();
  const cached = registryCache.get(repository.url);
  if (!force && cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached.entries;
  if (registryRequests.has(repository.url)) return registryRequests.get(repository.url);
  const request = (async () => {
    const registry = await readJson(registryUrl(repository), MAX_REGISTRY_BYTES);
    const entries = validateRegistry(registry, repository);
    registryCache.set(repository.url, { entries, timestamp: Date.now() });
    return entries;
  })();
  registryRequests.set(repository.url, request);
  try { return await request; }
  finally { registryRequests.delete(repository.url); }
}

function stableGraphId(pluginId, functionId) {
  const digest = createHash('sha256').update(`${pluginId}:${functionId}`).digest('hex').slice(0, 24);
  return `plugin_fn_${digest}`;
}

function validatePack(pack, entry) {
  if ((Array.isArray(pack.permissions) && pack.permissions.length) || (Array.isArray(pack.capabilities) && pack.capabilities.length)) throw new Error('Function graph packs cannot request host permissions or capabilities.');
  if (pack?.schemaVersion !== 1 || pack.id !== entry.id || pack.version !== entry.version || pack.arcApiVersion !== 1) {
    throw new Error('The pack metadata does not match the registry or this ARC plugin API version.');
  }
  const packMinimum = declaredMinimumVersion(pack.minArcStudioVersion, pack.name || pack.id);
  if (packMinimum !== entry.minArcStudioVersion) throw new Error('The pack minimum ARC Studio version does not match the registry entry.');
  assertArcStudioCompatible(pack.name || pack.id, packMinimum);
  if (!Array.isArray(pack.functions) || !pack.functions.length || pack.functions.length > MAX_FUNCTIONS) throw new Error(`A pack must contain 1–${MAX_FUNCTIONS} functions.`);
  const functions = new Map();
  for (const item of pack.functions) {
    if (!item || !/^[a-z][a-z0-9-]{0,47}$/.test(item.id || '') || functions.has(item.id)) throw new Error('The pack contains an invalid or duplicate function ID.');
    if (!item.graph || item.graph.graphType !== 'function' || !Array.isArray(item.graph.nodes) || !Array.isArray(item.graph.connections)) throw new Error(`Function ${item.id} is not a valid Function graph.`);
    if (item.graph.nodes.length > MAX_NODES || item.graph.connections.length > MAX_CONNECTIONS) throw new Error(`Function ${item.id} exceeds the node or connection limit.`);
    functions.set(item.id, item);
  }
  const graphIds = new Map([...functions.keys()].map((id) => [id, stableGraphId(entry.id, id)]));
  const callGraph = new Map();
  for (const [functionId, item] of functions) {
    const graph = item.graph;
    const nodeIds = new Set();
    const nodesById = new Map();
    const parameterIds = new Set();
    let returnCount = 0;
    for (const node of graph.nodes) {
      if (!node || typeof node.id !== 'string' || node.id.length > 128 || nodeIds.has(node.id) || !allowedNode(node.type) || !NodeDefinitions[node.type]
        || !Number.isFinite(node.x) || !Number.isFinite(node.y) || Math.abs(node.x) > 100000 || Math.abs(node.y) > 100000
        || (node.label != null && typeof node.label !== 'string') || (node.data != null && (typeof node.data !== 'object' || Array.isArray(node.data)))) {
        throw new Error(`Function ${functionId} contains an unsupported node.`);
      }
      nodeIds.add(node.id);
      nodesById.set(node.id, node);
      if (node.type === 'function_input') {
        for (const argument of getFunctionInputArguments(node)) {
          if (typeof argument.paramId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(argument.paramId) || parameterIds.has(argument.paramId)) {
            throw new Error(`Function ${functionId} contains an invalid or duplicate input ID.`);
          }
          parameterIds.add(argument.paramId);
          if (!FUNCTION_ARGUMENT_VALUE_TYPES.includes(argument.valueType)) {
            throw new Error(`Function ${functionId} contains an unsupported function value type.`);
          }
        }
      }
      if (node.type === 'function_return') returnCount += 1;
      if (node.type === 'function_return' && !['string', 'number', 'boolean'].includes(node.data?.valueType || 'number')) {
        throw new Error(`Function ${functionId} contains an unsupported function value type.`);
      }
      if (node.type === 'function_call') {
        const calledId = node.data?.functionId || node.data?.graphId;
        if (!functions.has(calledId)) throw new Error(`Function ${functionId} calls a function outside this pack.`);
        node.data = { ...node.data, graphId: graphIds.get(calledId) };
        callGraph.set(functionId, [...(callGraph.get(functionId) || []), calledId]);
      }
    }
    if (returnCount !== 1) throw new Error(`Function ${functionId} must have exactly one Return Value node.`);
    for (const connection of graph.connections) {
      if (!nodeIds.has(connection?.sourceNodeId) || !nodeIds.has(connection?.targetNodeId)) throw new Error(`Function ${functionId} contains a connection to a missing node.`);
      if (typeof connection.sourcePinId !== 'string' || typeof connection.targetPinId !== 'string' || connection.sourcePinId === 'exec' || connection.targetPinId === 'exec') throw new Error(`Function ${functionId} contains an execution wire or invalid pin; graph packs only allow pure value connections.`);
      const source = nodesById.get(connection.sourceNodeId);
      const target = nodesById.get(connection.targetNodeId);
      const calledFunction = (node) => {
        if (node.type !== 'function_call') return null;
        return [...functions.entries()].find(([id]) => graphIds.get(id) === node.data?.graphId)?.[1] || null;
      };
      const pinFor = (node, direction) => {
        const called = calledFunction(node);
        if (node.type === 'function_input' && direction === 'outputs') {
          const argument = getFunctionInputArguments(node).find((item) => item.legacy ? connection.sourcePinId === 'value' : functionArgumentPinId(item) === connection.sourcePinId);
          if (argument) return { id: connection.sourcePinId, type: functionInputPinType(argument) };
        }
        if (node.type === 'function_return' && direction === 'inputs' && connection.targetPinId === 'value') return { id: 'value', type: node.data?.valueType || 'number' };
        if (node.type === 'function_call' && called) {
          if (direction === 'outputs' && connection.sourcePinId === 'result') {
            const result = called.graph.nodes.find((candidate) => candidate.type === 'function_return');
            return result ? { id: 'result', type: result.data?.valueType || 'number' } : null;
          }
          if (direction === 'inputs') {
            const argument = getFunctionGraphArguments(called.graph).find((candidate) => functionArgumentPinId(candidate) === connection.targetPinId);
            if (argument) return { id: connection.targetPinId, type: functionInputPinType(argument) };
          }
        }
        const definition = NodeDefinitions[node.type];
        let pins = definition[direction] || [];
        if (node.type === 'format_text' && direction === 'inputs') {
          const names = new Set([...String(node.data?.template || '').matchAll(/(?<!\\)\{\{\s*([\w.-]+)\s*\}\}/g)].map((match) => match[1]));
          pins = [...names].map((name) => {
            const argument = /^arg(\d+)$/i.exec(name);
            return argument ? { id: `arg_${argument[1]}`, type: 'arg' } : { id: `slot_${name}`, type: 'arg' };
          });
        }
        return pins.find((pin) => pin.id === (direction === 'outputs' ? connection.sourcePinId : connection.targetPinId)) || null;
      };
      const sourcePin = pinFor(source, 'outputs');
      const targetPin = pinFor(target, 'inputs');
      if (!sourcePin || !targetPin || (sourcePin.type !== targetPin.type && sourcePin.type !== 'arg' && targetPin.type !== 'arg')) throw new Error(`Function ${functionId} contains an invalid or mismatched value connection.`);
    }
  }
  const visit = (id, active = new Set(), visited = new Set()) => {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    for (const next of callGraph.get(id) || []) if (visit(next, active, visited)) return true;
    active.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of functions.keys()) if (visit(id)) throw new Error('Function packs cannot contain recursive calls.');
  return [...functions.entries()].map(([functionId, item]) => ({
    id: graphIds.get(functionId),
    name: String(item.name || functionId).trim().slice(0, 80),
    description: String(item.description || '').slice(0, 300),
    graph: {
      ...item.graph,
      id: graphIds.get(functionId),
      name: String(item.name || functionId).trim().slice(0, 80),
      graphType: 'function',
      nodes: item.graph.nodes,
      connections: item.graph.connections,
      variables: []
    }
  }));
}

function savePack(entry, pack, botManager, sourceType = 'catalog', { autoUpdate = true, installedBy = null } = {}) {
  const functions = validatePack(pack, entry);
  const installed = readInstalled();
  const previous = installed[entry.id];
  if (previous?.version === entry.version && (previous.sourceType || 'catalog') === sourceType && previous.repositoryUrl === (entry.repositoryUrl || null)) return { ...previous, alreadyInstalled: true };
  const previousGraphs = new Map((previous?.graphIds || []).map((id) => [id, botManager.graphs.get(id)]));
  const written = [];
  try {
    for (const item of functions) {
      botManager.saveGraph(item.id, { ...item.graph, pluginId: entry.id, pluginVersion: entry.version });
      written.push(item.id);
    }
    const record = {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      author: entry.author,
      license: entry.license,
      minArcStudioVersion: entry.minArcStudioVersion,
      thirdPartyNotices: entry.thirdPartyNotices || [],
      settingsSchema: validatePluginSettingsSchema(pack.settingsSchema || entry.settingsSchema),
      version: entry.version,
      sourceType,
      sourceTrust: sourceType === 'local' ? 'local' : isDefaultRepository(entry.repositoryUrl) ? 'default' : 'custom',
      sourceUrl: entry.sourceUrl || null,
      repositoryUrl: entry.repositoryUrl || null,
      autoUpdate: autoUpdate === true,
      installedAt: previous?.installedAt || new Date().toISOString(),
      installedBy: previous?.installedBy || installedBy || null,
      updatedAt: new Date().toISOString(),
      functions: functions.map(({ id, name, description }) => ({ id, name, description })),
      graphIds: [...new Set([...(previous?.graphIds || []), ...functions.map((item) => item.id)])]
    };
    installed[entry.id] = record;
    writeInstalled(installed);
    return record;
  } catch (error) {
    for (const graphId of written) {
      const previousGraph = previousGraphs.get(graphId);
      if (previousGraph) botManager.saveGraph(graphId, previousGraph);
      else botManager.deleteGraph(graphId);
    }
    throw error;
  }
}

async function installRegistryEntry(entry, botManager, { autoUpdate = true, projectDir = '', permissions = [], installedBy = null, hostCodeConfirmed = false } = {}) {
  assertArcStudioCompatible(entry.name, entry.minArcStudioVersion);
  const repository = normalizeRepositoryUrl(entry.repositoryUrl);
  const response = await fetch(artifactUrl(repository, entry.commit, entry.path), {
    headers: { Accept: 'application/json', 'User-Agent': 'ARC-Studio-Plugin-Store' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`${repository.provider === 'github' ? 'GitHub' : 'GitLab'} returned ${response.status} while downloading ${entry.name}.`);
  const bytes = await readLimited(response, MAX_PACK_BYTES);
  const digest = createHash('sha256').update(bytes).digest();
  const expected = Buffer.from(entry.sha256, 'hex');
  if (digest.length !== expected.length || !timingSafeEqual(digest, expected)) throw new Error('Plugin digest does not match the registry. The pack was not installed.');
  let pack;
  try { pack = JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Plugin pack is not valid JSON.'); }
  if (entry.kind === 'host-adapter') return installRemoteHostAdapter(entry, pack, repository, botManager, { projectDir, permissions, installedBy, hostCodeConfirmed });
  if (entry.kind === 'wasm-adapter') return installRemoteWasmAdapter(entry, pack, repository, { installedBy });
  return savePack(entry, pack, botManager, 'catalog', { autoUpdate });
}

async function installRemoteWasmAdapter(entry, manifestInput, repository, { installedBy = null } = {}) {
  const manifest = validateAdapterManifest(manifestInput);
  assertArcStudioCompatible(manifest.name, manifest.minArcStudioVersion);
  if (manifest.id !== entry.id || manifest.name !== entry.name || manifest.version !== entry.version || manifest.description !== entry.description || manifest.author !== entry.author || manifest.license !== entry.license || manifest.minArcStudioVersion !== entry.minArcStudioVersion || manifest.wasmSha256 !== entry.wasmSha256) {
    throw new Error('The downloaded WebAssembly adapter manifest does not match the reviewed catalog entry.');
  }
  const nodeTypes = manifest.nodes.map((node) => node.type).sort();
  if (JSON.stringify(nodeTypes) !== JSON.stringify(entry.nodeTypes.slice().sort())) throw new Error('The published catalogue node list does not match the pinned adapter manifest. Contact the plugin publisher.');
  if (stableJson(manifest.settingsSchema) !== stableJson(validatePluginSettingsSchema(entry.settingsSchema))) throw new Error('The published catalogue settings do not match the pinned adapter manifest. Contact the plugin publisher.');
  if (stableJson(manifest.thirdPartyNotices) !== stableJson(validateThirdPartyNotices(entry.thirdPartyNotices))) throw new Error('The published catalogue third-party notices do not match the pinned adapter manifest. Contact the plugin publisher.');

  const modulePath = `${path.posix.dirname(entry.path)}/${manifest.wasmArtifact}`;
  const response = await fetch(artifactUrl(repository, entry.commit, modulePath), {
    headers: { Accept: 'application/wasm, application/octet-stream', 'User-Agent': 'ARC-Studio-Plugin-Store' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`${repository.provider === 'github' ? 'GitHub' : 'GitLab'} returned ${response.status} while downloading ${entry.name} module.`);
  const bytes = await readLimited(response, 8 * 1024 * 1024);
  inspectAdapterBytes(bytes);
  const digest = createHash('sha256').update(bytes).digest();
  const expected = Buffer.from(entry.wasmSha256, 'hex');
  if (digest.length !== expected.length || !timingSafeEqual(digest, expected)) throw new Error('WebAssembly module digest does not match the reviewed catalog entry.');

  fs.mkdirSync(adapterRoot, { recursive: true, mode: 0o700 });
  const stageRoot = fs.mkdtempSync(path.join(adapterRoot, '.stage-'));
  const stagedDirectory = path.join(stageRoot, entry.id, entry.version);
  const destination = adapterDirectory(entry.id, entry.version);
  let backup = '';
  let originalInstalled = null;
  let installedWritten = false;
  try {
    fs.mkdirSync(stagedDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(stagedDirectory, 'arc-plugin.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(stagedDirectory, 'adapter.wasm'), bytes, { mode: 0o600 });
    if (fs.existsSync(destination)) {
      backup = `${destination}.backup-${randomUUID()}`;
      fs.renameSync(destination, backup);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.renameSync(stagedDirectory, destination);

    const installed = readInstalled();
    originalInstalled = structuredClone(installed);
    const previous = installed[entry.id];
    installed[entry.id] = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      thirdPartyNotices: manifest.thirdPartyNotices,
      settingsSchema: manifest.settingsSchema,
      version: manifest.version,
      minArcStudioVersion: manifest.minArcStudioVersion,
      kind: 'wasm-adapter',
      sourceType: 'catalog',
      sourceTrust: isDefaultRepository(repository.url) ? 'default' : 'custom',
      repositoryUrl: repository.url,
      sourceUrl: entry.sourceUrl,
      autoUpdate: false,
      manifestSha256: entry.sha256,
      sha256: entry.wasmSha256,
      adapterApiVersion: manifest.adapterApiVersion,
      nodes: manifest.nodes,
      installedAt: previous?.installedAt || new Date().toISOString(),
      installedBy: previous?.installedBy || installedBy || null,
      updatedAt: new Date().toISOString()
    };
    writeInstalled(installed);
    installedWritten = true;
    registerInstalledAdapters();
    if (backup) fs.rmSync(backup, { recursive: true, force: true });
    return installed[entry.id];
  } catch (error) {
    if (installedWritten && originalInstalled) writeInstalled(originalInstalled);
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
    if (backup && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

async function installRemoteHostAdapter(entry, manifest, repository, botManager, { projectDir = '', permissions = [], installedBy = null, hostCodeConfirmed = false } = {}) {
  if (!hostCodeConfirmed) throw new Error('Confirm that you understand this adapter runs JavaScript with the workspace server account’s OS permissions.');
  if (manifest?.kind !== 'host-adapter' || manifest.id !== entry.id || manifest.version !== entry.version || manifest.name !== entry.name) throw new Error('The downloaded adapter manifest does not match the reviewed catalogue entry.');
  if (declaredMinimumVersion(manifest.minArcStudioVersion, manifest.name) !== entry.minArcStudioVersion) throw new Error('The adapter ARC Studio version requirement changed since review. Refresh the catalogue.');
  const runtimeModule = manifest.runtime?.module;
  if (typeof runtimeModule !== 'string' || path.basename(runtimeModule) !== runtimeModule || !runtimeModule.endsWith('.js') || !/^[a-f0-9]{64}$/i.test(manifest.runtime?.sha256 || '') || manifest.runtime.sha256.toLowerCase() !== entry.runtimeSha256) throw new Error('The adapter runtime path or digest does not match the reviewed catalogue entry.');
  const runtimeDependencies = manifest.runtimeDependencies || [];
  if (!Array.isArray(runtimeDependencies) || runtimeDependencies.length > MAX_ADAPTER_DEPENDENCIES || runtimeDependencies.some((name) => typeof name !== 'string' || !/^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) || entry.runtimeDependencies && JSON.stringify([...runtimeDependencies].sort()) !== JSON.stringify([...entry.runtimeDependencies].sort())) throw new Error('The adapter ARC runtime dependencies changed since review. Refresh the catalogue.');
  const npmDependencies = validateNpmDependencies(manifest.npmDependencies, manifest.name);
  if (JSON.stringify(npmDependencies) !== JSON.stringify(entry.npmDependencies)) throw new Error('The adapter npm dependencies changed since review. Refresh the catalogue.');
  const normalizedPermissions = (manifest.permissions || []).map((permission) => ({ id: permission.id, name: String(permission.name).trim().slice(0, 100), description: String(permission.description).trim().slice(0, 400), ...(permission.required === true ? { required: true } : {}) }));
  if (JSON.stringify(normalizedPermissions) !== JSON.stringify(entry.permissions || []) || JSON.stringify((manifest.nodes || []).map((node) => node.type).sort()) !== JSON.stringify((entry.nodeTypes || []).slice().sort())) throw new Error('The adapter permissions or node list changed since review. Refresh the catalogue.');
  const permissionIds = new Set((manifest.permissions || []).map((permission) => permission.id));
  for (const node of manifest.nodes || []) {
    if (!node.type.startsWith(`${manifest.id}.`)) throw new Error(`Adapter node ${node.type} must be namespaced under ${manifest.id}.`);
    if (node.requiredPermission && !permissionIds.has(node.requiredPermission)) throw new Error(`Adapter node ${node.type} refers to an undeclared permission.`);
  }
  const granted = normalizePermissionGrant(entry.id, permissions, manifest.permissions);
  const runtimePath = `${path.posix.dirname(entry.path)}/${runtimeModule}`;
  const runtimeResponse = await fetch(artifactUrl(repository, entry.commit, runtimePath), {
    headers: { Accept: 'text/javascript', 'User-Agent': 'ARC-Studio-Plugin-Store' },
    signal: AbortSignal.timeout(10000),
    redirect: 'error'
  });
  if (!runtimeResponse.ok) throw new Error(`${repository.provider === 'github' ? 'GitHub' : 'GitLab'} returned ${runtimeResponse.status} while downloading ${entry.name} runtime.`);
  const runtimeBytes = await readLimited(runtimeResponse, 2 * 1024 * 1024);
  const runtimeDigest = createHash('sha256').update(runtimeBytes).digest('hex');
  const expectedRuntime = Buffer.from(entry.runtimeSha256, 'hex');
  const actualRuntime = Buffer.from(runtimeDigest, 'hex');
  if (actualRuntime.length !== expectedRuntime.length || !timingSafeEqual(actualRuntime, expectedRuntime)) throw new Error('Adapter runtime digest does not match the reviewed catalogue entry.');
  let dependencyLockBytes = null;
  if (npmDependencies.length) {
    const lockPath = `${path.posix.dirname(entry.path)}/package-lock.json`;
    const lockResponse = await fetch(artifactUrl(repository, entry.commit, lockPath), {
      headers: { Accept: 'application/json', 'User-Agent': 'ARC-Studio-Plugin-Store' },
      signal: AbortSignal.timeout(15000),
      redirect: 'error'
    });
    if (!lockResponse.ok) throw new Error(`${repository.provider === 'github' ? 'GitHub' : 'GitLab'} returned ${lockResponse.status} while downloading ${entry.name} dependency lockfile.`);
    dependencyLockBytes = await readLimited(lockResponse, MAX_ADAPTER_LOCK_BYTES);
    const digest = createHash('sha256').update(dependencyLockBytes).digest();
    const expected = Buffer.from(entry.dependencyLockSha256, 'hex');
    if (digest.length !== expected.length || !timingSafeEqual(digest, expected)) throw new Error('Adapter dependency lockfile digest does not match the reviewed catalogue entry.');
    const lockInfo = inspectNpmLock(dependencyLockBytes, npmDependencies, manifest.name);
    if (lockInfo.packageCount !== entry.dependencyPackageCount) throw new Error('The adapter dependency list changed since review. Refresh the catalogue.');
  }

  fs.mkdirSync(adapterRoot, { recursive: true });
  const stageRoot = fs.mkdtempSync(path.join(adapterRoot, '.stage-'));
  const stagedDirectory = path.join(stageRoot, entry.id);
  const destination = hostAdapterDirectory(entry.id);
  let backup = '';
  let originalInstalled = null;
  let originalProjectPermissions = null;
  let installedWritten = false;
  let projectPermissionsWritten = false;
  try {
    fs.mkdirSync(stagedDirectory, { recursive: true });
    fs.writeFileSync(path.join(stagedDirectory, 'arc-plugin.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(stagedDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module' }), { mode: 0o600 });
    fs.writeFileSync(path.join(stagedDirectory, runtimeModule), runtimeBytes, { mode: 0o600 });
    if (npmDependencies.length) {
      const installedPackageCount = await installNpmDependencies(stagedDirectory, stageRoot, npmDependencies, dependencyLockBytes, manifest.name);
      if (installedPackageCount !== entry.dependencyPackageCount) throw new Error('Installed dependency count differs from the reviewed package lock.');
    }
    if (runtimeDependencies.length) {
      const hostNodeModules = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../node_modules');
      const require = createRequire(path.join(hostNodeModules, 'arc-plugin-resolver.cjs'));
      const localNodeModules = path.join(stagedDirectory, 'node_modules');
      fs.mkdirSync(localNodeModules, { recursive: true });
      const npmNames = new Set(npmDependencies.map(({ name }) => name));
      for (const dependency of runtimeDependencies) {
        if (npmNames.has(dependency)) continue;
        try { require.resolve(dependency); }
        catch { throw new Error(`This adapter needs the ARC runtime dependency “${dependency}”, which is not available in this ARC Studio build.`); }
        const hostPackage = path.join(hostNodeModules, dependency);
        const localPackage = path.join(localNodeModules, dependency);
        if (!fs.statSync(hostPackage).isDirectory()) throw new Error(`ARC runtime dependency “${dependency}” is not a package directory.`);
        fs.mkdirSync(path.dirname(localPackage), { recursive: true });
        fs.symlinkSync(hostPackage, localPackage, process.platform === 'win32' ? 'junction' : 'dir');
      }
    }
    const definition = loadBundledHostAdapters(stageRoot, { builtIn: false }).get(entry.id);
    if (!definition || definition.nodes.length !== manifest.nodes.length) throw new Error('The downloaded host adapter did not pass manifest validation.');
    if (JSON.stringify(definition.settingsSchema) !== JSON.stringify(validatePluginSettingsSchema(entry.settingsSchema))) throw new Error('The adapter settings changed since review. Refresh the catalogue.');
    if (fs.existsSync(destination)) {
      backup = `${destination}.backup-${randomUUID()}`;
      fs.renameSync(destination, backup);
    }
    fs.renameSync(stagedDirectory, destination);
    const installed = readInstalled();
    originalInstalled = structuredClone(installed);
    const previous = installed[entry.id];
    const preserveInstallationId = previous?.kind === 'host-adapter'
      && previous.version === definition.version
      && previous.repositoryUrl === repository.url
      && previous.sha256 === entry.sha256
      && previous.runtimeSha256 === entry.runtimeSha256;
    installed[entry.id] = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      author: definition.author,
      license: definition.license,
      version: definition.version,
      minArcStudioVersion: definition.minArcStudioVersion,
      kind: 'host-adapter',
      sourceType: 'catalog',
      sourceTrust: isDefaultRepository(repository.url) ? 'default' : 'custom',
      sourceUrl: entry.sourceUrl,
      repositoryUrl: repository.url,
      sha256: entry.sha256,
      runtimeSha256: entry.runtimeSha256,
      runtimeDependencies,
      npmDependencies,
      dependencyLockSha256: entry.dependencyLockSha256 || '',
      dependencyPackageCount: entry.dependencyPackageCount || 0,
      thirdPartyNotices: definition.thirdPartyNotices,
      autoUpdate: false,
      settingsSchema: definition.settingsSchema,
      nodes: definition.nodes.map(({ type, label, category, description, color, inputs, outputs, requiredPermission }) => ({ type, label, category, description, color, inputs, outputs, ...(requiredPermission ? { requiredPermission } : {}) })),
      permissions: definition.permissions,
      installationId: preserveInstallationId ? previous.installationId : randomUUID(),
      installedAt: previous?.installedAt || new Date().toISOString(),
      installedBy: previous?.installedBy || installedBy || null,
      updatedAt: new Date().toISOString()
    };
    writeInstalled(installed);
    installedWritten = true;
    hostAdapterRuntimePromises.delete(entry.id);
    registerInstalledAdapters();
    if (projectDir) {
      const projectPermissions = readProjectPermissionFile(projectDir);
      originalProjectPermissions = structuredClone(projectPermissions);
      projectPermissions[entry.id] = { installationId: installed[entry.id].installationId, granted, updatedAt: new Date().toISOString() };
      writeProjectPermissionFile(projectDir, projectPermissions);
      projectPermissionsWritten = true;
    }
    if (backup) fs.rmSync(backup, { recursive: true, force: true });
    return installed[entry.id];
  } catch (error) {
    if (installedWritten && originalInstalled) writeInstalled(originalInstalled);
    if (projectPermissionsWritten && originalProjectPermissions) writeProjectPermissionFile(projectDir, originalProjectPermissions);
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
    if (backup && fs.existsSync(backup)) fs.renameSync(backup, destination);
    throw error;
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

export class PluginStore {
  static repository() {
    return readPluginSettings();
  }

  static setRepository(value) {
    const repository = normalizeRepositoryUrl(value);
    writePluginSettings(repository);
    registryCache.delete(repository.url);
    return repository;
  }

  static async catalog() {
    const installed = readInstalled();
    let entries = [];
    try { entries = await getRegistry(); } catch { /* */ }
    return [...[...LOCAL_HOST_ADAPTERS.values()].map(({ directory: _directory, runtime: _runtime, ...plugin }) => ({ ...plugin, ...studioCompatibility(plugin.minArcStudioVersion, plugin.name), sourceTrust: 'local', sourceLabel: 'Local development checkout', installedVersion: installed[plugin.id]?.version || null, updateAvailable: false })), ...entries.filter((entry) => !LOCAL_HOST_ADAPTERS.has(entry.id)).map(({ path: _path, ...plugin }) => ({
      ...plugin,
      ...studioCompatibility(plugin.minArcStudioVersion, plugin.name),
      sourceTrust: isDefaultRepository(plugin.repositoryUrl) ? 'default' : 'custom',
      sourceLabel: isDefaultRepository(plugin.repositoryUrl) ? 'Default ARC plugin source' : 'External plugin source',
      installedVersion: installed[plugin.id]?.version || null,
      updateAvailable: Boolean(installed[plugin.id] && compareArcVersions(plugin.version, installed[plugin.id].version) === 1)
    }))];
  }

  static projectPermissions(projectDir, pluginId) {
    const plugin = readInstalled()[pluginId];
    if (!projectDir || !plugin?.installationId) return [];
    const stored = readProjectPermissionFile(projectDir)[pluginId];
    if (stored?.installationId !== plugin.installationId || !Array.isArray(stored.granted)) return [];
    try { return normalizePermissionGrant(pluginId, stored.granted); }
    catch { return []; }
  }

  static setProjectPermissions(projectDir, pluginId, requested) {
    if (!projectDir) throw new Error('The active project is unavailable.');
    const installed = readInstalled()[pluginId];
    if (!installed) throw new Error('Install this plugin before granting project permissions.');
    const granted = normalizePermissionGrant(pluginId, requested);
    const permissions = readProjectPermissionFile(projectDir);
    permissions[pluginId] = { installationId: installed.installationId, granted, updatedAt: new Date().toISOString() };
    writeProjectPermissionFile(projectDir, permissions);
    return granted;
  }

  static installed() {
    registerInstalledAdapters();
    const installed = readInstalled();
    let changed = false;
    for (const plugin of Object.values(installed)) {
      if (plugin.kind !== 'wasm-adapter') continue;
      try {
        const manifest = validateAdapterManifest(JSON.parse(fs.readFileSync(path.join(adapterDirectory(plugin.id, plugin.version), 'arc-plugin.json'), 'utf8')));
        if (JSON.stringify(plugin.thirdPartyNotices || []) !== JSON.stringify(manifest.thirdPartyNotices || [])) {
          plugin.thirdPartyNotices = manifest.thirdPartyNotices || [];
          changed = true;
        }
      } catch { /* */ }
    }
    if (changed) writeInstalled(installed);
    return Object.values(installed).map((plugin) => ({ ...plugin, ...studioCompatibility(plugin.minArcStudioVersion, plugin.name || plugin.id) }));
  }

  static exportAdapters(graphs = []) {
    const usedTypes = new Set((graphs || []).flatMap((graph) => (graph.nodes || []).map((node) => node?.type).filter((type) => typeof type === 'string')));
    registerInstalledAdapters();
    const installed = readInstalled();
    const adapters = [];
    for (const plugin of Object.values(installed)) {
      const pluginTypes = new Set((plugin.nodes || []).map((node) => node.type));
      const usedPluginTypes = [...pluginTypes].filter((type) => usedTypes.has(type));
      if (!usedPluginTypes.length) continue;
      if (plugin.kind === 'wasm-adapter') {
        const directory = adapterDirectory(plugin.id, plugin.version);
        const manifest = validateAdapterManifest(JSON.parse(fs.readFileSync(path.join(directory, 'arc-plugin.json'), 'utf8')));
        adapters.push({ kind: 'wasm-adapter', manifest, directory, nodeTypes: usedPluginTypes });
        continue;
      }
      if (plugin.kind !== 'host-adapter') throw new Error(`The bot export does not yet include executable files for ${plugin.name || plugin.id}.`);
      const definition = installedHostAdapter(plugin.id);
      if (!definition) throw new Error(`${plugin.name || plugin.id} is not available in this workspace.`);
      if (!definition.export || !definition.runtime) throw new Error(`${plugin.name || plugin.id} does not declare bot export support.`);
      adapters.push({ kind: 'host-adapter', manifest: definition, directory: definition.directory, nodeTypes: usedPluginTypes });
    }
    const missingTypes = [...usedTypes].filter((type) => !NodeDefinitions[type] && ![...installed.values()].some((plugin) => plugin.nodes?.some((node) => node.type === type)));
    if (missingTypes.length) throw new Error(`The bot export contains nodes from unavailable plugins: ${missingTypes.slice(0, 5).join(', ')}.`);
    return adapters;
  }

  static importLocalAdapter(manifestInput, wasmInput, { autoUpdate = true, installedBy = null } = {}) {
    const manifest = validateAdapterManifest(manifestInput);
    assertArcStudioCompatible(manifest.name, manifest.minArcStudioVersion);
    if (LOCAL_HOST_ADAPTERS.has(manifest.id)) throw new Error(`Plugin ID “${manifest.id}” is reserved by a local host adapter checkout.`);
    let bytes;
    try { bytes = Buffer.isBuffer(wasmInput) ? wasmInput : Buffer.from(String(wasmInput || ''), 'base64'); }
    catch { throw new Error('Adapter WebAssembly file is not valid base64.'); }
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Adapter module must be between 1 byte and 8 MiB.');
    const directory = adapterDirectory(manifest.id, manifest.version);
    inspectAdapterBytes(bytes);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== manifest.wasmSha256) throw new Error('The adapter.wasm digest does not match arc-plugin.json.');
    fs.mkdirSync(directory, { recursive: true });
    const modulePath = path.join(directory, 'adapter.wasm');
    const manifestPath = path.join(directory, 'arc-plugin.json');
    const moduleTemp = `${modulePath}.tmp`;
    const manifestTemp = `${manifestPath}.tmp`;
    fs.writeFileSync(moduleTemp, bytes, { mode: 0o600 });
    fs.writeFileSync(manifestTemp, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    fs.renameSync(moduleTemp, modulePath);
    fs.renameSync(manifestTemp, manifestPath);
    const installed = readInstalled();
    const previous = installed[manifest.id];
    installed[manifest.id] = {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      license: manifest.license,
      thirdPartyNotices: manifest.thirdPartyNotices,
      settingsSchema: manifest.settingsSchema,
      version: manifest.version,
      minArcStudioVersion: manifest.minArcStudioVersion,
      kind: 'wasm-adapter',
      sourceType: 'local',
      sourceTrust: 'local',
      repositoryUrl: manifest.repositoryUrl || null,
      autoUpdate: autoUpdate === true,
      sha256: digest,
      adapterApiVersion: manifest.adapterApiVersion,
      nodes: manifest.nodes,
      installedAt: previous?.installedAt || new Date().toISOString(),
      installedBy: previous?.installedBy || installedBy || null,
      updatedAt: new Date().toISOString()
    };
    try { writeInstalled(installed); }
    catch (error) {
      fs.rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    registerInstalledAdapters();
    return installed[manifest.id];
  }

  static async executeAdapter(nodeType, inputs, { projectDir = '' } = {}) {
    const plugin = Object.values(readInstalled()).find((item) => item.kind === 'wasm-adapter' && item.nodes?.some((node) => node.type === nodeType));
    const hostPlugin = Object.values(readInstalled()).find((item) => item.kind === 'host-adapter' && item.nodes?.some((node) => node.type === nodeType));
    if (hostPlugin) {
      const bundled = installedHostAdapter(hostPlugin.id);
      if (!bundled) throw new Error(`Host adapter “${hostPlugin.id}” is not installed correctly.`);
      assertArcStudioCompatible(hostPlugin.name, hostPlugin.minArcStudioVersion || bundled.minArcStudioVersion);
      if (!projectDir) throw new Error('Project plugin settings are unavailable for this run.');
      const node = bundled.nodes.find((item) => item.type === nodeType);
      const requiredPermission = node?.requiredPermission || node?.permission;
      if (requiredPermission && !this.projectPermissions(projectDir, bundled.id).includes(requiredPermission)) {
        const permission = PROJECT_PERMISSION_DEFINITIONS.get(requiredPermission);
        throw new Error(`${bundled.name} permission required: ${permission?.name || requiredPermission}. Ask the project owner to grant it in Plugin Store.`);
      }
      const settings = this.readProjectSettings(projectDir, bundled.id, bundled.settingsSchema, true);
      settings.__projectDir = projectDir;
      const runtime = await loadHostAdapterRuntime(bundled);
      const execute = runtime[bundled.runtime.execute];
      if (typeof execute !== 'function') throw new Error(`${bundled.name} runtime does not implement its declared execution function.`);
      return execute(nodeType, inputs, settings);
    }
    if (!plugin) throw new Error(`Adapter for node “${nodeType}” is not installed.`);
    const manifest = validateAdapterManifest(JSON.parse(fs.readFileSync(path.join(adapterDirectory(plugin.id, plugin.version), 'arc-plugin.json'), 'utf8')));
    assertArcStudioCompatible(manifest.name, manifest.minArcStudioVersion);
    const node = manifest.nodes.find((item) => item.type === nodeType);
    const safeInputs = {};
    for (const pin of node.inputs) {
      if (pin.type === 'exec') continue;
      let value = inputs?.[pin.id] ?? pin.defaultValue;
      if (pin.type === 'string') {
        value = String(value ?? '');
        if (Buffer.byteLength(value, 'utf8') > manifest.limits.inputBytes) throw new Error(`Input “${pin.label}” exceeds the adapter's ${manifest.limits.inputBytes.toLocaleString()} byte limit.`);
      } else if (pin.type === 'number') {
        value = Number(value);
        if (!Number.isFinite(value)) throw new Error(`Input “${pin.label}” must be a finite number.`);
      } else if (pin.type === 'boolean') value = Boolean(value);
      safeInputs[pin.id] = value;
    }
    if (Buffer.byteLength(JSON.stringify(safeInputs), 'utf8') > 1_048_576) throw new Error('Combined adapter inputs exceed the 1 MiB request limit.');
    const modulePath = path.join(adapterDirectory(plugin.id, plugin.version), 'adapter.wasm');
    const moduleStat = fs.statSync(modulePath);
    if (!moduleStat.isFile() || moduleStat.size > 8 * 1024 * 1024) throw new Error(`Adapter “${plugin.name || plugin.id}” has an invalid or oversized installed module.`);
    const moduleDigest = createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex');
    if (moduleDigest !== manifest.wasmSha256) throw new Error(`Adapter “${plugin.name || plugin.id}” failed its installed module integrity check.`);
    const result = await runWasmAdapter(modulePath, safeInputs, manifest.limits);
    const outputs = {};
    for (const pin of node.outputs) {
      if (pin.type === 'exec') continue;
      const value = result[pin.id];
      if (value === undefined) continue;
      if (pin.type === 'string' && typeof value !== 'string') throw new Error(`Adapter returned a non-text value for output “${pin.label}”.`);
      if (pin.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Adapter returned an invalid number for output “${pin.label}”.`);
      if (pin.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Adapter returned an invalid boolean for output “${pin.label}”.`);
      if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > manifest.limits.outputBytes) throw new Error(`Output “${pin.label}” exceeds the adapter's ${manifest.limits.outputBytes.toLocaleString()} byte limit.`);
      outputs[pin.id] = value;
    }
    return outputs;
  }

  static async install(pluginId, botManager, { autoUpdate = true, installedBy = null, projectDir = '', permissions = [], expectedVersion = '', expectedSha256 = '', expectedRepositoryUrl = '', hostCodeConfirmed = false, ownerApprovedHostCode = false } = {}) {
    if (LOCAL_HOST_ADAPTERS.has(pluginId)) {
      if (hostCodeConfirmed !== true || ownerApprovedHostCode !== true) throw new Error('Review and accept the host runtime warning before installing this adapter.');
      const definition = LOCAL_HOST_ADAPTERS.get(pluginId);
      assertArcStudioCompatible(definition.name, definition.minArcStudioVersion);
      if (expectedVersion && expectedVersion !== definition.version) throw new Error('The plugin changed since review. Refresh the catalogue and review its permissions again.');
      const granted = normalizePermissionGrant(pluginId, permissions);
      const installed = readInstalled();
      const previous = installed[pluginId];
      installed[pluginId] = {
        id: pluginId, name: definition.name, description: definition.description, author: definition.author,
        license: definition.license, version: definition.version, minArcStudioVersion: definition.minArcStudioVersion, kind: 'host-adapter', sourceType: 'local', sourceTrust: 'local', repositoryUrl: definition.repositoryUrl,
        thirdPartyNotices: definition.thirdPartyNotices || [], autoUpdate: false, settingsSchema: validatePluginSettingsSchema(definition.settingsSchema),
        nodes: definition.nodes.map(({ type, label, category, description, color, inputs, outputs, requiredPermission }) => ({ type, label, category, description, color, inputs, outputs, ...(requiredPermission ? { requiredPermission } : {}) })),
        permissions: definition.permissions,
        installationId: previous?.installationId || randomUUID(),
        installedAt: previous?.installedAt || new Date().toISOString(), installedBy: previous?.installedBy || installedBy || null,
        updatedAt: new Date().toISOString()
      };
      writeInstalled(installed);
      this.setProjectPermissions(projectDir, pluginId, granted);
      registerInstalledAdapters();
      return installed[pluginId];
    }
    const entry = (await getRegistry()).find((plugin) => plugin.id === pluginId);
    if (!entry) throw new Error('Plugin is not listed in the ARC plugin registry.');
    assertArcStudioCompatible(entry.name, entry.minArcStudioVersion);
    if (entry.kind !== 'host-adapter' && permissions.length) throw new Error('This plugin does not support privileged host permissions.');
    if (expectedVersion && expectedVersion !== entry.version || expectedSha256 && expectedSha256 !== entry.sha256 || expectedRepositoryUrl && expectedRepositoryUrl !== entry.repositoryUrl) {
      throw new Error('The plugin changed since review. Refresh the catalogue and review it again.');
    }
    if (entry.kind === 'host-adapter' && ownerApprovedHostCode !== true) throw new Error('Only the project owner or a workspace admin can install server runtime code.');
    if (entry.kind === 'host-adapter' && hostCodeConfirmed !== true) throw new Error('Review and accept the host runtime warning before installing this adapter.');
    const plugin = await installRegistryEntry(entry, botManager, {
      autoUpdate: ['host-adapter', 'wasm-adapter'].includes(entry.kind) ? false : autoUpdate,
      projectDir,
      permissions,
      installedBy,
      hostCodeConfirmed
    });
    if (!plugin.installedBy && installedBy) {
      const installed = readInstalled();
      installed[pluginId] = { ...installed[pluginId], installedBy };
      writeInstalled(installed);
      return installed[pluginId];
    }
    return plugin;
  }

  static async autoUpdate(botManager) {
    const [entries, installed] = await Promise.all([getRegistry(), Promise.resolve(readInstalled())]);
    const updates = [];
    const errors = [];
    for (const plugin of Object.values(installed)) {
      if (!plugin.autoUpdate || plugin.kind === 'wasm-adapter' || plugin.kind === 'host-adapter') continue;
      const entry = entries.find((item) => item.id === plugin.id);
      if (!entry || compareArcVersions(entry.version, plugin.version) !== 1 || entry.repositoryUrl !== plugin.repositoryUrl) continue;
      try { updates.push(await installRegistryEntry(entry, botManager, { autoUpdate: true })); }
      catch (error) { errors.push({ id: plugin.id, message: error.message || 'Could not auto-update plugin.' }); }
    }
    return { updated: updates, errors, installed: this.installed() };
  }

  static importLocal(pack, botManager, { autoUpdate = true, installedBy = null } = {}) {
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw new Error('Choose a valid ARC plugin manifest.');
    const serialized = JSON.stringify(pack);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PACK_BYTES) throw new Error('Local pack exceeds the 1 MiB size limit.');
    const entry = {
      id: pack.id,
      name: pack.name,
      description: pack.description || '',
      author: pack.author || '',
      license: pack.license || '',
      minArcStudioVersion: declaredMinimumVersion(pack.minArcStudioVersion, pack.name || pack.id),
      settingsSchema: validatePluginSettingsSchema(pack.settingsSchema),
      version: pack.version,
      arcApiVersion: pack.arcApiVersion,
      sourceUrl: null,
      repositoryUrl: normalizeRepositoryUrl(pack.repositoryUrl || readPluginSettings().url).url
    };
    if (LOCAL_HOST_ADAPTERS.has(entry.id)) throw new Error(`Plugin ID “${entry.id}” is reserved by a local host adapter checkout.`);
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(entry.id || '') || !String(entry.name || '').trim() || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(entry.version || '')) {
      throw new Error('Local pack needs a valid ID, name, and SemVer version.');
    }
    return savePack(entry, pack, botManager, 'local', { autoUpdate, installedBy });
  }

  static uninstall(pluginId, botManager) {
    const installed = readInstalled();
    const record = installed[pluginId];
    if (!record) throw new Error('Plugin is not installed.');
    if (record.kind === 'wasm-adapter' || record.kind === 'host-adapter') {
      const types = new Set((record.nodes || []).map((node) => node.type));
      const refs = botManager.getGraphs().flatMap((graph) => (graph.nodes || []).filter((node) => types.has(node.type)).map((node) => graph.name || graph.id));
      if (refs.length) throw new Error(`This adapter is used by ${refs.slice(0, 4).join(', ')}. Remove those nodes before uninstalling.`);
      delete installed[pluginId];
      writeInstalled(installed);
      fs.rmSync(path.join(adapterRoot, pluginId), { recursive: true, force: true });
      registerInstalledAdapters();
      return true;
    }
    const graphIds = new Set(record.graphIds || []);
    const refs = [];
    for (const graph of botManager.getGraphs()) {
      if (graphIds.has(graph.id)) continue;
      if ((graph.nodes || []).some((node) => node.type === 'function_call' && graphIds.has(node.data?.graphId))) refs.push(graph.name || graph.id);
    }
    if (refs.length) throw new Error(`This pack is used by ${refs.slice(0, 4).join(', ')}. Remove those calls before uninstalling.`);
    for (const graphId of graphIds) botManager.deleteGraph(graphId);
    delete installed[pluginId];
    writeInstalled(installed);
    return true;
  }

  static settingsSchema(pluginId) {
    return LOCAL_HOST_ADAPTERS.get(pluginId)?.settingsSchema || readInstalled()[pluginId]?.settingsSchema || [];
  }

  static readProjectSettings(projectDir, pluginId, schema = this.settingsSchema(pluginId), revealSecrets = false) {
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(path.join(projectDir, 'plugin-settings.json'), 'utf8'))?.[pluginId] || {}; } catch {}
    const values = {};
    for (const field of schema) {
      const value = saved[field.id];
      if (field.secret) {
        values[field.id] = revealSecrets && CryptoEngine.isEncrypted(value) ? CryptoEngine.decrypt(value, null, projectSettingAad(projectDir, pluginId, field.id)) : '';
        values[`${field.id}Configured`] = Boolean(CryptoEngine.isEncrypted(value));
      } else if (value !== undefined) values[field.id] = value;
      else if (field.defaultValue !== undefined) values[field.id] = field.defaultValue;
    }
    return values;
  }

  static publicProjectSettings(projectDir, pluginId) {
    const schema = this.settingsSchema(pluginId);
    const values = this.readProjectSettings(projectDir, pluginId, schema, false);
    for (const field of schema) if (field.secret) delete values[field.id];
    return { schema, values };
  }

  static saveProjectSettings(projectDir, pluginId, input) {
    const schema = this.settingsSchema(pluginId);
    if (!schema.length) throw new Error('This plugin has no project settings.');
    const filePath = path.join(projectDir, 'plugin-settings.json');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {}; } catch {}
    const current = saved[pluginId] || {};
    const next = { ...current };
    for (const field of schema) {
      let value = input?.[field.id];
      if (field.secret) {
        if (value === undefined || value === '') continue;
        value = String(value);
        if (value.length > 4096) throw new Error(`${field.label} is too long.`);
        next[field.id] = CryptoEngine.encrypt(value, null, projectSettingAad(projectDir, pluginId, field.id));
      } else if (field.type === 'boolean') next[field.id] = Boolean(value);
      else if (field.type === 'number') {
        if (value === '' || value === undefined) value = field.defaultValue ?? field.min ?? 0;
        value = Number(value);
        if (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) throw new Error(`${field.label} is outside its allowed range.`);
        next[field.id] = value;
      } else {
        value = String(value ?? field.defaultValue ?? '').trim();
        if (field.required && !value) throw new Error(`${field.label} is required.`);
        if (value.length > 512) throw new Error(`${field.label} is too long.`);
        next[field.id] = value;
      }
    }
    for (const fieldId of Array.isArray(input?.clearSecrets) ? input.clearSecrets : []) {
      if (!schema.some((field) => field.id === fieldId && field.secret)) throw new Error('Unknown plugin secret field.');
      delete next[fieldId];
    }
    saved[pluginId] = next;
    fs.mkdirSync(projectDir, { recursive: true, mode: 0o700 });
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(saved, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, filePath);
    const bundled = LOCAL_HOST_ADAPTERS.get(pluginId);
    if (bundled?.runtime.closeProject) void loadHostAdapterRuntime(bundled).then((runtime) => runtime[bundled.runtime.closeProject]?.(projectDir)).catch(() => {});
    return this.publicProjectSettings(projectDir, pluginId);
  }
}

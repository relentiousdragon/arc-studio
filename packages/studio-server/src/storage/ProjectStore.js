import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { dataDir } from '../storage.js';
import { serverConfig } from '../config.js';
import { getStarterProject } from './StarterProjects.js';
import { compareArcStudioVersions, currentArcStudioVersion, projectVersionAge } from '../versioning/arcProjectCompatibility.js';
import { withIntegrity, verifyIntegrity } from './Integrity.js';

const registryPath = path.join(dataDir, 'projects.json');
const projectRoot = path.join(dataDir, 'projects');
const projectFiles = ['graphs.json', 'graph-library.json', 'bot-config.json', 'statistics.json', 'embeds.json', 'project-variables.json'];
const DEFAULT_MAX_PROJECTS = 10;
const PROJECT_EXPORT_KDF = Object.freeze({ N: 32768, r: 8, p: 1 });
const PROJECT_EXPORT_AAD = 'arc-studio-encrypted-project-v1';
//
function normalizeExportPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new TypeError('Use an export password between 12 and 1,024 characters.');
  return password;
}

function encryptProjectBundle(bundle, password) {
  normalizeExportPassword(password);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { ...PROJECT_EXPORT_KDF, maxmem: 128 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(PROJECT_EXPORT_AAD));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(bundle), 'utf8'), cipher.final()]);
  return {
    format: 'arc-project-encrypted', version: 1, cipher: 'aes-256-gcm', kdf: 'scrypt', ...PROJECT_EXPORT_KDF,
    salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64')
  };
}

function decryptProjectBundle(envelope, password) {
  normalizeExportPassword(password);
  if (!envelope || envelope.format !== 'arc-project-encrypted' || envelope.version !== 1 || envelope.cipher !== 'aes-256-gcm'
    || envelope.kdf !== 'scrypt' || envelope.N !== PROJECT_EXPORT_KDF.N || envelope.r !== PROJECT_EXPORT_KDF.r || envelope.p !== PROJECT_EXPORT_KDF.p) {
    throw new TypeError('This encrypted project format is not supported.');
  }
  try {
    const salt = Buffer.from(envelope.salt, 'base64');
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const data = Buffer.from(envelope.data, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || data.length > 128 * 1024 * 1024) throw new Error('Invalid encrypted project data.');
    const key = scryptSync(password, salt, 32, { ...PROJECT_EXPORT_KDF, maxmem: 128 * 1024 * 1024 });
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(PROJECT_EXPORT_AAD));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    const bundle = JSON.parse(plaintext);
    if (!bundle || bundle.format !== 'arc-project') throw new Error('Invalid project payload.');
    return bundle;
  } catch {
    throw new Error('The password is incorrect or the encrypted project file is damaged.');
  }
}

function cleanName(value) {
  const name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
  if (!name) throw new TypeError('Enter a project name.');
  return name;
}

function normalizedName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function writeStarterFiles(destination, starter) {
  const files = starter?.files;
  if (!files || typeof files !== 'object') throw new TypeError('The selected project starter is invalid.');
  const temporaryFiles = [];
  try {
    for (const filename of projectFiles) {
      const fallback = filename === 'graphs.json'
        ? { graphs: [], deletedIds: [] }
        : filename === 'graph-library.json'
          ? { defaultGraphId: '', templates: [], snapshots: [] }
          : filename === 'embeds.json' || filename === 'project-variables.json' ? [] : {};
      const value = Object.hasOwn(files, filename) ? structuredClone(files[filename]) : fallback;
      const temporaryPath = path.join(destination, `.${filename}.tmp`);
      fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
      temporaryFiles.push([temporaryPath, path.join(destination, filename)]);
    }
    for (const [temporaryPath, targetPath] of temporaryFiles) fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    for (const [temporaryPath] of temporaryFiles) {
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    }
    throw error;
  }
}

export class ProjectStore {
  constructor(options = {}) {
    this.projects = [];
    this.activeProjectId = '';
    this.maxProjects = serverConfig.desktopMode ? null : DEFAULT_MAX_PROJECTS;
    this.load();
    if (options.activeProjectId && this.projects.some((project) => project.id === options.activeProjectId)) this.activeProjectId = options.activeProjectId;
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      if (Array.isArray(saved.projects)) {
        const ids = new Set();
        this.projects = saved.projects.filter((item) => {
          if (!item || !/^project_[a-f0-9-]{36}$/.test(item.id) || typeof item.name !== 'string' || ids.has(item.id)) return false;
          ids.add(item.id);
          return true;
        });
      }
      if (typeof saved.activeProjectId === 'string') this.activeProjectId = saved.activeProjectId;
      if (!serverConfig.desktopMode) {
        if (saved.maxProjects === null) this.maxProjects = null;
        else if (Number.isInteger(saved.maxProjects) && saved.maxProjects >= 1) this.maxProjects = saved.maxProjects;
      }
      for (const project of this.projects) {
        if (!Number.isInteger(project.idleDisconnectMinutes) || project.idleDisconnectMinutes < 0 || project.idleDisconnectMinutes > 1440) project.idleDisconnectMinutes = 15;
      }
    } catch {}
    if (!this.projects.length) {
      const hasLegacyData = projectFiles.filter((filename) => filename !== 'graph-library.json').some((filename) => {
        try { return fs.existsSync(path.join(dataDir, filename)); } catch { return false; }
      });
      const project = { id: `project_${randomUUID()}`, name: 'Default Project', createdAt: new Date().toISOString(), trusted: true, idleDisconnectMinutes: 15, ...(hasLegacyData ? {} : { emptyStart: true, pendingStarterChoice: true }) };
      this.projects = [project];
      this.activeProjectId = project.id;
      const destination = this.directory(project.id);
      fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
      for (const filename of projectFiles) {
        const source = path.join(dataDir, filename);
        const target = path.join(destination, filename);
        try { if (fs.existsSync(source) && !fs.existsSync(target)) fs.copyFileSync(source, target); } catch {}
      }
      this.persist();
    }
    if (!this.projects.some((item) => item.id === this.activeProjectId)) this.activeProjectId = this.projects[0].id;
    this.persist();
  }

  directory(id = this.activeProjectId) {
    if (!/^project_[a-f0-9-]{36}$/.test(String(id))) throw new TypeError('Invalid project ID.');
    return path.join(projectRoot, id);
  }

  persist() {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const temporary = `${registryPath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ activeProjectId: this.activeProjectId, maxProjects: this.maxProjects, projects: this.projects }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, registryPath);
    try { fs.chmodSync(registryPath, 0o600); } catch {}
  }

  list() { return { projects: this.projects.map((project) => ({ ...project })), activeProjectId: this.activeProjectId, maxProjects: this.maxProjects }; }
  active() { return this.projects.find((project) => project.id === this.activeProjectId) || this.projects[0]; }

  assertUniqueName(name, exceptId = '') {
    const normalized = normalizedName(name);
    if (this.projects.some((project) => project.id !== exceptId && normalizedName(project.name) === normalized)) {
      throw new TypeError('A project with this name already exists. Choose a different name.');
    }
  }

  create(name, starterId = 'blank', ownerId = '') {
    if (this.maxProjects !== null && this.projects.length >= this.maxProjects) throw new RangeError(`This workspace has reached its ${this.maxProjects}-project limit.`);
    const starter = getStarterProject(starterId || 'blank');
    if (!starter) throw new TypeError('Choose one of the available project starters.');
    const projectName = cleanName(name);
    this.assertUniqueName(projectName);
    const project = { id: `project_${randomUUID()}`, name: projectName, createdAt: new Date().toISOString(), ...(ownerId ? { ownerId } : {}), emptyStart: true, trusted: true, idleDisconnectMinutes: 15 };
    const destination = this.directory(project.id);
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    try {
      writeStarterFiles(destination, starter);
      this.projects.push(project);
      this.persist();
      return { ...project };
    } catch (error) {
      this.projects = this.projects.filter((item) => item.id !== project.id);
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
  }

  initializeFirstProject(name, starterId = 'blank', ownerId = '') {
    const project = this.projects.find((item) => item.pendingStarterChoice);
    if (!project) throw new Error('This workspace already has a project.');
    const starter = getStarterProject(starterId);
    if (!starter) throw new TypeError('Choose one of the available project starters.');
    const projectName = cleanName(name);
    this.assertUniqueName(projectName, project.id);
    const directory = this.directory(project.id);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeStarterFiles(directory, starter);
    project.name = projectName;
    if (ownerId) project.ownerId = ownerId;
    project.emptyStart = true;
    project.pendingStarterChoice = false;
    project.trusted = true;
    this.persist();
    return { ...project };
  }

  setMaxProjects(value) {
    if (serverConfig.desktopMode) throw new TypeError('Local desktop workspaces do not have a project limit.');
    if (value !== null && (!Number.isInteger(value) || value < 1)) throw new TypeError('Set a whole-number project limit, or choose unlimited.');
    this.maxProjects = value;
    this.persist();
    return this.maxProjects;
  }

  setIdleDisconnectMinutes(projectId, value) {
    if (serverConfig.desktopMode) throw new TypeError('Local desktop workspaces are exempt from idle disconnects.');
    if (!Number.isInteger(value) || value < 0 || value > 1440) throw new TypeError('Choose 0 (never) or a timeout from 1 to 1440 minutes.');
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) throw new Error('That project no longer exists.');
    project.idleDisconnectMinutes = value;
    this.persist();
    return value;
  }

  exportProject(id, { includeSecrets = false, secretValueResolver = null } = {}) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    const files = {};
    for (const filename of projectFiles) {
      try { files[filename] = JSON.parse(fs.readFileSync(path.join(this.directory(id), filename), 'utf8')); }
      catch { files[filename] = filename === 'graphs.json' ? { graphs: [], deletedIds: [] } : filename === 'graph-library.json' ? { templates: [], snapshots: [] } : {}; }
    }
    let sensitiveCount = 0;
    const defaultValueForType = (type) => type === 'number' ? 0 : type === 'boolean' ? false : type === 'array' ? [] : type === 'object' ? {} : '';
    const sanitizeVariables = (variables, scope, graphId, allowSecretValues = true) => variables.map((variable) => {
      if (!variable?.secret) return sanitizeSecretDefinitions(variable, scope, graphId, allowSecretValues);
      sensitiveCount += 1;
      const safe = { ...variable, secret: true, initialValue: defaultValueForType(variable.type || variable.valueType) };
      delete safe.secretStored;
      delete safe.secretValue;
      if (includeSecrets && allowSecretValues) {
        const secretValue = typeof secretValueResolver === 'function'
          ? secretValueResolver(scope, graphId, variable.id)
          : variable.secretValue;
        if (secretValue !== undefined) safe.secretValue = structuredClone(secretValue);
      }
      return safe;
    });
    const sanitizeSecretDefinitions = (value, scope = 'graph', graphId = '', allowSecretValues = true) => {
      if (Array.isArray(value)) return value.map((entry) => sanitizeSecretDefinitions(entry, scope, graphId, allowSecretValues));
      if (!value || typeof value !== 'object') return value;
      const currentGraphId = typeof value.id === 'string' && Array.isArray(value.nodes) ? value.id : graphId;
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
        if (key === 'variables' && Array.isArray(entry)) return [key, sanitizeVariables(entry, scope, currentGraphId, allowSecretValues)];
        if (key === 'snapshots' && Array.isArray(entry)) return [key, entry.map((snapshot) => sanitizeSecretDefinitions(snapshot, scope, graphId, false))];
        if (key === 'graphId' && typeof entry === 'string') return [key, entry];
        if (key === 'graph' && entry && typeof entry === 'object') {
          const snapshotGraphId = typeof value.graphId === 'string' ? value.graphId : graphId;
          return [key, sanitizeSecretDefinitions(entry, scope, snapshotGraphId, allowSecretValues)];
        }
        return [key, sanitizeSecretDefinitions(entry, scope, currentGraphId, allowSecretValues)];
      }));
    };
    for (const filename of projectFiles) {
      files[filename] = filename === 'project-variables.json' && Array.isArray(files[filename])
        ? sanitizeVariables(files[filename], 'project', '')
        : sanitizeSecretDefinitions(files[filename]);
    }
    const redact = (value) => {
      if (Array.isArray(value)) return value.map(redact);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
        if (key === 'secret' && entry === true) return [[key, true]];
        if (/token|authorization|cookie|secret|password|api[-_]?key|headers?/i.test(key)) {
          if (entry !== '' && entry !== null && entry !== undefined) sensitiveCount += 1;
          return includeSecrets ? [[key, redact(entry)]] : [];
        }
        return [[key, redact(entry)]];
      }));
    };
    const exportedFiles = redact(files);
    const botConfig = files['bot-config.json'];
    if ((typeof botConfig === 'string' && botConfig.length > 0)
      || (botConfig && typeof botConfig === 'object' && Object.keys(botConfig).length > 0)) sensitiveCount += 1;
    exportedFiles['bot-config.json'] = {};
    return withIntegrity({ format: 'arc-project', version: 1, project: { name: project.name, exportedAt: new Date().toISOString(), createdWithVersion: currentArcStudioVersion }, files: exportedFiles, sensitiveData: includeSecrets ? undefined : { omittedFields: sensitiveCount } });
  }

  exportEncryptedProject(id, password, options = {}) {
    return encryptProjectBundle(this.exportProject(id, options), password);
  }

  decryptProjectBundle(envelope, password) {
    return decryptProjectBundle(envelope, password);
  }

  importProject(bundle, { trusted = false, allowOldVersion = false, ownerId = '' } = {}) {
    if (!trusted) throw new Error('Confirm that you trust this project file before importing it.');
    if (!bundle || bundle.format !== 'arc-project' || bundle.version !== 1 || !bundle.files || typeof bundle.files !== 'object' || Array.isArray(bundle.files)) throw new TypeError('This is not a supported ARC project file.');
    const integrity = verifyIntegrity(bundle);
    if (!integrity.valid) {
      const error = new Error('The project file integrity check failed. This file may be corrupted or altered.');
      error.code = 'PROJECT_INTEGRITY_FAILED';
      throw error;
    }
    const createdWithVersion = bundle.project?.createdWithVersion;
    const versionOrder = createdWithVersion ? compareArcStudioVersions(createdWithVersion, currentArcStudioVersion) : null;
    if (versionOrder === 1) {
      const error = new Error(`This project was created with ARC Studio ${createdWithVersion}. Update ARC Studio to ${createdWithVersion} or newer before importing it.`);
      error.code = 'PROJECT_REQUIRES_NEWER_ARC';
      error.projectVersion = createdWithVersion;
      throw error;
    }
    const age = projectVersionAge(createdWithVersion, currentArcStudioVersion);
    if (age.veryOld && !allowOldVersion) {
      const error = new Error(age.unknown
        ? 'This project has no recognized ARC Studio version. It may use an older project format.'
        : `This project was created with ARC Studio ${createdWithVersion}, at least ten releases ago. Its graphs or settings may behave differently.`);
      error.code = 'PROJECT_OLD_VERSION_CONFIRMATION_REQUIRED';
      error.projectVersion = createdWithVersion || null;
      error.currentVersion = currentArcStudioVersion;
      error.unknownProjectVersion = age.unknown;
      throw error;
    }
    if (this.maxProjects !== null && this.projects.length >= this.maxProjects) throw new RangeError(`This workspace has reached its ${this.maxProjects}-project limit.`);
    const name = cleanName(bundle.project?.name || 'Imported Project');
    this.assertUniqueName(name);
    const project = { id: `project_${randomUUID()}`, name, createdAt: new Date().toISOString(), ...(ownerId ? { ownerId } : {}), importedAt: new Date().toISOString(), emptyStart: true, trusted: true, idleDisconnectMinutes: 15 };
    const destination = this.directory(project.id);
    fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
    try {
      for (const filename of projectFiles) {
        if (!Object.prototype.hasOwnProperty.call(bundle.files, filename)) continue;
        const content = JSON.stringify(bundle.files[filename], null, 2);
        if (content.length > 40 * 1024 * 1024) throw new RangeError(`Project file ${filename} is too large.`);
        fs.writeFileSync(path.join(destination, filename), content, { mode: 0o600 });
      }
      this.projects.push(project);
      this.persist();
      return { ...project };
    } catch (error) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw error;
    }
  }

  activate(id, { persist = true } = {}) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    if (persist) this.activeProjectId = id;
    fs.mkdirSync(this.directory(id), { recursive: true, mode: 0o700 });
    if (persist) this.persist();
    return { ...project };
  }

  delete(id, confirmationName) {
    const project = this.projects.find((item) => item.id === id);
    if (!project) throw new Error('That project no longer exists.');
    if (this.projects.length <= 1) throw new Error('Keep at least one project in this workspace.');
    if (String(confirmationName || '').trim() !== project.name) throw new Error('Enter the project name exactly to confirm deletion.');
    if (this.activeProjectId === id) throw new Error('Open another project before deleting this one.');
    fs.rmSync(this.directory(id), { recursive: true, force: true });
    this.projects = this.projects.filter((item) => item.id !== id);
    this.persist();
    return { ...project };
  }
}

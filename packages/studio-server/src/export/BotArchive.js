import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { randomBytes, createHash } from 'node:crypto';
import { NodeDefinitions } from '../engine/NodeRegistry.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '../..');
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function pickOwnFields(source, fields) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]));
}

function projectRuntimeGraph(graph) {
  return {
    id: graph.id,
    ...(graph.graphType === 'function' ? { graphType: 'function' } : {}),
    variables: (Array.isArray(graph.variables) ? graph.variables : []).map((variable) => pickOwnFields(variable, ['id', 'name', 'type', 'valueType', 'initialValue', 'persist'])),
    nodes: graph.nodes.map((node) => pickOwnFields(node, ['id', 'type', 'data', 'permission', 'requiredPermission'])),
    connections: graph.connections.map((connection) => pickOwnFields(connection, ['sourceNodeId', 'sourcePinId', 'targetNodeId', 'targetPinId']))
  };
}

export function buildBotArchive(graphs = [], projectVariables = [], pluginAdapters = [], exportOptions = {}) {
  const safeGraphs = graphs
    .filter((graph) => graph && typeof graph.id === 'string' && Array.isArray(graph.nodes) && Array.isArray(graph.connections))
    .map(projectRuntimeGraph);
  const safeProjectVariables = (Array.isArray(projectVariables) ? projectVariables : [])
    .map((variable) => pickOwnFields(variable, ['id', 'name', 'type', 'initialValue']));
  const includeCryptoSecret = exportOptions.includeCryptoSecret === true;
  const includeBotToken = exportOptions.includeBotToken === true;
  const botToken = includeBotToken ? String(exportOptions.botToken || '').replace(/[\r\n]/g, '') : '';
  if (includeBotToken && !botToken) throw new Error('A bot token is not configured for this project.');
  const cryptoSecret = includeCryptoSecret
    ? String(exportOptions.cryptoSecret || randomBytes(32).toString('hex')).replace(/[\r\n]/g, '')
    : '';
  const requestedLogRetention = String(exportOptions.logRetentionDays ?? 7);
  const logRetentionDays = ['1', '7', '14', '30', '90', '365', '0', 'forever'].includes(requestedLogRetention) ? requestedLogRetention : '7';
  const projectName = String(exportOptions.projectName || 'Untitled Project').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64) || 'Untitled Project';
  const projectAuthor = String(exportOptions.projectAuthor || 'Unknown').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32) || 'Unknown';
  const statisticsSettings = exportOptions.statisticsSettings || { enabled: true, retentionDays: 30, commandUsage: true, uniqueUsers: true, returningUsers: true };
  const usedTypes = new Set(safeGraphs.flatMap((graph) => graph.nodes.map((node) => node?.type).filter((type) => typeof type === 'string')));
  const requiredRuntimeModules = new Set(['builders.js', 'control_flow.js', 'data.js', 'logic.js']);
  const runtimeTypeGroups = [
    [['action_http_download', 'action_web_fetch', 'action_web_retry'], 'network.js'],
    [['action_websocket_connect', 'action_websocket_send', 'action_websocket_close'], 'websocket.js'],
    [['action_set_custom_status', 'action_set_presence'], 'discord_presence.js'],
    [['action_send_message', 'action_edit_message', 'action_edit_components'], 'discord_messages.js'],
    [[
      'action_reply_interaction', 'action_defer_reply', 'action_defer_update',
      'action_edit_interaction_reply', 'action_show_modal', 'action_respond_autocomplete'
    ], 'discord_interactions.js'],
    [[
      'action_fetch_user', 'action_fetch_guild', 'action_fetch_member',
      'action_fetch_channel', 'action_fetch_channel_messages', 'action_fetch_message',
      'action_create_thread', 'action_start_thread_from_message',
      'action_create_channel', 'action_edit_channel', 'action_delete_channel',
      'action_create_role', 'action_member_role', 'action_moderate_member',
      'action_voice_channel_status', 'action_voice_state'
    ], 'discord_guild.js']
  ];
  for (const [types, module] of runtimeTypeGroups) {
    if (types.some((type) => usedTypes.has(type))) requiredRuntimeModules.add(module);
  }
  if ([...usedTypes].some((type) => type.startsWith('action_crypto_'))) requiredRuntimeModules.add('crypto.js');
  const exports = normalizePluginExports(pluginAdapters, usedTypes);
  const dependencies = { chezcord: 'file:./chezcord' };
  if (requiredRuntimeModules.has('websocket.js')) dependencies.ws = '^8.18.0';
  const environment = [];
  const permissionSections = [];
  const pluginFiles = [];
  for (const plugin of exports) {
    Object.assign(dependencies, plugin.dependencies || {});
    environment.push(...(plugin.environment || []));
    permissionSections.push(plugin.permissionSection);
    if (plugin.kind === 'wasm-adapter') pluginFiles.push(plugin.file);
    else pluginFiles.push(...plugin.files);
  }
  const pluginStoreSource = createExportPluginStore(exports);
  const readme = `${baseReadme}\n${exports.length ? `This export includes ${exports.map((plugin) => `${plugin.name} ${plugin.version}`).join(', ')} adapter${exports.length === 1 ? '' : 's'}. See PLUGIN-PERMISSIONS.md for declared capabilities and plugin notices.\n` : ''}`;
  const seenEnvironmentNames = new Set(['DISCORD_BOT_TOKEN', 'ARC_CRYPTO_SECRET', 'ARC_LOG_RETENTION_DAYS']);
  const environmentExamples = environment.filter((item) => {
    if (seenEnvironmentNames.has(item.name)) return false;
    seenEnvironmentNames.add(item.name);
    return true;
  });
  const envExample = [
    '# Discord bot token. This export includes it only if you selected that option.',
    'DISCORD_BOT_TOKEN=',
    '',
    '# Used by AES encrypt/decrypt nodes when no passphrase is connected. Keep it stable to decrypt stored data after restarts.',
    'ARC_CRYPTO_SECRET=',
    '',
    '# Days to keep daily bot logs. Use 0 or forever to keep them all.',
    'ARC_LOG_RETENTION_DAYS=',
    ...environmentExamples.flatMap((item) => ['', `# ${item.description}${item.required ? ' (required)' : ''}`, `${item.name}=`]),
    ''
  ].join('\n');
  const envFile = [
    `DISCORD_BOT_TOKEN=${botToken}`,
    `ARC_CRYPTO_SECRET=${cryptoSecret}`,
    `ARC_LOG_RETENTION_DAYS=${logRetentionDays}`,
    ''
  ].join('\n');
  const entries = [
    { name: 'README.md', data: readme },
    { name: '.env', data: envFile },
    { name: '.env.example', data: envExample },
    { name: 'package.json', data: JSON.stringify({
      name: 'arc-bot-export',
      private: true,
      type: 'module',
      scripts: { prestart: 'node scripts/ensure-dependencies.mjs', start: 'node src/index.js' },
      dependencies,
      engines: { node: '>=22.0.0' }
    }, null, 2) },
    { name: 'scripts/ensure-dependencies.mjs', data: runtimeDependencyBootstrap },
    { name: 'graphs.json', data: JSON.stringify(safeGraphs) },
    { name: 'project-variables.json', data: JSON.stringify(safeProjectVariables) },
    { name: 'src/env.js', data: runtimeEnv },
    { name: 'src/index.js', data: runtimeIndex
      .replace('__ARC_WEBSOCKET_IMPORT__', requiredRuntimeModules.has('websocket.js') ? "import { GraphWebSocketManager } from './engine/nodes/runtime/websocket.js';" : '')
      .replace('__ARC_PROJECT_NAME__', JSON.stringify(projectName))
      .replace('__ARC_PROJECT_AUTHOR__', JSON.stringify(projectAuthor))
      .replace('__ARC_STATISTICS_SETTINGS__', JSON.stringify(statisticsSettings)) },
    { name: 'src/engine/GraphRunner.js', data: readText('src/engine/GraphRunner.js') },
    { name: 'src/engine/FunctionGraphContract.js', data: readText('src/engine/FunctionGraphContract.js') },
    { name: 'src/engine/DiscordValueValidation.js', data: readText('src/engine/DiscordValueValidation.js') },
    { name: 'src/engine/DynamicNodePins.js', data: readText('src/engine/DynamicNodePins.js') },
    { name: 'src/engine/SlashCommandOptions.js', data: readText('src/engine/SlashCommandOptions.js') },
    { name: 'src/engine/TemplateExpressions.js', data: readText('src/engine/TemplateExpressions.js') },
    { name: 'src/engine/MathOperations.js', data: readText('src/engine/MathOperations.js') },
    { name: 'src/engine/CronSchedule.js', data: readText('src/engine/CronSchedule.js') },
    { name: 'src/engine/PluginStore.js', data: pluginStoreSource },
    { name: 'src/engine/NodeRegistry.js', data: readText('src/engine/NodeRegistry.js') },
    { name: 'src/engine/NodeRegistryContract.js', data: readText('src/engine/NodeRegistryContract.js') },
    { name: 'src/storage/Integrity.js', data: readText('src/storage/Integrity.js') },
    { name: 'LICENSE', data: readText('LICENSE', repoRoot) }
  ];
  if (requiredRuntimeModules.has('network.js')) {
    entries.push({ name: 'src/engine/SafeHttpRequest.js', data: readText('src/engine/SafeHttpRequest.js') });
  }
  if (requiredRuntimeModules.has('crypto.js')) {
    entries.push({ name: 'src/security/CryptoEngine.js', data: standaloneCryptoSource() });
  }
  const nodeSourceRoot = path.resolve(serverRoot, 'src/engine/nodes');
  const schemaCategoryFolder = (category) => String(category || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const usedBuiltInSchemaFiles = new Set([...usedTypes]
    .filter((type) => NodeDefinitions[type] && !NodeDefinitions[type].pluginAdapter && path.posix.basename(type) === type)
    .map((type) => `${schemaCategoryFolder(NodeDefinitions[type].category)}/${type}.js`));
  const schemaImports = [...usedBuiltInSchemaFiles].sort().map((file, index) => `import node${index} from './${file}';`).join('\n');
  const schemaNames = [...usedBuiltInSchemaFiles].sort().map((_file, index) => `node${index}`).join(', ');
  entries.push({ name: 'src/engine/nodes/index.js', data: `${schemaImports}\nexport const nodeDefinitions = [${schemaNames}];\n` });
  for (const file of walk(nodeSourceRoot)) {
    if (!file.endsWith('.js')) continue;
    const relative = path.relative(nodeSourceRoot, file).split(path.sep).join('/');
    if (relative.startsWith('runtime/')) {
      if (!requiredRuntimeModules.has(path.posix.basename(relative))) continue;
    } else if (!usedBuiltInSchemaFiles.has(relative)) continue;
    entries.push({ name: `src/engine/nodes/${relative}`, data: fs.readFileSync(file) });
  }
  if (exports.some((plugin) => plugin.kind === 'wasm-adapter')) entries.push({ name: 'src/engine/WasmAdapterRuntime.js', data: readText('src/engine/WasmAdapterRuntime.js') });
  entries.push(...pluginFiles);
  if (permissionSections.length) entries.push({ name: 'PLUGIN-PERMISSIONS.md', data: `# Plugin permissions\n\nThe exported process runs outside ARC Studio's per-project permission enforcement. Review each plugin's declared capabilities and restrict its external credentials accordingly.\n\n${permissionSections.join('\n\n')}\n` });
  for (const file of walk(path.resolve(repoRoot, 'packages/chezcord'))) {
    const relative = path.relative(path.resolve(repoRoot, 'packages/chezcord'), file).split(path.sep).join('/');
    if (relative === 'package.json' || relative.startsWith('src/')) {
      entries.push({ name: `chezcord/${relative}`, data: fs.readFileSync(file) });
    }
  }
  const integrityFiles = Object.fromEntries(entries.map((entry) => {
    const bytes = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data));
    return [entry.name, createHash('sha256').update(bytes).digest('hex')];
  }));
  entries.push({ name: 'integrity.json', data: JSON.stringify({ format: 'arc-bot-integrity', version: 1, algorithm: 'sha256', files: integrityFiles }, null, 2) });
  return zip(entries);
}

export function verifyBotArchiveIntegrity(archive) {
  if (!Buffer.isBuffer(archive)) throw new TypeError('The bot archive is not a Buffer.');
  const extracted = new Map();
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const expectedCrc = archive.readUInt32LE(offset + 14);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const filenameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + filenameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) throw new Error('The generated bot ZIP has a truncated entry.');
    const name = archive.toString('utf8', nameStart, nameStart + filenameLength);
    const compressed = archive.subarray(dataStart, dataEnd);
    const bytes = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
    if (!bytes || bytes.length !== uncompressedSize || crc32(bytes) !== expectedCrc) throw new Error(`ZIP integrity check failed for ${name}.`);
    extracted.set(name, bytes);
    offset = dataEnd;
  }
  const integrityBytes = extracted.get('integrity.json');
  if (!integrityBytes) throw new Error('The bot export has no SHA-256 integrity manifest.');
  const manifest = JSON.parse(integrityBytes.toString('utf8'));
  if (manifest?.format !== 'arc-bot-integrity' || manifest?.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object') throw new Error('The bot export has an invalid SHA-256 integrity manifest.');
  const expectedNames = Object.keys(manifest.files);
  if (expectedNames.length !== extracted.size - 1) throw new Error('The bot export integrity manifest does not cover every ZIP file.');
  for (const name of expectedNames) {
    const bytes = extracted.get(name);
    if (!bytes || createHash('sha256').update(bytes).digest('hex') !== manifest.files[name]) throw new Error(`SHA-256 integrity check failed for ${name}.`);
  }
  return true;
}

function normalizePluginExports(pluginAdapters, usedTypes) {
  const result = [];
  const coveredTypes = new Set();
  const dependencyVersions = new Map([['chezcord', 'file:./chezcord']]);
  const environmentNames = new Map();
  for (const item of pluginAdapters || []) {
    const manifest = item?.manifest;
    const directory = item?.directory;
    if (!manifest || !['host-adapter', 'wasm-adapter'].includes(manifest.kind) || typeof manifest.id !== 'string' || !directory) throw new Error('An installed adapter supplied invalid export metadata.');
    const id = manifest.id;
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(id)) throw new Error(`Plugin ID “${id}” is invalid for export.`);
    const nodes = (manifest.nodes || []).filter((node) => usedTypes.has(node.type));
    if (!nodes.length) continue;
    if (nodes.some((node) => coveredTypes.has(node.type))) throw new Error(`More than one plugin claims a node used by this graph: ${nodes.find((node) => coveredTypes.has(node.type)).type}.`);
    for (const node of nodes) coveredTypes.add(node.type);
    if (manifest.kind === 'wasm-adapter') {
      const modulePath = path.resolve(directory, manifest.wasmArtifact);
      if (!modulePath.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(modulePath) || !fs.statSync(modulePath).isFile()) throw new Error(`${manifest.name || id} WebAssembly module is unavailable.`);
      const file = { name: `src/plugins/${id}/${manifest.version}/adapter.wasm`, data: fs.readFileSync(modulePath) };
      const notices = (manifest.thirdPartyNotices || []).map((notice) => `- **${notice.name} ${notice.version}** — ${notice.license}${notice.sourceUrl ? ` ([source](${notice.sourceUrl}))` : ''}${notice.notice ? `\n  ${notice.notice}` : ''}`).join('\n');
      const permissionSection = `## ${manifest.name || id} ${manifest.version || ''}\n\nAuthor: ${manifest.author || 'Unspecified'} · License: ${manifest.license || 'Unspecified'}\n\nThis adapter runs in an isolated WebAssembly worker without host permissions.${notices ? `\n\n### Third-party notices\n\n${notices}` : ''}`;
      result.push({ kind: 'wasm-adapter', id, name: String(manifest.name || id), version: String(manifest.version || ''), nodes, limits: manifest.limits, file, permissionSection });
      continue;
    }
    const runtime = manifest.runtime;
    const exportInfo = manifest.export;
    if (!runtime || path.basename(runtime.module || '') !== runtime.module || !runtime.module.endsWith('.js') || !/^[$A-Z_a-z][$\w]*$/.test(runtime.execute || '') || !exportInfo || typeof exportInfo !== 'object') {
      throw new Error(`${manifest.name || id} does not declare a valid standalone export runtime.`);
    }
    if (runtime.closeProject !== undefined && !/^[$A-Z_a-z][$\w]*$/.test(runtime.closeProject)) throw new Error(`${manifest.name || id} declares an invalid shutdown function.`);
    const dependencies = {};
    for (const [name, version] of Object.entries(exportInfo.dependencies || {})) {
      if (!/^(?:@[-\w.]+\/)?[-\w.]+$/.test(name) || typeof version !== 'string' || !version.trim()) throw new Error(`${manifest.name || id} declares an invalid export dependency.`);
      if (dependencyVersions.has(name) && dependencyVersions.get(name) !== version) throw new Error(`Plugins declare conflicting versions of dependency “${name}”.`);
      dependencyVersions.set(name, version);
      dependencies[name] = version;
    }
    const environment = [];
    for (const entry of exportInfo.environment || []) {
      if (!entry || !/^[A-Z_][A-Z0-9_]*$/.test(entry.name || '') || typeof entry.description !== 'string') throw new Error(`${manifest.name || id} declares an invalid environment variable for export.`);
      const shape = JSON.stringify({ description: entry.description, required: entry.required === true });
      if (environmentNames.has(entry.name) && environmentNames.get(entry.name) !== shape) throw new Error(`Plugins declare conflicting meanings for environment variable “${entry.name}”.`);
      environmentNames.set(entry.name, shape);
      environment.push({ name: entry.name, description: entry.description.slice(0, 300), required: entry.required === true });
    }
    const config = {};
    for (const [key, source] of Object.entries(exportInfo.runtimeConfig || {})) {
      if (!/^[A-Za-z_$][\w$]*$/.test(key) || !source || typeof source !== 'object') throw new Error(`${manifest.name || id} declares invalid runtime configuration.`);
      if (typeof source.env === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(source.env)) config[key] = { env: source.env, ...(source.defaultValue !== undefined ? { defaultValue: source.defaultValue } : {}) };
      else if (Object.hasOwn(source, 'value')) config[key] = { value: source.value };
      else throw new Error(`${manifest.name || id} declares an invalid runtime configuration source.`);
    }
    const files = [];
    const runtimePath = path.resolve(directory, runtime.module);
    if (!runtimePath.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(runtimePath) || !fs.statSync(runtimePath).isFile()) throw new Error(`${manifest.name || id} export runtime file is unavailable.`);
    files.push({ name: `src/plugins/${id}/${runtime.module}`, data: fs.readFileSync(runtimePath) });
    for (const relative of exportInfo.files || []) {
      if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => part === '..' || part === '')) throw new Error(`${manifest.name || id} declares an unsafe export file path.`);
      const sourcePath = path.resolve(directory, relative);
      if (!sourcePath.startsWith(`${path.resolve(directory)}${path.sep}`) || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`${manifest.name || id} export file “${relative}” is unavailable.`);
      files.push({ name: `plugins/${id}/${relative.split(path.sep).join('/')}`, data: fs.readFileSync(sourcePath) });
    }
    const usedPermissions = new Set(nodes.map((node) => node.requiredPermission || node.permission).filter(Boolean));
    const permissions = (manifest.permissions || []).filter((permission) => usedPermissions.has(permission.id));
    const notices = (manifest.thirdPartyNotices || []).map((notice) => `- **${notice.name} ${notice.version}** — ${notice.license}${notice.sourceUrl ? ` ([source](${notice.sourceUrl}))` : ''}${notice.notice ? `\n  ${notice.notice}` : ''}`).join('\n');
    const permissionSection = `## ${manifest.name || id} ${manifest.version || ''}\n\nAuthor: ${manifest.author || 'Unspecified'} · License: ${manifest.license || 'Unspecified'}\n\n${permissions.length ? permissions.map((permission) => `- **${permission.name || permission.id}** (${permission.id}): ${permission.description || 'No description provided.'}`).join('\n') : 'This graph uses no declared permissions.'}${notices ? `\n\n### Third-party notices\n\n${notices}` : ''}`;
    result.push({ kind: 'host-adapter', id, name: String(manifest.name || id), version: String(manifest.version || ''), runtime, config, nodes, dependencies, environment, files, permissionSection });
  }
  const missing = [...usedTypes].filter((type) => type.startsWith('arc.') && !coveredTypes.has(type));
  if (missing.length) throw new Error(`The export is missing installed host adapter files for: ${missing.slice(0, 5).join(', ')}.`);
  return result;
}

function createExportPluginStore(plugins) {
  const declarations = plugins.map((plugin, index) => plugin.kind === 'wasm-adapter'
    ? `  { kind: 'wasm-adapter', id: ${JSON.stringify(plugin.id)}, nodes: ${JSON.stringify(plugin.nodes)}, module: new URL('../plugins/${plugin.id}/${plugin.version}/adapter.wasm', import.meta.url), limits: ${JSON.stringify(plugin.limits)} }`
    : `  { kind: 'host-adapter', id: ${JSON.stringify(plugin.id)}, nodes: ${JSON.stringify(plugin.nodes)}, config: ${JSON.stringify(plugin.config)}, execute: runtime${index}[${JSON.stringify(plugin.runtime.execute)}]${plugin.runtime.closeProject ? `, closeProject: runtime${index}[${JSON.stringify(plugin.runtime.closeProject)}]` : ''} }`).join(',\n');
  const imports = plugins.map((plugin, index) => plugin.kind === 'wasm-adapter' ? '' : `import * as runtime${index} from '../plugins/${plugin.id}/${plugin.runtime.module}';`).filter(Boolean).join('\n');
  const wasmImport = plugins.some((plugin) => plugin.kind === 'wasm-adapter') ? "import { runWasmAdapter } from './WasmAdapterRuntime.js';" : '';
  const wasmRun = `    if (adapter.kind === 'wasm-adapter') {
      const definition = adapter.nodes.find((node) => node.type === nodeType);
      const safeInputs = {};
      for (const pin of definition.inputs) {
        if (pin.type === 'exec') continue;
        let value = inputs?.[pin.id] ?? pin.defaultValue;
        if (pin.type === 'string') { value = String(value ?? ''); if (Buffer.byteLength(value, 'utf8') > adapter.limits.inputBytes) throw new Error('Input ' + pin.label + ' exceeds the adapter input limit.'); }
        else if (pin.type === 'number') { value = Number(value); if (!Number.isFinite(value)) throw new Error('Input ' + pin.label + ' must be a finite number.'); }
        else if (pin.type === 'boolean') value = Boolean(value);
        safeInputs[pin.id] = value;
      }
      if (Buffer.byteLength(JSON.stringify(safeInputs), 'utf8') > 1048576) throw new Error('Combined adapter inputs exceed the 1 MiB request limit.');
      const result = await runWasmAdapter(adapter.module, safeInputs, { timeoutMs: adapter.limits.timeoutMs, maxOutputBytes: adapter.limits.outputBytes });
      const outputs = {};
      for (const pin of definition.outputs) {
        if (pin.type === 'exec' || result[pin.id] === undefined) continue;
        const value = result[pin.id];
        if (pin.type === 'string' && (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > adapter.limits.outputBytes)) throw new Error('Adapter returned an invalid or oversized value for ' + pin.label + '.');
        if (pin.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Adapter returned an invalid number for ' + pin.label + '.');
        if (pin.type === 'boolean' && typeof value !== 'boolean') throw new Error('Adapter returned an invalid boolean for ' + pin.label + '.');
        outputs[pin.id] = value;
      }
      return outputs;
    }`;
  return `${imports}\n${wasmImport}\nimport { registerAdapterNodeDefinitions } from './NodeRegistry.js';\n\nconst adapters = [\n${declarations}\n];\nregisterAdapterNodeDefinitions(adapters.flatMap((adapter) => adapter.nodes.map((node) => ({ ...node, pluginAdapter: true, pluginId: adapter.id, ...(adapter.kind === 'host-adapter' ? { hostAdapter: adapter.id } : {}) }))));\n\nfunction configFor(adapter) {\n  return Object.fromEntries(Object.entries(adapter.config || {}).map(([key, source]) => [key, Object.hasOwn(source, 'env') ? (process.env[source.env] ?? source.defaultValue ?? '') : source.value]));\n}\nexport class PluginStore {\n  static async executeAdapter(nodeType, inputs = {}, { projectDir = '' } = {}) {\n    const adapter = adapters.find((entry) => entry.nodes.some((node) => node.type === nodeType));\n    if (!adapter) throw new Error('No exported adapter provides node ' + nodeType + '.');\n${wasmRun}\n    if (typeof adapter.execute !== 'function') throw new Error('Adapter ' + adapter.id + ' has no execution function.');\n    const config = configFor(adapter);\n    if (projectDir && Object.hasOwn(config, '__projectDir')) config.__projectDir = projectDir;\n    return adapter.execute(nodeType, inputs, config);\n  }\n  static async closeProject(projectDir = '') {\n    for (const adapter of adapters) {\n      if (typeof adapter.closeProject !== 'function') continue;\n      const config = configFor(adapter);\n      const directory = projectDir || config.__projectDir || 'exported-bot';\n      await adapter.closeProject(directory);\n    }\n  }\n}\n`;
}

function readText(relative, root = serverRoot) {
  return fs.readFileSync(path.resolve(root, relative), 'utf8');
}

const baseReadme = `# ARC bot export

This standalone bot contains the graphs selected at export time and does not require ARC Studio to run. The generated runtime and bundled Chezcord source are licensed under Apache-2.0. Graph data and separately published plugin content may carry their own licenses, keep the included notices and license files when redistributing this archive.

## Start

1. Install Node.js 22 or newer.
2. Copy \`.env.example\` to \`.env\` and set \`DISCORD_BOT_TOKEN\` plus any adapter values listed there.
3. Run \`npm install\`, then \`npm start\`.

The bot reads graph definitions from \`graphs.json\`. Message content and member-join, and other event graphs need their privileged intents enabled in the Discord Developer Portal. Slash-command graphs handle incoming interactions, register those commands with Discord separately from ARC Studio or your App. Keep \`.env\` private and never commit your bot token.

On startup, missing adapter packages are installed automatically. If an installed package does not meet the required version, startup reports an error and stops.

This bot export cannot be imported into ARC Studio.
`;

function standaloneCryptoSource() {
  return readText('src/security/CryptoEngine.js')
    .replace("import { serverConfig } from '../config.js';", "const serverConfig = { sessionSecret: process.env.ARC_CRYPTO_SECRET || crypto.randomBytes(32).toString('hex') };");
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

function zip(entries) {
  const localChunks = [];
  const centralChunks = [];
  let localOffset = 0;
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const compressed = deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localChunks.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralChunks.push(central);
    localOffset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localChunks, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const runtimeIndex = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import './env.js';
__ARC_WEBSOCKET_IMPORT__
import { Client, GatewayIntents, CommandStatistics } from 'chezcord';
import { GraphRunner } from './engine/GraphRunner.js';
import { NodeDefinitions } from './engine/NodeRegistry.js';
import { flattenSlashParameters, normalizeSlashCommandOptions, validateSlashCommandOptions } from './engine/SlashCommandOptions.js';
import { startCronScheduler } from './engine/CronSchedule.js';
import { PluginStore } from './engine/PluginStore.js';

const token = process.env.DISCORD_BOT_TOKEN;
function verifyExportIntegrity() {
  try {
    const exportRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const manifestPath = path.join(exportRoot, 'integrity.json');
    if (!fs.existsSync(manifestPath)) {
      console.warn('[Integrity] SHA-256 manifest is missing. Export files could not be checked.');
      return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest?.format !== 'arc-bot-integrity' || manifest?.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object') throw new Error('Unsupported integrity manifest.');
    const mismatches = [];
    for (const [name, expected] of Object.entries(manifest.files)) {
      const filePath = path.resolve(exportRoot, name);
      if (!filePath.startsWith(exportRoot + path.sep) || typeof expected !== 'string') { mismatches.push(name); continue; }
      if (!fs.existsSync(filePath) || createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') !== expected) mismatches.push(name);
    }
    if (mismatches.length) console.error('[Integrity] Export files failed SHA-256 verification and may be corrupted: ' + mismatches.slice(0, 10).join(', '));
    else console.log('[Integrity] SHA-256 checks passed for ' + Object.keys(manifest.files).length + ' exported files.');
  } catch (error) {
    console.warn('[Integrity] File verification could not run: ' + (error?.message || 'unknown error'));
  }
}
verifyExportIntegrity();
if (!token) {
  console.error('Set DISCORD_BOT_TOKEN in .env before starting the bot.');
  process.exit(1);
}
const logDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../logs');
const logRetention = String(process.env.ARC_LOG_RETENTION_DAYS || '7').trim().toLowerCase();
let logDate = '';
let logStream = null;
let logWriteWarningShown = false;
let retainedLogsSanitized = false;
function sanitizeRetainedLogs() {
  if (retainedLogsSanitized) return;
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  for (const file of fs.readdirSync(logDirectory)) {
    if (!/^arc-bot-\\d{4}-\\d{2}-\\d{2}\\.log$/.test(file)) continue;
    const filePath = path.join(logDirectory, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const records = original.split(/(?=^\\[[^\\r\\n]+\\] \\[[A-Z]+\\s*\\] )/m);
    const sanitized = records.map((record) => {
      if (/^\\[[^\\]\\r\\n]+\\] \\[INFO\\s*\\] Message received from [^:\\r\\n]+: /.test(record)) {
        return record.replace(/^(\\[[^\\]\\r\\n]+\\] \\[INFO\\s*\\] )Message received from [^:\\r\\n]+: [\\s\\S]*$/, '$1Message event received.\\n');
      }
      if (/^\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Compare Text\\] /.test(record)) {
        return record.replace(/^(\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Compare Text\\] )[\\s\\S]*$/, '$1Operands redacted; comparison result retained.\\n');
      }
      if (/^\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Action Send Message\\] Sending to channel /.test(record)) {
        return record.replace(/^(\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Action Send Message\\] Sending to channel [^:\\r\\n]+: )[\\s\\S]*$/, '$1[message content redacted]\\n');
      }
      if (/^\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Action Reply\\] Replying: /.test(record)) {
        return record.replace(/^(\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Action Reply\\] Replying: )[\\s\\S]*$/, '$1[message content redacted]\\n');
      }
      if (/^\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Edit Interaction Reply\\] Editing original response: /.test(record)) {
        return record.replace(/^(\\[[^\\]\\r\\n]+\\] \\[[A-Z]+\\s*\\] \\[Edit Interaction Reply\\] Editing original response: )[\\s\\S]*$/, '$1[message content redacted]\\n');
      }
      return record;
    }).join('');
    if (sanitized !== original) fs.writeFileSync(filePath, sanitized, { mode: 0o600 });
  }
  retainedLogsSanitized = true;
}
function rotateLogs() {
  const today = new Date().toISOString().slice(0, 10);
  if (today === logDate && logStream) return;
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  sanitizeRetainedLogs();
  logStream?.end();
  logDate = today;
  logStream = fs.createWriteStream(path.join(logDirectory, 'arc-bot-' + today + '.log'), { flags: 'a', mode: 0o600 });
  logStream.on('error', (error) => {
    if (logWriteWarningShown) return;
    logWriteWarningShown = true;
    console.error('[Log File] Could not write bot logs: ' + error.message);
  });
  if (logRetention === 'forever' || Number(logRetention) === 0) return;
  const retentionDays = Math.min(365, Math.max(1, Number.parseInt(logRetention, 10) || 7));
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(logDirectory)) {
    if (!/^arc-bot-\\d{4}-\\d{2}-\\d{2}\\.log$/.test(file)) continue;
    const filePath = path.join(logDirectory, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
}
function writeLog(level, message) {
  if (String(level).toUpperCase() === 'DEBUG') return;
  const line = '[' + new Date().toISOString() + '] [' + String(level).toUpperCase().padEnd(5) + '] ' + String(message);
  (level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log)(line);
  try {
    rotateLogs();
    logStream?.write(line + '\\n');
  } catch (error) {
    if (!logWriteWarningShown) {
      logWriteWarningShown = true;
      console.error('[Log File] Could not write bot logs: ' + error.message);
    }
  }
}
const retentionLabel = logRetention === 'forever' || Number(logRetention) === 0 ? 'forever' : logRetention + ' days';
console.log([
  '',
  '==============================================================================',
  '   █████╗ ██████╗  ██████╗      ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗ ',
  '  ██╔══██╗██╔══██╗██╔════╝      ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗',
  '  ███████║██████╔╝██║     █████╗███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║',
  '  ██╔══██║██╔══██╗██╔════╝      ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║',
  '  ██║  ██║██║  ██║╚██████╗      ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝',
  '  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝      ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ ',
  '==============================================================================',
  '  Project: ' + __ARC_PROJECT_NAME__,
  '  Made by: ' + __ARC_PROJECT_AUTHOR__,
  '  Log files: ' + logDirectory,
  '  Log retention: ' + retentionLabel,
  '==============================================================================',
  ''
].join('\\n'));
function formatError(error) {
  return error instanceof Error ? (error.stack || error.message) : String(error);
}
const graphs = JSON.parse(fs.readFileSync(new URL('../graphs.json', import.meta.url), 'utf8'));
const requiredIntentNames = new Set(['GUILDS', 'GUILD_EMOJIS_AND_STICKERS']);
for (const graph of graphs) for (const node of graph.nodes || []) {
  for (const intent of NodeDefinitions[node.type]?.gatewayIntents || []) requiredIntentNames.add(intent);
}
const intents = [...requiredIntentNames].reduce((mask, name) => mask | (GatewayIntents[name] || 0), 0);
const client = new Client({ token, intents });
const graphWebSockets = typeof GraphWebSocketManager === 'undefined' ? null : new GraphWebSocketManager();
const appProbeStartedAt = performance.now();
const app = await client.rest.getCurrentApplication().catch(() => null);
let appLatency = app ? Math.round(performance.now() - appProbeStartedAt) : 0;
const appEmojis = app?.id ? ((await client.rest.getApplicationEmojis(app.id).catch(() => null))?.items || []) : [];
const variables = new Map();
const projectVariables = JSON.parse(fs.readFileSync(new URL('../project-variables.json', import.meta.url), 'utf8'));
const projectVariableValues = new Map();
const appLatencyVariable = projectVariables.find((variable) => variable.id === 'project_var_app_latency');
if (appLatencyVariable) projectVariableValues.set(appLatencyVariable.id, appLatency);
const gatewayLatencyVariable = projectVariables.find((variable) => variable.id === 'project_var_gateway_latency');
if (gatewayLatencyVariable) projectVariableValues.set(gatewayLatencyVariable.id, 0);
const botUptimeVariable = projectVariables.find((variable) => variable.id === 'project_var_bot_uptime');
if (botUptimeVariable) projectVariableValues.set(botUptimeVariable.id, 0);
const botStatisticsVariable = projectVariables.find((variable) => variable.id === 'project_var_bot_statistics');
const commandStatistics = new CommandStatistics({ settings: __ARC_STATISTICS_SETTINGS__ });
function getBotStatisticsSnapshot() {
  const uptimeSeconds = botUptimeStartedAt === null
    ? 0
    : Math.floor((performance.now() - botUptimeStartedAt) / 1000);
  const gatewayLatency = gatewayLatencyVariable ? (projectVariableValues.get(gatewayLatencyVariable.id) ?? 0) : 0;
  return {
    uptimeSeconds,
    appLatencyMs: appLatency,
    gatewayLatencyMs: gatewayLatency,
    ...commandStatistics.getSummary()
  };
}
function updateBotStatistics() {
  if (botStatisticsVariable) {
    projectVariableValues.set(botStatisticsVariable.id, getBotStatisticsSnapshot());
  }
}
if (botStatisticsVariable) updateBotStatistics();
let botUptimeStartedAt = null;
let appLatencyProbeInFlight = false;
const appLatencyInterval = setInterval(async () => {
  if (appLatencyProbeInFlight) return;
  appLatencyProbeInFlight = true;
  const probeStartedAt = performance.now();
  try {
    await client.rest.getCurrentApplication();
    appLatency = Math.round(performance.now() - probeStartedAt);
  } catch {
    appLatency = 0;
  } finally {
    appLatencyProbeInFlight = false;
  }
  if (appLatencyVariable) projectVariableValues.set(appLatencyVariable.id, appLatency);
  updateBotStatistics();
}, 30000);
appLatencyInterval.unref?.();
const botUptimeInterval = setInterval(() => {
  if (botUptimeVariable) {
    projectVariableValues.set(botUptimeVariable.id, botUptimeStartedAt === null
      ? 0
      : Math.floor((performance.now() - botUptimeStartedAt) / 1000));
  }
  updateBotStatistics();
}, 1000);
botUptimeInterval.unref?.();
const resolveFunctionGraph = (graphId) => graphs.find((graph) => graph.id === graphId);
let stopCronScheduler = null;
let stopping = false;
const graphRunAbortController = new AbortController();
const activeGraphRuns = new Set();
async function deploySlashCommands() {
  const application = await client.rest.getCurrentApplication();
  if (!application?.id) throw new Error('Could not get the Discord application ID.');
  const desired = [];
  const names = new Set();
  for (const graph of graphs) for (const node of graph.nodes || []) {
    if (node.type !== 'event_slash_command') continue;
    const name = String(node.data?.commandName || '').trim().toLowerCase();
    const description = String(node.data?.description || '').trim();
    if (!name || !description) throw new Error('Every slash command needs a name and description before deployment.');
    if (names.has(name)) throw new Error('Duplicate slash command /' + name + ' is configured in more than one graph.');
    names.add(name);
    const optionErrors = validateSlashCommandOptions(node.data?.options || [], name);
    if (optionErrors.length) throw new Error(optionErrors.join(' '));
    if (flattenSlashParameters(node.data?.options).some(({ option }) => option?.autocomplete && option?.dynamicAutocomplete)
      && (!(graph.nodes || []).some((item) => item.type === 'event_slash_autocomplete') || !(graph.nodes || []).some((item) => item.type === 'action_respond_autocomplete'))) {
      throw new Error('Slash command /' + name + ' uses graph-generated suggestions but needs On Command Autocomplete and Respond to Autocomplete nodes.');
    }
    const options = normalizeSlashCommandOptions(node.data?.options || []);
    desired.push({ name, description, type: 1, ...(options.length ? { options } : {}), ...(node.data?.defaultMemberPermissions ? { default_member_permissions: String(node.data.defaultMemberPermissions) } : {}), ...(Array.isArray(node.data?.integrationTypes) ? { integration_types: node.data.integrationTypes } : {}), ...(Array.isArray(node.data?.contexts) ? { contexts: node.data.contexts } : {}) });
  }
  if (desired.length > 100) throw new Error('Discord allows at most 100 global slash commands.');
  const current = await client.rest.getGlobalApplicationCommands(application.id);
  const desiredByName = new Map(desired.map((command) => [command.name, command]));
  const payload = (Array.isArray(current) ? current : []).map((command) => {
    const raw = Object.fromEntries(['name', 'name_localizations', 'description', 'description_localizations', 'options', 'default_member_permissions', 'dm_permission', 'default_permission', 'integration_types', 'contexts', 'nsfw', 'type'].filter((key) => command[key] !== undefined).map((key) => [key, command[key]]));
    return Number(command.type || 1) === 1 && desiredByName.has(String(command.name).toLowerCase()) ? { ...raw, ...desiredByName.get(String(command.name).toLowerCase()) } : raw;
  });
  const existingNames = new Set((Array.isArray(current) ? current : []).filter((item) => Number(item.type || 1) === 1).map((item) => String(item.name).toLowerCase()));
  for (const command of desired) if (!existingNames.has(command.name)) payload.push(command);
  await client.rest.bulkOverwriteGlobalApplicationCommands(application.id, payload);
  return { deployed: desired.length };
}

client.on('ready', () => {
  writeLog('INFO', 'Connected as ' + (client.user?.username || 'Discord bot') + '; ' + graphs.length + ' graph(s) loaded.');
  stopCronScheduler?.();
  stopCronScheduler = startCronScheduler({
    getGraphs: () => graphs,
    dispatch: async (graph, _node, payload) => {
      const result = await trackGraphRun(GraphRunner.execute(graph, 'CRON_TICK', payload, graphContext(graph)));
      if (result.error && !graphRunAbortController.signal.aborted) writeLog('ERROR', '[Graph ' + graph.id + '] ' + result.error);
    },
    onError: ({ graph, node, error }) => writeLog('ERROR', '[Cron ' + graph.id + '/' + node.id + '] ' + formatError(error))
  });
  client.on('heartbeatLatency', (latencyMs) => {
    if (gatewayLatencyVariable) {
      const gatewayLatency = Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.round(latencyMs) : 0;
      projectVariableValues.set(gatewayLatencyVariable.id, gatewayLatency);
    }
    updateBotStatistics();
  });
});
client.on('gatewayDiagnostics', (diagnostics) => {
  if (diagnostics.sessionResumed === true) writeLog('INFO', 'Gateway session resumed successfully.');
  if (diagnostics.status === 'DISCONNECTED' && diagnostics.reconnectAttempts > 0) {
    writeLog('WARN', 'Gateway reconnecting (attempt ' + diagnostics.reconnectAttempts + (diagnostics.lastCloseCode == null ? '' : ', close ' + diagnostics.lastCloseCode) + ').');
  }
});
client.on('messageCreate', async (message) => {
  if (message.author?.id === client.user?.id) return;
  await dispatchGraphs('MESSAGE_CREATE', message);
});
client.on('interactionCreate', async (interaction) => {
  if (Number(interaction.type) === 4) {
    const commandName = String(interaction.data?.name || '').toLowerCase();
    const graph = graphs.find((item) => (item.nodes || []).some((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === commandName));
    const commandNode = graph?.nodes?.find((node) => node.type === 'event_slash_command' && String(node.data?.commandName || '').toLowerCase() === commandName);
    const findFocusedPath = (options, path = []) => {
      for (const option of options || []) {
        const next = [...path, option.name];
        if (option.focused) return { option, path: next };
        const nested = findFocusedPath(option.options, next);
        if (nested) return nested;
      }
      return null;
    };
    const focusedEntry = findFocusedPath(interaction.data?.options);
    const focused = focusedEntry?.option;
    let configuredOptions = commandNode?.data?.options || [];
    let configured = null;
    for (const optionName of focusedEntry?.path || []) {
      configured = configuredOptions.find((option) => option.name === optionName);
      configuredOptions = configured?.options || [];
    }
    if (configured?.autocomplete && configured.dynamicAutocomplete && graph?.nodes?.some((node) => node.type === 'event_slash_autocomplete')) {
      const interactionState = { applicationId: interaction.application_id || '', acknowledged: false, deferred: false, pending: null };
      await dispatchGraphs('INTERACTION_CREATE', interaction, graph.id, interactionState);
      if (!interactionState.acknowledged) {
        try { await client.rest.createInteractionResponse(interaction.id, interaction.token, { type: 8, data: { choices: [] } }); }
        catch (error) { writeLog('WARN', 'Autocomplete response failed for /' + commandName + ': ' + error.message); }
      }
      return;
    }
    const query = String(focused?.value ?? '').toLocaleLowerCase();
    const choices = configured?.autocomplete && Array.isArray(configured.choices)
      ? configured.choices.filter((choice) => String(choice.name || '').toLocaleLowerCase().includes(query)).slice(0, 25).map((choice) => ({
        name: String(choice.name || '').slice(0, 100),
        value: Number(configured.type) === 4 ? Number.parseInt(choice.value, 10) : Number(configured.type) === 10 ? Number(choice.value) : String(choice.value ?? '').slice(0, 100)
      }))
      : [];
    try { await client.rest.createInteractionResponse(interaction.id, interaction.token, { type: 8, data: { choices } }); }
    catch (error) { writeLog('WARN', 'Autocomplete response failed for /' + commandName + ': ' + error.message); }
    return;
  }
  if (Number(interaction.type) === 2) {
    const cmdName = String(interaction.data?.name || '').toLowerCase();
    const userId = interaction.member?.user?.id || interaction.user?.id;
    commandStatistics.recordCommand({ name: cmdName, userId });
    updateBotStatistics();
  }
  const eventName = interaction.data?.component_type ? 'BUTTON_CLICK' : 'INTERACTION_CREATE';
  await dispatchGraphs(eventName, interaction);
});
client.on('guildMemberAdd', async (member) => {
  await dispatchGraphs('GUILD_MEMBER_ADD', member);
});
client.on('error', (error) => writeLog('ERROR', 'Chezcord: ' + formatError(error)));
client.on('fatalError', (error) => { writeLog('ERROR', 'Fatal gateway error: ' + formatError(error)); process.exitCode = 1; void shutdown('fatal gateway error'); });
async function dispatchGraphs(eventName, payload, onlyGraphId = null, interactionState = null) {
  if (stopping || graphRunAbortController.signal.aborted) return;
  const run = Promise.all(graphs.filter((graph) => !onlyGraphId || graph.id === onlyGraphId).map(async (graph) => {
    try {
      const result = await GraphRunner.execute(graph, eventName, payload, graphContext(graph, payload, interactionState));
      if (result.error && !graphRunAbortController.signal.aborted) writeLog('ERROR', '[Graph ' + graph.id + '] Event ' + eventName + ' failed: ' + result.error);
    } catch (error) {
      writeLog('ERROR', '[Graph ' + graph.id + '] Event ' + eventName + ' failed: ' + formatError(error));
    }
  }));
  await trackGraphRun(run);
}
if (graphWebSockets) graphWebSockets.on('event', ({ eventName, payload }) => {
  dispatchGraphs(eventName, payload).catch((error) => writeLog('ERROR', 'WebSocket graph event ' + eventName + ' failed: ' + formatError(error)));
});
async function trackGraphRun(run) {
  activeGraphRuns.add(run);
  try { return await run; }
  finally { activeGraphRuns.delete(run); }
}
function graphContext(graph, eventPayload = null, interactionState = null) {
  return {
    rest: client.rest, client, resolveFunctionGraph, variablesState: variableState(graph), projectVariables, deploySlashCommands,
    webSockets: graphWebSockets,
    ...(interactionState ? { interactionState } : {}),
    canDeploySlashCommands: () => {
      let permissions = 0n;
      try { permissions = BigInt(String(eventPayload?.member?.permissions || 0)); } catch {}
      return (permissions & 8n) !== 0n || (permissions & 32n) !== 0n;
    },
    projectVariablesState: projectVariableValues, appEmojis, signal: graphRunAbortController.signal,
    log: () => {},
    onNodeError: (failure) => writeLog('ERROR', '[Graph ' + failure.graphId + '] Node ' + failure.nodeId + ': ' + failure.error)
  };
}
function variableState(graph) {
  if (!variables.has(graph.id)) variables.set(graph.id, new Map());
  return variables.get(graph.id);
}
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  writeLog('INFO', 'Received ' + signal + '; shutting down.');
  clearInterval(appLatencyInterval);
  clearInterval(botUptimeInterval);
  botUptimeStartedAt = null;
  if (botUptimeVariable) projectVariableValues.set(botUptimeVariable.id, 0);
  if (gatewayLatencyVariable) projectVariableValues.set(gatewayLatencyVariable.id, 0);
  stopCronScheduler?.();
  stopCronScheduler = null;
  graphWebSockets?.closeAll();
  graphRunAbortController.abort();
  try { client.destroy(); }
  catch (error) { writeLog('ERROR', 'Gateway shutdown error: ' + formatError(error)); process.exitCode = 1; }
  let timeout;
  try {
    await Promise.race([
      Promise.allSettled([...activeGraphRuns]),
      new Promise((resolve) => { timeout = setTimeout(resolve, 8000); })
    ]);
    if (timeout) clearTimeout(timeout);
    await PluginStore.closeProject().catch((error) => writeLog('WARN', 'Adapter shutdown warning: ' + formatError(error)));
    writeLog('INFO', 'Shutdown complete.');
    if (logStream) await new Promise((resolve) => logStream.end(resolve));
  }
  catch (error) { writeLog('ERROR', 'Shutdown error: ' + formatError(error)); process.exitCode = 1; }
}
process.once('SIGINT', () => { shutdown('SIGINT'); });
process.once('SIGTERM', () => { shutdown('SIGTERM'); });
botUptimeStartedAt = performance.now();
await client.login();
`;

const runtimeDependencyBootstrap = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies });
const missing = dependencies.filter((name) => !fs.existsSync(path.join(root, 'node_modules', ...name.split('/'), 'package.json')));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (missing.length) {
  console.log('Installing bot packages for the first run...');
  const result = spawnSync(npmCommand, ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const check = spawnSync(npmCommand, ['ls', '--depth=0', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32'
});
let tree;
try { tree = JSON.parse(check.stdout || '{}'); }
catch {
  console.error('[ERROR] Could not verify installed bot package versions with npm.');
  if (check.stderr) console.error(check.stderr.trim());
  process.exit(check.status || 1);
}
if (check.error) {
  console.error('[ERROR] Could not run npm to verify installed bot package versions.');
  console.error(check.error.message);
  process.exit(1);
}
const declaredDependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
const versionProblems = Object.keys(declaredDependencies).flatMap((name) => {
  const dependency = tree.dependencies?.[name];
  if (!dependency?.invalid && !dependency?.missing && dependency?.version) return [];
  return [{ name, dependency }];
});
if (versionProblems.length) {
  console.error('[ERROR] Installed bot packages do not meet package.json requirements:');
  for (const { name, dependency } of versionProblems) {
    const required = typeof dependency?.invalid === 'string' ? dependency.invalid : declaredDependencies[name];
    console.error('  - ' + name + ': installed ' + (dependency?.version || 'no version found') + ', requires ' + required);
  }
  console.error('Update the affected package with npm install, then run npm start again.');
  process.exit(1);
}
`;

const runtimeEnv = `import fs from 'node:fs';

const envPath = new URL('../.env', import.meta.url);
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/)) {
    const match = line.match(/^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(?:\"(.*)\"|'(.*)')$/, (_all, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted ?? '');
    process.env[match[1]] = value;
  }
}
`;

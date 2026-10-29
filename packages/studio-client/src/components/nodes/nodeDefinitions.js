import { getTemplateReferences, renderTextTemplate } from '../../../../studio-server/src/engine/TemplateExpressions.js';
import { functionArgumentPinId, functionInputPinType, getFunctionGraphArguments, getFunctionInputArguments } from '../../../../studio-server/src/engine/FunctionGraphContract.js';
import { getNodeArgumentPins, MAX_NODE_ARGUMENTS, NODE_SCHEMA_VERSION, resolveDynamicNodePins } from '../../../../studio-server/src/engine/DynamicNodePins.js';
import {
  CLIENT_PROTOCOL_VERSION, NODE_REGISTRY_PROTOCOL_VERSION, SUPPORTED_NODE_REGISTRY_FEATURES, getNodeRegistryCompatibility, validateNodeRegistryPayload
} from '../../../../studio-server/src/engine/NodeRegistryContract.js';
//
export let NodeCategories = Object.freeze({});
export { renderTextTemplate };
export { NODE_SCHEMA_VERSION };
export { CLIENT_PROTOCOL_VERSION, NODE_REGISTRY_PROTOCOL_VERSION, SUPPORTED_NODE_REGISTRY_FEATURES, getNodeRegistryCompatibility };

export const PinColors = {
  attachment: '#e8a34a',
  exec: 'var(--wire-exec)',
  variable: '#22c55e',
  arg: '#9299a6',
  string: '#c084fc',
  number: '#38bdf8',
  boolean: '#f87171',
  object: '#fbbf24',
  array: '#fb923c',
  embed: '#f472b6'
};

export { getNodeArgumentPins, MAX_NODE_ARGUMENTS, resolveDynamicNodePins };
export { functionArgumentPinId, functionInputPinType, getFunctionGraphArguments, getFunctionInputArguments };

export function getTextTemplateSlots(template) {
  const slots = new Set();
  const pattern = /(\\)?(\{\{\s*([^{}]+?)\s*\}\})/g;
  for (const match of String(template ?? '').matchAll(pattern)) {
    if (match[1]) continue;
    for (const reference of getTemplateReferences(match[3])) if (!reference.toLowerCase().startsWith('e_')) slots.add(reference);
  }
  return [...slots];
}

export function getNodeTemplateInputPins(node, inputs = [], variables = [], connections = []) {
  if (!node || !Array.isArray(inputs)) return [];
  const knownVariables = new Set(variables.map((variable) => variable.name?.toLowerCase()).filter(Boolean));
  const connectedInputs = new Set(connections.filter((wire) => wire.targetNodeId === node.id).map((wire) => wire.targetPinId));
  const slots = new Set();
  for (const pin of inputs) {
    if (!['string', 'number', 'arg'].includes(pin.type) || pin.id.startsWith('arg_') || pin.id.startsWith('slot_') || connectedInputs.has(pin.id)) continue;
    const value = node.data?.[pin.id];
    if (typeof value !== 'string') continue;
    for (const name of getTextTemplateSlots(value)) {
      if (knownVariables.has(name.toLowerCase()) || /^arg\d+$/i.test(name)) continue;
      slots.add(name);
    }
  }
  return [...slots].map((name) => ({ id: `slot_${name}`, label: name, type: 'arg', defaultValue: '' }));
}

export function createDefaultNodeData(type) {
  const definition = BuiltInNodeDefinitions.find((candidate) => candidate.type === type);
  const editorDefaults = Object.fromEntries((definition?.editorControls || [])
    .filter((control) => control.key && Object.hasOwn(control, 'defaultValue'))
    .map((control) => [control.key, control.defaultValue]));
  const nodeDefaults = definition?.defaultData || {};
  if (type === 'function_input') {
    return {
      ...nodeDefaults,
      arguments: [{ paramId: `param_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, name: 'Input', valueType: 'string', optional: false, defaultValue: '' }]
    };
  }
  const pluginDefinition = definition?.pluginAdapter ? definition : null;
  if (pluginDefinition) return {
    ...Object.fromEntries(pluginDefinition.inputs.filter((pin) => pin.type !== 'exec' && pin.defaultValue !== undefined).map((pin) => [pin.id, pin.defaultValue])),
    ...nodeDefaults,
    ...editorDefaults
  };
  return { ...nodeDefaults, ...editorDefaults };
}
//
export const BundledNodeTypes = new Set();
export const BuiltInNodeDefinitions = [];

export function setWorkspaceNodeDefinitions(definitions, categories = {}) {
  if (definitions === null) {
    adapterNodeTypes.clear();
    BuiltInNodeDefinitions.splice(0, BuiltInNodeDefinitions.length);
    BundledNodeTypes.clear();
    NodeCategories = Object.freeze({});
    return;
  }
  if (!Array.isArray(definitions)) throw new TypeError('Workspace node definitions must be an array.');
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)
    || Object.values(categories).some((category) => typeof category !== 'string' || !category.trim())) {
    throw new TypeError('Workspace returned invalid node categories.');
  }
  const normalized = definitions.map((definition) => {
    if (!definition || typeof definition.type !== 'string' || !definition.type.trim()
      || !Array.isArray(definition.inputs) || !Array.isArray(definition.outputs)) {
      throw new TypeError('Workspace returned an invalid node definition.');
    }
    const requiresGenericEditor = definition.pluginAdapter === true;
    return {
      ...definition,
      description: definition.description || 'Description unavailable',
      requiresGenericEditor,
      editorOnlyInputs: requiresGenericEditor ? definition.inputs : []
    };
  });
  adapterNodeTypes.clear();
  BuiltInNodeDefinitions.splice(0, BuiltInNodeDefinitions.length, ...normalized);
  BundledNodeTypes.clear();
  for (const definition of normalized) if (!definition.pluginAdapter) BundledNodeTypes.add(definition.type);
  NodeCategories = Object.freeze({ ...categories });
}

export function getNodeRegistryDefinitions(registry) {
  const issues = validateNodeRegistryPayload(registry, SUPPORTED_NODE_REGISTRY_FEATURES);
  if (issues.length) throw new TypeError(`Workspace returned an incompatible node registry. ${issues.join(' ')}`);
  const definitions = Array.isArray(registry?.definitions)
    ? registry.definitions
    : registry?.definitions && typeof registry.definitions === 'object'
      ? Object.values(registry.definitions)
      : null;
  return definitions;
}

export function getAvailableNodeDefinitions(definitions = BuiltInNodeDefinitions, supportedTypes = null, failedTypes = null) {
  const available = supportedTypes
    ? definitions.filter((definition) => definition.pluginAdapter || supportedTypes.has(definition.type))
    : [...definitions];
  const normalized = available.map((definition) => failedTypes?.has(definition.type) ? { ...definition, loadFailed: true } : definition);
  for (const type of failedTypes || []) {
    if (normalized.some((definition) => definition.type === type)) continue;
    normalized.push({ type, label: type, category: 'Unavailable', color: '#778196', description: '', inputs: [], outputs: [], loadFailed: true });
  }
  return normalized;
}

export function isNodeTypeSupported(type, supportedTypes = null, failedTypes = null) {
  if (failedTypes?.has(type)) return false;
  if (!supportedTypes || supportedTypes.has(type)) return true;
  return BuiltInNodeDefinitions.some((definition) => definition.type === type && definition.pluginAdapter);
}
//
const NODE_NEW_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const NODE_NEW_SEEN_DURATION = 10 * 60 * 1000;
function nodeNewSeenKey(userKey = 'anonymous') { return `arc_new_nodes_seen_v1:${encodeURIComponent(String(userKey || 'anonymous'))}`; }
function readNodeNewSeen(userKey) {
  try { const value = JSON.parse(localStorage.getItem(nodeNewSeenKey(userKey)) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function nodeDefinitionCreatedAt(definition) { return Date.parse(definition?.createdAt || definition?.introducedAt || ''); }
function nodeSeenId(definition) { return `${definition?.type || ''}@${definition?.createdAt || definition?.introducedAt || ''}`; }
export function getVisibleNewNodeDefinitions(definitions = [], userKey = 'anonymous', now = Date.now()) {
  const seen = readNodeNewSeen(userKey);
  return definitions.filter((definition) => {
    const createdAt = nodeDefinitionCreatedAt(definition); const age = now - createdAt;
    if (!Number.isFinite(createdAt) || age < 0 || age >= NODE_NEW_MAX_AGE) return false;
    const firstSeenAt = Number(seen[nodeSeenId(definition)]);
    return !Number.isFinite(firstSeenAt) || now - firstSeenAt < NODE_NEW_SEEN_DURATION;
  }).sort((a, b) => nodeDefinitionCreatedAt(b) - nodeDefinitionCreatedAt(a) || a.label.localeCompare(b.label)).slice(0, 5);
}
export function markNewNodeDefinitionsSeen(definitions = [], userKey = 'anonymous', now = Date.now()) {
  const seen = readNodeNewSeen(userKey); let changed = false;
  for (const definition of definitions) {
    const createdAt = nodeDefinitionCreatedAt(definition); const age = now - createdAt;
    const key = nodeSeenId(definition);
    if (Number.isFinite(createdAt) && age >= 0 && age < NODE_NEW_MAX_AGE && !Number.isFinite(Number(seen[key]))) { seen[key] = now; changed = true; }
  }
  if (changed) { try { localStorage.setItem(nodeNewSeenKey(userKey), JSON.stringify(seen)); } catch {} }
}
export function isNodeDefinitionNew(definition, now = Date.now(), userKey = 'anonymous') {
  const createdAt = nodeDefinitionCreatedAt(definition);
  const age = now - createdAt;
  if (!Number.isFinite(createdAt) || age < 0 || age >= NODE_NEW_MAX_AGE) return false;
  const firstSeenAt = Number(readNodeNewSeen(userKey)[nodeSeenId(definition)]);
  return !Number.isFinite(firstSeenAt) || now - firstSeenAt < NODE_NEW_SEEN_DURATION;
}

const adapterNodeTypes = new Set();
export function registerPluginNodeDefinitions(plugins = []) {
  for (let index = BuiltInNodeDefinitions.length - 1; index >= 0; index -= 1) {
    if (adapterNodeTypes.has(BuiltInNodeDefinitions[index].type)) BuiltInNodeDefinitions.splice(index, 1);
  }
  adapterNodeTypes.clear();
  for (const plugin of plugins) {
    if (!['wasm-adapter', 'host-adapter'].includes(plugin?.kind) || !Array.isArray(plugin.nodes)) continue;
    for (const node of plugin.nodes) {
      if (!node || typeof node.type !== 'string' || !node.type.startsWith(`${plugin.id}.`)) continue;
      const existing = BuiltInNodeDefinitions.find((definition) => definition.type === node.type);
      if (existing) {
        if (existing.description === 'Description unavailable' && node.description) existing.description = node.description;
        existing.pluginAdapter = true;
        existing.pluginId = plugin.id;
        existing.pluginName = plugin.name || plugin.id;
        existing.category = String(node.category || existing.category || plugin.name || plugin.id).trim().slice(0, 48);
        adapterNodeTypes.add(node.type);
        continue;
      }
      BuiltInNodeDefinitions.push({
        ...node,
        description: node.description || 'Description unavailable',
        category: String(node.category || plugin.name || plugin.id).trim().slice(0, 48),
        pluginAdapter: true,
        pluginId: plugin.id,
        pluginName: plugin.name || plugin.id
      });
      adapterNodeTypes.add(node.type);
    }
  }
}

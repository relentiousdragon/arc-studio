import { NODE_SCHEMA_VERSION } from './DynamicNodePins.js';
import { createHash } from 'node:crypto';
import { stableJson } from '../storage/Integrity.js';
import { NodeCategories, NodeDefinitions } from './NodeSchemaDefinitions.js';
import {
  CLIENT_PROTOCOL_VERSION, NODE_REGISTRY_PROTOCOL_VERSION, getNodeRegistryRequiredFeatures, validateNodeDefinitions
} from './NodeRegistryContract.js';
//
export { NODE_SCHEMA_VERSION };
export { CLIENT_PROTOCOL_VERSION, NODE_REGISTRY_PROTOCOL_VERSION };

export { NodeCategories, NodeDefinitions };

export const PinTypes = Object.freeze({
  EXEC: 'exec',
  VARIABLE: 'variable',
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARRAY: 'array',
  ARG: 'arg',
  EMBED: 'embed',
  ANY: 'any'
});

const builtInNodeTypes = new Set(Object.keys(NodeDefinitions));
let registryPayloadCache = null;
let failedNodeTypes = [];

export function assertValidNodeDefinitions(definitions = NodeDefinitions) {
  const issues = validateNodeDefinitions(definitions);
  if (issues.length) throw new TypeError(`Invalid node registry schema:\n${issues.map((issue) => `  ${issue}`).join('\n')}`);
  return true;
}

assertValidNodeDefinitions();

export function getNodeRegistryPayload() {
  if (registryPayloadCache) return registryPayloadCache;
  assertValidNodeDefinitions();
  const registry = {
    registryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
    schemaVersion: NODE_SCHEMA_VERSION,
    categories: NodeCategories,
    definitions: NodeDefinitions,
    failedNodeTypes,
    requiredFeatures: getNodeRegistryRequiredFeatures(Object.values(NodeDefinitions))
  };
  registryPayloadCache = Object.freeze({ ...registry, registryRevision: createHash('sha256').update(stableJson(registry)).digest('hex') });
  return registryPayloadCache;
}

export function registerFailedNodeTypes(types = []) {
  const nextTypes = [...new Set((Array.isArray(types) ? types : [])
    .filter((type) => typeof type === 'string' && type.trim() && !NodeDefinitions[type]))].sort();
  if (nextTypes.length === failedNodeTypes.length && nextTypes.every((type, index) => type === failedNodeTypes[index])) return;
  failedNodeTypes = nextTypes;
  registryPayloadCache = null;
}

const adapterNodeTypes = new Set();

export function registerAdapterNodeDefinitions(definitions = []) {
  const adapterIssues = definitions.length ? validateNodeDefinitions(definitions) : [];
  if (adapterIssues.length) throw new TypeError(`Invalid adapter node schemas:\n${adapterIssues.map((issue) => `  ${issue}`).join('\n')}`);
  const nextDefinitions = Object.fromEntries(Object.entries(NodeDefinitions).filter(([type]) => !adapterNodeTypes.has(type)));
  const nextAdapterTypes = new Set();
  for (const definition of definitions) {
    if (!definition || typeof definition.type !== 'string') continue;
    if (builtInNodeTypes.has(definition.type)) throw new TypeError(`Plugin node type ${definition.type} conflicts with a built in node.`);
    const normalized = {
      ...definition,
      pluginAdapter: true,
      inputs: Array.isArray(definition.inputs) ? definition.inputs : [],
      outputs: Array.isArray(definition.outputs) ? definition.outputs : []
    };
    nextDefinitions[normalized.type] = normalized;
    nextAdapterTypes.add(normalized.type);
  }
  assertValidNodeDefinitions(nextDefinitions);
  for (const key of Object.keys(NodeDefinitions)) delete NodeDefinitions[key];
  Object.assign(NodeDefinitions, nextDefinitions);
  adapterNodeTypes.clear();
  for (const type of nextAdapterTypes) adapterNodeTypes.add(type);
  registryPayloadCache = null;
}

import { NodeDefinitions } from './NodeRegistry.js';
import { getNodeArgumentPins, resolveDynamicNodePins } from './DynamicNodePins.js';
import { defaultValueForFunctionType, functionArgumentPinId, functionInputPinType, functionReturnInputPinId, functionReturnOutputPinId, getFunctionGraphArguments, getFunctionGraphReturnValues, getFunctionInputArguments, getFunctionReturnValues } from './FunctionGraphContract.js';
import { flattenSlashParameters, slashOptionPinId } from './SlashCommandOptions.js';
import { evaluateDataNode } from './nodes/runtime/data.js';
import { evaluateLogicNode } from './nodes/runtime/logic.js';
import { buildDiscordComponents, buildDiscordComponentsV2, buildDiscordModal, validateDiscordComponentsV2 } from './nodes/runtime/builders.js';
import {
  executeCountedLoop, executeParallelBranches, executeRepeatWhile, parseWaitUntilTime,
  selectIfBranch, selectSwitchBranch, validateDelayDuration, validateLoopCount,
  validateRepeatInterval, validateWaitConditionSettings, waitFor
} from './nodes/runtime/control_flow.js';
import { PluginStore } from './PluginStore.js';
import { EmbedBuilder, parseEmoji } from 'chezcord';
import { evaluateMathNode } from './MathOperations.js';
import { getTemplateReferences, isReservedTemplateRoot, renderTextTemplate } from './TemplateExpressions.js';
import { buildEventTemplateValues } from './EventTemplatePaths.js';
import { fieldLimitWarning } from './FieldLimits.js';
//
const DISCORD_GUILD_NODE_TYPES = new Set([
  'action_fetch_user', 'action_fetch_guild', 'action_fetch_member',
  'action_get_guild_member_permissions', 'action_get_guild_role_permissions',
  'action_get_channel_member_permissions', 'action_get_channel_role_permissions',
  'action_fetch_channel', 'action_fetch_channel_messages', 'action_fetch_message',
  'action_create_thread', 'action_start_thread_from_message',
  'action_create_channel', 'action_edit_channel', 'action_delete_channel',
  'action_create_role', 'action_member_role', 'action_moderate_member',
  'action_voice_channel_status', 'action_voice_state'
]);

function resolveFunctionReturnResult(returnNode, resolveInput) {
  const returnValues = getFunctionReturnValues(returnNode);
  if (returnValues.length === 1 && returnValues[0].legacy) {
    return resolveInput(returnNode, 'value', returnValues[0].defaultValue);
  }
  return Object.fromEntries(returnValues.map((value) => [
    value.returnId,
    resolveInput(returnNode, functionReturnInputPinId(value), value.defaultValue)
  ]));
}
const DISCORD_INTERACTION_NODE_TYPES = new Set([
  'action_reply_interaction', 'action_defer_reply', 'action_defer_update',
  'action_edit_interaction_reply', 'action_show_modal', 'action_respond_autocomplete'
]);
const NETWORK_NODE_TYPES = new Set(['action_http_download', 'action_web_fetch', 'action_web_retry']);
const WEBSOCKET_NODE_TYPES = new Set(['action_websocket_connect', 'action_websocket_send', 'action_websocket_close']);
const CRYPTO_NODE_TYPES = new Set([
  'action_crypto_hash', 'action_crypto_hmac', 'action_crypto_verify_hmac',
  'action_crypto_encrypt', 'action_crypto_decrypt', 'action_crypto_random'
]);

function findModalSubmittedValue(components, customId) {
  const visit = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      const component = item?.component || item;
      if (component?.custom_id === customId) return { found: true, value: component.values ?? component.value ?? null };
      const nested = visit(item?.components || component?.components || []);
      if (nested.found) return nested;
    }
    return { found: false, value: null };
  };
  return visit(components);
}

function getNodeInputs(node, connections = [], variables = []) {
  const inputs = getNodeBaseInputs(node, connections);
  const knownVariables = new Set(variables.map((variable) => variable.name?.toLowerCase()).filter(Boolean));
  const connectedInputs = new Set(connections.filter((wire) => wire.targetNodeId === node?.id).map((wire) => wire.targetPinId));
  const slots = new Set();
  for (const pin of inputs) {
    if (!['string', 'number', 'arg'].includes(pin.type) || pin.id.startsWith('arg_') || pin.id.startsWith('slot_') || connectedInputs.has(pin.id)) continue;
    const value = node?.data?.[pin.id];
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(/(\\)?\{\{\s*([^{}]+?)\s*\}\}/g)) {
      if (match[1]) continue;
      for (const name of getTemplateReferences(match[2])) {
        if (!knownVariables.has(name.toLowerCase()) && !/^arg\d+$/i.test(name)) slots.add(name);
      }
    }
  }
  const argumentPins = getNodeArgumentPins(node, inputs, connections);
  const existingIds = new Set(inputs.map((pin) => pin.id));
  return [...inputs, ...argumentPins.filter((pin) => !existingIds.has(pin.id)), ...[...slots].map((name) => ({ id: `slot_${name}`, label: name, type: 'arg', defaultValue: '' }))];
}

function getNodeBaseInputs(node, connections = []) {
  const schemaPins = resolveDynamicNodePins(NodeDefinitions[node?.type], node, connections);
  return schemaPins?.inputs || NodeDefinitions[node?.type]?.inputs || [];
}

function extractThreadId(payload) {
  if (!payload) return '';
  if (payload.thread_id) return String(payload.thread_id);
  if (payload.thread?.id) return String(payload.thread.id);
  if (payload.message?.thread?.id) return String(payload.message.thread.id);
  const channelType = Number(payload.channel?.type);
  if ([10, 11, 12].includes(channelType)) {
    return String(payload.channel?.id || payload.channel_id || '');
  }
  return '';
}

function getNodeOutputs(node, connections = []) {
  const schemaPins = resolveDynamicNodePins(NodeDefinitions[node?.type], node, connections);
  const outputs = schemaPins?.outputs || NodeDefinitions[node?.type]?.outputs || [];
  if (node?.type === 'parallel') {
    const connected = connections.filter((wire) => wire.sourceNodeId === node.id).map((wire) => wire.sourcePinId);
    const highest = connected.reduce((value, id) => Math.max(value, Number(id.match(/^branch_(\d+)_exec$/)?.[1] || (id === 'branch_a_exec' ? 1 : id === 'branch_b_exec' ? 2 : 0))), 2);
    return [...outputs, ...Array.from({ length: Math.max(0, Math.min(16, highest + 1) - 2) }, (_, index) => ({ id: `branch_${index + 3}_exec`, label: `Branch ${index + 3}`, type: 'exec' }))];
  }
  return outputs;
}

export class GraphRunner {
  /**
   * Execute a graph for a specific Discord event
   * @param {object} graph - { nodes: [], connections: [] }
   * @param {string} eventName - e.g. 'MESSAGE_CREATE'
   * @param {object} eventPayload - event data
   * @param {object} context - { rest, client, log }
   * @returns {Promise<{ executedNodeIds: string[], traces: string[], error: any }>}
   */
  static async execute(graph, eventName, eventPayload, context) {
    const { nodes = [], connections = [] } = graph;
    const interactionState = context.interactionState || {
      applicationId: eventPayload?.application_id || '',
      acknowledged: false,
      deferred: false,
      pending: null
    };
    const executedNodeIds = [];
    const traces = [];
    const debugSteps = [];
    const runStartedAt = performance.now();
    const nodeTimings = [];
    const wirePath = [];
    let previousNodeStartedAt = null;
    let previousNodePauseTotalMs = 0;
    let debugPausedMs = 0;
    if (eventName === 'FUNCTION_CALL' && nodes.filter((node) => node.type === 'function_return').length > 1) {
      return { executedNodeIds, traces, debugSteps, nodeTimings, wirePath, result: undefined, error: 'A function graph can have only one Return Value node.' };
    }
    const repeatLoopStack = [];
    let functionReturnValue;
    let eventTemplateValues = {};
    const recordExecutedNode = (nodeId) => {
      executedNodeIds.push(nodeId);
      if (executedNodeIds.length > 500) executedNodeIds.shift();
    };
    const dataCache = new Map(); // `${nodeId}:${pinId}` -> value
    const functionCallResultCache = new Map();
    const declaredGraphVariables = Array.isArray(graph.variables) ? graph.variables.filter((variable) => variable && typeof variable.id === 'string') : [];
    const inferReferencedVariableType = (node, seen = new Set()) => {
      if (!node || seen.has(node.id)) return null;
      const nextSeen = new Set(seen).add(node.id);
      if (node.type === 'variable_create') return inferCreatedVariableType(node, nextSeen);
      const referenceWire = connections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'variable');
      if (referenceWire) {
        const source = nodes.find((item) => item.id === referenceWire.sourceNodeId);
        if (source && ['variable_create', 'variable_get', 'variable_set'].includes(source.type)) return inferReferencedVariableType(source, nextSeen);
      }
      const variableId = node.data?.variableId;
      const created = nodes.find((item) => item.type === 'variable_create' && `nodevar_${item.id}` === variableId);
      if (created) return inferCreatedVariableType(created, nextSeen);
      return declaredGraphVariables.find((variable) => variable.id === variableId)?.type || null;
    };
    const inferCreatedVariableType = (node, seen = new Set()) => {
      const key = node?.id;
      if (!node || seen.has(key)) return null;
      const nextSeen = new Set(seen).add(key);
      const valueWire = connections.find((wire) => wire.targetNodeId === node.id && wire.targetPinId === 'value');
      if (!valueWire) return ['string', 'number', 'boolean', 'array', 'object'].includes(node.data?.valueType) ? node.data.valueType : 'string';
      const source = nodes.find((item) => item.id === valueWire.sourceNodeId);
      if (!source) return null;
      if (source.type === 'variable_create' && valueWire.sourcePinId === 'value') return inferCreatedVariableType(source, nextSeen);
      if (source.type === 'variable_get' && valueWire.sourcePinId === 'value') {
        return inferReferencedVariableType(source, nextSeen);
      }
      const sourcePin = NodeDefinitions[source.type]?.outputs?.find((pin) => pin.id === valueWire.sourcePinId);
      let type = sourcePin?.type || null;
      if (type === 'object' && (['data_array_create', 'data_array_append', 'data_array_concat'].includes(source.type) || source.type === 'data_regex' && ['captures', 'matches'].includes(sourcePinId))) type = 'array';
      if (source.type === 'data_parse_json' && !connections.some((wire) => wire.targetNodeId === source.id && wire.targetPinId === 'json')) {
        try { type = Array.isArray(JSON.parse(source.data?.json || '')) ? 'array' : 'object'; } catch { }
      }
      return ['string', 'number', 'boolean', 'array', 'object'].includes(type) ? type : null;
    };
    const staticCreatedVariableNames = nodes.filter((node) => node.type === 'variable_create')
      .map((node) => String(node.data?.name || '').trim())
      .filter((name) => name && !name.includes('{{') && /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name));
    const usedVariableNames = new Set([...declaredGraphVariables.map((variable) => variable?.name), ...staticCreatedVariableNames].map((name) => String(name || '').toLowerCase()).filter(Boolean));
    const attachmentVariables = nodes.filter((node) => node.type === 'event_slash_command').flatMap((node) => {
      const commandName = String(node.data?.commandName || 'command').replace(/[^A-Za-z0-9_-]/g, '_');
      return flattenSlashParameters(node.data?.options).filter(({ option }) => Number(option?.type) === 11).map(({ option, path }) => {
        const baseName = `${commandName}_${path.join('_')}`.slice(0, 64);
        let name = baseName;
        let suffix = 2;
        while (usedVariableNames.has(name.toLowerCase())) {
          const marker = `_${suffix++}`;
          name = `${baseName.slice(0, 64 - marker.length)}${marker}`;
        }
        usedVariableNames.add(name.toLowerCase());
        return {
          id: `slash_attachment_${node.id}_${path.join('.')}`,
          name,
          type: 'attachment',
          initialValue: { id: '', filename: '', url: '', content_type: '', size: 0 },
          persist: false,
          readOnly: true,
          sourceNodeId: node.id,
          sourceOptionName: option.name,
          sourceOptionPinId: slashOptionPinId(path)
        };
      });
    });
    const graphVariables = [...declaredGraphVariables, ...attachmentVariables];
    const projectVariables = Array.isArray(context.projectVariables) ? context.projectVariables.filter((variable) => variable && typeof variable.id === 'string') : [];
    const localVariableDefinitions = new Map(graphVariables.map((variable) => [variable.id, variable]));
    const projectVariableDefinitions = new Map(projectVariables.map((variable) => [variable.id, variable]));
    const persistentVariableValues = context.variablesState instanceof Map ? context.variablesState : new Map();
    const runVariableValues = new Map();
    const projectVariableValues = context.projectVariablesState instanceof Map ? context.projectVariablesState : new Map();
    const runtimeSecretValues = new Set();
    const registerRuntimeSecretValue = (value, seen = new Set()) => {
      if (value === null || value === undefined || seen.has(value) && typeof value === 'object') return;
      runtimeSecretValues.add(value);
      if (typeof value === 'object') {
        seen.add(value);
        for (const child of Object.values(value)) registerRuntimeSecretValue(child, seen);
      }
    };
    const initializeVariableValues = (definitions, values, runValues = null, scope = 'graph', sourceGraph = graph) => {
      for (const variable of definitions.values()) {
        const secretInitialValue = variable.secret ? context.getSecretVariableValue?.(variable.id, scope, sourceGraph) : undefined;
        const initialValue = secretInitialValue === undefined
          ? variable.secret ? defaultValueForType(variable.valueType || variable.type) : variable.initialValue
          : secretInitialValue;
        if (runValues && variable.persist === false) {
          const runValue = coerceVariableValue(initialValue, variable.valueType || variable.type, initialValue);
          runValues.set(variable.id, runValue);
          values.set(variable.id, runValue);
          if (variable.secret) {
            registerRuntimeSecretValue(initialValue);
            registerRuntimeSecretValue(runValue);
          }
          continue;
        }
        const current = values.has(variable.id) ? values.get(variable.id) : initialValue;
        values.set(variable.id, coerceVariableValue(current, variable.valueType || variable.type, initialValue));
        if (variable.secret) {
          registerRuntimeSecretValue(initialValue);
          registerRuntimeSecretValue(values.get(variable.id));
        }
      }
      for (const variableId of values.keys()) if (!definitions.has(variableId)) values.delete(variableId);
    };
    initializeVariableValues(localVariableDefinitions, persistentVariableValues, runVariableValues);
    initializeVariableValues(projectVariableDefinitions, projectVariableValues, null, 'project', graph);
    const getVariableValue = (variableId, scope = 'graph') => {
      if (scope === 'project') return projectVariableValues.get(variableId);
      const definition = localVariableDefinitions.get(variableId);
      if (definition?.readOnly && definition.type === 'attachment') return dataCache.get(`${definition.sourceNodeId}:${definition.sourceOptionPinId || `option_${definition.sourceOptionName}`}`) ?? null;
      return (definition?.persist === false ? runVariableValues : persistentVariableValues).get(variableId);
    };
    const variableReference = (variableId, scope = 'graph') => variableId
      ? { __arcVariableRef: true, variableId, scope: scope === 'project' ? 'project' : 'graph' }
      : null;
    const resolveVariableReference = (node, seen = new Set()) => {
      if (seen.has(node.id)) return variableReference(node.data?.variableId, node.data?.scope);
      const nextSeen = new Set(seen).add(node.id);
      const wire = findInputConnection(node.id, 'variable');
      if (wire) {
        const connected = resolveOutput(nodes.find((item) => item.id === wire.sourceNodeId), wire.sourcePinId, nextSeen);
        if (connected?.__arcVariableRef && typeof connected.variableId === 'string') return connected;
      }
      return variableReference(node.data?.variableId, node.data?.scope);
    };
    const createRuntimeVariable = (node, { scope, name, type, value, persist }) => {
      const normalizedScope = scope === 'project' ? 'project' : 'graph';
      const variableId = normalizedScope === 'project'
        ? `project_var_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`}`
        : `nodevar_${node.id}`;
      const coerced = coerceVariableValue(value, type, value);
      const definition = {
        id: variableId,
        name,
        type,
        valueType: type,
        initialValue: coerced,
        persist: normalizedScope === 'project' ? true : persist !== false,
        runtimeCreated: true
      };
      if (normalizedScope === 'project') {
        projectVariables.push(definition);
        projectVariableDefinitions.set(variableId, definition);
        projectVariableValues.set(variableId, coerced);
      } else {
        graphVariables.push(definition);
        localVariableDefinitions.set(variableId, definition);
        persistentVariableValues.set(variableId, coerced);
        if (definition.persist === false) runVariableValues.set(variableId, coerced);
      }
      try {
        context.onVariableCreated?.({ id: variableId, scope: normalizedScope, name, type, value: coerced, persist: definition.persist, graphId: graph.id });
      } catch {}
      return definition;
    };
    const setVariableValue = (variableId, scope, value, definition) => {
      if (definition?.readOnly) throw new Error(`Variable “${definition.name}” is read only.`);
      const values = scope === 'project' ? projectVariableValues : definition?.persist === false ? runVariableValues : persistentVariableValues;
      const fallback = values.get(variableId);
      values.set(variableId, coerceVariableValue(value, definition?.valueType || definition?.type, fallback ?? definition?.initialValue));
      if (definition?.secret) registerRuntimeSecretValue(values.get(variableId));
      return values.get(variableId);
    };
    const secretValuesForRedaction = () => {
      const secrets = new Set(runtimeSecretValues);
      for (const variable of [...graphVariables, ...projectVariables]) {
        if (variable.secret) secrets.add(getVariableValue(variable.id, projectVariableDefinitions.has(variable.id) ? 'project' : 'graph'));
      }
      return secrets;
    };

    const redactSecretText = (message) => {
      const text = String(message ?? '');
      for (const value of secretValuesForRedaction()) {
        if (value === null || value === undefined || value === '') continue;
        if (typeof value === 'string' && value && text.includes(value)) return '[redacted]';
        if (value && typeof value === 'object') {
          try {
            const serialized = JSON.stringify(value);
            if (serialized.length > 2 && text.includes(serialized)) return '[redacted]';
          } catch { }
        }
        if (typeof value === 'boolean' && new RegExp(`\\b${value}\\b`, 'i').test(text)) return '[redacted]';
        if (typeof value === 'number' && Number.isFinite(value)) {
          const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`).test(text)) return '[redacted]';
        }
      }
      return text;
    };
    const containsSecretValue = (value) => {
      if (value === null || value === undefined) return false;
      for (const secret of secretValuesForRedaction()) {
        if (secret === null || secret === undefined || secret === '') continue;
        if (typeof value === 'string' && typeof secret === 'string' && value.includes(secret)) return true;
        if (typeof value === 'string' && typeof secret === 'boolean' && new RegExp(`\\b${secret}\\b`, 'i').test(value)) return true;
        if (typeof value === 'string' && typeof secret === 'number' && Number.isFinite(secret)) {
          const escaped = String(secret).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`).test(value)) return true;
        }
        if (value && typeof value === 'object' && secret && typeof secret === 'object') {
          try { if (JSON.stringify(value) === JSON.stringify(secret)) return true; } catch { }
        }
        if (typeof value === 'string' && secret && typeof secret === 'object') {
          try {
            const serialized = JSON.stringify(secret);
            if (serialized.length > 2 && value.includes(serialized)) return true;
          } catch { }
        }
        if (typeof value !== 'object' && Object.is(value, secret)) return true;
        if (Array.isArray(value) ? value.some(containsSecretValue) : typeof value === 'object' && Object.values(value).some(containsSecretValue)) return true;
      }
      return false;
    };
    const log = (msg, level = 'EXECUTION', meta = null) => {
      msg = redactSecretText(msg);
      const loop = repeatLoopStack.at(-1);
      if (loop && loop.iteration > 1) {
        const now = Date.now();
        if (now - loop.lastLogAt < 30_000) return;
        loop.lastLogAt = now;
      } else if (loop) {
        loop.lastLogAt = Date.now();
      }
      traces.push(msg);
      if (traces.length > 2000) traces.shift();
      if (context.log) context.log(msg, level, meta);
    };
    const warnedTemplateExpressions = new Set();
    const warnUndefinedTemplate = (node, expression, references = []) => {
      const key = `${node?.id || 'graph'}:${expression}`;
      if (warnedTemplateExpressions.has(key)) return;
      warnedTemplateExpressions.add(key);
      const names = references.length ? references.join(', ') : expression;
      log(`[Template] Undefined or null value for ${names} in ${node?.label || node?.type || 'graph'} (${node?.id || graph.id}).`, 'WARN', { graphId: graph.id, nodeId: node?.id });
    };
    const resolveFunctionVariable = (variableId, scope, functionGraph) => {
      if (scope === 'project') return getVariableValue(variableId, 'project');
      const definitions = new Map((functionGraph.variables || []).map((variable) => [variable.id, variable]));
      const state = context.getGraphVariableState?.(functionGraph) || (functionGraph.id === graph.id ? persistentVariableValues : new Map());
      initializeVariableValues(definitions, state, null, 'graph', functionGraph);
      const variable = definitions.get(variableId);
      return variable?.persist === false
        ? coerceVariableValue(variable.secret ? context.getSecretVariableValue?.(variableId, 'graph', functionGraph) ?? defaultValueForType(variable.valueType || variable.type) : variable.initialValue, variable.valueType || variable.type, variable.initialValue)
        : state.get(variableId);
    };
    const resolveTemplateGraphFunction = (name, values, callStack = [graph.id]) => {
      const targetGraph = context.resolveFunctionGraphByName?.(name);
      const isFunction = targetGraph?.graphType === 'function' || (targetGraph?.nodes || []).some((node) => ['function_input', 'function_return'].includes(node?.type));
      if (!targetGraph || !isFunction || callStack.length >= 24 || callStack.includes(targetGraph.id)) return undefined;
      const parameters = getFunctionGraphArguments(targetGraph);
      if (values.length > parameters.length || parameters.some((parameter, index) => parameter.optional === false && values[index] === undefined)) return undefined;
      const argumentValues = new Map(parameters.map((parameter, index) => [
        parameter.paramId,
        values[index] === undefined ? parameter.defaultValue ?? defaultValueForFunctionType(parameter.valueType) : values[index]
      ]));
      try {
        const result = evaluateFunctionGraph(targetGraph, argumentValues, {
          ...context,
          resolveFunctionVariable,
          resolveTemplateFunction: (nestedName, nestedValues, _nestedGraph, nestedStack) => resolveTemplateGraphFunction(nestedName, nestedValues, nestedStack)
        }, callStack);
        const returns = getFunctionGraphReturnValues(targetGraph);
        if (returns.length === 1) return returns[0].legacy ? result : result?.[returns[0].returnId];
        if (!returns.length || !result || typeof result !== 'object') return undefined;
        const output = {};
        for (const item of returns) {
          const value = result[item.returnId];
          for (const key of [item.name, item.returnId]) {
            if (key && !['__proto__', 'prototype', 'constructor'].includes(key)) Object.defineProperty(output, key, { value, enumerable: true, configurable: true, writable: true });
          }
        }
        return output;
      } catch {
        return undefined;
      }
    };

    const debugValue = (value, pinId = '') => {
      if (containsSecretValue(value)) return '[redacted]';
      if (/(token|secret|passphrase|password|ciphertext|headers|response_body|^body$|^json$|^url$)/i.test(pinId)) return '[redacted]';
      if (typeof value === 'string') return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
      if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
      try {
        const encoded = JSON.stringify(value);
        return encoded.length > 4000 ? `${encoded.slice(0, 4000)}…` : JSON.parse(encoded);
      } catch { return '[unavailable]'; }
    };
    const recordNodeTiming = (node, startedAt, incomingWire = null, status = 'completed') => {
      const endedAt = performance.now();
      const incoming = incomingWire ? {
        id: incomingWire.id || `${incomingWire.sourceNodeId}:${incomingWire.sourcePinId}->${incomingWire.targetNodeId}:${incomingWire.targetPinId}`,
        sourceNodeId: incomingWire.sourceNodeId,
        sourcePinId: incomingWire.sourcePinId,
        targetNodeId: incomingWire.targetNodeId,
        targetPinId: incomingWire.targetPinId
      } : null;
      const timing = {
        nodeId: node.id,
        status,
        durationMs: Math.round((endedAt - startedAt) * 100) / 100,
        elapsedMs: Math.round(Math.max(0, endedAt - runStartedAt - debugPausedMs) * 100) / 100,
        sincePreviousNodeMs: previousNodeStartedAt === null ? null : Math.round(Math.max(0, startedAt - previousNodeStartedAt - (debugPausedMs - previousNodePauseTotalMs)) * 100) / 100,
        ...(incoming ? { incomingWire: incoming } : {})
      };
      previousNodeStartedAt = startedAt;
      previousNodePauseTotalMs = debugPausedMs;
      nodeTimings.push(timing);
      if (incoming) wirePath.push(incoming);
      return timing;
    };
    const recordDebugStep = async (node, inputs = [], status = 'completed', error = '', timing = null) => {
      if (!context.debug) return;
      const outputs = getNodeOutputs(node, connections).filter((pin) => pin.type !== 'exec').flatMap((pin) => {
        const key = `${node.id}:${pin.id}`;
        const resolved = dataCache.has(key) ? dataCache.get(key) : resolveOutput(node, pin.id);
        return resolved !== undefined ? [{ pinId: pin.id, label: pin.label || pin.id, value: debugValue(resolved, pin.id) }] : [];
      });
      const step = { nodeId: node.id, type: node.type, label: node.label || NodeDefinitions[node.type]?.label || node.type, status, inputs, outputs, ...(timing || {}), ...(error ? { error: redactSecretText(error) } : {}) };
      debugSteps.push(step);
      if (debugSteps.length > 500) debugSteps.shift();
      const pause = await context.onDebugStep?.(step);
      debugPausedMs += Math.max(0, Number(pause?.pausedDurationMs) || 0);
    };

    const findInputConnection = (nodeId, pinId) => {
      return connections.find((c) => c.targetNodeId === nodeId && c.targetPinId === pinId);
    };

    const resolveMessageFiles = (node, connectedFiles) => {
      const embedWire = findInputConnection(node.id, 'embed');
      const embedNode = embedWire && nodes.find((item) => item.id === embedWire.sourceNodeId);
      const componentsWire = findInputConnection(node.id, 'components');
      const componentsNode = componentsWire && nodes.find((item) => item.id === componentsWire.sourceNodeId);
      let normalizedConnectedFiles = connectedFiles;
      if (typeof normalizedConnectedFiles === 'string') {
        try { normalizedConnectedFiles = JSON.parse(normalizedConnectedFiles); } catch { normalizedConnectedFiles = []; }
      }
      const files = [...(Array.isArray(normalizedConnectedFiles) ? normalizedConnectedFiles : normalizedConnectedFiles?.filename && normalizedConnectedFiles?.data ? [normalizedConnectedFiles] : []), ...(Array.isArray(node.data?.attachments) ? node.data.attachments : []), ...(Array.isArray(embedNode?.data?.attachments) ? embedNode.data.attachments : []), ...(Array.isArray(componentsNode?.data?.attachments) ? componentsNode.data.attachments : [])];
      const unique = new Map();
      for (const file of files) if (file?.filename && file?.data) unique.set(String(file.filename).toLowerCase(), file);
      return [...unique.values()];
    };

    const findExecOutputs = (nodeId, pinId = 'exec') => {
      const seenTargets = new Set();
      return connections.filter((connection) => {
        if (connection.sourceNodeId !== nodeId || connection.sourcePinId !== pinId) return false;
        const key = `${connection.targetNodeId}\u0000${connection.targetPinId}`;
        if (seenTargets.has(key)) return false;
        seenTargets.add(key);
        return true;
      });
    };
    const findExecContinuation = (nodeId, inputPinId = 'exec') => {
      const outputPinId = inputPinId === 'exec' ? 'exec' : inputPinId;
      return findExecOutputs(nodeId, outputPinId);
    };

    const invalidateDataDependencies = (nodeId, pinId, seen = new Set()) => {
      const key = `${nodeId}:${pinId}`;
      if (seen.has(key)) return;
      seen.add(key);
      const source = nodes.find((item) => item.id === nodeId);
      if (!source) return;
      if (['variable_get', 'function_call', 'format_text', 'build_embed', 'build_modal', 'build_components', 'data_get_modal_value', 'modify_embed'].includes(source.type)
        || source.type.startsWith('math_') || source.type.startsWith('logic_') || source.type.startsWith('data_') || source.type.startsWith('value_') || source.type === 'compare_text') {
        for (const cacheKey of dataCache.keys()) if (cacheKey.startsWith(`${source.id}:`)) dataCache.delete(cacheKey);
      }
      for (const wire of connections.filter((item) => item.targetNodeId === source.id)) invalidateDataDependencies(wire.sourceNodeId, wire.sourcePinId, seen);
    };

    const resolveOutput = (sourceNode, pinId, seen = new Set()) => {
      if (!sourceNode) return undefined;
      if (sourceNode.type === 'utility_wire_extender' && (/^value_out_\d+$/.test(pinId) || pinId === 'value_out')) {
        const slot = pinId.match(/\d+$/)?.[0] || '1';
        const cacheKey = `${sourceNode.id}:${pinId}`;
        if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
        if (seen.has(cacheKey)) return undefined;
        seen.add(cacheKey);
        const value = resolveDataInput(sourceNode, slot === '1' && getNodeInputs(sourceNode, connections, [...graphVariables, ...projectVariables]).some((pin) => pin.id === 'value_in') ? 'value_in' : `value_in_${slot}`, undefined, seen);
        dataCache.set(cacheKey, value);
        return value;
      }
      if (sourceNode.type === 'loop_count' && pinId === 'index') return dataCache.get(`${sourceNode.id}:index`);
      if (sourceNode.type === 'repeat_while' && pinId === 'iteration') return dataCache.get(`${sourceNode.id}:iteration`);
      if (sourceNode.type === 'variable_get') {
        if (pinId === 'variable') return resolveVariableReference(sourceNode, seen);
        const reference = resolveVariableReference(sourceNode, seen);
        return reference ? getVariableValue(reference.variableId, reference.scope) : undefined;
      }
      if (sourceNode.type === 'variable_create' && pinId === 'variable') {
        return dataCache.get(`${sourceNode.id}:variable`) || variableReference(`nodevar_${sourceNode.id}`, 'graph');
      }
      if (sourceNode.type === 'variable_create' && pinId === 'value') {
        if (dataCache.has(`${sourceNode.id}:value`)) return dataCache.get(`${sourceNode.id}:value`);
        const reference = dataCache.get(`${sourceNode.id}:variable`);
        return getVariableValue(reference?.variableId || `nodevar_${sourceNode.id}`, reference?.scope === 'project' ? 'project' : 'graph');
      }
      if (sourceNode.type === 'variable_set' && pinId === 'variable') return resolveVariableReference(sourceNode, seen);
      if (sourceNode.type === 'function_input') {
        const argument = getFunctionInputArguments(sourceNode).find((item) => functionArgumentPinId(item) === pinId);
        if (argument) return dataCache.has(`${sourceNode.id}:${pinId}`)
          ? dataCache.get(`${sourceNode.id}:${pinId}`)
          : eventPayload?.argumentValues instanceof Map && eventPayload.argumentValues.has(argument.paramId)
            ? eventPayload.argumentValues.get(argument.paramId)
            : argument.defaultValue;
        const cacheKey = `${sourceNode.id}:value`;
        if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
        return sourceNode.data?.defaultValue ?? defaultValueForType(sourceNode.data?.valueType);
      }
      if (sourceNode.type === 'build_modal' && pinId === 'modal') {
        const modal = buildDiscordModal(sourceNode.data?.modal, (value) => renderNodeTemplate(sourceNode, value));
        dataCache.set(`${sourceNode.id}:modal`, modal);
        return modal;
      }
      if (sourceNode.type === 'data_get_modal_value') {
        const submitted = resolveDataInput(sourceNode, 'submitted_values', [], seen);
        const customId = String(resolveDataInput(sourceNode, 'custom_id', '', seen));
        const result = findModalSubmittedValue(submitted, customId);
        dataCache.set(`${sourceNode.id}:found`, result.found);
        dataCache.set(`${sourceNode.id}:value`, result.value);
        return result[pinId];
      }
      const cacheKey = `${sourceNode.id}:${pinId}`;
      if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
      if (seen.has(cacheKey)) return undefined;
      seen.add(cacheKey);

      if (sourceNode.type.startsWith('data_')) {
        const definition = NodeDefinitions[sourceNode.type];
        const inputs = Object.fromEntries(getNodeInputs(sourceNode, connections, [...graphVariables, ...projectVariables]).map((pin) => [pin.id, resolveDataInput(sourceNode, pin.id, pin.defaultValue, seen)]));
        const result = evaluateDataNode(sourceNode.type, inputs, sourceNode.data || {});
        for (const [id, value] of Object.entries(result)) dataCache.set(`${sourceNode.id}:${id}`, value);
        return result[pinId];
      }

      if (sourceNode.type.startsWith('value_')) {
        const defaultValue = NodeDefinitions[sourceNode.type]?.inputs?.find((pin) => pin.id === 'value')?.defaultValue;
        const value = resolveDataInput(sourceNode, 'value', sourceNode.data?.value ?? defaultValue, seen);
        dataCache.set(cacheKey, value);
        return value;
      }
      if (sourceNode.type === 'compare_text') {
        const textA = String(resolveDataInput(sourceNode, 'text_a', sourceNode.data?.text_a || '', seen));
        const textB = String(resolveDataInput(sourceNode, 'text_b', sourceNode.data?.text_b || '', seen));
        const operator = sourceNode.data?.operator || 'equals';
        const comparisons = {
          equals: () => textA === textB,
          contains: () => textA.includes(textB),
          startsWith: () => textA.startsWith(textB),
          endsWith: () => textA.endsWith(textB)
        };
        const result = comparisons[operator]?.() || false;
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'function_math') {
        const a = Number(resolveDataInput(sourceNode, 'a', 0, seen));
        const b = Number(resolveDataInput(sourceNode, 'b', 0, seen));
        const operation = sourceNode.data?.operation || 'add';
        const result = operation === 'subtract' ? a - b
          : operation === 'multiply' ? a * b
            : operation === 'divide' ? (b === 0 ? 0 : a / b)
              : operation === 'modulo' ? (b === 0 ? 0 : a % b) : a + b;
        const finite = Number.isFinite(result) ? result : 0;
        dataCache.set(cacheKey, finite);
        return finite;
      }
      if (sourceNode.type.startsWith('logic_')) {
        const definition = NodeDefinitions[sourceNode.type];
        const values = Object.fromEntries((definition?.inputs || []).map((pin) => [pin.id, Boolean(resolveDataInput(sourceNode, pin.id, pin.defaultValue, seen))]));
        const result = evaluateLogicNode(sourceNode.type, values);
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type.startsWith('math_')) {
        const inputs = Object.fromEntries((NodeDefinitions[sourceNode.type]?.inputs || []).map((pin) => [
          pin.id,
          resolveDataInput(sourceNode, pin.id, pin.defaultValue, seen)
        ]));
        const result = evaluateMathNode(sourceNode.type, inputs, sourceNode.data || {});
        if (sourceNode.type === "math_eval") {
          dataCache.set(`${sourceNode.id}:result`, result.result);
          dataCache.set(`${sourceNode.id}:valid`, result.valid);
          return result[pinId];
        }
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'function_call') {
        if (dataCache.has(cacheKey)) return dataCache.get(cacheKey);
        const targetGraph = context.resolveFunctionGraph?.(sourceNode.data?.graphId);
        if (!targetGraph) return undefined;
        if ((targetGraph.nodes || []).filter((node) => node.type === 'function_return').length > 1) throw new Error('A function graph can have only one Return Value node.');
        const returnValue = getFunctionGraphReturnValues(targetGraph).find((item) => functionReturnOutputPinId(item) === pinId);
        if (!returnValue) return undefined;
        let functionResult;
        if (functionCallResultCache.has(sourceNode.id)) functionResult = functionCallResultCache.get(sourceNode.id);
        else {
        const parameters = getFunctionGraphArguments(targetGraph);
        const missingParameter = parameters.find((parameter) => parameter.optional === false
          && !connections.some((wire) => wire.targetNodeId === sourceNode.id && wire.targetPinId === functionArgumentPinId(parameter)));
        if (missingParameter) throw new Error(`${targetGraph.name || 'Function'} requires an input for “${missingParameter.name || 'Input'}”.`);
        const argumentValues = new Map(parameters.map((parameter) => {
          const value = resolveDataInput(sourceNode, functionArgumentPinId(parameter), parameter.defaultValue ?? defaultValueForFunctionType(parameter.valueType), seen);
          return [parameter.paramId, value];
        }));
        functionResult = evaluateFunctionGraph(targetGraph, argumentValues, {
          ...context,
          resolveFunctionVariable,
          resolveTemplateFunction: (name, values, _callerGraph, callStack) => resolveTemplateGraphFunction(name, values, callStack)
        }, []);
        functionCallResultCache.set(sourceNode.id, functionResult);
        }
        const result = returnValue.legacy ? functionResult : functionResult?.[returnValue.returnId];
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'format_text') {
        const template = String(sourceNode.data?.template ?? '');
        const rendered = renderTextTemplate(template, (name) => {
          const argumentMatch = /^arg(\d+)$/i.exec(name);
          if (argumentMatch && Number(argumentMatch[1]) >= 1 && Number(argumentMatch[1]) <= 50 && findInputConnection(sourceNode.id, `arg_${Number(argumentMatch[1])}`)) return resolveDataInput(sourceNode, `arg_${Number(argumentMatch[1])}`, undefined, seen);
          const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase()) || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
          if (variable) return getVariableValue(variable.id, graphVariables.includes(variable) ? 'graph' : 'project');
          if (argumentMatch && Number(argumentMatch[1]) >= 1 && Number(argumentMatch[1]) <= 50) return resolveDataInput(sourceNode, `arg_${Number(argumentMatch[1])}`, undefined, seen);
          return resolveDataInput(sourceNode, `slot_${name}`, undefined, seen);
        }, context.appEmojis, (expression, references) => warnUndefinedTemplate(sourceNode, expression, references), {
          resolveFunction: (name, values) => resolveTemplateGraphFunction(name, values, context.graphCallStack || [graph.id])
        });
        dataCache.set(cacheKey, rendered);
        return rendered;
      }
      if (sourceNode.type === 'build_embed') {
        if (pinId === 'components') {
          const components = buildDiscordComponents(sourceNode.data?.components, (value) => renderNodeTemplate(sourceNode, value));
          dataCache.set(cacheKey, components);
          return components;
        }
        const embed = buildEmbedFromNode(sourceNode, seen);
        dataCache.set(cacheKey, embed);
        return embed;
      }
      if (sourceNode.type === 'build_components' && pinId === 'components') {
        const layout = JSON.parse(JSON.stringify(sourceNode.data?.componentsV2 || []));
        const components = buildDiscordComponentsV2(layout, (value) => renderNodeTemplate(sourceNode, value));
        components.layout = layout;
        components.validationErrors = validateDiscordComponentsV2(components);
        dataCache.set(cacheKey, components);
        return components;
      }
      if (sourceNode.type === 'modify_components_v2' && pinId === 'components') {
        const raw = resolveDataInput(sourceNode, 'components', null, seen);
        if (!raw || raw.format !== 'arc-components-v2' || !Array.isArray(raw.layout)) {
          throw new TypeError('Modify Components V2 needs a Components V2 layout from Component Builder.');
        }
        const layout = JSON.parse(JSON.stringify(raw.layout));
        const targetId = String(resolveDataInput(sourceNode, 'target_id', sourceNode.data?.target_id || 'all')).trim();
        const property = String(resolveDataInput(sourceNode, 'property', sourceNode.data?.property || 'spoiler')).trim();
        const itemIndex = Math.trunc(Number(resolveDataInput(sourceNode, 'item_index', sourceNode.data?.item_index ?? -1)));
        const value = resolveDataInput(sourceNode, 'value', sourceNode.data?.value);
        const allowedProperties = new Set(['spoiler', 'accentColor', 'divider', 'spacing', 'content', 'url', 'description', 'accessory.label', 'accessory.disabled', 'accessory.url', 'accessory.customId']);
        if (!allowedProperties.has(property)) throw new TypeError(`Unsupported Components V2 property: ${property || '(empty)'}.`);
        let matched = 0;
        const visit = (blocks) => {
          for (const block of Array.isArray(blocks) ? blocks : []) {
            if (!block || typeof block !== 'object') continue;
            const matches = !targetId || targetId.toLowerCase() === 'all' || block.id === targetId;
            if (matches) {
              if (property === 'spoiler' && block.type === 'media_gallery') {
                block.items = (block.items || []).map((item, index) => itemIndex >= 0 && index !== itemIndex ? item : { ...item, spoiler: Boolean(value) });
                matched += 1;
              } else if (block.type === 'media_gallery' && ['url', 'description'].includes(property)) {
                block.items = (block.items || []).map((item, index) => itemIndex >= 0 && index !== itemIndex ? item : { ...item, [property]: String(value ?? '') });
                matched += 1;
              } else if (property.startsWith('accessory.') && block.type === 'section') {
                const key = property.slice('accessory.'.length);
                if (block.accessory && Object.hasOwn(block.accessory, key)) {
                  block.accessory[key] = key === 'disabled' ? Boolean(value) : String(value ?? '');
                  matched += 1;
                }
              } else {
                const supportedByType = {
                  container: ['spoiler', 'accentColor'], file: ['spoiler', 'url'],
                  separator: ['divider', 'spacing'], text_display: ['content'], section: [], media_gallery: ['url', 'description']
                };
                if ((supportedByType[block.type] || []).includes(property)) {
                  block[property] = ['spoiler', 'divider'].includes(property) ? Boolean(value)
                    : property === 'spacing' ? (Number(value) === 2 ? 2 : 1)
                      : String(value ?? '');
                  matched += 1;
                }
              }
            }
            visit(block.children);
          }
        };
        visit(layout);
        if (!matched) throw new Error(`No Components V2 block matched “${targetId || 'all'}” and property “${property}”.`);
        const components = buildDiscordComponentsV2(layout, (text) => renderNodeTemplate(sourceNode, text));
        const result = { ...components, layout, validationErrors: validateDiscordComponentsV2(components) };
        dataCache.set(cacheKey, result);
        return result;
      }
      if (sourceNode.type === 'modify_embed') {
        const baseEmbed = resolveDataInput(sourceNode, 'embed', null, seen) || {};
        let embed = {};
        try {
          embed = typeof baseEmbed === 'string' ? JSON.parse(baseEmbed) : JSON.parse(JSON.stringify(baseEmbed));
        } catch {
          embed = {};
        }
        if (typeof embed !== 'object' || embed === null) embed = {};

        const title = resolveDataInput(sourceNode, 'title', sourceNode.data?.title, seen);
        const description = resolveDataInput(sourceNode, 'description', sourceNode.data?.description, seen);
        const color = resolveDataInput(sourceNode, 'color', sourceNode.data?.color, seen);
        const imageUrl = resolveDataInput(sourceNode, 'image_url', sourceNode.data?.image_url, seen);
        const thumbnailUrl = resolveDataInput(sourceNode, 'thumbnail_url', sourceNode.data?.thumbnail_url, seen);
        const footerText = resolveDataInput(sourceNode, 'footer_text', sourceNode.data?.footer_text, seen);
        const authorName = resolveDataInput(sourceNode, 'author_name', sourceNode.data?.author_name, seen);
        const fieldName = resolveDataInput(sourceNode, 'field_name', sourceNode.data?.field_name, seen);
        const fieldValue = resolveDataInput(sourceNode, 'field_value', sourceNode.data?.field_value, seen);

        if (title !== undefined && title !== '') embed.title = String(title).slice(0, 256);
        if (description !== undefined && description !== '') embed.description = String(description).slice(0, 4096);
        if (color !== undefined && color !== '') {
          const num = typeof color === 'number' ? color : parseInt(String(color).replace('#', ''), 16);
          if (Number.isFinite(num)) embed.color = num;
        }
        if (imageUrl) embed.image = { url: String(imageUrl) };
        if (thumbnailUrl) embed.thumbnail = { url: String(thumbnailUrl) };
        if (footerText) embed.footer = { text: String(footerText).slice(0, 2048) };
        if (authorName) embed.author = { name: String(authorName).slice(0, 256) };
        if (fieldName && fieldValue) {
          if (!Array.isArray(embed.fields)) embed.fields = [];
          const existing = embed.fields.find((f) => f.name === fieldName);
          if (existing) {
            existing.value = String(fieldValue).slice(0, 1024);
          } else {
            embed.fields.push({ name: String(fieldName).slice(0, 256), value: String(fieldValue).slice(0, 1024), inline: Boolean(sourceNode.data?.field_inline) });
          }
        }
        dataCache.set(cacheKey, embed);
        return embed;
      }
      if (sourceNode.type === 'modify_components') {
        const raw = resolveDataInput(sourceNode, 'components', sourceNode.data?.components, seen);
        let rows = [];
        try {
          rows = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : []);
        } catch {
          rows = [];
        }
        const targetCustomId = String(resolveDataInput(sourceNode, 'custom_id', sourceNode.data?.custom_id ?? '', seen)).trim();
        const disabledVal = resolveDataInput(sourceNode, 'disabled', sourceNode.data?.disabled, seen);
        const newLabel = resolveDataInput(sourceNode, 'label', sourceNode.data?.label, seen);
        const newStyle = resolveDataInput(sourceNode, 'style', sourceNode.data?.style, seen);
        const newEmoji = resolveDataInput(sourceNode, 'emoji', sourceNode.data?.emoji, seen);
        const newPlaceholder = resolveDataInput(sourceNode, 'placeholder', sourceNode.data?.placeholder, seen);

        for (const row of rows) {
          const comps = row.components || [];
          for (const comp of comps) {
            const currentId = comp.custom_id || comp.customId;
            const matchesId = !targetCustomId || targetCustomId.toLowerCase() === 'all' || currentId === targetCustomId;
            if (matchesId) {
              if (disabledVal !== undefined && disabledVal !== '') {
                if (comp.style !== 5 && comp.style !== 'link') {
                  comp.disabled = Boolean(disabledVal);
                }
              }
              if (newLabel !== undefined && newLabel !== '') {
                comp.label = String(newLabel).slice(0, 80);
              }
              if (newPlaceholder !== undefined && newPlaceholder !== '') {
                comp.placeholder = String(newPlaceholder).slice(0, 150);
              }
              if (newEmoji !== undefined && newEmoji !== '') {
                comp.emoji = parseEmoji(newEmoji);
              }
              if (newStyle !== undefined && newStyle !== '') {
                const styleMap = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
                if (typeof comp.style === 'number') {
                  comp.style = styleMap[newStyle] || Number(newStyle) || comp.style;
                } else {
                  comp.style = newStyle;
                }
              }
            }
          }
        }
        const result = buildDiscordComponents(rows);
        dataCache.set(cacheKey, result);
        return result;
      }
      return undefined;
    };

    const readEventTemplateRoot = (name) => {
      const root = String(name || '');
      if (!root) return undefined;
      if (Object.hasOwn(eventTemplateValues, root)) return eventTemplateValues[root];
      if (eventPayload && typeof eventPayload === 'object' && Object.hasOwn(eventPayload, root)) return eventPayload[root];
      return undefined;
    };

    const warnedFieldValues = new Set();
    const warnFieldValue = (node, pinId, value) => {
      try {
        const definition = NodeDefinitions[node.type];
        const pin = definition?.inputs?.find((item) => item.id === pinId);
        const warning = fieldLimitWarning({ nodeType: node.type, pin, value, node });
        if (warning && !warnedFieldValues.has(`${node.id}:${pinId}`)) {
          warnedFieldValues.add(`${node.id}:${pinId}`);
          log(`[Warning] ${node.label || definition?.label || node.type} (${node.id}) ${pin?.label || pinId}: ${warning}`, 'WARN', { graphId: graph.id, nodeId: node.id, nodeLabel: node.label || definition?.label || node.type });
        }
      } catch { /* ... */ }
      return value;
    };

    function resolveDataInput(node, pinId, defaultValue, seen = new Set()) {
      const conn = findInputConnection(node.id, pinId);
      let value;
      if (conn) {
        const upstreamNode = nodes.find((n) => n.id === conn.sourceNodeId);
        value = resolveOutput(upstreamNode, conn.sourcePinId, seen);
        if (value !== undefined) {
          const nodeDef = NodeDefinitions[node.type];
          const targetPin = nodeDef?.inputs?.find((item) => item.id === pinId);
          if (targetPin?.type === 'string' && typeof value !== 'string') {
            value = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
          } else if (targetPin?.type === 'number' && typeof value !== 'number') {
            const num = Number(value);
            value = Number.isFinite(num) ? num : 0;
          }
          return warnFieldValue(node, pinId, value);
        }
      }
      value = node.data?.[pinId] ?? defaultValue;
      if (typeof value !== 'string' || /^arg_\d+$/.test(pinId)) return warnFieldValue(node, pinId, value);
      const renderedValue = renderTextTemplate(value, (name) => {
        const argumentMatch = /^arg(\d+)$/i.exec(name);
        if (argumentMatch) {
          const argumentIndex = Number(argumentMatch[1]);
          if (argumentIndex < 1 || argumentIndex > 50) return undefined;
          const key = `${node.id}:arg_${argumentIndex}`;
          if (findInputConnection(node.id, `arg_${argumentIndex}`)) {
            if (seen.has(key)) return undefined;
            return resolveDataInput(node, `arg_${argumentIndex}`, undefined, new Set(seen).add(key));
          }
        }
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase())
          || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        if (variable) return getVariableValue(variable.id, graphVariables.includes(variable) ? 'graph' : 'project');
        if (argumentMatch) {
          const argumentIndex = Number(argumentMatch[1]);
          if (argumentIndex < 1 || argumentIndex > 50) return undefined;
          const key = `${node.id}:arg_${argumentIndex}`;
          if (seen.has(key)) return undefined;
          return resolveDataInput(node, `arg_${argumentIndex}`, undefined, new Set(seen).add(key));
        }
        const slotId = `slot_${name}`;
        const key = `${node.id}:${slotId}`;
        if (findInputConnection(node.id, slotId) && !seen.has(key)) {
          const slotValue = resolveDataInput(node, slotId, undefined, new Set(seen).add(key));
          if (slotValue !== undefined) return slotValue;
        }
        return readEventTemplateRoot(name);
      }, context.appEmojis, (expression, references) => warnUndefinedTemplate(node, expression, references), {
        resolveFunction: (name, values) => resolveTemplateGraphFunction(name, values, context.graphCallStack || [graph.id])
      });
      return warnFieldValue(node, pinId, renderedValue);
    }

    function renderNodeTemplate(node, value) {
      return renderTextTemplate(value, (name) => {
        const argumentMatch = /^arg(\d+)$/i.exec(name);
        if (argumentMatch) return resolveDataInput(node, `arg_${Number(argumentMatch[1])}`, undefined);
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase())
          || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        if (variable) return getVariableValue(variable.id, graphVariables.includes(variable) ? 'graph' : 'project');
        if (findInputConnection(node.id, `slot_${name}`)) return resolveDataInput(node, `slot_${name}`, undefined);
        return readEventTemplateRoot(name);
      }, context.appEmojis, (expression, references) => warnUndefinedTemplate(node, expression, references), {
        resolveFunction: (name, values) => resolveTemplateGraphFunction(name, values, context.graphCallStack || [graph.id])
      });
    }

    function resolveMessageComponents(node) {
      if (!findInputConnection(node.id, 'components')) {
        if (node.data?.componentsV2Enabled) {
          const built = buildDiscordComponentsV2(node.data?.componentsV2Layout, (value) => renderNodeTemplate(node, value));
          return { ...built, validationErrors: validateDiscordComponentsV2(built) };
        }
        return buildDiscordComponents(node.data?.components, (value) => renderNodeTemplate(node, value));
      }
      const componentsWire = findInputConnection(node.id, 'components');
      const componentSource = componentsWire && nodes.find((item) => item.id === componentsWire.sourceNodeId);
      const renderNested = (value) => typeof value === 'string' ? renderNodeTemplate(node, value)
        : Array.isArray(value) ? value.map(renderNested)
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, renderNested(nested)])) : value;
      const rawResolved = resolveDataInput(node, 'components', []);
      const resolved = ['build_components', 'modify_components_v2'].includes(componentSource?.type) ? rawResolved : renderNested(rawResolved);
      if (resolved?.format === 'arc-components-v2') return { ...resolved, validationErrors: validateDiscordComponentsV2(resolved) };
      return resolved;
    }

    function buildEmbedFromNode(embedNode, seen = new Set()) {
      if (Array.isArray(embedNode.data?.blocks)) {
        const builder = new EmbedBuilder();
        const embedBlocks = embedNode.data.blocks.filter((block) => block && typeof block.id === 'string');
        const hasFooterBlock = embedBlocks.some((block) => block.type === 'footer');
        const hasColorBlock = embedBlocks.some((block) => block.type === 'color');
        if (!hasColorBlock) builder.setColor('#5865F2');
        const readBlock = (block, key) => resolveDataInput(embedNode, `block_${block.id}_${key}`, block[key] || '', seen);
        for (const block of embedBlocks) {
          if (block.type === 'title') {
            const value = String(readBlock(block, 'value') ?? '');
            if (value) builder.setTitle(value);
          } else if (block.type === 'description') {
            const value = String(readBlock(block, 'value') ?? '');
            if (value) builder.setDescription(value);
          } else if (block.type === 'url') {
            const url = safeEmbedUrl(readBlock(block, 'url'));
            if (url) builder.setURL(url);
          } else if (block.type === 'timestamp' && hasFooterBlock) {
            const timestamp = block.now ? new Date() : readBlock(block, 'value');
            if (timestamp) {
              const date = new Date(timestamp);
              if (!Number.isNaN(date.getTime())) builder.setTimestamp(date);
            }
          } else if (block.type === 'color') {
            const color = readBlock(block, 'value');
            if (/^#?[0-9a-f]{6}$/i.test(String(color))) builder.setColor(color);
          } else if (block.type === 'author') {
            const name = String(readBlock(block, 'name') ?? '');
            if (name) builder.setAuthor({ name, url: safeEmbedUrl(readBlock(block, 'url')) || undefined, iconURL: safeEmbedUrl(readBlock(block, 'icon')) || undefined });
          } else if (block.type === 'footer') {
            const text = String(readBlock(block, 'text') ?? '');
            if (text) builder.setFooter({ text, iconURL: safeEmbedUrl(readBlock(block, 'icon')) || undefined });
          } else if (block.type === 'thumbnail' || block.type === 'image') {
            const url = safeEmbedUrl(readBlock(block, 'url'), true);
            if (url) block.type === 'image' ? builder.setImage(url) : builder.setThumbnail(url);
          } else if (block.type === 'field' && (builder.toJSON().fields || []).length < 25) {
            const name = String(readBlock(block, 'name') ?? '');
            const value = String(readBlock(block, 'value') ?? '');
            if (name || value) builder.addField(String(name || '\u200b').slice(0, 256), String(value || '\u200b').slice(0, 1024), Boolean(block.inline));
          }
        }
        return limitEmbedText(builder.toJSON());
      }
      const input = (pinId, fallback = '') => resolveDataInput(embedNode, pinId, embedNode.data?.[pinId] ?? fallback, seen);
      const title = input('title');
      const description = input('description');
      const url = input('url');
      const color = input('color', '#5865F2');
      const authorName = input('author_name');
      const authorUrl = input('author_url');
      const authorIcon = input('author_icon');
      const footer = input('footer_text');
      const footerIcon = input('footer_icon');
      const thumbnailUrl = input('thumbnail_url');
      const imageUrl = input('image_url');

      const builder = new EmbedBuilder();
      if (title) builder.setTitle(title);
      if (description) builder.setDescription(description);
      if (url) builder.setURL(url);
      if (/^#?[0-9a-f]{6}$/i.test(String(color))) builder.setColor(color);
      if (authorName) builder.setAuthor({ name: authorName, url: authorUrl || undefined, iconURL: authorIcon || undefined });
      if (footer) builder.setFooter({ text: footer, iconURL: footerIcon || undefined });
      const safeThumbnailUrl = safeEmbedUrl(thumbnailUrl, true);
      const safeImageUrl = safeEmbedUrl(imageUrl, true);
      if (safeThumbnailUrl) builder.setThumbnail(safeThumbnailUrl);
      if (safeImageUrl) builder.setImage(safeImageUrl);
      const fields = Array.isArray(embedNode.data?.fields) ? embedNode.data.fields.filter((field) => field && typeof field.id === 'string') : [];
      for (const field of fields.slice(0, 25)) {
        const name = input(`field_${field.id}_name`, field.name || '');
        const value = input(`field_${field.id}_value`, field.value || '');
        if (name || value) builder.addField(name || '\u200b', value || '\u200b', field.inline);
      }
      return limitEmbedText(builder.toJSON());
    }

    const normalizedEvent = ['SLASH_COMMAND', 'BUTTON_CLICK', 'SELECT_MENU', 'MODAL_SUBMIT'].includes(eventName) ? 'INTERACTION_CREATE' : eventName;
    const startNode = eventName === 'FUNCTION_CALL'
      ? (nodes.find((node) => node.type === 'function_input' && findExecOutputs(node.id, 'exec').length > 0)
        || nodes.find((node) => node.type === 'function_input')
        || nodes.find((node) => node.type === 'function_return'))
      : nodes.find((node) => {
        const definition = NodeDefinitions[node.type];
        if (definition?.gatewayEvent !== normalizedEvent) return false;
        if (String(normalizedEvent).startsWith('WEBSOCKET_') && String(node.data?.filter_connection_id || '').trim()
          && String(node.data.filter_connection_id).trim() !== String(eventPayload?.connectionId || '')) return false;
        if (node.type === 'event_message_create' && typeof node.data?.prefix === 'string' && node.data.prefix
          && !String(eventPayload?.content || '').trimStart().startsWith(node.data.prefix)) return false;
        if (['event_slash_command', 'event_user_command', 'event_message_command'].includes(node.type) && String(node.data?.commandName || '').trim()
          && String(node.data.commandName).trim().toLowerCase() !== String(eventPayload?.data?.name || '').trim().toLowerCase()) return false;
        if (['event_button_click', 'event_select_menu', 'event_modal_submit'].includes(node.type) && String(node.data?.custom_id || '').trim()
          && String(node.data.custom_id).trim() !== String(eventPayload?.data?.custom_id || '').trim()) return false;
        if (node.type === 'event_cron' && eventPayload?.cronNodeId && node.id !== eventPayload.cronNodeId) return false;
        if (definition.gatewayInteractionType && Number(eventPayload.type) !== definition.gatewayInteractionType) return false;
        if (definition.gatewayCommandType && Number(eventPayload.data?.type || 1) !== definition.gatewayCommandType) return false;
        if (definition.gatewayComponentTypes && !definition.gatewayComponentTypes.includes(Number(eventPayload.data?.component_type))) return false;
        return true;
      });
    const eventNodeType = startNode?.type;
    if (!startNode) {
      log(`[Graph] No active event node found for event "${eventName}". Skipping.`);
      return { executedNodeIds, traces, nodeTimings, wirePath, error: null };
    }
    if (['event_slash_command', 'event_user_command', 'event_message_command'].includes(eventNodeType)) {
      const expectedCommand = String(startNode.data?.commandName || '').trim().toLowerCase();
      const receivedCommand = String(eventPayload.data?.name || '').trim().toLowerCase();
      if (expectedCommand && expectedCommand !== receivedCommand) {
        log(`[Graph] Command ${receivedCommand} does not match ${expectedCommand}. Skipping.`);
        return { executedNodeIds, traces, nodeTimings, wirePath, error: null };
      }
    }
    if (['event_button_click', 'event_select_menu', 'event_modal_submit'].includes(eventNodeType)) {
      const expectedCustomId = String(startNode.data?.custom_id || '').trim();
      const receivedCustomId = String(eventPayload?.data?.custom_id || '').trim();
      if (expectedCustomId && expectedCustomId !== receivedCustomId) {
        log(`[Graph] Custom ID "${receivedCustomId}" does not match "${expectedCustomId}". Skipping.`);
        return { executedNodeIds, traces, nodeTimings, wirePath, error: null };
      }
    }
    if (eventNodeType === 'event_bot_startup') {
      const waitForGateway = Boolean(resolveDataInput(startNode, 'wait_for_gateway', startNode.data?.wait_for_gateway ?? false));
      let gatewayConnected = Boolean(eventPayload?.gatewayConnected);
      if (waitForGateway) {
        const requestedTimeout = Number(resolveDataInput(startNode, 'timeout_seconds', startNode.data?.timeout_seconds ?? 30));
        const timeoutSeconds = Number.isFinite(requestedTimeout) ? Math.max(0, Math.min(86400, Math.trunc(requestedTimeout))) : 30;
        if (typeof context.waitForGateway !== 'function') throw new Error('Gateway readiness waiting is unavailable in this workspace.');
        gatewayConnected = await context.waitForGateway(timeoutSeconds * 1000, context.signal);
        if (context.signal?.aborted) return { executedNodeIds, traces, nodeTimings, wirePath, error: 'Graph execution cancelled.' };
      }
      eventPayload = { ...eventPayload, gatewayConnected };
    }

    eventTemplateValues = buildEventTemplateValues(eventNodeType, eventPayload, {
      guild: context.resolveGuildDirectory?.(eventPayload?.guild_id) || null,
      channel: context.resolveChannelDirectory?.(eventPayload?.channel_id) || null
    });
    recordExecutedNode(startNode.id);
    log(`[Graph] Triggered event node: ${startNode.label || startNode.type} (${startNode.id})`);

    if (eventName === 'FUNCTION_CALL') {
      const argumentValues = eventPayload?.argumentValues instanceof Map
        ? eventPayload.argumentValues
        : new Map(Object.entries(eventPayload?.argumentValues || {}));
      for (const inputNode of nodes.filter((node) => node.type === 'function_input')) {
        for (const argument of getFunctionInputArguments(inputNode)) {
          const value = argumentValues.has(argument.paramId) ? argumentValues.get(argument.paramId) : argument.defaultValue;
          dataCache.set(`${inputNode.id}:${functionArgumentPinId(argument)}`, value);
          if (argument.legacy) dataCache.set(`${inputNode.id}:value`, value);
        }
      }
    }

    if (eventNodeType === 'event_message_create') {
      dataCache.set(`${startNode.id}:content`, eventPayload.content || '');
      dataCache.set(`${startNode.id}:author_id`, eventPayload.author?.id || '');
      dataCache.set(`${startNode.id}:author_name`, eventPayload.author?.username || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || '');
      dataCache.set(`${startNode.id}:is_bot`, Boolean(eventPayload.author?.bot));
      dataCache.set(`${startNode.id}:has_mentions`, Array.isArray(eventPayload.mentions) && eventPayload.mentions.length > 0);
      dataCache.set(`${startNode.id}:is_reply`, Boolean(eventPayload.message_reference?.message_id));
//
      const legacyPrefix = String(startNode.data?.prefix || '');
      if (legacyPrefix) {
        const parsed = evaluateDataNode('data_parse_prefix_command', { content: eventPayload.content || '', prefix: legacyPrefix }, {});
        for (const [pinId, value] of Object.entries(parsed)) dataCache.set(`${startNode.id}:${pinId}`, value);
      }
    } else if (eventNodeType === 'event_slash_command') {
      const cmdName = eventPayload.data?.name || '';
      const userId = eventPayload.member?.user?.id || eventPayload.user?.id || '';
      const channelId = eventPayload.channel_id || '';
      dataCache.set(`${startNode.id}:command_name`, cmdName);
      dataCache.set(`${startNode.id}:user_id`, userId);
      dataCache.set(`${startNode.id}:username`, eventPayload.member?.user?.global_name || eventPayload.member?.user?.username || eventPayload.user?.global_name || eventPayload.user?.username || '');
      dataCache.set(`${startNode.id}:channel_id`, channelId);
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
      const selectedPath = (eventPayload.data?.options || []).find((option) => [1, 2].includes(Number(option.type)));
      const selectedGroup = Number(selectedPath?.type) === 2 ? selectedPath : null;
      const selectedSubcommand = selectedGroup
        ? (selectedGroup.options || []).find((option) => Number(option.type) === 1)
        : Number(selectedPath?.type) === 1 ? selectedPath : null;
      const subcommandGroupName = selectedGroup?.name || '';
      const subcommandName = selectedSubcommand?.name || '';
      dataCache.set(`${startNode.id}:subcommand_group_name`, subcommandGroupName);
      dataCache.set(`${startNode.id}:subcommand_name`, subcommandName);
      const commandOptions = {};
      const flattenOptions = (options = []) => {
        for (const option of options) {
          if (Array.isArray(option.options)) flattenOptions(option.options);
          else if (option.name) {
            if (Number(option.type) === 11) {
              const attachmentId = option.value ?? option.attachment;
              commandOptions[option.name] = eventPayload.data?.resolved?.attachments?.[attachmentId]
                || (option.attachment && typeof option.attachment === 'object' ? option.attachment : null);
            } else commandOptions[option.name] = option.value ?? option.user ?? option.channel ?? option.role ?? option.attachment ?? null;
          }
        }
      };
      flattenOptions(eventPayload.data?.options || []);
      if (subcommandName) commandOptions.$subcommand = subcommandName;
      if (subcommandGroupName) commandOptions.$subcommand_group = subcommandGroupName;
      dataCache.set(`${startNode.id}:options`, commandOptions);
      for (const { option, path, pinId } of flattenSlashParameters(startNode.data?.options)) {
        const value = commandOptions[option.name] ?? null;
        if (path.length === 1 || path.slice(0, -1).join('.') === [subcommandGroupName, subcommandName].filter(Boolean).join('.')) {
          dataCache.set(`${startNode.id}:${pinId}`, value);
        }
      }
    } else if (eventNodeType === 'event_user_command') {
      const cmdName = eventPayload.data?.name || '';
      const userId = eventPayload.member?.user?.id || eventPayload.user?.id || '';
      const targetUserId = eventPayload.data?.target_id || '';
      const resolvedUsers = eventPayload.data?.resolved?.users || {};
      const resolvedMembers = eventPayload.data?.resolved?.members || {};
      const targetUser = resolvedUsers[targetUserId] || null;
      const targetMember = resolvedMembers[targetUserId] || null;
      dataCache.set(`${startNode.id}:command_name`, cmdName);
      dataCache.set(`${startNode.id}:target_user_id`, targetUserId);
      dataCache.set(`${startNode.id}:target_user`, targetUser);
      dataCache.set(`${startNode.id}:target_member`, targetMember);
      dataCache.set(`${startNode.id}:user_id`, userId);
      dataCache.set(`${startNode.id}:username`, eventPayload.member?.user?.global_name || eventPayload.member?.user?.username || eventPayload.user?.global_name || eventPayload.user?.username || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_message_command') {
      const cmdName = eventPayload.data?.name || '';
      const userId = eventPayload.member?.user?.id || eventPayload.user?.id || '';
      const targetMessageId = eventPayload.data?.target_id || '';
      const resolvedMessages = eventPayload.data?.resolved?.messages || {};
      const targetMessage = resolvedMessages[targetMessageId] || null;
      dataCache.set(`${startNode.id}:command_name`, cmdName);
      dataCache.set(`${startNode.id}:target_message_id`, targetMessageId);
      dataCache.set(`${startNode.id}:target_message`, targetMessage);
      dataCache.set(`${startNode.id}:target_message_content`, targetMessage?.content || '');
      dataCache.set(`${startNode.id}:target_author_id`, targetMessage?.author?.id || '');
      dataCache.set(`${startNode.id}:user_id`, userId);
      dataCache.set(`${startNode.id}:username`, eventPayload.member?.user?.global_name || eventPayload.member?.user?.username || eventPayload.user?.global_name || eventPayload.user?.username || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_slash_autocomplete') {
      const commandOptions = {};
      let focused = null;
      const flattenOptions = (options = []) => {
        for (const option of options) {
          if (option.focused) focused = option;
          if (Array.isArray(option.options)) flattenOptions(option.options);
          else if (option.name && !option.focused) commandOptions[option.name] = option.value ?? option.user ?? option.channel ?? option.role ?? option.attachment ?? null;
        }
      };
      flattenOptions(eventPayload.data?.options || []);
      dataCache.set(`${startNode.id}:command_name`, eventPayload.data?.name || '');
      dataCache.set(`${startNode.id}:focused_option`, focused?.name || '');
      dataCache.set(`${startNode.id}:query`, String(focused?.value ?? '').slice(0, 100));
      dataCache.set(`${startNode.id}:options`, commandOptions);
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || eventPayload.user?.id || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_button_click') {
      dataCache.set(`${startNode.id}:custom_id`, eventPayload.data?.custom_id || '');
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || eventPayload.user?.id || eventPayload.author?.id || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || eventPayload.message?.guild_id || eventPayload.channel?.guild_id || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || eventPayload.message?.channel_id || '');
      dataCache.set(`${startNode.id}:message`, eventPayload.message || null);
      dataCache.set(`${startNode.id}:message_id`, eventPayload.message?.id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_select_menu') {
      dataCache.set(`${startNode.id}:custom_id`, eventPayload.data?.custom_id || '');
      dataCache.set(`${startNode.id}:selected_values`, Array.isArray(eventPayload.data?.values) ? eventPayload.data.values.join(',') : (eventPayload.data?.values || ''));
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || eventPayload.user?.id || eventPayload.author?.id || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || eventPayload.message?.guild_id || eventPayload.channel?.guild_id || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || eventPayload.message?.channel_id || '');
      dataCache.set(`${startNode.id}:message`, eventPayload.message || null);
      dataCache.set(`${startNode.id}:message_id`, eventPayload.message?.id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_modal_submit') {
      dataCache.set(`${startNode.id}:custom_id`, eventPayload.data?.custom_id || '');
      dataCache.set(`${startNode.id}:submitted_values`, eventPayload.data?.components || []);
      dataCache.set(`${startNode.id}:user_id`, eventPayload.member?.user?.id || eventPayload.user?.id || eventPayload.author?.id || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || eventPayload.message?.guild_id || eventPayload.channel?.guild_id || '');
      dataCache.set(`${startNode.id}:channel_id`, eventPayload.channel_id || eventPayload.message?.channel_id || '');
      dataCache.set(`${startNode.id}:message`, eventPayload.message || null);
      dataCache.set(`${startNode.id}:message_id`, eventPayload.message?.id || '');
      dataCache.set(`${startNode.id}:application_id`, eventPayload.application_id || '');
      dataCache.set(`${startNode.id}:interaction_id`, eventPayload.id || '');
      dataCache.set(`${startNode.id}:interaction_token`, eventPayload.token || '');
    } else if (eventNodeType === 'event_member_join') {
      dataCache.set(`${startNode.id}:user_id`, eventPayload.user?.id || '');
      dataCache.set(`${startNode.id}:username`, eventPayload.user?.username || '');
      dataCache.set(`${startNode.id}:guild_id`, eventPayload.guild_id || '');
    }
    const eventDefinition = NodeDefinitions[eventNodeType];
    for (const pin of eventDefinition?.outputs || []) {
      if (pin.type === 'exec' || pin.eventPath == null) continue;
      let value = pin.eventPath === '$'
        ? eventPayload
        : String(pin.eventPath).split('.').reduce((current, key) => current?.[key], eventPayload);
      if (pin.type === 'string' && value && typeof value === 'object') {
        try { value = JSON.stringify(value); } catch { value = ''; }
      }
      if (value !== undefined || !dataCache.has(`${startNode.id}:${pin.id}`)) {
        dataCache.set(`${startNode.id}:${pin.id}`, value ?? (pin.type === 'number' ? 0 : pin.type === 'boolean' ? false : ''));
      }
    }
    if (eventDefinition?.outputs?.some((pin) => pin.id === 'thread_id')) {
      dataCache.set(`${startNode.id}:thread_id`, extractThreadId(eventPayload));
    }
    const triggerTiming = recordNodeTiming(startNode, runStartedAt, null, 'triggered');
    await context.onSimulationStep?.({ ...triggerTiming, type: startNode.type, label: startNode.label || NodeDefinitions[startNode.type]?.label || startNode.type });
    await recordDebugStep(startNode, [], 'triggered', '', triggerTiming);

    let flowStepCount = 0;
    const runExecWires = async (currentExecWires, inParallelBranch = false, parallelDepth = 0) => {
      if (context.signal?.aborted) return { error: 'Graph execution cancelled.' };
      if (parallelDepth > 16) return { error: 'Parallel graph nesting exceeded 16 levels.' };
      let reachedJoinId = null;
      while (currentExecWires.length > 0) {
      if (context.signal?.aborted) return { error: 'Graph execution cancelled.' };
      if (++flowStepCount > 10000) return { error: 'Graph execution stopped after reaching the 10,000 step safety limit.' };
      const wire = currentExecWires.shift();
      const targetNode = nodes.find((n) => n.id === wire.targetNodeId);
      if (!targetNode) continue;
      if (targetNode.type === 'parallel_join' && inParallelBranch) {
        if (reachedJoinId && reachedJoinId !== targetNode.id) return { error: 'A Parallel branch reached more than one Join node.' };
        reachedJoinId = targetNode.id;
        continue;
      }
          if (targetNode.type === 'parallel_join' && !wire.__releasedJoin) return { error: 'Join synchronizes branches started by a Parallel node. For If/Else paths, connect each path directly to the same action node.' };

      recordExecutedNode(targetNode.id);
      const nodeStartedAt = performance.now();
      if (repeatLoopStack.length) {
        try { context.onNodeExecution?.({ graphId: graph.id, nodeId: targetNode.id }); } catch {}
      }
      log(`[Graph] Executing node: ${targetNode.label || targetNode.type} (${targetNode.id})`);

      try {
        const debugInputs = context.debug ? getNodeInputs(targetNode, connections, [...graphVariables, ...projectVariables]).filter((pin) => pin.type !== 'exec').map((pin) => ({
          pinId: pin.id,
          label: pin.label || pin.id,
          value: debugValue(resolveDataInput(targetNode, pin.id, targetNode.data?.[pin.id] ?? pin.defaultValue), pin.id)
        })) : [];
        if (targetNode.type === 'utility_wire_extender') {
          currentExecWires.push(...findExecOutputs(targetNode.id, 'exec_out'));
        } else if (targetNode.type === 'variable_create') {
          const scope = targetNode.data?.scope === 'project' ? 'project' : 'graph';
          const renderedName = renderNodeTemplate(targetNode, String(targetNode.data?.name || ''));
          const name = String(resolveDataInput(targetNode, 'name', renderedName) ?? '').trim().slice(0, 64);
          const validName = /^(?=.{1,64}$)[A-Za-z0-9]+(?:_+[A-Za-z0-9]+|-[A-Za-z0-9]+)*$/.test(name);
          if (isReservedTemplateRoot(name)) {
            log(`[Variable] Create skipped: “${name}” is reserved for the system template namespace.`);
          } else if (!validName) {
            log(`[Variable] Create skipped: “${name || 'unnamed'}” is not a valid variable name.`);
          } else {
            const definitions = scope === 'project' ? projectVariableDefinitions : localVariableDefinitions;
            const existing = [...definitions.values()].find((item) => String(item.name || '').toLowerCase() === name.toLowerCase());
            if (existing) {
              dataCache.set(`${targetNode.id}:variable`, variableReference(existing.id, scope));
              dataCache.set(`${targetNode.id}:value`, getVariableValue(existing.id, scope));
              log(`[Variable] ${name} already exists, so the create step was skipped.`);
            } else {
              const configuredType = ['string', 'number', 'boolean', 'array', 'object'].includes(targetNode.data?.valueType) ? targetNode.data.valueType : 'string';
              const value = resolveDataInput(targetNode, 'value', targetNode.data?.value ?? defaultValueForType(configuredType));
              let type = configuredType;
              if (findInputConnection(targetNode.id, 'value')) {
                const inferred = Array.isArray(value) ? 'array' : value !== null && typeof value === 'object' ? 'object' : typeof value;
                if (['string', 'number', 'boolean', 'array', 'object'].includes(inferred)) type = inferred;
              }
              const definition = createRuntimeVariable(targetNode, { scope, name, type, value, persist: targetNode.data?.persist !== false });
              dataCache.set(`${targetNode.id}:variable`, variableReference(definition.id, scope));
              dataCache.set(`${targetNode.id}:value`, getVariableValue(definition.id, scope));
              log(`[Variable] Created ${scope === 'project' ? 'project' : 'graph'} variable ${name}.`);
            }
          }
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'variable_set') {
          const reference = resolveDataInput(targetNode, 'variable', variableReference(targetNode.data?.variableId, targetNode.data?.scope));
          const variableId = reference?.__arcVariableRef ? reference.variableId : targetNode.data?.variableId;
          const variableScope = reference?.__arcVariableRef ? reference.scope : targetNode.data?.scope === 'project' ? 'project' : 'graph';
          const definition = (variableScope === 'project' ? projectVariableDefinitions : localVariableDefinitions).get(variableId);
          if (!definition) {
            log('[Variable] Set skipped: no variable is selected');
          } else {
            const fallback = Object.hasOwn(targetNode.data || {}, 'value') ? targetNode.data.value : getVariableValue(variableId, variableScope);
            const value = resolveDataInput(targetNode, 'value', fallback);
            setVariableValue(variableId, variableScope, value, definition);
            log(`[Variable] Set ${definition.name}`);
          }
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'branch_if') {
          const decision = selectIfBranch(resolveDataInput(targetNode, 'condition', false));
          log(decision.logMessage);
          currentExecWires.push(...findExecOutputs(targetNode.id, decision.branchPin));
        } else if (targetNode.type === 'branch_switch') {
          const value = resolveDataInput(targetNode, 'value', '');
          const decision = selectSwitchBranch(value, (index) => resolveDataInput(targetNode, `case_${index}`, ''));
          log(decision.logMessage);
          currentExecWires.push(...findExecOutputs(targetNode.id, decision.branchPin));
        } else if (targetNode.type === 'compare_text') {
          const textA = String(resolveDataInput(targetNode, 'text_a', targetNode.data?.text_a || ''));
          const textB = String(resolveDataInput(targetNode, 'text_b', targetNode.data?.text_b || ''));
          const op = targetNode.data?.operator || 'equals';

            let result = false;
            if (op === 'equals') result = textA === textB;
            else if (op === 'contains') result = textA.includes(textB);
            else if (op === 'startsWith') result = textA.startsWith(textB);
            else if (op === 'endsWith') result = textA.endsWith(textB);

          dataCache.set(`${targetNode.id}:result`, result);
          log(`[Compare Text] Compared text values using ${op}; result: ${result}.`);
        } else if (targetNode.type === 'delay') {
          const ms = validateDelayDuration(resolveDataInput(targetNode, 'ms', targetNode.data?.ms ?? 1000));
          log(`[Delay] Sleeping for ${ms}ms...`);
          await waitFor(ms, context.signal);
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'loop_count') {
          const count = validateLoopCount(resolveDataInput(targetNode, 'count', targetNode.data?.count ?? 1));
          const bodyWires = findExecOutputs(targetNode.id, 'body_exec');
          const completedWires = findExecOutputs(targetNode.id, 'completed_exec');
          currentExecWires.push(...await executeCountedLoop({
            count,
            bodyWires,
            completedWires,
            setIndex: (index) => dataCache.set(`${targetNode.id}:index`, index),
            invalidateBody: (wires) => wires.forEach((wire) => invalidateDataDependencies(wire.targetNodeId, wire.targetPinId)),
            runBody: (wires) => runExecWires([...wires], inParallelBranch, parallelDepth),
            createExecutionError: (message) => Object.assign(new Error(message), context.signal?.aborted ? { name: 'AbortError' } : {}),
            log
          }));
        } else if (targetNode.type === 'repeat_while') {
          const intervalMs = validateRepeatInterval(resolveDataInput(targetNode, 'interval_ms', targetNode.data?.interval_ms ?? 500));
          const bodyWires = findExecOutputs(targetNode.id, 'body_exec');
          const completedWires = findExecOutputs(targetNode.id, 'completed_exec');
          const conditionWire = findInputConnection(targetNode.id, 'condition');
          currentExecWires.push(...await executeRepeatWhile({
            intervalMs,
            bodyWires,
            completedWires,
            getCondition: () => {
              if (conditionWire) invalidateDataDependencies(conditionWire.sourceNodeId, conditionWire.sourcePinId);
              return Boolean(resolveDataInput(targetNode, 'condition', true));
            },
            wait: (duration) => waitFor(duration, context.signal),
            setIteration: (iteration) => dataCache.set(`${targetNode.id}:iteration`, iteration),
            invalidateBody: (wires) => wires.forEach((wire) => invalidateDataDependencies(wire.targetNodeId, wire.targetPinId)),
            runBody: (wires) => runExecWires([...wires], inParallelBranch, parallelDepth),
            beginLoop: (state) => repeatLoopStack.push(state),
            endLoop: () => repeatLoopStack.pop(),
            getFlowStepCount: () => flowStepCount,
            setFlowStepCount: (count) => { flowStepCount = count; },
            createExecutionError: (message) => Object.assign(new Error(message), context.signal?.aborted ? { name: 'AbortError' } : {}),
            log
          }));
        } else if (targetNode.type === 'wait_until_condition') {
          const { timeoutMs, intervalMs } = validateWaitConditionSettings(
            resolveDataInput(targetNode, 'timeout_ms', targetNode.data?.timeout_ms ?? 30000),
            resolveDataInput(targetNode, 'interval_ms', targetNode.data?.interval_ms ?? 250)
          );
          const conditionWire = findInputConnection(targetNode.id, 'condition');
          const deadline = Date.now() + timeoutMs;
          let ready = Boolean(resolveDataInput(targetNode, 'condition', false));
          while (!ready && Date.now() < deadline) {
            await waitFor(Math.min(intervalMs, Math.max(1, deadline - Date.now())), context.signal);
            if (conditionWire) invalidateDataDependencies(conditionWire.sourceNodeId, conditionWire.sourcePinId);
            ready = Boolean(resolveDataInput(targetNode, 'condition', false));
          }
          const branch = ready ? 'ready_exec' : 'timeout_exec';
          log(ready ? '[Wait Until Condition] Condition became true.' : '[Wait Until Condition] Timed out.');
          currentExecWires.push(...findExecOutputs(targetNode.id, branch));
        } else if (targetNode.type === 'wait_until_time') {
          const { targetTime, waitMs } = parseWaitUntilTime(resolveDataInput(targetNode, 'time', targetNode.data?.time || ''));
          if (waitMs > 0) {
            log(`[Wait Until Time] Waiting until ${new Date(targetTime).toISOString()}.`);
            await waitFor(waitMs, context.signal);
          } else {
            log('[Wait Until Time] The specified time has already passed, continuing now.');
          }
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'function_return') {
          functionReturnValue = resolveFunctionReturnResult(targetNode, resolveDataInput);
          for (const returnValue of getFunctionReturnValues(targetNode)) {
            const value = returnValue.legacy ? functionReturnValue : functionReturnValue?.[returnValue.returnId];
            dataCache.set(`${targetNode.id}:${functionReturnInputPinId(returnValue)}`, value);
          }
          log(`[Function Return] Returned ${getFunctionReturnValues(targetNode).length} value${getFunctionReturnValues(targetNode).length === 1 ? '' : 's'}.`);
        } else if (targetNode.type === 'function_call') {
          const targetGraph = context.resolveFunctionGraph?.(targetNode.data?.graphId);
          if (!targetGraph) throw new Error('Call Function node requires a valid function graph selected.');
          const callStack = Array.isArray(context.graphCallStack) ? context.graphCallStack : [graph.id];
          if (callStack.includes(targetGraph.id)) throw new Error('Function call cycle detected. Graphs cannot call themselves or call each other in a loop.');
          if (callStack.length >= 24) throw new Error('Function call nesting exceeded 24 levels.');
          const parameters = getFunctionGraphArguments(targetGraph);
          const missingParameter = parameters.find((parameter) => parameter.optional === false
            && !connections.some((wire) => wire.targetNodeId === targetNode.id && wire.targetPinId === functionArgumentPinId(parameter)));
          if (missingParameter) throw new Error(`${targetGraph.name || 'Function'} requires an input for “${missingParameter.name || 'Input'}”.`);
          const argumentValues = new Map(parameters.map((parameter) => {
            const value = resolveDataInput(targetNode, functionArgumentPinId(parameter), parameter.defaultValue ?? defaultValueForFunctionType(parameter.valueType));
            return [parameter.paramId, value];
          }));
          log(`[Call Function] Invoking ${targetGraph.name || targetGraph.id}.`);
          const nestedResult = await GraphRunner.execute(targetGraph, 'FUNCTION_CALL', {
            ...eventPayload,
            argumentValues
          }, {
            ...context,
            graphCallStack: [...callStack, targetGraph.id],
            variablesState: context.getGraphVariableState?.(targetGraph) || (targetGraph.id === graph.id ? persistentVariableValues : new Map()),
            interactionState
          });
          if (nestedResult.error) throw Object.assign(new Error(nestedResult.error), context.signal?.aborted ? { name: 'AbortError' } : {});
          if (Array.isArray(nestedResult.executedNodeIds)) executedNodeIds.push(...nestedResult.executedNodeIds);
          for (const returnValue of getFunctionGraphReturnValues(targetGraph)) {
            const value = returnValue.legacy ? nestedResult.result : nestedResult.result?.[returnValue.returnId];
            dataCache.set(`${targetNode.id}:${functionReturnOutputPinId(returnValue)}`, value);
          }
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'execute_graph') {
          const targetGraph = context.resolveFunctionGraph?.(targetNode.data?.graphId);
          if (!targetGraph || targetGraph.graphType === 'function') throw new Error('Run Event Graph needs a saved event graph selected.');
          const callStack = Array.isArray(context.graphCallStack) ? context.graphCallStack : [graph.id];
          if (callStack.includes(targetGraph.id)) throw new Error('Graph call cycle detected. Event graphs cannot run themselves or call each other in a loop.');
          if (callStack.length >= 16) throw new Error('Event graph call nesting exceeded 16 levels.');
          log(`[Run Event Graph] Running ${targetGraph.name || targetGraph.id} for ${eventName}.`);
          const nestedResult = await GraphRunner.execute(targetGraph, eventName, eventPayload, {
            ...context,
            graphCallStack: [...callStack, targetGraph.id],
            variablesState: context.getGraphVariableState?.(targetGraph) || context.variablesState
          });
          if (nestedResult.error) throw Object.assign(new Error(nestedResult.error), context.signal?.aborted ? { name: 'AbortError' } : {});
          if (!nestedResult.executedNodeIds.length) throw new Error(`“${targetGraph.name || 'Target graph'}” has no trigger matching ${eventName}.`);
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'parallel') {
          const branchPins = getNodeOutputs(targetNode, connections).filter((pin) => pin.type === 'exec').map((pin) => pin.id).filter((id) => id.startsWith('branch_') && findExecOutputs(targetNode.id, id).length);
          const branches = branchPins.map((pinId) => findExecOutputs(targetNode.id, pinId));
          const joinId = await executeParallelBranches(
            branches,
            (branch) => runExecWires(branch, true, parallelDepth + 1),
            log,
            (message) => Object.assign(new Error(message), context.signal?.aborted ? { name: 'AbortError' } : {})
          );
          currentExecWires.push({ sourceNodeId: targetNode.id, sourcePinId: 'exec', targetNodeId: joinId, __releasedJoin: true });
        } else if (targetNode.type === 'parallel_join') {
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (NodeDefinitions[targetNode.type]?.pluginAdapter) {
          const definition = NodeDefinitions[targetNode.type];
          if (context.mock && definition.hostAdapter) throw new Error(`${definition.category} nodes are disabled in Offline Simulator to prevent live database changes.`);
          const inputs = Object.fromEntries(definition.inputs.filter((pin) => pin.type !== 'exec').map((pin) => [
            pin.id,
            resolveDataInput(targetNode, pin.id, pin.defaultValue)
          ]));
          const outputs = await PluginStore.executeAdapter(targetNode.type, inputs, { projectDir: context.projectDir });
          for (const [pinId, value] of Object.entries(outputs)) dataCache.set(`${targetNode.id}:${pinId}`, value);
          log(`[Plugin Adapter] ${definition.label} completed in its isolated WebAssembly worker.`);
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (DISCORD_GUILD_NODE_TYPES.has(targetNode.type)) {
          const { executeDiscordGuildNode } = await import('./nodes/runtime/discord_guild.js');
          const result = await executeDiscordGuildNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            isInputConnected: (pinId) => Boolean(findInputConnection(targetNode.id, pinId)),
            rest: context.rest,
            client: context.client,
            eventPayload,
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value),
            log
          });
          if (result !== false) currentExecWires.push(...(result === 'failure' ? findExecOutputs(targetNode.id, 'failure_exec') : findExecContinuation(targetNode.id, wire.targetPinId)));
        } else if (['action_send_message', 'action_edit_message', 'action_delete_message'].includes(targetNode.type)) {
          const { executeDiscordMessageNode } = await import('./nodes/runtime/discord_messages.js');
          await executeDiscordMessageNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            resolveComponents: () => resolveMessageComponents(targetNode),
            resolveFiles: (files) => resolveMessageFiles(targetNode, files),
            buildEmbed: () => buildEmbedFromNode(targetNode),
            isInputConnected: (pinId) => Boolean(findInputConnection(targetNode.id, pinId)),
            rest: context.rest,
            simulation: Boolean(context.simulation || context.mock),
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value),
            log
          });
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'action_deploy_slash_commands') {
          if (typeof context.deploySlashCommands !== 'function') throw new Error('Slash command deployment is available while the bot is connected, not in simulation or exported runtime.');
          const interactionToken = String(eventPayload?.token || '');
          const interactionId = String(eventPayload?.id || '');
          const canDeploy = context.canDeploySlashCommands?.() !== false;
          let deployment = null;
          let deploymentError = '';
          if (!canDeploy) {
            deploymentError = 'Only server managers with Manage Server or Administrator can deploy slash commands.';
            if (interactionToken && !interactionState.acknowledged) {
              interactionState.acknowledged = true;
              await context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 4, data: { content: deploymentError, flags: 64 } });
            }
          } else {
            if (interactionToken && !interactionState.acknowledged) {
              interactionState.acknowledged = true;
              interactionState.deferred = true;
              interactionState.pending = context.rest.deferInteractionReply?.(interactionId || 'mock', interactionToken, { ephemeral: true })
                || context.rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 5, data: { flags: 64 } });
              try { await interactionState.pending; }
              catch (error) { interactionState.acknowledged = false; interactionState.deferred = false; throw error; }
              finally { interactionState.pending = null; }
            }
            try {
              deployment = await context.deploySlashCommands();
              const count = Number(deployment?.deployed ?? deployment?.commands ?? 0);
              if (interactionToken && context.rest.editOriginalInteractionResponse) await context.rest.editOriginalInteractionResponse(interactionState.applicationId || eventPayload?.application_id, interactionToken, { content: `Deployed ${count} slash command${count === 1 ? '' : 's'}.` });
            } catch (error) {
              deploymentError = error?.message || String(error);
              if (interactionToken && interactionState.deferred && context.rest.editOriginalInteractionResponse) {
                try { await context.rest.editOriginalInteractionResponse(interactionState.applicationId || eventPayload?.application_id, interactionToken, { content: `Slash command deployment failed: ${deploymentError.slice(0, 1800)}` }); } catch { }
              }
            }
          }
          const deployedCount = Number(deployment?.deployed ?? deployment?.commands ?? 0);
          dataCache.set(`${targetNode.id}:deployed_count`, deployedCount);
          dataCache.set(`${targetNode.id}:success`, !deploymentError);
          dataCache.set(`${targetNode.id}:error`, deploymentError);
          if (deploymentError) log(`[Deploy Slash Commands] ${deploymentError}`);
          else log(`[Deploy Slash Commands] Deployed ${deployedCount} command(s).`);
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (DISCORD_INTERACTION_NODE_TYPES.has(targetNode.type)) {
          const { executeDiscordInteractionNode } = await import('./nodes/runtime/discord_interactions.js');
          await executeDiscordInteractionNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            resolveComponents: () => resolveMessageComponents(targetNode),
            resolveFiles: (files) => resolveMessageFiles(targetNode, files),
            buildEmbed: () => buildEmbedFromNode(targetNode),
            isInputConnected: (pinId) => Boolean(findInputConnection(targetNode.id, pinId)),
            rest: context.rest,
            simulation: Boolean(context.simulation || context.mock),
            log,
            state: interactionState,
            eventPayload,
            nodes,
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value)
          });
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'action_await_interaction') {
          const customIdFilter = String(resolveDataInput(targetNode, 'custom_id', targetNode.data?.custom_id || '')).trim();
          const userIdFilter = String(resolveDataInput(targetNode, 'user_id', targetNode.data?.user_id || '')).trim();
          const channelIdFilter = String(resolveDataInput(targetNode, 'channel_id', targetNode.data?.channel_id || '')).trim();
          const messageIdFilter = String(resolveDataInput(targetNode, 'message_id', targetNode.data?.message_id || '')).trim();
          const timeoutSeconds = Math.max(1, Math.min(900, Number(resolveDataInput(targetNode, 'timeout_seconds', targetNode.data?.timeout_seconds ?? 60))));

          log(`[Await Interaction] Waiting up to ${timeoutSeconds}s for interaction${customIdFilter ? ` matching custom_id "${customIdFilter}"` : ''}...`);

          let outcome = 'timeout';
          let matchedInteraction = null;

          const filterInteraction = (interaction) => {
            const incomingCustomId = String(interaction?.data?.custom_id || '').trim();
            const incomingUserId = String(interaction?.member?.user?.id || interaction?.user?.id || '').trim();
            const incomingChannelId = String(interaction?.channel_id || '').trim();
            const incomingMessageId = String(interaction?.message?.id || '').trim();

            if (customIdFilter && incomingCustomId !== customIdFilter) return false;
            if (channelIdFilter && incomingChannelId !== channelIdFilter) return false;

            if (userIdFilter && incomingUserId !== userIdFilter) return 'filter_failed';
            if (messageIdFilter && incomingMessageId !== messageIdFilter) return 'filter_failed';
            return true;
          };

          if (context.mock || !context.client?.awaitInteraction) {
            if (context.mockInteraction) {
              const res = filterInteraction(context.mockInteraction);
              if (res === true) {
                outcome = 'match';
                matchedInteraction = context.mockInteraction;
              } else if (res === 'filter_failed') {
                outcome = 'filter_failed';
                matchedInteraction = context.mockInteraction;
              }
            } else {
              outcome = 'match';
              matchedInteraction = {
                id: `mock_await_${Date.now()}`,
                token: `mock_await_tok_${Date.now()}`,
                channel_id: channelIdFilter || '120000000000000002',
                guild_id: '120000000000000000',
                message: { id: messageIdFilter || `mock_msg_${Date.now()}` },
                member: { user: { id: userIdFilter || '990000000000000001', username: 'SimulatedUser' } },
                data: {
                  component_type: 2,
                  custom_id: customIdFilter || 'sample_btn',
                  values: ['sample_value']
                }
              };
            }
          } else {
            let failedInteraction = null;
            const collected = await context.client.awaitInteraction((interaction) => {
              const res = filterInteraction(interaction);
              if (res === true) return true;
              if (res === 'filter_failed') {
                failedInteraction = interaction;
              }
              return false;
            }, {
              timeout: timeoutSeconds * 1000,
              onFilterFailed: (interaction) => {
                if (!failedInteraction) failedInteraction = interaction;
              }
            });

            if (collected) {
              outcome = 'match';
              matchedInteraction = collected;
            } else if (failedInteraction) {
              outcome = 'filter_failed';
              matchedInteraction = failedInteraction;
            } else {
              outcome = 'timeout';
            }
          }

          if (matchedInteraction) {
            const userId = matchedInteraction.member?.user?.id || matchedInteraction.user?.id || '';
            const values = Array.isArray(matchedInteraction.data?.values) ? matchedInteraction.data.values.join(',') : (matchedInteraction.data?.values || '');
            dataCache.set(`${targetNode.id}:interaction_id`, matchedInteraction.id || '');
            dataCache.set(`${targetNode.id}:interaction_token`, matchedInteraction.token || '');
            dataCache.set(`${targetNode.id}:custom_id`, matchedInteraction.data?.custom_id || '');
            dataCache.set(`${targetNode.id}:user_id`, userId);
            dataCache.set(`${targetNode.id}:channel_id`, matchedInteraction.channel_id || '');
            dataCache.set(`${targetNode.id}:guild_id`, matchedInteraction.guild_id || '');
            dataCache.set(`${targetNode.id}:message_id`, matchedInteraction.message?.id || '');
            dataCache.set(`${targetNode.id}:selected_values`, values);
            dataCache.set(`${targetNode.id}:interaction`, matchedInteraction);
          }

          if (outcome === 'match') {
            log(`[Await Interaction] Interaction received: ${matchedInteraction?.data?.custom_id || 'matched'}`);
            currentExecWires.push(...findExecOutputs(targetNode.id, 'exec'));
          } else if (outcome === 'filter_failed') {
            log('[Await Interaction] Interaction arrived but failed user/message filter.');
            const failedWires = findExecOutputs(targetNode.id, 'filter_failed_exec');
            if (failedWires.length > 0) {
              currentExecWires.push(...failedWires);
            }
          } else {
            log(`[Await Interaction] Timed out after ${timeoutSeconds}s without matching interaction.`);
            currentExecWires.push(...findExecOutputs(targetNode.id, 'timeout_exec'));
          }
        } else if (['action_console_log', 'action_console_warn', 'action_console_error'].includes(targetNode.type)) {
          const { executeConsoleLogNode } = await import('./nodes/runtime/console_log.js');
          executeConsoleLogNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            log
          });
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'action_set_custom_status') {
          log('Set Custom Status moved to Set Presence. Configure Custom Status there, then delete this node.', 'WARN');
          dataCache.set(`${targetNode.id}:success`, false);
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (targetNode.type === 'action_set_presence') {
          const { executePresenceNode } = await import('./nodes/runtime/discord_presence.js');
          executePresenceNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            context,
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value),
            log
          });
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (NETWORK_NODE_TYPES.has(targetNode.type)) {
          const { executeNetworkNode } = await import('./nodes/runtime/network.js');
          await executeNetworkNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value),
            context,
            log
          });
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        } else if (WEBSOCKET_NODE_TYPES.has(targetNode.type)) {
          const { executeWebSocketNode } = await import('./nodes/runtime/websocket.js');
          const result = await executeWebSocketNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value),
            context,
            log
          });
          currentExecWires.push(...(result === 'failure' ? findExecOutputs(targetNode.id, 'failure_exec') : findExecContinuation(targetNode.id, wire.targetPinId)));
        } else if (CRYPTO_NODE_TYPES.has(targetNode.type)) {
          const { executeCryptoNode } = await import('./nodes/runtime/crypto.js');
          executeCryptoNode(targetNode, {
            resolveInput: (pinId, fallback) => resolveDataInput(targetNode, pinId, fallback),
            setOutput: (pinId, value) => dataCache.set(`${targetNode.id}:${pinId}`, value),
            log
          });
          currentExecWires.push(...findExecContinuation(targetNode.id, wire.targetPinId));
        }
        const timing = recordNodeTiming(targetNode, nodeStartedAt, wire, 'completed');
        await context.onSimulationStep?.({ ...timing, type: targetNode.type, label: targetNode.label || NodeDefinitions[targetNode.type]?.label || targetNode.type });
        await recordDebugStep(targetNode, debugInputs, 'completed', '', timing);
      } catch (nodeErr) {
        const safeError = redactSecretText(nodeErr?.message || String(nodeErr));
        const timing = recordNodeTiming(targetNode, nodeStartedAt, wire, 'error');
        await context.onSimulationStep?.({ ...timing, type: targetNode.type, label: targetNode.label || NodeDefinitions[targetNode.type]?.label || targetNode.type, error: safeError });
        if (nodeErr?.name === 'AbortError') return { error: safeError };
        log(`[Node Error] Failed on node ${targetNode.id}: ${safeError}`, 'ERROR', { graphId: graph.id, nodeId: targetNode.id, nodeLabel: targetNode.label || NodeDefinitions[targetNode.type]?.label || targetNode.type });
        try {
          context.onNodeError?.({ graphId: graph.id, graphName: graph.name || graph.id, nodeId: targetNode.id, nodeLabel: targetNode.label || NodeDefinitions[targetNode.type]?.label || targetNode.type, error: safeError });
        } catch {}
        if (context.debug) await recordDebugStep(targetNode, [], 'error', safeError, timing);
        return { error: safeError };
      }
      }
      return reachedJoinId ? { joinId: reachedJoinId } : null;
    };

    const executionError = await runExecWires(findExecOutputs(startNode.id, 'exec'));

    if (eventName === 'FUNCTION_CALL' && functionReturnValue === undefined) {
      const returnNode = nodes.find((node) => node.type === 'function_return');
      if (returnNode) {
        const returnStartedAt = performance.now();
        functionReturnValue = resolveFunctionReturnResult(returnNode, resolveDataInput);
        recordExecutedNode(returnNode.id);
        const timing = recordNodeTiming(returnNode, returnStartedAt);
        await context.onSimulationStep?.({ ...timing, type: returnNode.type, label: returnNode.label || NodeDefinitions[returnNode.type]?.label || returnNode.type });
      }
    }

    return {
      executedNodeIds,
      traces,
      debugSteps,
      nodeTimings,
      wirePath,
      result: functionReturnValue,
      error: executionError?.error || null,
      elapsedMs: Math.round(Math.max(0, performance.now() - runStartedAt - debugPausedMs) * 100) / 100
    };
  }
}

function evaluateFunctionGraph(graph, argumentValues, context, callStack) {
  if (!graph || callStack.length >= 24 || callStack.includes(graph.id)) return undefined;
  const nodes = graph.nodes || [];
  if (nodes.filter((node) => node.type === 'function_return').length > 1) throw new Error('A function graph can have only one Return Value node.');
  const connections = graph.connections || [];
  const nextStack = [...callStack, graph.id];
  const cache = new Map();
  const functionCallResultCache = new Map();
  const warnedTemplateExpressions = new Set();
  const warnUndefinedTemplate = (node, expression, references = []) => {
    const key = `${node?.id || 'graph'}:${expression}`;
    if (warnedTemplateExpressions.has(key)) return;
    warnedTemplateExpressions.add(key);
    const names = references.length ? references.join(', ') : expression;
    context.log?.(`[Template] Undefined or null value for ${names} in ${node?.label || node?.type || 'function'} (${node?.id || graph.id}).`, 'WARN');
  };
  const findNode = (id) => nodes.find((node) => node.id === id);
  const inputWire = (nodeId, pinId) => connections.find((wire) => wire.targetNodeId === nodeId && wire.targetPinId === pinId);

  const resolveOutput = (node, pinId) => {
    if (!node) return undefined;
    const key = `${node.id}:${pinId}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    if (node.type === 'function_input') {
      const argument = getFunctionInputArguments(node).find((item) => item.legacy ? pinId === 'value' : functionArgumentPinId(item) === pinId);
      if (argument) result = argumentValues.has(argument.paramId) ? argumentValues.get(argument.paramId) : argument.defaultValue;
    } else if (node.type === 'variable_get') {
      const wire = inputWire(node.id, 'variable');
      const connected = wire ? resolveOutput(findNode(wire.sourceNodeId), wire.sourcePinId) : null;
      const reference = connected?.__arcVariableRef ? connected : { __arcVariableRef: true, variableId: node.data?.variableId, scope: node.data?.scope || 'graph' };
      result = pinId === 'variable' ? reference : context.resolveFunctionVariable?.(reference.variableId, reference.scope, graph);
    } else if (node.type === 'variable_create' && pinId === 'variable') {
      result = { __arcVariableRef: true, variableId: `nodevar_${node.id}`, scope: 'graph' };
    } else if (node.type === 'variable_set' && pinId === 'variable') {
      const wire = inputWire(node.id, 'variable');
      const connected = wire ? resolveOutput(findNode(wire.sourceNodeId), wire.sourcePinId) : null;
      result = connected?.__arcVariableRef ? connected : { __arcVariableRef: true, variableId: node.data?.variableId, scope: node.data?.scope || 'graph' };
    } else if (node.type.startsWith('data_')) {
      const inputs = Object.fromEntries(getNodeInputs(node, connections, [...graphVariables, ...projectVariables]).map((pin) => [pin.id, resolveInput(node, pin.id, pin.defaultValue)]));
      const values = evaluateDataNode(node.type, inputs, node.data || {});
      for (const [id, value] of Object.entries(values)) cache.set(`${node.id}:${id}`, value);
      result = values[pinId];
    } else if (node.type.startsWith('value_')) {
      result = resolveInput(node, 'value', node.data?.value ?? defaultValueForType(node.type.slice(6)));
    } else if (node.type === 'function_math') {
      const a = Number(resolveInput(node, 'a', 0));
      const b = Number(resolveInput(node, 'b', 0));
      const operation = node.data?.operation || 'add';
      result = operation === 'subtract' ? a - b
        : operation === 'multiply' ? a * b
          : operation === 'divide' ? (b === 0 ? 0 : a / b)
            : operation === 'modulo' ? (b === 0 ? 0 : a % b) : a + b;
      if (!Number.isFinite(result)) result = 0;
    } else if (node.type.startsWith('math_')) {
      const inputs = Object.fromEntries((NodeDefinitions[node.type]?.inputs || []).map((pin) => [pin.id, resolveInput(node, pin.id, pin.defaultValue)]));
      result = evaluateMathNode(node.type, inputs, node.data || {});
    } else if (node.type.startsWith('logic_')) {
      const inputs = Object.fromEntries((NodeDefinitions[node.type]?.inputs || []).map((pin) => [pin.id, Boolean(resolveInput(node, pin.id, pin.defaultValue))]));
      result = evaluateLogicNode(node.type, inputs);
    } else if (node.type === 'compare_text') {
      const left = String(resolveInput(node, 'text_a', node.data?.text_a || ''));
      const right = String(resolveInput(node, 'text_b', node.data?.text_b || ''));
      const operation = node.data?.operator || 'equals';
      result = operation === 'contains' ? left.includes(right)
        : operation === 'startsWith' ? left.startsWith(right)
          : operation === 'endsWith' ? left.endsWith(right) : left === right;
    } else if (node.type === 'format_text') {
      result = renderTextTemplate(node.data?.template, (name) => {
        const argumentMatch = /^arg(\d+)$/i.exec(name);
        if (argumentMatch && Number(argumentMatch[1]) >= 1 && Number(argumentMatch[1]) <= 50) return resolveInput(node, `arg_${Number(argumentMatch[1])}`, undefined);
        const variable = graphVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase()) || projectVariables.find((item) => item.name?.toLowerCase() === name.toLowerCase());
        if (variable) return getVariableValue(variable.id, projectVariableDefinitions.has(variable.id) ? 'project' : 'graph');
        const argument = getFunctionGraphArguments(graph).find((item) => item.name.toLowerCase() === name.toLowerCase());
        const inputNode = argument && nodes.find((item) => item.id === argument.inputNodeId);
        const fallback = argument && inputNode ? resolveOutput(inputNode, argument.legacy ? 'value' : functionArgumentPinId(argument)) : undefined;
        const value = resolveInput(node, `slot_${name}`, fallback);
        return value;
      }, context.appEmojis, (expression, references) => warnUndefinedTemplate(node, expression, references), {
        resolveFunction: (name, values) => context.resolveTemplateFunction?.(name, values, graph, nextStack)
      });
    } else if (node.type === 'function_call') {
      const nestedGraph = context.resolveFunctionGraph?.(node.data?.graphId);
      if (nestedGraph) {
        const returnValue = getFunctionGraphReturnValues(nestedGraph).find((item) => functionReturnOutputPinId(item) === pinId);
        if (!returnValue) return undefined;
        let functionResult;
        if (functionCallResultCache.has(node.id)) functionResult = functionCallResultCache.get(node.id);
        else {
          const nestedParams = getFunctionGraphArguments(nestedGraph);
          const missingParameter = nestedParams.find((parameter) => parameter.optional === false
            && !inputWire(node.id, functionArgumentPinId(parameter)));
          if (missingParameter) throw new Error(`${nestedGraph.name || 'Function'} requires an input for “${missingParameter.name || 'Input'}”.`);
          const nestedValues = new Map(nestedParams.map((parameter) => {
            return [parameter.paramId, resolveInput(node, functionArgumentPinId(parameter), parameter.defaultValue ?? defaultValueForFunctionType(parameter.valueType))];
          }));
          functionResult = evaluateFunctionGraph(nestedGraph, nestedValues, context, nextStack);
          functionCallResultCache.set(node.id, functionResult);
        }
        result = returnValue.legacy ? functionResult : functionResult?.[returnValue.returnId];
      }
    }
    cache.set(key, result);
    return result;
  };

  function resolveInput(node, pinId, fallback) {
    const wire = inputWire(node.id, pinId);
    if (wire) {
      const value = resolveOutput(findNode(wire.sourceNodeId), wire.sourcePinId);
      if (value !== undefined) return value;
    }
    return node.data?.[pinId] ?? fallback;
  }

  const returnNode = nodes.find((node) => node.type === 'function_return');
  return returnNode ? resolveFunctionReturnResult(returnNode, resolveInput) : undefined;
}

function defaultValueForType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return '';
}

function coerceVariableValue(value, type = 'string', fallback) {
  if (type === 'number') {
    if (typeof value === 'string' && /^\d{16,22}$/.test(value) && BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) return value;
    const number = Number(value);
    return Number.isFinite(number) ? number : Number(fallback) || 0;
  }
  if (type === 'boolean') {
    if (typeof value === 'string') return !['', 'false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
    return Boolean(value);
  }
  if (type === 'attachment') return value && typeof value === 'object' ? value : fallback ?? null;
  if (type === 'array' || type === 'object') {
    const valid = type === 'array' ? Array.isArray(value) : value && typeof value === 'object' && !Array.isArray(value);
    if (!valid) return fallback ?? defaultValueForType(type);
    try {
      const serialized = JSON.stringify(value);
      return serialized.length <= 10000 ? JSON.parse(serialized) : fallback ?? defaultValueForType(type);
    } catch { return fallback ?? defaultValueForType(type); }
  }
  return value == null ? '' : String(value);
}

function safeEmbedUrl(value, allowAttachment = false) {
  const text = String(value || '').trim();
  if (allowAttachment && /^attachment:\/\/[^?#\r\n]{1,100}$/.test(text)) return text;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? text : '';
  } catch {
    return '';
  }
}

function limitEmbedText(embed) {
  const result = { ...embed };
  let remaining = 6000;
  const shorten = (value) => {
    if (typeof value !== 'string') return value;
    const next = value.slice(0, Math.max(0, remaining));
    remaining -= next.length;
    return next;
  };
  if (result.title) result.title = shorten(result.title);
  if (result.description) result.description = shorten(result.description);
  if (result.author?.name) result.author = { ...result.author, name: shorten(result.author.name) };
  if (result.footer?.text) result.footer = { ...result.footer, text: shorten(result.footer.text) };
  if (Array.isArray(result.fields)) {
    result.fields = result.fields
      .map((field) => ({ ...field, name: shorten(field.name), value: shorten(field.value) }))
      .filter((field) => field.name && field.value);
  }
  if (!result.title) delete result.title;
  if (!result.description) delete result.description;
  if (result.author && !result.author.name) delete result.author;
  if (result.footer && !result.footer.text) delete result.footer;
  return result;
}

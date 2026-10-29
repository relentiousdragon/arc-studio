import { flattenSlashParameters, isValidSlashName } from './SlashCommandOptions.js';
import { functionArgumentPinId, functionInputPinType, getFunctionInputArguments } from './FunctionGraphContract.js';
//
export const NODE_SCHEMA_VERSION = 2;
export const MAX_NODE_ARGUMENTS = 50;

const pinIndex = (pinId, prefix) => Number(new RegExp(`^${prefix}(\\d+)$`).exec(String(pinId || ''))?.[1]) || 0;

export function getNodeArgumentPins(node, baseInputs = [], connections = []) {
  const excluded = ['function_input', 'function_return', 'function_call', 'variable_get', 'data_permission_overwrites'];
  if (!node || node.type.startsWith('event_') || excluded.includes(node.type) || node.type === 'data_permission_overwrites') return [];
  if (!['build_embed', 'build_modal', 'build_components', 'format_text', 'data_regex'].includes(node.type) && !baseInputs.some((pin) => pin.type === 'string')) return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    return Math.max(highest, pinIndex(connection.targetPinId, 'arg_'));
  }, 0);
  return Array.from({ length: Math.min(MAX_NODE_ARGUMENTS, Math.max(1, highestConnected + 1)) }, (_, index) => ({ id: `arg_${index + 1}`, label: `arg${index + 1}`, type: 'arg', defaultValue: '' }));
}

export function getArrayCombinePins(node, connections = []) {
  if (node?.type !== 'data_array_concat') return [];
  const highestConnected = connections.reduce((highest, connection) => {
    if (connection.targetNodeId !== node.id) return highest;
    return Math.max(highest, Number(/^array_(\d+)$/.exec(connection.targetPinId)?.[1]) || 0);
  }, 0);
  const count = Math.min(50, Math.max(2, highestConnected + 1));
  const pins = Array.from({ length: count }, (_, index) => ({ id: `array_${index + 1}`, label: `Array ${index + 1}`, type: 'object', defaultValue: [] }));
  if (connections.some((connection) => connection.targetNodeId === node.id && ['array_a', 'array_b'].includes(connection.targetPinId))) {
    pins.push({ id: 'array_a', label: 'Array A', type: 'object', defaultValue: [] }, { id: 'array_b', label: 'Array B', type: 'object', defaultValue: [] });
  }
  return pins;
}

function getHighestConnected(node, connections, prefix, direction = 'input') {
  return connections.reduce((highest, connection) => {
    if (direction === 'output') {
      return connection.sourceNodeId === node?.id ? Math.max(highest, pinIndex(connection.sourcePinId, prefix)) : highest;
    }
    return connection.targetNodeId === node?.id ? Math.max(highest, pinIndex(connection.targetPinId, prefix)) : highest;
  }, 0);
}

function getStoredHighest(node, prefix) {
  return Object.keys(node?.data || {}).reduce((highest, key) => Math.max(highest, pinIndex(key, prefix)), 0);
}

function getSequentialPins(rule, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: rule.id.replaceAll('{index}', String(index + 1)),
    label: rule.label.replaceAll('{index}', String(index + 1)),
    type: rule.type,
    ...(Object.hasOwn(rule, 'defaultValue') ? { defaultValue: rule.defaultValue } : {})
  }));
}

export function resolveDynamicNodePins(definition, node, connections = []) {
  const rule = definition?.dynamicPins;
  if (!rule || !node) return null;
  if (rule.kind === 'array-combine') return { inputs: getArrayCombinePins(node, connections) };
  if (rule.kind === 'slash-options') {
    const types = { 4: 'number', 5: 'boolean', 10: 'number', 11: 'object' };
    const parameterPins = flattenSlashParameters(node.data?.options).filter(({ path }) => path.every(isValidSlashName));
    const options = parameterPins.map(({ option, path, pinId }) => ({
      id: pinId,
      label: path.join(' / '),
      type: types[Number(option.type)] || 'string',
      ...(Number(option.type) === 11 ? { colorType: 'attachment' } : {})
    }));
    return { outputs: [...(definition.outputs || []).filter((pin) => !pin.id.startsWith('option_')), ...options] };
  }
  if (rule.kind === 'function-input-arguments') {
    if (!Array.isArray(node.data?.arguments)) return null;
    const outputs = getFunctionInputArguments(node).map((argument) => ({
      id: functionArgumentPinId(argument),
      label: argument.name,
      type: functionInputPinType(argument),
      ...(argument.valueType.endsWith('_id') || argument.valueType === 'interaction_token' ? { semanticType: argument.valueType } : {})
    }));
    return { outputs: [...(definition.outputs || []).filter((pin) => pin.id === 'exec'), ...outputs] };
  }
  if (rule.kind === 'connected-output-arguments') {
    const highest = connections.reduce((value, connection) => connection.sourceNodeId === node.id
      ? Math.max(value, pinIndex(connection.sourcePinId, rule.prefix || 'argument_')) : value, 0);
    const outputs = getSequentialPins({ id: `${rule.prefix || 'argument_'}{index}`, label: rule.label || 'Argument {index}', type: rule.type || 'string' }, Math.min(rule.max || 50, highest));
    return { outputs: [...(definition.outputs || []).filter((pin) => !pin.id.startsWith(rule.prefix || 'argument_')), ...outputs] };
  }
  if (rule.kind === 'indexed-inputs' || rule.kind === 'indexed-outputs') {
    const direction = rule.kind === 'indexed-inputs' ? 'input' : 'output';
    const prefix = rule.connectionPrefix || rule.prefix;
    const highest = getHighestConnected(node, connections, prefix, direction);
    const stored = direction === 'input' ? getStoredHighest(node, prefix) : 0;
    const count = Math.min(rule.max || 50, Math.max(rule.min || 1, highest + (rule.revealNext === false ? 0 : 1), stored));
    const pins = getSequentialPins({
      id: rule.id || `${prefix}{index}`,
      label: rule.label || `${rule.itemLabel || 'Value'} {index}`,
      type: rule.type || 'string',
      ...(Object.hasOwn(rule, 'defaultValue') ? { defaultValue: rule.defaultValue } : {})
    }, count);
    return direction === 'input' ? { inputs: pins } : { outputs: [...(definition.outputs || []), ...pins] };
  }
  if (rule.kind === 'array-items' || rule.kind === 'array-append-items') {
    const highest = Math.max(getHighestConnected(node, connections, rule.connectionPrefix), getStoredHighest(node, rule.id.replace('{index}', '')));
    const count = Math.min(rule.max || 50, Math.max(rule.min || 1, highest + (rule.revealNext ? 1 : 0)));
    const generated = getSequentialPins(rule, count);
    if (rule.kind === 'array-append-items') {
      const baseArrayPin = (definition.inputs || []).find((pin) => pin.id === 'array');
      if (baseArrayPin) generated.unshift(baseArrayPin);
      if (connections.some((connection) => connection.targetNodeId === node.id && connection.targetPinId === 'value')) {
        generated.push({ id: 'value', label: 'Item', type: 'arg' });
      }
    }
    return { inputs: generated };
  }
  if (rule.kind === 'math-list') {
    const baseIds = rule.baseIds || [];
    const highest = connections.reduce((value, connection) => {
      if (connection.targetNodeId !== node.id) return value;
      const baseIndex = baseIds.indexOf(connection.targetPinId);
      const extraIndex = pinIndex(connection.targetPinId, rule.extraPrefix || 'value_');
      return Math.max(value, baseIndex >= 0 ? baseIndex + 1 : extraIndex);
    }, 0);
    const count = Math.min(rule.max || 50, Math.max(rule.min || 2, highest + 1));
    return { inputs: Array.from({ length: count }, (_, index) => ({
      id: baseIds[index] || `${rule.extraPrefix || 'value_'}${index - baseIds.length + 1}`,
      label: baseIds[index] ? String.fromCharCode(65 + index) : `${rule.extraLabel || 'Value'} ${index + 1}`,
      type: rule.type || 'number',
      defaultValue: rule.defaultValue ?? 0
    })) };
  }
  if (rule.kind === 'wire-extender') {
    const highest = connections.reduce((value, connection) => {
      const source = connection.sourceNodeId === node.id ? connection.sourcePinId : '';
      const target = connection.targetNodeId === node.id ? connection.targetPinId : '';
      return Math.max(value,
        Number(/^value_out_(\d+)$/.exec(source)?.[1]) || (source === 'value_out' ? 1 : 0),
        Number(/^value_in_(\d+)$/.exec(target)?.[1]) || (target === 'value_in' ? 1 : 0));
    }, 0);
    const legacy = connections.some((connection) => (connection.sourceNodeId === node.id && connection.sourcePinId === 'value_out')
      || (connection.targetNodeId === node.id && connection.targetPinId === 'value_in'));
    const count = Math.min(rule.max || 7, Math.max(1, highest + 1));
    const inputs = [...(definition.inputs || []).filter((pin) => pin.type === 'exec')];
    const outputs = [...(definition.outputs || []).filter((pin) => pin.type === 'exec')];
    for (let index = 1; index <= count; index += 1) {
      const suffix = legacy && index === 1 ? '' : `_${index}`;
      inputs.push({ id: `value_in${suffix}`, label: `Any Value ${index}`, type: 'any' });
      outputs.push({ id: `value_out${suffix}`, label: `Any Value ${index}`, type: 'any' });
    }
    return { inputs, outputs };
  }
  if (rule.kind === 'permission-overwrites') {
    const highestConnected = getHighestConnected(node, connections, 'target_id_');
    const highest = Math.max(highestConnected + (highestConnected ? 1 : 0), getStoredHighest(node, 'target_id_'), Number(node.data?.overwriteCount) || 0);
    return { inputs: getSequentialPins({ id: 'target_id_{index}', label: 'Target ID {index}', type: 'string', defaultValue: '' }, Math.min(rule.max || 100, Math.max(1, highest))) };
  }
  if (rule.kind === 'switch-cases') {
    const highestConnected = connections.reduce((highest, connection) => {
      const inputCase = connection.targetNodeId === node.id ? pinIndex(connection.targetPinId, 'case_') : 0;
      const outputCase = connection.sourceNodeId === node.id ? Number(/^case_(\d+)_exec$/.exec(connection.sourcePinId || '')?.[1]) || 0 : 0;
      return Math.max(highest, inputCase, outputCase);
    }, 0);
    const storedCases = getStoredHighest(node, 'case_');
    const count = Math.min(rule.max || 50, Math.max(rule.min || 2, Number(node.data?.caseCount) || 0, storedCases, highestConnected + (highestConnected ? 1 : 0)));
    const inputs = Array.from({ length: count }, (_, index) => ({ id: `case_${index + 1}`, label: `Case ${index + 1}`, type: 'string', defaultValue: '' }));
    const outputs = [
      ...Array.from({ length: count }, (_, index) => ({ id: `case_${index + 1}_exec`, label: `Case ${index + 1}`, type: 'exec' })),
      ...(definition.outputs || []).filter((pin) => pin.id === 'default_exec')
    ];
    return { inputs: [...(definition.inputs || []).filter((pin) => pin.type === 'exec' || pin.id === 'value'), ...inputs], outputs };
  }
  return null;
}


export const FUNCTION_ARGUMENT_VALUE_TYPES = Object.freeze([
  'number', 'string', 'boolean', 'object', 'channel_id', 'thread_id', 'message_id',
  'interaction_id', 'application_id', 'guild_id', 'user_id', 'role_id', 'interaction_token'
]);

export function getFunctionInputArguments(node) {
  if (!node || node.type !== 'function_input') return [];
  if (Array.isArray(node.data?.arguments)) {
    return node.data.arguments.map((argument, index) => ({
      ...argument,
      paramId: String(argument?.paramId || `${node.id}_argument_${index + 1}`),
      name: String(argument?.name || `Input ${index + 1}`),
      valueType: String(argument?.valueType || 'string'),
      optional: Boolean(argument?.optional),
      defaultValue: argument?.defaultValue ?? defaultValueForFunctionType(argument?.valueType),
      inputNodeId: node.id
    }));
  }
  return [{
    paramId: String(node.data?.paramId || node.id),
    name: String(node.data?.name || 'Input'),
    valueType: String(node.data?.valueType || 'number'),
    optional: Boolean(node.data?.optional),
    defaultValue: node.data?.defaultValue ?? defaultValueForFunctionType(node.data?.valueType),
    inputNodeId: node.id,
    legacy: true
  }];
}

export function getFunctionGraphArguments(graph) {
  return (graph?.nodes || []).filter((node) => node?.type === 'function_input').flatMap(getFunctionInputArguments);
}

export function functionArgumentPinId(argument) {
  return `arg_${String(argument?.paramId || argument?.id || '')}`;
}

export function functionInputPinType(argument) {
  const valueType = argument?.valueType || 'string';
  return valueType.endsWith('_id') || valueType === 'interaction_token' ? 'string' : valueType;
}

export function defaultValueForFunctionType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'object' || type === 'array') return type === 'array' ? [] : {};
  return '';
}

export function migrateFunctionGraphEntry(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return graph;
  const inputs = graph.nodes.filter((node) => node?.type === 'function_input');
  if (inputs.length <= 1) return graph;
  const primary = inputs[0];
  const argumentsList = [];
  const pinRemaps = new Map();
  const usedIds = new Set();
  const usedNames = new Set();
  for (const input of inputs) {
    pinRemaps.set(`${input.id}:exec`, { nodeId: primary.id, pinId: 'exec' });
    const oldArguments = getFunctionInputArguments(input);
    for (const argument of oldArguments) {
      const cleanParamId = argument.paramId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || `argument_${argumentsList.length + 1}`;
      let paramId = cleanParamId;
      let idSuffix = 2;
      while (usedIds.has(paramId)) {
        const suffix = `_${idSuffix++}`;
        paramId = `${cleanParamId.slice(0, 64 - suffix.length)}${suffix}`;
      }
      let name = argument.name.trim().slice(0, 40) || `Input ${argumentsList.length + 1}`;
      let nameSuffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        const suffix = ` ${nameSuffix++}`;
        name = `${name.slice(0, 40 - suffix.length)}${suffix}`;
      }
      usedIds.add(paramId);
      usedNames.add(name.toLowerCase());
      const normalized = {
        paramId,
        name,
        valueType: argument.valueType,
        optional: argument.optional,
        defaultValue: argument.defaultValue
      };
      argumentsList.push(normalized);
      if (argument.legacy) pinRemaps.set(`${input.id}:value`, { nodeId: primary.id, pinId: functionArgumentPinId(normalized) });
      pinRemaps.set(`${input.id}:${functionArgumentPinId(argument)}`, { nodeId: primary.id, pinId: functionArgumentPinId(normalized) });
    }
  }
  const removedIds = new Set(inputs.slice(1).map((node) => node.id));
  const nodes = graph.nodes.filter((node) => !removedIds.has(node.id)).map((node) => node.id === primary.id
    ? { ...node, data: { ...node.data, arguments: argumentsList } }
    : node);
  const mappedConnections = (graph.connections || []).map((wire) => {
    const source = pinRemaps.get(`${wire.sourceNodeId}:${wire.sourcePinId}`);
    return source ? { ...wire, sourceNodeId: source.nodeId, sourcePinId: source.pinId } : wire;
  }).filter((wire) => !removedIds.has(wire.targetNodeId));
  const seenWires = new Set();
  const connections = mappedConnections.filter((wire) => {
    const key = `${wire.sourceNodeId}:${wire.sourcePinId}:${wire.targetNodeId}:${wire.targetPinId}`;
    if (seenWires.has(key)) return false;
    seenWires.add(key);
    return true;
  });
  return { ...graph, nodes, connections, isDirty: true };
}

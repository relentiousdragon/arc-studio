export const FUNCTION_ARGUMENT_VALUE_TYPES = Object.freeze(['number', 'string', 'boolean', 'object', 'channel_id', 'interaction_token']);

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
  return ['channel_id', 'interaction_token'].includes(argument?.valueType) ? 'string' : argument?.valueType || 'string';
}

export function defaultValueForFunctionType(type) {
  if (type === 'number') return 0;
  if (type === 'boolean') return false;
  if (type === 'object' || type === 'array') return type === 'array' ? [] : {};
  return '';
}

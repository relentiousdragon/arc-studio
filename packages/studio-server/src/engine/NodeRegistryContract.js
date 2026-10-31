export const NODE_REGISTRY_PROTOCOL_VERSION = 1;
export const CLIENT_PROTOCOL_VERSION = 1;

export const SUPPORTED_DYNAMIC_PIN_KINDS = Object.freeze([
  'array-combine', 'array-items', 'array-append-items', 'math-list', 'permission-overwrites',
  'switch-cases', 'indexed-inputs', 'indexed-outputs', 'wire-extender', 'slash-options',
  'connected-output-arguments', 'function-input-arguments', 'connected-interaction-outputs'
]);

export const SUPPORTED_EDITOR_CONTROL_TYPES = Object.freeze(['hint', 'checkbox', 'number', 'select', 'text']);
export const SUPPORTED_PIN_TYPES = Object.freeze(['exec', 'variable', 'string', 'number', 'boolean', 'object', 'array', 'arg', 'embed', 'any']);

export const SUPPORTED_NODE_REGISTRY_FEATURES = Object.freeze([
  'registry.node-definitions.v1',
  'registry.categories.v1',
  'node.dynamic-pins.slash-options.v2',
  'node.pin-semantics.v1',
  ...SUPPORTED_PIN_TYPES.map((type) => `node.pin-type.${type}.v1`),
  ...SUPPORTED_DYNAMIC_PIN_KINDS.map((kind) => `node.dynamic-pins.${kind}.v1`),
  ...SUPPORTED_EDITOR_CONTROL_TYPES.map((type) => `node.editor-control.${type}.v1`)
]);

const PIN_TYPES = new Set(SUPPORTED_PIN_TYPES);
const FEATURE_PATTERN = /^[a-z][a-z0-9.-]{0,127}$/;

function isJsonValue(value, seen = new Set()) {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function addIssue(issues, path, message) {
  issues.push(`${path}: ${message}`);
}

export function getNodeRegistryRequiredFeatures(definitions = []) {
  const features = new Set(['registry.node-definitions.v1', 'registry.categories.v1']);
  for (const definition of definitions) {
    for (const pin of [...(Array.isArray(definition?.inputs) ? definition.inputs : []), ...(Array.isArray(definition?.outputs) ? definition.outputs : [])]) {
      const pinVersion = Number.isInteger(pin?.version) && pin.version > 0 ? pin.version : 1;
      if (typeof pin?.type === 'string') features.add(`node.pin-type.${pin.type}.v${pinVersion}`);
      if (typeof pin?.semanticType === 'string') features.add('node.pin-semantics.v1');
    }
    const kind = definition?.dynamicPins?.kind;
    const ruleVersion = Number.isInteger(definition?.dynamicPins?.version) && definition.dynamicPins.version > 0 ? definition.dynamicPins.version : 1;
    if (typeof kind === 'string') features.add(`node.dynamic-pins.${kind}.v${ruleVersion}`);
    for (const control of Array.isArray(definition?.editorControls) ? definition.editorControls : []) {
      const controlVersion = Number.isInteger(control?.version) && control.version > 0 ? control.version : 1;
      if (typeof control?.type === 'string') features.add(`node.editor-control.${control.type}.v${controlVersion}`);
    }
  }
  return [...features].sort();
}

export function getUnsupportedNodeRegistryFeatures(requiredFeatures = [], supportedFeatures = []) {
  const supported = new Set(Array.isArray(supportedFeatures) ? supportedFeatures : []);
  return [...new Set(Array.isArray(requiredFeatures) ? requiredFeatures : [])]
    .filter((feature) => !supported.has(feature))
    .sort();
}

export function getNodeRegistryCompatibility(client, requiredFeatures = []) {
  const protocolSupported = client?.nodeRegistryProtocolVersion === NODE_REGISTRY_PROTOCOL_VERSION;
  const unsupportedFeatures = getUnsupportedNodeRegistryFeatures(requiredFeatures, client?.nodeRegistryFeatures);
  return {
    compatible: protocolSupported && unsupportedFeatures.length === 0,
    protocolSupported,
    unsupportedFeatures,
    requiredFeatures: [...new Set(requiredFeatures)].sort()
  };
}

export function validateNodeDefinitions(definitions) {
  const issues = [];
  const entries = Array.isArray(definitions)
    ? definitions.map((definition, index) => [String(definition?.type || index), definition])
    : definitions && typeof definitions === 'object'
      ? Object.entries(definitions)
      : [];
  if (!entries.length) return ['definitions: expected a non empty node definition collection'];

  const types = new Set();
  for (const [key, definition] of entries) {
    const path = `definitions.${key}`;
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      addIssue(issues, path, 'expected an object');
      continue;
    }
    if (typeof definition.type !== 'string' || !definition.type.trim() || definition.type.length > 128) {
      addIssue(issues, `${path}.type`, 'expected a non empty string up to 128 characters');
    } else if (types.has(definition.type)) {
      addIssue(issues, `${path}.type`, `duplicate node type ${definition.type}`);
    } else types.add(definition.type);
    if (key !== String(definition.type)) addIssue(issues, path, 'collection key must match the stable node type');
    if (typeof definition.label !== 'string' || !definition.label.trim()) addIssue(issues, `${path}.label`, 'expected a non empty display label');
    for (const direction of ['inputs', 'outputs']) {
      if (!Array.isArray(definition[direction])) {
        addIssue(issues, `${path}.${direction}`, 'expected an array');
        continue;
      }
      const ids = new Set();
      for (const [index, pin] of definition[direction].entries()) {
        const pinPath = `${path}.${direction}[${index}]`;
        if (!pin || typeof pin !== 'object' || Array.isArray(pin)) {
          addIssue(issues, pinPath, 'expected an object');
          continue;
        }
        if (typeof pin.id !== 'string' || !pin.id.trim()) addIssue(issues, `${pinPath}.id`, 'expected a non empty stable ID');
        else if (ids.has(pin.id)) addIssue(issues, `${pinPath}.id`, `duplicate pin ID ${pin.id}`);
        else ids.add(pin.id);
        if (typeof pin.label !== 'string' || !pin.label.trim()) addIssue(issues, `${pinPath}.label`, 'expected a non empty display label');
        if (typeof pin.type !== 'string' || !PIN_TYPES.has(pin.type)) addIssue(issues, `${pinPath}.type`, `unsupported pin type ${String(pin.type)}`);
        if (pin.version !== undefined && (!Number.isInteger(pin.version) || pin.version < 1)) addIssue(issues, `${pinPath}.version`, 'expected a positive integer');
        if (Object.hasOwn(pin, 'defaultValue') && !isJsonValue(pin.defaultValue)) addIssue(issues, `${pinPath}.defaultValue`, 'must be JSON serializable');
        if (!isJsonValue(pin)) addIssue(issues, pinPath, 'must contain JSON values only');
      }
    }
    if (Object.hasOwn(definition, 'defaultData') && (!definition.defaultData || typeof definition.defaultData !== 'object' || Array.isArray(definition.defaultData) || !isJsonValue(definition.defaultData))) addIssue(issues, `${path}.defaultData`, 'must be a JSON object');
    if (definition.dynamicPins !== undefined && (!definition.dynamicPins || typeof definition.dynamicPins !== 'object' || Array.isArray(definition.dynamicPins) || typeof definition.dynamicPins.kind !== 'string')) {
      addIssue(issues, `${path}.dynamicPins`, 'expected an object with a kind');
    }
    if (definition.dynamicPins?.version !== undefined && (!Number.isInteger(definition.dynamicPins.version) || definition.dynamicPins.version < 1)) addIssue(issues, `${path}.dynamicPins.version`, 'expected a positive integer');
    if (definition.editorControls !== undefined && !Array.isArray(definition.editorControls)) addIssue(issues, `${path}.editorControls`, 'expected an array');
    for (const [index, control] of (Array.isArray(definition.editorControls) ? definition.editorControls : []).entries()) {
      const controlPath = `${path}.editorControls[${index}]`;
      if (!control || typeof control !== 'object' || Array.isArray(control)) {
        addIssue(issues, controlPath, 'expected an object');
        continue;
      }
      if (typeof control.type !== 'string' || !control.type.trim()) addIssue(issues, `${controlPath}.type`, 'expected a non empty control type');
      if (control.version !== undefined && (!Number.isInteger(control.version) || control.version < 1)) addIssue(issues, `${controlPath}.version`, 'expected a positive integer');
      if (control.type !== 'hint' && (typeof control.key !== 'string' || !control.key.trim())) addIssue(issues, `${controlPath}.key`, 'expected a stable data key');
      if (!isJsonValue(control)) addIssue(issues, controlPath, 'must contain JSON values only');
    }
    if (!isJsonValue(definition)) addIssue(issues, path, 'must contain JSON values only');
  }
  return issues;
}

export function validateNodeRegistryPayload(registry, supportedFeatures = null) {
  const issues = [];
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return ['registry: expected an object'];
  if (registry.registryProtocolVersion !== NODE_REGISTRY_PROTOCOL_VERSION) {
    addIssue(issues, 'registryProtocolVersion', `unsupported registry protocol ${String(registry.registryProtocolVersion)}`);
  }
  if (!Number.isInteger(registry.schemaVersion) || registry.schemaVersion < 1) addIssue(issues, 'schemaVersion', 'expected a positive integer');
  if (registry.failedNodeTypes !== undefined && (!Array.isArray(registry.failedNodeTypes)
    || registry.failedNodeTypes.length > 500
    || registry.failedNodeTypes.some((type) => typeof type !== 'string' || !type.trim() || type.length > 128)
    || new Set(registry.failedNodeTypes).size !== registry.failedNodeTypes.length)) {
    addIssue(issues, 'failedNodeTypes', 'expected a unique list of at most 500 non empty node type IDs');
  }
  if (!registry.categories || typeof registry.categories !== 'object' || Array.isArray(registry.categories)) addIssue(issues, 'categories', 'expected a category map');
  else if (Object.values(registry.categories).some((category) => typeof category !== 'string' || !category.trim())) addIssue(issues, 'categories', 'category values must be non empty strings');
  const definitions = Array.isArray(registry.definitions)
    ? registry.definitions
    : registry.definitions && typeof registry.definitions === 'object'
      ? Object.values(registry.definitions)
      : null;
  if (!definitions) addIssue(issues, 'definitions', 'expected an array or object');
  else issues.push(...validateNodeDefinitions(registry.definitions));
  if (!Array.isArray(registry.requiredFeatures) || registry.requiredFeatures.some((feature) => typeof feature !== 'string' || !FEATURE_PATTERN.test(feature))) {
    addIssue(issues, 'requiredFeatures', 'expected an array of feature identifiers');
  } else {
    const required = getNodeRegistryRequiredFeatures(definitions || []);
    const declared = new Set(registry.requiredFeatures);
    for (const feature of required) if (!declared.has(feature)) addIssue(issues, 'requiredFeatures', `missing required feature ${feature}`);
    if (supportedFeatures) {
      for (const feature of getUnsupportedNodeRegistryFeatures(registry.requiredFeatures, supportedFeatures)) {
        addIssue(issues, 'requiredFeatures', `client does not support ${feature}`);
      }
    }
  }
  if (typeof registry.registryRevision !== 'string' || !/^[a-f0-9]{64}$/.test(registry.registryRevision)) addIssue(issues, 'registryRevision', 'expected a SHA 256 revision');
  return issues;
}

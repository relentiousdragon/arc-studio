import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test, { beforeEach } from 'node:test';
import { BuiltInNodeDefinitions, BundledNodeTypes, createDefaultNodeData, getAvailableNodeDefinitions, getNodeRegistryDefinitions, isNodeTypeSupported, registerPluginNodeDefinitions, setWorkspaceNodeDefinitions } from '../../studio-client/src/components/nodes/nodeDefinitions.js';
import { getNodeRegistryRequiredFeatures, NODE_REGISTRY_PROTOCOL_VERSION } from '../src/engine/NodeRegistryContract.js';
import { NodeDefinitions, PinTypes } from '../src/engine/NodeRegistry.js';
beforeEach(() => setWorkspaceNodeDefinitions(Object.values(NodeDefinitions)));
//
test('each built-in schema is defined once in its own module and indexed', async () => {
  const directory = new URL('../src/engine/nodes/', import.meta.url);
  const categoryFolder = (category) => String(category || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const files = [];
  const collectSchemaFiles = async (prefix = '') => {
    for (const entry of await readdir(new URL(prefix, directory), { withFileTypes: true })) {
      const relativePath = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        if (relativePath !== 'runtime') await collectSchemaFiles(`${relativePath}/`);
      } else if (entry.name.endsWith('.js') && relativePath !== 'index.js') {
        files.push(relativePath);
      }
    }
  };
  await collectSchemaFiles();
  files.sort();
  const definitions = Object.values(NodeDefinitions);
  const expectedFiles = definitions.map((definition) => `${categoryFolder(definition.category)}/${definition.type}.js`).sort();
  assert.deepEqual(files, expectedFiles);

  for (const definition of definitions) {
    const { type, category } = definition;
    const filename = `${categoryFolder(category)}/${type}.js`;
    const module = await import(new URL(filename, directory));
    const registryEntry = structuredClone(NodeDefinitions[type]);
    for (const direction of ['inputs', 'outputs']) registryEntry[direction] = registryEntry[direction].map(({ semanticType, ...pin }) => pin);
    assert.deepEqual(module.default, registryEntry, `${filename} must match its registry entry apart from derived pin semantics`);
    for (const direction of ['inputs', 'outputs']) {
      const pins = module.default[direction];
      assert.ok(Array.isArray(pins), `${type}.${direction} must be an array`);
      assert.equal(new Set(pins.map((pin) => pin.id)).size, pins.length, `${type}.${direction} has duplicate pin IDs`);
      for (const pin of pins) assert.ok(Object.values(PinTypes).includes(pin.type), `${type}.${direction}.${pin.id} has an unknown pin type`);
    }
  }
});

test('declarative editor controls have valid metadata and supply node defaults', () => {
  const supportedControlTypes = new Set(['checkbox', 'hint', 'number', 'select', 'text']);
  for (const definition of Object.values(NodeDefinitions)) {
    for (const control of definition.editorControls || []) {
      assert.ok(supportedControlTypes.has(control.type), `${definition.type} has an unsupported editor control`);
      if (control.type === 'hint') {
        assert.equal(typeof control.text, 'string', `${definition.type} hint must include text`);
        continue;
      }
      assert.equal(typeof control.key, 'string', `${definition.type} editor control must include a key`);
      if (control.type === 'select') {
        assert.ok(Array.isArray(control.options) && control.options.length > 0, `${definition.type}.${control.key} must include options`);
        assert.ok(control.options.every((option) => Object.hasOwn(option, 'value') && typeof option.label === 'string'), `${definition.type}.${control.key} has invalid options`);
      }
    }
  }

  assert.deepEqual(createDefaultNodeData('event_bot_startup'), { wait_for_gateway: false, timeout_seconds: 30 });
  assert.deepEqual(createDefaultNodeData('event_cron'), { cronExpression: '*/5 * * * *', timeZone: 'UTC' });
  assert.deepEqual(createDefaultNodeData('data_to_boolean'), { value: false });
  assert.deepEqual(createDefaultNodeData('math_compare'), { operation: 'less_than' });
  assert.deepEqual(createDefaultNodeData('math_constant'), { constant: 'pi' });
  assert.deepEqual(createDefaultNodeData('variable_create'), { name: '', valueType: 'string', value: '', persist: true });
  assert.deepEqual(createDefaultNodeData('data_check_value'), { fallback: '' });
  assert.deepEqual(createDefaultNodeData('data_get_value_by_path'), { path: '', fallback: '' });
  assert.deepEqual(createDefaultNodeData('data_find_array_item'), { path: '', value: '' });
  assert.deepEqual(createDefaultNodeData('data_filter_array'), { path: '', operator: 'equals', value: '' });
  assert.deepEqual(createDefaultNodeData('branch_switch'), { caseCount: 2, value: '', case_1: '', case_2: '' });
  assert.deepEqual(createDefaultNodeData('data_format_number'), { locale: 'en-US', style: 'decimal', currency: 'USD', minimum_fraction_digits: 0, maximum_fraction_digits: 2 });
  assert.deepEqual(createDefaultNodeData('data_regex'), { mode: 'test', text: '', pattern: '', flags: '', replacement: '' });
  assert.deepEqual(createDefaultNodeData('data_array_get'), { index: 0 });
  assert.deepEqual(createDefaultNodeData('repeat_while'), { condition: true, interval_ms: 500 });
  const functionInputData = createDefaultNodeData('function_input');
  assert.match(functionInputData.arguments[0].paramId, /^param_\d+_[a-z0-9]+$/);
  assert.deepEqual(functionInputData.arguments.map(({ name, valueType, optional, defaultValue }) => ({ name, valueType, optional, defaultValue })), [
    { name: 'Input', valueType: 'string', optional: false, defaultValue: '' }
  ]);
  assert.deepEqual(createDefaultNodeData('function_return'), { valueType: 'number' });
  assert.deepEqual(createDefaultNodeData('function_math'), { operation: 'add' });
  assert.deepEqual(createDefaultNodeData('build_embed'), { blocks: [], components: [] });
  assert.deepEqual(createDefaultNodeData('build_modal'), { modal: { customId: 'arc_modal', title: 'Tell us more', components: [{ type: 'text', customId: 'details', label: 'Details', style: 2, required: true, minLength: 1, maxLength: 1000 }] } });
  assert.deepEqual(createDefaultNodeData('data_permission_overwrites'), { overwriteCount: 1, target_id_1: '', target_type_1: 0, allow_1: [], deny_1: [] });
});

test('node descriptions come from workspace schemas with bundled fallbacks', () => {
  try {
    const bundledDescription = NodeDefinitions.action_send_message.description;
    const workspaceDescription = 'Workspace schema description';
    const definitions = Object.values(NodeDefinitions).map((definition) => {
      if (definition.type === 'action_send_message') return { ...definition, description: workspaceDescription };
      if (definition.type === 'action_edit_message') {
        const { description, ...withoutDescription } = definition;
        return withoutDescription;
      }
      return definition;
    });
    definitions.push({
      type: 'workspace.future_node',
      category: 'Workspace',
      label: 'Future Node',
      inputs: [],
      outputs: []
    });

    setWorkspaceNodeDefinitions(definitions);

    assert.equal(BuiltInNodeDefinitions.find((definition) => definition.type === 'action_send_message').description, workspaceDescription);
    assert.equal(BuiltInNodeDefinitions.find((definition) => definition.type === 'action_edit_message').description, NodeDefinitions.action_edit_message.description);
    assert.equal(BuiltInNodeDefinitions.find((definition) => definition.type === 'workspace.future_node').description, 'Description unavailable');

    setWorkspaceNodeDefinitions(null);
    assert.equal(BuiltInNodeDefinitions.find((definition) => definition.type === 'action_send_message').description, bundledDescription);
  } finally {
    setWorkspaceNodeDefinitions(null);
  }
});

test('the bundled editor follows workspace schemas and safely falls back for newer inputs', () => {
  try {
    const bundled = Object.values(NodeDefinitions);
    assert.equal(BuiltInNodeDefinitions.length, bundled.length);
    for (const definition of bundled) {
      const clientDefinition = BuiltInNodeDefinitions.find((candidate) => candidate.type === definition.type);
      assert.deepEqual(clientDefinition.inputs, definition.inputs);
      assert.deepEqual(clientDefinition.outputs, definition.outputs);
      assert.equal(BundledNodeTypes.has(definition.type), true);
    }

    const extraInput = { id: 'future_input', label: 'Future Input', type: 'string', defaultValue: '' };
    const changedDefinitions = bundled.map((definition) => definition.type === 'action_send_message'
      ? { ...definition, inputs: [...definition.inputs, extraInput] }
      : definition);
    changedDefinitions.push({
      type: 'workspace.future_node',
      category: 'Workspace',
      label: 'Future Node',
      color: '#5865f2',
      inputs: [{ id: 'value', label: 'Value', type: 'object', defaultValue: {} }],
      outputs: [{ id: 'result', label: 'Result', type: 'object' }]
    });

    setWorkspaceNodeDefinitions(changedDefinitions);
    const changedKnownNode = BuiltInNodeDefinitions.find((definition) => definition.type === 'action_send_message');
    assert.equal(changedKnownNode.requiresGenericEditor, true);
    assert.deepEqual(changedKnownNode.editorOnlyInputs, changedKnownNode.inputs);
    const futureNode = BuiltInNodeDefinitions.find((definition) => definition.type === 'workspace.future_node');
    assert.equal(futureNode.requiresGenericEditor, true);
    assert.equal(futureNode.editorOnlyInputs[0].id, 'value');

    const serverPluginDefinition = {
      type: 'workspace_plugin.future_node',
      category: 'Workspace Plugin',
      label: 'Server Plugin Node',
      color: '#5865f2',
      inputs: [{ id: 'value', label: 'Server Value', type: 'string', defaultValue: '' }],
      outputs: []
    };
    setWorkspaceNodeDefinitions([...bundled, serverPluginDefinition]);
    registerPluginNodeDefinitions([{
      id: 'workspace_plugin',
      kind: 'wasm-adapter',
      nodes: [{ ...serverPluginDefinition, label: 'Stale Client Plugin Node' }]
    }]);
    assert.equal(BuiltInNodeDefinitions.find((definition) => definition.type === serverPluginDefinition.type).label, 'Server Plugin Node');

    const registry = {
      registryProtocolVersion: NODE_REGISTRY_PROTOCOL_VERSION,
      schemaVersion: 1,
      categories: {},
      definitions: { action_send_message: NodeDefinitions.action_send_message },
      requiredFeatures: getNodeRegistryRequiredFeatures([NodeDefinitions.action_send_message]),
      registryRevision: 'a'.repeat(64)
    };
    assert.equal(getNodeRegistryDefinitions(registry).length, 1);
    assert.equal(getNodeRegistryDefinitions({ ...registry, schemaVersion: 2 }).length, 1);
    assert.throws(() => getNodeRegistryDefinitions({
      definitions: [{ type: 'invalid', inputs: [{ id: 1, label: 'Bad pin', type: 'string' }], outputs: [] }]
    }), /incompatible node registry/i);
  } finally {
    setWorkspaceNodeDefinitions(null);
  }
});

test('replacing the workspace registry removes outdated plugin schemas', () => {
  try {
    const oldPluginDefinition = {
      type: 'workspace_plugin.old_node',
      category: 'Workspace Plugin',
      label: 'Old Plugin Node',
      inputs: [],
      outputs: []
    };
    const currentPluginDefinition = {
      type: 'workspace_plugin.current_node',
      category: 'Workspace Plugin',
      label: 'Current Plugin Node',
      inputs: [],
      outputs: []
    };
    setWorkspaceNodeDefinitions([...Object.values(NodeDefinitions), oldPluginDefinition]);
    setWorkspaceNodeDefinitions([...Object.values(NodeDefinitions), currentPluginDefinition]);

    assert.equal(BuiltInNodeDefinitions.some((definition) => definition.type === oldPluginDefinition.type), false);
    assert.equal(BuiltInNodeDefinitions.find((definition) => definition.type === currentPluginDefinition.type).label, 'Current Plugin Node');
  } finally {
    setWorkspaceNodeDefinitions(null);
  }
});

test('installed plugin schemas remain available when supported type metadata is incomplete', () => {
  const pluginDefinition = {
    type: 'arc.resvg.render-svg',
    category: 'Images',
    label: 'Render SVG',
    pluginAdapter: true,
    inputs: [],
    outputs: []
  };
  const supportedTypes = new Set(['event_message_create']);
  assert.ok(getAvailableNodeDefinitions([NodeDefinitions.event_message_create, pluginDefinition], supportedTypes)
    .some((definition) => definition.type === pluginDefinition.type));
  assert.equal(getAvailableNodeDefinitions([NodeDefinitions.event_message_create, pluginDefinition], supportedTypes).length, 2);
});

test('installed plugin nodes can be placed when the workspace supported type list omits adapters', () => {
  try {
    const pluginDefinition = {
      type: 'arc.resvg.render-svg',
      category: 'Images',
      label: 'Render SVG',
      inputs: [],
      outputs: []
    };
    setWorkspaceNodeDefinitions([...Object.values(NodeDefinitions), pluginDefinition]);
    registerPluginNodeDefinitions([{
      id: 'arc.resvg',
      name: 'Resvg',
      kind: 'host-adapter',
      nodes: [pluginDefinition]
    }]);

    const supportedTypes = new Set(['event_message_create']);

    assert.equal(isNodeTypeSupported(pluginDefinition.type, supportedTypes), true);
    assert.equal(isNodeTypeSupported('event_message_create', supportedTypes), true);
    assert.equal(isNodeTypeSupported('action_send_message', supportedTypes), false);
  } finally {
    setWorkspaceNodeDefinitions(null);
  }
});

test('installed plugin metadata is restored when workspace schemas contain the node type', () => {
  try {
    const serverDefinition = {
      type: 'arc.resvg.render-svg',
      category: 'Images',
      label: 'Render SVG',
      pluginAdapter: true,
      inputs: [],
      outputs: []
    };
    setWorkspaceNodeDefinitions([...Object.values(NodeDefinitions), serverDefinition]);
    registerPluginNodeDefinitions([{
      id: 'arc.resvg',
      name: 'Resvg',
      kind: 'host-adapter',
      nodes: [{ ...serverDefinition, description: 'Renders SVG content to an image.' }]
    }]);
    const definition = BuiltInNodeDefinitions.find((item) => item.type === serverDefinition.type);

    assert.equal(definition.pluginAdapter, true);
    assert.equal(definition.pluginId, 'arc.resvg');
    assert.equal(definition.pluginName, 'Resvg');
    assert.equal(definition.description, 'Renders SVG content to an image.');
    assert.equal(getAvailableNodeDefinitions(BuiltInNodeDefinitions, new Set(['event_message_create'])).includes(definition), true);
  } finally {
    setWorkspaceNodeDefinitions(null);
  }
});

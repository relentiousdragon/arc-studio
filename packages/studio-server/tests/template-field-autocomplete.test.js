import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceTemplateToken, templateFieldSuggestions, templateTokenAt } from '../../studio-client/src/core/templateFieldAutocomplete.js';
import { getNodeTemplateInputPins } from '../../studio-client/src/components/nodes/nodeDefinitions.js';
import { TEMPLATE_SYSTEM_PATHS } from '../src/engine/TemplateExpressions.js';

test('suggests the system chezcord permission namespace', () => {
  const suggestions = templateFieldSuggestions('chezcord.', { paths: TEMPLATE_SYSTEM_PATHS });
  assert.equal(suggestions[0]?.insert, 'chezcord.permissions}}');
});

test('suggests a user VIEW_CHANNELS variable beside the namespaced permission', () => {
  const suggestions = templateFieldSuggestions('VIEW_CHANNELS', {
    variables: [{ label: 'VIEW_CHANNELS', insert: 'VIEW_CHANNELS' }],
    paths: TEMPLATE_SYSTEM_PATHS
  });
  assert.deepEqual(suggestions.map((item) => item.insert), ['VIEW_CHANNELS}}', 'chezcord.permissions.VIEW_CHANNELS}}']);
});

test('does not create a template input for the system chezcord namespace', () => {
  const pins = getNodeTemplateInputPins(
    { id: 'node-1', data: { text: '{{chezcord.permissions.VIEW_CHANNEL}}' } },
    [{ id: 'text', type: 'string' }],
    [],
    []
  );
  assert.deepEqual(pins, []);
});
//
test('keeps the opening braces when a suggestion is inserted after existing text', () => {
  const token = templateTokenAt('text{{var', 9);
  assert.deepEqual({ start: token.start, end: token.end, query: token.query }, { start: 6, end: 9, query: 'var' });
  assert.equal(replaceTemplateToken('text{{var', token, 'value}}').value, 'text{{value}}');
  assert.equal(replaceTemplateToken('text{{va', token, 'value}}').caret, 13);
});

test('keeps the opening braces when the template starts the field', () => {
  const token = templateTokenAt('{{au', 4);
  assert.equal(replaceTemplateToken('{{au', token, 'author.username}}').value, '{{author.username}}');
});

test('ignores escaped braces and closed templates', () => {
  assert.equal(templateTokenAt('text\\{{var', 10), null);
  assert.equal(templateTokenAt('text{{value}} rest', 18), null);
  assert.equal(templateTokenAt('no template here', 16), null);
});

test('replaces only the pending token and leaves trailing text intact', () => {
  const value = 'Hello {{na and welcome';
  const token = templateTokenAt(value, 10);
  assert.equal(replaceTemplateToken(value, token, 'name}}').value, 'Hello {{name}} and welcome');
});

test('suggests variables before event paths and filters by the typed query', () => {
  const context = {
    variables: [{ label: 'APP_LATENCY', insert: 'APP_LATENCY' }],
    paths: [{ path: 'author.username', label: 'Author username' }, { path: 'guild.name', label: 'Server name' }],
    sockets: [{ label: 'arg1', insert: 'arg1' }]
  };
  assert.deepEqual(templateFieldSuggestions('', context).map((item) => item.insert), ['APP_LATENCY}}', 'author.username}}', 'guild.name}}', 'arg1}}']);
  assert.deepEqual(templateFieldSuggestions('lat', context).map((item) => item.insert), ['APP_LATENCY}}']);
  assert.deepEqual(templateFieldSuggestions('guild.', context).map((item) => item.insert), ['guild.name}}']);
});

test('suggests only the next object level after a dot', () => {
  const context = {
    paths: [
      { path: 'var', label: 'var' },
      { path: 'var.child', label: 'var.child' },
      { path: 'var.child.subchild', label: 'var.child.subchild' },
      { path: 'var.child.subchild.deep', label: 'var.child.subchild.deep' },
      { path: 'var.other', label: 'var.other' }
    ]
  };
  assert.deepEqual(templateFieldSuggestions('var.', context).map((item) => item.insert), ['var.child}}', 'var.other}}']);
  assert.deepEqual(templateFieldSuggestions('var.child.', context).map((item) => item.insert), ['var.child.subchild}}']);
  assert.deepEqual(templateFieldSuggestions('var.child.subchild.', context).map((item) => item.insert), ['var.child.subchild.deep}}']);
  assert.deepEqual(templateFieldSuggestions('var.ch', context).map((item) => item.insert), ['var.child}}']);
  assert.deepEqual(templateFieldSuggestions('VAR.', context).map((item) => item.insert), ['var.child}}', 'var.other}}']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { hasImportableTextContent } from '../src/storage/ImportContentReview.js';

const graph = (nodes) => ({ nodes, connections: [] });

test('text review only flags graph content with nonempty text or request fields', () => {
  assert.equal(hasImportableTextContent(graph([{ type: 'delay', label: 'Wait', data: { milliseconds: 1000 } }])), false);
  assert.equal(hasImportableTextContent(graph([{ type: 'value_text', data: { value: 'Hello' } }])), true);
  assert.equal(hasImportableTextContent(graph([{ type: 'build_embed', data: { blocks: [{ type: 'description', value: 'Welcome' }] } }])), true);
  assert.equal(hasImportableTextContent(graph([{ type: 'action_web_fetch', data: { url: 'https://example.com' } }])), true);
  assert.equal(hasImportableTextContent(graph([{ type: 'action_web_fetch', data: { url: '', method: 'GET', headers: '{}', body: '' } }])), false);
  assert.equal(hasImportableTextContent(graph([{ type: 'action_send_message', label: 'Send', data: { content: '' } }])), false);
});

test('project review finds graphs, saved embed assets, and configured text variables', () => {
  assert.equal(hasImportableTextContent({ files: { 'graphs.json': { graphs: [graph([{ type: 'format_text', data: { template: '{{name}}' } }])] } } }), true);
  assert.equal(hasImportableTextContent({ files: { 'embeds.json': [{ name: 'Empty asset', blocks: [] }] } }), false);
  assert.equal(hasImportableTextContent({ files: { 'embeds.json': [{ name: 'Welcome', blocks: [{ type: 'title', value: 'Hello' }] }] } }), true);
  assert.equal(hasImportableTextContent({ files: { 'project-variables.json': [{ name: 'empty', initialValue: '' }] } }), false);
  assert.equal(hasImportableTextContent({ files: { 'project-variables.json': [{ name: 'welcome', initialValue: 'Hello' }] } }), true);
});

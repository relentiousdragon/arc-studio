import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceNullTemplateValues } from '../../studio-client/src/core/templatePreview.js';

const values = new Map([
  ['count', null],
  ['name', 'Buffy'],
  ['empty', undefined],
  ['user', { name: null }],
  ['deck', ['ace', 'king']]
]);
const resolve = (name) => values.get(name);
const hasSlot = (name) => values.has(name);
//
test('shows UNDEFINED for null and undefined values', () => {
  assert.equal(replaceNullTemplateValues('a {{count}} b', resolve, hasSlot), 'a UNDEFINED b');
  assert.equal(replaceNullTemplateValues('a {{empty}} b', resolve, hasSlot), 'a UNDEFINED b');
});

test('leaves names and values it does not own alone', () => {
  assert.equal(replaceNullTemplateValues('{{name}}', resolve, hasSlot), '{{name}}');
  assert.equal(replaceNullTemplateValues('{{deck}}', resolve, hasSlot), '{{deck}}');
  assert.equal(replaceNullTemplateValues('{{missing}}', resolve, hasSlot), '{{missing}}');
  assert.equal(replaceNullTemplateValues('\\{{count}}', resolve, hasSlot), '\\{{count}}');
});

test('keeps default transforms as written', () => {
  assert.equal(replaceNullTemplateValues("{{count | default('x')}}", resolve, hasSlot), "{{count | default('x')}}");
});

test('marks nested null properties', () => {
  assert.equal(replaceNullTemplateValues('{{user.name}}', resolve, hasSlot), 'UNDEFINED');
  assert.equal(replaceNullTemplateValues('{{user.missing}}', resolve, hasSlot), 'UNDEFINED');
});

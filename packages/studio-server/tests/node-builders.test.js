import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { buildDiscordComponents, buildDiscordModal } from '../src/engine/nodes/runtime/builders.js';
//
test('component builder limits rows and components and renders button and select values', () => {
  const rows = [
    {
      components: [
        { style: 'primary', label: '{{button}}', customId: 'button-id', emoji: '<a:party:12345678901234567>' },
        ...Array.from({ length: 4 }, (_, index) => ({ style: 'danger', label: `extra-${index}`, customId: `extra-${index}` }))
      ]
    },
    { components: [{ type: 'string_select', customId: '{{select_id}}', placeholder: '{{placeholder}}', options: [{ label: '{{option}}', value: 'selected' }] }] },
    ...Array.from({ length: 3 }, () => ({ components: [{ style: 'link', label: 'Docs', url: 'https://example.test' }] }))
  ];

  const result = buildDiscordComponents(rows, (value) => value.replace('{{button}}', 'Open').replace('{{select_id}}', 'choice').replace('{{placeholder}}', 'Pick one').replace('{{option}}', 'First'));

  assert.equal(result.length, 5);
  assert.equal(result[0].components.length, 5);
  assert.deepEqual(result[0].components[0], {
    type: 2,
    style: 1,
    label: 'Open',
    emoji: { name: 'party', id: '12345678901234567', animated: true },
    custom_id: 'button-id',
    disabled: false
  });
  assert.deepEqual(result[1].components[0], {
    type: 3,
    custom_id: 'choice',
    placeholder: 'Pick one',
    min_values: 0,
    max_values: 1,
    options: [{ label: 'First', value: 'selected' }]
  });
  assert.deepEqual(result[4].components[0], {
    type: 2,
    style: 5,
    label: 'Docs',
    url: 'https://example.test',
    disabled: false
  });
  assert.deepEqual(buildDiscordComponents([{ components: [] }]), []);
});

test('modal builder renders and validates text, select, and file upload fields', () => {
  const modal = buildDiscordModal({
    customId: '{{id}}',
    title: '{{title}}',
    components: [
      { type: 'text', customId: 'message', label: 'Message', value: '{{default}}', maxLength: 100 },
      { type: 'string_select', customId: 'choice', label: 'Choice', options: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two' }], minValues: 0, maxValues: 2, required: false },
      { type: 'file_upload', customId: 'attachment', label: 'Attachment', fileTypes: ['.pdf', 'image'], maxValues: 2 }
    ]
  }, (value) => value.replace('{{id}}', 'feedback').replace('{{title}}', 'Feedback').replace('{{default}}', 'Hello'));

  assert.deepEqual(modal, {
    custom_id: 'feedback',
    title: 'Feedback',
    components: [
      { type: 18, label: 'Message', component: { type: 4, custom_id: 'message', style: 1, min_length: 0, max_length: 100, required: true, value: 'Hello' } },
      { type: 18, label: 'Choice', component: { type: 3, custom_id: 'choice', options: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two' }], min_values: 0, max_values: 2, required: false } },
      { type: 18, label: 'Attachment', component: { type: 19, custom_id: 'attachment', min_values: 1, max_values: 2, required: true, file_types: ['.pdf', 'image'] } }
    ]
  });
});

test('modal builder rejects invalid IDs, duplicate fields, invalid option values, and invalid file filters', () => {
  assert.throws(() => buildDiscordModal({ customId: '', title: 'Title', components: [{ customId: 'field', label: 'Field' }] }), /custom ID/);
  assert.throws(() => buildDiscordModal({ customId: 'modal', title: 'Title', components: [
    { customId: 'same', label: 'First' },
    { customId: 'same', label: 'Second' }
  ] }), /unique custom ID/);
  assert.throws(() => buildDiscordModal({ customId: 'modal', title: 'Title', components: [
    { type: 'string_select', customId: 'choice', label: 'Choice', options: [{ label: 'One', value: 'same' }, { label: 'Two', value: 'same' }] }
  ] }), /unique, non-empty/);
  assert.throws(() => buildDiscordModal({ customId: 'modal', title: 'Title', components: [
    { type: 'file_upload', customId: 'file', label: 'File', fileTypes: ['../secret'] }
  ] }), /File type filters/);
});

test('GraphRunner sends modal builder output as the initial interaction response', async () => {
  const responses = [];
  const graph = {
    id: 'builder-modal',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'builder', type: 'build_modal', data: { modal: { customId: 'feedback', title: 'Feedback', components: [{ type: 'text', customId: 'message', label: 'Message' }] } } },
      { id: 'show', type: 'action_show_modal', data: { interaction_id: 'interaction', interaction_token: 'token' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'show', targetPinId: 'exec' },
      { sourceNodeId: 'builder', sourcePinId: 'modal', targetNodeId: 'show', targetPinId: 'modal' }
    ]
  };

  const result = await GraphRunner.execute(graph, 'MESSAGE_CREATE', {}, {
    mock: true,
    rest: { createInteractionResponse: async (...args) => responses.push(args) },
    log: () => {}
  });

  assert.equal(result.error, null);
  assert.deepEqual(responses[0], ['interaction', 'token', {
    type: 9,
    data: {
      custom_id: 'feedback',
      title: 'Feedback',
      components: [{
        type: 18,
        label: 'Message',
        component: { type: 4, custom_id: 'message', style: 1, min_length: 0, max_length: 4000, required: true }
      }]
    }
  }]);
});

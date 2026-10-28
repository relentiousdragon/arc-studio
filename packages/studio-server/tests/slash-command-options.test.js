import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSlashCommandOptions, flattenSlashParameters, validateSlashCommandOptions } from '../src/engine/SlashCommandOptions.js';
import { GraphRunner } from '../src/engine/GraphRunner.js';

const argument = (name, type = 3, extra = {}) => ({ type, name, description: `Configure ${name}`, ...extra });
const subcommand = (name, options = []) => ({ type: 1, name, description: `Run ${name}`, options });
const group = (name, options = []) => ({ type: 2, name, description: `Manage ${name}`, options });

test('accepts direct subcommands, groups, and shared argument names in separate branches', () => {
  const options = [
    subcommand('lookup', [argument('target', 6, { required: true })]),
    group('moderation', [
      subcommand('ban', [argument('target', 6, { required: true }), argument('reason')]),
      subcommand('kick', [argument('target', 6, { required: true })])
    ])
  ];
  assert.deepEqual(validateSlashCommandOptions(options, 'admin'), []);
  assert.deepEqual(flattenSlashParameters(options).map(({ pinId }) => pinId), [
    'option_path_lookup.target',
    'option_path_moderation.ban.target',
    'option_path_moderation.ban.reason',
    'option_path_moderation.kick.target'
  ]);
});

test('rejects argument and subcommand mixing and nesting beyond one group level', () => {
  assert.match(validateSlashCommandOptions([argument('target'), subcommand('lookup')], 'admin')[0], /cannot mix/);
  assert.match(validateSlashCommandOptions([group('moderation', [group('users', [subcommand('ban')])])], 'admin').join(' '), /Groups cannot be nested/);
  assert.match(validateSlashCommandOptions([subcommand('outer', [subcommand('inner')])], 'admin').join(' '), /cannot contain nested/);
});

test('validates Discord subcommand names without accepting spaces', () => {
  assert.deepEqual(validateSlashCommandOptions([subcommand("café's", [argument('réponse')])]), []);
  assert.match(validateSlashCommandOptions([subcommand('ban user')]).join(' '), /Spaces are not allowed/);
  assert.match(validateSlashCommandOptions([subcommand('Ban')]).join(' '), /invalid name/);
});

test('checks Discord argument bounds, required ordering, and choice rules', () => {
  const options = [argument('optional'), argument('required', 4, { required: true })];
  assert.match(validateSlashCommandOptions([subcommand('set', options)], 'admin').join(' '), /required argument after an optional/);
  assert.match(validateSlashCommandOptions([subcommand('set', [argument('amount', 4, { min_value: 9, max_value: 2 })])], 'admin').join(' '), /minimum greater than its maximum/);
  assert.match(validateSlashCommandOptions([subcommand('set', [argument('enabled', 5, { choices: [{ name: 'yes', value: 'yes' }] })])], 'admin').join(' '), /cannot have choices/);
});

test('normalizes nested API payloads while sorting required parameters before optional ones', () => {
  const normalized = normalizeSlashCommandOptions([group('moderation', [subcommand('ban', [
    argument('reason', 3, { min_length: 2, max_length: 120 }),
    argument('target', 6, { required: true })
  ])])]);
  assert.deepEqual(normalized, [group('moderation', [subcommand('ban', [
    argument('target', 6, { required: true }),
    argument('reason', 3, { min_length: 2, max_length: 120 })
  ])])]);
});

test('slash event outputs the selected subcommand, group, and only its configured argument pins', async () => {
  const options = [
    subcommand('lookup', [argument('query'), argument('exact', 5)]),
    group('moderation', [subcommand('ban', [argument('target', 6), argument('reason')])])
  ];
  const node = { id: 'slash-event', type: 'event_slash_command', data: { commandName: 'admin', options } };
  const steps = [];
  const result = await GraphRunner.execute({ id: 'slash-runtime', nodes: [node], connections: [] }, 'INTERACTION_CREATE', {
    type: 2,
    id: 'interaction-1',
    application_id: 'application-1',
    token: 'interaction-token',
    data: {
      type: 1,
      name: 'admin',
      options: [{ name: 'moderation', type: 2, options: [{ name: 'ban', type: 1, options: [
        { name: 'target', type: 6, value: 'user-1' },
        { name: 'reason', type: 3, value: 'spamming' }
      ] }] }]
    }
  }, { debug: true, onDebugStep: (step) => steps.push(step) });

  assert.equal(result.error, null);
  const outputs = new Map(steps[0].outputs.map(({ pinId, value }) => [pinId, value]));
  assert.equal(outputs.get('subcommand_group_name'), 'moderation');
  assert.equal(outputs.get('subcommand_name'), 'ban');
  assert.equal(outputs.get('option_path_moderation.ban.target'), 'user-1');
  assert.equal(outputs.get('option_path_moderation.ban.reason'), 'spamming');
  assert.equal(outputs.has('option_path_lookup.query'), false);
  assert.deepEqual(outputs.get('options'), {
    target: 'user-1',
    reason: 'spamming',
    $subcommand: 'ban',
    $subcommand_group: 'moderation'
  });
});

test('slash event outputs a direct subcommand and its arguments without a group', async () => {
  const node = { id: 'slash-event', type: 'event_slash_command', data: { commandName: 'admin', options: [subcommand('lookup', [argument('query')])] } };
  const steps = [];
  const result = await GraphRunner.execute({ id: 'slash-direct', nodes: [node], connections: [] }, 'INTERACTION_CREATE', {
    type: 2,
    data: { type: 1, name: 'admin', options: [{ name: 'lookup', type: 1, options: [{ name: 'query', type: 3, value: 'arc' }] }] }
  }, { debug: true, onDebugStep: (step) => steps.push(step) });

  assert.equal(result.error, null);
  const outputs = new Map(steps[0].outputs.map(({ pinId, value }) => [pinId, value]));
  assert.equal(outputs.get('subcommand_group_name'), '');
  assert.equal(outputs.get('subcommand_name'), 'lookup');
  assert.equal(outputs.get('option_path_lookup.query'), 'arc');
});

test('slash event keeps legacy flat argument pin IDs working', async () => {
  const node = { id: 'slash-event', type: 'event_slash_command', data: { commandName: 'search', options: [argument('query')] } };
  const steps = [];
  const result = await GraphRunner.execute({ id: 'slash-flat', nodes: [node], connections: [] }, 'INTERACTION_CREATE', {
    type: 2,
    data: { type: 1, name: 'search', options: [{ name: 'query', type: 3, value: 'arc' }] }
  }, { debug: true, onDebugStep: (step) => steps.push(step) });

  assert.equal(result.error, null);
  const outputs = new Map(steps[0].outputs.map(({ pinId, value }) => [pinId, value]));
  assert.equal(outputs.get('subcommand_group_name'), '');
  assert.equal(outputs.get('subcommand_name'), '');
  assert.equal(outputs.get('option_query'), 'arc');
});

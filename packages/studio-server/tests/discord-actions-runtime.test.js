import assert from 'node:assert/strict';
import test from 'node:test';
import { executeDiscordInteractionNode, isDiscordInteractionNodeType } from '../src/engine/nodes/runtime/discord_interactions.js';
import { executeDiscordMessageNode, isDiscordMessageNodeType } from '../src/engine/nodes/runtime/discord_messages.js';
//
function createMessageHarness(type, data = {}, rest = {}, options = {}) {
  const outputs = new Map();
  const logs = [];
  return {
    outputs,
    logs,
    execute: () => executeDiscordMessageNode({ type, data }, {
      resolveInput: (pinId, fallback) => data[pinId] ?? fallback,
      resolveComponents: () => data.components || [],
      resolveFiles: (files) => files,
      buildEmbed: () => data.builtEmbed,
      rest,
      simulation: options.simulation !== false,
      setOutput: (pinId, value) => outputs.set(pinId, value),
      log: (message) => logs.push(message)
    })
  };
}

function createInteractionHarness(type, data = {}, options = {}) {
  const outputs = new Map();
  const logs = [];
  const state = options.state || {
    applicationId: '',
    acknowledged: false,
    deferred: false,
    pending: null
  };
  const eventPayload = options.eventPayload || {};
  const nodes = options.nodes || [];
  return {
    outputs,
    logs,
    state,
    execute: () => executeDiscordInteractionNode({ type, data }, {
      resolveInput: (pinId, fallback) => data[pinId] ?? fallback,
      resolveComponents: () => data.components || [],
      resolveFiles: (files) => files,
      buildEmbed: () => data.builtEmbed,
      rest: options.rest || {},
      simulation: options.simulation !== false,
      log: (message) => logs.push(message),
      state,
      eventPayload,
      nodes,
      setOutput: (pinId, value) => outputs.set(pinId, value)
    })
  };
}

test('message runtime sends content, embeds, components, files, thread targets, and reply metadata', async () => {
  const calls = [];
  const harness = createMessageHarness('action_send_message', {
    thread_id: 'thread-1',
    channel_id: 'channel-1',
    content: 'x'.repeat(2100),
    components: [{ type: 1 }],
    files: [{ name: 'image.png' }],
    file_data: 'data:image/png;base64,aGVsbG8=',
    file_name: '',
    reply_to_message_id: 'message-1',
    mention_replied_user: false,
    blocks: [],
    builtEmbed: { title: 'Built' }
  }, {
    createMessage: async (...args) => {
      calls.push(args);
      return { id: 'sent-message' };
    }
  });

  assert.equal(await harness.execute(), true);
  assert.deepEqual(calls, [['thread-1', {
    content: 'x'.repeat(2000),
    embeds: [{ title: 'Built' }],
    components: [{ type: 1 }],
    files: [{ name: 'image.png' }],
    message_reference: { message_id: 'message-1' },
    allowed_mentions: { replied_user: false },
    file_data: 'data:image/png;base64,aGVsbG8=',
    file_name: 'image.png'
  }]]);
  assert.equal(harness.outputs.get('message_id'), 'sent-message');
  assert.match(harness.logs[0], /thread thread-1/);
});

test('message runtime edits messages while preserving empty content and missing-ID behavior', async () => {
  const calls = [];
  const harness = createMessageHarness('action_edit_message', {
    channel_id: 'channel-1',
    message_id: 'message-2',
    content: '',
    files: [{ name: 'file.txt' }],
    components: [{ type: 1 }]
  }, {
    editMessage: async (...args) => {
      calls.push(args);
      return { id: 'message-2' };
    }
  });
  await harness.execute();
  assert.deepEqual(calls, [['channel-1', 'message-2', {
    components: [{ type: 1 }],
    files: [{ name: 'file.txt' }]
  }]]);
  assert.equal(harness.outputs.get('message_id'), 'message-2');

  const missing = createMessageHarness('action_edit_message');
  await missing.execute();
  assert.deepEqual(missing.logs, ['[Action Edit Message] Error: Missing Channel ID or Message ID']);
  assert.equal(isDiscordMessageNodeType('action_send_message'), true);
  assert.equal(isDiscordMessageNodeType('action_reply_interaction'), false);
});

test('message actions reject invalid channel IDs resolved from their inputs', async () => {
  const harness = createMessageHarness('action_send_message', {
    channel_id: 'not-a-discord-id',
    content: 'Hello'
  }, { createMessage: async () => assert.fail('Invalid channel IDs must not reach REST.') }, { simulation: false });

  await assert.rejects(harness.execute(), /Channel ID must be a valid positive Discord snowflake ID/);
});

test('interaction reply creates one initial response with ephemeral flags and resolved payload', async () => {
  const calls = [];
  const harness = createInteractionHarness('action_reply_interaction', {
    interaction_id: 'interaction-1',
    interaction_token: 'token-1',
    content: 'Hello',
    ephemeral: true,
    components: [{ type: 1 }],
    files: [{ name: 'file.txt' }],
    blocks: [],
    builtEmbed: { description: 'Embed' }
  }, {
    rest: {
      createInteractionResponse: async (...args) => calls.push(args)
    }
  });

  await harness.execute();
  assert.deepEqual(calls, [['interaction-1', 'token-1', {
    type: 4,
    data: {
      content: 'Hello',
      embeds: [{ description: 'Embed' }],
      components: [{ type: 1 }],
      files: [{ name: 'file.txt' }],
      flags: 64
    }
  }, { withResponse: true }]]);
  assert.equal(harness.state.acknowledged, true);
  assert.equal(harness.state.pending, null);

  await assert.rejects(harness.execute(), /already been acknowledged/);
});

test('defer reply and update retain acknowledgement state and reply after defer edits the original response', async () => {
  const calls = [];
  const state = { applicationId: 'app-id', acknowledged: false, deferred: false, pending: null };
  const defer = createInteractionHarness('action_defer_reply', {
    interaction_id: 'interaction-2',
    interaction_token: 'token-2',
    ephemeral: true
  }, {
    state,
    rest: {
      deferInteractionReply: async (...args) => calls.push(['defer', ...args]),
      editOriginalInteractionResponse: async (...args) => calls.push(['edit', ...args])
    }
  });
  await defer.execute();
  assert.equal(state.acknowledged, true);
  assert.equal(state.deferred, true);
  assert.equal(defer.outputs.get('interaction_token'), 'token-2');
  assert.deepEqual(calls[0], ['defer', 'interaction-2', 'token-2', { ephemeral: true }]);

  const reply = createInteractionHarness('action_reply_interaction', {
    application_id: 'app-id',
    interaction_token: 'token-2',
    content: 'Finished'
  }, { state, rest: {
    editOriginalInteractionResponse: async (...args) => calls.push(['edit', ...args])
  } });
  await reply.execute();
  assert.deepEqual(calls[1], ['edit', 'app-id', 'token-2', { content: 'Finished', flags: 0 }]);
  assert.equal(state.acknowledged, true);

  const updateCalls = [];
  const update = createInteractionHarness('action_defer_update', { interaction_token: 'token-3' }, {
    rest: { createInteractionResponse: async (...args) => updateCalls.push(args) }
  });
  await update.execute();
  assert.deepEqual(updateCalls, [['mock', 'token-3', { type: 6 }]]);
});

test('interaction modal validates initial response state and resets acknowledgement on REST failure', async () => {
  const call = [];
  const modal = { custom_id: 'form', title: 'Form', components: [{ type: 18, label: 'Field', component: { type: 4, custom_id: 'field' } }] };
  const harness = createInteractionHarness('action_show_modal', {
    interaction_id: 'interaction-3',
    interaction_token: 'token-3',
    modal
  }, {
    rest: {
      createInteractionResponse: async (...args) => {
        call.push(args);
        throw new Error('REST unavailable');
      }
    }
  });

  await assert.rejects(harness.execute(), /REST unavailable/);
  assert.deepEqual(call, [['interaction-3', 'token-3', { type: 9, data: modal }]]);
  assert.equal(harness.state.acknowledged, false);
  assert.equal(harness.state.pending, null);
  assert.equal(isDiscordInteractionNodeType('action_edit_interaction_reply'), true);
  assert.equal(isDiscordInteractionNodeType('action_send_message'), false);
});

test('autocomplete filters and converts choice values for the focused option', async () => {
  const calls = [];
  const harness = createInteractionHarness('action_respond_autocomplete', {
    interaction_id: 'interaction-4',
    interaction_token: 'token-4',
    choices: [
      { name: 'Apple', value: 'apple' },
      { name: 'Apricot', value: 'apricot' },
      { name: 'Banana', value: 'banana' },
      { name: '', value: 'invalid' }
    ]
  }, {
    eventPayload: {
      type: 4,
      id: 'interaction-4',
      token: 'token-4',
      data: { name: 'fruit', options: [{ name: 'fruit', type: 3, value: 'ap', focused: true }] }
    },
    nodes: [{
      type: 'event_slash_command',
      data: { commandName: 'fruit', options: [{ name: 'fruit', type: 3, autocomplete: true, dynamicAutocomplete: true }] }
    }],
    rest: { createInteractionResponse: async (...args) => calls.push(args) }
  });

  await harness.execute();
  assert.deepEqual(calls, [['interaction-4', 'token-4', {
    type: 8,
    data: { choices: [{ name: 'Apple', value: 'apple' }, { name: 'Apricot', value: 'apricot' }] }
  }]]);
  assert.equal(harness.outputs.get('choice_count'), 2);

  await assert.rejects(createInteractionHarness('action_respond_autocomplete', {}, {
    eventPayload: { type: 4, data: { options: [] } }
  }).execute(), /not configured/);
});

test('interaction edit updates the original response and supports missing credentials messages', async () => {
  const calls = [];
  const harness = createInteractionHarness('action_edit_interaction_reply', {
    application_id: 'app-id',
    interaction_token: 'token-5',
    content: 'Updated',
    components: [{ type: 1 }],
    blocks: [],
    builtEmbed: { title: 'Updated embed' }
  }, {
    rest: { editOriginalInteractionResponse: async (...args) => calls.push(args) }
  });

  await harness.execute();
  assert.deepEqual(calls, [['app-id', 'token-5', {
    content: 'Updated',
    embeds: [{ title: 'Updated embed' }],
    components: [{ type: 1 }]
  }]]);

  const missing = createInteractionHarness('action_edit_interaction_reply');
  await missing.execute();
  assert.deepEqual(missing.logs, ['[Edit Interaction Reply] Error: Missing Application ID']);
});

test('interaction actions validate resolved IDs and token values outside simulation', async () => {
  const invalidId = createInteractionHarness('action_reply_interaction', {
    application_id: '123456789012345678',
    interaction_id: 'interaction-id',
    interaction_token: 'valid-token',
    content: 'Hello'
  }, { simulation: false });
  await assert.rejects(invalidId.execute(), /Interaction ID must be a valid positive Discord snowflake ID/);

  const invalidToken = createInteractionHarness('action_reply_interaction', {
    application_id: '123456789012345678',
    interaction_id: '123456789012345678',
    interaction_token: 'token with spaces',
    content: 'Hello'
  }, { simulation: false });
  await assert.rejects(invalidToken.execute(), /Interaction token must be a valid Discord interaction token/);
});

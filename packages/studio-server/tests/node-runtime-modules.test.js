import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { CryptoEngine } from '../src/security/CryptoEngine.js';
import { evaluateDataNode } from '../src/engine/nodes/runtime/data.js';
import { evaluateLogicNode } from '../src/engine/nodes/runtime/logic.js';
import { executeCryptoNode } from '../src/engine/nodes/runtime/crypto.js';
import { executeNetworkNode, isNetworkNodeType } from '../src/engine/nodes/runtime/network.js';
import { executePresenceNode, isPresenceNodeType } from '../src/engine/nodes/runtime/discord_presence.js';
//
async function executeAction(type, data = {}, contextOverrides = {}) {
  const steps = [];
  const result = await GraphRunner.execute({
    id: `runtime-${type}`,
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'action', type, data }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'action', targetPinId: 'exec' }
    ]
  }, 'MESSAGE_CREATE', { content: 'runtime test' }, {
    debug: true,
    log: () => {},
    onDebugStep: (step) => steps.push(step),
    ...contextOverrides
  });
  assert.equal(result.error, null);
  return steps.find((step) => step.nodeId === 'action');
}

async function executeNetworkNodeDirect(type, data = {}, options = {}) {
  const outputs = new Map();
  const logs = [];
  const handled = await executeNetworkNode({ type, data }, {
    resolveInput: (pinId, fallback) => data[pinId] ?? fallback,
    setOutput: (pinId, value) => outputs.set(pinId, value),
    context: options.context || {},
    log: (message) => logs.push(message)
  }, options.dependencies);
  return { handled, outputs, logs };
}

function executePresenceNodeDirect(type, data = {}, client = null) {
  const presences = [];
  const logs = [];
  const handled = executePresenceNode({ type, data }, {
    resolveInput: (pinId, fallback) => data[pinId] ?? fallback,
    context: client ? { client: { setPresence: (presence) => presences.push(presence) } } : {},
    log: (message) => logs.push(message)
  });
  return { handled, presences, logs };
}

function executeCryptoNodeDirect(type, data = {}) {
  const outputs = new Map();
  const handled = executeCryptoNode({ type, data }, {
    resolveInput: (_pinId, fallback) => fallback,
    setOutput: (pinId, value) => outputs.set(pinId, value),
    log: () => {}
  });
  assert.equal(handled, true);
  return outputs;
}

test('data node runtime preserves value conversion, path, and regex behavior', () => {
  assert.deepEqual(evaluateDataNode('data_check_value', { value: null, fallback: 'fallback' }), {
    value: 'fallback',
    state: 'null',
    is_missing: false,
    is_null: true,
    is_empty: false,
    has_value: false
  });
  assert.deepEqual(evaluateDataNode('data_get_value_by_path', {
    value: { members: [{ name: 'Ada' }] },
    path: 'members[0].name',
    fallback: ''
  }), { value: 'Ada', exists: true });
  assert.deepEqual(evaluateDataNode('data_get_value_by_path', {
    value: { safe: true },
    path: '__proto__.polluted',
    fallback: 'blocked'
  }), { value: 'blocked', exists: false });
  assert.equal(evaluateDataNode('data_regex', { text: 'aaa', pattern: '(a+)+$', flags: 'g' }, {}).valid, false);
});

test('logic node runtime preserves boolean and dynamic XOR behavior', () => {
  assert.equal(evaluateLogicNode('logic_and', { a: true, b: false }), false);
  assert.equal(evaluateLogicNode('logic_or', { a: false, b: true }), true);
  assert.equal(evaluateLogicNode('logic_xor', { a: true, b: false }), true);
  assert.equal(evaluateLogicNode('logic_not', { value: false }), true);
  assert.equal(evaluateLogicNode('logic_xor_many', { input_1: true, input_2: false, input_3: true, ignored: true }), false);
  assert.equal(evaluateLogicNode('logic_xor_many', { input_1: false, input_2: true }), true);
});

test('Discord REST permission errors fail the graph run without escaping the node boundary', async () => {
  const nodeErrors = [];
  const result = await GraphRunner.execute({
    id: 'runtime-discord-error',
    name: 'Discord error test',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'action', type: 'action_send_message', data: { channel_id: 'private-channel', content: 'Hello' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'action', targetPinId: 'exec' }
    ]
  }, 'MESSAGE_CREATE', { content: 'runtime test' }, {
    mock: true,
    rest: {
      createMessage: async () => {
        const error = new Error('Missing Access');
        error.status = 403;
        error.code = 50001;
        throw error;
      }
    },
    log: () => {},
    onNodeError: (error) => nodeErrors.push(error)
  });

  assert.match(result.error, /Missing Access/);
  assert.equal(nodeErrors.length, 1);
  assert.equal(nodeErrors[0].nodeId, 'action');
  assert.match(nodeErrors[0].error, /Missing Access/);
});

test('crypto node runtime handlers preserve outputs and execution wiring', async () => {
  const hashStep = await executeAction('action_crypto_hash', { data: 'payload', algorithm: 'sha256' });
  assert.equal(hashStep.outputs.find((output) => output.pinId === 'hash').value, CryptoEngine.hash('payload', 'sha256'));

  const hmacStep = await executeAction('action_crypto_hmac', { data: 'payload', secret: 'secret', algorithm: 'sha256' });
  const signature = hmacStep.outputs.find((output) => output.pinId === 'signature').value;
  assert.equal(signature, CryptoEngine.hmac('payload', 'secret', 'sha256'));

  const verifyStep = await executeAction('action_crypto_verify_hmac', { data: 'payload', secret: 'secret', signature });
  assert.equal(verifyStep.outputs.find((output) => output.pinId === 'isValid').value, true);

  const encryptStep = await executeAction('action_crypto_encrypt', { plaintext: 'private', passphrase: 'passphrase' });
  assert.equal(encryptStep.outputs.find((output) => output.pinId === 'ciphertext').value, '[redacted]');
  const ciphertext = executeCryptoNodeDirect('action_crypto_encrypt', {
    plaintext: 'private',
    passphrase: 'passphrase'
  }).get('ciphertext');
  assert.match(ciphertext, /^arc:v1:aes-256-gcm:/);

  const decryptStep = await executeAction('action_crypto_decrypt', {
    ciphertext,
    passphrase: 'passphrase'
  });
  assert.equal(decryptStep.outputs.find((output) => output.pinId === 'plaintext').value, 'private');

  const randomStep = await executeAction('action_crypto_random', { type: 'pin' });
  assert.equal(randomStep.outputs.find((output) => output.pinId === 'token').value, '[redacted]');
  assert.match(executeCryptoNodeDirect('action_crypto_random', { type: 'pin' }).get('token'), /^\d{6}$/);
});

test('crypto runtime reports unsupported types without mutating execution state', () => {
  const logs = [];
  const outputs = [];
  const handled = executeCryptoNode({ type: 'action_unknown' }, {
    resolveInput: () => '',
    setOutput: (...value) => outputs.push(value),
    log: (message) => logs.push(message)
  });
  assert.equal(handled, false);
  assert.deepEqual(outputs, []);
  assert.deepEqual(logs, []);
});

test('network runtime returns HTTP request results through output pins', async () => {
  const requestOptions = [];
  const { handled, outputs, logs } = await executeNetworkNodeDirect('action_web_fetch', {
    url: 'https://example.test/data',
    method: 'GET',
    headers: '{"accept":"application/json"}'
  }, {
    dependencies: {
      performSafeHttpRequest: async (options) => {
        requestOptions.push(options);
        return {
          status: 200,
          ok: true,
          body: '{"ready":true}',
          headers: { 'content-type': 'application/json' },
          json: { ready: true },
          error: ''
        };
      }
    }
  });

  assert.equal(handled, true);
  assert.equal(requestOptions.length, 1);
  assert.equal(requestOptions[0].url, 'https://example.test/data');
  assert.equal(outputs.get('status'), 200);
  assert.equal(outputs.get('ok'), true);
  assert.equal(outputs.get('body'), '{"ready":true}');
  assert.equal(outputs.get('headers'), '{"content-type":"application/json"}');
  assert.deepEqual(outputs.get('json'), { ready: true });
  assert.equal(outputs.get('error'), '');
  assert.match(logs[0], /GET completed with status 200/);
});

test('retry node applies bounded retry-after delays and reports attempt count', async () => {
  let requestCount = 0;
  const delays = [];
  const { outputs, logs } = await executeNetworkNodeDirect('action_web_retry', {
    url: 'https://example.test/data',
    method: 'GET',
    max_attempts: 3,
    retry_delay_ms: 100
  }, {
    dependencies: {
      performSafeHttpRequest: async () => {
        requestCount += 1;
        return requestCount === 1
          ? { status: 503, ok: false, body: '', headers: { 'retry-after': '2' }, json: null, error: '' }
          : { status: 200, ok: true, body: 'done', headers: {}, json: null, error: '' };
      },
      waitForRetry: async (delay) => delays.push(delay)
    }
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(delays, [2000]);
  assert.equal(outputs.get('attempts'), 2);
  assert.equal(outputs.get('status'), 200);
  assert.equal(outputs.get('body'), 'done');
  assert.match(logs[0], /retrying in 2000ms/);
});

test('retry node does not repeat non-idempotent methods unless enabled', async () => {
  let requestCount = 0;
  const { outputs } = await executeNetworkNodeDirect('action_web_retry', {
    url: 'https://example.test/data',
    method: 'POST',
    max_attempts: 5
  }, {
    dependencies: {
      performSafeHttpRequest: async () => {
        requestCount += 1;
        return { status: 503, ok: false, body: '', headers: {}, json: null, error: '' };
      },
      waitForRetry: async () => assert.fail('POST should not be retried by default')
    }
  });

  assert.equal(requestCount, 1);
  assert.equal(outputs.get('attempts'), 1);
  assert.equal(outputs.get('error'), 'HTTP 503');
});

test('HTTP request runtime forwards timeout and response limits and records request failures', async () => {
  let requestOptions;
  const { outputs } = await executeNetworkNodeDirect('action_web_fetch', {
    url: 'https://example.test/slow',
    timeout_ms: 1500,
    max_bytes: 8192
  }, {
    dependencies: {
      performSafeHttpRequest: async (options) => {
        requestOptions = options;
        throw new Error('Request timed out after 1500 ms.');
      }
    }
  });

  assert.equal(requestOptions.timeoutMs, 1500);
  assert.equal(requestOptions.maxBytes, 8192);
  assert.equal(outputs.get('status'), 0);
  assert.equal(outputs.get('ok'), false);
  assert.equal(outputs.get('error'), 'Request timed out after 1500 ms.');
});

test('retry cancellation propagates as an aborted graph execution', async () => {
  const controller = new AbortController();
  const cancellation = Object.assign(new Error('Graph execution cancelled.'), { name: 'AbortError' });
  await assert.rejects(executeNetworkNodeDirect('action_web_retry', {
    url: 'https://example.test/retry',
    method: 'GET'
  }, {
    context: { signal: controller.signal },
    dependencies: {
      performSafeHttpRequest: async () => ({ status: 503, ok: false, body: '', headers: {}, json: null, error: '' }),
      waitForRetry: async (_delay, signal) => {
        assert.equal(signal, controller.signal);
        throw cancellation;
      }
    }
  }), (error) => error === cancellation);
});

test('network runtime maps download results and failures to stable output shapes', async () => {
  const success = await executeNetworkNodeDirect('action_http_download', {
    url: 'https://example.test/file'
  }, {
    dependencies: {
      downloadSafeHttpFile: async () => ({
        filename: 'file.txt',
        contentType: 'text/plain',
        bytes: Buffer.from('hello')
      })
    }
  });
  assert.deepEqual(success.outputs.get('file'), {
    filename: 'file.txt',
    contentType: 'text/plain',
    data: 'aGVsbG8='
  });
  assert.equal(success.outputs.get('filename'), 'file.txt');
  assert.equal(success.outputs.get('content_type'), 'text/plain');
  assert.equal(success.outputs.get('byte_size'), 5);
  assert.equal(success.outputs.get('error'), '');

  const failed = await executeNetworkNodeDirect('action_http_download', {}, {
    dependencies: {
      downloadSafeHttpFile: async () => { throw new Error('download rejected'); }
    }
  });
  assert.equal(failed.outputs.get('file'), null);
  assert.equal(failed.outputs.get('filename'), '');
  assert.equal(failed.outputs.get('byte_size'), 0);
  assert.equal(failed.outputs.get('error'), 'download rejected');
  assert.match(failed.logs[0], /download rejected/);
});

test('network runtime preserves simulator behavior and ignores unsupported node types', async () => {
  const simulatedFetch = await executeNetworkNodeDirect('action_web_fetch', {}, { context: { mock: true } });
  assert.equal(simulatedFetch.outputs.get('status'), 0);
  assert.equal(simulatedFetch.outputs.get('ok'), false);
  assert.equal(simulatedFetch.outputs.get('error'), 'HTTP requests are disabled in the Offline Simulator.');

  const simulatedRetry = await executeNetworkNodeDirect('action_web_retry', {}, { context: { mock: true } });
  assert.equal(simulatedRetry.outputs.get('attempts'), 0);

  const simulatedDownload = await executeNetworkNodeDirect('action_http_download', {}, { context: { mock: true } });
  assert.equal(simulatedDownload.outputs.get('file'), null);
  assert.equal(simulatedDownload.outputs.get('error'), 'HTTP downloads are disabled in the Offline Simulator.');

  const unsupported = await executeNetworkNodeDirect('action_unknown');
  assert.equal(unsupported.handled, false);
  assert.equal(unsupported.outputs.size, 0);
  assert.equal(isNetworkNodeType('action_web_fetch'), true);
  assert.equal(isNetworkNodeType('action_unknown'), false);
});

test('GraphRunner delegates simulated HTTP actions and preserves exec/debug outputs', async () => {
  const step = await executeAction('action_web_retry', {}, { mock: true });

  assert.equal(step.status, 'completed');
  assert.equal(step.outputs.find((output) => output.pinId === 'status').value, 0);
  assert.equal(step.outputs.find((output) => output.pinId === 'attempts').value, 0);
  assert.equal(step.outputs.find((output) => output.pinId === 'error').value, 'HTTP requests are disabled in the Offline Simulator.');
});

test('custom presence runtime builds bounded text and animated custom emoji payloads', () => {
  const { handled, presences, logs } = executePresenceNodeDirect('action_set_custom_status', {
    status_text: '  Hello   <a:party_time:12345678901234567>  '
  }, true);

  assert.equal(handled, true);
  assert.deepEqual(presences, [{
    activities: [{
      name: 'Custom Status',
      type: 4,
      state: 'Hello',
      emoji: { name: 'party_time', id: '12345678901234567', animated: true }
    }]
  }]);
  assert.match(logs[0], /Updating custom status: Hello/);
});

test('custom presence runtime supports clearing and caps the custom status text', () => {
  const cleared = executePresenceNodeDirect('action_set_custom_status', { status_text: '   ' }, true);
  assert.deepEqual(cleared.presences, [{ activities: [] }]);
  assert.match(cleared.logs[0], /custom status: cleared/);

  const longStatus = executePresenceNodeDirect('action_set_custom_status', {
    status_text: 'x'.repeat(140)
  }, true);
  assert.equal(longStatus.presences[0].activities[0].state.length, 128);
});

test('bot presence runtime normalizes status and activity inputs and validates stream URLs', () => {
  const normalized = executePresenceNodeDirect('action_set_presence', {
    status: 'unsupported',
    activity_text: '   ',
    activity_type: 99
  }, true);
  assert.deepEqual(normalized.presences, [{
    status: 'online',
    activities: [{ name: 'ARC Studio', type: 0 }]
  }]);

  const streaming = executePresenceNodeDirect('action_set_presence', {
    status: ' DND ',
    activity_text: ` ${'x'.repeat(140)} `,
    activity_type: 1,
    stream_url: ' https://twitch.tv/example '
  }, true);
  assert.deepEqual(streaming.presences[0], {
    status: 'dnd',
    activities: [{ name: 'x'.repeat(128), type: 1, url: 'https://twitch.tv/example' }]
  });

  for (const streamUrl of ['', 'javascript:alert(1)', 'https://user:pass@example.test/live']) {
    assert.throws(() => executePresenceNodeDirect('action_set_presence', {
      activity_type: 1,
      stream_url: streamUrl
    }, true), /valid HTTP or HTTPS stream URL/);
  }
});

test('presence runtime reports unsupported types and safely handles a missing gateway client', () => {
  const unsupported = executePresenceNodeDirect('action_unknown');
  assert.equal(unsupported.handled, false);
  assert.deepEqual(unsupported.presences, []);
  assert.deepEqual(unsupported.logs, []);
  assert.equal(isPresenceNodeType('action_set_presence'), true);
  assert.equal(isPresenceNodeType('action_unknown'), false);

  const withoutClient = executePresenceNodeDirect('action_set_presence', { status: 'idle' });
  assert.equal(withoutClient.handled, true);
  assert.deepEqual(withoutClient.presences, []);
  assert.match(withoutClient.logs[0], /status: idle/);
});

test('GraphRunner converts invalid streaming presence URLs into node errors', async () => {
  const result = await GraphRunner.execute({
    id: 'invalid-stream-presence',
    nodes: [
      { id: 'event', type: 'event_message_create' },
      { id: 'presence', type: 'action_set_presence', data: { activity_type: 1, stream_url: 'javascript:alert(1)' } }
    ],
    connections: [
      { sourceNodeId: 'event', sourcePinId: 'exec', targetNodeId: 'presence', targetPinId: 'exec' }
    ]
  }, 'MESSAGE_CREATE', {}, { log: () => {} });

  assert.match(result.error, /valid HTTP or HTTPS stream URL/);
});

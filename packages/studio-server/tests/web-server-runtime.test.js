import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GraphRunner } from '../src/engine/GraphRunner.js';
import { closeGraphWebServers, closeProjectWebServers, executeWebServerNode, renderSafeEjs } from '../src/engine/nodes/runtime/web_server.js';
//
test('web server templates escape request values and reject raw interpolation', () => {
  const locals = { query: { name: '<script>alert(1)</script>' } };

  assert.equal(renderSafeEjs('<p><%= query.name %></p>', locals), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.throws(() => renderSafeEjs('<%- query.name %>', locals), /Unescaped EJS output is disabled/);
  assert.throws(() => renderSafeEjs('<% process.exit() %>', locals), /Executable EJS tags are disabled/);
});

function nodeRuntime(inputs, outputs, projectDir, graphId = 'web-server-test') {
  return {
    resolveInput: (pinId, fallback) => Object.hasOwn(inputs, pinId) ? inputs[pinId] : fallback,
    hasInput: () => false,
    setOutput: (pinId, value) => outputs.set(pinId, value),
    context: { projectDir },
    graphId,
    log: () => {}
  };
}

test('web server binds only to localhost or literal IP addresses', async () => {
  const outputs = new Map();
  const result = await executeWebServerNode({ type: 'action_web_server_start', id: 'server-host' }, nodeRuntime({ host: 'attacker.example' }, outputs, 'host-test'));

  assert.equal(result, true);
  assert.equal(outputs.get('started'), false);
  assert.match(outputs.get('error'), /localhost or an IP address/);
});

test('closing a graph stops only that graph’s web servers', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-web-server-graph-close-'));
  const firstOutputs = new Map();
  const secondOutputs = new Map();
  try {
    await executeWebServerNode({ type: 'action_web_server_start', id: 'server-a' }, nodeRuntime({ port: 0, host: '127.0.0.1' }, firstOutputs, projectDir, 'graph-a'));
    await executeWebServerNode({ type: 'action_web_server_start', id: 'server-b' }, nodeRuntime({ port: 0, host: '127.0.0.1' }, secondOutputs, projectDir, 'graph-b'));
    assert.equal(firstOutputs.get('started'), true);
    assert.equal(secondOutputs.get('started'), true);

    assert.equal(await closeGraphWebServers(projectDir, 'graph-a'), 1);
    assert.equal((await fetch(secondOutputs.get('url'))).status, 404);
    await assert.rejects(fetch(firstOutputs.get('url')));
  } finally {
    await closeProjectWebServers(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('JSON object responses cannot be mislabeled as active HTML content', async () => {
  const outputs = new Map();
  await executeWebServerNode({ type: 'action_web_server_start', id: 'server' }, nodeRuntime({
    port: 0,
    host: '127.0.0.1',
    routes_json: JSON.stringify([{ path: '/page', body: { value: '<%= query.value %>' }, contentType: 'text/html' }])
  }, outputs, 'json-content-type-test'));

  assert.equal(outputs.get('started'), false);
  assert.match(outputs.get('error'), /JSON object responses must use an application\/json content type/);
});

test('web server rejects route patterns that shadow static files or duplicate parameter shapes', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-web-server-'));
  const mediaId = `media_${randomUUID()}`;
  const mediaBytes = Buffer.from('static');
  const startOutputs = new Map();
  fs.mkdirSync(path.join(projectDir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'media', `${mediaId}.bin`), mediaBytes);
  fs.writeFileSync(path.join(projectDir, 'media-assets.json'), JSON.stringify([{
    id: mediaId,
    filename: 'fixed.txt',
    contentType: 'text/plain; charset=utf-8',
    sha256: createHash('sha256').update(mediaBytes).digest('hex')
  }]));
  try {
    await executeWebServerNode({ type: 'action_web_server_start', id: 'server' }, nodeRuntime({ port: 0, host: '127.0.0.1' }, startOutputs, projectDir));
    assert.equal(startOutputs.get('started'), true);
    const serverId = startOutputs.get('web_server_id');

    const staticOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_static_file', id: 'static' }, nodeRuntime({ web_server_id: serverId, path: '/users/fixed', asset: mediaId }, staticOutputs, projectDir));
    assert.equal(staticOutputs.get('registered'), true);

    const shadowOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_route', id: 'shadow' }, nodeRuntime({ web_server_id: serverId, method: 'GET', path: '/users/:userId' }, shadowOutputs, projectDir));
    assert.equal(shadowOutputs.get('registered'), false);
    assert.match(shadowOutputs.get('error'), /already registered/);

    const firstRouteOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_route', id: 'first-route' }, nodeRuntime({ web_server_id: serverId, method: 'GET', path: '/groups/:groupId/:groupId' }, firstRouteOutputs, projectDir));
    assert.equal(firstRouteOutputs.get('registered'), false);
    assert.match(firstRouteOutputs.get('error'), /parameter names must be unique/);

    const uniqueRouteOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_route', id: 'unique-route' }, nodeRuntime({ web_server_id: serverId, method: 'GET', path: '/groups/:groupId' }, uniqueRouteOutputs, projectDir));
    assert.equal(uniqueRouteOutputs.get('registered'), true);
    const duplicateShapeOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_route', id: 'duplicate-shape' }, nodeRuntime({ web_server_id: serverId, method: 'GET', path: '/groups/:slug' }, duplicateShapeOutputs, projectDir));
    assert.equal(duplicateShapeOutputs.get('registered'), false);
  } finally {
    await closeProjectWebServers(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('web server route bearer tokens are read from the environment and checked', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-web-server-auth-'));
  const previousToken = process.env.WEB_SERVER_RUNTIME_TEST_TOKEN;
  process.env.WEB_SERVER_RUNTIME_TEST_TOKEN = 'runtime-secret';
  try {
    const startOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_start', id: 'server' }, nodeRuntime({ port: 0, host: '127.0.0.1' }, startOutputs, projectDir));
    const serverId = startOutputs.get('web_server_id');
    const routeOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_route', id: 'secure-route', data: { auth_token: '{{env:WEB_SERVER_RUNTIME_TEST_TOKEN}}' } }, nodeRuntime({ web_server_id: serverId, method: 'GET', path: '/secure', content_type: 'text/html', auth_token: '{{env:WEB_SERVER_RUNTIME_TEST_TOKEN}}', response: '<p><%= query.name %></p>' }, routeOutputs, projectDir));
    assert.equal(routeOutputs.get('registered'), true);
    const bodyRouteOutputs = new Map();
    await executeWebServerNode({ type: 'action_web_server_route', id: 'body-route' }, nodeRuntime({ web_server_id: serverId, method: 'POST', path: '/body', content_type: 'text/plain', response: '<%= body %>' }, bodyRouteOutputs, projectDir));
    assert.equal(bodyRouteOutputs.get('registered'), true);
    const url = new URL('/secure?name=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', startOutputs.get('url'));

    const unauthorized = await fetch(url);
    assert.equal(unauthorized.status, 401);
    const headUnauthorized = await fetch(url, { method: 'HEAD' });
    assert.equal(headUnauthorized.status, 401);
    assert.equal(await headUnauthorized.text(), '');
    const authorized = await fetch(url, { headers: { authorization: 'Bearer runtime-secret' } });
    assert.equal(authorized.status, 200);
    assert.equal(await authorized.text(), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');

    const oversizedBody = await fetch(new URL('/body', startOutputs.get('url')), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(16 * 1024 + 1)
    });
    assert.equal(oversizedBody.status, 413);
  } finally {
    await closeProjectWebServers(projectDir);
    if (previousToken === undefined) delete process.env.WEB_SERVER_RUNTIME_TEST_TOKEN;
    else process.env.WEB_SERVER_RUNTIME_TEST_TOKEN = previousToken;
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('HTTP requests run through graph If and Else branches and return the selected response', async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-web-server-graph-'));
  const graph = {
    id: 'graph-web-request',
    nodes: [
      { id: 'boot', type: 'event_message_create' },
      { id: 'server', type: 'action_web_server_start', data: { port: 0, host: '127.0.0.1' } },
      { id: 'request', type: 'event_web_server_request', data: { method: 'GET', path: '/items/:itemId' } },
      { id: 'get-allow', type: 'data_get_value_by_path', data: { path: 'allow', fallback: '' } },
      { id: 'branch', type: 'branch_if' },
      { id: 'allow-response', type: 'action_web_server_response', data: { status: 200, content_type: 'application/json; charset=utf-8', body: { allowed: true } } },
      { id: 'deny-response', type: 'action_web_server_response', data: { status: 403, content_type: 'application/json; charset=utf-8', body: { allowed: false } } }
    ],
    connections: [
      { sourceNodeId: 'boot', sourcePinId: 'exec', targetNodeId: 'server', targetPinId: 'exec' },
      { sourceNodeId: 'server', sourcePinId: 'web_server_id', targetNodeId: 'request', targetPinId: 'web_server_id' },
      { sourceNodeId: 'request', sourcePinId: 'exec', targetNodeId: 'branch', targetPinId: 'exec' },
      { sourceNodeId: 'request', sourcePinId: 'query', targetNodeId: 'get-allow', targetPinId: 'value' },
      { sourceNodeId: 'get-allow', sourcePinId: 'exists', targetNodeId: 'branch', targetPinId: 'condition' },
      { sourceNodeId: 'branch', sourcePinId: 'true_exec', targetNodeId: 'allow-response', targetPinId: 'exec' },
      { sourceNodeId: 'branch', sourcePinId: 'false_exec', targetNodeId: 'deny-response', targetPinId: 'exec' },
      { sourceNodeId: 'request', sourcePinId: 'request_id', targetNodeId: 'allow-response', targetPinId: 'request_id' },
      { sourceNodeId: 'request', sourcePinId: 'request_id', targetNodeId: 'deny-response', targetPinId: 'request_id' }
    ]
  };
  const logs = [];
  const context = { projectDir, log: (message) => logs.push(message) };
  context.dispatchGraphEvent = (eventName, payload, graphId) => {
    assert.equal(graphId, graph.id);
    return GraphRunner.execute(graph, eventName, payload, context);
  };

  try {
    await GraphRunner.execute(graph, 'MESSAGE_CREATE', { content: 'boot' }, context);
    const listening = logs.find((message) => message.includes('[Web Server] Listening on '));
    const baseUrl = /https?:\/\/[^\s]+/.exec(listening)?.[0];
    assert.ok(baseUrl, 'web server should report its active URL');

    const allowed = await fetch(new URL('/items/abc?allow=yes', baseUrl));
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { allowed: true });
    const denied = await fetch(new URL('/items/abc', baseUrl));
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { allowed: false });
  } finally {
    await closeProjectWebServers(projectDir);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('simulated HTTP requests capture graph responses without opening a listener', async () => {
  const graph = {
    id: 'mock-web-request',
    nodes: [
      { id: 'request', type: 'event_web_server_request' },
      { id: 'response', type: 'action_web_server_response', data: { status: 201, content_type: 'application/json; charset=utf-8', body: { created: true } } }
    ],
    connections: [
      { sourceNodeId: 'request', sourcePinId: 'exec', targetNodeId: 'response', targetPinId: 'exec' },
      { sourceNodeId: 'request', sourcePinId: 'request_id', targetNodeId: 'response', targetPinId: 'request_id' }
    ]
  };
  const interceptedOutputs = [];
  const result = await GraphRunner.execute(graph, 'WEB_SERVER_REQUEST', {
    requestId: 'mock-request-1', routeId: 'request', method: 'POST', path: '/items', query: {}, params: {}, headers: {}, body: null
  }, { mock: true, interceptedOutputs, log: () => {} });

  assert.equal(result.error, null);
  assert.deepEqual(interceptedOutputs.map(({ type, requestId, status, body }) => ({ type, requestId, status, body })), [
    { type: 'WEB_SERVER_RESPONSE', requestId: 'mock-request-1', status: 201, body: { created: true } }
  ]);
});
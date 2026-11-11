import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectWebServerResponsePaths } from '../src/core/webServerResponsePaths.js';

const request = { id: 'request', type: 'event_web_server_request', data: { method: 'GET', path: '/items/:id' } };
const response = { id: 'response', type: 'action_web_server_response' };
const responseWire = (sourceNodeId, targetNodeId, sourcePinId = 'exec') => ({ sourceNodeId, sourcePinId, targetNodeId, targetPinId: 'exec' });
const requestIdWire = (targetNodeId) => ({ sourceNodeId: 'request', sourcePinId: 'request_id', targetNodeId, targetPinId: 'request_id' });
//
test('reports a web route with no reachable response action', () => {
  const findings = inspectWebServerResponsePaths({ nodes: [request, { id: 'log', type: 'action_console_log' }], connections: [] });
  assert.equal(findings[0]?.kind, 'missing');
  assert.match(findings[0]?.message || '', /no reachable Respond to Web Request/);
});

test('reports an If branch that cannot reach a response', () => {
  const findings = inspectWebServerResponsePaths({
    nodes: [request, { id: 'branch', type: 'branch_if' }, response],
    connections: [
      responseWire('request', 'branch'),
      { sourceNodeId: 'branch', sourcePinId: 'true_exec', targetNodeId: 'response', targetPinId: 'exec' },
      requestIdWire('response')
    ],
    definitions: new Map([['branch_if', { outputs: [{ id: 'true_exec', type: 'exec' }, { id: 'false_exec', type: 'exec' }] }]])
  });
  assert.ok(findings.some((finding) => finding.kind === 'missing-branch' && /False branch/.test(finding.message)));
});

test('reports sequential and parallel duplicate responses', () => {
  const secondResponse = { id: 'response-2', type: 'action_web_server_response' };
  const sequential = inspectWebServerResponsePaths({
    nodes: [request, response, secondResponse],
    connections: [responseWire('request', 'response'), responseWire('response', 'response-2'), requestIdWire('response'), requestIdWire('response-2')]
  });
  assert.ok(sequential.some((finding) => finding.kind === 'multiple'));

  const parallel = { id: 'parallel', type: 'parallel' };
  const parallelResponses = inspectWebServerResponsePaths({
    nodes: [request, parallel, response, secondResponse],
    connections: [
      responseWire('request', 'parallel'),
      responseWire('parallel', 'response', 'branch_a_exec'),
      responseWire('parallel', 'response-2', 'branch_b_exec'),
      requestIdWire('response'), requestIdWire('response-2')
    ]
  });
  assert.ok(parallelResponses.some((finding) => finding.kind === 'parallel-multiple'));
});
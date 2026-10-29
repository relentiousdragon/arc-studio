import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGraphRouteId, normalizeProjectRouteId } from '../src/routes/routeResourceIds.js';

const uuid = 'a2ef9c10-1234-4abc-8def-1234567890ab';

test('project routes accept short UUIDs and existing prefixed IDs', () => {
  assert.equal(normalizeProjectRouteId(uuid), `project_${uuid}`);
  assert.equal(normalizeProjectRouteId(`project_${uuid}`), `project_${uuid}`);
  assert.equal(normalizeProjectRouteId('default'), 'default');
});

test('graph routes accept short UUIDs and imported graph IDs', () => {
  assert.equal(normalizeGraphRouteId(uuid), `graph_${uuid}`);
  assert.equal(normalizeGraphRouteId(`graph_${uuid}`), `graph_${uuid}`);
  assert.equal(normalizeGraphRouteId(`import_${uuid}`), `graph_import_${uuid}`);
  assert.equal(normalizeGraphRouteId(`graph_import_${uuid}`), `graph_import_${uuid}`);
  assert.equal(normalizeGraphRouteId('tab_ping_pong'), 'tab_ping_pong');
});

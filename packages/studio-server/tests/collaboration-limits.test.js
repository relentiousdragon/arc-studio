import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLLABORATOR_COLORS, getActiveCollaborators, getCollaboratorColor, MAX_REALTIME_COLLABORATORS
} from '../src/engine/CollaborationLimits.js';

test('assigns a distinct stable palette color to each of ten active collaborators', () => {
  assert.equal(MAX_REALTIME_COLLABORATORS, 10);
  assert.equal(new Set(COLLABORATOR_COLORS).size, MAX_REALTIME_COLLABORATORS);

  const collaborators = [];
  for (let index = 1; index <= MAX_REALTIME_COLLABORATORS; index += 1) {
    const userId = `user-${index}`;
    const color = getCollaboratorColor(userId, collaborators);
    collaborators.push({ userId, color });
    assert.equal(getCollaboratorColor(userId, collaborators), color);
  }

  assert.equal(new Set(collaborators.map((collaborator) => collaborator.color)).size, MAX_REALTIME_COLLABORATORS);
});

test('counts distinct authenticated users with an open workspace connection', () => {
  const clients = [
    { arcAuthenticated: true, readyState: 1, arcUser: { id: 'user-1' }, arcColor: '#63b3ed' },
    { arcAuthenticated: true, readyState: 1, arcUser: { id: 'user-1' }, arcColor: '#63b3ed' },
    { arcAuthenticated: true, readyState: 1, arcUser: { id: 'user-2' }, arcColor: '#f687b3' },
    { arcAuthenticated: true, readyState: 3, arcUser: { id: 'user-3' }, arcColor: '#68d391' },
    { arcAuthenticated: false, readyState: 1, arcUser: { id: 'user-4' }, arcColor: '#f6ad55' }
  ];

  assert.deepEqual(getActiveCollaborators(clients, 1), [
    { userId: 'user-1', color: '#63b3ed' },
    { userId: 'user-2', color: '#f687b3' }
  ]);
});

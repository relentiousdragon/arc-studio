import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { activityAvatarUrl, renderActivityAvatarPng, verifyActivityAvatarSignature } from '../src/security/ActivityAvatar.js';
//
test('generated ARC account avatars are cached PNG images', () => {
  const first = renderActivityAvatarPng('user_123', 'a');
  const cached = renderActivityAvatarPng('user_123', 'A');
  const anotherUser = renderActivityAvatarPng('user_456', 'A');
  assert.equal(first.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(first.readUInt32BE(16), 96);
  assert.equal(first.readUInt32BE(20), 96);
  const imageData = [];
  for (let offset = 8; offset < first.length;) {
    const length = first.readUInt32BE(offset);
    const type = first.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') imageData.push(first.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.equal(inflateSync(Buffer.concat(imageData)).length, (96 * 4 + 1) * 96);
  assert.strictEqual(first, cached);
  assert.notDeepEqual(first, anotherUser);
});

test('activity avatar URLs use the HTTPS ARC workspace origin and generated initials', () => {
  const secret = 'test-secret';
  const headers = {
    'origin': 'https://studio.example.com',
    'x-forwarded-host': 'studio.example.com, internal:3000',
    'host': 'internal:3000'
  };
  const req = { protocol: 'http', get: (name) => headers[name] || '' };
  const avatarUrl = new URL(activityAvatarUrl(req, { id: 'user_123', username: 'editor' }, secret));
  assert.equal(avatarUrl.origin, 'https://studio.example.com');
  assert.equal(avatarUrl.pathname, '/api/activity-avatars/user_123.png');
  assert.equal(avatarUrl.searchParams.get('initial'), 'E');
  assert.equal(verifyActivityAvatarSignature('user_123', 'E', avatarUrl.searchParams.get('signature'), secret), true);
  assert.equal(verifyActivityAvatarSignature('user_123', 'F', avatarUrl.searchParams.get('signature'), secret), false);
  assert.equal(verifyActivityAvatarSignature('user_123', 'E', avatarUrl.searchParams.get('signature'), 'wrong-secret'), false);
  assert.equal(activityAvatarUrl({ protocol: 'https', get: () => '' }, { id: 'user_123', username: 'editor' }, secret), '');
  assert.equal(activityAvatarUrl({ protocol: 'http', get: (name) => name === 'host' ? 'studio.example.com' : '' }, { id: 'user_123', username: 'editor' }, secret), '');
  assert.equal(activityAvatarUrl(req, { id: 'invalid/id', username: 'editor' }, secret), '');
});

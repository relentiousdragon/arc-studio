import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { serverConfig } from '../src/config.js';
import { UserStore } from '../src/security/UserStore.js';
//
test('hosted accounts cannot claim the reserved username Bl0B', async () => {
  if (serverConfig.desktopMode) return;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'arc-reserved-username-'));
  try {
    const users = new UserStore({ dataPath: path.join(directory, 'users.json') });
    assert.throws(() => users.createPrimaryAdmin({
      username: 'Bl0B', password: 'correct horse battery staple', workspaceName: 'Test Workspace'
    }), /username is reserved/i);

    const owner = users.createPrimaryAdmin({
      username: 'owner', password: 'correct horse battery staple', workspaceName: 'Test Workspace'
    });
    assert.throws(() => users.createUser({ username: 'bL0b', password: 'another secure password' }), /username is reserved/i);
    assert.throws(() => users.renamePrimaryAdmin(owner.user.id, 'BL0B'), /username is reserved/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

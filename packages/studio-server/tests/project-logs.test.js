import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BotManager } from '../src/engine/BotManager.js';
//
test('BotManager writes project execution logs to project directory and lists them', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-proj-logs-'));
  const project = { id: 'project_12345678-1234-4234-8234-123456789012', name: 'Log Test Project', emptyStart: true };
  const projectStore = {
    projects: [project],
    active: () => project,
    directory: () => directory,
    persist() {}
  };

  try {
    const botManager = new BotManager({ projectStore, projectId: project.id });

    botManager.log('INFO', 'Test project log message 1');
    botManager.log('GATEWAY', 'Gateway connected successfully');
    botManager.log('EXECUTION', 'Executed node 42 in graph alpha');

    await new Promise((resolve) => setTimeout(resolve, 50));

    const files = botManager.listProjectLogFiles();
    assert.ok(files.length > 0, 'Project should have at least one log file');
    assert.match(files[0].filename, /^project-\d{4}-\d{2}-\d{2}\.log$/);

    const content = botManager.readProjectLogFile(files[0].filename);
    assert.ok(content.includes('Test project log message 1'));
    assert.ok(content.includes('Gateway connected successfully'));
    assert.ok(content.includes('Executed node 42 in graph alpha'));

    botManager.projectLogger?.close();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

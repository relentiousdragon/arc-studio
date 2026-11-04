import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse } from 'dotenv';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const serverDirectory = resolve(scriptDirectory, '..');
const repositoryRoot = resolve(serverDirectory, '../..');
let workspacePort = '';
try { workspacePort = parse(readFileSync(resolve(repositoryRoot, '.env'), 'utf8')).PORT || ''; } catch {}
const serverPort = process.env.ARC_SERVER_PORT || workspacePort || process.env.PORT;
const server = spawn(process.execPath, ['--watch', 'src/index.js'], {
  cwd: serverDirectory,
  env: { ...process.env, ...(serverPort ? { PORT: serverPort } : {}), ARC_SERVER_ONLY: '1' },
  stdio: 'inherit'
});
let stopping = false;
//
server.once('error', (error) => {
  console.error(`[ARC Studio server] Could not start the development server: ${error.message}`);
  process.exitCode = 1;
});

server.once('exit', (code, signal) => {
  if (stopping) return;
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.kill(signal);
  });
}

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = {
  ...process.env,
  ARC_DESKTOP_MODE: '1',
  ARC_DESKTOP_DEV_MODE: '1',
  ARC_SERVER_PORT: '3101',
  PORT: '3101'
};
const server = spawn(process.execPath, ['scripts/dev-desktop.mjs'], {
  cwd: path.join(root, 'packages/studio-server'),
  env: environment,
  stdio: 'inherit'
});
const client = spawn(process.execPath, ['../../node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5174', '--strictPort'], {
  cwd: path.join(root, 'packages/studio-client'),
  env: environment,
  stdio: 'inherit'
});
let shuttingDown = false;

const stop = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill('SIGTERM');
  client.kill('SIGTERM');
  process.exitCode = code;
};

server.once('error', (error) => {
  console.error(`[ARC desktop services] ${error.message}`);
  stop(1);
});
client.once('error', (error) => {
  console.error(`[ARC desktop services] ${error.message}`);
  stop(1);
});
server.once('exit', (code) => { if (!shuttingDown) stop(code ?? 1); });
client.once('exit', (code) => { if (!shuttingDown) stop(code ?? 1); });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}

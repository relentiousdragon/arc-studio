import { spawn } from 'node:child_process';

const origins = 'tauri://localhost,http://tauri.localhost,http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174';
let stopping = false;
let server = null;
let restartTimer = null;
//
const startServer = () => {
  if (stopping) return;
  server = spawn(process.execPath, ['--watch', 'src/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ARC_DESKTOP_MODE: '1', ARC_DESKTOP_DEV_MODE: '1', ARC_CORS_ORIGINS: origins },
    stdio: 'inherit'
  });
  server.once('error', (error) => {
    console.error(`[ARC desktop server] ${error.message}`);
    process.exitCode = 1;
  });
  server.once('exit', (code, signal) => {
    server = null;
    if (stopping) return;
    if (code === 75) {
      restartTimer = setTimeout(startServer, 250);
      return;
    }
    process.exitCode = code ?? (signal ? 1 : 0);
  });
};

startServer();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    if (restartTimer) clearTimeout(restartTimer);
    server?.kill(signal);
  });
}

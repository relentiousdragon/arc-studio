import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDist = path.join(repositoryRoot, 'packages/studio-client/dist');
const version = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).version;

for (const asset of ['index.html', 'arc.png', 'nightly-icon.png']) {
  if (!fs.existsSync(path.join(clientDist, asset))) {
    throw new Error(`Client build is missing ${asset}, refusing to mark the build complete.`);
  }
}
if (typeof version !== 'string' || !version.trim()) throw new Error('Could not determine the ARC Studio version for the client build marker.');

const markerPath = path.join(clientDist, '.arc-studio-version');
const temporaryPath = `${markerPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, `${version}\n`, 'utf8');
fs.renameSync(temporaryPath, markerPath);
process.stdout.write(`Marked ARC Studio client assets as ${version}.\n`);

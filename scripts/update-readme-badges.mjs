import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const compact = (value) => Number(value || 0).toLocaleString('en-US');
//
function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function badgeSvg(label, value, color = '#8957e5') {
  const labelWidth = Math.max(38, Math.ceil(label.length * 6.2 + 14));
  const valueWidth = Math.max(32, Math.ceil(value.length * 6.2 + 14));
  const width = labelWidth + valueWidth;
  const labelCenter = labelWidth / 2;
  const valueCenter = labelWidth + valueWidth / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(`${label}: ${value}`)}"><title>${escapeXml(`${label}: ${value}`)}</title><linearGradient id="b" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-opacity=".08"/></linearGradient><clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><path fill="#555" d="M0 0h${labelWidth}v20H0z"/><path fill="${color}" d="M${labelWidth} 0h${valueWidth}v20H${labelWidth}z"/><path fill="url(#b)" d="M0 0h${width}v20H0z"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="${labelCenter}" y="14">${escapeXml(label)}</text><text x="${valueCenter}" y="14">${escapeXml(value)}</text></g></svg>\n`;
}

async function apiJson(url, token) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'arc-studio-readme-badges', 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${url}`);
  return response.json();
}

async function optional(label, task, fallback = 'unavailable') {
  try {
    return await task();
  } catch (error) {
    console.warn(`${label} badge could not be updated: ${error.message}`);
    return fallback;
  }
}

function getRepository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: root, encoding: 'utf8' }).trim();
    const match = /(?:github\.com[:/])([^/]+\/[^/.]+?)(?:\.git)?$/.exec(remote);
    if (match) return match[1];
  } catch {}
  throw new Error('Set GITHUB_REPOSITORY or configure a GitHub origin remote.');
}

const repository = getRepository();
const apiRoot = `https://api.github.com/repos/${repository}`;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const [studio, chezcord, desktop, studioClient] = await Promise.all([
  readJson('package.json'),
  readJson('packages/chezcord/package.json'),
  readFile(resolve(root, 'packages/studio-desktop/src-tauri/Cargo.toml'), 'utf8'),
  readJson('packages/studio-client/package.json')
]);

let commits = 'unavailable';
try {
  const commitSubjects = execFileSync('git', ['log', '--format=%s', 'HEAD'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  const projectCommitCount = commitSubjects.filter((subject) => !subject.startsWith('docs: refresh README badges')).length;
  commits = compact(projectCommitCount);
} catch (error) {
  console.warn(`Commit count badge could not be updated: ${error.message}`);
}

const repositoryData = await optional('Repository', () => apiJson(apiRoot, token), null);
const tauriVersion = /^\s*tauri\s*=\s*\{\s*version\s*=\s*"([^"]+)"/m.exec(desktop)?.[1] || 'unknown';
const cleanVersion = (value) => String(value || 'unknown').replace(/^[~^>=\s]+/, '');
const badgeSpecs = [
  ['arc-studio-version', 'ARC Studio', studio.version, '#8957e5'],
  ['chezcord-version', 'Chezcord', chezcord.version, '#8957e5'],
  ['tauri-version', 'Tauri', `v${cleanVersion(tauriVersion)}`, '#24c8db'],
  ['node-version', 'Node.js', '22+', '#43853d'],
  ['license', 'License', studio.license || 'Apache-2.0', '#2da44e'],
  ['commits', 'Commits', commits, '#0969da'],
  ['stars', 'Stars', repositoryData ? compact(repositoryData.stargazers_count) : 'unavailable', '#e3b341'],
  ['forks', 'Forks', repositoryData ? compact(repositoryData.forks_count) : 'unavailable', '#6f42c1'],
  ['vite-version', 'Vite', cleanVersion(studioClient.devDependencies?.vite || studioClient.dependencies?.vite), '#646cff']
];

const badgeDirectory = resolve(root, 'docs/badges');
await mkdir(badgeDirectory, { recursive: true });
for (const [filename, label, value, color] of badgeSpecs) {
  await writeFile(resolve(badgeDirectory, `${filename}.svg`), badgeSvg(label, value, color));
}

const readmePath = resolve(root, 'README.md');
const readme = await readFile(readmePath, 'utf8');
const start = '<!-- ARC_BADGES:START -->';
const end = '<!-- ARC_BADGES:END -->';
const startIndex = readme.indexOf(start);
const endIndex = readme.indexOf(end);
if (startIndex < 0 || endIndex < startIndex) throw new Error('README.md is missing the ARC badge markers.');

const badgeMarkdown = [
  ['arc-studio-version', 'ARC Studio version', 'package.json'],
  ['chezcord-version', 'Chezcord version', 'packages/chezcord/package.json'],
  ['tauri-version', 'Tauri version', 'packages/studio-desktop/src-tauri/Cargo.toml'],
  ['vite-version', 'Vite version', 'packages/studio-client/package.json'],
  ['node-version', 'Node.js version', 'https://nodejs.org/'],
  ['license', 'License', 'LICENSE'],
  ['ci', 'CI status', `https://github.com/${repository}/actions/workflows/ci.yml`],
  ['desktop-builds', 'Desktop builds', `https://github.com/${repository}/actions/workflows/desktop-builds.yml`],
  ['commits', 'Commits', `https://github.com/${repository}/commits`],
  ['stars', 'GitHub stars', `https://github.com/${repository}`],
  ['forks', 'GitHub forks', `https://github.com/${repository}/network/members`]
].map(([filename, alt, href]) => ['ci', 'desktop-builds'].includes(filename)
  ? `[![${alt}](https://github.com/${repository}/actions/workflows/${filename}.yml/badge.svg${filename === 'desktop-builds' ? '?event=push' : ''})](${href})`
  : `[![${alt}](docs/badges/${filename}.svg)](${href})`).join('\n');
const updated = `${readme.slice(0, startIndex + start.length)}\n${badgeMarkdown}\n${readme.slice(endIndex)}`;
await writeFile(readmePath, updated);
console.log(`Updated ${badgeSpecs.length} README badges for ${repository}.`);

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
//
const command = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const target = process.env.ARC_DESKTOP_TARGET || (process.platform === 'darwin'
  ? 'universal-apple-darwin'
  : execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim());
const run = (file, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  child.once('error', reject);
  child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(signal ? `${file} stopped by ${signal}` : `${file} exited with code ${code}`)));
});

try {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-version.mjs')], { stdio: 'inherit' });
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const releaseChannel = ['stable', 'nightly'].includes(process.env.ARC_RELEASE_CHANNEL)
    ? process.env.ARC_RELEASE_CHANNEL
    : rootPackage.version.includes('-') ? 'nightly' : 'stable';
  const updateRepository = process.env.ARC_UPDATE_REPOSITORY || process.env.GITHUB_REPOSITORY || 'relentiousdragon/arc-studio';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(updateRepository)) {
    throw new Error(`Invalid GitHub updater repository: ${updateRepository}.`);
  }
  const expectedUpdateEndpoint = releaseChannel === 'nightly'
    ? `https://github.com/${updateRepository}/releases/download/nightly/latest.json`
    : `https://github.com/${updateRepository}/releases/latest/download/latest.json`;
  if (process.env.ARC_UPDATE_ENDPOINT && process.env.ARC_UPDATE_ENDPOINT !== expectedUpdateEndpoint) {
    throw new Error(`The ${releaseChannel} desktop build must use its matching updater endpoint.`);
  }
  const tauriArgs = ['build', '--target', target, '--bundles', process.platform === 'darwin' ? 'app' : process.platform === 'win32' ? 'nsis' : 'appimage,deb'];
  const signingConfigured = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY_PATH);
  const tauriBuildConfig = { bundle: { createUpdaterArtifacts: signingConfigured } };
  let nightlyIconDirectory = null;
  if (releaseChannel === 'nightly') {
    nightlyIconDirectory = path.join(repoRoot, 'packages', 'studio-desktop', 'src-tauri', 'target', 'nightly-icons');
    execFileSync(process.execPath, [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'create-nightly-icons.mjs'),
      path.join(repoRoot, 'packages', 'studio-desktop', 'src-tauri', 'icons'),
      nightlyIconDirectory
    ], { stdio: 'inherit' });
    tauriBuildConfig.bundle.icon = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico']
      .map((name) => path.join(nightlyIconDirectory, name));
  }
  tauriBuildConfig.plugins = { updater: { endpoints: [expectedUpdateEndpoint] } };
  const tauriBuildConfigPath = path.join(repoRoot, 'packages', 'studio-desktop', 'src-tauri', `.arc-build-config-${process.pid}.json`);
  fs.writeFileSync(tauriBuildConfigPath, JSON.stringify(tauriBuildConfig));
  tauriArgs.push('--config', tauriBuildConfigPath);
  try {
    await run(command, tauriArgs, { env: { ...process.env, ARC_DESKTOP_TARGET: target, ARC_RELEASE_CHANNEL: releaseChannel, ARC_UPDATE_REPOSITORY: updateRepository } });
  } finally {
    fs.rmSync(tauriBuildConfigPath, { force: true });
  }
  if (process.platform === 'darwin') {
    const config = JSON.parse(fs.readFileSync(path.join('src-tauri', 'tauri.conf.json'), 'utf8'));
    const arch = target === 'universal-apple-darwin' ? 'universal' : target.startsWith('aarch64') ? 'arm64' : 'x64';
    const appName = `${config.bundle?.macOS?.bundleName || config.productName}.app`;
    const bundleRoot = path.join('src-tauri', 'target', target, 'release', 'bundle');
    const appPath = path.join(bundleRoot, 'macos', appName);
    if (!fs.existsSync(appPath)) throw new Error(`Tauri built successfully but the app bundle was not found: ${appPath}`);
    const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
    const documentIconSource = nightlyIconDirectory ? path.join(nightlyIconDirectory, 'icon.icns') : path.join('src-tauri', 'icons', 'icon.icns');
    const documentTypes = [
      { name: 'arcproject', index: 0 },
      { name: 'arcgraph', index: 1 }
    ];
    for (const documentType of documentTypes) {
      fs.copyFileSync(documentIconSource, path.join(appPath, 'Contents', 'Resources', `${documentType.name}.icns`));
    }
    const setPlistString = (key, value) => {
      const setCommand = `Set ${key} ${value}`;
      try { execFileSync('/usr/libexec/PlistBuddy', ['-c', setCommand, infoPlist], { stdio: 'ignore' }); }
      catch {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add ${key} string ${value}`, infoPlist]);
      }
    };
    for (const documentType of documentTypes) {
      setPlistString(`:CFBundleDocumentTypes:${documentType.index}:CFBundleTypeIconFile`, documentType.name);
      setPlistString(`:UTExportedTypeDeclarations:${documentType.index}:UTTypeIconFile`, documentType.name);
      const documentIcon = execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :CFBundleDocumentTypes:${documentType.index}:CFBundleTypeIconFile`, infoPlist], { encoding: 'utf8' }).trim();
      const typeIcon = execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :UTExportedTypeDeclarations:${documentType.index}:UTTypeIconFile`, infoPlist], { encoding: 'utf8' }).trim();
      if (documentIcon !== documentType.name || typeIcon !== documentType.name || !fs.existsSync(path.join(appPath, 'Contents', 'Resources', `${documentType.name}.icns`))) {
        throw new Error(`The ARC Studio ${documentType.name} file icon could not be added to the macOS app bundle.`);
      }
    }
    if (signingConfigured) {
      const updateArchive = path.join(path.dirname(appPath), `${appName}.tar.gz`);
      await run('tar', ['-czf', updateArchive, '-C', path.dirname(appPath), appName]);
      await run(command, ['signer', 'sign', '--app-version', config.version, updateArchive]);
      console.log(`Signed macOS updater bundle: ${updateArchive}`);
    }
    const dmgDir = path.join(bundleRoot, 'dmg');
    fs.mkdirSync(dmgDir, { recursive: true });
    const dmgPath = path.join(dmgDir, `${config.productName}_${config.version}_${arch}-unsigned.dmg`);
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-studio-dmg-'));
    const writableDmg = path.join(dmgDir, `.arc-studio-${process.pid}.dmg`);
    let mountPoint = null;
    let mounted = false;
    try {
      fs.cpSync(appPath, path.join(staging, appName), { recursive: true });
      fs.symlinkSync('/Applications', path.join(staging, 'Applications'));
      fs.mkdirSync(path.join(staging, '.background'));
      fs.copyFileSync(path.join('src-tauri', 'icons', 'dmg-background.png'), path.join(staging, '.background', 'arc-studio.png'));
      await run('hdiutil', ['create', '-volname', 'ARC Studio', '-srcfolder', staging, '-ov', '-format', 'UDRW', writableDmg]);
      const attachOutput = execFileSync('hdiutil', ['attach', writableDmg, '-readwrite', '-noverify', '-noautoopen'], { encoding: 'utf8' });
      process.stdout.write(attachOutput);
      mountPoint = attachOutput.split(/\r?\n/)
        .map((line) => line.split(/\t+/).map((part) => part.trim()).at(-1))
        .find((part) => part?.startsWith('/Volumes/'));
      if (!mountPoint) throw new Error('The ARC Studio disk image mounted without a standard Finder volume path.');
      mounted = true;
      const finderScript = [
        'tell application "Finder"',
        '  tell disk "ARC Studio"',
        '    open',
        '    set current view of container window to icon view',
        '    set toolbar visible of container window to false',
        '    set statusbar visible of container window to false',
        '    set bounds of container window to {120, 100, 880, 560}',
        '    set icon size of icon view options of container window to 96',
        '    set arrangement of icon view options of container window to not arranged',
        '    set background picture of icon view options of container window to file ".background:arc-studio.png"',
        `    set position of item "${appName}" of container window to {190, 260}`,
        '    set position of item "Applications" of container window to {570, 260}',
        '  end tell',
        'end tell'
      ].join('\n');
      execFileSync('osascript', ['-e', finderScript], { stdio: 'inherit' });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await run('hdiutil', ['detach', mountPoint, '-quiet']);
      mounted = false;
      await run('hdiutil', ['convert', writableDmg, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-ov', '-o', dmgPath]);
      fs.rmSync(writableDmg, { force: true });
      console.log(`Created ARC Studio installer: ${dmgPath}`);
    } finally {
      if (mounted) {
        try { execFileSync('hdiutil', ['detach', mountPoint, '-quiet']); } catch {}
      }
      fs.rmSync(writableDmg, { force: true });
      fs.rmSync(staging, { recursive: true, force: true });
    }
  }
  const bundleKind = process.platform === 'darwin' ? 'dmg' : process.platform === 'win32' ? 'nsis' : 'appimage';
  const bundleRoot = path.join('src-tauri', 'target', target, 'release', 'bundle', bundleKind);
  const extension = process.platform === 'darwin' ? '.dmg' : process.platform === 'win32' ? '.exe' : '.AppImage';
  if (!fs.existsSync(bundleRoot)) throw new Error(`The ${bundleKind} bundle directory was not created: ${bundleRoot}`);
  const installerBundles = [{ directory: bundleRoot, extension }];
  if (process.platform === 'linux') {
    installerBundles.push({
      directory: path.join('src-tauri', 'target', target, 'release', 'bundle', 'deb'),
      extension: '.deb'
    });
  }
  for (const bundle of installerBundles) {
    if (!fs.existsSync(bundle.directory)) throw new Error(`The ${path.basename(bundle.directory)} bundle directory was not created: ${bundle.directory}`);
    const installers = fs.readdirSync(bundle.directory).filter((name) => name.endsWith(bundle.extension));
    if (!installers.length) throw new Error(`No ${bundle.extension} installer was created in ${bundle.directory}`);
    for (const originalName of installers) {
      let installer = originalName;
      if (!/-unsigned\.(?:dmg|exe|AppImage|deb)$/i.test(installer)) {
        const renamed = `${installer.slice(0, -bundle.extension.length)}-unsigned${bundle.extension}`;
        const sourcePath = path.join(bundle.directory, installer);
        const renamedPath = path.join(bundle.directory, renamed);
        if (fs.existsSync(renamedPath)) throw new Error(`Unsigned installer destination already exists: ${renamedPath}`);
        fs.renameSync(sourcePath, renamedPath);
        fs.rmSync(`${sourcePath}.sha256`, { force: true });
        installer = renamed;
      }
      fs.rmSync(path.join(bundle.directory, `${installer}.sha256`), { force: true });
      console.log(`Prepared installer: ${path.join(bundle.directory, installer)}`);
    }
  }
  const buildInfoPath = path.join('src-tauri', 'target', target, 'release', 'bundle', 'arc-build-info.json');
  const buildInfo = {
    schemaVersion: 1,
    version: rootPackage.version,
    channel: releaseChannel,
    updaterEndpoint: expectedUpdateEndpoint,
    target,
    platform: process.platform,
    architecture: target === 'universal-apple-darwin'
      ? 'universal'
      : target.startsWith('aarch64-')
        ? 'arm64'
        : target.startsWith('x86_64-')
          ? 'x64'
          : process.arch
  };
  fs.writeFileSync(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`);
  console.log(`Wrote build metadata: ${buildInfoPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

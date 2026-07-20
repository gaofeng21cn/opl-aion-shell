#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function usage() {
  process.stdout.write(`Usage:
  node scripts/release/opl-updater-vm-smoke.mjs \\
    --old-dmg ./One-Person-Lab-old.dmg \\
    --feed-dir ./candidate-feed \\
    --expected-current-version 26.7.20 \\
    --expected-display-version 26.7.20-r1 \\
    --expected-updater-version 26.7.2001 \\
    --artifacts ./artifacts
`);
}

export function parseUpdaterVmArgs(argv) {
  const options = {
    oldDmg: '',
    feedDir: '',
    expectedCurrentVersion: '',
    expectedDisplayVersion: '',
    expectedUpdaterVersion: '',
    artifacts: path.resolve('artifacts', 'opl-updater-vm'),
    installDir: '/Applications',
    timeoutMs: 15 * 60_000,
    bundleDigest: '',
    appSha: '',
    shellSha: '',
    frameworkSha: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--help') {
      usage();
      return null;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    index += 1;
    if (key === '--old-dmg') options.oldDmg = path.resolve(value);
    else if (key === '--feed-dir') options.feedDir = path.resolve(value);
    else if (key === '--expected-current-version') options.expectedCurrentVersion = value;
    else if (key === '--expected-display-version') options.expectedDisplayVersion = value;
    else if (key === '--expected-updater-version') options.expectedUpdaterVersion = value;
    else if (key === '--artifacts') options.artifacts = path.resolve(value);
    else if (key === '--install-dir') options.installDir = path.resolve(value);
    else if (key === '--timeout-ms') options.timeoutMs = Number(value);
    else if (key === '--bundle-digest') options.bundleDigest = value;
    else if (key === '--app-sha') options.appSha = value;
    else if (key === '--shell-sha') options.shellSha = value;
    else if (key === '--framework-sha') options.frameworkSha = value;
    else throw new Error(`Unsupported argument: ${key}`);
  }
  if (!options.oldDmg || !fs.existsSync(options.oldDmg)) throw new Error('--old-dmg must exist.');
  if (!options.feedDir || !fs.statSync(options.feedDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('--feed-dir must be a directory.');
  }
  for (const [label, value] of [
    ['--expected-current-version', options.expectedCurrentVersion],
    ['--expected-display-version', options.expectedDisplayVersion],
    ['--expected-updater-version', options.expectedUpdaterVersion],
  ]) {
    if (!VERSION_PATTERN.test(value)) throw new Error(`${label} must be a valid version.`);
  }
  if (options.expectedCurrentVersion === options.expectedUpdaterVersion) {
    throw new Error('Updater qualification requires a strictly newer machine version.');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 60_000) {
    throw new Error('--timeout-ms must be an integer of at least 60000.');
  }
  if (options.bundleDigest && !/^sha256:[0-9a-f]{64}$/.test(options.bundleDigest)) {
    throw new Error('--bundle-digest must be an exact sha256 identity.');
  }
  for (const [label, value] of [
    ['--app-sha', options.appSha],
    ['--shell-sha', options.shellSha],
    ['--framework-sha', options.frameworkSha],
  ]) {
    if (value && !/^[0-9a-f]{40}$/.test(value)) throw new Error(`${label} must be an exact Git SHA.`);
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    ...options.spawn,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status ?? result.signal}\n${result.stderr || result.stdout || ''}`
    );
  }
  return String(result.stdout || '').trim();
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  const file = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(file, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(file);
  }
  return hash.digest('hex');
}

function fileEvidence(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    size_bytes: stat.size,
    sha256: sha256File(filePath),
  };
}

function findAppBundle(root) {
  const entry = fs
    .readdirSync(root, { withFileTypes: true })
    .find((item) => item.isDirectory() && item.name.endsWith('.app'));
  return entry ? path.join(root, entry.name) : null;
}

function installOldDmg(dmgPath, installDir) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-old-dmg-'));
  try {
    run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint]);
    const mountedApp = findAppBundle(mountPoint);
    if (!mountedApp) throw new Error(`No .app bundle found in ${dmgPath}.`);
    fs.mkdirSync(installDir, { recursive: true });
    const installedApp = path.join(installDir, path.basename(mountedApp));
    fs.rmSync(installedApp, { recursive: true, force: true });
    run('ditto', [mountedApp, installedApp]);
    spawnSync('xattr', ['-dr', 'com.apple.quarantine', installedApp], { stdio: 'ignore' });
    return installedApp;
  } finally {
    spawnSync('hdiutil', ['detach', mountPoint], { stdio: 'ignore' });
    fs.rmSync(mountPoint, { recursive: true, force: true });
  }
}

function appVersion(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  return run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]);
}

function executablePath(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const executable = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist]);
  const resolved = path.join(appPath, 'Contents', 'MacOS', executable);
  if (!fs.existsSync(resolved)) throw new Error(`App executable is missing: ${resolved}`);
  return resolved;
}

export function parseHttpRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) throw new Error(`Unsupported HTTP Range header: ${value}`);
  let start;
  let end;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  } else {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) throw new Error(`Invalid HTTP suffix range: ${value}`);
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    throw new Error(`Unsatisfiable HTTP Range header: ${value}`);
  }
  return { start, end: Math.min(end, size - 1) };
}

function assertFeed(feedDir, displayVersion, updaterVersion) {
  const metadataPath = path.join(feedDir, 'latest-arm64-mac.yml');
  const zipName = `One-Person-Lab-${displayVersion}-mac-arm64.zip`;
  const zipPath = path.join(feedDir, zipName);
  const blockmapPath = `${zipPath}.blockmap`;
  for (const filePath of [metadataPath, zipPath, blockmapPath]) {
    if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Updater feed input is missing: ${filePath}`);
    }
  }
  const metadata = fs.readFileSync(metadataPath, 'utf8');
  const escapedUpdaterVersion = updaterVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`^version:\\s*["']?${escapedUpdaterVersion}["']?\\s*$`, 'm').test(metadata)) {
    throw new Error(`Updater metadata does not bind machine version ${updaterVersion}.`);
  }
  if (!metadata.includes(zipName)) throw new Error(`Updater metadata does not reference ${zipName}.`);
  return {
    metadata: fileEvidence(metadataPath),
    zip: fileEvidence(zipPath),
    blockmap: fileEvidence(blockmapPath),
  };
}

function contentType(filePath) {
  if (filePath.endsWith('.yml')) return 'text/yaml; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

async function startFeedServer(feedDir) {
  const root = fs.realpathSync(feedDir);
  const requests = [];
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '');
      const resolved = fs.realpathSync(path.join(root, pathname));
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('Path escapes feed root.');
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) throw new Error('Feed path is not a file.');
      const range = parseHttpRange(request.headers.range, stat.size);
      requests.push({ method: request.method, path: pathname, range: request.headers.range || null });
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Content-Type', contentType(resolved));
      response.setHeader('ETag', `"sha256-${sha256File(resolved)}"`);
      if (range) {
        response.statusCode = 206;
        response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
        response.setHeader('Content-Length', range.end - range.start + 1);
      } else {
        response.statusCode = 200;
        response.setHeader('Content-Length', stat.size);
      }
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(resolved, range || undefined).pipe(response);
    } catch (error) {
      response.statusCode = 404;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to resolve updater feed address.');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve inspector port.');
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForInspector(port, deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((entry) => entry.webSocketDebuggerUrl);
        if (target) return target.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Electron main-process inspector: ${String(lastError || 'no target')}`);
}

class InspectorClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }

  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new InspectorClient(socket);
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Inspector evaluation failed.'
      );
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

function launchApp(appPath, inspectorPort, artifacts, phase) {
  const stdoutPath = path.join(artifacts, `${phase}.stdout.log`);
  const stderrPath = path.join(artifacts, `${phase}.stderr.log`);
  const stdout = fs.openSync(stdoutPath, 'a');
  const stderr = fs.openSync(stderrPath, 'a');
  const child = spawn(executablePath(appPath), [`--inspect=127.0.0.1:${inspectorPort}`], {
    env: {
      ...process.env,
      CI: '1',
      GITHUB_ACTIONS: '',
      AIONUI_DISABLE_AUTO_UPDATE: '1',
    },
    stdio: ['ignore', stdout, stderr],
  });
  child.once('exit', () => {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  });
  return child;
}

async function connectToApp(appPath, artifacts, phase, deadline) {
  const port = await reservePort();
  const child = launchApp(appPath, port, artifacts, phase);
  try {
    const inspectorUrl = await waitForInspector(port, deadline);
    const client = await InspectorClient.open(inspectorUrl);
    await client.call('Runtime.enable');
    return { child, client, port };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

function updaterExpression(feedUrl, operation) {
  const setup = `
    const localRequire = typeof require === 'function'
      ? require
      : process.mainModule?.require?.bind(process.mainModule);
    if (!localRequire) throw new Error('Packaged main process exposes no module loader.');
    const { app } = localRequire('electron');
    const { autoUpdater } = localRequire('electron-updater');
    autoUpdater.setFeedURL({ provider: 'generic', url: ${JSON.stringify(feedUrl)} });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
  `;
  if (operation === 'check') {
    return `(async () => { ${setup}
      const result = await autoUpdater.checkForUpdates();
      return {
        current_version: app.getVersion(),
        is_update_available: Boolean(result?.isUpdateAvailable),
        target_version: result?.updateInfo?.version || null,
      };
    })()`;
  }
  if (operation === 'download') {
    return `(async () => { ${setup}
      const files = await autoUpdater.downloadUpdate();
      return { downloaded_files: Array.isArray(files) ? files : [] };
    })()`;
  }
  if (operation === 'install') {
    return `(() => { ${setup}
      autoUpdater.quitAndInstall(true, true);
      setTimeout(() => app.exit(0), 1000);
      return { install_started: true, current_version: app.getVersion() };
    })()`;
  }
  if (operation === 'quit') {
    return `(() => {
      const localRequire = typeof require === 'function'
        ? require
        : process.mainModule?.require?.bind(process.mainModule);
      const { app } = localRequire('electron');
      setTimeout(() => app.exit(0), 100);
      return true;
    })()`;
  }
  throw new Error(`Unknown updater inspector operation: ${operation}`);
}

async function waitForExit(child, deadline, label) {
  if (child.exitCode !== null) return child.exitCode;
  return await new Promise((resolve, reject) => {
    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${label} did not exit before the qualification deadline.`));
    }, remaining);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitForAppVersion(appPath, expected, deadline) {
  let observed = '';
  while (Date.now() < deadline) {
    try {
      observed = appVersion(appPath);
      if (observed === expected) return observed;
    } catch {
      observed = '';
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Installed app version did not become ${expected}; last observed ${observed || '<missing>'}.`);
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Updater VM smoke must run on macOS.');
  const options = parseUpdaterVmArgs(process.argv.slice(2));
  if (!options) return;
  fs.mkdirSync(options.artifacts, { recursive: true });
  const startedAt = new Date();
  const deadline = Date.now() + options.timeoutMs;
  const feedEvidence = assertFeed(options.feedDir, options.expectedDisplayVersion, options.expectedUpdaterVersion);
  const oldDmgEvidence = fileEvidence(options.oldDmg);
  const harnessEvidence = fileEvidence(SCRIPT_PATH);
  const feed = await startFeedServer(options.feedDir);
  let oldApp = null;
  let updatedApp = null;
  try {
    const installedApp = installOldDmg(options.oldDmg, options.installDir);
    const initialVersion = appVersion(installedApp);
    if (initialVersion !== options.expectedCurrentVersion) {
      throw new Error(`Old DMG installed ${initialVersion}; expected ${options.expectedCurrentVersion}.`);
    }
    run('codesign', ['--verify', '--deep', '--strict', installedApp]);

    oldApp = await connectToApp(installedApp, options.artifacts, 'old-app', deadline);
    const updateCheck = await oldApp.client.evaluate(updaterExpression(feed.url, 'check'));
    if (
      updateCheck.current_version !== options.expectedCurrentVersion ||
      updateCheck.target_version !== options.expectedUpdaterVersion ||
      updateCheck.is_update_available !== true
    ) {
      throw new Error(`Old app did not discover the exact candidate update: ${JSON.stringify(updateCheck)}`);
    }
    const download = await oldApp.client.evaluate(updaterExpression(feed.url, 'download'));
    if (!Array.isArray(download.downloaded_files) || download.downloaded_files.length === 0) {
      throw new Error('electron-updater did not return a downloaded candidate path.');
    }
    const install = await oldApp.client.evaluate(updaterExpression(feed.url, 'install'));
    if (install.install_started !== true) throw new Error('electron-updater did not start installation.');
    oldApp.client.close();
    await waitForExit(oldApp.child, deadline, 'Old app updater process');
    await waitForAppVersion(installedApp, options.expectedUpdaterVersion, deadline);
    run('codesign', ['--verify', '--deep', '--strict', installedApp]);

    updatedApp = await connectToApp(installedApp, options.artifacts, 'updated-app', deadline);
    const noUpdateCheck = await updatedApp.client.evaluate(updaterExpression(feed.url, 'check'));
    if (
      noUpdateCheck.current_version !== options.expectedUpdaterVersion ||
      noUpdateCheck.is_update_available !== false
    ) {
      throw new Error(`Updated app did not produce a no-update readback: ${JSON.stringify(noUpdateCheck)}`);
    }
    await updatedApp.client.evaluate(updaterExpression(feed.url, 'quit'));
    updatedApp.client.close();
    await waitForExit(updatedApp.child, deadline, 'Updated app readback process');

    const receipt = {
      schema: 'opl_updater_upgrade_qualification_receipt.v1',
      status: 'passed',
      latest_activation_allowed: true,
      bundle_digest: options.bundleDigest || null,
      cohort: {
        app_sha: options.appSha || null,
        shell_sha: options.shellSha || null,
        framework_sha: options.frameworkSha || null,
      },
      baseline: {
        display_version: options.expectedCurrentVersion,
        updater_version: options.expectedCurrentVersion,
        dmg: oldDmgEvidence,
      },
      candidate: {
        display_version: options.expectedDisplayVersion,
        updater_version: options.expectedUpdaterVersion,
        feed: feedEvidence,
      },
      qualification: {
        old_app_detected_update: true,
        same_candidate_zip_downloaded: true,
        install_and_restart_completed: true,
        installed_app_version: options.expectedUpdaterVersion,
        installed_app_signature_valid: true,
        second_check_no_update: true,
        allow_downgrade: false,
        feed_transport: 'loopback_generic_same_artifact',
        old_app_disk_bytes_modified_before_updater: false,
      },
      harness: harnessEvidence,
      feed_requests: feed.requests,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    };
    const receiptPath = path.join(options.artifacts, 'updater-upgrade-qualification-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    if (oldApp?.child.exitCode === null) oldApp.child.kill('SIGKILL');
    if (updatedApp?.child.exitCode === null) updatedApp.child.kill('SIGKILL');
    await feed.close();
  }
}

function isMainModule(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    return fs.realpathSync(fileURLToPath(moduleUrl)) === fs.realpathSync(argvPath);
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

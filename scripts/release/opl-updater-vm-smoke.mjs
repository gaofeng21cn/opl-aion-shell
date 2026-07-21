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
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

function comparePrereleaseIdentifiers(left, right) {
  const leftParts = left ? left.split('.') : [];
  const rightParts = right ? right.split('.') : [];
  if (leftParts.length === 0 || rightParts.length === 0) {
    if (leftParts.length === rightParts.length) return 0;
    return leftParts.length === 0 ? 1 : -1;
  }
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) {
      return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    }
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

export function compareMachineVersions(left, right) {
  const leftMatch = VERSION_PATTERN.exec(left);
  const rightMatch = VERSION_PATTERN.exec(right);
  if (!leftMatch || !rightMatch) throw new Error('Machine versions must be valid SemVer values.');
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) return difference;
  }
  return comparePrereleaseIdentifiers(leftMatch[4] || '', rightMatch[4] || '');
}

function usage() {
  process.stdout.write(`Usage:
  node scripts/release/opl-updater-vm-smoke.mjs \\
    --old-dmg ./One-Person-Lab-old.dmg \\
    --feed-dir ./candidate-feed \\
    --expected-current-display-version 26.7.20 \\
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
    expectedCurrentDisplayVersion: '',
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
    else if (key === '--expected-current-display-version') options.expectedCurrentDisplayVersion = value;
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
    ['--expected-current-display-version', options.expectedCurrentDisplayVersion],
    ['--expected-current-version', options.expectedCurrentVersion],
    ['--expected-display-version', options.expectedDisplayVersion],
    ['--expected-updater-version', options.expectedUpdaterVersion],
  ]) {
    if (!VERSION_PATTERN.test(value)) throw new Error(`${label} must be a valid version.`);
  }
  if (compareMachineVersions(options.expectedUpdaterVersion, options.expectedCurrentVersion) <= 0) {
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

function remainingDeadlineMs(deadline, label, maximumMs = Number.POSITIVE_INFINITY) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error(`${label} cannot start after the qualification deadline.`);
  return Math.max(1, Math.min(remaining, maximumMs));
}

export function run(command, args, options = {}) {
  const spawnOptions = { ...options.spawn };
  if (options.deadline !== undefined) {
    spawnOptions.timeout = remainingDeadlineMs(
      options.deadline,
      options.label || `${command} execution`,
      options.maximumMs ?? Number.POSITIVE_INFINITY
    );
  }
  if (spawnOptions.timeout !== undefined && spawnOptions.killSignal === undefined) {
    spawnOptions.killSignal = 'SIGKILL';
  }
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
  });
  if (result.status !== 0) {
    const failure = result.error ? `${result.error.name}: ${result.error.message}\n` : '';
    const label = options.label || `${command} execution`;
    const error = new Error(
      `${label}: ${command} ${args.join(' ')} exited ${result.status ?? result.signal}\n${failure}${result.stderr || result.stdout || ''}`
    );
    if (result.error?.code) error.code = result.error.code;
    throw error;
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

export function fileEvidence(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    size_bytes: stat.size,
    sha256: sha256File(filePath),
  };
}

function portableFileEvidence(evidence) {
  if (!evidence) return null;
  return {
    size_bytes: evidence.size_bytes,
    sha256: evidence.sha256,
  };
}

export function updaterQualificationInput(options, feedEvidence, oldDmgEvidence, harnessEvidence) {
  return {
    bundle_digest: options.bundleDigest || null,
    cohort: {
      app_sha: options.appSha || null,
      shell_sha: options.shellSha || null,
      framework_sha: options.frameworkSha || null,
    },
    baseline: {
      display_version: options.expectedCurrentDisplayVersion,
      updater_version: options.expectedCurrentVersion,
      dmg: portableFileEvidence(oldDmgEvidence),
    },
    candidate: {
      display_version: options.expectedDisplayVersion,
      updater_version: options.expectedUpdaterVersion,
      feed: feedEvidence
        ? {
            metadata: portableFileEvidence(feedEvidence.metadata),
            zip: portableFileEvidence(feedEvidence.zip),
            blockmap: portableFileEvidence(feedEvidence.blockmap),
          }
        : null,
    },
    harness: portableFileEvidence(harnessEvidence),
  };
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJsonValue(value[key])])
    );
  }
  return value;
}

export function updaterQualificationInputDigest(input) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalJsonValue(input)))
    .digest('hex')}`;
}

export function updaterFailureClassification(stage, error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (stage === 'install_candidate' && /updater process did not exit before the qualification deadline/.test(message)) {
    return 'native_updater_exit_not_observed';
  }
  if (stage === 'download_candidate' && /createServer.*is not a function/.test(message)) {
    return 'packaged_http_loader_drift';
  }
  if (code === 'ETIMEDOUT' || /deadline|timed out|ETIMEDOUT/i.test(message)) {
    return 'qualification_deadline_exceeded';
  }
  return 'qualification_stage_failure';
}

export function updaterFailureEvidence(stage, error) {
  return {
    stage,
    classification: updaterFailureClassification(stage, error),
    type: error instanceof Error ? error.constructor.name : typeof error,
    code: error && typeof error === 'object' && 'code' in error ? String(error.code) : null,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack || null : null,
  };
}

export function bindDownloadedZipEvidence(downloadedFiles, expectedZipEvidence) {
  if (!Array.isArray(downloadedFiles) || downloadedFiles.length === 0) {
    throw new Error('electron-updater did not return a downloaded candidate path.');
  }
  const zipFiles = downloadedFiles
    .filter((filePath) => typeof filePath === 'string' && /\.zip$/i.test(filePath))
    .map((filePath) => fileEvidence(filePath));
  if (zipFiles.length !== 1) {
    throw new Error(`electron-updater must return exactly one downloaded ZIP; observed ${zipFiles.length}.`);
  }
  const [zip] = zipFiles;
  if (zip.sha256 !== expectedZipEvidence.sha256 || zip.size_bytes !== expectedZipEvidence.size_bytes) {
    throw new Error(
      `Downloaded ZIP does not match the frozen feed ZIP: expected ${expectedZipEvidence.sha256}/${expectedZipEvidence.size_bytes}, observed ${zip.sha256}/${zip.size_bytes}.`
    );
  }
  return {
    reported_paths: [...downloadedFiles],
    zip,
  };
}

export function candidateZipQualification(expectedZipEvidence, downloadedZipEvidence) {
  return {
    expected_candidate_zip_sha256: expectedZipEvidence.sha256,
    downloaded_candidate_zip_sha256: downloadedZipEvidence.sha256,
    expected_candidate_zip_size_bytes: expectedZipEvidence.size_bytes,
    downloaded_candidate_zip_size_bytes: downloadedZipEvidence.size_bytes,
    same_candidate_zip_downloaded:
      expectedZipEvidence.sha256 === downloadedZipEvidence.sha256 &&
      expectedZipEvidence.size_bytes === downloadedZipEvidence.size_bytes,
  };
}

function findAppBundle(root) {
  const entry = fs
    .readdirSync(root, { withFileTypes: true })
    .find((item) => item.isDirectory() && item.name.endsWith('.app'));
  return entry ? path.join(root, entry.name) : null;
}

export function dmgDetachAttempts(mountPoint) {
  return [
    ['detach', mountPoint],
    ['detach', '-force', mountPoint],
  ];
}

function detachMountedDmg(mountPoint, deadline) {
  let lastError = null;
  for (const [index, args] of dmgDetachAttempts(mountPoint).entries()) {
    try {
      run('hdiutil', args, {
        deadline,
        maximumMs: 30_000,
        label: index === 0 ? 'Baseline DMG detach' : 'Baseline DMG forced detach',
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Unable to detach baseline DMG mount ${mountPoint}.`);
}

function installOldDmg(dmgPath, installDir, deadline) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-old-dmg-'));
  let primaryError = null;
  try {
    run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint], {
      deadline,
      label: 'Baseline DMG mount',
    });
    const mountedApp = findAppBundle(mountPoint);
    if (!mountedApp) throw new Error(`No .app bundle found in ${dmgPath}.`);
    fs.mkdirSync(installDir, { recursive: true });
    const installedApp = path.join(installDir, path.basename(mountedApp));
    fs.rmSync(installedApp, { recursive: true, force: true });
    run('ditto', [mountedApp, installedApp], { deadline, label: 'Baseline App copy' });
    run('xattr', ['-dr', 'com.apple.quarantine', installedApp], {
      deadline,
      label: 'Baseline App quarantine removal',
    });
    return installedApp;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      detachMountedDmg(mountPoint, deadline);
      fs.rmSync(mountPoint, { recursive: true, force: true });
    } catch (cleanupError) {
      if (!primaryError) throw cleanupError;
    }
  }
}

function appVersion(appPath, deadline) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  return run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist], {
    deadline,
    label: 'Installed App version readback',
  });
}

function executablePath(appPath, deadline) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const executable = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', plist], {
    deadline,
    label: 'Installed App executable readback',
  });
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

async function startFeedServer(feedDir, deadline) {
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
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(
      () => {
        server.close();
        finish(reject, new Error('Updater feed server did not start before the qualification deadline.'));
      },
      remainingDeadlineMs(deadline, 'Updater feed server start')
    );
    server.once('error', (error) => finish(reject, error));
    server.listen(0, '127.0.0.1', () => finish(resolve));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to resolve updater feed address.');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    requests,
    close: (closeDeadline) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback(value);
        };
        const timeout = setTimeout(
          () => {
            server.closeAllConnections?.();
            finish(reject, new Error('Updater feed server did not close before the qualification deadline.'));
          },
          remainingDeadlineMs(closeDeadline, 'Updater feed server close')
        );
        server.close((error) => (error ? finish(reject, error) : finish(resolve)));
      }),
    forceClose: () => {
      server.closeAllConnections?.();
      server.close();
    },
  };
}

async function reservePort(deadline) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };
    const timeout = setTimeout(
      () => {
        server.close();
        finish(reject, new Error('Inspector port reservation did not complete before the qualification deadline.'));
      },
      remainingDeadlineMs(deadline, 'Inspector port reservation')
    );
    server.once('error', (error) => finish(reject, error));
    server.listen(0, '127.0.0.1', () => finish(resolve));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve inspector port.');
  const port = address.port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function waitForInspector(port, deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeoutMs = remainingDeadlineMs(deadline, 'Electron inspector probe', 1_000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: controller.signal });
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((entry) => entry.webSocketDebuggerUrl);
        if (target) return target.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(1, deadline - Date.now()))));
  }
  throw new Error(`Timed out waiting for Electron main-process inspector: ${String(lastError || 'no target')}`);
}

export class InspectorClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    const rejectPending = (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      rejectPending(new Error('Inspector connection closed before the pending evaluation completed.'));
    });
    socket.addEventListener('error', () => {
      rejectPending(new Error('Inspector connection failed before the pending evaluation completed.'));
    });
  }

  static async open(url, deadline = null) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      let settled = false;
      const timeoutMs = deadline === null ? 0 : Math.max(1, deadline - Date.now());
      const timer = timeoutMs
        ? setTimeout(() => {
            socket.close();
            settle(reject, new Error('Inspector connection did not open before the qualification deadline.'));
          }, timeoutMs)
        : null;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        callback(value);
      };
      socket.addEventListener('open', () => settle(resolve), { once: true });
      socket.addEventListener('error', (error) => settle(reject, error), { once: true });
    });
    return new InspectorClient(socket);
  }

  call(method, params = {}, timeoutMs = 0, label = method) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      let timer = null;
      const settle = (callback, value) => {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        callback(value);
      };
      this.pending.set(id, {
        resolve: (value) => settle(resolve, value),
        reject: (error) => settle(reject, error),
      });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const pending = this.pending.get(id);
          if (pending) pending.reject(new Error(`${label} timed out after ${timeoutMs} ms.`));
        }, timeoutMs);
      }
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.get(id)?.reject(error);
      }
    });
  }

  async evaluate(expression, deadline = null, label = 'Inspector evaluation') {
    const timeoutMs = deadline === null ? 0 : Math.max(1, deadline - Date.now());
    const result = await this.call(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs,
      label
    );
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

function launchApp(appPath, inspectorPort, artifacts, phase, deadline) {
  const stdoutPath = path.join(artifacts, `${phase}.stdout.log`);
  const stderrPath = path.join(artifacts, `${phase}.stderr.log`);
  const stdout = fs.openSync(stdoutPath, 'a');
  const stderr = fs.openSync(stderrPath, 'a');
  const child = spawn(executablePath(appPath, deadline), [`--inspect=127.0.0.1:${inspectorPort}`], {
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
  const port = await reservePort(deadline);
  const child = launchApp(appPath, port, artifacts, phase, deadline);
  try {
    const inspectorUrl = await waitForInspector(port, deadline);
    const client = await InspectorClient.open(inspectorUrl, deadline);
    await client.call('Runtime.enable', {}, Math.max(1, deadline - Date.now()), `${phase} Runtime.enable`);
    const packageAnchor = path.join(appPath, 'Contents', 'Resources', 'app.asar', 'package.json');
    const runtimeCapabilities = await waitForUpdaterRuntime(client, packageAnchor, deadline);
    return { child, client, port, packageAnchor, runtimeCapabilities };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

export function updaterRuntimeCapabilityExpression(packageAnchor) {
  return `(() => {
    const hasGetBuiltinModule = typeof process.getBuiltinModule === 'function';
    const nodeModule = hasGetBuiltinModule ? process.getBuiltinModule('node:module') : null;
    const hasCreateRequire = typeof nodeModule?.createRequire === 'function';
    let app = null;
    let nodeHttp = null;
    let autoUpdater = null;
    let loadError = null;
    if (hasCreateRequire) {
      try {
        const packageLoader = nodeModule.createRequire(${JSON.stringify(packageAnchor)});
        ({ app } = packageLoader('electron'));
        nodeHttp = packageLoader('node:http');
        ({ autoUpdater } = packageLoader('electron-updater'));
      } catch (error) {
        loadError = error instanceof Error ? error.message : String(error);
      }
    }
    return {
      package_anchor: ${JSON.stringify(packageAnchor)},
      process_get_builtin_module: hasGetBuiltinModule,
      node_module_create_require: hasCreateRequire,
      app_is_ready: Boolean(app?.isReady?.()),
      node_http_create_server: typeof nodeHttp?.createServer === 'function',
      updater_check_for_updates: typeof autoUpdater?.checkForUpdates === 'function',
      updater_download_update: typeof autoUpdater?.downloadUpdate === 'function',
      updater_quit_and_install: typeof autoUpdater?.quitAndInstall === 'function',
      updater_native_event_listener: typeof autoUpdater?.nativeUpdater?.once === 'function',
      load_error: loadError,
    };
  })()`;
}

export function updaterLoaderProbeExpression(packageAnchor) {
  return `(() => {
    const nodeModule = process.getBuiltinModule('node:module');
    if (typeof nodeModule?.createRequire !== 'function') {
      throw new Error('node:module.createRequire is unavailable in the packaged main process.');
    }
    const packageLoader = nodeModule.createRequire(${JSON.stringify(packageAnchor)});
    const bareHttp = packageLoader('http');
    const nodeHttp = packageLoader('node:http');
    const macUpdaterEntry = Object.entries(packageLoader.cache || {}).find(([modulePath]) =>
      modulePath.endsWith('/electron-updater/out/MacUpdater.js')
    );
    let macUpdaterHttp = null;
    let macUpdaterRequireError = null;
    try {
      macUpdaterHttp = macUpdaterEntry?.[1]?.require?.('http') || null;
    } catch (error) {
      macUpdaterRequireError = error instanceof Error ? error.message : String(error);
    }
    const describeCreateServer = (httpModule) => {
      const descriptor = httpModule ? Object.getOwnPropertyDescriptor(httpModule, 'createServer') : null;
      return {
        module_type: typeof httpModule,
        create_server_type: typeof httpModule?.createServer,
        descriptor: descriptor
          ? {
              enumerable: Boolean(descriptor.enumerable),
              configurable: Boolean(descriptor.configurable),
              writable: 'writable' in descriptor ? Boolean(descriptor.writable) : null,
              getter_type: typeof descriptor.get,
              setter_type: typeof descriptor.set,
            }
          : null,
      };
    };
    return {
      package_anchor: ${JSON.stringify(packageAnchor)},
      bare_http: describeCreateServer(bareHttp),
      node_http: describeCreateServer(nodeHttp),
      mac_updater_http: describeCreateServer(macUpdaterHttp),
      identity: {
        bare_equals_node: bareHttp === nodeHttp,
        bare_equals_mac_updater: bareHttp === macUpdaterHttp,
        node_equals_mac_updater: nodeHttp === macUpdaterHttp,
      },
      mac_updater_cached: Boolean(macUpdaterEntry),
      mac_updater_require_error: macUpdaterRequireError,
      environment: {
        node_options_present: Boolean(process.env.NODE_OPTIONS),
        electron_run_as_node_present: Boolean(process.env.ELECTRON_RUN_AS_NODE),
        electron_run_as_node_enabled: process.env.ELECTRON_RUN_AS_NODE === '1',
      },
    };
  })()`;
}

export function updaterLoaderProbeIsHealthy(probe) {
  return Boolean(
    probe?.bare_http?.create_server_type === 'function' &&
    probe?.node_http?.create_server_type === 'function' &&
    probe?.mac_updater_http?.create_server_type === 'function' &&
    probe?.identity?.bare_equals_node === true &&
    probe?.identity?.bare_equals_mac_updater === true &&
    probe?.identity?.node_equals_mac_updater === true &&
    probe?.mac_updater_cached === true &&
    probe?.mac_updater_require_error === null
  );
}

export function installedReleaseIdentityExpression(packageAnchor, expectedDisplayVersion) {
  return `(() => {
    const nodeModule = process.getBuiltinModule('node:module');
    if (typeof nodeModule?.createRequire !== 'function') {
      throw new Error('node:module.createRequire is unavailable in the packaged main process.');
    }
    const packageLoader = nodeModule.createRequire(${JSON.stringify(packageAnchor)});
    const { app } = packageLoader('electron');
    const fs = packageLoader('node:fs');
    const path = packageLoader('node:path');
    const crypto = packageLoader('node:crypto');
    if (!app.isReady()) throw new Error('Electron app is not ready.');
    const asarRoot = path.dirname(${JSON.stringify(packageAnchor)});
    const rendererRoot = path.join(asarRoot, 'out', 'renderer');
    const pending = [rendererRoot];
    const matchingFiles = [];
    let scannedFileCount = 0;
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const resolved = path.join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(resolved);
          continue;
        }
        if (!entry.isFile() || !/\\.(?:html|js)$/i.test(entry.name)) continue;
        scannedFileCount += 1;
        const bytes = fs.readFileSync(resolved);
        if (!bytes.toString('utf8').includes(${JSON.stringify(expectedDisplayVersion)})) continue;
        matchingFiles.push({
          path: path.relative(asarRoot, resolved),
          size_bytes: bytes.length,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
    const displayVersion = matchingFiles.length > 0 ? ${JSON.stringify(expectedDisplayVersion)} : null;
    return {
      updater_version: app.getVersion(),
      display_version: displayVersion,
      release_tag: displayVersion ? \`v\${displayVersion}\` : null,
      evidence: {
        source: 'installed_app_renderer_bundle',
        renderer_root: rendererRoot,
        scanned_file_count: scannedFileCount,
        matching_files: matchingFiles,
        release_tag_derivation: 'v_prefix_of_embedded_display_version',
      },
    };
  })()`;
}

export function installedReleaseIdentityMatches(identity, expectedDisplayVersion, expectedUpdaterVersion) {
  return Boolean(
    identity?.display_version === expectedDisplayVersion &&
    identity?.release_tag === `v${expectedDisplayVersion}` &&
    identity?.updater_version === expectedUpdaterVersion &&
    Array.isArray(identity?.evidence?.matching_files) &&
    identity.evidence.matching_files.length > 0
  );
}

export function isUpdaterRuntimeReady(capabilities) {
  return Boolean(
    capabilities?.process_get_builtin_module &&
    capabilities?.node_module_create_require &&
    capabilities?.app_is_ready &&
    capabilities?.node_http_create_server &&
    capabilities?.updater_check_for_updates &&
    capabilities?.updater_download_update &&
    capabilities?.updater_quit_and_install &&
    capabilities?.updater_native_event_listener
  );
}

async function waitForUpdaterRuntime(client, packageAnchor, deadline) {
  let lastCapabilities = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      lastCapabilities = await client.evaluate(
        updaterRuntimeCapabilityExpression(packageAnchor),
        deadline,
        'Packaged updater runtime capability probe'
      );
      if (isUpdaterRuntimeReady(lastCapabilities)) return lastCapabilities;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for packaged updater runtime readiness: ${JSON.stringify({
      capabilities: lastCapabilities,
      error: lastError instanceof Error ? lastError.message : lastError ? String(lastError) : null,
    })}`
  );
}

async function readUpdaterLoaderProbe(client, packageAnchor, deadline, label, requireHealthy = true) {
  const probe = await client.evaluate(updaterLoaderProbeExpression(packageAnchor), deadline, label);
  if (requireHealthy && !updaterLoaderProbeIsHealthy(probe)) {
    throw new Error(`${label} detected a packaged http loader drift: ${JSON.stringify(probe)}`);
  }
  return probe;
}

function nativeUpdaterSetup(packageAnchor, feedUrl) {
  return `
    const nodeModule = process.getBuiltinModule('node:module');
    if (typeof nodeModule?.createRequire !== 'function') {
      throw new Error('node:module.createRequire is unavailable in the packaged main process.');
    }
    const packageLoader = nodeModule.createRequire(${JSON.stringify(packageAnchor)});
    const { app } = packageLoader('electron');
    const nodeHttp = packageLoader('node:http');
    const { autoUpdater } = packageLoader('electron-updater');
    if (!app.isReady()) throw new Error('Electron app is not ready.');
    if (typeof nodeHttp.createServer !== 'function') throw new Error('node:http.createServer is unavailable.');
    if (typeof autoUpdater.checkForUpdates !== 'function') throw new Error('autoUpdater.checkForUpdates is unavailable.');
    if (typeof autoUpdater.downloadUpdate !== 'function') throw new Error('autoUpdater.downloadUpdate is unavailable.');
    if (typeof autoUpdater.quitAndInstall !== 'function') throw new Error('autoUpdater.quitAndInstall is unavailable.');
    autoUpdater.setFeedURL({ provider: 'generic', url: ${JSON.stringify(feedUrl)} });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
  `;
}

export function armUpdaterInstallExit(autoUpdater, exitApp, deferExit = queueMicrotask) {
  const nativeAutoUpdater = autoUpdater?.nativeUpdater;
  if (typeof nativeAutoUpdater?.once !== 'function') {
    throw new Error('Electron native autoUpdater events are unavailable.');
  }
  const stateKey = Symbol.for('opl.updaterQualification.installExit.v1');
  if (nativeAutoUpdater[stateKey]) {
    throw new Error('Updater install-exit listener is already armed.');
  }
  const state = {
    native_updater: nativeAutoUpdater,
    native_event_observed: false,
    install_requested: false,
    exit_scheduled: false,
    request_install: null,
  };
  const scheduleExitIfReady = () => {
    if (!state.native_event_observed || !state.install_requested || state.exit_scheduled) return;
    state.exit_scheduled = true;
    deferExit(() => exitApp(0));
  };
  state.request_install = () => {
    if (state.install_requested) throw new Error('Updater installation was already requested.');
    const nativeEventObservedBeforeInstallRequest = state.native_event_observed;
    state.install_requested = true;
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      state.install_requested = false;
      throw error;
    }
    scheduleExitIfReady();
    return {
      native_event_observed_before_install_request: nativeEventObservedBeforeInstallRequest,
      install_requested: true,
      exit_scheduled: state.exit_scheduled,
    };
  };
  Object.defineProperty(nativeAutoUpdater, stateKey, {
    configurable: true,
    value: state,
  });
  nativeAutoUpdater.once('update-downloaded', () => {
    state.native_event_observed = true;
    scheduleExitIfReady();
  });
  return {
    native_event_source: 'electron-updater.MacUpdater.nativeUpdater',
    listener_bound_before_download: true,
    same_native_updater: state.native_updater === autoUpdater.nativeUpdater,
    exit_trigger: 'native_event_observed_then_post_quitAndInstall_microtask',
  };
}

export function requestUpdaterInstallExit(autoUpdater) {
  const nativeAutoUpdater = autoUpdater?.nativeUpdater;
  const state = nativeAutoUpdater?.[Symbol.for('opl.updaterQualification.installExit.v1')];
  if (
    state?.native_updater !== nativeAutoUpdater ||
    typeof state?.request_install !== 'function' ||
    state.install_requested
  ) {
    throw new Error('Updater install-exit listener was not armed on the active MacUpdater native updater.');
  }
  return state.request_install();
}

export function updaterExpression(packageAnchor, feedUrl, operation) {
  const setup = nativeUpdaterSetup(packageAnchor, feedUrl);
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
      const armUpdaterInstallExit = ${armUpdaterInstallExit.toString()};
      const installExitArm = armUpdaterInstallExit(autoUpdater, (code) => app.exit(code));
      const files = await autoUpdater.downloadUpdate();
      return {
        downloaded_files: Array.isArray(files) ? files : [],
        install_exit_arm: installExitArm,
      };
    })()`;
  }
  if (operation === 'install') {
    return `(() => { ${setup}
      const requestUpdaterInstallExit = ${requestUpdaterInstallExit.toString()};
      const nativeAutoUpdater = autoUpdater.nativeUpdater;
      const installExitState = nativeAutoUpdater?.[Symbol.for('opl.updaterQualification.installExit.v1')];
      if (
        installExitState?.native_updater !== nativeAutoUpdater ||
        typeof installExitState?.request_install !== 'function' ||
        installExitState.install_requested
      ) {
        throw new Error('Updater install-exit listener was not armed before the candidate download.');
      }
      setTimeout(() => {
        requestUpdaterInstallExit(autoUpdater);
      }, 250);
      return {
        install_scheduled: true,
        current_version: app.getVersion(),
        native_event_source: 'electron-updater.MacUpdater.nativeUpdater',
        listener_bound_before_download: true,
        same_native_updater: installExitState.native_updater === nativeAutoUpdater,
        native_event_observed_before_install_schedule: Boolean(installExitState.native_event_observed),
        exit_trigger: 'native_event_observed_then_post_quitAndInstall_microtask',
      };
    })()`;
  }
  if (operation === 'quit') {
    return `(() => { ${setup}
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
      observed = appVersion(appPath, deadline);
      if (observed === expected) return observed;
    } catch {
      observed = '';
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(500, Math.max(1, deadline - Date.now()))));
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
  const receiptPath = path.join(options.artifacts, 'updater-upgrade-qualification-receipt.json');
  let stage = 'collect_input_evidence';
  let feedEvidence = null;
  let oldDmgEvidence = null;
  let harnessEvidence = null;
  let input = null;
  let feed = null;
  let feedClosed = false;
  let oldApp = null;
  let updatedApp = null;
  const loaderProbes = {};
  try {
    oldDmgEvidence = fileEvidence(options.oldDmg);
    harnessEvidence = fileEvidence(SCRIPT_PATH);
    feedEvidence = assertFeed(options.feedDir, options.expectedDisplayVersion, options.expectedUpdaterVersion);
    input = updaterQualificationInput(options, feedEvidence, oldDmgEvidence, harnessEvidence);

    stage = 'start_frozen_feed';
    feed = await startFeedServer(options.feedDir, deadline);
    stage = 'install_baseline';
    const installedApp = installOldDmg(options.oldDmg, options.installDir, deadline);
    const initialVersion = appVersion(installedApp, deadline);
    if (initialVersion !== options.expectedCurrentVersion) {
      throw new Error(`Old DMG installed ${initialVersion}; expected ${options.expectedCurrentVersion}.`);
    }
    run('codesign', ['--verify', '--deep', '--strict', installedApp], {
      deadline,
      label: 'Baseline App signature verification',
    });

    stage = 'connect_baseline';
    oldApp = await connectToApp(installedApp, options.artifacts, 'old-app', deadline);
    const baselineIdentity = await oldApp.client.evaluate(
      installedReleaseIdentityExpression(oldApp.packageAnchor, options.expectedCurrentDisplayVersion),
      deadline,
      'Baseline installed release identity readback'
    );
    if (
      !installedReleaseIdentityMatches(
        baselineIdentity,
        options.expectedCurrentDisplayVersion,
        options.expectedCurrentVersion
      )
    ) {
      throw new Error(
        `Baseline app did not expose the exact installed release identity: ${JSON.stringify(baselineIdentity)}`
      );
    }

    loaderProbes.before_check = await readUpdaterLoaderProbe(
      oldApp.client,
      oldApp.packageAnchor,
      deadline,
      'Packaged loader probe before updater check'
    );
    stage = 'check_candidate';
    const updateCheck = await oldApp.client.evaluate(
      updaterExpression(oldApp.packageAnchor, feed.url, 'check'),
      deadline,
      'electron-updater candidate check'
    );
    if (
      updateCheck.current_version !== options.expectedCurrentVersion ||
      updateCheck.target_version !== options.expectedUpdaterVersion ||
      updateCheck.is_update_available !== true
    ) {
      throw new Error(`Old app did not discover the exact candidate update: ${JSON.stringify(updateCheck)}`);
    }
    loaderProbes.before_download = await readUpdaterLoaderProbe(
      oldApp.client,
      oldApp.packageAnchor,
      deadline,
      'Packaged loader probe before updater download'
    );
    stage = 'download_candidate';
    let download;
    try {
      download = await oldApp.client.evaluate(
        updaterExpression(oldApp.packageAnchor, feed.url, 'download'),
        deadline,
        'electron-updater candidate download'
      );
    } catch (error) {
      try {
        loaderProbes.after_download_failure = await readUpdaterLoaderProbe(
          oldApp.client,
          oldApp.packageAnchor,
          deadline,
          'Packaged loader probe after updater download failure',
          false
        );
      } catch (probeError) {
        loaderProbes.after_download_failure = {
          probe_error: updaterFailureEvidence('loader_probe_after_download_failure', probeError),
        };
      }
      throw error;
    }
    const downloadedZip = bindDownloadedZipEvidence(download.downloaded_files, feedEvidence.zip);
    const zipQualification = candidateZipQualification(feedEvidence.zip, downloadedZip.zip);
    if (!zipQualification.same_candidate_zip_downloaded) {
      throw new Error('Downloaded ZIP digest does not match the frozen candidate ZIP digest.');
    }
    stage = 'install_candidate';
    const install = await oldApp.client.evaluate(
      updaterExpression(oldApp.packageAnchor, feed.url, 'install'),
      deadline,
      'electron-updater install scheduling'
    );
    if (install.install_scheduled !== true) throw new Error('electron-updater did not schedule installation.');
    oldApp.client.close();
    const baselineExitCode = await waitForExit(oldApp.child, deadline, 'Old app updater process');
    if (baselineExitCode !== 0) throw new Error(`Old app updater process exited ${baselineExitCode}.`);
    await waitForAppVersion(installedApp, options.expectedUpdaterVersion, deadline);
    run('codesign', ['--verify', '--deep', '--strict', installedApp], {
      deadline,
      label: 'Installed candidate signature verification',
    });

    stage = 'verify_installed_candidate';
    updatedApp = await connectToApp(installedApp, options.artifacts, 'updated-app', deadline);
    const installedIdentity = await updatedApp.client.evaluate(
      installedReleaseIdentityExpression(updatedApp.packageAnchor, options.expectedDisplayVersion),
      deadline,
      'Candidate installed release identity readback'
    );
    if (
      !installedReleaseIdentityMatches(
        installedIdentity,
        options.expectedDisplayVersion,
        options.expectedUpdaterVersion
      )
    ) {
      throw new Error(
        `Updated app did not expose the exact installed release identity: ${JSON.stringify(installedIdentity)}`
      );
    }
    const noUpdateCheck = await updatedApp.client.evaluate(
      updaterExpression(updatedApp.packageAnchor, feed.url, 'check'),
      deadline,
      'Installed candidate no-update check'
    );
    if (
      noUpdateCheck.current_version !== options.expectedUpdaterVersion ||
      noUpdateCheck.is_update_available !== false
    ) {
      throw new Error(`Updated app did not produce a no-update readback: ${JSON.stringify(noUpdateCheck)}`);
    }
    await updatedApp.client.evaluate(
      updaterExpression(updatedApp.packageAnchor, feed.url, 'quit'),
      deadline,
      'Installed candidate clean exit'
    );
    updatedApp.client.close();
    const candidateExitCode = await waitForExit(updatedApp.child, deadline, 'Updated app readback process');
    if (candidateExitCode !== 0) throw new Error(`Updated app readback process exited ${candidateExitCode}.`);

    stage = 'close_frozen_feed';
    await feed.close(deadline);
    feedClosed = true;
    stage = 'write_passed_receipt';
    const receipt = {
      schema: 'opl_updater_upgrade_qualification_receipt.v1',
      status: 'passed',
      latest_activation_allowed: true,
      input,
      input_digest: updaterQualificationInputDigest(input),
      bundle_digest: options.bundleDigest || null,
      cohort: {
        app_sha: options.appSha || null,
        shell_sha: options.shellSha || null,
        framework_sha: options.frameworkSha || null,
      },
      baseline: {
        display_version: options.expectedCurrentDisplayVersion,
        updater_version: options.expectedCurrentVersion,
        dmg: oldDmgEvidence,
        installed_app_identity: baselineIdentity,
      },
      candidate: {
        display_version: options.expectedDisplayVersion,
        updater_version: options.expectedUpdaterVersion,
        feed: feedEvidence,
      },
      qualification: {
        old_app_detected_update: true,
        ...zipQualification,
        install_exit: {
          arm: download.install_exit_arm,
          schedule: install,
        },
        install_and_restart_completed: true,
        installed_app_version: options.expectedUpdaterVersion,
        installed_app_signature_valid: true,
        second_check_no_update: true,
        allow_downgrade: false,
        feed_transport: 'loopback_generic_same_artifact',
        old_app_disk_bytes_modified_before_updater: false,
        runtime_capabilities: {
          baseline: oldApp.runtimeCapabilities,
          installed: updatedApp.runtimeCapabilities,
        },
        loader_probes: loaderProbes,
        downloaded_candidate: downloadedZip,
        installed_app_identity: installedIdentity,
      },
      harness: harnessEvidence,
      feed_requests: feed.requests,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    };
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    input ||= updaterQualificationInput(options, feedEvidence, oldDmgEvidence, harnessEvidence);
    const failureReceipt = {
      schema: 'opl_updater_upgrade_qualification_receipt.v1',
      status: 'failed',
      latest_activation_allowed: false,
      input,
      input_digest: updaterQualificationInputDigest(input),
      bundle_digest: options.bundleDigest || null,
      cohort: input.cohort,
      failure: updaterFailureEvidence(stage, error),
      loader_probes: loaderProbes,
      feed_requests: feed?.requests || [],
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(receiptPath, `${JSON.stringify(failureReceipt, null, 2)}\n`);
    } catch (receiptError) {
      try {
        fs.writeFileSync(
          path.join(options.artifacts, 'updater-upgrade-qualification-receipt-write-error.txt'),
          `${updaterFailureEvidence('write_failed_receipt', receiptError).stack || String(receiptError)}\n`
        );
      } catch {
        // The primary qualification failure remains authoritative.
      }
    }
    throw error;
  } finally {
    if (oldApp?.child.exitCode === null) oldApp.child.kill('SIGKILL');
    if (updatedApp?.child.exitCode === null) updatedApp.child.kill('SIGKILL');
    if (feed && !feedClosed) feed.forceClose();
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

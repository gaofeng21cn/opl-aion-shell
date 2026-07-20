#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GUEST_SCRIPT = path.join(SCRIPT_DIR, 'opl-updater-vm-smoke.mjs');

function usage() {
  process.stdout.write(`Usage:
  node scripts/release/opl-updater-tart-smoke.mjs \\
    --source-vm macos-clean \\
    --old-dmg ./One-Person-Lab-old.dmg \\
    --feed-dir ./candidate-feed \\
    --expected-current-version 26.7.20 \\
    --expected-display-version 26.7.20-r1 \\
    --expected-updater-version 26.7.2001 \\
    --guest-node-root /path/to/node \\
    --artifacts ./artifacts
`);
}

export function parseUpdaterTartArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options = {
    sourceVm: process.env.OPL_FIRST_RUN_TART_SOURCE || '',
    oldDmg: '',
    feedDir: '',
    expectedCurrentVersion: '',
    expectedDisplayVersion: '',
    expectedUpdaterVersion: '',
    guestUser: process.env.OPL_FIRST_RUN_GUEST_USER || 'runner',
    sshKey: process.env.OPL_FIRST_RUN_GUEST_SSH_KEY || '',
    guestNodeRoot: '',
    guestWorkdir: '/tmp/opl-updater-smoke',
    vmName: `opl-updater-${stamp}`,
    artifacts: path.resolve('artifacts', `opl-updater-tart-${stamp}`),
    timeoutMs: 20 * 60_000,
    noGraphics: false,
    keepVm: false,
    dryRun: false,
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
    if (key === '--no-graphics') {
      options.noGraphics = true;
      continue;
    }
    if (key === '--keep-vm') {
      options.keepVm = true;
      continue;
    }
    if (key === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    index += 1;
    if (key === '--source-vm') options.sourceVm = value;
    else if (key === '--old-dmg') options.oldDmg = path.resolve(value);
    else if (key === '--feed-dir') options.feedDir = path.resolve(value);
    else if (key === '--expected-current-version') options.expectedCurrentVersion = value;
    else if (key === '--expected-display-version') options.expectedDisplayVersion = value;
    else if (key === '--expected-updater-version') options.expectedUpdaterVersion = value;
    else if (key === '--guest-user') options.guestUser = value;
    else if (key === '--ssh-key') options.sshKey = path.resolve(value);
    else if (key === '--guest-node-root') options.guestNodeRoot = path.resolve(value);
    else if (key === '--guest-workdir') options.guestWorkdir = value;
    else if (key === '--vm-name') options.vmName = value;
    else if (key === '--artifacts') options.artifacts = path.resolve(value);
    else if (key === '--timeout-ms') options.timeoutMs = Number(value);
    else if (key === '--bundle-digest') options.bundleDigest = value;
    else if (key === '--app-sha') options.appSha = value;
    else if (key === '--shell-sha') options.shellSha = value;
    else if (key === '--framework-sha') options.frameworkSha = value;
    else throw new Error(`Unsupported argument: ${key}`);
  }
  for (const [label, value] of [
    ['--source-vm', options.sourceVm],
    ['--old-dmg', options.oldDmg],
    ['--feed-dir', options.feedDir],
    ['--expected-current-version', options.expectedCurrentVersion],
    ['--expected-display-version', options.expectedDisplayVersion],
    ['--expected-updater-version', options.expectedUpdaterVersion],
    ['--guest-node-root', options.guestNodeRoot],
  ]) {
    if (!value) throw new Error(`${label} is required.`);
  }
  if (!options.dryRun) {
    if (!fs.statSync(options.oldDmg, { throwIfNoEntry: false })?.isFile()) throw new Error('--old-dmg must exist.');
    if (!fs.statSync(options.feedDir, { throwIfNoEntry: false })?.isDirectory())
      throw new Error('--feed-dir must exist.');
    if (!fs.statSync(path.join(options.guestNodeRoot, 'bin', 'node'), { throwIfNoEntry: false })?.isFile()) {
      throw new Error('--guest-node-root must contain bin/node.');
    }
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sshArgs(options, ip) {
  const args = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=10'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(`${options.guestUser}@${ip}`);
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    ...options.spawn,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status ?? result.signal}\n${result.stderr || result.stdout || ''}`
    );
  }
  return String(result.stdout || '').trim();
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = options.timeoutMs ? setTimeout(() => child.kill('SIGTERM'), options.timeoutMs) : null;
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} ${args.join(' ')} exited ${code ?? signal}\n${stderr || stdout}`));
    });
  });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIp(vmName, deadline) {
  while (Date.now() < deadline) {
    const result = spawnSync('tart', ['ip', vmName], { encoding: 'utf8' });
    const ip = result.status === 0 ? result.stdout.trim().split(/\s+/).find(Boolean) : '';
    if (ip) return ip;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for Tart IP for ${vmName}.`);
}

async function waitForSsh(options, ip, deadline) {
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await runAsync('ssh', [...sshArgs(options, ip), 'true'], { timeoutMs: 15_000 });
      return;
    } catch (error) {
      lastError = error;
      await sleep(1500);
    }
  }
  throw new Error(`Timed out waiting for SSH: ${String(lastError || 'unknown')}`);
}

async function copyNodeRuntime(options, ip) {
  const guestNodeRoot = `${options.guestWorkdir}/node`;
  await runAsync('ssh', [
    ...sshArgs(options, ip),
    `rm -rf ${shellQuote(guestNodeRoot)} && mkdir -p ${shellQuote(guestNodeRoot)}`,
  ]);
  await new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-C', options.guestNodeRoot, '-cf', '-', '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const ssh = spawn('ssh', [...sshArgs(options, ip), `tar -C ${shellQuote(guestNodeRoot)} -xf -`], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    tar.stdout.pipe(ssh.stdin);
    let stderr = '';
    tar.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    ssh.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    let tarCode = null;
    let sshCode = null;
    const done = () => {
      if (tarCode === null || sshCode === null) return;
      if (tarCode === 0 && sshCode === 0) resolve();
      else reject(new Error(`Node runtime copy failed: tar=${tarCode} ssh=${sshCode}\n${stderr}`));
    };
    tar.once('close', (code) => {
      tarCode = code;
      done();
    });
    ssh.once('close', (code) => {
      sshCode = code;
      done();
    });
  });
  return `${guestNodeRoot}/bin/node`;
}

function sha256File(filePath) {
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export function updaterTartDryRunPlan(options) {
  return {
    schema: 'opl_updater_tart_smoke_plan.v1',
    source_vm: options.sourceVm,
    vm_name: options.vmName,
    guest_user: options.guestUser,
    guest_workdir: options.guestWorkdir,
    old_dmg: options.oldDmg,
    feed_dir: options.feedDir,
    expected_current_version: options.expectedCurrentVersion,
    expected_display_version: options.expectedDisplayVersion,
    expected_updater_version: options.expectedUpdaterVersion,
    bundle_digest: options.bundleDigest || null,
    no_graphics: options.noGraphics,
    keep_vm: options.keepVm,
    timeout_ms: options.timeoutMs,
  };
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Updater Tart smoke must run on macOS.');
  const options = parseUpdaterTartArgs(process.argv.slice(2));
  if (!options) return;
  fs.mkdirSync(options.artifacts, { recursive: true });
  const plan = updaterTartDryRunPlan(options);
  fs.writeFileSync(path.join(options.artifacts, 'updater-tart-plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  if (!fs.existsSync(GUEST_SCRIPT)) throw new Error(`Guest updater harness is missing: ${GUEST_SCRIPT}`);
  run('tart', ['clone', options.sourceVm, options.vmName]);
  const vmLog = fs.openSync(path.join(options.artifacts, 'tart-run.log'), 'a');
  const tartArgs = ['run'];
  if (options.noGraphics) tartArgs.push('--no-graphics');
  tartArgs.push(options.vmName);
  const tart = spawn('tart', tartArgs, { stdio: ['ignore', vmLog, vmLog] });
  const deadline = Date.now() + options.timeoutMs;
  let ip = '';
  try {
    ip = await waitForIp(options.vmName, deadline);
    await waitForSsh(options, ip, deadline);
    await runAsync('ssh', [
      ...sshArgs(options, ip),
      `rm -rf ${shellQuote(options.guestWorkdir)} && mkdir -p ${shellQuote(options.guestWorkdir)} ${shellQuote(`${options.guestWorkdir}/feed`)}`,
    ]);
    const scpBase = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
    if (options.sshKey) scpBase.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
    await runAsync('scp', [
      ...scpBase,
      options.oldDmg,
      GUEST_SCRIPT,
      `${options.guestUser}@${ip}:${options.guestWorkdir}/`,
    ]);
    await runAsync('scp', [
      '-r',
      ...scpBase,
      `${options.feedDir}/.`,
      `${options.guestUser}@${ip}:${options.guestWorkdir}/feed/`,
    ]);
    const guestNode = await copyNodeRuntime(options, ip);
    const guestArtifacts = `${options.guestWorkdir}/artifacts`;
    const guestCommand = [
      `${shellQuote(guestNode)} ${shellQuote(`${options.guestWorkdir}/${path.basename(GUEST_SCRIPT)}`)}`,
      `--old-dmg ${shellQuote(`${options.guestWorkdir}/${path.basename(options.oldDmg)}`)}`,
      `--feed-dir ${shellQuote(`${options.guestWorkdir}/feed`)}`,
      `--expected-current-version ${shellQuote(options.expectedCurrentVersion)}`,
      `--expected-display-version ${shellQuote(options.expectedDisplayVersion)}`,
      `--expected-updater-version ${shellQuote(options.expectedUpdaterVersion)}`,
      `--artifacts ${shellQuote(guestArtifacts)}`,
      `--timeout-ms ${shellQuote(String(Math.max(60_000, deadline - Date.now())))}`,
      options.bundleDigest ? `--bundle-digest ${shellQuote(options.bundleDigest)}` : '',
      options.appSha ? `--app-sha ${shellQuote(options.appSha)}` : '',
      options.shellSha ? `--shell-sha ${shellQuote(options.shellSha)}` : '',
      options.frameworkSha ? `--framework-sha ${shellQuote(options.frameworkSha)}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const command = `set -euo pipefail\n${guestCommand}`;
    await runAsync('ssh', [...sshArgs(options, ip), command], { timeoutMs: Math.max(60_000, deadline - Date.now()) });
    await runAsync('scp', [
      '-r',
      ...scpBase,
      `${options.guestUser}@${ip}:${guestArtifacts}/.`,
      `${options.artifacts}/`,
    ]);
    const receiptPath = path.join(options.artifacts, 'updater-upgrade-qualification-receipt.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.status !== 'passed' || receipt.latest_activation_allowed !== true) {
      throw new Error('Updater VM receipt did not authorize Latest activation.');
    }
    const hostReceipt = {
      schema: 'opl_updater_tart_smoke_receipt.v1',
      status: 'passed',
      vm_name: options.vmName,
      source_vm: options.sourceVm,
      guest_ip: ip,
      guest_receipt_sha256: sha256File(receiptPath),
      bundle_digest: options.bundleDigest || null,
      completed_at: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(options.artifacts, 'updater-tart-receipt.json'),
      `${JSON.stringify(hostReceipt, null, 2)}\n`
    );
    process.stdout.write(`${JSON.stringify(hostReceipt, null, 2)}\n`);
  } finally {
    spawnSync('tart', ['stop', options.vmName], { stdio: 'ignore' });
    if (!options.keepVm) spawnSync('tart', ['delete', options.vmName], { stdio: 'ignore' });
    if (tart.exitCode === null) tart.kill('SIGTERM');
    fs.closeSync(vmLog);
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

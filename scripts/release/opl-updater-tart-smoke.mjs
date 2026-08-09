#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareMachineVersions,
  fileEvidence,
  installedReleaseIdentityMatches,
  isUpdaterRuntimeReady,
  updaterEvidenceScopeAllowsLatest,
  updaterLoaderProbeIsHealthy,
  updaterQualificationInput,
  updaterQualificationInputDigest,
} from './opl-updater-vm-smoke.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GUEST_SCRIPT = path.join(SCRIPT_DIR, 'opl-updater-vm-smoke.mjs');
const MINIMUM_GUEST_QUALIFICATION_MS = 60_000;
const GUEST_FAILURE_RECEIPT_GRACE_MS = 10_000;
const RELEASE_QUALIFICATION_SCOPE = 'release_qualification';
const NON_FINAL_SCOPE = 'non_final';

export function updaterTartGuestExecutionBudget(remainingMs) {
  if (!Number.isInteger(remainingMs) || remainingMs < MINIMUM_GUEST_QUALIFICATION_MS + GUEST_FAILURE_RECEIPT_GRACE_MS) {
    throw new Error(
      `Guest updater qualification needs at least ${MINIMUM_GUEST_QUALIFICATION_MS + GUEST_FAILURE_RECEIPT_GRACE_MS} ms to preserve a typed failure receipt.`
    );
  }
  return {
    guest_timeout_ms: remainingMs - GUEST_FAILURE_RECEIPT_GRACE_MS,
    failure_receipt_grace_ms: GUEST_FAILURE_RECEIPT_GRACE_MS,
  };
}

function usage() {
  process.stdout.write(`Usage:
  node scripts/release/opl-updater-tart-smoke.mjs \\
    --source-vm macos-clean \\
    --old-dmg ./One-Person-Lab-old.dmg \\
    --feed-dir ./candidate-feed \\
    --expected-current-display-version 26.7.20 \\
    --expected-current-version 26.7.20 \\
    --expected-display-version 26.7.20-r1 \\
    --expected-updater-version 26.7.2001 \\
    --guest-node-root /path/to/node \\
    --artifacts ./artifacts

  Add --non-final for historical or synthetic rehearsal evidence. Such receipts
  can never authorize Latest activation.
`);
}

export function parseUpdaterTartArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options = {
    sourceVm: process.env.OPL_FIRST_RUN_TART_SOURCE || '',
    oldDmg: '',
    feedDir: '',
    expectedCurrentDisplayVersion: '',
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
    evidenceScope: RELEASE_QUALIFICATION_SCOPE,
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
    if (key === '--non-final') {
      options.evidenceScope = NON_FINAL_SCOPE;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}`);
    index += 1;
    if (key === '--source-vm') options.sourceVm = value;
    else if (key === '--old-dmg') options.oldDmg = path.resolve(value);
    else if (key === '--feed-dir') options.feedDir = path.resolve(value);
    else if (key === '--expected-current-display-version') options.expectedCurrentDisplayVersion = value;
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
    ['--expected-current-display-version', options.expectedCurrentDisplayVersion],
    ['--expected-current-version', options.expectedCurrentVersion],
    ['--expected-display-version', options.expectedDisplayVersion],
    ['--expected-updater-version', options.expectedUpdaterVersion],
    ['--guest-node-root', options.guestNodeRoot],
  ]) {
    if (!value) throw new Error(`${label} is required.`);
  }
  if (compareMachineVersions(options.expectedUpdaterVersion, options.expectedCurrentVersion) <= 0) {
    throw new Error('--expected-updater-version must be strictly newer than --expected-current-version.');
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
  if (options.evidenceScope === RELEASE_QUALIFICATION_SCOPE) {
    for (const [label, value] of [
      ['--bundle-digest', options.bundleDigest],
      ['--app-sha', options.appSha],
      ['--shell-sha', options.shellSha],
      ['--framework-sha', options.frameworkSha],
    ]) {
      if (!value)
        throw new Error(`${label} is required for release qualification; use --non-final for rehearsal evidence.`);
    }
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
  const spawnOptions = { ...options.spawn };
  if (spawnOptions.timeout !== undefined && spawnOptions.killSignal === undefined) {
    spawnOptions.killSignal = 'SIGKILL';
  }
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    ...spawnOptions,
  });
  if (result.status !== 0) {
    const failure = result.error ? `${result.error.name}: ${result.error.message}\n` : '';
    const error = new Error(
      `${command} ${args.join(' ')} exited ${result.status ?? result.signal}\n${failure}${result.stderr || result.stdout || ''}`
    );
    if (result.error?.code) error.code = result.error.code;
    throw error;
  }
  return String(result.stdout || '').trim();
}

export function runAsync(command, args, options = {}) {
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
    let timedOut = false;
    let killTimer = null;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      callback(value);
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
        }, options.timeoutMs)
      : null;
    child.once('error', (error) => settle(reject, error));
    child.once('close', (code, signal) => {
      if (timedOut) {
        const error = new Error(
          `${command} ${args.join(' ')} timed out after ${options.timeoutMs} ms.\n${stderr || stdout}`
        );
        error.code = 'ETIMEDOUT';
        settle(reject, error);
      } else if (code === 0) {
        settle(resolve, stdout.trim());
      } else {
        settle(reject, new Error(`${command} ${args.join(' ')} exited ${code ?? signal}\n${stderr || stdout}`));
      }
    });
  });
}

function remainingDeadlineMs(deadline, label, minimumMs = 1) {
  const remaining = deadline - Date.now();
  if (remaining < minimumMs) throw new Error(`${label} has only ${Math.max(0, remaining)} ms remaining.`);
  return remaining;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIp(vmName, deadline) {
  while (Date.now() < deadline) {
    const result = spawnSync('tart', ['ip', vmName], {
      encoding: 'utf8',
      timeout: Math.min(10_000, remainingDeadlineMs(deadline, 'Tart IP probe')),
    });
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
      await runAsync('ssh', [...sshArgs(options, ip), 'true'], {
        timeoutMs: Math.min(15_000, remainingDeadlineMs(deadline, 'SSH readiness probe')),
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(1500);
    }
  }
  throw new Error(`Timed out waiting for SSH: ${String(lastError || 'unknown')}`);
}

async function copyNodeRuntime(options, ip, deadline) {
  const guestNodeRoot = `${options.guestWorkdir}/node`;
  await runAsync(
    'ssh',
    [...sshArgs(options, ip), `rm -rf ${shellQuote(guestNodeRoot)} && mkdir -p ${shellQuote(guestNodeRoot)}`],
    { timeoutMs: remainingDeadlineMs(deadline, 'Guest Node staging') }
  );
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
    let timedOut = false;
    let settled = false;
    let killTimer = null;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        tar.kill('SIGTERM');
        ssh.kill('SIGTERM');
        killTimer = setTimeout(() => {
          tar.kill('SIGKILL');
          ssh.kill('SIGKILL');
        }, 5_000);
      },
      remainingDeadlineMs(deadline, 'Guest Node copy')
    );
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      callback(value);
    };
    const fail = (error) => {
      tar.kill('SIGTERM');
      ssh.kill('SIGTERM');
      finish(reject, error);
    };
    const done = () => {
      if (tarCode === null || sshCode === null) return;
      if (timedOut)
        finish(reject, new Error(`Node runtime copy timed out before the qualification deadline.\n${stderr}`));
      else if (tarCode === 0 && sshCode === 0) finish(resolve);
      else finish(reject, new Error(`Node runtime copy failed: tar=${tarCode} ssh=${sshCode}\n${stderr}`));
    };
    tar.once('close', (code) => {
      tarCode = code;
      done();
    });
    ssh.once('close', (code) => {
      sshCode = code;
      done();
    });
    tar.once('error', fail);
    ssh.once('error', fail);
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

function optionalFileEvidence(filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) return null;
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

export function updaterTartHostQualificationInput(options) {
  const zipPath = path.join(options.feedDir, `One-Person-Lab-${options.expectedDisplayVersion}-mac-arm64.zip`);
  return updaterQualificationInput(
    options,
    {
      metadata: fileEvidence(path.join(options.feedDir, 'latest-mac.yml')),
      zip: fileEvidence(zipPath),
      blockmap: fileEvidence(`${zipPath}.blockmap`),
    },
    fileEvidence(options.oldDmg),
    fileEvidence(GUEST_SCRIPT)
  );
}

function readJsonFileIfPresent(filePath) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function portableEvidenceMatches(actual, expected) {
  return Boolean(
    actual &&
    expected &&
    Number.isInteger(actual.size_bytes) &&
    actual.size_bytes === expected.size_bytes &&
    /^[0-9a-f]{64}$/.test(actual.sha256 || '') &&
    actual.sha256 === expected.sha256
  );
}

function installedIdentityReceiptMatches(identity, expectedDisplayVersion, expectedUpdaterVersion) {
  return Boolean(
    installedReleaseIdentityMatches(identity, expectedDisplayVersion, expectedUpdaterVersion) &&
    identity?.evidence?.source === 'installed_app_renderer_bundle' &&
    Number.isInteger(identity?.evidence?.scanned_file_count) &&
    identity.evidence.scanned_file_count > 0 &&
    identity?.evidence?.release_tag_derivation === 'v_prefix_of_embedded_display_version' &&
    identity.evidence.matching_files.every(
      (entry) =>
        typeof entry?.path === 'string' &&
        entry.path.length > 0 &&
        Number.isInteger(entry?.size_bytes) &&
        entry.size_bytes > 0 &&
        /^[0-9a-f]{64}$/.test(entry?.sha256 || '')
    )
  );
}

function runtimeCapabilityReceiptIsReady(capabilities) {
  return isUpdaterRuntimeReady(capabilities) && capabilities?.load_error === null;
}

function loaderProbeReceiptIsHealthy(probe) {
  return Boolean(
    updaterLoaderProbeIsHealthy(probe) &&
    typeof probe?.package_anchor === 'string' &&
    probe.package_anchor.length > 0 &&
    typeof probe?.environment?.node_options_present === 'boolean' &&
    typeof probe?.environment?.electron_run_as_node_present === 'boolean' &&
    typeof probe?.environment?.electron_run_as_node_enabled === 'boolean'
  );
}

export function updaterTartGuestReceiptMatches(receipt, options, hostInput) {
  const receiptInputDigest = receipt?.input ? updaterQualificationInputDigest(receipt.input) : null;
  const hostInputDigest = hostInput ? updaterQualificationInputDigest(hostInput) : null;
  const qualification = receipt?.qualification;
  const evidenceScope = options.evidenceScope || RELEASE_QUALIFICATION_SCOPE;
  const latestActivationAllowed = updaterEvidenceScopeAllowsLatest(evidenceScope);
  const nativeEventSource = 'electron-updater.MacUpdater.nativeUpdater';
  const exitTrigger = 'native_event_observed_then_post_quitAndInstall_microtask';
  const candidateZipName = `One-Person-Lab-${options.expectedDisplayVersion}-mac-arm64.zip`;
  return Boolean(
    receipt?.schema === 'opl_updater_upgrade_qualification_receipt.v1' &&
    receipt?.status === 'passed' &&
    receipt?.evidence_scope === evidenceScope &&
    receipt?.latest_activation_allowed === latestActivationAllowed &&
    receipt?.release_mutation_performed === false &&
    receipt?.input?.evidence_scope === evidenceScope &&
    /^sha256:[0-9a-f]{64}$/.test(receipt?.input_digest || '') &&
    receipt?.input_digest === receiptInputDigest &&
    receipt?.input_digest === hostInputDigest &&
    receipt?.input?.candidate?.feed?.zip?.sha256 === hostInput?.candidate?.feed?.zip?.sha256 &&
    receipt?.input?.candidate?.feed?.zip?.size_bytes === hostInput?.candidate?.feed?.zip?.size_bytes &&
    receipt?.bundle_digest === (options.bundleDigest || null) &&
    receipt?.cohort?.app_sha === (options.appSha || null) &&
    receipt?.cohort?.shell_sha === (options.shellSha || null) &&
    receipt?.cohort?.framework_sha === (options.frameworkSha || null) &&
    receipt?.baseline?.display_version === options.expectedCurrentDisplayVersion &&
    receipt?.baseline?.updater_version === options.expectedCurrentVersion &&
    portableEvidenceMatches(receipt?.baseline?.dmg, hostInput?.baseline?.dmg) &&
    installedIdentityReceiptMatches(
      receipt?.baseline?.installed_app_identity,
      options.expectedCurrentDisplayVersion,
      options.expectedCurrentVersion
    ) &&
    receipt?.candidate?.display_version === options.expectedDisplayVersion &&
    receipt?.candidate?.updater_version === options.expectedUpdaterVersion &&
    portableEvidenceMatches(receipt?.candidate?.feed?.metadata, hostInput?.candidate?.feed?.metadata) &&
    portableEvidenceMatches(receipt?.candidate?.feed?.zip, hostInput?.candidate?.feed?.zip) &&
    portableEvidenceMatches(receipt?.candidate?.feed?.blockmap, hostInput?.candidate?.feed?.blockmap) &&
    portableEvidenceMatches(receipt?.harness, hostInput?.harness) &&
    qualification?.old_app_detected_update === true &&
    qualification?.same_candidate_zip_downloaded === true &&
    qualification?.install_and_restart_completed === true &&
    qualification?.installed_app_signature_valid === true &&
    qualification?.second_check_no_update === true &&
    qualification?.allow_downgrade === false &&
    qualification?.old_app_disk_bytes_modified_before_updater === false &&
    qualification?.feed_transport === 'loopback_generic_same_artifact' &&
    qualification?.installed_app_version === options.expectedUpdaterVersion &&
    /^[0-9a-f]{64}$/.test(qualification?.expected_candidate_zip_sha256 || '') &&
    qualification?.expected_candidate_zip_sha256 === hostInput?.candidate?.feed?.zip?.sha256 &&
    qualification?.expected_candidate_zip_sha256 === qualification?.downloaded_candidate_zip_sha256 &&
    Number.isInteger(qualification?.expected_candidate_zip_size_bytes) &&
    qualification?.expected_candidate_zip_size_bytes === hostInput?.candidate?.feed?.zip?.size_bytes &&
    qualification?.expected_candidate_zip_size_bytes === qualification?.downloaded_candidate_zip_size_bytes &&
    portableEvidenceMatches(qualification?.downloaded_candidate?.zip, hostInput?.candidate?.feed?.zip) &&
    Array.isArray(qualification?.downloaded_candidate?.reported_paths) &&
    qualification.downloaded_candidate.reported_paths.length === 1 &&
    typeof qualification.downloaded_candidate.reported_paths[0] === 'string' &&
    qualification.downloaded_candidate.reported_paths[0].endsWith('.zip') &&
    qualification?.install_exit?.arm?.native_event_source === nativeEventSource &&
    qualification?.install_exit?.arm?.listener_bound_before_download === true &&
    qualification?.install_exit?.arm?.same_native_updater === true &&
    qualification?.install_exit?.arm?.exit_trigger === exitTrigger &&
    qualification?.install_exit?.schedule?.install_scheduled === true &&
    qualification?.install_exit?.schedule?.current_version === options.expectedCurrentVersion &&
    qualification?.install_exit?.schedule?.native_event_source === nativeEventSource &&
    qualification?.install_exit?.schedule?.listener_bound_before_download === true &&
    qualification?.install_exit?.schedule?.same_native_updater === true &&
    typeof qualification?.install_exit?.schedule?.native_event_observed_before_install_schedule === 'boolean' &&
    qualification?.install_exit?.schedule?.exit_trigger === exitTrigger &&
    runtimeCapabilityReceiptIsReady(qualification?.runtime_capabilities?.baseline) &&
    runtimeCapabilityReceiptIsReady(qualification?.runtime_capabilities?.installed) &&
    loaderProbeReceiptIsHealthy(qualification?.loader_probes?.before_check) &&
    loaderProbeReceiptIsHealthy(qualification?.loader_probes?.before_download) &&
    installedIdentityReceiptMatches(
      qualification?.installed_app_identity,
      options.expectedDisplayVersion,
      options.expectedUpdaterVersion
    ) &&
    Array.isArray(receipt?.feed_requests) &&
    receipt.feed_requests.some((request) => request?.method === 'GET' && request?.path === 'latest-mac.yml') &&
    receipt.feed_requests.some((request) => request?.method === 'GET' && request?.path === candidateZipName)
  );
}

export function updaterTartFailureEvidence(kind, error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null;
  const message = error instanceof Error ? error.message : String(error);
  const timedOut = code === 'ETIMEDOUT' || /deadline|timed out|ETIMEDOUT/i.test(message);
  let classification = timedOut ? 'qualification_deadline_exceeded' : 'qualification_stage_failure';
  if (kind === 'artifact_recovery') {
    classification = timedOut ? 'artifact_recovery_timeout' : 'artifact_recovery_failure';
  } else if (kind === 'cleanup') {
    classification = 'vm_cleanup_failure';
  } else if (kind === 'guest_receipt_read') {
    classification = 'guest_receipt_read_failure';
  } else if (kind === 'receipt_write') {
    classification = 'receipt_write_failure';
  }
  return {
    classification,
    type: error instanceof Error ? error.constructor.name : typeof error,
    code,
    message,
    stack: error instanceof Error ? error.stack || null : null,
  };
}

export function cleanupUpdaterTartVm(runAction, keepVm) {
  const errors = [];
  try {
    runAction('stop');
  } catch (error) {
    errors.push(error);
  }
  if (!keepVm) {
    try {
      runAction('delete');
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 0) return null;
  if (errors.length === 1) return errors[0];
  return new AggregateError(errors, 'Tart VM stop and delete both failed.');
}

function writeUpdaterTartFailureReceipt({
  options,
  ip,
  planPath,
  hostInput,
  guestReceiptPath,
  primaryError,
  artifactPullError,
  cleanupError,
  terminalError,
}) {
  let guestReceipt = null;
  let guestReceiptReadError = null;
  try {
    guestReceipt = readJsonFileIfPresent(guestReceiptPath);
  } catch (error) {
    guestReceiptReadError = error;
  }
  const plan = readJsonFileIfPresent(planPath);
  const hostInputDigest = hostInput ? updaterQualificationInputDigest(hostInput) : null;
  const terminalFailureKind =
    terminalError === artifactPullError
      ? 'artifact_recovery'
      : terminalError === cleanupError
        ? 'cleanup'
        : 'qualification';
  const receipt = {
    schema: 'opl_updater_tart_smoke_receipt.v1',
    status: 'failed',
    evidence_scope: options.evidenceScope,
    latest_activation_allowed: false,
    release_mutation_performed: false,
    input: hostInput,
    input_digest: hostInputDigest || plan?.input_digest || `sha256:${sha256File(planPath)}`,
    plan: optionalFileEvidence(planPath),
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    guest_ip: ip || null,
    bundle_digest: options.bundleDigest || null,
    failure: updaterTartFailureEvidence(terminalFailureKind, terminalError),
    evidence: {
      primary_error: primaryError ? updaterTartFailureEvidence('qualification', primaryError) : null,
      artifact_pull_error: artifactPullError
        ? updaterTartFailureEvidence('artifact_recovery', artifactPullError)
        : null,
      cleanup_error: cleanupError ? updaterTartFailureEvidence('cleanup', cleanupError) : null,
      guest_receipt_read_error: guestReceiptReadError
        ? updaterTartFailureEvidence('guest_receipt_read', guestReceiptReadError)
        : null,
      guest_input_digest: guestReceipt?.input_digest || null,
      guest_receipt: optionalFileEvidence(guestReceiptPath),
      guest_stdout: optionalFileEvidence(path.join(options.artifacts, 'updater-vm-smoke.stdout.log')),
      guest_stderr: optionalFileEvidence(path.join(options.artifacts, 'updater-vm-smoke.stderr.log')),
    },
    completed_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(options.artifacts, 'updater-tart-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function updaterTartDryRunPlan(options, hostInput = null) {
  const guestHarness = optionalFileEvidence(GUEST_SCRIPT);
  return {
    schema: 'opl_updater_tart_smoke_plan.v1',
    source_vm: options.sourceVm,
    vm_name: options.vmName,
    guest_user: options.guestUser,
    guest_workdir: options.guestWorkdir,
    old_dmg: options.oldDmg,
    feed_dir: options.feedDir,
    expected_current_display_version: options.expectedCurrentDisplayVersion,
    expected_current_version: options.expectedCurrentVersion,
    expected_display_version: options.expectedDisplayVersion,
    expected_updater_version: options.expectedUpdaterVersion,
    evidence_scope: options.evidenceScope,
    latest_activation_allowed: false,
    release_mutation_performed: false,
    vm_created: false,
    bundle_digest: options.bundleDigest || null,
    app_sha: options.appSha || null,
    shell_sha: options.shellSha || null,
    framework_sha: options.frameworkSha || null,
    guest_harness: portableFileEvidence(guestHarness),
    input: hostInput,
    input_digest: hostInput ? updaterQualificationInputDigest(hostInput) : null,
    no_graphics: options.noGraphics,
    keep_vm: options.keepVm,
    timeout_ms: options.timeoutMs,
  };
}

export function updaterTartDryRunReceipt(options, plan, planPath) {
  return {
    schema: 'opl_updater_tart_smoke_receipt.v1',
    status: 'planned',
    evidence_scope: NON_FINAL_SCOPE,
    requested_evidence_scope: options.evidenceScope,
    latest_activation_allowed: false,
    release_mutation_performed: false,
    vm_created: false,
    input: plan.input,
    input_digest: plan.input_digest,
    plan: portableFileEvidence(optionalFileEvidence(planPath)),
    template_digest: `sha256:${sha256File(planPath)}`,
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    bundle_digest: options.bundleDigest || null,
  };
}

export function updaterTartArtifactPullPlan(options, ip, guestArtifacts) {
  return {
    enabled: Boolean(ip && guestArtifacts),
    source: ip && guestArtifacts ? `${options.guestUser}@${ip}:${guestArtifacts}/.` : null,
    destination: options.artifacts,
    guest_stdout: `${guestArtifacts}/updater-vm-smoke.stdout.log`,
    guest_stderr: `${guestArtifacts}/updater-vm-smoke.stderr.log`,
  };
}

export function updaterTartGuestCommand(guestCommand, guestArtifacts) {
  return [
    'set -euo pipefail',
    `mkdir -p ${shellQuote(guestArtifacts)}`,
    `${guestCommand} >${shellQuote(`${guestArtifacts}/updater-vm-smoke.stdout.log`)} 2>${shellQuote(`${guestArtifacts}/updater-vm-smoke.stderr.log`)}`,
  ].join('\n');
}

export async function attemptUpdaterTartArtifactPull(pullArtifacts) {
  try {
    await pullArtifacts();
    return { copied: true, error: null };
  } catch (error) {
    return { copied: false, error };
  }
}

export function selectUpdaterTartTerminalError(primaryError, artifactPullError, cleanupError = null) {
  return primaryError || artifactPullError || cleanupError || null;
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Updater Tart smoke must run on macOS.');
  const options = parseUpdaterTartArgs(process.argv.slice(2));
  if (!options) return;
  fs.mkdirSync(options.artifacts, { recursive: true });
  let hostInput = null;
  let hostInputError = null;
  try {
    hostInput = updaterTartHostQualificationInput(options);
  } catch (error) {
    hostInputError = error;
  }
  const plan = updaterTartDryRunPlan(options, hostInput);
  const planPath = path.join(options.artifacts, 'updater-tart-plan.json');
  const guestReceiptPath = path.join(options.artifacts, 'updater-upgrade-qualification-receipt.json');
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  if (options.dryRun) {
    const dryRunReceipt = updaterTartDryRunReceipt(options, plan, planPath);
    fs.writeFileSync(
      path.join(options.artifacts, 'updater-tart-receipt.json'),
      `${JSON.stringify(dryRunReceipt, null, 2)}\n`
    );
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const deadline = Date.now() + options.timeoutMs;
  let ip = '';
  const guestArtifacts = `${options.guestWorkdir}/artifacts`;
  let primaryError = null;
  let artifactPullError = null;
  let cleanupError = null;
  let vmCreated = false;
  let vmLog = null;
  let tart = null;
  const scpBase = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  if (options.sshKey) scpBase.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  try {
    if (hostInputError) throw hostInputError;
    if (!fs.existsSync(GUEST_SCRIPT)) throw new Error(`Guest updater harness is missing: ${GUEST_SCRIPT}`);
    run('tart', ['clone', options.sourceVm, options.vmName], {
      spawn: { timeout: remainingDeadlineMs(deadline, 'Tart VM clone') },
    });
    vmCreated = true;
    vmLog = fs.openSync(path.join(options.artifacts, 'tart-run.log'), 'a');
    const tartArgs = ['run'];
    if (options.noGraphics) tartArgs.push('--no-graphics');
    tartArgs.push(options.vmName);
    tart = spawn('tart', tartArgs, { stdio: ['ignore', vmLog, vmLog] });
    ip = await waitForIp(options.vmName, deadline);
    await waitForSsh(options, ip, deadline);
    await runAsync(
      'ssh',
      [
        ...sshArgs(options, ip),
        `rm -rf ${shellQuote(options.guestWorkdir)} && mkdir -p ${shellQuote(options.guestWorkdir)} ${shellQuote(`${options.guestWorkdir}/feed`)}`,
      ],
      { timeoutMs: remainingDeadlineMs(deadline, 'Guest worktree staging') }
    );
    await runAsync(
      'scp',
      [...scpBase, options.oldDmg, GUEST_SCRIPT, `${options.guestUser}@${ip}:${options.guestWorkdir}/`],
      { timeoutMs: remainingDeadlineMs(deadline, 'Updater harness input copy') }
    );
    await runAsync(
      'scp',
      ['-r', ...scpBase, `${options.feedDir}/.`, `${options.guestUser}@${ip}:${options.guestWorkdir}/feed/`],
      { timeoutMs: remainingDeadlineMs(deadline, 'Frozen feed copy') }
    );
    const guestNode = await copyNodeRuntime(options, ip, deadline);
    const guestBudget = updaterTartGuestExecutionBudget(
      remainingDeadlineMs(
        deadline,
        'Guest updater qualification',
        MINIMUM_GUEST_QUALIFICATION_MS + GUEST_FAILURE_RECEIPT_GRACE_MS
      )
    );
    const guestTimeoutMs = guestBudget.guest_timeout_ms;
    const guestCommand = [
      `${shellQuote(guestNode)} ${shellQuote(`${options.guestWorkdir}/${path.basename(GUEST_SCRIPT)}`)}`,
      `--old-dmg ${shellQuote(`${options.guestWorkdir}/${path.basename(options.oldDmg)}`)}`,
      `--feed-dir ${shellQuote(`${options.guestWorkdir}/feed`)}`,
      `--expected-current-display-version ${shellQuote(options.expectedCurrentDisplayVersion)}`,
      `--expected-current-version ${shellQuote(options.expectedCurrentVersion)}`,
      `--expected-display-version ${shellQuote(options.expectedDisplayVersion)}`,
      `--expected-updater-version ${shellQuote(options.expectedUpdaterVersion)}`,
      `--artifacts ${shellQuote(guestArtifacts)}`,
      `--timeout-ms ${shellQuote(String(guestTimeoutMs))}`,
      options.bundleDigest ? `--bundle-digest ${shellQuote(options.bundleDigest)}` : '',
      options.appSha ? `--app-sha ${shellQuote(options.appSha)}` : '',
      options.shellSha ? `--shell-sha ${shellQuote(options.shellSha)}` : '',
      options.frameworkSha ? `--framework-sha ${shellQuote(options.frameworkSha)}` : '',
      options.evidenceScope === NON_FINAL_SCOPE ? '--non-final' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const command = updaterTartGuestCommand(guestCommand, guestArtifacts);
    await runAsync('ssh', [...sshArgs(options, ip), command], {
      timeoutMs: remainingDeadlineMs(deadline, 'Guest updater qualification execution'),
    });
  } catch (error) {
    primaryError = error;
  } finally {
    const pullPlan = updaterTartArtifactPullPlan(options, ip, guestArtifacts);
    if (pullPlan.enabled) {
      const artifactPull = await attemptUpdaterTartArtifactPull(() =>
        runAsync('scp', ['-r', ...scpBase, pullPlan.source, `${pullPlan.destination}/`], {
          timeoutMs: Math.min(30_000, Math.max(5_000, deadline - Date.now())),
        })
      );
      artifactPullError = artifactPull.error;
      if (artifactPullError) {
        try {
          fs.writeFileSync(
            path.join(options.artifacts, 'updater-tart-artifact-pull-error.txt'),
            `${JSON.stringify(updaterTartFailureEvidence('artifact_recovery', artifactPullError), null, 2)}\n`
          );
        } catch {
          // Diagnostic persistence must not replace the qualification failure.
        }
      }
    }
    if (vmCreated) {
      cleanupError = cleanupUpdaterTartVm(
        (action) => run('tart', [action, options.vmName], { spawn: { timeout: 30_000 } }),
        options.keepVm
      );
    }
    if (tart?.exitCode === null) tart.kill('SIGTERM');
    if (vmLog !== null) fs.closeSync(vmLog);
  }

  let terminalError = selectUpdaterTartTerminalError(primaryError, artifactPullError, cleanupError);
  let receipt = null;
  if (!terminalError) {
    try {
      receipt = JSON.parse(fs.readFileSync(guestReceiptPath, 'utf8'));
      if (!updaterTartGuestReceiptMatches(receipt, options, hostInput)) {
        throw new Error(
          'Updater VM receipt does not bind the exact requested Bundle, cohort, versions, and installed identity.'
        );
      }
    } catch (error) {
      terminalError = error;
    }
  }
  if (terminalError) {
    try {
      writeUpdaterTartFailureReceipt({
        options,
        ip,
        planPath,
        hostInput,
        guestReceiptPath,
        primaryError,
        artifactPullError,
        cleanupError,
        terminalError,
      });
    } catch (receiptError) {
      try {
        fs.writeFileSync(
          path.join(options.artifacts, 'updater-tart-receipt-write-error.txt'),
          `${JSON.stringify(updaterTartFailureEvidence('receipt_write', receiptError), null, 2)}\n`
        );
      } catch {
        // The original qualification failure remains authoritative.
      }
    }
    throw terminalError;
  }

  const hostReceipt = {
    schema: 'opl_updater_tart_smoke_receipt.v1',
    status: 'passed',
    evidence_scope: options.evidenceScope,
    latest_activation_allowed: updaterEvidenceScopeAllowsLatest(options.evidenceScope),
    release_mutation_performed: false,
    input: hostInput,
    input_digest: receipt.input_digest,
    plan: optionalFileEvidence(planPath),
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    guest_ip: ip,
    guest_receipt_sha256: sha256File(guestReceiptPath),
    bundle_digest: options.bundleDigest || null,
    completed_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(options.artifacts, 'updater-tart-receipt.json'),
    `${JSON.stringify(hostReceipt, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(hostReceipt, null, 2)}\n`);
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

#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_GUEST_USER = process.env.OPL_FIRST_RUN_GUEST_USER || 'runner';
const DEFAULT_GUEST_NODE_VERSION = process.env.OPL_FIRST_RUN_GUEST_NODE_VERSION || '22.21.1';
const SCRIPT_DIR = path.dirname(fs.realpathSync(new URL(import.meta.url)));
const GUEST_SMOKE_SCRIPT_PATH = path.join(SCRIPT_DIR, 'opl-first-run-vm-smoke.mjs');
const SIGNAL_EXIT_CODES = new Map([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]);
const SMOKE_PROFILES = new Map([
  [
    'full-gate',
    {
      runtimeProfile: 'full',
      settingsSmoke: false,
    },
  ],
  [
    'no-clt-clean-vm',
    {
      runtimeProfile: 'standard',
      settingsSmoke: true,
      display: '1920x1080px',
      guestNodeCommand: 'node',
    },
  ],
]);

const runtimeState = {
  options: null,
  stage: 'starting',
  vmLogPath: '',
  tartProcess: null,
  currentChild: null,
  codexApiKeyFile: null,
  ip: '',
  guestArtifactDir: '',
  copiedArtifacts: false,
  cleanupStarted: false,
};

function usage() {
  process.stdout.write(`Usage:
  node scripts/opl-first-run-tart-smoke.mjs --source-vm macos-clean --dmg ./release/One-Person-Lab.dmg

Options:
  --source-vm <name>       Tart clean snapshot/base VM. Defaults to OPL_FIRST_RUN_TART_SOURCE.
  --dmg <path>             Release DMG on the host.
  --guest-user <name>      SSH user in the guest. Default: ${DEFAULT_GUEST_USER}.
  --ssh-key <path>         SSH private key. Defaults to OPL_FIRST_RUN_GUEST_SSH_KEY.
  --vm-name <name>         Temporary VM name. Default: opl-first-run-<timestamp>.
  --artifacts <path>       Host artifact output directory. Default: ./artifacts/opl-first-run-tart-<timestamp>.
  --guest-workdir <path>   Guest working directory. Default: /tmp/opl-first-run-smoke.
  --process-name <name>    macOS process name. Default: One Person Lab.
  --timeout-ms <n>         VM boot and SSH timeout. Default: 600000.
  --smoke-timeout-ms <n>   Guest GUI smoke timeout. Default: 180000.
  --display <resolution>   Tart display resolution, for example 1920x1080px. Default: 1920x1080px.
  --smoke-profile <name>   Host-side smoke profile: full-gate or no-clt-clean-vm. Default: full-gate.
  --settings-smoke         After first launch, run packaged Settings page smoke checks in the guest.
  --cdp-port <n>           CDP port used by --settings-smoke. Default: 9230.
  --runtime-profile <profile>
                           First-run package profile to verify: full or standard. Default: full.
                           Use standard for the public macOS app DMG when Full-only bundled
                           module/skill equivalence is not expected.
  --codex-api-key-file <path>
                           Optional host file containing the test Codex API key.
                           If omitted, an ephemeral non-secret smoke key is generated.
  --guest-node-root <path> Copy a host Node.js runtime directory into the guest workdir and use it for the smoke.
  --guest-node-command <cmd>
                           Existing Node.js command in the guest. Skips Node download/probe install.
  --dry-run                Resolve arguments and write a host plan without cloning or starting Tart.
  --no-graphics            Start Tart with --no-graphics. Use only for images with a logged-in GUI session.
  --keep-vm                Leave the temporary VM running for debugging.
  --help                   Show this message.
`);
}

function parseArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options = {
    sourceVm: process.env.OPL_FIRST_RUN_TART_SOURCE || '',
    dmg: '',
    guestUser: DEFAULT_GUEST_USER,
    sshKey: process.env.OPL_FIRST_RUN_GUEST_SSH_KEY || '',
    vmName: `opl-first-run-${stamp}`,
    artifacts: path.resolve('artifacts', `opl-first-run-tart-${stamp}`),
    guestWorkdir: '/tmp/opl-first-run-smoke',
    processName: 'One Person Lab',
    timeoutMs: 600_000,
    smokeTimeoutMs: 180_000,
    display: '1920x1080px',
    smokeProfile: 'full-gate',
    settingsSmoke: false,
    cdpPort: 9230,
    runtimeProfile: 'full',
    codexApiKeyFile: process.env.OPL_FIRST_RUN_CODEX_API_KEY_FILE || '',
    guestNodeRoot: '',
    guestNodeCommand: '',
    dryRun: false,
    noGraphics: false,
    keepVm: false,
  };
  const explicit = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--no-graphics') {
      options.noGraphics = true;
      explicit.add('noGraphics');
      continue;
    }
    if (arg === '--keep-vm') {
      options.keepVm = true;
      explicit.add('keepVm');
      continue;
    }
    if (arg === '--settings-smoke') {
      options.settingsSmoke = true;
      explicit.add('settingsSmoke');
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      explicit.add('dryRun');
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--source-vm') {
      options.sourceVm = value;
      explicit.add('sourceVm');
    } else if (arg === '--dmg') {
      options.dmg = path.resolve(value);
      explicit.add('dmg');
    } else if (arg === '--guest-user') {
      options.guestUser = value;
      explicit.add('guestUser');
    } else if (arg === '--ssh-key') {
      options.sshKey = path.resolve(value);
      explicit.add('sshKey');
    } else if (arg === '--vm-name') {
      options.vmName = value;
      explicit.add('vmName');
    } else if (arg === '--artifacts') {
      options.artifacts = path.resolve(value);
      explicit.add('artifacts');
    } else if (arg === '--guest-workdir') {
      options.guestWorkdir = value;
      explicit.add('guestWorkdir');
    } else if (arg === '--process-name') {
      options.processName = value;
      explicit.add('processName');
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(value);
      explicit.add('timeoutMs');
    } else if (arg === '--smoke-timeout-ms') {
      options.smokeTimeoutMs = Number(value);
      explicit.add('smokeTimeoutMs');
    } else if (arg === '--display') {
      options.display = value;
      explicit.add('display');
    } else if (arg === '--smoke-profile') {
      options.smokeProfile = value;
      explicit.add('smokeProfile');
    } else if (arg === '--cdp-port') {
      options.cdpPort = Number(value);
      explicit.add('cdpPort');
    } else if (arg === '--runtime-profile') {
      options.runtimeProfile = value;
      explicit.add('runtimeProfile');
    } else if (arg === '--codex-api-key-file') {
      options.codexApiKeyFile = path.resolve(value);
      explicit.add('codexApiKeyFile');
    } else if (arg === '--guest-node-root') {
      options.guestNodeRoot = path.resolve(value);
      explicit.add('guestNodeRoot');
    } else if (arg === '--guest-node-command') {
      options.guestNodeCommand = value;
      explicit.add('guestNodeCommand');
    } else throw new Error(`Unsupported argument: ${arg}`);
  }

  const profile = SMOKE_PROFILES.get(options.smokeProfile);
  if (!profile) throw new Error(`--smoke-profile must be one of: ${Array.from(SMOKE_PROFILES.keys()).join(', ')}.`);
  for (const [key, value] of Object.entries(profile)) {
    if (!explicit.has(key)) options[key] = value;
  }
  if (!options.sourceVm) throw new Error('--source-vm or OPL_FIRST_RUN_TART_SOURCE is required.');
  if (!options.dmg) throw new Error('--dmg is required.');
  if (!options.dryRun && !fs.existsSync(options.dmg)) throw new Error(`DMG does not exist: ${options.dmg}`);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (!Number.isFinite(options.smokeTimeoutMs) || options.smokeTimeoutMs <= 0) {
    throw new Error('--smoke-timeout-ms must be positive.');
  }
  if (!/^\d+x\d+(?:pt|px)?$/.test(options.display)) {
    throw new Error('--display must be a Tart display resolution like 1920x1080px.');
  }
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1024 || options.cdpPort > 65535) {
    throw new Error('--cdp-port must be an integer TCP port between 1024 and 65535.');
  }
  if (options.guestNodeRoot) {
    const nodeBin = path.join(options.guestNodeRoot, 'bin', 'node');
    if (!fs.existsSync(nodeBin)) {
      throw new Error(`--guest-node-root must contain bin/node: ${options.guestNodeRoot}`);
    }
  }
  if (!['full', 'standard'].includes(options.runtimeProfile)) {
    throw new Error('--runtime-profile must be one of: full, standard.');
  }

  return options;
}

function buildDryRunPlan(options) {
  return {
    surface_id: 'opl_tart_gui_first_run_smoke_plan',
    status: 'dry_run',
    smoke_profile: options.smokeProfile,
    source_vm: options.sourceVm,
    vm_name: options.vmName,
    dmg: options.dmg,
    artifacts: options.artifacts,
    guest_workdir: options.guestWorkdir,
    display: options.display,
    settings_smoke: options.settingsSmoke,
    cdp_port: options.settingsSmoke ? options.cdpPort : null,
    runtime_profile: options.runtimeProfile,
    guest_node_root: options.guestNodeRoot || null,
    guest_node_command: options.guestNodeCommand || null,
    no_graphics: options.noGraphics,
    keep_vm: options.keepVm,
  };
}

function prepareHostCodexApiKeyFile(options) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-codex-key-'));
  const keyPath = path.join(tempDir, 'codex-api-key.txt');
  if (options.codexApiKeyFile) {
    if (!fs.existsSync(options.codexApiKeyFile)) {
      throw new Error(`Codex API key file does not exist: ${options.codexApiKeyFile}`);
    }
    const key = fs.readFileSync(options.codexApiKeyFile, 'utf8').trim();
    if (!key) {
      throw new Error(`Codex API key file is empty: ${options.codexApiKeyFile}`);
    }
    fs.writeFileSync(keyPath, `${key}\n`, 'utf8');
    return { path: keyPath, temporary: true, tempDir };
  }

  fs.writeFileSync(keyPath, `opl-first-run-smoke-${randomUUID()}\n`, 'utf8');
  return { path: keyPath, temporary: true, tempDir };
}

function appendRuntimeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(`[tart-smoke] ${message}\n`);
  const options = runtimeState.options;
  if (!options) return;
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    fs.appendFileSync(
      path.join(options.artifacts, 'tart-smoke-events.jsonl'),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event_type: 'host_runtime_event',
        stage: runtimeState.stage,
        message,
        vm_name: options.vmName,
        source_vm: options.sourceVm,
        guest_ip: runtimeState.ip || null,
      })}\n`,
      'utf8'
    );
  } catch (_) {
    // Best-effort diagnostics must not mask the real smoke failure.
  }
  if (!runtimeState.vmLogPath) return;
  try {
    fs.appendFileSync(runtimeState.vmLogPath, line, 'utf8');
  } catch (_) {
    // Best-effort diagnostics must not mask the real smoke failure.
  }
}

function setStage(stage) {
  runtimeState.stage = stage;
  appendRuntimeLog(`stage=${stage}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(' ')} exited with ${result.status}`,
        result.stdout ? `stdout:\n${result.stdout}` : '',
        result.stderr ? `stderr:\n${result.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return result.stdout ?? '';
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runtimeState.currentChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      if (runtimeState.currentChild === child) runtimeState.currentChild = null;
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (runtimeState.currentChild === child) runtimeState.currentChild = null;
      if (code !== 0) {
        reject(
          new Error(
            [
              `${command} ${args.join(' ')} exited with ${code ?? `signal ${signal}`}`,
              stdout ? `stdout:\n${stdout}` : '',
              stderr ? `stderr:\n${stderr}` : '',
            ]
              .filter(Boolean)
              .join('\n')
          )
        );
        return;
      }
      resolve(stdout);
    });
  });
}

function runPipe(leftCommand, leftArgs, rightCommand, rightArgs) {
  return new Promise((resolve, reject) => {
    const left = spawn(leftCommand, leftArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const right = spawn(rightCommand, rightArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    runtimeState.currentChild = right;
    left.stdout.pipe(right.stdin);
    let stderr = '';
    left.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    right.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const failures = [];
    left.once('error', (error) => failures.push(error));
    right.once('error', (error) => failures.push(error));
    left.once('close', (code, signal) => {
      if (code !== 0)
        failures.push(new Error(`${leftCommand} ${leftArgs.join(' ')} exited with ${code ?? `signal ${signal}`}`));
    });
    right.once('close', (code, signal) => {
      if (runtimeState.currentChild === right) runtimeState.currentChild = null;
      if (code !== 0)
        failures.push(new Error(`${rightCommand} ${rightArgs.join(' ')} exited with ${code ?? `signal ${signal}`}`));
      if (failures.length > 0) {
        reject(
          new Error(
            [...failures.map((failure) => failure.message), stderr ? `stderr:\n${stderr}` : '']
              .filter(Boolean)
              .join('\n')
          )
        );
        return;
      }
      resolve('');
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshBaseArgs(options, ip) {
  const args = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=10'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(`${options.guestUser}@${ip}`);
  return args;
}

async function ssh(options, ip, command) {
  return await runAsync('ssh', [...sshBaseArgs(options, ip), command]);
}

async function scpToGuest(options, ip, sources, targetDir) {
  const args = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(...sources, `${options.guestUser}@${ip}:${targetDir}/`);
  await runAsync('scp', args);
}

async function scpFromGuest(options, ip, sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const args = ['-r', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(`${options.guestUser}@${ip}:${sourceDir}/`, targetDir);
  await runAsync('scp', args);
}

async function copyHostNodeRootToGuest(options, ip) {
  if (!options.guestNodeRoot) return null;
  const guestNodeRoot = `${options.guestWorkdir}/host-node-${path.basename(options.guestNodeRoot)}`;
  await ssh(options, ip, `rm -rf ${shellQuote(guestNodeRoot)} && mkdir -p ${shellQuote(guestNodeRoot)}`);
  await runPipe('tar', ['-C', options.guestNodeRoot, '-cf', '-', '.'], 'ssh', [
    ...sshBaseArgs(options, ip),
    `tar -C ${shellQuote(guestNodeRoot)} -xf -`,
  ]);
  return `${guestNodeRoot}/bin/node`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntil(deadline, fn, failureMessage) {
  while (Date.now() < deadline) {
    const result = fn();
    if (result) return result;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
  }
  throw new Error(failureMessage);
}

function waitForTartIp(vmName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return waitUntil(
    deadline,
    () => {
      const result = spawnSync('tart', ['ip', vmName], { encoding: 'utf8' });
      if (result.status !== 0) return null;
      const ip = result.stdout.trim().split(/\s+/).find(Boolean);
      return ip || null;
    },
    `Timed out waiting for Tart IP for ${vmName}`
  );
}

async function waitForSsh(options, ip, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  let nextProgressLogAt = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await runAsync('ssh', [...sshBaseArgs(options, ip), 'true']);
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= nextProgressLogAt) {
        const remainingMs = Math.max(0, deadline - Date.now());
        appendRuntimeLog(`waiting_for_ssh guest=${options.guestUser}@${ip} remaining_ms=${remainingMs}`);
        nextProgressLogAt = Date.now() + 30_000;
      }
      await sleep(2_000);
    }
  }
  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'no ssh attempt error captured');
  appendRuntimeLog(`ssh_wait_timeout guest=${options.guestUser}@${ip} last_error=${JSON.stringify(lastMessage)}`);
  throw new Error(`Timed out waiting for SSH to ${options.guestUser}@${ip}: ${lastMessage}`);
}

function startVm(options, vmLogPath) {
  const args = ['run'];
  if (options.noGraphics) args.push('--no-graphics');
  args.push(options.vmName);
  const log = fs.openSync(vmLogPath, 'a');
  const child = spawn('tart', args, {
    stdio: ['ignore', log, log],
    detached: false,
  });
  child.on('exit', (code) => {
    fs.appendFileSync(vmLogPath, `\n[tart run exited with ${code}]\n`, 'utf8');
  });
  return child;
}

function stopAndDeleteVm(options) {
  spawnSync('tart', ['stop', options.vmName], { stdio: 'ignore' });
  if (!options.keepVm) {
    spawnSync('tart', ['delete', options.vmName], { stdio: 'ignore' });
  }
}

function writeInterruptedSummary(signal) {
  const options = runtimeState.options;
  if (!options) return;
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    const summary = {
      surface_id: 'opl_tart_gui_first_run_smoke',
      status: 'interrupted',
      signal,
      stage: runtimeState.stage,
      vm_name: options.vmName,
      source_vm: options.sourceVm,
      guest_ip: runtimeState.ip || null,
      guest_artifacts: runtimeState.guestArtifactDir || null,
      host_artifacts: options.artifacts,
      copied_guest_artifacts: runtimeState.copiedArtifacts,
    };
    fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  } catch (_) {
    // Best-effort diagnostics must not mask signal handling.
  }
}

async function cleanupRuntime({ copyGuestArtifacts, reason } = { copyGuestArtifacts: true, reason: 'cleanup' }) {
  const options = runtimeState.options;
  if (!options || runtimeState.cleanupStarted) return;
  runtimeState.cleanupStarted = true;
  appendRuntimeLog(`cleanup_started reason=${reason || 'cleanup'}`);

  if (copyGuestArtifacts && runtimeState.ip && runtimeState.guestArtifactDir && !runtimeState.copiedArtifacts) {
    try {
      await scpFromGuest(options, runtimeState.ip, runtimeState.guestArtifactDir, options.artifacts);
      runtimeState.copiedArtifacts = true;
      appendRuntimeLog('copied_guest_artifacts_after_failure');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendRuntimeLog(`artifact_copy_after_failure_failed ${message}`);
    }
  }

  if (runtimeState.codexApiKeyFile?.temporary && runtimeState.codexApiKeyFile.tempDir) {
    fs.rmSync(runtimeState.codexApiKeyFile.tempDir, { recursive: true, force: true });
  }
  if (runtimeState.currentChild && !runtimeState.currentChild.killed) {
    runtimeState.currentChild.kill('SIGTERM');
  }
  if (runtimeState.tartProcess && !runtimeState.tartProcess.killed) {
    runtimeState.tartProcess.kill('SIGTERM');
  }
  stopAndDeleteVm(options);
  appendRuntimeLog('cleanup_finished');
}

if (process.env.NODE_ENV !== 'test') {
  for (const signal of SIGNAL_EXIT_CODES.keys()) {
    process.once(signal, () => {
      appendRuntimeLog(`received_signal signal=${signal}`);
      writeInterruptedSummary(signal);
      cleanupRuntime({ copyGuestArtifacts: false, reason: `signal:${signal}` }).finally(() => {
        process.exit(SIGNAL_EXIT_CODES.get(signal));
      });
    });
  }
}

function assertMacOSHost() {
  if (process.platform !== 'darwin') {
    throw new Error('Tart first-run smoke must run on a macOS host.');
  }
}

function assertTartAvailable() {
  run('tart', ['--version']);
}

function guestSmokeCommand(options, guestDmgPath, guestScriptPath, guestArtifactDir, guestCodexApiKeyPath) {
  const nodeCommand = shellQuote(options.guestNodeCommand);
  const smokeArgs = [
    `${nodeCommand} ${shellQuote(guestScriptPath)}`,
    `--dmg ${shellQuote(guestDmgPath)}`,
    `--artifacts ${shellQuote(guestArtifactDir)}`,
    `--codex-api-key-file ${shellQuote(guestCodexApiKeyPath)}`,
    '--require-codex-config-wizard',
    '--assert-clean',
    `--process-name ${shellQuote(options.processName)}`,
    `--timeout-ms ${shellQuote(String(options.smokeTimeoutMs))}`,
    options.settingsSmoke ? '--settings-smoke' : '',
    options.settingsSmoke ? `--cdp-port ${shellQuote(String(options.cdpPort))}` : '',
    `--runtime-profile ${shellQuote(options.runtimeProfile)}`,
  ].join(' ');
  return ['set -euo pipefail', smokeArgs].join('\n');
}

function resolveGuestSmokeScriptPath() {
  if (!fs.existsSync(GUEST_SMOKE_SCRIPT_PATH)) {
    throw new Error(`Guest first-run smoke script is missing: ${GUEST_SMOKE_SCRIPT_PATH}`);
  }
  return GUEST_SMOKE_SCRIPT_PATH;
}

async function resolveGuestNodeCommand(options, ip) {
  const installScript = `
set -euo pipefail
if command -v node >/dev/null 2>&1; then
  command -v node
  exit 0
fi
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) echo "Unsupported guest architecture for Node.js: $ARCH" >&2; exit 1 ;;
esac
NODE_VERSION="${DEFAULT_GUEST_NODE_VERSION}"
NODE_DIR="${options.guestWorkdir}/node-v$NODE_VERSION-darwin-$NODE_ARCH"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  mkdir -p ${shellQuote(options.guestWorkdir)}
  curl -fL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-$NODE_ARCH.tar.gz" -o "${options.guestWorkdir}/node.tar.gz"
  tar -xzf "${options.guestWorkdir}/node.tar.gz" -C ${shellQuote(options.guestWorkdir)}
fi
"$NODE_DIR/bin/node" --version >/dev/null
printf '%s\\n' "$NODE_DIR/bin/node"
`;
  return (await ssh(options, ip, installScript)).trim().split(/\r?\n/).at(-1);
}

function readGuestSmokeSummary(hostArtifactsDir) {
  const summaryPath = path.join(hostArtifactsDir, 'artifacts', 'smoke-summary.json');
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function assertGuestSmokeSummary(options, guestSummary) {
  if (!guestSummary) {
    throw new Error('Guest smoke summary is missing from copied artifacts.');
  }
  if (guestSummary.status !== 'passed') {
    throw new Error(`Guest smoke summary did not pass: ${guestSummary.status ?? 'missing status'}`);
  }
  if (guestSummary.runtime_profile !== options.runtimeProfile) {
    throw new Error(
      `Guest smoke runtime profile mismatch: expected ${options.runtimeProfile}, got ${
        guestSummary.runtime_profile ?? 'missing'
      }`
    );
  }
  if (!guestSummary.codex_config_wizard_submitted) {
    throw new Error('Guest smoke did not submit the Codex configuration wizard.');
  }
  if (!options.settingsSmoke) return;
  if (guestSummary.settings_smoke?.status !== 'passed') {
    throw new Error('Guest Settings smoke did not pass.');
  }
  if (!Array.isArray(guestSummary.settings_smoke.pages) || guestSummary.settings_smoke.pages.length === 0) {
    throw new Error('Guest Settings smoke summary did not record visited pages.');
  }
}

function writeSummary(options, ip, guestArtifactDir) {
  const guestSummary = readGuestSmokeSummary(options.artifacts);
  assertGuestSmokeSummary(options, guestSummary);
  const summary = {
    surface_id: 'opl_tart_gui_first_run_smoke',
    status: 'passed',
    smoke_profile: options.smokeProfile,
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    display: options.display,
    runtime_profile: options.runtimeProfile,
    guest_ip: ip,
    guest_artifacts: guestArtifactDir,
    host_artifacts: options.artifacts,
    codex_config_wizard_seen: guestSummary?.codex_config_wizard_seen ?? null,
    codex_config_wizard_submitted: guestSummary?.codex_config_wizard_submitted ?? null,
    codex_api_key_present: guestSummary?.codex_api_key_present ?? null,
    labels: guestSummary?.labels ?? [],
    settings_smoke: guestSummary?.settings_smoke ?? null,
    guest_summary: guestSummary,
  };
  fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  assertMacOSHost();
  const options = parseArgs(process.argv.slice(2));
  runtimeState.options = options;
  if (options.dryRun) {
    fs.mkdirSync(options.artifacts, { recursive: true });
    const plan = buildDryRunPlan(options);
    fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-plan.json'), JSON.stringify(plan, null, 2));
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  assertTartAvailable();
  fs.mkdirSync(options.artifacts, { recursive: true });

  const vmLogPath = path.join(options.artifacts, 'tart-run.log');
  runtimeState.vmLogPath = vmLogPath;
  let tartProcess = null;
  const codexApiKeyFile = prepareHostCodexApiKeyFile(options);
  runtimeState.codexApiKeyFile = codexApiKeyFile;
  let ip = '';
  let guestArtifactDir = '';
  let copiedArtifacts = false;
  try {
    setStage('clone_vm');
    run('tart', ['clone', options.sourceVm, options.vmName]);
    if (options.display) {
      setStage('configure_display');
      run('tart', ['set', options.vmName, '--display', options.display, '--no-display-refit']);
    }
    setStage('start_vm');
    tartProcess = startVm(options, vmLogPath);
    runtimeState.tartProcess = tartProcess;
    setStage('wait_for_ip');
    ip = waitForTartIp(options.vmName, options.timeoutMs);
    runtimeState.ip = ip;
    setStage('wait_for_ssh');
    await waitForSsh(options, ip, options.timeoutMs);

    guestArtifactDir = `${options.guestWorkdir}/artifacts`;
    runtimeState.guestArtifactDir = guestArtifactDir;
    const guestDmgPath = `${options.guestWorkdir}/${path.basename(options.dmg)}`;
    const guestScriptPath = `${options.guestWorkdir}/opl-first-run-vm-smoke.mjs`;
    const guestCodexApiKeyPath = `${options.guestWorkdir}/codex-api-key.txt`;
    setStage('prepare_guest_workdir');
    await ssh(
      options,
      ip,
      `rm -rf ${shellQuote(options.guestWorkdir)} && mkdir -p ${shellQuote(options.guestWorkdir)}`
    );
    setStage('copy_inputs_to_guest');
    await scpToGuest(
      options,
      ip,
      [options.dmg, resolveGuestSmokeScriptPath(), codexApiKeyFile.path],
      options.guestWorkdir
    );
    if (options.guestNodeRoot && !options.guestNodeCommand) {
      setStage('copy_guest_node_root');
      options.guestNodeCommand = await copyHostNodeRootToGuest(options, ip);
    }
    setStage(options.guestNodeCommand ? 'use_guest_node_command' : 'resolve_guest_node');
    if (!options.guestNodeCommand) {
      options.guestNodeCommand = await resolveGuestNodeCommand(options, ip);
    }
    setStage('run_guest_smoke');
    await ssh(
      options,
      ip,
      guestSmokeCommand(options, guestDmgPath, guestScriptPath, guestArtifactDir, guestCodexApiKeyPath)
    );
    setStage('copy_guest_artifacts');
    await scpFromGuest(options, ip, guestArtifactDir, options.artifacts);
    copiedArtifacts = true;
    runtimeState.copiedArtifacts = true;
    setStage('write_summary');
    writeSummary(options, ip, guestArtifactDir);
  } finally {
    runtimeState.ip = ip;
    runtimeState.guestArtifactDir = guestArtifactDir;
    runtimeState.copiedArtifacts = copiedArtifacts || runtimeState.copiedArtifacts;
    await cleanupRuntime({ copyGuestArtifacts: true, reason: 'finally' });
  }
}

function isMainModule(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    return fs.realpathSync(new URL(moduleUrl)) === fs.realpathSync(argvPath);
  } catch (_) {
    return false;
  }
}

export const __test =
  process.env.NODE_ENV === 'test'
    ? {
        assertGuestSmokeSummary,
        buildDryRunPlan,
        guestSmokeCommand,
        isMainModule,
        parseArgs,
        resolveGuestSmokeScriptPath,
        writeSummary,
      }
    : undefined;

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

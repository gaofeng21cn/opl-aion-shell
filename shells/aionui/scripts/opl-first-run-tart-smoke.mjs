#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_GUEST_USER = process.env.OPL_FIRST_RUN_GUEST_USER || 'runner';
const DEFAULT_GUEST_NODE_VERSION = process.env.OPL_FIRST_RUN_GUEST_NODE_VERSION || '22.21.1';
const SIGNAL_EXIT_CODES = new Map([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
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
  --codex-api-key-file <path>
                           Optional host file containing the test Codex API key.
                           If omitted, an ephemeral non-secret smoke key is generated.
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
    codexApiKeyFile: process.env.OPL_FIRST_RUN_CODEX_API_KEY_FILE || '',
    noGraphics: false,
    keepVm: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--no-graphics') {
      options.noGraphics = true;
      continue;
    }
    if (arg === '--keep-vm') {
      options.keepVm = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--source-vm') options.sourceVm = value;
    else if (arg === '--dmg') options.dmg = path.resolve(value);
    else if (arg === '--guest-user') options.guestUser = value;
    else if (arg === '--ssh-key') options.sshKey = path.resolve(value);
    else if (arg === '--vm-name') options.vmName = value;
    else if (arg === '--artifacts') options.artifacts = path.resolve(value);
    else if (arg === '--guest-workdir') options.guestWorkdir = value;
    else if (arg === '--process-name') options.processName = value;
    else if (arg === '--timeout-ms') options.timeoutMs = Number(value);
    else if (arg === '--smoke-timeout-ms') options.smokeTimeoutMs = Number(value);
    else if (arg === '--codex-api-key-file') options.codexApiKeyFile = path.resolve(value);
    else throw new Error(`Unsupported argument: ${arg}`);
  }

  if (!options.sourceVm) throw new Error('--source-vm or OPL_FIRST_RUN_TART_SOURCE is required.');
  if (!options.dmg) throw new Error('--dmg is required.');
  if (!fs.existsSync(options.dmg)) throw new Error(`DMG does not exist: ${options.dmg}`);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (!Number.isFinite(options.smokeTimeoutMs) || options.smokeTimeoutMs <= 0) {
    throw new Error('--smoke-timeout-ms must be positive.');
  }

  return options;
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
  while (Date.now() < deadline) {
    try {
      await runAsync('ssh', [...sshBaseArgs(options, ip), 'true']);
      return;
    } catch (_) {
      await sleep(2_000);
    }
  }
  throw new Error(`Timed out waiting for SSH to ${options.guestUser}@${ip}`);
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

for (const signal of SIGNAL_EXIT_CODES.keys()) {
  process.once(signal, () => {
    appendRuntimeLog(`received_signal signal=${signal}`);
    writeInterruptedSummary(signal);
    cleanupRuntime({ copyGuestArtifacts: false, reason: `signal:${signal}` }).finally(() => {
      process.exit(SIGNAL_EXIT_CODES.get(signal));
    });
  });
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
  ].join(' ');
  return ['set -euo pipefail', smokeArgs].join('\n');
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

function writeSummary(options, ip, guestArtifactDir) {
  const guestSummary = readGuestSmokeSummary(options.artifacts);
  const summary = {
    surface_id: 'opl_tart_gui_first_run_smoke',
    status: 'passed',
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    guest_ip: ip,
    guest_artifacts: guestArtifactDir,
    host_artifacts: options.artifacts,
    codex_config_wizard_seen: guestSummary?.codex_config_wizard_seen ?? null,
    codex_config_wizard_submitted: guestSummary?.codex_config_wizard_submitted ?? null,
    codex_api_key_present: guestSummary?.codex_api_key_present ?? null,
    labels: guestSummary?.labels ?? [],
    guest_summary: guestSummary,
  };
  fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  assertMacOSHost();
  const options = parseArgs(process.argv.slice(2));
  runtimeState.options = options;
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
      [options.dmg, path.resolve('scripts', 'opl-first-run-vm-smoke.mjs'), codexApiKeyFile.path],
      options.guestWorkdir
    );
    setStage('resolve_guest_node');
    options.guestNodeCommand = await resolveGuestNodeCommand(options, ip);
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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

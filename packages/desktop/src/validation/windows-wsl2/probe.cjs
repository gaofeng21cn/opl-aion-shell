'use strict';

const { spawn } = require('node:child_process');

const VALIDATION_GATE_ENV = 'OPL_WINDOWS_WSL2_VALIDATION';
const VALIDATION_GATE_VALUE = '1';
const VALIDATION_DISTRO = 'OPL-Validation-g0001';
const WSL_COMMAND_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 16 * 1024;

const READ_ONLY_GUEST_PROBE = [
  'set -eu',
  'aioncore=/opt/opl-validation/bin/aioncore',
  'codex=/opt/opl-validation/codex/vendor/x86_64-unknown-linux-musl/bin/codex',
  'framework=/opt/opl-validation/framework/src/entrypoints/cli.ts',
  'report_binary() {',
  '  if [ -x "$2" ] || [ -f "$2" ]; then printf "%s=present\\n" "$1"; else printf "%s=missing\\n" "$1"; fi',
  '}',
  'printf "guest_arch=%s\\n" "$(uname -m)"',
  'report_binary aioncore_binary "$aioncore"',
  'if pgrep -x aioncore >/dev/null 2>&1; then printf "aioncore_process=running\\n"; else printf "aioncore_process=not_running\\n"; fi',
  'report_binary codex_binary "$codex"',
  'report_binary framework_cli "$framework"',
].join('\n');

function requireValidationGate({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32') {
    throw new Error('Windows WSL2 validation can only run on Windows.');
  }
  if (env[VALIDATION_GATE_ENV] !== VALIDATION_GATE_VALUE) {
    throw new Error(`${VALIDATION_GATE_ENV}=1 is required for the Windows WSL2 validation candidate.`);
  }
}

function boundedText(value) {
  return String(value || '')
    .replaceAll(String.fromCharCode(0), '')
    .slice(0, MAX_OUTPUT_BYTES);
}

function parseKeyValueLines(value) {
  const fields = {};
  for (const line of boundedText(value).split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+)=(present|missing|running|not_running|[a-zA-Z0-9_-]+)$/);
    if (match) fields[match[1]] = match[2];
  }
  return fields;
}

function parseInventory({ verbose = '', quiet = '' } = {}) {
  const quietNames = new Set(
    boundedText(quiet)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  let fixtureState = quietNames.has(VALIDATION_DISTRO) ? 'unknown' : 'absent';
  let fixtureVersion = null;
  let defaultDistro = null;

  for (const rawLine of boundedText(verbose).split(/\r?\n/)) {
    const hasDefaultMarker = /^\s*\*/.test(rawLine);
    const line = rawLine.replace(/^\s*\*\s*/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s{2,}/).filter(Boolean);
    const name = parts[0];
    if (!name) continue;
    if (hasDefaultMarker) defaultDistro = name;
    if (name === VALIDATION_DISTRO) {
      quietNames.add(name);
      fixtureState = parts[1] || 'unknown';
      const version = parts.at(-1);
      fixtureVersion = /^\d+$/.test(version || '') ? Number(version) : null;
    }
  }

  return {
    defaultDistro,
    fixturePresent: quietNames.has(VALIDATION_DISTRO),
    fixtureState,
    fixtureVersion,
  };
}

function isRunningState(value) {
  return String(value).trim().toLowerCase() === 'running';
}

function unavailableStatus(detail) {
  return { state: 'unavailable', detail };
}

function buildUnavailableStatus(inventory) {
  const fixtureDetail = !inventory.fixturePresent
    ? `${VALIDATION_DISTRO} is not registered.`
    : `${VALIDATION_DISTRO} is ${inventory.fixtureState || 'not ready'}; the status candidate does not start it.`;
  return {
    gate: 'validation_only_non_binding',
    guest: {
      state: inventory.fixturePresent ? 'unavailable' : 'absent',
      detail: fixtureDetail,
      distro: VALIDATION_DISTRO,
      version: inventory.fixtureVersion,
      defaultDistro: inventory.defaultDistro,
    },
    aioncore: unavailableStatus('No validation-owned AionCore health endpoint is active.'),
    codex: unavailableStatus('Direct Codex App Server is not started by this status-only candidate.'),
    framework: unavailableStatus('Framework state is not executed by this status-only candidate.'),
    acp: { state: 'unverified', detail: 'Managed ACP remains unverified.' },
    authentication: { state: 'unverified', detail: 'Authenticated bootstrap remains unverified.' },
    websocket: { state: 'unverified', detail: 'WebSocket conversation remains unverified.' },
  };
}

function buildRunningStatus(inventory, fields) {
  const aioncoreRunning = fields.aioncore_process === 'running';
  const aioncorePresent = fields.aioncore_binary === 'present';
  const codexPresent = fields.codex_binary === 'present';
  const frameworkPresent = fields.framework_cli === 'present';
  return {
    gate: 'validation_only_non_binding',
    guest: {
      state: 'observed',
      detail: `Observed ${VALIDATION_DISTRO} (${fields.guest_arch || 'architecture unavailable'}).`,
      distro: VALIDATION_DISTRO,
      version: inventory.fixtureVersion,
      defaultDistro: inventory.defaultDistro,
    },
    aioncore: aioncoreRunning
      ? {
          state: 'unverified',
          detail: aioncorePresent
            ? 'Process observed; no health endpoint is exposed.'
            : 'Unexpected process without fixture binary.',
        }
      : unavailableStatus(
          aioncorePresent
            ? 'Fixture binary exists; no validation-owned AionCore process is running.'
            : 'Fixture AionCore binary is missing.'
        ),
    codex: codexPresent
      ? { state: 'unverified', detail: 'Fixture binary exists; Direct Codex App Server is intentionally not started.' }
      : unavailableStatus('Fixture Direct Codex binary is missing.'),
    framework: frameworkPresent
      ? { state: 'unverified', detail: 'Fixture CLI exists; Framework state is intentionally not executed.' }
      : unavailableStatus('Fixture Framework CLI is missing.'),
    acp: { state: 'unverified', detail: 'Managed ACP remains unverified.' },
    authentication: { state: 'unverified', detail: 'Authenticated bootstrap remains unverified.' },
    websocket: { state: 'unverified', detail: 'WebSocket conversation remains unverified.' },
  };
}

function runWsl(args, { spawnImpl = spawn, timeoutMs = WSL_COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout: boundedText(stdout), stderr: boundedText(stderr), ...result });
    };
    const timeout = setTimeout(() => {
      try {
        child?.kill();
      } catch {
        // The query process may have already exited.
      }
      finish({ exitCode: null, timedOut: true });
    }, timeoutMs);
    try {
      child = spawnImpl('wsl.exe', args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', (chunk) => {
        stdout = boundedText(stdout + String(chunk));
      });
      child.stderr?.on('data', (chunk) => {
        stderr = boundedText(stderr + String(chunk));
      });
      child.once('error', () => finish({ exitCode: null, timedOut: false }));
      child.once('close', (exitCode) => finish({ exitCode, timedOut: false }));
    } catch {
      finish({ exitCode: null, timedOut: false });
    }
  });
}

async function collectValidationStatus({ platform = process.platform, env = process.env, run = runWsl } = {}) {
  requireValidationGate({ platform, env });
  const [verbose, quiet] = await Promise.all([run(['--list', '--verbose']), run(['--list', '--quiet'])]);
  const inventory = parseInventory({ verbose: verbose.stdout, quiet: quiet.stdout });
  if (!inventory.fixturePresent || inventory.fixtureVersion !== 2 || !isRunningState(inventory.fixtureState)) {
    return buildUnavailableStatus(inventory);
  }
  const guestResult = await run([
    '--distribution',
    VALIDATION_DISTRO,
    '--user',
    'root',
    '--exec',
    'sh',
    '-lc',
    READ_ONLY_GUEST_PROBE,
  ]);
  if (guestResult.exitCode !== 0 || guestResult.timedOut) {
    return buildUnavailableStatus(inventory);
  }
  return buildRunningStatus(inventory, parseKeyValueLines(guestResult.stdout));
}

module.exports = {
  READ_ONLY_GUEST_PROBE,
  VALIDATION_DISTRO,
  VALIDATION_GATE_ENV,
  collectValidationStatus,
  parseInventory,
  requireValidationGate,
  runWsl,
};

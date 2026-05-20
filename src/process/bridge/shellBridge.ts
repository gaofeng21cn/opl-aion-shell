/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { shell } from 'electron';
import { ipcBridge } from '@/common';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getOplCommandLineToolsInstallMessage } from '@/common/config/oplProductProfile';
import { buildOplFullRuntimeShellPrefix } from '../oplFullRuntime';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const ALLOWED_OPL_COMMANDS = new Set([
  'modules',
  'doctor',
  'install',
  'module',
  'engine',
  'system',
  'workspace',
  'packages',
  'runtime',
  'family-runtime',
  'skill',
]);
const ALLOWED_RUNTIME_ACTION_ID_FAMILIES = new Set([
  'external_evidence_request',
  'legacy-cleanup',
  'legacy_cleanup',
  'provider-scheduler',
  'provider_scheduler',
  'stage-production-attempt',
  'stage_production_attempt',
  'stage-production-evidence',
  'stage_production_evidence',
  'stage-production-evidence-receipt',
  'stage_production_evidence_receipt',
]);
const OPL_INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh';
const OPL_FIRST_RUN_LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'One Person Lab');
const OPL_FIRST_RUN_LOG_PATH = path.join(OPL_FIRST_RUN_LOG_DIR, 'first-run.jsonl');
const OPL_FIRST_RUN_LOG_READ_LIMIT = 200;
const OPL_FIRST_RUN_EVENT_SCHEMA_VERSION = 'opl_first_run_event.v1';
const OPL_STANDARD_INSTALL_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'One Person Lab',
  'opl',
  'one-person-lab'
);
const OPL_STANDARD_CLI = path.join(OPL_STANDARD_INSTALL_DIR, 'bin', 'opl');
const OPL_STANDARD_TOOLCHAIN_PREFIX = [
  'if [ -d "$HOME/.opl/toolchain" ]; then',
  'for _opl_node_bin in "$HOME"/.opl/toolchain/node-v*/bin; do',
  'if [ -x "$_opl_node_bin/node" ] && [ -x "$_opl_node_bin/npm" ]; then export PATH="$_opl_node_bin:$PATH"; break; fi;',
  'done;',
  'unset _opl_node_bin;',
  'fi',
].join(' ');
const COMMAND_LINE_TOOLS_INSTALL_MESSAGE = getOplCommandLineToolsInstallMessage();
type CommandLineToolsPreparationResult = {
  status: 'available' | 'installer_requested' | 'unsupported';
  message?: string;
};
let oplBootstrapPromise: Promise<{ exitCode: number; stdout: string; stderr: string }> | null = null;
let oplCommandQueue: Promise<void> = Promise.resolve();

function parseJsonRecord(value: string, context: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The caller receives the scoped validation error below.
  }
  throw new Error(`Unsupported OPL ${context} payload`);
}

function hasOnlyKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function assertAllowedFamilyRuntimeSignal(args: string[]): void {
  const action = args.slice(1).join(' ');
  if (!(args.length === 10 && args[1] === 'attempt' && args[2] === 'signal')) {
    throw new Error(`Unsupported OPL family-runtime action: ${action}`);
  }
  const stageAttemptId = args[3];
  const kindFlag = args[4];
  const signalKind = args[5];
  const payloadFlag = args[6];
  const payloadRaw = args[7];
  const sourceFlag = args[8];
  const source = args[9];
  if (!stageAttemptId.trim() || kindFlag !== '--kind' || payloadFlag !== '--payload' || sourceFlag !== '--source') {
    throw new Error(`Unsupported OPL family-runtime action: ${action}`);
  }
  if (source !== 'opl-aion-shell') {
    throw new Error(`Unsupported OPL family-runtime signal source: ${source}`);
  }
  if (!['human_gate', 'resume', 'user_instruction'].includes(signalKind)) {
    throw new Error(`Unsupported OPL family-runtime signal kind: ${signalKind}`);
  }
  const payload = parseJsonRecord(payloadRaw, 'family-runtime signal');
  if (signalKind === 'human_gate') {
    const gateRef = typeof payload.human_gate_ref === 'string' ? payload.human_gate_ref : '';
    if (
      !hasOnlyKeys(payload, ['human_gate_ref', 'reason']) ||
      gateRef !== `opl-aion-shell:human_gate:${stageAttemptId}` ||
      payload.reason !== 'operator_human_gate_requested'
    ) {
      throw new Error('Unsupported OPL family-runtime human gate signal');
    }
    return;
  }
  if (signalKind === 'resume') {
    if (!hasOnlyKeys(payload, ['reason']) || payload.reason !== 'operator_resume_requested') {
      throw new Error('Unsupported OPL family-runtime resume signal');
    }
    return;
  }
  if (
    !hasOnlyKeys(payload, ['instruction_kind', 'reason']) ||
    payload.instruction_kind !== 'dead_letter_repair' ||
    payload.reason !== 'operator_dead_letter_repair_requested'
  ) {
    throw new Error('Unsupported OPL family-runtime user instruction');
  }
}

function assertAllowedDeveloperSupervisorArgs(args: string[]): void {
  const valuesByOption: Record<string, readonly string[] | null> = {
    '--enabled': ['auto', 'on', 'off'],
    '--mode': ['external_observe', 'developer_apply_safe'],
    '--github-login': null,
    '--auto-enable-github-login': null,
  };

  for (let index = 2; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option || !Object.prototype.hasOwnProperty.call(valuesByOption, option)) {
      throw new Error(`Unsupported OPL developer-supervisor option: ${option ?? ''}`);
    }
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing OPL developer-supervisor value for option: ${option}`);
    }

    const allowedValues = valuesByOption[option];
    if (allowedValues && !allowedValues.includes(value)) {
      const label = option === '--enabled' ? 'enabled' : 'mode';
      throw new Error(`Unsupported OPL developer-supervisor ${label} value: ${value}`);
    }
    if (!allowedValues && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)) {
      throw new Error(`Unsupported OPL developer-supervisor GitHub login value: ${value}`);
    }
  }
}

function assertRefsOnlyPayloadValue(key: string, value: unknown): void {
  if (!/(^refs?$|_refs?$)/.test(key)) {
    throw new Error(`Unsupported OPL runtime action refs-only payload key: ${key}`);
  }
  if (typeof value === 'string' && value.trim()) {
    return;
  }
  if (Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === 'string' && entry.trim())) {
    return;
  }
  throw new Error(`Unsupported OPL runtime action refs-only payload value for key: ${key}`);
}

function assertRefsOnlyRuntimeActionPayload(value: string): void {
  const payload = parseJsonRecord(value, 'runtime action execute');
  for (const [key, entry] of Object.entries(payload)) {
    assertRefsOnlyPayloadValue(key, entry);
  }
}

function assertAllowedRuntimeActionId(value: string): void {
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new Error(`Unsupported OPL runtime action id: ${value}`);
  }
  const family = value.split(':', 1)[0] ?? '';
  if (!ALLOWED_RUNTIME_ACTION_ID_FAMILIES.has(family)) {
    throw new Error(`Unsupported OPL runtime action id: ${value}`);
  }
}

function assertAllowedRuntimeActionExecuteArgs(args: string[]): void {
  if (!(args[1] === 'action' && args[2] === 'execute')) {
    throw new Error(`Unsupported OPL runtime action: ${args.slice(1).join(' ')}`);
  }

  let actionId = '';
  let sawPayload = false;
  let sawDryRun = false;
  for (let index = 3; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (option === '--action') {
      if (actionId || !value || value.startsWith('--')) {
        throw new Error('Unsupported OPL runtime action execute --action');
      }
      assertAllowedRuntimeActionId(value);
      actionId = value;
      index += 1;
      continue;
    }
    if (option === '--payload') {
      if (sawPayload || !value || value.startsWith('--')) {
        throw new Error('Unsupported OPL runtime action execute --payload');
      }
      assertRefsOnlyRuntimeActionPayload(value);
      sawPayload = true;
      index += 1;
      continue;
    }
    if (option === '--dry-run') {
      if (sawDryRun) {
        throw new Error('Unsupported OPL runtime action execute duplicate --dry-run');
      }
      sawDryRun = true;
      continue;
    }
    throw new Error(`Unsupported OPL runtime action execute option: ${option ?? ''}`);
  }

  if (!actionId) {
    throw new Error('Unsupported OPL runtime action execute missing --action');
  }
}

function assertAllowedRuntimeArgs(args: string[]): void {
  const isSnapshot = args.length >= 2 && args[1] === 'snapshot' && args.slice(2).every((arg) => arg === '--json');
  if (isSnapshot) {
    return;
  }

  const isAppOperatorSummary = args.length === 3 && args[1] === 'app-operator-drilldown' && args[2] === '--json';
  if (isAppOperatorSummary) {
    return;
  }

  const isAppOperatorFull =
    args.length === 5 &&
    args[1] === 'app-operator-drilldown' &&
    args[2] === '--json' &&
    args[3] === '--detail' &&
    args[4] === 'full';
  if (isAppOperatorFull) {
    return;
  }

  if (args[1] === 'action') {
    assertAllowedRuntimeActionExecuteArgs(args);
    return;
  }

  throw new Error(`Unsupported OPL runtime action: ${args.slice(1).join(' ')}`);
}

function assertAllowedOplArgs(args: string[]): void {
  if (args.length === 0) {
    throw new Error('Missing OPL command');
  }
  if (!ALLOWED_OPL_COMMANDS.has(args[0])) {
    throw new Error(`Unsupported OPL command: ${args[0]}`);
  }
  if (args.some((arg) => /[;&|`$<>]/.test(arg))) {
    throw new Error('Unsupported shell metacharacter in OPL command');
  }
  if (args[0] === 'module' && args[1] && !['install', 'update', 'reinstall'].includes(args[1])) {
    throw new Error(`Unsupported OPL module action: ${args[1]}`);
  }
  if (args[0] === 'engine' && args[1] && !['install', 'update', 'reinstall'].includes(args[1])) {
    throw new Error(`Unsupported OPL engine action: ${args[1]}`);
  }
  if (
    args[0] === 'system' &&
    args[1] &&
    ![
      'initialize',
      'update',
      'startup-maintenance',
      'reconcile-modules',
      'configure-codex',
      'developer-supervisor',
    ].includes(args[1])
  ) {
    throw new Error(`Unsupported OPL system action: ${args[1]}`);
  }
  if (args[0] === 'system' && args[1] === 'developer-supervisor') {
    assertAllowedDeveloperSupervisorArgs(args);
  }
  if (args[0] === 'system' && args[1] === 'configure-codex' && !(args.length === 3 && args[2] === '--api-key-stdin')) {
    throw new Error(`Unsupported OPL system configure-codex arguments: ${args.slice(2).join(' ')}`);
  }
  if (args[0] === 'packages' && (args.length !== 2 || args[1] !== 'manifest')) {
    throw new Error(`Unsupported OPL packages action: ${args.slice(1).join(' ')}`);
  }
  if (args[0] === 'skill') {
    const isCompanionApply =
      args.length === 7 &&
      args[1] === 'companion' &&
      args[2] === 'apply' &&
      args[3] === '--mode' &&
      args[4] === 'managed' &&
      args[5] === '--superpowers' &&
      args[6] === 'keep';
    if (!isCompanionApply) {
      throw new Error(`Unsupported OPL skill action: ${args.slice(1).join(' ')}`);
    }
  }
  if (args[0] === 'runtime') {
    assertAllowedRuntimeArgs(args);
  }
  if (args[0] === 'family-runtime') {
    assertAllowedFamilyRuntimeSignal(args);
  }
  if (args[0] === 'workspace') {
    const isRead = args.length === 2 && args[1] === 'root';
    const isDoctor = args.length === 3 && args[1] === 'root' && args[2] === 'doctor';
    const isSet =
      args.length === 5 && args[1] === 'root' && args[2] === 'set' && args[3] === '--path' && path.isAbsolute(args[4]);
    if (!isRead && !isDoctor && !isSet) {
      throw new Error(`Unsupported OPL workspace action: ${args.slice(1).join(' ')}`);
    }
  }
}

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function isMacCommandLineToolsMissingOutput(output: string): boolean {
  return /xcode-select: note: No developer tools were found|No developer tools were found, requesting install|invalid active developer path/i.test(
    output
  );
}

async function commandLineToolsAreAvailable(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  try {
    await execFileAsync('/usr/bin/xcode-select', ['-p'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function openCommandLineToolsInstaller(): Promise<void> {
  if (process.platform !== 'darwin') return;
  try {
    await execFileAsync('/usr/bin/xcode-select', ['--install'], { timeout: 10_000 });
  } catch {
    // macOS returns a non-zero status when the installer is already open or tools are already installed.
  }
}

async function prepareCommandLineTools(): Promise<CommandLineToolsPreparationResult> {
  if (process.platform !== 'darwin') return { status: 'unsupported' };
  if (await commandLineToolsAreAvailable()) return { status: 'available' };

  await openCommandLineToolsInstaller();
  return {
    status: 'installer_requested',
    message: COMMAND_LINE_TOOLS_INSTALL_MESSAGE,
  };
}

function oplCommandMayNeedCommandLineTools(args: string[]): boolean {
  if (process.platform !== 'darwin') return false;
  if (args[0] === 'install') return !process.env.OPL_FULL_RUNTIME_HOME?.trim() && !args.includes('--skip-modules');
  if (args[0] === 'module' && ['install', 'update', 'reinstall'].includes(args[1] ?? '')) return true;
  if (
    args[0] === 'system' &&
    ['startup-maintenance', 'reconcile-modules'].includes(args[1] ?? '') &&
    process.env.OPL_FULL_RUNTIME_HOME?.trim()
  ) {
    return false;
  }
  return args[0] === 'system' && ['update', 'startup-maintenance', 'reconcile-modules'].includes(args[1] ?? '');
}

async function maybeOpenCommandLineToolsInstallerBeforeOplCommand(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
  if (!oplCommandMayNeedCommandLineTools(args)) return null;
  if (await commandLineToolsAreAvailable()) return null;

  await openCommandLineToolsInstaller();
  return {
    exitCode: 69,
    stdout: '',
    stderr: COMMAND_LINE_TOOLS_INSTALL_MESSAGE,
  };
}

async function normalizeOplCommandResult(result: {
  exitCode: number;
  stdout: string;
  stderr: string;
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (result.exitCode === 0) return result;
  if (!isMacCommandLineToolsMissingOutput([result.stdout, result.stderr].filter(Boolean).join('\n'))) return result;

  await openCommandLineToolsInstaller();
  return {
    exitCode: result.exitCode,
    stdout: '',
    stderr: COMMAND_LINE_TOOLS_INSTALL_MESSAGE,
  };
}

async function runLoginShell(
  command: string,
  timeout: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync('/bin/zsh', ['-lc', command], { timeout, maxBuffer: 20 * 1024 * 1024 });
    return { exitCode: 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? err.message,
    };
  }
}

async function runLoginShellWithInput(
  command: string,
  timeout: number,
  input: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (exitCode: number, extraStderr = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout,
        stderr: [stderr, extraStderr].filter(Boolean).join('\n'),
      });
    };
    timer = setTimeout(() => {
      child.kill();
      finish(124, 'OPL command timed out.');
    }, timeout);

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(1, error.message);
    });
    child.on('exit', (code) => {
      finish(typeof code === 'number' ? code : 1);
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function buildOplCommand(args: string[]): string {
  const fullRuntimeHome = process.env.OPL_FULL_RUNTIME_HOME;
  const envPrefix = ['modules', 'runtime', 'system', 'workspace', 'family-runtime', 'skill'].includes(args[0])
    ? 'OPL_OUTPUT=json '
    : '';
  const standardCli = shellQuote(OPL_STANDARD_CLI);
  return [
    buildOplFullRuntimeShellPrefix(fullRuntimeHome),
    OPL_STANDARD_TOOLCHAIN_PREFIX,
    `OPL_APP_MANAGED_CLI=${standardCli}`,
    'if command -v opl >/dev/null 2>&1; then OPL_APP_CLI=opl; elif [ -x "$OPL_APP_MANAGED_CLI" ]; then OPL_APP_CLI="$OPL_APP_MANAGED_CLI"; else exit 127; fi',
    `${envPrefix}"$OPL_APP_CLI" ${args.map(shellQuote).join(' ')}`,
  ]
    .filter(Boolean)
    .join(' && ');
}

function buildOplBootstrapCommand(): string {
  return [
    'set -euo pipefail',
    'command -v curl >/dev/null',
    `OPL_INSTALL_SCRIPT_URL="\${OPL_INSTALL_SCRIPT_URL:-${OPL_INSTALL_SCRIPT_URL}}"`,
    `OPL_INSTALL_DIR=${shellQuote(OPL_STANDARD_INSTALL_DIR)}`,
    'export OPL_INSTALL_DIR',
    'OPL_BOOTSTRAP_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/opl-install.XXXXXX")"',
    'trap \'rm -f "$OPL_BOOTSTRAP_SCRIPT"\' EXIT',
    'curl --http1.1 --connect-timeout 20 --max-time 120 --retry 3 --retry-delay 2 --retry-all-errors -fsSL "$OPL_INSTALL_SCRIPT_URL" -o "$OPL_BOOTSTRAP_SCRIPT"',
    'bash "$OPL_BOOTSTRAP_SCRIPT" --bootstrap-only',
  ].join(' && ');
}

function shouldQueueOplCommand(args: string[]): boolean {
  if (args[0] === 'install') return true;
  if (args[0] === 'module' || args[0] === 'engine') return true;
  if (args[0] === 'skill') return args[1] === 'companion' && args[2] === 'apply';
  if (args[0] === 'family-runtime') return true;
  if (args[0] === 'runtime') {
    return args[1] === 'action' && args[2] === 'execute' && !args.includes('--dry-run');
  }
  if (args[0] === 'system') {
    if (
      args[1] === 'update' ||
      args[1] === 'startup-maintenance' ||
      args[1] === 'reconcile-modules' ||
      args[1] === 'configure-codex'
    )
      return true;
    if (args[1] === 'developer-supervisor') return args.length > 2;
    return false;
  }
  if (args[0] === 'workspace') {
    return args[1] === 'root' && args[2] === 'set';
  }
  return false;
}

async function bootstrapOplCli(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (!oplBootstrapPromise) {
    oplBootstrapPromise = runLoginShell(buildOplBootstrapCommand(), 30 * 60_000).finally((): void => {
      oplBootstrapPromise = null;
    });
  }
  return oplBootstrapPromise;
}

async function runOplCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertAllowedOplArgs(args);
  if (
    args[0] === 'system' &&
    ['startup-maintenance', 'reconcile-modules'].includes(args[1] ?? '') &&
    process.env.OPL_FULL_RUNTIME_HOME?.trim()
  ) {
    return {
      exitCode: 0,
      stdout: '{"system_action":{"status":"skipped","reason":"full_runtime_managed_modules"}}',
      stderr: '',
    };
  }

  const commandLineToolsInstall = await maybeOpenCommandLineToolsInstallerBeforeOplCommand(args);
  if (commandLineToolsInstall) {
    return commandLineToolsInstall;
  }

  const timeout =
    args[0] === 'install' ||
    args[0] === 'engine' ||
    (args[0] === 'system' &&
      (args[1] === 'update' || args[1] === 'startup-maintenance' || args[1] === 'reconcile-modules'))
      ? 30 * 60_000
      : 120_000;
  const directResult = await runLoginShell(buildOplCommand(args), timeout);
  if (directResult.exitCode !== 127) {
    return await normalizeOplCommandResult(directResult);
  }

  const bootstrapResult = await bootstrapOplCli();
  const prefix = '[One Person Lab App] OPL CLI was not found; bootstrapped one-person-lab through the OPL installer.';
  if (bootstrapResult.exitCode !== 0) {
    return await normalizeOplCommandResult({
      ...bootstrapResult,
      stdout: [prefix, bootstrapResult.stdout].filter(Boolean).join('\n'),
    });
  }

  const bootstrappedCommandResult = await runLoginShell(buildOplCommand(args), timeout);
  return await normalizeOplCommandResult({
    ...bootstrappedCommandResult,
    stdout: [prefix, bootstrapResult.stdout, bootstrappedCommandResult.stdout].filter(Boolean).join('\n'),
    stderr: [bootstrapResult.stderr, bootstrappedCommandResult.stderr].filter(Boolean).join('\n'),
  });
}

function enqueueOplCommand<T>(run: () => Promise<T>): Promise<T> {
  const previous = oplCommandQueue;
  let release: () => void = () => {};
  oplCommandQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  return previous
    .catch((): void => undefined)
    .then(run)
    .finally((): void => {
      release();
    });
}

async function runOplCliWithInput(
  args: string[],
  input: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  assertAllowedOplArgs(args);
  const timeout = 120_000;
  const directResult = await runLoginShellWithInput(buildOplCommand(args), timeout, input);
  if (directResult.exitCode !== 127) {
    return await normalizeOplCommandResult(directResult);
  }

  const bootstrapResult = await bootstrapOplCli();
  const prefix = '[One Person Lab App] OPL CLI was not found; bootstrapped one-person-lab through the OPL installer.';
  if (bootstrapResult.exitCode !== 0) {
    return await normalizeOplCommandResult({
      ...bootstrapResult,
      stdout: [prefix, bootstrapResult.stdout].filter(Boolean).join('\n'),
    });
  }

  const bootstrappedCommandResult = await runLoginShellWithInput(buildOplCommand(args), timeout, input);
  return await normalizeOplCommandResult({
    ...bootstrappedCommandResult,
    stdout: [prefix, bootstrapResult.stdout, bootstrappedCommandResult.stdout].filter(Boolean).join('\n'),
    stderr: [bootstrapResult.stderr, bootstrappedCommandResult.stderr].filter(Boolean).join('\n'),
  });
}

async function configureOplCodex(apiKey: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { exitCode: 2, stdout: '', stderr: 'Missing Codex API key.' };
  }
  return await runOplCliWithInput(['system', 'configure-codex', '--api-key-stdin'], `${trimmed}\n`);
}

function parseFirstRunLogLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function readOplFirstRunLog(): Promise<{
  path: string;
  entries: Array<Record<string, unknown>>;
  latest: Record<string, unknown> | null;
}> {
  if (!fs.existsSync(OPL_FIRST_RUN_LOG_PATH)) {
    return { path: OPL_FIRST_RUN_LOG_PATH, entries: [], latest: null };
  }

  const content = await fs.promises.readFile(OPL_FIRST_RUN_LOG_PATH, 'utf8');
  const entries = content
    .split(/\r?\n/)
    .map(parseFirstRunLogLine)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .slice(-OPL_FIRST_RUN_LOG_READ_LIMIT);
  return { path: OPL_FIRST_RUN_LOG_PATH, entries, latest: entries.at(-1) ?? null };
}

async function appendOplFirstRunLog(eventType: string, payload: Record<string, unknown>): Promise<void> {
  await fs.promises.mkdir(OPL_FIRST_RUN_LOG_DIR, { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    event_type: eventType,
    schema_version: OPL_FIRST_RUN_EVENT_SCHEMA_VERSION,
    surface_id: 'opl_first_run_log',
    payload: {
      source: 'opl-aion-shell',
      ...payload,
    },
  };
  await fs.promises.appendFile(OPL_FIRST_RUN_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  const platform = process.platform;
  const checkCmd = platform === 'win32' ? `where ${command}` : `which ${command}`;

  try {
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if VS Code is installed
 */
async function isVSCodeInstalled(): Promise<boolean> {
  // First check if 'code' command exists
  if (await commandExists('code')) {
    return true;
  }

  // Check common installation paths
  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
    possiblePaths.push('/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code');
  } else {
    // Linux
    possiblePaths.push('/usr/bin/code');
    possiblePaths.push('/usr/local/bin/code');
    possiblePaths.push('/snap/bin/code');
  }

  for (const codePath of possiblePaths) {
    if (fs.existsSync(codePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Open folder with specified tool
 */
async function openFolderWithTool(folderPath: string, tool: 'vscode' | 'terminal' | 'explorer'): Promise<void> {
  const platform = process.platform;

  switch (tool) {
    case 'vscode': {
      const vsChild = spawn('code', [folderPath], { detached: true, stdio: 'ignore' });
      vsChild.unref();
      vsChild.on('error', async () => {
        const codePath = await findVSCodeExecutable();
        if (codePath) {
          // On Windows, .cmd/.bat files must be spawned with shell: true
          const useShell = platform === 'win32' && /\.(cmd|bat)$/i.test(codePath);
          const fallback = spawn(codePath, [folderPath], { detached: true, stdio: 'ignore', shell: useShell });
          fallback.unref();
          fallback.on('error', () => {
            shell.openPath(folderPath).catch(() => {});
          });
        } else {
          await shell.openPath(folderPath);
        }
      });
      break;
    }

    case 'terminal': {
      if (platform === 'win32') {
        // Windows: Use PowerShell via cmd /c start
        // Using 'start' command ensures PowerShell opens in a visible window
        const child = spawn(
          'cmd.exe',
          [
            '/c',
            'start',
            'powershell.exe',
            '-NoExit',
            '-Command',
            `Set-Location -LiteralPath '${folderPath.replace(/'/g, "''")}'`,
          ],
          {
            detached: true,
            windowsHide: false,
          }
        );
        child.on('error', (err) => {
          console.error('[shellBridge] Failed to spawn PowerShell:', err);
        });
        child.unref();
      } else if (platform === 'darwin') {
        // macOS: Open Terminal
        const child = spawn('open', ['-a', 'Terminal', folderPath], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      } else {
        // Linux: Try common terminal emulators
        const terminals = ['gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'terminator'];
        let opened = false;

        for (const term of terminals) {
          if (await commandExists(term)) {
            const args = term === 'gnome-terminal' ? [`--working-directory=${folderPath}`] : [folderPath];
            const child = spawn(term, args, { detached: true, stdio: 'ignore' });
            child.unref();
            opened = true;
            break;
          }
        }

        if (!opened) {
          // Fallback to xdg-open
          await shell.openPath(folderPath);
        }
      }
      break;
    }

    case 'explorer':
    default: {
      // Open in file explorer/finder
      if (platform === 'darwin') {
        spawn('open', [folderPath], { detached: true, stdio: 'ignore' });
      } else if (platform === 'linux') {
        spawn('xdg-open', [folderPath], { detached: true, stdio: 'ignore' });
      } else {
        // Windows and fallback
        await shell.openPath(folderPath);
      }
      break;
    }
  }
}

/**
 * Find VS Code executable path
 */
async function findVSCodeExecutable(): Promise<string | null> {
  const platform = process.platform;
  const possiblePaths: string[] = [];

  if (platform === 'win32') {
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    if (programFiles) {
      possiblePaths.push(path.join(programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (programFilesX86) {
      possiblePaths.push(path.join(programFilesX86, 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
    if (localAppData) {
      possiblePaths.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'));
    }
  } else if (platform === 'darwin') {
    possiblePaths.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code');
  } else {
    possiblePaths.push('/usr/bin/code');
    possiblePaths.push('/usr/local/bin/code');
    possiblePaths.push('/snap/bin/code');
  }

  for (const codePath of possiblePaths) {
    if (fs.existsSync(codePath)) {
      return codePath;
    }
  }

  return null;
}

export function initShellBridge(): void {
  ipcBridge.shell.openFile.provider(async (path) => {
    try {
      const errorMessage = await shell.openPath(path);
      if (errorMessage) {
        console.warn(`[shellBridge] Failed to open path: ${errorMessage}`);
      }
    } catch (error) {
      console.warn(`[shellBridge] Failed to open path:`, (error as Error).message);
    }
  });

  ipcBridge.shell.showItemInFolder.provider((path) => {
    shell.showItemInFolder(path);
    return Promise.resolve();
  });

  ipcBridge.shell.openExternal.provider(async (url) => {
    try {
      new URL(url);
    } catch {
      console.warn(`[shellBridge] Invalid URL passed to openExternal: ${url}`);
      return;
    }
    try {
      await shell.openExternal(url);
    } catch (error) {
      console.warn(`[shellBridge] Failed to open external URL: ${url}`, (error as Error).message);
    }
  });

  // Check if a tool is installed
  ipcBridge.shell.checkToolInstalled.provider(async ({ tool }) => {
    switch (tool) {
      case 'vscode':
        return isVSCodeInstalled();
      case 'terminal': {
        if (process.platform === 'win32') {
          // On Windows, PowerShell is always available (or fallback to CMD)
          return true;
        }
        // Terminal is always available on macOS and Linux
        return true;
      }
      case 'explorer':
        // File explorer is always available
        return true;
      default:
        return false;
    }
  });

  ipcBridge.shell.runOplCommand.provider(async ({ args }) => {
    const run = () => runOplCli(args);
    return shouldQueueOplCommand(args) ? enqueueOplCommand(run) : run();
  });
  ipcBridge.shell.configureOplCodex.provider(async ({ apiKey }) => enqueueOplCommand(() => configureOplCodex(apiKey)));
  ipcBridge.shell.readOplFirstRunLog.provider(async () => readOplFirstRunLog());
  ipcBridge.shell.appendOplFirstRunLog.provider(async ({ eventType, payload }) =>
    appendOplFirstRunLog(eventType, payload)
  );
  ipcBridge.shell.getOplFullRuntimeStatus.provider(async () => {
    const runtimeHome = process.env.OPL_FULL_RUNTIME_HOME?.trim() || null;
    return {
      active: Boolean(runtimeHome),
      runtimeHome,
    };
  });
  ipcBridge.shell.prepareCommandLineTools.provider(async () => prepareCommandLineTools());

  // Open folder with specified tool
  ipcBridge.shell.openFolderWith.provider(async ({ folderPath, tool }) => {
    try {
      await openFolderWithTool(folderPath, tool);
    } catch (error) {
      console.error(`[shellBridge] Failed to open folder with ${tool}:`, error);
      // Fallback to default shell open
      await shell.openPath(folderPath);
    }
  });
}

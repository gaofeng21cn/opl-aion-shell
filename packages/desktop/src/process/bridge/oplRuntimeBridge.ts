/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ipcBridge } from '@/common';
import type {
  IOplConfigureCodexRequest,
  IOplRuntimeActionRequest,
  IOplAppStateProfile,
  IOplRuntimeCommandResult,
  IOplRuntimeDetailLevel,
  IOplUpdateComponentRequest,
  IOplUpdateRepairRequest,
} from '@/common/adapter/ipcBridge';

type RuntimeCommandSpec = {
  args: string[];
  surface: IOplRuntimeCommandResult['surface'];
  stdin?: string;
  redactedCommand?: string;
};

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const OPL_BOOTSTRAP_MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const OPL_COMMAND_TIMEOUT_MS = 30_000;
const OPL_BOOTSTRAP_TIMEOUT_MS = 900_000;
const MANAGED_NODE_VERSION = 'v22.21.1';
const STANDARD_BOOTSTRAP_RESOURCE = 'opl-install.sh';
let standardBootstrapCompleted = false;

const OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT = {
  adapterId: 'aionui',
  adapterRole: 'replaceable_gui_shell_adapter',
  appContractOwner: 'one-person-lab-app',
  protocolOwner: 'one-person-lab',
  implementationRepo: 'opl-aion-shell',
  contractRef: 'one-person-lab-app/contracts/app-runtime-bridge.json',
  guiProductContractRef: 'one-person-lab-app/contracts/app-gui-product-contract.json',
  ownsRuntimeTruth: false,
  ownsDomainTruth: false,
  readsArtifactBody: false,
  readsMemoryBody: false,
  defaultOperatorPayload: 'current_owner_delta',
  defaultReadSurfacePolicy: {
    defaultProjection: 'opl_current_owner_delta',
    sourcePath: 'app_state.operator.default_read_surface_policy',
    fullDetailPolicy: 'explicit_full_detail_or_lazy_diagnostic_only',
    rawRefsPolicy: 'raw_refs_require_explicit_full_detail',
    fullDetailAutoPoll: false,
    shellMustNotUseFullDrilldownAsNormalState: true,
    shellMustNotDeriveLayoutFromRawRuntimeProjection: true,
    forbiddenDefaultStateFields: [
      'runtime_tray_snapshot',
      'raw_evidence_envelope',
      'stage_replay_packet_body',
      'private_residue_inventory_body',
      'provider_internal_ledger_body',
    ],
  },
  primarySurfaces: [
    'opl app state --profile fast --json',
    'opl app state --profile full --json',
    'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
  ],
  diagnosticExceptionSurfaces: [
    'opl runtime app-operator-drilldown --json',
    'opl runtime app-operator-drilldown --detail full --json',
  ],
  allowedSurfaces: [
    'opl app state --profile fast --json',
    'opl app state --profile full --json',
    'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
    'opl runtime app-operator-drilldown --json',
    'opl runtime app-operator-drilldown --detail full --json',
    'opl system initialize --json',
    'opl install --skip-gui-open --skip-modules --skip-native-helper-repair --json',
    'opl system configure-codex --api-key-stdin --json',
    'opl system startup-maintenance --json',
    'opl system reconcile-modules --json',
    'opl update status --json',
    'opl update check --json',
    'opl update plan --json',
    'opl update apply --component <component_id> --json',
    'opl update repair --receipt <receipt_id> --json',
    'opl update repair --component <component_id> --json',
    'opl update rollback --component <component_id> --json',
  ],
  forbiddenTruthSources: [
    'direct_domain_repo_reads',
    'direct_runtime_state_file_reads',
    'direct_opl_modules_page_aggregation',
    'direct_opl_system_developer_supervisor_page_aggregation',
    'direct_family_runtime_worker_status_page_aggregation',
    'domain_artifact_body_reads',
    'domain_memory_body_reads',
    'shell_private_runtime_status',
  ],
} as const;

type ProcessWithResourcesPath = NodeJS.Process & {
  resourcesPath?: string;
};

type SpawnCommandSpec = {
  command: string;
  args: string[];
  redactedCommand: string;
};

type BuildStandardBootstrapEnvInput = {
  baseEnv?: NodeJS.ProcessEnv;
  homeDir?: string;
  platform?: NodeJS.Platform;
  arch?: string;
};

function assertActionId(actionId: string): string {
  const normalized = actionId.trim();
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL runtime action id');
  }
  return normalized;
}

function assertUpdateComponentId(componentId: string): string {
  const normalized = componentId.trim();
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL update component id');
  }
  return normalized;
}

function assertUpdateReceiptId(receiptId: string): string {
  const normalized = receiptId.trim();
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL update receipt id');
  }
  return normalized;
}

function buildAppStateCommand(profile: IOplAppStateProfile): RuntimeCommandSpec {
  return {
    surface: profile === 'full' ? 'app_state_full' : 'app_state_fast',
    args: ['app', 'state', '--profile', profile, '--json'],
  };
}

function buildDrilldownCommand(detail: IOplRuntimeDetailLevel): RuntimeCommandSpec {
  if (detail === 'summary') {
    return {
      surface: 'runtime_summary',
      args: ['runtime', 'app-operator-drilldown', '--json'],
    };
  }
  if (detail === 'full') {
    return {
      surface: 'runtime_full',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    };
  }
  throw new Error('Unsupported OPL runtime drilldown detail level.');
}

function buildActionCommand(request: IOplRuntimeActionRequest): RuntimeCommandSpec {
  const args = ['app', 'action', 'execute', '--action', assertActionId(request.actionId)];
  if (request.dryRun) {
    args.push('--dry-run');
  }
  if (request.payloadRefsOnlyJson && Object.keys(request.payloadRefsOnlyJson).length > 0) {
    args.push('--payload', JSON.stringify(request.payloadRefsOnlyJson));
  }
  args.push('--json');
  return { surface: 'app_action', args };
}

function buildInitializeCommand(): RuntimeCommandSpec {
  return { surface: 'system_initialize', args: ['system', 'initialize', '--json'] };
}

function buildInstallPrepCommand(): RuntimeCommandSpec {
  return {
    surface: 'install_prep',
    args: ['install', '--skip-gui-open', '--skip-modules', '--skip-native-helper-repair', '--json'],
  };
}

function buildConfigureCodexCommand(request: IOplConfigureCodexRequest): RuntimeCommandSpec {
  const apiKey = request.apiKey.trim();
  if (!apiKey) {
    throw new Error('Codex API key is required.');
  }
  return {
    surface: 'configure_codex',
    args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
    stdin: `${apiKey}\n`,
    redactedCommand: 'opl system configure-codex --api-key-stdin --json',
  };
}

function buildStartupMaintenanceCommand(): RuntimeCommandSpec {
  return { surface: 'startup_maintenance', args: ['system', 'startup-maintenance', '--json'] };
}

function buildReconcileModulesCommand(): RuntimeCommandSpec {
  return { surface: 'reconcile_modules', args: ['system', 'reconcile-modules', '--json'] };
}

function buildUpdateStatusCommand(): RuntimeCommandSpec {
  return { surface: 'update_status', args: ['update', 'status', '--json'] };
}

function buildUpdateCheckCommand(): RuntimeCommandSpec {
  return { surface: 'update_check', args: ['update', 'check', '--json'] };
}

function buildUpdatePlanCommand(): RuntimeCommandSpec {
  return { surface: 'update_plan', args: ['update', 'plan', '--json'] };
}

function buildUpdateApplyCommand(request: IOplUpdateComponentRequest): RuntimeCommandSpec {
  return {
    surface: 'update_apply',
    args: ['update', 'apply', '--component', assertUpdateComponentId(request.componentId), '--json'],
  };
}

function buildUpdateRepairCommand(request: IOplUpdateRepairRequest): RuntimeCommandSpec {
  if (request.receiptId) {
    return {
      surface: 'update_repair',
      args: ['update', 'repair', '--receipt', assertUpdateReceiptId(request.receiptId), '--json'],
    };
  }
  if (request.componentId) {
    return {
      surface: 'update_repair',
      args: ['update', 'repair', '--component', assertUpdateComponentId(request.componentId), '--json'],
    };
  }
  throw new Error('OPL update repair requires a receipt or component id.');
}

function buildUpdateRollbackCommand(request: IOplUpdateComponentRequest): RuntimeCommandSpec {
  return {
    surface: 'update_rollback',
    args: ['update', 'rollback', '--component', assertUpdateComponentId(request.componentId), '--json'],
  };
}

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function commandFailureResult(
  spec: RuntimeCommandSpec,
  command: string,
  message: string,
  error: Partial<NonNullable<IOplRuntimeCommandResult['error']>> = {}
): IOplRuntimeCommandResult {
  return {
    surface: spec.surface,
    command,
    stdout: '',
    parsed: null,
    ok: false,
    error: {
      message,
      ...error,
    },
  };
}

function isNoSuchOplCommandError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ('code' in error ? (error as NodeJS.ErrnoException).code === 'ENOENT' : false) &&
    'path' in error &&
    (error as NodeJS.ErrnoException & { path?: unknown }).path === 'opl'
  );
}

function shouldAutoBootstrapOplCommand(spec: RuntimeCommandSpec): boolean {
  return ['system_initialize', 'install_prep', 'configure_codex', 'startup_maintenance', 'reconcile_modules'].includes(
    spec.surface
  );
}

function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME?.trim() || os.homedir();
}

function resolveManagedNodeBin(input: BuildStandardBootstrapEnvInput): string | null {
  const platform = input.platform ?? process.platform;
  if (platform !== 'darwin') {
    return null;
  }
  const arch = input.arch ?? process.arch;
  const nodeArch = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : null;
  if (!nodeArch) {
    return null;
  }
  const homeDir = input.homeDir ?? resolveHomeDir(input.baseEnv);
  const nodeBin = path.join(homeDir, '.opl', 'toolchain', `node-${MANAGED_NODE_VERSION}-darwin-${nodeArch}`, 'bin');
  return fs.existsSync(path.join(nodeBin, 'node')) && fs.existsSync(path.join(nodeBin, 'npm')) ? nodeBin : null;
}

function hasHealthyOplShim(binDir: string): boolean {
  const shimPath = path.join(binDir, 'opl');
  if (!fs.existsSync(shimPath)) {
    return false;
  }

  try {
    const realPath = fs.realpathSync(shimPath);
    const cliPath = path.join(path.dirname(realPath), '..', 'dist', 'cli.js');
    return fs.existsSync(cliPath) && fs.statSync(cliPath).isFile();
  } catch {
    return false;
  }
}

function shouldIncludeManagedNodeBin(nodeBin: string | null): nodeBin is string {
  if (!nodeBin) {
    return false;
  }
  const shimPath = path.join(nodeBin, 'opl');
  return !fs.existsSync(shimPath) || hasHealthyOplShim(nodeBin);
}

function normalizePathEntries(entries: Array<string | undefined | null>): string {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    for (const part of entry.split(path.delimiter)) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized.join(path.delimiter);
}

function buildStandardBootstrapEnv(input: BuildStandardBootstrapEnvInput = {}): NodeJS.ProcessEnv {
  const baseEnv = input.baseEnv ?? process.env;
  const homeDir = input.homeDir ?? resolveHomeDir(baseEnv);
  const managedOplBin = path.join(homeDir, '.opl', 'one-person-lab', 'bin');
  const managedNodeBin = resolveManagedNodeBin({ ...input, baseEnv, homeDir });
  return {
    ...baseEnv,
    HOME: homeDir,
    PATH: normalizePathEntries([
      hasHealthyOplShim(managedOplBin) ? managedOplBin : null,
      shouldIncludeManagedNodeBin(managedNodeBin) ? managedNodeBin : null,
      path.join(homeDir, '.npm-global', 'bin'),
      path.join(homeDir, '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      baseEnv.PATH,
    ]),
  };
}

function buildFullRuntimeBridgeEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv | null {
  const runtimeHome = baseEnv.OPL_FULL_RUNTIME_HOME?.trim();
  if (!runtimeHome) {
    return null;
  }

  const pathEntries = normalizePathEntries([
    path.join(runtimeHome, 'bin'),
    path.join(runtimeHome, 'node', 'bin'),
    path.join(runtimeHome, 'uv', 'bin'),
    baseEnv.PATH,
  ]);
  const hermesBin = baseEnv.OPL_HERMES_BIN?.trim() || path.join(runtimeHome, 'bin', 'hermes');
  return {
    OPL_FULL_RUNTIME_HOME: runtimeHome,
    OPL_PACKAGED_SKILLS_ROOT: baseEnv.OPL_PACKAGED_SKILLS_ROOT?.trim() || path.join(runtimeHome, 'skills'),
    OPL_CODEX_BIN: baseEnv.OPL_CODEX_BIN?.trim() || path.join(runtimeHome, 'bin', 'codex'),
    OPL_FAMILY_RUNTIME_PROVIDER: baseEnv.OPL_FAMILY_RUNTIME_PROVIDER?.trim() || 'temporal',
    OPL_MODULE_PATH_MEDAUTOSCIENCE:
      baseEnv.OPL_MODULE_PATH_MEDAUTOSCIENCE?.trim() || path.join(runtimeHome, 'modules', 'mas'),
    OPL_MODULE_PATH_MEDAUTOGRANT:
      baseEnv.OPL_MODULE_PATH_MEDAUTOGRANT?.trim() || path.join(runtimeHome, 'modules', 'mag'),
    OPL_MODULE_PATH_REDCUBE: baseEnv.OPL_MODULE_PATH_REDCUBE?.trim() || path.join(runtimeHome, 'modules', 'rca'),
    OPL_MODULE_PATH_OPLMETAAGENT:
      baseEnv.OPL_MODULE_PATH_OPLMETAAGENT?.trim() || path.join(runtimeHome, 'modules', 'meta-agent'),
    ...(fs.existsSync(hermesBin) ? { OPL_HERMES_BIN: hermesBin } : {}),
    PATH: pathEntries,
  };
}

function buildOplCommandEnv(input: BuildStandardBootstrapEnvInput = {}): NodeJS.ProcessEnv {
  const standardEnv = buildStandardBootstrapEnv(input);
  const fullRuntimeEnv = buildFullRuntimeBridgeEnv(standardEnv);
  if (!fullRuntimeEnv) {
    return standardEnv;
  }

  return {
    ...standardEnv,
    ...fullRuntimeEnv,
    PATH: normalizePathEntries([fullRuntimeEnv.PATH, standardEnv.PATH]),
  };
}

function resolvePackagedStandardInstaller(resourcesPath?: string): string | null {
  const resolvedResourcesPath = resourcesPath ?? (process as ProcessWithResourcesPath).resourcesPath ?? '';
  if (!resolvedResourcesPath) {
    return null;
  }
  const installerPath = path.join(resolvedResourcesPath, STANDARD_BOOTSTRAP_RESOURCE);
  return fs.existsSync(installerPath) && fs.statSync(installerPath).isFile() ? installerPath : null;
}

function buildStandardBootstrapCommand(installerPath: string): SpawnCommandSpec {
  return {
    command: '/bin/bash',
    args: [
      installerPath,
      '--complete',
      '--skip-modules',
      '--skip-gui-open',
      '--skip-native-helper-repair',
      '--no-online-runtime',
    ],
    redactedCommand:
      '/bin/bash <packaged-opl-install.sh> --complete --skip-modules --skip-gui-open --skip-native-helper-repair --no-online-runtime',
  };
}

async function runSpawnJsonCommand(
  commandSpec: SpawnCommandSpec & {
    surface: IOplRuntimeCommandResult['surface'];
    env?: NodeJS.ProcessEnv;
    stdin?: string;
    timeoutMs?: number;
    parseOutput?: boolean;
    maxStdoutBytes?: number;
  }
): Promise<IOplRuntimeCommandResult> {
  const displayCommand = commandSpec.redactedCommand;
  const maxStdoutBytes = commandSpec.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn(commandSpec.command, commandSpec.args, {
      env: commandSpec.env ?? process.env,
      stdio: [commandSpec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`OPL runtime command timed out: ${displayCommand}`));
    }, commandSpec.timeoutMs ?? OPL_COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > maxStdoutBytes) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGTERM');
        reject(new Error(`OPL runtime command output exceeded ${maxStdoutBytes} bytes`));
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    if (commandSpec.stdin && child.stdin) {
      child.stdin.end(commandSpec.stdin);
    }
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`OPL runtime command failed (${code}): ${stderr.trim() || displayCommand}`));
        return;
      }
      try {
        resolve({
          surface: commandSpec.surface,
          command: displayCommand,
          stdout,
          ok: true,
          parsed: commandSpec.parseOutput === false ? null : parseJson(stdout),
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function buildOplSpawnCommand(
  spec: RuntimeCommandSpec,
  env = process.env
): SpawnCommandSpec & {
  surface: IOplRuntimeCommandResult['surface'];
  env: NodeJS.ProcessEnv;
  stdin?: string;
} {
  return {
    surface: spec.surface,
    command: 'opl',
    args: spec.args,
    stdin: spec.stdin,
    env,
    redactedCommand: spec.redactedCommand ?? ['opl', ...spec.args].join(' '),
  };
}

async function runPackagedStandardBootstrap(): Promise<void> {
  if (standardBootstrapCompleted) {
    return;
  }
  const installerPath = resolvePackagedStandardInstaller();
  if (!installerPath) {
    throw new Error('Packaged OPL installer is missing; cannot run App-managed standard bootstrap.');
  }
  const bootstrap = buildStandardBootstrapCommand(installerPath);
  await runSpawnJsonCommand({
    ...bootstrap,
    surface: 'install_prep',
    env: buildOplCommandEnv(),
    timeoutMs: OPL_BOOTSTRAP_TIMEOUT_MS,
    parseOutput: false,
    maxStdoutBytes: OPL_BOOTSTRAP_MAX_STDOUT_BYTES,
  });
  standardBootstrapCompleted = true;
}

async function runOplCommand(spec: RuntimeCommandSpec): Promise<IOplRuntimeCommandResult> {
  try {
    return await runSpawnJsonCommand(buildOplSpawnCommand(spec, buildOplCommandEnv()));
  } catch (error) {
    if (!isNoSuchOplCommandError(error) || !shouldAutoBootstrapOplCommand(spec)) {
      return commandFailureResult(
        spec,
        spec.redactedCommand ?? ['opl', ...spec.args].join(' '),
        error instanceof Error ? error.message : String(error),
        {
          code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined,
        }
      );
    }
  }

  try {
    await runPackagedStandardBootstrap();
    return await runSpawnJsonCommand(buildOplSpawnCommand(spec, buildOplCommandEnv()));
  } catch (error) {
    return commandFailureResult(
      spec,
      spec.redactedCommand ?? ['opl', ...spec.args].join(' '),
      error instanceof Error ? error.message : String(error),
      {
        code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined,
      }
    );
  }
}

export function initOplRuntimeBridge(): void {
  ipcBridge.oplRuntime.getAppState.provider(({ profile }) => runOplCommand(buildAppStateCommand(profile)));
  ipcBridge.oplRuntime.getInitialize.provider(() => runOplCommand(buildInitializeCommand()));
  ipcBridge.oplRuntime.runInstallPrep.provider(() => runOplCommand(buildInstallPrepCommand()));
  ipcBridge.oplRuntime.configureCodex.provider((request) => runOplCommand(buildConfigureCodexCommand(request)));
  ipcBridge.oplRuntime.runStartupMaintenance.provider(() => runOplCommand(buildStartupMaintenanceCommand()));
  ipcBridge.oplRuntime.runReconcileModules.provider(() => runOplCommand(buildReconcileModulesCommand()));
  ipcBridge.oplRuntime.getDrilldown.provider(({ detail }) => runOplCommand(buildDrilldownCommand(detail)));
  ipcBridge.oplRuntime.executeAction.provider((request) => runOplCommand(buildActionCommand(request)));
  ipcBridge.oplRuntime.getUpdateStatus.provider(() => runOplCommand(buildUpdateStatusCommand()));
  ipcBridge.oplRuntime.runUpdateCheck.provider(() => runOplCommand(buildUpdateCheckCommand()));
  ipcBridge.oplRuntime.getUpdatePlan.provider(() => runOplCommand(buildUpdatePlanCommand()));
  ipcBridge.oplRuntime.applyUpdateComponent.provider((request) => runOplCommand(buildUpdateApplyCommand(request)));
  ipcBridge.oplRuntime.repairUpdate.provider((request) => runOplCommand(buildUpdateRepairCommand(request)));
  ipcBridge.oplRuntime.rollbackUpdateComponent.provider((request) =>
    runOplCommand(buildUpdateRollbackCommand(request))
  );
}

export const __oplRuntimeBridgeTest = {
  OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT,
  assertActionId,
  assertUpdateComponentId,
  assertUpdateReceiptId,
  buildActionCommand,
  buildAppStateCommand,
  buildConfigureCodexCommand,
  buildDrilldownCommand,
  buildInitializeCommand,
  buildInstallPrepCommand,
  buildReconcileModulesCommand,
  buildUpdateApplyCommand,
  buildUpdateCheckCommand,
  buildUpdatePlanCommand,
  buildUpdateRepairCommand,
  buildUpdateRollbackCommand,
  buildUpdateStatusCommand,
  buildFullRuntimeBridgeEnv,
  buildOplCommandEnv,
  buildStartupMaintenanceCommand,
  buildStandardBootstrapCommand,
  buildStandardBootstrapEnv,
  commandFailureResult,
  parseJson,
  runOplCommand,
  shouldAutoBootstrapOplCommand,
};

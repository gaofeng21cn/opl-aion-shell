/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { ipcBridge } from '@/common';
import type {
  IOplConfigureCodexRequest,
  IOplRuntimeActionRequest,
  IOplAppStateProfile,
  IOplRuntimeCommandResult,
  IOplRuntimeDetailLevel,
} from '@/common/adapter/ipcBridge';

type RuntimeCommandSpec = {
  args: string[];
  surface: IOplRuntimeCommandResult['surface'];
  stdin?: string;
  redactedCommand?: string;
};

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const OPL_COMMAND_TIMEOUT_MS = 30_000;
const SYSTEM_PATH_ENTRIES =
  process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

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
  allowedSurfaces: [
    'opl app state --profile fast --json',
    'opl app state --profile full --json',
    'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
    'opl runtime app-operator-drilldown --detail full --json',
    'opl system initialize --json',
    'opl install --skip-gui-open --skip-modules --skip-native-helper-repair --json',
    'opl system configure-codex --api-key-stdin --json',
    'opl system startup-maintenance --json',
    'opl system reconcile-modules --json',
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

function assertActionId(actionId: string): string {
  const normalized = actionId.trim();
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL runtime action id');
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
  if (detail === 'full') {
    return {
      surface: 'runtime_full',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    };
  }
  return buildAppStateCommand('fast');
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

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveOplCommand(): string {
  const candidates = [
    process.env.OPL_CLI_BIN,
    process.env.OPL_FULL_RUNTIME_HOME ? path.join(process.env.OPL_FULL_RUNTIME_HOME, 'bin', 'opl') : undefined,
    ...String(process.env.PATH ?? '')
      .split(path.delimiter)
      .map((entry) => (entry ? path.join(entry, process.platform === 'win32' ? 'opl.cmd' : 'opl') : '')),
    ...SYSTEM_PATH_ENTRIES.map((entry) => path.join(entry, 'opl')),
  ];
  for (const candidate of candidates) {
    if (candidate && isExecutable(candidate)) return candidate;
  }
  return 'opl';
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

async function runOplCommand(spec: RuntimeCommandSpec): Promise<IOplRuntimeCommandResult> {
  const oplCommand = resolveOplCommand();
  const command = spec.redactedCommand ?? [oplCommand, ...spec.args].join(' ');
  return new Promise((resolve) => {
    const child = spawn(oplCommand, spec.args, {
      env: process.env,
      stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
      resolve(
        commandFailureResult(spec, command, `OPL runtime command timed out: ${command}`, {
          timedOut: true,
        })
      );
    }, OPL_COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_STDOUT_BYTES) {
        child.kill('SIGTERM');
        settled = true;
        clearTimeout(timer);
        resolve(commandFailureResult(spec, command, `OPL runtime command output exceeded ${MAX_STDOUT_BYTES} bytes`));
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    if (spec.stdin && child.stdin) {
      child.stdin.end(spec.stdin);
    }
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(
        commandFailureResult(spec, command, error.message, {
          code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
        })
      );
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve(
          commandFailureResult(spec, command, `OPL runtime command failed (${code}): ${stderr.trim() || command}`, {
            stderr: stderr.trim(),
            exitCode: code,
          })
        );
        return;
      }
      try {
        resolve({
          surface: spec.surface,
          command,
          stdout,
          parsed: parseJson(stdout),
          ok: true,
        });
      } catch (error) {
        resolve(
          commandFailureResult(spec, command, error instanceof Error ? error.message : String(error), {
            stderr: stderr.trim(),
            exitCode: code,
          })
        );
      }
    });
  });
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
}

export const __oplRuntimeBridgeTest = {
  OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT,
  assertActionId,
  buildActionCommand,
  buildAppStateCommand,
  buildConfigureCodexCommand,
  buildDrilldownCommand,
  buildInitializeCommand,
  buildInstallPrepCommand,
  buildReconcileModulesCommand,
  buildStartupMaintenanceCommand,
  commandFailureResult,
  parseJson,
  resolveOplCommand,
  runOplCommand,
};

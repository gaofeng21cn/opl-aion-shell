/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ipcBridge } from '@/common';
import { OPL_PRODUCT_PROFILE } from '@/common/config/oplProductProfile';
import { resolveUpdaterReleaseChannel, type UpdaterReleaseChannel } from '@/common/update/updateChannel';
import { getWindowsWslRuntime, type WindowsWslRuntimeExecution } from '@/process/services/runtime-execution';
import type {
  IOplConfigureCodexRequest,
  IOplDomainDetailViewRequest,
  IOplGatewayAccountErrorCode,
  IOplGatewayAccountLoginRequest,
  IOplGatewayAccountMutationResult,
  IOplOfficialProfileApplyRequest,
  IOplPackageContributionRequest,
  IOplRuntimeActionRequest,
  IOplAppStateProfile,
  IOplRuntimeCommandResult,
  IOplRuntimeDetailLevel,
  IOplStartupMaintenanceCompletedEvent,
  IOplSystemInitializeEvent,
  IOplUpdateComponentRequest,
  IOplUpdateRepairRequest,
} from '@/common/adapter/ipcBridge';
import {
  readActiveChannelProviderAppStatePatch,
  runActiveChannelProviderAccess,
} from '../services/codexAppServer/channelProviderHost';
import {
  readActiveRemoteCompanionAppStatePatch,
  runActiveRemoteCompanionAccess,
} from '../services/remote-companion/remoteCompanionConnectorHost';

type RuntimeCommandSpec = {
  args: string[];
  surface: IOplRuntimeCommandResult['surface'];
  stdin?: string;
  redactedCommand?: string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
};

type DesktopStartupMaintenanceDependencies = {
  emitCompleted?: (event: IOplStartupMaintenanceCompletedEvent) => void;
  logInfo?: (message: string) => void;
  logWarn?: (message: string) => void;
  now?: () => Date;
  runCommand?: (spec: RuntimeCommandSpec) => Promise<IOplRuntimeCommandResult>;
};

type OplUpdateChannelReaderDependencies = {
  runCommand?: (spec: RuntimeCommandSpec) => Promise<IOplRuntimeCommandResult>;
};

type OplDeveloperSupervisorEnabled = 'auto' | 'on' | 'off';
type OplDeveloperSupervisorMode = 'external_observe' | 'developer_apply_safe';
type OplDeveloperSupervisorConfig = {
  enabled: OplDeveloperSupervisorEnabled;
  mode: OplDeveloperSupervisorMode;
  autoEnableGithubLogin: string;
};

type DeveloperModeGithubIdentity = {
  status: 'ready' | 'unavailable';
  login: string | null;
};

type OplCliEntrypoints = {
  sourceCli: string | null;
  distCli: string | null;
};

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const DOMAIN_DETAIL_VIEW_MAX_STDOUT_BYTES = 9 * 1024 * 1024;
const OPL_BOOTSTRAP_MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const OPL_COMMAND_TIMEOUT_MS = 30_000;
const OPL_INITIALIZE_TIMEOUT_MS = 120_000;
const OPL_STARTUP_MAINTENANCE_TIMEOUT_MS = 120_000;
const OPL_MANAGED_UPDATE_READ_TIMEOUT_MS = 120_000;
const OPL_BOOTSTRAP_TIMEOUT_MS = 900_000;
const MANAGED_NODE_VERSION = 'v22.21.1';
const STANDARD_BOOTSTRAP_RESOURCE = 'opl-install.sh';
const OPL_FRAMEWORK_REPO_NAME = 'one-person-lab';
const OPL_APP_REQUIRED_FRAMEWORK_API_RANGE = 'p19.stage-runtime';
const OPL_APP_REQUIRED_FRAMEWORK_CAPABILITY_IDS = ['opl_dynamic_package_directory'] as const;
const OPL_FRAMEWORK_RUNTIME_CAPABILITY_CONTRACT_PATH = [
  'contracts',
  'opl-framework',
  'app-runtime-fast-work-item-projection-contract.json',
] as const;
const OPL_FRAMEWORK_COMPONENT_COMPATIBILITY_CONTRACT_PATH = [
  'contracts',
  'opl-framework',
  'app-component-compatibility-receipt-contract.json',
] as const;
const OPL_FRAMEWORK_MISSING_CAPABILITY_ERROR_CODE = 'incompatible_missing_required_capability';
const OFFICIAL_PROFILE_FIRST_INSTALL_MARKER = '.official-profile-first-install-complete';
let standardBootstrapCompleted = false;
let standardBootstrapInFlight: Promise<void> | null = null;
let desktopStartupMaintenanceTask: Promise<IOplRuntimeCommandResult> | null = null;
let oplAppProcessInstanceId = randomUUID();
let cachedDeveloperModeGithubIdentity: {
  key: string;
  value: DeveloperModeGithubIdentity;
} | null = null;
const MANAGED_UPDATE_COMPONENT_IDS = new Set(['opl_base', 'opl_app', 'opl_packages']);
const APPLY_ALLOWED_UPDATE_COMPONENT_IDS = new Set(['opl_base']);

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
    'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json',
    'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
    'opl app contribution read --package-id <package_id> --ref <data_ref> --input-stdin --json',
    'opl app contribution execute --package-id <package_id> --ref <action_ref> --confirm --input-stdin --json',
  ],
  diagnosticExceptionSurfaces: [
    'opl runtime app-operator-drilldown --json',
    'opl runtime app-operator-drilldown --detail full --json',
  ],
  allowedSurfaces: [
    'opl app state --profile fast --json',
    'opl app state --profile full --json',
    'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json',
    'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
    'opl app contribution read --package-id <package_id> --ref <data_ref> --input-stdin --json',
    'opl app contribution execute --package-id <package_id> --ref <action_ref> --confirm --input-stdin --json',
    'opl runtime app-operator-drilldown --json',
    'opl runtime app-operator-drilldown --detail full --json',
    'opl system initialize --events --json',
    'opl system initialize --json',
    'opl install --headless --skip-packages --json',
    'opl system configure-codex --api-key-stdin --json',
    'opl connect gateway login --credentials-stdin --json',
    'opl system startup-maintenance --json',
    'opl update status --json',
    'opl update check --json',
    'opl update plan --json',
    'opl update apply --json',
    'opl update repair [--receipt <receipt_id>] --json',
    'opl update rollback --json',
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
  launch?: () => {
    child: ChildProcessWithoutNullStreams;
    terminate: (graceMs?: number) => Promise<void>;
    finalize?: () => Promise<void>;
  };
};

type ResolvedOplCli = {
  command: string;
  argsPrefix: string[];
  env: NodeJS.ProcessEnv;
  source: string;
};

type OplFrameworkCarrierReceipt = {
  selected_carrier:
    | 'developer_checkout'
    | 'packaged_full_runtime'
    | 'system_homebrew_formula'
    | 'framework_managed_install';
  framework_version: string;
  framework_api_version: string;
  app_required_api_range: string;
  producer_capability_ids: string[];
  required_capability_ids: string[];
  missing_required_capability_ids: string[];
  compatibility_status: 'compatible' | 'incompatible_missing_required_capability';
  selection_status: 'active' | 'pre_formula_transition';
  active_framework_count: 1;
};

type ResolvedOplFrameworkCarrier = {
  packageRoot: string;
  receipt: OplFrameworkCarrierReceipt;
};

class OplFrameworkCapabilityError extends Error {
  readonly code = OPL_FRAMEWORK_MISSING_CAPABILITY_ERROR_CODE;
  readonly receipt: OplFrameworkCarrierReceipt;

  constructor(receipt: OplFrameworkCarrierReceipt) {
    super(
      `Selected OPL Framework carrier is missing App-required capabilities: ${receipt.missing_required_capability_ids.join(', ')}.`
    );
    this.name = 'OplFrameworkCapabilityError';
    this.receipt = receipt;
  }
}

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

function assertPackageContributionId(value: string, field: 'package id' | 'ref'): string {
  const normalized = value.trim();
  const pattern =
    field === 'package id'
      ? /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
      : /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:#[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)?$/;
  if (!pattern.test(normalized)) {
    throw new Error(`Invalid OPL package contribution ${field}`);
  }
  return normalized;
}

function assertPackageContributionInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OPL package contribution input must be an object');
  }
  return value as Record<string, unknown>;
}

function assertDomainDetailItemId(itemId: string): string {
  const normalized = itemId.trim();
  if (normalized.length > 512 || normalized.includes('..') || !/^[A-Za-z0-9._:@%-]+$/.test(normalized)) {
    throw new Error('Invalid OPL domain detail item id');
  }
  return normalized;
}

function assertDomainDetailViewId(viewId: string): string {
  const normalized = viewId.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error('Invalid OPL domain detail view id');
  }
  return normalized;
}

function assertDomainDetailRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('Invalid OPL domain detail revision');
  }
  return revision;
}

function assertUpdateComponentId(componentId: string): string {
  const normalized = componentId.trim();
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL update component id');
  }
  if (!MANAGED_UPDATE_COMPONENT_IDS.has(normalized)) {
    throw new Error('OPL managed update lifecycle id must be opl_base, opl_app, or opl_packages');
  }
  return normalized;
}

function assertApplyUpdateComponentId(componentId: string): string {
  const normalized = assertUpdateComponentId(componentId);
  if (!APPLY_ALLOWED_UPDATE_COMPONENT_IDS.has(normalized)) {
    if (normalized === 'opl_packages') {
      throw new Error(
        'Package lifecycle mutations require a Framework projected action through opl app action execute'
      );
    }
    throw new Error('opl_app updates must use the host or carrier updater');
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

export async function readOplAppUpdaterReleaseChannel(
  dependencies: OplUpdateChannelReaderDependencies = {}
): Promise<UpdaterReleaseChannel> {
  const result = await (dependencies.runCommand ?? runOplCommand)(buildAppStateCommand('fast'));
  return result.ok ? resolveUpdaterReleaseChannel(result.parsed) : 'stable';
}

function buildDomainDetailViewCommand(request: IOplDomainDetailViewRequest): RuntimeCommandSpec {
  const args = [
    'app',
    'view',
    'read',
    '--item-id',
    assertDomainDetailItemId(request.itemId),
    '--view-id',
    assertDomainDetailViewId(request.viewId),
  ];
  if (request.ifRevision !== undefined) {
    args.push('--if-revision', String(assertDomainDetailRevision(request.ifRevision)));
  }
  args.push('--json');
  return { surface: 'domain_detail_view', args, maxStdoutBytes: DOMAIN_DETAIL_VIEW_MAX_STDOUT_BYTES };
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
  if (request.payloadRefsOnlyJson && request.payloadJson) {
    throw new Error('OPL runtime action accepts only one payload source.');
  }
  if (request.dryRun) {
    args.push('--dry-run');
  }
  if (request.payloadRefsOnlyJson && Object.keys(request.payloadRefsOnlyJson).length > 0) {
    args.push('--payload', JSON.stringify(request.payloadRefsOnlyJson));
  }
  if (request.payloadJson && Object.keys(request.payloadJson).length > 0) {
    args.push('--payload-stdin');
  }
  args.push('--json');
  return {
    surface: 'app_action',
    args,
    ...(request.payloadJson
      ? {
          stdin: JSON.stringify(request.payloadJson),
          redactedCommand: `opl app action execute --action ${assertActionId(request.actionId)} --payload-stdin --json`,
        }
      : {}),
  };
}

function buildPackageContributionCommand(request: IOplPackageContributionRequest): RuntimeCommandSpec {
  if (request.operation !== 'read' && request.operation !== 'execute') {
    throw new Error('Unsupported OPL package contribution operation');
  }
  const packageId = assertPackageContributionId(request.packageId, 'package id');
  const ref = assertPackageContributionId(request.ref, 'ref');
  const input = assertPackageContributionInput(request.input ?? {});
  const args = ['app', 'contribution', request.operation, '--package-id', packageId, '--ref', ref];
  if (request.operation === 'execute' && request.confirmed === true) args.push('--confirm');
  args.push('--input-stdin', '--json');
  return {
    surface: request.operation === 'read' ? 'package_contribution_read' : 'package_contribution_execute',
    args,
    stdin: JSON.stringify(input),
    redactedCommand: `opl app contribution ${request.operation} --package-id ${packageId} --ref ${ref} --input-stdin --json`,
  };
}

function channelProviderHostResult(
  request: IOplPackageContributionRequest,
  parsed: Readonly<Record<string, unknown>>
): IOplRuntimeCommandResult {
  return {
    surface: request.operation === 'read' ? 'package_contribution_read' : 'package_contribution_execute',
    command: 'opl.connect.channel-provider-host',
    stdout: JSON.stringify(parsed),
    parsed,
    ok: true,
  };
}

function remoteCompanionHostResult(
  request: IOplPackageContributionRequest,
  parsed: Readonly<Record<string, unknown>>
): IOplRuntimeCommandResult {
  return {
    surface: request.operation === 'read' ? 'package_contribution_read' : 'package_contribution_execute',
    command: 'opl.connect.remote-companion-connector-host',
    stdout: JSON.stringify(parsed),
    parsed,
    ok: true,
  };
}

function mergeChannelProviderAppStatePatch(
  result: IOplRuntimeCommandResult,
  patch: Readonly<Record<string, unknown>> | undefined
): IOplRuntimeCommandResult {
  if (!patch || !isRecord(result.parsed) || !isRecord(patch.ui_contributions)) return result;
  const parsed = result.parsed;
  const nestedAppState = isRecord(parsed.app_state) ? parsed.app_state : null;
  const appState = nestedAppState ?? parsed;
  const baseProjection = isRecord(appState.ui_contributions) ? appState.ui_contributions : {};
  const baseEntries = Array.isArray(baseProjection.entries) ? baseProjection.entries.filter(isRecord) : [];
  const hostEntries = Array.isArray(patch.ui_contributions.entries)
    ? patch.ui_contributions.entries.filter(isRecord)
    : [];
  const isChannelAccess = (entry: Record<string, unknown>) =>
    isRecord(entry.view) && entry.view.view_type === 'channel_access';
  const entries = [...baseEntries.filter((entry) => !isChannelAccess(entry)), ...hostEntries];
  const slots = Object.fromEntries(
    ['composer.palette', 'runtime.detail', 'settings.section'].map((slot) => [
      slot,
      entries.filter((entry) => entry.slot === slot),
    ])
  );
  const uiContributions = {
    ...baseProjection,
    ...patch.ui_contributions,
    contribution_count: entries.length,
    entries,
    slots,
  };
  const hostTransportBindings = isRecord(patch.transport_bindings) ? patch.transport_bindings : null;
  const mergedAppState = {
    ...appState,
    ui_contributions: uiContributions,
    ...(hostTransportBindings ? { transport_bindings: hostTransportBindings } : {}),
  };
  const mergedParsed = nestedAppState ? { ...parsed, app_state: mergedAppState } : mergedAppState;
  return {
    ...result,
    stdout: JSON.stringify(mergedParsed),
    parsed: mergedParsed,
  };
}

function mergeRemoteCompanionAppStatePatch(
  result: IOplRuntimeCommandResult,
  patch: Readonly<Record<string, unknown>> | undefined
): IOplRuntimeCommandResult {
  if (!patch || !isRecord(result.parsed) || !isRecord(patch.ui_contributions)) return result;
  const parsed = result.parsed;
  const nestedAppState = isRecord(parsed.app_state) ? parsed.app_state : null;
  const appState = nestedAppState ?? parsed;
  const baseProjection = isRecord(appState.ui_contributions) ? appState.ui_contributions : {};
  const baseEntries = Array.isArray(baseProjection.entries) ? baseProjection.entries.filter(isRecord) : [];
  const hostEntries = Array.isArray(patch.ui_contributions.entries)
    ? patch.ui_contributions.entries.filter(isRecord)
    : [];
  const isRemoteCompanionAccess = (entry: Record<string, unknown>) =>
    isRecord(entry.view) && entry.view.view_type === 'remote_companion_access';
  const entries = [...baseEntries.filter((entry) => !isRemoteCompanionAccess(entry)), ...hostEntries];
  const slots = Object.fromEntries(
    ['composer.palette', 'runtime.detail', 'settings.section'].map((slot) => [
      slot,
      entries.filter((entry) => entry.slot === slot),
    ])
  );
  const uiContributions = {
    ...baseProjection,
    ...patch.ui_contributions,
    contribution_count: entries.length,
    entries,
    slots,
  };
  const mergedAppState = {
    ...appState,
    ui_contributions: uiContributions,
    ...(patch.remote_companion === undefined ? {} : { remote_companion: patch.remote_companion }),
  };
  const mergedParsed = nestedAppState ? { ...parsed, app_state: mergedAppState } : mergedAppState;
  return {
    ...result,
    stdout: JSON.stringify(mergedParsed),
    parsed: mergedParsed,
  };
}

async function runAppStateRequest(profile: IOplAppStateProfile): Promise<IOplRuntimeCommandResult> {
  const result = await runOplCommand(buildAppStateCommand(profile));
  if (result.ok === false) return result;
  const withChannelProvider = mergeChannelProviderAppStatePatch(result, await readActiveChannelProviderAppStatePatch());
  return mergeRemoteCompanionAppStatePatch(withChannelProvider, await readActiveRemoteCompanionAppStatePatch());
}

async function runPackageContributionRequest(
  request: IOplPackageContributionRequest
): Promise<IOplRuntimeCommandResult> {
  const packageId = assertPackageContributionId(request.packageId, 'package id');
  const ref = assertPackageContributionId(request.ref, 'ref');
  const input = assertPackageContributionInput(request.input ?? {});
  const remoteCompanion = await runActiveRemoteCompanionAccess(
    {
      package_id: packageId,
      ref,
      input,
      ...(request.confirmed === true ? { confirmed: true } : {}),
    },
    request.operation
  );
  if (remoteCompanion) return remoteCompanionHostResult(request, remoteCompanion);
  const direct = await runActiveChannelProviderAccess(
    {
      package_id: packageId,
      ref,
      input,
      ...(request.confirmed === true ? { confirmed: true } : {}),
    },
    request.operation
  );
  if (direct) return channelProviderHostResult(request, direct);
  return runOplCommand(buildPackageContributionCommand(request));
}

function channelAccessActionRequest(request: IOplRuntimeActionRequest): IOplPackageContributionRequest | undefined {
  if (request.actionId !== 'package_contribution_execute' || !request.payloadJson) return undefined;
  const payload = request.payloadJson;
  if (typeof payload.package_id !== 'string' || typeof payload.ref !== 'string') {
    throw new Error('Package contribution action requires package_id and ref.');
  }
  return {
    packageId: assertPackageContributionId(payload.package_id, 'package id'),
    ref: assertPackageContributionId(payload.ref, 'ref'),
    operation: 'execute',
    input: assertPackageContributionInput(payload.input ?? {}),
    ...(payload.confirmed === true ? { confirmed: true } : {}),
  };
}

async function runRuntimeActionRequest(request: IOplRuntimeActionRequest): Promise<IOplRuntimeCommandResult> {
  const channelRequest = channelAccessActionRequest(request);
  if (channelRequest) {
    const packageId = channelRequest.packageId;
    const ref = channelRequest.ref;
    const remoteCompanion = await runActiveRemoteCompanionAccess(
      {
        package_id: packageId,
        ref,
        input: channelRequest.input ?? {},
        ...(channelRequest.confirmed === true ? { confirmed: true } : {}),
      },
      'execute'
    );
    if (remoteCompanion) return remoteCompanionHostResult(channelRequest, remoteCompanion);
    const direct = await runActiveChannelProviderAccess(
      {
        package_id: packageId,
        ref,
        input: channelRequest.input ?? {},
        ...(channelRequest.confirmed === true ? { confirmed: true } : {}),
      },
      'execute'
    );
    if (direct) return channelProviderHostResult(channelRequest, direct);
  }
  return runOplCommand(buildActionCommand(request));
}

function buildOfficialProfileApplyCommand(
  request: IOplOfficialProfileApplyRequest,
  resourcesPath?: string
): SpawnCommandSpec & { surface: 'app_action'; env: NodeJS.ProcessEnv; timeoutMs: number } {
  if (request.intent !== 'first_install' && request.intent !== 'explicit_restore') {
    throw new Error('Official Profile may only be applied for first_install or explicit_restore.');
  }
  const resolvedResourcesPath = resourcesPath ?? (process as ProcessWithResourcesPath).resourcesPath ?? '';
  const scriptPath = path.join(resolvedResourcesPath, 'official-profile-package-apply.ts');
  if (!resolvedResourcesPath || !pathExistsFile(scriptPath)) {
    throw new Error('Packaged Official Profile apply script is missing.');
  }
  const rootPackageIds = OPL_PRODUCT_PROFILE.official_profile.desired_root_package_ids;
  const nodeCommand = resolveNodeCommand(buildOplCommandEnv());
  return {
    surface: 'app_action',
    command: nodeCommand.command,
    args: [
      '--experimental-strip-types',
      scriptPath,
      '--intent',
      request.intent,
      ...rootPackageIds.flatMap((packageId) => ['--root-package-id', packageId]),
    ],
    env: nodeCommand.env,
    timeoutMs: OPL_STARTUP_MAINTENANCE_TIMEOUT_MS,
    redactedCommand: `node <official-profile-package-apply.ts> --intent ${request.intent} --root-package-id <profile-roots>`,
  };
}

type OfficialProfileApplyDependencies = {
  markerPath?: string;
  resourcesPath?: string;
  runCommand?: (command: ReturnType<typeof buildOfficialProfileApplyCommand>) => Promise<IOplRuntimeCommandResult>;
};

function resolveOfficialProfileFirstInstallMarker(env: NodeJS.ProcessEnv = buildOplCommandEnv()): string {
  return path.join(resolveOplStateDir(env), OFFICIAL_PROFILE_FIRST_INSTALL_MARKER);
}

function officialProfileFirstInstallComplete(markerPath: string): boolean {
  if (!fs.existsSync(markerPath)) return false;
  if (!fs.lstatSync(markerPath).isFile()) {
    throw new Error(`Official Profile first-install marker is not a file: ${markerPath}`);
  }
  return true;
}

function recordOfficialProfileFirstInstallComplete(markerPath: string, result: IOplRuntimeCommandResult): void {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const temporary = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
  const bytes = result.stdout.trim() || `${JSON.stringify(result.parsed, null, 2)}\n`;
  try {
    fs.writeFileSync(temporary, bytes.endsWith('\n') ? bytes : `${bytes}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    try {
      fs.linkSync(temporary, markerPath);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      if (!officialProfileFirstInstallComplete(markerPath)) {
        throw new Error(`Official Profile first-install marker could not be recorded: ${markerPath}`, { cause: error });
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

async function runOfficialProfileApplyRequest(
  request: IOplOfficialProfileApplyRequest,
  dependencies: OfficialProfileApplyDependencies = {}
): Promise<IOplRuntimeCommandResult> {
  const command = buildOfficialProfileApplyCommand(request, dependencies.resourcesPath);
  const runCommand = dependencies.runCommand ?? runSpawnJsonCommand;
  if (request.intent === 'explicit_restore') return runCommand(command);

  const markerPath = dependencies.markerPath ?? resolveOfficialProfileFirstInstallMarker(command.env);
  if (officialProfileFirstInstallComplete(markerPath)) {
    return {
      surface: 'app_action',
      command: command.redactedCommand ?? 'node <official-profile-package-apply.ts> --intent first_install',
      stdout: '',
      parsed: {
        official_profile_package_apply: {
          status: 'already_completed',
          intent: 'first_install',
          changed: false,
        },
      },
      ok: true,
    };
  }

  const result = await runCommand(command);
  if (result.ok !== true) return result;
  recordOfficialProfileFirstInstallComplete(markerPath, result);
  return result;
}

function buildInitializeCommand(): RuntimeCommandSpec {
  return {
    surface: 'system_initialize',
    args: ['system', 'initialize', '--events', '--json'],
    redactedCommand: 'opl system initialize --events --json',
    timeoutMs: OPL_INITIALIZE_TIMEOUT_MS,
  };
}

function buildInitializeFallbackCommand(): RuntimeCommandSpec {
  return {
    surface: 'system_initialize',
    args: ['system', 'initialize', '--json'],
    redactedCommand: 'opl system initialize --json',
    timeoutMs: OPL_INITIALIZE_TIMEOUT_MS,
  };
}

function buildInstallPrepCommand(): RuntimeCommandSpec {
  return {
    surface: 'install_prep',
    args: ['install', '--headless', '--skip-packages', '--json'],
  };
}

function buildConfigureCodexCommand(request: IOplConfigureCodexRequest): RuntimeCommandSpec {
  const apiKey = request.apiKey.trim();
  if (!apiKey) {
    throw new Error('OPL Gateway access key is required.');
  }
  return {
    surface: 'configure_codex',
    args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
    stdin: `${apiKey}\n`,
    redactedCommand: 'opl system configure-codex --api-key-stdin --json',
  };
}

function buildGatewayAccountLoginCommand(request: IOplGatewayAccountLoginRequest): RuntimeCommandSpec {
  const email = request.email.trim();
  if (!email || !request.password) {
    throw new Error('Invalid Gateway account login request.');
  }
  const deviceLabel = request.deviceLabel?.trim();
  return {
    surface: 'gateway_account',
    args: ['connect', 'gateway', 'login', '--credentials-stdin', '--json'],
    stdin: `${JSON.stringify({
      email,
      password: request.password,
      ...(deviceLabel ? { device_label: deviceLabel } : {}),
    })}\n`,
    redactedCommand: 'opl connect gateway login --credentials-stdin --json',
  };
}

const GATEWAY_ACCOUNT_ERROR_CODES = new Set<IOplGatewayAccountErrorCode>([
  'invalid_credentials',
  'account_disabled',
  'mfa_or_challenge_required',
  'session_not_persistable',
  'group_selection_required',
  'auth_expired',
  'network_unreachable',
  'rate_limited',
  'managed_key_missing',
  'managed_key_conflict',
  'managed_key_identity_drift',
  'disconnect_pending',
  'invalid_request',
  'internal_contract_violation',
  'gateway_account_failed',
]);

const GATEWAY_ACCOUNT_ERROR_CODE_ALIASES = new Map<string, IOplGatewayAccountErrorCode>([
  ['credentials_stdin_invalid', 'invalid_request'],
  ['reauth_required', 'auth_expired'],
  ['network_timeout', 'network_unreachable'],
  ['gateway_unavailable', 'network_unreachable'],
]);

const SECRET_FIELD_NAMES = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'key',
  'keyvalue',
  'keyplaintext',
  'plaintextkey',
  'secret',
]);

function containsSecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([field, nested]) => {
    const normalized = field.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    return SECRET_FIELD_NAMES.has(normalized) || containsSecretField(nested);
  });
}

function normalizeGatewayAccountErrorCode(value: unknown): IOplGatewayAccountErrorCode | null {
  if (typeof value !== 'string') return null;
  return GATEWAY_ACCOUNT_ERROR_CODES.has(value as IOplGatewayAccountErrorCode)
    ? (value as IOplGatewayAccountErrorCode)
    : (GATEWAY_ACCOUNT_ERROR_CODE_ALIASES.get(value) ?? null);
}

function readGatewayAccountErrorCode(value: unknown): IOplGatewayAccountErrorCode | null {
  if (!isRecord(value)) return null;
  const error = isRecord(value.error) ? value.error : null;
  const details = isRecord(value.details) ? value.details : null;
  const errorDetails = error && isRecord(error.details) ? error.details : null;
  for (const candidate of [value.error_code, error?.code, details?.reason_code, errorDetails?.reason_code]) {
    const normalized = normalizeGatewayAccountErrorCode(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function readGatewayAccountErrorCodeFromText(text: string): IOplGatewayAccountErrorCode | null {
  for (const match of text.matchAll(/"(?:reason_code|error_code)"\s*:\s*"([^"]+)"/gi)) {
    const normalized = normalizeGatewayAccountErrorCode(match[1]);
    if (normalized) return normalized;
  }
  return null;
}

function inferGatewayAccountErrorCode(result: IOplRuntimeCommandResult): IOplGatewayAccountErrorCode {
  const parsedCode = readGatewayAccountErrorCode(result.parsed);
  if (parsedCode) return parsedCode;
  const text = `${result.error?.code ?? ''} ${result.error?.message ?? ''}`.toLowerCase();
  const structuredCode = readGatewayAccountErrorCodeFromText(text);
  if (structuredCode) return structuredCode;
  if (/invalid credentials|invalid password|unauthorized|401/.test(text)) return 'invalid_credentials';
  if (/disabled|suspended/.test(text)) return 'account_disabled';
  if (/turnstile|captcha|totp|two-factor|mfa|challenge/.test(text)) return 'mfa_or_challenge_required';
  if (/429|rate limit/.test(text)) return 'rate_limited';
  if (/network|enotfound|econn|timeout|timed out/.test(text)) return 'network_unreachable';
  return 'gateway_account_failed';
}

function sanitizeGatewayAccountResult(result: IOplRuntimeCommandResult): IOplGatewayAccountMutationResult {
  if (!isRecord(result.parsed)) {
    if (result.ok === false) {
      return { ok: false, errorCode: inferGatewayAccountErrorCode(result), stateRefreshRequired: false };
    }
    return { ok: false, errorCode: 'internal_contract_violation', stateRefreshRequired: false };
  }
  if (containsSecretField(result.parsed)) {
    return { ok: false, errorCode: 'internal_contract_violation', stateRefreshRequired: false };
  }
  const parsedOk = typeof result.parsed.ok === 'boolean' ? result.parsed.ok : null;
  const ok = result.ok !== false && parsedOk !== false;
  if (!ok) {
    return { ok: false, errorCode: inferGatewayAccountErrorCode(result), stateRefreshRequired: false };
  }
  return { ok: true, stateRefreshRequired: true };
}

async function runGatewayAccountCommand(spec: RuntimeCommandSpec): Promise<IOplGatewayAccountMutationResult> {
  return sanitizeGatewayAccountResult(await runOplCommand(spec));
}

function buildStartupMaintenanceCommand(): RuntimeCommandSpec {
  return {
    surface: 'startup_maintenance',
    args: ['system', 'startup-maintenance', '--json'],
    timeoutMs: OPL_STARTUP_MAINTENANCE_TIMEOUT_MS,
  };
}

function buildUpdateStatusCommand(): RuntimeCommandSpec {
  return {
    surface: 'update_status',
    args: ['update', 'status', '--json'],
    timeoutMs: OPL_MANAGED_UPDATE_READ_TIMEOUT_MS,
  };
}

function buildUpdateCheckCommand(): RuntimeCommandSpec {
  return {
    surface: 'update_check',
    args: ['update', 'check', '--json'],
    timeoutMs: OPL_MANAGED_UPDATE_READ_TIMEOUT_MS,
  };
}

function buildUpdatePlanCommand(): RuntimeCommandSpec {
  return {
    surface: 'update_plan',
    args: ['update', 'plan', '--json'],
    timeoutMs: OPL_MANAGED_UPDATE_READ_TIMEOUT_MS,
  };
}

function buildUpdateApplyPlanCommand(): RuntimeCommandSpec {
  return {
    surface: 'update_apply',
    args: ['update', 'apply', '--json'],
    timeoutMs: OPL_BOOTSTRAP_TIMEOUT_MS,
  };
}

function buildUpdateApplyCommand(request: IOplUpdateComponentRequest): RuntimeCommandSpec {
  assertApplyUpdateComponentId(request.componentId);
  return {
    ...buildUpdateApplyPlanCommand(),
  };
}

function buildUpdateRepairCommand(request: IOplUpdateRepairRequest): RuntimeCommandSpec {
  assertApplyUpdateComponentId(request.componentId);
  return {
    surface: 'update_repair',
    args: request.receiptId
      ? ['update', 'repair', '--receipt', assertUpdateReceiptId(request.receiptId), '--json']
      : ['update', 'repair', '--json'],
  };
}

function buildUpdateRollbackCommand(request: IOplUpdateComponentRequest): RuntimeCommandSpec {
  assertApplyUpdateComponentId(request.componentId);
  return {
    surface: 'update_rollback',
    args: ['update', 'rollback', '--json'],
  };
}

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readInitializeEventEnvelope(line: string): IOplSystemInitializeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.event)) return null;
  const event = parsed.event;
  if (
    typeof event.surface_id !== 'string' ||
    typeof event.event_type !== 'string' ||
    typeof event.phase !== 'string' ||
    typeof event.label !== 'string' ||
    typeof event.sequence !== 'number' ||
    typeof event.observed_at !== 'string'
  ) {
    return null;
  }
  return {
    surface_id: event.surface_id,
    event_type: event.event_type,
    phase: event.phase,
    label: event.label,
    sequence: event.sequence,
    observed_at: event.observed_at,
    ...(typeof event.duration_ms === 'number' ? { duration_ms: event.duration_ms } : {}),
    ...('payload' in event ? { payload: event.payload } : {}),
  };
}

function readInitializeCompletePayload(event: IOplSystemInitializeEvent): unknown {
  if (event.event_type !== 'complete') return null;
  const payload = event.payload;
  if (!isRecord(payload)) return payload ?? null;
  return 'system_initialize' in payload ? payload : { system_initialize: payload };
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
  return ['system_initialize', 'install_prep', 'configure_codex', 'gateway_account', 'startup_maintenance'].includes(
    spec.surface
  );
}

function isLegacyManagedUpdatePassthroughError(spec: RuntimeCommandSpec, error: unknown): boolean {
  if (!spec.surface.startsWith('update_') || !(error instanceof Error)) {
    return false;
  }
  return (
    /Usage:\s+codex update/i.test(error.message) ||
    /unexpected argument ['"]?(?:status|check|plan|apply|repair|rollback)['"]? found/i.test(error.message)
  );
}

function isManagedCarrierDependencyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find package|Cannot find module)/i.test(error.message)
  );
}

function isRetiredFullRuntimeReleaseSetError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Bundled Full runtime source does not match the verified Release Set carrier commit\./i.test(error.message) &&
    /agent_package_runtime_source_carrier_invalid/i.test(error.message)
  );
}

function isPackageLifecycleAction(spec: RuntimeCommandSpec): boolean {
  return (
    spec.surface === 'app_action' &&
    spec.args.some((arg) =>
      ['install_from_manifest_url', 'agent_package_update', 'agent_package_repair', 'agent_package_activate'].includes(
        arg
      )
    )
  );
}

function isManagedUpdateReadSurface(spec: RuntimeCommandSpec): boolean {
  return ['update_status', 'update_check', 'update_plan'].includes(spec.surface);
}

function isLegacyGatewayCredentialHandleError(spec: RuntimeCommandSpec, error: unknown): boolean {
  return (
    spec.surface.startsWith('app_state_') &&
    error instanceof Error &&
    error.message.includes('credential_handle must use env:NAME or codex:selected_provider.')
  );
}

function shouldAutoBootstrapAfterOplCommandError(spec: RuntimeCommandSpec, error: unknown): boolean {
  return (
    (isNoSuchOplCommandError(error) && shouldAutoBootstrapOplCommand(spec)) ||
    (error instanceof Error &&
      error.message === 'The Framework-managed OPL base carrier is missing.' &&
      (shouldAutoBootstrapOplCommand(spec) ||
        spec.surface.startsWith('app_state_') ||
        isManagedUpdateReadSurface(spec))) ||
    (isManagedCarrierDependencyError(error) &&
      (shouldAutoBootstrapOplCommand(spec) || spec.surface.startsWith('app_state_'))) ||
    (isRetiredFullRuntimeReleaseSetError(error) &&
      (shouldAutoBootstrapOplCommand(spec) ||
        spec.surface.startsWith('app_state_') ||
        isManagedUpdateReadSurface(spec) ||
        isPackageLifecycleAction(spec))) ||
    (spec.surface.startsWith('app_state_') &&
      error instanceof Error &&
      'code' in error &&
      error.code === OPL_FRAMEWORK_MISSING_CAPABILITY_ERROR_CODE) ||
    isLegacyGatewayCredentialHandleError(spec, error) ||
    isLegacyManagedUpdatePassthroughError(spec, error)
  );
}

function isInitializeEventsUnsupportedError(spec: RuntimeCommandSpec, error: unknown): boolean {
  return (
    spec.surface === 'system_initialize' &&
    error instanceof Error &&
    /Unexpected positional argument: --events|unrecognized option ['"]?--events|unknown option ['"]?--events/i.test(
      error.message
    )
  );
}

function resolveHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOME?.trim() || os.homedir();
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return null;
}

function readJsonRecordFile(filePath: string): Record<string, unknown> | null {
  try {
    return parseJsonRecord(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveOplStateDir(env: NodeJS.ProcessEnv): string {
  const explicitStateDir = normalizeOptionalString(env.OPL_STATE_DIR);
  if (explicitStateDir) {
    return path.resolve(explicitStateDir);
  }
  const dataDir = normalizeOptionalString(env.OPL_DATA_DIR) ?? normalizeOptionalString(env.AIONUI_DATA_DIR);
  if (dataDir) {
    return path.join(path.resolve(dataDir), 'opl', 'state');
  }
  return path.join(resolveHomeDir(env), 'Library', 'Application Support', 'OPL', 'state');
}

function normalizeDeveloperSupervisorEnabled(value: unknown): OplDeveloperSupervisorEnabled {
  return value === 'on' || value === 'off' || value === 'auto' ? value : 'auto';
}

function normalizeDeveloperSupervisorMode(value: unknown): OplDeveloperSupervisorMode {
  return value === 'developer_apply_safe' ? 'developer_apply_safe' : 'external_observe';
}

function readOplDeveloperSupervisorConfig(env: NodeJS.ProcessEnv): OplDeveloperSupervisorConfig {
  const parsed = readJsonRecordFile(path.join(resolveOplStateDir(env), 'developer-supervisor.json'));
  return {
    enabled: normalizeDeveloperSupervisorEnabled(parsed?.enabled),
    mode: normalizeDeveloperSupervisorMode(parsed?.mode),
    autoEnableGithubLogin: normalizeOptionalString(parsed?.auto_enable_github_login) ?? 'gaofeng21cn',
  };
}

function readDeveloperModeFixtureLogin(env: NodeJS.ProcessEnv): string | null {
  const explicitIdentity = normalizeOptionalString(env.OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE);
  if (explicitIdentity) {
    const parsed = parseJsonRecord(explicitIdentity);
    if (parsed) {
      return normalizeOptionalString(parsed.login);
    }
    return explicitIdentity;
  }

  const fixture = parseJsonRecord(env.OPL_DEVELOPER_MODE_GH_FIXTURE);
  if (!fixture) {
    return null;
  }
  const directLogin = normalizeOptionalString(fixture.login);
  if (directLogin) {
    return directLogin;
  }
  if (typeof fixture.user === 'string') {
    return normalizeOptionalString(fixture.user);
  }
  if (typeof fixture.user === 'object' && fixture.user !== null && !Array.isArray(fixture.user)) {
    return normalizeOptionalString((fixture.user as Record<string, unknown>).login);
  }
  return null;
}

function readDeveloperModeGhTimeoutMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(env.OPL_DEVELOPER_MODE_GH_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 10_000);
  }
  return 5_000;
}

function developerModeIdentityCacheKey(env: NodeJS.ProcessEnv): string {
  return [
    env.OPL_DEVELOPER_MODE_GH_FIXTURE ?? '',
    env.OPL_DEVELOPER_MODE_GITHUB_IDENTITY_FIXTURE ?? '',
    env.OPL_DEVELOPER_MODE_GH_BINARY ?? '',
    env.OPL_DEVELOPER_MODE_GH_TIMEOUT_MS ?? '',
  ].join('\0');
}

function detectDeveloperModeGithubIdentity(env: NodeJS.ProcessEnv): DeveloperModeGithubIdentity {
  const fixtureLogin = readDeveloperModeFixtureLogin(env);
  if (fixtureLogin) {
    return {
      status: 'ready',
      login: fixtureLogin,
    };
  }

  const cacheKey = developerModeIdentityCacheKey(env);
  if (cachedDeveloperModeGithubIdentity?.key === cacheKey) {
    return cachedDeveloperModeGithubIdentity.value;
  }

  const ghBinary = normalizeOptionalString(env.OPL_DEVELOPER_MODE_GH_BINARY) ?? 'gh';
  const result = spawnSync(ghBinary, ['api', 'user'], {
    encoding: 'utf8',
    env,
    timeout: readDeveloperModeGhTimeoutMs(env),
    maxBuffer: 1024 * 1024,
  });
  const login = result.status === 0 ? normalizeOptionalString(parseJsonRecord(result.stdout)?.login) : null;
  const identity: DeveloperModeGithubIdentity = login
    ? {
        status: 'ready',
        login,
      }
    : {
        status: 'unavailable',
        login: null,
      };
  cachedDeveloperModeGithubIdentity = {
    key: cacheKey,
    value: identity,
  };
  return identity;
}

function developerModePrefersLocalCheckout(env: NodeJS.ProcessEnv): boolean {
  const config = readOplDeveloperSupervisorConfig(env);
  if (config.enabled === 'off') {
    return false;
  }
  if (config.enabled === 'on') {
    return true;
  }

  const identity = detectDeveloperModeGithubIdentity(env);
  return identity.status === 'ready' && identity.login === config.autoEnableGithubLogin;
}

export function resolveSelectedWorkspaceRoot(env: NodeJS.ProcessEnv): string {
  const explicitWorkspaceRoot = normalizeOptionalString(env.OPL_WORKSPACE_ROOT);
  if (explicitWorkspaceRoot) {
    return path.resolve(explicitWorkspaceRoot);
  }

  const persisted = readJsonRecordFile(path.join(resolveOplStateDir(env), 'workspace-root.json'));
  const selectedPath = normalizeOptionalString(persisted?.selected_path);
  if (selectedPath) {
    return path.resolve(selectedPath);
  }

  return resolveHomeDir(env);
}

function resolveDefaultFullRuntimeHome(baseEnv: NodeJS.ProcessEnv): string | null {
  const configured = baseEnv.OPL_FULL_RUNTIME_HOME?.trim();
  if (configured) {
    return configured;
  }

  const homeDir = resolveHomeDir(baseEnv);
  const detected = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  return pathExistsFile(path.join(detected, 'bin', 'opl')) ? detected : null;
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
    const packageRoot = path.resolve(path.dirname(realPath), '..');
    return hasOplCliEntrypoint(packageRoot);
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

function pathExistsFile(file: string): boolean {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function resolveOplCliEntrypoints(packageRoot: string): OplCliEntrypoints {
  return {
    sourceCli:
      [path.join(packageRoot, 'src', 'entrypoints', 'cli.ts'), path.join(packageRoot, 'src', 'cli.ts')].find(
        pathExistsFile
      ) ?? null,
    distCli:
      [path.join(packageRoot, 'dist', 'entrypoints', 'cli.js'), path.join(packageRoot, 'dist', 'cli.js')].find(
        pathExistsFile
      ) ?? null,
  };
}

function hasOplCliEntrypoint(packageRoot: string): boolean {
  const entrypoints = resolveOplCliEntrypoints(packageRoot);
  return Boolean(entrypoints.sourceCli || entrypoints.distCli);
}

function isFrameworkCheckoutRoot(packageRoot: string): boolean {
  return (
    fs.existsSync(path.join(packageRoot, '.git')) &&
    pathExistsFile(path.join(packageRoot, 'contracts', 'opl-framework', 'public-surface-index.json')) &&
    hasOplCliEntrypoint(packageRoot)
  );
}

function candidatePathsFromPath(pathValue: string | undefined, commandName: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const entry of (pathValue ?? '').split(path.delimiter)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const candidate = path.join(trimmed, commandName);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (pathExistsFile(candidate)) candidates.push(candidate);
  }
  return candidates;
}

function realpathIfPossible(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

function findAncestorWithOplCli(startPath: string): string | null {
  let current = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);
  while (true) {
    if (hasOplCliEntrypoint(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveOplPackageRootFromExecutable(executablePath: string): string | null {
  const siblingFullRuntimePackageRoot = path.resolve(path.dirname(executablePath), '..', 'opl');
  if (hasOplCliEntrypoint(siblingFullRuntimePackageRoot)) {
    return siblingFullRuntimePackageRoot;
  }
  const realExecutablePath = realpathIfPossible(executablePath);
  return findAncestorWithOplCli(realExecutablePath);
}

function resolveNodeCommand(env: NodeJS.ProcessEnv): {
  command: string;
  env: NodeJS.ProcessEnv;
} {
  const nodePath = candidatePathsFromPath(env.PATH, 'node')[0];
  if (nodePath) return { command: nodePath, env };
  return {
    command: process.execPath,
    env: process.versions.electron ? { ...env, ELECTRON_RUN_AS_NODE: '1' } : env,
  };
}

function hasManagedUpdateKernel(packageRoot: string): boolean {
  return [
    ['src', 'modules', 'connect', 'managed-update-kernel.ts'],
    ['dist', 'modules', 'connect', 'managed-update-kernel.js'],
    ['src', 'managed-update-kernel.ts'],
    ['dist', 'managed-update-kernel.js'],
  ].some((segments) => pathExistsFile(path.join(packageRoot, ...segments)));
}

function packageSupportsCommand(packageRoot: string, spec: RuntimeCommandSpec): boolean {
  if (spec.surface.startsWith('update_')) {
    return hasManagedUpdateKernel(packageRoot);
  }
  return true;
}

function resolveOplCliFromPackageRoot(packageRoot: string, env: NodeJS.ProcessEnv): ResolvedOplCli | null {
  const nodeCommand = resolveNodeCommand(env);
  const entrypoints = resolveOplCliEntrypoints(packageRoot);
  if (entrypoints.sourceCli) {
    return {
      command: nodeCommand.command,
      argsPrefix: ['--experimental-strip-types', entrypoints.sourceCli],
      env: nodeCommand.env,
      source: entrypoints.sourceCli,
    };
  }
  if (entrypoints.distCli) {
    return {
      command: nodeCommand.command,
      argsPrefix: [entrypoints.distCli],
      env: nodeCommand.env,
      source: entrypoints.distCli,
    };
  }
  return null;
}

function resolveDeveloperModeCheckoutRoot(env: NodeJS.ProcessEnv): string | null {
  if (!developerModePrefersLocalCheckout(env)) {
    return null;
  }
  const checkoutRoot = path.join(resolveSelectedWorkspaceRoot(env), OPL_FRAMEWORK_REPO_NAME);
  return isFrameworkCheckoutRoot(checkoutRoot) ? checkoutRoot : null;
}

function resolveManagedInstallCheckoutRoot(env: NodeJS.ProcessEnv): string | null {
  const installDir =
    normalizeOptionalString(env.OPL_INSTALL_DIR) ?? path.join(resolveHomeDir(env), '.opl', 'one-person-lab');
  let dependencyEntries: string[];
  try {
    dependencyEntries = fs.readdirSync(path.join(installDir, 'node_modules'));
  } catch {
    return null;
  }
  return hasOplCliEntrypoint(installDir) && dependencyEntries.length > 0 ? installDir : null;
}

function resolvePackagedFullRuntimeRoot(env: NodeJS.ProcessEnv): string | null {
  const runtimeHome = resolveDefaultFullRuntimeHome(env);
  if (!runtimeHome || !pathExistsFile(path.join(runtimeHome, 'bin', 'opl'))) {
    return null;
  }
  const packageRoot = path.join(runtimeHome, 'opl');
  const packageManifest = readJsonRecordFile(path.join(packageRoot, 'package.json'));
  return packageManifest?.name === 'opl-framework' && hasOplCliEntrypoint(packageRoot) ? packageRoot : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeOptionalString).filter((entry): entry is string => entry !== null))];
}

function readCapabilityIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((entry) => (isRecord(entry) ? normalizeOptionalString(entry.capability_id) : null))
        .filter((entry): entry is string => entry !== null)
    ),
  ];
}

function readFrameworkIdentity(packageRoot: string): {
  frameworkVersion: string;
  frameworkApiVersion: string;
  producerCapabilityIds: string[];
} {
  // The Framework does not yet expose a stable live version command; bind activation to its installed package identity.
  const packageManifest = readJsonRecordFile(path.join(packageRoot, 'package.json'));
  const publicSurfaceIndex = readJsonRecordFile(
    path.join(packageRoot, 'contracts', 'opl-framework', 'public-surface-index.json')
  );
  const runtimeCapabilityContract = readJsonRecordFile(
    path.join(packageRoot, ...OPL_FRAMEWORK_RUNTIME_CAPABILITY_CONTRACT_PATH)
  );
  const runtimeCompatibilityCapabilities = isRecord(runtimeCapabilityContract?.compatibility_capabilities)
    ? runtimeCapabilityContract.compatibility_capabilities
    : null;
  const componentCompatibilityContract = readJsonRecordFile(
    path.join(packageRoot, ...OPL_FRAMEWORK_COMPONENT_COMPATIBILITY_CONTRACT_PATH)
  );
  const producerObservation = isRecord(componentCompatibilityContract?.producer_observation)
    ? componentCompatibilityContract.producer_observation
    : null;
  if (packageManifest?.name !== 'opl-framework') {
    throw new Error('Selected OPL Framework carrier must have package identity opl-framework.');
  }
  const frameworkVersion = normalizeOptionalString(packageManifest?.version);
  const frameworkApiVersion = normalizeOptionalString(publicSurfaceIndex?.version);
  if (!frameworkVersion || !frameworkApiVersion) {
    throw new Error('Selected OPL Framework carrier is missing package or public API identity.');
  }
  return {
    frameworkVersion,
    frameworkApiVersion,
    producerCapabilityIds: [
      ...new Set([
        ...readStringArray(runtimeCompatibilityCapabilities?.ids),
        ...readCapabilityIds(producerObservation?.capabilities),
      ]),
    ],
  };
}

function requiresAppStateCapabilityHandshake(spec?: RuntimeCommandSpec): boolean {
  return !spec || spec.surface.startsWith('app_state_');
}

function buildFrameworkCarrierSelection(
  packageRoot: string,
  selectedCarrier: OplFrameworkCarrierReceipt['selected_carrier'],
  selectionStatus: OplFrameworkCarrierReceipt['selection_status'] = 'active',
  spec?: RuntimeCommandSpec
): ResolvedOplFrameworkCarrier {
  const { frameworkVersion, frameworkApiVersion, producerCapabilityIds } = readFrameworkIdentity(packageRoot);
  const appRequiredApiRange = OPL_APP_REQUIRED_FRAMEWORK_API_RANGE;
  const compatibleApiVersions = appRequiredApiRange
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!compatibleApiVersions.includes(frameworkApiVersion)) {
    throw new Error(
      `OPL Framework API ${frameworkApiVersion} is incompatible with App-required ${appRequiredApiRange}.`
    );
  }
  const requiredCapabilityIds = [...OPL_APP_REQUIRED_FRAMEWORK_CAPABILITY_IDS];
  const missingRequiredCapabilityIds = requiredCapabilityIds.filter(
    (capabilityId) => !producerCapabilityIds.includes(capabilityId)
  );
  const selection: ResolvedOplFrameworkCarrier = {
    packageRoot,
    receipt: {
      selected_carrier: selectedCarrier,
      framework_version: frameworkVersion,
      framework_api_version: frameworkApiVersion,
      app_required_api_range: appRequiredApiRange,
      producer_capability_ids: producerCapabilityIds,
      required_capability_ids: requiredCapabilityIds,
      missing_required_capability_ids: missingRequiredCapabilityIds,
      compatibility_status:
        missingRequiredCapabilityIds.length === 0 ? 'compatible' : 'incompatible_missing_required_capability',
      selection_status: selectionStatus,
      active_framework_count: 1,
    },
  };
  if (requiresAppStateCapabilityHandshake(spec) && missingRequiredCapabilityIds.length > 0) {
    throw new OplFrameworkCapabilityError(selection.receipt);
  }
  return selection;
}

function resolveHomebrewFormulaRoot(env: NodeJS.ProcessEnv): string | null {
  const explicitFormulaBin = normalizeOptionalString(env.OPL_HOMEBREW_FORMULA_BIN);
  const formulaBins = explicitFormulaBin ? [explicitFormulaBin] : ['/opt/homebrew/bin', '/usr/local/bin'];
  for (const binDir of formulaBins) {
    const normalizedBinDir = normalizeOptionalString(binDir);
    if (!normalizedBinDir) continue;
    const executable = path.join(normalizedBinDir, 'opl');
    if (!pathExistsFile(executable)) continue;
    const packageRoot = resolveOplPackageRootFromExecutable(executable);
    if (packageRoot) return packageRoot;
  }
  return null;
}

function hasHomebrewCaskReceipt(env: NodeJS.ProcessEnv): boolean {
  const explicitRoots = normalizeOptionalString(env.OPL_HOMEBREW_CASKROOM_ROOTS);
  const caskroomRoots = explicitRoots
    ? explicitRoots.split(path.delimiter)
    : ['/opt/homebrew/Caskroom', '/usr/local/Caskroom'];
  const caskTokens = ['one-person-lab', 'one-person-lab-nightly', 'one-person-lab-full'];
  return caskroomRoots.some((root) =>
    caskTokens.some((token) => {
      try {
        return fs.readdirSync(path.join(root, token)).length > 0;
      } catch {
        return false;
      }
    })
  );
}

function resolveOplFrameworkCarrier(env: NodeJS.ProcessEnv, spec?: RuntimeCommandSpec): ResolvedOplFrameworkCarrier {
  const developerCheckout = resolveDeveloperModeCheckoutRoot(env);
  if (developerCheckout) {
    return buildFrameworkCarrierSelection(developerCheckout, 'developer_checkout', 'active', spec);
  }

  const explicitInstallOrigin = normalizeOptionalString(env.OPL_APP_INSTALL_ORIGIN);
  if (
    explicitInstallOrigin &&
    !['homebrew_cask', 'dmg_or_direct_download', 'dmg', 'direct_download'].includes(explicitInstallOrigin)
  ) {
    throw new Error(`Unsupported OPL App install origin: ${explicitInstallOrigin}.`);
  }
  const homebrewCaskInstall =
    explicitInstallOrigin === 'homebrew_cask' || (!explicitInstallOrigin && hasHomebrewCaskReceipt(env));
  const packagedFullRuntime = resolvePackagedFullRuntimeRoot(env);
  if (homebrewCaskInstall) {
    const formulaRoot = resolveHomebrewFormulaRoot(env);
    if (formulaRoot) {
      return buildFrameworkCarrierSelection(formulaRoot, 'system_homebrew_formula', 'active', spec);
    }
    const transitionManagedRoot = resolveManagedInstallCheckoutRoot(env);
    if (transitionManagedRoot) {
      return buildFrameworkCarrierSelection(
        transitionManagedRoot,
        'framework_managed_install',
        'pre_formula_transition',
        spec
      );
    }
    if (packagedFullRuntime) {
      return buildFrameworkCarrierSelection(packagedFullRuntime, 'packaged_full_runtime', 'active', spec);
    }
    throw new Error(
      'This Homebrew Cask install has neither the system Formula nor the transition Framework-managed carrier available.'
    );
  }

  const managedRoot = resolveManagedInstallCheckoutRoot(env);
  if (managedRoot) {
    return buildFrameworkCarrierSelection(managedRoot, 'framework_managed_install', 'active', spec);
  }
  if (packagedFullRuntime) {
    return buildFrameworkCarrierSelection(packagedFullRuntime, 'packaged_full_runtime', 'active', spec);
  }
  throw new Error('The Framework-managed OPL base carrier is missing.');
}

export function resolveActiveOplFrameworkPackageRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveOplFrameworkCarrier(env).packageRoot;
}

function resolveOplCli(spec: RuntimeCommandSpec, env: NodeJS.ProcessEnv): ResolvedOplCli | null {
  const selection = resolveOplFrameworkCarrier(env, spec);
  if (!packageSupportsCommand(selection.packageRoot, spec)) {
    throw new Error(`Selected OPL Framework carrier does not support ${spec.surface}.`);
  }
  const resolved = resolveOplCliFromPackageRoot(selection.packageRoot, env);
  if (!resolved) return null;
  return {
    ...resolved,
    env: {
      ...resolved.env,
      OPL_FRAMEWORK_UPDATE_TARGET_ROOT: selection.packageRoot,
      OPL_FRAMEWORK_SELECTED_CARRIER: selection.receipt.selected_carrier,
      OPL_FRAMEWORK_VERSION: selection.receipt.framework_version,
      OPL_FRAMEWORK_API_VERSION: selection.receipt.framework_api_version,
      OPL_APP_REQUIRED_FRAMEWORK_API_RANGE: selection.receipt.app_required_api_range,
      OPL_FRAMEWORK_PRODUCER_CAPABILITY_IDS: selection.receipt.producer_capability_ids.join(','),
      OPL_APP_REQUIRED_FRAMEWORK_CAPABILITY_IDS: selection.receipt.required_capability_ids.join(','),
      OPL_FRAMEWORK_MISSING_REQUIRED_CAPABILITY_IDS: selection.receipt.missing_required_capability_ids.join(','),
      OPL_FRAMEWORK_COMPATIBILITY_STATUS: selection.receipt.compatibility_status,
      OPL_FRAMEWORK_SELECTION_STATUS: selection.receipt.selection_status,
      OPL_ACTIVE_FRAMEWORK_COUNT: String(selection.receipt.active_framework_count),
    },
  };
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
    OPL_INSTALL_DIR: normalizeOptionalString(baseEnv.OPL_INSTALL_DIR) ?? path.join(homeDir, '.opl', 'one-person-lab'),
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
  const runtimeHome = resolveDefaultFullRuntimeHome(baseEnv);
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
  const prefilledNodeModulesDir = path.join(runtimeHome, 'opl', 'node_modules');
  return {
    OPL_FULL_RUNTIME_HOME: runtimeHome,
    OPL_FRAMEWORK_UPDATE_TARGET_ROOT: path.join(runtimeHome, 'opl'),
    OPL_PACKAGED_SKILLS_ROOT: baseEnv.OPL_PACKAGED_SKILLS_ROOT?.trim() || path.join(runtimeHome, 'skills'),
    OPL_CODEX_BIN: baseEnv.OPL_CODEX_BIN?.trim() || path.join(runtimeHome, 'bin', 'codex'),
    OPL_FAMILY_RUNTIME_PROVIDER: baseEnv.OPL_FAMILY_RUNTIME_PROVIDER?.trim() || 'temporal',
    ...(fs.existsSync(prefilledNodeModulesDir) ? { OPL_PREFILLED_NODE_MODULES_DIR: prefilledNodeModulesDir } : {}),
    ...(fs.existsSync(hermesBin) ? { OPL_HERMES_BIN: hermesBin } : {}),
    PATH: pathEntries,
  };
}

function buildOplCommandEnv(input: BuildStandardBootstrapEnvInput = {}): NodeJS.ProcessEnv {
  const standardEnv: NodeJS.ProcessEnv = {
    ...buildStandardBootstrapEnv(input),
    OPL_APP_PROCESS_INSTANCE_ID: oplAppProcessInstanceId,
    OPL_APP_HOST_KIND: 'desktop',
  };
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

function resetOplAppProcessInstanceIdForTest(): string {
  oplAppProcessInstanceId = randomUUID();
  return oplAppProcessInstanceId;
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
    args: [installerPath, '--headless', '--skip-packages'],
    redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
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
    const launched: ReturnType<NonNullable<SpawnCommandSpec['launch']>> =
      commandSpec.launch?.() ??
      (() => {
        const child = spawn(commandSpec.command, commandSpec.args, {
          env: commandSpec.env ?? process.env,
          stdio: [commandSpec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams;
        return {
          child,
          terminate: async (graceMs = 5000) => {
            child.kill(graceMs === 0 ? 'SIGKILL' : 'SIGTERM');
          },
        };
      })();
    const { child } = launched;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      void launched.terminate(0);
      reject(new Error(`OPL runtime command timed out: ${displayCommand}`));
    }, commandSpec.timeoutMs ?? OPL_COMMAND_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > maxStdoutBytes) {
        settled = true;
        clearTimeout(timer);
        void launched.terminate(0);
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
      void (async () => {
        try {
          await launched.finalize?.();
          if (code !== 0) {
            reject(new Error(`OPL runtime command failed (${code}): ${stderr.trim() || displayCommand}`));
            return;
          }
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
      })();
    });
  });
}

async function runInitializeEventsCommand(
  commandSpec: SpawnCommandSpec & {
    surface: 'system_initialize';
    env?: NodeJS.ProcessEnv;
    stdin?: string;
    timeoutMs?: number;
    maxStdoutBytes?: number;
  }
): Promise<IOplRuntimeCommandResult> {
  const displayCommand = commandSpec.redactedCommand;
  const maxStdoutBytes = commandSpec.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  return new Promise((resolve, reject) => {
    const launched: ReturnType<NonNullable<SpawnCommandSpec['launch']>> =
      commandSpec.launch?.() ??
      (() => {
        const child = spawn(commandSpec.command, commandSpec.args, {
          env: commandSpec.env ?? process.env,
          stdio: [commandSpec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams;
        return {
          child,
          terminate: async (graceMs = 5000) => {
            child.kill(graceMs === 0 ? 'SIGKILL' : 'SIGTERM');
          },
        };
      })();
    const { child } = launched;
    let stdout = '';
    let stderr = '';
    let pendingLine = '';
    let parsed: unknown = null;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      void launched.terminate(0);
      reject(new Error(`OPL runtime command timed out: ${displayCommand}`));
    }, commandSpec.timeoutMs ?? OPL_COMMAND_TIMEOUT_MS);

    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const event = readInitializeEventEnvelope(trimmed);
      if (!event) return;
      if (event.event_type === 'complete') {
        parsed = readInitializeCompletePayload(event);
        return;
      }
      ipcBridge.oplRuntime.initializeEvent.emit(event);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > maxStdoutBytes) {
        settled = true;
        clearTimeout(timer);
        void launched.terminate(0);
        reject(new Error(`OPL runtime command output exceeded ${maxStdoutBytes} bytes`));
        return;
      }
      pendingLine += chunk;
      const lines = pendingLine.split(/\r?\n/);
      pendingLine = lines.pop() ?? '';
      for (const line of lines) {
        consumeLine(line);
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
      void (async () => {
        try {
          await launched.finalize?.();
          consumeLine(pendingLine);
          if (code !== 0) {
            reject(new Error(`OPL runtime command failed (${code}): ${stderr.trim() || displayCommand}`));
            return;
          }
          resolve({
            surface: commandSpec.surface,
            command: displayCommand,
            stdout,
            ok: true,
            parsed,
          });
        } catch (error) {
          reject(error);
        }
      })();
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
  timeoutMs?: number;
  maxStdoutBytes?: number;
} {
  const resolved = resolveOplCli(spec, env);
  if (resolved) {
    return {
      surface: spec.surface,
      command: resolved.command,
      args: [...resolved.argsPrefix, ...spec.args],
      stdin: spec.stdin,
      timeoutMs: spec.timeoutMs,
      maxStdoutBytes: spec.maxStdoutBytes,
      env: resolved.env,
      redactedCommand: spec.redactedCommand ?? ['opl', ...spec.args].join(' '),
    };
  }
  return {
    surface: spec.surface,
    command: 'opl',
    args: spec.args,
    stdin: spec.stdin,
    timeoutMs: spec.timeoutMs,
    maxStdoutBytes: spec.maxStdoutBytes,
    env,
    redactedCommand: spec.redactedCommand ?? ['opl', ...spec.args].join(' '),
  };
}

function buildRuntimeOplSpawnCommand(
  spec: RuntimeCommandSpec,
  env = process.env,
  options: {
    platform?: NodeJS.Platform;
    windowsRuntime?: WindowsWslRuntimeExecution | null;
  } = {}
): ReturnType<typeof buildOplSpawnCommand> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return buildOplSpawnCommand(spec, env);

  const runtime = options.windowsRuntime ?? getWindowsWslRuntime();
  if (!runtime) throw new Error('Windows Framework commands require the initialized OPL Linux runtime.');
  return {
    surface: spec.surface,
    command: 'wsl.exe',
    args: [],
    stdin: spec.stdin,
    timeoutMs: spec.timeoutMs,
    maxStdoutBytes: spec.maxStdoutBytes,
    env,
    redactedCommand: spec.redactedCommand ?? ['opl', ...spec.args].join(' '),
    launch: () => {
      const handle = runtime.spawn({
        program: 'opl-cli',
        args: spec.args,
      });
      return {
        child: handle.child,
        terminate: handle.terminate,
        finalize: handle.finalize,
      };
    },
  };
}

function runStandardBootstrapSingleFlight(runBootstrap: () => Promise<void>): Promise<void> {
  if (standardBootstrapCompleted) {
    return Promise.resolve();
  }
  if (standardBootstrapInFlight) {
    return standardBootstrapInFlight;
  }

  let bootstrap: Promise<void>;
  try {
    bootstrap = Promise.resolve(runBootstrap());
  } catch (error) {
    return Promise.reject(error);
  }
  const task = bootstrap.then(
    () => {
      standardBootstrapCompleted = true;
      if (standardBootstrapInFlight === task) {
        standardBootstrapInFlight = null;
      }
    },
    (error: unknown) => {
      if (standardBootstrapInFlight === task) {
        standardBootstrapInFlight = null;
      }
      throw error;
    }
  );
  standardBootstrapInFlight = task;
  return task;
}

function resetStandardBootstrapForTest(): void {
  standardBootstrapCompleted = false;
  standardBootstrapInFlight = null;
}

function runPackagedStandardBootstrap(): Promise<void> {
  return runStandardBootstrapSingleFlight(async () => {
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
  });
}

async function repairOplRuntimeForHost(): Promise<void> {
  if (process.platform === 'win32') {
    const runtime = getWindowsWslRuntime();
    if (!runtime) throw new Error('Windows Framework repair requires the initialized OPL Linux runtime.');
    await runtime.ensureReady();
    return;
  }
  await runPackagedStandardBootstrap();
}

async function runOplCommand(spec: RuntimeCommandSpec): Promise<IOplRuntimeCommandResult> {
  try {
    const command = buildRuntimeOplSpawnCommand(spec, buildOplCommandEnv());
    return spec.surface === 'system_initialize'
      ? await runInitializeEventsCommand({ ...command, surface: 'system_initialize' })
      : await runSpawnJsonCommand(command);
  } catch (error) {
    if (isInitializeEventsUnsupportedError(spec, error)) {
      const fallbackSpec = buildInitializeFallbackCommand();
      try {
        const fallbackCommand = buildRuntimeOplSpawnCommand(fallbackSpec, buildOplCommandEnv());
        return await runSpawnJsonCommand(fallbackCommand);
      } catch (fallbackError) {
        return commandFailureResult(
          fallbackSpec,
          fallbackSpec.redactedCommand ?? ['opl', ...fallbackSpec.args].join(' '),
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          {
            code:
              fallbackError instanceof Error && 'code' in fallbackError && typeof fallbackError.code === 'string'
                ? fallbackError.code
                : undefined,
          }
        );
      }
    }
    if (!shouldAutoBootstrapAfterOplCommandError(spec, error)) {
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
    await repairOplRuntimeForHost();
    const command = buildRuntimeOplSpawnCommand(spec, buildOplCommandEnv());
    return spec.surface === 'system_initialize'
      ? await runInitializeEventsCommand({ ...command, surface: 'system_initialize' })
      : await runSpawnJsonCommand(command);
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

export async function runDesktopStartupMaintenance(
  dependencies: DesktopStartupMaintenanceDependencies = {}
): Promise<IOplRuntimeCommandResult> {
  const spec = buildStartupMaintenanceCommand();
  let result: IOplRuntimeCommandResult;
  try {
    result = await (dependencies.runCommand ?? runOplCommand)(spec);
  } catch (error) {
    result = commandFailureResult(
      spec,
      'opl system startup-maintenance --json',
      error instanceof Error ? error.message : String(error),
      {
        code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined,
      }
    );
  }

  const parsed = isRecord(result.parsed) ? result.parsed : null;
  const systemAction = isRecord(parsed?.system_action) ? parsed.system_action : null;
  const maintenanceStatus = typeof systemAction?.status === 'string' ? systemAction.status : null;
  const maintenanceSucceeded = result.ok && maintenanceStatus === 'completed';
  const record = {
    schema: 'opl.desktop_startup_maintenance.v1',
    observed_at: (dependencies.now ?? (() => new Date()))().toISOString(),
    host_kind: 'desktop',
    surface: result.surface,
    command: result.command,
    ok: maintenanceSucceeded,
    command_ok: result.ok,
    maintenance_status: maintenanceStatus,
    result: result.parsed,
    error: result.error ?? null,
  };
  const message = `[AionUi:opl-startup] ${JSON.stringify(record)}`;
  try {
    if (maintenanceSucceeded) {
      (dependencies.logInfo ?? console.log)(message);
    } else {
      (dependencies.logWarn ?? console.warn)(message);
    }
  } catch {
    // Startup maintenance is diagnostic and must never reject process initialization because logging failed.
  }
  return result;
}

function startupMaintenanceCompletionEvent(
  result: IOplRuntimeCommandResult,
  now: () => Date
): IOplStartupMaintenanceCompletedEvent {
  const parsed = isRecord(result.parsed) ? result.parsed : null;
  const systemAction = isRecord(parsed?.system_action) ? parsed.system_action : null;
  const maintenanceStatus = typeof systemAction?.status === 'string' ? systemAction.status : null;
  return {
    schema: 'opl.desktop_startup_maintenance.completed.v1',
    observed_at: now().toISOString(),
    outcome: result.ok && maintenanceStatus === 'completed' ? 'completed' : result.ok ? 'needs_attention' : 'failed',
    command_ok: result.ok === true,
    maintenance_status: maintenanceStatus,
    refresh_profile: 'fast',
  };
}

function emitStartupMaintenanceCompleted(
  result: IOplRuntimeCommandResult,
  dependencies: DesktopStartupMaintenanceDependencies
): void {
  const event = startupMaintenanceCompletionEvent(result, dependencies.now ?? (() => new Date()));
  try {
    (dependencies.emitCompleted ?? ipcBridge.oplRuntime.startupMaintenanceCompleted.emit)(event);
  } catch (error) {
    const record = {
      schema: 'opl.desktop_startup_maintenance_event_error.v1',
      observed_at: event.observed_at,
      host_kind: 'desktop',
      surface: 'startup_maintenance',
      ok: false,
      error: { message: error instanceof Error ? error.message : String(error) },
    };
    try {
      (dependencies.logWarn ?? console.warn)(`[AionUi:opl-startup] ${JSON.stringify(record)}`);
    } catch {
      // Event delivery and logging are both best effort; the completed task still remains non-blocking.
    }
  }
}

export function runStartupMaintenanceForHost(
  hostKind: 'desktop' | 'web',
  dependencies: DesktopStartupMaintenanceDependencies = {}
): Promise<IOplRuntimeCommandResult | null> {
  if (hostKind === 'web') return Promise.resolve(null);
  if (!desktopStartupMaintenanceTask) {
    desktopStartupMaintenanceTask = runDesktopStartupMaintenance(dependencies)
      .catch((error) =>
        commandFailureResult(
          buildStartupMaintenanceCommand(),
          'opl system startup-maintenance --json',
          error instanceof Error ? error.message : String(error)
        )
      )
      .then((result) => {
        emitStartupMaintenanceCompleted(result, dependencies);
        return result;
      });
  }
  return desktopStartupMaintenanceTask;
}

function resetDesktopStartupMaintenanceForTest(): void {
  desktopStartupMaintenanceTask = null;
}

export function initOplRuntimeBridge(): void {
  ipcBridge.oplRuntime.getAppState.provider(({ profile }) => runAppStateRequest(profile));
  ipcBridge.oplRuntime.readDomainDetailView.provider((request) => runOplCommand(buildDomainDetailViewCommand(request)));
  ipcBridge.oplRuntime.getInitialize.provider(() => runOplCommand(buildInitializeCommand()));
  ipcBridge.oplRuntime.runInstallPrep.provider(() => runOplCommand(buildInstallPrepCommand()));
  ipcBridge.oplRuntime.configureCodex.provider((request) => runOplCommand(buildConfigureCodexCommand(request)));
  ipcBridge.oplRuntime.loginGatewayAccount.provider((request) =>
    runGatewayAccountCommand(buildGatewayAccountLoginCommand(request))
  );
  ipcBridge.oplRuntime.runStartupMaintenance.provider(() => runOplCommand(buildStartupMaintenanceCommand()));
  ipcBridge.oplRuntime.getDrilldown.provider(({ detail }) => runOplCommand(buildDrilldownCommand(detail)));
  ipcBridge.oplRuntime.executeAction.provider(runRuntimeActionRequest);
  ipcBridge.oplRuntime.runPackageContribution.provider(runPackageContributionRequest);
  ipcBridge.oplRuntime.applyOfficialProfile.provider(runOfficialProfileApplyRequest);
  ipcBridge.oplRuntime.getUpdateStatus.provider(() => runOplCommand(buildUpdateStatusCommand()));
  ipcBridge.oplRuntime.runUpdateCheck.provider(() => runOplCommand(buildUpdateCheckCommand()));
  ipcBridge.oplRuntime.getUpdatePlan.provider(() => runOplCommand(buildUpdatePlanCommand()));
  ipcBridge.oplRuntime.applyUpdatePlan.provider(() => runOplCommand(buildUpdateApplyPlanCommand()));
  ipcBridge.oplRuntime.applyUpdateComponent.provider((request) => runOplCommand(buildUpdateApplyCommand(request)));
  ipcBridge.oplRuntime.repairUpdate.provider((request) => runOplCommand(buildUpdateRepairCommand(request)));
  ipcBridge.oplRuntime.rollbackUpdateComponent.provider((request) =>
    runOplCommand(buildUpdateRollbackCommand(request))
  );
}

export const __oplRuntimeBridgeTest = {
  OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT,
  assertActionId,
  assertPackageContributionId,
  channelAccessActionRequest,
  mergeChannelProviderAppStatePatch,
  mergeRemoteCompanionAppStatePatch,
  assertDomainDetailItemId,
  assertDomainDetailViewId,
  assertDomainDetailRevision,
  assertUpdateComponentId,
  assertApplyUpdateComponentId,
  assertUpdateReceiptId,
  buildActionCommand,
  buildPackageContributionCommand,
  buildOfficialProfileApplyCommand,
  officialProfileFirstInstallComplete,
  recordOfficialProfileFirstInstallComplete,
  resolveOfficialProfileFirstInstallMarker,
  runOfficialProfileApplyRequest,
  buildAppStateCommand,
  buildDomainDetailViewCommand,
  buildConfigureCodexCommand,
  buildGatewayAccountLoginCommand,
  buildDrilldownCommand,
  buildInitializeFallbackCommand,
  buildInitializeCommand,
  containsSecretField,
  sanitizeGatewayAccountResult,
  buildInstallPrepCommand,
  buildUpdateApplyPlanCommand,
  buildUpdateApplyCommand,
  buildUpdateCheckCommand,
  buildUpdatePlanCommand,
  buildUpdateRepairCommand,
  buildUpdateRollbackCommand,
  buildUpdateStatusCommand,
  buildFullRuntimeBridgeEnv,
  buildOplCommandEnv,
  buildOplSpawnCommand,
  buildRuntimeOplSpawnCommand,
  buildStartupMaintenanceCommand,
  buildStandardBootstrapCommand,
  buildStandardBootstrapEnv,
  resolveDefaultFullRuntimeHome,
  resolveSelectedWorkspaceRoot,
  resolvePackagedFullRuntimeRoot,
  commandFailureResult,
  developerModePrefersLocalCheckout,
  readInitializeCompletePayload,
  readInitializeEventEnvelope,
  resetOplAppProcessInstanceIdForTest,
  resolveOplCli,
  resolveOplFrameworkCarrier,
  resolveDeveloperModeCheckoutRoot,
  resolveOplPackageRootFromExecutable,
  parseJson,
  runSpawnJsonCommand,
  runInitializeEventsCommand,
  runOplCommand,
  runStandardBootstrapSingleFlight,
  resetStandardBootstrapForTest,
  resetDesktopStartupMaintenanceForTest,
  isInitializeEventsUnsupportedError,
  shouldAutoBootstrapAfterOplCommandError,
  shouldAutoBootstrapOplCommand,
};

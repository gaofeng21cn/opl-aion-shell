/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ipcBridge } from '@/common';
import type {
  IOplConfigureCodexRequest,
  IOplGatewayAccountErrorCode,
  IOplGatewayAccountLoginRequest,
  IOplGatewayAccountMutationResult,
  IOplRuntimeActionRequest,
  IOplAppStateProfile,
  IOplRuntimeCommandResult,
  IOplRuntimeDetailLevel,
  IOplSystemInitializeEvent,
  IOplUpdateComponentRequest,
  IOplUpdateRepairRequest,
} from '@/common/adapter/ipcBridge';

type RuntimeCommandSpec = {
  args: string[];
  surface: IOplRuntimeCommandResult['surface'];
  stdin?: string;
  redactedCommand?: string;
  timeoutMs?: number;
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
const OPL_BOOTSTRAP_MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const OPL_COMMAND_TIMEOUT_MS = 30_000;
const OPL_INITIALIZE_TIMEOUT_MS = 120_000;
const OPL_MANAGED_UPDATE_READ_TIMEOUT_MS = 120_000;
const OPL_BOOTSTRAP_TIMEOUT_MS = 900_000;
const MANAGED_NODE_VERSION = 'v22.21.1';
const STANDARD_BOOTSTRAP_RESOURCE = 'opl-install.sh';
const OPL_FRAMEWORK_REPO_NAME = 'one-person-lab';
const OPL_APP_REQUIRED_FRAMEWORK_API_RANGE = 'p19.stage-runtime';
const OPL_MODULE_PATH_ENV_KEYS = [
  'OPL_MODULE_PATH_MEDAUTOSCIENCE',
  'OPL_MODULE_PATH_MEDAUTOGRANT',
  'OPL_MODULE_PATH_REDCUBE',
  'OPL_MODULE_PATH_OPLMETAAGENT',
  'OPL_MODULE_PATH_OPLBOOKFORGE',
] as const;
let standardBootstrapCompleted = false;
let oplAppProcessInstanceId = randomUUID();
let cachedDeveloperModeGithubIdentity: {
  key: string;
  value: DeveloperModeGithubIdentity;
} | null = null;
const MANAGED_UPDATE_COMPONENT_IDS = new Set(['opl_base', 'opl_app', 'opl_packages']);
const APPLY_ALLOWED_UPDATE_COMPONENT_IDS = new Set(['opl_base', 'opl_packages']);

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
    'opl system initialize --events --json',
    'opl system initialize --json',
    'opl install --headless --skip-packages --json',
    'opl system configure-codex --api-key-stdin --json',
    'opl connect gateway login --credentials-stdin --json',
    'opl system startup-maintenance --json',
    'opl system reconcile-modules --json',
    'opl update status --json',
    'opl update check --json',
    'opl update plan --json',
    'opl update apply --json',
    'opl update repair [--receipt <receipt_id>] --json',
    'opl update rollback --json',
    'opl packages update --package-id <package_id> --json',
    'opl packages optimize opl-flow --json',
    'opl packages repair --package-id <package_id> --json',
    'opl packages rollback --package-id <package_id> --json',
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
  compatibility_status: 'compatible';
  selection_status: 'active' | 'pre_formula_transition';
  active_framework_count: 1;
};

type ResolvedOplFrameworkCarrier = {
  packageRoot: string;
  receipt: OplFrameworkCarrierReceipt;
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
  if (!MANAGED_UPDATE_COMPONENT_IDS.has(normalized)) {
    throw new Error('OPL managed update lifecycle id must be opl_base, opl_app, or opl_packages');
  }
  return normalized;
}

function assertApplyUpdateComponentId(componentId: string): string {
  const normalized = assertUpdateComponentId(componentId);
  if (!APPLY_ALLOWED_UPDATE_COMPONENT_IDS.has(normalized)) {
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

function assertPackageId(packageId: string | undefined): string {
  const normalized = packageId?.trim() ?? '';
  if (!/^[A-Za-z0-9._:@/-]+$/.test(normalized)) {
    throw new Error('Invalid OPL package id');
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

function readGatewayAccountErrorCode(value: unknown): IOplGatewayAccountErrorCode | null {
  if (!isRecord(value)) return null;
  const direct = typeof value.error_code === 'string' ? value.error_code : null;
  const nested = isRecord(value.error) && typeof value.error.code === 'string' ? value.error.code : null;
  const candidate = direct ?? nested;
  return candidate && GATEWAY_ACCOUNT_ERROR_CODES.has(candidate as IOplGatewayAccountErrorCode)
    ? (candidate as IOplGatewayAccountErrorCode)
    : null;
}

function inferGatewayAccountErrorCode(result: IOplRuntimeCommandResult): IOplGatewayAccountErrorCode {
  const parsedCode = readGatewayAccountErrorCode(result.parsed);
  if (parsedCode) return parsedCode;
  const text = `${result.error?.code ?? ''} ${result.error?.message ?? ''}`.toLowerCase();
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
  return { surface: 'startup_maintenance', args: ['system', 'startup-maintenance', '--json'] };
}

function buildReconcileModulesCommand(): RuntimeCommandSpec {
  return { surface: 'reconcile_modules', args: ['system', 'reconcile-modules', '--json'] };
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
  const componentId = assertApplyUpdateComponentId(request.componentId);
  if (componentId === 'opl_packages') {
    return {
      surface: 'update_apply',
      args: ['packages', 'update', '--package-id', assertPackageId(request.packageId), '--json'],
    };
  }
  return {
    ...buildUpdateApplyPlanCommand(),
  };
}

function buildUpdateRepairCommand(request: IOplUpdateRepairRequest): RuntimeCommandSpec {
  const componentId = assertApplyUpdateComponentId(request.componentId);
  if (componentId === 'opl_packages') {
    return {
      surface: 'update_repair',
      args: ['packages', 'repair', '--package-id', assertPackageId(request.packageId), '--json'],
    };
  }
  return {
    surface: 'update_repair',
    args: request.receiptId
      ? ['update', 'repair', '--receipt', assertUpdateReceiptId(request.receiptId), '--json']
      : ['update', 'repair', '--json'],
  };
}

function buildUpdateRollbackCommand(request: IOplUpdateComponentRequest): RuntimeCommandSpec {
  const componentId = assertApplyUpdateComponentId(request.componentId);
  if (componentId === 'opl_packages') {
    return {
      surface: 'update_rollback',
      args: ['packages', 'rollback', '--package-id', assertPackageId(request.packageId), '--json'],
    };
  }
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
  return ['system_initialize', 'install_prep', 'configure_codex', 'startup_maintenance', 'reconcile_modules'].includes(
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

function shouldAutoBootstrapAfterOplCommandError(spec: RuntimeCommandSpec, error: unknown): boolean {
  return (
    (isNoSuchOplCommandError(error) && shouldAutoBootstrapOplCommand(spec)) ||
    (error instanceof Error &&
      error.message === 'The Framework-managed OPL base carrier is missing.' &&
      (shouldAutoBootstrapOplCommand(spec) || spec.surface.startsWith('app_state_'))) ||
    (isManagedCarrierDependencyError(error) &&
      (shouldAutoBootstrapOplCommand(spec) || spec.surface.startsWith('app_state_'))) ||
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

function resolveSelectedWorkspaceRoot(env: NodeJS.ProcessEnv): string {
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
  return hasOplCliEntrypoint(packageRoot) ? packageRoot : null;
}

function readFrameworkIdentity(packageRoot: string): { frameworkVersion: string; frameworkApiVersion: string } {
  // The Framework does not yet expose a stable live version command; bind activation to its installed package identity.
  const packageManifest = readJsonRecordFile(path.join(packageRoot, 'package.json'));
  const publicSurfaceIndex = readJsonRecordFile(
    path.join(packageRoot, 'contracts', 'opl-framework', 'public-surface-index.json')
  );
  if (packageManifest?.name !== 'opl-framework') {
    throw new Error('Selected OPL Framework carrier must have package identity opl-framework.');
  }
  const frameworkVersion = normalizeOptionalString(packageManifest?.version);
  const frameworkApiVersion = normalizeOptionalString(publicSurfaceIndex?.version);
  if (!frameworkVersion || !frameworkApiVersion) {
    throw new Error('Selected OPL Framework carrier is missing package or public API identity.');
  }
  return { frameworkVersion, frameworkApiVersion };
}

function buildFrameworkCarrierSelection(
  packageRoot: string,
  selectedCarrier: OplFrameworkCarrierReceipt['selected_carrier'],
  selectionStatus: OplFrameworkCarrierReceipt['selection_status'] = 'active'
): ResolvedOplFrameworkCarrier {
  const { frameworkVersion, frameworkApiVersion } = readFrameworkIdentity(packageRoot);
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
  return {
    packageRoot,
    receipt: {
      selected_carrier: selectedCarrier,
      framework_version: frameworkVersion,
      framework_api_version: frameworkApiVersion,
      app_required_api_range: appRequiredApiRange,
      compatibility_status: 'compatible',
      selection_status: selectionStatus,
      active_framework_count: 1,
    },
  };
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
    return buildFrameworkCarrierSelection(developerCheckout, 'developer_checkout');
  }

  if (spec && !spec.surface.startsWith('update_')) {
    const packagedFullRuntime = resolvePackagedFullRuntimeRoot(env);
    if (packagedFullRuntime) {
      return buildFrameworkCarrierSelection(packagedFullRuntime, 'packaged_full_runtime');
    }
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
  if (homebrewCaskInstall) {
    const formulaRoot = resolveHomebrewFormulaRoot(env);
    if (formulaRoot) {
      return buildFrameworkCarrierSelection(formulaRoot, 'system_homebrew_formula');
    }
    const transitionManagedRoot = resolveManagedInstallCheckoutRoot(env);
    if (transitionManagedRoot) {
      return buildFrameworkCarrierSelection(
        transitionManagedRoot,
        'framework_managed_install',
        'pre_formula_transition'
      );
    }
    throw new Error(
      'This Homebrew Cask install has neither the system Formula nor the transition Framework-managed carrier available.'
    );
  }

  const managedRoot = resolveManagedInstallCheckoutRoot(env);
  if (!managedRoot) {
    throw new Error('The Framework-managed OPL base carrier is missing.');
  }
  return buildFrameworkCarrierSelection(managedRoot, 'framework_managed_install');
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
      OPL_FRAMEWORK_SELECTED_CARRIER: selection.receipt.selected_carrier,
      OPL_FRAMEWORK_VERSION: selection.receipt.framework_version,
      OPL_FRAMEWORK_API_VERSION: selection.receipt.framework_api_version,
      OPL_APP_REQUIRED_FRAMEWORK_API_RANGE: selection.receipt.app_required_api_range,
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
    OPL_MODULE_PATH_OPLBOOKFORGE:
      baseEnv.OPL_MODULE_PATH_OPLBOOKFORGE?.trim() || path.join(runtimeHome, 'modules', 'bookforge'),
    ...(fs.existsSync(prefilledNodeModulesDir) ? { OPL_PREFILLED_NODE_MODULES_DIR: prefilledNodeModulesDir } : {}),
    ...(fs.existsSync(hermesBin) ? { OPL_HERMES_BIN: hermesBin } : {}),
    PATH: pathEntries,
  };
}

function buildOplCommandEnv(input: BuildStandardBootstrapEnvInput = {}): NodeJS.ProcessEnv {
  const standardEnv: NodeJS.ProcessEnv = {
    ...buildStandardBootstrapEnv(input),
    OPL_APP_PROCESS_INSTANCE_ID: oplAppProcessInstanceId,
  };
  const fullRuntimeEnv = buildFullRuntimeBridgeEnv(standardEnv);
  if (!fullRuntimeEnv) {
    return standardEnv;
  }

  const mergedEnv: NodeJS.ProcessEnv = {
    ...standardEnv,
    ...fullRuntimeEnv,
    PATH: normalizePathEntries([fullRuntimeEnv.PATH, standardEnv.PATH]),
  };
  if (developerModePrefersLocalCheckout(standardEnv)) {
    for (const key of OPL_MODULE_PATH_ENV_KEYS) {
      const explicitPath = normalizeOptionalString(standardEnv[key]);
      if (explicitPath) {
        mergedEnv[key] = explicitPath;
      } else {
        delete mergedEnv[key];
      }
    }
  }
  return mergedEnv;
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
    const child = spawn(commandSpec.command, commandSpec.args, {
      env: commandSpec.env ?? process.env,
      stdio: [commandSpec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let pendingLine = '';
    let parsed: unknown = null;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
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
        child.kill('SIGTERM');
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
      try {
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
} {
  const resolved = resolveOplCli(spec, env);
  if (resolved) {
    return {
      surface: spec.surface,
      command: resolved.command,
      args: [...resolved.argsPrefix, ...spec.args],
      stdin: spec.stdin,
      timeoutMs: spec.timeoutMs,
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
    const command = buildOplSpawnCommand(spec, buildOplCommandEnv());
    return spec.surface === 'system_initialize'
      ? await runInitializeEventsCommand({ ...command, surface: 'system_initialize' })
      : await runSpawnJsonCommand(command);
  } catch (error) {
    if (isInitializeEventsUnsupportedError(spec, error)) {
      const fallbackSpec = buildInitializeFallbackCommand();
      try {
        const fallbackCommand = buildOplSpawnCommand(fallbackSpec, buildOplCommandEnv());
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
    await runPackagedStandardBootstrap();
    const command = buildOplSpawnCommand(spec, buildOplCommandEnv());
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

export function initOplRuntimeBridge(): void {
  ipcBridge.oplRuntime.getAppState.provider(({ profile }) => runOplCommand(buildAppStateCommand(profile)));
  ipcBridge.oplRuntime.getInitialize.provider(() => runOplCommand(buildInitializeCommand()));
  ipcBridge.oplRuntime.runInstallPrep.provider(() => runOplCommand(buildInstallPrepCommand()));
  ipcBridge.oplRuntime.configureCodex.provider((request) => runOplCommand(buildConfigureCodexCommand(request)));
  ipcBridge.oplRuntime.loginGatewayAccount.provider((request) =>
    runGatewayAccountCommand(buildGatewayAccountLoginCommand(request))
  );
  ipcBridge.oplRuntime.runStartupMaintenance.provider(() => runOplCommand(buildStartupMaintenanceCommand()));
  ipcBridge.oplRuntime.runReconcileModules.provider(() => runOplCommand(buildReconcileModulesCommand()));
  ipcBridge.oplRuntime.getDrilldown.provider(({ detail }) => runOplCommand(buildDrilldownCommand(detail)));
  ipcBridge.oplRuntime.executeAction.provider((request) => runOplCommand(buildActionCommand(request)));
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
  assertUpdateComponentId,
  assertApplyUpdateComponentId,
  assertUpdateReceiptId,
  buildActionCommand,
  buildAppStateCommand,
  buildConfigureCodexCommand,
  buildGatewayAccountLoginCommand,
  buildDrilldownCommand,
  buildInitializeFallbackCommand,
  buildInitializeCommand,
  containsSecretField,
  sanitizeGatewayAccountResult,
  buildInstallPrepCommand,
  buildUpdateApplyPlanCommand,
  buildReconcileModulesCommand,
  buildUpdateApplyCommand,
  buildUpdateCheckCommand,
  buildUpdatePlanCommand,
  buildUpdateRepairCommand,
  buildUpdateRollbackCommand,
  buildUpdateStatusCommand,
  buildFullRuntimeBridgeEnv,
  buildOplCommandEnv,
  buildOplSpawnCommand,
  buildStartupMaintenanceCommand,
  buildStandardBootstrapCommand,
  buildStandardBootstrapEnv,
  resolveDefaultFullRuntimeHome,
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
  runInitializeEventsCommand,
  runOplCommand,
  isInitializeEventsUnsupportedError,
  shouldAutoBootstrapAfterOplCommandError,
  shouldAutoBootstrapOplCommand,
};

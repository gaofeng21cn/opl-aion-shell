import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type OplRuntimeSurface =
  | 'app_state_fast'
  | 'app_state_full'
  | 'domain_detail_view'
  | 'runtime_summary'
  | 'runtime_full'
  | 'app_action'
  | 'system_initialize'
  | 'install_prep'
  | 'configure_codex'
  | 'gateway_account'
  | 'startup_maintenance'
  | 'reconcile_modules'
  | 'update_status'
  | 'update_check'
  | 'update_plan'
  | 'update_apply'
  | 'update_repair'
  | 'update_rollback';

export type OplRuntimeCommandResult = {
  surface: OplRuntimeSurface;
  command: string;
  stdout: string;
  parsed: unknown;
  ok?: boolean;
  error?: {
    message: string;
    code?: string;
    stderr?: string;
    exitCode?: number | null;
    timedOut?: boolean;
  };
};

type OplGatewayAccountErrorCode =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'mfa_or_challenge_required'
  | 'session_not_persistable'
  | 'group_selection_required'
  | 'auth_expired'
  | 'network_unreachable'
  | 'rate_limited'
  | 'managed_key_missing'
  | 'managed_key_conflict'
  | 'managed_key_identity_drift'
  | 'disconnect_pending'
  | 'invalid_request'
  | 'internal_contract_violation'
  | 'gateway_account_failed';

type OplGatewayAccountMutationResult = {
  ok: boolean;
  errorCode?: OplGatewayAccountErrorCode;
  stateRefreshRequired: boolean;
};

type RuntimeCommandSpec = {
  surface: OplRuntimeSurface;
  args: string[];
  stdin?: string;
  redactedCommand?: string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
};

type SpawnCommandSpec = RuntimeCommandSpec & {
  command: string;
  env: NodeJS.ProcessEnv;
};

export type OplRuntimeProxyOptions = {
  dataDir: string;
  resourcesPath: string;
  projectsDir?: string;
  imageManifestPath?: string;
  imageSeedDir?: string;
  inheritUserOplEnvironment?: boolean;
};

type JsonRecord = Record<string, unknown>;

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const DOMAIN_DETAIL_VIEW_MAX_STDOUT_BYTES = 9 * 1024 * 1024;
const BOOTSTRAP_MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const BOOTSTRAP_TIMEOUT_MS = 900_000;
const MAINTENANCE_TIMEOUT_MS = 900_000;
const STANDARD_BOOTSTRAP_RESOURCE = 'opl-install.sh';

let standardBootstrapCompleted = false;
let oplAppProcessInstanceId = randomUUID();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

async function readJsonBody(req: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }
  return parsed;
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function commandFailureResult(
  spec: RuntimeCommandSpec,
  command: string,
  message: string,
  error: Partial<NonNullable<OplRuntimeCommandResult['error']>> = {}
): OplRuntimeCommandResult {
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

function assertSafeIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:@/-]+$/.test(value.trim())) {
    throw new Error(`Invalid OPL runtime ${label}`);
  }
  return value.trim();
}

function assertDomainDetailItemId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid OPL domain detail item id');
  const normalized = value.trim();
  if (normalized.length > 512 || normalized.includes('..') || !/^[A-Za-z0-9._:@%-]+$/.test(normalized)) {
    throw new Error('Invalid OPL domain detail item id');
  }
  return normalized;
}

function assertDomainDetailViewId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid OPL domain detail view id');
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error('Invalid OPL domain detail view id');
  }
  return normalized;
}

function assertDomainDetailRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid OPL domain detail revision');
  }
  return value;
}

function assertManagedUpdateLifecycleId(value: unknown): 'opl_base' | 'opl_app' | 'opl_packages' {
  const lifecycleId = assertSafeIdentifier(value, 'managed update lifecycle id');
  if (lifecycleId !== 'opl_base' && lifecycleId !== 'opl_app' && lifecycleId !== 'opl_packages') {
    throw new Error('OPL managed update lifecycle id must be opl_base, opl_app, or opl_packages');
  }
  return lifecycleId;
}

function assertManagedUpdateTarget(body: JsonRecord): 'opl_base' {
  const lifecycleId = assertManagedUpdateLifecycleId(body.componentId);
  if (lifecycleId === 'opl_packages') {
    throw new Error('Package lifecycle mutations require a Framework projected action through opl app action execute');
  }
  if (lifecycleId === 'opl_app') {
    throw new Error('opl_app updates must use the host or carrier updater');
  }
  return lifecycleId;
}

const GATEWAY_ACCOUNT_ERROR_CODES = new Set<OplGatewayAccountErrorCode>([
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

const GATEWAY_SECRET_FIELD_NAMES = new Set([
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

function containsGatewaySecretField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsGatewaySecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([field, nested]) => {
    const normalized = field.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    return GATEWAY_SECRET_FIELD_NAMES.has(normalized) || containsGatewaySecretField(nested);
  });
}

function readGatewayAccountErrorCode(value: unknown): OplGatewayAccountErrorCode | null {
  if (!isRecord(value)) return null;
  const direct = typeof value.error_code === 'string' ? value.error_code : null;
  const nested = isRecord(value.error) && typeof value.error.code === 'string' ? value.error.code : null;
  const candidate = direct ?? nested;
  return candidate && GATEWAY_ACCOUNT_ERROR_CODES.has(candidate as OplGatewayAccountErrorCode)
    ? (candidate as OplGatewayAccountErrorCode)
    : null;
}

function inferGatewayAccountErrorCode(result: OplRuntimeCommandResult): OplGatewayAccountErrorCode {
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

function sanitizeGatewayAccountResult(result: OplRuntimeCommandResult): OplGatewayAccountMutationResult {
  if (!isRecord(result.parsed)) {
    if (result.ok === false) {
      return { ok: false, errorCode: inferGatewayAccountErrorCode(result), stateRefreshRequired: false };
    }
    return { ok: false, errorCode: 'internal_contract_violation', stateRefreshRequired: false };
  }
  if (containsGatewaySecretField(result.parsed)) {
    return { ok: false, errorCode: 'internal_contract_violation', stateRefreshRequired: false };
  }
  const parsedOk = typeof result.parsed.ok === 'boolean' ? result.parsed.ok : null;
  if (result.ok === false || parsedOk === false) {
    return { ok: false, errorCode: inferGatewayAccountErrorCode(result), stateRefreshRequired: false };
  }
  return { ok: true, stateRefreshRequired: true };
}

function buildCommandFromRequest(route: string, body: JsonRecord): RuntimeCommandSpec {
  switch (route) {
    case 'app-state': {
      const profile = body.profile === 'full' ? 'full' : 'fast';
      return {
        surface: profile === 'full' ? 'app_state_full' : 'app_state_fast',
        args: ['app', 'state', '--profile', profile, '--json'],
      };
    }
    case 'domain-detail-view': {
      const args = [
        'app',
        'view',
        'read',
        '--item-id',
        assertDomainDetailItemId(body.itemId),
        '--view-id',
        assertDomainDetailViewId(body.viewId),
      ];
      if (body.ifRevision !== undefined) {
        args.push('--if-revision', String(assertDomainDetailRevision(body.ifRevision)));
      }
      args.push('--json');
      return { surface: 'domain_detail_view', args, maxStdoutBytes: DOMAIN_DETAIL_VIEW_MAX_STDOUT_BYTES };
    }
    case 'initialize':
      return {
        surface: 'system_initialize',
        args: ['system', 'initialize', '--json'],
        redactedCommand: 'opl system initialize --json',
      };
    case 'install-prep':
      return {
        surface: 'install_prep',
        args: ['install', '--headless', '--skip-packages', '--json'],
      };
    case 'configure-codex': {
      const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      if (!apiKey) throw new Error('Codex API key is required.');
      return {
        surface: 'configure_codex',
        args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
        stdin: `${apiKey}\n`,
        redactedCommand: 'opl system configure-codex --api-key-stdin --json',
      };
    }
    case 'gateway-account-login': {
      const allowedFields = new Set(['email', 'password', 'deviceLabel']);
      if (Object.keys(body).some((field) => !allowedFields.has(field))) {
        throw new Error('Invalid Gateway account login request.');
      }
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel.trim() : '';
      if (!email || !password) throw new Error('Invalid Gateway account login request.');
      return {
        surface: 'gateway_account',
        args: ['connect', 'gateway', 'login', '--credentials-stdin', '--json'],
        stdin: `${JSON.stringify({ email, password, ...(deviceLabel ? { device_label: deviceLabel } : {}) })}\n`,
        redactedCommand: 'opl connect gateway login --credentials-stdin --json',
      };
    }
    case 'startup-maintenance':
      return {
        surface: 'startup_maintenance',
        args: ['system', 'startup-maintenance', '--json'],
        timeoutMs: MAINTENANCE_TIMEOUT_MS,
      };
    case 'reconcile-modules':
      return {
        surface: 'reconcile_modules',
        args: ['system', 'reconcile-modules', '--json'],
        timeoutMs: MAINTENANCE_TIMEOUT_MS,
      };
    case 'drilldown': {
      const detail = body.detail === 'full' ? 'full' : 'summary';
      if (detail === 'full') {
        return {
          surface: 'runtime_full',
          args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
        };
      }
      return { surface: 'runtime_summary', args: ['runtime', 'app-operator-drilldown', '--json'] };
    }
    case 'execute-action': {
      const args = ['app', 'action', 'execute', '--action', assertSafeIdentifier(body.actionId, 'action id')];
      if (body.dryRun === true) args.push('--dry-run');
      if (isRecord(body.payloadRefsOnlyJson) && Object.keys(body.payloadRefsOnlyJson).length > 0) {
        args.push('--payload', JSON.stringify(body.payloadRefsOnlyJson));
      }
      args.push('--json');
      return { surface: 'app_action', args };
    }
    case 'update-status':
      return { surface: 'update_status', args: ['update', 'status', '--json'] };
    case 'update-check':
      return { surface: 'update_check', args: ['update', 'check', '--json'], timeoutMs: MAINTENANCE_TIMEOUT_MS };
    case 'update-plan':
      return { surface: 'update_plan', args: ['update', 'plan', '--json'] };
    case 'update-plan-apply':
      return {
        surface: 'update_apply',
        args: ['update', 'apply', '--json'],
        timeoutMs: MAINTENANCE_TIMEOUT_MS,
      };
    case 'update-apply': {
      assertManagedUpdateTarget(body);
      return {
        surface: 'update_apply',
        args: ['update', 'apply', '--json'],
        timeoutMs: MAINTENANCE_TIMEOUT_MS,
      };
    }
    case 'update-repair': {
      assertManagedUpdateTarget(body);
      return {
        surface: 'update_repair',
        args:
          typeof body.receiptId === 'string' && body.receiptId.trim()
            ? ['update', 'repair', '--receipt', assertSafeIdentifier(body.receiptId, 'update receipt id'), '--json']
            : ['update', 'repair', '--json'],
        timeoutMs: MAINTENANCE_TIMEOUT_MS,
      };
    }
    case 'update-rollback': {
      assertManagedUpdateTarget(body);
      return {
        surface: 'update_rollback',
        args: ['update', 'rollback', '--json'],
        timeoutMs: MAINTENANCE_TIMEOUT_MS,
      };
    }
    default:
      throw new Error(`Unsupported OPL runtime route: ${route}`);
  }
}

function pathExistsFile(file: string): boolean {
  return fs.existsSync(file) && fs.statSync(file).isFile();
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

function resolveDefaultFullRuntimeHome(homeDir: string): string | null {
  const detected = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
  return pathExistsFile(path.join(detected, 'bin', 'opl')) ? detected : null;
}

function buildOplEnv(opts: OplRuntimeProxyOptions): NodeJS.ProcessEnv {
  const dataDir = path.resolve(opts.dataDir);
  const projectsDir = path.resolve(opts.projectsDir ?? process.env.OPL_WORKSPACE_ROOT ?? '/projects');
  const imageManifestPath = opts.imageManifestPath?.trim() || process.env.OPL_IMAGE_MANIFEST_PATH?.trim() || '';
  const imageSeedDir = opts.imageSeedDir?.trim() || process.env.OPL_IMAGE_SEED_DIR?.trim() || '';
  const inheritUserOplEnvironment = opts.inheritUserOplEnvironment === true;
  const fullRuntimeHome =
    process.env.OPL_FULL_RUNTIME_HOME?.trim() ||
    resolveDefaultFullRuntimeHome(process.env.HOME?.trim() || os.homedir());
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });

  const inheritedEnv: NodeJS.ProcessEnv = { ...process.env };
  delete inheritedEnv.OPL_APP_HOST_KIND;
  if (inheritedEnv.OPL_TEMPORAL_ADDRESS_SOURCE === 'packaged_local_default') {
    delete inheritedEnv.OPL_TEMPORAL_ADDRESS_SOURCE;
    if (inheritedEnv.OPL_TEMPORAL_ADDRESS === '127.0.0.1:7233') {
      delete inheritedEnv.OPL_TEMPORAL_ADDRESS;
    }
  }

  return {
    ...inheritedEnv,
    HOME: dataDir,
    OPL_APP_PROCESS_INSTANCE_ID: oplAppProcessInstanceId,
    ...(inheritUserOplEnvironment
      ? {}
      : {
          OPL_DATA_DIR: process.env.OPL_DATA_DIR?.trim() || dataDir,
          OPL_STATE_DIR: process.env.OPL_STATE_DIR?.trim() || path.join(dataDir, 'opl', 'state'),
          CODEX_HOME: process.env.CODEX_HOME?.trim() || path.join(dataDir, '.codex'),
          OPL_INSTALL_DIR: process.env.OPL_INSTALL_DIR?.trim() || path.join(dataDir, '.opl', 'one-person-lab'),
          OPL_MANAGED_TOOLCHAIN_ROOT:
            process.env.OPL_MANAGED_TOOLCHAIN_ROOT?.trim() || path.join(dataDir, '.opl', 'toolchain'),
        }),
    OPL_WORKSPACE_ROOT: projectsDir,
    OPL_PROJECTS_DIR: projectsDir,
    ...(imageManifestPath ? { OPL_IMAGE_MANIFEST_PATH: path.resolve(imageManifestPath) } : {}),
    ...(imageSeedDir ? { OPL_IMAGE_SEED_DIR: path.resolve(imageSeedDir) } : {}),
    ...(fullRuntimeHome
      ? {
          OPL_FULL_RUNTIME_HOME: fullRuntimeHome,
          OPL_PACKAGED_SKILLS_ROOT:
            process.env.OPL_PACKAGED_SKILLS_ROOT?.trim() || path.join(fullRuntimeHome, 'skills'),
          OPL_CODEX_BIN: process.env.OPL_CODEX_BIN?.trim() || path.join(fullRuntimeHome, 'bin', 'codex'),
          OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER?.trim() || 'temporal',
          OPL_MODULE_PATH_MEDAUTOSCIENCE:
            process.env.OPL_MODULE_PATH_MEDAUTOSCIENCE?.trim() || path.join(fullRuntimeHome, 'modules', 'mas'),
          OPL_MODULE_PATH_MEDAUTOGRANT:
            process.env.OPL_MODULE_PATH_MEDAUTOGRANT?.trim() || path.join(fullRuntimeHome, 'modules', 'mag'),
          OPL_MODULE_PATH_REDCUBE:
            process.env.OPL_MODULE_PATH_REDCUBE?.trim() || path.join(fullRuntimeHome, 'modules', 'rca'),
          OPL_MODULE_PATH_OPLMETAAGENT:
            process.env.OPL_MODULE_PATH_OPLMETAAGENT?.trim() || path.join(fullRuntimeHome, 'modules', 'meta-agent'),
          OPL_MODULE_PATH_OPLBOOKFORGE:
            process.env.OPL_MODULE_PATH_OPLBOOKFORGE?.trim() || path.join(fullRuntimeHome, 'modules', 'bookforge'),
        }
      : {}),
    NPM_CONFIG_PRODUCTION: 'false',
    npm_config_production: 'false',
    NPM_CONFIG_INCLUDE: 'dev',
    npm_config_include: 'dev',
    PATH: normalizePathEntries([
      fullRuntimeHome ? path.join(fullRuntimeHome, 'bin') : null,
      fullRuntimeHome ? path.join(fullRuntimeHome, 'node', 'bin') : null,
      fullRuntimeHome ? path.join(fullRuntimeHome, 'uv', 'bin') : null,
      path.join(dataDir, '.opl', 'one-person-lab', 'bin'),
      path.join(dataDir, '.npm-global', 'bin'),
      path.join(dataDir, '.local', 'bin'),
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      process.env.PATH,
    ]),
  };
}

function resetOplAppProcessInstanceIdForTest(): string {
  oplAppProcessInstanceId = randomUUID();
  return oplAppProcessInstanceId;
}

function resolveOplInstaller(resourcesPath: string): string | null {
  const installerPath = path.join(resourcesPath, STANDARD_BOOTSTRAP_RESOURCE);
  return pathExistsFile(installerPath) ? installerPath : null;
}

function buildStandardBootstrapCommand(installerPath: string) {
  return {
    command: '/bin/bash',
    args: [installerPath, '--headless', '--skip-packages'],
    redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
  };
}

function shouldBootstrap(spec: RuntimeCommandSpec): boolean {
  return Boolean(spec.surface);
}

function isMissingOpl(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function isIncompleteOplInstall(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find package/.test(error.message);
}

function buildSpawnCommand(spec: RuntimeCommandSpec, env: NodeJS.ProcessEnv): SpawnCommandSpec {
  return {
    ...spec,
    command: 'opl',
    env,
  };
}

async function runSpawnJsonCommand(
  commandSpec: SpawnCommandSpec & { parseOutput?: boolean; maxStdoutBytes?: number }
): Promise<OplRuntimeCommandResult> {
  const displayCommand = commandSpec.redactedCommand ?? ['opl', ...commandSpec.args].join(' ');
  const maxStdoutBytes = commandSpec.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn(commandSpec.command, commandSpec.args, {
      env: commandSpec.env,
      stdio: [commandSpec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`OPL runtime command timed out: ${displayCommand}`));
    }, commandSpec.timeoutMs ?? COMMAND_TIMEOUT_MS);

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
    if (commandSpec.stdin && child.stdin) child.stdin.end(commandSpec.stdin);
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
      resolve({
        surface: commandSpec.surface,
        command: displayCommand,
        stdout,
        ok: true,
        parsed: commandSpec.parseOutput === false ? null : parseJson(stdout),
      });
    });
  });
}

async function runInitializeEventsCommand(commandSpec: SpawnCommandSpec): Promise<OplRuntimeCommandResult> {
  const displayCommand = commandSpec.redactedCommand ?? ['opl', ...commandSpec.args].join(' ');
  return new Promise((resolve, reject) => {
    const child = spawn(commandSpec.command, commandSpec.args, {
      env: commandSpec.env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
    }, commandSpec.timeoutMs ?? COMMAND_TIMEOUT_MS);

    const consumeLine = (line: string): void => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const envelope = JSON.parse(trimmed) as unknown;
      if (!isRecord(envelope) || !isRecord(envelope.event)) return;
      const event = envelope.event;
      if (event.event_type !== 'complete') return;
      const payload = event.payload;
      parsed = isRecord(payload) && 'system_initialize' in payload ? payload : { system_initialize: payload };
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > MAX_STDOUT_BYTES) {
        settled = true;
        clearTimeout(timer);
        child.kill('SIGTERM');
        reject(new Error(`OPL runtime command output exceeded ${MAX_STDOUT_BYTES} bytes`));
        return;
      }
      pendingLine += chunk;
      const lines = pendingLine.split(/\r?\n/);
      pendingLine = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
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

async function runBootstrap(opts: OplRuntimeProxyOptions, env: NodeJS.ProcessEnv): Promise<void> {
  if (standardBootstrapCompleted) return;
  const installerPath = resolveOplInstaller(opts.resourcesPath);
  if (!installerPath) {
    throw new Error('Packaged OPL installer is missing; cannot run WebUI standard bootstrap.');
  }
  const bootstrap = buildStandardBootstrapCommand(installerPath);
  await runSpawnJsonCommand({
    ...bootstrap,
    surface: 'install_prep',
    env,
    timeoutMs: BOOTSTRAP_TIMEOUT_MS,
    parseOutput: false,
    maxStdoutBytes: BOOTSTRAP_MAX_STDOUT_BYTES,
  });
  standardBootstrapCompleted = true;
}

async function runOplCommand(spec: RuntimeCommandSpec, opts: OplRuntimeProxyOptions): Promise<OplRuntimeCommandResult> {
  const env = buildOplEnv(opts);
  try {
    const command = buildSpawnCommand(spec, env);
    return await runSpawnJsonCommand(command);
  } catch (error) {
    if (!shouldBootstrap(spec) || (!isMissingOpl(error) && !isIncompleteOplInstall(error))) {
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
    await runBootstrap(opts, env);
    const command = buildSpawnCommand(spec, buildOplEnv(opts));
    return await runSpawnJsonCommand(command);
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

export function normalizeOplRuntimeProxyOptions(input: Partial<OplRuntimeProxyOptions>): OplRuntimeProxyOptions {
  const dataDir =
    input.dataDir?.trim() || process.env.AIONUI_DATA_DIR?.trim() || path.join(os.homedir(), '.aionui-web');
  return {
    dataDir,
    resourcesPath: input.resourcesPath?.trim() || process.cwd(),
    projectsDir: input.projectsDir?.trim() || process.env.OPL_WORKSPACE_ROOT?.trim() || '/projects',
    imageManifestPath: input.imageManifestPath?.trim() || process.env.OPL_IMAGE_MANIFEST_PATH?.trim() || undefined,
    imageSeedDir: input.imageSeedDir?.trim() || process.env.OPL_IMAGE_SEED_DIR?.trim() || undefined,
    inheritUserOplEnvironment: input.inheritUserOplEnvironment === true,
  };
}

export async function handleOplRuntimeProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: OplRuntimeProxyOptions
): Promise<boolean> {
  if (!req.url?.startsWith('/api/opl-runtime/')) return false;
  if (req.method !== 'POST') {
    writeJson(res, 405, { success: false, error: 'METHOD_NOT_ALLOWED' });
    return true;
  }

  try {
    const route = req.url.slice('/api/opl-runtime/'.length).split('?', 1)[0] ?? '';
    const spec = buildCommandFromRequest(route, await readJsonBody(req));
    const result = await runOplCommand(spec, opts);
    if (route === 'gateway-account-login') {
      const sanitized = sanitizeGatewayAccountResult(result);
      writeJson(res, 200, { success: sanitized.ok, data: sanitized });
    } else {
      writeJson(res, 200, { success: result.ok !== false, data: result });
    }
  } catch (error) {
    writeJson(res, 400, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
}

export const __oplRuntimeProxyTest = {
  buildCommandFromRequest,
  buildOplEnv,
  buildStandardBootstrapCommand,
  commandFailureResult,
  sanitizeGatewayAccountResult,
  MAINTENANCE_TIMEOUT_MS,
  normalizeOplRuntimeProxyOptions,
  resetOplAppProcessInstanceIdForTest,
  resolveDefaultFullRuntimeHome,
  resolveOplInstaller,
};

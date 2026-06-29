import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type OplRuntimeSurface =
  | 'app_state_fast'
  | 'app_state_full'
  | 'runtime_summary'
  | 'runtime_full'
  | 'app_action'
  | 'system_initialize'
  | 'install_prep'
  | 'configure_codex'
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

type RuntimeCommandSpec = {
  surface: OplRuntimeSurface;
  args: string[];
  stdin?: string;
  redactedCommand?: string;
  timeoutMs?: number;
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
};

type JsonRecord = Record<string, unknown>;

const MAX_STDOUT_BYTES = 5 * 1024 * 1024;
const BOOTSTRAP_MAX_STDOUT_BYTES = 50 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;
const BOOTSTRAP_TIMEOUT_MS = 900_000;
const STANDARD_BOOTSTRAP_RESOURCE = 'opl-install.sh';

let standardBootstrapCompleted = false;

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

function buildCommandFromRequest(route: string, body: JsonRecord): RuntimeCommandSpec {
  switch (route) {
    case 'app-state': {
      const profile = body.profile === 'full' ? 'full' : 'fast';
      return {
        surface: profile === 'full' ? 'app_state_full' : 'app_state_fast',
        args: ['app', 'state', '--profile', profile, '--json'],
      };
    }
    case 'initialize':
      return {
        surface: 'system_initialize',
        args: ['system', 'initialize', '--events'],
        redactedCommand: 'opl system initialize --events',
      };
    case 'install-prep':
      return {
        surface: 'install_prep',
        args: ['install', '--skip-gui-open', '--skip-modules', '--skip-native-helper-repair', '--json'],
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
    case 'startup-maintenance':
      return { surface: 'startup_maintenance', args: ['system', 'startup-maintenance', '--json'] };
    case 'reconcile-modules':
      return { surface: 'reconcile_modules', args: ['system', 'reconcile-modules', '--json'] };
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
      return { surface: 'update_check', args: ['update', 'check', '--json'] };
    case 'update-plan':
      return { surface: 'update_plan', args: ['update', 'plan', '--json'] };
    case 'update-apply':
      return {
        surface: 'update_apply',
        args: [
          'update',
          'apply',
          '--component',
          assertSafeIdentifier(body.componentId, 'update component id'),
          '--json',
        ],
      };
    case 'update-repair': {
      if (typeof body.receiptId === 'string' && body.receiptId.trim()) {
        return {
          surface: 'update_repair',
          args: ['update', 'repair', '--receipt', assertSafeIdentifier(body.receiptId, 'update receipt id'), '--json'],
        };
      }
      return {
        surface: 'update_repair',
        args: [
          'update',
          'repair',
          '--component',
          assertSafeIdentifier(body.componentId, 'update component id'),
          '--json',
        ],
      };
    }
    case 'update-rollback':
      return {
        surface: 'update_rollback',
        args: [
          'update',
          'rollback',
          '--component',
          assertSafeIdentifier(body.componentId, 'update component id'),
          '--json',
        ],
      };
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

function buildOplEnv(opts: OplRuntimeProxyOptions): NodeJS.ProcessEnv {
  const dataDir = path.resolve(opts.dataDir);
  const projectsDir = path.resolve(opts.projectsDir ?? process.env.OPL_WORKSPACE_ROOT ?? '/projects');
  const imageManifestPath =
    opts.imageManifestPath?.trim() || process.env.OPL_IMAGE_MANIFEST_PATH?.trim() || '';
  const imageSeedDir = opts.imageSeedDir?.trim() || process.env.OPL_IMAGE_SEED_DIR?.trim() || '';
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(projectsDir, { recursive: true });

  return {
    ...process.env,
    HOME: dataDir,
    OPL_DATA_DIR: process.env.OPL_DATA_DIR?.trim() || dataDir,
    OPL_STATE_DIR: process.env.OPL_STATE_DIR?.trim() || path.join(dataDir, 'opl', 'state'),
    CODEX_HOME: process.env.CODEX_HOME?.trim() || path.join(dataDir, '.codex'),
    OPL_WORKSPACE_ROOT: projectsDir,
    OPL_PROJECTS_DIR: projectsDir,
    ...(imageManifestPath ? { OPL_IMAGE_MANIFEST_PATH: path.resolve(imageManifestPath) } : {}),
    ...(imageSeedDir ? { OPL_IMAGE_SEED_DIR: path.resolve(imageSeedDir) } : {}),
    OPL_INSTALL_DIR: process.env.OPL_INSTALL_DIR?.trim() || path.join(dataDir, '.opl', 'one-person-lab'),
    OPL_MANAGED_TOOLCHAIN_ROOT:
      process.env.OPL_MANAGED_TOOLCHAIN_ROOT?.trim() || path.join(dataDir, '.opl', 'toolchain'),
    NPM_CONFIG_PRODUCTION: 'false',
    npm_config_production: 'false',
    NPM_CONFIG_INCLUDE: 'dev',
    npm_config_include: 'dev',
    PATH: normalizePathEntries([
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

function resolveOplInstaller(resourcesPath: string): string | null {
  const installerPath = path.join(resourcesPath, STANDARD_BOOTSTRAP_RESOURCE);
  return pathExistsFile(installerPath) ? installerPath : null;
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
  await runSpawnJsonCommand({
    surface: 'install_prep',
    command: '/bin/bash',
    args: [
      installerPath,
      '--complete',
      '--skip-modules',
      '--skip-gui-open',
      '--skip-native-helper-repair',
      '--no-online-runtime',
    ],
    env,
    redactedCommand:
      '/bin/bash <packaged-opl-install.sh> --complete --skip-modules --skip-gui-open --skip-native-helper-repair --no-online-runtime',
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
    return spec.surface === 'system_initialize'
      ? await runInitializeEventsCommand(command)
      : await runSpawnJsonCommand(command);
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
    return spec.surface === 'system_initialize'
      ? await runInitializeEventsCommand(command)
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

export function normalizeOplRuntimeProxyOptions(input: Partial<OplRuntimeProxyOptions>): OplRuntimeProxyOptions {
  const dataDir =
    input.dataDir?.trim() || process.env.AIONUI_DATA_DIR?.trim() || path.join(os.homedir(), '.aionui-web');
  return {
    dataDir,
    resourcesPath: input.resourcesPath?.trim() || process.cwd(),
    projectsDir: input.projectsDir?.trim() || process.env.OPL_WORKSPACE_ROOT?.trim() || '/projects',
    imageManifestPath: input.imageManifestPath?.trim() || process.env.OPL_IMAGE_MANIFEST_PATH?.trim() || undefined,
    imageSeedDir: input.imageSeedDir?.trim() || process.env.OPL_IMAGE_SEED_DIR?.trim() || undefined,
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
    writeJson(res, 200, { success: result.ok !== false, data: result });
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
  normalizeOplRuntimeProxyOptions,
  resolveOplInstaller,
};

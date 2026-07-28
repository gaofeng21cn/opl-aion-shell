import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const OPL_WSL_DISTRIBUTION = 'OPL-Linux';
export const OPL_WSL_GUEST_USER = 'opl';
export const OPL_WSL_RUNTIME_INSPECT = '/opt/opl/bootstrap/opl-runtime-inspect';
const DEFAULT_BASE_DISTRIBUTION = 'Ubuntu-24.04';
const OPL_WSL_BOOTSTRAP_ENTRYPOINTS = ['opl-runtime-control', 'opl-runtime-exec', 'opl-runtime-inspect'] as const;
const OPL_WSL_GUEST_PATH =
  '/home/opl/.opl/one-person-lab/bin:/home/opl/.npm-global/bin:/home/opl/.local/bin:/usr/local/bin:/usr/bin:/bin';
const MAX_COMMAND_OUTPUT_BYTES = 128 * 1024;
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;

export type WindowsWslProvisioningStage =
  | 'checking_host'
  | 'enabling_wsl'
  | 'restart_required'
  | 'installing_owned_distribution'
  | 'initializing_guest'
  | 'activating_owner_artifacts'
  | 'validating_routes'
  | 'ready'
  | 'repair_required'
  | 'blocked_by_policy'
  | 'cancelled';

export type WindowsWslProvisioningProgress = {
  stage: WindowsWslProvisioningStage;
  detail: string;
};

export type WindowsWslCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type WindowsWslGuestIdentity = {
  schema: 'opl_linux_runtime_inspection.v1';
  protocol_version: 1;
  logical_distribution: 'OPL-Linux';
  physical_distribution: 'OPL-Linux';
  distribution_generation: number;
  guest_install_id: string;
  architecture: 'x86_64';
  guest_user: 'opl';
  carrier_activation_digest: string;
  bootstrap_digest: string;
  aioncore_digest: string;
  codex_digest: string;
  codex_path: string;
  codex_command_path: '/usr/local/bin/codex';
  codex_realpath: string;
  codex_command_digest: string;
  codex_home: '/home/opl/.codex';
  workspace_root: '/home/opl/code';
  framework_path: string;
  framework_digest: string;
  framework_ref: string;
  native_windows_executor_fallback_allowed: false;
  wsl2: true;
  active_operation_count: number;
};

export type WindowsWslProductManifest = {
  schema: 'opl_linux_product_manifest.v1';
  logical_distribution: 'OPL-Linux';
  physical_distribution: 'OPL-Linux';
  wsl_version: 2;
  architecture: 'x86_64';
  guest_user: 'opl';
  codex_home: '/home/opl/.codex';
  workspace_root: '/home/opl/code';
  framework_ref: string;
  framework_install_script_url: string;
  framework_source_archive_url: string;
  native_windows_executor_fallback_allowed: false;
};

type RunCommand = (
  command: string,
  args: string[],
  options?: { stdin?: string; timeoutMs?: number }
) => Promise<WindowsWslCommandResult>;

export type WindowsWslProvisionerOptions = {
  platform?: NodeJS.Platform;
  resourcesPath: string;
  userDataPath: string;
  runCommand?: RunCommand;
  onProgress?: (progress: WindowsWslProvisioningProgress) => void;
};

export class WindowsWslProvisioningError extends Error {
  readonly stage: WindowsWslProvisioningStage;
  readonly code: string;
  readonly restartRequired: boolean;

  constructor(
    message: string,
    options: {
      stage: WindowsWslProvisioningStage;
      code: string;
      restartRequired?: boolean;
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = 'WindowsWslProvisioningError';
    this.stage = options.stage;
    this.code = options.code;
    this.restartRequired = options.restartRequired ?? false;
  }
}

function bounded(value: string): string {
  return value.replaceAll('\0', '').slice(0, MAX_COMMAND_OUTPUT_BYTES);
}

export function runWindowsWslCommand(
  command: string,
  args: string[],
  options: { stdin?: string; timeoutMs?: number } = {}
): Promise<WindowsWslCommandResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: bounded(stdout),
        stderr: bounded(stderr),
        timedOut,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      finish(null);
    }, options.timeoutMs ?? COMMAND_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout = bounded(stdout + String(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderr = bounded(stderr + String(chunk));
    });
    child.once('error', () => finish(null));
    child.once('close', (code) => finish(code));
    child.stdin.end(options.stdin);
  });
}

function parseDistributionInventory(output: string): Map<string, { state: string; version: number | null }> {
  const inventory = new Map<string, { state: string; version: number | null }>();
  for (const raw of bounded(output).split(/\r?\n/)) {
    const line = raw.replace(/^\s*\*\s*/, '').trim();
    if (!line || /^NAME\s+STATE\s+VERSION$/i.test(line)) continue;
    const parts = line.split(/\s{2,}/).filter(Boolean);
    if (parts.length < 2) continue;
    const versionText = parts.at(-1) ?? '';
    inventory.set(parts[0], {
      state: parts.length >= 3 ? parts[1] : 'unknown',
      version: /^\d+$/.test(versionText) ? Number(versionText) : null,
    });
  }
  return inventory;
}

function parseOnlineDistributionNames(output: string): Set<string> {
  const names = new Set<string>();
  for (const raw of bounded(output).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^NAME\s+FRIENDLY NAME$/i.test(line)) continue;
    const [name] = line.split(/\s{2,}/);
    if (name && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) names.add(name);
  }
  return names;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeWindowsPath(value: string): string {
  return path.win32
    .normalize(value.replace(/^\\\\\?\\/, ''))
    .replace(/[\\/]+$/, '')
    .toLowerCase();
}

function sameWindowsPath(left: string, right: string): boolean {
  return normalizeWindowsPath(left) === normalizeWindowsPath(right);
}

function assertDigest(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new WindowsWslProvisioningError(`Guest identity field is invalid: ${field}`, {
      stage: 'repair_required',
      code: 'guest_identity_invalid',
    });
  }
  return value;
}

function computePackagedBootstrapDigest(bootstrapRoot: string): string {
  const digest = crypto.createHash('sha256');
  for (const name of OPL_WSL_BOOTSTRAP_ENTRYPOINTS) {
    const entrypoint = path.join(bootstrapRoot, name);
    try {
      digest.update(name);
      digest.update('\0');
      digest.update(fs.readFileSync(entrypoint));
      digest.update('\0');
    } catch (error) {
      throw new WindowsWslProvisioningError(`Unable to read the packaged OPL Linux entrypoint: ${entrypoint}`, {
        stage: 'blocked_by_policy',
        code: 'bootstrap_entrypoint_unavailable',
        cause: error,
      });
    }
  }
  return `sha256:${digest.digest('hex')}`;
}

export function validateWindowsWslProductManifest(value: unknown): WindowsWslProductManifest {
  const manifest =
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const frameworkRef = manifest?.framework_ref;
  if (
    !manifest ||
    manifest.schema !== 'opl_linux_product_manifest.v1' ||
    manifest.logical_distribution !== OPL_WSL_DISTRIBUTION ||
    manifest.physical_distribution !== OPL_WSL_DISTRIBUTION ||
    manifest.wsl_version !== 2 ||
    manifest.architecture !== 'x86_64' ||
    manifest.guest_user !== OPL_WSL_GUEST_USER ||
    manifest.codex_home !== '/home/opl/.codex' ||
    manifest.workspace_root !== '/home/opl/code' ||
    manifest.native_windows_executor_fallback_allowed !== false ||
    typeof frameworkRef !== 'string' ||
    !/^[0-9a-f]{40}$/.test(frameworkRef) ||
    manifest.framework_install_script_url !==
      `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkRef}/install.sh` ||
    manifest.framework_source_archive_url !==
      `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkRef}.tar.gz`
  ) {
    throw new WindowsWslProvisioningError('The packaged OPL Linux product manifest is invalid.', {
      stage: 'blocked_by_policy',
      code: 'product_manifest_invalid',
    });
  }
  return manifest as WindowsWslProductManifest;
}

export function validateWindowsWslGuestIdentity(value: unknown): WindowsWslGuestIdentity {
  const identity =
    value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (
    !identity ||
    identity.schema !== 'opl_linux_runtime_inspection.v1' ||
    identity.protocol_version !== 1 ||
    identity.logical_distribution !== OPL_WSL_DISTRIBUTION ||
    identity.physical_distribution !== OPL_WSL_DISTRIBUTION ||
    identity.architecture !== 'x86_64' ||
    identity.guest_user !== OPL_WSL_GUEST_USER ||
    identity.codex_home !== '/home/opl/.codex' ||
    identity.workspace_root !== '/home/opl/code' ||
    identity.native_windows_executor_fallback_allowed !== false ||
    identity.wsl2 !== true ||
    !Number.isInteger(identity.active_operation_count) ||
    (identity.active_operation_count as number) < 0
  ) {
    throw new WindowsWslProvisioningError('The OPL Linux identity does not match the Windows product contract.', {
      stage: 'repair_required',
      code: 'guest_identity_mismatch',
    });
  }
  if (
    typeof identity.guest_install_id !== 'string' ||
    !identity.guest_install_id ||
    typeof identity.distribution_generation !== 'number' ||
    typeof identity.codex_path !== 'string' ||
    !identity.codex_path.startsWith('/opt/opl/carrier/store/sha256/') ||
    identity.codex_command_path !== '/usr/local/bin/codex' ||
    typeof identity.codex_realpath !== 'string' ||
    identity.codex_realpath !== identity.codex_path ||
    typeof identity.framework_path !== 'string' ||
    !identity.framework_path.startsWith('/home/opl/') ||
    typeof identity.framework_ref !== 'string' ||
    !/^[0-9a-f]{40}$/.test(identity.framework_ref)
  ) {
    throw new WindowsWslProvisioningError('The OPL Linux identity is incomplete.', {
      stage: 'repair_required',
      code: 'guest_identity_incomplete',
    });
  }
  assertDigest(identity.carrier_activation_digest, 'carrier_activation_digest');
  assertDigest(identity.bootstrap_digest, 'bootstrap_digest');
  assertDigest(identity.aioncore_digest, 'aioncore_digest');
  assertDigest(identity.codex_digest, 'codex_digest');
  assertDigest(identity.codex_command_digest, 'codex_command_digest');
  assertDigest(identity.framework_digest, 'framework_digest');
  if (identity.codex_command_digest !== identity.codex_digest) {
    throw new WindowsWslProvisioningError('The owner-bound Codex command does not match the packaged identity.', {
      stage: 'repair_required',
      code: 'guest_codex_identity_mismatch',
    });
  }
  return identity as WindowsWslGuestIdentity;
}

export class WindowsWslProvisioner {
  private readonly platform: NodeJS.Platform;
  private readonly resourcesPath: string;
  private readonly userDataPath: string;
  private readonly runCommand: RunCommand;
  private readonly onProgress?: (progress: WindowsWslProvisioningProgress) => void;
  private readonly product: WindowsWslProductManifest;
  private readonly expectedBootstrapDigest: string;
  private readyIdentity: WindowsWslGuestIdentity | null = null;

  constructor(options: WindowsWslProvisionerOptions) {
    this.platform = options.platform ?? process.platform;
    this.resourcesPath = options.resourcesPath;
    this.userDataPath = options.userDataPath;
    this.runCommand = options.runCommand ?? runWindowsWslCommand;
    this.onProgress = options.onProgress;
    const productPath = path.join(this.resourcesPath, 'opl-linux', 'product.json');
    try {
      this.product = validateWindowsWslProductManifest(JSON.parse(fs.readFileSync(productPath, 'utf8')));
    } catch (error) {
      if (error instanceof WindowsWslProvisioningError) throw error;
      throw new WindowsWslProvisioningError(`Unable to read the packaged OPL Linux product manifest: ${productPath}`, {
        stage: 'blocked_by_policy',
        code: 'product_manifest_unavailable',
        cause: error,
      });
    }
    this.expectedBootstrapDigest = computePackagedBootstrapDigest(
      path.join(this.resourcesPath, 'opl-linux', 'bootstrap')
    );
  }

  private progress(stage: WindowsWslProvisioningStage, detail: string): void {
    this.onProgress?.({ stage, detail });
  }

  private async wsl(args: string[], options: { stdin?: string; timeoutMs?: number } = {}) {
    return await this.runCommand('wsl.exe', args, options);
  }

  private async requireSuccess(
    result: WindowsWslCommandResult,
    stage: WindowsWslProvisioningStage,
    code: string
  ): Promise<WindowsWslCommandResult> {
    if (result.exitCode === 0 && !result.timedOut) return result;
    throw new WindowsWslProvisioningError(`${stage} failed: ${bounded(result.stderr || result.stdout || code)}`, {
      stage,
      code,
    });
  }

  private async enableWslFeatures(): Promise<void> {
    this.progress('enabling_wsl', 'Requesting the Windows WSL2 feature.');
    const script = [
      "$ErrorActionPreference='Stop'",
      "$wsl=Join-Path $env:SystemRoot 'System32\\wsl.exe'",
      "$p=Start-Process -FilePath $wsl -ArgumentList @('--install','--no-distribution') -Verb RunAs -Wait -PassThru",
      'exit $p.ExitCode',
    ].join(';');
    const result = await this.runCommand('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]);
    if (result.exitCode !== 0 || result.timedOut) {
      throw new WindowsWslProvisioningError('Windows did not enable WSL2.', {
        stage: 'blocked_by_policy',
        code: 'wsl_enablement_failed_or_uac_denied',
      });
    }
    const postEnableStatus = await this.wsl(['--status']);
    if (postEnableStatus.exitCode === 0 && !postEnableStatus.timedOut) {
      return;
    }
    throw new WindowsWslProvisioningError('Windows must restart before OPL Linux setup can continue.', {
      stage: 'restart_required',
      code: 'wsl_restart_required',
      restartRequired: true,
    });
  }

  private async inspectOnlineDistributions(): Promise<Set<string>> {
    const result = await this.wsl(['--list', '--online']);
    await this.requireSuccess(result, 'installing_owned_distribution', 'distribution_catalog_unavailable');
    return parseOnlineDistributionNames(result.stdout);
  }

  private async inspectInventory(): Promise<Map<string, { state: string; version: number | null }>> {
    const result = await this.wsl(['--list', '--verbose']);
    if (result.exitCode !== 0 || result.timedOut) return new Map();
    return parseDistributionInventory(result.stdout);
  }

  private installLocation(): string {
    return path.join(this.userDataPath, 'wsl', OPL_WSL_DISTRIBUTION);
  }

  private async inspectRegisteredDistributionBasePath(): Promise<string | null> {
    const script = [
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      "$root = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss'",
      `$entry = Get-ChildItem -LiteralPath $root -ErrorAction Stop | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } | Where-Object { $_.DistributionName -eq '${OPL_WSL_DISTRIBUTION}' } | Select-Object -First 1`,
      'if ($null -eq $entry) { exit 3 }',
      '[pscustomobject]@{ distribution_name = $entry.DistributionName; base_path = $entry.BasePath } | ConvertTo-Json -Compress',
    ].join('; ');
    const result = await this.runCommand('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ]);
    if (result.exitCode === 3 && !result.timedOut) return null;
    await this.requireSuccess(result, 'repair_required', 'distribution_registry_read_failed');
    const registry = parseJsonObject(result.stdout);
    return registry?.distribution_name === OPL_WSL_DISTRIBUTION && typeof registry.base_path === 'string'
      ? registry.base_path
      : null;
  }

  private async inspectGuestIdentity(): Promise<WindowsWslGuestIdentity> {
    const result = await this.wsl([
      '--distribution',
      OPL_WSL_DISTRIBUTION,
      '--user',
      OPL_WSL_GUEST_USER,
      '--exec',
      OPL_WSL_RUNTIME_INSPECT,
      '--json',
    ]);
    await this.requireSuccess(result, 'repair_required', 'runtime_inspection_failed');
    return validateWindowsWslGuestIdentity(parseJsonObject(result.stdout));
  }

  private async assertOwnedDistributionLocation(): Promise<void> {
    const registeredBasePath = await this.inspectRegisteredDistributionBasePath();
    if (registeredBasePath && sameWindowsPath(registeredBasePath, this.installLocation())) return;

    // A prior App install may have registered the same logical distro under an
    // older task-owned path. Reuse it only after the guest proves the OPL
    // identity contract; arbitrary same-name WSL distributions remain blocked.
    try {
      await this.inspectGuestIdentity();
      return;
    } catch (error) {
      throw new WindowsWslProvisioningError(
        'The OPL-Linux name is already registered outside the current App-owned data directory.',
        {
          stage: 'repair_required',
          code: 'same_name_foreign_distribution',
          cause: error,
        }
      );
    }
  }

  private async installDistribution(): Promise<void> {
    this.progress('installing_owned_distribution', 'Installing the dedicated OPL Linux environment.');
    const online = await this.inspectOnlineDistributions();
    if (!online.has(DEFAULT_BASE_DISTRIBUTION)) {
      throw new WindowsWslProvisioningError(
        `The required WSL distribution is not available: ${DEFAULT_BASE_DISTRIBUTION}`,
        {
          stage: 'installing_owned_distribution',
          code: 'base_distribution_unavailable',
        }
      );
    }
    const installLocation = this.installLocation();
    fs.mkdirSync(path.dirname(installLocation), { recursive: true });
    const result = await this.wsl(
      [
        '--install',
        DEFAULT_BASE_DISTRIBUTION,
        '--name',
        OPL_WSL_DISTRIBUTION,
        '--location',
        installLocation,
        '--no-launch',
        '--version',
        '2',
        '--web-download',
      ],
      { timeoutMs: COMMAND_TIMEOUT_MS }
    );
    await this.requireSuccess(result, 'installing_owned_distribution', 'distribution_install_failed');
    await this.assertOwnedDistributionLocation();
  }

  private async translateWindowsPath(windowsPath: string): Promise<string> {
    const result = await this.wsl([
      '--distribution',
      OPL_WSL_DISTRIBUTION,
      '--user',
      'root',
      '--exec',
      'wslpath',
      '-a',
      windowsPath,
    ]);
    await this.requireSuccess(result, 'initializing_guest', 'wsl_path_projection_failed');
    const translated = bounded(result.stdout).trim();
    if (!translated.startsWith('/mnt/')) {
      throw new WindowsWslProvisioningError('Packaged runtime path is not visible inside OPL Linux.', {
        stage: 'initializing_guest',
        code: 'packaged_runtime_path_unavailable',
      });
    }
    return translated;
  }

  private async bootstrapGuest(): Promise<void> {
    this.progress('initializing_guest', 'Initializing the OPL Linux environment.');
    const bootstrapRoot = await this.translateWindowsPath(path.join(this.resourcesPath, 'opl-linux', 'bootstrap'));
    const runtimeRoot = await this.translateWindowsPath(path.join(this.resourcesPath, 'bundled-aioncore', 'linux-x64'));
    const frameworkInstaller = await this.translateWindowsPath(path.join(this.resourcesPath, 'opl-install.sh'));
    const productManifest = await this.translateWindowsPath(path.join(this.resourcesPath, 'opl-linux', 'product.json'));
    const bootstrapResult = await this.wsl(
      [
        '--distribution',
        OPL_WSL_DISTRIBUTION,
        '--user',
        'root',
        '--exec',
        '/bin/bash',
        path.posix.join(bootstrapRoot, 'install-opl-linux.sh'),
        runtimeRoot,
        bootstrapRoot,
        frameworkInstaller,
        productManifest,
      ],
      { timeoutMs: COMMAND_TIMEOUT_MS }
    );
    await this.requireSuccess(bootstrapResult, 'initializing_guest', 'guest_bootstrap_failed');

    this.progress('activating_owner_artifacts', 'Activating the OPL Framework inside OPL Linux.');
    const frameworkResult = await this.wsl(
      [
        '--distribution',
        OPL_WSL_DISTRIBUTION,
        '--user',
        OPL_WSL_GUEST_USER,
        '--exec',
        'env',
        'HOME=/home/opl',
        'CODEX_HOME=/home/opl/.codex',
        'OPL_CODEX_BIN=/usr/local/bin/codex',
        'OPL_WORKSPACE_ROOT=/home/opl/code',
        'OPL_INSTALL_DIR=/home/opl/.opl/one-person-lab',
        `OPL_INSTALL_SCRIPT_URL=${this.product.framework_install_script_url}`,
        `OPL_INSTALL_BRANCH=${this.product.framework_ref}`,
        'OPL_INSTALL_SOURCE_MODE=archive',
        `OPL_SOURCE_ARCHIVE_URL=${this.product.framework_source_archive_url}`,
        `PATH=${OPL_WSL_GUEST_PATH}`,
        '/bin/bash',
        '/opt/opl/bootstrap/opl-install.sh',
        '--headless',
        '--skip-packages',
      ],
      { timeoutMs: COMMAND_TIMEOUT_MS }
    );
    await this.requireSuccess(frameworkResult, 'activating_owner_artifacts', 'framework_activation_failed');
  }

  async inspect(): Promise<WindowsWslGuestIdentity> {
    const identity = await this.inspectGuestIdentity();
    if (identity.bootstrap_digest !== this.expectedBootstrapDigest) {
      throw new WindowsWslProvisioningError(
        'The installed OPL Linux runtime entrypoints do not match the packaged App cohort.',
        {
          stage: 'repair_required',
          code: 'bootstrap_digest_mismatch',
        }
      );
    }
    if (identity.framework_ref !== this.product.framework_ref) {
      throw new WindowsWslProvisioningError('The installed Framework ref does not match the packaged product cohort.', {
        stage: 'repair_required',
        code: 'framework_ref_mismatch',
      });
    }
    return identity;
  }

  private writeReceipt(identity: WindowsWslGuestIdentity): void {
    const receiptRoot = path.join(this.userDataPath, 'installer', 'receipts');
    fs.mkdirSync(receiptRoot, { recursive: true });
    const receipt = {
      schema: 'opl_windows_wsl2_provisioning_receipt.v1',
      status: 'ready',
      observed_at: new Date().toISOString(),
      distribution: OPL_WSL_DISTRIBUTION,
      identity,
    };
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    const digest = crypto.createHash('sha256').update(serialized).digest('hex');
    const pending = path.join(receiptRoot, 'windows-wsl2-ready.json.pending');
    const target = path.join(receiptRoot, 'windows-wsl2-ready.json');
    fs.writeFileSync(pending, serialized, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(pending, target);
    fs.writeFileSync(`${target}.sha256`, `${digest}  windows-wsl2-ready.json\n`, 'utf8');
  }

  async ensureReady(): Promise<WindowsWslGuestIdentity> {
    if (this.readyIdentity) return this.readyIdentity;
    if (this.platform !== 'win32') {
      throw new WindowsWslProvisioningError('The Windows WSL provisioner can run only on Windows.', {
        stage: 'blocked_by_policy',
        code: 'unsupported_host',
      });
    }

    this.progress('checking_host', 'Checking WSL2 and the owned OPL Linux environment.');
    const status = await this.wsl(['--status']);
    if (status.exitCode !== 0 || status.timedOut) {
      await this.enableWslFeatures();
    }

    let inventory = await this.inspectInventory();
    const existing = inventory.get(OPL_WSL_DISTRIBUTION);
    if (existing && existing.version !== 2) {
      throw new WindowsWslProvisioningError('An OPL-Linux distribution exists but is not WSL2.', {
        stage: 'repair_required',
        code: 'owned_distribution_not_wsl2',
      });
    }
    if (!existing) {
      await this.installDistribution();
      inventory = await this.inspectInventory();
      if (inventory.get(OPL_WSL_DISTRIBUTION)?.version !== 2) {
        throw new WindowsWslProvisioningError('Windows did not register OPL-Linux as WSL2.', {
          stage: 'repair_required',
          code: 'owned_distribution_registration_failed',
        });
      }
    } else {
      await this.assertOwnedDistributionLocation();
    }

    try {
      this.readyIdentity = await this.inspect();
    } catch {
      await this.bootstrapGuest();
      this.progress('validating_routes', 'Validating the Linux runtime identity.');
      this.readyIdentity = await this.inspect();
    }

    this.writeReceipt(this.readyIdentity);
    this.progress('ready', 'OPL Linux is ready.');
    return this.readyIdentity;
  }
}

export const __windowsWslProvisionerTest = {
  DEFAULT_BASE_DISTRIBUTION,
  OPL_WSL_GUEST_PATH,
  computePackagedBootstrapDigest,
  normalizeWindowsPath,
  parseDistributionInventory,
  parseOnlineDistributionNames,
  sameWindowsPath,
};

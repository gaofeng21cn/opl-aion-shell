import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const OPL_WSL_DISTRIBUTION = 'OPL-Linux';
export const OPL_WSL_GUEST_USER = 'opl';
export const OPL_WSL_RUNTIME_INSPECT = '/opt/opl/bootstrap/opl-runtime-inspect';
const DEFAULT_BASE_DISTRIBUTION = 'Ubuntu-24.04';
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
  aioncore_digest: string;
  codex_digest: string;
  codex_path: string;
  codex_home: '/home/opl/.codex';
  workspace_root: '/home/opl/code';
  framework_path: string;
  framework_digest: string;
  native_windows_executor_fallback_allowed: false;
  wsl2: true;
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

function assertDigest(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new WindowsWslProvisioningError(`Guest identity field is invalid: ${field}`, {
      stage: 'repair_required',
      code: 'guest_identity_invalid',
    });
  }
  return value;
}

export function validateWindowsWslGuestIdentity(value: unknown): WindowsWslGuestIdentity {
  const identity =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
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
    identity.wsl2 !== true
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
    !identity.codex_path.startsWith('/opt/opl/carrier/') ||
    typeof identity.framework_path !== 'string' ||
    !identity.framework_path.startsWith('/home/opl/')
  ) {
    throw new WindowsWslProvisioningError('The OPL Linux identity is incomplete.', {
      stage: 'repair_required',
      code: 'guest_identity_incomplete',
    });
  }
  assertDigest(identity.carrier_activation_digest, 'carrier_activation_digest');
  assertDigest(identity.aioncore_digest, 'aioncore_digest');
  assertDigest(identity.codex_digest, 'codex_digest');
  assertDigest(identity.framework_digest, 'framework_digest');
  return identity as WindowsWslGuestIdentity;
}

export class WindowsWslProvisioner {
  private readonly platform: NodeJS.Platform;
  private readonly resourcesPath: string;
  private readonly userDataPath: string;
  private readonly runCommand: RunCommand;
  private readonly onProgress?: (progress: WindowsWslProvisioningProgress) => void;
  private readyIdentity: WindowsWslGuestIdentity | null = null;

  constructor(options: WindowsWslProvisionerOptions) {
    this.platform = options.platform ?? process.platform;
    this.resourcesPath = options.resourcesPath;
    this.userDataPath = options.userDataPath;
    this.runCommand = options.runCommand ?? runWindowsWslCommand;
    this.onProgress = options.onProgress;
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
    throw new WindowsWslProvisioningError(
      `${stage} failed: ${bounded(result.stderr || result.stdout || code)}`,
      { stage, code }
    );
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
    throw new WindowsWslProvisioningError('Windows must restart before OPL Linux setup can continue.', {
      stage: 'restart_required',
      code: 'wsl_restart_required',
      restartRequired: true,
    });
  }

  private async inspectInventory(): Promise<Map<string, { state: string; version: number | null }>> {
    const result = await this.wsl(['--list', '--verbose']);
    if (result.exitCode !== 0 || result.timedOut) return new Map();
    return parseDistributionInventory(result.stdout);
  }

  private async installDistribution(): Promise<void> {
    this.progress('installing_owned_distribution', 'Installing the dedicated OPL Linux environment.');
    const installLocation = path.join(this.userDataPath, 'wsl', OPL_WSL_DISTRIBUTION);
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
    const runtimeRoot = await this.translateWindowsPath(
      path.join(this.resourcesPath, 'bundled-aioncore', 'linux-x64')
    );
    const frameworkInstaller = await this.translateWindowsPath(path.join(this.resourcesPath, 'opl-install.sh'));
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
    const result = await this.wsl([
      '--distribution',
      OPL_WSL_DISTRIBUTION,
      '--user',
      OPL_WSL_GUEST_USER,
      '--exec',
      OPL_WSL_RUNTIME_INSPECT,
      '--json',
    ]);
    await this.requireSuccess(result, 'validating_routes', 'runtime_inspection_failed');
    return validateWindowsWslGuestIdentity(parseJsonObject(result.stdout));
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
    }

    try {
      this.readyIdentity = await this.inspect();
    } catch (error) {
      if (existing) {
        const foreignIdentity = await this.wsl([
          '--distribution',
          OPL_WSL_DISTRIBUTION,
          '--user',
          'root',
          '--exec',
          'test',
          '-f',
          '/etc/opl/identity.json',
        ]);
        if (foreignIdentity.exitCode !== 0) {
          throw new WindowsWslProvisioningError(
            'The OPL-Linux name is already registered without an OPL owner identity.',
            {
              stage: 'repair_required',
              code: 'same_name_foreign_distribution',
              cause: error,
            }
          );
        }
      }
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
  parseDistributionInventory,
};

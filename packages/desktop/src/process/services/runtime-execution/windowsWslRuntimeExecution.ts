import crypto from 'node:crypto';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

import {
  OPL_WSL_DISTRIBUTION,
  OPL_WSL_GUEST_USER,
  OPL_WSL_RUNTIME_INSPECT,
  type WindowsWslGuestIdentity,
  WindowsWslProvisioner,
  type WindowsWslProvisioningProgress,
} from '../windows-wsl/provisioner';

const RUNTIME_EXECUTABLE = '/opt/opl/bootstrap/opl-runtime-exec';
const RUNTIME_CONTROL = '/opt/opl/bootstrap/opl-runtime-control';
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type WindowsWslProgram = 'aioncore' | 'codex-app-server' | 'opl-cli';

export type WindowsWslSpawnRequest = {
  program: WindowsWslProgram;
  args: string[];
  stdin?: string;
  operationToken?: string;
};

export type WindowsWslProcessHandle = {
  child: ChildProcessWithoutNullStreams;
  operationToken: string;
  terminate: (graceMs?: number) => Promise<void>;
  finalize: () => Promise<void>;
};

type RuntimeOptions = {
  platform?: NodeJS.Platform;
  resourcesPath: string;
  userDataPath: string;
  onProgress?: (progress: WindowsWslProvisioningProgress) => void;
  provisioner?: WindowsWslProvisioner;
  spawnProcess?: typeof spawn;
};

function operationToken(): string {
  return `app-${Date.now().toString(36)}-${crypto.randomBytes(12).toString('hex')}`;
}

function requireToken(value: string): string {
  if (!TOKEN_PATTERN.test(value)) throw new Error('WSL runtime operation token is invalid.');
  return value;
}

function wslArgs(...guestArgs: string[]): string[] {
  return ['--distribution', OPL_WSL_DISTRIBUTION, '--user', OPL_WSL_GUEST_USER, '--exec', ...guestArgs];
}

export class WindowsWslRuntimeExecution {
  readonly kind = 'windows_wsl2' as const;
  private readonly platform: NodeJS.Platform;
  private readonly provisioner: WindowsWslProvisioner;
  private readonly spawnProcess: typeof spawn;
  private readonly activeHandles = new Map<string, WindowsWslProcessHandle>();
  private readonly terminationByToken = new Map<string, Promise<void>>();

  constructor(options: RuntimeOptions) {
    this.platform = options.platform ?? process.platform;
    this.provisioner =
      options.provisioner ??
      new WindowsWslProvisioner({
        platform: this.platform,
        resourcesPath: options.resourcesPath,
        userDataPath: options.userDataPath,
        onProgress: options.onProgress,
      });
    this.spawnProcess = options.spawnProcess ?? spawn;
  }

  async ensureReady(): Promise<WindowsWslGuestIdentity> {
    if (this.platform !== 'win32') throw new Error('Windows WSL runtime is unavailable on this host.');
    return await this.provisioner.ensureReady();
  }

  async inspect(): Promise<WindowsWslGuestIdentity> {
    return await this.provisioner.inspect();
  }

  buildSpawnCommand(request: WindowsWslSpawnRequest): {
    command: 'wsl.exe';
    args: string[];
    operationToken: string;
    redactedCommand: string;
  } {
    const token = requireToken(request.operationToken ?? operationToken());
    return {
      command: 'wsl.exe',
      args: wslArgs(RUNTIME_EXECUTABLE, '--kind', request.program, '--operation-token', token, '--', ...request.args),
      operationToken: token,
      redactedCommand: `wsl.exe --distribution <opl-owned> --user opl --exec opl-runtime-exec --kind ${request.program} --operation-token <redacted>`,
    };
  }

  buildInspectCommand(): { command: 'wsl.exe'; args: string[]; redactedCommand: string } {
    return {
      command: 'wsl.exe',
      args: wslArgs(OPL_WSL_RUNTIME_INSPECT, '--json'),
      redactedCommand: 'wsl.exe --distribution <opl-owned> --user opl --exec opl-runtime-inspect --json',
    };
  }

  buildControlCommand(
    operationTokenValue: string,
    graceMs = 5000
  ): {
    command: 'wsl.exe';
    args: string[];
    redactedCommand: string;
  } {
    const token = requireToken(operationTokenValue);
    return {
      command: 'wsl.exe',
      args: wslArgs(
        RUNTIME_CONTROL,
        '--operation-token',
        token,
        '--grace-ms',
        String(Math.max(0, Math.min(120_000, Math.trunc(graceMs))))
      ),
      redactedCommand:
        'wsl.exe --distribution <opl-owned> --user opl --exec opl-runtime-control --operation-token <redacted>',
    };
  }

  private terminateOperation(operationTokenValue: string, graceMs = 5000): Promise<void> {
    const token = requireToken(operationTokenValue);
    const inFlight = this.terminationByToken.get(token);
    if (inFlight) return inFlight;

    const control = this.buildControlCommand(token, graceMs);
    const termination = new Promise<void>((resolve, reject) => {
      const process = this.spawnProcess(control.command, control.args, {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      process.stderr?.on('data', (chunk) => {
        stderr = `${stderr}${String(chunk)}`.slice(-4096);
      });
      process.once('error', reject);
      process.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`WSL runtime control failed (${String(code)}): ${stderr}`))
      );
    });
    this.terminationByToken.set(token, termination);
    void termination.then(
      () => this.terminationByToken.delete(token),
      () => this.terminationByToken.delete(token)
    );
    return termination;
  }

  spawn(request: WindowsWslSpawnRequest): WindowsWslProcessHandle {
    const command = this.buildSpawnCommand(request);
    const child = this.spawnProcess(command.command, command.args, {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    if (request.stdin !== undefined) child.stdin.end(request.stdin);
    let finalization: Promise<void> | null = null;
    const finalize = (graceMs = 5000): Promise<void> => {
      finalization ??= this.terminateOperation(command.operationToken, graceMs).finally(() => {
        this.activeHandles.delete(command.operationToken);
      });
      return finalization;
    };
    const handle: WindowsWslProcessHandle = {
      child,
      operationToken: command.operationToken,
      terminate: finalize,
      finalize: () => finalize(),
    };
    this.activeHandles.set(command.operationToken, handle);
    return handle;
  }

  async terminateAll(graceMs = 5000): Promise<void> {
    const handles = [...this.activeHandles.values()];
    const results = await Promise.allSettled(handles.map((handle) => handle.terminate(graceMs)));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`Failed to stop ${failures.length} OPL Linux runtime operation(s).`);
    }
  }
}

export const __windowsWslRuntimeExecutionTest = {
  RUNTIME_CONTROL,
  RUNTIME_EXECUTABLE,
  TOKEN_PATTERN,
  wslArgs,
};

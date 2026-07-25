/**
 * Validation-only WSL2 command adapter.
 *
 * This deliberately produces structured `wsl.exe --exec` command specs instead
 * of substituting a Linux command for the native backend resolver. The current
 * backend, Codex app-server, and Framework CLI each have different lifecycle
 * contracts, so they must move together behind a future selected execution
 * boundary rather than being split by an environment flag.
 */

const WSL_EXECUTABLE = 'wsl.exe';
const DEFAULT_DISTRIBUTION = 'OPL-Validation-g0001';
const INSPECT_EXECUTABLE = '/opt/opl/bootstrap/opl-runtime-inspect';
const EXECUTE_EXECUTABLE = '/opt/opl/bootstrap/opl-runtime-exec';
const CONTROL_EXECUTABLE = '/opt/opl/bootstrap/opl-runtime-control';
const VALIDATION_ENV = 'OPL_WINDOWS_WSL2_VALIDATION';
const DISTRIBUTION_ENV = 'OPL_WINDOWS_WSL2_VALIDATION_DISTRIBUTION';
const OPERATION_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DISTRIBUTION_PATTERN = /^OPL-Validation-[A-Za-z0-9._-]{1,63}$/;

const RUNTIME_KINDS = ['aioncore', 'codex-app-server', 'opl-cli'] as const;

export type Wsl2ValidationRuntimeKind = (typeof RUNTIME_KINDS)[number];

export type Wsl2ValidationCommand = {
  command: typeof WSL_EXECUTABLE;
  args: string[];
  redactedCommand: string;
};

export type Wsl2ValidationRuntime = {
  distribution: string;
  inspect: () => Wsl2ValidationCommand;
  launch: (kind: Wsl2ValidationRuntimeKind, operationToken: string) => Wsl2ValidationCommand;
  stop: (operationToken: string) => Wsl2ValidationCommand;
};

type ResolveWsl2ValidationRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

function validateDistribution(value: string): string {
  if (!DISTRIBUTION_PATTERN.test(value)) {
    throw new Error('WSL2 validation distribution must use the OPL-Validation-<fixture> namespace.');
  }
  return value;
}

function validateOperationToken(value: string): string {
  const normalized = value.trim();
  if (!OPERATION_TOKEN_PATTERN.test(normalized)) {
    throw new Error('WSL2 validation operation token is invalid.');
  }
  return normalized;
}

function validateRuntimeKind(value: Wsl2ValidationRuntimeKind): Wsl2ValidationRuntimeKind {
  if (!(RUNTIME_KINDS as readonly string[]).includes(value)) {
    throw new Error('WSL2 validation runtime kind is invalid.');
  }
  return value;
}

function command(args: string[], redactedCommand: string): Wsl2ValidationCommand {
  return { command: WSL_EXECUTABLE, args, redactedCommand };
}

/**
 * Returns a direct-child WSL2 command adapter only for the explicitly named,
 * disposable validation fixture. It is intentionally absent on all other
 * platforms and when the developer opt-in flag is not exactly `1`.
 */
export function resolveWsl2ValidationRuntime(
  options: ResolveWsl2ValidationRuntimeOptions = {}
): Wsl2ValidationRuntime | null {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32' || env[VALIDATION_ENV] !== '1') {
    return null;
  }

  const distribution = validateDistribution(env[DISTRIBUTION_ENV]?.trim() || DEFAULT_DISTRIBUTION);
  const withDistribution = (...args: string[]) => ['--distribution', distribution, '--exec', ...args];

  return {
    distribution,
    inspect: () =>
      command(
        withDistribution(INSPECT_EXECUTABLE, '--json'),
        'wsl.exe --distribution <validation-fixture> --exec opl-runtime-inspect --json'
      ),
    launch: (kind, operationToken) => {
      const runtimeKind = validateRuntimeKind(kind);
      const token = validateOperationToken(operationToken);
      return command(
        withDistribution(EXECUTE_EXECUTABLE, '--kind', runtimeKind, '--operation-token', token),
        `wsl.exe --distribution <validation-fixture> --exec opl-runtime-exec --kind ${kind} --operation-token <redacted>`
      );
    },
    stop: (operationToken) => {
      const token = validateOperationToken(operationToken);
      return command(
        withDistribution(CONTROL_EXECUTABLE, '--operation-token', token),
        'wsl.exe --distribution <validation-fixture> --exec opl-runtime-control --operation-token <redacted>'
      );
    },
  };
}

export const __wsl2ValidationRuntimeTest = {
  CONTROL_EXECUTABLE,
  DEFAULT_DISTRIBUTION,
  DISTRIBUTION_ENV,
  EXECUTE_EXECUTABLE,
  INSPECT_EXECUTABLE,
  VALIDATION_ENV,
  WSL_EXECUTABLE,
};

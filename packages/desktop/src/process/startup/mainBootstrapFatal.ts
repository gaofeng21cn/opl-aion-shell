/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type NodeRequire = (id: string) => unknown;

type ElectronAppLike = {
  exit?: (code?: number) => void;
  getPath?: (name: string) => string;
};

type EarlyFatalEvent = {
  type: 'uncaughtException' | 'unhandledRejection' | 'bootstrapImportFailure';
  error: unknown;
};

type EarlyFatalRecord = {
  schema: 'aionui.main_bootstrap_fatal.v1';
  type: EarlyFatalEvent['type'];
  created_at: string;
  pid: number;
  argv: string[];
  cwd: string;
  versions: NodeJS.ProcessVersions;
  error: {
    name: string;
    message: string;
    stack: string | null;
  };
};

type RuntimeDeps = {
  requireModule?: NodeRequire;
  stderrWrite?: (message: string) => void;
  exitProcess?: (code: number) => void;
};

function getRuntimeRequire(): NodeRequire | null {
  try {
    const candidate = (globalThis as typeof globalThis & { require?: NodeRequire }).require;
    if (typeof candidate === 'function') {
      return candidate;
    }
  } catch {
    // ignore
  }

  try {
    const candidate = Function('return typeof require === "function" ? require : null')() as NodeRequire | null;
    return typeof candidate === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

function normalizeError(error: unknown): EarlyFatalRecord['error'] {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    };
  }

  return {
    name: typeof error,
    message: typeof error === 'string' ? error : (JSON.stringify(error) ?? String(error)),
    stack: null,
  };
}

function resolveFatalLogPath(requireModule: NodeRequire): string {
  const fs = requireModule('node:fs') as typeof import('fs');
  const os = requireModule('node:os') as typeof import('os');
  const path = requireModule('node:path') as typeof import('path');

  let appSupportRoot: string | null = null;
  try {
    const electron = requireModule('electron') as { app?: ElectronAppLike };
    const app = electron.app;
    if (app?.getPath) {
      appSupportRoot = app.getPath('userData');
    }
  } catch {
    appSupportRoot = null;
  }

  const fallbackRoot =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'One Person Lab')
      : path.join(os.homedir(), '.one-person-lab');
  const root = appSupportRoot || fallbackRoot;
  fs.mkdirSync(root, { recursive: true });
  return path.join(root, 'main-bootstrap-fatal.jsonl');
}

export function buildEarlyFatalRecord(event: EarlyFatalEvent): EarlyFatalRecord {
  return {
    schema: 'aionui.main_bootstrap_fatal.v1',
    type: event.type,
    created_at: new Date().toISOString(),
    pid: process.pid,
    argv: [...process.argv],
    cwd: process.cwd(),
    versions: { ...process.versions },
    error: normalizeError(event.error),
  };
}

export function writeEarlyFatalRecord(event: EarlyFatalEvent, deps: RuntimeDeps = {}): EarlyFatalRecord {
  const record = buildEarlyFatalRecord(event);
  const line = `${JSON.stringify(record)}\n`;
  const stderrWrite = deps.stderrWrite ?? ((message: string) => process.stderr.write(message));
  const requireModule = deps.requireModule ?? getRuntimeRequire();

  try {
    if (requireModule) {
      const fs = requireModule('node:fs') as typeof import('fs');
      fs.appendFileSync(resolveFatalLogPath(requireModule), line, 'utf8');
    }
  } catch (writeError) {
    stderrWrite(`[AionUi:bootstrap] failed to write early fatal log: ${normalizeError(writeError).message}\n`);
  }

  stderrWrite(`[AionUi:bootstrap] ${record.type}: ${record.error.stack || record.error.message}\n`);
  return record;
}

function exitAfterEarlyFatal(code: number, deps: RuntimeDeps = {}): void {
  const requireModule = deps.requireModule ?? getRuntimeRequire();
  try {
    if (requireModule) {
      const electron = requireModule('electron') as { app?: ElectronAppLike };
      const app = electron.app;
      if (app?.exit) {
        app.exit(code);
        return;
      }
    }
  } catch {
    // Fall back to process.exit below.
  }

  const exitProcess = deps.exitProcess ?? ((exitCode: number) => process.exit(exitCode));
  exitProcess(code);
}

export function installEarlyFatalHandlers(deps: RuntimeDeps = {}): void {
  process.on('uncaughtException', (error) => {
    writeEarlyFatalRecord({ type: 'uncaughtException', error }, deps);
    exitAfterEarlyFatal(1, deps);
  });

  process.on('unhandledRejection', (error) => {
    writeEarlyFatalRecord({ type: 'unhandledRejection', error }, deps);
    exitAfterEarlyFatal(1, deps);
  });
}

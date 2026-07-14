import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildEarlyFatalRecord,
  installEarlyFatalHandlers,
  writeEarlyFatalRecord,
} from '@/process/startup/mainBootstrapFatal';

const tmpRoots: string[] = [];
const originalUncaughtExceptionListeners = process.listeners('uncaughtException');
const originalUnhandledRejectionListeners = process.listeners('unhandledRejection');

function makeTempRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  process.removeAllListeners('uncaughtException');
  process.removeAllListeners('unhandledRejection');
  for (const listener of originalUncaughtExceptionListeners) {
    process.on('uncaughtException', listener);
  }
  for (const listener of originalUnhandledRejectionListeners) {
    process.on('unhandledRejection', listener);
  }
  vi.restoreAllMocks();
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('mainBootstrap early fatal handling', () => {
  it('serializes bootstrap failures with stack details', () => {
    const error = new Error('startup failed before app ready');
    const record = buildEarlyFatalRecord({ type: 'bootstrapImportFailure', error });

    expect(record.schema).toBe('aionui.main_bootstrap_fatal.v1');
    expect(record.type).toBe('bootstrapImportFailure');
    expect(record.error.name).toBe('Error');
    expect(record.error.message).toBe('startup failed before app ready');
    expect(record.error.stack).toContain('startup failed before app ready');
  });

  it('writes early fatal records under app userData when Electron is reachable', () => {
    const userData = makeTempRoot('opl-bootstrap-user-data');
    const requireModule = vi.fn((id: string) => {
      if (id === 'node:fs') return fs;
      if (id === 'node:os') return os;
      if (id === 'node:path') return path;
      if (id === 'electron') {
        return {
          app: {
            getPath: () => userData,
          },
        };
      }
      throw new Error(`unexpected module: ${id}`);
    });
    const stderrWrite = vi.fn();

    const record = writeEarlyFatalRecord(
      { type: 'uncaughtException', error: new Error('boom before imports') },
      { requireModule, stderrWrite }
    );

    const logPath = path.join(userData, 'main-bootstrap-fatal.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      schema: 'aionui.main_bootstrap_fatal.v1',
      type: 'uncaughtException',
      error: {
        message: 'boom before imports',
      },
    });
    expect(record.error.message).toBe('boom before imports');
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('[AionUi:bootstrap] uncaughtException:'));
  });

  it('exits through Electron app after an uncaught exception so Electron does not show its default modal', () => {
    const exit = vi.fn();
    const requireModule = vi.fn((id: string) => {
      if (id === 'node:fs') return fs;
      if (id === 'node:os') return os;
      if (id === 'node:path') return path;
      if (id === 'electron') {
        return {
          app: {
            getPath: () => makeTempRoot('opl-bootstrap-exit-user-data'),
            exit,
          },
        };
      }
      throw new Error(`unexpected module: ${id}`);
    });

    installEarlyFatalHandlers({
      requireModule,
      stderrWrite: vi.fn(),
      exitProcess: vi.fn(),
    });

    const listeners = process
      .listeners('uncaughtException')
      .filter((listener) => !originalUncaughtExceptionListeners.includes(listener));
    expect(listeners).toHaveLength(1);
    (listeners[0] as (error: Error) => void)(new Error('modal blocker'));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('removes both early fatal handlers after bootstrap completes', () => {
    const removeEarlyFatalHandlers = installEarlyFatalHandlers({
      stderrWrite: vi.fn(),
      exitProcess: vi.fn(),
    });
    const installedUncaughtExceptionListeners = process
      .listeners('uncaughtException')
      .filter((listener) => !originalUncaughtExceptionListeners.includes(listener));
    const installedUnhandledRejectionListeners = process
      .listeners('unhandledRejection')
      .filter((listener) => !originalUnhandledRejectionListeners.includes(listener));

    expect(installedUncaughtExceptionListeners).toHaveLength(1);
    expect(installedUnhandledRejectionListeners).toHaveLength(1);

    removeEarlyFatalHandlers();

    expect(process.listeners('uncaughtException')).toEqual(originalUncaughtExceptionListeners);
    expect(process.listeners('unhandledRejection')).toEqual(originalUnhandledRejectionListeners);
  });
});

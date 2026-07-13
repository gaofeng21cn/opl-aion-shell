/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type LogLevel = string | false;

type LogMock = {
  transports: {
    file: {
      fileName: string;
      level: LogLevel;
      maxSize: number;
      resolvePathFn?: (variables: { libraryDefaultDir: string; fileName: string }, message?: { date?: Date }) => string;
    };
    console: {
      level: LogLevel;
    };
  };
  hooks: {
    push: ReturnType<typeof vi.fn>;
  };
  initialize: ReturnType<typeof vi.fn>;
  functions: Partial<Console>;
};

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

const createLogMock = (): LogMock => ({
  transports: {
    file: {
      fileName: '',
      level: false,
      maxSize: 0,
    },
    console: {
      level: 'silly',
    },
  },
  hooks: {
    push: vi.fn(),
  },
  initialize: vi.fn(),
  functions: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
});

const loadConfigureConsoleLog = async (
  isPackaged: boolean
): Promise<{ log: LogMock; setConsoleLogRoot: (logRoot: string | null | undefined) => void }> => {
  vi.resetModules();

  const logMock = createLogMock();

  vi.doMock('electron', () => ({
    app: {
      isPackaged,
    },
  }));

  vi.doMock('electron-log/main', () => ({
    default: logMock,
  }));

  const configureConsoleLog = await import('@process/utils/configureConsoleLog');

  return { log: logMock, setConsoleLogRoot: configureConsoleLog.setConsoleLogRoot };
};

describe('configureConsoleLog', () => {
  afterEach(() => {
    Object.assign(console, originalConsole);
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('disables stdout console transport in packaged builds', async () => {
    const { log } = await loadConfigureConsoleLog(true);

    expect(log.transports.console.level).toBe(false);
    expect(log.transports.file.level).toBe('info');
    expect(log.initialize).toHaveBeenCalledOnce();
  });

  it('keeps stdout console transport available during development', async () => {
    const { log } = await loadConfigureConsoleLog(false);

    expect(log.transports.console.level).toBe('silly');
  });

  it('routes cross-day frontend log writes into the matching date directory', async () => {
    const { log } = await loadConfigureConsoleLog(false);
    const logsRoot = mkdtempSync(path.join(os.tmpdir(), 'aionui-log-test-'));

    try {
      const resolvedPath = log.transports.file.resolvePathFn?.(
        {
          libraryDefaultDir: logsRoot,
          fileName: '2026/07/02/2026-07-02.log',
        },
        { date: new Date(2026, 6, 3, 0, 1) }
      );

      expect(resolvedPath).toBe(path.join(logsRoot, '2026/07/03/2026-07-03.log'));
    } finally {
      rmSync(logsRoot, { recursive: true, force: true });
    }
  });

  it('switches to a configured logs root and falls back to the platform default when cleared', async () => {
    const { log, setConsoleLogRoot } = await loadConfigureConsoleLog(false);
    const defaultRoot = mkdtempSync(path.join(os.tmpdir(), 'aionui-default-log-test-'));
    const customRoot = mkdtempSync(path.join(os.tmpdir(), 'aionui-custom-log-test-'));

    try {
      setConsoleLogRoot(customRoot);
      expect(
        log.transports.file.resolvePathFn?.(
          { libraryDefaultDir: defaultRoot, fileName: '' },
          { date: new Date(2026, 6, 3, 0, 1) }
        )
      ).toBe(path.join(customRoot, '2026/07/03/2026-07-03.log'));

      setConsoleLogRoot('');
      expect(
        log.transports.file.resolvePathFn?.(
          { libraryDefaultDir: defaultRoot, fileName: '' },
          { date: new Date(2026, 6, 3, 0, 1) }
        )
      ).toBe(path.join(defaultRoot, '2026/07/03/2026-07-03.log'));
    } finally {
      rmSync(defaultRoot, { recursive: true, force: true });
      rmSync(customRoot, { recursive: true, force: true });
    }
  });
});

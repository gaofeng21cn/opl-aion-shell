/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Node-environment tests for feedbackBridge's IPC handlers and log redaction.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { collectFeedbackLogAttachment, redactFeedbackLogContent } from '@/process/feedback/logs';

// Table of handlers registered via ipcMain.handle during module import.
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();

type FakeWebContents = {
  capturePage?: () => Promise<{ toPNG: () => Buffer }>;
};

type FakeWindow = {
  isDestroyed: () => boolean;
  webContents: FakeWebContents;
};

let currentWindow: FakeWindow | null = null;

const sentryMainMocks = vi.hoisted(() => ({
  flush: vi.fn(async () => true),
  getClient: vi.fn(() => ({ getDsn: () => ({ host: 'example.invalid' }) })),
}));

vi.mock('@sentry/electron/main', () => ({
  flush: sentryMainMocks.flush,
  getClient: sentryMainMocks.getClient,
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  app: {
    getPath: vi.fn(() => '/tmp/aionui-test-logs-nonexistent'),
    getVersion: vi.fn(() => '0.0.0'),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => currentWindow),
  },
}));

beforeEach(async () => {
  handlers.clear();
  currentWindow = null;
  sentryMainMocks.flush.mockReset();
  sentryMainMocks.flush.mockResolvedValue(true);
  sentryMainMocks.getClient.mockReset();
  sentryMainMocks.getClient.mockReturnValue({ getDsn: () => ({ host: 'example.invalid' }) });
  vi.resetModules();
  // Importing registers the ipcMain.handle callbacks into our map.
  await import('@/process/bridge/feedbackBridge');
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.SENTRY_DSN;
});

describe('feedback delivery availability', () => {
  it('reports unavailable when no Sentry DSN is configured', async () => {
    const handler = handlers.get('feedback:is-delivery-available')!;

    expect(handler).toBeDefined();
    await expect(handler({})).resolves.toBe(false);
  });

  it('reports available when a non-empty Sentry DSN is configured', async () => {
    process.env.SENTRY_DSN = 'https://public@example.invalid/1';
    const handler = handlers.get('feedback:is-delivery-available')!;

    await expect(handler({})).resolves.toBe(true);
  });

  it('does not flush when no Sentry DSN is configured', async () => {
    const handler = handlers.get('feedback:flush-delivery')!;

    await expect(handler({})).resolves.toBe(false);
    expect(sentryMainMocks.flush).not.toHaveBeenCalled();
  });

  it('reports a failed main-process Sentry flush', async () => {
    process.env.SENTRY_DSN = 'https://public@example.invalid/1';
    sentryMainMocks.flush.mockResolvedValue(false);
    const handler = handlers.get('feedback:flush-delivery')!;

    await expect(handler({})).resolves.toBe(false);
    expect(sentryMainMocks.flush).toHaveBeenCalledWith(5000);
  });
});

describe('feedbackBridge — capture-screenshot', () => {
  it('registers the feedback:capture-screenshot channel on import', () => {
    expect(handlers.has('feedback:capture-screenshot')).toBe(true);
  });

  it('returns png bytes and a timestamped filename on success', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03]);
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => pngBytes })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = (await handler({ sender: {} })) as { filename: string; data: number[] } | null;

    expect(result).not.toBeNull();
    expect(result!.filename).toMatch(/^screenshot-.*\.png$/);
    expect(result!.data).toEqual(Array.from(pngBytes));
  });

  it('returns null when no owning BrowserWindow is resolved', async () => {
    currentWindow = null;
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null when the owning BrowserWindow is destroyed', async () => {
    currentWindow = {
      isDestroyed: () => true,
      webContents: {
        capturePage: vi.fn(),
      },
    };
    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(currentWindow.webContents.capturePage).not.toHaveBeenCalled();
  });

  it('returns null when capturePage yields an empty buffer', async () => {
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => ({ toPNG: () => Buffer.alloc(0) })),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
  });

  it('returns null and does not throw when capturePage rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    currentWindow = {
      isDestroyed: () => false,
      webContents: {
        capturePage: vi.fn(async () => {
          throw new Error('capture refused');
        }),
      },
    };

    const handler = handlers.get('feedback:capture-screenshot')!;
    const result = await handler({ sender: {} });
    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('feedback logs', () => {
  it('redacts home paths, credentials, OpenAI keys, and sensitive URL query values', () => {
    const redacted = redactFeedbackLogContent(
      [
        'workspace=/Users/alice/Projects/private',
        'Authorization: Bearer bearer-value',
        'OPENAI_API_KEY=plain-api-key',
        'token: plain-token',
        'secret="plain-secret"',
        'key=sk-proj-abcdefghijklmnop',
        'url=https://example.com/callback?token=url-token&safe=visible&api_key=url-api-key',
      ].join('\n'),
      '/Users/alice'
    );

    expect(redacted).toContain('[REDACTED_HOME]/Projects/private');
    expect(redacted).toContain('safe=visible');
    for (const secret of [
      'bearer-value',
      'plain-api-key',
      'plain-token',
      'plain-secret',
      'sk-proj-abcdefghijklmnop',
      'url-token',
      'url-api-key',
    ]) {
      expect(redacted).not.toContain(secret);
    }
  });

  it('collects the same recent three log days used by user feedback reports', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-logs-'));
    try {
      writeFileSync(path.join(logsDir, '2026-05-25.log'), 'today frontend Authorization: Bearer attachment-secret\n');
      writeFileSync(path.join(logsDir, '2026-05-25.aioncore.log'), 'today backend\n');
      writeFileSync(path.join(logsDir, '2026-05-24.aionrs.log'), 'yesterday rust\n');
      writeFileSync(path.join(logsDir, '2026-05-23.log'), 'third day frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-22.log'), 'too old frontend\n');
      writeFileSync(path.join(logsDir, '2026-05-25.txt'), 'not a log\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      expect(attachment!.filename).toBe('logs.gz');
      expect(attachment!.contentType).toBe('application/gzip');
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend');
      expect(content).not.toContain('attachment-secret');
      expect(content).toContain('Authorization: [REDACTED]');
      expect(content).toContain('today backend');
      expect(content).toContain('yesterday rust');
      expect(content).toContain('third day frontend');
      expect(content).not.toContain('too old frontend');
      expect(content).not.toContain('not a log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('collects recent logs from dated year/month/day directories', () => {
    const logsDir = mkdtempSync(path.join(tmpdir(), 'aionui-feedback-dated-logs-'));
    try {
      const recentDir = path.join(logsDir, '2026', '07', '02');
      const previousDir = path.join(logsDir, '2026', '07', '01');
      const oldDir = path.join(logsDir, '2026', '06', '30');
      mkdirSync(recentDir, { recursive: true });
      mkdirSync(previousDir, { recursive: true });
      mkdirSync(oldDir, { recursive: true });
      writeFileSync(path.join(recentDir, '2026-07-02.log'), 'today frontend nested\n');
      writeFileSync(path.join(recentDir, '2026-07-02.aioncore.log'), 'today backend nested\n');
      writeFileSync(path.join(previousDir, '2026-07-01.aionrs.log'), 'yesterday rust nested\n');
      writeFileSync(path.join(oldDir, '2026-06-30.log'), 'third day frontend nested\n');
      writeFileSync(path.join(logsDir, '2026-06-29.log'), 'too old flat\n');

      const attachment = collectFeedbackLogAttachment(logsDir);

      expect(attachment).not.toBeNull();
      const content = gunzipSync(attachment!.data).toString('utf8');
      expect(content).toContain('today frontend nested');
      expect(content).toContain('today backend nested');
      expect(content).toContain('yesterday rust nested');
      expect(content).toContain('third day frontend nested');
      expect(content).not.toContain('too old flat');
      expect(content).toContain('2026/07/02/2026-07-02.aioncore.log');
    } finally {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });
});

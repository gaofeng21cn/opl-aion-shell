/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');

function withOutBundleBackup<T>(callback: () => T): T {
  const tempDir = mkdtempSync(join(tmpdir(), 'aionui-out-backup-'));
  const targets = ['main', 'preload', 'renderer'];

  try {
    for (const target of targets) {
      const source = join(repoRoot, 'out', target);
      if (existsSync(source)) {
        cpSync(source, join(tempDir, target), { recursive: true });
      }
    }

    return callback();
  } finally {
    for (const target of targets) {
      rmSync(join(repoRoot, 'out', target), { recursive: true, force: true });
      const backup = join(tempDir, target);
      if (existsSync(backup)) {
        cpSync(backup, join(repoRoot, 'out', target), { recursive: true });
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('build-with-builder', () => {
  it.each([
    {
      args: ['arm64', '--win', '--arm64'],
      expectedArch: 'arm64',
    },
    {
      args: ['auto', '--mac', '--x64'],
      expectedArch: 'x64',
    },
  ])('prepares bundled AionCore for $expectedArch with args $args', ({ args, expectedArch }) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');
    const callsPath = join(tempDir, 'prepare-calls.json');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;

function recordPrepareCall(options) {
  const callsPath = process.env.AIONUI_PREPARE_CALLS_FILE;
  const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
  calls.push(options ?? null);
  fs.writeFileSync(callsPath, JSON.stringify(calls));
  return { prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' };
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './prepareAioncore' || request.endsWith('/prepareAioncore')) {
    return recordPrepareCall;
  }

  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: recordPrepareCall };
  }

  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }

  return originalLoad.call(this, request, parent, isMain);
};

// Satisfy build-with-builder's output checks without clobbering real build
// artifacts: out/ lives in the actual repo (the script resolves it from its
// own __dirname), so only create empty placeholders when nothing is there.
function ensurePlaceholder(relativePath) {
  const target = path.join(process.cwd(), relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, '');
  }
}

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  if (commandText.includes('electron-vite build')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/main'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'out/renderer/assets'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'out/main/index.js'), 'require("./bootstrap");');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/index.html'), '<div id="root"></div>');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/assets/index.js'), 'settings.firstRun.title');
  }
  return Buffer.from('');
};
`,
      'utf8'
    );

    try {
      const result = withOutBundleBackup(() => {
        return spawnSync(process.execPath, ['scripts/build-with-builder.js', ...args, '--force'], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            AIONUI_PREPARE_CALLS_FILE: callsPath,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
          },
        });
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);

      const calls = JSON.parse(readFileSync(callsPath, 'utf8')) as Array<{ arch?: string } | null>;
      expect(calls).toContainEqual(expect.objectContaining({ arch: expectedArch }));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects empty Vite bundle entrypoints before packaging', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-empty-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  if (commandText.includes('electron-vite build')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/main'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'out/renderer/assets'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'out/main/index.js'), '');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/index.html'), '');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/assets/index.js'), 'settings.firstRun.title');
  }
  return Buffer.from('');
};
`,
      'utf8'
    );

    try {
      const result = withOutBundleBackup(() => {
        return spawnSync(process.execPath, ['scripts/build-with-builder.js', 'arm64', '--mac', '--arm64', '--force'], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
          },
        });
      });

      expect(result.status).toBe(1);
      expect(result.stderr || result.stdout).toContain('main entry is empty: out/main/index.js');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

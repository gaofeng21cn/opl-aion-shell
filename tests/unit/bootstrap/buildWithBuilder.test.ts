/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const afterPack = require('../../../scripts/afterPack.js') as {
  __test__: {
    pruneNonTargetBundledRuntimes: (resourcesDir: string, electronPlatformName: string, targetArch: string) => string[];
  };
};

function withOutBundleBackup<T>(callback: () => T, outDir = join(repoRoot, 'out')): T {
  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(join(outDir, '.build-test-backup-'));
  const targets = ['main', 'preload', 'renderer'];
  const packagingStageDirs = ['mac', 'mac-arm64', 'mac-x64', 'mac-universal'];
  const incrementalCachePath = join(outDir, '.build-hash');
  const cachedIncrementalHash = existsSync(incrementalCachePath) ? readFileSync(incrementalCachePath) : null;

  try {
    for (const target of targets) {
      const source = join(outDir, target);
      if (existsSync(source)) {
        renameSync(source, join(tempDir, target));
      }
    }

    return callback();
  } finally {
    for (const target of targets) {
      rmSync(join(outDir, target), { recursive: true, force: true });
      const backup = join(tempDir, target);
      if (existsSync(backup)) {
        renameSync(backup, join(outDir, target));
      }
    }
    for (const target of packagingStageDirs) {
      rmSync(join(outDir, target), { recursive: true, force: true });
    }
    if (cachedIncrementalHash) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(incrementalCachePath, cachedIncrementalHash);
    } else {
      rmSync(incrementalCachePath, { force: true });
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('build-with-builder', () => {
  it('packages only the bundled runtime for the target platform and architecture', () => {
    const resourcesDir = mkdtempSync(join(tmpdir(), 'aionui-packaged-runtimes-test-'));
    const bundledRoot = join(resourcesDir, 'bundled-aioncore');
    mkdirSync(join(bundledRoot, 'darwin-arm64'), { recursive: true });
    mkdirSync(join(bundledRoot, 'linux-arm64'), { recursive: true });
    mkdirSync(join(bundledRoot, 'linux-x64'), { recursive: true });
    writeFileSync(join(bundledRoot, 'manifest.json'), '{}');

    try {
      const removed = afterPack.__test__.pruneNonTargetBundledRuntimes(resourcesDir, 'darwin', 'arm64');

      expect(removed).toEqual(['linux-arm64', 'linux-x64']);
      expect(readdirSync(bundledRoot).sort()).toEqual(['darwin-arm64', 'manifest.json']);
    } finally {
      rmSync(resourcesDir, { recursive: true, force: true });
    }
  });

  it('restores the incremental build hash after an isolated build test', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'aionui-build-cache-test-'));
    const cachePath = join(outDir, '.build-hash');
    writeFileSync(cachePath, 'trusted-output-hash');

    try {
      withOutBundleBackup(() => writeFileSync(cachePath, 'mocked-output-hash'), outDir);

      expect(readFileSync(cachePath, 'utf8')).toBe('trusted-output-hash');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('builds macOS standard distributables with both DMG and ZIP targets', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-macos-targets-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');
    const commandsPath = join(tempDir, 'commands.json');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: () => ({ prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' }) };
  }
  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function record(command) {
  const commandsPath = process.env.AIONUI_COMMANDS_FILE;
  const commands = fs.existsSync(commandsPath) ? JSON.parse(fs.readFileSync(commandsPath, 'utf8')) : [];
  commands.push(String(command));
  fs.writeFileSync(commandsPath, JSON.stringify(commands));
}

function writePackagedMacApp() {
  const resourcesDir = path.join(process.cwd(), 'out/mac-arm64/One Person Lab.app/Contents/Resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(
    path.join(resourcesDir, 'app-update.yml'),
    [
      'owner: gaofeng21cn',
      'repo: one-person-lab-app',
      'provider: github',
      'publishAutoUpdate: true',
      'releaseType: release',
      'updaterCacheDirName: one-person-lab-aion-shell-updater',
      '',
    ].join('\\n')
  );
}

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  record(commandText);
  if (commandText.includes('electron-vite build')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/main'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'out/renderer/assets'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'out/main/index.js'), 'require("./bootstrap");');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/index.html'), '<div id="root"></div>');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/assets/index.js'), 'settings.firstRun.title');
  }
  if (commandText.includes('electron-builder')) {
    writePackagedMacApp();
  }
  return Buffer.from('');
};
`,
      'utf8'
    );

    const childEnv = { ...process.env };
    delete childEnv.OPL_RELEASE_VERSION;

    try {
      const result = withOutBundleBackup(() => {
        return spawnSync(process.execPath, ['scripts/build-with-builder.js', 'arm64', '--mac', '--arm64', '--force'], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...childEnv,
            AIONUI_COMMANDS_FILE: commandsPath,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
          },
        });
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const commands = JSON.parse(readFileSync(commandsPath, 'utf8')) as string[];
      const builderCommand = commands.find((command) => command.includes('electron-builder'));
      const date = new Date();
      const expectedVersion = `${String(date.getUTCFullYear()).slice(-2)}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
      expect(builderCommand).toContain('--mac dmg zip --arm64');
      expect(builderCommand).toContain(`--config.extraMetadata.version=${expectedVersion}`);
      expect(result.stdout).toContain(`Stamping OPL App release version: ${expectedVersion}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('supports dir-only packaging for Full App-owned DMG creation', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-dir-only-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');
    const commandsPath = join(tempDir, 'commands.json');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: () => ({ prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' }) };
  }
  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function record(command) {
  const commandsPath = process.env.AIONUI_COMMANDS_FILE;
  const commands = fs.existsSync(commandsPath) ? JSON.parse(fs.readFileSync(commandsPath, 'utf8')) : [];
  commands.push(String(command));
  fs.writeFileSync(commandsPath, JSON.stringify(commands));
}

function writePackagedMacApp() {
  const resourcesDir = path.join(process.cwd(), 'out/mac-arm64/One Person Lab.app/Contents/Resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(
    path.join(resourcesDir, 'app-update.yml'),
    [
      'owner: gaofeng21cn',
      'repo: one-person-lab-app',
      'provider: github',
      'publishAutoUpdate: true',
      'releaseType: release',
      'updaterCacheDirName: one-person-lab-aion-shell-updater',
      '',
    ].join('\\n')
  );
}

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  record(commandText);
  if (commandText.includes('electron-vite build')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/main'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'out/renderer/assets'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'out/main/index.js'), 'require("./bootstrap");');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/index.html'), '<div id="root"></div>');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/assets/index.js'), 'settings.firstRun.title');
  }
  if (commandText.includes('electron-builder')) {
    writePackagedMacApp();
  }
  return Buffer.from('');
};
`,
      'utf8'
    );

    try {
      let updaterConfig = '';
      const result = withOutBundleBackup(() => {
        const spawned = spawnSync(
          process.execPath,
          ['scripts/build-with-builder.js', 'arm64', '--mac', '--arm64', '--dir-only', '--force'],
          {
            cwd: repoRoot,
            encoding: 'utf8',
            env: {
              ...process.env,
              AIONUI_COMMANDS_FILE: commandsPath,
              NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
            },
          }
        );
        const updaterConfigPath = join(repoRoot, 'out/mac-arm64/One Person Lab.app/Contents/Resources/app-update.yml');
        if (existsSync(updaterConfigPath)) {
          updaterConfig = readFileSync(updaterConfigPath, 'utf8');
        }
        return spawned;
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const commands = JSON.parse(readFileSync(commandsPath, 'utf8')) as string[];
      const builderCommand = commands.find((command) => command.includes('electron-builder'));
      expect(builderCommand).toContain('--dir');
      expect(builderCommand).not.toContain('--mac');
      expect(updaterConfig).toContain('provider: github');
      expect(updaterConfig).toContain('owner: gaofeng21cn');
      expect(updaterConfig).toContain('repo: one-person-lab-app');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects macOS app bundles without packaged updater config', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-missing-updater-config-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: () => ({ prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' }) };
  }
  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }
  return originalLoad.call(this, request, parent, isMain);
};

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  if (commandText.includes('electron-vite build')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/main'), { recursive: true });
    fs.mkdirSync(path.join(process.cwd(), 'out/renderer/assets'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'out/main/index.js'), 'require("./bootstrap");');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/index.html'), '<div id="root"></div>');
    fs.writeFileSync(path.join(process.cwd(), 'out/renderer/assets/index.js'), 'settings.firstRun.title');
  }
  if (commandText.includes('electron-builder')) {
    fs.mkdirSync(path.join(process.cwd(), 'out/mac-arm64/One Person Lab.app/Contents/Resources'), { recursive: true });
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
      expect(result.stderr || result.stdout).toContain('Missing packaged updater config');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reuses the pack-only build path for WebUI refresh and prunes stale out bundles first', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'aionui-pack-only-build-test-'));
    const hookPath = join(tempDir, 'hook.cjs');
    const commandsPath = join(tempDir, 'commands.json');

    writeFileSync(
      hookPath,
      `
const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('packages/shared-scripts/src/prepare-aioncore.js')) {
    return { prepareAioncore: () => ({ prepared: true, dir: 'mock-bundled-aioncore', sourceType: 'mock' }) };
  }
  if (request === './resolveAioncoreVersion.js' || request.endsWith('/resolveAioncoreVersion.js')) {
    return { resolveAioncoreVersion: () => 'v-test' };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function record(command) {
  const commandsPath = process.env.AIONUI_COMMANDS_FILE;
  const commands = fs.existsSync(commandsPath) ? JSON.parse(fs.readFileSync(commandsPath, 'utf8')) : [];
  commands.push(String(command));
  fs.writeFileSync(commandsPath, JSON.stringify(commands));
}

childProcess.execSync = function mockedExecSync(command) {
  const commandText = String(command);
  record(commandText);
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
        mkdirSync(join(repoRoot, 'out', 'renderer', 'assets'), { recursive: true });
        mkdirSync(join(repoRoot, 'out', 'mac-arm64'), { recursive: true });
        writeFileSync(join(repoRoot, 'out', 'renderer', 'assets', 'stale.js'), 'stale', 'utf8');
        writeFileSync(join(repoRoot, 'out', 'One-Person-Lab-26.7.5-mac-arm64.dmg'), 'stale dmg', 'utf8');
        return spawnSync(
          process.execPath,
          ['scripts/build-with-builder.js', '--pack-only', '--skip-native', '--force'],
          {
            cwd: repoRoot,
            encoding: 'utf8',
            env: {
              ...process.env,
              AIONUI_COMMANDS_FILE: commandsPath,
              NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${hookPath}`].filter(Boolean).join(' '),
            },
          }
        );
      });

      expect(result.status, result.stderr || result.stdout).toBe(0);
      const commands = JSON.parse(readFileSync(commandsPath, 'utf8')) as string[];
      expect(commands.some((command) => command.includes('electron-builder'))).toBe(false);
      expect(result.stdout).toContain('Package completed! (skipped distributable creation)');
      expect(existsSync(join(repoRoot, 'out', 'renderer', 'assets', 'stale.js'))).toBe(false);
      expect(existsSync(join(repoRoot, 'out', 'mac-arm64'))).toBe(false);
      expect(existsSync(join(repoRoot, 'out', 'One-Person-Lab-26.7.5-mac-arm64.dmg'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

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
  if (commandText.includes('electron-builder') && commandText.includes('--mac')) {
    const resourcesDir = path.join(process.cwd(), 'out/mac-arm64/One Person Lab.app/Contents/Resources');
    fs.mkdirSync(resourcesDir, { recursive: true });
    fs.writeFileSync(
      path.join(resourcesDir, 'app-update.yml'),
      [
        'owner: gaofeng21cn',
        'repo: one-person-lab-app',
        'provider: github',
        'publishAutoUpdate: true',
        'releaseType: release',
        'updaterCacheDirName: one-person-lab-aion-shell-updater',
        '',
      ].join('\\n')
    );
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

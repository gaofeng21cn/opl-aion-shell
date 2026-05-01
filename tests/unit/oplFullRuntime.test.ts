import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildOplFullRuntimeShellPrefix,
  ensurePackagedOplFullRuntime,
} from '../../src/process/oplFullRuntime';

const tmpRoots: string[] = [];

function makeTempRoot(name: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('ensurePackagedOplFullRuntime', () => {
  it('installs a packaged runtime payload into Application Support once and returns env overrides', () => {
    const resourcesPath = makeTempRoot('opl-full-resources');
    const homeDir = makeTempRoot('opl-full-home');
    const payloadRoot = path.join(resourcesPath, 'opl-full-runtime');
    const runtimePayload = path.join(payloadRoot, 'runtime', '26.5.1');
    fs.mkdirSync(path.join(runtimePayload, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimePayload, 'node', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimePayload, 'uv', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimePayload, 'python', 'cpython-3.12.12-macos-aarch64-none', 'bin'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(runtimePayload, 'modules', 'mas'), { recursive: true });
    fs.writeFileSync(path.join(runtimePayload, 'bin', 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.mkdirSync(path.join(payloadRoot, 'manifest'), { recursive: true });
    fs.writeFileSync(
      path.join(payloadRoot, 'manifest', 'full-package-manifest.json'),
      JSON.stringify({ version: '26.5.1' }),
      'utf8'
    );

    const installed = ensurePackagedOplFullRuntime({
      isPackaged: true,
      resourcesPath,
      homeDir,
    });

    const expectedHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', '26.5.1');
    expect(installed?.runtimeHome).toBe(expectedHome);
    expect(fs.existsSync(path.join(expectedHome, 'bin', 'opl'))).toBe(true);
    expect(fs.existsSync(path.join(expectedHome, '.opl-full-runtime-installed.json'))).toBe(true);
    expect(installed?.env.OPL_FULL_RUNTIME_HOME).toBe(expectedHome);
    expect(installed?.env.OPL_MODULES_ROOT).toBe(path.join(expectedHome, 'modules'));
    expect(installed?.env.OPL_MODULE_PATH_MEDAUTOSCIENCE).toBe(path.join(expectedHome, 'modules', 'mas'));
    expect(installed?.env.OPL_MODULE_PATH_MEDDEEPSCIENTIST).toBe(path.join(expectedHome, 'modules', 'mds'));
    expect(installed?.env.OPL_CODEX_BIN).toBe(path.join(expectedHome, 'bin', 'codex'));
    expect(installed?.env.OPL_HERMES_BIN).toBe(path.join(expectedHome, 'bin', 'hermes'));
    expect(installed?.env.PATH?.split(path.delimiter).slice(0, 4)).toEqual([
      path.join(expectedHome, 'bin'),
      path.join(expectedHome, 'node', 'bin'),
      path.join(expectedHome, 'uv', 'bin'),
      path.join(expectedHome, 'python', 'cpython-3.12.12-macos-aarch64-none', 'bin'),
    ]);

    const markerMtime = fs.statSync(path.join(expectedHome, '.opl-full-runtime-installed.json')).mtimeMs;
    const second = ensurePackagedOplFullRuntime({
      isPackaged: true,
      resourcesPath,
      homeDir,
    });
    expect(second?.runtimeHome).toBe(expectedHome);
    expect(fs.statSync(path.join(expectedHome, '.opl-full-runtime-installed.json')).mtimeMs).toBe(markerMtime);
  });

  it('does nothing when the packaged app has no full runtime payload', () => {
    const resourcesPath = makeTempRoot('opl-no-runtime-resources');
    const homeDir = makeTempRoot('opl-no-runtime-home');
    expect(ensurePackagedOplFullRuntime({ isPackaged: true, resourcesPath, homeDir })).toBeNull();
  });
});

describe('buildOplFullRuntimeShellPrefix', () => {
  it('re-applies runtime env after zsh login startup files run', () => {
    const runtimeHome = '/tmp/OPL Full Runtime/26.5.1';
    const prefix = buildOplFullRuntimeShellPrefix(runtimeHome);

    expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='/tmp/OPL Full Runtime/26.5.1'");
    expect(prefix).toContain("export OPL_MODULES_ROOT='/tmp/OPL Full Runtime/26.5.1/modules'");
    expect(prefix).toContain("export OPL_MODULE_PATH_MEDAUTOSCIENCE='/tmp/OPL Full Runtime/26.5.1/modules/mas'");
    expect(prefix).toContain("export OPL_MODULE_PATH_MEDDEEPSCIENTIST='/tmp/OPL Full Runtime/26.5.1/modules/mds'");
    expect(prefix).toContain("export OPL_CODEX_BIN='/tmp/OPL Full Runtime/26.5.1/bin/codex'");
    expect(prefix).toContain("export OPL_HERMES_BIN='/tmp/OPL Full Runtime/26.5.1/bin/hermes'");
    expect(prefix).toContain('PATH=');
  });

  it('returns an empty prefix when no runtime is active', () => {
    expect(buildOplFullRuntimeShellPrefix(null)).toBe('');
  });
});

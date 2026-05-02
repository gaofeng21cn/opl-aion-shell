import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  activateInstalledOplFullRuntime,
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
    const runtimePayload = path.join(payloadRoot, 'runtime', 'current');
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

    const expectedHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    expect(installed?.runtimeHome).toBe(expectedHome);
    expect(fs.existsSync(path.join(expectedHome, 'bin', 'opl'))).toBe(true);
    expect(fs.existsSync(path.join(expectedHome, '.opl-full-runtime-installed.json'))).toBe(true);
    expect(fs.existsSync(path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current.json'))).toBe(true);
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

  it('keeps compatibility with older packaged payloads stored under the version slot', () => {
    const resourcesPath = makeTempRoot('opl-legacy-full-resources');
    const homeDir = makeTempRoot('opl-legacy-full-home');
    const payloadRoot = path.join(resourcesPath, 'opl-full-runtime');
    const runtimePayload = path.join(payloadRoot, 'runtime', '26.5.1');
    fs.mkdirSync(path.join(runtimePayload, 'bin'), { recursive: true });
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

    const expectedHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    expect(installed?.runtimeHome).toBe(expectedHome);
    expect(fs.existsSync(path.join(expectedHome, 'bin', 'opl'))).toBe(true);
    expect(fs.existsSync(path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', '26.5.1'))).toBe(false);
  });

  it('does nothing when the packaged app has no full runtime payload', () => {
    const resourcesPath = makeTempRoot('opl-no-runtime-resources');
    const homeDir = makeTempRoot('opl-no-runtime-home');
    expect(ensurePackagedOplFullRuntime({ isPackaged: true, resourcesPath, homeDir })).toBeNull();
  });

  it('activates an installed Full runtime from current.json when a standard app has no payload', () => {
    const homeDir = makeTempRoot('opl-active-runtime-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'modules', 'mas'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'codex'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'hermes'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(
      path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current.json'),
      `${JSON.stringify({
        runtime_version: '26.5.1',
        runtime_home: runtimeHome,
        manifest_sha256: 'test-sha',
      })}\n`,
      'utf8'
    );

    const activated = activateInstalledOplFullRuntime({ homeDir });

    expect(activated?.version).toBe('26.5.1');
    expect(activated?.runtimeHome).toBe(runtimeHome);
    expect(activated?.env.OPL_FULL_RUNTIME_HOME).toBe(runtimeHome);
    expect(activated?.env.OPL_CODEX_BIN).toBe(path.join(runtimeHome, 'bin', 'codex'));
    expect(activated?.env.OPL_HERMES_BIN).toBe(path.join(runtimeHome, 'bin', 'hermes'));
  });

  it('ignores current.json when it points to a missing runtime', () => {
    const homeDir = makeTempRoot('opl-missing-active-runtime-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', '26.5.1');
    fs.mkdirSync(path.dirname(runtimeHome), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current.json'),
      `${JSON.stringify({
        runtime_version: '26.5.1',
        runtime_home: runtimeHome,
        manifest_sha256: 'test-sha',
      })}\n`,
      'utf8'
    );

    expect(activateInstalledOplFullRuntime({ homeDir })).toBeNull();
  });

  it('keeps compatibility with an older versioned runtime pointer after standard App updates', () => {
    const homeDir = makeTempRoot('opl-versioned-active-runtime-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', '26.5.1');
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(
      path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current.json'),
      `${JSON.stringify({
        runtime_version: '26.5.1',
        runtime_home: runtimeHome,
        manifest_sha256: 'test-sha',
      })}\n`,
      'utf8'
    );

    const activated = activateInstalledOplFullRuntime({ homeDir });

    expect(activated?.version).toBe('26.5.1');
    expect(activated?.runtimeHome).toBe(runtimeHome);
  });
});

describe('buildOplFullRuntimeShellPrefix', () => {
  it('re-applies runtime env after zsh login startup files run', () => {
    const runtimeHome = '/tmp/OPL Full Runtime/current';
    const prefix = buildOplFullRuntimeShellPrefix(runtimeHome);

    expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='/tmp/OPL Full Runtime/current'");
    expect(prefix).toContain("export OPL_MODULES_ROOT='/tmp/OPL Full Runtime/current/modules'");
    expect(prefix).toContain("export OPL_MODULE_PATH_MEDAUTOSCIENCE='/tmp/OPL Full Runtime/current/modules/mas'");
    expect(prefix).toContain("export OPL_MODULE_PATH_MEDDEEPSCIENTIST='/tmp/OPL Full Runtime/current/modules/mds'");
    expect(prefix).toContain("export OPL_CODEX_BIN='/tmp/OPL Full Runtime/current/bin/codex'");
    expect(prefix).toContain("export OPL_HERMES_BIN='/tmp/OPL Full Runtime/current/bin/hermes'");
    expect(prefix).toContain('PATH=');
  });

  it('returns an empty prefix when no runtime is active', () => {
    expect(buildOplFullRuntimeShellPrefix(null)).toBe('');
  });
});

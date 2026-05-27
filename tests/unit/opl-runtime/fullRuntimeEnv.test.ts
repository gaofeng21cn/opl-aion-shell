import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  activateInstalledOplFullRuntime,
  buildOplFullRuntimeShellPrefix,
  ensurePackagedOplFullRuntime,
} from '@/process/backend/fullRuntime';

const tmpRoots: string[] = [];

function makeTempRoot(name: string): string {
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
    expect(fs.existsSync(path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current.json'))).toBe(
      true
    );
    expect(installed?.env.OPL_FULL_RUNTIME_HOME).toBe(expectedHome);
    expect(installed?.env.OPL_PACKAGED_SKILLS_ROOT).toBe(path.join(expectedHome, 'skills'));
    expect(installed?.env.OPL_FAMILY_RUNTIME_PROVIDER).toBe('temporal');
    expect(installed?.env.OPL_MODULE_PATH_MEDAUTOSCIENCE).toBe(path.join(expectedHome, 'modules', 'mas'));
    expect(installed?.env.OPL_MODULE_PATH_MEDAUTOGRANT).toBe(path.join(expectedHome, 'modules', 'mag'));
    expect(installed?.env.OPL_MODULE_PATH_REDCUBE).toBe(path.join(expectedHome, 'modules', 'rca'));
    expect(installed?.env.OPL_MODULE_PATH_OPLMETAAGENT).toBe(path.join(expectedHome, 'modules', 'meta-agent'));
    expect(installed?.env.OPL_CODEX_BIN).toBe(path.join(expectedHome, 'bin', 'codex'));
    expect(installed?.env.OPL_HERMES_BIN).toBeUndefined();
    expect(installed?.env.PATH?.split(path.delimiter).slice(0, 4)).toEqual([
      path.join(expectedHome, 'bin'),
      path.join(expectedHome, 'node', 'bin'),
      path.join(expectedHome, 'uv', 'bin'),
      path.join(expectedHome, 'python', 'cpython-3.12.12-macos-aarch64-none', 'bin'),
    ]);
    expect(installed?.env.PATH?.split(path.delimiter)).toContain('/usr/bin');
    expect(installed?.env.PATH?.split(path.delimiter)).toContain('/bin');

    const markerMtime = fs.statSync(path.join(expectedHome, '.opl-full-runtime-installed.json')).mtimeMs;
    const second = ensurePackagedOplFullRuntime({
      isPackaged: true,
      resourcesPath,
      homeDir,
    });
    expect(second?.runtimeHome).toBe(expectedHome);
    expect(fs.statSync(path.join(expectedHome, '.opl-full-runtime-installed.json')).mtimeMs).toBe(markerMtime);
  });

  it('activates an installed Full runtime and exposes optional hermes payload only when present', () => {
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

  it('does not activate a stale installed Full runtime when the packaged App has no Full payload', () => {
    const resourcesPath = makeTempRoot('opl-standard-resources');
    const homeDir = makeTempRoot('opl-stale-runtime-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(
      path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current.json'),
      `${JSON.stringify({
        runtime_version: '26.5.1',
        runtime_home: runtimeHome,
        manifest_sha256: 'stale-sha',
      })}\n`,
      'utf8'
    );

    expect(
      ensurePackagedOplFullRuntime({
        isPackaged: true,
        resourcesPath,
        homeDir,
      })
    ).toBeNull();
  });

  it('returns an empty shell prefix when no runtime is active', () => {
    expect(buildOplFullRuntimeShellPrefix(null)).toBe('');
  });
});

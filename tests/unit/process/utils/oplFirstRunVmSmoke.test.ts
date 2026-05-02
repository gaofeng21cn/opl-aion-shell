import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SmokeTestApi = {
  assertFullFirstRunEquivalence(systemInitializeRaw: string, modulesRaw: string): void;
  buildFullRuntimeCommandPrefix(runtimeHome: string): string;
  findLatestFullRuntimeHome(runtimeRoot?: string): string | null;
  isMainModule(moduleUrl: string, argvPath?: string): boolean;
};

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-smoke-'));
  tempRoots.push(root);
  return root;
}

function writeExecutable(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '#!/usr/bin/env bash\n', 'utf8');
  fs.chmodSync(filePath, 0o755);
}

async function loadSmokeTestApi(): Promise<SmokeTestApi> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  const module = await import('../../../../scripts/opl-first-run-vm-smoke.mjs');
  return module.__test as SmokeTestApi;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scripts/opl-first-run-vm-smoke Full runtime CLI fallback', () => {
  it('recognizes the script entrypoint through a macOS /tmp realpath alias', async () => {
    const api = await loadSmokeTestApi();
    const root = makeTempRoot();
    const scriptPath = path.join(root, 'opl-first-run-vm-smoke.mjs');
    const linkPath = path.join(root, 'script-link.mjs');

    fs.writeFileSync(scriptPath, '', 'utf8');
    fs.symlinkSync(scriptPath, linkPath);

    expect(api.isMainModule(new URL(`file://${scriptPath}`).href, linkPath)).toBe(true);
  });

  it('prefers the stable current Full runtime that contains the OPL CLI', async () => {
    const api = await loadSmokeTestApi();
    const runtimeRoot = makeTempRoot();
    const oldRuntime = path.join(runtimeRoot, '26.5.1');
    const newRuntime = path.join(runtimeRoot, '26.5.2');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const incompleteRuntime = path.join(runtimeRoot, '26.5.9');

    writeExecutable(path.join(oldRuntime, 'bin', 'opl'));
    writeExecutable(path.join(newRuntime, 'bin', 'opl'));
    writeExecutable(path.join(currentRuntime, 'bin', 'opl'));
    fs.mkdirSync(path.join(incompleteRuntime, 'bin'), { recursive: true });

    expect(api.findLatestFullRuntimeHome(runtimeRoot)).toBe(currentRuntime);
  });

  it('falls back to the runtime_home recorded in current.json', async () => {
    const api = await loadSmokeTestApi();
    const runtimeRoot = makeTempRoot();
    const runtimeHome = path.join(runtimeRoot, '26.5.1');

    writeExecutable(path.join(runtimeHome, 'bin', 'opl'));
    fs.writeFileSync(
      path.join(runtimeRoot, 'current.json'),
      `${JSON.stringify({ runtime_version: '26.5.1', runtime_home: runtimeHome })}\n`,
      'utf8'
    );

    expect(api.findLatestFullRuntimeHome(runtimeRoot)).toBe(runtimeHome);
  });

  it('does not report a Full runtime when the OPL CLI is missing', async () => {
    const api = await loadSmokeTestApi();
    const runtimeRoot = makeTempRoot();

    fs.mkdirSync(path.join(runtimeRoot, '26.5.1', 'bin'), { recursive: true });

    expect(api.findLatestFullRuntimeHome(runtimeRoot)).toBeNull();
  });

  it('builds the same OPL env prefix the packaged app uses for Full runtime commands', async () => {
    const api = await loadSmokeTestApi();
    const runtimeHome = path.join(makeTempRoot(), 'OPL Full Runtime', 'current');
    fs.mkdirSync(path.join(runtimeHome, 'python', 'cpython-3.12.13-macos-aarch64-none', 'bin'), {
      recursive: true,
    });

    const prefix = api.buildFullRuntimeCommandPrefix(runtimeHome);

    expect(prefix).toContain(`export OPL_FULL_RUNTIME_HOME='${runtimeHome}'`);
    expect(prefix).not.toContain('OPL_MODULES_ROOT');
    expect(prefix).toContain(`export OPL_MODULE_PATH_MEDAUTOSCIENCE='${path.join(runtimeHome, 'modules', 'mas')}'`);
    expect(prefix).toContain(`export OPL_MODULE_PATH_MEDDEEPSCIENTIST='${path.join(runtimeHome, 'modules', 'mds')}'`);
    expect(prefix).toContain(`export OPL_MODULE_PATH_MEDAUTOGRANT='${path.join(runtimeHome, 'modules', 'mag')}'`);
    expect(prefix).toContain(`export OPL_MODULE_PATH_REDCUBE='${path.join(runtimeHome, 'modules', 'rca')}'`);
    expect(prefix).toContain(`export OPL_CODEX_BIN='${path.join(runtimeHome, 'bin', 'codex')}'`);
    expect(prefix).toContain(`export OPL_HERMES_BIN='${path.join(runtimeHome, 'bin', 'hermes')}'`);
    expect(prefix).toContain(path.join(runtimeHome, 'python', 'cpython-3.12.13-macos-aarch64-none', 'bin'));
    expect(prefix).toContain('PATH=');
  });

  it('asserts Full first-run modules are materialized into standard state modules root', async () => {
    const api = await loadSmokeTestApi();
    const homeRoot = makeTempRoot();
    const modulesRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state', 'modules');
    for (const repoName of ['med-autoscience', 'med-deepscientist', 'med-autogrant', 'redcube-ai']) {
      fs.mkdirSync(path.join(modulesRoot, repoName), { recursive: true });
    }

    const systemInitializeRaw = JSON.stringify({
      system_initialize: {
        setup_flow: { ready_to_launch: true, blocking_items: [] },
      },
    });
    const modulesRaw = JSON.stringify({
      modules: {
        modules_root: modulesRoot,
        items: [
          ['medautoscience', 'med-autoscience'],
          ['meddeepscientist', 'med-deepscientist'],
          ['medautogrant', 'med-autogrant'],
          ['redcube', 'redcube-ai'],
        ].map(([moduleId, repoName]) => ({
          module_id: moduleId,
          installed: true,
          install_origin: 'managed_root',
          health_status: 'ready',
          checkout_path: path.join(modulesRoot, repoName),
        })),
      },
    });

    expect(() => api.assertFullFirstRunEquivalence(systemInitializeRaw, modulesRaw)).not.toThrow();
  });
});

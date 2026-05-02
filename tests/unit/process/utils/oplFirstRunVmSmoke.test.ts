import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SmokeTestApi = {
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
    expect(prefix).toContain(`export OPL_MODULES_ROOT='${path.join(runtimeHome, 'modules')}'`);
    expect(prefix).toContain(`export OPL_CODEX_BIN='${path.join(runtimeHome, 'bin', 'codex')}'`);
    expect(prefix).toContain(`export OPL_HERMES_BIN='${path.join(runtimeHome, 'bin', 'hermes')}'`);
    expect(prefix).toContain(path.join(runtimeHome, 'python', 'cpython-3.12.13-macos-aarch64-none', 'bin'));
    expect(prefix).toContain('PATH=');
  });
});

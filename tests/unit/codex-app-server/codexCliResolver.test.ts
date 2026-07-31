import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCodexCliPath } from '@/process/services/codexAppServer/codexCliResolver';
import { createOplCodexRuntimeIdentity } from '@/process/backend/oplCodexRuntimeIdentity';

const tempRoots: string[] = [];

function makeIdentityEnv(): { env: NodeJS.ProcessEnv; executablePath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-runtime-identity-'));
  tempRoots.push(root);
  const executablePath = path.join(root, 'managed-resources', 'cli', 'codex');
  const projectionManifestPath = path.join(root, 'managed-resources', 'manifest.json');
  fs.mkdirSync(path.dirname(executablePath), { recursive: true });
  fs.writeFileSync(executablePath, '#!/usr/bin/env bash\n', { encoding: 'utf8', mode: 0o755 });
  fs.chmodSync(executablePath, 0o755);
  fs.writeFileSync(projectionManifestPath, '{"schema":"opl_aioncore_managed_resources_projection.v1"}\n');
  const identity = createOplCodexRuntimeIdentity({
    executablePath,
    version: '0.144.6',
    codexHome: path.join(root, 'codex-home'),
    runtimeKey: 'darwin-arm64',
    producerManifestSha256: 'a'.repeat(64),
    projectionManifestPath,
  });
  return {
    executablePath,
    env: {
      OPL_CODEX_BIN: identity.path,
      CODEX_HOME: identity.codex_home,
      OPL_CODEX_RUNTIME_IDENTITY_JSON: JSON.stringify(identity),
      OPL_CODEX_RUNTIME_COHORT_REF: identity.runtime_cohort_ref,
      PATH: '/unexpected/global/bin',
    },
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveCodexCliPath', () => {
  it('hard-binds direct App Server to the activated OPL runtime identity', () => {
    const fixture = makeIdentityEnv();
    const isExecutable = vi.fn(() => true);

    expect(resolveCodexCliPath({ env: fixture.env, isExecutable })).toBe(fixture.executablePath);
    expect(isExecutable).not.toHaveBeenCalled();
  });

  it('rejects binary, CODEX_HOME, and activation drift without falling back', () => {
    const binaryDrift = makeIdentityEnv();
    fs.appendFileSync(binaryDrift.executablePath, '# changed\n');
    expect(() => resolveCodexCliPath({ env: binaryDrift.env, isExecutable: () => true })).toThrowError(
      expect.objectContaining({ code: 'RUNTIME_IDENTITY_MISMATCH' })
    );

    const homeDrift = makeIdentityEnv();
    expect(() =>
      resolveCodexCliPath({
        env: { ...homeDrift.env, CODEX_HOME: '/different/codex-home' },
        isExecutable: () => true,
      })
    ).toThrowError(expect.objectContaining({ code: 'RUNTIME_IDENTITY_MISMATCH' }));

    expect(() =>
      resolveCodexCliPath({
        env: {
          OPL_CODEX_RUNTIME_COHORT_REF: `sha256:${'b'.repeat(64)}`,
          PATH: '/unexpected/global/bin',
        },
        isExecutable: () => true,
      })
    ).toThrowError(expect.objectContaining({ code: 'RUNTIME_ACTIVATION_REQUIRED' }));
  });

  it('uses explicit OPL and Codex CLI configuration in priority order', () => {
    const isExecutable = vi.fn((candidate: string) => candidate === '/configured/codex-cli');

    const resolved = resolveCodexCliPath({
      env: {
        OPL_CODEX_BIN: '/configured/opl-codex',
        CODEX_CLI_PATH: '/configured/codex-cli',
        CODEX_BIN: '/configured/codex-bin',
        PATH: '/path-bin',
      },
      homeDir: '/home/operator',
      platform: 'darwin',
      isExecutable,
    });

    expect(resolved).toBe('/configured/codex-cli');
    expect(isExecutable.mock.calls.map(([candidate]) => candidate)).toEqual([
      '/configured/opl-codex',
      '/configured/codex-cli',
    ]);
  });

  it('falls back from managed CODEX_HOME to PATH and fails when neither is executable', () => {
    const managed = path.join('/managed/codex-home', 'packages', 'standalone', 'current', 'codex');
    const pathCandidate = path.join('/opt/codex/bin', 'codex');
    const base = {
      env: { CODEX_HOME: '/managed/codex-home', PATH: '/opt/codex/bin' },
      homeDir: '/home/operator',
      platform: 'darwin' as const,
    };

    expect(resolveCodexCliPath({ ...base, isExecutable: (candidate) => candidate === managed })).toBe(managed);
    expect(resolveCodexCliPath({ ...base, isExecutable: (candidate) => candidate === pathCandidate })).toBe(
      pathCandidate
    );
    expect(() => resolveCodexCliPath({ ...base, isExecutable: () => false })).toThrowError(
      expect.objectContaining({ code: 'USER_AGENT_NOT_INSTALLED' })
    );
  });

  it('reports an explicit but unusable command separately from an uninstalled agent', () => {
    expect(() =>
      resolveCodexCliPath({
        env: { OPL_CODEX_BIN: '/configured/missing-codex', PATH: '' },
        homeDir: '/home/operator',
        platform: 'darwin',
        isExecutable: () => false,
      })
    ).toThrowError(expect.objectContaining({ code: 'USER_AGENT_COMMAND_NOT_FOUND' }));
  });

  it('resolves the OPL-managed macOS runtime when Finder provides no useful PATH', () => {
    const managedRuntime = path.join(
      '/Users/operator',
      'Library',
      'Application Support',
      'OPL',
      'runtime',
      'current',
      'bin',
      'codex'
    );

    expect(
      resolveCodexCliPath({
        env: { PATH: '/usr/bin:/bin' },
        homeDir: '/Users/operator',
        platform: 'darwin',
        isExecutable: (candidate) => candidate === managedRuntime,
      })
    ).toBe(managedRuntime);
  });
});

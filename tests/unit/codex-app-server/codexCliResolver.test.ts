import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveCodexCliPath } from '@/process/services/codexAppServer/codexCliResolver';

describe('resolveCodexCliPath', () => {
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
    expect(() => resolveCodexCliPath({ ...base, isExecutable: () => false })).toThrow(/not found/i);
  });
});

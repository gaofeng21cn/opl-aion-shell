import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRuntimeE2ELaunchTarget } from '../../../e2e/runtime-v2/runtimeFixture';

describe('runtime v2 Electron launch target', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the repository entry argument for source-byte E2E', () => {
    vi.stubEnv('OPL_RUNTIME_E2E_EXECUTABLE_PATH', '');

    expect(
      buildRuntimeE2ELaunchTarget({
        projectRoot: '/workspace/opl-aion-shell',
        locale: 'zh-CN',
        userDataDir: '/tmp/opl-source-user-data',
      })
    ).toEqual({
      args: ['.', '--lang=zh-CN', '--user-data-dir=/tmp/opl-source-user-data'],
      cwd: '/workspace/opl-aion-shell',
    });
  });

  it('launches packaged bytes by executable path without the repository entry argument', () => {
    const executablePath = '/Applications/One Person Lab.app/Contents/MacOS/One Person Lab';
    vi.stubEnv('OPL_RUNTIME_E2E_EXECUTABLE_PATH', `  ${executablePath}  `);

    const target = buildRuntimeE2ELaunchTarget({
      projectRoot: '/workspace/opl-aion-shell',
      locale: 'en-US',
      userDataDir: '/tmp/opl-packaged-user-data',
    });

    expect(target).toEqual({
      args: ['--lang=en-US', '--user-data-dir=/tmp/opl-packaged-user-data'],
      cwd: '/workspace/opl-aion-shell',
      executablePath,
    });
    expect(target.args).not.toContain('.');
  });
});

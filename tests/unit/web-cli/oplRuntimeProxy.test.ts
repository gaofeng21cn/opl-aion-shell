import { describe, expect, it } from 'vitest';

import { __oplRuntimeProxyTest } from '../../../packages/web-host/src/opl-runtime-proxy';

describe('OPL WebUI runtime proxy installation boundary', () => {
  it('uses the Framework headless installation contract for App-managed setup', () => {
    expect(__oplRuntimeProxyTest.buildCommandFromRequest('install-prep', {})).toEqual({
      surface: 'install_prep',
      args: ['install', '--headless', '--skip-modules', '--json'],
    });
    expect(__oplRuntimeProxyTest.buildStandardBootstrapCommand('/opt/One Person Lab/opl-install.sh')).toEqual({
      command: '/bin/bash',
      args: ['/opt/One Person Lab/opl-install.sh', '--headless', '--skip-modules'],
      redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-modules',
    });
  });

  it('rejects arbitrary runtime routes instead of exposing a shell command escape hatch', () => {
    expect(() => __oplRuntimeProxyTest.buildCommandFromRequest('shell', { command: 'rm -rf /' })).toThrow(
      'Unsupported OPL runtime route: shell'
    );
  });

  it('routes only the three public update lifecycle ids to their owning CLI surfaces', () => {
    expect(__oplRuntimeProxyTest.buildCommandFromRequest('update-apply', { componentId: 'opl_base' })).toMatchObject({
      surface: 'update_apply',
      args: ['update', 'apply', '--json'],
    });
    expect(
      __oplRuntimeProxyTest.buildCommandFromRequest('update-repair', {
        componentId: 'opl_packages',
        packageId: 'oma',
      })
    ).toMatchObject({
      surface: 'update_repair',
      args: ['packages', 'repair', '--package-id', 'oma', '--json'],
    });
    expect(() => __oplRuntimeProxyTest.buildCommandFromRequest('update-apply', { componentId: 'opl_app' })).toThrow(
      /host or carrier updater/
    );
    expect(() =>
      __oplRuntimeProxyTest.buildCommandFromRequest('update-apply', { componentId: 'runtime_substrate' })
    ).toThrow(/managed update lifecycle id/);
  });
});

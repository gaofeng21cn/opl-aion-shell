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
});

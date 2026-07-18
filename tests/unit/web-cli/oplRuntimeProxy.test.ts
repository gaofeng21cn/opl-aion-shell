import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { __oplRuntimeProxyTest } from '../../../packages/web-host/src/opl-runtime-proxy';

describe('OPL WebUI runtime proxy installation boundary', () => {
  it('uses the Framework headless installation contract for App-managed setup', () => {
    expect(__oplRuntimeProxyTest.buildCommandFromRequest('install-prep', {})).toEqual({
      surface: 'install_prep',
      args: ['install', '--headless', '--skip-packages', '--json'],
    });
    expect(__oplRuntimeProxyTest.buildStandardBootstrapCommand('/opt/One Person Lab/opl-install.sh')).toEqual({
      command: '/bin/bash',
      args: ['/opt/One Person Lab/opl-install.sh', '--headless', '--skip-packages'],
      redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
    });
  });

  it('rejects arbitrary runtime routes instead of exposing a shell command escape hatch', () => {
    expect(() => __oplRuntimeProxyTest.buildCommandFromRequest('shell', { command: 'rm -rf /' })).toThrow(
      'Unsupported OPL runtime route: shell'
    );
  });

  it('keeps the Web proxy command identical to the Desktop item-scoped detail read', () => {
    expect(
      __oplRuntimeProxyTest.buildCommandFromRequest('domain-detail-view', {
        itemId: 'diabetes:001',
        viewId: 'scientific-reasoning',
        ifRevision: 7,
      })
    ).toEqual({
      surface: 'domain_detail_view',
      args: [
        'app',
        'view',
        'read',
        '--item-id',
        'diabetes:001',
        '--view-id',
        'scientific-reasoning',
        '--if-revision',
        '7',
        '--json',
      ],
      maxStdoutBytes: 9437184,
    });
    expect(() =>
      __oplRuntimeProxyTest.buildCommandFromRequest('domain-detail-view', {
        itemId: '../private',
        viewId: 'scientific-reasoning',
      })
    ).toThrow(/Invalid OPL domain detail item id/);
    expect(() =>
      __oplRuntimeProxyTest.buildCommandFromRequest('domain-detail-view', {
        itemId: 'diabetes:001',
        viewId: 'scientific-reasoning;rm',
      })
    ).toThrow(/Invalid OPL domain detail view id/);
    expect(() =>
      __oplRuntimeProxyTest.buildCommandFromRequest('domain-detail-view', {
        itemId: 'diabetes:001',
        viewId: 'scientific-reasoning',
        ifRevision: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toThrow(/Invalid OPL domain detail revision/);
  });

  it('routes only the three public update lifecycle ids to their owning CLI surfaces', () => {
    expect(__oplRuntimeProxyTest.buildCommandFromRequest('update-plan-apply', {})).toMatchObject({
      surface: 'update_apply',
      args: ['update', 'apply', '--json'],
    });
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

  it('keeps one private process instance id across Web host commands and rotates it only for a new process', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-process-instance-'));
    const options = {
      dataDir: tempRoot,
      projectsDir: path.join(tempRoot, 'projects'),
      resourcesPath: path.join(tempRoot, 'resources'),
    };
    const originalValue = process.env.OPL_APP_PROCESS_INSTANCE_ID;
    const originalHostKind = process.env.OPL_APP_HOST_KIND;
    const originalTemporalAddress = process.env.OPL_TEMPORAL_ADDRESS;
    const originalTemporalAddressSource = process.env.OPL_TEMPORAL_ADDRESS_SOURCE;
    process.env.OPL_APP_PROCESS_INSTANCE_ID = 'user-supplied-value';
    process.env.OPL_APP_HOST_KIND = 'desktop';
    process.env.OPL_TEMPORAL_ADDRESS = '127.0.0.1:7233';
    process.env.OPL_TEMPORAL_ADDRESS_SOURCE = 'packaged_local_default';

    try {
      const firstEnv = __oplRuntimeProxyTest.buildOplEnv(options);
      const secondEnv = __oplRuntimeProxyTest.buildOplEnv(options);
      const firstId = firstEnv.OPL_APP_PROCESS_INSTANCE_ID;

      expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
      expect(secondEnv.OPL_APP_PROCESS_INSTANCE_ID).toBe(firstId);
      expect(firstId).not.toBe('user-supplied-value');
      expect(firstEnv.OPL_APP_HOST_KIND).toBeUndefined();
      expect(secondEnv.OPL_APP_HOST_KIND).toBeUndefined();
      expect(firstEnv.OPL_TEMPORAL_ADDRESS).toBeUndefined();
      expect(firstEnv.OPL_TEMPORAL_ADDRESS_SOURCE).toBeUndefined();

      process.env.OPL_TEMPORAL_ADDRESS = 'temporal.example.test:7233';
      process.env.OPL_TEMPORAL_ADDRESS_SOURCE = 'environment';
      const remoteEnv = __oplRuntimeProxyTest.buildOplEnv(options);
      expect(remoteEnv.OPL_TEMPORAL_ADDRESS).toBe('temporal.example.test:7233');
      expect(remoteEnv.OPL_TEMPORAL_ADDRESS_SOURCE).toBe('environment');

      const nextProcessId = __oplRuntimeProxyTest.resetOplAppProcessInstanceIdForTest();
      expect(nextProcessId).not.toBe(firstId);
      expect(__oplRuntimeProxyTest.buildOplEnv(options).OPL_APP_PROCESS_INSTANCE_ID).toBe(nextProcessId);

      const uiResult = __oplRuntimeProxyTest.commandFailureResult(
        __oplRuntimeProxyTest.buildCommandFromRequest('update-check', {}),
        'opl update check --json',
        'fixture failure'
      );
      expect(JSON.stringify(uiResult)).not.toContain('OPL_APP_PROCESS_INSTANCE_ID');
      expect(JSON.stringify(uiResult)).not.toContain(nextProcessId);
    } finally {
      if (originalValue === undefined) {
        delete process.env.OPL_APP_PROCESS_INSTANCE_ID;
      } else {
        process.env.OPL_APP_PROCESS_INSTANCE_ID = originalValue;
      }
      if (originalHostKind === undefined) {
        delete process.env.OPL_APP_HOST_KIND;
      } else {
        process.env.OPL_APP_HOST_KIND = originalHostKind;
      }
      if (originalTemporalAddress === undefined) {
        delete process.env.OPL_TEMPORAL_ADDRESS;
      } else {
        process.env.OPL_TEMPORAL_ADDRESS = originalTemporalAddress;
      }
      if (originalTemporalAddressSource === undefined) {
        delete process.env.OPL_TEMPORAL_ADDRESS_SOURCE;
      } else {
        process.env.OPL_TEMPORAL_ADDRESS_SOURCE = originalTemporalAddressSource;
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

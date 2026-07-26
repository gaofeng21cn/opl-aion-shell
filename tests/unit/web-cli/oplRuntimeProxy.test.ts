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

  it('uses the existing WebUI runtime proxy and credentials stdin for Gateway account login', () => {
    const password = 'gateway-account-secret';
    const spec = __oplRuntimeProxyTest.buildCommandFromRequest('gateway-account-login', {
      email: ' user@example.com ',
      password,
      deviceLabel: ' WebUI ',
    });

    expect(spec).toEqual({
      surface: 'gateway_account',
      args: ['connect', 'gateway', 'login', '--credentials-stdin', '--json'],
      stdin: `${JSON.stringify({ email: 'user@example.com', password, device_label: 'WebUI' })}\n`,
      redactedCommand: 'opl connect gateway login --credentials-stdin --json',
    });
    expect(JSON.stringify(spec.args)).not.toContain(password);
    expect(() =>
      __oplRuntimeProxyTest.buildCommandFromRequest('gateway-account-login', {
        email: 'user@example.com',
        password,
        rawSecret: password,
      })
    ).toThrow('Invalid Gateway account login request.');
  });

  it('matches Desktop private action payload transport and rejects ambiguous payload sources', () => {
    const payloadJson = { group_id: 'codex-group' };
    const spec = __oplRuntimeProxyTest.buildCommandFromRequest('execute-action', {
      actionId: 'gateway_account_complete_setup',
      dryRun: true,
      payloadJson,
    });

    expect(spec).toEqual({
      surface: 'app_action',
      args: [
        'app',
        'action',
        'execute',
        '--action',
        'gateway_account_complete_setup',
        '--dry-run',
        '--payload-stdin',
        '--json',
      ],
      stdin: JSON.stringify(payloadJson),
      redactedCommand:
        'opl app action execute --action gateway_account_complete_setup --dry-run --payload-stdin --json',
    });
    expect(JSON.stringify(spec.args)).not.toContain('codex-group');
    expect(
      __oplRuntimeProxyTest.buildCommandFromRequest('execute-action', {
        actionId: 'gateway_account_use_for_model_access',
        payloadJson: {},
      })
    ).toEqual({
      surface: 'app_action',
      args: [
        'app',
        'action',
        'execute',
        '--action',
        'gateway_account_use_for_model_access',
        '--payload-stdin',
        '--json',
      ],
      stdin: '{}',
      redactedCommand: 'opl app action execute --action gateway_account_use_for_model_access --payload-stdin --json',
    });
    expect(() =>
      __oplRuntimeProxyTest.buildCommandFromRequest('execute-action', {
        actionId: 'gateway_account_complete_setup',
        payloadJson,
        payloadRefsOnlyJson: { receipt_ref: 'receipt://gateway-login' },
      })
    ).toThrow('OPL runtime action accepts only one payload source.');
  });

  it('returns only the typed Gateway mutation result and rejects secret-bearing CLI output', () => {
    expect(
      __oplRuntimeProxyTest.sanitizeGatewayAccountResult({
        surface: 'gateway_account',
        command: 'opl connect gateway login --credentials-stdin --json',
        stdout: '{"ok":true,"account":"user@example.com"}',
        parsed: { ok: true, account: 'user@example.com' },
        ok: true,
      })
    ).toEqual({ ok: true, stateRefreshRequired: true });
    expect(
      __oplRuntimeProxyTest.sanitizeGatewayAccountResult({
        surface: 'gateway_account',
        command: 'opl connect gateway login --credentials-stdin --json',
        stdout: '{"ok":true,"password":"echoed-secret"}',
        parsed: { ok: true, password: 'echoed-secret' },
        ok: true,
      })
    ).toEqual({ ok: false, errorCode: 'internal_contract_violation', stateRefreshRequired: false });
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

  it('keeps Base updates on the managed update surface and rejects direct Package lifecycle commands', () => {
    expect(__oplRuntimeProxyTest.buildCommandFromRequest('update-plan-apply', {})).toMatchObject({
      surface: 'update_apply',
      args: ['update', 'apply', '--json'],
    });
    expect(__oplRuntimeProxyTest.buildCommandFromRequest('update-apply', { componentId: 'opl_base' })).toMatchObject({
      surface: 'update_apply',
      args: ['update', 'apply', '--json'],
    });
    for (const route of ['update-apply', 'update-repair', 'update-rollback']) {
      expect(() =>
        __oplRuntimeProxyTest.buildCommandFromRequest(route, {
          componentId: 'opl_packages',
          packageId: 'oma',
        })
      ).toThrow(/Framework projected action.*opl app action execute/);
    }
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

  it('keeps packaged image Framework and Codex bins ahead of persisted runtime paths', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-web-image-seed-'));
    const imageSeedDir = path.join(tempRoot, 'seed');
    const frameworkBin = path.join(imageSeedDir, 'payload', 'opl_framework', 'bin');
    const codexBin = path.join(imageSeedDir, 'payload', 'codex_cli', 'bin');
    const previous = {
      OPL_CODEX_BIN: process.env.OPL_CODEX_BIN,
      OPL_FULL_RUNTIME_HOME: process.env.OPL_FULL_RUNTIME_HOME,
      PATH: process.env.PATH,
    };

    fs.mkdirSync(frameworkBin, { recursive: true });
    fs.mkdirSync(codexBin, { recursive: true });
    fs.writeFileSync(path.join(frameworkBin, 'opl'), '');
    fs.writeFileSync(path.join(codexBin, 'codex'), '');
    process.env.OPL_CODEX_BIN = path.join(tempRoot, 'persisted-runtime', 'bin', 'codex');
    delete process.env.OPL_FULL_RUNTIME_HOME;
    process.env.PATH = `${path.join(tempRoot, 'data', '.opl', 'one-person-lab', 'bin')}${path.delimiter}/usr/bin`;

    try {
      const env = __oplRuntimeProxyTest.buildOplEnv({
        dataDir: path.join(tempRoot, 'data'),
        projectsDir: path.join(tempRoot, 'projects'),
        resourcesPath: path.join(tempRoot, 'resources'),
        imageSeedDir,
      });

      expect(env.PATH?.split(path.delimiter).slice(0, 2)).toEqual([frameworkBin, codexBin]);
      expect(env.OPL_CODEX_BIN).toBe(path.join(codexBin, 'codex'));
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

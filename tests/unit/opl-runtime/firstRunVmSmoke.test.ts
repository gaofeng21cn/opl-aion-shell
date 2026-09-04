import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
const { __test } = await import('../../../scripts/opl-first-run-vm-smoke.mjs');

function withFakeOpl(payloadBytes: number, run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-json-buffer-'));
  const oplPath = path.join(root, 'opl');
  const previousPath = process.env.PATH;
  fs.writeFileSync(
    oplPath,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ payload: 'x'.repeat(${payloadBytes}) }));\n`,
    { mode: 0o755 }
  );
  process.env.PATH = `${root}${path.delimiter}${previousPath ?? ''}`;
  try {
    run(root);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function withFakePackagedInstaller(payloadBytes: number, run: (appPath: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-buffer-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const installerPath = path.join(resourcesPath, 'opl-install.sh');
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.writeFileSync(
    installerPath,
    `#!/bin/bash\n${JSON.stringify(process.execPath)} -e "process.stdout.write('x'.repeat(${payloadBytes}))"\n`,
    { mode: 0o755 }
  );
  try {
    run(appPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function temporalServiceActionLifecycle(pid: number) {
  return {
    service_status: 'running',
    server_reachable: true,
    supervisor: {
      required: true,
      ready: true,
      error: null,
      pid,
    },
  };
}

const KIMI_CU_TOOLS = [
  'list_apps',
  'get_app_state',
  'click',
  'type_text',
  'press_key',
  'scroll',
  'set_value',
  'perform_secondary_action',
  'select_text',
  'drag',
];

function managedComputerUseAppState(permission: 'granted' | 'required' = 'granted') {
  const granted = permission === 'granted';
  return {
    app_state: {
      managed_companions: [
        {
          surface_kind: 'opl_managed_computer_use_projection',
          provider_id: 'kimi-cu',
          product_name: 'KimiCU',
          version: '0.5.4',
          source_ref:
            'one-person-lab-app/contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu',
          source_sha256: 'a'.repeat(64),
          installed: true,
          registered: true,
          enabled: true,
          permission,
          ready: granted,
          status: granted ? 'ready' : 'permission_required',
          bundle: {
            path: '/Applications/KimiCU.app',
            executable: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
            bundle_id: 'ai.kimi.cu',
            version: '0.5.4',
            team_id: '2J9472RW75',
            architecture: 'arm64',
            identity_verified: true,
          },
          mcp: {
            server_id: 'kimi-cu',
            registered: true,
            enabled: true,
            config_path: '/Users/opl-test/.codex/config.toml',
            required_tools: KIMI_CU_TOOLS,
            observed_tools: KIMI_CU_TOOLS.toReversed(),
            tools_exact: true,
            functional_probe: {
              tool_name: 'list_apps',
              called: true,
              passed: true,
              result_kind: 'content',
            },
          },
          service: { registered: true, xpc_ping: 'passed' },
          permissions: {
            accessibility: permission,
            screen_recording: permission,
          },
        },
      ],
    },
  };
}

function writeMasQualificationProvisioningReceipt(
  root: string,
  workspace: string,
  overrides: Record<string, unknown> = {}
) {
  const studyId = typeof overrides.study_id === 'string' ? overrides.study_id : 'qualification-study-from-receipt';
  const receiptPath = path.join(root, `mas-provisioning-${Math.random().toString(16).slice(2)}.json`);
  const receipt = {
    surface_kind: 'mas_qualification_work_item_provisioning_receipt',
    schema_version: 1,
    action_id: 'qualification_work_item_provisioning_authority_evaluate',
    receipt_ref: `mas-qualification-work-item-provisioning:${'a'.repeat(64)}`,
    domain_truth_owner: 'MedAutoScience',
    domain_id: 'medautoscience',
    qualification_scope: 'full_vm_release_smoke',
    workspace_root: workspace,
    study_id: studyId,
    canonical_study_root: `studies/${studyId}`,
    lifecycle_state: 'active',
    lifecycle_generation: 1,
    single_use: true,
    stage_body_allowed: false,
    business_work_allowed: false,
    publication_allowed: false,
    submission_allowed: false,
    ...overrides,
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
  return { receipt, receiptPath };
}

describe('packaged first-run VM smoke helpers', () => {
  it('allows packaged bootstrap output above the Node spawnSync default buffer', () => {
    withFakePackagedInstaller(2 * 1024 * 1024, (appPath) => {
      const result = __test.runPackagedStandardBootstrapForSmoke(appPath);

      expect(result).toMatchObject({
        status: 'passed',
        error_code: null,
        buffer_exhausted: false,
        stdout_bytes: 2 * 1024 * 1024,
        stderr_bytes: 0,
      });
      expect(result.max_buffer_bytes).toBeGreaterThan(1024 * 1024);
    });
  });

  it('records deterministic buffer diagnostics when packaged bootstrap output exceeds its limit', () => {
    withFakePackagedInstaller(256 * 1024, (appPath) => {
      const result = __test.runPackagedStandardBootstrapForSmoke(appPath, {
        bootstrapMaxBufferBytes: 1024,
      });

      expect(result).toMatchObject({
        status: 'failed',
        error_code: 'ENOBUFS',
        buffer_exhausted: true,
        max_buffer_bytes: 1024,
        timed_out: false,
      });
      expect(result.stdout_bytes).toBeGreaterThan(0);
      expect(result.stderr_bytes).toBe(0);
      expect(result.error).toContain('ENOBUFS');
    });
  });

  it('accepts OPL JSON output above the Node spawnSync default buffer', () => {
    withFakeOpl(2 * 1024 * 1024, (root) => {
      const raw = __test.runOplJson(['app', 'state', '--profile', 'fast', '--json'], {
        runtimeProfile: 'standard',
        timeoutMs: 10_000,
        __testOplCommandPath: path.join(root, 'opl'),
      });

      expect(Buffer.byteLength(raw)).toBeGreaterThan(1024 * 1024);
      expect(JSON.parse(raw).payload).toHaveLength(2 * 1024 * 1024);
    });
  });

  it('classifies output buffer exhaustion and bounds inline diagnostics', () => {
    withFakeOpl(256 * 1024, (root) => {
      let caught: InstanceType<typeof __test.OplJsonCommandError> | null = null;
      try {
        __test.runOplJson(['app', 'state', '--profile', 'fast', '--json'], {
          runtimeProfile: 'standard',
          timeoutMs: 10_000,
          maxBufferBytes: 1024,
          __testOplCommandPath: path.join(root, 'opl'),
        });
      } catch (error) {
        caught = error as InstanceType<typeof __test.OplJsonCommandError>;
      }
      expect(caught).toBeInstanceOf(__test.OplJsonCommandError);
      expect(caught?.diagnostics).toMatchObject({
        error_code: 'ENOBUFS',
        buffer_exhausted: true,
        max_buffer_bytes: 1024,
      });
      if (!caught) throw new Error('Expected OPL JSON buffer exhaustion.');

      const basePath = path.join(root, 'app-state-summary.json');
      __test.writeOplJsonCommandErrorArtifacts(basePath, caught, null);
      const errorArtifact = JSON.parse(fs.readFileSync(`${basePath}.error.json`, 'utf8'));
      expect(Buffer.byteLength(errorArtifact.diagnostics.stdout)).toBeLessThanOrEqual(
        __test.OPL_JSON_DIAGNOSTIC_INLINE_BYTES + 128
      );
      expect(errorArtifact.raw_output_artifacts.stdout).toBe('app-state-summary.json.stdout.log');
      expect(fs.statSync(`${basePath}.stdout.log`).size).toBeGreaterThan(1024);
    });
  });

  it('launches packaged apps with CDP and renderer accessibility enabled', () => {
    expect(__test.buildLaunchAppArgs('/Applications/One Person Lab.app', { cdpPort: 9239 })).toEqual([
      '-n',
      '/Applications/One Person Lab.app',
      '--args',
      '--force-renderer-accessibility',
      '--aionui-cdp-port=9239',
    ]);
    expect(__test.buildLaunchExecutableArgs({ cdpPort: 9239 })).toEqual([
      '--force-renderer-accessibility',
      '--aionui-cdp-port=9239',
    ]);
  });

  it('launches packaged apps with explicit CDP environment without changing packaged app identity', () => {
    const env = __test.buildPackagedAppLaunchBaseEnv({
      HOME: '/Users/admin',
      USER: 'admin',
      PATH: '/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
      AIONUI_CDP_PORT: '0',
      AIONUI_MULTI_INSTANCE: '1',
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_RENDERER_URL: 'http://localhost:5173',
      NODE_OPTIONS: '--require /tmp/hook.js',
      GITHUB_ACTIONS: 'true',
      CI: 'true',
      OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: '/tmp/codex.tgz',
    });

    expect(env).toMatchObject({
      HOME: '/Users/admin',
      USER: 'admin',
      PATH: '/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
      AIONUI_CDP_PORT: '0',
    });
    expect(env).not.toHaveProperty('AIONUI_MULTI_INSTANCE');
    expect(env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    expect(env).not.toHaveProperty('ELECTRON_RENDERER_URL');
    expect(env).not.toHaveProperty('NODE_OPTIONS');
    expect(env).not.toHaveProperty('GITHUB_ACTIONS');
    expect(env).not.toHaveProperty('CI');
    expect(env).not.toHaveProperty('OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL');

    const diagnostics = __test.launchEnvDiagnostics({
      ...env,
      AIONUI_CDP_PORT: '9239',
      OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: '/tmp/codex.tgz',
      OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: '/tmp/platform.tgz',
      OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: '/tmp/npm-cache',
      NPM_CONFIG_CACHE: '/tmp/npm-cache',
    });
    expect(diagnostics).toMatchObject({
      AIONUI_CDP_PORT: '9239',
      OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: true,
      OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: true,
      OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: true,
      NPM_CONFIG_CACHE: true,
      blocked_keys_present: [],
    });
    expect(diagnostics.inherited_keys).toContain('HOME');
    expect(diagnostics.inherited_keys).toContain('AIONUI_CDP_PORT');
    expect(diagnostics.inherited_keys).not.toContain('NODE_OPTIONS');

    const launchEnv = __test.buildLaunchAppEnv(
      {
        cdpPort: 9239,
        codexPackageTarball: '/tmp/codex.tgz',
        codexPlatformPackageTarball: '/tmp/platform.tgz',
        codexNpmCacheDir: '/tmp/npm-cache',
      },
      {
        HOME: '/Users/admin',
        PATH: '/usr/bin:/bin',
        AIONUI_CDP_PORT: '0',
        AIONUI_MULTI_INSTANCE: '1',
        ELECTRON_RUN_AS_NODE: '1',
        NODE_OPTIONS: '--require /tmp/hook.js',
        GITHUB_ACTIONS: 'true',
      }
    );
    expect(launchEnv).toMatchObject({
      HOME: '/Users/admin',
      PATH: '/usr/bin:/bin',
      OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
      OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
      AIONUI_CDP_PORT: '9239',
      OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: '/tmp/codex.tgz',
      OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: '/tmp/platform.tgz',
      OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: '/tmp/npm-cache',
      NPM_CONFIG_CACHE: '/tmp/npm-cache',
    });
    expect(launchEnv).not.toHaveProperty('AIONUI_MULTI_INSTANCE');
    expect(launchEnv).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    expect(launchEnv).not.toHaveProperty('NODE_OPTIONS');
    expect(launchEnv).not.toHaveProperty('GITHUB_ACTIONS');

    expect(
      __test.buildPackagedTemporalAddressEnv({
        OPL_TEMPORAL_ADDRESS: 'temporal.example.test:7233',
        OPL_TEMPORAL_ADDRESS_SOURCE: 'environment',
      })
    ).toEqual({
      OPL_TEMPORAL_ADDRESS: 'temporal.example.test:7233',
      OPL_TEMPORAL_ADDRESS_SOURCE: 'environment',
    });
    expect(
      __test.buildPackagedTemporalAddressEnv({
        OPL_TEMPORAL_ADDRESS: 'temporal.example.test:7233',
        OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
      })
    ).toEqual({ OPL_TEMPORAL_ADDRESS: 'temporal.example.test:7233' });
    expect(__test.buildPackagedTemporalAddressEnv({ OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233' })).toEqual({
      OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
    });
    expect(__test.buildPackagedTemporalAddressEnv({ TEMPORAL_ADDRESS: 'remote.example.test:7233' })).toEqual({
      TEMPORAL_ADDRESS: 'remote.example.test:7233',
    });
    expect(
      __test.buildPackagedTemporalAddressEnv({
        OPL_TEMPORAL_SERVICE_START_COMMAND: '/opt/custom/start-temporal',
      })
    ).toEqual({ OPL_TEMPORAL_SERVICE_START_COMMAND: '/opt/custom/start-temporal' });
  });

  it('parses packaged app process rows for launch diagnostics', () => {
    expect(
      __test.parseProcessRows(
        [
          '  PID  PPID ARGS',
          ' 1234     1 /Applications/One Person Lab.app/Contents/MacOS/One Person Lab /Applications/One Person Lab.app/Contents/MacOS/One Person Lab --force-renderer-accessibility --aionui-cdp-port=9230',
          ' 2234  1234 /Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper.app/Contents/MacOS/One Person Lab Helper /Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper.app/Contents/MacOS/One Person Lab Helper --type=renderer',
          ' 3234  1234 /Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper (GPU).app/Contents/MacOS/One Person Lab Helper (GPU) --type=gpu-process',
          ' 3333     1 /usr/bin/grep grep One Person Lab',
          ' 4333     1 /tmp/node /tmp/opl-first-run-vm-smoke.mjs --process-name One Person Lab --bootstrap-launch-diagnostics',
          ' 5333     1 /bin/sh -c echo One Person Lab',
        ].join('\n'),
        'One Person Lab'
      )
    ).toEqual([
      {
        pid: 1234,
        ppid: 1,
        args: '/Applications/One Person Lab.app/Contents/MacOS/One Person Lab /Applications/One Person Lab.app/Contents/MacOS/One Person Lab --force-renderer-accessibility --aionui-cdp-port=9230',
      },
      {
        pid: 2234,
        ppid: 1234,
        args: '/Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper.app/Contents/MacOS/One Person Lab Helper /Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper.app/Contents/MacOS/One Person Lab Helper --type=renderer',
      },
      {
        pid: 3234,
        ppid: 1234,
        args: '/Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper (GPU).app/Contents/MacOS/One Person Lab Helper (GPU) --type=gpu-process',
      },
    ]);
  });

  it('summarizes native modal text from launch diagnostics artifacts', () => {
    const summary = __test.summarizeNativeWindowDiagnostics({
      schema: 'opl_packaged_gui_native_window_diagnostics.v1',
      osascript: { status: 0 },
      result: {
        schema: 'opl_packaged_gui_native_window_snapshot.v1',
        target_process: {
          found: true,
          windows: [{ index: 0, nodes: [] }],
          top_level_ui_elements: [{ index: 0, nodes: [] }],
        },
        frontmost_processes: [
          { name: 'One Person Lab', frontmost: 'true', visible: 'true', window_count: 1, window_titles: ['Error'] },
        ],
        likely_alert_nodes: [
          {
            role: 'AXStaticText',
            subrole: null,
            text: 'A JavaScript error occurred in the main process',
            depth: 1,
          },
          { role: 'AXButton', subrole: null, text: 'OK', depth: 1 },
        ],
      },
    });

    expect(summary).toMatchObject({
      status: 'passed',
      target_process_found: true,
      target_process_window_count: 1,
      target_process_ui_element_count: 1,
      likely_alert_text: [
        { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
        { source: 'accessibility_likely_alert', text: 'OK' },
      ],
      window_title_text: [{ source: 'frontmost_window_title', text: 'Error' }],
    });
    expect(summary.frontmost_processes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'One Person Lab',
          window_titles: ['Error'],
        }),
      ])
    );
  });

  it('surfaces launch stderr in bootstrap blocker diagnostics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-launch-log-text-'));
    try {
      const launchLogDir = path.join(root, 'launch-app');
      fs.mkdirSync(launchLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(launchLogDir, 'stderr.log'),
        [
          "[AionUi:bootstrap] bootstrapImportFailure: Error: Cannot find module 'react'",
          'Require stack:',
          '- /Applications/One Person Lab.app/Contents/Resources/app.asar/node_modules/@office-ai/platform/dist/index.js',
        ].join('\n')
      );

      expect(__test.collectLaunchLogText(launchLogDir)).toEqual([
        expect.objectContaining({
          source: 'launch_stderr',
          text: expect.stringContaining("Cannot find module 'react'"),
        }),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes renderer bootstrap diagnostics when CDP is reachable but startup surfaces are absent', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-renderer-bootstrap-diagnostics-'));
    try {
      const sent = [];
      const client = {
        send(method, params) {
          sent.push({ method, params });
          if (method === 'Runtime.evaluate') {
            return Promise.resolve({
              result: {
                value: {
                  schema: 'opl_renderer_bootstrap_diagnostics.v1',
                  readyState: 'complete',
                  bodyTextSample: 'blank shell',
                  selectorState: {
                    'opl-startup-preflight': { present: false },
                    'opl-first-run-window': { present: false },
                    'opl-guid-entry': { present: false },
                  },
                },
              },
            });
          }
          return Promise.resolve({});
        },
      };

      const diagnostics = await __test.collectRendererBootstrapDiagnostics(
        client,
        {
          id: 'page-1',
          type: 'page',
          title: 'index.html',
          url: 'file:///Applications/One%20Person%20Lab.app/Contents/Resources/app.asar/out/main/renderer/index.html',
        },
        [{ source: 'Runtime.consoleAPICalled', type: 'error', text: 'renderer failed' }],
        { artifacts },
        null,
        new Error('OPL startup did not expose a preflight, first-run, or Guid surface')
      );

      expect(sent[0]?.method).toBe('Runtime.evaluate');
      expect(diagnostics).toMatchObject({
        schema: 'opl_renderer_bootstrap_diagnostics_bundle.v1',
        status: 'failed',
        cdp_target: {
          id: 'page-1',
          type: 'page',
          title: 'index.html',
        },
        error: 'OPL startup did not expose a preflight, first-run, or Guid surface',
        events: [{ source: 'Runtime.consoleAPICalled', type: 'error', text: 'renderer failed' }],
        snapshot: {
          schema: 'opl_renderer_bootstrap_diagnostics.v1',
          bodyTextSample: 'blank shell',
        },
      });
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'renderer-bootstrap-diagnostics.json'), 'utf8'))
      ).toMatchObject({
        schema: 'opl_renderer_bootstrap_diagnostics_bundle.v1',
        snapshot: {
          selectorState: {
            'opl-startup-preflight': { present: false },
          },
        },
      });
      expect(__test.rendererBootstrapDiagnosticsExpression()).toContain('opl-startup-preflight');
      expect(__test.rendererBootstrapDiagnosticsExpression()).toContain('localStorageKeys');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('resolves the executable inside a packaged .app from Info.plist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-executable-'));
    try {
      const appPath = path.join(root, 'One Person Lab.app');
      const macosDir = path.join(appPath, 'Contents', 'MacOS');
      fs.mkdirSync(macosDir, { recursive: true });
      fs.mkdirSync(path.join(appPath, 'Contents'), { recursive: true });
      fs.writeFileSync(
        path.join(appPath, 'Contents', 'Info.plist'),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<plist version="1.0">',
          '<dict>',
          '<key>CFBundleExecutable</key>',
          '<string>One Person Lab</string>',
          '</dict>',
          '</plist>',
        ].join('\n')
      );
      const executablePath = path.join(macosDir, 'One Person Lab');
      fs.writeFileSync(executablePath, '#!/bin/sh\n');
      fs.chmodSync(executablePath, 0o755);

      expect(
        __test.parseCfBundleExecutableFromPlistText(
          fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8')
        )
      ).toBe('One Person Lab');
      expect(__test.resolveAppExecutablePath(appPath)).toBe(executablePath);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('terminates stale packaged app instances by default before launch', () => {
    const previous = process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP;
    try {
      delete process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP;
      expect(__test.shouldTerminateExistingApp()).toBe(true);

      process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP = '1';
      expect(__test.shouldTerminateExistingApp()).toBe(false);

      process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP = '0';
      expect(__test.shouldTerminateExistingApp()).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP;
      } else {
        process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP = previous;
      }
    }
  });

  it('filters stale first-run events by timestamp', () => {
    expect(__test.eventTimestampMs({ timestamp: '2026-05-27T07:00:01.000Z' })).toBe(
      Date.parse('2026-05-27T07:00:01.000Z')
    );
    expect(__test.eventTimestampMs({ timestamp: 'not-a-date' })).toBe(0);
  });

  it('accepts already-prepared first-run events from the current launch', () => {
    expect(
      __test.isFirstRunCompletionEvent({
        event_type: 'gui_preparation_skipped',
        payload: { status: 'already-prepared' },
      })
    ).toBe(true);
    expect(
      __test.isFirstRunCompletionEvent({
        event_type: 'gui_preparation_skipped',
        payload: { status: 'blocked' },
      })
    ).toBe(false);
  });

  it('uses the existing-install Guid probe only outside clean first-run gates', () => {
    expect(
      __test.shouldProbeExistingGuidEntryBeforeFirstRun({
        assertClean: false,
        requireCodexConfigWizard: false,
      })
    ).toBe(true);
    expect(
      __test.shouldProbeExistingGuidEntryBeforeFirstRun({
        assertClean: true,
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
    expect(
      __test.shouldProbeExistingGuidEntryBeforeFirstRun({
        assertClean: false,
        requireCodexConfigWizard: true,
      })
    ).toBe(false);
    expect(__test.existingStateGuidProbeTimeoutMs({ timeoutMs: 240_000 })).toBe(30_000);
    expect(__test.existingStateGuidProbeTimeoutMs({ timeoutMs: 5_000 })).toBe(5_000);
  });

  it('caps CDP probing and keeps Accessibility fallback inside the shared timeout budget', () => {
    expect(__test.cdpProbeTimeoutMs({ timeoutMs: 240_000 })).toBe(30_000);
    expect(__test.cdpProbeTimeoutMs({ timeoutMs: 5_000 })).toBe(5_000);
    expect(__test.remainingGuidFallbackTimeoutMs(180_000, 30_000)).toBe(150_000);
    expect(__test.remainingGuidFallbackTimeoutMs(180_000, 181_000)).toBe(0);
  });

  it('fails before the long Accessibility fallback when renderer bootstrap threw', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-renderer-fatal-'));
    try {
      fs.writeFileSync(
        path.join(artifacts, 'renderer-bootstrap-diagnostics.json'),
        JSON.stringify({
          events: [
            {
              source: 'Runtime.exceptionThrown',
              text: 'Invalid OPL product profile: missing session_scoped_opl_app_context',
            },
          ],
        })
      );

      expect(__test.readRendererBootstrapFatal(artifacts)).toMatchObject({
        source: 'Runtime.exceptionThrown',
        text: 'Invalid OPL product profile: missing session_scoped_opl_app_context',
      });
      expect(() => __test.assertNoRendererBootstrapFatal(artifacts)).toThrow(
        /Renderer bootstrap failed before usable entry/
      );
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('bounds guest waits before the host SSH deadline can kill diagnostics', () => {
    const nowMs = 1_000_000;
    const hostDeadlineMs = nowMs + 300_000;

    expect(__test.boundTimeoutToHostDeadline(900_000, hostDeadlineMs, 'wait_guid_entry', nowMs)).toBe(
      300_000 - __test.HOST_DEADLINE_SAFETY_MARGIN_MS
    );
    expect(__test.boundTimeoutToHostDeadline(30_000, hostDeadlineMs, 'wait_guid_entry', nowMs)).toBe(30_000);
    expect(() => __test.boundTimeoutToHostDeadline(900_000, nowMs + 1_000, 'wait_guid_entry', nowMs)).toThrow(
      /host SSH deadline safety margin/
    );
  });

  it('writes JSONL smoke events without leaking secrets', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-smoke-events-'));
    try {
      const writeSmokeEvent = __test.createSmokeEventWriter(artifacts, 'sk-test-secret');
      writeSmokeEvent('wait_guid_cdp', 'started', { cdp_port: 9230 });
      writeSmokeEvent('wait_guid_cdp', 'passed', { duration_ms: 12 });

      const lines = fs.readFileSync(path.join(artifacts, 'smoke-events.jsonl'), 'utf8').trim().split(/\r?\n/);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({
        phase: 'wait_guid_cdp',
        status: 'started',
        cdp_port: 9230,
      });
      expect(JSON.parse(lines[1])).toMatchObject({
        phase: 'wait_guid_cdp',
        status: 'passed',
        duration_ms: 12,
      });
      expect(() => writeSmokeEvent('summary', 'failed', { error: 'sk-test-secret' })).toThrow(/Codex API key/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('checks the usable Guid entry through DOM state rather than macOS accessibility only', () => {
    const expression = __test.guidEntryReadinessExpression();

    expect(expression).toContain('[data-testid="opl-guid-entry"]');
    expect(expression).toContain('[data-testid="guid-input"]');
    expect(expression).toContain("window.location.hash.startsWith('#/guid')");
    expect(expression).toContain('[data-testid="opl-first-run-window"]');
    expect(expression).toContain('preset-pill-mas');
    expect(expression).toContain('preset-pill-research');
    expect(expression).toContain('querySelectorAll');
    expect(expression).toContain("entryKind: 'assistant_home'");
  });

  it('opens Gateway account setup through the persistent clean Guid recovery entry', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <button data-testid="opl-first-run-resume-entry">Complete setup</button>
      </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    const resume = window.document.querySelector<HTMLButtonElement>('[data-testid="opl-first-run-resume-entry"]')!;
    const clicks = vi.fn(() => {
      window.location.hash = '#/first-run';
    });
    resume.addEventListener('click', clicks);
    Object.defineProperty(resume, 'getBoundingClientRect', {
      value: () => ({ width: 160, height: 40, top: 0, left: 0, right: 160, bottom: 40 }),
    });

    const expression = __test.gatewayAccountFirstRunEntryExpression();
    expect(window.eval(expression)).toBe(false);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/first-run');

    const firstRun = window.document.createElement('main');
    firstRun.dataset.testid = 'opl-first-run-window';
    Object.defineProperty(firstRun, 'getBoundingClientRect', {
      value: () => ({ width: 1200, height: 800, top: 0, left: 0, right: 1200, bottom: 800 }),
    });
    window.document.body.append(firstRun);

    expect(window.eval(expression)).toMatchObject({
      status: 'entered',
      navigation: 'persistent_setup_entry',
      route_hash: '#/first-run',
    });
    expect(clicks).toHaveBeenCalledTimes(1);
    dom.window.close();
  });

  it('accepts the App-owned assistant home after ready or deferred FirstRun navigation', () => {
    const expression = __test.guidEntryNavigationExpression();

    expect(expression).toContain('[aria-label="opl-first-run-ready-entry"]');
    expect(expression).toContain('[data-testid="opl-first-run-enter-app"]');
    expect(expression).toContain('readyButton.click()');
    expect(expression).toContain('deferredButton.click()');
    expect(expression).toContain("navigatedBy: 'ready_entry'");
    expect(expression).toContain("navigatedBy: 'deferred_entry'");
    expect(expression).toContain("navigatedBy: 'usable_assistant_home'");
    expect(expression).toContain('preset-pill-mas');
    expect(expression).toContain('preset-pill-research');
    expect(expression).toContain('querySelectorAll');
    expect(expression).toContain("officialProfileState === 'failed'");
    expect(expression).toContain("officialProfileState !== 'running'");
    expect(expression).not.toContain("window.location.hash = '#/guid'");
  });

  it('fails immediately on an Official Profile apply error instead of leaving FirstRun', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <main data-testid="opl-first-run-window" data-official-profile-state="failed">
          <div data-testid="opl-first-run-technical-error">Package mas is absent</div>
          <button><span data-testid="opl-first-run-ready-entry">Enter OPL</span></button>
        </main>
      </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/first-run' }
    );
    const result = dom.window.eval(__test.guidEntryNavigationExpression());
    expect(result).toEqual({
      status: 'official_profile_failed',
      error: 'Package mas is absent',
    });
    expect(dom.window.location.hash).toBe('#/first-run');
    dom.window.close();
  });

  it('checks the beginner first-run layout before the ready-entry navigation click', () => {
    const expression = __test.firstRunBeginnerUxExpression();
    const navigationExpression = __test.guidEntryNavigationExpression();

    expect(expression).toContain('[data-testid="opl-first-run-window"]');
    expect(expression).toContain('[data-testid="opl-first-run-progress"]');
    expect(expression).toContain('[data-testid="opl-first-run-beginner-primary"]');
    expect(expression).toContain('[data-testid="opl-first-run-beginner-summary"]');
    expect(expression).toContain('[data-testid="opl-first-run-primary-action"]');
    expect(expression).toContain('[data-testid="opl-first-run-technical-details-toggle"]');
    expect(expression).toContain('[data-testid="opl-first-run-technical-details"]');
    expect(expression).toContain('[data-testid="opl-first-run-enter-app"]');
    expect(expression).toContain('deferredEntryVisible');
    expect(expression).toContain('technicalDetailsCollapsed');
    expect(expression).toContain('settings\\.firstRun\\.stage');
    expect(expression).toContain('full_readiness');
    expect(expression).toContain('action_command_ref');
    expect(expression).toContain('settings\\.firstRun\\.beginner\\.backgroundMaintenanceWithCount');
    expect(expression).toContain('opl system initialize');
    expect(expression).toContain('runtime command failed');
    expect(navigationExpression.indexOf('readyButton.click()')).toBeGreaterThan(0);
  });

  it('accepts the collapsed persistent details surface on the first-run completion screen', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <main data-testid="opl-first-run-window">
          <div data-testid="opl-first-run-progress">
            <section data-testid="opl-first-run-beginner-primary">
              <p data-testid="opl-first-run-beginner-summary">基础设置已完成，可以开始使用 One Person Lab。</p>
              <div data-testid="opl-first-run-primary-action"><button>进入 OPL</button></div>
            </section>
          </div>
          <div data-testid="opl-first-run-technical-details">
            <button aria-expanded="false">系统与维护详情</button>
          </div>
        </main>
      </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/first-run' }
    );
    const { window } = dom;
    for (const node of window.document.querySelectorAll<HTMLElement>('[data-testid]')) {
      Object.defineProperty(node, 'getBoundingClientRect', {
        value: () => ({ width: 640, height: 80, top: 0, left: 0, right: 640, bottom: 80 }),
      });
    }

    expect(window.eval(__test.firstRunBeginnerUxExpression())).toMatchObject({
      status: 'captured',
      beginnerPrimaryVisible: true,
      summaryText: '基础设置已完成，可以开始使用 One Person Lab。',
      technicalDetailsCollapsed: true,
    });
    dom.window.close();
  });

  it('accepts a usable entry reached before beginner screenshot capture', () => {
    const expression = __test.firstRunBeginnerUxExpression();

    expect(expression).toContain("status: 'skipped_by_usable_entry'");
    expect(expression).toContain('usable_guid_entry_reached_before_beginner_capture');
    expect(expression).toContain('usable_assistant_home_reached_before_beginner_capture');
    expect(expression).toContain('[data-testid="opl-guid-entry"]');
    expect(expression).toContain('[data-testid="guid-input"]');
    expect(expression).toContain('[data-testid="guid-send-btn"]');
    expect(expression).toContain('preset-pill-mas');
    expect(expression).toContain('preset-pill-research');
    expect(expression).toContain('querySelectorAll');
  });

  it('captures a beginner screenshot only when the beginner layout was observed', () => {
    expect(__test.shouldCaptureFirstRunBeginnerScreenshot({ status: 'captured' })).toBe(true);
    expect(
      __test.shouldCaptureFirstRunBeginnerScreenshot({
        status: 'skipped_by_usable_entry',
        reason: 'usable_guid_entry_reached_before_beginner_capture',
      })
    ).toBe(false);
    expect(__test.shouldCaptureFirstRunBeginnerScreenshot(null)).toBe(false);
  });

  it('checks startup preflight visibility before accepting first-run or Guid readiness', () => {
    const expression = __test.startupPreflightExpression();

    expect(expression).toContain('[data-testid="opl-startup-preflight"]');
    expect(expression).toContain('Starting One Person Lab');
    expect(expression).toContain('正在启动 One Person Lab');
    expect(expression).toContain('Desktop session');
    expect(expression).toContain('App configuration');
    expect(expression).toContain('Initialization status');
    expect(expression).toContain('[data-testid="opl-first-run-window"]');
    expect(expression).toContain('[data-testid="opl-guid-entry"]');
  });

  it('requires the beginner first-run layout only for clean first-run probes', () => {
    expect(
      __test.shouldCheckFirstRunBeginnerUx({
        assertClean: true,
        requireCodexConfigWizard: false,
      })
    ).toBe(true);
    expect(
      __test.shouldCheckFirstRunBeginnerUx({
        assertClean: false,
        requireCodexConfigWizard: true,
      })
    ).toBe(true);
    expect(
      __test.shouldCheckFirstRunBeginnerUx({
        assertClean: false,
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
  });

  it('uses core first-launch readiness for standard smoke when a Codex API key is available', () => {
    expect(
      __test.shouldWaitForCoreFirstLaunchReady({
        runtimeProfile: 'standard',
        codexApiKeyFile: '/tmp/codex-api-key',
        requireCodexConfigWizard: false,
      })
    ).toBe(true);
    expect(
      __test.shouldWaitForCoreFirstLaunchReady({
        runtimeProfile: 'standard',
        codexApiKeyFile: null,
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
    expect(
      __test.shouldWaitForCoreFirstLaunchReady({
        runtimeProfile: 'full',
        codexApiKeyFile: '/tmp/codex-api-key',
        requireCodexConfigWizard: false,
      })
    ).toBe(true);
    expect(
      __test.shouldWaitForCoreFirstLaunchReady({
        runtimeProfile: 'standard',
        codexApiKeyFile: null,
        requireCodexConfigWizard: true,
      })
    ).toBe(true);
    expect(
      __test.shouldWaitForCoreFirstLaunchReady({
        runtimeProfile: 'standard',
        codexApiKeyFile: '/tmp/codex-api-key',
        bootstrapLaunchDiagnostics: true,
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
  });

  it('configures Codex from the VM smoke API key file before core readiness probing', () => {
    const calls: Array<{ args: string[]; options: Record<string, unknown> }> = [];
    const result = __test.configureCodexApiKeyForSmoke(
      {
        timeoutMs: 12_000,
        appPath: '/Applications/One Person Lab.app',
        codexProviderBaseUrl: 'https://gateway.medopl.com/v1/',
        __testHooks: {
          runOplJson: (args: string[], options: Record<string, unknown>) => {
            calls.push({ args, options });
            return JSON.stringify({ status: 'configured', provider_base_url: 'https://gateway.medopl.com/v1' });
          },
        },
      },
      'sk-test-secret'
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['system', 'configure-codex', '--api-key-stdin', '--json']);
    expect(calls[0].options.input).toBe('sk-test-secret\n');
    expect(JSON.stringify(result)).not.toContain('sk-test-secret');
    expect(result).toMatchObject({
      status: 'configured',
      command: 'opl system configure-codex --api-key-stdin --json',
      provider_base_url_matches_host: true,
      result: {
        status: 'configured',
        provider_base_url: 'https://gateway.medopl.com/v1',
      },
    });
  });

  it('rejects a host credential when configure-codex selects a different Base URL', () => {
    expect(() =>
      __test.configureCodexApiKeyForSmoke(
        {
          codexProviderBaseUrl: 'https://provider.example/v1',
          __testHooks: {
            runOplJson: () =>
              JSON.stringify({
                codex_config: { bootstrap: { provider_base_url: 'https://gateway.medopl.com/v1' } },
              }),
          },
        },
        'host-selected-test-credential'
      )
    ).toThrow(/does not match the developer host Codex selection/);
  });

  it('skips programmatic Codex configuration when no VM smoke API key is available', () => {
    expect(
      __test.configureCodexApiKeyForSmoke(
        {
          __testHooks: {
            runOplJson: () => {
              throw new Error('runOplJson should not be called without an API key');
            },
          },
        },
        null
      )
    ).toEqual({
      status: 'skipped',
      reason: 'missing_codex_api_key',
    });
  });

  it('records Provider configuration as not requested for ordinary release smoke', () => {
    const options = __test.parseArgs(['--app', '/Applications/One Person Lab.app', '--runtime-profile', 'full']);

    expect(__test.buildProviderConfigurationSummary(options, null)).toEqual({
      status: 'not_requested',
      requested: false,
      authentication_default: 'opl_gateway_account_password',
      api_key_role: 'explicit_compatibility_only',
      credential_source: null,
      credential_present: false,
      provider_base_url_matches_host: null,
      manual_user_input_required: false,
      mutation_performed: false,
      blocking_release_gate: false,
    });
  });

  it('observes and defers the Provider wizard when release smoke has no credential', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-wizard-defer-'));
    const submitCodexWizard = vi.fn();
    try {
      const state = __test.observeCodexConfigWizard(
        'One Person Lab',
        null,
        artifacts,
        __test.createCodexWizardState(),
        {
          queryAccessibility: () => [{ name: 'opl-first-run-gateway-key-method' }],
          writeJsonArtifact: vi.fn(),
          captureMacScreenArtifact: vi.fn(),
          submitCodexWizard,
        }
      );

      expect(state).toMatchObject({
        sawCodexWizard: true,
        submittedCodexWizard: false,
        capturedCodexWizard: true,
      });
      expect(submitCodexWizard).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('probes the Provider wizard only for a Codex configuration blocker', () => {
    const options = { requireCodexConfigWizard: false };
    expect(
      __test.shouldObserveCodexConfigWizard({ setup_flow: { blocking_items: ['codex'] } }, options, 'test-credential')
    ).toBe(false);
    expect(
      __test.shouldObserveCodexConfigWizard(
        { setup_flow: { blocking_items: ['codex_config'] } },
        options,
        'test-credential'
      )
    ).toBe(true);
  });

  it('records explicit API Key configuration as a non-blocking compatibility lane', () => {
    const options = __test.parseArgs([
      '--app',
      '/Applications/One Person Lab.app',
      '--codex-api-key-file',
      '/tmp/explicit-provider-compatibility-key.txt',
    ]);

    expect(
      __test.buildProviderConfigurationSummary(options, 'explicit-test-credential', {
        programmaticConfigured: true,
      })
    ).toEqual({
      status: 'configured',
      requested: true,
      authentication_default: 'opl_gateway_account_password',
      api_key_role: 'explicit_compatibility_only',
      credential_source: 'explicit_api_key_file',
      credential_present: true,
      provider_base_url_matches_host: null,
      manual_user_input_required: false,
      mutation_performed: true,
      blocking_release_gate: false,
    });
  });

  it('rejects a required Provider compatibility wizard without an explicit credential file', () => {
    expect(() =>
      __test.parseArgs(['--app', '/Applications/One Person Lab.app', '--require-codex-config-wizard'])
    ).toThrow(/requires --codex-api-key-file/);
  });

  it('maps clean Full first-run screenshots to release evidence paths only for Full gates', () => {
    expect(__test.RELEASE_EVIDENCE_SCREENSHOTS).toEqual({
      full: path.join('screenshots', 'full.png'),
      action: path.join('screenshots', 'action.png'),
    });
    expect(
      __test.shouldCaptureFullReleaseScreenshot({
        assertClean: true,
        requireCodexConfigWizard: false,
        runtimeProfile: 'full',
      })
    ).toBe(true);
    expect(
      __test.shouldCaptureFullReleaseScreenshot({
        assertClean: true,
        requireCodexConfigWizard: false,
        runtimeProfile: 'standard',
      })
    ).toBe(false);
    expect(
      __test.shouldCaptureFullReleaseScreenshot({
        assertClean: false,
        requireCodexConfigWizard: false,
        runtimeProfile: 'full',
      })
    ).toBe(false);
  });

  it('captures Full release screenshot evidence through CDP when beginner capture is skipped', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-smoke-full-screenshot-'));
    const options = {
      artifacts,
      assertClean: true,
      requireCodexConfigWizard: false,
      runtimeProfile: 'full',
    };
    const client = {
      send: vi.fn().mockResolvedValue({ data: Buffer.from('current-guid-page').toString('base64') }),
    };

    try {
      const result = await __test.captureFullReleaseScreenshotEvidence(options, client);
      const target = path.join(artifacts, 'screenshots', 'full.png');

      expect(result).toEqual({ status: 'captured', target, source: 'cdp_current_page' });
      expect(client.send).toHaveBeenCalledWith('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      expect(fs.readFileSync(target, 'utf8')).toBe('current-guid-page');

      const source = path.join(artifacts, 'first-run-beginner.png');
      fs.writeFileSync(source, 'beginner-page', 'utf8');
      expect(await __test.captureFullReleaseScreenshotEvidence(options, client, source)).toEqual({
        status: 'already_present',
        target,
      });
      expect(fs.readFileSync(target, 'utf8')).toBe('current-guid-page');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('records unsigned spctl rejection as local authorization diagnostic after codesign passes', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-smoke-local-authorization-'));
    const appPath = path.join(os.tmpdir(), 'One Person Lab.app');
    try {
      const spawnSync = (command) =>
        command === 'codesign'
          ? { status: 0, stdout: '', stderr: '' }
          : { status: 3, stdout: '', stderr: `${appPath}: rejected\n` };

      expect(() => __test.verifyGatekeeperLaunchPolicy(appPath, artifacts, { spawnSync })).not.toThrow();
      const policy = JSON.parse(fs.readFileSync(path.join(artifacts, 'gatekeeper-launch-policy.json'), 'utf8'));
      expect(policy).toMatchObject({
        schema: 'opl_gatekeeper_launch_policy.v1',
        app_path: appPath,
        gatekeeper_required: false,
        quarantine_removal_required: true,
        local_authorization_status: 'rejected_allowed_unsigned',
        codesign: { status: 0 },
        spctl: { status: 3 },
      });
      expect(policy.spctl.stderr).toContain('rejected');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('records codesign verification failure as unsigned local authorization diagnostic', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-smoke-local-authorization-fail-'));
    try {
      const spawnSync = (command) =>
        command === 'codesign'
          ? { status: 1, stdout: '', stderr: 'codesign-failed\n' }
          : { status: 0, stdout: '', stderr: '' };

      expect(() => __test.verifyGatekeeperLaunchPolicy('/tmp/One Person Lab.app', artifacts, { spawnSync })).toThrow(
        /blocking deep codesign verification/
      );
      const policy = JSON.parse(fs.readFileSync(path.join(artifacts, 'gatekeeper-launch-policy.json'), 'utf8'));
      expect(policy).toMatchObject({
        schema: 'opl_gatekeeper_launch_policy.v1',
        app_path: '/tmp/One Person Lab.app',
        gatekeeper_required: false,
        quarantine_removal_required: true,
        quarantine_status: 'absent',
        quarantine_attribute_count: 0,
        local_authorization_status: 'failed_allowed_unsigned',
        codesign: { status: 1 },
        spctl: { status: 0 },
      });
      expect(policy.codesign.stderr).toContain('codesign-failed');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not require folded technical action labels during first-run accessibility fallback', () => {
    const labels = __test.firstRunAccessibilityExpectedLabels();

    expect(labels).toContain('opl-first-run-ready-entry');
    expect(labels).toContain('opl-first-run-beginner-summary');
    expect(labels).toContain('opl-first-run-primary-action');
    expect(labels).toContain('opl-first-run-technical-details-toggle');
    expect(labels).toContain('opl-guid-entry');
    expect(labels).toContain('@科研');
    expect(labels).toContain('@基金');
    expect(labels).toContain('@演示');
    expect(labels).not.toContain('opl-first-run-background-maintenance-secondary');
    expect(labels).not.toContain('opl-first-run-install-button');
    expect(labels).not.toContain('opl-first-run-open-environment-button');
    expect(labels).not.toContain('opl-first-run-open-modules-button');
    expect(labels).not.toContain('opl-first-run-retry-button');
  });

  it('detects Guid and assistant-home entries through the Accessibility tree', () => {
    expect(__test.detectUsableEntryAccessibility([{ name: 'opl-guid-entry' }])).toEqual({
      entryKind: 'guid',
      labels: ['opl-guid-entry'],
    });
    expect(
      __test.detectUsableEntryAccessibility([{ title: '@MAS' }, { name: 'MAG' }, { description: 'Run @RCA task' }])
    ).toMatchObject({
      entryKind: 'assistant_home',
      labels: ['@科研', '@基金', '@演示'],
      matchedLabels: ['@MAS', 'MAG', '@RCA'],
    });
    expect(__test.detectUsableEntryAccessibility([{ title: '@MAS' }, { name: '@MAG' }])).toBeNull();
  });

  it('smokes the current OPL App-owned settings routes', () => {
    const targetHashes = __test.SETTINGS_PAGE_SMOKE_TARGETS.map((target) => target.hash);

    expect(targetHashes).toEqual([
      '#/settings/general',
      '#/settings/environment',
      '#/settings/capabilities',
      '#/settings/access',
      '#/settings/appearance',
      '#/settings/environment?section=diagnostics',
      '#/settings/about',
    ]);
    expect(targetHashes).not.toContain('#/settings/overview');
    expect(targetHashes).not.toContain('#/settings/runtime');
    expect(targetHashes).not.toContain('#/settings/model');
    expect(targetHashes).not.toContain('#/settings/agent');
    expect(targetHashes).not.toContain('#/settings/display');
    expect(targetHashes).not.toContain('#/settings/webui');
    expect(targetHashes).not.toContain('#/settings/advanced');
  });

  it('uses current Settings navigation groups for top-level routes and keeps About secondary', () => {
    const aboutTarget = __test.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'about');
    const diagnosticsTarget = __test.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'diagnostics');
    const generalTarget = __test.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'general');

    expect(aboutTarget).toBeTruthy();
    expect(diagnosticsTarget).toBeTruthy();
    expect(generalTarget).toBeTruthy();
    if (!aboutTarget || !diagnosticsTarget || !generalTarget) {
      throw new Error('Expected Settings smoke targets are missing.');
    }

    expect(aboutTarget).toMatchObject({ navigation: 'secondary' });
    expect(diagnosticsTarget).toMatchObject({
      navigationGroupId: 'runtime_maintenance',
      navigationDestinationId: 'logs_diagnostics',
    });
    expect(generalTarget).toMatchObject({
      navigationGroupId: 'overview',
      navigationDestinationId: 'overview_status',
    });
    expect(__test.pageReadinessExpression(aboutTarget)).toContain('const navPresent = true;');
    expect(__test.pageReadinessExpression(diagnosticsTarget)).toContain(
      '[data-settings-group-id="runtime_maintenance"]'
    );
    expect(__test.pageReadinessExpression(diagnosticsTarget)).toContain(
      'window.location.hash === "#/settings/environment?section=diagnostics"'
    );
    expect(__test.pageReadinessExpression(generalTarget)).toContain('[data-settings-group-id="overview"]');
    expect(__test.pageReadinessExpression(generalTarget)).not.toContain('data-settings-id="general"');
  });

  it('accepts a ready Settings page rendered with the grouped navigation contract', () => {
    const generalTarget = __test.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'general');
    expect(generalTarget).toBeTruthy();
    if (!generalTarget) throw new Error('Expected the General Settings smoke target.');

    const dom = new JSDOM(
      `<body>${'Ready Settings content '.repeat(8)}<button data-settings-group-id="overview"></button><main data-testid="settings-page-overview"></main></body>`,
      { url: 'https://onepersonlab.local/#/settings/general' }
    );
    Object.defineProperty(dom.window.document.body, 'innerText', {
      configurable: true,
      value: 'Ready Settings content '.repeat(8),
    });
    const evaluate = () =>
      Function(
        'window',
        'document',
        `return ${__test.pageReadinessExpression(generalTarget)};`
      )(dom.window, dom.window.document);

    expect(evaluate()).toMatchObject({
      id: 'general',
      hash: '#/settings/general',
      navPresent: true,
      contentPresent: true,
    });
    dom.window.document.querySelector('[data-settings-group-id="overview"]')?.remove();
    expect(evaluate()).toBe(false);
  });

  it('opens the current Maintenance diagnostics surface through stable controls', () => {
    const expression = __test.maintenanceDiagnosticsStatusExpression();

    expect(expression).toContain('[data-testid="settings-maintenance-diagnostics-action"]');
    expect(expression).toContain('[data-testid="settings-maintenance-technical-details"]');
    expect(expression).toContain('trigger.click()');
    expect(expression).not.toContain('Advanced paths');
    expect(expression).not.toContain('高级路径');
  });

  it('parses packaged assistant route smoke and exposes MAS/MAG/RCA targets', () => {
    const options = __test.parseArgs([
      '--app',
      '/Applications/One Person Lab.app',
      '--assistant-route-smoke',
      '--runtime-profile',
      'standard',
    ]);

    expect(options.assistantRouteSmoke).toBe(true);
    expect(__test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS).toEqual([
      {
        id: 'mas',
        packageId: 'mas',
        badge: '@科研',
        shortName: 'MAS',
        shortcutId: 'research',
        codexVisibleEntry: 'med-autoscience',
        requiredSkillIds: ['med-autoscience'],
      },
      {
        id: 'mag',
        packageId: 'mag',
        badge: '@基金',
        shortName: 'MAG',
        shortcutId: 'grant',
        codexVisibleEntry: 'med-autogrant',
        requiredSkillIds: ['med-autogrant'],
      },
      {
        id: 'rca',
        packageId: 'rca',
        badge: '@演示',
        shortName: 'RCA',
        shortcutId: 'ppt',
        codexVisibleEntry: 'redcube-ai',
        requiredSkillIds: ['redcube-ai'],
      },
    ]);
    const smokeSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    expect(smokeSource.match(/required_skill_ids: assistantTarget\.requiredSkillIds/g)).toHaveLength(2);
  });

  it('loads assistant, shortcut, package, Codex entry, and badge axes from the App compiled manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-compiled-expectations-'));
    const manifestPath = path.join(root, 'compiled.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schema: 'opl_app_first_run_compiled_expectations.v1',
        profiles: {
          standard: {
            semantics: {
              assistant_targets: [
                {
                  assistant_id: 'assistant-mas',
                  shortcut_id: 'research',
                  package_id: 'mas',
                  codex_visible_entry: 'med-autoscience',
                  required_skill_ids: ['med-autoscience'],
                  badge: '@科研',
                },
              ],
              artifact_kind: 'standard',
            },
            semantic_digest: '1'.repeat(64),
            probe_digest: '2'.repeat(64),
          },
        },
      })
    );
    try {
      expect(__test.loadAssistantRouteSmokeTargets(manifestPath)).toEqual([
        {
          id: 'assistant-mas',
          packageId: 'mas',
          badge: '@科研',
          shortName: 'ASSISTANT-MAS',
          shortcutId: 'research',
          codexVisibleEntry: 'med-autoscience',
          requiredSkillIds: ['med-autoscience'],
        },
      ]);
      const compiled = __test.loadCompiledAssistantRouteExpectations(manifestPath, 'standard', false);
      expect(compiled.consumption).toMatchObject({
        profile: 'standard',
        semantic_digest: '1'.repeat(64),
        probe_digest: '2'.repeat(64),
      });
      expect(compiled.consumption.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('checks packaged assistant routes through workspace-scoped Guid sends and GET readback', () => {
    const masTarget = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    const workspaceExpression = __test.homeAssistantWorkspaceContextExpression('/Users/opl/OPL-Smoke');
    const selectionExpression = __test.homeAssistantRouteSelectionExpression(masTarget);
    const readyExpression = __test.homeAssistantRouteReadyExpression(masTarget);
    const sendExpression = __test.homeAssistantRouteSendWithoutActivationExpression(masTarget, 'Verify MAS launch.');
    const sendDiagnosticsExpression = __test.homeAssistantRouteSendDiagnosticsExpression();
    const sendStateExpression = __test.homeAssistantRouteSendStateExpression(masTarget, 'Verify MAS launch.', 1_000);
    const receiptExpression = __test.latestConversationRouteReceiptExpression(masTarget);
    const receiptByIdExpression = __test.conversationRouteReceiptExpression(masTarget, 'conv-123');
    const activeReceiptExpression = __test.activeConversationRouteReceiptExpression(masTarget, '/Users/opl/OPL-Smoke');

    expect(__test.FULL_ASSISTANT_READINESS_TIMEOUT_MS).toBe(180_000);
    expect(__test.FULL_ASSISTANT_SEND_TIMEOUT_MS).toBe(180_000);
    expect(workspaceExpression).toContain("getAttribute('data-opl-workspace-selected')");
    expect(workspaceExpression).toContain("getAttribute('data-opl-workspace-path')");
    expect(workspaceExpression).toContain('workspace: "/Users/opl/OPL-Smoke"');
    expect(workspaceExpression).toContain("new PopStateEvent('popstate'");
    expect(selectionExpression).toContain('preset-pill-mas');
    expect(selectionExpression).toContain('preset-pill-research');
    expect(selectionExpression).toContain('home-starter-mas');
    expect(selectionExpression).toContain('home-starter-research');
    expect(selectionExpression).toContain('querySelectorAll');
    expect(selectionExpression).toContain('.find(visible)');
    expect(selectionExpression).toContain("getAttribute('disabled')");
    expect(selectionExpression).toContain("getAttribute('aria-disabled')");
    expect(selectionExpression).toContain('|| disabled');
    expect(selectionExpression).toContain('alreadySelected: true');
    expect(readyExpression).not.toContain('guid-active-capability');
    expect(readyExpression).toContain("getAttribute('aria-pressed') !== 'true'");
    expect(readyExpression).toContain('semanticState.active_shortcut_id !== "research"');
    expect(readyExpression).toContain("missingControls.push('active_shortcut_binding')");
    expect(readyExpression).toContain('guid-model-selector');
    expect(readyExpression).toContain('agent-mode-selector-');
    expect(readyExpression).toContain('agent-pill-');
    expect(readyExpression).toContain('model_selector_visible: true');
    expect(readyExpression).toContain('permission_selector_visible: true');
    expect(readyExpression).toContain('executor_selectors_hidden: true');
    expect(readyExpression).toContain("missingControls.push('model_reasoning')");
    expect(readyExpression).toContain("missingControls.push('permission_access')");
    expect(readyExpression).toContain("missingControls.push('forbidden_executor_selector')");
    expect(readyExpression).toContain("getAttribute('data-opl-composer-executor')");
    expect(readyExpression).toContain("missingControls.push('workspace_scope')");
    expect(readyExpression).toContain("reason: 'home_composer_contract_mismatch'");
    expect(sendExpression).toContain('guid-send-btn');
    expect(sendExpression).toContain('if (input.value !== "Verify MAS launch.")');
    expect(sendExpression).toContain("input.dispatchEvent(new Event('change', { bubbles: true }))");
    expect(sendExpression).toContain("interaction_path: 'guid_ui_cdp_pointer_send_without_shell_activation'");
    expect(sendExpression).toContain('shell_activation_allowed: false');
    expect(sendExpression).toContain("key.startsWith('__reactProps$')");
    expect(sendExpression).toContain("record('react_onclick_enter'");
    expect(sendExpression).not.toContain('sendButton.click()');
    expect(sendDiagnosticsExpression).toContain('__oplFullAssistantSendDiagnostics');
    expect(sendDiagnosticsExpression).toContain('current_react_onclick_present');
    expect(sendExpression).not.toContain("method: 'POST'");
    expect(sendStateExpression).toContain("? 'core_launch_prerequisite_notice'");
    expect(sendStateExpression).toContain("getAttribute('data-opl-block-reason')");
    expect(sendStateExpression).toContain("sendButton.classList.contains('arco-btn-loading')");
    expect(sendStateExpression).toContain('window.location.hash');
    expect(receiptExpression).toContain('/api/conversations?limit=10');
    expect(receiptByIdExpression).toContain('expectedConversationId = "conv-123"');
    expect(activeReceiptExpression).toContain('window.location.hash.match(/^#\\/conversation\\/');
    expect(activeReceiptExpression).toContain('/api/conversations/');
    expect(activeReceiptExpression).toContain('opl_agent_package_activation');
    expect(activeReceiptExpression).toContain('shell_activation_leaked_into_conversation');
    expect(activeReceiptExpression).toContain('shell_activation_absent: true');
    expect(activeReceiptExpression).not.toContain('activation_use_boundary_id');
    expect(activeReceiptExpression).not.toContain('activation_use_receipt_ref');
    expect(activeReceiptExpression).toContain('matched.extra?.is_temporary_workspace !== false');
    expect(activeReceiptExpression).toContain('conversation_temporary_workspace');
    expect(activeReceiptExpression).not.toContain('conversation_custom_workspace');
    expect(activeReceiptExpression).not.toContain("method: 'POST'");
    expect(receiptExpression).toContain("evidence_source: 'selected_composer_target_plus_active_conversation_get'");
    expect(receiptExpression).toContain('persisted_route_metadata');
    expect(receiptExpression).toContain('builtin_capability');
    expect(receiptExpression).toContain('codex_cli');
    expect(receiptExpression).toContain('opl_app_home');
    expect(receiptExpression).toContain('package_id');
    expect(receiptExpression).toContain('shortcut_id');
    expect(receiptExpression).toContain('codex_visible_entry');
    expect(receiptExpression).toContain("matched.type !== 'acp'");
    expect(receiptExpression).toContain("matched.extra?.backend !== 'codex'");
  });

  it('dismisses only the downloaded update modal before preparing a real assistant pointer send', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <div role="dialog" id="unrelated-dialog"><div><h3>Confirm action</h3><button type="button">Close</button></div></div>
        <div role="dialog" id="update-dialog"><div><h3>Software update</h3><button type="button">Close</button></div></div>
      </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const updateDialog = dom.window.document.querySelector('#update-dialog') as HTMLElement;
    const unrelatedDialog = dom.window.document.querySelector('#unrelated-dialog') as HTMLElement;
    const updateClose = updateDialog.querySelector('button') as HTMLButtonElement;
    const unrelatedClose = unrelatedDialog.querySelector('button') as HTMLButtonElement;
    const updateCloseSpy = vi.fn(() => updateDialog.remove());
    const unrelatedCloseSpy = vi.fn();
    updateClose.addEventListener('click', updateCloseSpy);
    unrelatedClose.addEventListener('click', unrelatedCloseSpy);
    for (const dialog of [updateDialog, unrelatedDialog]) {
      Object.defineProperty(dialog, 'getBoundingClientRect', {
        value: () => ({ width: 400, height: 300 }),
      });
    }
    Object.defineProperty(updateClose, 'getBoundingClientRect', {
      value: () => ({ width: 24, height: 24 }),
    });

    const expression = __test.homeAssistantRouteSendWithoutActivationExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0],
      'Verify MAS launch.'
    );
    expect(dom.window.eval(expression)).toBe(false);
    expect(updateCloseSpy).toHaveBeenCalledOnce();
    expect(unrelatedCloseSpy).not.toHaveBeenCalled();
    expect(dom.window.document.querySelector('#update-dialog')).toBeNull();
    expect(dom.window.document.querySelector('#unrelated-dialog')).not.toBeNull();
    dom.window.close();
  });

  it('accepts an ordinary conversation only when Shell activation evidence is absent', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://opl.invalid/#/conversation/conv-123',
    });
    const { window } = dom;
    const conversationExtra: Record<string, unknown> = {
      backend: 'codex',
      workspace: '/Users/opl/OPL-Smoke',
      is_temporary_workspace: false,
    };
    const conversation = {
      id: 'conv-123',
      type: 'acp',
      extra: conversationExtra,
    };
    Object.defineProperty(window, '__backendPort', { value: 12345 });
    Object.defineProperty(window, 'fetch', {
      value: vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: conversation }),
      })),
    });

    const expression = __test.activeConversationRouteReceiptExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0],
      '/Users/opl/OPL-Smoke'
    );
    await expect(window.eval(expression)).resolves.toMatchObject({
      status: 'passed',
      conversation_id: 'conv-123',
      workspace: '/Users/opl/OPL-Smoke',
      shell_activation_absent: true,
      activation: null,
      persisted_route_metadata: null,
      route: {
        route_kind: 'builtin_capability',
        executor: 'codex_cli',
        assistant_id: 'mas',
        assistant_short_name: 'MAS',
        source: 'opl_app_home',
        package_id: 'mas',
        shortcut_id: 'research',
        codex_visible_entry: 'med-autoscience',
        required_skill_ids: ['med-autoscience'],
        evidence_source: 'selected_composer_target_plus_active_conversation_get',
      },
    });

    conversationExtra.opl_agent_package_activation = {
      action_id: 'agent_package_activate',
      package_id: 'mas',
    };
    await expect(window.eval(expression)).rejects.toThrow('shell_activation_leaked_into_conversation');
    dom.window.close();
  });

  it('fails closed before Framework provider start without a valid workspace-bound MAS provisioning receipt', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-provisioning-fail-closed-'));
    const manifestPath = path.join(root, 'agent', 'stages', 'manifest.json');
    const workspace = path.join(root, 'workspace');
    const target = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        target_domain_id: 'medautoscience',
        stages: [{ stage_id: 'direction_and_route_selection' }],
      })
    );
    const beforeState = {
      status: {
        package_id: 'mas',
        runtime_source_readiness: { checkout_path: root },
      },
      snapshot: { package_id: 'mas', workspace },
    };
    const runOplJson = vi.fn();
    const invoke = (receiptPath: string | null) =>
      __test.runFrameworkStageRuntimeActivation(
        { timeoutMs: 30_000, masStudyProvisioningReceipt: receiptPath, __testHooks: { runOplJson } },
        target,
        workspace,
        beforeState
      );
    try {
      expect(() => invoke(null)).toThrow('--mas-study-provisioning-receipt');

      const malformedPath = path.join(root, 'malformed.json');
      fs.writeFileSync(malformedPath, '{"surface_kind":');
      expect(() => invoke(malformedPath)).toThrow('unreadable or invalid JSON');

      const mismatched = writeMasQualificationProvisioningReceipt(root, path.join(root, 'other-workspace'));
      expect(() => invoke(mismatched.receiptPath)).toThrow('workspace_root');

      const explicitWorkspace = path.join(root, 'explicit-workspace');
      const explicitWorkspaceReceipt = writeMasQualificationProvisioningReceipt(root, workspace);
      expect(() =>
        __test.parseArgs([
          '--dmg',
          '/tmp/One-Person-Lab.dmg',
          '--runtime-profile',
          'full',
          '--assistant-route-smoke',
          '--assistant-workspace',
          explicitWorkspace,
          '--mas-study-provisioning-receipt',
          explicitWorkspaceReceipt.receiptPath,
        ])
      ).toThrow('workspace_root');

      const wrongOwner = writeMasQualificationProvisioningReceipt(root, workspace, {
        domain_truth_owner: 'one-person-lab',
      });
      expect(() => invoke(wrongOwner.receiptPath)).toThrow('domain_truth_owner');
      expect(runOplJson).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the descriptor runtime domain for a MAG StageRun while validating its manifest domain', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mag-stage-runtime-domain-'));
    const runtimeHome = path.join(root, 'runtime', 'current');
    const moduleRoot = path.join(runtimeHome, 'modules', 'mag');
    const manifestPath = path.join(moduleRoot, 'agent', 'stages', 'manifest.json');
    const descriptorPath = path.join(moduleRoot, 'contracts', 'domain_descriptor.json');
    const markerPath = path.join(moduleRoot, 'opl-runtime-module.json');
    const target = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[1];
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.mkdirSync(path.dirname(descriptorPath), { recursive: true });
    fs.mkdirSync(path.join(moduleRoot, 'plugins'), { recursive: true });
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ packaged_runtime: true, module_id: 'medautogrant', repo_name: 'med-autogrant' })
    );
    fs.writeFileSync(
      descriptorPath,
      JSON.stringify({
        package_id: 'mag',
        domain_id: 'med-autogrant',
        standard_agent_interface: { runtime: { runtime_domain_id: 'medautogrant' } },
      })
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        target_domain_id: 'med-autogrant',
        stages: [{ stage_id: 'call_and_candidate_intake' }],
      })
    );
    try {
      expect(__test.resolveFrameworkStageRuntimeTarget({}, target, { runtimeHome })).toMatchObject({
        domain_id: 'medautogrant',
        stage_id: 'call_and_candidate_intake',
        runtime_source: 'packaged_full_runtime_module',
        domain_descriptor_path: descriptorPath,
        manifest_path: manifestPath,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves the RCA runtime domain from its repo JSON-pointer interface', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-rca-stage-runtime-domain-'));
    const runtimeHome = path.join(root, 'runtime', 'current');
    const moduleRoot = path.join(runtimeHome, 'modules', 'rca');
    const manifestPath = path.join(moduleRoot, 'agent', 'stages', 'manifest.json');
    const descriptorPath = path.join(moduleRoot, 'contracts', 'domain_descriptor.json');
    const interfacePath = path.join(moduleRoot, 'contracts', 'standard_agent_interface.json');
    const markerPath = path.join(moduleRoot, 'opl-runtime-module.json');
    const target = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[2];
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.mkdirSync(path.dirname(descriptorPath), { recursive: true });
    fs.mkdirSync(path.join(moduleRoot, 'plugins'), { recursive: true });
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ packaged_runtime: true, module_id: 'redcube', repo_name: 'redcube-ai' })
    );
    fs.writeFileSync(
      descriptorPath,
      JSON.stringify({
        package_id: 'rca',
        domain_id: 'redcube_ai',
        standard_agent_interface: {
          ref_kind: 'repo_json_pointer',
          ref: 'contracts/standard_agent_interface.json#/standard_agent_interface',
        },
      })
    );
    fs.writeFileSync(
      interfacePath,
      JSON.stringify({
        standard_agent_interface: { runtime: { runtime_domain_id: 'redcube_ai' } },
      })
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        target_domain_id: 'redcube_ai',
        stages: [{ stage_id: 'source_intake' }],
      })
    );
    try {
      expect(__test.resolveFrameworkStageRuntimeTarget({}, target, { runtimeHome })).toMatchObject({
        domain_id: 'redcube_ai',
        stage_id: 'source_intake',
        runtime_source: 'packaged_full_runtime_module',
        domain_descriptor_path: descriptorPath,
        manifest_path: manifestPath,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('separates ordinary send package-readiness stability from the qualification-only Framework guard', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-runtime-activation-'));
    const runtimeHome = path.join(root, 'runtime', 'current');
    const moduleRoot = path.join(runtimeHome, 'modules', 'mas');
    const manifestPath = path.join(moduleRoot, 'agent', 'stages', 'manifest.json');
    const descriptorPath = path.join(moduleRoot, 'contracts', 'domain_descriptor.json');
    const markerPath = path.join(moduleRoot, 'opl-runtime-module.json');
    const thinPluginRoot = path.join(root, 'codex', 'plugins', 'med-autoscience');
    const workspace = path.join(root, 'workspace');
    const target = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.mkdirSync(path.dirname(descriptorPath), { recursive: true });
    fs.mkdirSync(path.join(moduleRoot, 'plugins'), { recursive: true });
    fs.mkdirSync(thinPluginRoot, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ packaged_runtime: true, module_id: 'medautoscience', repo_name: 'med-autoscience' })
    );
    fs.writeFileSync(
      descriptorPath,
      JSON.stringify({
        package_id: 'mas',
        domain_id: 'medautoscience',
        standard_agent_interface: { runtime: { runtime_domain_id: 'medautoscience' } },
      })
    );
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        target_domain_id: 'medautoscience',
        stages: [{ stage_id: 'direction_and_route_selection' }],
      })
    );
    const packagePayload = (overrides: Record<string, unknown> = {}) => ({
      version: 'g2',
      opl_agent_package_status: {
        package_id: 'mas',
        runtime_source_readiness: { checkout_path: thinPluginRoot },
        status: 'available',
        installed_package_count: 1,
        installed_manifest_sha256: 'a'.repeat(64),
        installed_content_digest: null,
        installed_carrier_readback: {
          kind: 'local',
          identity: 'med-autoscience@med-autoscience-local',
          source_ref: thinPluginRoot,
          version: '0.2.27',
          enabled: true,
        },
        configured_carrier: {
          package_id: 'mas',
          operation: 'list',
          status: 'installed',
          installed_version: '0.2.27',
          enabled: true,
          plugin_source_path: thinPluginRoot,
        },
        launch_state: 'ready',
        launch_allowed: true,
        ...overrides,
      },
    });
    const beforePayload = packagePayload();
    const beforeSnapshot = __test.agentPackageLifecycleSnapshot(beforePayload, target, workspace);
    const unchangedSnapshot = __test.agentPackageLifecycleSnapshot(beforePayload, target, workspace);
    expect(__test.assertHomeAssistantRouteSendWithoutActivation(beforeSnapshot, unchangedSnapshot)).toMatchObject({
      status: 'passed',
      shell_activation_attempted: false,
      activation_or_use_receipts_added: false,
    });

    const afterPayload = packagePayload({ launch_state: 'attention_needed' });
    const afterSnapshot = __test.agentPackageLifecycleSnapshot(afterPayload, target, workspace);
    expect(() => __test.assertHomeAssistantRouteSendWithoutActivation(beforeSnapshot, afterSnapshot)).toThrow(
      'changed Framework package readiness'
    );

    const provisioning = writeMasQualificationProvisioningReceipt(root, workspace);
    const guardPayload = {
      version: 'g2',
      error: {
        code: 'contract_shape_invalid',
        message: 'Qualification-only lifecycle cannot authorize an ordinary Stage or business route.',
        exit_code: 3,
        details: {
          failure_code: 'domain_lifecycle_stage_launch_blocked',
          lifecycle_ref: pathToFileURL(
            path.join(workspace, provisioning.receipt.canonical_study_root, 'control', 'lifecycle.json')
          ).href,
          lifecycle_state: 'active',
          qualification_only: true,
          business_status: 'qualification_only',
          explicitly_unauthorized_routes: [
            'stage_body_authorized',
            'business_action_authorized',
            'publication_authorized',
            'submission_authorized',
          ],
        },
      },
    };
    const guardError = new __test.OplJsonCommandError(
      'qualification-only Stage launch blocked',
      { status: 3 },
      { stdout: '', stderr: JSON.stringify(guardPayload) }
    );
    const runOplJson = vi.fn((args: string[]) => {
      if (args[0] === 'family-runtime') throw guardError;
      return JSON.stringify(afterPayload);
    });
    const unexpectedStageResult = {
      version: 'g2',
      family_runtime_stage_run: {
        blocked_reason: __test.FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON,
        temporal_start: null,
        stage_run_input: {
          domain_id: 'medautoscience',
          stage_id: 'direction_and_route_selection',
          workspace_locator: {
            workspace_root: workspace,
            study_id: provisioning.receipt.study_id,
          },
        },
      },
    };
    try {
      expect(() => __test.resolveFrameworkStageRuntimeTarget(beforePayload.opl_agent_package_status, target)).toThrow(
        'has no Framework-owned runtime source checkout'
      );
      const stageTarget = __test.resolveFrameworkStageRuntimeTarget(beforePayload.opl_agent_package_status, target, {
        runtimeHome,
      });
      expect(stageTarget).toMatchObject({
        domain_id: 'medautoscience',
        stage_id: 'direction_and_route_selection',
        runtime_source: 'packaged_full_runtime_module',
        domain_descriptor_path: descriptorPath,
        manifest_path: manifestPath,
      });
      expect(stageTarget.domain_descriptor_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(stageTarget.manifest_sha256).toMatch(/^[0-9a-f]{64}$/);

      const evidence = __test.runFrameworkStageRuntimeActivation(
        {
          timeoutMs: 30_000,
          runtimeProfile: 'full',
          runtimeHome,
          masStudyProvisioningReceipt: provisioning.receiptPath,
          __testHooks: { runOplJson },
        },
        target,
        workspace,
        {
          status: beforePayload.opl_agent_package_status,
          snapshot: beforeSnapshot,
        }
      );
      expect(evidence).toMatchObject({
        status: 'passed',
        verification_mode: 'qualification_only_stage_admission_guard',
        activation_owner: 'one-person-lab_family_runtime',
        package_id: 'mas',
        domain_id: 'medautoscience',
        stage_id: 'direction_and_route_selection',
        workspace_locator: workspace,
        study_id: provisioning.receipt.study_id,
        provisioning_receipt_ref: provisioning.receipt.receipt_ref,
        framework_use_binding_readback: false,
        framework_admission_guard_readback: true,
        stage_launch_admitted: false,
        stage_body_started: false,
        admission_error_code: 'contract_shape_invalid',
        admission_failure_code: 'domain_lifecycle_stage_launch_blocked',
        qualification_only: true,
      });
      const stageArgs = runOplJson.mock.calls[0][0];
      expect(stageArgs).toEqual(
        expect.arrayContaining([
          'family-runtime',
          'attempt',
          'create',
          '--new-stage-run',
          '--start',
          '--blocked-reason',
          __test.FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON,
        ])
      );
      expect(stageArgs).toContain(
        JSON.stringify({ workspace_root: workspace, study_id: provisioning.receipt.study_id })
      );
      const unexpectedAdmission = vi.fn((args: string[]) =>
        JSON.stringify(args[0] === 'family-runtime' ? unexpectedStageResult : afterPayload)
      );
      expect(() =>
        __test.runFrameworkStageRuntimeActivation(
          {
            timeoutMs: 30_000,
            runtimeProfile: 'full',
            runtimeHome,
            masStudyProvisioningReceipt: provisioning.receiptPath,
            __testHooks: { runOplJson: unexpectedAdmission },
          },
          target,
          workspace,
          {
            status: beforePayload.opl_agent_package_status,
            snapshot: beforeSnapshot,
          }
        )
      ).toThrow('unexpectedly admitted an ordinary Stage for qualification-only Study');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses only the current Framework package-status CLI surface', () => {
    const target = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    const runOplJson = vi.fn(() =>
      JSON.stringify({
        version: 'g2',
        opl_agent_package_status: { package_id: target.packageId },
      })
    );
    const state = __test.readAgentPackageLifecycleState(
      { timeoutMs: 30_000, __testHooks: { runOplJson } },
      target,
      '/tmp/opl-smoke-workspace'
    );
    expect(state.args).toEqual(['packages', 'status', '--package-id', target.packageId, '--json']);
    expect(state.args).not.toContain('--scope');
    expect(state.args).not.toContain('--target-workspace');
  });

  it('checks Standard Home assistants through state-aware launch admission without creating route receipts', () => {
    const masTarget = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    const expression = __test.homeAssistantStandardLaunchAdmissionExpression(masTarget);

    expect(expression).toContain('home-starter-mas');
    expect(expression).toContain('home-starter-research');
    expect(expression).toContain('textarea[data-testid="guid-input"], input[data-testid="guid-input"]');
    expect(expression).not.toContain('[data-testid="guid-input"] textarea');
    expect(expression).toContain("getAttribute('disabled')");
    expect(expression).toContain("reason: 'starter_disabled_before_selection'");
    expect(expression).toContain("launchReady !== 'true' && launchReady !== 'false'");
    expect(expression).toContain("projection_state: 'available'");
    expect(expression).toContain('send_attempted: false');
    expect(expression).toContain("getAttribute('aria-pressed') !== 'true'");
    expect(expression).toContain('attempt.selection_click_count');
    expect(expression).toContain('selectionClickCount < 2');
    expect(expression).not.toContain('attempt.selection_clicked');
    expect(expression).toContain('sendButton.click()');
    expect(expression).toContain('querySelectorAll(\'[data-testid="opl-agent-package-launch-blocked"]\')');
    expect(expression).toContain("getAttribute('data-opl-package-id')");
    expect(expression).toContain("getAttribute('data-opl-block-reason')");
    expect(expression).toContain("getAttribute('data-opl-repair-actions')");
    expect(expression).toContain('input.value !== expectedDraft');
    expect(expression).not.toContain("querySelectorAll('.arco-message')");
    expect(expression).toContain("getAttribute('title')");
    expect(expression).toContain('selectable_before_selection: true');
    expect(expression).toContain('send_blocked: true');
    expect(expression).toContain('launch_allowed: false');
    expect(expression).not.toContain('/api/conversations');
  });

  it('proves Full Home readiness from the canonical composer state without a retired capability node', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
      <main
        data-testid="opl-guid-entry"
        data-opl-composer-executor="codex"
        data-opl-active-shortcut="research"
        data-opl-model-reasoning-visible="true"
        data-opl-permission-access-visible="true"
        data-opl-executor-selector-visible="false"
        data-opl-workspace-selected="true"
      >
        <button data-testid="home-starter-mas" aria-pressed="true">Research</button>
        <textarea data-testid="guid-input"></textarea>
        <button data-testid="guid-send-btn">Send</button>
        <button data-testid="guid-model-selector">Model</button>
        <button data-testid="agent-mode-selector-codex">Permission</button>
      </main>
    </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    for (const node of window.document.querySelectorAll('*')) {
      Object.defineProperty(node, 'getBoundingClientRect', {
        value: () => ({ width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32 }),
      });
    }

    const expression = __test.homeAssistantRouteReadyExpression(__test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0]);
    expect(window.eval(expression)).toMatchObject({
      status: 'ready',
      assistant_id: 'mas',
      active_capability: 'research',
      missing_controls: [],
    });

    window.document
      .querySelector('[data-testid="opl-guid-entry"]')!
      .setAttribute('data-opl-active-shortcut', 'presentation');
    expect(window.eval(expression)).toMatchObject({
      status: 'failed',
      missing_controls: ['active_shortcut_binding'],
    });
  });

  it('lets React commit the Full route prompt before dispatching a real CDP pointer click', async () => {
    const dom = new JSDOM(
      `<!doctype html><body>
      <main data-testid="opl-guid-entry" data-opl-workspace-selected="true">
        <textarea data-testid="guid-input"></textarea>
        <button data-testid="guid-send-btn">Send</button>
      </main>
    </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    const input = window.document.querySelector<HTMLTextAreaElement>('[data-testid="guid-input"]')!;
    const sendButton = window.document.querySelector<HTMLButtonElement>('[data-testid="guid-send-btn"]')!;
    const sendClick = vi.fn();
    sendButton.addEventListener('click', sendClick);
    Object.defineProperty(sendButton, 'getBoundingClientRect', {
      value: () => ({ width: 40, height: 40, top: 20, left: 30, right: 70, bottom: 60 }),
    });
    Object.defineProperty(window.document, 'elementFromPoint', {
      value: () => sendButton,
    });
    const expression = __test.homeAssistantRouteSendWithoutActivationExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0],
      'Verify MAS launch.'
    );

    expect(window.eval(expression)).toBe(false);
    expect(input.value).toBe('Verify MAS launch.');
    expect(sendClick).not.toHaveBeenCalled();

    const prepared = window.eval(expression);
    expect(prepared).toMatchObject({
      assistant_id: 'mas',
      interaction_path: 'guid_ui_cdp_pointer_send_without_shell_activation',
      shell_activation_allowed: false,
      prepared_at: expect.any(Number),
      click_point: { x: 50, y: 40 },
    });
    expect(sendClick).not.toHaveBeenCalled();

    const client = {
      send: vi.fn(async (method: string, params: Record<string, unknown>) => {
        if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased') {
          sendButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        }
        if (method === 'Runtime.evaluate') {
          return { result: { value: window.eval(String(params.expression)) } };
        }
        return {};
      }),
    };
    const sent = await __test.dispatchCdpPointerClick(client, prepared);
    expect(sent).toMatchObject({
      assistant_id: 'mas',
      clicked_at: expect.any(Number),
      pointer: { x: 50, y: 40, button: 'left', click_count: 1 },
    });
    expect(sendClick).toHaveBeenCalledOnce();
    expect(client.send).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 50,
      y: 40,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    expect(window.eval(__test.homeAssistantRouteSendDiagnosticsExpression())).toMatchObject({
      installed: true,
      events: expect.arrayContaining([expect.objectContaining({ phase: 'button_bubble' })]),
    });
  });

  it('waits on the same cached core launch prerequisites used by the Home composer', () => {
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
      url: 'https://opl.invalid/#/guid',
    });
    const { window } = dom;
    const cache = {
      loadedAt: '11:22:33',
      payload: {
        app_state: {
          schema_version: 'opl_app_state.v1',
          core: {
            codex: {
              installed: false,
              version_status: 'unknown',
              health_status: 'missing',
              model_access_ready: false,
            },
          },
          paths: {
            workspace_root: {
              selected_path: '/Users/opl/OPL-Smoke',
              exists: true,
              writable: true,
              health_status: 'ready',
            },
          },
        },
      },
    };
    window.localStorage.setItem('opl.appState.fast.v1', JSON.stringify(cache));

    expect(window.eval(__test.homeAssistantCoreReadinessExpression())).toBe(false);
    expect(window.eval(__test.homeAssistantCoreReadinessExpression(false))).toMatchObject({
      status: 'pending',
      reason: 'core_launch_prerequisites_not_ready',
      workspace_root_ready: true,
      codex_cli_ready: false,
      model_access_ready: false,
      blockers: ['codex_cli', 'model_access'],
    });

    cache.payload.app_state.core.codex = {
      installed: true,
      version_status: 'compatible',
      health_status: 'ready',
      model_access_ready: false,
    };
    window.localStorage.setItem('opl.appState.fast.v1', JSON.stringify(cache));
    expect(window.eval(__test.homeAssistantCoreReadinessExpression(false))).toMatchObject({
      status: 'pending',
      codex_cli_ready: true,
      model_access_ready: false,
      blockers: ['model_access'],
    });

    cache.payload.app_state.core.codex.model_access_ready = true;
    window.localStorage.setItem('opl.appState.fast.v1', JSON.stringify(cache));
    expect(window.eval(__test.homeAssistantCoreReadinessExpression())).toMatchObject({
      status: 'ready',
      reason: null,
      cache_loaded_at: '11:22:33',
      workspace_root_ready: true,
      codex_cli_ready: true,
      model_access_ready: true,
      selected_workspace: '/Users/opl/OPL-Smoke',
      blockers: [],
    });
    dom.window.close();
  });

  it('waits for Full send completion and returns typed idle or routed state', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
      <main
        data-testid="opl-guid-entry"
        data-opl-workspace-selected="true"
        data-opl-workspace-path="/Users/opl/OPL-Smoke"
        data-opl-active-shortcut="research"
        data-opl-composer-executor="codex"
      >
        <textarea data-testid="guid-input">Verify MAS launch.</textarea>
        <button data-testid="guid-send-btn" disabled>Send</button>
      </main>
    </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    const target = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    const clickedAt = Date.now() - 3_000;

    expect(window.eval(__test.homeAssistantRouteSendStateExpression(target, 'Verify MAS launch.', clickedAt))).toBe(
      false
    );
    expect(
      window.eval(__test.homeAssistantRouteSendStateExpression(target, 'Verify MAS launch.', clickedAt, false))
    ).toMatchObject({
      status: 'pending',
      send_loading: true,
      input_matches_prompt: true,
    });

    const sendButton = window.document.querySelector<HTMLButtonElement>('[data-testid="guid-send-btn"]')!;
    sendButton.disabled = false;
    expect(window.eval(__test.homeAssistantRouteSendStateExpression(target, 'Verify MAS launch.', clickedAt))).toBe(
      false
    );
    expect(
      window.eval(__test.homeAssistantRouteSendStateExpression(target, 'Verify MAS launch.', clickedAt, false))
    ).toMatchObject({
      status: 'pending',
      reason: null,
      send_loading: false,
      composer_state: {
        workspace_selected: 'true',
        active_shortcut_id: 'research',
        executor: 'codex',
      },
    });

    const setupNotice = window.document.createElement('div');
    setupNotice.setAttribute('data-testid', 'opl-guid-setup-notice');
    setupNotice.textContent = 'Complete model access setup';
    window.document.body.append(setupNotice);
    expect(
      window.eval(__test.homeAssistantRouteSendStateExpression(target, 'Verify MAS launch.', clickedAt))
    ).toMatchObject({
      status: 'failed',
      reason: 'core_launch_prerequisite_notice',
      setup_notice: 'Complete model access setup',
    });
    setupNotice.remove();

    window.location.hash = '#/conversation/conv-123';
    expect(
      window.eval(__test.homeAssistantRouteSendStateExpression(target, 'Verify MAS launch.', clickedAt))
    ).toMatchObject({
      status: 'routed',
      conversation_id: 'conv-123',
    });
  });

  it('admits an available Standard target after selection without sending', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
      <main data-testid="opl-guid-entry" data-opl-active-shortcut="">
        <button data-testid="home-starter-research" data-opl-launch-ready="true" aria-pressed="false">MAS</button>
        <textarea data-testid="guid-input"></textarea>
        <button data-testid="guid-send-btn">Send</button>
      </main>
    </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    for (const node of window.document.querySelectorAll('*')) {
      Object.defineProperty(node, 'getBoundingClientRect', {
        value: () => ({ width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32 }),
      });
    }
    const starter = window.document.querySelector<HTMLButtonElement>('[data-testid="home-starter-research"]')!;
    const composer = window.document.querySelector<HTMLElement>('[data-testid="opl-guid-entry"]')!;
    const input = window.document.querySelector<HTMLTextAreaElement>('textarea[data-testid="guid-input"]')!;
    const sendButton = window.document.querySelector<HTMLButtonElement>('[data-testid="guid-send-btn"]')!;
    const sendClick = vi.fn();
    starter.addEventListener('click', () => {
      starter.setAttribute('aria-pressed', 'true');
      composer.setAttribute('data-opl-active-shortcut', 'research');
    });
    sendButton.addEventListener('click', sendClick);

    const expression = __test.homeAssistantStandardLaunchAdmissionExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0]
    );
    expect(window.eval(expression)).toBe(false);
    expect(window.eval(expression)).toMatchObject({
      status: 'passed',
      assistant_id: 'mas',
      verification_path: 'available_projection',
      projection_state: 'available',
      visible: true,
      selectable_before_selection: true,
      selected: true,
      launch_allowed: true,
      send_attempted: false,
      send_blocked: false,
      repair_hint_visible: false,
      route_receipt_claimed: false,
    });
    expect(input.value).toBe('');
    expect(sendClick).not.toHaveBeenCalled();
    dom.window.close();
  });

  it('executes the unavailable Standard launch-admission polling lifecycle against the renderer textarea DOM', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
      <main data-testid="opl-guid-entry" data-opl-active-shortcut="">
        <button id="colliding-starter-control" title="package_not_installed: repair">
          <span data-testid="home-starter-mag" data-opl-launch-ready="false" aria-pressed="false">Open MAG user loop</span>
        </button>
        <button id="starter-control" title="package_not_installed: repair">
          <span data-testid="home-starter-grant" data-opl-launch-ready="false" aria-pressed="false">MAG</span>
        </button>
        <textarea data-testid="guid-input"></textarea>
        <button data-testid="guid-send-btn">Send</button>
      </main>
    </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    for (const node of window.document.querySelectorAll('*')) {
      Object.defineProperty(node, 'getBoundingClientRect', {
        value: () => ({ width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32 }),
      });
    }
    const collidingStarterControl = window.document.querySelector<HTMLButtonElement>('#colliding-starter-control')!;
    const starterControl = window.document.querySelector<HTMLButtonElement>('#starter-control')!;
    const starter = window.document.querySelector<HTMLElement>('[data-testid="home-starter-grant"]')!;
    const composer = window.document.querySelector<HTMLElement>('[data-testid="opl-guid-entry"]')!;
    const input = window.document.querySelector<HTMLTextAreaElement>('textarea[data-testid="guid-input"]')!;
    const sendButton = window.document.querySelector<HTMLButtonElement>('[data-testid="guid-send-btn"]')!;
    const collidingStarterClick = vi.fn();
    const starterClick = vi.fn();
    const sendClick = vi.fn();
    collidingStarterControl.addEventListener('click', collidingStarterClick);
    starterControl.addEventListener('click', starterClick);
    sendButton.addEventListener('click', sendClick);

    const expression = __test.homeAssistantStandardLaunchAdmissionExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[1]
    );
    expect(window.eval(expression)).toBe(false);
    expect(collidingStarterClick).not.toHaveBeenCalled();
    expect(starterClick).toHaveBeenCalledOnce();

    expect(window.eval(expression)).toBe(false);
    expect(collidingStarterClick).not.toHaveBeenCalled();
    expect(starterClick).toHaveBeenCalledTimes(2);

    starter.setAttribute('aria-pressed', 'true');
    composer.setAttribute('data-opl-active-shortcut', 'grant');
    expect(window.eval(expression)).toBe(false);
    expect(input.value).toBe('Verify MAG unavailable launch admission.');
    expect(starterClick).toHaveBeenCalledTimes(2);

    expect(window.eval(expression)).toBe(false);
    expect(sendClick).toHaveBeenCalledOnce();

    const repairMessage = window.document.createElement('div');
    repairMessage.setAttribute('data-testid', 'opl-agent-package-launch-blocked');
    repairMessage.setAttribute('data-opl-package-id', 'mag');
    repairMessage.setAttribute('data-opl-block-reason', 'package_not_installed');
    repairMessage.setAttribute('data-opl-repair-actions', 'install,open_modules');
    repairMessage.textContent = 'package_not_installed: install or open modules';
    Object.defineProperty(repairMessage, 'getBoundingClientRect', {
      value: () => ({ width: 240, height: 40, top: 0, left: 0, right: 240, bottom: 40 }),
    });
    window.document.body.append(repairMessage);
    expect(window.eval(expression)).toMatchObject({
      status: 'passed',
      assistant_id: 'mag',
      selectable_before_selection: true,
      selected: true,
      projection_state: 'unavailable',
      launch_allowed: false,
      send_attempted: true,
      send_blocked: true,
      repair_hint_visible: true,
      message_visible: true,
      route_hash: '#/guid',
    });
    dom.window.close();
  });

  it('carries the Standard model-access precondition from MAS to MAG without a second send', () => {
    const dom = new JSDOM(
      `<!doctype html><body>
      <main data-testid="opl-guid-entry" data-opl-active-shortcut="">
        <button
          data-testid="home-starter-research"
          data-opl-launch-ready="false"
          aria-pressed="false"
          title="package_not_installed: status, doctor, repair"
        >
          Research
        </button>
        <button
          data-testid="home-starter-grant"
          data-opl-launch-ready="false"
          aria-pressed="false"
          title="package_not_installed: status, doctor, repair"
        >
          MAG
        </button>
        <textarea data-testid="guid-input"></textarea>
        <button data-testid="guid-send-btn">Send</button>
      </main>
    </body>`,
      { runScripts: 'outside-only', url: 'https://opl.invalid/#/guid' }
    );
    const { window } = dom;
    for (const node of window.document.querySelectorAll('*')) {
      Object.defineProperty(node, 'getBoundingClientRect', {
        value: () => ({ width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32 }),
      });
    }
    window.localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        loadedAt: '11:22:33',
        payload: {
          app_state: {
            schema_version: 'opl_app_state.v1',
            core: {
              codex: {
                installed: true,
                version_status: 'compatible',
                health_status: 'ready',
                model_access_ready: false,
              },
            },
            paths: {
              workspace_root: {
                selected_path: '/Users/opl/OPL-Smoke',
                exists: true,
                writable: true,
                health_status: 'ready',
              },
            },
          },
        },
      })
    );

    const masStarter = window.document.querySelector<HTMLButtonElement>('[data-testid="home-starter-research"]')!;
    const magStarter = window.document.querySelector<HTMLButtonElement>('[data-testid="home-starter-grant"]')!;
    const composer = window.document.querySelector<HTMLElement>('[data-testid="opl-guid-entry"]')!;
    const input = window.document.querySelector<HTMLTextAreaElement>('textarea[data-testid="guid-input"]')!;
    const sendButton = window.document.querySelector<HTMLButtonElement>('[data-testid="guid-send-btn"]')!;
    const masStarterClick = vi.fn(() => {
      masStarter.setAttribute('aria-pressed', 'true');
      composer.setAttribute('data-opl-active-shortcut', 'research');
    });
    let magSelectionAttempts = 0;
    const magStarterClick = vi.fn(() => {
      magSelectionAttempts += 1;
      if (magSelectionAttempts === 1) return;
      masStarter.setAttribute('aria-pressed', 'false');
      magStarter.setAttribute('aria-pressed', 'true');
    });
    const sendClick = vi.fn(() => {
      const notice = window.document.createElement('div');
      notice.setAttribute('data-testid', 'opl-guid-setup-notice');
      notice.textContent = 'Complete model access setup';
      const action = window.document.createElement('button');
      action.setAttribute('data-testid', 'opl-guid-setup-notice-action');
      action.textContent = 'Complete setup';
      notice.append(action);
      window.document.body.append(notice);
      sendButton.disabled = true;
    });
    masStarter.addEventListener('click', masStarterClick);
    magStarter.addEventListener('click', magStarterClick);
    sendButton.addEventListener('click', sendClick);

    const masExpression = __test.homeAssistantStandardLaunchAdmissionExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0]
    );
    expect(window.eval(masExpression)).toBe(false);
    expect(masStarterClick).toHaveBeenCalledOnce();
    expect(window.eval(masExpression)).toBe(false);
    expect(input.value).toBe('Verify MAS unavailable launch admission.');
    expect(window.eval(masExpression)).toBe(false);
    expect(sendClick).toHaveBeenCalledOnce();
    expect(window.eval(masExpression)).toMatchObject({
      status: 'passed',
      assistant_id: 'mas',
      verification_path: 'model_access_precondition',
      projection_state: 'unavailable',
      selectable_before_selection: true,
      selected: true,
      launch_allowed: false,
      send_blocked: true,
      model_access_setup_visible: true,
      model_access_preempted_package_message: true,
      package_message_visible: false,
      repair_hint_visible: true,
      route_receipt_claimed: false,
      route_hash: '#/guid',
    });

    const magExpression = __test.homeAssistantStandardLaunchAdmissionExpression(
      __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[1]
    );
    expect(window.eval(magExpression)).toBe(false);
    expect(magStarterClick).toHaveBeenCalledOnce();
    expect(window.eval(magExpression)).toBe(false);
    expect(magStarterClick).toHaveBeenCalledTimes(2);
    expect(magStarter.getAttribute('aria-pressed')).toBe('true');
    expect(composer.getAttribute('data-opl-active-shortcut')).toBe('research');
    expect(input.value).toBe('Verify MAS unavailable launch admission.');
    expect(window.eval(magExpression)).toBe(false);
    expect(magStarterClick).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('Verify MAS unavailable launch admission.');

    composer.setAttribute('data-opl-active-shortcut', 'grant');
    expect(window.eval(magExpression)).toBe(false);
    expect(input.value).toBe('Verify MAG unavailable launch admission.');
    expect(magStarterClick).toHaveBeenCalledTimes(2);
    expect(window.eval(magExpression)).toMatchObject({
      status: 'passed',
      assistant_id: 'mag',
      verification_path: 'model_access_precondition',
      draft_preserved: true,
      model_access_setup_visible: true,
      model_access_preempted_package_message: true,
      route_receipt_claimed: false,
      route_hash: '#/guid',
    });
    expect(magStarterClick).toHaveBeenCalledTimes(2);
    expect(sendClick).toHaveBeenCalledOnce();
    expect(window.document.querySelector('[data-testid="opl-agent-package-launch-blocked"]')).toBeNull();
    dom.window.close();
  });

  it('proves the retired descendant-only input selector cannot match the frozen renderer DOM', () => {
    const dom = new JSDOM('<textarea data-testid="guid-input"></textarea>');

    expect(dom.window.document.querySelector('textarea[data-testid="guid-input"]')).not.toBeNull();
    expect(dom.window.document.querySelector('[data-testid="guid-input"] textarea')).toBeNull();
    expect(dom.window.document.querySelector('[data-testid="guid-input"] input')).toBeNull();
    dom.window.close();
  });

  it('fails the deterministic Codex functional check when the packaged CLI is unavailable', () => {
    const receipt = __test.buildCodexFunctionalCheckReceipt({
      codexApiKey: null,
      codexCliProbe: { detected: false, command: 'codex', version: null },
      assistantRouteSmoke: [{ id: 'mas' }, { id: 'mag' }, { id: 'rca' }],
    });

    expect(receipt).toMatchObject({
      schema: 'opl_codex_functional_check_receipt.v1',
      status: 'failed',
      runtime_profile: 'full',
      ui_language: 'zh-CN',
      opl_flow_context_expected: {
        status: 'passed',
        context_id: 'opl-flow',
        deterministic: true,
      },
      user_agents_policy: {
        status: 'passed',
        agents_override_allowed: false,
        deterministic: true,
      },
      codex_cli_invokable: {
        detected: false,
        status: 'missing',
      },
      assistant_route_receipts_checked: {
        status: 'passed',
        required: ['mas', 'mag', 'rca'],
        checked: ['mas', 'mag', 'rca'],
        deterministic: true,
      },
      skills_or_plugins_policy_checked: {
        status: 'passed',
        companion_skills_policy: 'codex_visible_companion_skills',
        domain_routes_policy: 'plugin_visible_domain_routes_not_companion_skill_mirrors',
        deterministic: true,
      },
      blocking_release_gate: {
        stable_vm_gate: 'receipt_file_exists_and_deterministic_fields_passed',
        deterministic_fields_passed: false,
        llm_invocation_required: false,
      },
      future_codex_invocation: {
        status: 'diagnostic_skipped',
        reason: 'codex_cli_unavailable',
      },
    });
    expect(() => __test.assertCodexFunctionalCheckReceipt(receipt)).toThrow(/Packaged Codex CLI is not callable/);
  });

  it('records available and unavailable Standard launch admission without claiming Full route receipts', () => {
    const assistantRouteSmoke = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target, index) => ({
      id: target.id,
      verification_mode: 'state_aware_launch_admission',
      launch_admission:
        index === 1
          ? {
              visible: true,
              selectable_before_selection: true,
              selected: true,
              projection_state: 'unavailable',
              launch_allowed: false,
              send_attempted: true,
              send_blocked: true,
              repair_hint_visible: true,
              draft_preserved: true,
              route_receipt_claimed: false,
            }
          : {
              visible: true,
              selectable_before_selection: true,
              selected: true,
              projection_state: 'available',
              launch_allowed: true,
              send_attempted: false,
              send_blocked: false,
              repair_hint_visible: false,
              route_receipt_claimed: false,
            },
    }));
    const receipt = __test.buildCodexFunctionalCheckReceipt({
      runtimeProfile: 'standard',
      codexApiKey: null,
      codexCliProbe: { detected: true, command: 'codex', version: 'codex-cli' },
      assistantRouteSmoke,
    });

    expect(receipt).toMatchObject({
      status: 'diagnostic_skipped',
      runtime_profile: 'standard',
      assistant_route_receipts_checked: {
        status: 'not_applicable_standard',
        checked: [],
      },
      assistant_launch_admissions_checked: {
        status: 'passed',
        checked: ['mas', 'mag', 'rca'],
      },
      blocking_release_gate: {
        deterministic_fields_passed: true,
      },
    });
  });

  it('parses Codex AI self-check as an optional post-install diagnostic', () => {
    const options = __test.parseArgs([
      '--app',
      '/Applications/One Person Lab.app',
      '--codex-ai-self-check',
      '--runtime-profile',
      'standard',
    ]);

    expect(options.codexAiSelfCheck).toBe(true);
    expect(options.codexAiSelfCheckMode).toBe('diagnose');
    expect(options.codexFunctionalCheck).toBe(true);
    expect(options.assistantRouteSmoke).toBe(true);
  });

  it('builds the Codex AI self-check prompt from deterministic post-install evidence', () => {
    const prompt = __test.buildCodexAiSelfCheckPrompt({
      runtimeProfile: 'full',
      uiLanguage: 'zh-CN',
      coreFirstLaunch: {
        source: 'opl system initialize --json',
        status: 'ready',
      },
      assistantRouteSmoke: [{ id: 'mas' }, { id: 'mag' }, { id: 'rca' }],
      codexFunctionalCheck: {
        schema: 'opl_codex_functional_check_receipt.v1',
        status: 'passed',
        blocking_release_gate: {
          deterministic_fields_passed: true,
          llm_invocation_required: false,
        },
      },
    });

    expect(prompt).toContain('One Person Lab post-install AI self-check');
    expect(prompt).toContain('Programmatic initialization has already run');
    expect(prompt).toContain(
      'Read the evidence and judge whether the installed OPL working mode matches the target state'
    );
    expect(prompt).toContain('Do not modify user files');
    expect(prompt).toContain('Output strict JSON only');
    expect(prompt).toContain('opl-flow');
    expect(prompt).toContain('MAS/MAG/RCA');
    expect(prompt).toContain('user AGENTS.md');
    expect(prompt).toContain('module_update_skill_plugin_continuity');
    expect(prompt).toContain('"runtime_profile": "full"');
  });

  it('skips the Codex CLI Git trust-directory guard for the read-only AI self-check', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-ai-self-check-'));
    try {
      let observedArgs: string[] = [];
      const receipt = __test.runCodexAiSelfCheck({
        requested: true,
        mode: 'diagnose',
        artifacts,
        cwd: '/private/tmp/untrusted-checkout',
        codexCliProbe: { detected: true, command: '/usr/local/bin/codex', version: 'codex-cli 0.146.0' },
        spawnSync: (_command: string, args: string[]) => {
          observedArgs = args;
          return {
            status: 0,
            stdout: '{"status":"passed","checks":{}}',
            stderr: '',
          };
        },
      });

      expect(observedArgs).toContain('--skip-git-repo-check');
      expect(receipt).toMatchObject({
        status: 'passed',
        mode: 'diagnose',
        blocking_release_gate: false,
      });
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('builds a skipped Codex AI self-check receipt when the diagnostic is not requested', () => {
    const receipt = __test.buildSkippedCodexAiSelfCheckReceipt({
      requested: false,
      reason: 'not_requested',
      codexCliProbe: { detected: true, command: 'codex', version: 'codex 0.50.0' },
    });

    expect(receipt).toMatchObject({
      schema: 'opl_codex_ai_self_check_receipt.v1',
      status: 'skipped_not_requested',
      mode: 'diagnose',
      mutations_allowed: false,
      blocking_release_gate: false,
      codex_cli: {
        detected: true,
        command: 'codex',
      },
    });
  });

  it('accepts stable ready and empty Runtime states instead of optional status copy as readiness evidence', () => {
    const expression = __test.runtimeStatusReadinessExpression();

    expect(expression).toContain('[data-testid="runtime-v2-page"]');
    expect(expression).toContain('[data-testid="runtime-status-region"]');
    expect(expression).toContain('[data-testid="runtime-ready-state"]');
    expect(expression).toContain('[data-testid="runtime-empty-state"]');
    expect(expression).toContain('[data-testid="runtime-refresh-button"]');
    expect(expression).toContain('(readyStatePresent && statusRegionPresent) || emptyStatePresent');
    expect(expression).toContain('hashOk && titleOk && pageReady');
  });

  it('wraps Codex AI self-check output as a non-blocking receipt', () => {
    const receipt = __test.buildCodexAiSelfCheckReceipt({
      requested: true,
      mode: 'diagnose',
      codexCliProbe: { detected: true, command: 'codex', version: 'codex 0.50.0' },
      prompt: 'target state brief',
      result: {
        status: 'passed',
        stdout: '{"status":"passed","checks":{"opl_flow_context":{"status":"passed"}}}',
        stderr: '',
        parsed: {
          status: 'passed',
          checks: {
            opl_flow_context: { status: 'passed' },
          },
        },
        outputPath: '/tmp/codex-ai-self-check-output.json',
      },
    });

    expect(receipt).toMatchObject({
      schema: 'opl_codex_ai_self_check_receipt.v1',
      status: 'passed',
      mode: 'diagnose',
      mutations_allowed: false,
      blocking_release_gate: false,
      codex_cli: {
        detected: true,
        command: 'codex',
      },
      codex_result: {
        parsed_status: 'passed',
        output_path: '/tmp/codex-ai-self-check-output.json',
      },
    });
  });

  it('captures Runtime action dry-run evidence from the visible Runtime page', () => {
    const expression = __test.runtimeActionEvidenceExpression();

    expect(__test.RUNTIME_ACTION_EVIDENCE_TIMEOUT_MS).toBe(45_000);
    expect(expression).toContain("window.location.hash = '#/runtime'");
    expect(expression).toContain('Advanced Details');
    expect(expression).toContain('高级详情');
    expect(expression).toContain('aria-expanded');
    expect(expression).toContain('safeActionsReady');
    expect(expression).toContain("toggle\n        ? toggle.getAttribute('aria-expanded') === 'true'");
    expect(expression).toContain('toggle.click()');
    expect(expression).toContain('Safe Action Routes');
    expect(expression).toContain('安全动作');
    expect(expression).toContain('Dry Run');
    expect(expression).toContain('试运行');
    expect(expression).toContain('Action Result');
    expect(expression).toContain('动作结果');
    expect(expression).toContain('Dry run completed');
    expect(expression).toContain('试运行完成');
  });

  it('writes App release runtime evidence with the stable payload-free action fixture', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-runtime-evidence-'));
    const calls: string[][] = [];
    const callOptions: Array<{ appPath?: string; runtimeProfile?: string; timeoutMs?: number }> = [];
    try {
      const result = __test.collectAppReleaseRuntimeEvidence(
        {
          artifacts,
          appPath: '/Applications/One Person Lab.app',
          runtimeProfile: 'full',
          timeoutMs: 1_000,
          __testHooks: {
            runOplJson: (
              args: string[],
              options: { appPath?: string; runtimeProfile?: string; timeoutMs?: number }
            ) => {
              calls.push(args);
              callOptions.push(options);
              return JSON.stringify({ command: args, ok: true });
            },
          },
        },
        null
      );

      expect(__test.RELEASE_EVIDENCE_ACTION_ID).toBe('developer_supervisor_refresh');
      expect(result).toEqual({
        status: 'passed',
        action_id: 'developer_supervisor_refresh',
        artifacts: [
          'app-state-summary.json',
          'app-state-full.json',
          'drilldown-full.json',
          'action-dry-run-result.json',
          'action-execute-result.json',
        ],
      });
      expect(calls).toEqual([
        ['app', 'state', '--profile', 'fast', '--json'],
        ['app', 'state', '--profile', 'full', '--json'],
        ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
        ['app', 'action', 'execute', '--action', 'developer_supervisor_refresh', '--dry-run', '--json'],
        ['app', 'action', 'execute', '--action', 'developer_supervisor_refresh', '--json'],
      ]);
      expect(callOptions).toEqual(
        Array.from({ length: 5 }, () => ({
          artifacts,
          appPath: '/Applications/One Person Lab.app',
          runtimeProfile: 'full',
          timeoutMs: 1_000,
          __testHooks: {
            runOplJson: expect.any(Function),
          },
        }))
      );
      expect(JSON.parse(fs.readFileSync(path.join(artifacts, 'action-dry-run-result.json'), 'utf8'))).toEqual({
        command: ['app', 'action', 'execute', '--action', 'developer_supervisor_refresh', '--dry-run', '--json'],
        ok: true,
      });
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'app-release-runtime-evidence-summary.json'), 'utf8'))
      ).toMatchObject({
        status: 'passed',
        action_id: 'developer_supervisor_refresh',
      });
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('uses one packaged Computer Use qualification for Standard and Full', () => {
    const standard = __test.buildManagedComputerUseQualification(managedComputerUseAppState(), 'standard');
    const full = __test.buildManagedComputerUseQualification(managedComputerUseAppState(), 'full');

    expect(standard).toMatchObject({
      schema: 'opl_computer_use_qualification.v1',
      status: 'passed',
      runtime_profile: 'standard',
      provider_id: 'kimi-cu',
      state: {
        installed: true,
        registered: true,
        enabled: true,
        permission: 'granted',
        ready: true,
        status: 'ready',
      },
      bundle: {
        bundle_id: 'ai.kimi.cu',
        version: '0.5.4',
        team_id: '2J9472RW75',
        architecture: 'arm64',
        identity_verified: true,
      },
      mcp: {
        registered: true,
        enabled: true,
        tools_exact: true,
        functional_probe: {
          tool_name: 'list_apps',
          called: true,
          passed: true,
          result_kind: 'content',
        },
      },
      acceptance: {
        lifecycle_ready: true,
        projection_identity_bound: true,
        bundle_identity_verified: true,
        service_ready: true,
        mcp_10_tools_exact: true,
        mcp_list_apps_call_passed: true,
        codex_backend_configured: true,
        permission_details_valid: true,
        permission_projection_consistent: true,
        ready_consistent: true,
        standard_full_same_logic: true,
      },
    });
    expect(standard.mcp.required_tools).toHaveLength(10);
    expect(standard.mcp.observed_tools).toEqual(standard.mcp.required_tools);
    expect({ ...full, runtime_profile: 'standard' }).toEqual(standard);
  });

  it('waits for startup maintenance and writes the packaged Computer Use receipt from a full App-state probe', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-computer-use-qualification-'));
    const calls: string[][] = [];
    try {
      const receipt = await __test.collectManagedComputerUseQualification(
        {
          artifacts,
          runtimeProfile: 'standard',
          timeoutMs: 1_000,
          codexReadinessPhaseTimeoutMs: 2_000,
          __testHooks: {
            runOplJson: (args: string[]) => {
              calls.push(args);
              return JSON.stringify(
                calls.length === 1 ? { app_state: { managed_companions: [] } } : managedComputerUseAppState('granted')
              );
            },
            sleep: async () => {},
          },
        },
        null
      );

      expect(calls).toEqual([
        ['app', 'state', '--profile', 'full', '--json'],
        ['app', 'state', '--profile', 'full', '--json'],
      ]);
      expect(receipt).toMatchObject({
        status: 'passed',
        runtime_profile: 'standard',
        state: { permission: 'granted', ready: true, status: 'ready' },
      });
      expect(JSON.parse(fs.readFileSync(path.join(artifacts, 'computer-use-qualification.json'), 'utf8'))).toEqual(
        receipt
      );
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('rejects Computer Use projection drift before writing a passed receipt', () => {
    const missingTool = managedComputerUseAppState();
    const companion = missingTool.app_state.managed_companions[0];
    companion.mcp.observed_tools = companion.mcp.observed_tools.slice(1);
    expect(() => __test.buildManagedComputerUseQualification(missingTool, 'standard')).toThrow(/mcp_10_tools_exact/);

    const invalidIdentity = managedComputerUseAppState();
    invalidIdentity.app_state.managed_companions[0].bundle.bundle_id = 'invalid.bundle.id';
    expect(() => __test.buildManagedComputerUseQualification(invalidIdentity, 'full')).toThrow(
      /bundle_identity_verified/
    );

    const unboundProjection = managedComputerUseAppState();
    unboundProjection.app_state.managed_companions[0].source_sha256 = 'not-a-digest';
    expect(() => __test.buildManagedComputerUseQualification(unboundProjection, 'standard')).toThrow(
      /projection_identity_bound/
    );
  });

  it('proves the Full Temporal supervisor survives kill, restart, and launchd session reload', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-supervisor-proof-'));
    const stateDir = path.join(artifacts, 'state');
    const databasePath = path.join(stateDir, 'family-runtime', 'temporal-server', 'temporal.sqlite');
    const plistPath = path.join(artifacts, 'ai.opl.family-runtime.temporal-service.plist');
    const previousStateDir = process.env.OPL_STATE_DIR;
    const pids = [4101, 4102, 4103, 4104];
    const calls: string[][] = [];
    const launchctlCalls: string[][] = [];
    const terminated: number[] = [];
    const fastState = (pid: number) => ({
      app_state: {
        provider: {
          temporal: {
            details: {
              worker_readiness: {
                service_ready: true,
                server_reachable: true,
                temporal_service_lifecycle: {
                  service_status: 'running',
                  supervisor: {
                    surface_kind: 'opl_temporal_service_supervisor_state',
                    status: 'loaded_running',
                    installed: true,
                    loaded: true,
                    ready: true,
                    observed_at: '2026-07-17T00:00:00.000Z',
                    error: null,
                    supported: true,
                    applicable: true,
                    required: true,
                    configuration_current: true,
                    process_state: 'running',
                    pid,
                    last_exit_status: 0,
                    last_exit_signal: null,
                    run_at_load: true,
                    keep_alive: true,
                    throttle_interval_seconds: 15,
                    address: '127.0.0.1:7233',
                    database_path: databasePath,
                    launcher_source: 'temporal_cli_path',
                    schedule_independent: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    let stateIndex = 0;
    process.env.OPL_STATE_DIR = stateDir;
    try {
      const proof = await __test.collectTemporalServiceSupervisorProof(
        {
          artifacts,
          runtimeProfile: 'full',
          timeoutMs: 1_000,
          __testTemporalSupervisorPlistPath: plistPath,
          __testHooks: {
            runOplJson: (args: string[]) => {
              calls.push(args);
              if (args[1] === 'action') {
                const actionId = args[4];
                const restart = actionId === 'provider_service_restart';
                return JSON.stringify({
                  app_action_execution: {
                    action_id: actionId,
                    dry_run: false,
                    delegated_surface: `opl family-runtime service ${restart ? 'restart' : 'start'} --provider temporal`,
                    result: {
                      version: 'g2',
                      family_runtime_service: restart
                        ? {
                            action: 'restart',
                            restart_status: 'restarted',
                            ready: true,
                            previous_supervisor_pid: 4102,
                            supervisor_pid: 4103,
                            supervisor_pid_changed: true,
                            status: temporalServiceActionLifecycle(4103),
                          }
                        : {
                            action: 'start',
                            start_status: 'started_supervised',
                            status: temporalServiceActionLifecycle(4101),
                            supervisor_operation: { action: 'install', status: 'ready', ready: true, error: null },
                          },
                    },
                  },
                });
              }
              return JSON.stringify(fastState(pids[stateIndex++]));
            },
            readTemporalSupervisorPlist: () => ({
              Label: 'ai.opl.family-runtime.temporal-service',
              ProgramArguments: ['/runtime/bin/temporal', 'server', 'start-dev', '--db-filename', databasePath],
              RunAtLoad: true,
              KeepAlive: true,
            }),
            inspectTemporalSqlite: () => ({
              path: databasePath,
              exists: true,
              size_bytes: 4096,
              file_identity: '1:42',
              sqlite_header_valid: true,
            }),
            terminateTemporalSupervisorPid: (pid: number) => {
              terminated.push(pid);
              return { pid, signal: 'SIGTERM', status: 'sent' };
            },
            runTemporalSupervisorLaunchctl: (args: string[]) => {
              launchctlCalls.push(args);
              if (args[0] === 'print') {
                return { args, status: 1, signal: null, stdout: '', stderr: 'Could not find service' };
              }
              return { args, status: 0, signal: null, stdout: '', stderr: '' };
            },
            sleep: async () => {},
          },
        },
        null
      );

      expect(proof).toMatchObject({
        schema: 'opl_temporal_service_supervisor_proof.v1',
        status: 'passed',
        applicable: true,
        required: true,
        supervisor_label: 'ai.opl.family-runtime.temporal-service',
        initial_readback: { supervisor: { pid: 4101, ready: true } },
        keep_alive_recovery: { readback: { supervisor: { pid: 4102, ready: true } } },
        restart_readback: { supervisor: { pid: 4103, ready: true } },
        session_reload: { readback: { supervisor: { pid: 4104, ready: true } } },
        persistent_database: {
          path: databasePath,
          sqlite_header_valid: true,
          same_file_after_keep_alive_recovery: true,
          same_file_after_restart: true,
          same_file_after_session_reload: true,
        },
      });
      expect(terminated).toEqual([4101]);
      expect(launchctlCalls[0]).toEqual(['bootout', `gui/${process.getuid()}/ai.opl.family-runtime.temporal-service`]);
      expect(launchctlCalls[1]).toEqual(['print', `gui/${process.getuid()}/ai.opl.family-runtime.temporal-service`]);
      expect(launchctlCalls[2]).toEqual(['bootstrap', `gui/${process.getuid()}`, plistPath]);
      expect(calls.filter((args) => args[1] === 'action').map((args) => args[4])).toEqual([
        'provider_service_start',
        'provider_service_restart',
      ]);
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'temporal-service-supervisor-proof.json'), 'utf8'))
      ).toEqual(proof);
    } finally {
      if (previousStateDir === undefined) delete process.env.OPL_STATE_DIR;
      else process.env.OPL_STATE_DIR = previousStateDir;
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('retries transient launchd bootstrap EIO within the supervisor throttle window', async () => {
    const calls: string[][] = [];
    let elapsedMs = 0;
    let bootstrapAttempts = 0;
    const plistPath = '/tmp/ai.opl.family-runtime.temporal-service.plist';

    const result = await __test.reloadTemporalSupervisorSession(plistPath, {
      __testHooks: {
        monotonicNowMs: () => elapsedMs,
        sleep: async (milliseconds: number) => {
          elapsedMs += milliseconds;
        },
        runTemporalSupervisorLaunchctl: (args: string[]) => {
          calls.push(args);
          if (args[0] === 'print') {
            return { args, status: 1, signal: null, stdout: '', stderr: 'Could not find service' };
          }
          if (args[0] === 'bootstrap') {
            bootstrapAttempts += 1;
            return bootstrapAttempts === 1
              ? { args, status: 5, signal: null, stdout: '', stderr: 'Bootstrap failed: 5: Input/output error' }
              : { args, status: 0, signal: null, stdout: '', stderr: '' };
          }
          return { args, status: 0, signal: null, stdout: '', stderr: '' };
        },
      },
    });

    expect(bootstrapAttempts).toBe(2);
    expect(elapsedMs).toBe(500);
    expect(result.bootstrap.status).toBe(0);
    expect(result.bootstrap_attempts).toHaveLength(2);
    expect(calls.map((args) => args[0])).toEqual(['bootout', 'print', 'bootstrap', 'bootstrap']);
  });

  it('fails closed on unready Temporal start and restart action results before readback', () => {
    const lifecycle = {
      service_status: 'running',
      server_reachable: true,
      supervisor: { required: true, ready: true, error: null },
    };
    const start = {
      app_action_execution: {
        action_id: 'provider_service_start',
        dry_run: false,
        delegated_surface: 'opl family-runtime service start --provider temporal',
        result: {
          family_runtime_service: {
            action: 'start',
            start_status: 'started_supervised',
            status: lifecycle,
          },
        },
      },
    };
    const restart = {
      app_action_execution: {
        action_id: 'provider_service_restart',
        dry_run: false,
        delegated_surface: 'opl family-runtime service restart --provider temporal',
        result: {
          family_runtime_service: {
            action: 'restart',
            restart_status: 'restarted',
            ready: true,
            previous_supervisor_pid: 4102,
            supervisor_pid: 4103,
            supervisor_pid_changed: true,
            status: lifecycle,
          },
        },
      },
    };

    expect(() => __test.assertAppActionExecution(start, 'provider_service_start')).not.toThrow();
    expect(() => __test.assertAppActionExecution(restart, 'provider_service_restart')).not.toThrow();

    const startUnready = structuredClone(start);
    startUnready.app_action_execution.result.family_runtime_service.start_status = 'supervisor_unready';
    expect(() => __test.assertAppActionExecution(startUnready, 'provider_service_start')).toThrow(
      /start_status is supervisor_unready/
    );

    const startReadbackUnready = structuredClone(start);
    startReadbackUnready.app_action_execution.result.family_runtime_service.status.supervisor.ready = false;
    expect(() => __test.assertAppActionExecution(startReadbackUnready, 'provider_service_start')).toThrow(
      /status\.supervisor\.ready is not true/
    );

    const restartUnready = structuredClone(restart);
    restartUnready.app_action_execution.result.family_runtime_service.restart_status = 'restart_unready';
    restartUnready.app_action_execution.result.family_runtime_service.ready = false;
    expect(() => __test.assertAppActionExecution(restartUnready, 'provider_service_restart')).toThrow(
      /restart_status is restart_unready; ready is not true/
    );

    const restartSamePid = structuredClone(restart);
    restartSamePid.app_action_execution.result.family_runtime_service.supervisor_pid = 4102;
    restartSamePid.app_action_execution.result.family_runtime_service.supervisor_pid_changed = false;
    expect(() => __test.assertAppActionExecution(restartSamePid, 'provider_service_restart')).toThrow(
      /supervisor_pid_changed is not true; supervisor_pid did not change/
    );
  });

  it('keeps Settings smoke passed when Runtime action evidence is unavailable', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-settings-smoke-'));
    const calls: string[] = [];
    const runtimeRefreshCalls: Array<{ targetHash: string; timeoutMs: number | undefined }> = [];
    const client = {
      send: async () => ({ data: 'iVBORw0KGgo=' }),
      close: () => {
        calls.push('close');
      },
    };
    const options = {
      artifacts,
      cdpPort: 9230,
      timeoutMs: 120_000,
      codexReadinessPhaseTimeoutMs: 98_765,
      __testHooks: {
        waitForCdpPageTarget: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/test' }),
        openCdpClient: async () => client,
        captureSettingsPage: async (_client: unknown, pageTarget: { id: string; hash: string }) => ({
          id: pageTarget.id,
          hash: pageTarget.hash,
        }),
        assertMaintenanceDiagnosticsStatus: async () => ({ diagnosticsVisible: true }),
        exerciseRuntimeRefresh: async (_client: unknown, targetHash: string, timeoutMs?: number) => {
          runtimeRefreshCalls.push({ targetHash, timeoutMs });
          const aliasResolvedHash = targetHash === '#/settings/runtime' ? '#/settings/environment' : undefined;
          const resolvedHash = aliasResolvedHash ? '#/settings/environment?section=updates' : '#/runtime';
          return {
            requested_hash: targetHash,
            alias_resolved_hash: aliasResolvedHash,
            resolved_hash: resolvedHash,
            readiness: { hash: resolvedHash, state: 'ready', pageReady: true },
            refresh: {
              before_click: { buttonReady: true },
              after_click: { buttonReady: true },
            },
          };
        },
        captureRuntimeActionEvidence: async () => {
          throw new Error('No safe action routes are currently exposed.');
        },
      },
    };

    try {
      const result = await __test.runSettingsSmoke(options, null);
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'settings-smoke-summary.json'), 'utf8'));
      const blocker = JSON.parse(fs.readFileSync(path.join(artifacts, 'runtime-action-evidence-blocker.json'), 'utf8'));

      expect(result.map((page: { id: string }) => page.id)).toEqual([
        ...__test.SETTINGS_PAGE_SMOKE_TARGETS.map((target) => target.id),
        'runtime-settings-alias',
        'runtime-status',
      ]);
      expect(result.runtimeActionEvidence).toBeNull();
      expect(result.runtimeActionEvidenceBlocker).toMatchObject({
        status: 'blocked',
        blocker_kind: 'runtime_action_evidence_unavailable',
      });
      expect(summary).toMatchObject({
        surface_id: 'opl_packaged_gui_settings_smoke',
        status: 'passed',
        runtime_action_evidence: null,
        runtime_action_evidence_blocker: {
          status: 'blocked',
          blocker_kind: 'runtime_action_evidence_unavailable',
        },
      });
      expect(summary.pages.find((page: { id: string }) => page.id === 'runtime-settings-alias')).toMatchObject({
        id: 'runtime-settings-alias',
        requested_hash: '#/settings/runtime',
        resolved_hash: '#/settings/environment?section=updates',
        interactions: {
          runtimeRefresh: {
            requested_hash: '#/settings/runtime',
            alias_resolved_hash: '#/settings/environment',
            resolved_hash: '#/settings/environment?section=updates',
            readiness: { state: 'ready', pageReady: true },
            refresh: {
              before_click: { buttonReady: true },
              after_click: { buttonReady: true },
            },
          },
        },
      });
      expect(summary.pages.find((page: { id: string }) => page.id === 'runtime-status')).toMatchObject({
        id: 'runtime-status',
        requested_hash: '#/runtime',
        resolved_hash: '#/runtime',
        interactions: {
          runtimeRefresh: {
            requested_hash: '#/runtime',
            resolved_hash: '#/runtime',
            readiness: { state: 'ready', pageReady: true },
            refresh: {
              before_click: { buttonReady: true },
              after_click: { buttonReady: true },
            },
          },
        },
      });
      expect(blocker.reason).toContain('No safe action routes');
      expect(runtimeRefreshCalls).toEqual([
        { targetHash: '#/settings/runtime', timeoutMs: 98_765 },
        { targetHash: '#/runtime', timeoutMs: 98_765 },
      ]);
      expect(calls).toContain('close');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('binds the effective Runtime phase budget to both live refresh probes', () => {
    expect(__test.buildRuntimeRefreshProbePlan('#/settings/runtime', 98_765)).toEqual({
      requestedHash: '#/settings/runtime',
      mode: 'settings-maintenance-updates',
      aliasResolvedHash: '#/settings/environment',
      refreshHash: '#/settings/environment?section=updates',
      readinessTimeoutMs: 98_765,
      preClickIdleTimeoutMs: 98_765,
      postClickIdleTimeoutMs: 98_765,
    });
    expect(__test.buildRuntimeRefreshProbePlan('#/runtime', 98_765)).toEqual({
      requestedHash: '#/runtime',
      mode: 'runtime-v2',
      resolvedHashPrefixes: ['#/runtime'],
      readinessTimeoutMs: 98_765,
      preClickIdleTimeoutMs: 98_765,
      postClickIdleTimeoutMs: 98_765,
    });
  });

  it('resolves the Settings Runtime alias before using the icon-only maintenance updates refresh', async () => {
    const expressions: string[] = [];
    const client = {
      send: vi.fn(async (method: string, params?: { expression?: string }) => {
        if (method !== 'Runtime.evaluate') return {};
        const expression = params?.expression ?? '';
        expressions.push(expression);
        if (expression === 'window.location.hash') {
          return { result: { value: '#/settings/environment?section=updates' } };
        }
        if (expression.includes('aliasResolvedHash')) {
          return {
            result: {
              value: {
                requestedHash: '#/settings/runtime',
                aliasResolvedHash: '#/settings/environment',
              },
            },
          };
        }
        if (expression.includes('settings-maintenance-destination')) {
          return {
            result: {
              value: {
                hash: '#/settings/environment?section=updates',
                state: 'ready',
                pageReady: true,
                ownerSurfaceReady: true,
                destinationReady: true,
                refreshPresent: true,
                refreshVisible: true,
              },
            },
          };
        }
        if (expression.includes('buttonReady')) {
          return { result: { value: { buttonReady: true, selector: '[data-testid="opl-managed-update-refresh"]' } } };
        }
        if (expression.includes('button.click()')) {
          return { result: { value: { clicked: true, selector: '[data-testid="opl-managed-update-refresh"]' } } };
        }
        return { result: { value: true } };
      }),
    };

    const result = await __test.exerciseRuntimeRefresh(client, '#/settings/runtime', 98_765);

    expect(result).toMatchObject({
      requested_hash: '#/settings/runtime',
      alias_resolved_hash: '#/settings/environment',
      resolved_hash: '#/settings/environment?section=updates',
      readiness: {
        state: 'ready',
        pageReady: true,
        ownerSurfaceReady: true,
        destinationReady: true,
        refreshPresent: true,
        refreshVisible: true,
      },
      refresh: {
        before_click: { buttonReady: true },
        click: { clicked: true },
        after_click: { buttonReady: true },
      },
    });
    expect(expressions).toContain('window.location.hash = "#/settings/runtime"');
    expect(expressions).toContain('window.location.hash = "#/settings/environment?section=updates"');
    expect(expressions.some((expression) => expression.includes('[data-testid="settings-page-maintenance"]'))).toBe(
      true
    );
    expect(
      expressions.some((expression) =>
        expression.includes('[data-testid="settings-maintenance-destination"][data-maintenance-destination="updates"]')
      )
    ).toBe(true);
    expect(
      expressions.some((expression) => expression.includes("state: 'ready'") && expression.includes('pageReady: true'))
    ).toBe(true);
    const aliasRefreshExpressions = expressions.filter((expression) =>
      expression.includes('[data-testid="opl-managed-update-refresh"]')
    );
    expect(aliasRefreshExpressions.length).toBeGreaterThanOrEqual(3);
    expect(aliasRefreshExpressions.every((expression) => !expression.includes('Refresh|刷新'))).toBe(true);
  });

  it('keeps standalone Runtime refresh on the runtime-v2 page and text-labelled button', async () => {
    const expressions: string[] = [];
    const client = {
      send: vi.fn(async (method: string, params?: { expression?: string }) => {
        if (method !== 'Runtime.evaluate') return {};
        const expression = params?.expression ?? '';
        expressions.push(expression);
        if (expression === 'window.location.hash') return { result: { value: '#/runtime' } };
        if (expression.includes('runtime-v2-page')) {
          return { result: { value: { hash: '#/runtime', state: 'ready', pageReady: true } } };
        }
        if (expression.includes('buttonReady')) return { result: { value: { buttonReady: true } } };
        return { result: { value: true } };
      }),
    };

    const result = await __test.exerciseRuntimeRefresh(client, '#/runtime', 98_765);

    expect(result).toMatchObject({
      requested_hash: '#/runtime',
      resolved_hash: '#/runtime',
      readiness: { state: 'ready', pageReady: true },
    });
    expect(result).not.toHaveProperty('alias_resolved_hash');
    expect(expressions.some((expression) => expression.includes('[data-testid="runtime-v2-page"]'))).toBe(true);
    expect(expressions.some((expression) => expression.includes('[data-testid="runtime-refresh-button"]'))).toBe(true);
    expect(expressions.some((expression) => expression.includes('Refresh|刷新'))).toBe(true);
  });

  it('keeps the Runtime refresh helper bounded to 30 seconds by default', async () => {
    vi.useFakeTimers();
    const client = {
      send: vi.fn(async (method: string) => (method === 'Runtime.evaluate' ? { result: { value: false } } : {})),
    };
    const operation = __test.exerciseRuntimeRefresh(client, '#/settings/runtime');
    let settled = false;
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );

    try {
      await vi.advanceTimersByTimeAsync(__test.DEFAULT_RUNTIME_REFRESH_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(operation).rejects.toThrow(
        'Settings Runtime alias did not resolve before maintenance refresh: #/settings/runtime'
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes a fail-closed assistant route summary when packaged UI controls are missing', () => {
    const error = new Error('Assistant route controls did not become ready for mas') as Error & {
      lastState?: unknown;
      lastError?: string | null;
    };
    error.lastState = {
      status: 'failed',
      reason: 'home_composer_contract_mismatch',
      missing_controls: ['model_reasoning'],
      composer_state: {
        executor: 'codex',
        active_shortcut_id: 'research',
        model_reasoning_visible: false,
        permission_access_visible: true,
        executor_selector_visible: false,
      },
    };
    error.lastError = null;

    expect(
      __test.buildAssistantRouteSmokeFailureSummary(
        { cdpPort: 9230, runtimeProfile: 'standard' },
        {
          id: 'mas',
          badge: '@科研',
          shortName: 'MAS',
          shortcutId: 'research',
          codexVisibleEntry: 'med-autoscience',
          requiredSkillIds: ['med-autoscience'],
        },
        [],
        error
      )
    ).toEqual({
      surface_id: 'opl_packaged_gui_assistant_route_smoke',
      status: 'failed',
      cdp_port: 9230,
      runtime_profile: 'standard',
      verification_mode: 'state_aware_launch_admission',
      failed_assistant: 'mas',
      assistants: [],
      compiled_expectations: null,
      error: 'Assistant route controls did not become ready for mas',
      last_state: {
        status: 'failed',
        reason: 'home_composer_contract_mismatch',
        missing_controls: ['model_reasoning'],
        composer_state: {
          executor: 'codex',
          active_shortcut_id: 'research',
          model_reasoning_visible: false,
          permission_access_visible: true,
          executor_selector_visible: false,
        },
      },
      last_error: null,
      missing_controls: ['model_reasoning'],
      composer_state: {
        executor: 'codex',
        active_shortcut_id: 'research',
        model_reasoning_visible: false,
        permission_access_visible: true,
        executor_selector_visible: false,
      },
      required_contract: {
        purpose_entries: ['home-starter-mas', 'home-starter-mag', 'home-starter-rca'],
        standard_launch_admission: {
          visible: true,
          selectable_before_selection: true,
          projection_states: ['available', 'unavailable'],
          available: {
            launch_allowed: true,
            send_attempted: false,
          },
          unavailable: {
            launch_allowed: false,
            send_blocked: true,
            readiness_hint: 'repair',
          },
          route_receipt_claimed: false,
        },
        decision_controls_visible: null,
        executor_selectors_hidden: ['agent-pill-*'],
        route_receipt: null,
      },
    });
  });

  it('summarizes live system initialize readiness as the first-run proof source', () => {
    const summary = __test.summarizeCoreFirstLaunch(
      JSON.stringify({
        system_initialize: {
          setup_flow: {
            ready_to_launch: true,
            blocking_items: [],
          },
          readiness: {
            launch_ready: true,
            core_ready: true,
          },
        },
      })
    );

    expect(summary).toEqual({
      source: 'opl system initialize --json',
      status: 'ready',
      ready_to_launch: true,
      blocking_items: [],
      readiness: {
        launch_ready: true,
        core_ready: true,
      },
    });
  });

  it('allows deferred Full readiness blockers after Core launch is ready', () => {
    const summary = __test.summarizeCoreFirstLaunch(
      JSON.stringify({
        system_initialize: {
          setup_flow: {
            blocking_items: ['domain_modules', 'family_runtime_provider', 'recommended_skills'],
          },
          readiness: {
            launch_ready: true,
            core_ready: true,
            domain_ready: true,
          },
        },
      })
    );

    expect(summary.status).toBe('ready');
    expect(summary.blocking_items).toEqual(['domain_modules', 'family_runtime_provider', 'recommended_skills']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

describe('packaged first-run VM smoke helpers', () => {
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
    expect(expression).not.toContain("window.location.hash = '#/guid'");
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
        __testHooks: {
          runOplJson: (args: string[], options: Record<string, unknown>) => {
            calls.push({ args, options });
            return JSON.stringify({ status: 'configured', provider_base_url: 'https://gflabtoken.cn/v1' });
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
      result: {
        status: 'configured',
        provider_base_url: 'https://gflabtoken.cn/v1',
      },
    });
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

      expect(() =>
        __test.verifyGatekeeperLaunchPolicy('/tmp/One Person Lab.app', artifacts, { spawnSync })
      ).not.toThrow();
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
      '#/settings/advanced',
      '#/settings/about',
    ]);
    expect(targetHashes).not.toContain('#/settings/overview');
    expect(targetHashes).not.toContain('#/settings/runtime');
    expect(targetHashes).not.toContain('#/settings/model');
    expect(targetHashes).not.toContain('#/settings/agent');
    expect(targetHashes).not.toContain('#/settings/display');
    expect(targetHashes).not.toContain('#/settings/webui');
  });

  it('treats Advanced settings as a secondary smoke target', () => {
    const advancedTarget = __test.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'advanced');
    const generalTarget = __test.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'general');

    expect(advancedTarget).toBeTruthy();
    expect(generalTarget).toBeTruthy();
    if (!advancedTarget || !generalTarget) throw new Error('Expected Settings smoke targets are missing.');

    expect(advancedTarget).toMatchObject({ navigation: 'secondary' });
    expect(__test.pageReadinessExpression(advancedTarget)).toContain('const navPresent = true;');
    expect(__test.pageReadinessExpression(generalTarget)).toContain(
      '.settings-sider__item[data-settings-id="general"]'
    );
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
        badge: '@科研',
        shortName: 'MAS',
        shortcutId: 'research',
        codexVisibleEntry: 'med-autoscience',
        requiredSkillIds: ['med-autoscience'],
      },
      {
        id: 'mag',
        badge: '@基金',
        shortName: 'MAG',
        shortcutId: 'grant',
        codexVisibleEntry: 'med-autogrant',
        requiredSkillIds: ['med-autogrant'],
      },
      {
        id: 'rca',
        badge: '@演示',
        shortName: 'RCA',
        shortcutId: 'ppt',
        codexVisibleEntry: 'redcube-ai',
        requiredSkillIds: ['redcube-ai'],
      },
    ]);
  });

  it('checks packaged assistant routes through workspace-scoped Guid sends and GET readback', () => {
    const masTarget = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    const workspaceExpression = __test.homeAssistantWorkspacePreparationExpression('/Users/opl/OPL-Smoke');
    const selectionExpression = __test.homeAssistantRouteSelectionExpression(masTarget);
    const readyExpression = __test.homeAssistantRouteReadyExpression(masTarget);
    const sendExpression = __test.homeAssistantRouteSendExpression(masTarget, 'Verify MAS launch.');
    const receiptExpression = __test.latestConversationRouteReceiptExpression(masTarget);
    const receiptByIdExpression = __test.conversationRouteReceiptExpression(masTarget, 'conv-123');
    const activeReceiptExpression = __test.activeConversationRouteReceiptExpression(masTarget, '/Users/opl/OPL-Smoke');

    expect(__test.FULL_ASSISTANT_READINESS_TIMEOUT_MS).toBe(180_000);
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
    expect(readyExpression).toContain('guid-active-capability');
    expect(readyExpression).toContain("getAttribute('aria-pressed') !== 'true'");
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
    expect(sendExpression).toContain("interaction_path: 'guid_ui_send'");
    expect(sendExpression).not.toContain("method: 'POST'");
    expect(receiptExpression).toContain('/api/conversations?limit=10');
    expect(receiptByIdExpression).toContain('expectedConversationId = "conv-123"');
    expect(activeReceiptExpression).toContain('window.location.hash.match(/^#\\/conversation\\/');
    expect(activeReceiptExpression).toContain('/api/conversations/');
    expect(activeReceiptExpression).toContain('opl_agent_package_activation');
    expect(activeReceiptExpression).toContain('activation_use_boundary_id');
    expect(activeReceiptExpression).toContain('activation_use_receipt_ref');
    expect(activeReceiptExpression).toContain('activation_use_binding');
    expect(activeReceiptExpression).toContain('use_binding_target_root');
    expect(activeReceiptExpression).toContain('matched.extra?.is_temporary_workspace !== false');
    expect(activeReceiptExpression).toContain('conversation_temporary_workspace');
    expect(activeReceiptExpression).not.toContain('conversation_custom_workspace');
    expect(activeReceiptExpression).not.toContain("method: 'POST'");
    expect(receiptExpression).toContain('opl_agent_package_invocation');
    expect(receiptExpression).toContain('opl_assistant_route');
    expect(receiptExpression).toContain('agent_package_shortcut');
    expect(receiptExpression).toContain('builtin_capability');
    expect(receiptExpression).toContain('codex_cli');
    expect(receiptExpression).toContain('opl_app_home');
    expect(receiptExpression).toContain('package_id');
    expect(receiptExpression).toContain('shortcut_id');
    expect(receiptExpression).toContain('codex_visible_entry');
    expect(receiptExpression).toContain("matched.type !== 'acp'");
    expect(receiptExpression).toContain("matched.extra?.backend !== 'codex'");
  });

  it('checks Standard Home assistants as visible blocked launch gates without creating route receipts', () => {
    const masTarget = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    const expression = __test.homeAssistantBlockedReadinessExpression(masTarget);

    expect(expression).toContain('home-starter-mas');
    expect(expression).toContain('home-starter-research');
    expect(expression).toContain("getAttribute('disabled')");
    expect(expression).toContain("getAttribute('title')");
    expect(expression).toContain("includes('repair')");
    expect(expression).toContain('launch_allowed: false');
    expect(expression).not.toContain('/api/conversations');
  });

  it('builds a deterministic Codex functional check receipt without requiring LLM credentials', () => {
    const receipt = __test.buildCodexFunctionalCheckReceipt({
      codexApiKey: null,
      codexCliProbe: { detected: false, command: 'codex', version: null },
      assistantRouteSmoke: [{ id: 'mas' }, { id: 'mag' }, { id: 'rca' }],
    });

    expect(receipt).toMatchObject({
      schema: 'opl_codex_functional_check_receipt.v1',
      status: 'diagnostic_skipped',
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
        deterministic_fields_passed: true,
        llm_invocation_required: false,
      },
      future_codex_invocation: {
        status: 'diagnostic_skipped',
        reason: 'missing_codex_credentials',
      },
    });
  });

  it('records Standard launch gates without claiming Full assistant route receipts', () => {
    const assistantRouteSmoke = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => ({
      id: target.id,
      verification_mode: 'launch_gate',
      launch_gate: { disabled: true, launch_allowed: false },
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
      assistant_launch_gates_checked: {
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
                return JSON.stringify({
                  app_action_execution: {
                    action_id: actionId,
                    dry_run: false,
                    delegated_surface: `opl family-runtime service ${actionId === 'provider_service_start' ? 'start' : 'restart'} --provider temporal`,
                    result: { status: 'ready' },
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
      expect(launchctlCalls[1]).toEqual(['bootstrap', `gui/${process.getuid()}`, plistPath]);
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

  it('keeps Settings smoke passed when Runtime action evidence is unavailable', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-settings-smoke-'));
    const calls: string[] = [];
    const client = {
      send: async () => ({ data: 'iVBORw0KGgo=' }),
      close: () => {
        calls.push('close');
      },
    };
    const options = {
      artifacts,
      cdpPort: 9230,
      timeoutMs: 1_000,
      __testHooks: {
        waitForCdpPageTarget: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/test' }),
        openCdpClient: async () => client,
        captureSettingsPage: async (_client: unknown, pageTarget: { id: string }) => ({ id: pageTarget.id }),
        exerciseRuntimeRefresh: async (_client: unknown, targetHash: string) => ({ targetHash }),
        assertAdvancedPathsStatus: async () => ({ status: 'ready' }),
        captureRuntimeActionEvidence: async () => {
          throw new Error('No safe action routes are currently exposed.');
        },
      },
    };

    try {
      const result = await __test.runSettingsSmoke(options, null);
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'settings-smoke-summary.json'), 'utf8'));
      const blocker = JSON.parse(fs.readFileSync(path.join(artifacts, 'runtime-action-evidence-blocker.json'), 'utf8'));

      expect(result.map((page: { id: string }) => page.id)).toContain('runtime-status');
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
      expect(blocker.reason).toContain('No safe action routes');
      expect(calls).toContain('close');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
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
      verification_mode: 'launch_gate',
      failed_assistant: 'mas',
      assistants: [],
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
        standard_launch_gate: {
          visible: true,
          disabled: true,
          launch_allowed: false,
          readiness_hint: 'repair',
        },
        decision_controls_visible: null,
        executor_selectors_hidden: ['agent-pill-*'],
        route_receipt: null,
      },
    });
  });

  it('checks the read-only Advanced path status without restoring deferred developer controls', () => {
    const expression = __test.advancedPathsStatusExpression();

    expect(expression).toContain('[data-testid="settings-advanced-primary"]');
    expect(expression).toContain('高级路径');
    expect(expression).toContain('工作目录');
    expect(expression).toContain('日志目录');
    expect(expression).toContain('developerProfileHidden');
    expect(expression).not.toContain('opl-developer-mode-switch');
    expect(expression).not.toContain('.click()');
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

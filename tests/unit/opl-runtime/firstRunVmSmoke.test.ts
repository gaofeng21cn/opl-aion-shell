import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
const { __test } = await import('../../../scripts/opl-first-run-vm-smoke.mjs');

const assistantTargets = [
  {
    id: 'med-autoscience',
    badge: '@科研',
    shortName: 'MAS',
    shortcutId: 'research',
    codexVisibleEntry: 'mas',
    requiredSkillIds: ['mas'],
  },
  {
    id: 'med-autogrant',
    badge: '@基金',
    shortName: 'MAG',
    shortcutId: 'grant',
    codexVisibleEntry: 'mag',
    requiredSkillIds: ['mag'],
  },
  {
    id: 'redcube-ai',
    badge: '@演示',
    shortName: 'RCA',
    shortcutId: 'ppt',
    codexVisibleEntry: 'rca',
    requiredSkillIds: ['rca'],
  },
];

function tempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string, mode?: number) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  if (mode) fs.chmodSync(filePath, mode);
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function containsAll(text: string, snippets: string[]) {
  for (const snippet of snippets) expect(text).toContain(snippet);
}

function containsNone(text: string, snippets: string[]) {
  for (const snippet of snippets) expect(text).not.toContain(snippet);
}

function expectBooleanCases(cases: Array<[unknown, boolean]>, predicate: (input: unknown) => boolean) {
  for (const [input, expected] of cases) expect(predicate(input)).toBe(expected);
}

describe('packaged first-run VM smoke helpers', () => {
  it('builds launch args and sanitized packaged-app environments', () => {
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

    const pollutedEnv = {
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
    };
    const baseEnv = __test.buildPackagedAppLaunchBaseEnv(pollutedEnv);
    expect(baseEnv).toMatchObject({
      HOME: '/Users/admin',
      USER: 'admin',
      PATH: '/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      LC_CTYPE: 'UTF-8',
      AIONUI_CDP_PORT: '0',
    });
    containsNone(JSON.stringify(baseEnv), [
      'AIONUI_MULTI_INSTANCE',
      'ELECTRON_RUN_AS_NODE',
      'ELECTRON_RENDERER_URL',
      'NODE_OPTIONS',
      'GITHUB_ACTIONS',
      'OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL',
    ]);

    const launchEnv = __test.buildLaunchAppEnv(
      {
        cdpPort: 9239,
        codexPackageTarball: '/tmp/codex.tgz',
        codexPlatformPackageTarball: '/tmp/platform.tgz',
        codexNpmCacheDir: '/tmp/npm-cache',
      },
      pollutedEnv
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
    expect(__test.launchEnvDiagnostics({ ...launchEnv })).toMatchObject({
      AIONUI_CDP_PORT: '9239',
      OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: true,
      OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: true,
      OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: true,
      NPM_CONFIG_CACHE: true,
      blocked_keys_present: [],
    });
  });

  it('parses process rows and native launch diagnostics without grep/self noise', () => {
    const rows = __test.parseProcessRows(
      [
        '  PID  PPID ARGS',
        ' 1234     1 /Applications/One Person Lab.app/Contents/MacOS/One Person Lab --aionui-cdp-port=9230',
        ' 2234  1234 /Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper.app/Contents/MacOS/One Person Lab Helper --type=renderer',
        ' 3234  1234 /Applications/One Person Lab.app/Contents/Frameworks/One Person Lab Helper (GPU).app/Contents/MacOS/One Person Lab Helper (GPU) --type=gpu-process',
        ' 3333     1 /usr/bin/grep grep One Person Lab',
        ' 4333     1 /tmp/node /tmp/opl-first-run-vm-smoke.mjs --process-name One Person Lab',
      ].join('\n'),
      'One Person Lab'
    );
    expect(rows.map((row: { pid: number }) => row.pid)).toEqual([1234, 2234, 3234]);

    const summary = __test.summarizeNativeWindowDiagnostics({
      schema: 'opl_packaged_gui_native_window_diagnostics.v1',
      osascript: { status: 0 },
      result: {
        schema: 'opl_packaged_gui_native_window_snapshot.v1',
        target_process: { found: true, windows: [{ index: 0, nodes: [] }], top_level_ui_elements: [{ index: 0, nodes: [] }] },
        frontmost_processes: [
          { name: 'One Person Lab', frontmost: 'true', visible: 'true', window_count: 1, window_titles: ['Error'] },
        ],
        likely_alert_nodes: [
          { role: 'AXStaticText', subrole: null, text: 'A JavaScript error occurred in the main process', depth: 1 },
          { role: 'AXButton', subrole: null, text: 'OK', depth: 1 },
        ],
      },
    });
    expect(summary).toMatchObject({
      status: 'passed',
      target_process_found: true,
      likely_alert_text: [
        { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
        { source: 'accessibility_likely_alert', text: 'OK' },
      ],
      window_title_text: [{ source: 'frontmost_window_title', text: 'Error' }],
    });
  });

  it('collects launch stderr and renderer bootstrap diagnostics when startup surfaces are absent', async () => {
    const artifacts = tempDir('opl-renderer-bootstrap-diagnostics-');
    try {
      const launchLogDir = path.join(artifacts, 'launch-app');
      writeFile(
        path.join(launchLogDir, 'stderr.log'),
        [
          "[AionUi:bootstrap] bootstrapImportFailure: Error: Cannot find module 'react'",
          'Require stack:',
          '- /Applications/One Person Lab.app/Contents/Resources/app.asar/node_modules/@office-ai/platform/dist/index.js',
        ].join('\n')
      );
      expect(__test.collectLaunchLogText(launchLogDir)).toEqual([
        expect.objectContaining({ source: 'launch_stderr', text: expect.stringContaining("Cannot find module 'react'") }),
      ]);

      const sent: Array<{ method: string; params: unknown }> = [];
      const client = {
        send: (method: string, params: unknown) => {
          sent.push({ method, params });
          return Promise.resolve(
            method === 'Runtime.evaluate'
              ? {
                  result: {
                    value: {
                      schema: 'opl_renderer_bootstrap_diagnostics.v1',
                      readyState: 'complete',
                      bodyTextSample: 'blank shell',
                      selectorState: { 'opl-startup-preflight': { present: false } },
                    },
                  },
                }
              : {}
          );
        },
      };
      const diagnostics = await __test.collectRendererBootstrapDiagnostics(
        client,
        { id: 'page-1', type: 'page', title: 'index.html', url: 'file:///Applications/One%20Person%20Lab.app/index.html' },
        [{ source: 'Runtime.consoleAPICalled', type: 'error', text: 'renderer failed' }],
        { artifacts },
        null,
        new Error('OPL startup did not expose a preflight, first-run, or Guid surface')
      );
      expect(sent[0]?.method).toBe('Runtime.evaluate');
      expect(diagnostics).toMatchObject({
        schema: 'opl_renderer_bootstrap_diagnostics_bundle.v1',
        status: 'failed',
        cdp_target: { id: 'page-1' },
        snapshot: { bodyTextSample: 'blank shell' },
      });
      expect(readJson(path.join(artifacts, 'renderer-bootstrap-diagnostics.json'))).toMatchObject({
        snapshot: { selectorState: { 'opl-startup-preflight': { present: false } } },
      });
      containsAll(__test.rendererBootstrapDiagnosticsExpression(), ['opl-startup-preflight', 'localStorageKeys']);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('resolves .app executables and stale app termination policy', () => {
    const root = tempDir('opl-app-executable-');
    const previous = process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP;
    try {
      const appPath = path.join(root, 'One Person Lab.app');
      const executablePath = path.join(appPath, 'Contents', 'MacOS', 'One Person Lab');
      writeFile(
        path.join(appPath, 'Contents', 'Info.plist'),
        ['<plist version="1.0">', '<dict>', '<key>CFBundleExecutable</key>', '<string>One Person Lab</string>', '</dict>', '</plist>'].join('\n')
      );
      writeFile(executablePath, '#!/bin/sh\n', 0o755);
      expect(__test.parseCfBundleExecutableFromPlistText(fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'), 'utf8'))).toBe(
        'One Person Lab'
      );
      expect(__test.resolveAppExecutablePath(appPath)).toBe(executablePath);

      delete process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP;
      expect(__test.shouldTerminateExistingApp()).toBe(true);
      process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP = '1';
      expect(__test.shouldTerminateExistingApp()).toBe(false);
      process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP = '0';
      expect(__test.shouldTerminateExistingApp()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP;
      else process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('bounds first-run events, CDP probes, fallback waits, and host deadlines', () => {
    expect(__test.eventTimestampMs({ timestamp: '2026-05-27T07:00:01.000Z' })).toBe(Date.parse('2026-05-27T07:00:01.000Z'));
    expect(__test.eventTimestampMs({ timestamp: 'not-a-date' })).toBe(0);
    expect(__test.isFirstRunCompletionEvent({ event_type: 'gui_preparation_skipped', payload: { status: 'already-prepared' } })).toBe(true);
    expect(__test.isFirstRunCompletionEvent({ event_type: 'gui_preparation_skipped', payload: { status: 'blocked' } })).toBe(false);

    expectBooleanCases(
      [
        [{ assertClean: false, requireCodexConfigWizard: false }, true],
        [{ assertClean: true, requireCodexConfigWizard: false }, false],
        [{ assertClean: false, requireCodexConfigWizard: true }, false],
      ],
      __test.shouldProbeExistingGuidEntryBeforeFirstRun
    );
    expect(__test.existingStateGuidProbeTimeoutMs({ timeoutMs: 240_000 })).toBe(30_000);
    expect(__test.cdpProbeTimeoutMs({ timeoutMs: 5_000 })).toBe(5_000);
    expect(__test.remainingGuidFallbackTimeoutMs(180_000, 30_000)).toBe(150_000);
    expect(__test.boundTimeoutToHostDeadline(900_000, 1_300_000, 'wait_guid_entry', 1_000_000)).toBe(
      300_000 - __test.HOST_DEADLINE_SAFETY_MARGIN_MS
    );
    expect(() => __test.boundTimeoutToHostDeadline(900_000, 1_001_000, 'wait_guid_entry', 1_000_000)).toThrow(
      /host SSH deadline safety margin/
    );
  });

  it('writes JSONL smoke events without leaking secrets', () => {
    const artifacts = tempDir('opl-smoke-events-');
    try {
      const writeSmokeEvent = __test.createSmokeEventWriter(artifacts, 'sk-test-secret');
      writeSmokeEvent('wait_guid_cdp', 'started', { cdp_port: 9230 });
      writeSmokeEvent('wait_guid_cdp', 'passed', { duration_ms: 12 });
      const lines = fs.readFileSync(path.join(artifacts, 'smoke-events.jsonl'), 'utf8').trim().split(/\r?\n/);
      expect(lines.map((line) => JSON.parse(line))).toEqual([
        expect.objectContaining({ phase: 'wait_guid_cdp', status: 'started', cdp_port: 9230 }),
        expect.objectContaining({ phase: 'wait_guid_cdp', status: 'passed', duration_ms: 12 }),
      ]);
      expect(() => writeSmokeEvent('summary', 'failed', { error: 'sk-test-secret' })).toThrow(/Codex API key/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('keeps first-run and Guid DOM readiness expressions aligned to App-owned entry points', () => {
    containsAll(__test.guidEntryReadinessExpression(), [
      '[data-testid="opl-guid-entry"]',
      '[data-testid="guid-input"]',
      "window.location.hash.startsWith('#/guid')",
      '[data-testid="opl-first-run-window"]',
      '["med-autoscience","med-autogrant","redcube-ai"]',
      "entryKind: 'assistant_home'",
    ]);
    const navigationExpression = __test.guidEntryNavigationExpression();
    containsAll(navigationExpression, [
      '[aria-label="opl-first-run-ready-entry"]',
      'readyButton.click()',
      "navigatedBy: 'ready_entry'",
      "navigatedBy: 'usable_assistant_home'",
      'preset-pill-${assistantId}',
    ]);
    expect(navigationExpression).not.toContain("window.location.hash = '#/guid'");
    containsAll(__test.firstRunBeginnerUxExpression(), [
      '[data-testid="opl-first-run-window"]',
      '[data-testid="opl-first-run-progress"]',
      '[data-testid="opl-first-run-beginner-primary"]',
      '[data-testid="opl-first-run-technical-details-toggle"]',
      'technicalDetailsCollapsed',
      'settings\\.firstRun\\.stage',
      'full_readiness',
      'action_command_ref',
      'runtime command failed',
      "status: 'skipped_by_usable_entry'",
      'usable_assistant_home_reached_before_beginner_capture',
    ]);
    containsAll(__test.startupPreflightExpression(), [
      '[data-testid="opl-startup-preflight"]',
      'Starting One Person Lab',
      '正在启动 One Person Lab',
      'Desktop session',
      'App configuration',
      '[data-testid="opl-guid-entry"]',
    ]);
  });

  it('checks clean first-run, core readiness, and Codex API-key configuration gates', () => {
    expectBooleanCases(
      [
        [{ assertClean: true, requireCodexConfigWizard: false }, true],
        [{ assertClean: false, requireCodexConfigWizard: true }, true],
        [{ assertClean: false, requireCodexConfigWizard: false }, false],
      ],
      __test.shouldCheckFirstRunBeginnerUx
    );
    expectBooleanCases(
      [
        [{ runtimeProfile: 'standard', codexApiKeyFile: '/tmp/codex-api-key', requireCodexConfigWizard: false }, true],
        [{ runtimeProfile: 'standard', codexApiKeyFile: null, requireCodexConfigWizard: false }, false],
        [{ runtimeProfile: 'full', codexApiKeyFile: '/tmp/codex-api-key', requireCodexConfigWizard: false }, true],
        [{ runtimeProfile: 'standard', codexApiKeyFile: null, requireCodexConfigWizard: true }, true],
        [
          {
            runtimeProfile: 'standard',
            codexApiKeyFile: '/tmp/codex-api-key',
            bootstrapLaunchDiagnostics: true,
            requireCodexConfigWizard: false,
          },
          false,
        ],
      ],
      __test.shouldWaitForCoreFirstLaunchReady
    );

    const calls: Array<{ args: string[]; options: Record<string, unknown> }> = [];
    expect(
      __test.configureCodexApiKeyForSmoke(
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
      )
    ).toMatchObject({ status: 'configured', command: 'opl system configure-codex --api-key-stdin --json' });
    expect(calls[0]).toMatchObject({
      args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
      options: { input: 'sk-test-secret\n' },
    });
    expect(
      __test.configureCodexApiKeyForSmoke({ __testHooks: { runOplJson: () => null } }, null)
    ).toEqual({ status: 'skipped', reason: 'missing_codex_api_key' });
  });

  it('captures Full release screenshots only for clean Full gates', async () => {
    const artifacts = tempDir('opl-smoke-full-screenshot-');
    const options = { artifacts, assertClean: true, requireCodexConfigWizard: false, runtimeProfile: 'full' };
    const client = { send: vi.fn().mockResolvedValue({ data: Buffer.from('current-guid-page').toString('base64') }) };
    try {
      expect(__test.RELEASE_EVIDENCE_SCREENSHOTS).toEqual({
        full: path.join('screenshots', 'full.png'),
        action: path.join('screenshots', 'action.png'),
      });
      expectBooleanCases(
        [
          [{ assertClean: true, requireCodexConfigWizard: false, runtimeProfile: 'full' }, true],
          [{ assertClean: true, requireCodexConfigWizard: false, runtimeProfile: 'standard' }, false],
          [{ assertClean: false, requireCodexConfigWizard: false, runtimeProfile: 'full' }, false],
        ],
        __test.shouldCaptureFullReleaseScreenshot
      );
      const target = path.join(artifacts, 'screenshots', 'full.png');
      expect(await __test.captureFullReleaseScreenshotEvidence(options, client)).toEqual({
        status: 'captured',
        target,
        source: 'cdp_current_page',
      });
      expect(fs.readFileSync(target, 'utf8')).toBe('current-guid-page');
      writeFile(path.join(artifacts, 'first-run-beginner.png'), 'beginner-page');
      expect(await __test.captureFullReleaseScreenshotEvidence(options, client, path.join(artifacts, 'first-run-beginner.png'))).toEqual({
        status: 'already_present',
        target,
      });
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('records unsigned Gatekeeper diagnostics without requiring signed local builds', () => {
    for (const [name, spawnSync, expected] of [
      [
        'spctl-rejected',
        (command: string) =>
          command === 'codesign'
            ? { status: 0, stdout: '', stderr: '' }
            : { status: 3, stdout: '', stderr: '/tmp/One Person Lab.app: rejected\n' },
        { local_authorization_status: 'rejected_allowed_unsigned', codesign: { status: 0 }, spctl: { status: 3 } },
      ],
      [
        'codesign-failed',
        (command: string) =>
          command === 'codesign'
            ? { status: 1, stdout: '', stderr: 'codesign-failed\n' }
            : { status: 0, stdout: '', stderr: '' },
        { local_authorization_status: 'failed_allowed_unsigned', codesign: { status: 1 }, spctl: { status: 0 } },
      ],
    ] as const) {
      const artifacts = tempDir(`opl-smoke-local-authorization-${name}-`);
      try {
        expect(() => __test.verifyGatekeeperLaunchPolicy('/tmp/One Person Lab.app', artifacts, { spawnSync })).not.toThrow();
        expect(readJson(path.join(artifacts, 'gatekeeper-launch-policy.json'))).toMatchObject({
          schema: 'opl_gatekeeper_launch_policy.v1',
          gatekeeper_required: false,
          quarantine_removal_required: true,
          ...expected,
        });
      } finally {
        fs.rmSync(artifacts, { recursive: true, force: true });
      }
    }
  });

  it('detects usable entries through accessibility labels without folded technical actions', () => {
    const labels = __test.firstRunAccessibilityExpectedLabels();
    containsAll(labels.join('\n'), [
      'opl-first-run-ready-entry',
      'opl-first-run-beginner-summary',
      'opl-first-run-primary-action',
      'opl-first-run-technical-details-toggle',
      'opl-guid-entry',
      '@科研',
      '@基金',
      '@演示',
    ]);
    containsNone(labels.join('\n'), [
      'opl-first-run-background-maintenance-secondary',
      'opl-first-run-install-button',
      'opl-first-run-open-environment-button',
      'opl-first-run-open-modules-button',
      'opl-first-run-retry-button',
    ]);
    expect(__test.detectUsableEntryAccessibility([{ name: 'opl-guid-entry' }])).toEqual({
      entryKind: 'guid',
      labels: ['opl-guid-entry'],
    });
    expect(__test.detectUsableEntryAccessibility([{ title: '@MAS' }, { name: 'MAG' }, { description: 'Run @RCA task' }])).toMatchObject({
      entryKind: 'assistant_home',
      matchedLabels: ['@MAS', 'MAG', '@RCA'],
    });
    expect(__test.detectUsableEntryAccessibility([{ title: '@MAS' }, { name: '@MAG' }])).toBeNull();
  });

  it('smokes current App-owned Settings routes and secondary Advanced navigation', () => {
    const targets = __test.SETTINGS_PAGE_SMOKE_TARGETS;
    expect(targets.map((target: { hash: string }) => target.hash)).toEqual([
      '#/settings/general',
      '#/settings/environment',
      '#/settings/capabilities',
      '#/settings/access',
      '#/settings/appearance',
      '#/settings/advanced',
      '#/settings/about',
    ]);
    containsNone(targets.map((target: { hash: string }) => target.hash).join('\n'), [
      '#/settings/overview',
      '#/settings/runtime',
      '#/settings/model',
      '#/settings/agent',
      '#/settings/display',
      '#/settings/webui',
    ]);
    const advancedTarget = targets.find((target: { id: string }) => target.id === 'advanced');
    const generalTarget = targets.find((target: { id: string }) => target.id === 'general');
    expect(advancedTarget).toMatchObject({ navigation: 'secondary' });
    expect(__test.pageReadinessExpression(advancedTarget)).toContain('const navPresent = true;');
    expect(__test.pageReadinessExpression(generalTarget)).toContain('.settings-sider__item[data-settings-id="general"]');
  });

  it('checks assistant route targets and receipt-only Codex ACP conversations', () => {
    const options = __test.parseArgs([
      '--app',
      '/Applications/One Person Lab.app',
      '--assistant-route-smoke',
      '--runtime-profile',
      'standard',
    ]);
    expect(options.assistantRouteSmoke).toBe(true);
    expect(__test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS).toEqual(assistantTargets);

    const masTarget = __test.OPL_ASSISTANT_ROUTE_SMOKE_TARGETS[0];
    containsAll(__test.homeAssistantRouteSelectionExpression(masTarget), ['preset-pill-med-autoscience']);
    containsAll(__test.homeAssistantRouteReadyExpression(masTarget), [
      '@科研',
      '@MAS',
      'agent-mode-selector',
      'aionrs-model-selector',
      'acp-model-selector',
      'sendbox-model',
    ]);
    const createExpression = __test.createAssistantRouteReceiptConversationExpression(masTarget);
    containsAll(createExpression, [
      '/api/conversations',
      "method: 'POST'",
      'preset_assistant_id: "med-autoscience"',
      'opl_agent_package_invocation',
      "route_kind: 'agent_package_shortcut'",
      'codex_visible_entry: "mas"',
      "display_policy: 'refs_only_no_domain_verdict'",
      "backend: 'codex'",
    ]);
    expect(createExpression).not.toContain('guid-send-btn');
    containsAll(__test.latestConversationRouteReceiptExpression(masTarget), [
      '/api/conversations?limit=10',
      'opl_agent_package_invocation',
      'builtin_capability',
      'codex_cli',
      'opl_app_home',
      "matched.type !== 'acp'",
      "matched.extra?.backend !== 'codex'",
    ]);
    containsAll(__test.conversationRouteReceiptExpression(masTarget, 'conv-123'), ['/api/conversations/conv-123', 'expected_conversation_id']);
  });

  it('builds deterministic Codex functional and AI self-check receipts', () => {
    const functional = __test.buildCodexFunctionalCheckReceipt({
      codexApiKey: null,
      codexCliProbe: { detected: false, command: 'codex', version: null },
      assistantRouteSmoke: assistantTargets.map(({ id }) => ({ id })),
    });
    expect(functional).toMatchObject({
      schema: 'opl_codex_functional_check_receipt.v1',
      status: 'diagnostic_skipped',
      ui_language: 'zh-CN',
      opl_flow_context_expected: { status: 'passed', context_id: 'opl-flow', deterministic: true },
      user_agents_policy: { status: 'passed', agents_override_allowed: false, deterministic: true },
      assistant_route_receipts_checked: {
        status: 'passed',
        required: ['med-autoscience', 'med-autogrant', 'redcube-ai'],
        checked: ['med-autoscience', 'med-autogrant', 'redcube-ai'],
      },
      blocking_release_gate: {
        stable_vm_gate: 'receipt_file_exists_and_deterministic_fields_passed',
        deterministic_fields_passed: true,
        llm_invocation_required: false,
      },
    });

    const options = __test.parseArgs(['--app', '/Applications/One Person Lab.app', '--codex-ai-self-check']);
    expect(options).toMatchObject({ codexAiSelfCheck: true, codexAiSelfCheckMode: 'diagnose', codexFunctionalCheck: true, assistantRouteSmoke: true });
    containsAll(
      __test.buildCodexAiSelfCheckPrompt({
        runtimeProfile: 'full',
        uiLanguage: 'zh-CN',
        coreFirstLaunch: { source: 'opl system initialize --json', status: 'ready' },
        assistantRouteSmoke: assistantTargets.map(({ id }) => ({ id })),
        codexFunctionalCheck: { schema: 'opl_codex_functional_check_receipt.v1', status: 'passed' },
      }),
      ['One Person Lab post-install AI self-check', 'Output strict JSON only', 'opl-flow', 'MAS/MAG/RCA', '"runtime_profile": "full"']
    );
    expect(__test.buildSkippedCodexAiSelfCheckReceipt({ requested: false, reason: 'not_requested', codexCliProbe: { detected: true, command: 'codex' } })).toMatchObject({
      schema: 'opl_codex_ai_self_check_receipt.v1',
      status: 'skipped_not_requested',
      blocking_release_gate: false,
      codex_cli: { detected: true, command: 'codex' },
    });
    expect(
      __test.buildCodexAiSelfCheckReceipt({
        requested: true,
        mode: 'diagnose',
        codexCliProbe: { detected: true, command: 'codex', version: 'codex 0.50.0' },
        prompt: 'target state brief',
        result: {
          status: 'passed',
          stdout: '{"status":"passed","checks":{"opl_flow_context":{"status":"passed"}}}',
          stderr: '',
          parsed: { status: 'passed', checks: { opl_flow_context: { status: 'passed' } } },
          outputPath: '/tmp/codex-ai-self-check-output.json',
        },
      })
    ).toMatchObject({
      schema: 'opl_codex_ai_self_check_receipt.v1',
      status: 'passed',
      blocking_release_gate: false,
      codex_result: { parsed_status: 'passed', output_path: '/tmp/codex-ai-self-check-output.json' },
    });
  });

  it('captures Runtime action evidence and release runtime receipts', () => {
    containsAll(__test.runtimeActionEvidenceExpression(), [
      "window.location.hash = '#/runtime'",
      'Advanced Details',
      '高级详情',
      'safeActionsReady',
      'toggle.click()',
      'Safe Action Routes',
      '安全动作',
      'Dry Run',
      '试运行',
      'Dry run completed',
      '试运行完成',
    ]);
    expect(__test.RUNTIME_ACTION_EVIDENCE_TIMEOUT_MS).toBe(45_000);

    const artifacts = tempDir('opl-release-runtime-evidence-');
    const calls: string[][] = [];
    try {
      const result = __test.collectAppReleaseRuntimeEvidence(
        {
          artifacts,
          appPath: '/Applications/One Person Lab.app',
          runtimeProfile: 'full',
          timeoutMs: 1_000,
          __testHooks: {
            runOplJson: (args: string[]) => {
              calls.push(args);
              return JSON.stringify({ command: args, ok: true });
            },
          },
        },
        null
      );
      expect(__test.RELEASE_EVIDENCE_ACTION_ID).toBe('developer_supervisor_refresh');
      expect(result).toMatchObject({ status: 'passed', action_id: 'developer_supervisor_refresh' });
      expect(calls).toEqual([
        ['app', 'state', '--profile', 'fast', '--json'],
        ['app', 'state', '--profile', 'full', '--json'],
        ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
        ['app', 'action', 'execute', '--action', 'developer_supervisor_refresh', '--dry-run', '--json'],
        ['app', 'action', 'execute', '--action', 'developer_supervisor_refresh', '--json'],
      ]);
      expect(readJson(path.join(artifacts, 'action-dry-run-result.json'))).toMatchObject({ ok: true });
      expect(readJson(path.join(artifacts, 'app-release-runtime-evidence-summary.json'))).toMatchObject({
        status: 'passed',
        action_id: 'developer_supervisor_refresh',
      });
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('keeps Settings smoke passed when Runtime action evidence is unavailable', async () => {
    const artifacts = tempDir('opl-settings-smoke-');
    const calls: string[] = [];
    const client = { send: async () => ({ data: 'iVBORw0KGgo=' }), close: () => calls.push('close') };
    try {
      const result = await __test.runSettingsSmoke(
        {
          artifacts,
          cdpPort: 9230,
          timeoutMs: 1_000,
          __testHooks: {
            waitForCdpPageTarget: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/test' }),
            openCdpClient: async () => client,
            captureSettingsPage: async (_client: unknown, pageTarget: { id: string }) => ({ id: pageTarget.id }),
            exerciseRuntimeRefresh: async (_client: unknown, targetHash: string) => ({ targetHash }),
            assertDeveloperProfileStatus: async () => ({ status: 'ready' }),
            captureRuntimeActionEvidence: async () => {
              throw new Error('No safe action routes are currently exposed.');
            },
          },
        },
        null
      );
      expect(result.map((page: { id: string }) => page.id)).toContain('runtime-status');
      expect(result.runtimeActionEvidence).toBeNull();
      expect(result.runtimeActionEvidenceBlocker).toMatchObject({
        status: 'blocked',
        blocker_kind: 'runtime_action_evidence_unavailable',
      });
      expect(readJson(path.join(artifacts, 'settings-smoke-summary.json'))).toMatchObject({
        surface_id: 'opl_packaged_gui_settings_smoke',
        status: 'passed',
        runtime_action_evidence: null,
      });
      expect(readJson(path.join(artifacts, 'runtime-action-evidence-blocker.json')).reason).toContain('No safe action routes');
      expect(calls).toContain('close');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('fails assistant route smokes closed when required UI controls are missing', () => {
    const error = new Error('Assistant route controls did not become ready for med-autoscience') as Error & {
      lastState?: unknown;
      lastError?: string | null;
    };
    error.lastState = { target_pill_present: false, selectors_hidden: false, badge_visible: false };
    error.lastError = null;
    expect(__test.buildAssistantRouteSmokeFailureSummary({ cdpPort: 9230 }, assistantTargets[0], [], error)).toEqual({
      surface_id: 'opl_packaged_gui_assistant_route_smoke',
      status: 'failed',
      cdp_port: 9230,
      failed_assistant: 'med-autoscience',
      assistants: [],
      error: 'Assistant route controls did not become ready for med-autoscience',
      last_state: { target_pill_present: false, selectors_hidden: false, badge_visible: false },
      last_error: null,
      required_contract: {
        purpose_entries: ['preset-pill-med-autoscience', 'preset-pill-med-autogrant', 'preset-pill-redcube-ai'],
        selectors_hidden: ['guid-model-selector', 'agent-mode-selector-*', 'agent-pill-*'],
        route_receipt: { route_kind: 'builtin_capability', executor: 'codex_cli', source: 'opl_app_home' },
      },
    });
  });

  it('keeps Developer Profile read-only and summarizes system initialize readiness', () => {
    containsAll(__test.developerProfileStatusExpression(), [
      '[data-testid="opl-developer-profile-row"]',
      '[data-testid="opl-developer-profile-status"]',
      'OPL 开发者配置',
      'OPL Developer Profile row exposed machine status',
    ]);
    containsNone(__test.developerProfileStatusExpression(), ['opl-developer-mode-switch', '.click()']);

    expect(
      __test.summarizeCoreFirstLaunch(
        JSON.stringify({
          system_initialize: {
            setup_flow: { ready_to_launch: true, blocking_items: [] },
            readiness: { launch_ready: true, core_ready: true },
          },
        })
      )
    ).toEqual({
      source: 'opl system initialize --json',
      status: 'ready',
      ready_to_launch: true,
      blocking_items: [],
      readiness: { launch_ready: true, core_ready: true },
    });
    const deferred = __test.summarizeCoreFirstLaunch(
      JSON.stringify({
        system_initialize: {
          setup_flow: { blocking_items: ['domain_modules', 'family_runtime_provider', 'recommended_skills'] },
          readiness: { launch_ready: true, core_ready: true, domain_ready: true },
        },
      })
    );
    expect(deferred.status).toBe('ready');
    expect(deferred.blocking_items).toEqual(['domain_modules', 'family_runtime_provider', 'recommended_skills']);
  });
});

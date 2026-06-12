import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';

import { __test as tartSmoke } from '../../../scripts/opl-first-run-tart-smoke.mjs';
import { __test as vmSmoke } from '../../../scripts/opl-first-run-vm-smoke.mjs';

function writeFile(filePath: string, content: string, mode?: number) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  if (mode) fs.chmodSync(filePath, mode);
}

function writeRuntimeToolShim(runtimeHome: string, command: string, output: string) {
  if (process.platform === 'win32') {
    writeFile(path.join(runtimeHome, 'bin', command), `#!/usr/bin/env bash\necho "${output}"\n`, 0o755);
    writeFile(path.join(runtimeHome, 'bin', `${command}.cmd`), `@echo off\r\necho ${output}\r\n`, 0o755);
    return;
  }
  writeFile(path.join(runtimeHome, 'bin', command), `#!/usr/bin/env bash\necho "${output}"\n`, 0o755);
}

function createReadySystemInitialize() {
  return JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: true,
        blocking_items: [],
      },
      readiness: {
        launch_ready: true,
        core_ready: true,
        domain_ready: true,
      },
      recommended_skills: {
        skills: [
          'officecli',
          'officecli-docx',
          'officecli-pptx',
          'officecli-xlsx',
          'mineru-document-extractor',
          'ui-ux-pro-max',
        ].map((skill_id) => ({ skill_id, status: 'ready' })),
      },
    },
  });
}

function createPassedAssistantRouteSmokeSummary(assistantIds = ['mas', 'mag', 'rca']) {
  return {
    status: 'passed',
    assistants: assistantIds,
  };
}

function writeRuntimeModule(
  runtimeHome: string,
  input: {
    moduleId: string;
    repoName: string;
    modulePath: string;
    payloadPaths: string[];
  }
) {
  const moduleRoot = path.join(runtimeHome, input.modulePath);
  writeFile(
    path.join(moduleRoot, 'opl-runtime-module.json'),
    `${JSON.stringify({ packaged_runtime: true, module_id: input.moduleId, repo_name: input.repoName })}\n`
  );
  for (const payloadPath of input.payloadPaths) {
    fs.mkdirSync(path.join(moduleRoot, payloadPath), { recursive: true });
  }
}

function writeDomainPlugin(runtimeHome: string, input: { modulePath: string; pluginName: string; skillId: string }) {
  const pluginRoot = path.join(runtimeHome, input.modulePath, 'plugins', input.pluginName);
  writeFile(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: input.pluginName, skills: './skills/' })}\n`
  );
  writeFile(path.join(pluginRoot, 'skills', input.skillId, 'SKILL.md'), `# ${input.skillId}\n`);
}

function createFullRuntimeEquivalenceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-equivalence-'));
  const codexHome = path.join(root, 'codex-home');
  const runtimeHome = path.join(root, 'runtime', 'current');
  for (const skillId of [
    'officecli',
    'officecli-docx',
    'officecli-pptx',
    'officecli-xlsx',
    'mineru-document-extractor',
    'ui-ux-pro-max',
  ]) {
    writeFile(path.join(runtimeHome, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`);
  }
  for (const moduleFixture of [
    {
      moduleId: 'medautoscience',
      repoName: 'med-autoscience',
      modulePath: path.join('modules', 'mas'),
      payloadPaths: ['agent', 'plugins'],
    },
    {
      moduleId: 'medautogrant',
      repoName: 'med-autogrant',
      modulePath: path.join('modules', 'mag'),
      payloadPaths: ['agent', 'plugins'],
    },
    {
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      modulePath: path.join('modules', 'rca'),
      payloadPaths: ['agent', 'plugins'],
    },
    {
      moduleId: 'oplmetaagent',
      repoName: 'opl-meta-agent',
      modulePath: path.join('modules', 'meta-agent'),
      payloadPaths: ['agent', 'contracts', path.join('runtime', 'authority_functions')],
    },
  ]) {
    writeRuntimeModule(runtimeHome, moduleFixture);
  }
  for (const pluginFixture of [
    { modulePath: path.join('modules', 'mas'), pluginName: 'mas', skillId: 'mas' },
    { modulePath: path.join('modules', 'mag'), pluginName: 'mag', skillId: 'mag' },
    { modulePath: path.join('modules', 'rca'), pluginName: 'rca', skillId: 'rca' },
  ]) {
    writeDomainPlugin(runtimeHome, pluginFixture);
  }
  writeRuntimeToolShim(runtimeHome, 'officecli', 'officecli 1.0.0');
  writeRuntimeToolShim(runtimeHome, 'mineru-open-api', 'mineru-open-api version 1.0.0');
  return { root, codexHome, runtimeHome };
}

describe('OPL first-run VM smoke scripts', () => {
  it('verifies Full runtime equivalence only for the full runtime profile', () => {
    expect(vmSmoke.shouldVerifyFullFirstRunEquivalence('standard')).toBe(false);
    expect(vmSmoke.shouldVerifyFullFirstRunEquivalence('full')).toBe(true);
    expect(
      vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'standard', requireCodexConfigWizard: false })
    ).toBe(false);
    expect(vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'full', requireCodexConfigWizard: false })).toBe(
      false
    );
    expect(
      vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'standard', requireCodexConfigWizard: true })
    ).toBe(false);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: true,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: false,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: true,
      })
    ).toBe(true);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: false,
        runtimeProfile: 'full',
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: true,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: false,
        codexApiKeyFile: '/tmp/codex-api-key.txt',
      })
    ).toBe(true);
  });

  it('always adds the CDP launch argument for GUI readiness and Settings smoke checks', () => {
    expect(
      vmSmoke.buildLaunchAppArgs('/Applications/One Person Lab.app', {
        settingsSmoke: true,
        cdpPort: 9230,
      })
    ).toContain('--aionui-cdp-port=9230');
    expect(
      vmSmoke.buildLaunchAppArgs('/Applications/One Person Lab.app', {
        settingsSmoke: false,
        cdpPort: 9230,
      })
    ).toContain('--aionui-cdp-port=9230');
  });

  it('targets current OPL Settings pages instead of the retired overview refresh control', () => {
    const generalTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'general');
    const environmentTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'environment');
    const appearanceTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'appearance');

    expect(generalTarget?.hash).toBe('#/settings/general');
    expect(generalTarget?.requiredTextAny).toEqual(
      expect.arrayContaining([
        ['One Person Lab'],
        ['Open Runtime Status', '打开运行状态'],
        ['Open Runtime Settings', '打开运行设置'],
      ])
    );
    expect(JSON.stringify(generalTarget)).not.toContain('Refresh status');
    expect(JSON.stringify(generalTarget)).not.toContain('刷新状态');
    expect(environmentTarget?.hash).toBe('#/settings/environment');
    expect(environmentTarget?.requiredTextAny).toEqual(
      expect.arrayContaining([
        ['Local Environment', '本地环境', '本机运行环境'],
        ['Codex CLI'],
        ['Temporal'],
        ['Foundry Modules', '智能体模块'],
      ])
    );
    expect(appearanceTarget?.requiredTextAny).toEqual(
      expect.arrayContaining([
        ['Theme', '主题'],
        ['Codex Theme', 'Codex 主题', 'Codex'],
      ])
    );
    expect(vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'advanced')?.requiredTextAny).toEqual(
      expect.arrayContaining([
        ['OPL Developer Profile', 'OPL 开发者配置'],
        ['OPL Flow Context', 'OPL Flow 上下文'],
      ])
    );
  });

  it('keeps runtime refresh checks in packaged Settings and Runtime smokes', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain('settingsRuntimeRefresh');
    expect(scriptSource).toContain("'#/settings/environment'");
    expect(scriptSource).toContain("'#/runtime'");
  });

  it('writes release evidence screenshots from deterministic CDP smoke paths', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain("path.join('screenshots', 'full.png')");
    expect(scriptSource).toContain("path.join('screenshots', 'action.png')");
    expect(scriptSource).toContain('shouldCaptureFullReleaseScreenshot(options)');
    expect(scriptSource).toContain('runtime-action-evidence.json');
    expect(scriptSource).toContain('captureRuntimeActionEvidence(client, options, secret)');
  });

  it('terminates existing packaged app instances before launching a fresh smoke target', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain('terminate_existing_app');
    expect(scriptSource).toContain('OPL_FIRST_RUN_KEEP_EXISTING_APP');
    expect(scriptSource).toContain('terminateExistingApp(options.processName)');
    expect(scriptSource.indexOf('terminate_existing_app')).toBeLessThan(scriptSource.indexOf("'launch_app'"));
  });

  it('checks Gatekeeper launch policy before opening the packaged app', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain('verify_gatekeeper_launch_policy');
    expect(scriptSource).toContain("spctl', ['--assess', '--type', 'execute', '--verbose=4'");
    expect(scriptSource).toContain('gatekeeper-launch-policy.json');
    expect(scriptSource).toContain("xattr', ['-dr', 'com.apple.quarantine', targetApp]");
    expect(scriptSource).toContain('local_authorization_status: localAuthorizationStatus');
    expect(scriptSource).toContain("'rejected_allowed_unsigned'");
    expect(scriptSource).toContain("'failed_allowed_unsigned'");
    expect(scriptSource).toContain('if (quarantineAttributeCount !== 0)');
    expect(scriptSource).toContain('Stable local authorization failed to clear quarantine before first launch.');
    expect(scriptSource).not.toContain('if (codesign.status !== 0)');
    expect(scriptSource).not.toContain('if (codesign.status !== 0 || spctl.status !== 0)');
    expect(scriptSource.indexOf('verify_gatekeeper_launch_policy')).toBeLessThan(scriptSource.indexOf("'launch_app'"));
  });

  it('scopes runtime refresh button probes to visible page buttons outside toast containers', () => {
    const expression = vmSmoke.visibleRuntimeRefreshButtonExpression();

    expect(expression).toContain('findVisibleRuntimeRefreshButton');
    expect(expression).toContain("candidate.closest('.arco-message, .arco-notification')");
    expect(expression).toContain('getBoundingClientRect');
    expect(expression).toContain("style.display !== 'none'");
    expect(expression).toContain("style.visibility !== 'hidden'");
  });

  it('waits for the Runtime Status page before probing its refresh button', () => {
    const expression = vmSmoke.runtimeStatusReadinessExpression();

    expect(expression).toContain("window.location.hash.startsWith('#/runtime')");
    expect(expression).toContain("window.location.hash = '#/runtime'");
    expect(expression).toContain('OPL Runtime Status');
    expect(expression).toContain('OPL 运行状态');
    expect(expression).toContain('Project Runtime Progress');
    expect(expression).toContain('项目运行进度');
    expect(expression).toContain('App\\/operator Drilldown');
    expect(expression).toContain('运行状态摘要');
    expect(expression).toContain('Task Overview');
    expect(expression).toContain('任务概览');
    expect(expression).toContain('Status Load');
    expect(expression).toContain('状态加载');
    expect(expression).toContain('Loaded at');
  });

  it('uses POSIX-style PATH entries for Full runtime shell probes on Windows bash', () => {
    const prefix = vmSmoke.buildFullRuntimeCommandPrefix('C:\\Users\\tester\\runtime\\current');

    if (process.platform === 'win32') {
      expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='/c/Users/tester/runtime/current'");
      expect(prefix).toContain(
        "export PATH='/c/Users/tester/runtime/current/bin:/c/Users/tester/runtime/current/node/bin"
      );
      expect(prefix).not.toContain('runtime\\current');
      expect(prefix).not.toContain('current/bin;/c/');
    } else {
      expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='C:\\Users\\tester\\runtime\\current'");
      expect(prefix).toContain('current/bin');
    }
  });

  it('uses the canonical Connect modules surface with bounded OPL probes during Full VM smoke', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(vmSmoke.OPL_CONNECT_MODULES_ARGS).toEqual(['connect', 'modules', '--json']);
    expect(scriptSource).toContain("const OPL_CONNECT_MODULES_ARGS = ['connect', 'modules', '--json']");
    expect(scriptSource).toContain('runOplJson(OPL_CONNECT_MODULES_ARGS');
    expect(scriptSource).toContain("['modules.json', OPL_CONNECT_MODULES_ARGS]");
    expect(scriptSource).not.toContain("runOplJson(['modules'])");
    expect(scriptSource).not.toContain("['modules.json', ['modules']]");
    expect(scriptSource).toContain('timeout: resolveOplProbeTimeoutMs(options.timeoutMs)');
  });

  it('does not require the Codex config wizard for standard VM smokes by default', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--dry-run',
    ]);
    expect(options.requireCodexConfigWizard).toBe(false);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).not.toContain('--require-codex-config-wizard');

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
      })
    ).not.toThrow();
  });

  it('forwards assistant route smoke into the guest and requires its passed summary', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--assistant-route-smoke',
      '--dry-run',
    ]);

    expect(options.assistantRouteSmoke).toBe(true);

    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.assistant_route_smoke).toBe(true);
    expect(plan.cdp_port).toBe(9230);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--cdp-port');

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: { status: 'passed', assistants: ['mas', 'mag', 'rca'] },
      })
    ).not.toThrow();

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: null,
      })
    ).toThrow(/assistant route smoke/);
  });

  it('forwards the release workflow guide screenshot toggle into the guest smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--guide-screenshots',
      '--dry-run',
    ]);

    expect(options.guideScreenshots).toBe(true);
    expect(tartSmoke.buildDryRunPlan(options).guide_screenshots).toBe(true);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--guide-screenshots');
    expect(vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--guide-screenshots']).guideScreenshots).toBe(true);
    expect(
      vmSmoke.isGuideScreenshotEntryReady({
        status: 'captured',
        finder_window_setup: { status: 'failed_nonblocking', stderr: 'Finder AppleEvent timed out' },
      })
    ).toBe(true);
    expect(vmSmoke.isGuideScreenshotEntryReady({ status: 'failed' })).toBe(false);
  });

  it('passes Codex functional check through the Tart host command and plan', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--assistant-route-smoke',
      '--codex-functional-check',
      '--dry-run',
    ]);

    expect(options.codexFunctionalCheck).toBe(true);
    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.codex_functional_check).toBe(true);
    expect(plan.assistant_route_smoke).toBe(true);
    expect(plan.cdp_port).toBe(options.cdpPort);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--codex-functional-check');
  });

  it('passes Codex AI self-check through the Tart host command and plan as a diagnostic', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--codex-ai-self-check',
      '--dry-run',
    ]);

    expect(options.codexAiSelfCheck).toBe(true);
    expect(options.codexFunctionalCheck).toBe(true);
    expect(options.assistantRouteSmoke).toBe(true);

    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.codex_ai_self_check).toEqual({
      requested: true,
      mode: 'diagnose',
      blocking_release_gate: false,
    });
    expect(plan.codex_functional_check).toBe(true);
    expect(plan.assistant_route_smoke).toBe(true);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--codex-functional-check');
    expect(command).toContain('--codex-ai-self-check');
  });

  it('bounds the host SSH command for long-running guest smokes', async () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--smoke-timeout-ms',
      '1000',
      '--dry-run',
    ]);

    expect(tartSmoke.guestSmokeHostTimeoutMs(options)).toBe(121_000);
    await expect(
      tartSmoke.runAsync(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
        label: 'test-long-running-child',
        timeoutMs: 50,
      })
    ).rejects.toThrow(/test-long-running-child timed out after 50ms/);
  });

  it('summarizes Tart host stage timings without depending on VM execution', () => {
    const at = (startedAtMs: number, stage: string) => ({
      stage,
      startedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
    });

    const summary = tartSmoke.buildStageTimingSummary(
      [at(1_000, 'clone_vm'), at(3_500, 'homebrew_cask_install'), at(9_000, 'run_guest_smoke')],
      12_500
    );

    expect(summary).toMatchObject({
      status: 'available',
      total_elapsed_ms: 11_500,
      last_stage: 'run_guest_smoke',
      stages: [
        { stage: 'clone_vm', duration_ms: 2_500 },
        { stage: 'homebrew_cask_install', duration_ms: 5_500 },
        { stage: 'run_guest_smoke', duration_ms: 3_500 },
      ],
      slowest_stages: [
        { stage: 'homebrew_cask_install', duration_ms: 5_500 },
        { stage: 'run_guest_smoke', duration_ms: 3_500 },
        { stage: 'clone_vm', duration_ms: 2_500 },
      ],
    });
  });

  it('requires the guest Codex functional check receipt when requested', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--codex-functional-check',
      '--dry-run',
    ]);

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
        codex_functional_check: {
          status: 'diagnostic_skipped',
          blocking_release_gate: {
            deterministic_fields_passed: true,
            llm_invocation_required: false,
          },
        },
      })
    ).not.toThrow();

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
      })
    ).toThrow(/Codex functional check/);
  });

  it('does not fail the Tart release gate when optional Codex AI self-check is skipped', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--codex-ai-self-check',
      '--dry-run',
    ]);

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
        codex_functional_check: {
          status: 'diagnostic_skipped',
          blocking_release_gate: {
            deterministic_fields_passed: true,
            llm_invocation_required: false,
          },
        },
        codex_ai_self_check: {
          schema: 'opl_codex_ai_self_check_receipt.v1',
          status: 'skipped_missing_codex_config',
          blocking_release_gate: false,
        },
      })
    ).not.toThrow();
  });

  it('passes an explicit current-source Framework archive into the packaged Tart smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--framework-source-archive',
      '/tmp/current-framework.tar.gz',
      '--framework-install-script',
      '/tmp/current-install.sh',
      '--guest-workdir',
      '/tmp/guest',
      '--dry-run',
    ]);

    expect(options.frameworkSourceArchive).toBe('/tmp/current-framework.tar.gz');

    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.framework_source_archive).toEqual({
      evidence_role: 'current_source_framework_archive',
      host_path: '/tmp/current-framework.tar.gz',
      guest_path: '/tmp/guest/current-framework.tar.gz',
      install_script_host_path: '/tmp/current-install.sh',
      install_script_guest_path: '/tmp/guest/opl-framework-install.sh',
      install_script_url: 'file:///tmp/guest/opl-framework-install.sh',
      install_source_mode: 'archive',
      source_archive_url: 'file:///tmp/guest/current-framework.tar.gz',
    });

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt',
      '/tmp/guest/current-framework.tar.gz',
      '/tmp/guest/opl-framework-install.sh'
    );
    expect(command).toContain('launchctl setenv OPL_INSTALL_SOURCE_MODE');
    expect(command).toContain('launchctl setenv OPL_SOURCE_ARCHIVE_URL');
    expect(command).toContain('launchctl setenv OPL_INSTALL_SCRIPT_URL');
    expect(command).toContain("export OPL_INSTALL_SOURCE_MODE='archive'");
    expect(command).toContain("export OPL_SOURCE_ARCHIVE_URL='file:///tmp/guest/current-framework.tar.gz'");
    expect(command).toContain("export OPL_INSTALL_SCRIPT_URL='file:///tmp/guest/opl-framework-install.sh'");

    expect(tartSmoke.frameworkInstallScriptFinalizeCommand(options)).toContain(
      "mv '/tmp/guest/current-install.sh' '/tmp/guest/opl-framework-install.sh'"
    );
    expect(tartSmoke.frameworkInstallScriptFinalizeCommand(options)).toContain(
      "chmod +x '/tmp/guest/opl-framework-install.sh'"
    );
  });

  it('writes a structured Tart summary when guest smoke fails after artifacts were copied', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-failed-summary-'));
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--settings-smoke',
      '--assistant-route-smoke',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);

    try {
      fs.mkdirSync(path.join(artifacts, 'artifacts'), { recursive: true });
      fs.writeFileSync(
        path.join(artifacts, 'artifacts', 'smoke-summary.json'),
        `${JSON.stringify({
          status: 'failed',
          runtime_profile: 'standard',
          settings_smoke: {
            status: 'passed',
            pages: ['overview', 'runtime'],
            runtime_action_evidence_status: 'blocked',
          },
          assistant_route_smoke: null,
        })}\n`
      );

      tartSmoke.writeFailedSummary(options, '192.168.64.10', '/tmp/guest/artifacts', new Error('guest failed'));
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));

      expect(summary).toMatchObject({
        surface_id: 'opl_tart_gui_first_run_smoke',
        status: 'failed',
        error: 'guest failed',
        runtime_profile: 'standard',
        guest_ip: '192.168.64.10',
        guest_artifacts: '/tmp/guest/artifacts',
        settings_smoke: {
          status: 'passed',
          runtime_action_evidence_status: 'blocked',
        },
      });
      expect(summary.stage_timing).toMatchObject({
        status: expect.stringMatching(/^(available|missing)$/),
        stages: expect.any(Array),
      });
      expect(summary.guest_summary.status).toBe('failed');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not require the Codex config wizard for full VM smokes by default', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab-Full.dmg',
      '--runtime-profile',
      'full',
      '--dry-run',
    ]);
    expect(options.requireCodexConfigWizard).toBe(false);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab-Full.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).not.toContain('--require-codex-config-wizard');

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
      })
    ).not.toThrow();
  });

  it('can still explicitly require the Codex config wizard for targeted wizard smokes', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab-Full.dmg',
      '--runtime-profile',
      'full',
      '--require-codex-config-wizard',
      '--dry-run',
    ]);
    expect(options.requireCodexConfigWizard).toBe(true);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab-Full.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--require-codex-config-wizard');

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
      })
    ).toThrow(/Codex configuration wizard/);
  });

  it('checks Full companion skills through packaged runtime payloads before Codex skill mirrors exist', () => {
    const fixture = createFullRuntimeEquivalenceFixture();
    try {
      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).not.toThrow();

      expect(fs.existsSync(path.join(fixture.codexHome, 'skills', 'officecli', 'SKILL.md'))).toBe(false);
      expect(fs.existsSync(path.join(fixture.runtimeHome, 'skills', 'officecli', 'SKILL.md'))).toBe(true);
      fs.rmSync(path.join(fixture.runtimeHome, 'skills', 'officecli'), { recursive: true, force: true });

      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).toThrow(/companion skill officecli/);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('passes assistant route smoke through the Tart host command and plan', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--assistant-route-smoke',
      '--dry-run',
    ]);

    expect(options.assistantRouteSmoke).toBe(true);
    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.assistant_route_smoke).toBe(true);
    expect(plan.cdp_port).toBe(options.cdpPort);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--cdp-port');
  });

  it('resolves guest node root through symlinked node binaries before copying to the guest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-root-'));
    try {
      const linkedRoot = path.join(root, 'homebrew');
      const realRoot = path.join(root, 'Cellar', 'node', '26.0.0');
      fs.mkdirSync(path.join(linkedRoot, 'bin'), { recursive: true });
      fs.mkdirSync(path.join(realRoot, 'bin'), { recursive: true });
      writeFile(path.join(realRoot, 'bin', 'node'), '#!/bin/sh\n', 0o755);
      fs.symlinkSync(path.join(realRoot, 'bin', 'node'), path.join(linkedRoot, 'bin', 'node'));

      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--guest-node-root',
        linkedRoot,
        '--dry-run',
      ]);

      const expectedRoot = fs.realpathSync(realRoot);
      expect(options.guestNodeRoot).toBe(expectedRoot);
      expect(tartSmoke.buildDryRunPlan(options).guest_node_root).toBe(expectedRoot);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the canonical Homebrew binary path when SSH does not provide a login PATH', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--install-mode',
      'homebrew-cask',
      '--homebrew-cask',
      'gaofeng21cn/one-person-lab/one-person-lab',
      '--smoke-profile',
      'homebrew-standard-cask',
      '--dry-run',
    ]);

    expect(tartSmoke.buildDryRunPlan(options).homebrew_trusted_casks).toEqual([
      'gaofeng21cn/one-person-lab/one-person-lab',
      'gaofeng21cn/one-person-lab/one-person-lab-full',
      'gaofeng21cn/one-person-lab/one-person-lab-nightly',
    ]);
    expect(tartSmoke.homebrewTrustedCaskRefs(options)).toEqual([
      'gaofeng21cn/one-person-lab/one-person-lab',
      'gaofeng21cn/one-person-lab/one-person-lab-full',
      'gaofeng21cn/one-person-lab/one-person-lab-nightly',
    ]);
    const command = tartSmoke.guestHomebrewInstallCommand(options);
    expect(command).toContain('/opt/homebrew/bin/brew');
    expect(command).toContain('"$BREW_BIN" shellenv');
    expect(command).toContain('"$BREW_BIN" tap');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab\'');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab-full\'');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab-nightly\'');
    expect(command).not.toContain('"$BREW_BIN" trust gaofeng21cn/one-person-lab');
    expect(command).toContain('"$BREW_BIN" install --cask');
    expect(command).toContain('xattr -dr com.apple.quarantine "/Applications/One Person Lab.app"');
  });

  it('validates assistant route smoke independently from Settings smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--assistant-route-smoke',
      '--dry-run',
    ]);

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
      })
    ).not.toThrow();

    expect(() =>
      tartSmoke.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(['mas', 'mag']),
      })
    ).toThrow(/assistant route smoke/);
  });

  it('checks Full domain skills through packaged plugin surfaces, not retired Codex skill mirrors', () => {
    const fixture = createFullRuntimeEquivalenceFixture();
    try {
      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).not.toThrow();

      expect(fs.existsSync(path.join(fixture.codexHome, 'skills', 'mas', 'SKILL.md'))).toBe(false);
      fs.rmSync(path.join(fixture.runtimeHome, 'modules', 'mas', 'plugins', 'mas'), { recursive: true, force: true });

      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).toThrow(/domain plugin mas/);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

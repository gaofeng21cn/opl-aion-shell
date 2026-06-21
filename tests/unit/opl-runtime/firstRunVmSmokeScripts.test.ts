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
    {
      moduleId: 'oplbookforge',
      repoName: 'opl-bookforge',
      modulePath: path.join('modules', 'bookforge'),
      payloadPaths: ['contracts'],
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

function createPackagedFullRuntimeAppFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-full-app-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const payloadRoot = path.join(appPath, 'Contents', 'Resources', 'opl-full-runtime');
  const runtimeHome = path.join(payloadRoot, 'runtime', 'current');
  fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(payloadRoot, 'manifest'), { recursive: true });
  writeFile(
    path.join(payloadRoot, 'manifest', 'full-package-manifest.json'),
    `${JSON.stringify({ version: '26.6.21' })}\n`
  );
  return { root, appPath, runtimeHome };
}

function createPackagedAppWithMainEntry(content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-main-entry-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const mainEntryPath = path.join(appPath, 'Contents', 'Resources', 'app.asar', 'out', 'main', 'index.js');
  writeFile(mainEntryPath, content);
  return { root, appPath, mainEntryPath };
}

function createPackagedAppAsarArchive(content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-main-asar-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  writeFile(appAsarPath, content);
  return { root, appPath, appAsarPath };
}

describe('OPL first-run VM smoke scripts', () => {
  it('separates Full runtime equivalence from Codex-keyed core first-launch readiness', () => {
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
    ).toBe(true);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: true,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: false,
        codexApiKeyFile: '/tmp/codex-api-key.txt',
      })
    ).toBe(true);
  });

  it('uses the packaged standard installer as the VM smoke bootstrap carrier', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-smoke-app-'));
    const appPath = path.join(appRoot, 'One Person Lab.app');
    const installerPath = path.join(appPath, 'Contents', 'Resources', 'opl-install.sh');
    writeFile(installerPath, '#!/usr/bin/env bash\nexit 0\n', 0o755);

    expect(vmSmoke.resolvePackagedStandardInstaller(appPath)).toBe(installerPath);
    expect(vmSmoke.buildStandardBootstrapCommand(installerPath)).toEqual({
      command: '/bin/bash',
      args: [
        installerPath,
        '--complete',
        '--skip-modules',
        '--skip-gui-open',
        '--skip-native-helper-repair',
        '--no-online-runtime',
      ],
      redactedCommand:
        '/bin/bash <packaged-opl-install.sh> --complete --skip-modules --skip-gui-open --skip-native-helper-repair --no-online-runtime',
    });
    expect(vmSmoke.resolvePackagedStandardInstaller(path.join(appRoot, 'Missing.app'))).toBeNull();
  });

  it('fails fast when the packaged App does not contain the main bootstrap fatal marker', () => {
    const current = createPackagedAppWithMainEntry(
      "console.log('aionui.main_bootstrap_fatal.v1');\nimport('./index-original.js');\n"
    );
    const old = createPackagedAppWithMainEntry("import('./index-original.js');\n");
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-marker-artifacts-'));
    try {
      expect(vmSmoke.detectPackagedMainBootstrap(current.appPath)).toMatchObject({
        schema: 'opl_packaged_app_bootstrap_marker.v1',
        app_path: current.appPath,
        app_asar_type: 'directory',
        main_entry_path: current.mainEntryPath,
        main_entry_present: true,
        fatal_marker: 'aionui.main_bootstrap_fatal.v1',
        fatal_marker_present: true,
      });
      expect(vmSmoke.assertPackagedMainBootstrap(current.appPath, artifacts)).toMatchObject({
        fatal_marker_present: true,
      });
      expect(vmSmoke.detectPackagedMainBootstrap(old.appPath)).toMatchObject({
        main_entry_present: true,
        fatal_marker_present: false,
      });
      expect(() => vmSmoke.assertPackagedMainBootstrap(old.appPath, artifacts)).toThrow(
        /main bootstrap fatal diagnostics marker/
      );
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'packaged-app-bootstrap-marker.json'), 'utf8'))
      ).toMatchObject({
        main_entry_present: true,
        fatal_marker_present: false,
      });
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
      fs.rmSync(old.root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('detects the main bootstrap fatal marker inside an archived app.asar file', () => {
    const current = createPackagedAppAsarArchive(
      `fake asar bytes before marker ${'aionui.main_bootstrap_fatal.v1'} after marker`
    );
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-marker-archive-artifacts-'));
    try {
      expect(vmSmoke.detectPackagedMainBootstrap(current.appPath)).toMatchObject({
        app_asar_path: current.appAsarPath,
        app_asar_present: true,
        app_asar_type: 'file',
        app_asar_size_bytes: expect.any(Number),
        main_entry_present: true,
        main_entry_size_bytes: null,
        main_entry_sha256: null,
        fatal_marker_present: true,
      });
      expect(vmSmoke.assertPackagedMainBootstrap(current.appPath, artifacts)).toMatchObject({
        app_asar_type: 'file',
        fatal_marker_present: true,
      });
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('resolves Full VM smoke commands from installed App packaged runtime resources', () => {
    const fixture = createPackagedFullRuntimeAppFixture();
    try {
      writeFile(
        path.join(fixture.runtimeHome, 'bin', 'opl'),
        '#!/usr/bin/env bash\nprintf \'{"ok":true,"args":["%s","%s","%s"]}\\n\' "$1" "$2" "$3"\n',
        0o755
      );

      const fullRuntime = vmSmoke.describePackagedFullRuntime(fixture.appPath);
      const command = vmSmoke.buildOplJsonShellCommand(['system', 'initialize', '--json'], {
        appPath: fixture.appPath,
        runtimeProfile: 'full',
      });
      const raw = vmSmoke.runOplJson(['system', 'initialize', '--json'], {
        appPath: fixture.appPath,
        runtimeProfile: 'full',
        timeoutMs: 1_000,
      });

      expect(fullRuntime).toMatchObject({
        status: 'found',
        runtime_home: fixture.runtimeHome,
        opl_path: path.join(fixture.runtimeHome, 'bin', 'opl'),
        missing_reason: null,
      });
      expect(command.runtimeHome).toBe(fixture.runtimeHome);
      expect(command.fullRuntime).toMatchObject({
        source: 'packaged_app_resource',
        runtime_home: fixture.runtimeHome,
      });
      expect(command.command).toContain(path.join(fixture.runtimeHome, 'bin', 'opl'));
      expect(command.command).toContain('system');
      expect(command.command).not.toContain('command -v opl');
      expect(JSON.parse(raw)).toEqual({
        ok: true,
        args: ['system', 'initialize', '--json'],
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
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
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('terminate_existing_app');
    expect(scriptSource).toContain('OPL_FIRST_RUN_KEEP_EXISTING_APP');
    expect(scriptSource).toContain('terminateExistingApp(options.processName)');
    expect(mainSource.indexOf('terminate_existing_app')).toBeLessThan(mainSource.indexOf("'launch_app'"));
  });

  it('checks Gatekeeper launch policy before opening the packaged app', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

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
    expect(mainSource.indexOf('verify_gatekeeper_launch_policy')).toBeLessThan(mainSource.indexOf("'launch_app'"));
  });

  it('configures Codex from the API key file before the first packaged App launch', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('configureCodexApiKeyForSmoke');
    expect(scriptSource).toContain('!options.bootstrapLaunchDiagnostics');
    expect(mainSource.indexOf("'install_dmg'")).toBeLessThan(mainSource.indexOf("'configure_codex_api_key'"));
    expect(mainSource.indexOf("'configure_codex_api_key'")).toBeLessThan(mainSource.indexOf("'launch_app'"));
    expect(mainSource.indexOf("'launch_app'")).toBeLessThan(mainSource.indexOf("'wait_guid_entry'"));
  });

  it('runs bootstrap-only launch diagnostics after opening the packaged app before secondary release gates', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('--bootstrap-launch-diagnostics');
    expect(scriptSource).toContain('waitForBootstrapLaunchDiagnostics');
    expect(scriptSource).toContain('bootstrap-launch-diagnostics.json');
    expect(mainSource.indexOf("'launch_app'")).toBeLessThan(mainSource.indexOf("'bootstrap_launch_diagnostics'"));
    expect(mainSource.indexOf("'bootstrap_launch_diagnostics'")).toBeLessThan(mainSource.indexOf("'wait_guid_entry'"));
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

  it('forwards bootstrap-only launch diagnostics into the guest without secondary release smokes', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--bootstrap-launch-diagnostics',
      '--dry-run',
    ]);

    expect(options.bootstrapLaunchDiagnostics).toBe(true);
    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.bootstrap_launch_diagnostics).toBe(true);
    expect(plan.settings_smoke).toBe(false);
    expect(plan.assistant_route_smoke).toBe(false);
    expect(plan.cdp_port).toBe(9230);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--bootstrap-launch-diagnostics');
    expect(command).toContain('--cdp-port');
    expect(command).not.toContain('--settings-smoke');
    expect(command).not.toContain('--assistant-route-smoke');
    expect(command).not.toContain('--codex-functional-check');
    expect(command).not.toContain('--codex-ai-self-check');
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

  it('passes Codex phase and host deadline budgets through Tart host plans and guest smoke commands', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--smoke-timeout-ms',
      '900000',
      '--codex-install-phase-timeout-ms',
      '240000',
      '--codex-readiness-phase-timeout-ms',
      '360000',
      '--dry-run',
    ]);

    expect(options.codexInstallPhaseTimeoutMs).toBe(240_000);
    expect(options.codexReadinessPhaseTimeoutMs).toBe(360_000);
    expect(tartSmoke.buildDryRunPlan(options).timeouts).toEqual({
      vm_boot_and_ssh_ms: 600_000,
      guest_smoke_ms: 900_000,
      guest_smoke_host_ms: 1_020_000,
      guest_smoke_host_grace_ms: 120_000,
      codex_install_phase_ms: 240_000,
      codex_readiness_phase_ms: 360_000,
    });
    expect(tartSmoke.guestSmokeHostDeadlineEpochMs(options, 1_000_000)).toBe(2_020_000);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt',
      null,
      null,
      2_020_000
    );
    expect(command).toContain("--codex-install-phase-timeout-ms '240000'");
    expect(command).toContain("--codex-readiness-phase-timeout-ms '360000'");
    expect(command).toContain("--host-deadline-epoch-ms '2020000'");
  });

  it('defaults Codex phase timeouts from the guest smoke timeout and rejects invalid phase budgets', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--smoke-timeout-ms',
      '900000',
      '--dry-run',
    ]);

    expect(options.codexInstallPhaseTimeoutMs).toBe(900_000);
    expect(options.codexReadinessPhaseTimeoutMs).toBe(900_000);
    expect(() =>
      tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-install-phase-timeout-ms',
        '0',
        '--dry-run',
      ])
    ).toThrow(/codex-install-phase-timeout-ms/);
    expect(() =>
      tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-readiness-phase-timeout-ms',
        '-1',
        '--dry-run',
      ])
    ).toThrow(/codex-readiness-phase-timeout-ms/);
  });

  it('parses guest Codex phase timeouts and shares a phase deadline across commands', () => {
    const options = vmSmoke.parseArgs([
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--timeout-ms',
      '900000',
      '--codex-install-phase-timeout-ms',
      '240000',
      '--codex-readiness-phase-timeout-ms',
      '360000',
    ]);

    expect(options.codexInstallPhaseTimeoutMs).toBe(240_000);
    expect(options.codexReadinessPhaseTimeoutMs).toBe(360_000);
    expect(
      vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--timeout-ms', '42']).codexInstallPhaseTimeoutMs
    ).toBe(42);
    expect(() =>
      vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--codex-readiness-phase-timeout-ms', '0'])
    ).toThrow(/codex-readiness-phase-timeout-ms/);

    const deadlineMs = vmSmoke.phaseDeadlineMs(10_000);
    expect(vmSmoke.remainingPhaseTimeoutMs(deadlineMs, 'install_dmg')).toBeLessThanOrEqual(10_000);
    expect(() => vmSmoke.remainingPhaseTimeoutMs(Date.now() - 1, 'install_dmg')).toThrow(/install_dmg timed out/);
  });

  it('parses and validates guest Codex install preseed inputs without leaking full paths in diagnostics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-preseed-'));
    try {
      const tarball = path.join(root, 'codex-package.tgz');
      const platformTarball = path.join(root, 'codex-platform-package.tgz');
      const cacheDir = path.join(root, 'npm-cache');
      writeFile(tarball, 'codex package tarball\n');
      writeFile(platformTarball, 'codex platform package tarball\n');
      writeFile(path.join(cacheDir, '_cacache', 'index-v5', 'entry'), 'cache entry\n');

      const options = vmSmoke.parseArgs([
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-package-tarball',
        tarball,
        '--codex-platform-package-tarball',
        platformTarball,
        '--codex-npm-cache-dir',
        cacheDir,
      ]);

      expect(options.codexPackageTarball).toBe(tarball);
      expect(options.codexPlatformPackageTarball).toBe(platformTarball);
      expect(options.codexNpmCacheDir).toBe(cacheDir);
      expect(vmSmoke.buildCodexInstallPreseedEnv(options)).toMatchObject({
        OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: tarball,
        OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: platformTarball,
        OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: cacheDir,
        NPM_CONFIG_CACHE: cacheDir,
        npm_config_cache: cacheDir,
      });
      const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
      const launchAppSource = scriptSource.slice(
        scriptSource.indexOf('function launchApp('),
        scriptSource.indexOf('function verifyGatekeeperLaunchPolicy(')
      );
      expect(launchAppSource).toContain('buildCodexInstallPreseedEnv(options)');
      expect(launchAppSource).toContain("runWithDeadline('launchctl', ['setenv', key, value]");
      expect(launchAppSource).toContain('resolveAppExecutablePath(appPath)');
      expect(launchAppSource).toContain('buildLaunchExecutableArgs(options)');
      expect(launchAppSource).toContain('buildLaunchAppEnv(options)');
      expect(launchAppSource).toContain('env: launchEnv');
      expect(launchAppSource).toContain("strategy: 'direct_app_executable'");
      expect(scriptSource).toContain('buildPackagedAppLaunchBaseEnv(sourceEnv)');

      const diagnostics = vmSmoke.codexInstallPreseedDiagnostics(options);
      expect(diagnostics).toMatchObject({
        requested: true,
        package_tarball: {
          present: true,
          basename: 'codex-package.tgz',
          type: 'file',
          size_bytes: Buffer.byteLength('codex package tarball\n'),
        },
        platform_package_tarball: {
          present: true,
          basename: 'codex-platform-package.tgz',
          type: 'file',
          size_bytes: Buffer.byteLength('codex platform package tarball\n'),
        },
        npm_cache_dir: {
          present: true,
          basename: 'npm-cache',
          type: 'directory',
        },
      });
      expect(diagnostics.package_tarball.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(diagnostics.platform_package_tarball.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(diagnostics.npm_cache_dir.size_bytes).toBeGreaterThan(0);
      expect(JSON.stringify(diagnostics)).not.toContain(root);

      expect(() =>
        vmSmoke.parseArgs([
          '--dmg',
          '/tmp/One-Person-Lab.dmg',
          '--codex-package-tarball',
          path.join(root, 'missing.tgz'),
        ])
      ).toThrow(/codex-package-tarball/);
      expect(() =>
        vmSmoke.parseArgs([
          '--dmg',
          '/tmp/One-Person-Lab.dmg',
          '--codex-platform-package-tarball',
          path.join(root, 'missing-platform.tgz'),
        ])
      ).toThrow(/codex-platform-package-tarball/);
      expect(() => vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--codex-npm-cache-dir', tarball])).toThrow(
        /codex-npm-cache-dir/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('forwards Codex install preseed inputs through Tart plans and guest smoke commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-codex-preseed-'));
    try {
      const tarball = path.join(root, 'codex-package.tgz');
      const platformTarball = path.join(root, 'codex-platform-package.tgz');
      const cacheDir = path.join(root, 'npm-cache');
      writeFile(tarball, 'codex package tarball\n');
      writeFile(platformTarball, 'codex platform package tarball\n');
      writeFile(path.join(cacheDir, '_cacache', 'entry'), 'cache entry\n');

      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--guest-workdir',
        '/tmp/guest',
        '--codex-package-tarball',
        tarball,
        '--codex-platform-package-tarball',
        platformTarball,
        '--codex-npm-cache-dir',
        cacheDir,
        '--dry-run',
      ]);

      expect(options.codexPackageTarball).toBe(tarball);
      expect(options.codexPlatformPackageTarball).toBe(platformTarball);
      expect(options.codexNpmCacheDir).toBe(cacheDir);

      const plan = tartSmoke.buildDryRunPlan(options);
      expect(plan.codex_install_preseed).toMatchObject({
        requested: true,
        package_tarball: {
          present: true,
          basename: 'codex-package.tgz',
          guest_path: '/tmp/guest/codex-package.tgz',
          type: 'file',
        },
        platform_package_tarball: {
          present: true,
          basename: 'codex-platform-package.tgz',
          guest_path: '/tmp/guest/codex-platform-package.tgz',
          type: 'file',
        },
        npm_cache_dir: {
          present: true,
          basename: 'npm-cache',
          guest_path: '/tmp/guest/codex-npm-cache',
          type: 'directory',
        },
      });
      expect(JSON.stringify(plan.codex_install_preseed)).not.toContain(root);

      const command = tartSmoke.guestSmokeCommand(
        options,
        '/tmp/guest/One-Person-Lab.dmg',
        '/tmp/guest/opl-first-run-vm-smoke.mjs',
        '/tmp/guest/artifacts',
        '/tmp/guest/codex-api-key.txt'
      );
      expect(command).toContain("--codex-package-tarball '/tmp/guest/codex-package.tgz'");
      expect(command).toContain("--codex-platform-package-tarball '/tmp/guest/codex-platform-package.tgz'");
      expect(command).toContain("--codex-npm-cache-dir '/tmp/guest/codex-npm-cache'");

      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--install-mode',
          'homebrew-cask',
          '--homebrew-cask',
          'one-person-lab',
          '--codex-package-tarball',
          path.join(root, 'missing.tgz'),
        ])
      ).toThrow(/codex-package-tarball/);
      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--install-mode',
          'homebrew-cask',
          '--homebrew-cask',
          'one-person-lab',
          '--codex-platform-package-tarball',
          path.join(root, 'missing-platform.tgz'),
        ])
      ).toThrow(/codex-platform-package-tarball/);
      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--install-mode',
          'homebrew-cask',
          '--homebrew-cask',
          'one-person-lab',
          '--codex-npm-cache-dir',
          tarball,
        ])
      ).toThrow(/codex-npm-cache-dir/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  it('writes interrupted Tart summary after signal artifact recovery state is updated', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-interrupted-summary-'));
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--settings-smoke',
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
          labels: ['launch-app'],
        })}\n`
      );

      tartSmoke.__setRuntimeStateForTest({
        options,
        stage: 'run_guest_smoke',
        ip: '192.168.64.10',
        guestArtifactDir: '/tmp/guest/artifacts',
        copiedArtifacts: true,
      });
      tartSmoke.writeInterruptedSummary('SIGTERM');
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));

      expect(summary).toMatchObject({
        surface_id: 'opl_tart_gui_first_run_smoke',
        status: 'interrupted',
        signal: 'SIGTERM',
        stage: 'run_guest_smoke',
        guest_ip: '192.168.64.10',
        guest_artifacts: '/tmp/guest/artifacts',
        copied_guest_artifacts: true,
      });
      expect(summary.guest_summary).toMatchObject({
        status: 'failed',
        labels: ['launch-app'],
      });
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
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

  it('plans guest node root staging as a content-hash reusable VM cache', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-cache-'));
    try {
      const nodeRoot = path.join(root, 'node-v22.21.1');
      writeFile(path.join(nodeRoot, 'bin', 'node'), '#!/bin/sh\n', 0o755);
      writeFile(path.join(nodeRoot, 'lib', 'node_modules', 'npm', 'package.json'), '{"name":"npm"}\n');

      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--guest-node-root',
        nodeRoot,
        '--guest-workdir',
        '/tmp/guest',
        '--dry-run',
      ]);
      const staging = tartSmoke.guestNodeStagingPlan(options);

      expect(staging).toMatchObject({
        strategy: 'reuse_by_content_hash',
        cache_root: '/tmp/guest-node-cache',
        cache_hit: null,
        host_path: fs.realpathSync(nodeRoot),
      });
      expect(staging.content_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(staging.guest_root).toBe(`/tmp/guest-node-cache/${staging.content_hash}`);
      expect(staging.guest_node_command).toBe(`/tmp/guest-node-cache/${staging.content_hash}/bin/node`);
      expect(tartSmoke.buildDryRunPlan(options).guest_node_staging).toEqual(staging);
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
    expect(command).toContain('export HOMEBREW_NO_AUTO_UPDATE=1');
    expect(command).toContain('export HOMEBREW_NO_INSTALL_CLEANUP=1');
    expect(command).toContain('export HOMEBREW_NO_ENV_HINTS=1');
    expect(command).toContain('"$BREW_BIN" tap');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab\'');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab-full\'');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab-nightly\'');
    expect(command).not.toContain('"$BREW_BIN" trust gaofeng21cn/one-person-lab');
    expect(command).toContain('"$BREW_BIN" install --cask');
    expect(command).toContain('xattr -dr com.apple.quarantine "/Applications/One Person Lab.app"');
  });

  it('classifies transient Homebrew cask download failures for a bounded retry', () => {
    const partialDownload = new Error(
      'ssh homebrew_cask_install runner@127.0.0.1 exited with 1\nstderr:\ncurl: (18) Transferred a partial file'
    );
    const runtimeFailure = new Error('Timed out waiting for OPL core first-launch readiness');

    expect(tartSmoke.isRetryableHomebrewInstallError(partialDownload)).toBe(true);
    expect(tartSmoke.isRetryableHomebrewInstallError(runtimeFailure)).toBe(false);
  });

  it('writes structured OPL command diagnostics beside human-readable failure artifacts', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-command-diagnostics-'));
    try {
      const error = new vmSmoke.OplJsonCommandError('opl system initialize --json failed', {
        schema: 'opl_vm_smoke_opl_command_error.v1',
        args: ['system', 'initialize', '--json'],
        command: 'opl system initialize --json',
        shell_command: 'command -v opl >/dev/null && opl system initialize --json',
        runtime_home: '/tmp/runtime/current',
        standard_bootstrap: {
          status: 'passed',
          command:
            '/bin/bash <packaged-opl-install.sh> --complete --skip-modules --skip-gui-open --skip-native-helper-repair --no-online-runtime',
        },
        managed_opl_bin: '/Users/tester/.opl/one-person-lab/bin',
        managed_node_bin: null,
        opl_path: '/Users/tester/.opl/one-person-lab/bin/opl',
        shell_executable: '/bin/zsh',
        status: 1,
        signal: null,
        timed_out: false,
        timeout_ms: 90_000,
        stdout: '{"partial":true}\n',
        stderr: 'runtime state not ready\n',
        error: null,
      });
      const basePath = path.join(artifacts, 'system-initialize.json');

      vmSmoke.writeOplJsonCommandErrorArtifacts(basePath, error, 'secret-token');

      expect(fs.readFileSync(`${basePath}.error.txt`, 'utf8')).toContain('opl system initialize --json failed');
      expect(JSON.parse(fs.readFileSync(`${basePath}.error.json`, 'utf8'))).toMatchObject({
        schema: 'opl_vm_smoke_opl_command_error_artifact.v1',
        message: 'opl system initialize --json failed',
        diagnostics: {
          schema: 'opl_vm_smoke_opl_command_error.v1',
          args: ['system', 'initialize', '--json'],
          command: 'opl system initialize --json',
          status: 1,
          standard_bootstrap: {
            status: 'passed',
          },
          opl_path: '/Users/tester/.opl/one-person-lab/bin/opl',
          timed_out: false,
          stdout: '{"partial":true}\n',
          stderr: 'runtime state not ready\n',
        },
      });
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('collects bounded macOS launch diagnostics when packaged GUI boot never reaches CDP', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain("commandDiagnostic('/usr/bin/sample'");
    expect(scriptSource).toContain('captureNativeWindowDiagnostics(options.processName)');
    expect(scriptSource).toContain("path.join(launchLogDir, 'native-window-diagnostics.json')");
    expect(scriptSource).toContain(
      'native_window_diagnostics: summarizeNativeWindowDiagnostics(nativeWindowDiagnostics)'
    );
    expect(scriptSource).toContain('opl_packaged_gui_native_window_diagnostics.v1');
    expect(scriptSource).toContain('likely_alert_text');
    expect(scriptSource).toContain("commandDiagnostic('launchctl', ['print', `gui/${uid}`]");
    expect(scriptSource).toContain("commandDiagnostic('/usr/sbin/scutil', ['show', 'State:/Users/ConsoleUser']");
    expect(scriptSource).toContain('collectDiagnosticReports(options, codexApiKey)');
    expect(scriptSource).toContain("path.join(userHomeDir(), 'Library', 'Logs', 'DiagnosticReports')");
    expect(scriptSource).toContain("path.join('/Library', 'Logs', 'DiagnosticReports')");
    expect(scriptSource).toContain("path.join(defaultAppSupportPath(options.processName), 'logs')");
    expect(scriptSource).toContain("path.join(userHomeDir(), 'Library', 'Logs', 'cn.onepersonlab.opl')");
    expect(scriptSource).toContain('collectMainBootstrapFatalArtifacts(options, secret, launchLogDir)');
    expect(scriptSource).toContain("path.join(targetDir, 'main-bootstrap-fatal-candidates.json')");
    expect(scriptSource).toContain('main_bootstrap_fatal_artifacts: mainBootstrapFatalArtifacts');
    expect(vmSmoke.unifiedLogPredicate('One Person Lab')).toContain('LaunchServices');
    expect(vmSmoke.unifiedLogPredicate('One Person Lab')).toContain('runningboard');
    expect(vmSmoke.unifiedLogPredicate('One Person Lab')).toContain('syspolicyd');
  });

  it('collects early main bootstrap fatal logs from app support candidates', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-fatal-artifacts-'));
    const originalHome = process.env.HOME;
    try {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-fatal-home-'));
      process.env.HOME = home;
      const fatalLog = path.join(
        home,
        'Library',
        'Application Support',
        'One Person Lab',
        'main-bootstrap-fatal.jsonl'
      );
      fs.mkdirSync(path.dirname(fatalLog), { recursive: true });
      fs.writeFileSync(
        fatalLog,
        `${JSON.stringify({
          schema: 'aionui.main_bootstrap_fatal.v1',
          type: 'uncaughtException',
          error: { message: 'startup failure before BrowserWindow' },
        })}\n`,
        'utf8'
      );

      const summary = vmSmoke.collectMainBootstrapFatalArtifacts(
        { artifacts, processName: 'One Person Lab' },
        'secret'
      );
      expect(summary).toMatchObject({
        schema: 'aionui.main_bootstrap_fatal_artifacts.v1',
        copied_count: 1,
      });
      expect(summary.candidates).toContain(fatalLog);
      expect(summary.copied[0].target).toContain('main-bootstrap-fatal-One_Person_Lab.jsonl');
      expect(fs.readFileSync(summary.copied[0].target, 'utf8')).toContain('startup failure before BrowserWindow');
      expect(fs.existsSync(path.join(artifacts, 'launch-app', 'main-bootstrap-fatal-candidates.json'))).toBe(true);
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('detects the native modal launch blocker signature from launch diagnostics and process samples', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-modal-blocker-'));
    try {
      const launchLogDir = path.join(artifacts, 'launch-app');
      fs.mkdirSync(launchLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(launchLogDir, 'process-8503-sample.txt'),
        '2603 -[NSAlert runModal]  (in AppKit) + 196\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(launchLogDir, 'stderr.log'),
        'A JavaScript error occurred in the main process\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(launchLogDir, 'main-bootstrap-fatal-One_Person_Lab.jsonl'),
        `${JSON.stringify({
          schema: 'aionui.main_bootstrap_fatal.v1',
          error: {
            message: 'Cannot find module ./main/index.js',
            stack: 'Error: Cannot find module ./main/index.js\n    at bootstrap',
          },
        })}\n`,
        'utf8'
      );

      const result = vmSmoke.detectNativeModalLaunchBlocker(
        { artifacts },
        {
          app_processes: [
            { pid: 8503, ppid: 714, args: '/Applications/One Person Lab.app/Contents/MacOS/One Person Lab' },
          ],
          cdp_listener: { status: 1 },
          cdp_targets: {
            status: 7,
            stderr: "curl: (7) Failed to connect to 127.0.0.1 port 9230: Couldn't connect to server\n",
          },
          native_window_diagnostics: {
            target_process_found: true,
            target_process_window_count: 0,
            target_process_ui_element_count: 0,
            likely_alert_text: [
              { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
            ],
            window_title_text: [{ source: 'frontmost_window_title', text: 'Error' }],
          },
          main_bootstrap_fatal_artifacts: {
            schema: 'aionui.main_bootstrap_fatal_artifacts.v1',
            candidates: ['/Users/runner/Library/Application Support/One Person Lab/main-bootstrap-fatal.jsonl'],
            copied: [
              {
                source: 'main-bootstrap-fatal.jsonl',
                target: path.join(launchLogDir, 'main-bootstrap-fatal-One_Person_Lab.jsonl'),
              },
            ],
            copied_count: 1,
          },
        }
      );

      expect(result).toMatchObject({
        schema: 'opl_packaged_gui_native_modal_launch_blocker.v1',
        detected: true,
        cdp_absent: true,
        app_process_alive: true,
        no_native_window_surface: true,
        nsalert_run_modal_sample_found: true,
        app_pids: [8503],
      });
      expect(result.nsalert_sample_paths[0]).toContain('process-8503-sample.txt');
      expect(result.likely_alert_text).toEqual([
        { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
      ]);
      expect(result.window_title_text).toEqual([{ source: 'frontmost_window_title', text: 'Error' }]);
      expect(result.bootstrap_fatal_text).toEqual(
        expect.arrayContaining([
          { source: 'main_bootstrap_fatal.error.message', text: 'Cannot find module ./main/index.js' },
        ])
      );
      expect(result.launch_log_text).toEqual([
        { source: 'launch_stderr', text: 'A JavaScript error occurred in the main process' },
      ]);
      expect(result.main_bootstrap_fatal_artifacts.copied_count).toBe(1);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not classify ordinary CDP startup delays as native modal blockers without an NSAlert sample', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-modal-negative-'));
    try {
      fs.mkdirSync(path.join(artifacts, 'launch-app'), { recursive: true });

      const result = vmSmoke.detectNativeModalLaunchBlocker(
        { artifacts },
        {
          app_processes: [{ pid: 8503 }],
          cdp_listener: { status: 1 },
          cdp_targets: { stderr: 'connect ECONNREFUSED 127.0.0.1:9230' },
          native_window_diagnostics: {
            target_process_found: true,
            target_process_window_count: 0,
            target_process_ui_element_count: 0,
          },
        }
      );

      expect(result.detected).toBe(false);
      expect(result.nsalert_run_modal_sample_found).toBe(false);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
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

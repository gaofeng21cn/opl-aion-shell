import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';

const { __test: tartSmoke } = await import('../../../scripts/opl-first-run-tart-smoke.mjs');
const { __test: vmSmoke } = await import('../../../scripts/opl-first-run-vm-smoke.mjs');

const companionSkillIds = [
  'officecli',
  'officecli-docx',
  'officecli-pptx',
  'officecli-xlsx',
  'mineru-document-extractor',
  'ui-ux-pro-max',
];
const domainPluginFixtures = [
  { modulePath: path.join('modules', 'mas'), pluginName: 'med-autoscience', skillId: 'med-autoscience' },
  { modulePath: path.join('modules', 'mag'), pluginName: 'med-autogrant', skillId: 'med-autogrant' },
  { modulePath: path.join('modules', 'rca'), pluginName: 'redcube-ai', skillId: 'redcube-ai' },
];
const defaultTartArgs = ['--source-vm', 'clean-vm', '--dmg', '/tmp/One-Person-Lab.dmg', '--dry-run'];

function writeFile(filePath: string, content: string, mode?: number) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  if (mode) fs.chmodSync(filePath, mode);
}

function tempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function containsAll(text: string, snippets: string[]) {
  for (const snippet of snippets) expect(text).toContain(snippet);
}

function containsNone(text: string, snippets: string[]) {
  for (const snippet of snippets) expect(text).not.toContain(snippet);
}

function expectOrder(text: string, orderedSnippets: string[]) {
  for (let index = 1; index < orderedSnippets.length; index += 1) {
    expect(text.indexOf(orderedSnippets[index - 1])).toBeLessThan(text.indexOf(orderedSnippets[index]));
  }
}

function scriptSource() {
  return fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
}

function parseTart(extraArgs: string[] = []) {
  return tartSmoke.parseArgs([...defaultTartArgs, ...extraArgs]);
}

function guestCommand(
  options: unknown,
  app = '/tmp/guest/One-Person-Lab.dmg',
  sourceArchivePath?: string,
  installScriptPath?: string
) {
  return tartSmoke.guestSmokeCommand(
    options,
    app,
    '/tmp/guest/opl-first-run-vm-smoke.mjs',
    '/tmp/guest/artifacts',
    '/tmp/guest/codex-api-key.txt',
    sourceArchivePath,
    installScriptPath
  );
}

function createReadySystemInitialize() {
  return JSON.stringify({
    system_initialize: {
      setup_flow: { ready_to_launch: true, blocking_items: [] },
      readiness: { launch_ready: true, core_ready: true, domain_ready: true },
      recommended_skills: {
        skills: companionSkillIds.map((skill_id) => ({ skill_id, status: 'ready' })),
      },
    },
  });
}

function createPassedAssistantRouteSmokeSummary(assistantIds = ['med-autoscience', 'med-autogrant', 'redcube-ai']) {
  return { status: 'passed', assistants: assistantIds };
}

function createGuestSummary(overrides: Record<string, unknown> = {}) {
  return {
    status: 'passed',
    runtime_profile: 'full',
    codex_config_wizard_submitted: false,
    settings_smoke: null,
    ...overrides,
  };
}

function writeRuntimeToolShim(runtimeHome: string, command: string, output: string) {
  writeFile(path.join(runtimeHome, 'bin', command), `#!/usr/bin/env bash\necho "${output}"\n`, 0o755);
  if (process.platform === 'win32') {
    writeFile(path.join(runtimeHome, 'bin', `${command}.cmd`), `@echo off\r\necho ${output}\r\n`, 0o755);
  }
}

function writeRuntimeModule(
  runtimeHome: string,
  input: { moduleId: string; repoName: string; modulePath: string; payloadPaths: string[] }
) {
  const moduleRoot = path.join(runtimeHome, input.modulePath);
  writeFile(
    path.join(moduleRoot, 'opl-runtime-module.json'),
    `${JSON.stringify({ packaged_runtime: true, module_id: input.moduleId, repo_name: input.repoName })}\n`
  );
  for (const payloadPath of input.payloadPaths) fs.mkdirSync(path.join(moduleRoot, payloadPath), { recursive: true });
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
  const root = tempDir('opl-full-equivalence-');
  const codexHome = path.join(root, 'codex-home');
  const runtimeHome = path.join(root, 'runtime', 'current');
  for (const skillId of companionSkillIds) writeFile(path.join(runtimeHome, 'skills', skillId, 'SKILL.md'), '# x\n');
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
  for (const pluginFixture of domainPluginFixtures) writeDomainPlugin(runtimeHome, pluginFixture);
  writeRuntimeToolShim(runtimeHome, 'officecli', 'officecli 1.0.0');
  writeRuntimeToolShim(runtimeHome, 'mineru-open-api', 'mineru-open-api version 1.0.0');
  return { root, codexHome, runtimeHome };
}

function createPackagedFullRuntimeAppFixture() {
  const root = tempDir('opl-packaged-full-app-');
  const appPath = path.join(root, 'One Person Lab.app');
  const payloadRoot = path.join(appPath, 'Contents', 'Resources', 'opl-full-runtime');
  const runtimeHome = path.join(payloadRoot, 'runtime', 'current');
  fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
  writeFile(path.join(payloadRoot, 'manifest', 'full-package-manifest.json'), '{"version":"26.6.21"}\n');
  return { root, appPath, runtimeHome };
}

function createPackagedMainFixture(content: string, archive = false) {
  const root = tempDir(archive ? 'opl-packaged-main-asar-' : 'opl-packaged-main-entry-');
  const appPath = path.join(root, 'One Person Lab.app');
  const targetPath = archive
    ? path.join(appPath, 'Contents', 'Resources', 'app.asar')
    : path.join(appPath, 'Contents', 'Resources', 'app.asar', 'out', 'main', 'index.js');
  writeFile(targetPath, content);
  return { root, appPath, targetPath };
}

function createCodexPreseedFixture(prefix: string) {
  const root = tempDir(prefix);
  const tarball = path.join(root, 'codex-package.tgz');
  const platformTarball = path.join(root, 'codex-platform-package.tgz');
  const cacheDir = path.join(root, 'npm-cache');
  writeFile(tarball, 'codex package tarball\n');
  writeFile(platformTarball, 'codex platform package tarball\n');
  writeFile(path.join(cacheDir, '_cacache', 'entry'), 'cache entry\n');
  return { root, tarball, platformTarball, cacheDir };
}

describe('OPL first-run VM smoke scripts', () => {
  it('keeps profile, Codex-key, and first-launch readiness gates distinct', () => {
    expect(vmSmoke.shouldVerifyFullFirstRunEquivalence('standard')).toBe(false);
    expect(vmSmoke.shouldVerifyFullFirstRunEquivalence('full')).toBe(true);
    expect(vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'full', requireCodexConfigWizard: false })).toBe(
      false
    );
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: false,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: true,
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
    const appRoot = tempDir('opl-standard-smoke-app-');
    const appPath = path.join(appRoot, 'One Person Lab.app');
    const installerPath = path.join(appPath, 'Contents', 'Resources', 'opl-install.sh');
    try {
      writeFile(installerPath, '#!/usr/bin/env bash\nexit 0\n', 0o755);
      expect(vmSmoke.resolvePackagedStandardInstaller(appPath)).toBe(installerPath);
      expect(vmSmoke.buildStandardBootstrapCommand(installerPath)).toMatchObject({
        command: '/bin/bash',
        args: expect.arrayContaining(['--complete', '--skip-modules', '--skip-gui-open', '--no-online-runtime']),
      });
      expect(vmSmoke.resolvePackagedStandardInstaller(path.join(appRoot, 'Missing.app'))).toBeNull();
    } finally {
      fs.rmSync(appRoot, { recursive: true, force: true });
    }
  });

  it('fails fast when the packaged App lacks the main bootstrap fatal marker', () => {
    const current = createPackagedMainFixture("console.log('aionui.main_bootstrap_fatal.v1');\n");
    const old = createPackagedMainFixture("import('./index-original.js');\n");
    const archive = createPackagedMainFixture('fake asar bytes aionui.main_bootstrap_fatal.v1', true);
    const artifacts = tempDir('opl-bootstrap-marker-artifacts-');
    try {
      expect(vmSmoke.assertPackagedMainBootstrap(current.appPath, artifacts)).toMatchObject({
        fatal_marker_present: true,
      });
      expect(() => vmSmoke.assertPackagedMainBootstrap(old.appPath, artifacts)).toThrow(
        /main bootstrap fatal diagnostics marker/
      );
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'packaged-app-bootstrap-marker.json'), 'utf8'))
      ).toMatchObject({
        fatal_marker_present: false,
      });
      expect(vmSmoke.assertPackagedMainBootstrap(archive.appPath, artifacts)).toMatchObject({
        app_asar_type: 'file',
        fatal_marker_present: true,
      });
    } finally {
      for (const root of [current.root, old.root, archive.root, artifacts]) {
        fs.rmSync(root, { recursive: true, force: true });
      }
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

      const command = vmSmoke.buildOplJsonShellCommand(['system', 'initialize', '--json'], {
        appPath: fixture.appPath,
        runtimeProfile: 'full',
      });
      expect(vmSmoke.describePackagedFullRuntime(fixture.appPath)).toMatchObject({
        status: 'found',
        runtime_home: fixture.runtimeHome,
      });
      expect(command.command).toContain(path.join(fixture.runtimeHome, 'bin', 'opl'));
      expect(command.command).not.toContain('command -v opl');
      expect(
        JSON.parse(
          vmSmoke.runOplJson(['system', 'initialize', '--json'], {
            appPath: fixture.appPath,
            runtimeProfile: 'full',
          })
        )
      ).toEqual({
        ok: true,
        args: ['system', 'initialize', '--json'],
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('keeps current Settings and Runtime smoke targets on App-owned routes', () => {
    const targets = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS;
    expect(targets.map((target) => target.hash)).toEqual([
      '#/settings/general',
      '#/settings/environment',
      '#/settings/capabilities',
      '#/settings/access',
      '#/settings/appearance',
      '#/settings/advanced',
      '#/settings/about',
    ]);
    containsNone(JSON.stringify(targets), ['#/settings/overview', '#/settings/runtime', '#/settings/model']);
    expect(vmSmoke.pageReadinessExpression(targets.find((target) => target.id === 'general'))).toContain(
      '.settings-sider__item[data-settings-id="general"]'
    );
    expect(vmSmoke.pageReadinessExpression(targets.find((target) => target.id === 'about'))).toContain(
      'const navPresent = true;'
    );
    containsAll(vmSmoke.runtimeStatusReadinessExpression(), [
      "window.location.hash.startsWith('#/runtime')",
      'Project Runtime Progress',
      '项目运行进度',
      'Needs system handling',
      '需要系统处理',
      'Loaded at',
    ]);
  });

  it('keeps script-level launch, diagnostics, and release-evidence hooks wired in order', () => {
    const source = scriptSource();
    const mainSource = source.slice(source.indexOf('async function main()'));
    containsAll(source, [
      'settingsRuntimeRefresh',
      "path.join('screenshots', 'full.png')",
      'terminateExistingApp(options.processName)',
      'verify_gatekeeper_launch_policy',
      "spctl', ['--assess', '--type', 'execute', '--verbose=4'",
      'configureCodexApiKeyForSmoke',
      '--bootstrap-launch-diagnostics',
      'captureEarlyLaunchDiagnostics',
      "const OPL_CONNECT_MODULES_ARGS = ['connect', 'modules', '--json']",
      "commandDiagnostic('/usr/bin/sample'",
      'collectDiagnosticReports(options, codexApiKey)',
      'collectMainBootstrapFatalArtifacts(options, secret, launchLogDir)',
    ]);
    containsNone(source, [
      "runOplJson(['modules'])",
      "['modules.json', ['modules']]",
      'if (codesign.status !== 0 || spctl.status !== 0)',
    ]);
    expectOrder(mainSource, [
      "'install_dmg'",
      "'configure_codex_api_key'",
      "'launch_app'",
      "'bootstrap_launch_diagnostics'",
      "'wait_guid_entry'",
    ]);
    expectOrder(mainSource, ["'launch_app'", "'capture_early_launch_diagnostics'", "'wait_guid_entry'"]);
  });

  it('keeps CDP, refresh button, and Windows bash runtime probes bounded', () => {
    expect(
      vmSmoke.buildLaunchAppArgs('/Applications/One Person Lab.app', { cdpPort: 9230, settingsSmoke: false })
    ).toContain('--aionui-cdp-port=9230');
    containsAll(vmSmoke.visibleRuntimeRefreshButtonExpression(), [
      'findVisibleRuntimeRefreshButton',
      "candidate.closest('.arco-message, .arco-notification')",
      'getBoundingClientRect',
    ]);
    const prefix = vmSmoke.buildFullRuntimeCommandPrefix('C:\\Users\\tester\\runtime\\current');
    if (process.platform === 'win32') {
      expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='/c/Users/tester/runtime/current'");
      expect(prefix).not.toContain('runtime\\current');
    } else {
      expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='C:\\Users\\tester\\runtime\\current'");
    }
  });

  it('maps Tart smoke profiles, bootstrap-only diagnostics, and wizard requirements into guest commands', () => {
    for (const [extraArgs, expected] of [
      [['--runtime-profile', 'standard'], { wizard: false, profile: 'standard' }],
      [['--runtime-profile', 'full'], { wizard: false, profile: 'full' }],
      [['--runtime-profile', 'full', '--require-codex-config-wizard'], { wizard: true, profile: 'full' }],
    ] as const) {
      const options = parseTart(extraArgs);
      const command = guestCommand(
        options,
        expected.profile === 'full' ? '/tmp/guest/One-Person-Lab-Full.dmg' : undefined
      );
      expect(options.requireCodexConfigWizard).toBe(expected.wizard);
      expect(command.includes('--require-codex-config-wizard')).toBe(expected.wizard);
      const summaryCheck = expect(() =>
        tartSmoke.assertGuestSmokeSummary(options, createGuestSummary({ runtime_profile: expected.profile }))
      );
      if (expected.wizard) summaryCheck.toThrow(/Codex configuration wizard/);
      else summaryCheck.not.toThrow();
    }

    const bootstrapOnly = parseTart(['--smoke-profile', 'no-clt-clean-vm', '--bootstrap-launch-diagnostics']);
    expect(bootstrapOnly.settingsSmoke).toBe(false);
    expect(bootstrapOnly.assistantRouteSmoke).toBe(false);
    expect(tartSmoke.buildDryRunPlan(bootstrapOnly)).toMatchObject({
      bootstrap_launch_diagnostics: true,
      settings_smoke: false,
      assistant_route_smoke: false,
      cdp_port: 9230,
    });
    expect(guestCommand(bootstrapOnly)).toContain('--bootstrap-launch-diagnostics');
    expect(() => parseTart(['--bootstrap-launch-diagnostics', '--settings-smoke'])).toThrow(
      '--bootstrap-launch-diagnostics cannot be combined with secondary release smokes.'
    );
  });

  it('passes assistant route, Codex checks, guide screenshots, and deadlines through host plans', async () => {
    const assistant = parseTart(['--assistant-route-smoke']);
    expect(tartSmoke.buildDryRunPlan(assistant)).toMatchObject({ assistant_route_smoke: true, cdp_port: 9230 });
    expect(guestCommand(assistant)).toContain('--assistant-route-smoke');
    expect(() =>
      tartSmoke.assertGuestSmokeSummary(
        assistant,
        createGuestSummary({ assistant_route_smoke: createPassedAssistantRouteSmokeSummary() })
      )
    ).not.toThrow();

    const functional = parseTart(['--assistant-route-smoke', '--codex-functional-check', '--codex-ai-self-check']);
    expect(tartSmoke.buildDryRunPlan(functional)).toMatchObject({
      codex_functional_check: true,
      assistant_route_smoke: true,
      codex_ai_self_check: { requested: true, mode: 'diagnose', blocking_release_gate: false },
    });
    containsAll(guestCommand(functional), ['--assistant-route-smoke', '--codex-functional-check', '--codex-ai-self-check']);

    const guide = parseTart(['--guide-screenshots']);
    expect(tartSmoke.buildDryRunPlan(guide).guide_screenshots).toBe(true);
    expect(vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--guide-screenshots']).guideScreenshots).toBe(true);
    expect(vmSmoke.isGuideScreenshotEntryReady({ status: 'captured' })).toBe(true);
    expect(vmSmoke.isGuideScreenshotEntryReady({ status: 'failed' })).toBe(false);

    const timed = parseTart([
      '--smoke-timeout-ms',
      '900000',
      '--codex-install-phase-timeout-ms',
      '240000',
      '--codex-readiness-phase-timeout-ms',
      '360000',
    ]);
    expect(tartSmoke.buildDryRunPlan(timed).timeouts).toMatchObject({
      guest_smoke_ms: 900_000,
      guest_smoke_host_ms: 1_020_000,
      codex_install_phase_ms: 240_000,
      codex_readiness_phase_ms: 360_000,
    });
    expect(guestCommand(timed)).toContain("--codex-install-phase-timeout-ms '240000'");
    await expect(
      tartSmoke.runAsync(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
        label: 'test-long-running-child',
        timeoutMs: 50,
      })
    ).rejects.toThrow(/test-long-running-child timed out after 50ms/);
  });

  it('parses Codex preseed inputs without path leaks and forwards them into guest smokes', () => {
    const fixture = createCodexPreseedFixture('opl-codex-preseed-');
    try {
      const vmOptions = vmSmoke.parseArgs([
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-package-tarball',
        fixture.tarball,
        '--codex-platform-package-tarball',
        fixture.platformTarball,
        '--codex-npm-cache-dir',
        fixture.cacheDir,
      ]);
      expect(vmSmoke.buildCodexInstallPreseedEnv(vmOptions)).toMatchObject({
        OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: fixture.tarball,
        OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: fixture.platformTarball,
        OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: fixture.cacheDir,
      });
      const diagnostics = vmSmoke.codexInstallPreseedDiagnostics(vmOptions);
      expect(diagnostics.package_tarball.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(diagnostics)).not.toContain(fixture.root);

      const tartOptions = parseTart([
        '--guest-workdir',
        '/tmp/guest',
        '--codex-package-tarball',
        fixture.tarball,
        '--codex-platform-package-tarball',
        fixture.platformTarball,
        '--codex-npm-cache-dir',
        fixture.cacheDir,
      ]);
      expect(tartSmoke.buildDryRunPlan(tartOptions).codex_install_preseed).toMatchObject({
        requested: true,
        package_tarball: { basename: 'codex-package.tgz', guest_path: '/tmp/guest/codex-package.tgz' },
        platform_package_tarball: {
          basename: 'codex-platform-package.tgz',
          guest_path: '/tmp/guest/codex-platform-package.tgz',
        },
        npm_cache_dir: { basename: 'npm-cache', guest_path: '/tmp/guest/codex-npm-cache' },
      });
      containsAll(guestCommand(tartOptions), [
        "--codex-package-tarball '/tmp/guest/codex-package.tgz'",
        "--codex-platform-package-tarball '/tmp/guest/codex-platform-package.tgz'",
        "--codex-npm-cache-dir '/tmp/guest/codex-npm-cache'",
      ]);
      for (const [flag, value] of [
        ['--codex-package-tarball', path.join(fixture.root, 'missing.tgz')],
        ['--codex-platform-package-tarball', path.join(fixture.root, 'missing-platform.tgz')],
        ['--codex-npm-cache-dir', fixture.tarball],
      ]) {
        expect(() => vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', flag, value])).toThrow(flag.slice(2));
      }
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('keeps host timing, guest summary, and current-source archive receipts structured', () => {
    const at = (startedAtMs: number, stage: string) => ({
      stage,
      startedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
    });
    const timing = tartSmoke.buildStageTimingSummary(
      [at(1_000, 'clone_vm'), at(3_500, 'homebrew_cask_install'), at(9_000, 'run_guest_smoke')],
      12_500
    );
    expect(timing.total_elapsed_ms).toBe(11_500);
    expect(timing.slowest_stages[0]).toMatchObject({ stage: 'homebrew_cask_install', duration_ms: 5_500 });

    const functional = parseTart(['--codex-functional-check']);
    expect(() =>
      tartSmoke.assertGuestSmokeSummary(
        functional,
        createGuestSummary({ assistant_route_smoke: createPassedAssistantRouteSmokeSummary() })
      )
    ).toThrow(/Codex functional check/);
    expect(() =>
      tartSmoke.assertGuestSmokeSummary(
        parseTart(['--assistant-route-smoke']),
        createGuestSummary({
          assistant_route_smoke: createPassedAssistantRouteSmokeSummary(['med-autoscience', 'med-autogrant']),
        })
      )
    ).toThrow(/assistant route smoke/);
    expect(() =>
      tartSmoke.assertGuestSmokeSummary(
        parseTart(['--codex-ai-self-check']),
        createGuestSummary({
          assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
          codex_functional_check: {
            status: 'diagnostic_skipped',
            blocking_release_gate: { deterministic_fields_passed: true, llm_invocation_required: false },
          },
          codex_ai_self_check: {
            schema: 'opl_codex_ai_self_check_receipt.v1',
            status: 'skipped_missing_codex_config',
            blocking_release_gate: false,
          },
        })
      )
    ).not.toThrow();

    const archive = parseTart([
      '--runtime-profile',
      'standard',
      '--framework-source-archive',
      '/tmp/current-framework.tar.gz',
      '--framework-install-script',
      '/tmp/current-install.sh',
      '--guest-workdir',
      '/tmp/guest',
    ]);
    expect(tartSmoke.buildDryRunPlan(archive).framework_source_archive).toMatchObject({
      evidence_role: 'current_source_framework_archive',
      source_archive_url: 'file:///tmp/guest/current-framework.tar.gz',
      install_script_url: 'file:///tmp/guest/opl-framework-install.sh',
    });
    containsAll(guestCommand(archive, '/tmp/guest/One-Person-Lab.dmg', '/tmp/guest/current-framework.tar.gz', '/tmp/guest/opl-framework-install.sh'), [
      'launchctl setenv OPL_INSTALL_SOURCE_MODE',
      "export OPL_SOURCE_ARCHIVE_URL='file:///tmp/guest/current-framework.tar.gz'",
    ]);
  });

  it('writes failed and interrupted Tart summaries from copied guest artifacts', () => {
    for (const mode of ['failed', 'interrupted'] as const) {
      const artifacts = tempDir(`opl-tart-${mode}-summary-`);
      const options = parseTart([
        '--runtime-profile',
        'standard',
        '--settings-smoke',
        '--assistant-route-smoke',
        '--artifacts',
        artifacts,
      ]);
      try {
        writeFile(
          path.join(artifacts, 'artifacts', 'smoke-summary.json'),
          `${JSON.stringify({
            status: 'failed',
            runtime_profile: 'standard',
            labels: ['launch-app'],
            settings_smoke: { status: 'passed' },
          })}\n`
        );
        if (mode === 'failed') {
          tartSmoke.writeFailedSummary(options, '192.168.64.10', '/tmp/guest/artifacts', new Error('guest failed'));
        } else {
          tartSmoke.__setRuntimeStateForTest({
            options,
            stage: 'run_guest_smoke',
            ip: '192.168.64.10',
            guestArtifactDir: '/tmp/guest/artifacts',
            copiedArtifacts: true,
          });
          tartSmoke.writeInterruptedSummary('SIGTERM');
          tartSmoke.__resetRuntimeStateForTest();
        }
        const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));
        expect(summary).toMatchObject({
          status: mode,
          guest_ip: '192.168.64.10',
          guest_artifacts: '/tmp/guest/artifacts',
        });
        expect(summary.guest_summary.status).toBe('failed');
      } finally {
        tartSmoke.__resetRuntimeStateForTest();
        fs.rmSync(artifacts, { recursive: true, force: true });
      }
    }
  });

  it('checks Full runtime equivalence from packaged runtime payloads instead of Codex mirrors', () => {
    for (const [removePath, error] of [
      [path.join('skills', 'officecli'), /companion skill officecli/],
      [path.join('modules', 'mas', 'plugins', 'med-autoscience'), /domain plugin med-autoscience/],
    ] as const) {
      const fixture = createFullRuntimeEquivalenceFixture();
      try {
        expect(() =>
          vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
            codexHome: fixture.codexHome,
            runtimeHome: fixture.runtimeHome,
          })
        ).not.toThrow();
        expect(fs.existsSync(path.join(fixture.codexHome, 'skills', 'officecli', 'SKILL.md'))).toBe(false);
        fs.rmSync(path.join(fixture.runtimeHome, removePath), { recursive: true, force: true });
        expect(() =>
          vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
            codexHome: fixture.codexHome,
            runtimeHome: fixture.runtimeHome,
          })
        ).toThrow(error);
      } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it('stages guest Node and Homebrew cask installs with bounded retry classification', () => {
    const root = tempDir('opl-node-cache-');
    try {
      const nodeRoot = path.join(root, 'node-v22.21.1');
      writeFile(path.join(nodeRoot, 'bin', 'node'), '#!/bin/sh\n', 0o755);
      writeFile(path.join(nodeRoot, 'lib', 'node_modules', 'npm', 'package.json'), '{"name":"npm"}\n');
      const nodeOptions = parseTart(['--guest-node-root', nodeRoot, '--guest-workdir', '/tmp/guest']);
      const staging = tartSmoke.guestNodeStagingPlan(nodeOptions);
      expect(staging).toMatchObject({ strategy: 'reuse_by_content_hash', cache_root: '/tmp/guest-node-cache' });
      expect(staging.content_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(tartSmoke.buildDryRunPlan(nodeOptions).guest_node_staging).toEqual(staging);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }

    const homebrew = tartSmoke.parseArgs([
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
    const command = tartSmoke.guestHomebrewInstallCommand(homebrew);
    containsAll(command, [
      '/opt/homebrew/bin/brew',
      '"$BREW_BIN" shellenv',
      "trust --cask 'gaofeng21cn/one-person-lab/one-person-lab'",
      'xattr -dr com.apple.quarantine',
    ]);
    expect(tartSmoke.isRetryableHomebrewInstallError(new Error('curl: (18) Transferred a partial file'))).toBe(true);
    expect(tartSmoke.isRetryableHomebrewInstallError(new Error('Timed out waiting for OPL core first-launch readiness'))).toBe(
      false
    );
  });

  it('writes OPL command diagnostics without leaking secret inputs', () => {
    const artifacts = tempDir('opl-command-diagnostics-');
    try {
      const error = new vmSmoke.OplJsonCommandError('opl system configure-codex --api-key-stdin --json failed', {
        schema: 'opl_vm_smoke_opl_command_error.v1',
        args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
        command: 'opl system configure-codex --api-key-stdin --json',
        shell_command: 'command -v opl >/dev/null && opl system configure-codex --api-key-stdin --json',
        runtime_home: null,
        full_packaged_runtime: null,
        standard_bootstrap: { status: 'passed' },
        managed_opl_bin: '/Users/tester/.opl/one-person-lab/bin',
        managed_node_bin: null,
        opl_path: '/Users/tester/.opl/one-person-lab/bin/opl',
        shell_executable: '/bin/zsh',
        status: 1,
        signal: null,
        timed_out: false,
        timeout_ms: 90_000,
        stdout: '{"error":{"code":"unexpected_error"}}\n',
        stderr: 'config write failed\n',
        error: null,
      });
      const summary = vmSmoke.captureOplJsonCommandErrorArtifacts(
        path.join(artifacts, 'codex-configure.json'),
        error,
        'secret-token'
      );
      expect(summary).toMatchObject({ status: 'captured', status_code: 1, timed_out: false });
      const artifact = JSON.parse(fs.readFileSync(path.join(artifacts, 'codex-configure.json.error.json'), 'utf8'));
      expect(artifact.diagnostics).toMatchObject({
        command: 'opl system configure-codex --api-key-stdin --json',
        stderr: 'config write failed\n',
      });
      expect(JSON.stringify(summary)).not.toContain('secret-token');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('collects early bootstrap fatal logs and detects native modal launch blockers', () => {
    const artifacts = tempDir('opl-native-modal-blocker-');
    const originalHome = process.env.HOME;
    try {
      const home = tempDir('opl-bootstrap-fatal-home-');
      process.env.HOME = home;
      const fatalLog = path.join(home, 'Library', 'Application Support', 'One Person Lab', 'main-bootstrap-fatal.jsonl');
      writeFile(
        fatalLog,
        `${JSON.stringify({
          schema: 'aionui.main_bootstrap_fatal.v1',
          error: { message: 'Cannot find module ./main/index.js' },
        })}\n`
      );
      const fatalSummary = vmSmoke.collectMainBootstrapFatalArtifacts({ artifacts, processName: 'One Person Lab' }, 'secret');
      expect(fatalSummary).toMatchObject({ schema: 'aionui.main_bootstrap_fatal_artifacts.v1', copied_count: 1 });

      const launchLogDir = path.join(artifacts, 'launch-app');
      writeFile(path.join(launchLogDir, 'process-8503-sample.txt'), '2603 -[NSAlert runModal]  (in AppKit) + 196\n');
      writeFile(path.join(launchLogDir, 'stderr.log'), 'A JavaScript error occurred in the main process\n');
      const positive = vmSmoke.detectNativeModalLaunchBlocker(
        { artifacts },
        {
          app_processes: [
            { pid: 8503, ppid: 714, args: '/Applications/One Person Lab.app/Contents/MacOS/One Person Lab' },
          ],
          cdp_listener: { status: 1 },
          cdp_targets: { status: 7, stderr: 'curl: (7) Failed to connect to 127.0.0.1 port 9230' },
          native_window_diagnostics: {
            target_process_found: true,
            target_process_window_count: 0,
            target_process_ui_element_count: 0,
            likely_alert_text: [
              { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
            ],
          },
          main_bootstrap_fatal_artifacts: fatalSummary,
        }
      );
      expect(positive).toMatchObject({
        detected: true,
        cdp_absent: true,
        app_process_alive: true,
        nsalert_run_modal_sample_found: true,
      });
      fs.rmSync(path.join(launchLogDir, 'process-8503-sample.txt'));
      const negative = vmSmoke.detectNativeModalLaunchBlocker(
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
      expect(negative.detected).toBe(false);
      expect(negative.nsalert_run_modal_sample_found).toBe(false);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('classifies missing packaged Full runtime payloads as non-retryable equivalence failures', () => {
    expect(
      vmSmoke.isNonRetryableFullRuntimeEquivalenceError(
        new Error('OPL Full runtime domain plugin med-autogrant is missing packaged plugin manifest')
      )
    ).toBe(true);
    expect(
      vmSmoke.isNonRetryableFullRuntimeEquivalenceError(
        new Error('OPL first-run initialize did not report a launchable core state')
      )
    ).toBe(false);
  });
});

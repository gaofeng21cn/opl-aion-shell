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
    ).toBe(true);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: false,
        runtimeProfile: 'full',
        requireCodexConfigWizard: false,
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
    const overviewTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'overview');
    const runtimeTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'runtime');

    expect(overviewTarget?.requiredTextAny).toEqual(
      expect.arrayContaining([
        ['One Person Lab'],
        ['Open Runtime Status', '打开运行状态'],
        ['Open Runtime Settings', '打开运行设置'],
      ])
    );
    expect(JSON.stringify(overviewTarget)).not.toContain('Refresh status');
    expect(JSON.stringify(overviewTarget)).not.toContain('刷新状态');
    expect(runtimeTarget?.requiredTextAny).toEqual(
      expect.arrayContaining([['Runtime', '运行'], ['Codex CLI'], ['Temporal'], ['Foundry Modules', '智能体模块']])
    );
    expect(vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'system')?.requiredTextAny).toEqual(
      expect.arrayContaining([['OPL Developer Mode', 'OPL 开发者模式']])
    );
  });

  it('keeps runtime refresh checks in packaged Settings and Runtime smokes', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain('settingsRuntimeRefresh');
    expect(scriptSource).toContain("exerciseRuntimeRefresh(client, '#/settings/runtime')");
    expect(scriptSource).toContain("exerciseRuntimeRefresh(client, '#/runtime')");
  });

  it('terminates existing packaged app instances before launching a fresh smoke target', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain('terminate_existing_app');
    expect(scriptSource).toContain('OPL_FIRST_RUN_KEEP_EXISTING_APP');
    expect(scriptSource).toContain('terminateExistingApp(options.processName)');
    expect(scriptSource.indexOf('terminate_existing_app')).toBeLessThan(scriptSource.indexOf("'launch_app'"));
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
    expect(expression).toContain('App\\/operator Drilldown');
    expect(expression).toContain('运行状态摘要');
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

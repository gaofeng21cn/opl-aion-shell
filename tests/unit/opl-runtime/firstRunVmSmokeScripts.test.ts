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
    writeFile(path.join(codexHome, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`);
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
  writeFile(path.join(runtimeHome, 'bin', 'officecli'), '#!/usr/bin/env bash\necho "officecli 1.0.0"\n', 0o755);
  writeFile(
    path.join(runtimeHome, 'bin', 'mineru-open-api'),
    '#!/usr/bin/env bash\necho "mineru-open-api version 1.0.0"\n',
    0o755
  );
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

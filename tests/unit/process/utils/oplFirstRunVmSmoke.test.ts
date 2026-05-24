import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SmokeTestApi = {
  SETTINGS_PAGE_SMOKE_TARGETS: Array<{
    id: string;
    hash: string;
    requiredTextAny: string[][];
  }>;
  assertFullFirstRunEquivalence(systemInitializeRaw: string, modulesRaw: string): void;
  buildLaunchAppArgs(appPath: string, options: { settingsSmoke: boolean; cdpPort: number }): string[];
  buildFullRuntimeCommandPrefix(runtimeHome: string): string;
  captureMacScreenArtifact(target: string): { status: 'captured' | 'skipped'; target: string };
  findLatestFullRuntimeHome(runtimeRoot?: string): string | null;
  isFirstRunCompletionEvent(event: unknown): boolean;
  isMainModule(moduleUrl: string, argvPath?: string): boolean;
  runtimeShellExecutable(): string;
  shouldVerifyFullFirstRunEquivalence(runtimeProfile: string): boolean;
};

const tempRoots: string[] = [];
const requiredSkills = [
  'mas',
  'mag',
  'rca',
  'opl-meta-agent',
  'officecli',
  'officecli-docx',
  'officecli-pptx',
  'officecli-xlsx',
  'mineru-document-extractor',
  'ui-ux-pro-max',
];
const bundledModules = [
  ['medautoscience', 'med-autoscience', path.join('modules', 'mas'), ['agent', 'plugins']],
  ['medautogrant', 'med-autogrant', path.join('modules', 'mag'), ['agent', 'plugins']],
  ['redcube', 'redcube-ai', path.join('modules', 'rca'), ['agent', 'plugins']],
  [
    'oplmetaagent',
    'opl-meta-agent',
    path.join('modules', 'meta-agent'),
    ['agent', 'contracts', path.join('runtime', 'authority_functions')],
  ],
] as const;

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-smoke-'));
  tempRoots.push(root);
  return root;
}

function writeExecutable(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '#!/usr/bin/env bash\n', 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function writePackagedRuntimeModule(
  runtimeHome: string,
  moduleId: string,
  repoName: string,
  relativePath: string,
  payloadPaths: readonly string[]
) {
  const moduleRoot = path.join(runtimeHome, relativePath);
  for (const payloadPath of payloadPaths) {
    fs.mkdirSync(path.join(moduleRoot, payloadPath), { recursive: true });
  }
  fs.writeFileSync(
    path.join(moduleRoot, 'opl-runtime-module.json'),
    `${JSON.stringify({
      module_id: moduleId,
      repo_name: repoName,
      packaged_runtime: true,
    })}\n`,
    'utf8'
  );
}

function createFullRuntimeFixture(homeRoot: string) {
  const codexHome = path.join(homeRoot, '.codex');
  vi.stubEnv('HOME', homeRoot);
  vi.stubEnv('CODEX_HOME', codexHome);
  const runtimeRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'runtime');
  const runtimeHome = path.join(runtimeRoot, 'current');
  writeExecutable(path.join(runtimeHome, 'bin', 'opl'));
  fs.writeFileSync(
    path.join(runtimeHome, 'bin', 'officecli'),
    '#!/usr/bin/env bash\nprintf "officecli 0.0.0-test\\n"\n',
    'utf8'
  );
  fs.chmodSync(path.join(runtimeHome, 'bin', 'officecli'), 0o755);
  fs.writeFileSync(
    path.join(runtimeHome, 'bin', 'mineru-open-api'),
    '#!/usr/bin/env bash\nif [ "${1:-}" = "version" ]; then printf "mineru-open-api version v0.1.3-test\\n"; else printf "mineru-open-api test\\n"; fi\n',
    'utf8'
  );
  fs.chmodSync(path.join(runtimeHome, 'bin', 'mineru-open-api'), 0o755);
  for (const [moduleId, repoName, relativePath, payloadPaths] of bundledModules) {
    writePackagedRuntimeModule(runtimeHome, moduleId, repoName, relativePath, payloadPaths);
  }
  for (const skillId of requiredSkills) {
    fs.mkdirSync(path.join(codexHome, 'skills', skillId), { recursive: true });
    fs.writeFileSync(path.join(codexHome, 'skills', skillId, 'SKILL.md'), `# ${skillId}\n`, 'utf8');
  }
}

async function loadSmokeTestApi(): Promise<SmokeTestApi> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  const module = await import('../../../../scripts/opl-first-run-vm-smoke.mjs');
  return module.__test as SmokeTestApi;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scripts/opl-first-run-vm-smoke Full runtime CLI fallback', () => {
  it('launches packaged settings smoke with an explicit CDP startup argument', async () => {
    const api = await loadSmokeTestApi();

    expect(api.buildLaunchAppArgs('/Applications/One Person Lab.app', { settingsSmoke: true, cdpPort: 9230 })).toEqual([
      '-n',
      '/Applications/One Person Lab.app',
      '--args',
      '--force-renderer-accessibility',
      '--aionui-cdp-port=9230',
    ]);
  });

  it('expects the current OPL Agent wording for the runtime Settings route', async () => {
    const api = await loadSmokeTestApi();

    const runtimeTarget = api.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'runtime');

    expect(runtimeTarget).toMatchObject({
      hash: '#/settings/runtime',
      requiredTextAny: [['Develop OPL Agent', '开发 OPL Agent']],
    });
  });

  it('recognizes the script entrypoint through a macOS /tmp realpath alias', async () => {
    const api = await loadSmokeTestApi();
    const root = makeTempRoot();
    const scriptPath = path.join(root, 'opl-first-run-vm-smoke.mjs');
    const linkPath = path.join(root, 'script-link.mjs');

    fs.writeFileSync(scriptPath, '', 'utf8');
    fs.symlinkSync(scriptPath, linkPath);

    expect(api.isMainModule(new URL(`file://${scriptPath}`).href, linkPath)).toBe(true);
  });

  it('prefers the stable current Full runtime that contains the OPL CLI', async () => {
    const api = await loadSmokeTestApi();
    const runtimeRoot = makeTempRoot();
    const oldRuntime = path.join(runtimeRoot, '26.5.1');
    const newRuntime = path.join(runtimeRoot, '26.5.2');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const incompleteRuntime = path.join(runtimeRoot, '26.5.9');

    writeExecutable(path.join(oldRuntime, 'bin', 'opl'));
    writeExecutable(path.join(newRuntime, 'bin', 'opl'));
    writeExecutable(path.join(currentRuntime, 'bin', 'opl'));
    fs.mkdirSync(path.join(incompleteRuntime, 'bin'), { recursive: true });

    expect(api.findLatestFullRuntimeHome(runtimeRoot)).toBe(currentRuntime);
  });

  it('falls back to the runtime_home recorded in current.json', async () => {
    const api = await loadSmokeTestApi();
    const runtimeRoot = makeTempRoot();
    const runtimeHome = path.join(runtimeRoot, '26.5.1');

    writeExecutable(path.join(runtimeHome, 'bin', 'opl'));
    fs.writeFileSync(
      path.join(runtimeRoot, 'current.json'),
      `${JSON.stringify({ runtime_version: '26.5.1', runtime_home: runtimeHome })}\n`,
      'utf8'
    );

    expect(api.findLatestFullRuntimeHome(runtimeRoot)).toBe(runtimeHome);
  });

  it('does not report a Full runtime when the OPL CLI is missing', async () => {
    const api = await loadSmokeTestApi();
    const runtimeRoot = makeTempRoot();

    fs.mkdirSync(path.join(runtimeRoot, '26.5.1', 'bin'), { recursive: true });

    expect(api.findLatestFullRuntimeHome(runtimeRoot)).toBeNull();
  });

  it('builds the same OPL env prefix the packaged app uses for Full runtime commands', async () => {
    const api = await loadSmokeTestApi();
    const runtimeHome = path.join(makeTempRoot(), 'OPL Full Runtime', 'current');
    fs.mkdirSync(path.join(runtimeHome, 'python', 'cpython-3.12.13-macos-aarch64-none', 'bin'), {
      recursive: true,
    });

    const prefix = api.buildFullRuntimeCommandPrefix(runtimeHome);

    expect(prefix).toContain(`export OPL_FULL_RUNTIME_HOME='${runtimeHome}'`);
    expect(prefix).not.toContain('OPL_MODULES_ROOT');
    expect(prefix).toContain(`export OPL_MODULE_PATH_MEDAUTOSCIENCE='${path.join(runtimeHome, 'modules', 'mas')}'`);
    expect(prefix).toContain(`export OPL_MODULE_PATH_MEDAUTOGRANT='${path.join(runtimeHome, 'modules', 'mag')}'`);
    expect(prefix).toContain(`export OPL_MODULE_PATH_REDCUBE='${path.join(runtimeHome, 'modules', 'rca')}'`);
    expect(prefix).toContain(
      `export OPL_MODULE_PATH_OPLMETAAGENT='${path.join(runtimeHome, 'modules', 'meta-agent')}'`
    );
    expect(prefix).toContain(`export OPL_CODEX_BIN='${path.join(runtimeHome, 'bin', 'codex')}'`);
    expect(prefix).not.toContain('OPL_HERMES_BIN');
    expect(prefix).toContain(path.join(runtimeHome, 'python', 'cpython-3.12.13-macos-aarch64-none', 'bin'));
    expect(prefix).toContain('PATH=');
  });

  it('allows CI to run Full runtime command probes through bash when zsh is unavailable', async () => {
    vi.stubEnv('OPL_FIRST_RUN_SHELL', '/bin/bash');
    const api = await loadSmokeTestApi();

    expect(api.runtimeShellExecutable()).toBe('/bin/bash');
  });

  it('treats deferred-attention preparation as a completed core first launch', async () => {
    const api = await loadSmokeTestApi();

    expect(
      api.isFirstRunCompletionEvent({
        event_type: 'gui_preparation_completed_with_deferred_attention',
        payload: { status: 'prepared' },
      })
    ).toBe(true);
    expect(
      api.isFirstRunCompletionEvent({
        event_type: 'gui_deferred_install_failed',
        payload: { status: 'failed' },
      })
    ).toBe(false);
  });

  it('only requires Full runtime equivalence for the Full first-run profile', async () => {
    const api = await loadSmokeTestApi();

    expect(api.shouldVerifyFullFirstRunEquivalence('full')).toBe(true);
    expect(api.shouldVerifyFullFirstRunEquivalence('standard')).toBe(false);
  });

  it('skips macOS screencapture by default to avoid clean-VM Screen & System Audio prompts', async () => {
    const api = await loadSmokeTestApi();
    const root = makeTempRoot();
    const target = path.join(root, 'first-launch.png');

    const result = api.captureMacScreenArtifact(target);

    expect(result).toEqual({ status: 'skipped', target });
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readFileSync(`${target}.skipped.txt`, 'utf8')).toContain('Screen & System Audio permission prompts');
  });

  it('includes optional hermes_legacy env when the bundled binary exists', async () => {
    const api = await loadSmokeTestApi();
    const runtimeHome = path.join(makeTempRoot(), 'OPL Full Runtime', 'current');
    writeExecutable(path.join(runtimeHome, 'bin', 'hermes'));

    const prefix = api.buildFullRuntimeCommandPrefix(runtimeHome);

    expect(prefix).toContain(`export OPL_HERMES_BIN='${path.join(runtimeHome, 'bin', 'hermes')}'`);
  });

  it('asserts Full first-run modules are available from bundled runtime payloads', async () => {
    const api = await loadSmokeTestApi();
    const homeRoot = makeTempRoot();
    createFullRuntimeFixture(homeRoot);

    const systemInitializeRaw = JSON.stringify({
      system_initialize: {
        setup_flow: { ready_to_launch: true, blocking_items: [] },
        recommended_skills: {
          skills: requiredSkills.map((skillId) => ({
            skill_id: skillId,
            status: 'ready',
          })),
        },
      },
    });
    const modulesRaw = JSON.stringify({
      modules: {
        modules_root: path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state', 'modules'),
        items: [],
      },
    });

    expect(() => api.assertFullFirstRunEquivalence(systemInitializeRaw, modulesRaw)).not.toThrow();
  });

  it('accepts core-first readiness when only the family runtime provider remains deferred', async () => {
    const api = await loadSmokeTestApi();
    const homeRoot = makeTempRoot();
    createFullRuntimeFixture(homeRoot);

    const systemInitializeRaw = JSON.stringify({
      system_initialize: {
        setup_flow: {
          ready_to_launch: false,
          blocking_items: ['family_runtime_provider'],
        },
        readiness: {
          core_ready: true,
          domain_ready: true,
          launch_ready: true,
          family_runtime_provider_ready: false,
          full_ready: false,
        },
        recommended_skills: {
          skills: requiredSkills.map((skillId) => ({
            skill_id: skillId,
            status: 'ready',
          })),
        },
      },
    });
    const modulesRaw = JSON.stringify({
      modules: {
        modules_root: path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state', 'modules'),
        items: [],
      },
    });

    expect(() => api.assertFullFirstRunEquivalence(systemInitializeRaw, modulesRaw)).not.toThrow();
  });
});

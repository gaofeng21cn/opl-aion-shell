import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type TartSmokeOptions = {
  artifacts: string;
  cdpPort: number;
  display: string;
  dmg: string;
  dryRun: boolean;
  guestNodeCommand: string;
  guestNodeRoot: string;
  guestWorkdir: string;
  keepVm: boolean;
  noGraphics: boolean;
  runtimeProfile: string;
  settingsSmoke: boolean;
  smokeProfile: string;
  sourceVm: string;
  vmName: string;
};

type TartSmokeTestApi = {
  assertGuestSmokeSummary(options: TartSmokeOptions, guestSummary: unknown): void;
  buildDryRunPlan(options: TartSmokeOptions): Record<string, unknown>;
  guestSmokeCommand(
    options: TartSmokeOptions & { processName: string; smokeTimeoutMs: number },
    guestDmgPath: string,
    guestScriptPath: string,
    guestArtifactDir: string,
    guestCodexApiKeyPath: string
  ): string;
  parseArgs(argv: string[]): TartSmokeOptions;
  resolveGuestSmokeScriptPath(): string;
  writeSummary(options: TartSmokeOptions, ip: string, guestArtifactDir: string): void;
};

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-tart-smoke-'));
  tempRoots.push(root);
  return root;
}

async function loadTartSmokeTestApi(): Promise<TartSmokeTestApi> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'test');
  const module = await import('../../../../scripts/opl-first-run-tart-smoke.mjs');
  return module.__test as TartSmokeTestApi;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('scripts/opl-first-run-tart-smoke profile parsing', () => {
  it('resolves the no-CLT clean VM profile to the fast standard Settings sweep', async () => {
    const api = await loadTartSmokeTestApi();
    const artifacts = path.join(makeTempRoot(), 'artifacts');

    const options = api.parseArgs([
      '--dry-run',
      '--source-vm',
      'opl-clean-node',
      '--dmg',
      './missing-release.dmg',
      '--artifacts',
      artifacts,
      '--smoke-profile',
      'no-clt-clean-vm',
    ]);

    expect(options).toMatchObject({
      sourceVm: 'opl-clean-node',
      artifacts,
      dryRun: true,
      smokeProfile: 'no-clt-clean-vm',
      runtimeProfile: 'standard',
      settingsSmoke: true,
      display: '1920x1080px',
      guestNodeCommand: 'node',
    });
  });

  it('keeps explicit runtime and Node overrides when a profile is selected', async () => {
    const api = await loadTartSmokeTestApi();

    const options = api.parseArgs([
      '--dry-run',
      '--source-vm',
      'opl-clean-node',
      '--dmg',
      './missing-release.dmg',
      '--smoke-profile',
      'no-clt-clean-vm',
      '--runtime-profile',
      'full',
      '--guest-node-command',
      '/opt/node/bin/node',
    ]);

    expect(options.runtimeProfile).toBe('full');
    expect(options.guestNodeCommand).toBe('/opt/node/bin/node');
  });

  it('accepts a host Node root for deterministic clean VM harness setup', async () => {
    const api = await loadTartSmokeTestApi();
    const nodeRoot = makeTempRoot();
    fs.mkdirSync(path.join(nodeRoot, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(nodeRoot, 'bin', 'node'), '#!/usr/bin/env bash\n', 'utf8');

    const options = api.parseArgs([
      '--dry-run',
      '--source-vm',
      'opl-clean-node',
      '--dmg',
      './missing-release.dmg',
      '--smoke-profile',
      'full-gate',
      '--guest-node-root',
      nodeRoot,
    ]);

    expect(options.guestNodeRoot).toBe(nodeRoot);
    expect(api.buildDryRunPlan(options)).toMatchObject({
      guest_node_root: nodeRoot,
    });
  });

  it('rejects an unknown smoke profile before Tart is touched', async () => {
    const api = await loadTartSmokeTestApi();

    expect(() =>
      api.parseArgs([
        '--dry-run',
        '--source-vm',
        'opl-clean-node',
        '--dmg',
        './missing-release.dmg',
        '--smoke-profile',
        'fast-ish',
      ])
    ).toThrow('--smoke-profile must be one of');
  });
});

describe('scripts/opl-first-run-tart-smoke dry-run and artifact criteria', () => {
  it('resolves the guest smoke script independently of process cwd', async () => {
    const api = await loadTartSmokeTestApi();
    const originalCwd = process.cwd();
    const cwd = makeTempRoot();
    process.chdir(cwd);
    try {
      expect(api.resolveGuestSmokeScriptPath()).toMatch(/scripts[/\\]opl-first-run-vm-smoke\.mjs$/);
      expect(fs.existsSync(api.resolveGuestSmokeScriptPath())).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('builds a dry-run plan without requiring the release DMG to exist', async () => {
    const api = await loadTartSmokeTestApi();
    const options = api.parseArgs([
      '--dry-run',
      '--source-vm',
      'opl-clean-node',
      '--dmg',
      './missing-release.dmg',
      '--smoke-profile',
      'no-clt-clean-vm',
    ]);

    expect(api.buildDryRunPlan(options)).toMatchObject({
      surface_id: 'opl_tart_gui_first_run_smoke_plan',
      status: 'dry_run',
      smoke_profile: 'no-clt-clean-vm',
      settings_smoke: true,
      runtime_profile: 'standard',
      guest_node_command: 'node',
      display: '1920x1080px',
    });
  });

  it('passes the resolved standard Settings sweep to the guest smoke command', async () => {
    const api = await loadTartSmokeTestApi();
    const options = {
      ...api.parseArgs([
        '--dry-run',
        '--source-vm',
        'opl-clean-node',
        '--dmg',
        './missing-release.dmg',
        '--smoke-profile',
        'no-clt-clean-vm',
      ]),
      processName: 'One Person Lab',
      smokeTimeoutMs: 180_000,
    };

    const command = api.guestSmokeCommand(
      options,
      '/tmp/opl/One-Person-Lab.dmg',
      '/tmp/opl/opl-first-run-vm-smoke.mjs',
      '/tmp/opl/artifacts',
      '/tmp/opl/codex-api-key.txt'
    );

    expect(command).toContain("'node' '/tmp/opl/opl-first-run-vm-smoke.mjs'");
    expect(command).toContain('--settings-smoke');
    expect(command).toContain("--runtime-profile 'standard'");
  });

  it('fails summary validation when Settings smoke did not pass', async () => {
    const api = await loadTartSmokeTestApi();
    const options = api.parseArgs([
      '--dry-run',
      '--source-vm',
      'opl-clean-node',
      '--dmg',
      './missing-release.dmg',
      '--smoke-profile',
      'no-clt-clean-vm',
    ]);

    expect(() =>
      api.assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: true,
        settings_smoke: { status: 'failed', pages: [] },
      })
    ).toThrow('Guest Settings smoke did not pass.');
  });

  it('writes a host summary only after guest artifact criteria pass', async () => {
    const api = await loadTartSmokeTestApi();
    const root = makeTempRoot();
    const artifacts = path.join(root, 'host-artifacts');
    fs.mkdirSync(path.join(artifacts, 'artifacts'), { recursive: true });
    fs.writeFileSync(
      path.join(artifacts, 'artifacts', 'smoke-summary.json'),
      `${JSON.stringify({
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_seen: true,
        codex_config_wizard_submitted: true,
        codex_api_key_present: true,
        labels: ['One Person Lab'],
        settings_smoke: { status: 'passed', pages: ['overview'] },
      })}\n`,
      'utf8'
    );
    const options = api.parseArgs([
      '--dry-run',
      '--source-vm',
      'opl-clean-node',
      '--dmg',
      './missing-release.dmg',
      '--artifacts',
      artifacts,
      '--smoke-profile',
      'no-clt-clean-vm',
    ]);

    api.writeSummary(options, '192.0.2.10', '/tmp/opl-first-run-smoke/artifacts');

    expect(JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'))).toMatchObject({
      status: 'passed',
      smoke_profile: 'no-clt-clean-vm',
      runtime_profile: 'standard',
      display: '1920x1080px',
      settings_smoke: { status: 'passed', pages: ['overview'] },
    });
  });
});

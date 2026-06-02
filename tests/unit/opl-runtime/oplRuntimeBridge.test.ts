import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { __oplRuntimeBridgeTest } from '@/process/bridge/oplRuntimeBridge';

const tmpRoots: string[] = [];

function makeTempRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('OPL runtime bridge command whitelist', () => {
  it('declares the shell bridge as a replaceable adapter for the App-owned runtime bridge contract', () => {
    expect(__oplRuntimeBridgeTest.OPL_RUNTIME_BRIDGE_ADAPTER_CONTRACT).toEqual({
      adapterId: 'aionui',
      adapterRole: 'replaceable_gui_shell_adapter',
      appContractOwner: 'one-person-lab-app',
      protocolOwner: 'one-person-lab',
      implementationRepo: 'opl-aion-shell',
      contractRef: 'one-person-lab-app/contracts/app-runtime-bridge.json',
      guiProductContractRef: 'one-person-lab-app/contracts/app-gui-product-contract.json',
      ownsRuntimeTruth: false,
      ownsDomainTruth: false,
      readsArtifactBody: false,
      readsMemoryBody: false,
      primarySurfaces: [
        'opl app state --profile fast --json',
        'opl app state --profile full --json',
        'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
      ],
      diagnosticExceptionSurfaces: [
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
      ],
      allowedSurfaces: [
        'opl app state --profile fast --json',
        'opl app state --profile full --json',
        'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
        'opl system initialize --json',
        'opl install --skip-gui-open --skip-modules --skip-native-helper-repair --json',
        'opl system configure-codex --api-key-stdin --json',
        'opl system startup-maintenance --json',
        'opl system reconcile-modules --json',
      ],
      forbiddenTruthSources: [
        'direct_domain_repo_reads',
        'direct_runtime_state_file_reads',
        'direct_opl_modules_page_aggregation',
        'direct_opl_system_developer_supervisor_page_aggregation',
        'direct_family_runtime_worker_status_page_aggregation',
        'domain_artifact_body_reads',
        'domain_memory_body_reads',
        'shell_private_runtime_status',
      ],
    });
  });

  it('builds fast and full App state commands', () => {
    expect(__oplRuntimeBridgeTest.buildAppStateCommand('fast')).toEqual({
      surface: 'app_state_fast',
      args: ['app', 'state', '--profile', 'fast', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildAppStateCommand('full')).toEqual({
      surface: 'app_state_full',
      args: ['app', 'state', '--profile', 'full', '--json'],
    });
  });

  it('builds the declared summary and full drilldown projection commands', () => {
    expect(__oplRuntimeBridgeTest.buildDrilldownCommand('summary')).toEqual({
      surface: 'runtime_summary',
      args: ['runtime', 'app-operator-drilldown', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildDrilldownCommand('full')).toEqual({
      surface: 'runtime_full',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    });
  });

  it('rejects unsafe action identifiers before spawning opl', () => {
    expect(() => __oplRuntimeBridgeTest.assertActionId('stage-production:mas/analysis_campaign')).not.toThrow();
    expect(() => __oplRuntimeBridgeTest.assertActionId('stage-production;rm -rf /')).toThrow(
      /Invalid OPL runtime action id/
    );
  });

  it('keeps action execution on the App action boundary', () => {
    expect(
      __oplRuntimeBridgeTest.buildActionCommand({
        actionId: 'stage-production:mas/analysis_campaign',
        dryRun: true,
        payloadRefsOnlyJson: { receipt_ref: 'receipt://one' },
      })
    ).toEqual({
      surface: 'app_action',
      args: [
        'app',
        'action',
        'execute',
        '--action',
        'stage-production:mas/analysis_campaign',
        '--dry-run',
        '--payload',
        '{"receipt_ref":"receipt://one"}',
        '--json',
      ],
    });
  });

  it('builds the first-run command surface without allowing arbitrary shell commands', () => {
    expect(__oplRuntimeBridgeTest.buildInitializeCommand()).toEqual({
      surface: 'system_initialize',
      args: ['system', 'initialize', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildInstallPrepCommand()).toEqual({
      surface: 'install_prep',
      args: ['install', '--skip-gui-open', '--skip-modules', '--skip-native-helper-repair', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildStartupMaintenanceCommand()).toEqual({
      surface: 'startup_maintenance',
      args: ['system', 'startup-maintenance', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildReconcileModulesCommand()).toEqual({
      surface: 'reconcile_modules',
      args: ['system', 'reconcile-modules', '--json'],
    });
  });

  it('limits App-managed bootstrap to first-run and maintenance command surfaces', () => {
    expect(__oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(__oplRuntimeBridgeTest.buildInitializeCommand())).toBe(
      true
    );
    expect(__oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(__oplRuntimeBridgeTest.buildInstallPrepCommand())).toBe(
      true
    );
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(
        __oplRuntimeBridgeTest.buildConfigureCodexCommand({ apiKey: 'secret' })
      )
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(__oplRuntimeBridgeTest.buildStartupMaintenanceCommand())
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(__oplRuntimeBridgeTest.buildReconcileModulesCommand())
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(__oplRuntimeBridgeTest.buildAppStateCommand('fast'))
    ).toBe(false);
  });

  it('runs the packaged App installer as the standard bootstrap carrier without enabling module or GUI install loops', () => {
    expect(__oplRuntimeBridgeTest.buildStandardBootstrapCommand('/opt/One Person Lab/opl-install.sh')).toEqual({
      command: '/bin/bash',
      args: [
        '/opt/One Person Lab/opl-install.sh',
        '--complete',
        '--skip-modules',
        '--skip-gui-open',
        '--skip-native-helper-repair',
        '--no-online-runtime',
      ],
      redactedCommand:
        '/bin/bash <packaged-opl-install.sh> --complete --skip-modules --skip-gui-open --skip-native-helper-repair --no-online-runtime',
    });
  });

  it('adds the managed OPL checkout and managed Node toolchain to PATH after standard bootstrap', () => {
    const homeDir = makeTempRoot('opl-standard-bootstrap-home');
    const installDir = path.join(homeDir, '.opl', 'one-person-lab');
    const nodeBin = path.join(homeDir, '.opl', 'toolchain', 'node-v22.21.1-darwin-arm64', 'bin');
    const managedPackageRoot = path.join(
      homeDir,
      '.opl',
      'toolchain',
      'node-v22.21.1-darwin-arm64',
      'lib',
      'node_modules',
      'opl-framework-shared'
    );
    fs.mkdirSync(path.join(installDir, 'bin'), { recursive: true });
    fs.mkdirSync(nodeBin, { recursive: true });
    fs.mkdirSync(path.join(managedPackageRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(managedPackageRoot, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(managedPackageRoot, 'bin', 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(managedPackageRoot, 'dist', 'cli.js'), 'console.log("opl")\n', 'utf8');
    fs.symlinkSync(path.join(managedPackageRoot, 'bin', 'opl'), path.join(installDir, 'bin', 'opl'));
    fs.writeFileSync(path.join(nodeBin, 'node'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(nodeBin, 'npm'), '#!/usr/bin/env bash\n', 'utf8');

    const env = __oplRuntimeBridgeTest.buildStandardBootstrapEnv({
      baseEnv: { HOME: homeDir, PATH: '/usr/bin:/bin' },
      platform: 'darwin',
      arch: 'arm64',
    });

    const entries = env.PATH?.split(path.delimiter) ?? [];
    expect(entries.slice(0, 2)).toEqual([path.join(installDir, 'bin'), nodeBin]);
    expect(entries).toContain('/usr/bin');
    expect(entries).toContain('/bin');
    expect(new Set(entries).size).toBe(entries.length);
  });

  it('does not let a broken managed Node opl shim shadow a working system opl', () => {
    const homeDir = makeTempRoot('opl-broken-managed-shim-home');
    const nodeBin = path.join(homeDir, '.opl', 'toolchain', 'node-v22.21.1-darwin-arm64', 'bin');
    const brokenPackageBin = path.join(
      homeDir,
      '.opl',
      'toolchain',
      'node-v22.21.1-darwin-arm64',
      'lib',
      'node_modules',
      'opl-framework-shared',
      'bin'
    );
    fs.mkdirSync(nodeBin, { recursive: true });
    fs.mkdirSync(brokenPackageBin, { recursive: true });
    fs.writeFileSync(path.join(nodeBin, 'node'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(nodeBin, 'npm'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(brokenPackageBin, 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.symlinkSync('../lib/node_modules/opl-framework-shared/bin/opl', path.join(nodeBin, 'opl'));

    const env = __oplRuntimeBridgeTest.buildStandardBootstrapEnv({
      baseEnv: { HOME: homeDir, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
      platform: 'darwin',
      arch: 'arm64',
    });

    const entries = env.PATH?.split(path.delimiter) ?? [];
    expect(entries).not.toContain(nodeBin);
    expect(entries.indexOf('/opt/homebrew/bin')).toBeLessThan(entries.indexOf('/usr/bin'));
  });

  it('injects Full runtime environment into first-run bridge commands when a packaged runtime is active', () => {
    const homeDir = makeTempRoot('opl-full-runtime-bridge-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'uv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'hermes'), '#!/usr/bin/env bash\n', 'utf8');

    const env = __oplRuntimeBridgeTest.buildOplCommandEnv({
      baseEnv: {
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_FULL_RUNTIME_HOME: runtimeHome,
      },
      platform: 'darwin',
      arch: 'arm64',
    });

    expect(env.OPL_FULL_RUNTIME_HOME).toBe(runtimeHome);
    expect(env.OPL_PACKAGED_SKILLS_ROOT).toBe(path.join(runtimeHome, 'skills'));
    expect(env.OPL_CODEX_BIN).toBe(path.join(runtimeHome, 'bin', 'codex'));
    expect(env.OPL_FAMILY_RUNTIME_PROVIDER).toBe('temporal');
    expect(env.OPL_MODULE_PATH_MEDAUTOSCIENCE).toBe(path.join(runtimeHome, 'modules', 'mas'));
    expect(env.OPL_MODULE_PATH_MEDAUTOGRANT).toBe(path.join(runtimeHome, 'modules', 'mag'));
    expect(env.OPL_MODULE_PATH_REDCUBE).toBe(path.join(runtimeHome, 'modules', 'rca'));
    expect(env.OPL_MODULE_PATH_OPLMETAAGENT).toBe(path.join(runtimeHome, 'modules', 'meta-agent'));
    expect(env.OPL_HERMES_BIN).toBe(path.join(runtimeHome, 'bin', 'hermes'));
    expect(env.PATH?.split(path.delimiter).slice(0, 3)).toEqual([
      path.join(runtimeHome, 'bin'),
      path.join(runtimeHome, 'node', 'bin'),
      path.join(runtimeHome, 'uv', 'bin'),
    ]);
  });

  it('sends Codex API keys only through stdin and keeps the command redacted', () => {
    expect(__oplRuntimeBridgeTest.buildConfigureCodexCommand({ apiKey: ' secret-key ' })).toEqual({
      surface: 'configure_codex',
      args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
      stdin: 'secret-key\n',
      redactedCommand: 'opl system configure-codex --api-key-stdin --json',
    });
    expect(() => __oplRuntimeBridgeTest.buildConfigureCodexCommand({ apiKey: '   ' })).toThrow(
      /Codex API key is required/
    );
  });

  it('returns structured command failures so renderer pages do not wait forever', () => {
    expect(
      __oplRuntimeBridgeTest.commandFailureResult(
        { surface: 'app_state_fast', args: ['app', 'state', '--profile', 'fast', '--json'] },
        'opl app state --profile fast --json',
        'OPL runtime command failed (2): bad args',
        {
          stderr: 'bad args',
          exitCode: 2,
        }
      )
    ).toEqual({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '',
      parsed: null,
      ok: false,
      error: {
        message: 'OPL runtime command failed (2): bad args',
        stderr: 'bad args',
        exitCode: 2,
      },
    });
  });
});

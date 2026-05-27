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
      allowedSurfaces: [
        'opl app state --profile fast --json',
        'opl app state --profile full --json',
        'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
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

  it('builds only the declared full drilldown exception command', () => {
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
    expect(__oplRuntimeBridgeTest.shouldAutoBootstrapOplCommand(__oplRuntimeBridgeTest.buildAppStateCommand('fast'))).toBe(
      false
    );
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
    fs.mkdirSync(path.join(installDir, 'bin'), { recursive: true });
    fs.mkdirSync(nodeBin, { recursive: true });
    fs.writeFileSync(path.join(installDir, 'bin', 'opl'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(nodeBin, 'node'), '#!/usr/bin/env bash\n', 'utf8');
    fs.writeFileSync(path.join(nodeBin, 'npm'), '#!/usr/bin/env bash\n', 'utf8');

    const env = __oplRuntimeBridgeTest.buildStandardBootstrapEnv({
      baseEnv: { HOME: homeDir, PATH: '/usr/bin:/bin' },
    });

    const entries = env.PATH?.split(path.delimiter) ?? [];
    expect(entries.slice(0, 2)).toEqual([path.join(installDir, 'bin'), nodeBin]);
    expect(entries).toContain('/usr/bin');
    expect(entries).toContain('/bin');
    expect(new Set(entries).size).toBe(entries.length);
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
});

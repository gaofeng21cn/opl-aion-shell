import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __oplRuntimeBridgeTest,
  runDesktopStartupMaintenance,
  runStartupMaintenanceForHost,
} from '@/process/bridge/oplRuntimeBridge';

const tmpRoots: string[] = [];
const MANAGED_UPDATE_READ_TIMEOUT_MS = 120_000;

function makeTempRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tmpRoots.push(root);
  return root;
}

function makeFrameworkCarrier(packageRoot: string, version = '26.6.27', apiVersion = 'p19.stage-runtime'): void {
  fs.mkdirSync(path.join(packageRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'dist', 'entrypoints'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'contracts', 'opl-framework'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'node_modules', '@temporalio', 'common'), { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'opl-framework', version }), 'utf8');
  fs.writeFileSync(path.join(packageRoot, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
  fs.writeFileSync(path.join(packageRoot, 'dist', 'entrypoints', 'cli.js'), 'console.log("opl")\n', 'utf8');
  fs.writeFileSync(
    path.join(packageRoot, 'contracts', 'opl-framework', 'public-surface-index.json'),
    JSON.stringify({ version: apiVersion }),
    'utf8'
  );
}

function makeCaskReceipt(caskroomRoot: string, token = 'one-person-lab'): void {
  fs.mkdirSync(path.join(caskroomRoot, token, '26.6.27'), { recursive: true });
}

afterEach(() => {
  __oplRuntimeBridgeTest.resetStandardBootstrapForTest();
  __oplRuntimeBridgeTest.resetDesktopStartupMaintenanceForTest();
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
      defaultOperatorPayload: 'current_owner_delta',
      defaultReadSurfacePolicy: {
        defaultProjection: 'opl_current_owner_delta',
        sourcePath: 'app_state.operator.default_read_surface_policy',
        fullDetailPolicy: 'explicit_full_detail_or_lazy_diagnostic_only',
        rawRefsPolicy: 'raw_refs_require_explicit_full_detail',
        fullDetailAutoPoll: false,
        shellMustNotUseFullDrilldownAsNormalState: true,
        shellMustNotDeriveLayoutFromRawRuntimeProjection: true,
        forbiddenDefaultStateFields: [
          'runtime_tray_snapshot',
          'raw_evidence_envelope',
          'stage_replay_packet_body',
          'private_residue_inventory_body',
          'provider_internal_ledger_body',
        ],
      },
      primarySurfaces: [
        'opl app state --profile fast --json',
        'opl app state --profile full --json',
        'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json',
        'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
      ],
      diagnosticExceptionSurfaces: [
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
      ],
      allowedSurfaces: [
        'opl app state --profile fast --json',
        'opl app state --profile full --json',
        'opl app view read --item-id <canonical-item-id> --view-id <view-id> [--if-revision <revision>] --json',
        'opl app action execute --action <id> [--payload refs-only-json] [--dry-run] --json',
        'opl runtime app-operator-drilldown --json',
        'opl runtime app-operator-drilldown --detail full --json',
        'opl system initialize --events --json',
        'opl system initialize --json',
        'opl install --headless --skip-packages --json',
        'opl system configure-codex --api-key-stdin --json',
        'opl connect gateway login --credentials-stdin --json',
        'opl system startup-maintenance --json',
        'opl system reconcile-modules --json',
        'opl update status --json',
        'opl update check --json',
        'opl update plan --json',
        'opl update apply --json',
        'opl update repair [--receipt <receipt_id>] --json',
        'opl update rollback --json',
        'opl packages update --package-id <package_id> --json',
        'opl packages optimize opl-flow --json',
        'opl packages repair --package-id <package_id> --json',
        'opl packages rollback --package-id <package_id> --json',
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

  it('builds an item-scoped domain detail read without accepting paths or unsafe ids', () => {
    expect(
      __oplRuntimeBridgeTest.buildDomainDetailViewCommand({
        itemId: 'diabetes:001',
        viewId: 'scientific-reasoning',
        ifRevision: 7,
      })
    ).toEqual({
      surface: 'domain_detail_view',
      args: [
        'app',
        'view',
        'read',
        '--item-id',
        'diabetes:001',
        '--view-id',
        'scientific-reasoning',
        '--if-revision',
        '7',
        '--json',
      ],
      maxStdoutBytes: 9437184,
    });
    expect(() =>
      __oplRuntimeBridgeTest.buildDomainDetailViewCommand({
        itemId: '../../private/study',
        viewId: 'scientific-reasoning',
      })
    ).toThrow(/Invalid OPL domain detail item id/);
    expect(() =>
      __oplRuntimeBridgeTest.buildDomainDetailViewCommand({
        itemId: 'diabetes:001',
        viewId: 'scientific-reasoning;rm',
      })
    ).toThrow(/Invalid OPL domain detail view id/);
    for (const ifRevision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
      expect(() =>
        __oplRuntimeBridgeTest.buildDomainDetailViewCommand({
          itemId: 'diabetes:001',
          viewId: 'scientific-reasoning',
          ifRevision,
        })
      ).toThrow(/Invalid OPL domain detail revision/);
    }
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

  it('sends user-authored action payloads over stdin with a redacted command', () => {
    expect(
      __oplRuntimeBridgeTest.buildActionCommand({
        actionId: 'codex_user_instructions_set',
        dryRun: false,
        payloadJson: { content: 'Private user instruction.', expected_sha256: null },
      })
    ).toEqual({
      surface: 'app_action',
      args: ['app', 'action', 'execute', '--action', 'codex_user_instructions_set', '--payload-stdin', '--json'],
      stdin: '{"content":"Private user instruction.","expected_sha256":null}',
      redactedCommand: 'opl app action execute --action codex_user_instructions_set --payload-stdin --json',
    });
  });

  it('builds the first-run command surface without allowing arbitrary shell commands', () => {
    expect(__oplRuntimeBridgeTest.buildInitializeCommand()).toEqual({
      surface: 'system_initialize',
      args: ['system', 'initialize', '--events', '--json'],
      redactedCommand: 'opl system initialize --events --json',
      timeoutMs: 120_000,
    });
    expect(__oplRuntimeBridgeTest.buildInitializeFallbackCommand()).toEqual({
      surface: 'system_initialize',
      args: ['system', 'initialize', '--json'],
      redactedCommand: 'opl system initialize --json',
      timeoutMs: 120_000,
    });
    expect(__oplRuntimeBridgeTest.buildInstallPrepCommand()).toEqual({
      surface: 'install_prep',
      args: ['install', '--headless', '--skip-packages', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildStartupMaintenanceCommand()).toEqual({
      surface: 'startup_maintenance',
      args: ['system', 'startup-maintenance', '--json'],
      timeoutMs: 120_000,
    });
    expect(__oplRuntimeBridgeTest.buildReconcileModulesCommand()).toEqual({
      surface: 'reconcile_modules',
      args: ['system', 'reconcile-modules', '--json'],
    });
  });

  it('builds the managed update command surface without allowing arbitrary update arguments', () => {
    expect(__oplRuntimeBridgeTest.buildUpdateStatusCommand()).toEqual({
      surface: 'update_status',
      args: ['update', 'status', '--json'],
      timeoutMs: MANAGED_UPDATE_READ_TIMEOUT_MS,
    });
    expect(__oplRuntimeBridgeTest.buildUpdateCheckCommand()).toEqual({
      surface: 'update_check',
      args: ['update', 'check', '--json'],
      timeoutMs: MANAGED_UPDATE_READ_TIMEOUT_MS,
    });
    expect(__oplRuntimeBridgeTest.buildUpdatePlanCommand()).toEqual({
      surface: 'update_plan',
      args: ['update', 'plan', '--json'],
      timeoutMs: MANAGED_UPDATE_READ_TIMEOUT_MS,
    });
    expect(__oplRuntimeBridgeTest.buildUpdateApplyPlanCommand()).toEqual({
      surface: 'update_apply',
      args: ['update', 'apply', '--json'],
      timeoutMs: 900_000,
    });
    expect(__oplRuntimeBridgeTest.buildUpdateApplyCommand({ componentId: 'opl_base' })).toEqual({
      surface: 'update_apply',
      args: ['update', 'apply', '--json'],
      timeoutMs: 900_000,
    });
    expect(
      __oplRuntimeBridgeTest.buildUpdateRepairCommand({
        componentId: 'opl_base',
        receiptId: 'receipt://opl_base/latest',
      })
    ).toEqual({
      surface: 'update_repair',
      args: ['update', 'repair', '--receipt', 'receipt://opl_base/latest', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildUpdateApplyCommand({ componentId: 'opl_packages', packageId: 'oma' })).toEqual({
      surface: 'update_apply',
      args: ['packages', 'update', '--package-id', 'oma', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildUpdateRepairCommand({ componentId: 'opl_packages', packageId: 'oma' })).toEqual({
      surface: 'update_repair',
      args: ['packages', 'repair', '--package-id', 'oma', '--json'],
    });
    expect(__oplRuntimeBridgeTest.buildUpdateRollbackCommand({ componentId: 'opl_base' })).toEqual({
      surface: 'update_rollback',
      args: ['update', 'rollback', '--json'],
    });
    expect(() =>
      __oplRuntimeBridgeTest.buildUpdateApplyCommand({ componentId: 'opl_packages', packageId: 'oma;rm -rf /' })
    ).toThrow(/Invalid OPL package id/);
    expect(() => __oplRuntimeBridgeTest.buildUpdateApplyCommand({ componentId: 'runtime_substrate' as never })).toThrow(
      /managed update lifecycle id/
    );
    expect(() => __oplRuntimeBridgeTest.buildUpdateApplyCommand({ componentId: 'opl_app' })).toThrow(
      /host or carrier updater/
    );
    expect(() =>
      __oplRuntimeBridgeTest.buildUpdateRepairCommand({
        componentId: 'opl_base',
        receiptId: 'receipt://runtime latest',
      })
    ).toThrow(/Invalid OPL update receipt id/);
    expect(() => __oplRuntimeBridgeTest.buildUpdateApplyCommand({ componentId: 'opl_packages' })).toThrow(
      /Invalid OPL package id/
    );
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

  it('auto-repairs legacy Full runtime wrappers only when managed update falls through to Codex update', () => {
    const legacyPassthrough = new Error(
      "OPL runtime command failed (2): error: unexpected argument 'status' found\nUsage: codex update [OPTIONS]"
    );
    const ordinaryUpdateFailure = new Error('OPL runtime command failed (1): managed update lock is held');
    const appStateFailure = new Error(
      "OPL runtime command failed (2): error: unexpected argument 'state' found\nUsage: codex app [OPTIONS]"
    );

    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildUpdateStatusCommand(),
        legacyPassthrough
      )
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildUpdateStatusCommand(),
        ordinaryUpdateFailure
      )
    ).toBe(false);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
        appStateFailure
      )
    ).toBe(false);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildInitializeCommand(),
        new Error('The Framework-managed OPL base carrier is missing.')
      )
    ).toBe(true);
    const missingManagedDependency = new Error(
      "OPL runtime command failed (1): Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@temporalio/common'"
    );
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildInitializeCommand(),
        missingManagedDependency
      )
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
        missingManagedDependency
      )
    ).toBe(true);
  });

  it('detects older OPL runtimes that do not support initialize event streaming', () => {
    const unsupported = new Error('OPL runtime command failed (2): Unexpected positional argument: --events.');
    const ordinaryFailure = new Error('OPL runtime command failed (3): contract_shape_invalid');

    expect(
      __oplRuntimeBridgeTest.isInitializeEventsUnsupportedError(
        __oplRuntimeBridgeTest.buildInitializeCommand(),
        unsupported
      )
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.isInitializeEventsUnsupportedError(
        __oplRuntimeBridgeTest.buildInitializeCommand(),
        ordinaryFailure
      )
    ).toBe(false);
    expect(
      __oplRuntimeBridgeTest.isInitializeEventsUnsupportedError(
        __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
        unsupported
      )
    ).toBe(false);
  });

  it('runs the packaged App installer as the standard bootstrap carrier without enabling module or GUI install loops', () => {
    expect(__oplRuntimeBridgeTest.buildStandardBootstrapCommand('/opt/One Person Lab/opl-install.sh')).toEqual({
      command: '/bin/bash',
      args: ['/opt/One Person Lab/opl-install.sh', '--headless', '--skip-packages'],
      redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
    });
  });

  it('deduplicates concurrent standard bootstrap requests and retries after failure', async () => {
    __oplRuntimeBridgeTest.resetStandardBootstrapForTest();
    let completeBootstrap!: () => void;
    const bootstrap = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          completeBootstrap = resolve;
        })
    );

    const first = __oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(bootstrap);
    const second = __oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(bootstrap);
    expect(second).toBe(first);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    completeBootstrap();
    await Promise.all([first, second]);

    await __oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(bootstrap);
    expect(bootstrap).toHaveBeenCalledTimes(1);

    __oplRuntimeBridgeTest.resetStandardBootstrapForTest();
    const retryableBootstrap = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('git index lock'))
      .mockResolvedValueOnce();
    await expect(__oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(retryableBootstrap)).rejects.toThrow(
      'git index lock'
    );
    await expect(__oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(retryableBootstrap)).resolves.toBeUndefined();
    expect(retryableBootstrap).toHaveBeenCalledTimes(2);
  });

  it('does not retain a synchronously failed standard bootstrap request', async () => {
    const retryableBootstrap = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error('installer missing');
      })
      .mockResolvedValueOnce();

    await expect(__oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(retryableBootstrap)).rejects.toThrow(
      'installer missing'
    );
    await expect(__oplRuntimeBridgeTest.runStandardBootstrapSingleFlight(retryableBootstrap)).resolves.toBeUndefined();
    expect(retryableBootstrap).toHaveBeenCalledTimes(2);
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
    fs.mkdirSync(path.join(runtimeHome, 'opl', 'node_modules'), { recursive: true });
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
    expect(env.OPL_MODULE_PATH_OPLBOOKFORGE).toBe(path.join(runtimeHome, 'modules', 'bookforge'));
    expect(env.OPL_PREFILLED_NODE_MODULES_DIR).toBe(path.join(runtimeHome, 'opl', 'node_modules'));
    expect(env.OPL_HERMES_BIN).toBe(path.join(runtimeHome, 'bin', 'hermes'));
    expect(env.PATH?.split(path.delimiter).slice(0, 3)).toEqual([
      path.join(runtimeHome, 'bin'),
      path.join(runtimeHome, 'node', 'bin'),
      path.join(runtimeHome, 'uv', 'bin'),
    ]);
  });

  it('uses one private process instance id for every OPL command and rotates it only for a new process', () => {
    const input = {
      baseEnv: {
        HOME: makeTempRoot('opl-process-instance-home'),
        PATH: '/usr/bin:/bin',
        OPL_APP_PROCESS_INSTANCE_ID: 'user-supplied-value',
      },
      platform: 'darwin' as const,
      arch: 'arm64',
    };

    const firstEnv = __oplRuntimeBridgeTest.buildOplCommandEnv(input);
    const secondEnv = __oplRuntimeBridgeTest.buildOplCommandEnv(input);
    const firstId = firstEnv.OPL_APP_PROCESS_INSTANCE_ID;

    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondEnv.OPL_APP_PROCESS_INSTANCE_ID).toBe(firstId);
    expect(firstId).not.toBe('user-supplied-value');
    expect(firstEnv.OPL_APP_HOST_KIND).toBe('desktop');
    expect(secondEnv.OPL_APP_HOST_KIND).toBe('desktop');

    const nextProcessId = __oplRuntimeBridgeTest.resetOplAppProcessInstanceIdForTest();
    const nextProcessEnv = __oplRuntimeBridgeTest.buildOplCommandEnv(input);
    expect(nextProcessId).not.toBe(firstId);
    expect(nextProcessEnv.OPL_APP_PROCESS_INSTANCE_ID).toBe(nextProcessId);

    const uiResult = __oplRuntimeBridgeTest.commandFailureResult(
      { surface: 'update_check', args: ['update', 'check', '--json'] },
      'opl update check --json',
      'fixture failure'
    );
    expect(JSON.stringify(uiResult)).not.toContain('OPL_APP_PROCESS_INSTANCE_ID');
    expect(JSON.stringify(uiResult)).not.toContain('OPL_APP_HOST_KIND');
    expect(JSON.stringify(uiResult)).not.toContain(nextProcessId);
  });

  it('runs startup maintenance once for Desktop after storage initialization and never for Web', async () => {
    const desktopEntry = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/index.ts'), 'utf8');
    expect(desktopEntry).toContain("initializeProcess({ hostKind: isWebUIBootstrap ? 'web' : 'desktop' })");
    const processEntry = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/process/index.ts'), 'utf8');
    expect(processEntry).not.toContain('await runStartupMaintenanceForHost(options.hostKind)');
    expect(processEntry.indexOf('await (options.initializeStorage ?? initStorage)()')).toBeLessThan(
      processEntry.indexOf("mark('oplStartupMaintenanceScheduled')")
    );

    const specs: Array<{ surface: string; args: string[]; timeoutMs?: number }> = [];
    const dependencies: NonNullable<Parameters<typeof runDesktopStartupMaintenance>[0]> = {
      logInfo: vi.fn(),
      runCommand: async (spec) => {
        specs.push(spec);
        return {
          surface: 'startup_maintenance' as const,
          command: 'opl system startup-maintenance --json',
          stdout: '{}',
          parsed: { system_action: { action: 'startup_maintenance', status: 'completed' } },
          ok: true as const,
        };
      },
    };
    const firstDesktopTask = runStartupMaintenanceForHost('desktop', dependencies);
    const secondDesktopTask = runStartupMaintenanceForHost('desktop', dependencies);
    expect(secondDesktopTask).toBe(firstDesktopTask);
    await firstDesktopTask;
    await runStartupMaintenanceForHost('web', dependencies);

    expect(specs).toEqual([
      {
        surface: 'startup_maintenance',
        args: ['system', 'startup-maintenance', '--json'],
        timeoutMs: 120_000,
      },
    ]);
  });

  it('emits one completion event after Desktop maintenance and captures command rejection', async () => {
    const events: unknown[] = [];
    const warnings: string[] = [];

    const result = await runStartupMaintenanceForHost('desktop', {
      now: () => new Date('2026-07-17T01:02:03.000Z'),
      emitCompleted: (event) => events.push(event),
      logWarn: (message) => warnings.push(message),
      runCommand: async () => {
        throw new Error('fixture rejected');
      },
    });

    expect(result?.ok).toBe(false);
    expect(events).toEqual([
      {
        schema: 'opl.desktop_startup_maintenance.completed.v1',
        observed_at: '2026-07-17T01:02:03.000Z',
        outcome: 'failed',
        command_ok: false,
        maintenance_status: null,
        refresh_profile: 'fast',
      },
    ]);
    expect(warnings).toHaveLength(1);
  });

  it('records a structured startup-maintenance failure without throwing', async () => {
    const warnings: string[] = [];
    const specs: Array<{ surface: string; args: string[]; timeoutMs?: number }> = [];

    const result = await runDesktopStartupMaintenance({
      now: () => new Date('2026-07-17T00:00:00.000Z'),
      logWarn: (message) => warnings.push(message),
      runCommand: async (spec) => {
        specs.push(spec);
        return {
          surface: 'startup_maintenance',
          command: 'opl system startup-maintenance --json',
          stdout: '',
          parsed: null,
          ok: false,
          error: { code: 'startup_maintenance_failed', message: 'Temporal supervisor unavailable' },
        };
      },
    });

    expect(result.ok).toBe(false);
    expect(specs).toEqual([
      {
        surface: 'startup_maintenance',
        args: ['system', 'startup-maintenance', '--json'],
        timeoutMs: 120_000,
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0]!.replace('[AionUi:opl-startup] ', ''))).toEqual({
      schema: 'opl.desktop_startup_maintenance.v1',
      observed_at: '2026-07-17T00:00:00.000Z',
      host_kind: 'desktop',
      surface: 'startup_maintenance',
      command: 'opl system startup-maintenance --json',
      ok: false,
      command_ok: false,
      maintenance_status: null,
      result: null,
      error: { code: 'startup_maintenance_failed', message: 'Temporal supervisor unavailable' },
    });
  });

  it('warns instead of reporting green when startup maintenance exits zero with manual work remaining', async () => {
    const warnings: string[] = [];

    const result = await runDesktopStartupMaintenance({
      logWarn: (message) => warnings.push(message),
      runCommand: async () => ({
        surface: 'startup_maintenance',
        command: 'opl system startup-maintenance --json',
        stdout: '{}',
        parsed: { system_action: { action: 'startup_maintenance', status: 'manual_required' } },
        ok: true,
      }),
    });

    expect(result.ok).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0]!.replace('[AionUi:opl-startup] ', ''))).toMatchObject({
      ok: false,
      command_ok: true,
      maintenance_status: 'manual_required',
    });
  });

  it('prefers the installed App-managed runtime/current when no explicit full runtime env is set', () => {
    const homeDir = makeTempRoot('opl-detected-runtime-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'uv', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(runtimeHome, 'node', 'bin', 'node'), '#!/usr/bin/env bash\n', { mode: 0o755 });

    const env = __oplRuntimeBridgeTest.buildOplCommandEnv({
      baseEnv: {
        HOME: homeDir,
        PATH: '/opt/homebrew/bin:/usr/bin:/bin',
      },
      platform: 'darwin',
      arch: 'arm64',
    });

    expect(__oplRuntimeBridgeTest.resolveDefaultFullRuntimeHome({ HOME: homeDir })).toBe(runtimeHome);
    expect(env.OPL_FULL_RUNTIME_HOME).toBe(runtimeHome);
    expect(env.PATH?.split(path.delimiter).slice(0, 3)).toEqual([
      path.join(runtimeHome, 'bin'),
      path.join(runtimeHome, 'node', 'bin'),
      path.join(runtimeHome, 'uv', 'bin'),
    ]);
  });

  it('uses the packaged Full runtime for App state while keeping updates on the managed carrier', () => {
    const homeDir = makeTempRoot('opl-update-bridge-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    const compatibleRoot = path.join(homeDir, '.opl', 'one-person-lab');
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    makeFrameworkCarrier(path.join(runtimeHome, 'opl'));
    fs.mkdirSync(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(compatibleRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(compatibleRoot, 'dist', 'entrypoints'), { recursive: true });
    fs.mkdirSync(path.join(compatibleRoot, 'contracts', 'opl-framework'), { recursive: true });
    fs.mkdirSync(path.join(compatibleRoot, 'node_modules', '@temporalio', 'common'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(runtimeHome, 'opl', 'dist', 'entrypoints', 'cli.js'), 'console.log("old")\n', 'utf8');
    fs.writeFileSync(path.join(runtimeHome, 'node', 'bin', 'node'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(compatibleRoot, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(compatibleRoot, 'dist', 'entrypoints', 'cli.js'), 'console.log("new")\n', 'utf8');
    fs.writeFileSync(path.join(compatibleRoot, 'dist', 'managed-update-kernel.js'), 'export {}\n', 'utf8');
    fs.writeFileSync(
      path.join(compatibleRoot, 'package.json'),
      JSON.stringify({ name: 'opl-framework', version: '26.6.27' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(compatibleRoot, 'contracts', 'opl-framework', 'public-surface-index.json'),
      JSON.stringify({ version: 'p19.stage-runtime' }),
      'utf8'
    );

    const env = __oplRuntimeBridgeTest.buildOplCommandEnv({
      baseEnv: {
        HOME: homeDir,
        PATH: `${path.join(compatibleRoot, 'bin')}:/usr/bin:/bin`,
        OPL_FULL_RUNTIME_HOME: runtimeHome,
      },
      platform: 'darwin',
      arch: 'arm64',
    });

    const updateCommand = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildUpdateStatusCommand(),
      env
    );
    expect(updateCommand.command).toBe(path.join(runtimeHome, 'node', 'bin', 'node'));
    expect(updateCommand.args.slice(-3)).toEqual(['update', 'status', '--json']);
    expect(updateCommand.args).not.toContain(path.join(runtimeHome, 'opl', 'dist', 'entrypoints', 'cli.js'));
    expect(updateCommand.timeoutMs).toBe(MANAGED_UPDATE_READ_TIMEOUT_MS);
    expect(updateCommand.redactedCommand).toBe('opl update status --json');

    const appStateCommand = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
      env
    );
    expect(appStateCommand.args).toEqual([
      path.join(runtimeHome, 'opl', 'dist', 'entrypoints', 'cli.js'),
      'app',
      'state',
      '--profile',
      'fast',
      '--json',
    ]);
    expect(appStateCommand.env.OPL_FRAMEWORK_SELECTED_CARRIER).toBe('packaged_full_runtime');
    expect(appStateCommand.timeoutMs).toBeUndefined();
  });

  it('ignores a retired packaged Full runtime when refreshing after switching to the managed carrier', () => {
    const homeDir = makeTempRoot('opl-retired-full-runtime-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    const managedRoot = path.join(homeDir, '.opl', 'one-person-lab');
    makeFrameworkCarrier(path.join(runtimeHome, 'opl'));
    makeFrameworkCarrier(managedRoot);
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(runtimeHome, 'node', 'bin', 'node'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(
      path.join(runtimeHome, 'opl', 'package.json'),
      JSON.stringify({ name: 'opl-framework-shared', version: '0.1.0' }),
      'utf8'
    );

    const command = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
      __oplRuntimeBridgeTest.buildOplCommandEnv({
        baseEnv: {
          HOME: homeDir,
          PATH: '/usr/bin:/bin',
          OPL_APP_INSTALL_ORIGIN: 'direct_download',
        },
        platform: 'darwin',
        arch: 'arm64',
      })
    );

    expect(command.env.OPL_FRAMEWORK_SELECTED_CARRIER).toBe('framework_managed_install');
    expect(command.args[0]).toBe(path.join(managedRoot, 'dist', 'entrypoints', 'cli.js'));
  });

  it('bootstraps a legacy managed Framework that rejects the OPL Gateway account credential handle', () => {
    const legacyError = new Error('credential_handle must use env:NAME or codex:selected_provider.');

    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
        legacyError
      )
    ).toBe(true);
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildActionCommand({ actionId: 'connection_create' }),
        legacyError
      )
    ).toBe(false);
  });

  it('does not let an incomplete Standard carrier preempt a packaged Full runtime', () => {
    const homeDir = makeTempRoot('opl-full-runtime-incomplete-standard-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    const incompleteStandardRoot = path.join(homeDir, '.opl', 'one-person-lab');
    makeFrameworkCarrier(path.join(runtimeHome, 'opl'));
    fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(runtimeHome, 'node', 'bin', 'node'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.mkdirSync(path.join(incompleteStandardRoot, 'one-person-lab-main'), { recursive: true });

    const env = __oplRuntimeBridgeTest.buildOplCommandEnv({
      baseEnv: {
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_FULL_RUNTIME_HOME: runtimeHome,
      },
      platform: 'darwin',
      arch: 'arm64',
    });
    const command = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
      env
    );

    expect(command.env.OPL_FRAMEWORK_SELECTED_CARRIER).toBe('packaged_full_runtime');
    expect(command.args[0]).toBe(path.join(runtimeHome, 'opl', 'dist', 'entrypoints', 'cli.js'));
  });

  it('recognizes the current Framework managed-update module path', () => {
    const homeDir = makeTempRoot('opl-managed-update-current-path-home');
    const privateRoot = path.join(homeDir, '.opl', 'one-person-lab');
    makeFrameworkCarrier(privateRoot);
    fs.mkdirSync(path.join(privateRoot, 'dist', 'modules', 'connect'), { recursive: true });
    fs.writeFileSync(
      path.join(privateRoot, 'dist', 'modules', 'connect', 'managed-update-kernel.js'),
      'export {}\n',
      'utf8'
    );

    const command = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildUpdateStatusCommand(),
      __oplRuntimeBridgeTest.buildOplCommandEnv({
        baseEnv: {
          HOME: homeDir,
          PATH: '/usr/bin:/bin',
          OPL_APP_INSTALL_ORIGIN: 'direct_download',
        },
        platform: 'darwin',
        arch: 'arm64',
      })
    );

    expect(command.args.slice(-3)).toEqual(['update', 'status', '--json']);
    expect(command.env.OPL_FRAMEWORK_SELECTED_CARRIER).toBe('framework_managed_install');
  });

  it('prefers the explicit local framework checkout when Developer Mode auto-matches the developer identity', () => {
    const homeDir = makeTempRoot('opl-devmode-source-home');
    const runtimeHome = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', 'current');
    const stateDir = path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
    const workspaceRoot = path.join(homeDir, 'workspace');
    const developerCheckout = path.join(workspaceRoot, 'one-person-lab');

    fs.mkdirSync(path.join(runtimeHome, 'opl', 'dist', 'entrypoints'), { recursive: true });
    fs.mkdirSync(path.join(runtimeHome, 'node', 'bin'), { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(path.join(developerCheckout, '.git'), { recursive: true });
    fs.mkdirSync(path.join(developerCheckout, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(developerCheckout, 'contracts', 'opl-framework'), { recursive: true });
    fs.mkdirSync(path.join(developerCheckout, 'src', 'entrypoints'), { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'developer-supervisor.json'),
      JSON.stringify({ enabled: 'auto', mode: 'external_observe', auto_enable_github_login: 'gaofeng21cn' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(stateDir, 'workspace-root.json'),
      JSON.stringify({ selected_path: workspaceRoot }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(runtimeHome, 'opl', 'dist', 'entrypoints', 'cli.js'),
      'console.log("runtime")\n',
      'utf8'
    );
    fs.writeFileSync(path.join(developerCheckout, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(developerCheckout, 'src', 'entrypoints', 'cli.ts'), 'console.log("checkout")\n', 'utf8');
    fs.writeFileSync(
      path.join(developerCheckout, 'contracts', 'opl-framework', 'public-surface-index.json'),
      JSON.stringify({ version: 'p19.stage-runtime' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(developerCheckout, 'package.json'),
      JSON.stringify({ name: 'opl-framework', version: '26.6.27' }),
      'utf8'
    );
    fs.writeFileSync(path.join(runtimeHome, 'node', 'bin', 'node'), '#!/usr/bin/env bash\n', { mode: 0o755 });

    const env = __oplRuntimeBridgeTest.buildOplCommandEnv({
      baseEnv: {
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_FULL_RUNTIME_HOME: runtimeHome,
        OPL_WORKSPACE_ROOT: workspaceRoot,
        OPL_DEVELOPER_MODE_GH_FIXTURE: JSON.stringify({ user: { login: 'gaofeng21cn' } }),
        OPL_MODULE_PATH_REDCUBE: '/explicit/redcube',
      },
      platform: 'darwin',
      arch: 'arm64',
    });

    expect(__oplRuntimeBridgeTest.developerModePrefersLocalCheckout(env)).toBe(true);
    expect(__oplRuntimeBridgeTest.resolveDeveloperModeCheckoutRoot(env)).toBe(developerCheckout);
    expect(env.OPL_MODULE_PATH_MEDAUTOSCIENCE).toBeUndefined();
    expect(env.OPL_MODULE_PATH_MEDAUTOGRANT).toBeUndefined();
    expect(env.OPL_MODULE_PATH_REDCUBE).toBe('/explicit/redcube');
    expect(env.OPL_MODULE_PATH_OPLMETAAGENT).toBeUndefined();
    expect(env.OPL_MODULE_PATH_OPLBOOKFORGE).toBeUndefined();

    const command = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
      env
    );
    expect(command.command).toBe(path.join(runtimeHome, 'node', 'bin', 'node'));
    expect(command.env.OPL_FRAMEWORK_SELECTED_CARRIER).toBe('developer_checkout');
    expect(command.args).toEqual([
      '--experimental-strip-types',
      path.join(developerCheckout, 'src', 'entrypoints', 'cli.ts'),
      'app',
      'state',
      '--profile',
      'fast',
      '--json',
    ]);
  });

  it('prefers the current source entrypoint over stale root dist output for linked OPL checkouts', () => {
    const homeDir = makeTempRoot('opl-entrypoint-bridge-home');
    const linkedRoot = path.join(homeDir, '.opl', 'one-person-lab');
    fs.mkdirSync(path.join(linkedRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(linkedRoot, 'src', 'entrypoints'), { recursive: true });
    fs.mkdirSync(path.join(linkedRoot, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(linkedRoot, 'contracts', 'opl-framework'), { recursive: true });
    fs.mkdirSync(path.join(linkedRoot, 'node_modules', '@temporalio', 'common'), { recursive: true });
    fs.writeFileSync(path.join(linkedRoot, 'bin', 'opl'), '#!/usr/bin/env bash\n', { mode: 0o755 });
    fs.writeFileSync(path.join(linkedRoot, 'src', 'entrypoints', 'cli.ts'), 'console.log("current")\n', 'utf8');
    fs.writeFileSync(path.join(linkedRoot, 'dist', 'cli.js'), 'console.log("stale")\n', 'utf8');
    fs.writeFileSync(
      path.join(linkedRoot, 'package.json'),
      JSON.stringify({ name: 'opl-framework', version: '26.6.27' }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(linkedRoot, 'contracts', 'opl-framework', 'public-surface-index.json'),
      JSON.stringify({ version: 'p19.stage-runtime' }),
      'utf8'
    );

    const env = __oplRuntimeBridgeTest.buildOplCommandEnv({
      baseEnv: { HOME: homeDir, PATH: `${path.join(linkedRoot, 'bin')}:/usr/bin:/bin` },
      platform: 'darwin',
      arch: 'arm64',
    });

    const command = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildInitializeFallbackCommand(),
      env
    );

    expect(command.args).toEqual([
      '--experimental-strip-types',
      path.join(linkedRoot, 'src', 'entrypoints', 'cli.ts'),
      'system',
      'initialize',
      '--json',
    ]);
  });

  it('activates only the system Formula carrier for a Homebrew Cask install', () => {
    const homeDir = makeTempRoot('opl-homebrew-carrier-home');
    const formulaRoot = path.join(homeDir, 'formula-opl');
    const privateRoot = path.join(homeDir, '.opl', 'one-person-lab');
    const formulaBin = path.join(homeDir, 'opt-homebrew-bin');
    const caskroomRoot = path.join(homeDir, 'Caskroom');
    makeFrameworkCarrier(formulaRoot);
    makeFrameworkCarrier(privateRoot);
    makeCaskReceipt(caskroomRoot);
    fs.mkdirSync(formulaBin, { recursive: true });
    fs.symlinkSync(path.join(formulaRoot, 'bin', 'opl'), path.join(formulaBin, 'opl'));

    const env = {
      HOME: homeDir,
      PATH: '/usr/bin:/bin',
      OPL_HOMEBREW_CASKROOM_ROOTS: caskroomRoot,
      OPL_HOMEBREW_FORMULA_BIN: formulaBin,
    };
    const selection = __oplRuntimeBridgeTest.resolveOplFrameworkCarrier(env);

    expect(selection.receipt).toMatchObject({
      selected_carrier: 'system_homebrew_formula',
      framework_version: '26.6.27',
      framework_api_version: 'p19.stage-runtime',
      app_required_api_range: 'p19.stage-runtime',
      compatibility_status: 'compatible',
      selection_status: 'active',
      active_framework_count: 1,
    });
    expect(selection.packageRoot).toBe(fs.realpathSync(formulaRoot));
    expect(selection.packageRoot).not.toBe(privateRoot);

    const command = __oplRuntimeBridgeTest.buildOplSpawnCommand(
      __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
      env
    );
    expect(command.env).toMatchObject({
      OPL_FRAMEWORK_SELECTED_CARRIER: 'system_homebrew_formula',
      OPL_FRAMEWORK_VERSION: '26.6.27',
      OPL_FRAMEWORK_API_VERSION: 'p19.stage-runtime',
      OPL_APP_REQUIRED_FRAMEWORK_API_RANGE: 'p19.stage-runtime',
      OPL_FRAMEWORK_COMPATIBILITY_STATUS: 'compatible',
      OPL_ACTIVE_FRAMEWORK_COUNT: '1',
    });
  });

  it('fails closed when a Homebrew Cask install cannot locate a compatible Formula', () => {
    const homeDir = makeTempRoot('opl-missing-formula-home');
    const caskroomRoot = path.join(homeDir, 'Caskroom');
    makeCaskReceipt(caskroomRoot, 'one-person-lab-nightly');

    expect(() =>
      __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_HOMEBREW_CASKROOM_ROOTS: caskroomRoot,
        OPL_HOMEBREW_FORMULA_BIN: path.join(homeDir, 'missing-formula-bin'),
      })
    ).toThrow(/has neither the system Formula nor the transition Framework-managed carrier available/);
  });

  it('uses the Framework-managed carrier only while a detected Cask is waiting for its first Formula publication', () => {
    const homeDir = makeTempRoot('opl-cask-transition-home');
    const privateRoot = path.join(homeDir, '.opl', 'one-person-lab');
    const caskroomRoot = path.join(homeDir, 'Caskroom');
    makeFrameworkCarrier(privateRoot);
    makeCaskReceipt(caskroomRoot, 'one-person-lab-full');

    const selection = __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
      HOME: homeDir,
      PATH: '/usr/bin:/bin',
      OPL_HOMEBREW_CASKROOM_ROOTS: caskroomRoot,
      OPL_HOMEBREW_FORMULA_BIN: path.join(homeDir, 'missing-formula-bin'),
    });

    expect(selection.packageRoot).toBe(privateRoot);
    expect(selection.receipt.selected_carrier).toBe('framework_managed_install');
    expect(selection.receipt.selection_status).toBe('pre_formula_transition');
  });

  it('does not fall back when a detected Cask has an incompatible Formula', () => {
    const homeDir = makeTempRoot('opl-cask-incompatible-formula-home');
    const formulaRoot = path.join(homeDir, 'formula-opl');
    const formulaBin = path.join(homeDir, 'opt-homebrew-bin');
    const caskroomRoot = path.join(homeDir, 'Caskroom');
    makeFrameworkCarrier(path.join(homeDir, '.opl', 'one-person-lab'));
    makeFrameworkCarrier(formulaRoot, '26.6.27', 'p18.stage-runtime');
    makeCaskReceipt(caskroomRoot);
    fs.mkdirSync(formulaBin, { recursive: true });
    fs.symlinkSync(path.join(formulaRoot, 'bin', 'opl'), path.join(formulaBin, 'opl'));

    expect(() =>
      __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_HOMEBREW_CASKROOM_ROOTS: caskroomRoot,
        OPL_HOMEBREW_FORMULA_BIN: formulaBin,
      })
    ).toThrow(/Framework API p18\.stage-runtime is incompatible/);
  });

  it('activates only the Framework-managed carrier for DMG and direct installs', () => {
    const homeDir = makeTempRoot('opl-direct-carrier-home');
    const privateRoot = path.join(homeDir, '.opl', 'one-person-lab');
    const formulaRoot = path.join(homeDir, 'formula-opl');
    const formulaBin = path.join(homeDir, 'opt-homebrew-bin');
    makeFrameworkCarrier(privateRoot);
    makeFrameworkCarrier(formulaRoot);
    fs.mkdirSync(formulaBin, { recursive: true });
    fs.symlinkSync(path.join(formulaRoot, 'bin', 'opl'), path.join(formulaBin, 'opl'));

    const selection = __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
      HOME: homeDir,
      PATH: `${formulaBin}:/usr/bin:/bin`,
      OPL_APP_INSTALL_ORIGIN: 'dmg_or_direct_download',
    });

    expect(selection.receipt.selected_carrier).toBe('framework_managed_install');
    expect(selection.receipt.active_framework_count).toBe(1);
    expect(selection.packageRoot).toBe(privateRoot);
  });

  it('treats a managed carrier with an empty dependency tree as missing so app state can bootstrap it', () => {
    const homeDir = makeTempRoot('opl-incomplete-managed-carrier-home');
    const privateRoot = path.join(homeDir, '.opl', 'one-person-lab');
    makeFrameworkCarrier(privateRoot);
    fs.rmSync(path.join(privateRoot, 'node_modules'), { recursive: true, force: true });
    fs.mkdirSync(path.join(privateRoot, 'node_modules'));

    expect(() =>
      __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_APP_INSTALL_ORIGIN: 'direct_download',
      })
    ).toThrow('The Framework-managed OPL base carrier is missing.');
    expect(
      __oplRuntimeBridgeTest.shouldAutoBootstrapAfterOplCommandError(
        __oplRuntimeBridgeTest.buildAppStateCommand('fast'),
        new Error('The Framework-managed OPL base carrier is missing.')
      )
    ).toBe(true);
  });

  it('rejects a selected carrier whose Framework API is outside the App-required range', () => {
    const homeDir = makeTempRoot('opl-incompatible-carrier-home');
    makeFrameworkCarrier(path.join(homeDir, '.opl', 'one-person-lab'), '26.6.27', 'p18.stage-runtime');

    expect(() =>
      __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_APP_INSTALL_ORIGIN: 'direct_download',
      })
    ).toThrow(/Framework API p18\.stage-runtime is incompatible with App-required p19\.stage-runtime/);
  });

  it('rejects the retired opl-framework-shared package identity', () => {
    const homeDir = makeTempRoot('opl-retired-carrier-home');
    const privateRoot = path.join(homeDir, '.opl', 'one-person-lab');
    makeFrameworkCarrier(privateRoot);
    fs.writeFileSync(
      path.join(privateRoot, 'package.json'),
      JSON.stringify({ name: 'opl-framework-shared', version: '0.1.0' }),
      'utf8'
    );

    expect(() =>
      __oplRuntimeBridgeTest.resolveOplFrameworkCarrier({
        HOME: homeDir,
        PATH: '/usr/bin:/bin',
        OPL_APP_INSTALL_ORIGIN: 'direct_download',
      })
    ).toThrow(/package identity opl-framework/);
  });

  it('sends OPL Gateway keys only through stdin and keeps the command redacted', () => {
    expect(__oplRuntimeBridgeTest.buildConfigureCodexCommand({ apiKey: ' secret-key ' })).toEqual({
      surface: 'configure_codex',
      args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
      stdin: 'secret-key\n',
      redactedCommand: 'opl system configure-codex --api-key-stdin --json',
    });
    expect(() => __oplRuntimeBridgeTest.buildConfigureCodexCommand({ apiKey: '   ' })).toThrow(
      /OPL Gateway access key is required/
    );
  });

  it('sends Gateway account credentials only through dedicated stdin and preserves the password bytes', () => {
    expect(
      __oplRuntimeBridgeTest.buildGatewayAccountLoginCommand({
        email: ' user@example.com ',
        password: '  exact-password  ',
        deviceLabel: ' Feng Mac ',
      })
    ).toEqual({
      surface: 'gateway_account',
      args: ['connect', 'gateway', 'login', '--credentials-stdin', '--json'],
      stdin: '{"email":"user@example.com","password":"  exact-password  ","device_label":"Feng Mac"}\n',
      redactedCommand: 'opl connect gateway login --credentials-stdin --json',
    });
  });

  it('fails closed when the Gateway login response contains a secret field', () => {
    expect(
      __oplRuntimeBridgeTest.sanitizeGatewayAccountResult({
        surface: 'gateway_account',
        command: 'opl connect gateway login --credentials-stdin --json',
        stdout: '{"refresh_token":"secret"}',
        parsed: { refresh_token: 'secret' },
        ok: true,
      })
    ).toEqual({
      ok: false,
      errorCode: 'internal_contract_violation',
      stateRefreshRequired: false,
    });
  });

  it('fails closed when a successful Gateway command omits its JSON result', () => {
    expect(
      __oplRuntimeBridgeTest.sanitizeGatewayAccountResult({
        surface: 'gateway_account',
        command: 'opl connect gateway login --credentials-stdin --json',
        stdout: '',
        parsed: null,
        ok: true,
      })
    ).toEqual({
      ok: false,
      errorCode: 'internal_contract_violation',
      stateRefreshRequired: false,
    });
  });

  it('returns only a stable error code for a failed Gateway login response', () => {
    expect(
      __oplRuntimeBridgeTest.sanitizeGatewayAccountResult({
        surface: 'gateway_account',
        command: 'opl connect gateway login --credentials-stdin --json',
        stdout: '{"ok":false,"error_code":"invalid_credentials"}',
        parsed: { ok: false, error_code: 'invalid_credentials', detail: 'upstream text' },
        ok: true,
      })
    ).toEqual({ ok: false, errorCode: 'invalid_credentials', stateRefreshRequired: false });
  });

  it('parses initialize event envelopes and returns the complete payload as the command result payload', () => {
    const phaseEvent = __oplRuntimeBridgeTest.readInitializeEventEnvelope(
      JSON.stringify({
        version: 'g2',
        event: {
          surface_id: 'opl_system_initialize_event',
          event_type: 'phase_done',
          phase: 'native_helpers',
          label: 'Inspect OPL System Bridge',
          sequence: 9,
          observed_at: '2026-06-29T00:00:00.000Z',
          duration_ms: 5239,
          payload: { health_status: 'ready' },
        },
      })
    );
    expect(phaseEvent).toEqual({
      surface_id: 'opl_system_initialize_event',
      event_type: 'phase_done',
      phase: 'native_helpers',
      label: 'Inspect OPL System Bridge',
      sequence: 9,
      observed_at: '2026-06-29T00:00:00.000Z',
      duration_ms: 5239,
      payload: { health_status: 'ready' },
    });

    const completeEvent = __oplRuntimeBridgeTest.readInitializeEventEnvelope(
      JSON.stringify({
        version: 'g2',
        event: {
          surface_id: 'opl_system_initialize_event',
          event_type: 'complete',
          phase: 'summary',
          label: 'Initialize payload ready',
          sequence: 25,
          observed_at: '2026-06-29T00:00:01.000Z',
          payload: {
            version: 'g2',
            system_initialize: {
              surface_id: 'opl_system_initialize',
              setup_flow: { ready_to_launch: true },
            },
          },
        },
      })
    );
    expect(__oplRuntimeBridgeTest.readInitializeCompletePayload(completeEvent!)).toEqual({
      version: 'g2',
      system_initialize: {
        surface_id: 'opl_system_initialize',
        setup_flow: { ready_to_launch: true },
      },
    });
  });

  it('ignores non-event stdout lines without crashing initialize event streaming', async () => {
    const completeLine = JSON.stringify({
      event: {
        surface_id: 'opl_system_initialize_event',
        event_type: 'complete',
        phase: 'summary',
        label: 'Initialize payload ready',
        sequence: 2,
        observed_at: '2026-07-10T00:00:00.000Z',
        payload: {
          system_initialize: {
            setup_flow: { ready_to_launch: false },
          },
        },
      },
    });
    const stdout = `warning on stdout\n${completeLine}\n`;

    await expect(
      __oplRuntimeBridgeTest.runInitializeEventsCommand({
        surface: 'system_initialize',
        command: process.execPath,
        args: ['-e', `process.stdout.write(${JSON.stringify(stdout)})`],
        redactedCommand: 'fixture initialize events',
        timeoutMs: 5_000,
      })
    ).resolves.toMatchObject({
      ok: true,
      parsed: {
        system_initialize: {
          setup_flow: { ready_to_launch: false },
        },
      },
    });
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

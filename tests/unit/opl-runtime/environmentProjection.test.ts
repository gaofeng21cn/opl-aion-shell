import { describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeEnvironmentProjection,
  buildRuntimeModules,
  buildRuntimePackages,
  chooseMakeUsableAction,
  findRecommendedUpdateAction,
} from '@/renderer/pages/settings/RuntimeSettings/environmentProjection';
import { formatStatus, isUserUsableStatus } from '@/renderer/pages/settings/sections/runtimeStateView';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
}));

const t = (key: string, options?: Record<string, string | number>) => {
  if (key === 'settings.oplEnvironmentPage.modulesInstalledCount')
    return `${options?.installed}/${options?.total} installed`;
  if (key === 'settings.oplEnvironmentPage.healthSummary.values.count') return `${options?.count} items`;
  if (key.startsWith('settings.oplEnvironmentPage.status.'))
    return key.replace('settings.oplEnvironmentPage.status.', '');
  return options?.status ? String(options.status) : key;
};

Object.defineProperty(globalThis, '__OPL_RELEASE_VERSION__', { value: '', configurable: true });
Object.defineProperty(globalThis, '__APP_VERSION__', { value: '26.6.30', configurable: true });
Object.defineProperty(globalThis, '__SHELL_VERSION__', { value: '26.6.30-shell', configurable: true });

const maintenance: ManagedUpdateMaintenanceSnapshot = {
  result: null,
  running: false,
  operation: null,
  busyAction: null,
  lastRunAt: '2026-06-30T01:00:00Z',
  nextRunAt: null,
  lastFailure: null,
  lastAction: null,
  lastSkipReason: null,
  reloadGuidance: null,
  restartRequired: false,
  lastReconciledCarrierCheckpoint: null,
  executionStatus: 'idle',
  checkNow: vi.fn(),
  applySafeCandidates: vi.fn(),
};

describe('buildRuntimeEnvironmentProjection', () => {
  it('does not synthesize profile modules when the runtime module projection is empty', () => {
    expect(buildRuntimeModules({ items: [] })).toEqual([]);
  });

  it('keeps an unknown runtime module visible without a fixed App allowlist', () => {
    expect(
      buildRuntimeModules({
        items: [{ module_id: 'synthetic-lab-agent', label: 'Synthetic Lab Agent', installed: true }],
      })
    ).toMatchObject([{ module_id: 'synthetic-lab-agent', label: 'Synthetic Lab Agent', installed: true }]);
  });

  it('projects fast app state into summary, readiness, and maintenance counts', () => {
    const plane: ManagedUpdatePlane = {
      operation: 'status',
      updateChannel: 'stable',
      lockStatus: 'free',
      operationMode: 'read_only_projection',
      summary: null,
      reloadGuidance: null,
      components: [
        {
          id: 'opl_app',
          label: 'OPL App',
          state: 'current',
          conditions: [],
          substatuses: [],
          safeToApply: false,
          repairAllowed: false,
          rollbackAllowed: false,
          manualRequired: false,
          developerCheckout: false,
          dirtyCheckout: false,
          needsRestart: false,
          needsReload: false,
          hostExecutorRequired: false,
          hostUpdateRouteExamples: [],
          preservedMounts: [],
          requiredPreservationEvidence: [],
        },
        {
          id: 'opl_base',
          label: 'OPL Base',
          state: 'update_available',
          conditions: [],
          substatuses: [],
          safeToApply: true,
          repairAllowed: false,
          rollbackAllowed: false,
          manualRequired: false,
          developerCheckout: false,
          dirtyCheckout: false,
          needsRestart: true,
          needsReload: false,
          hostExecutorRequired: false,
          hostUpdateRouteExamples: [],
          preservedMounts: [],
          requiredPreservationEvidence: [],
        },
        {
          id: 'opl_packages',
          label: 'OPL Packages',
          state: 'failed_with_repair',
          conditions: [],
          substatuses: [],
          packageId: 'oma',
          safeToApply: false,
          repairAllowed: true,
          rollbackAllowed: false,
          manualRequired: false,
          developerCheckout: false,
          dirtyCheckout: false,
          needsRestart: false,
          needsReload: true,
          hostExecutorRequired: false,
          hostUpdateRouteExamples: [],
          preservedMounts: [],
          requiredPreservationEvidence: [],
        },
      ],
      repairActions: [],
    };

    const projection = buildRuntimeEnvironmentProjection({
      appState: {
        core: {
          codex: { version: '0.125.0' },
        },
        provider: {
          temporal: { health_status: 'attention_needed' },
        },
        paths: {
          family_workspace_root: { selected_path: '/Users/example/workspace' },
        },
        runtime_source_carriers: {
          source: {
            mode: 'sibling_workspace',
            runtime_sources_root: '/Users/example/workspace',
          },
          items: [
            { package_id: 'mas', label: 'MAS', source_origin: 'sibling_workspace', source_health_status: 'ready' },
            {
              package_id: 'obf',
              label: 'BookForge',
              source_origin: 'sibling_workspace',
              source_health_status: 'dirty',
              git: { dirty: true },
            },
          ],
        },
        agent_packages: {
          directory: {
            entries: [
              { package_id: 'mas', installed: true },
              { package_id: 'obf', installed: true },
            ],
          },
          status_index: {
            status: 'available',
            installed_package_count: 2,
            packages: {
              mas: { package_id: 'mas', operational_ready: true, status: 'available' },
              obf: { package_id: 'obf', operational_ready: false, status: 'attention_needed' },
            },
          },
        },
        release: {
          channel: 'stable',
          repo: 'gaofeng21cn/one-person-lab-app',
        },
      },
      managedUpdatePlane: plane,
      managedUpdateMaintenance: maintenance,
      loadedAt: '2026-06-30T00:00:00Z',
      t,
    });

    expect(projection.workspaceRoot).toBe('/Users/example/workspace');
    expect(projection.modules.map((module) => module.module_id)).toEqual(['mas', 'obf']);
    expect(projection.moduleInstalledCount).toBe(2);
    expect(projection.moduleManualMaintenanceCount).toBe(1);
    expect(projection.attentionCount).toBe(2);
    expect(projection.componentsNeedingMaintenance).toBe(2);
    expect(projection.runtimeCards.find((card) => card.key === 'temporal')).toMatchObject({
      tone: 'orange',
      nextAction: 'settings.oplEnvironmentPage.summary.actions.repairRuntime',
    });
    expect(projection.healthSummaryItems.find((item) => item.key === 'maintenance')).toMatchObject({
      value: '2 items',
      tone: 'orange',
    });
    expect(projection.healthSummaryItems.find((item) => item.key === 'lastCheck')).toMatchObject({
      value: '2026-06-30T01:00:00Z',
    });
  });

  it('keeps deferred first-use verification neutral while preserving real package attention', () => {
    const packageIds = ['mas', 'mag', 'rca', 'oma', 'obf', 'mas-scholar-skills', 'opl-flow'];
    const appState = {
      core: { codex: { status: 'ready' } },
      provider: {
        temporal: {
          status: 'ready',
          details: {
            scheduler: { status: 'ready', ready: true },
            worker_readiness: { service_ready: true, worker_ready: true },
          },
        },
      },
      paths: { workspace_root_path: '/Users/example/workspace' },
      agent_packages: {
        directory: { entries: packageIds.map((package_id) => ({ package_id, installed: true })) },
        status_index: {
          status: 'available',
          installed_package_count: packageIds.length,
          packages: Object.fromEntries(
            packageIds.map((packageId) => [
              packageId,
              {
                package_id: packageId,
                operational_ready: false,
                status: 'verification_deferred',
                reason: 'live_verification_deferred',
              },
            ])
          ),
        },
      },
      runtime_source_carriers: { items: [] },
    };
    const buildProjection = (state: typeof appState) =>
      buildRuntimeEnvironmentProjection({
        appState: state,
        managedUpdatePlane: { components: [] },
        managedUpdateMaintenance: maintenance,
        t,
      });

    const deferredProjection = buildProjection(appState);
    expect(deferredProjection.packagesOperationalReady).toBe(true);
    expect(deferredProjection.attentionCount).toBe(0);
    expect(deferredProjection.modules).toHaveLength(7);
    expect(deferredProjection.modules.every((module) => module.status === 'verification_deferred')).toBe(true);
    expect(formatStatus('verification_deferred', t)).toBe('verification_deferred');
    expect(formatStatus('internal_status_not_for_ui', t)).toBe('unknown');
    expect(isUserUsableStatus('verification_deferred')).toBe(true);

    const attentionState = structuredClone(appState);
    attentionState.agent_packages.status_index.packages.mas = {
      package_id: 'mas',
      operational_ready: false,
      status: 'attention_needed',
      reason: 'scope_materialization_missing',
    };
    const attentionProjection = buildProjection(attentionState);
    expect(attentionProjection.packagesOperationalReady).toBe(false);
    expect(attentionProjection.attentionCount).toBe(1);
    expect(isUserUsableStatus('attention_required')).toBe(false);
  });

  it('chooses safe maintenance actions without applying restart-required runtime updates', () => {
    const runtimeToolchain = {
      id: 'opl_base' as const,
      label: 'OPL Base',
      state: 'update_available',
      conditions: [],
      substatuses: [],
      safeToApply: true,
      repairAllowed: false,
      rollbackAllowed: false,
      manualRequired: false,
      developerCheckout: false,
      dirtyCheckout: false,
      needsRestart: true,
      needsReload: false,
      hostExecutorRequired: false,
      hostUpdateRouteExamples: [],
      preservedMounts: [],
      requiredPreservationEvidence: [],
    };
    const agentPackages = {
      id: 'opl_packages' as const,
      label: 'OPL Packages',
      state: 'failed_with_repair',
      conditions: [],
      substatuses: [],
      packageId: 'oma',
      safeToApply: false,
      repairAllowed: true,
      rollbackAllowed: false,
      manualRequired: false,
      developerCheckout: false,
      dirtyCheckout: false,
      needsRestart: false,
      needsReload: true,
      hostExecutorRequired: false,
      hostUpdateRouteExamples: [],
      preservedMounts: [],
      requiredPreservationEvidence: [],
    };

    expect(chooseMakeUsableAction(runtimeToolchain)).toBeNull();
    expect(chooseMakeUsableAction(agentPackages)).toBe('repair');
    expect(findRecommendedUpdateAction([runtimeToolchain, agentPackages])).toEqual({
      kind: 'repair',
      component: agentPackages,
    });
  });

  it('does not count a clean developer override as a local change', () => {
    const plane: ManagedUpdatePlane = {
      packageManualRequiredTargetCount: 3,
      components: [],
    };

    const projection = buildRuntimeEnvironmentProjection({
      appState: {
        runtime_source_carriers: {
          items: [
            {
              package_id: 'mas',
              source_origin: 'sibling_workspace',
              source_health_status: 'dirty',
              git: { dirty: true },
            },
            {
              package_id: 'mag',
              source_origin: 'sibling_workspace',
              source_health_status: 'dirty',
              git: { dirty: true },
            },
            {
              package_id: 'rca',
              source_origin: 'sibling_workspace',
              source_health_status: 'dirty',
              git: { dirty: true },
            },
            { package_id: 'oma', source_origin: 'env_override', source_health_status: 'ready', git: { dirty: false } },
          ],
        },
        agent_packages: {
          directory: {
            entries: [
              { package_id: 'mas', installed: true },
              { package_id: 'mag', installed: true },
              { package_id: 'rca', installed: true },
              { package_id: 'oma', installed: true },
            ],
          },
          status_index: {
            status: 'available',
            installed_package_count: 4,
            packages: Object.fromEntries(
              ['mas', 'mag', 'rca', 'oma'].map((packageId) => [
                packageId,
                { package_id: packageId, operational_ready: true, status: 'available' },
              ])
            ),
          },
        },
      },
      managedUpdatePlane: plane,
      managedUpdateMaintenance: maintenance,
      t,
    });

    expect(projection.moduleInstalledCount).toBe(4);
    expect(projection.moduleManualMaintenanceCount).toBe(3);
  });

  it('treats an available empty package index as a valid no-packages state', () => {
    const projection = buildRuntimeEnvironmentProjection({
      appState: {
        core: { codex: { status: 'ready' } },
        provider: {
          temporal: {
            status: 'ready',
            details: {
              scheduler: { status: 'ready', ready: true },
              worker_readiness: { service_ready: true, worker_ready: true },
            },
          },
        },
        paths: { workspace_root_path: '/Users/example/workspace' },
        agent_packages: {
          directory: { entries: [] },
          status_index: { status: 'available', installed_package_count: 0, packages: {} },
        },
        runtime_source_carriers: {
          items: [{ package_id: 'mas', source_present: true, source_health_status: 'ready' }],
        },
      },
      managedUpdatePlane: { components: [] },
      managedUpdateMaintenance: maintenance,
      t,
    });

    expect(projection.modules).toEqual([]);
    expect(projection.moduleInstalledCount).toBe(0);
    expect(projection.packageStatusAvailable).toBe(true);
    expect(projection.packagesOperationalReady).toBe(true);
    expect(projection.attentionCount).toBe(0);
    expect(projection.runtimeCards.find((card) => card.key === 'modules')).toMatchObject({
      value: 'settings.oplEnvironmentPage.noInstalledPackages',
      tone: 'green',
    });
  });

  it('takes installed truth and collection membership only from directory entries', () => {
    const statusIndex = {
      status: 'available',
      installed_package_count: 3,
      packages: {
        mas: { package_id: 'mas', operational_ready: true, status: 'available', installed: true },
        obf: { package_id: 'obf', operational_ready: true, status: 'available' },
        'status-only': { package_id: 'status-only', operational_ready: true, status: 'available', installed: true },
      },
    };
    const canonical = buildRuntimePackages({
      agent_packages: {
        directory: {
          entries: [
            { package_id: 'mas', installed: false },
            { package_id: 'obf', installed: true },
          ],
        },
        status_index: statusIndex,
      },
    });

    expect(canonical.modules.map((module) => module.module_id)).toEqual(['mas', 'obf']);
    expect(canonical.modules.map((module) => module.installed)).toEqual([false, true]);
    expect(canonical.modules.map((module) => module.status)).toEqual(['notInstalled', 'ready']);
    expect(canonical.installedCount).toBe(1);

    const legacy = buildRuntimePackages({
      agent_packages: { status_index: statusIndex },
    });
    expect(legacy.modules).toEqual([]);
    expect(legacy.installedCount).toBe(0);
    expect(legacy.statusAvailable).toBe(false);

    const legacyModules = buildRuntimePackages({
      modules: {
        items: [{ module_id: 'legacy-ready', installed: true, status: 'ready' }],
      },
    });
    expect(legacyModules.modules).toEqual([]);
    expect(legacyModules.installedCount).toBe(0);
    expect(legacyModules.statusAvailable).toBe(false);

    const projection = buildRuntimeEnvironmentProjection({
      appState: {
        agent_packages: {
          directory: { entries: [{ package_id: 'mas', installed: false }] },
          status_index: statusIndex,
        },
      },
      managedUpdatePlane: { components: [] },
      managedUpdateMaintenance: maintenance,
      t,
    });
    expect(projection.packagesOperationalReady).toBe(true);

    const missingDirectoryProjection = buildRuntimeEnvironmentProjection({
      appState: {
        agent_packages: { status_index: statusIndex },
      },
      managedUpdatePlane: { components: [] },
      managedUpdateMaintenance: maintenance,
      t,
    });
    expect(missingDirectoryProjection.modules).toEqual([]);
    expect(missingDirectoryProjection.packageStatusAvailable).toBe(false);
    expect(missingDirectoryProjection.packagesOperationalReady).toBe(false);
  });

  it('separates desktop App update attention from runtime attention and managed App fallback', () => {
    const readyState = {
      core: { codex: { status: 'ready' } },
      provider: {
        temporal: {
          status: 'ready',
          details: {
            scheduler: { status: 'ready', ready: true },
            worker_readiness: { service_ready: true, worker_ready: true },
          },
        },
      },
      paths: { workspace_root_path: '/Users/example/workspace' },
      agent_packages: {
        directory: { entries: [] },
        status_index: { status: 'available', installed_package_count: 0, packages: {} },
      },
      runtime_source_carriers: { items: [] },
    };
    const managedApp = {
      id: 'opl_app' as const,
      label: 'OPL App',
      state: 'update_available',
      conditions: [],
      substatuses: [],
      safeToApply: false,
      repairAllowed: false,
      rollbackAllowed: false,
      manualRequired: false,
      developerCheckout: false,
      dirtyCheckout: false,
      needsRestart: false,
      needsReload: false,
      hostExecutorRequired: false,
      hostUpdateRouteExamples: [],
      preservedMounts: [],
      requiredPreservationEvidence: [],
    };
    const buildProjection = (
      desktopAutoUpdate?: Parameters<typeof buildRuntimeEnvironmentProjection>[0]['desktopAutoUpdate']
    ) =>
      buildRuntimeEnvironmentProjection({
        appState: readyState,
        managedUpdatePlane: { components: [managedApp] },
        managedUpdateMaintenance: maintenance,
        desktopAutoUpdate,
        t,
      });

    expect(buildProjection()).toMatchObject({
      runtimeAttentionCount: 0,
      attentionCount: 1,
      componentsNeedingMaintenance: 1,
    });
    expect(
      buildProjection({
        supported: true,
        status: { status: 'not-available' },
        label: 'current',
        tone: 'green',
        updateAvailable: false,
        needsAttention: false,
      })
    ).toMatchObject({
      runtimeAttentionCount: 0,
      attentionCount: 0,
      componentsNeedingMaintenance: 0,
    });
    expect(
      buildProjection({
        supported: true,
        status: { status: 'available', version: '26.7.18' },
        label: 'available',
        tone: 'orange',
        updateAvailable: true,
        needsAttention: true,
      })
    ).toMatchObject({
      runtimeAttentionCount: 0,
      attentionCount: 1,
      componentsNeedingMaintenance: 1,
    });
  });

  it('does not infer Temporal readiness from the legacy server reachability field', () => {
    const projection = buildRuntimeEnvironmentProjection({
      appState: {
        core: { codex: { status: 'ready' } },
        provider: {
          temporal: {
            status: 'ready',
            health_status: 'ready',
            details: {
              scheduler: { status: 'ready', ready: true },
              worker_readiness: { server_reachable: true, worker_ready: true },
            },
          },
        },
        paths: { workspace_root_path: '/Users/example/workspace' },
        agent_packages: {
          directory: { entries: [] },
          status_index: { status: 'available', installed_package_count: 0, packages: {} },
        },
        runtime_source_carriers: { items: [] },
      },
      managedUpdatePlane: { components: [] },
      managedUpdateMaintenance: maintenance,
      t,
    });

    expect(projection.runtimeCards.find((card) => card.key === 'temporal')).toMatchObject({
      value: 'attention_required',
      tone: 'orange',
    });
    expect(projection.attentionCount).toBe(1);
  });

  it('prioritizes mixed explicit component state over an aggregate unconfigured provider status', () => {
    const projection = buildRuntimeEnvironmentProjection({
      appState: {
        core: { codex: { status: 'ready' } },
        provider: {
          temporal: {
            status: 'provider_code_landed_unconfigured',
            health_status: 'provider_code_landed_unconfigured',
            details: {
              address_source: 'managed_local_service_state',
              scheduler: { status: 'ready', ready: true },
              worker_readiness: {
                lifecycle_status: 'worker_source_stale',
                service_ready: true,
                worker_ready: false,
              },
            },
          },
        },
        paths: { workspace_root_path: '/Users/example/workspace' },
        agent_packages: {
          directory: { entries: [] },
          status_index: { status: 'available', installed_package_count: 0, packages: {} },
        },
        runtime_source_carriers: { items: [] },
      },
      managedUpdatePlane: { components: [] },
      managedUpdateMaintenance: maintenance,
      t,
    });

    expect(projection.runtimeCards.find((card) => card.key === 'temporal')).toMatchObject({
      value: 'attention_required',
      tone: 'orange',
    });
    expect(projection.runtimeCards.find((card) => card.key === 'temporal')?.value).not.toBe('not_configured');
  });
});

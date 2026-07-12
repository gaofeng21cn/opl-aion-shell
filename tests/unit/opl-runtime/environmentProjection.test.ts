import { describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeEnvironmentProjection,
  chooseMakeUsableAction,
  findRecommendedUpdateAction,
} from '@/renderer/pages/settings/RuntimeSettings/environmentProjection';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

vi.mock('@/common/config/oplProductProfile', () => ({
  canonicalizeOplProfessionalAgentId: (value: string) =>
    ({
      mas: 'med-autoscience',
      bookforge: 'opl-bookforge',
    })[value] ?? value,
  getOplDefaultHomeAssistants: () => [
    { id: 'mas', display_name: 'MAS' },
    { id: 'bookforge', display_name: 'BookForge' },
  ],
}));

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
  executionStatus: 'idle',
  checkNow: vi.fn(),
  applySafeCandidates: vi.fn(),
};

describe('buildRuntimeEnvironmentProjection', () => {
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
        modules: {
          source: {
            mode: 'sibling_workspace',
            modules_root: '/Users/example/workspace',
          },
          items: [
            { module_id: 'medautoscience', display_name: 'MAS', status: 'ready' },
            { module_id: 'oplbookforge', display_name: 'BookForge', status: 'dirty' },
          ],
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
    expect(projection.modules.map((module) => module.module_id)).toEqual([
      'medautoscience',
      'oplbookforge',
      'oplmetaagent',
    ]);
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
        modules: {
          items: [
            { module_id: 'medautoscience', status: 'dirty', git: { dirty: true } },
            { module_id: 'medautogrant', status: 'dirty', git: { dirty: true } },
            { module_id: 'redcube', status: 'dirty', git: { dirty: true } },
            { module_id: 'oplmetaagent', status: 'ready', install_origin: 'env_override', git: { dirty: false } },
          ],
        },
      },
      managedUpdatePlane: plane,
      managedUpdateMaintenance: maintenance,
      t,
    });

    expect(projection.moduleInstalledCount).toBe(4);
    expect(projection.moduleManualMaintenanceCount).toBe(3);
  });
});

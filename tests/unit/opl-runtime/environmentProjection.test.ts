import { describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeEnvironmentProjection,
  chooseMakeUsableAction,
  findRecommendedUpdateAction,
} from '@/renderer/pages/settings/RuntimeSettings/environmentProjection';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import type { ManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

vi.mock('@/common/config/oplProductProfile', () => ({
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
  if (key === 'settings.oplEnvironmentPage.modulesReadyCount') return `${options?.ready}/${options?.total} modules`;
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
          id: 'installation_carrier',
          label: 'Installation carrier',
          state: 'current',
          conditions: [],
          safeToApply: false,
          repairAllowed: false,
          rollbackAllowed: false,
          manualRequired: false,
          developerCheckout: false,
          dirtyCheckout: false,
          needsRestart: false,
          needsReload: false,
        },
        {
          id: 'runtime_substrate',
          label: 'OPL Runtime Fabric',
          state: 'update_available',
          conditions: [],
          safeToApply: true,
          repairAllowed: false,
          rollbackAllowed: false,
          manualRequired: false,
          developerCheckout: false,
          dirtyCheckout: false,
          needsRestart: true,
          needsReload: false,
        },
        {
          id: 'capability_packages',
          label: 'OPL capability packages',
          state: 'failed_with_repair',
          conditions: [],
          safeToApply: false,
          repairAllowed: true,
          rollbackAllowed: false,
          manualRequired: false,
          developerCheckout: false,
          dirtyCheckout: false,
          needsRestart: false,
          needsReload: true,
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
    expect(projection.moduleReady).toBe(1);
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
      id: 'runtime_substrate',
      label: 'OPL Runtime Fabric',
      state: 'update_available',
      conditions: [],
      safeToApply: true,
      repairAllowed: false,
      rollbackAllowed: false,
      manualRequired: false,
      developerCheckout: false,
      dirtyCheckout: false,
      needsRestart: true,
      needsReload: false,
    };
    const agentPackages = {
      id: 'capability_packages',
      label: 'OPL capability packages',
      state: 'failed_with_repair',
      conditions: [],
      safeToApply: false,
      repairAllowed: true,
      rollbackAllowed: false,
      manualRequired: false,
      developerCheckout: false,
      dirtyCheckout: false,
      needsRestart: false,
      needsReload: true,
    };

    expect(chooseMakeUsableAction(runtimeToolchain)).toBeNull();
    expect(chooseMakeUsableAction(agentPackages)).toBe('repair');
    expect(findRecommendedUpdateAction([runtimeToolchain, agentPackages])).toEqual({
      kind: 'repair',
      component: agentPackages,
    });
  });
});

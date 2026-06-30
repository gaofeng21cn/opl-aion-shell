import { describe, expect, it, vi } from 'vitest';
import { buildRuntimeSettingsViewModel } from '@/renderer/pages/settings/RuntimeSettings/runtimeSettingsViewModel';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import { readManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplDefaultHomeAssistants: () => [
    { id: 'mas', display_name: 'MAS' },
    { id: 'mag', display_name: 'MAG' },
    { id: 'rca', display_name: 'RCA' },
    { id: 'bookforge', display_name: 'BookForge' },
  ],
}));

const t = (key: string, values?: Record<string, string | number>) => {
  const renderedValues = Object.values(values ?? {})
    .filter((value) => value !== undefined && value !== null && String(value).length > 0)
    .map(String)
    .join(' ');
  return renderedValues ? `${key} ${renderedValues}` : key;
};

Object.defineProperty(globalThis, '__OPL_RELEASE_VERSION__', { value: '', configurable: true });
Object.defineProperty(globalThis, '__APP_VERSION__', { value: '26.6.30', configurable: true });
Object.defineProperty(globalThis, '__SHELL_VERSION__', { value: '26.6.30-shell', configurable: true });

const appState = {
  core: {
    codex: {
      status: 'ready',
      parsed_version: '0.125.0',
    },
  },
  provider: {
    temporal: { status: 'ready' },
  },
  paths: {
    family_workspace_root: {
      selected_path: '/Users/example/workspace',
    },
    logs_dir: '/Users/example/workspace/.opl/logs',
  },
  modules: {
    summary: { default_modules_count: 4, healthy_default_modules_count: 4 },
    source: {
      mode: 'sibling_workspace',
      modules_root: '/Users/example/workspace/modules',
    },
    items: [
      { module_id: 'medautoscience', label: 'MAS', status: 'ready' },
      { module_id: 'medautogrant', label: 'MAG', status: 'ready' },
      { module_id: 'redcube', label: 'RCA', status: 'ready' },
      { module_id: 'oplmetaagent', label: 'OMA', status: 'ready' },
    ],
  },
  release: {
    channel: 'nightly',
    repo: 'gaofeng21cn/one-person-lab-app',
  },
};

const managedUpdateResult = {
  managed_update: {
    operation: 'status',
    update_channel: 'stable',
    components: [
      {
        component_id: 'installation_carrier',
        display_group: 'Installation carrier',
        state: 'current',
      },
      {
        component_id: 'runtime_substrate',
        display_group: 'Runtime substrate',
        state: 'update_available',
        safe_to_apply: true,
        needs_restart: true,
      },
      {
        component_id: 'capability_packages',
        display_group: 'OPL capability packages',
        state: 'failed_with_repair',
        repair_action: 'agent_package_reconcile_and_skill_sync_only',
      },
      {
        component_id: 'codex_surface',
        display_group: 'Codex Surface',
        state: 'current',
      },
    ],
  },
};

const maintenance: ManagedUpdateMaintenanceSnapshot = {
  running: false,
  operation: null,
  busyAction: null,
  executionStatus: 'idle',
  lastTrigger: null,
  lastRunAt: '2026-06-30T01:00:00Z',
  nextRunAt: null,
  lastFailure: null,
  lastAction: null,
  lastSkipReason: null,
  reloadGuidance: null,
  lockStatus: null,
  result: {
    stdout: '{}',
    parsed: managedUpdateResult,
  },
};

describe('RuntimeSettings view model adapter', () => {
  it('aggregates environment and maintenance hub state behind one adapter entrypoint', () => {
    const openUpdateModal = vi.fn();
    const runMaintenanceHubCheck = vi.fn();
    const runRepairSuggestions = vi.fn();
    const model = buildRuntimeSettingsViewModel({
      appState,
      managedUpdateMaintenance: maintenance,
      managedUpdatePlane: readManagedUpdatePlane(managedUpdateResult, appState),
      loadedAt: '10:00:00',
      activeReadOperation: 'plan',
      maintenanceHubCheckTarget: 'capabilityPacks',
      makeUsableRunning: true,
      actions: {
        openStorageSettings: vi.fn(),
        openUpdateModal,
        runMaintenanceHubCheck,
        runMakeOplUsable: vi.fn(),
        runRepairSuggestions,
      },
      t,
    });

    expect(model.environment.workspaceRoot).toBe('/Users/example/workspace');
    expect(model.environment.modulesRoot).toBe('/Users/example/workspace/modules');
    expect(model.environment.moduleReady).toBe(4);
    expect(model.environment.modules.length).toBeGreaterThanOrEqual(4);
    expect(model.releaseChannelLabel).toBe('settings.runtimePage.releaseChannels.nightly nightly');
    expect(model.maintenanceHubItems.map((item) => item.key)).toEqual([
      'appUpdates',
      'runtimeToolchain',
      'capabilityPacks',
      'storageCleanup',
      'repairSuggestions',
    ]);
    expect(model.maintenanceHubItems.find((item) => item.key === 'runtimeToolchain')).toMatchObject({
      status: 'settings.oplEnvironmentPage.status.update_available update_available',
      tone: 'orange',
      actionDisabled: true,
    });
    expect(model.maintenanceHubItems.find((item) => item.key === 'capabilityPacks')).toMatchObject({
      actionLoading: true,
      actionDisabled: true,
    });
    expect(model.maintenanceHubPrimaryAction).toMatchObject({
      loading: true,
      disabled: true,
    });

    model.maintenanceHubItems[0].onAction?.();
    model.maintenanceHubItems.find((item) => item.key === 'capabilityPacks')?.onAction?.();
    model.maintenanceHubItems.find((item) => item.key === 'repairSuggestions')?.onAction?.();

    expect(openUpdateModal).toHaveBeenCalledTimes(1);
    expect(runMaintenanceHubCheck).toHaveBeenCalledWith('capabilityPacks');
    expect(runRepairSuggestions).toHaveBeenCalledTimes(1);
  });
});

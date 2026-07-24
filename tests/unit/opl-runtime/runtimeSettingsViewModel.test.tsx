import { describe, expect, it, vi } from 'vitest';
import type { AutoUpdateStatus } from '@/common/update/updateTypes';
import { buildRuntimeSettingsViewModel } from '@/renderer/pages/settings/RuntimeSettings/runtimeSettingsViewModel';
import { projectDesktopAutoUpdateStatus } from '@/renderer/services/desktopAutoUpdateProjection';
import type { ManagedUpdateMaintenanceSnapshot } from '@/renderer/services/managedUpdateMaintenance';
import { readManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

vi.mock('@/common/config/oplProductProfile', () => ({
  canonicalizeOplProfessionalAgentId: (value: string) =>
    ({
      mas: 'med-autoscience',
      mag: 'med-autogrant',
      rca: 'redcube-ai',
      bookforge: 'opl-bookforge',
    })[value] ?? value,
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
  agent_packages: {
    directory: {
      entries: [
        { package_id: 'mas', display_name: 'MAS', installed: true },
        { package_id: 'mag', display_name: 'MAG', installed: true },
        { package_id: 'rca', display_name: 'RCA', installed: true },
        { package_id: 'oma', display_name: 'OMA', installed: true },
      ],
    },
    status_index: {
      status: 'available',
      packages: {
        mas: { package_id: 'mas', status: 'ready', operational_ready: true },
        mag: { package_id: 'mag', status: 'ready', operational_ready: true },
        rca: { package_id: 'rca', status: 'ready', operational_ready: true },
        oma: { package_id: 'oma', status: 'ready', operational_ready: true },
      },
    },
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
        component_id: 'opl_app',
        display_group: 'OPL App',
        state: 'current',
      },
      {
        component_id: 'opl_base',
        display_group: 'OPL Base',
        state: 'update_available',
        safe_to_apply: true,
        needs_restart: true,
      },
      {
        component_id: 'opl_packages',
        display_group: 'OPL Packages',
        package_id: 'oma',
        state: 'failed_with_repair',
        repair_action: 'agent_package_reconcile_and_skill_sync_only',
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
  restartRequired: false,
  lastReconciledCarrierCheckpoint: null,
  lockStatus: null,
  result: {
    stdout: '{}',
    parsed: managedUpdateResult,
  },
};

describe('RuntimeSettings view model adapter', () => {
  it.each([
    { supported: false, status: null, label: 'settings.aboutUpdateNotChecked', tone: 'gray', attention: false },
    { supported: true, status: null, label: 'settings.aboutUpdateNotChecked', tone: 'gray', attention: false },
    {
      supported: true,
      status: { status: 'checking' },
      label: 'settings.aboutUpdateChecking',
      tone: 'gray',
      attention: false,
    },
    {
      supported: true,
      status: { status: 'not-available' },
      label: 'settings.aboutUpdateCurrent',
      tone: 'green',
      attention: false,
    },
    {
      supported: true,
      status: { status: 'available', version: '26.7.18' },
      label: 'settings.aboutUpdateAvailable 26.7.18',
      tone: 'orange',
      attention: true,
    },
    {
      supported: true,
      status: { status: 'available' },
      label: 'settings.aboutUpdateAvailableGeneric',
      tone: 'orange',
      attention: true,
    },
    {
      supported: true,
      status: { status: 'downloading' },
      label: 'settings.aboutUpdateDownloading',
      tone: 'orange',
      attention: true,
    },
    {
      supported: true,
      status: { status: 'downloaded' },
      label: 'settings.aboutUpdateDownloaded',
      tone: 'orange',
      attention: true,
    },
    {
      supported: true,
      status: { status: 'error' },
      label: 'settings.aboutUpdateUnknown',
      tone: 'orange',
      attention: true,
    },
    {
      supported: true,
      status: { status: 'cancelled' },
      label: 'settings.aboutUpdateCancelled',
      tone: 'gray',
      attention: false,
    },
  ] satisfies Array<{
    supported: boolean;
    status: AutoUpdateStatus | null;
    label: string;
    tone: 'green' | 'orange' | 'gray';
    attention: boolean;
  }>)(
    'projects updater status $status.status without conflating attention',
    ({ supported, status, label, tone, attention }) => {
      expect(projectDesktopAutoUpdateStatus(supported, status, t)).toMatchObject({
        supported,
        status,
        label,
        tone,
        needsAttention: attention,
      });
    }
  );

  it('aggregates environment and maintenance hub state behind one adapter entrypoint', () => {
    const openUpdateModal = vi.fn();
    const runMaintenanceHubCheck = vi.fn();
    const runServiceCheck = vi.fn();
    const model = buildRuntimeSettingsViewModel({
      appState,
      managedUpdateMaintenance: maintenance,
      managedUpdatePlane: readManagedUpdatePlane(managedUpdateResult, appState),
      loadedAt: '10:00:00',
      activeReadOperation: 'plan',
      maintenanceHubCheckTarget: 'oplPackages',
      makeUsableRunning: true,
      actions: {
        openStorageSettings: vi.fn(),
        openUpdateModal,
        runMaintenanceHubCheck,
        runMakeOplUsable: vi.fn(),
        runServiceCheck,
      },
      t,
    });

    expect(model.environment.workspaceRoot).toBe('/Users/example/workspace');
    expect(model.environment.modulesRoot).toBe('/Users/example/workspace');
    expect(model.environment.moduleInstalledCount).toBe(4);
    expect(model.environment.moduleManualMaintenanceCount).toBe(0);
    expect(model.environment.modules.length).toBeGreaterThanOrEqual(4);
    expect(model.releaseChannelLabel).toBe('settings.runtimePage.releaseChannels.nightly nightly');
    expect(model.maintenanceHubItems.map((item) => item.key)).toEqual([
      'appUpdates',
      'runtimeEnvironment',
      'capabilitySurfaceSync',
      'localServicesRepair',
    ]);
    expect(model.maintenanceHubItems.find((item) => item.key === 'runtimeEnvironment')).toMatchObject({
      status: 'settings.oplEnvironmentPage.status.update_available update_available',
      tone: 'orange',
      actionDisabled: true,
    });
    expect(model.maintenanceHubItems.find((item) => item.key === 'capabilitySurfaceSync')).toMatchObject({
      status: 'settings.oplEnvironmentPage.status.failed_with_repair failed_with_repair',
      detail: expect.stringContaining('settings.oplEnvironmentPage.modulesInstalledCount 4 4'),
      actionLoading: true,
      actionDisabled: true,
    });

    model.maintenanceHubItems[0].onAction?.();
    model.maintenanceHubItems.find((item) => item.key === 'capabilitySurfaceSync')?.onAction?.();
    model.maintenanceHubItems.find((item) => item.key === 'localServicesRepair')?.onAction?.();

    expect(openUpdateModal).toHaveBeenCalledTimes(1);
    expect(runMaintenanceHubCheck).toHaveBeenCalledWith('oplPackages');
    expect(runServiceCheck).toHaveBeenCalledTimes(1);
  });

  it('offers a check for historical repair receipts and repair only for live capability', () => {
    const runMaintenanceHubCheck = vi.fn();
    const runMakeOplUsable = vi.fn();
    const actions = {
      openStorageSettings: vi.fn(),
      openUpdateModal: vi.fn(),
      runMaintenanceHubCheck,
      runMakeOplUsable,
      runServiceCheck: vi.fn(),
    };
    const buildModel = (managedUpdatePlane: ReturnType<typeof readManagedUpdatePlane>) =>
      buildRuntimeSettingsViewModel({
        appState,
        managedUpdateMaintenance: maintenance,
        managedUpdatePlane,
        activeReadOperation: null,
        maintenanceHubCheckTarget: null,
        makeUsableRunning: false,
        actions,
        t,
      });
    const historical = buildModel(
      readManagedUpdatePlane(
        {
          managed_update: {
            components: [
              {
                component_id: 'opl_base',
                state: 'current',
                receipt: { repair_action: 'historical_repair_action' },
              },
            ],
          },
        },
        appState
      )
    );
    const historicalRuntime = historical.maintenanceHubItems.find((item) => item.key === 'runtimeEnvironment');

    expect(historicalRuntime).toMatchObject({
      actionLabel: 'settings.oplEnvironmentPage.maintenanceHub.actions.checkRuntimeEnvironment',
      actionLoading: false,
    });
    historicalRuntime?.onAction?.();
    expect(runMaintenanceHubCheck).toHaveBeenCalledWith('oplBase');
    expect(runMakeOplUsable).not.toHaveBeenCalled();

    const live = buildModel(
      readManagedUpdatePlane(
        {
          managed_update: {
            components: [
              {
                component_id: 'opl_base',
                state: 'failed_with_repair',
                repair_allowed: true,
                repair_action: 'opl_base_repair_only',
              },
            ],
          },
        },
        appState
      )
    );
    const liveRuntime = live.maintenanceHubItems.find((item) => item.key === 'runtimeEnvironment');

    expect(liveRuntime).toMatchObject({
      actionLabel: 'settings.oplEnvironmentPage.maintenanceHub.actions.repairRuntimeEnvironment',
      actionLoading: false,
    });
    liveRuntime?.onAction?.();
    expect(runMakeOplUsable).toHaveBeenCalledTimes(1);
  });
});

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StorageSettingsContent } from '@/renderer/pages/settings/StorageSettings';

const bridgeMocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  getInventorySnapshot: vi.fn(),
  refreshInventory: vi.fn(),
  inventoryUpdatedOn: vi.fn(),
  systemInfo: vi.fn(),
  updateSystemInfo: vi.fn(),
  showOpen: vi.fn(),
  openFolder: vi.fn(),
  archiveConversations: vi.fn(),
  restoreConversationProof: vi.fn(),
  restoreConversationArchive: vi.fn(),
  deleteConversationArtifacts: vi.fn(),
  planRuntimePrune: vi.fn(),
  executeRuntimePrune: vi.fn(),
  planLogRotation: vi.fn(),
  executeLogRotation: vi.fn(),
  planUpdaterCacheCleanup: vi.fn(),
  executeUpdaterCacheCleanup: vi.fn(),
  executeAction: vi.fn(),
  loadAppState: vi.fn(),
  navigate: vi.fn(),
  appState: {} as Record<string, unknown>,
}));

const webuiLifecycleMocks = vi.hoisted(() => ({
  readCapability: vi.fn(),
  plan: vi.fn(),
  execute: vi.fn(),
  restore: vi.fn(),
}));

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

vi.mock('@/common', () => ({
  ipcBridge: {
    localDataLifecycle: {
      getInventory: { invoke: bridgeMocks.getInventory },
      getInventorySnapshot: { invoke: bridgeMocks.getInventorySnapshot },
      refreshInventory: { invoke: bridgeMocks.refreshInventory },
      inventoryUpdated: { on: bridgeMocks.inventoryUpdatedOn },
      archiveConversations: { invoke: bridgeMocks.archiveConversations },
      restoreConversationProof: { invoke: bridgeMocks.restoreConversationProof },
      restoreConversationArchive: { invoke: bridgeMocks.restoreConversationArchive },
      deleteConversationArtifacts: { invoke: bridgeMocks.deleteConversationArtifacts },
      planRuntimePrune: { invoke: bridgeMocks.planRuntimePrune },
      executeRuntimePrune: { invoke: bridgeMocks.executeRuntimePrune },
      planLogRotation: { invoke: bridgeMocks.planLogRotation },
      executeLogRotation: { invoke: bridgeMocks.executeLogRotation },
      planUpdaterCacheCleanup: { invoke: bridgeMocks.planUpdaterCacheCleanup },
      executeUpdaterCacheCleanup: { invoke: bridgeMocks.executeUpdaterCacheCleanup },
    },
    application: {
      systemInfo: { invoke: bridgeMocks.systemInfo },
      updateSystemInfo: { invoke: bridgeMocks.updateSystemInfo },
    },
    dialog: {
      showOpen: { invoke: bridgeMocks.showOpen },
    },
    shell: {
      openFolderWith: { invoke: bridgeMocks.openFolder },
    },
    oplRuntime: {
      executeAction: { invoke: bridgeMocks.executeAction },
    },
  },
}));

vi.mock('@/renderer/pages/settings/StorageSettings/webuiDataLifecycleClient', () => ({
  readWebuiDataLifecycleCapability: webuiLifecycleMocks.readCapability,
  planWebuiDataLifecycle: webuiLifecycleMocks.plan,
  executeWebuiDataLifecycle: webuiLifecycleMocks.execute,
  restoreWebuiDataLifecycle: webuiLifecycleMocks.restore,
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({
    appState: bridgeMocks.appState,
    payload: null,
    loadedAt: null,
    loading: false,
    refreshing: false,
    error: null,
    load: bridgeMocks.loadAppState,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => bridgeMocks.navigate };
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

const translate = (key: string, values?: Record<string, string | number>) => {
  const labels: Record<string, string> = {
    'settings.storagePage.title': 'Data & Storage',
    'settings.storagePage.description': 'Review and safely remove local data.',
    'settings.storagePage.actions.archive': 'Create archive',
    'settings.storagePage.actions.restoreProof': 'Verify archive',
    'settings.storagePage.actions.previewAll': 'Preview cleanup',
    'settings.storagePage.actions.refresh': 'Refresh',
    'settings.storagePage.actions.dryRunRuntime': 'Review runtime cleanup',
    'settings.storagePage.actions.dryRunLogs': 'Review log cleanup',
    'settings.storagePage.actions.dryRunUpdater': 'Review installer cache cleanup',
    'settings.storagePage.actions.executeRuntime': 'Confirm runtime cleanup',
    'settings.storagePage.actions.executeLogs': 'Confirm log cleanup',
    'settings.storagePage.actions.executeUpdater': 'Confirm installer cleanup',
    'settings.storagePage.actions.deleteWithReceipt': 'Remove local files',
    'settings.storagePage.sections.updater.title': 'Installer package cache',
    'settings.storagePage.sections.updater.description': 'Review affected files before cleanup.',
    'settings.storagePage.sections.conversations.title': 'Conversations and attachments',
    'settings.storagePage.sections.conversations.description': 'Create a restorable archive first.',
    'settings.storagePage.sections.runtime.title': 'Runtime cache',
    'settings.storagePage.sections.runtime.description': 'Review affected files before cleanup.',
    'settings.storagePage.sections.logs.title': 'App logs',
    'settings.storagePage.sections.logs.description': 'Older logs can be removed by retention rules.',
    'settings.storagePage.inventory.bytes': `Bytes: ${values?.bytes ?? ''}`,
    'settings.storagePage.inventory.cleanupMode': `Condition: ${values?.mode ?? ''}`,
    'settings.storagePage.inventory.rootCount': `Roots: ${values?.count ?? ''}`,
    'settings.storagePage.inventory.details': 'View locations and details',
    'settings.storagePage.inventory.rootDetail': `${values?.exists ?? ''} ${values?.bytes ?? ''}`,
    'settings.storagePage.inventory.exists': 'exists',
    'settings.storagePage.inventory.missing': 'missing',
    'settings.storagePage.inventory.noRoots': 'No roots reported.',
    'settings.storagePage.inventory.notLoaded': 'Storage details are not loaded yet.',
    'settings.storagePage.inventory.unknownSize': 'Size unavailable',
    'settings.storagePage.inventory.awaitingSnapshot': 'Waiting for the cached inventory',
    'settings.storagePage.inventory.stale': 'Out of date',
    'settings.storagePage.inventory.current': 'Current',
    'settings.storagePage.inventory.silentDeleteAllowed': 'Ready to clean',
    'settings.storagePage.inventory.silentDeleteBlocked': 'Preparation required',
    'settings.storagePage.inventory.cleanupModes.safeWithoutExtraProof': 'Ready to clean',
    'settings.storagePage.inventory.cleanupModes.needsArchiveProof': 'Clean after archiving',
    'settings.storagePage.inventory.cleanupModes.needsPreview': 'Review and clean',
    'settings.storagePage.inventory.cleanupModes.needsReview': 'Check and clean',
    'settings.storagePage.inventory.noCleanupNeeded': 'Nothing to clean',
    'settings.storagePage.overview.total': 'Total',
    'settings.storagePage.overview.categories': 'Local data',
    'settings.storagePage.overview.safe': 'Safe now',
    'settings.storagePage.overview.needsProof': 'Need proof',
    'settings.storagePage.cleanupFlow.title': 'Safe cleanup flow',
    'settings.storagePage.cleanupFlow.detail': 'Cleanup uses preview, confirmation, and execution.',
    'settings.storagePage.cleanupFlow.step1': '1. Preview',
    'settings.storagePage.cleanupFlow.preview': 'Create a dry-run plan or archive proof.',
    'settings.storagePage.cleanupFlow.step2': '2. Confirm',
    'settings.storagePage.cleanupFlow.confirm': 'Review the exact receipt or preview summary.',
    'settings.storagePage.cleanupFlow.step3': '3. Execute',
    'settings.storagePage.cleanupFlow.execute': 'Run only the confirmed plan.',
    'settings.storagePage.researchLifecycle.title': 'Work data protection rules',
    'settings.storagePage.researchLifecycle.detail': 'Open only when troubleshooting cleanup boundaries.',
    'settings.storagePage.researchLifecycle.technicalDetails': 'Work data protection details',
    'settings.oplEnvironmentPage.updates.diagnostics.title': 'Diagnostics',
    'settings.storagePage.researchLifecycle.boundary':
      'Source references only. No SQLite sidecars, workspace tree scans, clinical data body deletes, or generic cleanup authorization.',
    'settings.storagePage.researchLifecycle.states.available': 'Source available',
    'settings.storagePage.researchLifecycle.states.attention': 'Needs review',
    'settings.storagePage.researchLifecycle.states.blocked': 'Forbidden',
    'settings.storagePage.conversations.title': 'Conversation archive',
    'settings.storagePage.conversations.detail': 'Keep a restorable copy before removing local files.',
    'settings.storagePage.conversations.receiptRequired': 'Create an archive first.',
    'settings.storagePage.conversations.proofReady': 'Archive created.',
    'settings.storagePage.conversations.deleteConfirmation':
      'Local files will be removed while the archive remains available.',
    'settings.storagePage.conversations.technicalReceipt': `Archive record: ${values?.receipt ?? ''}`,
    'settings.storagePage.runtime.title': 'Runtime cleanup',
    'settings.storagePage.runtime.detail': 'Preview the exact runtime paths first.',
    'settings.storagePage.plans.runtime.required': 'Preview required before runtime cleanup can run.',
    'settings.storagePage.logs.title': 'Log cleanup',
    'settings.storagePage.plans.logs.required': 'Preview required before log cleanup can run.',
    'settings.storagePage.updater.title': 'Installer package cache',
    'settings.storagePage.updater.detail': 'Only stale installer package cache is targeted.',
    'settings.storagePage.plans.updater.required': 'Preview required before installer cache cleanup can run.',
    'settings.storagePage.logs.detail': 'Logs are not conversation artifacts.',
    'settings.storagePage.messages.actionComplete': 'Storage action completed',
    'settings.uiOptimization.storage.unavailable.title': 'Storage information temporarily unavailable',
    'settings.uiOptimization.storage.unavailable.description': 'Storage information could not be read.',
    'settings.uiOptimization.storage.unavailable.reasons.desktopCarrier': 'Desktop storage carrier is unavailable.',
    'settings.uiOptimization.storage.unavailable.reasons.permission': 'Storage directory permission is missing.',
    'settings.uiOptimization.storage.unavailable.reasons.service': 'Local storage service is not ready.',
    'settings.uiOptimization.storage.unavailable.reasons.unknown': 'Storage failure reason is unknown.',
    'settings.uiOptimization.storage.unavailable.actions.retry': 'Retry',
    'settings.uiOptimization.storage.unavailable.actions.openWorkspace': 'Open Workspace settings',
    'settings.uiOptimization.storage.unavailable.actions.openMaintenance': 'Open Maintenance',
    'settings.uiOptimization.maintenance.technicalDetails': 'Technical details',
    'settings.workspacePage.logs.title': 'Logs directory',
    'settings.workspacePage.logs.description': 'Choose where the desktop App stores logs.',
    'settings.workspacePage.logs.unavailable': 'Log directory unavailable',
    'settings.workspacePage.logs.saved': 'Logs directory saved',
    'settings.workspacePage.actions.openLogs': 'Open logs directory',
    'settings.workspacePage.actions.changeLogs': 'Change logs directory',
    'common.runtime.archiveTask.restore': 'Restore',
    'settings.updateConfirm': 'Confirm Changes',
    'common.cancel': 'Cancel',
  };
  if (key === 'settings.storagePage.inventory.freshness') {
    return `Observed ${values?.observedAt} in ${values?.duration} ms · ${values?.state}`;
  }
  if (key === 'settings.workspacePage.logs.current') return `Current: ${values?.path}`;
  const renderedValues = Object.values(values ?? {})
    .filter((value) => value !== undefined && value !== null && String(value).length > 0)
    .map(String)
    .join(' ');
  return labels[key] ?? (renderedValues ? `${key} ${renderedValues}` : key);
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

const inventory = {
  schema: 'opl_local_data_lifecycle_inventory.v1',
  total_bytes: 100,
  sections: [
    {
      id: 'updater_cache',
      cleanup_mode: 'stale_installer_package_cleanup_allowed',
      silent_delete_allowed: true,
      bytes: 10,
      roots: [{ path: '/tmp/updater-cache', exists: true, bytes: 10 }],
    },
    {
      id: 'user_data_artifacts',
      cleanup_mode: 'archive_required_before_cleanup',
      silent_delete_allowed: false,
      bytes: 20,
      roots: [{ path: '/tmp/conversations', exists: true, bytes: 20 }],
    },
    {
      id: 'runtime_substrate',
      cleanup_mode: 'pointer_based_dry_run_required',
      silent_delete_allowed: false,
      bytes: 30,
      roots: [{ path: '/tmp/runtime', exists: true, bytes: 30 }],
    },
    {
      id: 'logs',
      cleanup_mode: 'bounded_rotation_dry_run_required',
      silent_delete_allowed: false,
      bytes: 40,
      roots: [{ path: '/tmp/logs', exists: true, bytes: 40 }],
    },
  ],
};

const inventorySnapshot = {
  schema: 'opl_local_data_lifecycle_inventory_snapshot.v1',
  inventory,
  observed_at: '2026-07-14T08:00:00.000Z',
  scan_duration_ms: 42,
  stale: false,
  error: null,
} as const;

const snapshotWithInventory = (nextInventory: typeof inventory | null) => ({
  ...inventorySnapshot,
  inventory: nextInventory,
});

const receipt = {
  schema: 'opl_conversation_archive_receipt.v1',
  conversation_id: 'conversation-1',
  source_paths: ['/tmp/conversations'],
  archive_path: '/tmp/archive',
  archive_sha256: 'a'.repeat(64),
  manifest_path: '/tmp/archive/manifest.json',
  restore_probe_path: '/tmp/archive/restore-probe.json',
  receipt_path: 'receipt://conversation/archive',
  created_at: '2026-06-18T12:00:00.000Z',
};

const restoreReceipt = {
  schema: 'opl_conversation_restore_receipt.v1',
  conversation_id: 'conversation-1',
  restored_paths: ['/tmp/conversations/paper.md'],
  archive_receipt_path: receipt.receipt_path,
  archive_sha256: receipt.archive_sha256,
  receipt_path: 'receipt://conversation/restore',
  created_at: '2026-06-18T12:02:00.000Z',
};

const runtimePlan = {
  schema: 'opl_runtime_pointer_prune_plan.v1',
  mode: 'dry_run',
  plan_id: 'runtime-plan',
  plan_hash: 'runtime-hash',
  runtime_root: '/tmp/runtime',
  protected_paths: ['/tmp/runtime/current'],
  remove_candidates: [{ path: '/tmp/runtime/stale', bytes: 30, reason: 'unreferenced_runtime_root' }],
  remove_bytes: 30,
  created_at: '2026-06-18T12:00:00.000Z',
};

const logsPlan = {
  schema: 'opl_log_retention_plan.v1',
  mode: 'dry_run',
  plan_id: 'logs-plan',
  plan_hash: 'logs-hash',
  logs_root: '/tmp/logs',
  keep_paths: ['/tmp/logs/current.log'],
  remove_candidates: [{ path: '/tmp/logs/old.log', bytes: 40, reason: 'older_than_retention_days' }],
  remove_bytes: 40,
  created_at: '2026-06-18T12:00:00.000Z',
};

const updaterPlan = {
  schema: 'opl_updater_cache_cleanup_plan.v1',
  mode: 'dry_run',
  plan_id: 'updater-plan',
  plan_hash: 'updater-hash',
  cache_roots: ['/tmp/updater-cache'],
  keep_paths: [],
  remove_candidates: [{ path: '/tmp/updater-cache/pkg.zip', bytes: 10, reason: 'stale_installer_package' }],
  remove_bytes: 10,
  created_at: '2026-06-18T12:00:00.000Z',
};

describe('StorageSettingsContent', () => {
  const scrollIntoView = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    bridgeMocks.getInventorySnapshot.mockResolvedValue(inventorySnapshot);
    bridgeMocks.refreshInventory.mockResolvedValue(inventorySnapshot);
    bridgeMocks.inventoryUpdatedOn.mockReturnValue(() => undefined);
    bridgeMocks.systemInfo.mockResolvedValue({
      cacheDir: '/Users/example/Library/Caches/One Person Lab App',
      workDir: '/Users/example/Library/Application Support/One Person Lab App',
      logDir: '/Users/example/Library/Logs/One Person Lab App',
      platform: 'darwin',
      arch: 'arm64',
    });
    bridgeMocks.updateSystemInfo.mockResolvedValue(undefined);
    bridgeMocks.showOpen.mockResolvedValue(['/Users/example/OPL Logs']);
    bridgeMocks.openFolder.mockResolvedValue(undefined);
    bridgeMocks.archiveConversations.mockResolvedValue(receipt);
    bridgeMocks.restoreConversationProof.mockResolvedValue(receipt);
    bridgeMocks.restoreConversationArchive.mockResolvedValue(restoreReceipt);
    bridgeMocks.deleteConversationArtifacts.mockResolvedValue(receipt);
    bridgeMocks.planRuntimePrune.mockResolvedValue(runtimePlan);
    bridgeMocks.executeRuntimePrune.mockResolvedValue(receipt);
    bridgeMocks.planLogRotation.mockResolvedValue(logsPlan);
    bridgeMocks.executeLogRotation.mockResolvedValue(receipt);
    bridgeMocks.planUpdaterCacheCleanup.mockResolvedValue(updaterPlan);
    bridgeMocks.executeUpdaterCacheCleanup.mockResolvedValue(receipt);
    bridgeMocks.executeAction.mockResolvedValue({ ok: true, parsed: {} });
    bridgeMocks.loadAppState.mockResolvedValue({ app_state: {} });
    bridgeMocks.appState = {};
    webuiLifecycleMocks.readCapability.mockResolvedValue(null);
    webuiLifecycleMocks.plan.mockReset();
    webuiLifecycleMocks.execute.mockReset();
    webuiLifecycleMocks.restore.mockReset();
  });

  it('merges valid owner projections without inventing unknown bytes or a WebUI cleanup action', async () => {
    bridgeMocks.appState = {
      agent_packages: {
        storage_inventory: {
          status: 'available',
          observed_at: '2026-07-18T08:00:00.000Z',
          stale: false,
          bytes: 2048,
          reclaimable_bytes: 1024,
          owner_route: '/settings/agents',
          projected_action: { kind: 'navigate', action_id: null },
        },
      },
      settings_control_center: {
        app_settings_read_model: {
          storage_lifecycle: {
            agent_package_store: {
              status: 'available',
              observed_at: '2026-07-18T08:00:00.000Z',
              stale: false,
              bytes: 1024,
              reclaimable_bytes: 512,
              owner_route: '/settings/agents',
              projected_action: { kind: 'navigate', action_id: null },
            },
            webui_data_volume: {
              status: 'unavailable',
              observed_at: null,
              stale: true,
              bytes: null,
              reclaimable_bytes: null,
              owner_route: '/settings/storage#webui-data',
              projected_action: {
                kind: 'host_action_required',
                action_id: null,
                execution_owner: 'carrier_host',
              },
            },
          },
        },
      },
    };

    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    const agentStore = screen.getByTestId('storage-owner-agent_package_store');
    const webuiData = screen.getByTestId('storage-owner-webui_data_volume');
    expect(agentStore).toHaveTextContent('2.0 KB');
    expect(agentStore).not.toHaveTextContent('1 KB');
    expect(webuiData).toHaveTextContent('Size unavailable');
    expect(webuiData).not.toHaveTextContent('0 B');
    expect(webuiData).toHaveTextContent('settings.resourcesPage.resourceSources.management.selfManaged');
    expect(within(webuiData).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('Size unavailable');

    fireEvent.click(within(agentStore).getByRole('button', { name: 'settings.agentsPage.title' }));
    expect(bridgeMocks.navigate).toHaveBeenCalledWith('/settings/agents');
  });

  it('keeps the WebUI Storage core route fail-open without invoking desktop local lifecycle', async () => {
    const electronApiDescriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    bridgeMocks.appState = {
      agent_packages: {
        storage_inventory: {
          status: 'available',
          observed_at: '2026-07-18T08:00:00.000Z',
          stale: false,
          bytes: 2048,
          reclaimable_bytes: 1024,
          owner_route: '/settings/agents',
          projected_action: { kind: 'navigate', action_id: null },
        },
      },
      settings_control_center: {
        app_settings_read_model: {
          storage_lifecycle: {
            webui_data_volume: {
              status: 'unavailable',
              observed_at: null,
              stale: true,
              bytes: null,
              reclaimable_bytes: null,
              owner_route: '/settings/storage#webui-data',
              projected_action: {
                kind: 'host_action_required',
                action_id: null,
                execution_owner: 'carrier_host',
              },
            },
          },
        },
      },
    };
    bridgeMocks.executeAction.mockRejectedValue(new Error('owner inventory unavailable'));

    try {
      render(<StorageSettingsContent />);

      expect(await screen.findByTestId('settings-page-storage')).toBeInTheDocument();
      expect(screen.getByTestId('storage-owner-agent_package_store')).toHaveTextContent('2.0 KB');
      expect(screen.getByTestId('storage-owner-webui_data_volume')).toHaveTextContent('Size unavailable');
      expect(screen.getByTestId('storage-overview')).toHaveTextContent('Size unavailable');
      expect(screen.queryByTestId('storage-inventory-updater_cache')).not.toBeInTheDocument();
      expect(screen.queryByTestId('storage-inventory-user_data_artifacts')).not.toBeInTheDocument();
      expect(screen.queryByTestId('storage-inventory-runtime_substrate')).not.toBeInTheDocument();
      expect(screen.queryByTestId('storage-inventory-logs')).not.toBeInTheDocument();
      expect(screen.queryByTestId('settings-storage-primary-action')).not.toBeInTheDocument();
      expect(screen.queryByTestId('settings-storage-diagnostics-action')).not.toBeInTheDocument();
      expect(screen.queryByTestId('storage-inventory-freshness')).not.toBeInTheDocument();
      expect(screen.queryByTestId('storage-research-lifecycle')).not.toBeInTheDocument();
      expect(document.getElementById('archives')).not.toBeNull();
      expect(document.getElementById('cleanup-history')).not.toBeNull();
      expect(document.querySelectorAll('#cleanup-history')).toHaveLength(1);
      expect(bridgeMocks.getInventorySnapshot).not.toHaveBeenCalled();
      expect(bridgeMocks.inventoryUpdatedOn).not.toHaveBeenCalled();
      expect(bridgeMocks.restoreConversationProof).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('storage-refresh'));
      await waitFor(() => expect(bridgeMocks.executeAction).toHaveBeenCalledTimes(2));
      expect(bridgeMocks.refreshInventory).not.toHaveBeenCalled();
      expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', {
        forceFresh: true,
        showRefreshing: false,
      });
      expect(screen.queryByTestId('settings-storage-exception')).not.toBeInTheDocument();
    } finally {
      if (electronApiDescriptor) Object.defineProperty(window, 'electronAPI', electronApiDescriptor);
    }
  });

  it('explains a missing desktop carrier only when WebUI has no valid owner readback', async () => {
    const electronApiDescriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    bridgeMocks.appState = {};

    try {
      render(<StorageSettingsContent />);

      expect(await screen.findByTestId('settings-storage-unavailable-reason-desktopCarrier')).toHaveTextContent(
        'Desktop storage carrier is unavailable.'
      );
      expect(bridgeMocks.getInventorySnapshot).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('settings-storage-unavailable-recovery'));
      expect(bridgeMocks.navigate).toHaveBeenCalledWith('/settings/environment');
    } finally {
      if (electronApiDescriptor) Object.defineProperty(window, 'electronAPI', electronApiDescriptor);
    }
  });

  it('routes permission failures to Workspace and keeps the raw error collapsed', async () => {
    bridgeMocks.getInventorySnapshot.mockRejectedValueOnce(new Error('EACCES: permission denied, scandir /private'));

    render(<StorageSettingsContent />);

    expect(await screen.findByTestId('settings-storage-unavailable-reason-permission')).toHaveTextContent(
      'Storage directory permission is missing.'
    );
    const details = screen.getByTestId('settings-storage-unavailable-technical-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent('EACCES: permission denied');
    expect(screen.queryByTestId('settings-storage-exception')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-storage-unavailable-recovery'));
    expect(bridgeMocks.navigate).toHaveBeenCalledWith('/settings/workspace');
  });

  it('uses the unknown recovery state for an unclassified storage failure', async () => {
    bridgeMocks.getInventorySnapshot.mockRejectedValueOnce(new Error('opaque storage fault 42'));

    render(<StorageSettingsContent />);

    expect(await screen.findByTestId('settings-storage-unavailable-reason-unknown')).toHaveTextContent(
      'Storage failure reason is unknown.'
    );
    expect(screen.getByTestId('settings-storage-unavailable-technical-details')).toHaveTextContent(
      'opaque storage fault 42'
    );
    fireEvent.click(screen.getByTestId('settings-storage-unavailable-recovery'));
    expect(bridgeMocks.navigate).toHaveBeenCalledWith('/settings/environment');
  });

  it('shows the WebUI lifecycle controls only for a complete host capability and preserves plan confirmation', async () => {
    const electronApiDescriptor = Object.getOwnPropertyDescriptor(window, 'electronAPI');
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
    bridgeMocks.appState = {
      agent_packages: {
        storage_inventory: {
          status: 'available',
          observed_at: '2026-07-18T08:00:00.000Z',
          stale: false,
          bytes: 2048,
          reclaimable_bytes: 1024,
          owner_route: '/settings/agents',
          projected_action: { kind: 'navigate', action_id: null },
        },
      },
      settings_control_center: {
        app_settings_read_model: {
          storage_lifecycle: {
            webui_data_volume: {
              status: 'available',
              observed_at: '2026-07-18T08:00:00.000Z',
              stale: false,
              bytes: 100,
              reclaimable_bytes: 24,
              owner_route: '/settings/storage#webui-data',
              projected_action: {
                kind: 'host_action_required',
                action_id: null,
                execution_owner: 'carrier_host',
              },
            },
          },
        },
      },
    };
    const capability = {
      capability_id: 'carrier_host.storage.webui_data_volume.lifecycle',
      endpoint_status: 'available',
      endpoint_availability: 'host_owner_injected',
      plan_action_id: 'settings_plan_webui_data_volume_cleanup',
      execute_action_id: 'settings_execute_webui_data_volume_cleanup',
      restore_action_id: 'settings_restore_webui_data_volume_cleanup',
    };
    const plan = {
      plan_id: 'plan-1',
      plan_hash: 'hash-1',
      exact_confirmation: 'confirm-1',
      estimated_reclaimable_bytes: 24,
      candidate_count: 2,
      restore_supported: true,
      observed_at: '2026-07-18T08:00:00.000Z',
      expires_at: '2026-07-18T08:05:00.000Z',
    };
    const webuiReceipt = {
      receipt_id: 'receipt-1',
      action_id: 'settings_execute_webui_data_volume_cleanup',
      status: 'completed',
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      receipt_ref: 'receipt:opaque',
      restore_action_ref: 'settings_restore_webui_data_volume_cleanup',
      archive_ref: 'archive:opaque',
      archive_manifest_ref: 'manifest:opaque',
      archive_sha256: 'sha256',
      archived_bytes: 24,
      deleted_bytes: 24,
      readback: {
        status: 'ready',
        terminal: true,
        observed_at: '2026-07-18T08:01:00.000Z',
        bytes: 0,
        reclaimable_bytes: 0,
        receipt_ref: 'receipt:opaque',
        restore_status: 'available',
      },
    };
    webuiLifecycleMocks.readCapability.mockResolvedValue(capability);
    webuiLifecycleMocks.plan.mockResolvedValue(plan);
    webuiLifecycleMocks.execute.mockResolvedValue(webuiReceipt);
    webuiLifecycleMocks.restore.mockResolvedValue({
      action_id: 'settings_restore_webui_data_volume_cleanup',
      status: 'completed',
      receipt_ref: webuiReceipt.receipt_ref,
      restore_receipt_ref: 'restore:opaque',
      restored_bytes: 24,
      readback: { ...webuiReceipt.readback, bytes: 24, reclaimable_bytes: 24, restore_status: 'restored' },
    });

    try {
      render(<StorageSettingsContent />);
      const review = await screen.findByTestId('storage-webui-plan');
      expect(screen.getByTestId('storage-owner-webui_data_volume')).not.toHaveTextContent(
        'settings.resourcesPage.resourceSources.management.selfManaged'
      );
      fireEvent.click(review);
      const execute = await screen.findByTestId('storage-webui-execute');
      expect(screen.getByTestId('storage-owner-webui_data_volume')).toHaveTextContent('2 24 B');
      fireEvent.click(execute);
      fireEvent.click(await screen.findByTestId('storage-action-confirm'));

      await waitFor(() => expect(webuiLifecycleMocks.execute).toHaveBeenCalledWith(plan));
      expect(await screen.findByTestId('storage-owner-webui_data_volume')).toHaveTextContent('0 B');
      fireEvent.click(await screen.findByTestId('storage-webui-restore'));
      await waitFor(() => expect(webuiLifecycleMocks.restore).toHaveBeenCalledWith(webuiReceipt.receipt_ref));
      expect(screen.getByTestId('storage-owner-webui_data_volume')).toHaveTextContent('24 B');

      webuiLifecycleMocks.execute.mockRejectedValueOnce(
        Object.assign(new Error('EXECUTION_RECOVERY_REQUIRED'), { receiptRef: 'receipt:recovery' })
      );
      webuiLifecycleMocks.restore.mockResolvedValueOnce({
        action_id: 'settings_restore_webui_data_volume_cleanup',
        status: 'completed',
        receipt_ref: 'receipt:recovery',
        restore_receipt_ref: 'restore:recovery',
        restored_bytes: 24,
        readback: { ...webuiReceipt.readback, bytes: 24, reclaimable_bytes: 24, restore_status: 'restored' },
      });
      fireEvent.click(await screen.findByTestId('storage-webui-plan'));
      fireEvent.click(await screen.findByTestId('storage-webui-execute'));
      fireEvent.click(await screen.findByTestId('storage-action-confirm'));
      expect(await screen.findByTestId('settings-storage-exception')).toHaveTextContent('EXECUTION_RECOVERY_REQUIRED');
      fireEvent.click(await screen.findByTestId('storage-webui-restore'));
      await waitFor(() => expect(webuiLifecycleMocks.restore).toHaveBeenCalledWith('receipt:recovery'));
    } finally {
      if (electronApiDescriptor) Object.defineProperty(window, 'electronAPI', electronApiDescriptor);
    }
  });

  it('refreshes both owner inventories independently and keeps local storage available when one owner fails', async () => {
    bridgeMocks.executeAction
      .mockRejectedValueOnce(new Error('package inventory unavailable'))
      .mockResolvedValueOnce({ ok: true, parsed: {} });

    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('storage-refresh'));

    await waitFor(() => expect(bridgeMocks.executeAction).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.executeAction).toHaveBeenNthCalledWith(1, {
      actionId: 'settings_inventory_agent_package_store',
      dryRun: false,
    });
    expect(bridgeMocks.executeAction).toHaveBeenNthCalledWith(2, {
      actionId: 'settings_inventory_webui_data_volume',
      dryRun: false,
    });
    expect(bridgeMocks.refreshInventory).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.loadAppState).toHaveBeenCalledWith('fast', {
      forceFresh: true,
      showRefreshing: false,
    });
    expect(screen.queryByTestId('settings-storage-exception')).not.toBeInTheDocument();
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('10 B');
  });

  it('falls back to the nested Agent projection and omits an unauthorized WebUI action', async () => {
    bridgeMocks.appState = {
      agent_packages: {
        storage_inventory: {
          status: 'available',
          observed_at: '2026-07-18T08:00:00.000Z',
          stale: false,
          bytes: 4096,
          reclaimable_bytes: 1024,
          owner_route: '/unsafe',
          projected_action: { kind: 'navigate', action_id: null },
        },
      },
      settings_control_center: {
        app_settings_read_model: {
          storage_lifecycle: {
            agent_package_store: {
              status: 'available',
              observed_at: '2026-07-18T08:00:00.000Z',
              stale: false,
              bytes: 512,
              reclaimable_bytes: null,
              owner_route: '/settings/agents',
              projected_action: { kind: 'navigate', action_id: null },
            },
            webui_data_volume: {
              status: 'available',
              observed_at: '2026-07-18T08:00:00.000Z',
              stale: false,
              bytes: 1024,
              reclaimable_bytes: 1024,
              owner_route: '/settings/storage#webui-data',
              projected_action: {
                kind: 'host_action_required',
                action_id: 'docker_system_prune',
                execution_owner: 'carrier_host',
              },
            },
          },
        },
      },
    };

    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('storage-owner-agent_package_store')).toHaveTextContent('512 B');
    expect(screen.queryByTestId('storage-owner-webui_data_volume')).not.toBeInTheDocument();
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('10 B');
  });

  it('renders one flat storage category list and keeps technical storage paths in details', async () => {
    render(<StorageSettingsContent />);

    expect(await screen.findByTestId('storage-settings-page')).toBeInTheDocument();
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.getInventory).not.toHaveBeenCalled();
    expect(bridgeMocks.refreshInventory).not.toHaveBeenCalled();

    const categoryList = screen.getByTestId('storage-category-list');
    expect(categoryList).toHaveClass('opl-settings-list');
    expect(categoryList).not.toHaveClass('grid', 'md:grid-cols-2');
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('Total');
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('100 B');
    expect(screen.getByTestId('storage-inventory-freshness')).toHaveTextContent('42 ms');
    expect(screen.queryByTestId('settings-storage-log-directory')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-cleanup-flow')).not.toBeInTheDocument();
    expect(
      categoryList.querySelectorAll('[data-testid^="storage-inventory-"]:not([data-testid*="details"])')
    ).toHaveLength(4);
    expect(screen.getByTestId('storage-inventory-updater_cache')).not.toHaveTextContent('/tmp/updater-cache');
    expect(screen.getByTestId('storage-inventory-updater_cache')).not.toHaveTextContent('Ready to clean');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).not.toHaveTextContent('/tmp/conversations');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).not.toHaveTextContent('Clean after archiving');
    expect(screen.getByTestId('storage-inventory-runtime_substrate')).not.toHaveTextContent('/tmp/runtime');
    expect(screen.getByTestId('storage-inventory-logs')).not.toHaveTextContent('/tmp/logs');
    expect(screen.getByText('Older logs can be removed by retention rules.')).toBeInTheDocument();
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).toHaveTextContent('Create archive');
    expect(screen.getByTestId('storage-inventory-runtime_substrate')).toHaveTextContent('Review runtime cleanup');
    expect(screen.getByTestId('storage-inventory-logs')).toHaveTextContent('Review log cleanup');
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('Review installer cache cleanup');
    const previewCleanup = screen.getByTestId('settings-storage-primary-action');
    expect(previewCleanup.querySelector('svg')).not.toBeNull();
    expect(previewCleanup.querySelector('svg')?.innerHTML).toContain('currentColor');
    for (const id of ['updater_cache', 'user_data_artifacts', 'runtime_substrate', 'logs']) {
      expect(screen.getByTestId(`storage-inventory-${id}`)).toHaveClass('opl-settings-row');
      expect(screen.getByTestId(`storage-inventory-${id}`)).not.toHaveClass('opl-settings-surface--action');
    }
    expect(document.body.textContent).not.toMatch(/silent delete|sqlite:\/\/|DELETE FROM/i);

    fireEvent.click(screen.getByText('Diagnostics'));
    const diagnostics = screen.getByTestId('settings-storage-technical-details');
    expect(diagnostics).toHaveTextContent('/tmp/updater-cache');
    expect(diagnostics).toHaveTextContent('/tmp/conversations');
    expect(diagnostics).toHaveTextContent('/tmp/runtime');
    expect(diagnostics).toHaveTextContent('/tmp/logs');
  });

  it('hides the page cleanup action when only protected conversation data remains', async () => {
    bridgeMocks.getInventorySnapshot.mockResolvedValue(
      snapshotWithInventory({
        ...inventory,
        total_bytes: 20,
        sections: inventory.sections.map((section) =>
          section.id === 'user_data_artifacts' ? section : { ...section, bytes: 0, roots: [] }
        ),
      })
    );

    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('settings-storage-primary-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('storage-refresh')).toBeInTheDocument();
  });

  it('renders inventory refresh as an accessible icon-only action', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toHaveTextContent('');
    expect(refreshButton.querySelector('svg')).not.toBeNull();

    fireEvent.click(refreshButton);
    await waitFor(() => expect(bridgeMocks.refreshInventory).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.getInventory).not.toHaveBeenCalled();
  });

  it('shows a recoverable service state instead of synthetic zero bytes when every readback is missing', async () => {
    bridgeMocks.getInventorySnapshot.mockResolvedValueOnce({
      ...inventorySnapshot,
      inventory: null,
      observed_at: null,
      scan_duration_ms: null,
      stale: true,
    });

    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    expect(await screen.findByTestId('settings-storage-unavailable')).toHaveTextContent(
      'Storage information temporarily unavailable'
    );
    expect(screen.getByTestId('settings-storage-unavailable-reason-service')).toHaveTextContent(
      'Local storage service is not ready.'
    );
    expect(screen.getByTestId('settings-storage-unavailable-retry')).toHaveTextContent('Retry');
    expect(screen.getByTestId('settings-storage-unavailable-recovery')).toHaveTextContent('Open Maintenance');
    expect(screen.queryByTestId('storage-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-category-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-storage-primary-action')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-storage-unavailable-recovery'));
    expect(bridgeMocks.navigate).toHaveBeenCalledWith('/settings/environment');
  });

  it('applies inventory update events without remounting or rescanning from the page', async () => {
    let inventoryListener: ((snapshot: typeof inventorySnapshot) => void) | undefined;
    bridgeMocks.getInventorySnapshot.mockResolvedValueOnce({ ...inventorySnapshot, inventory: null });
    bridgeMocks.inventoryUpdatedOn.mockImplementationOnce((listener) => {
      inventoryListener = listener;
      return () => undefined;
    });

    render(<StorageSettingsContent />);
    expect(await screen.findByTestId('settings-storage-unavailable')).toBeInTheDocument();

    act(() => inventoryListener?.(inventorySnapshot));
    await waitFor(() => expect(screen.getByTestId('storage-overview')).toHaveTextContent('100 B'));
    expect(screen.queryByTestId('settings-storage-unavailable')).not.toBeInTheDocument();
    expect(bridgeMocks.refreshInventory).not.toHaveBeenCalled();
  });

  it('keeps the App log directory read-only under storage diagnostics', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('settings-storage-log-directory')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-storage-log-directory-action')).not.toBeInTheDocument();
    expect(bridgeMocks.systemInfo).not.toHaveBeenCalled();
    expect(bridgeMocks.updateSystemInfo).not.toHaveBeenCalled();
    expect(bridgeMocks.showOpen).not.toHaveBeenCalled();
    expect(bridgeMocks.openFolder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Diagnostics'));
    expect(screen.getByTestId('settings-storage-technical-details')).toHaveTextContent('/tmp/logs');
  });

  it('shows work data safety context as read-only App projection data', async () => {
    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    const lifecycle = screen.getByTestId('storage-research-lifecycle');
    expect(lifecycle).not.toHaveTextContent('Diagnostics');
    expect(lifecycle).not.toHaveTextContent('Work data protection rules');
    expect(lifecycle).not.toHaveTextContent('Open only when troubleshooting cleanup boundaries.');
    expect(lifecycle).not.toHaveTextContent('Lifecycle planes');

    const diagnosticsAction = screen.getByTestId('settings-storage-diagnostics-action');
    expect(diagnosticsAction).toHaveTextContent('Diagnostics');
    expect(diagnosticsAction.querySelector('svg')).not.toBeNull();
    fireEvent.click(diagnosticsAction);

    const diagnostics = screen.getByTestId('settings-storage-technical-details');
    expect(diagnostics).toHaveTextContent('Work data protection rules');
    expect(diagnostics).toHaveTextContent('Open only when troubleshooting cleanup boundaries.');
    expect(diagnostics).toHaveTextContent('Work data stages');
    expect(diagnostics).toHaveTextContent('app_state.storage.research_workspace_lifecycle.planes');
    expect(diagnostics).toHaveTextContent('Large file references');
    expect(diagnostics).toHaveTextContent('clinical data bodies and artifact bodies stay outside the App view');
    expect(diagnostics).toHaveTextContent('Many small files');
    expect(diagnostics).toHaveTextContent('the App does not scan work directories');
    expect(diagnostics).toHaveTextContent('Runtime cache cleanup preview');
    expect(diagnostics).toHaveTextContent('runtime_compact_dry_run_refs');
    expect(diagnostics).toHaveTextContent('Completed project archive');
    expect(diagnostics).toHaveTextContent('completed_project_closeout_refs');
    expect(diagnostics).toHaveTextContent('Generic cleanup blocked');
    expect(diagnostics).toHaveTextContent('Cleanup without owner, preview, or closeout source context is forbidden');
    expect(diagnostics.textContent).not.toMatch(/sqlite:\/\/|DELETE FROM/i);
  });

  it('reveals delete and execute actions only after receipt or dry-run plan exists', async () => {
    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('storage-conversation-delete')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-runtime-execute')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-logs-execute')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storage-updater-execute')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Create archive'));
    await waitFor(() => expect(bridgeMocks.archiveConversations).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-conversation-delete')).toBeEnabled();

    fireEvent.click(screen.getByTestId('settings-storage-primary-action'));
    await waitFor(() => expect(bridgeMocks.planRuntimePrune).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.planLogRotation).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.planUpdaterCacheCleanup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('storage-runtime-execute')).toBeEnabled();
    expect(screen.getByTestId('storage-logs-execute')).toBeEnabled();
    expect(screen.getByTestId('storage-updater-execute')).toBeEnabled();
  });

  it('executes runtime and log cleanup with the dry-run plan object', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('settings-storage-primary-action'));
    await waitFor(() => expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('storage-runtime-execute'));
    expect(bridgeMocks.executeRuntimePrune).not.toHaveBeenCalled();
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent('Confirm Changes');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' }));
    expect(screen.getByTestId('storage-action-confirmation')).toHaveFocus();
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.executeRuntimePrune).toHaveBeenCalledWith({
        plan: runtimePlan,
        planHash: runtimePlan.plan_hash,
      })
    );

    fireEvent.click(screen.getByTestId('storage-logs-execute'));
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent('Confirm Changes');
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.executeLogRotation).toHaveBeenCalledWith({ plan: logsPlan, planHash: logsPlan.plan_hash })
    );
  });

  it('executes updater cache cleanup only after a dry-run plan is confirmed', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Review installer cache cleanup'));
    await waitFor(() => expect(screen.getByTestId('storage-updater-execute')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('storage-updater-execute'));
    expect(bridgeMocks.executeUpdaterCacheCleanup).not.toHaveBeenCalled();
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent('Confirm Changes');
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.executeUpdaterCacheCleanup).toHaveBeenCalledWith({
        plan: updaterPlan,
        planHash: updaterPlan.plan_hash,
      })
    );
  });

  it('requires a conversation archive receipt before deleting conversation artifacts', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('storage-conversation-delete')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Create archive'));
    await waitFor(() => expect(bridgeMocks.archiveConversations).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('opl.storage.latestConversationArchiveReceipt.v1')).toBe(receipt.receipt_path);

    fireEvent.click(screen.getByTestId('storage-conversation-delete'));
    expect(bridgeMocks.deleteConversationArtifacts).not.toHaveBeenCalled();
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent(
      'Local files will be removed while the archive remains available.'
    );
    expect(screen.getByTestId('storage-action-confirmation')).not.toHaveTextContent('receipt://conversation/archive');
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.deleteConversationArtifacts).toHaveBeenCalledWith({
        receiptPath: receipt.receipt_path,
        confirmation: `delete:${receipt.conversation_id}`,
      })
    );
  });

  it('restores the latest valid archive receipt after inventory loads', async () => {
    localStorage.setItem('opl.storage.latestConversationArchiveReceipt.v1', receipt.receipt_path);

    render(<StorageSettingsContent />);

    await waitFor(() =>
      expect(bridgeMocks.restoreConversationProof).toHaveBeenCalledWith({ receiptPath: receipt.receipt_path })
    );
    expect(screen.getByTestId('storage-conversation-delete')).toBeEnabled();
  });

  it('keeps conversation deletion locked when the remembered archive proof is invalid', async () => {
    localStorage.setItem('opl.storage.latestConversationArchiveReceipt.v1', 'receipt://invalid');
    bridgeMocks.restoreConversationProof.mockRejectedValueOnce(new Error('missing proof'));

    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.restoreConversationProof).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('storage-conversation-delete')).not.toBeInTheDocument();
    expect(localStorage.getItem('opl.storage.latestConversationArchiveReceipt.v1')).toBeNull();
  });

  it('keeps archive proof in diagnostics instead of adding another ordinary action', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Create archive'));
    await waitFor(() => expect(screen.getByTestId('storage-conversation-delete')).toBeEnabled());
    expect(screen.queryByTestId('storage-conversation-restore')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Diagnostics'));
    expect(screen.getByTestId('settings-storage-technical-details')).toHaveTextContent(receipt.receipt_path);
    expect(bridgeMocks.restoreConversationProof).not.toHaveBeenCalled();
  });

  it('offers one restore action when an archive is valid and local conversation files are absent', async () => {
    const emptyConversationInventory = {
      ...inventory,
      total_bytes: 80,
      sections: inventory.sections.map((section) =>
        section.id === 'user_data_artifacts' ? { ...section, bytes: 0, roots: [] } : section
      ),
    };
    localStorage.setItem('opl.storage.latestConversationArchiveReceipt.v1', receipt.receipt_path);
    bridgeMocks.getInventorySnapshot.mockResolvedValueOnce(snapshotWithInventory(emptyConversationInventory));
    bridgeMocks.refreshInventory.mockResolvedValueOnce(inventorySnapshot);
    const mutation = deferred<typeof restoreReceipt>();
    bridgeMocks.restoreConversationArchive.mockReturnValueOnce(mutation.promise);

    render(<StorageSettingsContent />);
    const restoreButton = await screen.findByTestId('storage-conversation-restore');
    fireEvent.click(restoreButton);
    fireEvent.click(restoreButton);

    expect(bridgeMocks.restoreConversationArchive).not.toHaveBeenCalled();
    expect(screen.getByTestId('storage-action-confirmation')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('storage-action-confirm'));

    expect(bridgeMocks.restoreConversationArchive).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.restoreConversationArchive).toHaveBeenCalledWith({ receiptPath: receipt.receipt_path });
    mutation.resolve(restoreReceipt);
    await waitFor(() => expect(bridgeMocks.refreshInventory).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('storage-conversation-restore')).not.toBeInTheDocument();
  });

  it('shows a restore collision error and keeps the archive available for retry', async () => {
    const emptyConversationInventory = {
      ...inventory,
      total_bytes: 80,
      sections: inventory.sections.map((section) =>
        section.id === 'user_data_artifacts' ? { ...section, bytes: 0, roots: [] } : section
      ),
    };
    localStorage.setItem('opl.storage.latestConversationArchiveReceipt.v1', receipt.receipt_path);
    bridgeMocks.getInventorySnapshot.mockResolvedValue(snapshotWithInventory(emptyConversationInventory));
    bridgeMocks.restoreConversationArchive.mockRejectedValueOnce(
      new Error('Restore stopped because the target already exists. Existing files were not changed.')
    );

    render(<StorageSettingsContent />);
    fireEvent.click(await screen.findByTestId('storage-conversation-restore'));
    fireEvent.click(screen.getByTestId('storage-action-confirm'));

    expect(await screen.findByTestId('settings-storage-exception')).toHaveTextContent('target already exists');
    expect(screen.getByTestId('storage-conversation-restore')).toBeEnabled();
  });

  it('keeps every storage action single-flight through mutation and inventory refresh', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventorySnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('settings-storage-primary-action'));
    await waitFor(() => expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled());

    const mutation = deferred<typeof receipt>();
    const inventoryRefresh = deferred<typeof inventorySnapshot>();
    bridgeMocks.executeRuntimePrune.mockReturnValueOnce(mutation.promise);
    bridgeMocks.refreshInventory.mockReturnValueOnce(inventoryRefresh.promise);

    fireEvent.click(screen.getByTestId('storage-runtime-execute'));
    const confirm = screen.getByTestId('storage-action-confirm');
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(bridgeMocks.executeRuntimePrune).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('storage-logs-execute')).toBeDisabled();
    expect(screen.getByTestId('storage-refresh')).toBeDisabled();

    mutation.resolve(receipt);
    await waitFor(() => expect(bridgeMocks.refreshInventory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('settings-storage-primary-action')).toBeDisabled();
    fireEvent.click(screen.getByTestId('storage-logs-execute'));
    fireEvent.click(screen.getByTestId('storage-refresh'));
    expect(bridgeMocks.planLogRotation).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.refreshInventory).toHaveBeenCalledTimes(1);

    inventoryRefresh.resolve(inventorySnapshot);
    await waitFor(() => expect(screen.getByTestId('settings-storage-primary-action')).not.toBeDisabled());
    expect(bridgeMocks.executeRuntimePrune).toHaveBeenCalledTimes(1);
  });
});

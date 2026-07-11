import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StorageSettingsContent } from '@/renderer/pages/settings/StorageSettings';

const bridgeMocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  archiveConversations: vi.fn(),
  restoreConversationProof: vi.fn(),
  deleteConversationArtifacts: vi.fn(),
  planRuntimePrune: vi.fn(),
  executeRuntimePrune: vi.fn(),
  planLogRotation: vi.fn(),
  executeLogRotation: vi.fn(),
  planUpdaterCacheCleanup: vi.fn(),
  executeUpdaterCacheCleanup: vi.fn(),
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
      archiveConversations: { invoke: bridgeMocks.archiveConversations },
      restoreConversationProof: { invoke: bridgeMocks.restoreConversationProof },
      deleteConversationArtifacts: { invoke: bridgeMocks.deleteConversationArtifacts },
      planRuntimePrune: { invoke: bridgeMocks.planRuntimePrune },
      executeRuntimePrune: { invoke: bridgeMocks.executeRuntimePrune },
      planLogRotation: { invoke: bridgeMocks.planLogRotation },
      executeLogRotation: { invoke: bridgeMocks.executeLogRotation },
      planUpdaterCacheCleanup: { invoke: bridgeMocks.planUpdaterCacheCleanup },
      executeUpdaterCacheCleanup: { invoke: bridgeMocks.executeUpdaterCacheCleanup },
    },
  },
}));

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
    'settings.storagePage.inventory.silentDeleteAllowed': 'Ready to clean',
    'settings.storagePage.inventory.silentDeleteBlocked': 'Preparation required',
    'settings.storagePage.inventory.cleanupModes.safeWithoutExtraProof': 'Ready to clean',
    'settings.storagePage.inventory.cleanupModes.needsArchiveProof': 'Archive first',
    'settings.storagePage.inventory.cleanupModes.needsPreview': 'Review first',
    'settings.storagePage.inventory.cleanupModes.needsReview': 'Check required',
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
    'settings.updateConfirm': 'Confirm Changes',
    'common.cancel': 'Cancel',
  };
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
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });
    bridgeMocks.getInventory.mockResolvedValue(inventory);
    bridgeMocks.archiveConversations.mockResolvedValue(receipt);
    bridgeMocks.restoreConversationProof.mockResolvedValue(receipt);
    bridgeMocks.deleteConversationArtifacts.mockResolvedValue(receipt);
    bridgeMocks.planRuntimePrune.mockResolvedValue(runtimePlan);
    bridgeMocks.executeRuntimePrune.mockResolvedValue(receipt);
    bridgeMocks.planLogRotation.mockResolvedValue(logsPlan);
    bridgeMocks.executeLogRotation.mockResolvedValue(receipt);
    bridgeMocks.planUpdaterCacheCleanup.mockResolvedValue(updaterPlan);
    bridgeMocks.executeUpdaterCacheCleanup.mockResolvedValue(receipt);
  });

  it('renders bounded storage category cards and keeps technical storage paths in details', async () => {
    render(<StorageSettingsContent />);

    expect(await screen.findByTestId('storage-settings-page')).toBeInTheDocument();
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    const categoryList = screen.getByTestId('storage-category-list');
    expect(categoryList).toHaveClass('md:grid-cols-2');
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('Total');
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('100 B');
    expect(screen.queryByTestId('storage-cleanup-flow')).not.toBeInTheDocument();
    expect(
      categoryList.querySelectorAll('[data-testid^="storage-inventory-"]:not([data-testid*="details"])')
    ).toHaveLength(4);
    expect(screen.getByTestId('storage-inventory-updater_cache')).not.toHaveTextContent('/tmp/updater-cache');
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('Ready to clean');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).not.toHaveTextContent('/tmp/conversations');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).toHaveTextContent('Archive first');
    expect(screen.getByTestId('storage-inventory-runtime_substrate')).not.toHaveTextContent('/tmp/runtime');
    expect(screen.getByTestId('storage-inventory-logs')).not.toHaveTextContent('/tmp/logs');
    expect(screen.getByText('Older logs can be removed by retention rules.')).toBeInTheDocument();
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).toHaveTextContent('Create archive');
    expect(screen.getByTestId('storage-inventory-runtime_substrate')).toHaveTextContent('Review runtime cleanup');
    expect(screen.getByTestId('storage-inventory-logs')).toHaveTextContent('Review log cleanup');
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('Review installer cache cleanup');
    expect(document.body.textContent).not.toMatch(/silent delete|sqlite:\/\/|DELETE FROM/i);

    fireEvent.click(screen.getByText('Diagnostics'));
    const diagnostics = screen.getByTestId('settings-storage-technical-details');
    expect(diagnostics).toHaveTextContent('/tmp/updater-cache');
    expect(diagnostics).toHaveTextContent('/tmp/conversations');
    expect(diagnostics).toHaveTextContent('/tmp/runtime');
    expect(diagnostics).toHaveTextContent('/tmp/logs');
  });

  it('hides the page cleanup action when only protected conversation data remains', async () => {
    bridgeMocks.getInventory.mockResolvedValue({
      ...inventory,
      total_bytes: 20,
      sections: inventory.sections.map((section) =>
        section.id === 'user_data_artifacts' ? section : { ...section, bytes: 0, roots: [] }
      ),
    });

    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    expect(screen.queryByTestId('settings-storage-primary-action')).not.toBeInTheDocument();
    expect(screen.getByTestId('storage-refresh')).toBeInTheDocument();
  });

  it('shows work data safety context as read-only App projection data', async () => {
    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    const lifecycle = screen.getByTestId('storage-research-lifecycle');
    expect(lifecycle).toHaveTextContent('Diagnostics');
    expect(lifecycle).not.toHaveTextContent('Work data protection rules');
    expect(lifecycle).not.toHaveTextContent('Open only when troubleshooting cleanup boundaries.');
    expect(lifecycle).not.toHaveTextContent('Lifecycle planes');

    fireEvent.click(screen.getByText('Diagnostics'));

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

  it('keeps delete and execute buttons disabled until receipt or dry-run plan exists', async () => {
    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('storage-conversation-delete')).toBeDisabled();
    expect(screen.getByTestId('storage-runtime-execute')).toBeDisabled();
    expect(screen.getByTestId('storage-logs-execute')).toBeDisabled();
    expect(screen.getByTestId('storage-updater-execute')).toBeDisabled();

    fireEvent.click(screen.getByText('Create archive'));
    await waitFor(() => expect(bridgeMocks.archiveConversations).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-conversation-delete')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('settings-storage-primary-action'));
    await waitFor(() => expect(bridgeMocks.planRuntimePrune).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.planLogRotation).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.planUpdaterCacheCleanup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled();
    expect(screen.getByTestId('storage-logs-execute')).not.toBeDisabled();
    expect(screen.getByTestId('storage-updater-execute')).not.toBeDisabled();
  });

  it('executes runtime and log cleanup with the dry-run plan object', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

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

    fireEvent.click(screen.getByText('Review log cleanup'));
    await waitFor(() => expect(screen.getByTestId('storage-logs-execute')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('storage-logs-execute'));
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent('Confirm Changes');
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.executeLogRotation).toHaveBeenCalledWith({ plan: logsPlan, planHash: logsPlan.plan_hash })
    );
  });

  it('executes updater cache cleanup only after a dry-run plan is confirmed', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

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
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('storage-conversation-delete')).toBeDisabled();
    fireEvent.click(screen.getByText('Create archive'));
    await waitFor(() => expect(bridgeMocks.archiveConversations).toHaveBeenCalledTimes(1));

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

  it('keeps the restore action bound to the recoverable backup record', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Create archive'));
    await waitFor(() => expect(screen.getByTestId('storage-conversation-restore')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('storage-conversation-restore'));

    await waitFor(() =>
      expect(bridgeMocks.restoreConversationProof).toHaveBeenCalledWith({ receiptPath: receipt.receipt_path })
    );
  });

  it('keeps every storage action single-flight through mutation and inventory refresh', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('settings-storage-primary-action'));
    await waitFor(() => expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled());

    const mutation = deferred<typeof receipt>();
    const inventoryRefresh = deferred<typeof inventory>();
    bridgeMocks.executeRuntimePrune.mockReturnValueOnce(mutation.promise);
    bridgeMocks.getInventory.mockReturnValueOnce(inventoryRefresh.promise);

    fireEvent.click(screen.getByTestId('storage-runtime-execute'));
    const confirm = screen.getByTestId('storage-action-confirm');
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(bridgeMocks.executeRuntimePrune).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Review log cleanup' })).toBeDisabled();
    expect(screen.getByTestId('storage-refresh')).toBeDisabled();

    mutation.resolve(receipt);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('settings-storage-primary-action')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review log cleanup' }));
    fireEvent.click(screen.getByTestId('storage-refresh'));
    expect(bridgeMocks.planLogRotation).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(2);

    inventoryRefresh.resolve(inventory);
    await waitFor(() => expect(screen.getByTestId('settings-storage-primary-action')).not.toBeDisabled());
    expect(bridgeMocks.executeRuntimePrune).toHaveBeenCalledTimes(1);
  });
});

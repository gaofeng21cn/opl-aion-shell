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

const openDetails = (details: HTMLDetailsElement | null) => {
  expect(details).toBeTruthy();
  if (!details) return;
  details.open = true;
  fireEvent(details, new Event('toggle'));
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
    'settings.storagePage.title': 'Storage',
    'settings.storagePage.description': 'Review local data.',
    'settings.storagePage.actions.archive': 'Archive conversations',
    'settings.storagePage.actions.dryRunRuntime': 'Preview runtime cleanup',
    'settings.storagePage.actions.dryRunLogs': 'Preview log cleanup',
    'settings.storagePage.actions.dryRunUpdater': 'Preview installer cache cleanup',
    'settings.storagePage.actions.executeRuntime': 'Clean using preview',
    'settings.storagePage.actions.executeLogs': 'Clean logs using preview',
    'settings.storagePage.actions.executeUpdater': 'Clean installer cache',
    'settings.storagePage.actions.deleteWithReceipt': 'Delete with receipt',
    'settings.storagePage.sections.updater.title': 'Updater cache',
    'settings.storagePage.sections.updater.description': 'Installer package cache only.',
    'settings.storagePage.sections.conversations.title': 'Conversation artifacts',
    'settings.storagePage.sections.conversations.description': 'Conversation files require proof before cleanup.',
    'settings.storagePage.sections.runtime.title': 'Runtime cache',
    'settings.storagePage.sections.runtime.description':
      'Local runtime cache cleanup must be previewed before it can run.',
    'settings.storagePage.sections.logs.title': 'Logs',
    'settings.storagePage.sections.logs.description': 'Log cleanup is separate from conversation artifacts.',
    'settings.storagePage.inventory.bytes': `Bytes: ${values?.bytes ?? ''}`,
    'settings.storagePage.inventory.cleanupMode': `Cleanup proof: ${values?.mode ?? ''}`,
    'settings.storagePage.inventory.rootCount': `Roots: ${values?.count ?? ''}`,
    'settings.storagePage.inventory.details': 'Storage details',
    'settings.storagePage.inventory.rootDetail': `${values?.exists ?? ''} ${values?.bytes ?? ''}`,
    'settings.storagePage.inventory.exists': 'exists',
    'settings.storagePage.inventory.missing': 'missing',
    'settings.storagePage.inventory.noRoots': 'No roots reported.',
    'settings.storagePage.inventory.notLoaded': 'Storage details are not loaded yet.',
    'settings.storagePage.inventory.silentDeleteAllowed': 'Safe without extra proof',
    'settings.storagePage.inventory.silentDeleteBlocked': 'Needs proof first',
    'settings.storagePage.inventory.cleanupModes.safeWithoutExtraProof': 'Safe without extra proof',
    'settings.storagePage.inventory.cleanupModes.needsArchiveProof': 'Needs archive proof',
    'settings.storagePage.inventory.cleanupModes.needsPreview': 'Needs preview first',
    'settings.storagePage.inventory.cleanupModes.needsReview': 'Needs review',
    'settings.storagePage.overview.total': 'Total stored data',
    'settings.storagePage.overview.categories': 'Data categories',
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
    'settings.storagePage.researchLifecycle.title': 'Work data safety',
    'settings.storagePage.researchLifecycle.detail':
      'Read-only cleanup boundaries and source references for workspace data.',
    'settings.storagePage.researchLifecycle.technicalDetails': 'Advanced storage references',
    'settings.storagePage.researchLifecycle.boundary':
      'Source references only. No SQLite sidecars, workspace tree scans, clinical data body deletes, or generic cleanup authorization.',
    'settings.storagePage.researchLifecycle.states.available': 'Source available',
    'settings.storagePage.researchLifecycle.states.attention': 'Needs review',
    'settings.storagePage.researchLifecycle.states.blocked': 'Forbidden',
    'settings.storagePage.conversations.title': 'Conversation archive and restore proof',
    'settings.storagePage.conversations.detail': 'Delete is disabled until proof is available.',
    'settings.storagePage.conversations.receiptRequired': 'Archive conversations first.',
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
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('loads inventory and keeps technical storage paths in details', async () => {
    render(<StorageSettingsContent />);

    expect(await screen.findByTestId('storage-settings-page')).toBeInTheDocument();
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('storage-overview')).toHaveTextContent('Total stored data');
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('100 B');
    expect(screen.getByTestId('storage-overview')).toHaveTextContent('Data categories');
    expect(screen.getByTestId('storage-cleanup-flow')).toHaveTextContent('1. Preview');
    expect(screen.getByTestId('storage-cleanup-flow')).toHaveTextContent('2. Confirm');
    expect(screen.getByTestId('storage-cleanup-flow')).toHaveTextContent('3. Execute');
    expect(screen.getByTestId('storage-inventory-updater_cache')).not.toHaveTextContent('/tmp/updater-cache');
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('Safe without extra proof');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).not.toHaveTextContent('/tmp/conversations');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).toHaveTextContent('Needs proof first');
    expect(screen.getByTestId('storage-inventory-runtime_substrate')).not.toHaveTextContent('/tmp/runtime');
    expect(screen.getByTestId('storage-inventory-logs')).not.toHaveTextContent('/tmp/logs');
    expect(screen.getByText('Logs are not conversation artifacts.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/silent delete|sqlite:\/\/|DELETE FROM/i);

    for (const id of ['updater_cache', 'user_data_artifacts', 'runtime_substrate', 'logs']) {
      openDetails(screen.getByTestId(`storage-inventory-details-${id}`) as HTMLDetailsElement);
    }

    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('/tmp/updater-cache');
    expect(screen.getByTestId('storage-inventory-user_data_artifacts')).toHaveTextContent('/tmp/conversations');
    expect(screen.getByTestId('storage-inventory-runtime_substrate')).toHaveTextContent('/tmp/runtime');
    expect(screen.getByTestId('storage-inventory-logs')).toHaveTextContent('/tmp/logs');
  });

  it('shows work data safety context as read-only App projection data', async () => {
    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    const lifecycle = screen.getByTestId('storage-research-lifecycle');
    expect(lifecycle).toHaveTextContent('Work data safety');
    expect(lifecycle).toHaveTextContent('Read-only cleanup boundaries and source references for workspace data.');
    expect(lifecycle).not.toHaveTextContent('Lifecycle planes');

    openDetails(screen.getByTestId('storage-research-lifecycle-details') as HTMLDetailsElement);

    expect(lifecycle).toHaveTextContent('Work data stages');
    expect(lifecycle).toHaveTextContent('app_state.storage.research_workspace_lifecycle.planes');
    expect(lifecycle).toHaveTextContent('Large file references');
    expect(lifecycle).toHaveTextContent('clinical data bodies and artifact bodies stay outside the App view');
    expect(lifecycle).toHaveTextContent('Many small files');
    expect(lifecycle).toHaveTextContent('the App does not scan work directories');
    expect(lifecycle).toHaveTextContent('Runtime cache cleanup preview');
    expect(lifecycle).toHaveTextContent('runtime_compact_dry_run_refs');
    expect(lifecycle).toHaveTextContent('Completed project archive');
    expect(lifecycle).toHaveTextContent('completed_project_closeout_refs');
    expect(lifecycle).toHaveTextContent('Generic cleanup blocked');
    expect(lifecycle).toHaveTextContent('Cleanup without owner, preview, or closeout source context is forbidden');
    expect(lifecycle.querySelectorAll('button')).toHaveLength(0);
    expect(lifecycle.textContent).not.toMatch(/sqlite:\/\/|DELETE FROM/i);
  });

  it('keeps delete and execute buttons disabled until receipt or dry-run plan exists', async () => {
    render(<StorageSettingsContent />);

    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('storage-conversation-delete')).toBeDisabled();
    expect(screen.getByTestId('storage-runtime-execute')).toBeDisabled();
    expect(screen.getByTestId('storage-logs-execute')).toBeDisabled();
    expect(screen.getByTestId('storage-updater-execute')).toBeDisabled();

    fireEvent.click(screen.getByText('Archive conversations'));
    await waitFor(() => expect(bridgeMocks.archiveConversations).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-conversation-delete')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Preview runtime cleanup'));
    await waitFor(() => expect(bridgeMocks.planRuntimePrune).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Preview log cleanup'));
    await waitFor(() => expect(bridgeMocks.planLogRotation).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-logs-execute')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Preview installer cache cleanup'));
    await waitFor(() => expect(bridgeMocks.planUpdaterCacheCleanup).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-updater-execute')).not.toBeDisabled();
  });

  it('executes runtime and log cleanup with the dry-run plan object', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Preview runtime cleanup'));
    await waitFor(() => expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('storage-runtime-execute'));
    expect(bridgeMocks.executeRuntimePrune).not.toHaveBeenCalled();
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent('Confirm Changes');
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.executeRuntimePrune).toHaveBeenCalledWith({
        plan: runtimePlan,
        planHash: runtimePlan.plan_hash,
      })
    );

    fireEvent.click(screen.getByText('Preview log cleanup'));
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

    fireEvent.click(screen.getByText('Preview installer cache cleanup'));
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
    fireEvent.click(screen.getByText('Archive conversations'));
    await waitFor(() => expect(bridgeMocks.archiveConversations).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('storage-conversation-delete'));
    expect(bridgeMocks.deleteConversationArtifacts).not.toHaveBeenCalled();
    expect(screen.getByTestId('storage-action-confirmation')).toHaveTextContent('receipt://conversation/archive');
    fireEvent.click(screen.getByTestId('storage-action-confirm'));
    await waitFor(() =>
      expect(bridgeMocks.deleteConversationArtifacts).toHaveBeenCalledWith({
        receiptPath: receipt.receipt_path,
        confirmation: `delete:${receipt.conversation_id}`,
      })
    );
  });
});

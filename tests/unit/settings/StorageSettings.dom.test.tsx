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
    'settings.storagePage.description': 'Manage local data.',
    'settings.storagePage.actions.archive': 'Archive conversations',
    'settings.storagePage.actions.dryRunRuntime': 'Dry-run runtime prune',
    'settings.storagePage.actions.dryRunLogs': 'Dry-run log rotation',
    'settings.storagePage.actions.dryRunUpdater': 'Dry-run updater cache cleanup',
    'settings.storagePage.actions.executeRuntime': 'Execute runtime prune',
    'settings.storagePage.actions.executeLogs': 'Execute log rotation',
    'settings.storagePage.actions.executeUpdater': 'Clean updater cache',
    'settings.storagePage.actions.deleteWithReceipt': 'Delete with receipt',
    'settings.storagePage.inventory.silentDeleteAllowed': 'silent delete allowed',
    'settings.storagePage.inventory.silentDeleteBlocked': 'silent delete blocked',
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
      id: 'conversation_artifacts',
      cleanup_mode: 'archive_required_before_cleanup',
      silent_delete_allowed: false,
      bytes: 20,
      roots: [{ path: '/tmp/conversations', exists: true, bytes: 20 }],
    },
    {
      id: 'runtime_toolchain',
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

  it('loads inventory and separates updater cache, conversation artifacts, runtime/toolchain, and logs', async () => {
    render(<StorageSettingsContent />);

    expect(await screen.findByTestId('storage-settings-page')).toBeInTheDocument();
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('/tmp/updater-cache');
    expect(screen.getByTestId('storage-inventory-updater_cache')).toHaveTextContent('silent delete allowed');
    expect(screen.getByTestId('storage-inventory-conversation_artifacts')).toHaveTextContent('/tmp/conversations');
    expect(screen.getByTestId('storage-inventory-conversation_artifacts')).toHaveTextContent('silent delete blocked');
    expect(screen.getByTestId('storage-inventory-runtime_toolchain')).toHaveTextContent('/tmp/runtime');
    expect(screen.getByTestId('storage-inventory-logs')).toHaveTextContent('/tmp/logs');
    expect(screen.getByText('Logs are not conversation artifacts.')).toBeInTheDocument();
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

    fireEvent.click(screen.getByText('Dry-run runtime prune'));
    await waitFor(() => expect(bridgeMocks.planRuntimePrune).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-runtime-execute')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Dry-run log rotation'));
    await waitFor(() => expect(bridgeMocks.planLogRotation).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-logs-execute')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Dry-run updater cache cleanup'));
    await waitFor(() => expect(bridgeMocks.planUpdaterCacheCleanup).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('storage-updater-execute')).not.toBeDisabled();
  });

  it('executes runtime and log cleanup with the dry-run plan object', async () => {
    render(<StorageSettingsContent />);
    await waitFor(() => expect(bridgeMocks.getInventory).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Dry-run runtime prune'));
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

    fireEvent.click(screen.getByText('Dry-run log rotation'));
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

    fireEvent.click(screen.getByText('Dry-run updater cache cleanup'));
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

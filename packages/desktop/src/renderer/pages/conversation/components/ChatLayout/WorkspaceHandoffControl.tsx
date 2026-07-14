import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { GitWorkspaceHandoffMetadata, GitWorktreeSnapshotReceipt } from '@/common/types/platform/gitWorkspace';
import { canonicalCodexThreadId } from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Message, Modal, Radio } from '@arco-design/web-react';
import { Computer, Fork, History, Undo } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const commit = (value: unknown): string | undefined => {
  const candidate = text(value);
  return candidate && /^[0-9a-f]{40,64}$/i.test(candidate) ? candidate : undefined;
};

export const readWorktreeSnapshotReceipt = (value: unknown): GitWorktreeSnapshotReceipt | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GitWorktreeSnapshotReceipt>;
  const branch = candidate.branch === null ? null : text(candidate.branch);
  if (
    candidate.schema !== 'opl_worktree_snapshot_receipt.v1' ||
    !text(candidate.snapshotId) ||
    !text(candidate.createdAt) ||
    !text(candidate.repositoryRoot) ||
    !text(candidate.taskId) ||
    !text(candidate.worktreePath) ||
    !commit(candidate.head) ||
    (candidate.branch !== null && !branch) ||
    (candidate.branchRef !== null && !text(candidate.branchRef)) ||
    typeof candidate.detached !== 'boolean' ||
    typeof candidate.staged !== 'boolean' ||
    typeof candidate.trackedUnstaged !== 'boolean' ||
    !Number.isInteger(candidate.untrackedCount) ||
    (candidate.untrackedCount ?? -1) < 0 ||
    (candidate.snapshotKind !== 'head' && candidate.snapshotKind !== 'stash') ||
    !text(candidate.snapshotRef) ||
    !commit(candidate.snapshotObject) ||
    (branch === null ? !candidate.detached || candidate.branchRef !== null : candidate.detached)
  ) {
    return null;
  }
  return candidate as GitWorktreeSnapshotReceipt;
};

export const readWorkspaceHandoffMetadata = (value: unknown): GitWorkspaceHandoffMetadata | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<GitWorkspaceHandoffMetadata>;
  if (
    candidate.schema !== 'opl_workspace_handoff.v1' ||
    (candidate.locality !== 'local' && candidate.locality !== 'worktree') ||
    !text(candidate.localWorkspace) ||
    !text(candidate.worktreePath) ||
    !text(candidate.taskId) ||
    !text(candidate.startRef) ||
    !text(candidate.startCommit) ||
    candidate.worktreeRetention !== 'preserve_for_reuse_until_snapshotted_cleanup'
  ) {
    return null;
  }
  const snapshot = candidate.snapshot === undefined ? undefined : readWorktreeSnapshotReceipt(candidate.snapshot);
  if (candidate.snapshot !== undefined && !snapshot) return null;
  return { ...(candidate as GitWorkspaceHandoffMetadata), snapshot: snapshot ?? undefined };
};

type WorkspaceHandoffAvailability = { status: 'loading' | 'available' } | { status: 'unavailable'; reasonKey: string };
type WorkspaceHandoffOperationStatus = { translationKey: string; role: 'status' | 'alert' };

class WorkspaceHandoffError extends Error {
  readonly translationKey: string;
  readonly requiresResync: boolean;

  constructor(translationKey: string, requiresResync = false) {
    super(translationKey);
    this.translationKey = translationKey;
    this.requiresResync = requiresResync;
  }
}

type Props = {
  conversation: TChatConversation;
  workspace: string;
  locality: 'local' | 'worktree';
  handoff: GitWorkspaceHandoffMetadata | null;
  onChanged: (workspace: string, handoff: GitWorkspaceHandoffMetadata) => void;
};

const WorkspaceHandoffControl: React.FC<Props> = ({ conversation, workspace, locality, handoff, onChanged }) => {
  const { t } = useTranslation();
  const [availability, setAvailability] = useState<WorkspaceHandoffAvailability>({ status: 'loading' });
  const [loading, setLoading] = useState(false);
  const [operationStatus, setOperationStatus] = useState<WorkspaceHandoffOperationStatus>();
  const threadId = canonicalCodexThreadId(conversation);

  useEffect(() => {
    let cancelled = false;
    setOperationStatus(undefined);
    if (!threadId) return undefined;

    setAvailability({ status: 'loading' });
    void ipcBridge.threadCoordination.getOverview
      .invoke({ includeArchived: true, sourceThreadIdHint: threadId })
      .then((overview) => {
        if (cancelled) return;
        const target = overview.threads.find((candidate) => candidate.id === threadId);
        if (
          overview.availability.status !== 'available' ||
          !overview.availability.methods.includes('thread/settings/update') ||
          !target ||
          target.status === 'archived' ||
          target.status === 'system_error'
        ) {
          setAvailability({ status: 'unavailable', reasonKey: 'conversation.environment.handoffUnavailable' });
          return;
        }
        if (target.status === 'running') {
          setAvailability({ status: 'unavailable', reasonKey: 'conversation.environment.handoffRunning' });
          return;
        }
        setAvailability({ status: 'available' });
      })
      .catch(() => {
        if (!cancelled) {
          setAvailability({ status: 'unavailable', reasonKey: 'conversation.environment.handoffUnavailable' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (!threadId || conversation.type === 'remote') return null;

  const persistWorkspaceProjection = async (
    nextWorkspace: string,
    nextHandoff: GitWorkspaceHandoffMetadata
  ): Promise<boolean> => {
    try {
      return await ipcBridge.conversation.update.invoke({
        id: conversation.id,
        updates: {
          extra: {
            workspace: nextWorkspace,
            workspace_handoff: nextHandoff,
          } as Partial<TChatConversation['extra']>,
        } as Partial<TChatConversation>,
        merge_extra: true,
      });
    } catch {
      return false;
    }
  };

  const rollbackThreadWorkspace = async (targetWorkspace = workspace): Promise<boolean> => {
    try {
      const result = await ipcBridge.threadCoordination.execute.invoke({
        request: {
          action: 'handoff',
          targetThreadId: threadId,
          actor: { kind: 'user', id: 'opl-app-user', threadId },
          reason: 'Roll back task working directory after shell projection update failed',
          workspace: targetWorkspace,
        },
      });
      if (!result.ok) {
        console.warn('[ConversationEnvironment] Canonical task workspace rollback was rejected:', result);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('[ConversationEnvironment] Could not roll back canonical task workspace:', error);
      return false;
    }
  };

  const switchTaskLocality = async (nextLocality: 'local' | 'worktree') => {
    if (
      locality === nextLocality ||
      availability.status !== 'available' ||
      loading ||
      (nextLocality === 'worktree' && handoff?.snapshot)
    ) {
      return;
    }

    setLoading(true);
    try {
      let nextWorkspace: string;
      let nextHandoff: GitWorkspaceHandoffMetadata;

      if (nextLocality === 'worktree') {
        const localWorkspace = handoff?.localWorkspace ?? workspace;
        const inspection = await ipcBridge.gitWorkspace.inspect.invoke({ cwd: localWorkspace });
        const taskId = handoff?.taskId ?? threadId;
        const startRef = handoff?.startCommit ?? inspection.currentBranch ?? inspection.head;
        const result = await ipcBridge.gitWorkspace.ensureManagedWorktree.invoke({
          repositoryPath: localWorkspace,
          taskId,
          startRef,
        });
        if (result.status === 'unsupported') {
          throw new WorkspaceHandoffError('conversation.environment.worktreeUnavailable');
        }
        nextWorkspace = result.targetPath;
        nextHandoff = {
          schema: 'opl_workspace_handoff.v1',
          locality: 'worktree',
          localWorkspace: result.repositoryRoot,
          worktreePath: result.targetPath,
          taskId,
          startRef: handoff?.startRef ?? result.startRef,
          startCommit: handoff?.startCommit ?? result.startCommit,
          worktreeRetention: 'preserve_for_reuse_until_snapshotted_cleanup',
        };
      } else {
        if (!handoff?.localWorkspace) {
          throw new WorkspaceHandoffError('conversation.environment.localWorkspaceUnavailable');
        }
        nextWorkspace = handoff.localWorkspace;
        nextHandoff = { ...handoff, locality: 'local' };
      }

      const result = await ipcBridge.threadCoordination.execute.invoke({
        request: {
          action: 'handoff',
          targetThreadId: threadId,
          actor: { kind: 'user', id: 'opl-app-user', threadId },
          reason: 'Switch task working directory from Environment',
          workspace: nextWorkspace,
        },
      });
      if (!result.ok) {
        throw new WorkspaceHandoffError(
          result.errorCode === 'thread_not_writable'
            ? 'conversation.environment.handoffRunning'
            : 'conversation.environment.handoffFailed'
        );
      }

      const projectionUpdated = await persistWorkspaceProjection(nextWorkspace, nextHandoff);
      if (!projectionUpdated) {
        const rollbackSucceeded = await rollbackThreadWorkspace();
        if (!rollbackSucceeded) {
          throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
        }
        setOperationStatus({ translationKey: 'conversation.environment.projectionUpdateFailed', role: 'status' });
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }

      setOperationStatus(undefined);
      onChanged(nextWorkspace, nextHandoff);
      emitter.emit('chat.history.refresh');
      Message.success(t('conversation.environment.handoffSuccess'));
    } catch (error) {
      console.error('[ConversationEnvironment] Failed to switch task workspace:', error);
      if (error instanceof WorkspaceHandoffError && error.requiresResync) {
        setOperationStatus({ translationKey: error.translationKey, role: 'alert' });
      }
      Message.error(
        t(
          error instanceof WorkspaceHandoffError
            ? error.translationKey
            : nextLocality === 'worktree'
              ? 'conversation.environment.worktreeCreateFailed'
              : 'conversation.environment.handoffFailed'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const rollbackTaskLocation = async (
    targetWorkspace: string,
    targetHandoff: GitWorkspaceHandoffMetadata
  ): Promise<boolean> => {
    if (!(await rollbackThreadWorkspace(targetWorkspace))) return false;
    return persistWorkspaceProjection(targetWorkspace, targetHandoff);
  };

  const cleanupManagedWorktree = async (): Promise<void> => {
    if (!handoff || locality !== 'worktree' || availability.status !== 'available' || loading) return;

    setLoading(true);
    const { snapshot: _previousSnapshot, ...handoffWithoutSnapshot } = handoff;
    const localHandoff: GitWorkspaceHandoffMetadata = { ...handoffWithoutSnapshot, locality: 'local' };
    try {
      const canonicalMove = await ipcBridge.threadCoordination.execute.invoke({
        request: {
          action: 'handoff',
          targetThreadId: threadId,
          actor: { kind: 'user', id: 'opl-app-user', threadId },
          reason: 'Move task to Local before managed Worktree cleanup',
          workspace: handoff.localWorkspace,
        },
      });
      if (!canonicalMove.ok) {
        throw new WorkspaceHandoffError(
          canonicalMove.errorCode === 'thread_not_writable'
            ? 'conversation.environment.handoffRunning'
            : 'conversation.environment.handoffFailed'
        );
      }

      if (!(await persistWorkspaceProjection(handoff.localWorkspace, localHandoff))) {
        const rollbackSucceeded = await rollbackThreadWorkspace(handoff.worktreePath);
        if (!rollbackSucceeded) {
          throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
        }
        setOperationStatus({ translationKey: 'conversation.environment.projectionUpdateFailed', role: 'status' });
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }

      const cleanup = await ipcBridge.gitWorkspace.cleanupManagedWorktree
        .invoke({
          repositoryPath: handoff.localWorkspace,
          taskId: handoff.taskId,
          worktreePath: handoff.worktreePath,
        })
        .catch(async () => {
          const rollbackSucceeded = await rollbackTaskLocation(handoff.worktreePath, handoff);
          if (!rollbackSucceeded) {
            throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
          }
          throw new WorkspaceHandoffError('conversation.environment.worktreeCleanupFailed');
        });

      const nextHandoff: GitWorkspaceHandoffMetadata = {
        ...localHandoff,
        startRef: cleanup.snapshot.head,
        startCommit: cleanup.snapshot.head,
        snapshot: cleanup.snapshot,
      };
      if (!(await persistWorkspaceProjection(handoff.localWorkspace, nextHandoff))) {
        try {
          await ipcBridge.gitWorkspace.restoreManagedWorktree.invoke({
            repositoryPath: handoff.localWorkspace,
            snapshot: cleanup.snapshot,
          });
        } catch {
          const receiptSaved = await persistWorkspaceProjection(handoff.localWorkspace, nextHandoff);
          if (receiptSaved) onChanged(handoff.localWorkspace, nextHandoff);
          throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
        }
        const rollbackSucceeded = await rollbackTaskLocation(handoff.worktreePath, handoff);
        if (!rollbackSucceeded) {
          throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
        }
        setOperationStatus({ translationKey: 'conversation.environment.projectionUpdateFailed', role: 'status' });
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }

      setOperationStatus(undefined);
      onChanged(handoff.localWorkspace, nextHandoff);
      emitter.emit('chat.history.refresh');
      Message.success(t('conversation.environment.worktreeCleanupSuccess'));
    } catch (error) {
      console.error('[ConversationEnvironment] Failed to clean up managed Worktree:', error);
      if (error instanceof WorkspaceHandoffError && error.requiresResync) {
        setOperationStatus({ translationKey: error.translationKey, role: 'alert' });
      }
      Message.error(
        t(
          error instanceof WorkspaceHandoffError
            ? error.translationKey
            : 'conversation.environment.worktreeCleanupFailed'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const restoreManagedWorktree = async (): Promise<void> => {
    if (!handoff?.snapshot || locality !== 'local' || availability.status !== 'available' || loading) return;

    setLoading(true);
    const snapshot = handoff.snapshot;
    try {
      await ipcBridge.gitWorkspace.restoreManagedWorktree.invoke({
        repositoryPath: handoff.localWorkspace,
        snapshot,
      });
      const { snapshot: _restoredSnapshot, ...handoffWithoutSnapshot } = handoff;
      const restoredHandoff: GitWorkspaceHandoffMetadata = {
        ...handoffWithoutSnapshot,
        locality: 'worktree',
        startRef: snapshot.head,
        startCommit: snapshot.head,
      };
      const canonicalMove = await ipcBridge.threadCoordination.execute.invoke({
        request: {
          action: 'handoff',
          targetThreadId: threadId,
          actor: { kind: 'user', id: 'opl-app-user', threadId },
          reason: 'Restore managed Worktree from Environment',
          workspace: handoff.worktreePath,
        },
      });
      if (!canonicalMove.ok) {
        const localHandoff = { ...restoredHandoff, locality: 'local' as const };
        if (await persistWorkspaceProjection(handoff.localWorkspace, localHandoff)) {
          onChanged(handoff.localWorkspace, localHandoff);
        }
        throw new WorkspaceHandoffError(
          canonicalMove.errorCode === 'thread_not_writable'
            ? 'conversation.environment.handoffRunning'
            : 'conversation.environment.handoffFailed'
        );
      }

      if (!(await persistWorkspaceProjection(handoff.worktreePath, restoredHandoff))) {
        const canonicalRollback = await rollbackThreadWorkspace(handoff.localWorkspace);
        const localHandoff = { ...restoredHandoff, locality: 'local' as const };
        const localProjection = await persistWorkspaceProjection(handoff.localWorkspace, localHandoff);
        if (canonicalRollback && localProjection) {
          onChanged(handoff.localWorkspace, localHandoff);
          setOperationStatus({ translationKey: 'conversation.environment.projectionUpdateFailed', role: 'status' });
          throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
        }
        throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
      }

      setOperationStatus(undefined);
      onChanged(handoff.worktreePath, restoredHandoff);
      emitter.emit('chat.history.refresh');
      Message.success(t('conversation.environment.worktreeRestoreSuccess'));
    } catch (error) {
      console.error('[ConversationEnvironment] Failed to restore managed Worktree:', error);
      if (error instanceof WorkspaceHandoffError && error.requiresResync) {
        setOperationStatus({ translationKey: error.translationKey, role: 'alert' });
      }
      Message.error(
        t(
          error instanceof WorkspaceHandoffError
            ? error.translationKey
            : 'conversation.environment.worktreeRestoreFailed'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmManagedWorktreeCleanup = () => {
    Modal.confirm({
      title: t('conversation.environment.worktreeCleanupConfirmTitle'),
      content: t('conversation.environment.worktreeCleanupConfirm'),
      okText: t('conversation.environment.worktreeCleanupAction'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'warning' },
      onOk: cleanupManagedWorktree,
    });
  };

  const confirmManagedWorktreeRestore = () => {
    Modal.confirm({
      title: t('conversation.environment.worktreeRestoreConfirmTitle'),
      content: t('conversation.environment.worktreeRestoreConfirm'),
      okText: t('conversation.environment.worktreeRestoreAction'),
      cancelText: t('common.cancel'),
      onOk: restoreManagedWorktree,
    });
  };

  const availabilityStatusKey =
    availability.status === 'loading'
      ? 'conversation.environment.handoffChecking'
      : availability.status === 'unavailable'
        ? availability.reasonKey
        : null;
  const statusKey = operationStatus?.translationKey ?? availabilityStatusKey;
  const statusRole = operationStatus?.role ?? 'status';

  return (
    <div className='conversation-environment-popover__section gap-6px' data-testid='environment-task-location'>
      <div className='conversation-environment-popover__section-title'>
        {t('conversation.environment.taskLocation')}
      </div>
      <Radio.Group
        type='button'
        size='mini'
        value={locality}
        disabled={availability.status !== 'available' || loading || Boolean(handoff?.snapshot)}
        aria-label={t('conversation.environment.taskLocation')}
        aria-describedby={statusKey ? 'environment-handoff-status' : undefined}
        onChange={(value) => void switchTaskLocality(value === 'worktree' ? 'worktree' : 'local')}
      >
        <Radio value='local'>
          <span className='inline-flex items-center gap-4px whitespace-nowrap'>
            <Computer size={12} />
            {t('conversation.environment.local')}
          </span>
        </Radio>
        <Radio value='worktree'>
          <span className='inline-flex items-center gap-4px whitespace-nowrap'>
            <Fork size={12} />
            {t('conversation.environment.worktree')}
          </span>
        </Radio>
      </Radio.Group>
      {handoff && locality === 'worktree' && (
        <Button
          type='secondary'
          status='warning'
          size='mini'
          icon={<History size={12} />}
          loading={loading}
          disabled={availability.status !== 'available'}
          onClick={confirmManagedWorktreeCleanup}
        >
          {t('conversation.environment.worktreeCleanupAction')}
        </Button>
      )}
      {handoff?.snapshot && locality === 'local' && (
        <Button
          type='secondary'
          size='mini'
          icon={<Undo size={12} />}
          loading={loading}
          disabled={availability.status !== 'available'}
          onClick={confirmManagedWorktreeRestore}
        >
          {t('conversation.environment.worktreeRestoreAction')}
        </Button>
      )}
      {statusKey && (
        <span
          id='environment-handoff-status'
          className='text-12px text-t-secondary'
          role={statusRole}
          aria-atomic='true'
          data-testid='environment-handoff-status'
        >
          {t(statusKey)}
        </span>
      )}
    </div>
  );
};

export default WorkspaceHandoffControl;

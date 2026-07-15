/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { GitWorkspaceHandoffMetadata } from '@/common/types/platform/gitWorkspace';
import { canonicalCodexThreadId } from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Message, Radio } from '@arco-design/web-react';
import { Computer, FolderOpen, Fork } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

type WorkspaceHandoffCandidate = Omit<Partial<GitWorkspaceHandoffMetadata>, 'worktreeRetention'> & {
  worktreeRetention?: unknown;
  snapshot?: unknown;
};

export const readWorkspaceHandoffMetadata = (value: unknown): GitWorkspaceHandoffMetadata | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as WorkspaceHandoffCandidate;
  if (
    candidate.schema !== 'opl_workspace_handoff.v1' ||
    (candidate.locality !== 'local' && candidate.locality !== 'worktree') ||
    !text(candidate.localWorkspace) ||
    !text(candidate.worktreePath) ||
    !text(candidate.taskId) ||
    !text(candidate.startRef) ||
    !text(candidate.startCommit) ||
    (candidate.worktreeRetention !== 'preserve_for_reuse' &&
      candidate.worktreeRetention !== 'preserve_for_reuse_until_snapshotted_cleanup')
  ) {
    return null;
  }
  const { snapshot: _legacySnapshot, worktreeRetention: _legacyRetention, ...metadata } = candidate;
  return { ...metadata, worktreeRetention: 'preserve_for_reuse' } as GitWorkspaceHandoffMetadata;
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
  workspace?: string;
  locality: 'local' | 'worktree';
  handoff: GitWorkspaceHandoffMetadata | null;
  onChanged: (workspace: string, handoff: GitWorkspaceHandoffMetadata | null) => void;
};

const WorkspaceHandoffControl: React.FC<Props> = ({ conversation, workspace, locality, handoff, onChanged }) => {
  const { t } = useTranslation();
  const [availability, setAvailability] = useState<WorkspaceHandoffAvailability>({ status: 'loading' });
  const [canonicalWorkspace, setCanonicalWorkspace] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [operationStatus, setOperationStatus] = useState<WorkspaceHandoffOperationStatus>();
  const threadId = canonicalCodexThreadId(conversation);

  useEffect(() => {
    let cancelled = false;
    setOperationStatus(undefined);
    setCanonicalWorkspace(undefined);
    if (!threadId) return undefined;

    setAvailability({ status: 'loading' });
    void ipcBridge.codexThreads.read
      .invoke({ threadId })
      .then(({ thread }) => {
        if (cancelled) return;
        setCanonicalWorkspace(thread.workspace);
        if (thread.status === 'archived' || thread.status === 'system_error') {
          setAvailability({ status: 'unavailable', reasonKey: 'conversation.environment.handoffUnavailable' });
        } else if (thread.status === 'running') {
          setAvailability({ status: 'unavailable', reasonKey: 'conversation.environment.handoffRunning' });
        } else {
          setAvailability({ status: 'available' });
        }
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
    nextHandoff: GitWorkspaceHandoffMetadata | null
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

  const updateThreadWorkspace = async (nextWorkspace: string): Promise<boolean> => {
    try {
      await ipcBridge.codexThreads.updateWorkspace.invoke({ threadId, workspace: nextWorkspace });
      return true;
    } catch (error) {
      console.warn('[ConversationEnvironment] Could not update canonical task workspace:', error);
      return false;
    }
  };

  const rollbackThreadWorkspace = async (targetWorkspace: string | undefined): Promise<boolean> => {
    if (targetWorkspace === undefined) {
      console.warn('[ConversationEnvironment] Canonical task workspace rollback target is unavailable.');
      return false;
    }
    return updateThreadWorkspace(targetWorkspace);
  };

  const handoffForWorkspace = (nextWorkspace: string): GitWorkspaceHandoffMetadata | null => {
    if (!handoff) return null;
    if (nextWorkspace === handoff.localWorkspace) return { ...handoff, locality: 'local' };
    if (nextWorkspace === handoff.worktreePath) return { ...handoff, locality: 'worktree' };
    return null;
  };

  const changeWorkingDirectory = async (): Promise<void> => {
    if (availability.status !== 'available' || loading) return;

    const operationStartWorkspace = canonicalWorkspace ?? workspace;
    setLoading(true);
    try {
      const directories = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory', 'createDirectory'],
      });
      const nextWorkspace = text(directories?.[0]);
      if (!nextWorkspace || nextWorkspace === operationStartWorkspace) return;

      if (!(await updateThreadWorkspace(nextWorkspace))) {
        throw new WorkspaceHandoffError('conversation.environment.workingDirectoryChangeFailed');
      }

      const nextHandoff = handoffForWorkspace(nextWorkspace);
      if (!(await persistWorkspaceProjection(nextWorkspace, nextHandoff))) {
        const rollbackSucceeded = await rollbackThreadWorkspace(operationStartWorkspace);
        if (!rollbackSucceeded) {
          throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
        }
        setOperationStatus({ translationKey: 'conversation.environment.projectionUpdateFailed', role: 'status' });
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }

      setCanonicalWorkspace(nextWorkspace);
      setOperationStatus(undefined);
      onChanged(nextWorkspace, nextHandoff);
      emitter.emit('chat.history.refresh');
      Message.success(t('conversation.environment.workingDirectoryChangeSuccess'));
    } catch (error) {
      console.error('[ConversationEnvironment] Failed to change session working directory:', error);
      if (error instanceof WorkspaceHandoffError && error.requiresResync) {
        setOperationStatus({ translationKey: error.translationKey, role: 'alert' });
      }
      Message.error(
        t(
          error instanceof WorkspaceHandoffError
            ? error.translationKey
            : 'conversation.environment.workingDirectoryChangeFailed'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const switchTaskLocality = async (nextLocality: 'local' | 'worktree') => {
    if (locality === nextLocality || !workspace || availability.status !== 'available' || loading) return;

    const operationStartWorkspace = canonicalWorkspace ?? workspace;
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
        nextWorkspace = result.targetPath;
        nextHandoff = {
          schema: 'opl_workspace_handoff.v1',
          locality: 'worktree',
          localWorkspace: result.repositoryRoot,
          worktreePath: result.targetPath,
          taskId,
          startRef: handoff?.startRef ?? result.startRef,
          startCommit: handoff?.startCommit ?? result.startCommit,
          worktreeRetention: 'preserve_for_reuse',
        };
      } else {
        if (!handoff?.localWorkspace) {
          throw new WorkspaceHandoffError('conversation.environment.localWorkspaceUnavailable');
        }
        nextWorkspace = handoff.localWorkspace;
        nextHandoff = { ...handoff, locality: 'local' };
      }

      if (!(await updateThreadWorkspace(nextWorkspace))) {
        throw new WorkspaceHandoffError('conversation.environment.handoffFailed');
      }

      if (!(await persistWorkspaceProjection(nextWorkspace, nextHandoff))) {
        const rollbackSucceeded = await rollbackThreadWorkspace(operationStartWorkspace);
        if (!rollbackSucceeded) {
          throw new WorkspaceHandoffError('conversation.environment.handoffInconsistent', true);
        }
        setOperationStatus({ translationKey: 'conversation.environment.projectionUpdateFailed', role: 'status' });
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }

      setCanonicalWorkspace(nextWorkspace);
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
      {workspace ? (
        <Radio.Group
          type='button'
          size='mini'
          value={locality}
          disabled={availability.status !== 'available' || loading}
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
      ) : null}
      <Button
        type='secondary'
        size='mini'
        icon={<FolderOpen size={12} />}
        loading={loading}
        disabled={availability.status !== 'available'}
        onClick={() => void changeWorkingDirectory()}
      >
        {t('conversation.environment.changeWorkingDirectory')}
      </Button>
      {statusKey ? (
        <span
          id='environment-handoff-status'
          className='text-12px text-t-secondary'
          role={statusRole}
          aria-atomic='true'
          data-testid='environment-handoff-status'
        >
          {t(statusKey)}
        </span>
      ) : null}
    </div>
  );
};

export default WorkspaceHandoffControl;

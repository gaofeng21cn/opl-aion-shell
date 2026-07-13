import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { GitWorkspaceHandoffMetadata } from '@/common/types/platform/gitWorkspace';
import { canonicalCodexThreadId } from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';
import { emitter } from '@/renderer/utils/emitter';
import { Message, Radio } from '@arco-design/web-react';
import { Computer, Fork } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

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
  return candidate as GitWorkspaceHandoffMetadata;
};

type WorkspaceHandoffAvailability = { status: 'loading' | 'available' } | { status: 'unavailable'; reasonKey: string };

class WorkspaceHandoffError extends Error {
  readonly translationKey: string;

  constructor(translationKey: string) {
    super(translationKey);
    this.translationKey = translationKey;
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
  const threadId = canonicalCodexThreadId(conversation);

  useEffect(() => {
    let cancelled = false;
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

  const rollbackThreadWorkspace = async () => {
    try {
      await ipcBridge.threadCoordination.execute.invoke({
        request: {
          action: 'handoff',
          targetThreadId: threadId,
          actor: { kind: 'user', id: 'opl-app-user', threadId },
          reason: 'Roll back task working directory after shell projection update failed',
          workspace,
        },
      });
    } catch (error) {
      console.warn('[ConversationEnvironment] Could not roll back canonical task workspace:', error);
    }
  };

  const switchTaskLocality = async (nextLocality: 'local' | 'worktree') => {
    if (locality === nextLocality || availability.status !== 'available' || loading) return;

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

      let projectionUpdated = false;
      try {
        projectionUpdated = await ipcBridge.conversation.update.invoke({
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
        await rollbackThreadWorkspace();
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }
      if (!projectionUpdated) {
        await rollbackThreadWorkspace();
        throw new WorkspaceHandoffError('conversation.environment.projectionUpdateFailed');
      }

      onChanged(nextWorkspace, nextHandoff);
      emitter.emit('chat.history.refresh');
      Message.success(t('conversation.environment.handoffSuccess'));
    } catch (error) {
      console.error('[ConversationEnvironment] Failed to switch task workspace:', error);
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

  const statusKey =
    availability.status === 'loading'
      ? 'conversation.environment.handoffChecking'
      : availability.status === 'unavailable'
        ? availability.reasonKey
        : null;

  return (
    <div className='conversation-environment-popover__section gap-6px' data-testid='environment-task-location'>
      <div className='conversation-environment-popover__section-title'>
        {t('conversation.environment.taskLocation')}
      </div>
      <Radio.Group
        type='button'
        size='mini'
        value={locality}
        disabled={availability.status !== 'available' || loading}
        aria-label={t('conversation.environment.taskLocation')}
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
      {statusKey && (
        <span className='text-12px text-t-secondary' role='status' data-testid='environment-handoff-status'>
          {t(statusKey)}
        </span>
      )}
    </div>
  );
};

export default WorkspaceHandoffControl;

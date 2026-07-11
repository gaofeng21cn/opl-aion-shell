import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import {
  summarizeCurrentTaskReferences,
  type ConversationCurrentTask,
} from '@/renderer/pages/conversation/runtime/CurrentTaskAwareness';
import {
  dispatchWorkspaceToggleEvent,
  WORKSPACE_STATE_EVENT,
  type WorkspaceStateDetail,
} from '@/renderer/utils/workspace/workspaceEvents';
import { Button, Popover } from '@arco-design/web-react';
import { Down, FolderOpen, Info } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WorkspaceOpenButton from './WorkspaceOpenButton';

const VISIBLE_REF_LIMIT = 3;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const ReferenceGroup: React.FC<{ label: string; refs: string[]; moreLabel: string }> = ({ label, refs, moreLabel }) => {
  if (!refs.length) return null;
  return (
    <div className='conversation-environment-popover__ref-group'>
      <span>{label}</span>
      <ul>
        {refs.slice(0, VISIBLE_REF_LIMIT).map((ref) => (
          <li key={ref} title={ref}>
            {ref}
          </li>
        ))}
        {refs.length > VISIBLE_REF_LIMIT && <li className='conversation-environment-popover__more'>{moreLabel}</li>}
      </ul>
    </div>
  );
};

const ConversationEnvironmentPopover: React.FC<{
  conversation?: TChatConversation;
  currentTask?: ConversationCurrentTask | null;
}> = ({ conversation, currentTask }) => {
  const { t } = useTranslation();
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<{ branch?: string; changeCount?: number }>({});
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const summary = useMemo(() => {
    const extra = (conversation?.extra ?? {}) as Record<string, unknown>;
    const task = (currentTask ?? {}) as Record<string, unknown>;
    const subtasks = Array.isArray(task.subtasks)
      ? task.subtasks.length
      : typeof task.subtask_count === 'number'
        ? task.subtask_count
        : undefined;

    return {
      workspace: text(extra.workspace),
      locality:
        conversation?.type === 'remote' ? t('conversation.environment.remote') : t('conversation.environment.local'),
      isTemporaryWorkspace: Boolean(extra.is_temporary_workspace),
      supportsWorkspaceSurface:
        conversation?.type === 'acp' || conversation?.type === 'codex' || conversation?.type === 'aionrs',
      subtasks,
      references: summarizeCurrentTaskReferences(currentTask),
    };
  }, [conversation, currentTask, t]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleWorkspaceState = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceStateDetail>).detail;
      if (typeof detail?.collapsed === 'boolean') setWorkspaceCollapsed(detail.collapsed);
    };
    window.addEventListener(WORKSPACE_STATE_EVENT, handleWorkspaceState);
    return () => window.removeEventListener(WORKSPACE_STATE_EVENT, handleWorkspaceState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWorkspaceSnapshot({});
    if (!summary.workspace) return undefined;

    void Promise.allSettled([
      ipcBridge.fileSnapshot.getInfo.invoke({ workspace: summary.workspace }),
      ipcBridge.fileSnapshot.compare.invoke({ workspace: summary.workspace }),
    ]).then(([infoResult, compareResult]) => {
      if (cancelled) return;
      setWorkspaceSnapshot({
        branch: infoResult.status === 'fulfilled' ? text(infoResult.value.branch) : undefined,
        changeCount:
          compareResult.status === 'fulfilled'
            ? compareResult.value.staged.length + compareResult.value.unstaged.length
            : undefined,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [summary.workspace]);

  const renderReferenceGroup = (label: string, refs: string[]) => (
    <ReferenceGroup
      label={label}
      refs={refs}
      moreLabel={t('conversation.environment.moreRefs', { count: Math.max(0, refs.length - VISIBLE_REF_LIMIT) })}
    />
  );
  const hasTaskReferences = Boolean(
    summary.references.artifacts.length || summary.references.evidence.length || summary.references.receipts.length
  );

  const content = (
    <div className='conversation-environment-popover' data-testid='conversation-environment-popover'>
      <div className='conversation-environment-popover__section'>
        <div className='conversation-environment-popover__row'>
          <span>{t('conversation.environment.workspace')}</span>
          <b title={summary.workspace}>{summary.workspace ?? t('conversation.environment.noWorkspace')}</b>
        </div>
        <div className='conversation-environment-popover__row'>
          <span>{t('conversation.environment.location')}</span>
          <b>{summary.locality}</b>
        </div>
        {workspaceSnapshot.branch && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.branch')}</span>
            <b title={workspaceSnapshot.branch}>{workspaceSnapshot.branch}</b>
          </div>
        )}
        {workspaceSnapshot.changeCount !== undefined && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.changes')}</span>
            <b>{workspaceSnapshot.changeCount}</b>
          </div>
        )}
        {summary.subtasks !== undefined && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.subtasks')}</span>
            <b>{summary.subtasks}</b>
          </div>
        )}
      </div>

      {summary.references.sources.length > 0 && (
        <div className='conversation-environment-popover__section'>
          {renderReferenceGroup(t('conversation.environment.sources'), summary.references.sources)}
        </div>
      )}

      {hasTaskReferences && (
        <div className='conversation-environment-popover__section'>
          <div className='conversation-environment-popover__section-title'>
            {t('conversation.environment.taskReferences')}
          </div>
          {renderReferenceGroup(t('conversation.environment.artifacts'), summary.references.artifacts)}
          {renderReferenceGroup(t('conversation.environment.evidence'), summary.references.evidence)}
          {renderReferenceGroup(t('conversation.environment.receipts'), summary.references.receipts)}
        </div>
      )}

      {summary.workspace && summary.supportsWorkspaceSurface && (
        <div className='conversation-environment-popover__actions'>
          <Button
            type='secondary'
            size='small'
            icon={<FolderOpen size={14} />}
            disabled={!workspaceCollapsed}
            onClick={() => dispatchWorkspaceToggleEvent()}
          >
            {workspaceCollapsed ? t('conversation.environment.openFiles') : t('conversation.environment.filesOpen')}
          </Button>
          <WorkspaceOpenButton
            workspacePath={summary.workspace}
            isTemporary={summary.isTemporaryWorkspace}
            tool='terminal'
            showLabel
          />
        </div>
      )}
    </div>
  );

  return (
    <Popover trigger='click' position='br' content={content}>
      <Button
        type='text'
        size='small'
        className='conversation-environment-trigger'
        icon={<Info size={14} />}
        aria-label={t('conversation.environment.title')}
      >
        <span>{summary.locality}</span>
        <Down size={12} />
      </Button>
    </Popover>
  );
};

export default ConversationEnvironmentPopover;

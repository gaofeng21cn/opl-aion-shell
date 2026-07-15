import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { GitWorkspaceHandoffMetadata, GitWorkspaceInspection } from '@/common/types/platform/gitWorkspace';
import {
  summarizeCurrentTaskReferences,
  type ConversationCurrentTask,
} from '@/renderer/pages/conversation/runtime/CurrentTaskAwareness';
import {
  dispatchWorkspaceToggleEvent,
  WORKSPACE_STATE_EVENT,
  type WorkspaceStateDetail,
} from '@/renderer/utils/workspace/workspaceEvents';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { Button, Input, Popover } from '@arco-design/web-react';
import { Down, FolderOpen, Info, Link } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WorkspaceOpenButton from './WorkspaceOpenButton';
import WorkspaceHandoffControl, { readWorkspaceHandoffMetadata } from './WorkspaceHandoffControl';

const VISIBLE_REF_LIMIT = 3;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const normalizeBrowserUrl = (value: string): string | null => {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

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
  const { openPreview } = usePreviewContext();
  const extra = useMemo(() => (conversation?.extra ?? {}) as Record<string, unknown>, [conversation?.extra]);
  const persistedWorkspace = text(extra.workspace);
  const persistedHandoff = useMemo(
    () => readWorkspaceHandoffMetadata(extra.workspace_handoff),
    [extra.workspace_handoff]
  );
  const [activeWorkspace, setActiveWorkspace] = useState(persistedWorkspace);
  const [activeHandoff, setActiveHandoff] = useState<GitWorkspaceHandoffMetadata | null>(persistedHandoff);
  const [gitInspection, setGitInspection] = useState<GitWorkspaceInspection>();
  const [gitUnavailable, setGitUnavailable] = useState(false);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserUrlInvalid, setBrowserUrlInvalid] = useState(false);

  useEffect(() => {
    setActiveWorkspace(persistedWorkspace);
    setActiveHandoff(persistedHandoff);
  }, [conversation?.id, persistedHandoff, persistedWorkspace]);

  const summary = useMemo(() => {
    const task = (currentTask ?? {}) as Record<string, unknown>;
    const subtasks = Array.isArray(task.subtasks)
      ? task.subtasks.length
      : typeof task.subtask_count === 'number'
        ? task.subtask_count
        : undefined;
    const taskLocality =
      activeHandoff && activeWorkspace === activeHandoff.worktreePath ? ('worktree' as const) : ('local' as const);

    return {
      workspace: activeWorkspace,
      isRemote: conversation?.type === 'remote',
      locality:
        conversation?.type === 'remote'
          ? t('conversation.environment.remote')
          : t(`conversation.environment.${taskLocality}`),
      taskLocality,
      handoff: activeHandoff,
      isTemporaryWorkspace: Boolean(extra.is_temporary_workspace),
      supportsWorkspaceSurface:
        conversation?.type === 'acp' || conversation?.type === 'codex' || conversation?.type === 'aionrs',
      subtasks,
      references: summarizeCurrentTaskReferences(currentTask),
    };
  }, [activeHandoff, activeWorkspace, conversation?.type, currentTask, extra.is_temporary_workspace, t]);

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
    setGitInspection(undefined);
    setGitUnavailable(false);
    if (!summary.workspace) return undefined;
    if (summary.isRemote) {
      setGitUnavailable(true);
      return undefined;
    }

    void ipcBridge.gitWorkspace.inspect.invoke({ cwd: summary.workspace }).then(
      (inspection) => {
        if (!cancelled) setGitInspection(inspection);
      },
      () => {
        if (!cancelled) setGitUnavailable(true);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [summary.isRemote, summary.workspace]);

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
  const inspectedWorkspace = text(gitInspection?.cwd) ?? summary.workspace;
  const repositoryRoot = text(gitInspection?.root);
  const currentBranch = text(gitInspection?.currentBranch);
  const gitChanges = gitInspection
    ? [
        gitInspection.dirty ? t('conversation.environment.dirty') : t('conversation.environment.clean'),
        gitInspection.staged ? t('conversation.environment.staged') : undefined,
      ]
        .filter(Boolean)
        .join(' / ')
    : undefined;
  const pullRequest = gitInspection?.pullRequest.status === 'available' ? gitInspection.pullRequest : undefined;
  const pullRequestSummary = pullRequest
    ? [
        pullRequest.isDraft ? t('conversation.environment.draft') : undefined,
        `#${pullRequest.number}`,
        pullRequest.title,
        `(${pullRequest.headRefName} -> ${pullRequest.baseRefName})`,
      ]
        .filter(Boolean)
        .join(' ')
    : undefined;
  const pullRequestUnavailable =
    gitInspection?.pullRequest.status === 'unavailable' &&
    ['gh_command_failed', 'gh_not_found', 'invalid_response'].includes(gitInspection.pullRequest.reason);
  const openBrowser = () => {
    const url = normalizeBrowserUrl(browserUrl);
    setBrowserUrlInvalid(!url);
    if (!url) return;
    openPreview(url, 'url', { title: url }, { replace: true });
  };

  const content = (
    <div className='conversation-environment-popover' data-testid='conversation-environment-popover'>
      <div className='conversation-environment-popover__section'>
        <div className='conversation-environment-popover__row'>
          <span>{t('conversation.environment.workspace')}</span>
          <b title={inspectedWorkspace}>{inspectedWorkspace ?? t('conversation.environment.noWorkspace')}</b>
        </div>
        <div className='conversation-environment-popover__row'>
          <span>{t('conversation.environment.location')}</span>
          <b>{summary.locality}</b>
        </div>
        {gitUnavailable && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.git')}</span>
            <b>{t('conversation.environment.unavailable')}</b>
          </div>
        )}
        {repositoryRoot && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.root')}</span>
            <b title={repositoryRoot}>{repositoryRoot}</b>
          </div>
        )}
        {currentBranch && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.branch')}</span>
            <b title={currentBranch}>{currentBranch}</b>
          </div>
        )}
        {gitChanges && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.changes')}</span>
            <b>{gitChanges}</b>
          </div>
        )}
        {pullRequestSummary && pullRequest && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.pullRequest')}</span>
            <b title={`${pullRequestSummary}\n${pullRequest.url}`}>{pullRequestSummary}</b>
          </div>
        )}
        {pullRequestUnavailable && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.pullRequest')}</span>
            <b>{t('conversation.environment.unavailable')}</b>
          </div>
        )}
        {summary.subtasks !== undefined && (
          <div className='conversation-environment-popover__row'>
            <span>{t('conversation.environment.subtasks')}</span>
            <b>{summary.subtasks}</b>
          </div>
        )}
      </div>

      {conversation && (
        <WorkspaceHandoffControl
          conversation={conversation}
          workspace={summary.workspace}
          locality={summary.taskLocality}
          handoff={summary.handoff}
          onChanged={(workspace, handoff) => {
            setActiveWorkspace(workspace);
            setActiveHandoff(handoff);
          }}
        />
      )}

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

      <div className='conversation-environment-popover__browser'>
        <Input
          size='small'
          value={browserUrl}
          status={browserUrlInvalid ? 'error' : undefined}
          aria-label={t('conversation.sidePanel.browserAddress')}
          placeholder={t('conversation.sidePanel.browserAddress')}
          onChange={(value) => {
            setBrowserUrl(value);
            setBrowserUrlInvalid(false);
          }}
          onPressEnter={openBrowser}
        />
        <Button
          type='secondary'
          size='small'
          icon={<Link size={14} />}
          aria-label={t('conversation.sidePanel.openBrowser')}
          onClick={openBrowser}
        >
          {t('conversation.sidePanel.openBrowser')}
        </Button>
      </div>

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

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CodexThreadReviewDelivery, CodexThreadReviewTarget } from '@/common/types/codex/threadCoordination';
import type { GitPullRequestContext, GitWorkspaceInspection } from '@/common/types/platform/gitWorkspace';
import { useThreadCoordination } from '@/renderer/pages/conversation/GroupedHistory/ThreadCoordination/useThreadCoordination';
import WorkspaceLastTurnSection from '@/renderer/pages/conversation/Workspace/components/WorkspaceLastTurnSection';
import { Alert, Button, Input, Message, Modal, Radio, Select, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { BranchOne, CheckOne, PreviewOpen, PullRequests, Refresh, Upload } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

type ReviewTargetType = CodexThreadReviewTarget['type'];
type ReviewAction = 'commit' | 'push' | 'review' | null;
type PullRequestUnavailableReason = Extract<GitPullRequestContext, { status: 'unavailable' }>['reason'];

type WorkspaceReviewSurfaceProps = {
  t: TFunction;
  conversationId: string;
  workspace: string;
  stagedCount: number;
  onRefreshChanges: () => void | Promise<void>;
};

type WorkspaceReviewDialogProps = WorkspaceReviewSurfaceProps & {
  onReviewStarted: () => void;
};

const REVIEW_TARGET_TYPES: ReviewTargetType[] = ['uncommittedChanges', 'baseBranch', 'commit', 'custom'];

const PULL_REQUEST_REASON_KEYS: Record<PullRequestUnavailableReason, string> = {
  detached_head: 'detachedHead',
  gh_command_failed: 'ghCommandFailed',
  gh_not_found: 'ghNotFound',
  invalid_response: 'invalidResponse',
  no_current_pull_request: 'noCurrentPullRequest',
};

function suggestedBaseBranch(inspection: GitWorkspaceInspection): string {
  if (inspection.pullRequest.status === 'available') return inspection.pullRequest.baseRefName;
  return (
    inspection.branches.find((branch) => branch.kind === 'local' && !branch.current)?.name ??
    inspection.branches.find((branch) => !branch.current)?.name ??
    ''
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

const WorkspaceReviewDialog: React.FC<WorkspaceReviewDialogProps> = ({
  t,
  conversationId,
  workspace,
  stagedCount,
  onRefreshChanges,
  onReviewStarted,
}) => {
  const { overview, loading: threadLoading, execute } = useThreadCoordination(conversationId);
  const [inspection, setInspection] = useState<GitWorkspaceInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction>(null);
  const [targetType, setTargetType] = useState<ReviewTargetType>('uncommittedChanges');
  const [delivery, setDelivery] = useState<CodexThreadReviewDelivery>('inline');
  const [baseBranch, setBaseBranch] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [reviewFocus, setReviewFocus] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  const refreshInspection = useCallback(async () => {
    setInspectionLoading(true);
    setGitError(null);
    try {
      const nextInspection = await ipcBridge.gitWorkspace.inspect.invoke({ cwd: workspace });
      setInspection(nextInspection);
      setBaseBranch((current) => current || suggestedBaseBranch(nextInspection));
      setCommitSha((current) => current || nextInspection.head);
    } catch (error) {
      console.error('[WorkspaceReviewSurface] Failed to inspect Git workspace:', error);
      setInspection(null);
      setGitError(errorMessage(error, t('conversation.workspace.review.gitInspectionFailed')));
    } finally {
      setInspectionLoading(false);
    }
  }, [t, workspace]);

  useEffect(() => {
    void refreshInspection();
  }, [refreshInspection]);

  const branches = useMemo(
    () => Array.from(new Set(inspection?.branches.map((branch) => branch.name) ?? [])),
    [inspection?.branches]
  );

  const reviewTarget = useMemo<CodexThreadReviewTarget | null>(() => {
    if (targetType === 'uncommittedChanges') return { type: 'uncommittedChanges' };
    if (targetType === 'baseBranch') {
      const branch = baseBranch.trim();
      return branch ? { type: 'baseBranch', branch } : null;
    }
    if (targetType === 'commit') {
      const sha = commitSha.trim();
      return sha ? { type: 'commit', sha, title: null } : null;
    }
    const instructions = customInstructions.trim();
    return instructions ? { type: 'custom', instructions } : null;
  }, [baseBranch, commitSha, customInstructions, targetType]);

  const currentThreadId = overview?.currentThreadId ?? null;
  const reviewAvailable =
    overview?.availability.status === 'available' &&
    overview.availability.methods.includes('review/start') &&
    Boolean(currentThreadId);
  const busy = action !== null;

  const handleStartReview = async () => {
    if (!currentThreadId || !reviewTarget) return;
    setAction('review');
    let reviewStarted = false;
    try {
      const context = reviewTarget.type === 'custom' ? '' : reviewFocus.trim();
      const reason =
        context ||
        (reviewTarget.type === 'custom' ? reviewTarget.instructions : t('conversation.workspace.review.defaultReason'));
      const result = await execute({
        action: 'review',
        targetThreadId: currentThreadId,
        actor: { kind: 'user', id: 'opl-app-user', threadId: currentThreadId },
        reason,
        ...(context ? { context } : {}),
        target: reviewTarget,
        delivery,
      });
      if (
        !result.ok ||
        !result.reviewThreadId ||
        !result.turnId ||
        (context && result.protocolMethod !== 'turn/steer')
      ) {
        const translatedError = result.errorCode
          ? t(`conversation.threadCoordination.errors.${result.errorCode}`)
          : t('conversation.workspace.review.reviewFailed');
        Message.error(translatedError);
        return;
      }
      Message.success(t('conversation.workspace.review.reviewSuccess'));
      reviewStarted = true;
    } catch (error) {
      console.error('[WorkspaceReviewSurface] Failed to start review:', error);
      Message.error(t('conversation.workspace.review.reviewFailed'));
    } finally {
      setAction(null);
      if (reviewStarted) onReviewStarted();
    }
  };

  const handleCommit = async () => {
    const message = commitMessage.trim();
    if (!message || stagedCount === 0) return;
    setAction('commit');
    try {
      const result = await ipcBridge.gitWorkspace.commitStaged.invoke({ cwd: workspace, message });
      setCommitMessage('');
      Message.success(
        t('conversation.workspace.review.commitSuccess', {
          sha: result.commitSha.slice(0, 8),
        })
      );
      void Promise.resolve()
        .then(onRefreshChanges)
        .catch((error) => {
          console.error('[WorkspaceReviewSurface] Failed to refresh changes after commit:', error);
        });
      void refreshInspection();
    } catch (error) {
      console.error('[WorkspaceReviewSurface] Failed to commit staged changes:', error);
      Message.error(errorMessage(error, t('conversation.workspace.review.commitFailed')));
    } finally {
      setAction(null);
    }
  };

  const handlePush = async () => {
    if (!inspection?.currentBranch) return;
    setAction('push');
    try {
      const result = await ipcBridge.gitWorkspace.pushCurrentBranch.invoke({ cwd: workspace });
      Message.success(t('conversation.workspace.review.pushSuccess', { branch: result.branch }));
      void refreshInspection();
    } catch (error) {
      console.error('[WorkspaceReviewSurface] Failed to push current branch:', error);
      Message.error(errorMessage(error, t('conversation.workspace.review.pushFailed')));
    } finally {
      setAction(null);
    }
  };

  const pullRequest = inspection?.pullRequest ?? null;

  return (
    <div className='flex flex-col gap-18px'>
      <section>
        <div className='mb-10px flex items-center justify-between gap-12px'>
          <div className='flex items-center gap-6px text-13px font-semibold text-t-primary'>
            <BranchOne size={16} />
            {t('conversation.workspace.review.gitTitle')}
          </div>
          <Tooltip content={t('conversation.workspace.review.refreshGit')}>
            <Button
              type='text'
              size='mini'
              shape='circle'
              icon={<Refresh size={15} />}
              aria-label={t('conversation.workspace.review.refreshGit')}
              loading={inspectionLoading}
              disabled={busy}
              onClick={() => void refreshInspection()}
            />
          </Tooltip>
        </div>

        {inspectionLoading ? (
          <div className='h-64px flex items-center justify-center'>
            <Spin size={18} />
          </div>
        ) : gitError ? (
          <Alert type='warning' content={gitError} />
        ) : inspection ? (
          <dl className='m-0 grid grid-cols-[92px_minmax(0,1fr)] gap-x-10px gap-y-8px text-12px leading-18px'>
            <dt className='text-t-tertiary'>{t('conversation.workspace.review.branchLabel')}</dt>
            <dd className='m-0 break-all text-t-primary'>
              {inspection.currentBranch ?? t('conversation.workspace.review.detachedHead')}
            </dd>
            <dt className='text-t-tertiary'>{t('conversation.workspace.review.headLabel')}</dt>
            <dd className='m-0 font-mono text-t-primary'>{inspection.head.slice(0, 12)}</dd>
            <dt className='text-t-tertiary'>{t('conversation.workspace.review.pullRequestLabel')}</dt>
            <dd className='m-0 min-w-0'>
              {pullRequest?.status === 'available' ? (
                <div className='min-w-0'>
                  <div className='flex min-w-0 items-center gap-6px'>
                    <PullRequests size={14} className='shrink-0 text-t-secondary' />
                    <span className='truncate text-t-primary'>
                      #{pullRequest.number} {pullRequest.title}
                    </span>
                    <Tag size='small' color={pullRequest.isDraft ? 'gray' : 'arcoblue'}>
                      {pullRequest.state}
                    </Tag>
                  </div>
                  <div className='mt-2px text-11px text-t-tertiary'>
                    {pullRequest.baseRefName} &lt;- {pullRequest.headRefName}
                  </div>
                </div>
              ) : pullRequest ? (
                <div className='flex flex-wrap items-center gap-6px'>
                  <Tag size='small' color='gray'>
                    {t('conversation.workspace.review.unavailable')}
                  </Tag>
                  <span className='text-t-tertiary'>
                    {t(
                      `conversation.workspace.review.pullRequestUnavailable.${PULL_REQUEST_REASON_KEYS[pullRequest.reason]}`
                    )}
                  </span>
                </div>
              ) : null}
            </dd>
          </dl>
        ) : null}
      </section>

      <WorkspaceLastTurnSection t={t} workspace={workspace} />

      <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
        <div className='mb-10px flex items-center gap-6px text-13px font-semibold text-t-primary'>
          <PreviewOpen size={16} />
          {t('conversation.workspace.review.reviewTitle')}
        </div>

        {!threadLoading && !reviewAvailable ? (
          <Alert type='warning' content={t('conversation.workspace.review.threadUnavailable')} />
        ) : null}

        <div className='mt-12px flex flex-col gap-12px'>
          <div>
            <div className='mb-6px text-12px font-medium text-t-secondary'>
              {t('conversation.workspace.review.targetLabel')}
            </div>
            <Select
              value={targetType}
              className='w-full'
              aria-label={t('conversation.workspace.review.targetLabel')}
              disabled={busy}
              onChange={(value) => setTargetType(value as ReviewTargetType)}
            >
              {REVIEW_TARGET_TYPES.map((type) => (
                <Select.Option key={type} value={type}>
                  {t(`conversation.workspace.review.target.${type}`)}
                </Select.Option>
              ))}
            </Select>
          </div>

          {targetType === 'baseBranch' ? (
            <Select
              value={baseBranch || undefined}
              className='w-full'
              allowCreate
              showSearch
              aria-label={t('conversation.workspace.review.baseBranchPlaceholder')}
              placeholder={t('conversation.workspace.review.baseBranchPlaceholder')}
              disabled={busy || inspectionLoading}
              onChange={(value) => setBaseBranch(String(value))}
            >
              {branches.map((branch) => (
                <Select.Option key={branch} value={branch}>
                  {branch}
                </Select.Option>
              ))}
            </Select>
          ) : null}

          {targetType === 'commit' ? (
            <Input
              value={commitSha}
              aria-label={t('conversation.workspace.review.commitPlaceholder')}
              placeholder={t('conversation.workspace.review.commitPlaceholder')}
              disabled={busy}
              onChange={setCommitSha}
            />
          ) : null}

          {targetType === 'custom' ? (
            <Input.TextArea
              value={customInstructions}
              aria-label={t('conversation.workspace.review.customPlaceholder')}
              placeholder={t('conversation.workspace.review.customPlaceholder')}
              autoSize={{ minRows: 2, maxRows: 5 }}
              disabled={busy}
              onChange={setCustomInstructions}
            />
          ) : (
            <Input.TextArea
              value={reviewFocus}
              aria-label={t('conversation.workspace.review.focusPlaceholder')}
              placeholder={t('conversation.workspace.review.focusPlaceholder')}
              autoSize={{ minRows: 2, maxRows: 4 }}
              disabled={busy}
              onChange={setReviewFocus}
            />
          )}

          <div>
            <div className='mb-6px text-12px font-medium text-t-secondary'>
              {t('conversation.workspace.review.deliveryLabel')}
            </div>
            <Radio.Group
              type='button'
              value={delivery}
              aria-label={t('conversation.workspace.review.deliveryLabel')}
              disabled={busy}
              onChange={(value) => setDelivery(value as CodexThreadReviewDelivery)}
            >
              <Radio value='inline'>{t('conversation.workspace.review.delivery.inline')}</Radio>
              <Radio value='detached'>{t('conversation.workspace.review.delivery.detached')}</Radio>
            </Radio.Group>
          </div>

          <div className='flex justify-end'>
            <Button
              type='primary'
              icon={<PreviewOpen size={15} />}
              loading={action === 'review' || threadLoading}
              disabled={!reviewAvailable || !reviewTarget || busy}
              onClick={() => void handleStartReview()}
            >
              {t('conversation.workspace.review.startReview')}
            </Button>
          </div>
        </div>
      </section>

      <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
        <div className='mb-10px text-13px font-semibold text-t-primary'>
          {t('conversation.workspace.review.deliveryTitle')}
        </div>
        <div className='flex flex-col gap-10px'>
          <Input
            value={commitMessage}
            aria-label={t('conversation.workspace.review.commitMessagePlaceholder')}
            placeholder={t('conversation.workspace.review.commitMessagePlaceholder')}
            disabled={busy}
            onChange={setCommitMessage}
          />
          <div className='flex flex-wrap justify-end gap-8px'>
            <Button
              icon={<CheckOne size={15} />}
              loading={action === 'commit'}
              disabled={busy || stagedCount === 0 || !commitMessage.trim()}
              onClick={() => void handleCommit()}
            >
              {t('conversation.workspace.review.commitStaged')}
            </Button>
            <Button
              icon={<Upload size={15} />}
              loading={action === 'push'}
              disabled={busy || inspectionLoading || !inspection?.currentBranch}
              onClick={() => void handlePush()}
            >
              {t('conversation.workspace.review.pushCurrentBranch')}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

const WorkspaceReviewSurface: React.FC<WorkspaceReviewSurfaceProps> = (props) => {
  const { t } = props;
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Button
        type='text'
        size='mini'
        icon={<PreviewOpen size={14} />}
        aria-label={t('conversation.workspace.review.open')}
        onClick={() => setVisible(true)}
      >
        {t('conversation.workspace.review.open')}
      </Button>
      <Modal
        visible={visible}
        title={t('conversation.workspace.review.title')}
        footer={null}
        focusLock
        autoFocus
        unmountOnExit
        style={{ maxWidth: 620, width: 'calc(100vw - 32px)' }}
        onCancel={() => setVisible(false)}
      >
        {visible ? <WorkspaceReviewDialog {...props} onReviewStarted={() => setVisible(false)} /> : null}
      </Modal>
    </>
  );
};

export default WorkspaceReviewSurface;

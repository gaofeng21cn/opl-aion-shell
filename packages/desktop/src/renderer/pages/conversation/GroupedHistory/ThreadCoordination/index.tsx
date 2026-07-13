/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Empty, Input, Message, Select, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { BranchOne, ConnectionPoint, Fork, Inbox, PreviewOpen, Refresh, Send, Undo } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type {
  CodexThreadDescriptor,
  CodexThreadDetail,
  ThreadCoordinationActionRequest,
} from '@/common/types/codex/threadCoordination';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import PendingServerRequests from './PendingServerRequests';
import { useThreadCoordination } from './useThreadCoordination';

type ThreadCoordinationSectionProps = {
  collapsed: boolean;
  tooltipEnabled: boolean;
};

const MESSAGE_TEXTAREA_AUTO_SIZE = { minRows: 3, maxRows: 6 };

function statusColor(status: CodexThreadDescriptor['status']): string {
  if (status === 'running') return 'green';
  if (status === 'idle') return 'arcoblue';
  if (status === 'system_error') return 'red';
  if (status === 'archived') return 'gray';
  return 'orangered';
}

const ThreadCoordinationSection: React.FC<ThreadCoordinationSectionProps> = ({ collapsed, tooltipEnabled }) => {
  const { t } = useTranslation();
  const { id: conversationId } = useParams();
  const isMobile = useLayoutContext()?.isMobile ?? false;
  const { overview, pendingRequests, loading, refresh, readThread, execute, resolveServerRequest } =
    useThreadCoordination(conversationId);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [sourceThreadId, setSourceThreadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CodexThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');

  const threads = overview?.threads ?? [];
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads]
  );
  const available = overview?.availability.status === 'available';
  const runningCount = threads.filter((thread) => thread.status === 'running').length;
  const selectedPendingRequests = pendingRequests.filter((request) => request.threadId === selectedThreadId);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) setSelectedThreadId(threads[0].id);
    if (selectedThreadId && !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0]?.id ?? null);
    }
  }, [selectedThreadId, threads]);

  useEffect(() => {
    if (overview?.currentThreadId && threads.some((thread) => thread.id === overview.currentThreadId)) {
      setSourceThreadId(overview.currentThreadId);
      return;
    }
    if (sourceThreadId && !threads.some((thread) => thread.id === sourceThreadId && !thread.archived)) {
      setSourceThreadId(null);
    }
  }, [overview?.currentThreadId, sourceThreadId, threads]);

  useEffect(() => {
    if (!drawerVisible || !selectedThreadId || !available) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    void readThread(selectedThreadId)
      .then((result) => {
        if (!active) return;
        if (result.ok) setDetail(result.detail);
        else Message.error(t('conversation.threadCoordination.readFailed'));
      })
      .catch(() => {
        if (active) Message.error(t('conversation.threadCoordination.readFailed'));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [available, drawerVisible, readThread, selectedThreadId, t]);

  const runAction = async (request: ThreadCoordinationActionRequest) => {
    setActionLoading(true);
    try {
      const result = await execute(request);
      if (result.ok) {
        Message.success(t('conversation.threadCoordination.actionAccepted'));
        setMessage('');
      } else {
        Message.error(t(`conversation.threadCoordination.errors.${result.errorCode ?? 'protocol_error'}`));
      }
    } catch {
      Message.error(t('conversation.threadCoordination.actionFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const runLifecycle = (action: 'resume' | 'fork' | 'archive' | 'unarchive') => {
    if (!selectedThread || !reason.trim()) return;
    void runAction({
      action,
      targetThreadId: selectedThread.id,
      actor: { kind: 'user', id: 'opl-app-user', threadId: sourceThreadId },
      reason: reason.trim(),
    });
  };

  const reviewChanges = () => {
    if (!selectedThread || !reason.trim()) return;
    void runAction({
      action: 'review',
      targetThreadId: selectedThread.id,
      actor: { kind: 'user', id: 'opl-app-user', threadId: sourceThreadId },
      reason: reason.trim(),
      target: { type: 'uncommittedChanges' },
      delivery: 'inline',
    });
  };

  const deliver = () => {
    if (!selectedThread || !sourceThreadId || !reason.trim() || !message.trim()) return;
    void runAction({
      action: 'deliver',
      sourceThreadId,
      targetThreadId: selectedThread.id,
      actor: { kind: 'user', id: 'opl-app-user', threadId: sourceThreadId },
      reason: reason.trim(),
      message: message.trim(),
      permission: 'inherit',
      writeSet: [],
      idempotencyKey: globalThis.crypto.randomUUID(),
      route: { visitedThreadIds: [sourceThreadId], hopCount: 1 },
    });
  };

  const railLabel = t('conversation.threadCoordination.title');
  const railContent = (
    <div
      data-testid='thread-coordination-entry'
      className={classNames(
        'h-36px rd-8px flex items-center cursor-pointer transition-colors hover:bg-fill-3 text-t-primary',
        collapsed ? 'justify-center px-0' : 'gap-8px px-10px'
      )}
      role='button'
      tabIndex={0}
      onClick={() => setDrawerVisible(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setDrawerVisible(true);
      }}
    >
      <ConnectionPoint theme='outline' size='16' className='shrink-0 text-t-secondary' />
      {!collapsed && (
        <>
          <span className='min-w-0 flex-1 truncate text-14px font-[500]'>{railLabel}</span>
          <span className='text-11px text-t-tertiary tabular-nums'>
            {available
              ? `${runningCount}/${threads.length}${pendingRequests.length ? ` · ${pendingRequests.length}` : ''}`
              : '--'}
          </span>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className='shrink-0 px-2px mt-4px'>
        {tooltipEnabled ? (
          <Tooltip content={railLabel} position='right'>
            {railContent}
          </Tooltip>
        ) : (
          railContent
        )}
      </div>
      <Drawer
        title={railLabel}
        visible={drawerVisible}
        placement='right'
        width={isMobile ? '100%' : 880}
        footer={null}
        getPopupContainer={() => document.body}
        onCancel={() => setDrawerVisible(false)}
        headerStyle={{ background: 'var(--color-bg-1)' }}
        bodyStyle={{ background: 'var(--color-bg-1)', padding: 0 }}
      >
        <div className='h-full min-h-0 flex flex-col'>
          <div className='h-48px shrink-0 px-16px flex items-center gap-10px border-b border-solid border-[var(--color-border-2)]'>
            <Tag color={available ? 'green' : 'orangered'}>
              {t(`conversation.threadCoordination.availability.${available ? 'available' : 'unavailable'}`)}
            </Tag>
            <span className='min-w-0 flex-1 truncate text-12px text-t-tertiary'>
              {overview?.availability.host ?? t('conversation.threadCoordination.hostUnavailable')}
            </span>
            <Tooltip content={t('common.refresh')}>
              <Button
                type='text'
                size='small'
                shape='circle'
                icon={<Refresh theme='outline' size='16' />}
                loading={loading}
                aria-label={t('common.refresh')}
                onClick={() => void refresh()}
              />
            </Tooltip>
          </div>

          {!available ? (
            <div className='p-20px'>
              <Alert
                type='warning'
                title={t('conversation.threadCoordination.unavailableTitle')}
                content={t('conversation.threadCoordination.errors.protocol_unavailable')}
              />
            </div>
          ) : (
            <div
              className={classNames(
                'flex-1 min-h-0 grid',
                isMobile ? 'grid-cols-1' : 'grid-cols-[280px_minmax(0,1fr)]'
              )}
            >
              <div className='min-h-0 overflow-y-auto border-r border-solid border-[var(--color-border-2)]'>
                <div className='px-14px py-10px text-12px font-[500] text-t-tertiary'>
                  {t('conversation.threadCoordination.threadList', { count: threads.length })}
                </div>
                {threads.length === 0 ? (
                  <Empty description={t('conversation.threadCoordination.noThreads')} />
                ) : (
                  threads.map((thread) => (
                    <div
                      key={thread.id}
                      data-testid={`thread-coordination-thread-${thread.id}`}
                      className={classNames(
                        'px-14px py-10px cursor-pointer border-b border-solid border-[var(--color-border-2)] transition-colors',
                        selectedThreadId === thread.id ? 'bg-fill-2' : 'hover:bg-fill-1'
                      )}
                      role='button'
                      tabIndex={0}
                      onClick={() => setSelectedThreadId(thread.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedThreadId(thread.id);
                      }}
                    >
                      <div className='flex items-center gap-8px'>
                        <span className='min-w-0 flex-1 truncate text-13px font-[500] text-t-primary'>
                          {thread.title}
                        </span>
                        <Tag size='small' color={statusColor(thread.status)}>
                          {t(`conversation.threadCoordination.status.${thread.status}`)}
                        </Tag>
                      </div>
                      <div className='mt-4px truncate text-11px text-t-tertiary'>{thread.workspace}</div>
                    </div>
                  ))
                )}
              </div>

              <div className='min-h-0 overflow-y-auto p-18px'>
                {!selectedThread ? (
                  <Empty description={t('conversation.threadCoordination.selectThread')} />
                ) : (
                  <div className='flex flex-col gap-18px'>
                    <section>
                      <div className='flex items-start gap-10px'>
                        <div className='min-w-0 flex-1'>
                          <h2 className='m-0 text-18px font-[600] leading-24px text-t-primary'>
                            {selectedThread.title}
                          </h2>
                          <p className='m-0 mt-6px text-13px leading-20px text-t-secondary'>{selectedThread.summary}</p>
                        </div>
                        <Tag color={statusColor(selectedThread.status)}>
                          {t(`conversation.threadCoordination.status.${selectedThread.status}`)}
                        </Tag>
                      </div>
                      <dl className='mt-14px mb-0 grid grid-cols-[100px_minmax(0,1fr)] gap-x-10px gap-y-6px text-12px leading-18px'>
                        <dt className='text-t-tertiary'>{t('conversation.threadCoordination.project')}</dt>
                        <dd className='m-0 break-all text-t-primary'>{selectedThread.projectId}</dd>
                        <dt className='text-t-tertiary'>{t('conversation.threadCoordination.workspace')}</dt>
                        <dd className='m-0 break-all text-t-primary'>{selectedThread.workspace}</dd>
                        <dt className='text-t-tertiary'>{t('conversation.threadCoordination.host')}</dt>
                        <dd className='m-0 text-t-primary'>{selectedThread.host}</dd>
                        <dt className='text-t-tertiary'>{t('conversation.threadCoordination.owner')}</dt>
                        <dd className='m-0 text-t-primary'>
                          {selectedThread.owner ?? t('conversation.threadCoordination.unknown')}
                        </dd>
                        <dt className='text-t-tertiary'>{t('conversation.threadCoordination.goal')}</dt>
                        <dd className='m-0 text-t-primary'>
                          {detail?.thread.goal ?? selectedThread.goal ?? t('conversation.threadCoordination.unknown')}
                        </dd>
                        <dt className='text-t-tertiary'>{t('conversation.threadCoordination.ancestry')}</dt>
                        <dd className='m-0 break-all text-t-primary'>
                          {selectedThread.parentThreadId ??
                            (selectedThread.ancestorThreadIds.join(' / ') ||
                              t('conversation.threadCoordination.topLevel'))}
                        </dd>
                      </dl>
                    </section>

                    <PendingServerRequests requests={selectedPendingRequests} onResolve={resolveServerRequest} />

                    <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
                      <div className='mb-8px text-13px font-[600] text-t-primary'>
                        {t('conversation.threadCoordination.history')}
                      </div>
                      {detailLoading ? (
                        <div className='h-80px flex items-center justify-center'>
                          <Spin />
                        </div>
                      ) : !detail || detail.history.length === 0 ? (
                        <div className='text-12px text-t-tertiary'>
                          {t('conversation.threadCoordination.noHistory')}
                        </div>
                      ) : (
                        <div className='flex flex-col gap-8px'>
                          {detail.history.slice(-8).map((item) => (
                            <div
                              key={item.id}
                              className='border-l-2 border-solid border-[var(--color-border-3)] pl-10px'
                            >
                              <div className='text-11px text-t-tertiary'>
                                {item.role} · {item.status}
                              </div>
                              <div className='mt-2px text-12px leading-18px text-t-primary line-clamp-3'>
                                {item.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
                      <div className='mb-8px text-13px font-[600] text-t-primary'>
                        {t('conversation.threadCoordination.coordinate')}
                      </div>
                      <Select
                        value={sourceThreadId ?? undefined}
                        onChange={(value) => setSourceThreadId(value)}
                        placeholder={t('conversation.threadCoordination.sourcePlaceholder')}
                        disabled={actionLoading}
                        aria-label={t('conversation.threadCoordination.sender')}
                      >
                        {threads
                          .filter((thread) => thread.id !== selectedThread.id && !thread.archived)
                          .map((thread) => (
                            <Select.Option key={thread.id} value={thread.id}>
                              {thread.title}
                            </Select.Option>
                          ))}
                      </Select>
                      <Input
                        className='mt-10px'
                        value={reason}
                        onChange={setReason}
                        placeholder={t('conversation.threadCoordination.reasonPlaceholder')}
                        disabled={actionLoading}
                      />
                      <div className='mt-10px flex flex-wrap gap-8px'>
                        {selectedThread.archived ? (
                          <Button
                            size='small'
                            icon={<Undo />}
                            disabled={!reason.trim()}
                            loading={actionLoading}
                            onClick={() => runLifecycle('unarchive')}
                          >
                            {t('conversation.history.restore')}
                          </Button>
                        ) : (
                          <>
                            <Button
                              size='small'
                              icon={<BranchOne />}
                              disabled={!reason.trim()}
                              loading={actionLoading}
                              onClick={() => runLifecycle('resume')}
                            >
                              {t('conversation.threadCoordination.resume')}
                            </Button>
                            <Button
                              size='small'
                              icon={<Fork />}
                              disabled={!reason.trim()}
                              loading={actionLoading}
                              onClick={() => runLifecycle('fork')}
                            >
                              {t('conversation.threadCoordination.fork')}
                            </Button>
                            <Button
                              size='small'
                              status='warning'
                              icon={<Inbox />}
                              disabled={!reason.trim()}
                              loading={actionLoading}
                              onClick={() => runLifecycle('archive')}
                            >
                              {t('conversation.history.archive')}
                            </Button>
                            <Button
                              size='small'
                              icon={<PreviewOpen />}
                              aria-label={t('conversation.threadCoordination.reviewChanges')}
                              disabled={!reason.trim()}
                              loading={actionLoading}
                              onClick={reviewChanges}
                            >
                              {t('conversation.threadCoordination.reviewChanges')}
                            </Button>
                          </>
                        )}
                      </div>
                      <Input.TextArea
                        className='mt-12px'
                        value={message}
                        onChange={setMessage}
                        placeholder={t('conversation.threadCoordination.messagePlaceholder')}
                        autoSize={MESSAGE_TEXTAREA_AUTO_SIZE}
                        disabled={actionLoading || selectedThread.archived}
                      />
                      <div className='mt-10px flex justify-end'>
                        <Button
                          type='primary'
                          icon={<Send />}
                          loading={actionLoading}
                          disabled={
                            selectedThread.archived ||
                            !sourceThreadId ||
                            sourceThreadId === selectedThread.id ||
                            !reason.trim() ||
                            !message.trim()
                          }
                          onClick={deliver}
                        >
                          {t('common.send')}
                        </Button>
                      </div>
                    </section>

                    <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
                      <div className='mb-8px text-13px font-[600] text-t-primary'>
                        {t('conversation.threadCoordination.audit')}
                      </div>
                      {overview?.audit.length ? (
                        <div className='flex flex-col gap-8px'>
                          {overview.audit.map((event) => (
                            <div
                              key={event.id}
                              className='py-8px border-b border-solid border-[var(--color-border-2)] last:border-b-0'
                            >
                              <div className='flex items-center gap-6px text-12px'>
                                <span className='font-[500] text-t-primary'>{event.senderLabel}</span>
                                <span className='text-t-tertiary'>→</span>
                                <span className='font-[500] text-t-primary'>{event.receiverLabel}</span>
                                <Tag
                                  size='small'
                                  color={
                                    event.result === 'accepted'
                                      ? 'green'
                                      : event.result === 'rejected'
                                        ? 'orangered'
                                        : 'red'
                                  }
                                >
                                  {t(`conversation.threadCoordination.auditResult.${event.result}`)}
                                </Tag>
                              </div>
                              <div className='mt-3px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.reason')}: {event.reason}
                              </div>
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.messageSummary')}:{' '}
                                {event.messageSummary ?? t('conversation.threadCoordination.notApplicable')}
                              </div>
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.protocolMethod')}:{' '}
                                {event.protocolMethod ?? t('conversation.threadCoordination.notApplicable')}
                              </div>
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.permissionDecision')}:{' '}
                                {event.permissionDecision.decision}
                                {' · '}
                                {event.permissionDecision.reason}
                              </div>
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.writeSetDecision')}:{' '}
                                {event.writeSetDecision.decision}
                                {' · '}
                                {event.writeSetDecision.reason}
                              </div>
                              {event.advisories?.length > 0 && (
                                <div className='mt-2px text-11px text-t-tertiary'>
                                  {t('conversation.threadCoordination.advisories')}:{' '}
                                  {event.advisories
                                    .map((advisory) => t(`conversation.threadCoordination.advisory.${advisory}`))
                                    .join(', ')}
                                </div>
                              )}
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.statusTransition')}:{' '}
                                {event.threadStatusBefore ?? t('conversation.threadCoordination.unknown')} →{' '}
                                {event.threadStatusAfter ?? t('conversation.threadCoordination.unknown')}
                              </div>
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.result')}: {event.resultMessage}
                              </div>
                              <div className='mt-2px text-11px text-t-tertiary'>
                                {t('conversation.threadCoordination.timestamp')}: {event.observedAt} →{' '}
                                {event.completedAt}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className='text-12px text-t-tertiary'>{t('conversation.threadCoordination.noAudit')}</div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
};

export default ThreadCoordinationSection;

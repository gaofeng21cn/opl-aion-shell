import type { BadgeProps } from '@arco-design/web-react';
import { Badge, Message, Spin } from '@arco-design/web-react';
import { Checklist, Down, Open, Right, Robot } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type {
  NormalizedSubagentActivity,
  NormalizedToolCall,
  NormalizedToolStatus,
  ToolMessage,
} from '@/common/chat/normalizeToolCall';
import {
  hasRunningToolMessages,
  normalizeSubagentActivities,
  normalizeToolMessages,
} from '@/common/chat/normalizeToolCall';
import {
  canonicalCodexThreadId,
  projectCanonicalCodexThread,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { emitter } from '@/renderer/utils/emitter';
import './MessageToolGroupSummary.css';

const SUBAGENT_DETAIL_FIELDS = [
  ['prompt', 'messages.subagents.prompt'],
  ['message', 'messages.subagents.message'],
  ['result', 'messages.subagents.result'],
  ['model', 'messages.subagents.model'],
  ['reasoningEffort', 'messages.subagents.reasoningEffort'],
  ['path', 'messages.subagents.path'],
  ['threadId', 'messages.subagents.threadId'],
] as const satisfies ReadonlyArray<readonly [keyof NormalizedSubagentActivity, `messages.subagents.${string}`]>;

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

const findCanonicalConversationProjection = async (threadId: string) => {
  try {
    const direct = await getConversationOrNull(threadId);
    if (canonicalCodexThreadId(direct) === threadId) return direct;
  } catch (error) {
    console.warn('Could not read the direct Codex task projection; falling back to canonical lookup:', error);
  }

  try {
    const cached = await ipcBridge.database.getUserConversations.invoke({ limit: 10000 });
    return cached.items.find((conversation) => canonicalCodexThreadId(conversation) === threadId) ?? null;
  } catch (error) {
    console.warn('Could not search cached Codex task projections; falling back to App Server:', error);
    return null;
  }
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = fullItem ?? item;
  const hasDetail = displayItem.input || displayItem.output || item.truncated;

  const loadFullItem = async () => {
    if (!item.truncated || fullItem || loadingFull || !item.conversationId || !item.messageId) return;
    setLoadingFull(true);
    setLoadError(false);
    try {
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id: item.conversationId,
        message_id: item.messageId,
      });
      const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
      if (next) setFullItem(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFull(false);
    }
  };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadFullItem();
  };

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge status={statusToBadge(item.status)} className={item.status === 'running' ? 'badge-breathing' : ''} />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? toggleExpanded : undefined}
        >
          <span className='font-medium text-13px'>{displayItem.name}</span>
          {displayItem.description && displayItem.description !== displayItem.name && (
            <span className='m-l-4px opacity-80 text-13px'>{displayItem.description}</span>
          )}
        </span>
        {hasDetail && (
          <span className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors' onClick={toggleExpanded}>
            {expanded ? <Down theme='outline' size='12' /> : <Right theme='outline' size='12' />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {loadingFull && <div className='tool-detail-label'>{t('messages.toolSteps.loading')}</div>}
          {loadError && <div className='tool-detail-label'>{t('messages.toolSteps.loadFailed')}</div>}
          {displayItem.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('messages.toolSteps.input')}</div>
              <pre className='tool-detail-content'>{displayItem.input}</pre>
            </div>
          )}
          {displayItem.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('messages.toolSteps.output')}</div>
              <pre className='tool-detail-content'>{displayItem.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SubagentActivityItem: React.FC<{
  item: NormalizedSubagentActivity;
  opening: boolean;
  onOpen: (item: NormalizedSubagentActivity) => void;
}> = ({ item, opening, onOpen }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const stateLabel = t(item.status === 'active' ? 'messages.subagents.activeState' : 'messages.subagents.doneState');
  const details = SUBAGENT_DETAIL_FIELDS.map(([key, label]) => ({ label, value: item[key] })).filter(
    (entry): entry is { label: (typeof SUBAGENT_DETAIL_FIELDS)[number][1]; value: string } =>
      typeof entry.value === 'string' && entry.value.length > 0
  );

  return (
    <div className='subagent-activity__item'>
      <button
        type='button'
        className='subagent-activity__row'
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${item.name} ${stateLabel}`}
      >
        <Badge
          status={item.status === 'active' ? 'processing' : 'success'}
          className={item.status === 'active' ? 'badge-breathing' : ''}
        />
        <span className='subagent-activity__name'>{item.name}</span>
        <span className='subagent-activity__state'>{stateLabel}</span>
        <span className={`tool-group-summary__arrow${expanded ? ' tool-group-summary__arrow--open' : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </button>
      {expanded && (
        <div className='subagent-activity__detail'>
          {details.map(({ label, value }) => (
            <div className='tool-detail-section' key={label}>
              <div className='tool-detail-label'>{t(label)}</div>
              <div className='subagent-activity__detail-value'>{value}</div>
            </div>
          ))}
          <button type='button' className='subagent-activity__open' onClick={() => onOpen(item)} disabled={opening}>
            <Open theme='outline' size='13' />
            <span>{t(opening ? 'messages.subagents.openingTask' : 'messages.subagents.openTask')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

const SubagentActivityGroup: React.FC<{
  status: 'active' | 'done';
  items: NormalizedSubagentActivity[];
  openingThreadId: string | null;
  onOpen: (item: NormalizedSubagentActivity) => void;
}> = ({ status, items, openingThreadId, onOpen }) => {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <div className='subagent-activity__group'>
      <div className='subagent-activity__group-label'>
        {t(status === 'active' ? 'messages.subagents.active' : 'messages.subagents.done', { count: items.length })}
      </div>
      {items.map((item) => (
        <SubagentActivityItem
          key={item.threadId}
          item={item}
          opening={openingThreadId === item.threadId}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
};

const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[] }> = ({ messages }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [openingThreadId, setOpeningThreadId] = useState<string | null>(null);
  const subagents = useMemo(() => normalizeSubagentActivities(messages), [messages]);
  const subagentSourceToolKeys = useMemo(() => new Set(subagents.flatMap((item) => item.sourceToolKeys)), [subagents]);
  const tools = useMemo(
    () => normalizeToolMessages(messages).filter((item) => !subagentSourceToolKeys.has(item.key)),
    [messages, subagentSourceToolKeys]
  );
  const activeSubagents = useMemo(() => subagents.filter((item) => item.status === 'active'), [subagents]);
  const doneSubagents = useMemo(() => subagents.filter((item) => item.status === 'done'), [subagents]);
  const hasRunning = hasRunningToolMessages(messages) || activeSubagents.length > 0;
  const [showMore, setShowMore] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  const openSubagentTask = useCallback(
    (item: NormalizedSubagentActivity) => {
      if (openingThreadId) return;
      setOpeningThreadId(item.threadId);
      void (async () => {
        try {
          const existing = await findCanonicalConversationProjection(item.threadId);
          let conversation = existing && canonicalCodexThreadId(existing) === item.threadId ? existing : null;
          if (!conversation) {
            const detail = await ipcBridge.codexThreads.read.invoke({ threadId: item.threadId });
            const projection = projectCanonicalCodexThread(detail.thread, undefined, { materialized: true });
            conversation = await ipcBridge.conversation.createWithConversation.invoke({ conversation: projection });
            emitter.emit('chat.history.refresh');
          }
          await navigate(`/conversation/${conversation.id}`);
        } catch (error) {
          console.error('Failed to open canonical Codex subagent task:', error);
          Message.error(t('messages.subagents.openFailed'));
        } finally {
          setOpeningThreadId(null);
        }
      })();
    },
    [navigate, openingThreadId, t]
  );

  const activityCount = tools.length + subagents.length;

  return (
    <div className='tool-group-summary'>
      <button
        type='button'
        className='tool-group-summary__header'
        onClick={() => setShowMore(!showMore)}
        aria-expanded={showMore}
      >
        <span className='tool-group-summary__icon'>
          {hasRunning ? <Spin size={12} /> : <Checklist theme='outline' size='14' />}
        </span>
        <span className='tool-group-summary__label'>
          {t(hasRunning ? 'messages.toolSteps.running' : 'messages.toolSteps.completed', { count: activityCount })}
        </span>
        <span className={`tool-group-summary__arrow${showMore ? ' tool-group-summary__arrow--open' : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </button>
      {showMore && (
        <div className='tool-group-summary__body'>
          {subagents.length > 0 && (
            <div className='subagent-activity'>
              <div className='subagent-activity__title'>
                <Robot theme='outline' size='14' />
                <span>{t('messages.subagents.title')}</span>
              </div>
              <SubagentActivityGroup
                status='active'
                items={activeSubagents}
                openingThreadId={openingThreadId}
                onOpen={openSubagentTask}
              />
              <SubagentActivityGroup
                status='done'
                items={doneSubagents}
                openingThreadId={openingThreadId}
                onOpen={openSubagentTask}
              />
            </div>
          )}
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);

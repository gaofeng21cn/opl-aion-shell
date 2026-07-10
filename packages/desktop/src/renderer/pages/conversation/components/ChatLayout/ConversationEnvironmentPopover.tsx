import type { TChatConversation } from '@/common/config/storage';
import type { ConversationCurrentTask } from '@/renderer/pages/conversation/runtime/CurrentTaskAwareness';
import { Button, Popover } from '@arco-design/web-react';
import { Down, Info } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => Boolean(text(entry))) : [];

const ConversationEnvironmentPopover: React.FC<{
  conversation?: TChatConversation;
  currentTask?: ConversationCurrentTask | null;
}> = ({ conversation, currentTask }) => {
  const { t } = useTranslation();
  const summary = useMemo(() => {
    const extra = (conversation?.extra ?? {}) as Record<string, unknown>;
    const task = (currentTask ?? {}) as Record<string, unknown>;
    const subtasks = Array.isArray(task.subtasks)
      ? task.subtasks.length
      : typeof task.subtask_count === 'number'
        ? task.subtask_count
        : undefined;
    const sources = Array.from(
      new Set([...stringList(currentTask?.resource_source_refs), ...stringList(task.source_refs)])
    );

    return {
      workspace: text(extra.workspace),
      locality:
        !conversation?.source || conversation.source === 'aionui'
          ? t('conversation.environment.local')
          : conversation.source,
      git: text(extra.git_branch) ?? text(extra.branch_name) ?? text(extra.branch),
      subtasks,
      sources,
    };
  }, [conversation, currentTask, t]);
  const unavailable = t('conversation.environment.unavailable');

  const content = (
    <div className='conversation-environment-popover' data-testid='conversation-environment-popover'>
      <div className='conversation-environment-popover__row'>
        <span>{t('conversation.environment.workspace')}</span>
        <b>{summary.workspace ?? unavailable}</b>
      </div>
      <div className='conversation-environment-popover__row'>
        <span>{t('conversation.environment.location')}</span>
        <b>{summary.locality}</b>
      </div>
      <div className='conversation-environment-popover__row'>
        <span>{t('conversation.environment.git')}</span>
        <b>{summary.git ?? unavailable}</b>
      </div>
      <div className='conversation-environment-popover__row'>
        <span>{t('conversation.environment.subtasks')}</span>
        <b>{summary.subtasks ?? unavailable}</b>
      </div>
      <div className='conversation-environment-popover__row'>
        <span>{t('conversation.environment.sources')}</span>
        <b>{summary.sources.length ? summary.sources.join(', ') : unavailable}</b>
      </div>
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

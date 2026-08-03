/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationArtifact } from '@/common/adapter/ipcBridge';
import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';
import { CHAT_MESSAGE_JUMP_EVENT, type ChatMessageJumpDetail } from '@/renderer/utils/chat/chatMinimapEvents';
import { Image } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import MessageAcpPermission from '@renderer/pages/conversation/Messages/acp/MessageAcpPermission';
import MessagePermission from './components/MessagePermission';
import MessageAcpToolCall from '@renderer/pages/conversation/Messages/acp/MessageAcpToolCall';
import classNames from 'classnames';
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Virtuoso, type Components, type ItemProps, type ListProps, type VirtuosoHandle } from 'react-virtuoso';
import { uuid } from '@renderer/utils/common';
import './messages.css';
import HOC from '@renderer/utils/ui/HOC';
import type { FileChangeInfo } from './MessageFileChanges';
import MessageFileChanges, { parseDiff } from './MessageFileChanges';
import { useConversationArtifacts } from './artifacts';
import { useMessageList, useMessageListLoading } from './hooks';
import MessageAgentStatus from './components/MessageAgentStatus';
import MessagePlan from './components/MessagePlan';
import MessageTips from './components/MessageTips';
import MessageToolCall from './components/MessageToolCall';
import MessageToolGroup from './components/MessageToolGroup';
import MessageToolGroupSummary from './components/MessageToolGroupSummary';
import MessageCronTrigger from './components/MessageCronTrigger';
import MessageSkillSuggest from './components/MessageSkillSuggest';
import MessageText from './components/MessageText';
import MessageThinking from './components/MessageThinking';
import type { WriteFileResult } from './types';
import { useAutoScroll } from './useAutoScroll';
import { useAutoPreviewOfficeFiles } from '@/renderer/hooks/file/useAutoPreviewOfficeFiles';
import SelectionReplyButton from './components/SelectionReplyButton';

type IMessageVO =
  | TMessage
  | { type: 'file_summary'; id: string; diffs: FileChangeInfo[]; sourceMessageIds: string[]; created_at: number }
  | {
      type: 'tool_summary';
      id: string;
      messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>;
      sourceMessageIds: string[];
      created_at: number;
    };
type IArtifactVO = { type: 'artifact'; id: string; artifact: IConversationArtifact; created_at: number };
type IProcessedItem = IMessageVO | IArtifactVO;

type ConversationLocationState = {
  targetMessageId?: string;
  fromConversationSearch?: boolean;
};

const getProcessedItemSourceMessageIds = (item: IProcessedItem): string[] => {
  if ('type' in item && item.type === 'artifact') {
    return [item.id];
  }
  if ('type' in item && item.type === 'tool_summary') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'file_summary') {
    return item.sourceMessageIds;
  }
  return 'id' in item ? [item.id] : [];
};

const matchesTargetMessage = (item: IProcessedItem, targetMessageId?: string): boolean => {
  if (!targetMessageId) {
    return false;
  }
  return getProcessedItemSourceMessageIds(item).includes(targetMessageId);
};

const getProcessedItemAnchorId = (item: IProcessedItem): string => {
  const sourceIds = getProcessedItemSourceMessageIds(item);
  return sourceIds[0] || ('id' in item ? item.id : uuid());
};

const getProcessedItemCreatedAt = (item: IProcessedItem): number => {
  if ('type' in item && ['file_summary', 'tool_summary', 'artifact'].includes(item.type)) {
    return item.created_at;
  }
  return item.created_at ?? 0;
};

const highlightStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-aou-1)',
  boxShadow: '0 0 0 1px var(--color-aou-6-brand) inset',
  borderRadius: '12px',
};

const getUnhandledMessageType = (_message: never): string => 'unknown';

type MessageListVirtuosoContext = {
  emptySlot?: React.ReactNode;
  timelineHeaderSlot?: React.ReactNode;
  handleContentRef: (ref: HTMLDivElement | null) => void;
};

type VirtualizedListProps = ListProps & { context: MessageListVirtuosoContext };
type VirtualizedItemProps = ItemProps<IProcessedItem> & { context: MessageListVirtuosoContext };

const VirtualizedMessageItem = React.forwardRef<HTMLDivElement, VirtualizedItemProps>(
  ({ context: _context, item: _item, style, ...props }, forwardedRef) => (
    <div {...props} ref={forwardedRef} style={{ ...style, display: 'flow-root' }} />
  )
);
VirtualizedMessageItem.displayName = 'VirtualizedMessageItem';

const VirtualizedMessageList = React.forwardRef<HTMLDivElement, VirtualizedListProps>(
  ({ context, style, ...props }, forwardedRef) => (
    <div
      {...props}
      ref={(element) => {
        context.handleContentRef(element);
        if (typeof forwardedRef === 'function') forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
      }}
      data-testid='message-list-content'
      style={{ ...style, overflowAnchor: 'none' }}
    />
  )
);
VirtualizedMessageList.displayName = 'VirtualizedMessageList';

const VirtualizedMessageListHeader: React.FC<{ context: MessageListVirtuosoContext }> = ({ context }) => (
  <>
    {context.timelineHeaderSlot}
    <div className='h-10px' />
  </>
);

const VirtualizedMessageListFooter: React.FC = () => <div className='h-20px' />;

const VirtualizedMessageListEmpty: React.FC<{ context: MessageListVirtuosoContext }> = ({ context }) =>
  context.emptySlot ? <div className='min-h-240px flex items-center justify-center'>{context.emptySlot}</div> : null;

const virtualizedMessageListComponents: Components<IProcessedItem, MessageListVirtuosoContext> = {
  EmptyPlaceholder: VirtualizedMessageListEmpty,
  Footer: VirtualizedMessageListFooter,
  Header: VirtualizedMessageListHeader,
  Item: VirtualizedMessageItem,
  List: VirtualizedMessageList,
};

// Image preview context
export const ImagePreviewContext = createContext<{ inPreviewGroup: boolean }>({ inPreviewGroup: false });

const MessageListSkeleton: React.FC = () => {
  const rows = [
    { width: '100%', lines: [72, 58, 64] },
    { width: '82%', lines: [54, 48] },
    { width: '100%', lines: [68, 76, 44] },
    { width: '100%', lines: [46, 52] },
    { width: '78%', lines: [60, 42, 36] },
    { width: '100%', lines: [74, 62] },
    { width: '84%', lines: [52, 66] },
    { width: '100%', lines: [64, 56, 40] },
    { width: '80%', lines: [58, 46] },
  ] as const;

  return (
    <div
      className='flex-1 h-full overflow-y-auto pb-10px box-border'
      data-testid='message-list-skeleton'
      style={{ minHeight: '100%' }}
    >
      <div className='min-h-full flex flex-col justify-between py-10px box-border'>
        {rows.map((row, index) => (
          <div
            key={index}
            className='w-full min-w-0 flex items-start message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'
          >
            <div
              className='min-w-0 py-4px'
              style={{
                width: row.width,
                maxWidth: '100%',
              }}
              data-testid='message-list-skeleton-lines'
            >
              <div className='flex flex-col gap-8px'>
                {row.lines.map((width, lineIndex) => (
                  <div
                    key={lineIndex}
                    className='h-10px rd-999px'
                    style={{
                      width: `${width}%`,
                      background:
                        'linear-gradient(90deg, var(--color-fill-2) 0%, var(--color-fill-3) 50%, var(--color-fill-2) 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'message-list-skeleton-shimmer 1.4s ease-in-out infinite',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes message-list-skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

const MessageItem: React.FC<{ message: TMessage; highlighted?: boolean }> = React.memo(
  HOC((props) => {
    const { message, highlighted } = props as { message: TMessage; highlighted?: boolean };
    return (
      <div
        id={`message-${message.id}`}
        data-testid={`message-${message.type}-${message.position}`}
        data-message-type={message.type}
        data-message-position={message.position}
        className={classNames(
          'min-w-0 flex items-start message-item [&>div]:max-w-full px-8px m-t-10px max-w-full md:max-w-780px mx-auto',
          message.type,
          {
            'justify-center': message.position === 'center',
            'justify-end': message.position === 'right',
            'justify-start': message.position === 'left',
          }
        )}
        style={highlighted ? highlightStyle : undefined}
      >
        {props.children}
      </div>
    );
  })(({ message }) => {
    const { t } = useTranslation();
    switch (message.type) {
      case 'text':
        return <MessageText message={message}></MessageText>;
      case 'tips':
        return <MessageTips message={message}></MessageTips>;
      case 'tool_call':
        return <MessageToolCall message={message}></MessageToolCall>;
      case 'tool_group':
        return <MessageToolGroup message={message}></MessageToolGroup>;
      case 'agent_status':
        return <MessageAgentStatus message={message}></MessageAgentStatus>;
      case 'permission':
        return <MessagePermission message={message}></MessagePermission>;
      case 'acp_permission':
        return <MessageAcpPermission message={message}></MessageAcpPermission>;
      case 'acp_tool_call':
        return <MessageAcpToolCall message={message}></MessageAcpToolCall>;
      case 'plan':
        return <MessagePlan message={message}></MessagePlan>;
      case 'thinking':
        return <MessageThinking message={message}></MessageThinking>;
      case 'available_commands':
        return null;
      default:
        return <div>{t('messages.unknownMessageType', { type: getUnhandledMessageType(message) })}</div>;
    }
  }),
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.position === next.message.position &&
    prev.message.type === next.message.type &&
    prev.highlighted === next.highlighted
);

const MessageList: React.FC<{
  className?: string;
  emptySlot?: React.ReactNode;
  timelineHeaderSlot?: React.ReactNode;
}> = ({ emptySlot, timelineHeaderSlot }) => {
  const list = useMessageList();
  const isMessageListLoading = useMessageListLoading();
  const artifacts = useConversationArtifacts();
  const conversationContext = useConversationContextSafe();
  useAutoPreviewOfficeFiles(conversationContext);
  const { t } = useTranslation();
  const location = useLocation();
  const locationState = (location.state || {}) as ConversationLocationState;
  const targetMessageId = locationState.targetMessageId;
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>();
  const handledTargetKeyRef = useRef<string>('');
  const virtualListRef = useRef<VirtuosoHandle>(null);

  // Pre-process message list to group tool outputs into summary cards
  const processedList = useMemo(() => {
    const result: Array<IMessageVO> = [];
    let diffsChanges: FileChangeInfo[] = [];
    let diffsSourceMessageIds: string[] = [];
    let toolList: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> = [];
    let toolSourceMessageIds: string[] = [];

    const pushFileDffChanges = (changes: FileChangeInfo, sourceMessageId: string, created_at: number) => {
      if (!diffsChanges.length) {
        diffsSourceMessageIds = [];
        result.push({
          type: 'file_summary',
          id: `summary-${sourceMessageId}`,
          diffs: diffsChanges,
          sourceMessageIds: diffsSourceMessageIds,
          created_at,
        });
      }
      diffsChanges.push(changes);
      diffsSourceMessageIds.push(sourceMessageId);
      toolList = [];
      toolSourceMessageIds = [];
    };
    const pushToolList = (message: IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall) => {
      if (!toolList.length) {
        toolSourceMessageIds = [];
        result.push({
          type: 'tool_summary',
          id: `tool-summary-${message.id}`,
          messages: toolList,
          sourceMessageIds: toolSourceMessageIds,
          created_at: message.created_at ?? 0,
        });
      }
      toolList.push(message);
      toolSourceMessageIds.push(message.id);
      diffsChanges = [];
      diffsSourceMessageIds = [];
    };

    for (let i = 0, len = list.length; i < len; i++) {
      const message = list[i];
      // Skip hidden and available_commands messages
      if (message.hidden) continue;
      if (message.type === 'available_commands') continue;
      if (message.type === 'tool_group') {
        if (message.content.length === 1) {
          const writeFileResults = message.content
            .filter(
              (item) =>
                item.name === 'WriteFile' &&
                item.result_display &&
                typeof item.result_display === 'object' &&
                'file_diff' in item.result_display
            )
            .map((item) => item.result_display as WriteFileResult);
          if (writeFileResults.length && writeFileResults[0].file_diff) {
            pushFileDffChanges(
              parseDiff(writeFileResults[0].file_diff, writeFileResults[0].file_name),
              message.id,
              message.created_at ?? 0
            );
            continue;
          }
        }
        pushToolList(message);
        continue;
      }
      if (message.type === 'acp_tool_call') {
        pushToolList(message);
        continue;
      }
      if (message.type === 'tool_call') {
        pushToolList(message);
        continue;
      }
      toolList = [];
      toolSourceMessageIds = [];
      diffsChanges = [];
      diffsSourceMessageIds = [];
      result.push(message);
    }
    const visibleArtifacts = artifacts
      .filter((artifact) => {
        if (artifact.kind === 'cron_trigger') return artifact.status === 'active';
        if (artifact.kind === 'skill_suggest') return artifact.status === 'pending';
        return false;
      })
      .map<IArtifactVO>((artifact) => ({
        type: 'artifact',
        id: artifact.id,
        artifact,
        created_at: artifact.created_at,
      }));

    return [...result, ...visibleArtifacts].toSorted(
      (a, b) => getProcessedItemCreatedAt(a) - getProcessedItemCreatedAt(b)
    );
  }, [artifacts, list]);

  // Use auto-scroll hook
  const {
    handleScrollerRef,
    handleContentRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    showScrollButton,
    scrollToBottom,
    scrollToIndex,
    handleTotalListHeightChanged,
    hideScrollButton,
  } = useAutoScroll({
    messages: list,
    itemCount: processedList.length,
    virtualListRef,
  });

  const handleVirtuosoScrollerRef = React.useCallback(
    (ref: HTMLElement | Window | null) => handleScrollerRef(ref instanceof HTMLDivElement ? ref : null),
    [handleScrollerRef]
  );

  const virtuosoContext = useMemo<MessageListVirtuosoContext>(
    () => ({ emptySlot, handleContentRef, timelineHeaderSlot }),
    [emptySlot, handleContentRef, timelineHeaderSlot]
  );

  useEffect(() => {
    if (!targetMessageId || processedList.length === 0) {
      return;
    }

    const targetKey = `${location.key}:${targetMessageId}`;
    if (handledTargetKeyRef.current === targetKey) {
      return;
    }

    const targetIndex = processedList.findIndex((item) => matchesTargetMessage(item, targetMessageId));
    if (targetIndex === -1) {
      return;
    }

    handledTargetKeyRef.current = targetKey;
    setHighlightedMessageId(targetMessageId);
    hideScrollButton();

    scrollToIndex(targetIndex, {
      behavior: 'smooth',
      align: 'center',
    });

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === targetMessageId ? undefined : current));
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [hideScrollButton, location.key, processedList, scrollToIndex, targetMessageId]);

  useEffect(() => {
    const handleMessageJump = (event: Event) => {
      const detail = (event as CustomEvent<ChatMessageJumpDetail>).detail;
      if (!detail || !detail.conversation_id) return;
      if (!conversationContext?.conversation_id || detail.conversation_id !== conversationContext.conversation_id)
        return;

      const targetIndex = processedList.findIndex((item) => {
        if (
          (item as { type?: string }).type === 'file_summary' ||
          (item as { type?: string }).type === 'tool_summary' ||
          (item as { type?: string }).type === 'artifact'
        ) {
          return false;
        }
        const message = item as TMessage;
        if (detail.messageId && message.id === detail.messageId) return true;
        if (detail.msgId && message.msg_id === detail.msgId) return true;
        return false;
      });
      if (targetIndex < 0) return;

      hideScrollButton();
      scrollToIndex(targetIndex, {
        align: detail.align || 'start',
        behavior: detail.behavior || 'smooth',
      });
    };

    window.addEventListener(CHAT_MESSAGE_JUMP_EVENT, handleMessageJump);
    return () => {
      window.removeEventListener(CHAT_MESSAGE_JUMP_EVENT, handleMessageJump);
    };
  }, [conversationContext?.conversation_id, hideScrollButton, processedList, scrollToIndex]);

  // Click scroll button
  const handleScrollButtonClick = () => {
    hideScrollButton();
    scrollToBottom('smooth');
  };

  const renderItem = (_index: number, item: (typeof processedList)[0]) => {
    const highlighted = matchesTargetMessage(item, highlightedMessageId);
    if ('type' in item && item.type === 'artifact') {
      return (
        <div
          key={item.id}
          id={`message-${getProcessedItemAnchorId(item)}`}
          data-conversation-artifact-kind={item.artifact.kind}
          data-testid={`conversation-artifact-${item.artifact.kind}`}
          className='min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'
          style={highlighted ? highlightStyle : undefined}
        >
          {item.artifact.kind === 'cron_trigger' ? (
            <MessageCronTrigger artifact={item.artifact} />
          ) : (
            <MessageSkillSuggest artifact={item.artifact} />
          )}
        </div>
      );
    }
    if ('type' in item && ['file_summary', 'tool_summary'].includes(item.type)) {
      return (
        <div
          key={item.id}
          id={`message-${getProcessedItemAnchorId(item)}`}
          className={'min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto ' + item.type}
          style={highlighted ? highlightStyle : undefined}
        >
          {item.type === 'file_summary' && <MessageFileChanges diffsChanges={item.diffs} />}
          {item.type === 'tool_summary' && <MessageToolGroupSummary messages={item.messages}></MessageToolGroupSummary>}
        </div>
      );
    }
    return <MessageItem message={item as TMessage} key={(item as TMessage).id} highlighted={highlighted}></MessageItem>;
  };

  if (processedList.length === 0 && isMessageListLoading) {
    return <MessageListSkeleton />;
  }

  if (processedList.length === 0 && emptySlot && !timelineHeaderSlot) {
    return <div className='relative flex-1 h-full flex items-center justify-center'>{emptySlot}</div>;
  }

  return (
    <div className='relative flex-1 h-full'>
      {/* Use PreviewGroup to wrap all messages for cross-message image preview */}
      <Image.PreviewGroup actionsLayout={['zoomIn', 'zoomOut', 'originalSize', 'rotateLeft', 'rotateRight']}>
        <ImagePreviewContext.Provider value={{ inPreviewGroup: true }}>
          <Virtuoso<IProcessedItem, MessageListVirtuosoContext>
            ref={virtualListRef}
            data={processedList}
            data-testid='message-list-scroller'
            context={virtuosoContext}
            components={virtualizedMessageListComponents}
            computeItemKey={(_index, item) => getProcessedItemAnchorId(item)}
            itemContent={renderItem}
            alignToBottom
            defaultItemHeight={96}
            increaseViewportBy={{ top: 320, bottom: 480 }}
            minOverscanItemCount={{ top: 2, bottom: 2 }}
            scrollerRef={handleVirtuosoScrollerRef}
            totalListHeightChanged={handleTotalListHeightChanged}
            // Break out of the parent's 20px horizontal padding so the scrollbar hugs the
            // window edge, while re-applying that padding inside to keep message content inset.
            className='flex-1 h-full overflow-y-auto pb-10px box-border -mx-20px px-20px'
            style={{ height: '100%', overflowAnchor: 'none' }}
            onPointerDown={handlePointerDown}
            onScroll={handleScroll}
            onWheel={handleWheel}
          />
        </ImagePreviewContext.Provider>
      </Image.PreviewGroup>

      {showScrollButton && (
        <>
          {/* Gradient mask */}
          <div className='absolute bottom-0 left-0 right-0 h-100px pointer-events-none' />
          {/* Scroll button */}
          <div className='absolute bottom-20px left-50% transform -translate-x-50% z-100'>
            <div
              className='flex items-center justify-center w-40px h-40px rd-full bg-base shadow-lg cursor-pointer hover:bg-1 transition-all hover:scale-110 border-1 border-solid border-3'
              onClick={handleScrollButtonClick}
              title={t('messages.scrollToBottom')}
              style={{ lineHeight: 0 }}
            >
              <Down theme='filled' size='20' fill={iconColors.secondary} style={{ display: 'block' }} />
            </div>
          </div>
        </>
      )}

      <SelectionReplyButton messages={list} />
    </div>
  );
};

export default MessageList;

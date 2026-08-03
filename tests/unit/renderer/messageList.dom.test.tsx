/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type PropsWithChildren } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import type { IMessageText } from '@/common/chat/chatLib';
import { MessageListLoadingProvider, MessageListProvider } from '@/renderer/pages/conversation/Messages/hooks';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';

const messageListMocks = vi.hoisted(() => ({
  locationState: {} as { targetMessageId?: string },
  scrollToIndex: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    key: 'location-key',
    state: messageListMocks.locationState,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Image: {
    PreviewGroup: ({ children }: PropsWithChildren) => <div data-testid='image-preview-group'>{children}</div>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => null,
}));

vi.mock('@/renderer/hooks/file/useAutoPreviewOfficeFiles', () => ({
  useAutoPreviewOfficeFiles: () => {},
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  useConversationArtifacts: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    handleScrollerRef: () => {},
    handleContentRef: () => {},
    handleScroll: () => {},
    handleWheel: () => {},
    handlePointerDown: () => {},
    showScrollButton: false,
    scrollToBottom: () => {},
    scrollToIndex: messageListMocks.scrollToIndex,
    handleTotalListHeightChanged: () => {},
    hideScrollButton: () => {},
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageText', () => ({
  default: ({ message }: { message: IMessageText }) => <div>{message.content.content}</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageTips', () => ({
  default: () => <div>tips</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolCall', () => ({
  default: () => <div>tool_call</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroup', () => ({
  default: () => <div>tool_group</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageAgentStatus', () => ({
  default: () => <div>agent_status</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePermission', () => ({
  default: () => <div>permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpPermission', () => ({
  default: () => <div>acp_permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall', () => ({
  default: () => <div>acp_tool_call</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePlan', () => ({
  default: () => <div>plan</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageThinking', () => ({
  default: () => <div>thinking</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronTrigger', () => ({
  default: () => <div>cron_trigger</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageSkillSuggest', () => ({
  default: () => <div>skill_suggest</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary', () => ({
  default: () => <div>tool_summary</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/MessageFileChanges', () => ({
  __esModule: true,
  default: () => <div>file_changes</div>,
  parseDiff: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/SelectionReplyButton', () => ({
  default: () => null,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>down</span>,
}));

function createTextMessage(index = 1): IMessageText {
  return {
    id: `message-${index}`,
    msg_id: `msg-${index}`,
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'left',
    content: {
      content: `streaming reply ${index}`,
    },
    created_at: index,
  };
}

function Wrapper({
  children,
  messages = [createTextMessage()],
  loading = false,
}: PropsWithChildren<{ messages?: IMessageText[]; loading?: boolean }>): JSX.Element {
  return (
    <VirtuosoMockContext.Provider value={{ viewportHeight: 640, itemHeight: 96 }}>
      <MessageListLoadingProvider value={loading}>
        <MessageListProvider value={messages}>{children}</MessageListProvider>
      </MessageListLoadingProvider>
    </VirtuosoMockContext.Provider>
  );
}

describe('MessageList', () => {
  beforeEach(() => {
    messageListMocks.locationState = {};
    messageListMocks.scrollToIndex.mockReset();
  });

  it('contains message row margins inside the virtualized measurement boundary', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    expect(screen.getByTestId('message-list-scroller')).toBeInTheDocument();
    expect(screen.getByTestId('message-list-content')).toBeInTheDocument();

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('m-t-10px');
    expect(messageRow.className).not.toContain('pt-10px');
    expect(messageRow.closest<HTMLElement>('[data-item-index]')).toHaveStyle({ display: 'flow-root' });
  });

  it('keeps the image preview group mounted around the virtualized scroller', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    expect(screen.getByTestId('image-preview-group')).toContainElement(screen.getByTestId('message-list-scroller'));
  });

  it('renders the current task summary inside the timeline scroller', () => {
    render(<MessageList timelineHeaderSlot={<div data-testid='timeline-task-summary'>Current task</div>} />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    const scroller = screen.getByTestId('message-list-scroller');
    const summary = screen.getByTestId('timeline-task-summary');
    expect(scroller).toContainElement(summary);
    expect(screen.getByTestId('message-list-content')).toBeInTheDocument();
  });

  it('keeps the rendered DOM bounded for a long conversation', async () => {
    const messages = Array.from({ length: 1000 }, (_, index) => createTextMessage(index));

    render(
      <VirtuosoMockContext.Provider value={{ viewportHeight: 320, itemHeight: 64 }}>
        <MessageList />
      </VirtuosoMockContext.Provider>,
      {
        wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
      }
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('message-text-left').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByTestId('message-text-left').length).toBeLessThan(40);
  });

  it('jumps to an offscreen target message by processed-list index', async () => {
    const messages = Array.from({ length: 1000 }, (_, index) => createTextMessage(index));
    messageListMocks.locationState = { targetMessageId: 'message-500' };

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
    });

    await waitFor(() => {
      expect(messageListMocks.scrollToIndex).toHaveBeenCalledWith(500, {
        behavior: 'smooth',
        align: 'center',
      });
    });
  });

  it('renders the empty slot when there are no messages', () => {
    render(<MessageList emptySlot={<div>empty state</div>} />, {
      wrapper: ({ children }) => <Wrapper messages={[]}>{children}</Wrapper>,
    });

    expect(screen.getByText('empty state')).toBeInTheDocument();
  });

  it('renders a skeleton while the initial message batch is loading', () => {
    render(<MessageList emptySlot={<div>empty state</div>} />, {
      wrapper: ({ children }) => (
        <Wrapper messages={[]} loading>
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByTestId('message-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('empty state')).not.toBeInTheDocument();
  });
});

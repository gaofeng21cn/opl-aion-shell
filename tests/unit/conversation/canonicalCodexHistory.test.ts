import type { IMessageAcpToolCall, IMessageText, IMessageThinking, TMessage } from '@/common/chat/chatLib';
import { mergeCanonicalHistory } from '@/renderer/pages/conversation/platforms/acp/useCanonicalCodexHistory';
import { describe, expect, it } from 'vitest';

function textMessage(id: string, content: string, conversationId = 'conversation-1', createdAt = 1): IMessageText {
  return {
    id,
    msg_id: id,
    type: 'text',
    position: 'left',
    conversation_id: conversationId,
    created_at: createdAt,
    content: { content },
  };
}

function thinkingMessage(id: string, content: string, status: 'thinking' | 'done'): IMessageThinking {
  return {
    id,
    msg_id: id,
    type: 'thinking',
    position: 'left',
    conversation_id: 'conversation-1',
    created_at: 1,
    content: { content, subject: 'Reasoning', status },
  };
}

function toolMessage(id: string, status: 'in_progress' | 'completed'): IMessageAcpToolCall {
  return {
    id,
    msg_id: id,
    type: 'acp_tool_call',
    position: 'left',
    conversation_id: 'conversation-1',
    created_at: 1,
    content: {
      session_id: id,
      update: {
        sessionUpdate: status === 'in_progress' ? 'tool_call' : 'tool_call_update',
        tool_call_id: id,
        status,
        title: 'Codex tool',
        kind: 'execute',
      },
    },
  };
}

describe('mergeCanonicalHistory', () => {
  it('keeps live messages that arrived after the canonical read started', () => {
    const history = [textMessage('history-1', 'Earlier canonical output')];
    const live = textMessage('live-1', 'New live output', 'conversation-1', 2);
    const unrelated = textMessage('other-1', 'Other conversation', 'conversation-2');

    expect(mergeCanonicalHistory([unrelated, live], history, 'conversation-1')).toEqual([unrelated, ...history, live]);
  });

  it('keeps the longer live text when canonical readback lags the stream', () => {
    const history = textMessage('message-1', 'Partial');
    const live = textMessage('message-1', 'Partial response completed');

    const merged = mergeCanonicalHistory([live], [history], 'conversation-1') as TMessage[];

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'message-1', content: { content: 'Partial response completed' } });
  });

  it('does not regress completed thinking to an in-progress canonical snapshot', () => {
    const merged = mergeCanonicalHistory(
      [thinkingMessage('thinking-1', 'Complete reasoning', 'done')],
      [thinkingMessage('thinking-1', 'Partial', 'thinking')],
      'conversation-1'
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: 'thinking',
      content: { content: 'Complete reasoning', status: 'done' },
    });
  });

  it('does not regress a completed tool call to an in-progress canonical snapshot', () => {
    const merged = mergeCanonicalHistory(
      [toolMessage('tool-1', 'completed')],
      [toolMessage('tool-1', 'in_progress')],
      'conversation-1'
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ type: 'acp_tool_call', content: { update: { status: 'completed' } } });
  });
});

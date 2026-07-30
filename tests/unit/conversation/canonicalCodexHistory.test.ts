import type { IMessageText, TMessage } from '@/common/chat/chatLib';
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
});

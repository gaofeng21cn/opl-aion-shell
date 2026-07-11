import { describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildConversationExportContent,
  buildDefaultExportFileName,
  fetchAllConversationMessages,
  normalizeExportFileName,
  type ExportTranscriptLabels,
} from '@/renderer/utils/chat/conversationExport';

const labels: ExportTranscriptLabels = {
  conversation: 'Conversation',
  exportedAt: 'Exported at',
  noMessages: 'No messages',
  redactionNotice: 'Credential-like values were redacted.',
  user: 'User',
  assistant: 'Assistant',
};

const conversation = {
  id: 'conversation-raw-id',
  name: 'Review token = title-secret-12345',
  type: 'codex',
  created_at: 1,
  modified_at: 1,
  extra: { workspace: '/Users/example/private-workspace', provider: 'openai' },
} as unknown as TChatConversation;

const textMessage = (id: string, position: 'left' | 'right' | 'center', content: string): TMessage =>
  ({
    id,
    conversation_id: conversation.id,
    type: 'text',
    position,
    content: { content },
  }) as TMessage;

describe('conversation transcript pagination', () => {
  it('reads every bounded page in ascending order until the complete history is loaded', async () => {
    const messages = [
      textMessage('m1', 'right', 'one'),
      textMessage('m2', 'left', 'two'),
      textMessage('m3', 'right', 'three'),
      textMessage('m4', 'left', 'four'),
      textMessage('m5', 'right', 'five'),
    ];
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: messages.slice(0, 2), total: 5, has_more: true })
      .mockResolvedValueOnce({ items: messages.slice(2, 4), total: 5, has_more: true })
      .mockResolvedValueOnce({ items: messages.slice(4), total: 5, has_more: false });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2 })).resolves.toEqual(messages);
    expect(fetchPage.mock.calls.map(([request]) => request)).toEqual([
      { page: 0, page_size: 2 },
      { page: 1, page_size: 2 },
      { page: 2, page_size: 2 },
    ]);
  });

  it('rejects repeated pages instead of looping or returning duplicated history', async () => {
    const repeatedPage = [textMessage('m1', 'right', 'one'), textMessage('m2', 'left', 'two')];
    const fetchPage = vi.fn().mockResolvedValue({ items: repeatedPage, total: 6, has_more: true });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2, maxPages: 4 })).rejects.toThrow(
      /repeated page/i
    );
  });

  it('rejects overlapping pages instead of counting duplicate messages as complete history', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [textMessage('m1', 'right', 'one'), textMessage('m2', 'left', 'two')],
        total: 4,
        has_more: true,
      })
      .mockResolvedValueOnce({
        items: [textMessage('m2', 'left', 'two'), textMessage('m3', 'right', 'three')],
        total: 4,
        has_more: false,
      });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2 })).rejects.toThrow(/duplicate message/i);
  });

  it('rejects contradictory pagination metadata instead of silently truncating a short page', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [textMessage('m1', 'right', 'one')],
      total: 3,
      has_more: true,
    });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2 })).rejects.toThrow(/incomplete page/i);
  });
});

describe('shareable conversation transcript', () => {
  it('exports only redacted user and assistant text without mutating source messages', () => {
    const messages = [
      textMessage('user', 'right', 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456'),
      textMessage('assistant', 'left', 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature'),
      textMessage('system', 'center', 'workspace=/Users/example/private-workspace receipt=runtime-secret'),
      {
        id: 'tool',
        conversation_id: conversation.id,
        type: 'tool_call',
        position: 'left',
        content: { name: 'mcp.read', input: { token: 'tool-secret-token' }, output: 'provider receipt' },
      } as unknown as TMessage,
      {
        ...textMessage('hidden', 'right', 'hidden token=hidden-secret-token'),
        hidden: true,
      },
    ];
    const originalMessages = structuredClone(messages);
    const exportedAt = '2026-07-11T01:02:03.000Z';

    const markdown = buildConversationExportContent(conversation, messages, 'markdown', labels, exportedAt);
    const json = buildConversationExportContent(conversation, messages, 'json', labels, exportedAt);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(markdown).toContain('# Review token = [REDACTED]');
    expect(markdown).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(markdown).toContain('Authorization: Bearer [REDACTED]');
    expect(markdown).toContain(labels.redactionNotice);
    expect(markdown).not.toContain(conversation.id);
    expect(markdown).not.toContain('/Users/example/private-workspace');
    expect(markdown).not.toContain('mcp.read');
    expect(markdown).not.toContain('provider receipt');
    expect(markdown).not.toContain('hidden-secret-token');

    expect(Object.keys(parsed)).toEqual(['title', 'exported_at', 'messages', 'redacted']);
    expect(parsed).toEqual({
      title: 'Review token = [REDACTED]',
      exported_at: exportedAt,
      messages: [
        { role: 'user', content: 'OPENAI_API_KEY=[REDACTED]' },
        { role: 'assistant', content: 'Authorization: Bearer [REDACTED]' },
      ],
      redacted: true,
    });
    expect(messages).toEqual(originalMessages);
  });

  it('keeps filename extensions aligned with the selected format and excludes conversation ids', () => {
    expect(buildDefaultExportFileName('Private review', 'markdown', Date.UTC(2026, 6, 11))).toBe(
      '2026-07-11-private-review.md'
    );
    expect(buildDefaultExportFileName('Private review', 'json', Date.UTC(2026, 6, 11))).toBe(
      '2026-07-11-private-review.json'
    );
    expect(normalizeExportFileName('review.json', 'markdown')).toBe('review.md');
    expect(normalizeExportFileName('review.md', 'json')).toBe('review.json');
  });
});

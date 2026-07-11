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

const syntheticCredential = (...parts: string[]): string => parts.join('');

describe('conversation transcript pagination', () => {
  it('walks backwards through cursor pages and returns a stable created_at ascending transcript', async () => {
    const messages = [
      { ...textMessage('m1', 'right', 'one'), created_at: 1 },
      { ...textMessage('m2', 'left', 'two'), created_at: 2 },
      { ...textMessage('m3', 'right', 'three'), created_at: 3 },
      { ...textMessage('m4', 'left', 'four'), created_at: 4 },
    ];
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: messages.slice(2),
        oldest_cursor: 'before-m3',
        newest_cursor: 'after-m4',
        has_more_before: true,
        has_more_after: false,
      })
      .mockResolvedValueOnce({
        items: messages.slice(0, 2),
        oldestCursor: 'before-m1',
        newestCursor: 'after-m2',
        hasMoreBefore: false,
        hasMoreAfter: true,
      });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2 })).resolves.toEqual(messages);
    expect(fetchPage.mock.calls.map(([request]) => request)).toEqual([
      { limit: 2, content_mode: 'compact' },
      { limit: 2, before: 'before-m3', content_mode: 'compact' },
    ]);
  });

  it('rejects repeated pages instead of looping or returning duplicated history', async () => {
    const repeatedPage = [textMessage('m1', 'right', 'one'), textMessage('m2', 'left', 'two')];
    const fetchPage = vi.fn().mockResolvedValue({
      items: repeatedPage,
      oldest_cursor: 'before-m1',
      has_more_before: true,
    });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2, maxPages: 4 })).rejects.toThrow(
      /repeated page/i
    );
  });

  it('rejects overlapping pages instead of counting duplicate messages as complete history', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: [textMessage('m1', 'right', 'one'), textMessage('m2', 'left', 'two')],
        oldest_cursor: 'before-m1',
        has_more_before: true,
      })
      .mockResolvedValueOnce({
        items: [textMessage('m2', 'left', 'two'), textMessage('m3', 'right', 'three')],
        oldest_cursor: 'before-m2',
        has_more_before: false,
      });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2 })).rejects.toThrow(/duplicate message/i);
  });

  it('rejects contradictory empty cursor pages and repeated cursors instead of silently truncating', async () => {
    const emptyPage = vi.fn().mockResolvedValue({
      items: [],
      oldest_cursor: 'before-m1',
      has_more_before: true,
    });
    const repeatedCursor = vi
      .fn()
      .mockResolvedValueOnce({
        items: [textMessage('m2', 'left', 'two')],
        oldest_cursor: 'before-m1',
        has_more_before: true,
      })
      .mockResolvedValueOnce({
        items: [textMessage('m1', 'right', 'one')],
        oldest_cursor: 'before-m1',
        has_more_before: true,
      });

    await expect(fetchAllConversationMessages(emptyPage, { pageSize: 2 })).rejects.toThrow(/empty page/i);
    await expect(fetchAllConversationMessages(repeatedCursor, { pageSize: 2 })).rejects.toThrow(/repeated cursor/i);
  });

  it('fails at the configured cursor page cap instead of returning a partial transcript', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: [textMessage('m1', 'right', 'one')],
      oldest_cursor: 'before-m1',
      has_more_before: true,
    });

    await expect(fetchAllConversationMessages(fetchPage, { pageSize: 2, maxPages: 1 })).rejects.toThrow(/maximum/i);
  });
});

describe('shareable conversation transcript', () => {
  it('exports only redacted user and assistant text without mutating source messages', () => {
    const messages = [
      textMessage(
        'user',
        'right',
        `OPENAI_API_KEY=${syntheticCredential('sk-', 'proj-', 'abcdefghijklmnopqrstuvwxyz123456')}`
      ),
      textMessage(
        'assistant',
        'left',
        `Authorization: Bearer ${syntheticCredential('eyJhbGciOiJIUzI1NiJ9', '.payload', '.signature')}`
      ),
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

  it('recursively redacts parseable JSON and adversarial credential patterns without exporting metadata', () => {
    const messages = [
      textMessage(
        'user',
        'right',
        JSON.stringify({
          api_key: syntheticCredential('sk-', 'proj-', 'abcdefghijklmnopqrstuvwxyz123456'),
          nested: { client_secret: 'client-secret-value', authorization: 'Bearer hidden-value' },
        })
      ),
      textMessage(
        'assistant',
        'left',
        [
          'Basic dXNlcjpwYXNzd29yZA==',
          `jwt ${syntheticCredential('eyJhbGciOiJIUzI1NiJ9', '.eyJzdWIiOiIxIn0', '.signature')}`,
          syntheticCredential('hf_', 'abcdefghijklmnopqrstuvwxyz'),
          `stripe ${syntheticCredential('sk_', 'live_', 'abcdefghijklmnopqrstuvwxyz')}`,
          `AWS ${syntheticCredential('AKIA', 'IOSFODNN7EXAMPLE')}`,
          `GitHub ${syntheticCredential('github_', 'pat_', 'abcdefghijklmnopqrstuvwxyz')}`,
        ].join(' ')
      ),
    ];

    const parsed = JSON.parse(buildConversationExportContent(conversation, messages, 'json', labels)) as {
      redacted: boolean;
      messages: Array<{ content: string }>;
    };

    expect(JSON.parse(parsed.messages[0]?.content ?? '')).toEqual({
      api_key: '[REDACTED]',
      nested: { client_secret: '[REDACTED]', authorization: '[REDACTED]' },
    });
    expect(parsed.messages[1]?.content).toContain('Basic [REDACTED]');
    expect(parsed.messages[1]?.content).not.toMatch(/eyJhbGci|hf_[a-z]|sk_live_|AKIAIOSFODNN7EXAMPLE|github_pat_/);
    expect(parsed.redacted).toBe(true);
  });

  it('normalizes Unicode and removes control characters, Windows reserved names, and trailing spaces or dots', () => {
    expect(normalizeExportFileName('  CON. \u0000', 'markdown')).toBe('CON_.md');
    expect(normalizeExportFileName(' cafe\u0301.  ', 'json')).toBe('caf\u00e9.json');
    expect(normalizeExportFileName('../private\\report. ', 'markdown')).toBe('___private_report.md');
  });
});

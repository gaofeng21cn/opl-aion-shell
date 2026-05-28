import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import { normalizeAcpToolCall } from '@/common/chat/normalizeToolCall';

describe('normalizeToolCall', () => {
  it('normalizes compact snake_case acp tool calls from history responses', () => {
    const result = normalizeAcpToolCall({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        _compact: {
          truncated: true,
          original_size: 90000,
          preview_chars: 4096,
        },
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'preview' } }],
        },
      },
    } as unknown as IMessageAcpToolCall);

    expect(result).toMatchObject({
      key: 'tool-1',
      name: 'rg',
      status: 'completed',
      description: '"needle" in .',
      output: 'preview',
      truncated: true,
      messageId: 'message-1',
      conversationId: 'conversation-1',
    });
  });

  it('preserves Codex ACP raw_output newlines as tool output', () => {
    const result = normalizeAcpToolCall({
      id: 'message-2',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-2',
          status: 'completed',
          title: 'pytest',
          kind: 'execute',
          raw_input: { command: 'pytest -q' },
          raw_output: {
            aggregated_output: 'line one\nline two\nline three',
            stdout: 'line one\nline two\nline three',
            stderr: '',
          },
        },
      },
    } as unknown as IMessageAcpToolCall);

    expect(result?.output).toBe('line one\nline two\nline three');
  });
});

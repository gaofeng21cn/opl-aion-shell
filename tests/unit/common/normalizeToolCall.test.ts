import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import { normalizeAcpToolCall, normalizeSubagentActivities } from '@/common/chat/normalizeToolCall';

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

  it('projects real Codex collaboration metadata into a deduplicated Active subagent row', () => {
    const message = {
      id: 'message-subagent-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'call-spawn-weather',
          status: 'in_progress',
          title: 'spawnAgent',
          kind: 'other',
          raw_input: {
            prompt: 'Find the current weather in Paris.',
            receiverThreadIds: ['thread-paris'],
            agentsStates: {
              'thread-paris': { status: 'running', message: 'Checking weather' },
            },
            model: 'gpt-5.6-sol',
            reasoningEffort: 'high',
          },
          _meta: {
            codex: {
              collaboration: {
                tool: 'spawnAgent',
                senderThreadId: 'thread-main',
                receiverThreadIds: ['thread-paris', 'thread-paris'],
              },
            },
          },
        },
      },
    } as unknown as IMessageAcpToolCall;

    expect(normalizeSubagentActivities([message])).toEqual([
      {
        threadId: 'thread-paris',
        name: 'thread-paris',
        path: undefined,
        prompt: 'Find the current weather in Paris.',
        message: 'Checking weather',
        result: undefined,
        model: 'gpt-5.6-sol',
        reasoningEffort: 'high',
        tool: 'spawnAgent',
        status: 'active',
        rawStatus: 'running',
        sourceToolKey: 'call-spawn-weather',
        sourceToolKeys: ['call-spawn-weather'],
      },
    ]);
  });

  it('uses subagent activity metadata for Done and leaves unknown metadata as a generic tool call', () => {
    const completed = {
      id: 'message-subagent-2',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'call-spawn-weather',
          status: 'completed',
          title: 'Start subagent weather_research',
          kind: 'other',
          raw_input: {
            agentThreadId: 'thread-paris',
            agentPath: '/root/weather_research',
            activityKind: 'started',
          },
          raw_output: { aggregated_output: 'Weather report ready' },
          _meta: {
            codex: {
              subagent: {
                threadId: 'thread-paris',
                path: '/root/weather_research',
                activity: 'started',
              },
            },
          },
        },
      },
    } as unknown as IMessageAcpToolCall;
    const malformed = {
      ...completed,
      id: 'message-subagent-3',
      content: {
        update: {
          ...completed.content.update,
          tool_call_id: 'call-unknown',
          status: 'not_loaded',
          _meta: { codex: { collaboration: { receiverThreadIds: ['thread-unknown'] } } },
        },
      },
    } as unknown as IMessageAcpToolCall;

    expect(normalizeSubagentActivities([completed])).toMatchObject([
      {
        threadId: 'thread-paris',
        name: 'weather_research',
        path: '/root/weather_research',
        result: 'Weather report ready',
        status: 'done',
        rawStatus: 'completed',
      },
    ]);
    expect(normalizeSubagentActivities([malformed])).toEqual([]);
    expect(normalizeAcpToolCall(malformed)?.key).toBe('call-unknown');
  });
});

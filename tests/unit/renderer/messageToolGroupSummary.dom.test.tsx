import React from 'react';
import { Message } from '@arco-design/web-react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessage: {
        invoke: vi.fn(),
      },
      getUserConversations: {
        invoke: vi.fn(),
      },
    },
    conversation: {
      get: {
        invoke: vi.fn(),
      },
      createWithConversation: {
        invoke: vi.fn(),
      },
    },
    codexThreads: {
      read: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: { count?: number } = {}) => {
      const translations: Record<string, string> = {
        'messages.toolSteps.completed': 'Completed steps · {{count}}',
        'messages.toolSteps.running': 'Running steps · {{count}}',
        'messages.toolSteps.loading': 'Loading full output...',
        'messages.toolSteps.loadFailed': 'Failed to load full output',
        'messages.toolSteps.input': 'Input',
        'messages.toolSteps.output': 'Output',
        'messages.subagents.title': 'Subagents',
        'messages.subagents.active': 'Active · {{count}}',
        'messages.subagents.done': 'Done · {{count}}',
        'messages.subagents.activeState': 'Active',
        'messages.subagents.doneState': 'Done',
        'messages.subagents.prompt': 'Prompt',
        'messages.subagents.message': 'Latest update',
        'messages.subagents.result': 'Result',
        'messages.subagents.model': 'Model',
        'messages.subagents.reasoningEffort': 'Reasoning',
        'messages.subagents.path': 'Agent',
        'messages.subagents.threadId': 'Task ID',
        'messages.subagents.openTask': 'Open task',
        'messages.subagents.openingTask': 'Opening task...',
        'messages.subagents.openFailed': 'Could not open the subagent task',
      };
      return (translations[key] ?? key).replace('{{count}}', String(values.count ?? ''));
    },
  }),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid='location'>{location.pathname}</div>;
};

const renderSummary = (messages: ToolMessage[]) =>
  render(
    <MemoryRouter>
      <MessageToolGroupSummary messages={messages} />
      <LocationProbe />
    </MemoryRouter>
  );

describe('MessageToolGroupSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.database.getUserConversations.invoke).mockResolvedValue({
      items: [],
      total: 0,
      has_more: false,
    });
  });

  it('loads full tool content when expanding a compact history item', async () => {
    const invoke = vi.mocked(ipcBridge.database.getConversationMessage.invoke);
    invoke.mockResolvedValue({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'full output' } }],
        },
      },
    } as unknown as TMessage);

    renderSummary([
      {
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
      } as unknown as ToolMessage,
    ]);

    const summary = screen.getByRole('button', { name: /Completed steps/ });
    expect(summary).not.toHaveTextContent('View Steps');
    fireEvent.click(summary);
    fireEvent.click(screen.getByText('rg'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith({
        conversation_id: 'conversation-1',
        message_id: 'message-1',
      });
    });
    expect(await screen.findByText('full output')).toBeInTheDocument();
  });

  it('groups Codex subagents as Active and Done and materializes a canonical task on open', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(null as never);
    vi.mocked(ipcBridge.codexThreads.read.invoke).mockResolvedValue({
      thread: {
        id: 'thread-done',
        title: 'Weather research',
        summary: 'Weather report ready',
        status: 'idle',
        projectId: 'project-1',
        workspace: '/tmp/weather',
        host: 'local',
        owner: 'researcher',
        goal: null,
        parentThreadId: 'thread-main',
        ancestorThreadIds: ['thread-main'],
        activeTurnId: null,
        archived: false,
        updatedAt: '2026-07-18T08:00:00.000Z',
      },
      history: [],
    });
    vi.mocked(ipcBridge.conversation.createWithConversation.invoke).mockImplementation(
      async ({ conversation }) => conversation
    );

    renderSummary([
      {
        id: 'message-active',
        conversation_id: 'conversation-1',
        type: 'acp_tool_call',
        content: {
          update: {
            session_update: 'tool_call',
            tool_call_id: 'tool-active',
            status: 'in_progress',
            title: 'spawnAgent',
            kind: 'other',
            raw_input: {
              prompt: 'Check Shanghai weather',
              agentsStates: {
                'thread-active': { status: 'running', message: 'Collecting sources' },
              },
            },
            _meta: {
              codex: {
                collaboration: {
                  tool: 'spawnAgent',
                  receiverThreadIds: ['thread-active'],
                },
              },
            },
          },
        },
      } as unknown as ToolMessage,
      {
        id: 'message-done',
        conversation_id: 'conversation-1',
        type: 'acp_tool_call',
        content: {
          update: {
            session_update: 'tool_call',
            tool_call_id: 'tool-done',
            status: 'completed',
            title: 'Start subagent weather_research',
            kind: 'other',
            raw_input: {
              agentThreadId: 'thread-done',
              agentPath: '/root/weather_research',
            },
            raw_output: { aggregated_output: 'Weather report ready' },
            _meta: {
              codex: {
                subagent: {
                  threadId: 'thread-done',
                  path: '/root/weather_research',
                  activity: 'started',
                },
              },
            },
          },
        },
      } as unknown as ToolMessage,
    ]);

    expect(screen.getByText('Subagents')).toBeInTheDocument();
    expect(screen.getByText('Active · 1')).toBeInTheDocument();
    expect(screen.getByText('Done · 1')).toBeInTheDocument();
    expect(screen.queryByText('spawnAgent')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /weather_research Done/ }));
    expect(screen.getByText('Weather report ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open task' }));

    await waitFor(() => {
      expect(ipcBridge.codexThreads.read.invoke).toHaveBeenCalledWith({ threadId: 'thread-done' });
      expect(ipcBridge.conversation.createWithConversation.invoke).toHaveBeenCalledWith({
        conversation: expect.objectContaining({
          id: 'thread-done',
          name: 'Weather research',
          source: 'codex-app-server',
          extra: expect.objectContaining({
            backend: 'codex',
            canonical_thread_id: 'thread-done',
            canonical_thread_stub: false,
          }),
        }),
      });
      expect(screen.getByTestId('location')).toHaveTextContent('/conversation/thread-done');
    });
  });

  it('keeps the current conversation usable when a canonical subagent task cannot be opened', async () => {
    const messageError = vi.spyOn(Message, 'error').mockImplementation(() => undefined as never);
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(null as never);
    vi.mocked(ipcBridge.codexThreads.read.invoke).mockRejectedValue(new Error('thread unavailable'));

    renderSummary([
      {
        id: 'message-done',
        conversation_id: 'conversation-1',
        type: 'acp_tool_call',
        content: {
          update: {
            session_update: 'tool_call',
            tool_call_id: 'tool-done',
            status: 'completed',
            title: 'Start subagent weather_research',
            kind: 'other',
            raw_input: {
              agentThreadId: 'thread-done',
              agentPath: '/root/weather_research',
            },
            _meta: {
              codex: {
                subagent: {
                  threadId: 'thread-done',
                  path: '/root/weather_research',
                  activity: 'started',
                },
              },
            },
          },
        },
      } as unknown as ToolMessage,
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Completed steps/ }));
    fireEvent.click(screen.getByRole('button', { name: /weather_research Done/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open task' }));

    await waitFor(() => {
      expect(messageError).toHaveBeenCalledWith('Could not open the subagent task');
      expect(screen.getByTestId('location')).toHaveTextContent('/');
      expect(screen.getByRole('button', { name: 'Open task' })).toBeEnabled();
    });
    expect(ipcBridge.conversation.createWithConversation.invoke).not.toHaveBeenCalled();
    messageError.mockRestore();
  });

  it('reuses a migrated local projection instead of creating a duplicate canonical task', async () => {
    vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(null as never);
    vi.mocked(ipcBridge.database.getUserConversations.invoke).mockResolvedValue({
      items: [
        {
          id: 'local-weather-task',
          name: 'Weather research',
          created_at: 1,
          modified_at: 1,
          type: 'acp',
          source: 'codex-app-server',
          status: 'finished',
          extra: {
            backend: 'codex',
            acp_session_id: 'legacy-weather-session',
            canonical_thread_id: 'thread-done',
          },
        },
      ],
      total: 1,
      has_more: false,
    } as never);

    renderSummary([
      {
        id: 'message-done',
        conversation_id: 'conversation-1',
        type: 'acp_tool_call',
        content: {
          update: {
            session_update: 'tool_call',
            tool_call_id: 'tool-done',
            status: 'completed',
            title: 'Start subagent weather_research',
            kind: 'other',
            _meta: {
              codex: {
                subagent: {
                  threadId: 'thread-done',
                  path: '/root/weather_research',
                  activity: 'started',
                },
              },
            },
          },
        },
      } as unknown as ToolMessage,
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Completed steps/ }));
    fireEvent.click(screen.getByRole('button', { name: /weather_research Done/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open task' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/conversation/local-weather-task');
    });
    expect(ipcBridge.codexThreads.read.invoke).not.toHaveBeenCalled();
    expect(ipcBridge.conversation.createWithConversation.invoke).not.toHaveBeenCalled();
  });
});

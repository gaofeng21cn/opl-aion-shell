import type { IMessageAcpPermission } from '@/common/chat/chatLib';
import MessageAcpPermission from '@/renderer/pages/conversation/Messages/acp/MessageAcpPermission';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openExternalUrlMock, respondApprovalMock } = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(),
  respondApprovalMock: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  codexThreads: {
    respondApproval: { invoke: respondApprovalMock },
  },
  conversation: {
    confirmMessage: { invoke: vi.fn() },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: openExternalUrlMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function message(
  requestId: string,
  interaction: Record<string, unknown>,
  options = [{ option_id: 'accept', name: 'Allow once', kind: 'allow_once' as const }]
): IMessageAcpPermission {
  return {
    id: requestId,
    msg_id: requestId,
    conversation_id: 'conversation-1',
    created_at: Date.now(),
    position: 'left',
    type: 'acp_permission',
    content: {
      session_id: 'thread-1',
      options,
      tool_call: {
        tool_call_id: requestId,
        title: 'Codex interaction',
        kind: 'fetch',
        raw_input: {
          codex_app_server_request: true,
          codex_interaction: interaction,
        },
      },
    },
  };
}

describe('MessageAcpPermission canonical Codex interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respondApprovalMock.mockResolvedValue(undefined);
  });

  it('returns structured answers for request_user_input', async () => {
    render(
      <MessageAcpPermission
        message={message('input-1', {
          kind: 'request_user_input',
          questions: [
            {
              id: 'route',
              header: 'Route',
              question: 'How should this be implemented?',
              isOther: false,
              isSecret: false,
              options: null,
            },
          ],
        })}
      />
    );

    const confirm = screen.getByTestId('message-acp-permission-confirm');
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId('codex-user-input-value-route'), {
      target: { value: 'Use the Shell adapter' },
    });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(respondApprovalMock).toHaveBeenCalledWith({
        requestId: 'input-1',
        decision: 'accept',
        answers: {
          route: { answers: ['Use the Shell adapter'] },
        },
      })
    );
  });

  it('validates and submits typed MCP form content', async () => {
    render(
      <MessageAcpPermission
        message={message('elicitation-1', {
          kind: 'mcp_elicitation',
          elicitation: {
            mode: 'form',
            message: 'Choose a city',
            requestedSchema: {
              type: 'object',
              properties: {
                city: { type: 'string', title: 'City' },
              },
              required: ['city'],
            },
          },
        })}
      />
    );

    fireEvent.click(screen.getByText('Allow once'));
    const confirm = screen.getByTestId('message-acp-permission-confirm');
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId('codex-elicitation-value-city'), {
      target: { value: 'Paris' },
    });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(respondApprovalMock).toHaveBeenCalledWith({
        requestId: 'elicitation-1',
        decision: 'accept',
        content: { city: 'Paris' },
      })
    );
  });

  it('opens URL-mode elicitations through the existing external URL boundary', () => {
    render(
      <MessageAcpPermission
        message={message('elicitation-url-1', {
          kind: 'mcp_elicitation',
          elicitation: {
            mode: 'url',
            message: 'Complete authorization',
            url: 'https://example.test/authorize',
          },
        })}
      />
    );

    fireEvent.click(screen.getByTestId('codex-elicitation-open-url'));
    expect(openExternalUrlMock).toHaveBeenCalledWith('https://example.test/authorize');
  });
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';

const mocks = vi.hoisted(() => ({
  getModel: vi.fn(),
  setModel: vi.fn(),
  responseStreamOn: vi.fn(),
  agentsData: [] as unknown[],
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModel: { invoke: mocks.getModel },
      setModel: { invoke: mocks.setModel },
      responseStream: { on: mocks.responseStreamOn },
    },
  },
}));

vi.mock('swr', () => ({
  default: () => ({ data: mocks.agentsData }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'conversation.welcome.autoModel') return `Auto (${String(options?.model)})`;
      if (key === 'common.defaultModel') return 'Default Model';
      if (key === 'conversation.welcome.useCliModel') return 'Select Model';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch not supported';
      return String(options?.defaultValue ?? key);
    },
  }),
}));

describe('AcpModelSelector Codex model switching', () => {
  beforeEach(() => {
    mocks.getModel.mockReset();
    mocks.setModel.mockReset();
    mocks.responseStreamOn.mockReset();
    mocks.getModel.mockRejectedValue(new Error('session not ready'));
    mocks.setModel.mockResolvedValue(undefined);
    mocks.responseStreamOn.mockReturnValue(() => undefined);
    mocks.agentsData = [
      {
        agent_type: 'acp',
        backend: 'codex',
        handshake: {
          available_models: {
            current_model_id: 'gpt-5.2-codex',
            current_model_label: 'gpt-5.2-codex',
            available_models: [
              { id: 'gpt-5.5', label: 'gpt-5.5' },
              { id: 'gpt-5.6-codex', label: 'gpt-5.6 Codex' },
              { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1 mini' },
            ],
          },
        },
      },
    ];
  });

  it('uses auto latest Codex as the default and still exposes selectable models', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /Auto \(gpt-5\.6 Codex\)/ });

    await userEvent.click(autoButton);

    expect(await screen.findByText('gpt-5.5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'gpt-5.5' }));

    await waitFor(() => {
      expect(mocks.setModel).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        model_id: 'gpt-5.5',
      });
    });

    expect(screen.getByRole('button', { name: /gpt-5\.5/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /gpt-5\.5/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Auto (gpt-5.6 Codex)' }));

    await waitFor(() => {
      expect(mocks.setModel).toHaveBeenLastCalledWith({
        conversation_id: 'codex-conversation',
        model_id: 'gpt-5.6-codex',
      });
    });
  });
});

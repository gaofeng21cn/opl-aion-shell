import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCodexDefaultModelInfo } from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';

const mocks = vi.hoisted(() => ({
  getModel: vi.fn(),
  setModel: vi.fn(),
  conversationUpdate: vi.fn(),
  writeRendererLog: vi.fn(),
  responseStreamOn: vi.fn(),
  agentsData: [] as unknown[],
  acpModelInfo: null as AcpModelInfo | null,
  mutateModelInfo: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModel: { invoke: mocks.getModel },
      setModel: { invoke: mocks.setModel },
      responseStream: { on: mocks.responseStreamOn },
    },
    conversation: {
      update: { invoke: mocks.conversationUpdate },
    },
    application: {
      writeRendererLog: { invoke: mocks.writeRendererLog },
    },
  },
}));

vi.mock('swr', () => ({
  default: (key: unknown) => {
      if (Array.isArray(key) && key[0] === 'acp-model-info') {
      return {
        data: mocks.acpModelInfo,
        isLoading: false,
        mutate: mocks.mutateModelInfo,
      };
    }
    return {
      data: mocks.agentsData,
      isLoading: false,
      mutate: vi.fn(),
    };
  },
  mutate: vi.fn(),
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
    mocks.conversationUpdate.mockReset();
    mocks.writeRendererLog.mockReset();
    mocks.responseStreamOn.mockReset();
    mocks.mutateModelInfo.mockReset();
    mocks.getModel.mockRejectedValue(new Error('session not ready'));
    mocks.setModel.mockResolvedValue(undefined);
    mocks.conversationUpdate.mockResolvedValue(true);
    mocks.writeRendererLog.mockResolvedValue(undefined);
    mocks.responseStreamOn.mockReturnValue(() => undefined);
    mocks.acpModelInfo = {
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5（超高）',
      available_models: [
        { id: 'gpt-5.5', label: 'GPT-5.5（超高）' },
        { id: 'gpt-5.4', label: 'GPT-5.4' },
      ],
    };
    mocks.mutateModelInfo.mockImplementation((updater: unknown) => {
      if (typeof updater === 'function') {
        mocks.acpModelInfo = (updater as (previous: unknown) => unknown)(mocks.acpModelInfo);
      } else {
        mocks.acpModelInfo = updater;
      }
      return Promise.resolve(mocks.acpModelInfo);
    });
    mocks.agentsData = [
      {
        agent_type: 'acp',
        backend: 'codex',
        handshake: {
          available_models: {
            current_model_id: 'gpt-5.2-codex',
            current_model_label: 'gpt-5.2-codex',
            available_models: [
              { id: 'gpt-5.5', label: 'GPT-5.5（超高）' },
              { id: 'gpt-5.4', label: 'GPT-5.4' },
              { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1 mini' },
            ],
          },
        },
      },
    ];
  });

  it('uses auto latest Codex as the default visible selector on the fixed App path', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /GPT-5\.5（超高）/ });

    await userEvent.click(autoButton);

    expect(await screen.findByRole('menuitem', { name: 'GPT-5.5（超高）' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'GPT-5.4' }));

    expect(mocks.setModel).toHaveBeenCalledWith({ conversation_id: 'codex-conversation', model_id: 'gpt-5.4' });
  });

  it('renders App default Codex model options from the product profile', async () => {
    mocks.acpModelInfo = buildCodexDefaultModelInfo();

    render(<AcpModelSelector conversation_id='new-codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /GPT-5\.5（超高）/ });

    await userEvent.click(autoButton);

    expect(await screen.findByRole('menuitem', { name: 'GPT-5.5（超高）' })).toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'gpt-5.4' })).toBeInTheDocument();
    expect(screen.queryByText('Model switch not supported')).not.toBeInTheDocument();
  });
});

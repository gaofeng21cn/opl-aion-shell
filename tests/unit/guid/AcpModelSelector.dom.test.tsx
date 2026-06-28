import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCodexDefaultModelInfo } from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';

const mocks = vi.hoisted(() => ({
  getModel: vi.fn(),
  setModel: vi.fn(),
  getConfigOptions: vi.fn(),
  setConfigOption: vi.fn(),
  configOptions: [] as unknown[],
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
      getConfigOptions: { invoke: mocks.getConfigOptions },
      setConfigOption: { invoke: mocks.setConfigOption },
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

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('swr', () => ({
  default: (key: unknown) => {
    if (Array.isArray(key) && key[0] === 'acp-model-info') {
      return {
        data: mocks.acpModelInfo,
        isLoading: false,
        mutate: mocks.mutateModelInfo,
      };
    }
    if (Array.isArray(key) && key[0] === 'acp-config-options') {
      return {
        data: mocks.configOptions,
        isLoading: false,
        mutate: vi.fn(),
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
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'conversation.welcome.autoModel') return `Auto (${String(options?.model)})`;
      if (key === 'common.defaultModel') return 'Default Model';
      if (key === 'conversation.welcome.useCliModel') return 'Select Model';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return 'Model switch not supported';
      if (key === 'agent.thoughtLevel.label') return 'Reasoning';
      if (key === 'agent.thoughtLevel.switchSuccess') return 'Reasoning switched';
      if (key === 'agent.config.failed') return 'Config failed';
      return String(options?.defaultValue ?? key);
    },
  }),
}));

describe('AcpModelSelector Codex model switching', () => {
  beforeEach(() => {
    mocks.getModel.mockReset();
    mocks.setModel.mockReset();
    mocks.getConfigOptions.mockReset();
    mocks.setConfigOption.mockReset();
    mocks.configOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        option_type: 'select',
        current_value: 'xhigh',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Ultra' },
        ],
      },
    ];
    mocks.conversationUpdate.mockReset();
    mocks.writeRendererLog.mockReset();
    mocks.responseStreamOn.mockReset();
    mocks.mutateModelInfo.mockReset();
    mocks.getModel.mockRejectedValue(new Error('session not ready'));
    mocks.setModel.mockResolvedValue(undefined);
    mocks.getConfigOptions.mockResolvedValue({
      config_options: [
        {
          id: 'reasoning_effort',
          category: 'thought_level',
          option_type: 'select',
          current_value: 'xhigh',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Ultra' },
          ],
        },
      ],
    });
    mocks.setConfigOption.mockResolvedValue({
      confirmation: 'observed',
      config_options: [
        {
          id: 'reasoning_effort',
          category: 'thought_level',
          option_type: 'select',
          current_value: 'high',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Ultra' },
          ],
        },
      ],
    });
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

    const autoButton = await screen.findByRole('button', { name: /自动（推荐）/ });

    await userEvent.click(autoButton);

    expect(await screen.findByRole('menuitem', { name: /自动（推荐）/ })).toHaveTextContent(
      '当前 GPT-5.5 · 推理超高 · 跟随最新最强'
    );
    expect(screen.getByText('GPT-5.5').closest('[role="menuitem"]')).toHaveTextContent('固定此模型');
    expect(screen.getByText('GPT-5.5').closest('[role="menuitem"]')).not.toHaveTextContent('推理超高');
    fireEvent.click(screen.getByText('GPT-5.4').closest('[role="menuitem"]')!);

    await waitFor(() => {
      expect(mocks.setModel).toHaveBeenCalledWith({ conversation_id: 'codex-conversation', model_id: 'gpt-5.4' });
    });
  });

  it('renders App default Codex model options from the product profile', async () => {
    mocks.acpModelInfo = buildCodexDefaultModelInfo();

    render(<AcpModelSelector conversation_id='new-codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /自动（推荐）/ });

    await userEvent.click(autoButton);

    expect(await screen.findByText('GPT-5.5')).toBeInTheDocument();
    expect(await screen.findByText('GPT-5.4')).toBeInTheDocument();
    expect(screen.queryByText('gpt-5.4')).not.toBeInTheDocument();
    expect(screen.queryByText('Model switch not supported')).not.toBeInTheDocument();
  });

  it('lets users override Codex reasoning effort from ACP options in the selector menu', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /自动（推荐）/ });
    expect(screen.queryByTestId('opl-reasoning-effort-selector')).not.toBeInTheDocument();

    await userEvent.click(autoButton);

    expect(await screen.findByRole('menuitem', { name: '低' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '中' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: '高' }));

    await waitFor(() => {
      expect(mocks.setConfigOption).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        option_id: 'reasoning_effort',
        value: 'high',
      });
    });
  });
});

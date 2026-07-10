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
  executeAction: vi.fn(),
  agentsData: [] as unknown[],
  acpModelInfo: null as AcpModelInfo | null,
  mutateModelInfo: vi.fn(),
  clientConfigGet: vi.fn(),
  clientConfigSet: vi.fn(),
  clientConfigSetLocal: vi.fn(),
  clientConfigSubscribe: vi.fn(),
  clientConfigStore: {} as Record<string, unknown>,
  clientConfigSubscribers: new Set<() => void>(),
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
    oplRuntime: {
      executeAction: { invoke: mocks.executeAction },
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

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.clientConfigGet,
    set: mocks.clientConfigSet,
    setLocal: mocks.clientConfigSetLocal,
    subscribe: mocks.clientConfigSubscribe,
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
      if (key === 'common.model') return '模型';
      return String(options?.defaultValue ?? key);
    },
  }),
}));

const intelligenceStatusResult = (enabled: boolean) => ({
  ok: true,
  parsed: {
    app_action_execution: {
      result: {
        opl_flow_intelligence_enhancement: { enabled },
      },
    },
  },
});

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
        current_value: 'max',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Extra high' },
          { value: 'max', label: 'Max' },
          { value: 'ultra', label: 'Ultra' },
        ],
      },
    ];
    mocks.conversationUpdate.mockReset();
    mocks.writeRendererLog.mockReset();
    mocks.responseStreamOn.mockReset();
    mocks.executeAction.mockReset();
    mocks.mutateModelInfo.mockReset();
    mocks.clientConfigGet.mockReset();
    mocks.clientConfigSet.mockReset();
    mocks.clientConfigSetLocal.mockReset();
    mocks.clientConfigSubscribe.mockReset();
    mocks.clientConfigStore = { 'codex.oplFlowIntelligenceEnhancementMode': false };
    mocks.clientConfigSubscribers = new Set();
    mocks.clientConfigGet.mockImplementation((key: string) => mocks.clientConfigStore[key]);
    mocks.clientConfigSet.mockImplementation((key: string, value: unknown) => {
      mocks.clientConfigStore[key] = value;
      for (const subscriber of mocks.clientConfigSubscribers) subscriber();
      return Promise.resolve();
    });
    mocks.clientConfigSetLocal.mockImplementation((key: string, value: unknown) => {
      mocks.clientConfigStore[key] = value;
      for (const subscriber of mocks.clientConfigSubscribers) subscriber();
    });
    mocks.clientConfigSubscribe.mockImplementation((_key: string, subscriber: () => void) => {
      mocks.clientConfigSubscribers.add(subscriber);
      return () => mocks.clientConfigSubscribers.delete(subscriber);
    });
    mocks.getModel.mockRejectedValue(new Error('session not ready'));
    mocks.setModel.mockResolvedValue(undefined);
    mocks.getConfigOptions.mockResolvedValue({
      config_options: [
        {
          id: 'reasoning_effort',
          category: 'thought_level',
          option_type: 'select',
          current_value: 'max',
          options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'xhigh', label: 'Extra high' },
            { value: 'max', label: 'Max' },
            { value: 'ultra', label: 'Ultra' },
          ],
        },
      ],
    });
    mocks.setConfigOption.mockImplementation(({ value }: { value: string }) =>
      Promise.resolve({
        confirmation: 'observed',
        config_options: [
          {
            id: 'reasoning_effort',
            category: 'thought_level',
            option_type: 'select',
            current_value: value,
            options: [
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'xhigh', label: 'Extra high' },
              { value: 'max', label: 'Max' },
              { value: 'ultra', label: 'Ultra' },
            ],
          },
        ],
      })
    );
    mocks.conversationUpdate.mockResolvedValue(true);
    mocks.writeRendererLog.mockResolvedValue(undefined);
    mocks.responseStreamOn.mockReturnValue(() => undefined);
    mocks.executeAction.mockImplementation(({ actionId }: { actionId: string }) =>
      Promise.resolve(intelligenceStatusResult(actionId === 'intelligence_enhancement_status' ? false : true))
    );
    mocks.acpModelInfo = {
      current_model_id: 'gpt-5.6-sol',
      current_model_label: 'GPT-5.6-Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.5', label: 'GPT-5.5' },
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
              { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
              { id: 'gpt-5.5', label: 'GPT-5.5' },
              { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1 mini' },
            ],
          },
        },
      },
    ];
  });

  it('uses auto latest Codex as the default visible selector on the fixed App path', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 超高/ });
    expect(autoButton).not.toHaveTextContent('自动（推荐）');

    await userEvent.click(autoButton);

    expect(await screen.findByRole('menuitem', { name: /自动（推荐）/ })).toHaveTextContent(
      '当前 5.6 Sol · 推理超高 · 跟随最新最强'
    );
    expect(screen.queryByText('推理')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '最小' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '高' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '超高' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '最大' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '极高' })).toBeInTheDocument();
    expect(screen.queryByText('模型')).not.toBeInTheDocument();
    expect(screen.getByText('5.6 Sol').closest('.arco-dropdown-menu-pop-header')).toBeInTheDocument();
    expect(screen.getByText('智力增强').closest('.arco-dropdown-menu-pop-header')).toBeInTheDocument();
    expect(screen.queryByText('GPT-5.5')).not.toBeInTheDocument();

    expect(mocks.setModel).not.toHaveBeenCalled();
  });

  it('renders App default Codex model options from the product profile', async () => {
    mocks.acpModelInfo = buildCodexDefaultModelInfo();

    render(<AcpModelSelector conversation_id='new-codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 超高/ });

    await userEvent.click(autoButton);

    expect(screen.getByText('5.6 Sol').closest('.arco-dropdown-menu-pop-header')).toBeInTheDocument();
    expect(screen.queryByText('GPT-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('Model switch not supported')).not.toBeInTheDocument();
  });

  it('restores Auto to the first available App model when Sol is unavailable', async () => {
    mocks.acpModelInfo = {
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5',
      available_models: [
        { id: 'gpt-5.5', label: 'GPT-5.5' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
      ],
    };
    mocks.configOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        option_type: 'select',
        current_value: 'high',
        options: [
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Extra high' },
          { value: 'max', label: 'Max' },
          { value: 'ultra', label: 'Ultra' },
        ],
      },
    ];
    mocks.setModel.mockResolvedValue({
      model_info: {
        current_model_id: 'gpt-5.6-terra',
        current_model_label: 'GPT-5.6-Terra',
        available_models: mocks.acpModelInfo.available_models,
      },
    });

    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    await userEvent.click(await screen.findByRole('button', { name: /5\.5 高/ }));
    const autoOption = await screen.findByRole('menuitem', { name: /自动（推荐）/ });
    expect(autoOption).toHaveTextContent('当前 5.6 Terra · 推理超高 · 跟随最新最强');
    fireEvent.click(autoOption);

    await waitFor(() => {
      expect(mocks.setModel).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        model_id: 'gpt-5.6-terra',
      });
      expect(mocks.setConfigOption).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        option_id: 'reasoning_effort',
        value: 'xhigh',
      });
      expect(mocks.clientConfigSet).toHaveBeenCalledWith('acp.config', { codex: {} });
    });
  });

  it('refreshes OPL Flow intelligence enhancement status when opening the selector menu', async () => {
    mocks.clientConfigStore = { 'codex.oplFlowIntelligenceEnhancementMode': true };
    mocks.executeAction.mockResolvedValueOnce(intelligenceStatusResult(false));

    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    await userEvent.click(await screen.findByRole('button', { name: /5\.6 Sol 超高/ }));

    await waitFor(() => {
      expect(mocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      });
      expect(mocks.clientConfigSetLocal).toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', false);
    });
  });

  it('lets users override Codex reasoning effort from ACP options in the selector menu', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 超高/ });
    expect(screen.queryByTestId('opl-reasoning-effort-selector')).not.toBeInTheDocument();

    await userEvent.click(autoButton);

    expect(screen.queryByText('推理')).not.toBeInTheDocument();
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

  it('runs the OPL Flow intelligence enhancement action from the submenu', async () => {
    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    await userEvent.click(await screen.findByRole('button', { name: /5\.6 Sol 超高/ }));
    await waitFor(() => {
      expect(mocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      });
    });
    fireEvent.mouseEnter(screen.getByText('智力增强'));
    fireEvent.click(await screen.findByRole('menuitem', { name: '开启' }));

    await waitFor(() => {
      expect(mocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_enable',
        dryRun: false,
      });
      expect(mocks.clientConfigSet).toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', true);
    });
  });

  it('restores Codex auto reasoning to xhigh when users click Auto again', async () => {
    mocks.configOptions = [
      {
        id: 'reasoning_effort',
        category: 'thought_level',
        option_type: 'select',
        current_value: 'high',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'xhigh', label: 'Extra high' },
          { value: 'max', label: 'Max' },
          { value: 'ultra', label: 'Ultra' },
        ],
      },
    ];

    render(<AcpModelSelector conversation_id='codex-conversation' backend='codex' />);

    const autoButton = await screen.findByRole('button', { name: /5\.6 Sol 高/ });
    await userEvent.click(autoButton);
    fireEvent.click(await screen.findByRole('menuitem', { name: /自动（推荐）/ }));

    await waitFor(() => {
      expect(mocks.setConfigOption).toHaveBeenCalledWith({
        conversation_id: 'codex-conversation',
        option_id: 'reasoning_effort',
        value: 'xhigh',
      });
    });
  });
});

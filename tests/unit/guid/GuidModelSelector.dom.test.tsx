import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  executeAction: vi.fn(),
  clientConfigGet: vi.fn(),
  clientConfigSet: vi.fn(),
  clientConfigSetLocal: vi.fn(),
  clientConfigSubscribe: vi.fn(),
  clientConfigStore: {} as Record<string, unknown>,
  clientConfigSubscribers: new Set<() => void>(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      executeAction: { invoke: mocks.executeAction },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: [] }),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mocks.clientConfigGet,
    set: mocks.clientConfigSet,
    setLocal: mocks.clientConfigSetLocal,
    subscribe: mocks.clientConfigSubscribe,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'conversation.welcome.autoModel') return `自动：${String(options?.model)}`;
      if (key === 'common.defaultModel') return '默认模型';
      if (key === 'conversation.welcome.modelSwitchNotSupported') return '不支持模型切换';
      if (key === 'common.model') return '模型';
      return String(options?.defaultValue ?? key);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
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

describe('GuidModelSelector Codex display', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.executeAction.mockReset();
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
    mocks.executeAction.mockImplementation(({ actionId }: { actionId: string }) =>
      Promise.resolve(intelligenceStatusResult(actionId === 'intelligence_enhancement_status' ? false : true))
    );
  });

  it('keeps model and reasoning controls in one menu without repeating reasoning on ordinary Home', async () => {
    const setSelectedAcpModel = vi.fn();
    const setSelectedReasoningEffort = vi.fn();

    render(
      <GuidModelSelector
        backend='codex'
        isGeminiMode={false}
        modelList={[]}
        current_model={undefined}
        setCurrentModel={vi.fn()}
        currentAcpCachedModelInfo={{
          current_model_id: 'gpt-5.6-sol',
          current_model_label: 'GPT-5.6-Sol',
          available_models: [
            { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
            { id: 'gpt-5.5', label: 'GPT-5.5' },
          ],
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={setSelectedAcpModel}
        selectedReasoningEffort={null}
        setSelectedReasoningEffort={setSelectedReasoningEffort}
      />
    );

    const selector = screen.getByTestId('guid-model-selector');
    expect(selector).toHaveTextContent('5.6 Sol 极高');
    expect(selector).not.toHaveTextContent('自动（推荐）');
    expect(screen.queryByTestId('guid-reasoning-effort-selector')).not.toBeInTheDocument();

    await userEvent.click(selector);
    await waitFor(() => {
      expect(mocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      });
    });

    expect(await screen.findByRole('menuitem', { name: /自动（推荐）/ })).toBeInTheDocument();
    expect(screen.getByText('当前 5.6 Sol · 推理极高 · 跟随最新最强')).toBeInTheDocument();
    expect(screen.queryByText('推理')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '最小' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '低' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '中' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '高' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '超高' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '极高' })).toBeInTheDocument();
    expect(screen.queryByText('模型')).not.toBeInTheDocument();
    expect(screen.getByText('5.6 Sol').closest('.arco-dropdown-menu-pop-header')).toBeInTheDocument();
    expect(screen.getByText('智力增强').closest('.arco-dropdown-menu-pop-header')).toBeInTheDocument();
    expect(screen.queryByText('GPT-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.3-codex')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '高' }));

    expect(setSelectedReasoningEffort).toHaveBeenCalledWith('high');

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

  it('refreshes OPL Flow intelligence enhancement status when opening the Home selector menu', async () => {
    const setSelectedAcpModel = vi.fn();
    const setSelectedReasoningEffort = vi.fn();
    mocks.clientConfigStore = { 'codex.oplFlowIntelligenceEnhancementMode': true };
    mocks.executeAction.mockResolvedValueOnce(intelligenceStatusResult(false));

    render(
      <GuidModelSelector
        backend='codex'
        isGeminiMode={false}
        modelList={[]}
        current_model={undefined}
        setCurrentModel={vi.fn()}
        currentAcpCachedModelInfo={{
          current_model_id: 'gpt-5.5',
          current_model_label: 'GPT-5.5（超高）',
          available_models: [{ id: 'gpt-5.5', label: 'GPT-5.5（超高）' }],
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={setSelectedAcpModel}
        selectedReasoningEffort={null}
        setSelectedReasoningEffort={setSelectedReasoningEffort}
      />
    );

    await userEvent.click(screen.getByTestId('guid-model-selector'));

    await waitFor(() => {
      expect(mocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      });
      expect(mocks.clientConfigSetLocal).toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', false);
    });
  });

  it('restores default reasoning when users click Auto again', async () => {
    const setSelectedAcpModel = vi.fn();
    const setSelectedReasoningEffort = vi.fn();

    render(
      <GuidModelSelector
        backend='codex'
        isGeminiMode={false}
        modelList={[]}
        current_model={undefined}
        setCurrentModel={vi.fn()}
        currentAcpCachedModelInfo={{
          current_model_id: 'gpt-5.5',
          current_model_label: 'GPT-5.5',
          available_models: [{ id: 'gpt-5.5', label: 'GPT-5.5' }],
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={setSelectedAcpModel}
        selectedReasoningEffort='high'
        setSelectedReasoningEffort={setSelectedReasoningEffort}
      />
    );

    await userEvent.click(screen.getByTestId('guid-model-selector'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /自动（推荐）/ }));

    expect(setSelectedAcpModel).toHaveBeenCalledWith(null);
    expect(setSelectedReasoningEffort).toHaveBeenCalledWith(null);
  });

  it('routes Gemini add-model actions through the App-owned environment settings page', async () => {
    render(
      <GuidModelSelector
        backend='gemini'
        isGeminiMode={true}
        modelList={[]}
        current_model={undefined}
        setCurrentModel={vi.fn()}
        currentAcpCachedModelInfo={null}
        selectedAcpModel={null}
        setSelectedAcpModel={vi.fn()}
      />
    );

    await userEvent.click(screen.getByTestId('guid-model-selector'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /settings.addModel/ }));

    expect(mocks.navigate).toHaveBeenCalledWith('/settings/environment');
    expect(mocks.navigate).not.toHaveBeenCalledWith('/settings/model');
  });
});

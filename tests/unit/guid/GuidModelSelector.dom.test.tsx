import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: [] }),
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

describe('GuidModelSelector Codex display', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
  });

  it('keeps model and reasoning controls in one menu without repeating reasoning on ordinary Home', async () => {
    const setSelectedAcpModel = vi.fn();
    const setSelectedReasoningEffort = vi.fn();
    const setCodexModelSelection = vi.fn();

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
        setCodexModelSelection={setCodexModelSelection}
      />
    );

    const selector = screen.getByTestId('guid-model-selector');
    expect(selector).toHaveTextContent('5.6 Sol 最大');
    expect(selector).not.toHaveTextContent('自动（推荐）');
    expect(screen.queryByTestId('guid-reasoning-effort-selector')).not.toBeInTheDocument();

    await userEvent.click(selector);

    expect(await screen.findByRole('menuitem', { name: /自动（推荐）/ })).toBeInTheDocument();
    expect(screen.getByText('当前 5.6 Sol · 推理最大 · 跟随最新最强')).toBeInTheDocument();
    expect(screen.queryByText('推理')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '最小' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '低' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '中' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '高' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '超高' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '最大' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '极高' })).toBeInTheDocument();
    expect(screen.queryByText('模型')).not.toBeInTheDocument();
    expect(screen.getByText('5.6 Sol').closest('.arco-dropdown-menu-pop-header')).toBeInTheDocument();
    expect(screen.queryByText('智力增强')).not.toBeInTheDocument();
    expect(screen.queryByText('GPT-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.5')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.3-codex')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '高' }));

    expect(setCodexModelSelection).toHaveBeenCalledWith('gpt-5.6-sol', 'high');
    expect(setSelectedAcpModel).not.toHaveBeenCalled();
    expect(setSelectedReasoningEffort).not.toHaveBeenCalled();
  });

  it('shows the highest advertised reasoning effort for an unknown future Auto model', () => {
    render(
      <GuidModelSelector
        backend='codex'
        isGeminiMode={false}
        modelList={[]}
        current_model={undefined}
        setCurrentModel={vi.fn()}
        currentAcpCachedModelInfo={{
          current_model_id: 'gpt-6',
          current_model_label: 'GPT-6',
          available_models: [
            {
              id: 'gpt-6',
              label: 'GPT-6',
              isDefault: true,
              supportedReasoningEfforts: [
                { reasoningEffort: 'high' },
                { reasoningEffort: 'xhigh' },
                { reasoningEffort: 'ultra' },
              ],
            },
          ],
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={vi.fn()}
        selectedReasoningEffort={null}
        setSelectedReasoningEffort={vi.fn()}
      />
    );

    expect(screen.getByTestId('guid-model-selector')).toHaveTextContent('6 极高');
  });

  it('restores default reasoning when users click Auto again', async () => {
    const setSelectedAcpModel = vi.fn();
    const setSelectedReasoningEffort = vi.fn();
    const setCodexModelSelection = vi.fn();

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
        setCodexModelSelection={setCodexModelSelection}
      />
    );

    await userEvent.click(screen.getByTestId('guid-model-selector'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /自动（推荐）/ }));

    expect(setCodexModelSelection).toHaveBeenCalledWith(null, null);
    expect(setSelectedAcpModel).not.toHaveBeenCalled();
    expect(setSelectedReasoningEffort).not.toHaveBeenCalled();
  });

  it('shows a stale fixed Codex model as unavailable instead of labeling it as Auto', async () => {
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
          available_models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' }],
        }}
        selectedAcpModel='gpt-5.6-codex'
        setSelectedAcpModel={vi.fn()}
        selectedReasoningEffort='high'
        setSelectedReasoningEffort={vi.fn()}
      />
    );

    expect(screen.getByTestId('guid-model-selector')).toHaveTextContent('gpt-5.6-codex');
    await userEvent.click(screen.getByTestId('guid-model-selector'));
    expect((await screen.findAllByText('gpt-5.6-codex')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
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

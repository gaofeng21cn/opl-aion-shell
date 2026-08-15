import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      if (key === 'agent.sessionConfiguration.menuLabel') return '会话配置';
      if (key === 'agent.sessionConfiguration.model') return '模型';
      if (key === 'agent.sessionConfiguration.reasoning') return '推理';
      if (key === 'agent.sessionConfiguration.resetDefaults') return '恢复默认';
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
    const user = userEvent.setup();
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
    expect(selector).toHaveTextContent('5.6 Sol 最高');
    expect(selector).not.toHaveTextContent('自动（推荐）');
    expect(selector.querySelector('[data-icon="brain"], .i-icon-brain')).toBeNull();
    expect(screen.queryByTestId('guid-reasoning-effort-selector')).not.toBeInTheDocument();

    await user.click(selector);

    const menu = await screen.findByTestId('opl-codex-session-menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    expect(within(menu).queryByText(/speed/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-codex-session-menu-model-choice-__auto')).not.toBeInTheDocument();

    const modelItem = screen.getByTestId('opl-codex-session-menu-model');
    expect(modelItem).not.toHaveFocus();
    fireEvent.click(modelItem);
    const autoChoice = await screen.findByTestId('opl-codex-session-menu-model-choice-__auto');
    expect(autoChoice).toHaveTextContent('当前 5.6 Sol · 最高 · 跟随最新最强');
    expect(autoChoice).toHaveAttribute('role', 'menuitemradio');
    expect(autoChoice).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opl-codex-session-menu-model-choice-gpt-5.5')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText('智力增强')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.3-codex')).not.toBeInTheDocument();

    fireEvent.keyDown(autoChoice, { key: 'ArrowLeft' });
    await waitFor(() => expect(modelItem).toHaveFocus());
    const reasoningItem = screen.getByTestId('opl-codex-session-menu-reasoning');
    fireEvent.click(reasoningItem);
    expect(screen.queryByTestId('opl-codex-session-menu-reasoning-choice-minimal')).not.toBeInTheDocument();
    expect(await screen.findByTestId('opl-codex-session-menu-reasoning-choice-low')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-medium')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-high')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-xhigh')).toBeInTheDocument();
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-max')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('opl-codex-session-menu-reasoning-choice-ultra')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('opl-codex-session-menu-reasoning-choice-high'));

    expect(setCodexModelSelection).toHaveBeenCalledWith('gpt-5.6-sol', 'high');
    expect(setSelectedAcpModel).not.toHaveBeenCalled();
    expect(setSelectedReasoningEffort).not.toHaveBeenCalled();
    await waitFor(() => expect(selector).toHaveFocus());

    await user.click(selector);
    const reopenedModelItem = await screen.findByTestId('opl-codex-session-menu-model');
    fireEvent.keyDown(reopenedModelItem, { key: 'Escape' });
    await waitFor(() => expect(selector).toHaveFocus());
    expect(selector).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens from ArrowDown and transfers focus into the shared menu', async () => {
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
        selectedAcpModel={null}
        setSelectedAcpModel={vi.fn()}
        selectedReasoningEffort={null}
        setSelectedReasoningEffort={vi.fn()}
      />
    );

    const selector = screen.getByTestId('guid-model-selector');
    selector.focus();
    fireEvent.keyDown(selector, { key: 'ArrowDown' });

    expect(await screen.findByTestId('opl-codex-session-menu')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('opl-codex-session-menu-model')).toHaveFocus());
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

    const selector = screen.getByTestId('guid-model-selector');
    await userEvent.click(selector);
    const resetItem = await screen.findByTestId('opl-codex-session-menu-reset');
    expect(resetItem.querySelector('[data-icon="refresh"], .i-icon-refresh')).not.toBeNull();
    fireEvent.click(resetItem);

    expect(setCodexModelSelection).toHaveBeenCalledWith(null, null);
    expect(setSelectedAcpModel).not.toHaveBeenCalled();
    expect(setSelectedReasoningEffort).not.toHaveBeenCalled();
    await waitFor(() => expect(selector).toHaveFocus());
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
    fireEvent.click(await screen.findByTestId('opl-codex-session-menu-model'));
    const unavailableChoice = await screen.findByTestId(
      'opl-codex-session-menu-model-choice-unavailable:gpt-5.6-codex'
    );
    expect(unavailableChoice).toBeDisabled();
    expect(unavailableChoice).toHaveAttribute('aria-disabled', 'true');
    expect(unavailableChoice).toHaveTextContent('gpt-5.6-codex');
    expect(within(unavailableChoice).getByText('Unavailable')).toBeInTheDocument();
  });

  it('routes Gemini add-model actions through the App-owned model access settings page', async () => {
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

    expect(mocks.navigate).toHaveBeenCalledWith('/settings/access');
    expect(mocks.navigate).not.toHaveBeenCalledWith('/settings/model');
  });
});

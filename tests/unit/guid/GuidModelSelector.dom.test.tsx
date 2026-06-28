import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GuidModelSelector from '@/renderer/pages/guid/components/GuidModelSelector';

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
      return String(options?.defaultValue ?? key);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('GuidModelSelector Codex display', () => {
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
          current_model_id: 'gpt-5.5',
          current_model_label: 'GPT-5.5（超高）',
          available_models: [
            { id: 'gpt-5.5', label: 'GPT-5.5（超高）' },
            { id: 'gpt-5.4', label: 'gpt-5.4' },
          ],
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={setSelectedAcpModel}
        selectedReasoningEffort={null}
        setSelectedReasoningEffort={setSelectedReasoningEffort}
      />
    );

    const selector = screen.getByTestId('guid-model-selector');
    expect(selector).toHaveTextContent('自动（推荐）');
    expect(selector).not.toHaveTextContent('GPT-5.5');
    expect(selector).not.toHaveTextContent('推理超高');
    expect(screen.queryByTestId('guid-reasoning-effort-selector')).not.toBeInTheDocument();

    await userEvent.click(selector);

    expect(await screen.findByRole('menuitem', { name: /自动（推荐）/ })).toBeInTheDocument();
    expect(screen.getByText('当前 GPT-5.5 · 推理超高 · 跟随最新最强')).toBeInTheDocument();
    expect(screen.getByText('GPT-5.4')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '最小' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '低' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '中' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '高' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '超高' })).toBeInTheDocument();
    expect(screen.queryByText('gpt-5.4')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.3-codex')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '高' }));

    expect(setSelectedReasoningEffort).toHaveBeenCalledWith('high');
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
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
  it('shows Auto plus friendly model and reasoning labels on ordinary Home', async () => {
    const setSelectedAcpModel = vi.fn();

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
            { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
          ],
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={setSelectedAcpModel}
      />
    );

    const selector = screen.getByTestId('guid-model-selector');
    expect(selector).toHaveTextContent('自动（推荐） · GPT-5.5 · 推理超高');

    await userEvent.click(selector);

    expect(await screen.findByText('自动（推荐）')).toBeInTheDocument();
    expect(screen.getByText('当前 GPT-5.5 · 推理超高 · 跟随最新最强')).toBeInTheDocument();
    expect(screen.getByText('GPT-5.4 · 推理超高')).toBeInTheDocument();
    expect(screen.getByText('GPT-5.3 Codex · 推理超高')).toBeInTheDocument();
    expect(screen.queryByText('gpt-5.4')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-5.3-codex')).not.toBeInTheDocument();
  });
});

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getAssociateConversation: { invoke: vi.fn().mockResolvedValue([]) },
      stop: { invoke: vi.fn().mockResolvedValue(undefined) },
      update: { invoke: vi.fn().mockResolvedValue(true) },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [] }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  resolveAssistantConfigId: () => undefined,
  usePresetAssistantInfo: () => ({ info: null, isLoading: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='cron-job-manager' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({
    headerLeft,
    headerExtra,
    children,
  }: {
    headerLeft?: React.ReactNode;
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid='chat-header-left'>{headerLeft}</div>
      <div data-testid='chat-header-extra'>{headerExtra}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  default: () => <div data-testid='chat-slider' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: ({
    loadedMcpServers,
    loadedMcpStatuses,
  }: {
    loadedMcpServers?: string[];
    loadedMcpStatuses?: Array<{ id: string; name: string; status: string }>;
  }) => (
    <div
      data-testid='acp-chat'
      data-mcp-servers={JSON.stringify(loadedMcpServers ?? [])}
      data-mcp-statuses={JSON.stringify(loadedMcpStatuses ?? [])}
    />
  ),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: () => <div data-testid='aionrs-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  default: () => <div data-testid='aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: ({ backend, initialModelId }: { backend?: string; initialModelId?: string }) => (
    <div data-testid='acp-model-selector' data-backend={backend} data-initial-model={initialModelId ?? ''} />
  ),
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector', () => ({
  default: () => <div data-testid='google-model-selector' />,
}));

const acpConversation = (backend: string): TChatConversation =>
  ({
    id: `${backend}-conversation`,
    name: `${backend} conversation`,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: {
      backend,
      current_model_id: backend === 'codex' ? 'gpt-5.5' : 'claude-opus-4.5',
    },
  }) as TChatConversation;

describe('ChatConversation Codex model surface', () => {
  it('shows the App-owned model selector for Codex ACP conversations', () => {
    render(<ChatConversation conversation={acpConversation('codex')} />);

    expect(screen.getByTestId('acp-chat')).toBeInTheDocument();
    expect(screen.getByTestId('acp-model-selector')).toHaveAttribute('data-backend', 'codex');
    expect(screen.getByTestId('acp-model-selector')).toHaveAttribute('data-initial-model', 'gpt-5.5');
  });

  it('keeps the model selector for non-Codex ACP agents', () => {
    render(<ChatConversation conversation={acpConversation('claude')} />);

    expect(screen.getByTestId('acp-model-selector')).toHaveAttribute('data-backend', 'claude');
    expect(screen.getByTestId('acp-model-selector')).toHaveAttribute('data-initial-model', 'claude-opus-4.5');
  });

  it('does not pass AionUI Team MCP snapshots into ordinary ACP conversations', () => {
    const conversation = acpConversation('codex');
    conversation.extra = {
      ...conversation.extra,
      mcp_servers: ['aionui-team', 'team_list_models'],
      mcp_statuses: [
        { id: 'aionui-team', name: 'aionui-team', status: 'loaded' },
        { id: 'mcp__aionui-team-team_members', name: 'team_members', status: 'failed' },
      ],
      session_mcp_servers: [
        { id: 'aionui-team', name: 'aionui-team', transport: { type: 'stdio', command: 'mcp-team-stdio' } },
      ],
      team_mcp_stdio_config: { port: 62520 },
      team_id: 'team-1',
      teamId: 'team-1',
    };

    render(<ChatConversation conversation={conversation} />);

    expect(screen.getByTestId('acp-chat')).toHaveAttribute('data-mcp-servers', '[]');
    expect(screen.getByTestId('acp-chat')).toHaveAttribute('data-mcp-statuses', '[]');
  });
});

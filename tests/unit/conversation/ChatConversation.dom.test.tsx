import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

const runtimeView = vi.hoisted(() => ({
  view: { state: 'running' },
  currentTask: { title: 'Current task' },
  activeTurnId: 'turn-1',
  isProcessing: true,
  stopActiveTurn: vi.fn().mockResolvedValue(true),
}));

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
    t: (key: string, options?: Record<string, unknown>) =>
      key === 'conversation.sidePanel.title' ? 'Files & Workspace' : String(options?.defaultValue ?? key),
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: {} }),
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
    environmentSlot,
    sider,
    siderTitle,
    currentTaskSlot,
    children,
  }: {
    environmentSlot?: React.ReactNode;
    sider?: React.ReactNode;
    siderTitle?: React.ReactNode;
    currentTaskSlot?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      <div data-testid='chat-environment'>{environmentSlot}</div>
      <div data-testid='chat-current-task'>{currentTaskSlot}</div>
      <div data-testid='chat-side-title'>{siderTitle}</div>
      <div data-testid='chat-side-panel'>{sider}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  default: ({ actionsSlot }: { actionsSlot?: React.ReactNode }) => (
    <div data-testid='chat-slider' data-has-actions={actionsSlot ? 'true' : 'false'}>
      {actionsSlot}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover', () => ({
  default: () => <div data-testid='environment-popover' />,
}));

vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => runtimeView,
}));

vi.mock('@/renderer/pages/conversation/runtime/CurrentTaskAwareness', () => ({
  hasCurrentTaskAwareness: (task?: { title?: string } | null) => Boolean(task?.title),
  default: ({ onStop, stopDisabled }: { onStop?: () => unknown; stopDisabled?: boolean }) => (
    <button type='button' disabled={stopDisabled} onClick={() => void onStop?.()}>
      Stop current task
    </button>
  ),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: ({
    loadedMcpServers,
    loadedMcpStatuses,
    timelineHeaderSlot,
  }: {
    loadedMcpServers?: string[];
    loadedMcpStatuses?: Array<{ id: string; name: string; status: string }>;
    timelineHeaderSlot?: React.ReactNode;
  }) => (
    <div
      data-testid='acp-chat'
      data-mcp-servers={JSON.stringify(loadedMcpServers ?? [])}
      data-mcp-statuses={JSON.stringify(loadedMcpStatuses ?? [])}
    >
      <div data-testid='message-list-scroller'>{timelineHeaderSlot}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation', () => ({
  default: () => <div data-testid='legacy-read-only-conversation' />,
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

const codexConversation = (): TChatConversation =>
  ({
    id: 'codex-conversation',
    name: 'Codex conversation',
    type: 'codex',
    created_at: 1,
    modified_at: 1,
    extra: {
      codexModel: 'gpt-5.5',
    },
  }) as TChatConversation;

describe('ChatConversation composer and side-panel surface', () => {
  beforeEach(() => {
    runtimeView.stopActiveTurn.mockClear();
  });

  it('keeps Codex model and cron controls out of the side panel', () => {
    render(<ChatConversation conversation={acpConversation('codex')} />);

    expect(screen.getByTestId('acp-chat')).toBeInTheDocument();
    expect(screen.getByTestId('chat-slider')).toHaveAttribute('data-has-actions', 'false');
    expect(screen.queryByTestId('acp-model-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-manager')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-side-title')).toHaveTextContent('Files & Workspace');
  });

  it('keeps legacy Codex history free of conversation side actions', () => {
    render(<ChatConversation conversation={codexConversation()} />);

    expect(screen.getByTestId('legacy-read-only-conversation')).toBeInTheDocument();
    expect(screen.getByTestId('chat-slider')).toHaveAttribute('data-has-actions', 'false');
    expect(screen.queryByTestId('acp-model-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-manager')).not.toBeInTheDocument();
  });

  it('keeps non-Codex ACP side panels free of model and cron actions', () => {
    render(<ChatConversation conversation={acpConversation('claude')} />);

    expect(screen.getByTestId('acp-chat')).toBeInTheDocument();
    expect(screen.getByTestId('chat-slider')).toHaveAttribute('data-has-actions', 'false');
    expect(screen.queryByTestId('acp-model-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cron-job-manager')).not.toBeInTheDocument();
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

  it('wires the current-task stop control to the active runtime turn', () => {
    render(<ChatConversation conversation={acpConversation('codex')} />);

    expect(screen.getByTestId('chat-current-task')).toBeEmptyDOMElement();
    expect(screen.getByTestId('message-list-scroller')).toContainElement(
      screen.getByRole('button', { name: 'Stop current task' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop current task' }));

    expect(runtimeView.stopActiveTurn).toHaveBeenCalledTimes(1);
  });
});

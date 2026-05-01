import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const mockPresetState = vi.hoisted(() => ({
  info: {
    name: 'Med Auto Science',
    logo: 'MAS',
    isEmoji: true,
  },
  isLoading: false,
}));

vi.mock('react-i18next', () => {
  const translations: Record<string, string> = {
    'conversation.header.assistantFallback': 'OPL 助手',
    'conversation.header.assistantStatusLabel': '{{assistant}}，{{model}}，{{status}}',
    'conversation.header.status.ready': '就绪',
    'conversation.header.status.running': '运行中',
    'conversation.header.status.pending': '等待中',
    'conversation.workspace.title': '工作空间',
  };

  return {
    useTranslation: () => ({
      t: (key: string, values?: Record<string, unknown>) => {
        let value = translations[key] || key;
        if (values) {
          Object.entries(values).forEach(([name, replacement]) => {
            value = value.replace(`{{${name}}}`, String(replacement));
          });
        }
        return value;
      },
    }),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModelInfo: {
        invoke: vi.fn().mockResolvedValue({
          success: true,
          data: {
            modelInfo: {
              currentModelId: 'gpt-5.5',
              currentModelLabel: 'gpt-5.5',
              availableModels: [{ id: 'gpt-5.5', label: 'gpt-5.5' }],
              canSwitch: true,
              source: 'models',
              sourceDetail: 'acp-models',
            },
          },
        }),
      },
      responseStream: {
        on: vi.fn(() => vi.fn()),
      },
    },
    application: {
      getPath: { invoke: vi.fn().mockResolvedValue('/Users/tester') },
    },
    fs: {
      readFile: { invoke: vi.fn().mockResolvedValue('model = "gpt-5.5"\nmodel_reasoning_effort = "xhigh"\n') },
    },
    conversation: {
      get: { invoke: vi.fn() },
      getAssociateConversation: { invoke: vi.fn().mockResolvedValue([]) },
      createWithConversation: { invoke: vi.fn().mockResolvedValue(true) },
    },
  },
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'new-conversation-id'),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({
    info: mockPresetState.info,
    isLoading: mockPresetState.isLoading,
  }),
  resolveAssistantConfigId: (conversation: TChatConversation) =>
    ((conversation.extra as { presetAssistantId?: string }).presetAssistantId ?? null),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({
    headerLeft,
    headerExtra,
    children,
  }: {
    headerLeft?: React.ReactNode;
    headerExtra?: React.ReactNode;
    children?: React.ReactNode;
  }) => (
    <div data-testid='chat-layout'>
      <div data-testid='header-left'>{headerLeft}</div>
      <div data-testid='header-extra'>{headerExtra}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => <div data-testid='chat-sider' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: () => <div data-testid='acp-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat', () => ({
  default: () => <div data-testid='openclaw-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/nanobot/NanobotChat', () => ({
  default: () => <div data-testid='nanobot-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/remote/RemoteChat', () => ({
  default: () => <div data-testid='remote-chat' />,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='cron-manager' />,
}));

vi.mock('@/renderer/pages/conversation/components/ConversationSkillsIndicator', () => ({
  default: () => <div data-testid='skills-indicator' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/StarOfficeMonitorCard.tsx', () => ({
  default: () => <div data-testid='star-office-monitor' />,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => <div>gpt-5.5</div>,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({ children }: { children?: React.ReactNode }) => <button type='button'>{children}</button>;
  const Dropdown = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Tooltip = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const Menu = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  Menu.Item = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Typography = {
    Ellipsis: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  };
  return { Button, Dropdown, Menu, Tooltip, Typography };
});

vi.mock('@icon-park/react', () => ({
  History: () => <span data-testid='history-icon' />,
  Robot: () => <span data-testid='robot-icon' />,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { primary: '#000' },
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => undefined,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: undefined }),
}));

import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

const makeConversation = (status?: TChatConversation['status']): TChatConversation =>
  ({
    id: 'conv-1',
    name: 'Study Conversation',
    type: 'acp',
    status,
    createTime: 1,
    modifyTime: 1,
    model: {},
    extra: {
      backend: 'codex',
      workspace: '/tmp/opl-study',
      presetAssistantId: 'builtin-med-auto-science',
      currentModelId: 'gpt-5.5',
      cachedConfigOptions: [
        {
          id: 'reasoning_effort',
          type: 'select',
          category: 'config',
          currentValue: 'xhigh',
          selectedValue: 'xhigh',
        },
      ],
    },
  }) as TChatConversation;

describe('ChatConversation header', () => {
  beforeEach(() => {
    mockPresetState.info = {
      name: 'Med Auto Science',
      logo: 'MAS',
      isEmoji: true,
    };
    mockPresetState.isLoading = false;
  });

  it('shows assistant identity and status instead of the model selector', () => {
    render(<ChatConversation conversation={makeConversation('running')} />);

    const header = screen.getByTestId('conversation-assistant-status');
    expect(header).toHaveTextContent('Med Auto Science');
    expect(header).toHaveTextContent('gpt-5.5 / xhigh');
    expect(header).toHaveTextContent('运行中');
    expect(header).toHaveAttribute('aria-label', 'Med Auto Science，gpt-5.5 / xhigh，运行中');
    expect(screen.queryByText('gpt-5.5')).not.toBeInTheDocument();
  });

  it('uses a neutral ready state when the conversation is idle', () => {
    mockPresetState.info = null as unknown as typeof mockPresetState.info;

    render(<ChatConversation conversation={makeConversation('finished')} />);

    const header = screen.getByTestId('conversation-assistant-status');
    expect(header).toHaveTextContent('OPL 助手');
    expect(header).toHaveTextContent('就绪');
  });
});

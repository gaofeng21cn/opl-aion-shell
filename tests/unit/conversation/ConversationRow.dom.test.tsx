import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  getAgentLogo: () => null,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'conversation.history.managedWorktree' ? '隔离工作树' : key,
  }),
}));

const conversation = (workspace: string): TChatConversation =>
  ({
    id: 'thread-1',
    name: 'Worktree task',
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { backend: 'codex', workspace },
  }) as unknown as TChatConversation;

const renderRow = (workspace: string) => {
  const noop = vi.fn();
  const props: ConversationRowProps = {
    conversation: conversation(workspace),
    isGenerating: false,
    hasCompletionUnread: false,
    collapsed: false,
    tooltipEnabled: false,
    batchMode: false,
    checked: false,
    selected: false,
    menuVisible: false,
    onToggleChecked: noop,
    onConversationClick: noop,
    onOpenMenu: noop,
    onMenuVisibleChange: noop,
    onEditStart: noop,
    onDelete: noop,
    onTogglePin: noop,
    getJobStatus: () => 'none',
  };

  return render(<ConversationRow {...props} />);
};

describe('ConversationRow worktree indicator', () => {
  it('shows a localized accessible branch indicator for a Codex managed worktree', () => {
    renderRow('/Users/example/.codex/worktrees/abc123/one-person-lab-app');

    const indicator = screen.getByRole('img', { name: '隔离工作树' });
    expect(indicator).toHaveAttribute('data-opl-worktree-indicator', 'true');
    expect(indicator).toHaveAttribute('title', '隔离工作树');
    expect(indicator.querySelector('svg')).not.toBeNull();
  });

  it('does not show the indicator for a main workspace conversation', () => {
    renderRow('/Users/example/workspace/one-person-lab-app');

    expect(screen.queryByRole('img', { name: '隔离工作树' })).not.toBeInTheDocument();
  });
});

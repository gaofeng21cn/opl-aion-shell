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
    t: (key: string) => (key === 'conversation.history.managedWorktree' ? '隔离工作树' : key),
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

const renderRow = (workspace: string, overrides: Partial<ConversationRowProps> = {}) => {
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
    ...overrides,
  };

  return render(<ConversationRow {...props} />);
};

describe('ConversationRow worktree indicator', () => {
  it('shows a quiet waiting marker instead of the generating spinner only while input is pending', () => {
    const { container } = renderRow('/tmp/project', { isGenerating: true, isWaitingConfirmation: true });
    expect(screen.getByRole('img', { name: 'conversation.history.waitingConfirmation' })).toBeInTheDocument();
    expect(container.querySelector('[data-opl-icon="warning"]')).not.toBeNull();
    expect(container.querySelector('.arco-spin')).toBeNull();
    expect(container.querySelector('[data-opl-icon="message"]')).toBeNull();
  });

  it('keeps an ordinary expanded conversation row text-only like DSH history', () => {
    renderRow('/Users/example/workspace/one-person-lab-app');

    const row = document.querySelector('[id="c-thread-1"]');
    expect(row).not.toBeNull();
    expect(row).toHaveClass('opl-codex-history-row');
    expect(row).not.toHaveAttribute('data-opl-icon', 'message');
    expect(row?.querySelector('[data-opl-icon="message"]')).toBeNull();
    expect(row?.querySelector('img')).toBeNull();
    expect(row?.querySelector('.chat-history__item-name')).toHaveClass('text-13px', 'font-[400]', 'lh-20px');
  });

  it('shows a localized accessible branch indicator for a Codex managed worktree', () => {
    renderRow('/Users/example/.codex/worktrees/abc123/one-person-lab-app');

    const indicator = screen.getByRole('img', { name: '隔离工作树' });
    expect(indicator).toHaveAttribute('data-opl-worktree-indicator', 'true');
    expect(indicator).toHaveAttribute('title', '隔离工作树');
    const icon = indicator.querySelector('[data-opl-icon="branch"]');
    expect(icon).toHaveAttribute('data-opl-icon-source', 'deepseek-harness');
    expect(icon?.querySelector('svg')).not.toBeNull();
  });

  it('keeps the branch indicator from the recorded worktree after runtime fallback', () => {
    const recovered = conversation('/runtime/conversations/thread-1');
    recovered.extra = {
      ...recovered.extra,
      workspace_unavailable: true,
      canonical_recorded_workspace: '/Users/example/.codex/worktrees/abc123/one-person-lab-app',
      is_temporary_workspace: true,
    };
    const noop = vi.fn();

    render(
      <ConversationRow
        conversation={recovered}
        isGenerating={false}
        hasCompletionUnread={false}
        collapsed={false}
        tooltipEnabled={false}
        batchMode={false}
        checked={false}
        selected={false}
        menuVisible={false}
        onToggleChecked={noop}
        onConversationClick={noop}
        onOpenMenu={noop}
        onMenuVisibleChange={noop}
        onEditStart={noop}
        onDelete={noop}
        onTogglePin={noop}
        getJobStatus={() => 'none'}
      />
    );

    expect(screen.getByRole('img', { name: '隔离工作树' })).toBeInTheDocument();
  });

  it('does not show the indicator for a main workspace conversation', () => {
    renderRow('/Users/example/workspace/one-person-lab-app');

    expect(screen.queryByRole('img', { name: '隔离工作树' })).not.toBeInTheDocument();
  });
});

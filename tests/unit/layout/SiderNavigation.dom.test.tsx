import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';
import { SiderPrimaryNav, SiderSearchEntry, SiderToolbar } from '@/renderer/components/layout/Sider/SiderNav';

vi.mock('@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover', () => ({
  default: ({
    buttonClassName,
    fullWidth,
    label,
  }: {
    buttonClassName?: string;
    fullWidth?: boolean;
    label?: string;
  }) => (
    <button
      type='button'
      aria-label='Search conversations'
      className={buttonClassName}
      data-full-width={String(Boolean(fullWidth))}
    >
      {fullWidth ? label : null}
    </button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.welcome.newTask': 'New task',
        'conversation.history.archivedTitle': 'Archived',
        'common.runtime.sidebarEntry': 'Runtime',
        'common.primaryNavigation': 'Primary navigation',
        'common.account': 'Account',
        'common.help': 'Help',
        'common.settings': 'Settings',
        'settings.lightMode': 'Light mode',
        'settings.darkMode': 'Dark mode',
      })[key] ?? key,
  }),
}));

const tooltipProps = { disabled: true, popupVisible: false };

describe('Sider navigation hierarchy', () => {
  it('renders conversation search as a compact history-header icon action', () => {
    render(
      <SiderSearchEntry
        isMobile={false}
        collapsed={false}
        siderTooltipProps={tooltipProps}
        onConversationSelect={vi.fn()}
      />
    );

    const search = screen.getByRole('button', { name: 'Search conversations' });
    expect(search).toHaveAttribute('data-full-width', 'false');
    expect(search).toHaveClass('!w-32px', '!h-32px');
    expect(search).toHaveTextContent('');
  });

  it('orders primary actions before history utilities and keeps the footer compact', () => {
    const onRuntimeClick = vi.fn();
    const onSettingsClick = vi.fn();
    render(
      <div>
        <SiderToolbar isMobile={false} collapsed={false} siderTooltipProps={tooltipProps} onNewChat={vi.fn()} />
        <SiderPrimaryNav
          collapsed={false}
          isMobile={false}
          pathname='/guid'
          siderTooltipProps={tooltipProps}
          onRuntimeClick={onRuntimeClick}
          onArchivedClick={vi.fn()}
        />
        <div>Conversation history</div>
        <SiderFooter
          isMobile={false}
          isSettings={false}
          theme='light'
          siderTooltipProps={tooltipProps}
          onSettingsClick={onSettingsClick}
          onThemeToggle={vi.fn()}
        />
      </div>
    );

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
    expect(labels).toEqual(['New task', 'Runtime', 'Archived', 'Settings']);
    expect(screen.queryByText('Thread coordination')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Runtime' }));
    expect(onRuntimeClick).toHaveBeenCalledOnce();
    expect(screen.getByText('Conversation history')).toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sider-footer-settings'));
    expect(onSettingsClick).toHaveBeenCalledWith('general');
  });

  it('renders a connected account as a green circular initials avatar', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        theme='light'
        account={{ displayName: 'Feng Gao', email: 'gf@fenggaolab.org', initials: 'FG' }}
        siderTooltipProps={tooltipProps}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    const avatar = screen.getByTestId('sider-footer-account-avatar');
    expect(avatar).toHaveTextContent('FG');
    expect(avatar).toHaveClass('rounded-full', 'bg-success', 'text-inverse');
  });
});

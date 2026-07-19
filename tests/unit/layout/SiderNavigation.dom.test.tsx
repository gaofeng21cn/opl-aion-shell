import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';
import CronJobSiderSection from '@/renderer/components/layout/Sider/CronJobSiderSection';
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
        'cron.scheduledTasks': 'Scheduled Tasks',
        'common.primaryNavigation': 'Primary navigation',
        'common.account': 'Account',
        'common.help': 'Help',
        'common.settings': 'Settings',
        'settings.updateAvailable': 'Update available',
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

  it('keeps the scheduled job section fail-open when local storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => render(<CronJobSiderSection jobs={[]} pathname='/guid' onNavigate={vi.fn()} />)).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('keeps Runtime fail-closed while Scheduled and Archived remain reachable', () => {
    const onRuntimeClick = vi.fn();
    const onScheduledClick = vi.fn();
    const onArchivedClick = vi.fn();
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
          onScheduledClick={onScheduledClick}
          onArchivedClick={onArchivedClick}
        />
        <div>Conversation history</div>
        <SiderFooter
          isMobile={false}
          siderTooltipProps={tooltipProps}
          onSettingsClick={onSettingsClick}
          onUpdateClick={vi.fn()}
        />
      </div>
    );

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
    expect(labels).toEqual(['New task', 'Scheduled Tasks', 'Archived', 'Settings']);
    expect(screen.queryByText('Thread coordination')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Runtime' })).not.toBeInTheDocument();
    expect(onRuntimeClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Scheduled Tasks' }));
    expect(onScheduledClick).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(onArchivedClick).toHaveBeenCalledOnce();
    expect(screen.getByText('Conversation history')).toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sider-footer-update')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('sider-footer-settings'));
    expect(onSettingsClick).toHaveBeenCalledWith('general');
  });

  it('renders a connected account as a green circular initials avatar', () => {
    render(
      <SiderFooter
        isMobile={false}
        account={{ displayName: 'Feng Gao', email: 'gf@fenggaolab.org', initials: 'FG' }}
        siderTooltipProps={tooltipProps}
        onSettingsClick={vi.fn()}
        onUpdateClick={vi.fn()}
      />
    );

    const avatar = screen.getByTestId('sider-footer-account-avatar');
    expect(avatar).toHaveTextContent('FG');
    expect(avatar).toHaveClass('rounded-full', 'bg-success', 'text-inverse');
    expect(screen.getByTestId('sider-footer-account')).toHaveTextContent('Feng Gao');
    expect(screen.getByTestId('sider-footer-account')).not.toHaveTextContent('gf@fenggaolab.org');
  });

  it('shows a subtle trailing update action only when a newer App version is available', () => {
    const onUpdateClick = vi.fn();
    render(
      <SiderFooter
        isMobile={false}
        updateAvailable
        account={{ displayName: 'Feng Gao', email: 'gf@fenggaolab.org', initials: 'FG' }}
        siderTooltipProps={tooltipProps}
        onSettingsClick={vi.fn()}
        onUpdateClick={onUpdateClick}
      />
    );

    const update = screen.getByTestId('sider-footer-update');
    expect(update).toHaveAccessibleName('Update available');
    expect(update).toHaveAttribute('data-update-available', 'true');
    fireEvent.click(update);
    expect(onUpdateClick).toHaveBeenCalledOnce();
  });
});

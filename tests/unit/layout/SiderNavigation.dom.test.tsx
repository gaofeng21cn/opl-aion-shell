import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';
import { SiderPrimaryNav, SiderToolbar } from '@/renderer/components/layout/Sider/SiderNav';

vi.mock('@/renderer/pages/conversation/GroupedHistory/ThreadCoordination', () => ({
  default: () => <button type='button'>Thread coordination</button>,
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
  it('orders primary actions before history utilities and keeps the footer compact', () => {
    const onRuntimeClick = vi.fn();
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
          onSettingsClick={vi.fn()}
          onThemeToggle={vi.fn()}
        />
      </div>
    );

    const labels = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim())
      .filter(Boolean);
    expect(labels).toEqual(['New task', 'Runtime', 'Archived', 'Thread coordination', 'Settings']);
    fireEvent.click(screen.getByRole('button', { name: 'Runtime' }));
    expect(onRuntimeClick).toHaveBeenCalledOnce();
    expect(screen.getByText('Conversation history')).toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
    expect(screen.getByTestId('sider-footer-settings-content')).toHaveClass('flex', 'items-center', 'w-full');
  });
});

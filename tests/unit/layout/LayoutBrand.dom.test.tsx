import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '@/renderer/components/layout/Layout';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      logStream: { on: () => () => {} },
      openDevTools: { invoke: vi.fn(() => Promise.resolve()) },
    },
  },
}));

vi.mock('@/renderer/components/layout/Titlebar', () => ({
  default: () => <div data-testid='titlebar' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'common.collapseSidebar': 'Collapse sidebar',
          'common.primaryNavigation': 'Primary navigation',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock('@/renderer/components/layout/PwaPullToRefresh', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/settings/UpdateModal', () => ({
  default: () => null,
}));

vi.mock('@renderer/hooks/system/useDeepLink', () => ({
  useDeepLink: () => {},
}));

vi.mock('@renderer/hooks/system/useNotificationClick', () => ({
  useNotificationClick: () => {},
}));

vi.mock('@renderer/hooks/file/useDirectorySelection', () => ({
  useDirectorySelection: () => ({ contextHolder: null }),
}));

vi.mock('@renderer/hooks/ui/useConversationShortcuts', () => ({
  useConversationShortcuts: () => {},
}));

describe('Layout App branding', () => {
  it('renders the App-owned product name with a 300px adjustable desktop rail', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout sider={<div />} />}>
            <Route path='/' element={<div />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('One Person Lab')).toBeInTheDocument();
    expect(screen.queryByText('One Person Lab App')).not.toBeInTheDocument();
    expect(screen.queryByText('AionUi')).not.toBeInTheDocument();
    const navigationRail = screen.getByTestId('app-navigation-rail');
    expect(navigationRail).toHaveAttribute('data-sider-width', '300');
    expect(navigationRail.querySelector('img')).toBeNull();

    fireEvent.mouseDown(screen.getByTestId('app-navigation-rail-resize'), { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 380 });
    fireEvent.mouseUp(window);

    expect(screen.getByTestId('app-navigation-rail')).toHaveAttribute('data-sider-width', '340');
  });

  it('keeps a real narrow navigation rail when desktop sidebar content is collapsed', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true });
    const ToggleRail = () => {
      const layout = useLayoutContext();
      return <button onClick={() => layout?.setSiderCollapsed(true)}>Collapse rail</button>;
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout sider={<div />} />}>
            <Route path='/' element={<ToggleRail />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse rail' }));

    expect(screen.getByTestId('app-navigation-rail').closest('aside')).toHaveStyle({ width: '64px' });
  });

  it('treats the expanded mobile rail as a modal drawer and restores focus after Escape', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500, writable: true });
    const user = userEvent.setup();
    const OpenRail = () => {
      const layout = useLayoutContext();
      return (
        <button type='button' onClick={() => layout?.setSiderCollapsed(false)}>
          Open rail
        </button>
      );
    };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            element={
              <Layout
                sider={
                  <div>
                    <button type='button'>First rail action</button>
                    <button type='button'>Last rail action</button>
                  </div>
                }
              />
            }
          >
            <Route path='/' element={<OpenRail />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const opener = screen.getByRole('button', { name: 'Open rail' });
    await user.click(opener);

    const rail = screen.getByTestId('app-navigation-rail').closest('aside') as HTMLElement;
    const titlebar = screen.getByTestId('titlebar');
    const content = opener.closest('.layout-content') as HTMLElement;
    const closeButton = await screen.findByRole('button', { name: 'Collapse sidebar' });
    await waitFor(() => expect(rail).toHaveAttribute('role', 'dialog'));
    expect(rail).toHaveAccessibleName('Primary navigation');
    expect(rail).toHaveAttribute('aria-modal', 'true');
    expect(titlebar).toHaveAttribute('inert');
    expect(titlebar).toHaveAttribute('aria-hidden', 'true');
    expect(content).toHaveAttribute('inert');
    expect(content).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(closeButton).toHaveFocus());

    const lastRailAction = screen.getByRole('button', { name: 'Last rail action' });
    lastRailAction.focus();
    await user.keyboard('{Tab}');
    expect(closeButton).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(lastRailAction).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(rail).toHaveAttribute('aria-hidden', 'true'));
    expect(rail).toHaveAttribute('inert');
    expect(rail).not.toHaveAttribute('aria-modal');
    expect(rail).not.toHaveAttribute('tabindex');
    expect(titlebar).not.toHaveAttribute('inert');
    expect(titlebar).not.toHaveAttribute('aria-hidden');
    expect(content).not.toHaveAttribute('inert');
    expect(content).not.toHaveAttribute('aria-hidden');
    expect(opener).toHaveFocus();
  });
});

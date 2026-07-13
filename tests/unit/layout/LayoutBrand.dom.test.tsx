import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});

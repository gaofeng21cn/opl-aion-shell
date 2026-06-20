import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '@/renderer/components/layout/Layout';

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
  it('renders the App-owned product name in the sidebar header', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Layout sider={<div />} />}>
            <Route path='/' element={<div />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('One Person Lab App')).toBeInTheDocument();
    expect(screen.queryByText('AionUi')).not.toBeInTheDocument();
  });
});

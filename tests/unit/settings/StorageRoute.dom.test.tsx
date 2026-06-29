import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import Router from '@/renderer/components/layout/Router';

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

vi.mock('@/renderer/pages/settings/StorageSettings', () => ({
  default: () => <div data-testid='storage-route-page'>Storage route rendered</div>,
}));

vi.mock('@/renderer/pages/settings/sections/WorkspaceSettings', () => ({
  default: () => <div data-testid='workspace-route-page'>Workspace route rendered</div>,
}));

vi.mock('@/renderer/pages/settings/sections/LocalServicesSettings', () => ({
  default: () => <div data-testid='local-services-route-page'>Local Services route rendered</div>,
}));

describe('settings storage route', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('renders the Storage settings page at /settings/storage', async () => {
    window.location.hash = '#/settings/storage';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('storage-route-page')).toBeInTheDocument();
  });

  it('renders the Workspace settings page at /settings/workspace', async () => {
    window.location.hash = '#/settings/workspace';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('workspace-route-page')).toBeInTheDocument();
  });

  it('renders the Local Services settings page at /settings/local-services', async () => {
    window.location.hash = '#/settings/local-services';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('local-services-route-page')).toBeInTheDocument();
  });
});

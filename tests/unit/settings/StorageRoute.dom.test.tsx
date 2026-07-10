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

vi.mock('@/renderer/pages/settings/sections/RuntimeSettings', () => ({
  default: () => <div data-testid='environment-route-page'>Maintenance route rendered</div>,
}));

vi.mock('@/renderer/pages/FirstRun', () => ({
  default: () => <div data-testid='first-run-route-page'>First-run route rendered</div>,
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

  it('redirects the legacy Local Services route to its Maintenance owner page', async () => {
    window.location.hash = '#/settings/local-services';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('environment-route-page')).toBeInTheDocument();
    expect(screen.queryByTestId('local-services-route-page')).not.toBeInTheDocument();
    expect(window.location.hash).toContain('/settings/environment');
  });

  it('renders focused first-run outside the ordinary product layout', async () => {
    window.location.hash = '#/first-run';

    render(
      <Router
        layout={
          <div data-testid='ordinary-product-layout'>
            <Outlet />
          </div>
        }
      />
    );

    expect(await screen.findByTestId('first-run-route-page')).toBeInTheDocument();
    expect(screen.queryByTestId('ordinary-product-layout')).not.toBeInTheDocument();
  });
});

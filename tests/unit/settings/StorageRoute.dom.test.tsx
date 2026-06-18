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

describe('settings storage route', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('renders the Storage settings page at /settings/storage', async () => {
    window.location.hash = '#/settings/storage';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('storage-route-page')).toBeInTheDocument();
  });
});

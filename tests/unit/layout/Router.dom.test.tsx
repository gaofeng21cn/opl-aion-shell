import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import Router from '@/renderer/components/layout/Router';

const authState = vi.hoisted(() => ({ status: 'authenticated' as 'authenticated' | 'unauthenticated' }));
const loginPageRenderMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/renderer/pages/login', () => ({
  default: () => {
    loginPageRenderMock();
    return <div data-testid='login-route-page'>Login route rendered</div>;
  },
}));

vi.mock('@/renderer/pages/guid', () => ({
  default: () => <div data-testid='guid-route-page'>Guid route rendered</div>,
}));

describe('ordinary startup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.status = 'authenticated';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it.each([
    ['the root route', '#/'],
    ['the legacy startup gate route', '#/startup-gate'],
    ['an unknown authenticated route', '#/not-a-real-route'],
  ])('sends %s directly to Guid', async (_label, initialHash) => {
    window.location.hash = initialHash;

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('guid-route-page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/guid'));
  });

  it('lets LoginPage preserve the fresh-login setup-check intent before entering Guid', async () => {
    window.location.hash = '#/login';

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('login-route-page')).toBeInTheDocument();
    expect(loginPageRenderMock).toHaveBeenCalled();
    expect(screen.queryByTestId('guid-route-page')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#/login');
  });
});

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import Router from '@/renderer/components/layout/Router';

const authState = vi.hoisted(() => ({ status: 'authenticated' as 'authenticated' | 'unauthenticated' }));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/renderer/pages/guid', () => ({
  default: () => <div data-testid='guid-route-page'>Guid route rendered</div>,
}));

describe('ordinary startup routes', () => {
  beforeEach(() => {
    authState.status = 'authenticated';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it.each([
    ['the root route', '#/'],
    ['an authenticated login route', '#/login'],
    ['the legacy startup gate route', '#/startup-gate'],
    ['an unknown authenticated route', '#/not-a-real-route'],
  ])('sends %s directly to Guid', async (_label, initialHash) => {
    window.location.hash = initialHash;

    render(<Router layout={<Outlet />} />);

    expect(await screen.findByTestId('guid-route-page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/guid'));
  });
});

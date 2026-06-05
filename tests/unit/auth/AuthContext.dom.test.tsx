import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

function resetDesktopGlobals(): void {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  delete (window as unknown as { __backendPort?: number }).__backendPort;
  delete (globalThis as unknown as { electronAPI?: unknown }).electronAPI;
  delete (globalThis as unknown as { __backendPort?: number }).__backendPort;
}

describe('AuthContext desktop runtime detection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    resetDesktopGlobals();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    resetDesktopGlobals();
  });

  it('treats a preload-exposed backend port as desktop runtime without Web auth fetches', async () => {
    (window as unknown as { __backendPort?: number }).__backendPort = 49155;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { AuthProvider, useAuth } = await import('@/renderer/hooks/context/AuthContext');

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <span data-testid='auth-ready'>{String(auth.ready)}</span>
          <span data-testid='auth-status'>{auth.status}</span>
          <span data-testid='auth-user'>{auth.user?.username ?? 'none'}</span>
        </div>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('auth-ready')).toHaveTextContent('true'));
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('none');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

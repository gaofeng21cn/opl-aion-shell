import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  listener: null as ((payload: { action: 'navigate'; params: { route: string } }) => void) | null,
  takePending: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    deepLink: {
      received: {
        on: (listener: typeof bridge.listener) => {
          bridge.listener = listener;
          return () => {
            if (bridge.listener === listener) bridge.listener = null;
          };
        },
      },
      takePending: { invoke: bridge.takePending },
    },
  },
}));

import { useDeepLink } from '@/renderer/hooks/system/useDeepLink';

const Harness = () => {
  useDeepLink();
  const location = useLocation();
  return <div data-testid='route'>{location.pathname}</div>;
};

const renderHookRoute = () =>
  render(
    <MemoryRouter initialEntries={['/guid']}>
      <Harness />
    </MemoryRouter>
  );

describe('useDeepLink', () => {
  beforeEach(() => {
    bridge.listener = null;
    bridge.takePending.mockReset().mockResolvedValue([]);
  });

  it('navigates to an exact App-owned route', async () => {
    renderHookRoute();
    await waitFor(() => expect(bridge.listener).not.toBeNull());

    act(() => bridge.listener?.({ action: 'navigate', params: { route: '/settings/about' } }));

    expect(screen.getByTestId('route')).toHaveTextContent('/settings/about');
  });

  it('pulls a validated cold-start payload after subscribing', async () => {
    bridge.takePending.mockResolvedValue([{ action: 'navigate', params: { route: '/scheduled' } }]);
    renderHookRoute();

    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/scheduled'));
    expect(bridge.takePending).toHaveBeenCalledOnce();
  });

  it('drops a forged non-registry route without exposing it in the reason log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderHookRoute();
    await waitFor(() => expect(bridge.listener).not.toBeNull());

    act(() => bridge.listener?.({ action: 'navigate', params: { route: '/conversation/private-token' } }));

    expect(screen.getByTestId('route')).toHaveTextContent('/guid');
    expect(warn).toHaveBeenCalledWith('[DeepLink] rejected: route_not_allowed');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('/conversation/private-token');
    warn.mockRestore();
  });
});

import { getAdjacentConversationId, useConversationShortcuts } from '@/renderer/hooks/ui/useConversationShortcuts';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  listener: null as ((event: { command: 'back' | 'forward' | 'previous-task' | 'next-task' }) => void) | null,
  setState: vi.fn().mockResolvedValue(undefined),
}));
const navigationHistory = vi.hoisted(() => ({
  canBack: false,
  canForward: false,
  back: vi.fn(),
  forward: vi.fn(),
}));
const visibleConversations = vi.hoisted(() => ({ ids: ['first', 'second', 'third'] }));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      setDesktopNavigationState: { invoke: bridge.setState },
      desktopNavigationCommand: {
        on: (listener: typeof bridge.listener) => {
          bridge.listener = listener;
          return () => {
            if (bridge.listener === listener) bridge.listener = null;
          };
        },
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/NavigationHistoryContext', () => ({
  useNavigationHistory: () => navigationHistory,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds', () => ({
  useVisibleConversationIds: () => visibleConversations.ids,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

const Harness = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useConversationShortcuts({ navigate });
  return <div data-testid='route'>{location.pathname}</div>;
};

const renderRoute = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Harness />
    </MemoryRouter>
  );

describe('desktop conversation navigation', () => {
  beforeEach(() => {
    bridge.listener = null;
    bridge.setState.mockClear();
    navigationHistory.canBack = false;
    navigationHistory.canForward = false;
    navigationHistory.back.mockClear();
    navigationHistory.forward.mockClear();
    visibleConversations.ids = ['first', 'second', 'third'];
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  it('moves through visible conversations without wrapping at either boundary', async () => {
    renderRoute('/conversation/second');
    await waitFor(() => expect(bridge.listener).not.toBeNull());

    act(() => bridge.listener?.({ command: 'next-task' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/conversation/third');

    act(() => bridge.listener?.({ command: 'next-task' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/conversation/third');
    expect(getAdjacentConversationId(visibleConversations.ids, 'first', -1)).toBeNull();
  });

  it('reports disabled boundary actions and executes only available history commands', async () => {
    navigationHistory.canBack = true;
    renderRoute('/conversation/first');
    await waitFor(() => expect(bridge.setState).toHaveBeenCalled());

    expect(bridge.setState).toHaveBeenLastCalledWith({
      canBack: true,
      canForward: false,
      canPreviousTask: false,
      canNextTask: true,
    });

    act(() => bridge.listener?.({ command: 'back' }));
    act(() => bridge.listener?.({ command: 'forward' }));

    expect(navigationHistory.back).toHaveBeenCalledOnce();
    expect(navigationHistory.forward).not.toHaveBeenCalled();
  });
});

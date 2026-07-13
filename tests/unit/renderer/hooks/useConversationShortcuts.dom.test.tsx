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

  it('does not report or execute navigation while unfocused and resyncs on focus', async () => {
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    navigationHistory.canBack = true;
    renderRoute('/conversation/second');
    await waitFor(() => expect(bridge.listener).not.toBeNull());

    expect(bridge.setState).not.toHaveBeenCalled();
    act(() => bridge.listener?.({ command: 'back' }));
    act(() => bridge.listener?.({ command: 'previous-task' }));
    expect(navigationHistory.back).not.toHaveBeenCalled();
    expect(screen.getByTestId('route')).toHaveTextContent('/conversation/second');

    hasFocus.mockReturnValue(true);
    act(() => window.dispatchEvent(new FocusEvent('focus')));
    await waitFor(() =>
      expect(bridge.setState).toHaveBeenLastCalledWith({
        canBack: true,
        canForward: false,
        canPreviousTask: true,
        canNextTask: true,
      })
    );

    act(() => bridge.listener?.({ command: 'previous-task' }));
    expect(screen.getByTestId('route')).toHaveTextContent('/conversation/first');
  });

  it.each([
    ['/conversation/first', 'previous-task'],
    ['/conversation/third', 'next-task'],
  ] as const)('keeps the route unchanged when %s receives disabled %s', async (initialPath, command) => {
    renderRoute(initialPath);
    await waitFor(() => expect(bridge.listener).not.toBeNull());

    act(() => bridge.listener?.({ command }));

    expect(screen.getByTestId('route')).toHaveTextContent(initialPath);
  });

  it('executes forward only when the focused route reports it available', async () => {
    navigationHistory.canForward = true;
    renderRoute('/conversation/second');
    await waitFor(() => expect(bridge.listener).not.toBeNull());

    act(() => bridge.listener?.({ command: 'forward' }));

    expect(navigationHistory.forward).toHaveBeenCalledOnce();
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const emitter = () => {
    const listeners = new Set<(event: unknown) => void>();
    return {
      on: vi.fn((listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      emit: (event: unknown) => listeners.forEach((listener) => listener(event)),
    };
  };
  return {
    stream: emitter(),
    canonical: emitter(),
    completed: emitter(),
    canonicalCompleted: emitter(),
    removed: emitter(),
    changed: emitter(),
    show: vi.fn().mockResolvedValue(undefined),
    enabled: true,
    desktop: true,
    navigate: vi.fn(),
    t: (key: string, options?: { name: string }) => `${key}:${options?.name ?? ''}`,
  };
});
vi.mock('@/renderer/utils/emitter', () => ({ addEventListener: vi.fn() }));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => mocks.desktop }));
vi.mock('@/common/config/configService', () => ({ configService: { get: () => mocks.enabled } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: vi.fn().mockResolvedValue({ items: [{ id: 'a', name: '  Report  ', type: 'gemini', extra: {} }] }),
      },
    },
    codexThreads: {
      list: { invoke: vi.fn().mockResolvedValue(null) },
      responseStream: mocks.canonical,
      turnCompleted: mocks.canonicalCompleted,
    },
    oplRuntime: { getAppState: { invoke: vi.fn().mockResolvedValue({ ok: false }) } },
    application: { writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) } },
    conversation: {
      listChanged: mocks.changed,
      responseStream: mocks.stream,
      turnCompleted: mocks.completed,
      confirmation: { remove: mocks.removed },
    },
    notification: { show: { invoke: mocks.show } },
  },
}));

import {
  clearWaitingConfirmationById,
  getSnapshotConversationName,
  reconcileWaitingConfirmationFromRuntime,
  useConversationListSync,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { useConversationNotification } from '@/renderer/hooks/system/notification/useConversationNotification';

const request = (id: string) => ({
  type: 'acp_permission',
  conversation_id: 'a',
  msg_id: id,
  data: { tool_call: { tool_call_id: id, raw_input: { command: 'private command' } } },
});

describe('notification and waiting projection wiring', () => {
  it('consumes canonical and upstream events, restores pending state, and keeps request-specific clearing', async () => {
    const { result, unmount } = renderHook(() => {
      const list = useConversationListSync();
      useConversationNotification();
      return list;
    });
    await waitFor(() => expect(getSnapshotConversationName('a')).toBe('Report'));
    expect(getSnapshotConversationName('missing')).toBeUndefined();
    act(() => {
      mocks.canonical.emit(request('p1'));
      mocks.stream.emit(request('p1'));
      mocks.canonical.emit(request('p2'));
    });
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(true);
    expect(mocks.show).toHaveBeenCalledTimes(2);
    expect(mocks.show).toHaveBeenCalledWith({
      title: 'One Person Lab',
      body: 'settings.browserNotification.bodyConfirmationNamed:Report',
      conversation_id: 'a',
    });
    expect(JSON.stringify(mocks.show.mock.calls)).not.toContain('private command');
    act(() => mocks.removed.emit({ conversation_id: 'a', id: 'p1' }));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(true);
    act(() => clearWaitingConfirmationById('a', 'p2'));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(false);
    act(() => mocks.canonical.emit(request('p2')));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(false);
    act(() => mocks.canonical.emit({ type: 'start', conversation_id: 'a' }));
    act(() => reconcileWaitingConfirmationFromRuntime('a', 2));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(true);
    act(() => mocks.removed.emit({ conversation_id: 'a', id: 'runtime-first' }));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(true);
    act(() => mocks.removed.emit({ conversation_id: 'a', id: 'runtime-first' }));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(true);
    act(() => {
      mocks.canonicalCompleted.emit({ session_id: 'a', turn_id: 't1', status: 'finished', state: 'ai_waiting_input' });
      mocks.stream.emit({ type: 'finish', conversation_id: 'a', turn_id: 't1' });
    });
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(false);
    expect(mocks.show).toHaveBeenCalledTimes(3);
    act(() => mocks.canonical.emit(request('late')));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(false);
    expect(mocks.show).toHaveBeenCalledTimes(3);
    act(() => {
      mocks.canonical.emit({ type: 'start', conversation_id: 'a' });
      mocks.canonical.emit(request('p3'));
    });
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(true);
    act(() => mocks.canonical.emit({ type: 'error', conversation_id: 'a', data: 'failed' }));
    expect(result.current.isConversationWaitingConfirmation('a')).toBe(false);
    const notificationCount = mocks.show.mock.calls.length;
    act(() => mocks.canonical.emit(request('after-error')));
    expect(mocks.show).toHaveBeenCalledTimes(notificationCount);
    unmount();
  });

  it('delivers browser notifications only with an existing permission and routes clicks to the exact task', () => {
    class BrowserNotification extends EventTarget {
      static permission: NotificationPermission = 'granted';
      static instances: BrowserNotification[] = [];
      close = vi.fn();
      constructor(
        public title: string,
        public options: NotificationOptions
      ) {
        super();
        BrowserNotification.instances.push(this);
      }
    }
    mocks.desktop = false;
    mocks.enabled = true;
    vi.stubGlobal('Notification', BrowserNotification);
    vi.stubGlobal('isSecureContext', true);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
    const { unmount, rerender } = renderHook(() => useConversationNotification());
    act(() => mocks.stream.emit({ type: 'finish', conversation_id: 'a/b', turn_id: 'browser-turn' }));
    expect(BrowserNotification.instances).toHaveLength(1);
    expect(BrowserNotification.instances[0].title).toBe('One Person Lab');
    BrowserNotification.instances[0].dispatchEvent(new Event('click'));
    expect(mocks.navigate).toHaveBeenCalledWith('/conversation/a%2Fb');
    mocks.navigate = vi.fn();
    rerender();
    act(() => mocks.stream.emit({ type: 'finish', conversation_id: 'a/b', turn_id: 'browser-turn' }));
    expect(BrowserNotification.instances).toHaveLength(1);
    mocks.enabled = false;
    act(() => mocks.stream.emit({ type: 'finish', conversation_id: 'disabled', turn_id: 'other-turn' }));
    mocks.enabled = true;
    hidden.mockReturnValue(false);
    act(() => mocks.stream.emit({ type: 'finish', conversation_id: 'visible', turn_id: 'other-turn' }));
    hidden.mockReturnValue(true);
    BrowserNotification.permission = 'default';
    act(() => mocks.stream.emit({ type: 'finish', conversation_id: 'ungranted', turn_id: 'other-turn' }));
    expect(BrowserNotification.instances).toHaveLength(1);
    unmount();
    hidden.mockRestore();
    focus.mockRestore();
    vi.unstubAllGlobals();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class Notification {
    static instances: Notification[] = [];
    handlers: Record<string, () => void> = {};
    show = vi.fn();
    constructor(public options: { title: string; body: string }) {
      Notification.instances.push(this);
    }
    on(event: string, listener: () => void) {
      this.handlers[event] = listener;
      return this;
    }
  }
  return { Notification, enabled: true, emit: vi.fn(), send: vi.fn() };
});
vi.mock('@/common', () => ({
  ipcBridge: { notification: { show: { provider: vi.fn() }, clicked: { emit: mocks.emit } } },
}));
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({ paths: { isPackaged: () => false }, notification: { send: mocks.send } }),
}));
vi.mock('@/common/electronSafe', () => ({ electronNotification: mocks.Notification }));
vi.mock('@process/utils/initStorage', () => ({ ProcessConfig: { get: async () => mocks.enabled } }));
vi.mock('fs', () => ({ default: { existsSync: () => false } }));

import { setNotificationMainWindow, showNotification } from '@/process/bridge/notificationBridge';

beforeEach(() => {
  mocks.enabled = true;
  mocks.Notification.instances.length = 0;
  mocks.emit.mockClear();
});

describe('system conversation notification', () => {
  it('honors the current preference and main window focus', async () => {
    setNotificationMainWindow({ isDestroyed: () => false, isFocused: () => true } as never);
    await showNotification({ title: 'One Person Lab', body: 'Report completed' });
    expect(mocks.Notification.instances).toHaveLength(0);
    mocks.enabled = false;
    setNotificationMainWindow({ isDestroyed: () => false, isFocused: () => false } as never);
    await showNotification({ title: 'One Person Lab', body: 'Report completed' });
    expect(mocks.Notification.instances).toHaveLength(0);
  });

  it('restores the main window and routes to the exact originating conversation on click', async () => {
    const window = {
      isDestroyed: () => false,
      isFocused: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    };
    setNotificationMainWindow(window as never);
    await showNotification({ title: 'One Person Lab', body: 'Report completed', conversation_id: 'task-a' });
    expect(mocks.Notification.instances[0].show).toHaveBeenCalledOnce();
    mocks.Notification.instances[0].handlers.click();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(mocks.emit).toHaveBeenCalledWith({ conversation_id: 'task-a' });
  });
});

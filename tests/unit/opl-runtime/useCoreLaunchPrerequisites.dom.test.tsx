import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useOplAppState: vi.fn(),
  load: vi.fn(),
  appState: {} as Record<string, unknown>,
  error: null as string | null,
  provenance: 'none' as 'none' | 'derived_bootstrap' | 'live',
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: mocks.useOplAppState.mockImplementation(() => ({
    appState: mocks.appState,
    loading: false,
    error: mocks.error,
    provenance: mocks.provenance,
    load: mocks.load,
  })),
}));

import {
  POST_LOGIN_SETUP_CHECK_TIMEOUT_MS,
  useCoreLaunchPrerequisites,
} from '@/renderer/hooks/system/useCoreLaunchPrerequisites';

describe('useCoreLaunchPrerequisites', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.load.mockReset();
    mocks.load.mockReturnValue(new Promise(() => {}));
    mocks.useOplAppState.mockClear();
    mocks.appState = {};
    mocks.error = null;
    mocks.provenance = 'none';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails open after a bounded post-login live check', () => {
    expect(POST_LOGIN_SETUP_CHECK_TIMEOUT_MS).toBe(20_000);
    const { result } = renderHook(() => useCoreLaunchPrerequisites({ requireLive: true }));

    expect(mocks.useOplAppState).toHaveBeenCalledWith('fast', { autoLoad: false, requireLive: true });
    expect(mocks.load).toHaveBeenCalledWith('fast', { forceFresh: true });
    expect(result.current.loading).toBe(true);

    act(() => {
      vi.advanceTimersByTime(POST_LOGIN_SETUP_CHECK_TIMEOUT_MS);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.known).toBe(false);
    expect(result.current.provenance).toBe('none');
  });
});

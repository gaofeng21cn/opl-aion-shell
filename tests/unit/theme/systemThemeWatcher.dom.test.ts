import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above const declarations — use vi.hoisted to avoid TDZ errors
const { reapplyConfiguredTheme, configGet } = vi.hoisted(() => ({
  reapplyConfiguredTheme: vi.fn().mockResolvedValue(undefined),
  configGet: vi.fn(),
}));

vi.mock('@/renderer/utils/theme/applyTheme', () => ({ reapplyConfiguredTheme }));
vi.mock('@/common/config/configService', () => ({ configService: { get: configGet } }));

import { startSystemThemeWatcher } from '@renderer/utils/theme/systemThemeWatcher';

type ChangeHandler = (e: { matches: boolean }) => void;

function installMatchMedia() {
  const handlers = new Set<ChangeHandler>();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: (_: string, h: ChangeHandler) => handlers.add(h),
    removeEventListener: (_: string, h: ChangeHandler) => handlers.delete(h),
  }) as unknown as typeof window.matchMedia;
  return { fire: (next: boolean) => handlers.forEach((h) => h({ matches: next })) };
}

describe('startSystemThemeWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-applies the system theme on OS change while system mode is active', () => {
    const media = installMatchMedia();
    configGet.mockReturnValue('system');
    startSystemThemeWatcher();
    media.fire(true);
    expect(reapplyConfiguredTheme).toHaveBeenCalledOnce();
  });

  it('does nothing when a non-system theme is active', () => {
    const media = installMatchMedia();
    configGet.mockReturnValue('misaka-mikoto-theme');
    startSystemThemeWatcher();
    media.fire(true);
    expect(reapplyConfiguredTheme).not.toHaveBeenCalled();
  });

  it('stops re-applying after unsubscribe', () => {
    const media = installMatchMedia();
    configGet.mockReturnValue('system');
    const off = startSystemThemeWatcher();
    off();
    media.fire(true);
    expect(reapplyConfiguredTheme).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  provider: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      setActive: { provider: bridgeMocks.provider },
      changed: { emit: bridgeMocks.emit },
      requestCurrent: { provider: vi.fn() },
    },
  },
}));

import { getCachedTheme, initThemeBridge } from '@/process/bridge/themeBridge';
import type { Theme } from '@/common/theme/types';

describe('theme bridge product baseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('relays appearance without raw token or CSS overrides', async () => {
    initThemeBridge();
    const publish = bridgeMocks.provider.mock.calls[0]?.[0] as ((theme: Theme) => Promise<void>) | undefined;
    expect(publish).toBeTypeOf('function');

    await publish?.({
      id: 'legacy-custom',
      name: 'Legacy custom',
      appearance: 'dark',
      tokens: { '--bg-1': 'red' },
      css: 'body { display: none; }',
      builtin: false,
      created_at: 1,
      updated_at: 1,
    });

    expect(getCachedTheme()).toEqual({
      id: 'legacy-custom',
      name: 'Legacy custom',
      appearance: 'dark',
      builtin: false,
      created_at: 1,
      updated_at: 1,
    });
    expect(bridgeMocks.emit).toHaveBeenCalledWith(expect.not.objectContaining({ tokens: expect.anything() }));
    expect(bridgeMocks.emit).toHaveBeenCalledWith(expect.not.objectContaining({ css: expect.anything() }));
  });
});

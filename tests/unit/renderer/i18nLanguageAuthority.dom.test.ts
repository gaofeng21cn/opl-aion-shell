import { beforeEach, describe, expect, it, vi } from 'vitest';

const configServiceMocks = vi.hoisted(() => ({
  whenReady: vi.fn(() => new Promise<void>(() => {})),
  get: vi.fn(),
  set: vi.fn(async () => undefined),
}));
const bridgeMocks = vi.hoisted(() => ({
  invoke: vi.fn(async () => undefined),
  on: vi.fn(() => vi.fn()),
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMocks,
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      changeLanguage: { invoke: bridgeMocks.invoke },
      languageChanged: { on: bridgeMocks.on },
    },
  },
}));

import i18n, { changeLanguage } from '@/renderer/services/i18n';

describe('renderer language persistence authority', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
    vi.clearAllMocks();
  });

  it('does not persist a normalized same-language request', async () => {
    await changeLanguage('zh-Hans-CN');

    expect(configServiceMocks.set).not.toHaveBeenCalled();
    expect(bridgeMocks.invoke).not.toHaveBeenCalled();
  });

  it('persists an explicit change to backend settings and awaits host synchronization', async () => {
    await changeLanguage('en-US');

    expect(configServiceMocks.set).toHaveBeenCalledWith('language', 'en-US');
    expect(bridgeMocks.invoke).toHaveBeenCalledWith({ language: 'en-US' });
  });
});

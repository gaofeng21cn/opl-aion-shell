import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => {
  const provider = () => vi.fn();
  return {
    changeLanguageProvider: provider(),
    languageChangedEmit: vi.fn(),
    systemSettings: {
      getCloseToTray: { provider: provider() },
      setCloseToTray: { provider: provider() },
      setKeepAwake: { provider: provider() },
      changeLanguage: { provider: undefined as unknown as ReturnType<typeof vi.fn> },
      languageChanged: { emit: undefined as unknown as ReturnType<typeof vi.fn> },
      getPetEnabled: { provider: provider() },
      setPetEnabled: { provider: provider() },
      getPetSize: { provider: provider() },
      setPetSize: { provider: provider() },
      getPetDnd: { provider: provider() },
      setPetDnd: { provider: provider() },
      getPetConfirmEnabled: { provider: provider() },
      setPetConfirmEnabled: { provider: provider() },
    },
  };
});
bridgeMocks.systemSettings.changeLanguage.provider = bridgeMocks.changeLanguageProvider;
bridgeMocks.systemSettings.languageChanged.emit = bridgeMocks.languageChangedEmit;

const processConfigMocks = vi.hoisted(() => ({
  get: vi.fn(async () => false),
  set: vi.fn(async () => undefined),
}));
const httpRequestMock = vi.hoisted(() => vi.fn(async () => undefined));
const mainChangeLanguageMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/common', () => ({ ipcBridge: { systemSettings: bridgeMocks.systemSettings } }));
vi.mock('@/common/adapter/httpBridge', () => ({ httpRequest: httpRequestMock }));
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    power: { preventDisplaySleep: vi.fn(() => 1), allowSleep: vi.fn() },
  }),
}));
vi.mock('@process/utils/initStorage', () => ({ ProcessConfig: processConfigMocks }));
vi.mock('@process/services/i18n', () => ({
  changeLanguage: mainChangeLanguageMock,
  normalizeLanguageCode: (language: string) => (language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'),
}));
vi.mock('@process/utils/tray', () => ({
  createOrUpdateTray: vi.fn(),
  destroyTray: vi.fn(),
  setCloseToTrayEnabled: vi.fn(),
}));
vi.mock('@process/utils/closeToTraySetting', () => ({
  readCloseToTraySetting: vi.fn(async () => false),
  writeCloseToTraySetting: vi.fn(async () => undefined),
}));

import { initSystemSettingsBridge, onLanguageChanged } from '@/process/bridge/systemSettingsBridge';

describe('system settings language authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists the startup mirror and updates backend runtime before broadcasting', async () => {
    const listener = vi.fn();
    onLanguageChanged(listener);
    initSystemSettingsBridge();
    const handler = bridgeMocks.changeLanguageProvider.mock.calls.at(-1)?.[0] as
      | ((params: { language: string }) => Promise<void>)
      | undefined;

    expect(handler).toBeTypeOf('function');
    await handler?.({ language: 'zh-Hans-CN' });

    expect(processConfigMocks.set).toHaveBeenCalledWith('language', 'zh-CN');
    expect(httpRequestMock).toHaveBeenCalledWith('PATCH', '/api/settings', { language: 'zh-CN' });
    expect(mainChangeLanguageMock).toHaveBeenCalledWith('zh-CN');
    expect(bridgeMocks.languageChangedEmit).toHaveBeenCalledWith({ language: 'zh-CN' });
    expect(listener).toHaveBeenCalledOnce();

    const order = [
      processConfigMocks.set,
      httpRequestMock,
      mainChangeLanguageMock,
      bridgeMocks.languageChangedEmit,
      listener,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual(order.toSorted((left, right) => left - right));
  });
});

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AppearanceModalContent from '@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getStartOnBootStatus: vi.fn(),
  getGpuStatus: vi.fn(),
  getCloseToTray: vi.fn(),
  getKeepAwake: vi.fn(),
  setKeepAwake: vi.fn(),
  executeAction: vi.fn(),
  loadAppState: vi.fn(),
  confirmModal: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Modal: Object.assign(actual.Modal, { confirm: bridgeMocks.confirmModal }),
    Message: { ...actual.Message, success: bridgeMocks.messageSuccess, error: bridgeMocks.messageError },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getStartOnBootStatus: { invoke: bridgeMocks.getStartOnBootStatus },
      getGpuStatus: { invoke: bridgeMocks.getGpuStatus },
      setStartOnBoot: { invoke: vi.fn() },
      setGpuOverride: { invoke: vi.fn() },
      restart: { invoke: vi.fn() },
    },
    systemSettings: {
      getCloseToTray: { invoke: bridgeMocks.getCloseToTray },
      setCloseToTray: { invoke: vi.fn() },
      getKeepAwake: { invoke: bridgeMocks.getKeepAwake },
      setKeepAwake: { invoke: bridgeMocks.setKeepAwake },
    },
    oplRuntime: {
      executeAction: { invoke: bridgeMocks.executeAction },
      getAppState: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        'system.closeToTray': true,
        'system.keepAwake': false,
        'system.notificationEnabled': true,
        'system.cronNotificationEnabled': false,
        'system.autoPreviewOfficeFiles': true,
        'acp.promptTimeout': 300,
        'acp.agentIdleTimeout': 5,
      };
      return defaults[key];
    }),
    set: vi.fn(() => Promise.resolve()),
    setBatch: vi.fn(() => Promise.resolve()),
    setLocal: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('@/renderer/hooks/config/useConfig', () => ({
  useConfig: () => [undefined, vi.fn()],
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  useOplAppState: () => ({
    appState: {
      codex_personalization: {
        user_agents: {
          status: 'available',
          path: '/Users/example/.codex/AGENTS.md',
          content: 'Always answer directly.\n',
          sha256: 'sha-current',
        },
        opl_flow_default_user_agents: {
          status: 'available',
          package_version: '0.1.16',
          content: 'OPL Flow default instructions.\n',
          sha256: 'sha-default',
        },
      },
    },
    refreshing: false,
    load: bridgeMocks.loadAppState,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/settings/LanguageSwitcher', () => ({
  default: () => <div data-testid='language-switcher'>Language selector</div>,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children, disableOverflow }: { children: React.ReactNode; disableOverflow?: boolean }) => (
    <div data-testid='appearance-scroll-area' data-disable-overflow={String(Boolean(disableOverflow))}>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/pages/settings/AppearanceSettings/CssThemeSettings', () => ({
  default: () => <div data-testid='css-theme-settings'>Theme card list</div>,
}));

vi.mock('@/renderer/components/settings/FontSizeStepper', () => ({
  default: ({ value }: { value: number }) => <div>Font size {value}</div>,
}));

vi.mock('@/renderer/components/settings/ScaleControl', () => ({
  default: () => <div>Scale control</div>,
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    fontSizes: { chat: 14, markdown: 15, code: 13 },
    setFontSize: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) =>
      ({
        'settings.personalPreferencesTitle': 'Preferences',
        'settings.personalPreferencesDesc': 'Set interface behavior, display fonts, and theme appearance.',
        'settings.appBehaviorPreferencesTitle': 'App behavior',
        'settings.appBehaviorPreferencesDesc': 'Daily application behavior.',
        'settings.notificationPreferencesDesc': 'Choose notification types.',
        'settings.startupWindowPreferencesTitle': 'Startup and window',
        'settings.performancePreferencesTitle': 'Performance and background activity',
        'settings.filesNotificationsPreferencesTitle': 'Files and notifications',
        'settings.language': 'Language',
        'settings.startOnBoot': 'Start on boot',
        'settings.startOnBootDesc': 'Launch after sign-in.',
        'settings.startOnBootUnsupported': 'Unavailable.',
        'settings.closeToTray': 'Keep running after closing the window',
        'settings.closeToTrayDesc': 'Keep background tasks running.',
        'settings.keepAwake': 'Keep awake',
        'settings.keepAwakeDesc': 'Prevent the computer from sleeping.',
        'settings.saveUploadToWorkspace': 'Save uploads to workspace',
        'settings.autoPreviewOfficeFiles': 'Preview Office files',
        'settings.autoPreviewOfficeFilesDesc': 'Open new Office files automatically.',
        'settings.notification': 'Notifications',
        'settings.cronNotificationEnabled': 'Background task completion',
        'settings.advancedSettings': 'Advanced preferences',
        'settings.timeoutPreferencesTitle': 'Responses and background activity',
        'settings.timeoutPreferencesDesc': 'Less common performance and background assistant settings.',
        'settings.promptTimeout': 'Model response timeout',
        'settings.promptTimeoutDesc': 'Stop waiting when a model does not respond.',
        'settings.agentIdleTimeout': 'Release an idle background assistant after',
        'settings.agentIdleTimeoutDesc': 'Stops an unused background assistant to free memory.',
        'settings.hardwareAcceleration': 'Hardware acceleration',
        'settings.hardwareAccelerationDesc': 'Use the GPU to render the interface.',
        'settings.appearancePreferencesTitle': 'Display and fonts',
        'settings.appearancePreferencesDesc': 'Set chat, Markdown, code text size, and interface scale.',
        'settings.theme': 'Theme appearance',
        'settings.fontSizeChat': 'Chat font size',
        'settings.fontSizeMarkdown': 'Markdown font size',
        'settings.fontSizeCode': 'Code font size',
        'settings.fontSizeStepperReset': 'Reset',
        'settings.scale': 'Scale',
        'settings.advancedThemeListTitle': 'Advanced themes',
        'settings.advancedThemeListDesc': 'Theme presets stay collapsed until needed.',
        'settings.personalization.title': 'Instructions and session context',
        'settings.personalization.description': 'Manage persistent instructions and OPL routing.',
        'settings.personalization.systemAgentsTitle': 'System AGENTS.md',
        'settings.personalization.systemAgentsDescription': 'Instructions for every task.',
        'settings.personalization.systemAgentsPlaceholder': 'Persistent instructions',
        'settings.personalization.systemAgentsTooLarge': 'Too large',
        'settings.personalization.restoreOplFlowDefault': 'Restore OPL Flow default',
        'settings.personalization.restoreSystemAgentsTitle': 'Restore system AGENTS.md?',
        'settings.personalization.restoreSystemAgentsConfirm': 'Replace with the installed OPL Flow default.',
        'settings.personalization.systemAgentsRestored': 'OPL Flow default restored',
        'settings.personalization.oplFlowDefaultVersion': 'Installed OPL Flow default version: 0.1.16',
        'settings.personalization.oplFlowDefaultUnavailable': 'Default unavailable',
        'settings.personalization.sessionContextTitle': 'OPL App session context',
        'settings.personalization.sessionContextDescription': 'Context for new conversations.',
        'settings.personalization.generatedContextLabel': 'Generated base context',
        'settings.personalization.additionalContextLabel': 'Additional user instructions',
        'settings.personalization.additionalContextPlaceholder': 'Additional instructions',
        'settings.personalization.restoreDefault': 'Restore default',
        'settings.personalization.save': 'Save',
        'settings.personalization.reload': 'Reload',
        'settings.personalization.nextConversationEffect': 'Applies to the next conversation.',
        'common.cancel': 'Cancel',
      })[key] ?? key,
  }),
}));

describe('AppearanceModalContent', () => {
  it('organizes preferences as full-width behavior, performance, and display groups', async () => {
    bridgeMocks.getStartOnBootStatus.mockResolvedValue({
      success: true,
      data: { supported: true, enabled: false, isPackaged: true, platform: 'darwin' },
    });
    bridgeMocks.getGpuStatus.mockResolvedValue({
      success: true,
      data: { userOverride: 'auto', autoDisabled: false, crashCount: 0, lastCrashAt: null },
    });
    bridgeMocks.getCloseToTray.mockResolvedValue(true);
    bridgeMocks.getKeepAwake.mockResolvedValue(false);
    bridgeMocks.setKeepAwake.mockResolvedValue(undefined);
    bridgeMocks.executeAction.mockResolvedValue({ ok: true, data: {} });
    bridgeMocks.loadAppState.mockResolvedValue(undefined);
    bridgeMocks.confirmModal.mockImplementation(({ onOk }: { onOk?: () => unknown }) => {
      void onOk?.();
    });

    render(<AppearanceModalContent />);

    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByTestId('appearance-scroll-area')).toHaveAttribute('data-disable-overflow', 'false');
    const page = screen.getByTestId('settings-page-preferences');
    expect(Array.from(page.querySelectorAll('section')).map((section) => section.id)).toEqual([
      'app-behavior',
      'models-performance',
      'display',
    ]);
    expect(screen.getByTestId('preferences-card-grid')).toHaveClass('flex', 'flex-col');
    expect(screen.getByTestId('preferences-card-grid')).not.toHaveClass('xl:grid-cols-2');

    const appBehavior = screen.getByTestId('settings-preferences-primary');
    expect(appBehavior).toHaveTextContent('App behavior');
    expect(appBehavior).toHaveTextContent('Keep running after closing the window');
    expect(appBehavior).toHaveTextContent('Keep awake');
    expect(appBehavior).toHaveTextContent('Save uploads to workspace');

    expect(appBehavior).toHaveTextContent('Notifications');
    expect(appBehavior).toHaveTextContent('Background task completion');

    const performancePreferences = screen.getByTestId('preferences-performance-section');
    expect(performancePreferences).toHaveTextContent('Performance and background activity');
    expect(performancePreferences).toHaveTextContent('Model response timeout');
    expect(performancePreferences).toHaveTextContent('Release an idle background assistant after');
    await waitFor(() => expect(performancePreferences).toHaveTextContent('Hardware acceleration'));

    expect(screen.queryByTestId('settings-personalization-instructions')).not.toBeInTheDocument();

    expect(screen.getByTestId('preferences-display-section')).toHaveTextContent('Display and fonts');
    expect(screen.getByTestId('preferences-display-section')).toHaveTextContent('Language selector');
    expect(screen.getByText('Chat font size')).toBeInTheDocument();
    expect(screen.getByText('Markdown font size')).toBeInTheDocument();
    expect(screen.getByText('Code font size')).toBeInTheDocument();
    expect(screen.getByText('Scale')).toBeInTheDocument();

    expect(screen.getByTestId('preferences-display-section')).toHaveTextContent('Theme appearance');
    expect(screen.queryByText('Advanced themes')).not.toBeInTheDocument();
    expect(screen.getByTestId('css-theme-settings')).toHaveTextContent('Theme card list');

    expect(appBehavior.querySelectorAll('details')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('settings-keep-awake').querySelector('[role="switch"]')!);
    await waitFor(() => expect(bridgeMocks.setKeepAwake).toHaveBeenCalledWith({ enabled: true }));
  });
});

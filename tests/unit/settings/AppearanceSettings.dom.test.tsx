import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  setAppearanceMode: vi.fn(),
  setFontSize: vi.fn(),
  configSet: vi.fn(),
  configSetLocal: vi.fn(),
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
    set: bridgeMocks.configSet,
    setBatch: vi.fn(() => Promise.resolve()),
    setLocal: bridgeMocks.configSetLocal,
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

vi.mock('@/renderer/components/settings/FontSizeStepper', () => ({
  default: ({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled: boolean }) => (
    <button disabled={disabled} onClick={() => onChange(value + 1)}>
      Font size {value}
    </button>
  ),
}));

vi.mock('@/renderer/components/settings/ScaleControl', () => ({
  default: () => <div>Scale control</div>,
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    appearanceMode: 'system',
    setAppearanceMode: bridgeMocks.setAppearanceMode,
    fontSizes: { chat: 14, markdown: 15, code: 13 },
    setFontSize: bridgeMocks.setFontSize,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string, options?: { defaultValue?: string }) =>
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
        'settings.uiOptimization.preferences.units.second': 'second',
        'settings.uiOptimization.preferences.units.minute': 'minute',
        'settings.hardwareAcceleration': 'Hardware acceleration',
        'settings.hardwareAccelerationDesc': 'Use the GPU to render the interface.',
        'settings.appearancePreferencesTitle': 'Display and fonts',
        'settings.appearancePreferencesDesc': 'Set chat, Markdown, code text size, and interface scale.',
        'settings.theme': 'Theme preset',
        'settings.appearanceMode': 'Appearance',
        'settings.systemMode': 'System',
        'settings.lightMode': 'Light',
        'settings.darkMode': 'Dark',
        'settings.fontSizeChat': 'Chat font size',
        'settings.fontSizeMarkdown': 'Markdown font size',
        'settings.fontSizeCode': 'Code font size',
        'settings.fontSizeStepperReset': 'Reset',
        'settings.scale': 'Scale',
        'settings.advancedThemeListTitle': 'Advanced themes',
        'settings.advancedThemeListDesc': 'Theme presets stay collapsed until needed.',
        'settings.personalization.title': 'Instructions',
        'settings.personalization.description': 'Manage persistent and new-conversation instructions.',
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
        'settings.personalization.additionalInstructionsTitle': 'New conversation instructions',
        'settings.personalization.additionalInstructionsDescription': 'Optional instructions for new conversations.',
        'settings.personalization.additionalContextLabel': 'Additional user instructions',
        'settings.personalization.additionalContextPlaceholder': 'Additional instructions',
        'settings.personalization.clearAdditionalInstructions': 'Clear',
        'settings.personalization.restoreDefault': 'Restore default',
        'settings.personalization.save': 'Save',
        'settings.personalization.reload': 'Reload',
        'settings.personalization.nextConversationEffect': 'Applies to the next conversation.',
        'common.cancel': 'Cancel',
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}));

describe('AppearanceModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.configSet.mockResolvedValue(undefined);
    bridgeMocks.setAppearanceMode.mockResolvedValue(undefined);
    bridgeMocks.setFontSize.mockResolvedValue(undefined);
  });
  it('prioritizes appearance and keeps performance in a named collapsed configuration group', async () => {
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
      'display',
      'app-behavior',
      '',
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
    expect(performancePreferences.querySelector('details')).not.toHaveAttribute('open');
    expect(performancePreferences.querySelector('#models-performance')?.closest('details')).toBeTruthy();
    fireEvent.click(within(performancePreferences).getByText('Performance and background activity'));
    expect(performancePreferences.querySelector('details')).toHaveAttribute('open');
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
    expect(screen.getByTestId('preferences-font-preview')).toHaveTextContent('Live preview');
    expect(screen.getByText('Your next conversation starts here.')).toHaveStyle({ fontSize: '14px' });
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByText('minute')).toBeInTheDocument();

    expect(screen.getByTestId('preferences-display-section')).toHaveTextContent('Appearance');
    const systemMode = screen.getByTestId('appearance-mode-system');
    expect(systemMode).toHaveAttribute('role', 'radio');
    expect(systemMode).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('appearance-mode-light')).toBeInTheDocument();
    fireEvent.keyDown(systemMode, { key: 'ArrowRight' });
    await waitFor(() => expect(bridgeMocks.setAppearanceMode).toHaveBeenCalledWith('light'));
    fireEvent.click(screen.getByTestId('appearance-mode-dark'));
    await waitFor(() => expect(bridgeMocks.setAppearanceMode).toHaveBeenCalledWith('dark'));
    expect(screen.getByTestId('preferences-display-section')).not.toHaveTextContent('Theme preset');
    expect(screen.queryByText('Advanced themes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('css-theme-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preferences-theme-section')).not.toBeInTheDocument();

    expect(appBehavior.querySelectorAll('details')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('settings-keep-awake').querySelector('[role="switch"]')!);
    await waitFor(() => expect(bridgeMocks.setKeepAwake).toHaveBeenCalledWith({ enabled: true }));
  });
  it('shows saving, prevents overlapping writes and restores the switch after a failed save', async () => {
    let rejectSave!: (error: Error) => void;
    bridgeMocks.setKeepAwake.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        })
    );
    render(<AppearanceModalContent />);
    await waitFor(() => expect(bridgeMocks.getKeepAwake).toHaveBeenCalled());
    const row = screen.getByTestId('settings-keep-awake');
    const control = within(row).getByRole('switch');
    fireEvent.click(control);
    expect(row).toHaveTextContent('Saving…');
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(bridgeMocks.setKeepAwake).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error('unavailable')));
    expect(row).toHaveTextContent('Could not save. Previous value restored. Try again.');
    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(bridgeMocks.configSetLocal).toHaveBeenLastCalledWith('system.keepAwake', false);
    bridgeMocks.setKeepAwake.mockResolvedValueOnce(undefined);
    fireEvent.click(control);
    await waitFor(() => expect(row).toHaveTextContent('Saved'));
  });

  it('restores a timeout after persistence fails and allows a successful retry', async () => {
    bridgeMocks.configSet.mockRejectedValueOnce(new Error('offline'));
    render(<AppearanceModalContent />);
    fireEvent.click(screen.getByText('Performance and background activity'));
    const input = screen.getByRole('spinbutton', { name: 'Model response timeout' });
    fireEvent.change(input, { target: { value: '600' } });
    fireEvent.blur(input);
    await waitFor(() => expect(input).toHaveValue('300'));
    expect(bridgeMocks.configSetLocal).toHaveBeenCalledWith('acp.promptTimeout', 300);
    expect(screen.getByTestId('preferences-performance-section')).toHaveTextContent('Could not save.');
    fireEvent.change(input, { target: { value: '600' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByTestId('preferences-performance-section')).toHaveTextContent('Saved'));
    expect(bridgeMocks.configSet).toHaveBeenLastCalledWith('acp.promptTimeout', 600);
    fireEvent.change(input, { target: { value: '900' } });
    expect(screen.getByTestId('preferences-performance-section')).not.toHaveTextContent('Saved');
    expect(bridgeMocks.configSet).toHaveBeenLastCalledWith('acp.promptTimeout', 600);
  });

  it('reports theme and font persistence failures without claiming saved', async () => {
    bridgeMocks.setAppearanceMode.mockRejectedValueOnce(new Error('offline'));
    bridgeMocks.setFontSize.mockRejectedValueOnce(new Error('offline'));
    render(<AppearanceModalContent />);
    fireEvent.click(screen.getByTestId('appearance-mode-dark'));
    await waitFor(() => expect(screen.getByTestId('preferences-display-section')).toHaveTextContent('Could not save.'));
    fireEvent.click(screen.getByRole('button', { name: 'Font size 14' }));
    await waitFor(() =>
      expect(screen.getAllByText('Could not save. Previous value restored. Try again.')).toHaveLength(2)
    );
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

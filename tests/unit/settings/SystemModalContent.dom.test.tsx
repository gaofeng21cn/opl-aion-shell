import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  systemInfoInvoke: vi.fn(),
  getStartOnBootStatusInvoke: vi.fn(),
  getGpuStatusInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      executeAction: { invoke: vi.fn() },
    },
    application: {
      systemInfo: { invoke: bridgeMocks.systemInfoInvoke },
      getStartOnBootStatus: { invoke: bridgeMocks.getStartOnBootStatusInvoke },
      getGpuStatus: { invoke: bridgeMocks.getGpuStatusInvoke },
      getCdpStatus: { invoke: vi.fn().mockResolvedValue({ success: true, data: { isDevMode: false } }) },
      isDevToolsOpened: { invoke: vi.fn() },
      devToolsStateChanged: { on: vi.fn(() => vi.fn()) },
    },
    systemSettings: {
      setCloseToTray: { invoke: vi.fn() },
    },
    shell: {
      openFolderWith: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

vi.mock('@/renderer/components/settings/LanguageSwitcher', () => ({
  default: () => <div data-testid='language-switcher' />,
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    whenReady: vi.fn(() => Promise.resolve()),
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        'system.notificationEnabled': true,
        'system.autoPreviewOfficeFiles': true,
      };
      return defaults[key];
    }),
    set: vi.fn(() => Promise.resolve()),
    setLocal: vi.fn(),
  },
}));

describe('SystemModalContent OPL App state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          schema_version: 'opl_app_state.v1',
          developer_mode: {
            effective_state: 'active_direct',
            description: 'Developer mode from app state',
          },
          paths: {
            workspace_root_path: '/Users/example/OPL Workspace',
            logs_dir: '/Users/example/.opl/logs',
          },
          opl_agent_codex_context: {
            contract_ref: 'one-person-lab-app/contracts/app-gui-product-contract.json#pages.settings_system',
          },
        },
      },
    });
    bridgeMocks.systemInfoInvoke.mockResolvedValue({
      workDir: '/wrong/shell/workdir',
      logDir: '/wrong/shell/logs',
      cacheDir: '/wrong/shell/cache',
    });
  });

  it('renders Developer Mode and paths from fast OPL app state', async () => {
    render(<SystemModalContent />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(await screen.findByText('/Users/example/OPL Workspace')).toBeInTheDocument();
    expect(screen.getByText('/Users/example/.opl/logs')).toBeInTheDocument();
    expect(screen.getByText('Developer mode from app state')).toBeInTheDocument();
    expect(screen.getByTestId('opl-developer-mode-row')).toHaveTextContent('Developer mode from app state');
    expect(screen.getByTestId('opl-developer-mode-status')).toHaveTextContent('active_direct');
    expect(
      screen.getByText('one-person-lab-app/contracts/app-gui-product-contract.json#pages.settings_system')
    ).toBeInTheDocument();
    expect(screen.queryByText('/wrong/shell/workdir')).not.toBeInTheDocument();
    expect(screen.queryByText('/wrong/shell/logs')).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockNavigate,
  mockMessageLoading,
  mockMessageWarning,
  mockMessageError,
  mockAppVersions,
  mockRuntimeFlags,
  mockStartPreparation,
  mockConfigureCodex,
  mockT,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockMessageLoading: vi.fn(() => vi.fn()),
  mockMessageWarning: vi.fn(),
  mockMessageError: vi.fn(),
  mockAppVersions: vi.fn(),
  mockRuntimeFlags: vi.fn(),
  mockStartPreparation: vi.fn(),
  mockConfigureCodex: vi.fn(),
  mockT: vi.fn((key: string, options?: Record<string, string>) => {
    if (key === 'settings.oplFirstLaunch.progress.workingOn') {
      return `working:${options?.step}:${options?.current}/${options?.total}`;
    }
    if (key === 'settings.oplFirstLaunch.progress.steps.checkingEnvironment') {
      return 'checking';
    }
    return key;
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      loading: mockMessageLoading,
      warning: mockMessageWarning,
      error: mockMessageError,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      appVersions: { invoke: mockAppVersions },
      runtimeFlags: { invoke: mockRuntimeFlags },
      openDevTools: { invoke: vi.fn() },
      logStream: { on: vi.fn(() => vi.fn()) },
    },
    deepLink: {
      received: { on: vi.fn(() => vi.fn()) },
    },
    notification: {
      clicked: { on: vi.fn(() => vi.fn()) },
    },
    task: {
      stopAll: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@renderer/hooks/file/useDirectorySelection', () => ({
  useDirectorySelection: () => ({ contextHolder: null }),
}));

vi.mock('@renderer/hooks/system/useDeepLink', () => ({
  useDeepLink: vi.fn(),
}));

vi.mock('@renderer/hooks/system/useNotificationClick', () => ({
  useNotificationClick: vi.fn(),
}));

vi.mock('@renderer/hooks/ui/useConversationShortcuts', () => ({
  useConversationShortcuts: vi.fn(),
}));

vi.mock('@renderer/components/layout/Titlebar', () => ({
  default: () => <div data-testid='titlebar' />,
}));

vi.mock('@renderer/components/layout/PwaPullToRefresh', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/settings/UpdateModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/assets/logos/brand/app.png', () => ({ default: 'logo.png' }));

vi.mock('@/renderer/hooks/system/useOplBrandName', () => ({
  useOplBrandName: () => 'One Person Lab',
}));

vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

vi.mock('@/renderer/components/layout/oplFirstLaunchPreparation', () => ({
  buildOplFirstLaunchProgress: (step: string) => ({
    currentStep: step === 'configureCodex' ? 2 : 1,
    totalSteps: 4,
    step,
  }),
  configureOplCodexForFirstLaunch: (...args: unknown[]) => mockConfigureCodex(...args),
  startOplFirstLaunchEnvironmentPreparation: (...args: unknown[]) => mockStartPreparation(...args),
}));

import Layout from '@/renderer/components/layout/Layout';

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/guid']}>
      <Layout sider={<div data-testid='sider' />} />
    </MemoryRouter>
  );

describe('Layout first-run preparation notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppVersions.mockResolvedValue({ oplVersion: '26.5.3' });
    mockRuntimeFlags.mockResolvedValue({ e2eTest: false, skipFirstRun: false });
  });

  it('uses the wizard as the only long-running preparation surface', async () => {
    mockStartPreparation.mockImplementation(async ({ onProgress }) => {
      onProgress?.({ currentStep: 1, totalSteps: 4, step: 'checkingEnvironment' });
      return {
        status: 'codex-config-needed',
        message: 'Configure Codex API key',
        blockers: ['codex_config'],
        progress: { currentStep: 2, totalSteps: 4, step: 'configureCodex' },
      };
    });

    renderLayout();

    expect(await screen.findByTestId('opl-first-run-window')).toBeInTheDocument();
    expect(mockMessageLoading).not.toHaveBeenCalled();
    expect(mockMessageWarning).not.toHaveBeenCalled();
    expect(mockMessageError).not.toHaveBeenCalled();
  });

  it('keeps setup-needed warnings after the long-running preparation finishes', async () => {
    mockStartPreparation.mockResolvedValue({
      status: 'setup-needed',
      message: 'Install domain modules',
      blockers: ['domain_modules'],
      progress: { currentStep: 3, totalSteps: 4, step: 'installingModules' },
    });

    renderLayout();

    await waitFor(() => {
      expect(mockMessageWarning).toHaveBeenCalledWith('Install domain modules');
    });
    expect(mockMessageLoading).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/settings/runtime');
  });

  it('keeps failure errors after the long-running preparation finishes', async () => {
    mockStartPreparation.mockRejectedValue(new Error('failed to initialize'));

    renderLayout();

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('failed to initialize');
    });
    expect(mockMessageLoading).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/settings/runtime');
  });

  it('skips first-run preparation when the main process enables E2E surface testing', async () => {
    mockRuntimeFlags.mockResolvedValue({ e2eTest: true, skipFirstRun: true });

    renderLayout();

    await waitFor(() => {
      expect(mockRuntimeFlags).toHaveBeenCalledOnce();
    });
    expect(mockAppVersions).not.toHaveBeenCalled();
    expect(mockStartPreparation).not.toHaveBeenCalled();
    expect(screen.queryByTestId('opl-first-run-window')).not.toBeInTheDocument();
  });
});

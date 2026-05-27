import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FirstRun from '@/renderer/pages/FirstRun';

const bridgeMocks = vi.hoisted(() => ({
  getInitializeInvoke: vi.fn(),
  runInstallPrepInvoke: vi.fn(),
  configureCodexInvoke: vi.fn(),
  runStartupMaintenanceInvoke: vi.fn(),
  runReconcileModulesInvoke: vi.fn(),
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getInitialize: { invoke: bridgeMocks.getInitializeInvoke },
      runInstallPrep: { invoke: bridgeMocks.runInstallPrepInvoke },
      configureCodex: { invoke: bridgeMocks.configureCodexInvoke },
      runStartupMaintenance: { invoke: bridgeMocks.runStartupMaintenanceInvoke },
      runReconcileModules: { invoke: bridgeMocks.runReconcileModulesInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (!values) return key;
      return Object.entries(values).reduce((text, [name, value]) => `${text} ${value}`, key);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

const initializeResult = {
  surface: 'system_initialize',
  command: 'opl system initialize --json',
  stdout: '{}',
  parsed: {
    system_initialize: {
      setup_flow: {
        ready_to_launch: true,
        progress: {
          ready_required_count: 3,
          total_required_count: 3,
        },
        blocking_items: [],
        maintenance_items: ['domain_modules', 'recommended_skills'],
      },
      readiness: {
        launch_ready: true,
      },
      codex_default_profile: {
        model_provider: 'gflab',
        base_url: 'https://gflabtoken.cn/v1',
        model: 'gpt-5.5',
        model_reasoning_effort: 'xhigh',
      },
      checklist: [
        {
          item_id: 'workspace_root',
          label: 'Workspace Root',
          status: 'ready',
          required: true,
          blocking: false,
          severity: 'info',
          detail_summary: 'Selected root',
        },
        {
          item_id: 'codex',
          label: 'Codex CLI',
          status: 'ready',
          required: true,
          blocking: false,
          severity: 'info',
          detail_summary: 'Installed',
        },
        {
          item_id: 'codex_config',
          label: 'Codex API Configuration',
          status: 'ready',
          required: true,
          blocking: false,
          severity: 'info',
          detail_summary: 'Configured',
        },
        {
          item_id: 'domain_modules',
          label: 'Domain Modules',
          status: 'attention_needed',
          required: true,
          blocking: false,
          severity: 'maintenance',
          action_command_ref: 'opl system startup-maintenance',
          detail_summary: '0/4 default modules ready.',
        },
        {
          item_id: 'family_runtime_provider',
          label: 'Family Runtime Provider',
          status: 'initializing',
          required: true,
          blocking: false,
          severity: 'maintenance',
          detail_summary: 'Temporal not ready.',
        },
        {
          item_id: 'recommended_skills',
          label: 'Recommended Skills',
          status: 'attention_needed',
          required: false,
          blocking: false,
          severity: 'maintenance',
          detail_summary: '0/3 skill groups detected.',
        },
      ],
    },
  },
};

const blockedInitializeResult = {
  ...initializeResult,
  parsed: {
    system_initialize: {
      ...initializeResult.parsed.system_initialize,
      setup_flow: {
        ready_to_launch: false,
        progress: {
          ready_required_count: 2,
          total_required_count: 3,
        },
        blocking_items: ['codex_config'],
        maintenance_items: ['domain_modules'],
      },
      readiness: {
        launch_ready: false,
      },
      checklist: initializeResult.parsed.system_initialize.checklist.map((item) =>
        item.item_id === 'codex_config'
          ? {
              ...item,
              status: 'missing',
              blocking: true,
              severity: 'blocking',
              action_command_ref: 'opl system configure-codex --api-key-stdin',
            }
          : item
      ),
    },
  },
};

describe('FirstRun readiness page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.getInitializeInvoke.mockResolvedValue(initializeResult);
    bridgeMocks.runStartupMaintenanceInvoke.mockResolvedValue({
      surface: 'startup_maintenance',
      command: 'opl system startup-maintenance --json',
      stdout: '{}',
      parsed: { status: 'completed' },
    });
    bridgeMocks.configureCodexInvoke.mockResolvedValue({
      surface: 'configure_codex',
      command: 'opl system configure-codex --api-key-stdin --json',
      stdout: '{}',
      parsed: { codex_config: { status: 'completed' } },
    });
  });

  it('loads initialize state and lets users enter /guid only after Core is ready', async () => {
    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-window')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-window')).toHaveAttribute('aria-label', 'opl-first-run-window');
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('settings.firstRun.coreProgress 3/3');
    expect(screen.getByTestId('opl-first-run-progress')).toHaveAttribute('aria-label', 'opl-first-run-progress');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveAttribute(
      'aria-label',
      'opl-first-run-blockers-list'
    );
    expect(screen.getByLabelText('opl-first-run-ready-entry')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('opl-first-run-ready-entry'));

    expect(navigateMock).toHaveBeenCalledWith('/guid');
  });

  it('configures Codex through the narrow bridge when the Codex config blocks Core readiness', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(blockedInitializeResult).mockResolvedValue(initializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('opl-first-run-codex-api-key-input'), { target: { value: 'secret-key' } });
    expect(screen.getByLabelText('opl-first-run-codex-api-key-input')).toBeInTheDocument();
    expect(screen.getByLabelText('opl-first-run-configure-codex-button')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-first-run-configure-codex-button'));

    await waitFor(() => expect(bridgeMocks.configureCodexInvoke).toHaveBeenCalledWith({ apiKey: 'secret-key' }));
    expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2);
  });

  it('runs startup maintenance without blocking the ready entry', async () => {
    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('opl-first-run-open-environment-button'));

    await waitFor(() => expect(bridgeMocks.runStartupMaintenanceInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-ready-entry')).toBeInTheDocument();
  });
});

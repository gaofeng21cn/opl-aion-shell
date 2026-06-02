import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FirstRun from '@/renderer/pages/FirstRun';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
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
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
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
      return Object.entries(values).reduce((text, [_name, value]) => `${text} ${value}`, key);
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

const fastStateReadyResult = {
  surface: 'app_state_fast',
  command: 'opl app state --profile fast --json',
  stdout: '{}',
  parsed: {
    app_state: {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          api_key_present: true,
          version_status: 'compatible',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/workspace',
          exists: true,
          health_status: 'ready',
        },
      },
    },
  },
};

const fastStateNeedsSetupResult = {
  ...fastStateReadyResult,
  parsed: {
    app_state: {
      ...fastStateReadyResult.parsed.app_state,
      core: {
        codex: {
          installed: true,
          api_key_present: false,
          version_status: 'compatible',
        },
      },
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
    bridgeMocks.getAppStateInvoke.mockResolvedValue(fastStateNeedsSetupResult);
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

  it('uses fast App state to enter /guid while still starting the initialize progress read', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(fastStateReadyResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/guid', { replace: true });
    expect(navigateMock).not.toHaveBeenCalledWith(
      '/guid',
      expect.objectContaining({ state: { postInstallSelfCheck: true } })
    );
  });

  it('loads initialize state and lets users enter /guid only after Core is ready', async () => {
    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-window')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-window')).toHaveAttribute('aria-label', 'opl-first-run-window');
    expect(screen.getByTestId('opl-first-run-beginner-summary')).toHaveTextContent(
      'settings.firstRun.beginner.summaryReady'
    );
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('settings.firstRun.coreProgress 3/3');
    expect(screen.getByTestId('opl-first-run-progress')).toHaveAttribute('aria-label', 'opl-first-run-progress');
    expect(screen.getByTestId('opl-first-run-primary-action')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-technical-details-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('settings.firstRun.stage');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('opl system');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('full_readiness');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent(
      'settings.firstRun.beginner.backgroundMaintenanceWithCount'
    );
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('Codex API Configuration');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('Codex CLI');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('Workspace Root');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('Configured');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('{');
    expect(screen.getByTestId('opl-first-run-technical-details-toggle')).not.toHaveTextContent(
      'settings.firstRun.maintenance.title'
    );
    expect(screen.queryByTestId('opl-first-run-background-maintenance-secondary')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveAttribute(
      'aria-label',
      'opl-first-run-blockers-list'
    );
    expect(screen.getByLabelText('opl-first-run-ready-entry')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('opl-first-run-ready-entry'));

    expect(navigateMock).toHaveBeenCalledWith('/guid', { state: { postInstallSelfCheck: true } });
  });

  it('localizes the beginner surface even when initialize returns English and technical labels', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(blockedInitializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    const beginnerPrimary = screen.getByTestId('opl-first-run-beginner-primary');
    expect(beginnerPrimary).toHaveTextContent('settings.firstRun.items.workspaceRoot');
    expect(beginnerPrimary).toHaveTextContent('settings.firstRun.items.codex');
    expect(beginnerPrimary).toHaveTextContent('settings.firstRun.items.codexConfig');
    expect(beginnerPrimary).toHaveTextContent('settings.firstRun.itemSummaries.codexConfig.needsAction');
    expect(beginnerPrimary).toHaveTextContent('settings.firstRun.codex.prompt');
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent('settings.firstRun.nextSteps.codexConfig');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('settings.firstRun.items.codexConfig');
    expect(beginnerPrimary).not.toHaveTextContent('Codex API Configuration');
    expect(beginnerPrimary).not.toHaveTextContent('Unknown');
    expect(beginnerPrimary).not.toHaveTextContent('Needs setup');
    expect(beginnerPrimary).not.toHaveTextContent('Codex API Key');
    expect(beginnerPrimary).not.toHaveTextContent('opl system configure-codex');
    expect(beginnerPrimary).not.toHaveTextContent('setup_flow');
  });

  it('enters /guid when initialize confirms Core launch readiness while fast App state is still pending', async () => {
    let resolveFastState: ((value: typeof fastStateNeedsSetupResult) => void) | null = null;
    bridgeMocks.getAppStateInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFastState = resolve;
      })
    );
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce({
      ...initializeResult,
      parsed: {
        system_initialize: {
          ...initializeResult.parsed.system_initialize,
          setup_flow: {
            ...initializeResult.parsed.system_initialize.setup_flow,
            is_first_run: true,
          },
        },
      },
    });

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('settings.firstRun.coreProgress 3/3');
    expect(navigateMock).toHaveBeenCalledWith('/guid', { replace: true, state: { postInstallSelfCheck: true } });

    resolveFastState?.(fastStateNeedsSetupResult);
  });

  it('keeps technical phase and maintenance controls out of the beginner primary area', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce({
      ...initializeResult,
      parsed: {
        system_initialize: {
          ...initializeResult.parsed.system_initialize,
          setup_flow: {
            ready_to_launch: true,
            phase: 'full_readiness_maintenance',
            progress: {
              ready_required_count: 3,
              total_required_count: 3,
              ready_full_readiness_count: 4,
              total_full_readiness_count: 6,
              ready_optional_count: 1,
              total_optional_count: 3,
            },
            blocking_items: ['family_runtime_provider'],
            maintenance_items: ['domain_modules', 'recommended_skills'],
          },
          checklist: initializeResult.parsed.system_initialize.checklist.map((item) =>
            item.item_id === 'family_runtime_provider'
              ? {
                  ...item,
                  blocking: true,
                  severity: 'blocking',
                  next_visible_step: 'Start the family runtime provider.',
                }
              : item.item_id === 'domain_modules'
                ? {
                    ...item,
                    next_visible_step: 'Run startup maintenance.',
                  }
                : item
          ),
        },
      },
    });

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    const beginnerPrimary = within(screen.getByTestId('opl-first-run-beginner-primary'));
    expect(screen.getByTestId('opl-first-run-beginner-primary')).toHaveTextContent(
      'settings.firstRun.coreProgress 3/3'
    );
    expect(screen.getByTestId('opl-first-run-beginner-primary')).toHaveTextContent('settings.firstRun.enterGuid');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent(
      'settings.firstRun.stage full_readiness_maintenance'
    );
    expect(beginnerPrimary.queryByTestId('opl-settings-environment')).not.toBeInTheDocument();
    expect(beginnerPrimary.queryByTestId('opl-first-run-retry-button')).not.toBeInTheDocument();
    expect(beginnerPrimary.queryByTestId('opl-first-run-open-environment-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent(
      'settings.firstRun.nextSteps.familyRuntimeProvider'
    );
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent(
      'settings.firstRun.items.familyRuntimeProvider'
    );

    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));

    expect(screen.getByTestId('opl-first-run-stage')).toHaveTextContent(
      'settings.firstRun.stage full_readiness_maintenance'
    );
    expect(screen.getByTestId('opl-first-run-background-maintenance-secondary')).toHaveTextContent(
      'settings.firstRun.beginner.backgroundMaintenanceWithCount 2'
    );
    expect(screen.getByTestId('opl-first-run-core-progress')).toHaveTextContent('settings.firstRun.coreProgress 3/3');
    expect(screen.getByTestId('opl-settings-environment')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-retry-button')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-full-readiness-progress')).toHaveTextContent(
      'settings.firstRun.fullReadinessProgress 4/6'
    );
    expect(screen.getByTestId('opl-first-run-maintenance-progress')).toHaveTextContent(
      'settings.firstRun.maintenanceProgress 1/3'
    );
  });

  it('shows a user-facing first-run error and keeps the raw diagnostic in technical details', async () => {
    bridgeMocks.getInitializeInvoke.mockRejectedValueOnce(
      new Error('OPL runtime command failed: opl system initialize --json')
    );

    render(<FirstRun />);

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.general')
    );
    expect(screen.getByTestId('opl-first-run-user-error')).not.toHaveTextContent('opl system initialize');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('OPL runtime command failed');

    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));

    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent(
      'OPL runtime command failed: opl system initialize --json'
    );
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
    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    fireEvent.click(screen.getByTestId('opl-first-run-open-environment-button'));

    await waitFor(() => expect(bridgeMocks.runStartupMaintenanceInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-ready-entry')).toBeInTheDocument();
  });
});

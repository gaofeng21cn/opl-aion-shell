import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FirstRun from '@/renderer/pages/FirstRun';

const bridgeMocks = vi.hoisted(() => ({
  getInitializeInvoke: vi.fn(),
  initializeEventOn: vi.fn(),
  runInstallPrepInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  configureCodexInvoke: vi.fn(),
  runStartupMaintenanceInvoke: vi.fn(),
  runReconcileModulesInvoke: vi.fn(),
  showOpenInvoke: vi.fn(),
}));
const messageMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: messageMocks.success,
      error: messageMocks.error,
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getInitialize: { invoke: bridgeMocks.getInitializeInvoke },
      initializeEvent: { on: bridgeMocks.initializeEventOn },
      runInstallPrep: { invoke: bridgeMocks.runInstallPrepInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
      configureCodex: { invoke: bridgeMocks.configureCodexInvoke },
      runStartupMaintenance: { invoke: bridgeMocks.runStartupMaintenanceInvoke },
      runReconcileModules: { invoke: bridgeMocks.runReconcileModulesInvoke },
    },
    dialog: {
      showOpen: { invoke: bridgeMocks.showOpenInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === 'settings.firstRun.items.codexConfig') return 'Model Access';
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
  command: 'opl system initialize --events --json',
  stdout: '{}',
  parsed: {
    system_initialize: {
      setup_flow: {
        phase: 'ready_to_finalize',
        ready_to_launch: true,
        progress: {
          ready_required_count: 3,
          total_required_count: 3,
          ready_full_readiness_count: 0,
          total_full_readiness_count: 2,
          ready_optional_count: 0,
          total_optional_count: 1,
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
          readiness_layer: 'core_launch',
          severity: 'info',
          next_visible_step: 'Continue to Codex readiness.',
          detail_summary: 'Selected root',
        },
        {
          item_id: 'codex',
          label: 'Codex CLI',
          status: 'ready',
          required: true,
          blocking: false,
          readiness_layer: 'core_launch',
          severity: 'info',
          next_visible_step: 'Continue to model access.',
          detail_summary: 'Installed',
        },
        {
          item_id: 'codex_config',
          label: 'Codex API Configuration',
          status: 'ready',
          required: true,
          blocking: false,
          readiness_layer: 'core_launch',
          severity: 'info',
          next_visible_step: 'Continue.',
          detail_summary: 'Configured',
        },
        {
          item_id: 'domain_modules',
          label: 'Domain Modules',
          status: 'attention_needed',
          required: true,
          blocking: false,
          readiness_layer: 'full_readiness',
          severity: 'maintenance',
          action_command_ref: 'opl system startup-maintenance',
          next_visible_step: 'Continue in the background.',
          detail_summary: '0/4 default modules ready.',
        },
        {
          item_id: 'family_runtime_provider',
          label: 'Family Runtime Provider',
          status: 'initializing',
          required: true,
          blocking: false,
          readiness_layer: 'full_readiness',
          severity: 'maintenance',
          next_visible_step: 'Continue in the background.',
          detail_summary: 'Temporal not ready.',
        },
        {
          item_id: 'recommended_skills',
          label: 'Recommended Skills',
          status: 'attention_needed',
          required: false,
          blocking: false,
          readiness_layer: 'optional',
          severity: 'maintenance',
          next_visible_step: 'Continue in the background.',
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
        phase: 'core_setup',
        ready_to_launch: false,
        progress: {
          ready_required_count: 2,
          total_required_count: 3,
          ready_full_readiness_count: 0,
          total_full_readiness_count: 2,
          ready_optional_count: 0,
          total_optional_count: 1,
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

const multiBlockerInitializeResult = {
  ...blockedInitializeResult,
  parsed: {
    system_initialize: {
      ...blockedInitializeResult.parsed.system_initialize,
      setup_flow: {
        ...blockedInitializeResult.parsed.system_initialize.setup_flow,
        progress: {
          ready_required_count: 1,
          total_required_count: 3,
          ready_full_readiness_count: 0,
          total_full_readiness_count: 2,
          ready_optional_count: 0,
          total_optional_count: 1,
        },
        blocking_items: ['codex', 'codex_config'],
      },
      checklist: blockedInitializeResult.parsed.system_initialize.checklist.map((item) =>
        item.item_id === 'codex'
          ? {
              ...item,
              status: 'missing',
              blocking: true,
              severity: 'blocking',
            }
          : item
      ),
    },
  },
};

const workspaceBlockedInitializeResult = {
  ...blockedInitializeResult,
  parsed: {
    system_initialize: {
      ...blockedInitializeResult.parsed.system_initialize,
      setup_flow: {
        ...blockedInitializeResult.parsed.system_initialize.setup_flow,
        blocking_items: ['workspace_root'],
      },
      checklist: blockedInitializeResult.parsed.system_initialize.checklist.map((item) =>
        item.item_id === 'workspace_root'
          ? {
              ...item,
              status: 'missing',
              blocking: true,
              severity: 'blocking',
              next_visible_step: 'Choose workspace root',
            }
          : item.item_id === 'codex_config'
            ? { ...item, status: 'configured', blocking: false, severity: 'info' }
            : item
      ),
    },
  },
};

const configureCodexResult = {
  surface: 'configure_codex',
  command: 'opl system configure-codex --api-key-stdin --json',
  stdout: '{}',
  parsed: { codex_config: { status: 'completed' } },
};
const startupMaintenanceResult = {
  surface: 'startup_maintenance',
  command: 'opl system startup-maintenance --json',
  stdout: '{}',
  parsed: { status: 'completed' },
};
const workspaceActionResult = {
  surface: 'app_action',
  command: 'opl app action execute --action workspace_root_set --json',
  stdout: '{}',
  parsed: { status: 'completed' },
};

describe('FirstRun readiness page', () => {
  let initializeEventHandler: ((event: unknown) => void) | null = null;
  let resolveInitialize: ((value: typeof initializeResult) => void) | null = null;
  let resolveConfigure: ((value: typeof configureCodexResult) => void) | null = null;
  let resolveMaintenance: ((value: typeof startupMaintenanceResult) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    initializeEventHandler = null;
    resolveInitialize = null;
    resolveConfigure = null;
    resolveMaintenance = null;
    bridgeMocks.initializeEventOn.mockImplementation((handler: (event: unknown) => void) => {
      initializeEventHandler = handler;
      return vi.fn();
    });
    bridgeMocks.getInitializeInvoke.mockResolvedValue(initializeResult);
    bridgeMocks.runStartupMaintenanceInvoke.mockResolvedValue(startupMaintenanceResult);
    bridgeMocks.executeActionInvoke.mockResolvedValue(workspaceActionResult);
    bridgeMocks.configureCodexInvoke.mockResolvedValue(configureCodexResult);
    bridgeMocks.showOpenInvoke.mockResolvedValue(['/Users/example/workspace']);
  });

  it('keeps the beginner first-run surface visible when first-run Core is ready', async () => {
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
    await waitFor(() => expect(screen.getByTestId('opl-first-run-window')).toBeInTheDocument());
    expect(screen.getByTestId('opl-first-run-beginner-primary')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith('/guid', expect.anything());
  });

  it('isolates the focused first-run workspace from the ordinary shell until unmount', async () => {
    const ordinaryNavigation = document.createElement('button');
    ordinaryNavigation.textContent = 'Ordinary navigation';
    document.body.appendChild(ordinaryNavigation);

    const { unmount } = render(<FirstRun />);

    await waitFor(() => expect(screen.getByTestId('opl-first-run-window')).toHaveFocus());
    expect(ordinaryNavigation).toHaveAttribute('inert');
    expect(ordinaryNavigation).toHaveAttribute('aria-hidden', 'true');

    unmount();
    expect(ordinaryNavigation).not.toHaveAttribute('inert');
    expect(ordinaryNavigation).not.toHaveAttribute('aria-hidden');
    ordinaryNavigation.remove();
  });

  it('shows initialization progress while the initialize command is still pending', async () => {
    bridgeMocks.getInitializeInvoke.mockReturnValueOnce(
      new Promise<typeof initializeResult>((resolve) => {
        resolveInitialize = resolve;
      })
    );

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-window')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-progress')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-beginner-summary')).toHaveTextContent(
      'settings.firstRun.beginner.summaryChecking'
    );
    expect(screen.getByTestId('opl-first-run-focused-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-step-rail')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-task-panel')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-initialize-pending')).toHaveTextContent(
      'settings.firstRun.initializePending.progress'
    );
    act(() => {
      initializeEventHandler?.({
        surface_id: 'opl_system_initialize_event',
        event_type: 'phase_start',
        phase: 'native_helpers',
        label: 'Inspect OPL System Bridge',
        sequence: 8,
        observed_at: '2026-06-29T00:00:00.000Z',
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-initialize-pending')).toHaveTextContent(
        'settings.firstRun.initializePhases.nativeHelpers'
      )
    );
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('Inspect OPL System Bridge');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).toHaveTextContent('settings.firstRun.checking.title');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent(
      'settings.firstRun.stage reading_initialize_state'
    );
    expect(screen.getByTestId('opl-first-run-technical-details-toggle')).not.toHaveTextContent(
      'settings.firstRun.maintenance.title'
    );
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent(
      'settings.firstRun.checking.itemsPending'
    );
    expect(screen.getByTestId('opl-first-run-blockers-list')).not.toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent(
      'settings.firstRun.checking.nextStepPending'
    );

    resolveInitialize?.(initializeResult);
    await waitFor(() => expect(screen.queryByTestId('opl-first-run-initialize-pending')).not.toBeInTheDocument());
  });

  it('loads initialize state and lets users enter /guid only after Core is ready', async () => {
    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-window')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-window')).toHaveAccessibleName('settings.firstRun.setupTitle');
    expect(screen.getByRole('heading', { level: 1, name: 'settings.firstRun.setupTitle' })).toHaveAttribute(
      'id',
      'opl-first-run-setup-title'
    );
    expect(screen.getByTestId('opl-first-run-beginner-summary')).toHaveTextContent(
      'settings.firstRun.beginner.summaryReady'
    );
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('settings.firstRun.stepProgress 3 3');
    expect(screen.getByTestId('opl-first-run-progress')).not.toHaveTextContent('%');
    expect(screen.getByTestId('opl-first-run-progress')).not.toHaveAttribute('aria-label');
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
    expect(screen.getByTestId('opl-first-run-step-rail')).toHaveTextContent('settings.firstRun.items.workspaceRoot');
    expect(screen.getByTestId('opl-first-run-step-rail')).toHaveTextContent('settings.firstRun.items.codex');
    expect(within(screen.getByTestId('opl-first-run-step-rail')).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('opl-first-run-task-panel')).toHaveTextContent('settings.firstRun.readyPanel.title');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('{');
    expect(screen.getByTestId('opl-first-run-technical-details-toggle')).not.toHaveTextContent('https://gflabtoken.cn');
    expect(screen.getByTestId('opl-first-run-technical-details-toggle')).not.toHaveTextContent('gpt-5.5');
    expect(screen.getByTestId('opl-first-run-technical-details-toggle')).not.toHaveTextContent(
      'settings.firstRun.maintenance.title'
    );
    expect(screen.queryByTestId('opl-first-run-background-maintenance-secondary')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-blockers-list')).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name: 'settings.firstRun.enterGuid' })).toBeInTheDocument();

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
    expect(beginnerPrimary).toHaveTextContent('Model Access');
    expect(beginnerPrimary).toHaveTextContent('settings.firstRun.modelAccess.description');
    expect(screen.getByTestId('opl-first-run-access-methods')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent('settings.firstRun.nextSteps.codexConfig');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('Model Access');
    expect(beginnerPrimary).not.toHaveTextContent('Codex API Configuration');
    expect(beginnerPrimary).not.toHaveTextContent('Unknown');
    expect(beginnerPrimary).not.toHaveTextContent('Needs setup');
    expect(beginnerPrimary).not.toHaveTextContent('Codex API Key');
    expect(beginnerPrimary).not.toHaveTextContent('opl system configure-codex');
    expect(beginnerPrimary).not.toHaveTextContent('setup_flow');
  });

  it('does not leave first-run automatically when first-run initialize confirms Core launch readiness', async () => {
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
    expect(screen.getByTestId('opl-first-run-progress')).toHaveTextContent('settings.firstRun.stepProgress 3 3');
    expect(navigateMock).not.toHaveBeenCalledWith('/guid', expect.anything());
  });

  it('keeps the completion state in place even when initialize reports a non-first-run ready install', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce({
      ...initializeResult,
      parsed: {
        system_initialize: {
          ...initializeResult.parsed.system_initialize,
          setup_flow: {
            ...initializeResult.parsed.system_initialize.setup_flow,
            is_first_run: false,
          },
        },
      },
    });

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'settings.firstRun.enterGuid' })).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
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
            blocking_items: [],
            maintenance_items: ['domain_modules', 'recommended_skills'],
          },
          checklist: initializeResult.parsed.system_initialize.checklist.map((item) =>
            item.item_id === 'family_runtime_provider'
              ? {
                  ...item,
                  blocking: false,
                  severity: 'maintenance',
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
      'settings.firstRun.stepProgress 3 3'
    );
    expect(screen.getByTestId('opl-first-run-beginner-primary')).toHaveTextContent('settings.firstRun.enterGuid');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent(
      'settings.firstRun.stage full_readiness_maintenance'
    );
    expect(beginnerPrimary.queryByTestId('opl-settings-environment')).not.toBeInTheDocument();
    expect(beginnerPrimary.queryByTestId('opl-first-run-retry-button')).not.toBeInTheDocument();
    expect(beginnerPrimary.queryByTestId('opl-first-run-open-environment-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent('settings.firstRun.noNextStep');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-blockers-list')).not.toHaveTextContent(
      'settings.firstRun.items.familyRuntimeProvider'
    );

    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));

    expect(screen.getByTestId('opl-first-run-stage')).toHaveTextContent(
      'settings.firstRun.stage full_readiness_maintenance'
    );
    expect(screen.getByTestId('opl-first-run-background-maintenance-secondary')).toHaveTextContent(
      'settings.firstRun.beginner.backgroundMaintenanceWithCount 2'
    );
    expect(screen.getByTestId('opl-first-run-core-progress')).toHaveTextContent('settings.firstRun.stepProgress 3 3');
    expect(screen.queryByTestId('opl-settings-environment')).not.toBeInTheDocument();
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
      new Error('OPL runtime command failed: opl system initialize --events --json')
    );

    render(<FirstRun />);

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.general')
    );
    expect(screen.getByTestId('opl-first-run-user-error')).not.toHaveTextContent('opl system initialize');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('OPL runtime command failed');
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent(
      'settings.firstRun.checking.itemsPending'
    );
    expect(screen.getByTestId('opl-first-run-blockers-list')).not.toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent(
      'settings.firstRun.checking.nextStepPending'
    );
    expect(screen.getByTestId('opl-first-run-next-step')).not.toHaveTextContent('settings.firstRun.noNextStep');

    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));

    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent(
      'OPL runtime command failed: opl system initialize --events --json'
    );
  });

  it('treats a successful bridge response without an initialize payload as an unresolved check', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce({ ...initializeResult, parsed: {} });

    render(<FirstRun />);

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.general')
    );
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent(
      'settings.firstRun.checking.itemsPending'
    );
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent(
      'settings.firstRun.checking.nextStepPending'
    );
    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent('initialize payload is missing');
  });

  it('fails closed when legacy readiness conflicts with an internally inconsistent setup_flow', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce({
      ...initializeResult,
      parsed: {
        system_initialize: {
          setup_flow: {
            phase: 'core_setup',
            ready_to_launch: false,
            progress: {
              ready_required_count: 3,
              total_required_count: 3,
              ready_full_readiness_count: 0,
              total_full_readiness_count: 2,
              ready_optional_count: 0,
              total_optional_count: 1,
            },
            blocking_items: [],
            maintenance_items: [],
          },
          checklist: initializeResult.parsed.system_initialize.checklist,
          readiness: { launch_ready: true },
        },
      },
    });

    render(<FirstRun />);

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.general')
    );
    expect(screen.queryByTestId('opl-first-run-ready-entry')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent(
      'settings.firstRun.checking.itemsPending'
    );
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent(
      'settings.firstRun.checking.nextStepPending'
    );
  });

  it('routes a workspace blocker to the native directory picker and App action boundary', async () => {
    bridgeMocks.getInitializeInvoke
      .mockResolvedValueOnce(workspaceBlockedInitializeResult)
      .mockResolvedValue(initializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(
      within(screen.getByTestId('opl-first-run-primary-action')).getByRole('button', {
        name: 'settings.firstRun.actions.chooseWorkspace',
      })
    );

    await waitFor(() => expect(bridgeMocks.showOpenInvoke).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'workspace_root_set',
      dryRun: false,
      payloadRefsOnlyJson: { path: '/Users/example/workspace' },
    });
    expect(bridgeMocks.runInstallPrepInvoke).not.toHaveBeenCalled();
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
  });

  it('keeps the active rail step, task action, and focus aligned when Core readiness advances', async () => {
    bridgeMocks.getInitializeInvoke
      .mockResolvedValueOnce(multiBlockerInitializeResult)
      .mockResolvedValueOnce(blockedInitializeResult);
    bridgeMocks.runInstallPrepInvoke.mockResolvedValue(startupMaintenanceResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-step-codex')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('opl-first-run-step-codex_config')).toHaveAttribute('data-state', 'pending');
    expect(screen.queryByTestId('opl-first-run-codex-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-task-panel')).toHaveTextContent('settings.firstRun.blockedPanel.title');

    fireEvent.click(
      within(screen.getByTestId('opl-first-run-primary-action')).getByRole('button', {
        name: 'settings.firstRun.actions.install',
      })
    );
    await waitFor(() => expect(bridgeMocks.runInstallPrepInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-step-codex_config')).toHaveAttribute('data-state', 'active')
    );
    expect(screen.getByTestId('opl-first-run-task-panel')).toHaveFocus();
  });

  it('configures Codex through the narrow bridge when the Codex config blocks Core readiness', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(blockedInitializeResult).mockResolvedValue(initializeResult);
    bridgeMocks.configureCodexInvoke.mockReturnValueOnce(
      new Promise<typeof configureCodexResult>((resolve) => {
        resolveConfigure = resolve;
      })
    );

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    const taskPanel = screen.getByTestId('opl-first-run-task-panel');
    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    fireEvent.change(screen.getByTestId('opl-first-run-codex-api-key-input'), { target: { value: 'secret-key' } });
    expect(screen.getByRole('radiogroup', { name: 'settings.firstRun.modelAccess.methodLabel' })).toBeInTheDocument();
    expect(screen.getByLabelText('settings.firstRun.codex.apiKeyLabel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.firstRun.codex.verifyAndContinue' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-first-run-configure-codex-button'));

    await waitFor(() => expect(bridgeMocks.configureCodexInvoke).toHaveBeenCalledWith({ apiKey: 'secret-key' }));
    for (const radio of within(screen.getByTestId('opl-first-run-access-methods')).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-retry-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-install-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-open-environment-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-open-modules-button')).toBeDisabled();
    act(() =>
      resolveConfigure?.({
        ...configureCodexResult,
        stdout: 'configured secret-key',
        parsed: { codex_config: { status: 'completed', diagnostic: 'secret-key' } },
      })
    );
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(taskPanel).toHaveTextContent('settings.firstRun.readyPanel.title'));
    expect(screen.getByTestId('opl-first-run-task-panel')).toBe(taskPanel);
    expect(within(taskPanel).getAllByTestId('opl-first-run-ready-entry')).toHaveLength(1);
    expect(within(taskPanel).getByRole('button', { name: 'settings.firstRun.enterGuid' })).toHaveFocus();
    expect(screen.queryByTestId('opl-first-run-configure-codex-button')).not.toBeInTheDocument();
    expect(screen.getByText(/"diagnostic": "\[REDACTED\]"/)).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-technical-details')).not.toHaveTextContent('secret-key');
  });

  it('keeps Gateway failures localized while preserving the raw error in technical details', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);
    bridgeMocks.configureCodexInvoke.mockRejectedValueOnce(new Error('provider rejected secret-key'));

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('opl-first-run-codex-api-key-input'), { target: { value: 'secret-key' } });
    fireEvent.click(screen.getByTestId('opl-first-run-configure-codex-button'));

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.codexConfig')
    );
    expect(messageMocks.error).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('provider rejected');
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toHaveValue('secret-key');

    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent('provider rejected [REDACTED]');
    expect(screen.getByTestId('opl-first-run-technical-error')).not.toHaveTextContent('secret-key');
  });

  it('switches to existing Codex access and rechecks through the initialize bridge', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('opl-first-run-existing-codex-method'));

    expect(screen.queryByTestId('opl-first-run-codex-api-key-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-recheck-existing')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-first-run-recheck-existing'));

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-method'));
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toBeInTheDocument();
  });

  it('disables model access and refresh controls while a maintenance action is running', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);
    bridgeMocks.runStartupMaintenanceInvoke.mockReturnValueOnce(
      new Promise<typeof startupMaintenanceResult>((resolve) => {
        resolveMaintenance = resolve;
      })
    );

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    fireEvent.click(screen.getByTestId('opl-first-run-open-environment-button'));

    await waitFor(() => expect(bridgeMocks.runStartupMaintenanceInvoke).toHaveBeenCalledTimes(1));
    for (const radio of within(screen.getByTestId('opl-first-run-access-methods')).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-configure-codex-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-retry-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-install-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-open-modules-button')).toBeDisabled();

    act(() => resolveMaintenance?.(startupMaintenanceResult));
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
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

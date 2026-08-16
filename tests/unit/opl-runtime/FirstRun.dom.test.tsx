import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FirstRun from '@/renderer/pages/FirstRun';
import { useCoreLaunchPrerequisites } from '@/renderer/hooks/system/useCoreLaunchPrerequisites';
import { cacheFastOplAppState, resetOplAppStateLoadsForTest } from '@/renderer/hooks/system/useOplAppState';

const bridgeMocks = vi.hoisted(() => ({
  getInitializeInvoke: vi.fn(),
  getAppStateInvoke: vi.fn(),
  initializeEventOn: vi.fn(),
  runInstallPrepInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  applyOfficialProfileInvoke: vi.fn(),
  configureCodexInvoke: vi.fn(),
  loginGatewayAccountInvoke: vi.fn(),
  runStartupMaintenanceInvoke: vi.fn(),
  showOpenInvoke: vi.fn(),
  openFolderWithInvoke: vi.fn(),
}));
const messageMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const platformMocks = vi.hoisted(() => ({ isElectronDesktop: vi.fn(), isMacOS: vi.fn() }));

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
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      initializeEvent: { on: bridgeMocks.initializeEventOn },
      runInstallPrep: { invoke: bridgeMocks.runInstallPrepInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
      applyOfficialProfile: { invoke: bridgeMocks.applyOfficialProfileInvoke },
      configureCodex: { invoke: bridgeMocks.configureCodexInvoke },
      loginGatewayAccount: { invoke: bridgeMocks.loginGatewayAccountInvoke },
      runStartupMaintenance: { invoke: bridgeMocks.runStartupMaintenanceInvoke },
    },
    dialog: {
      showOpen: { invoke: bridgeMocks.showOpenInvoke },
    },
    shell: {
      openFolderWith: { invoke: bridgeMocks.openFolderWithInvoke },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: platformMocks.isElectronDesktop,
  isMacOS: platformMocks.isMacOS,
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
        model_provider: 'oplgateway',
        base_url: 'https://gateway.medopl.com/v1',
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
const gatewayLoginResult = {
  ok: true,
  stateRefreshRequired: true,
};
function createGatewayFastStateResult({
  managedKey = null,
  modelAccessReady = false,
  useForModelAccess = null,
}: {
  managedKey?: { name: string; status: string; ownership: string } | null;
  modelAccessReady?: boolean;
  useForModelAccess?: 'gateway_account_use_for_model_access' | null;
} = {}) {
  return {
    surface: 'app_state_fast',
    command: 'opl app state --profile fast --json',
    stdout: '{}',
    parsed: {
      app_state: {
        schema_version: 'opl_app_state.v1',
        core: {
          codex: {
            installed: true,
            enabled: true,
            version_status: 'compatible',
            model_access_ready: modelAccessReady,
          },
        },
        paths: {
          workspace_root_path: '/Users/example/workspace',
          workspace_root: {
            selected_path: '/Users/example/workspace',
            exists: true,
            writable: true,
            health_status: 'ready',
          },
        },
        settings_control_center: {
          app_settings_read_model: {
            opl_gateway_account: {
              surface_kind: 'opl_gateway_account_read_model.v1',
              status: managedKey ? 'connected' : 'setup_required',
              connection_mode: 'account',
              account_card_visible: true,
              account: {
                display_name: 'OPL User',
                email: 'user@example.com',
                status: 'active',
                balance: { amount: null, currency: 'CNY' },
              },
              usage: null,
              managed_key: managedKey,
              installation: { device_label: 'Framework default', short_id: 'ABCD1234' },
              available_groups: [{ group_id: 'codex-group', label: 'Codex Team' }],
              freshness: {
                observed_at: '2026-07-16T08:00:00Z',
                stale_after: '2026-07-16T08:15:00Z',
                stale: false,
                last_error_code: null,
              },
              capabilities: { account_login_supported: true, manual_key_supported: true },
              actions: {
                complete_setup: managedKey ? null : 'gateway_account_complete_setup',
                refresh: 'gateway_account_refresh',
                repair: null,
                use_for_model_access: useForModelAccess,
                disconnect: 'gateway_account_disconnect',
              },
            },
          },
        },
      },
    },
  };
}

const gatewayFastStateResult = createGatewayFastStateResult();
const gatewayManagedKeyStateResult = createGatewayFastStateResult({
  managedKey: { name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app' },
  useForModelAccess: 'gateway_account_use_for_model_access',
});
const gatewayModelReadyStateResult = createGatewayFastStateResult({
  managedKey: { name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app' },
  modelAccessReady: true,
});
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
const workspaceFastStateResult = {
  surface: 'app_state_fast',
  command: 'opl app state --profile fast --json',
  stdout: '{}',
  parsed: {
    app_state: {
      paths: {
        workspace_root_path: '/Users/example/current-workspace',
        workspace_root: {
          selected_path: '/Users/example/current-workspace',
          exists: true,
          writable: false,
          health_status: 'blocking',
        },
      },
    },
  },
};

const CoreReadinessProbe = () => {
  const readiness = useCoreLaunchPrerequisites();
  return <span data-testid='core-readiness-probe'>{readiness.readyToLaunch ? 'ready' : 'blocked'}</span>;
};

describe('FirstRun readiness page', () => {
  let initializeEventHandler: ((event: unknown) => void) | null = null;
  let resolveInitialize: ((value: typeof initializeResult) => void) | null = null;
  let resolveConfigure: ((value: typeof configureCodexResult) => void) | null = null;
  let resolveMaintenance: ((value: typeof startupMaintenanceResult) => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetOplAppStateLoadsForTest();
    initializeEventHandler = null;
    resolveInitialize = null;
    resolveConfigure = null;
    resolveMaintenance = null;
    bridgeMocks.initializeEventOn.mockImplementation((handler: (event: unknown) => void) => {
      initializeEventHandler = handler;
      return vi.fn();
    });
    bridgeMocks.getInitializeInvoke.mockResolvedValue(initializeResult);
    bridgeMocks.getAppStateInvoke.mockResolvedValue(gatewayFastStateResult);
    bridgeMocks.runStartupMaintenanceInvoke.mockResolvedValue(startupMaintenanceResult);
    bridgeMocks.executeActionInvoke.mockResolvedValue(workspaceActionResult);
    bridgeMocks.applyOfficialProfileInvoke.mockResolvedValue({
      surface: 'app_action',
      command: 'node <official-profile-package-apply.ts> --intent first_install',
      stdout: '{}',
      parsed: { official_profile_package_apply: { status: 'completed', intent: 'first_install' } },
      ok: true,
    });
    bridgeMocks.configureCodexInvoke.mockResolvedValue(configureCodexResult);
    bridgeMocks.loginGatewayAccountInvoke.mockResolvedValue(gatewayLoginResult);
    bridgeMocks.showOpenInvoke.mockResolvedValue(['/Users/example/workspace']);
    bridgeMocks.openFolderWithInvoke.mockResolvedValue(undefined);
    platformMocks.isElectronDesktop.mockReturnValue(true);
    platformMocks.isMacOS.mockReturnValue(false);
  });

  it('keeps compact setup controls single-column and the workspace surface flat', () => {
    const stylesSource = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/src/renderer/pages/FirstRun/FirstRun.module.css'),
      'utf8'
    );
    const compactStart = stylesSource.indexOf('@media (max-width: 600px) {');
    const compactEnd = stylesSource.indexOf('@media (max-width: 600px) and (max-height: 700px)');
    const compactStyles = stylesSource.slice(compactStart, compactEnd);
    const workspaceRule = stylesSource.match(/\.firstRunWorkspace\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(compactStart).toBeGreaterThanOrEqual(0);
    expect(compactEnd).toBeGreaterThan(compactStart);
    expect(compactStyles).toMatch(
      /\.firstRunAccessMethods,\s*\.firstRunAccessFields\s*\{\s*grid-template-columns:\s*1fr;/
    );
    expect(compactStyles).toMatch(/\.firstRunWorkspaceRecoveryActions\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(workspaceRule).not.toContain('box-shadow');
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
    const technicalDetails = screen.getByTestId('opl-first-run-technical-details-toggle');
    expect(technicalDetails).not.toHaveTextContent('settings.firstRun.maintenance.title');
    expect(technicalDetails.querySelector('svg')).toBeNull();
    expect(screen.getByRole('button', { name: 'settings.firstRun.help' }).querySelector('svg')).toBeNull();
    expect(screen.getByTestId('opl-first-run-blockers-list')).toHaveTextContent(
      'settings.firstRun.checking.itemsPending'
    );
    expect(screen.getByTestId('opl-first-run-blockers-list')).not.toHaveTextContent('settings.firstRun.noCoreBlockers');
    expect(screen.getByTestId('opl-first-run-next-step')).toHaveTextContent(
      'settings.firstRun.checking.nextStepPending'
    );

    await act(async () => {
      resolveInitialize?.(initializeResult);
    });
    await waitFor(() => expect(screen.queryByTestId('opl-first-run-initialize-pending')).not.toBeInTheDocument());
  });

  it('lets users enter OPL while readiness is unresolved without mutating setup state', async () => {
    bridgeMocks.getInitializeInvoke.mockReturnValueOnce(
      new Promise<typeof initializeResult>((resolve) => {
        resolveInitialize = resolve;
      })
    );

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    const enterApp = screen.getByTestId('opl-first-run-enter-app');
    expect(enterApp).toBeEnabled();

    fireEvent.click(enterApp);

    expect(navigateMock).toHaveBeenCalledWith('/guid');
    expect(bridgeMocks.configureCodexInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.runInstallPrepInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.runStartupMaintenanceInvoke).not.toHaveBeenCalled();

    await act(async () => {
      resolveInitialize?.(initializeResult);
    });
  });

  it('loads initialize state and lets users enter /guid only after Core is ready', async () => {
    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('opl-first-run-completion')).toBeInTheDocument());
    expect(screen.getByTestId('opl-first-run-window')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-window')).toHaveAccessibleName(
      'guid.uiOptimization.firstRun.completion.title'
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'guid.uiOptimization.firstRun.completion.title' })
    ).toHaveAttribute('id', 'opl-first-run-setup-title');
    expect(screen.getByTestId('opl-first-run-beginner-summary')).toHaveTextContent(
      'guid.uiOptimization.firstRun.completion.summary'
    );
    expect(screen.getByTestId('opl-first-run-progress')).not.toHaveTextContent('settings.firstRun.stepProgress');
    expect(screen.getByTestId('opl-first-run-progress')).not.toHaveTextContent('%');
    expect(screen.getByTestId('opl-first-run-progress')).not.toHaveAttribute('aria-label');
    expect(screen.getByTestId('opl-first-run-primary-action')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-technical-details-toggle')).not.toBeInTheDocument();
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
    expect(screen.queryByTestId('opl-first-run-step-rail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-task-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('{');
    expect(screen.getByTestId('opl-first-run-completion')).not.toHaveTextContent('https://gateway.medopl.com');
    expect(screen.getByTestId('opl-first-run-completion')).not.toHaveTextContent('gpt-5.5');
    expect(screen.getByTestId('opl-first-run-completion')).not.toHaveTextContent('settings.firstRun.maintenance.title');
    expect(screen.queryByTestId('opl-first-run-background-maintenance-secondary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-blockers-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-next-step')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'guid.uiOptimization.firstRun.completion.primaryAction' })
    ).toBeInTheDocument();

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
    platformMocks.isMacOS.mockReturnValue(true);
    bridgeMocks.applyOfficialProfileInvoke.mockImplementationOnce(() => new Promise(() => undefined));
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
    await waitFor(() =>
      expect(bridgeMocks.applyOfficialProfileInvoke).toHaveBeenCalledWith({ intent: 'first_install' })
    );
    const readyEntry = screen.getByRole('button', {
      name: 'guid.uiOptimization.firstRun.completion.primaryAction',
    });
    expect(readyEntry).toBeEnabled();
    expect(screen.getByTestId('opl-first-run-official-profile-background')).toHaveTextContent(
      'settings.firstRun.officialProfile.preparing'
    );
    fireEvent.click(readyEntry);
    expect(bridgeMocks.applyOfficialProfileInvoke).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('opl-first-run-completion')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-step-rail')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-progress')).not.toHaveTextContent('settings.firstRun.stepProgress');
    expect(navigateMock).toHaveBeenCalledWith('/guid', { state: { postInstallSelfCheck: true } });
  });

  it('keeps the completion state in place even when initialize reports a non-first-run ready install', async () => {
    platformMocks.isMacOS.mockReturnValue(true);
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
    expect(
      screen.getByRole('button', { name: 'guid.uiOptimization.firstRun.completion.primaryAction' })
    ).toBeInTheDocument();
    expect(bridgeMocks.applyOfficialProfileInvoke).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('keeps first-install Official Profile failure local and retries only after an explicit refresh', async () => {
    platformMocks.isMacOS.mockReturnValue(true);
    const firstInstallInitialize = {
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
    };
    bridgeMocks.getInitializeInvoke.mockResolvedValue(firstInstallInitialize);
    bridgeMocks.applyOfficialProfileInvoke
      .mockRejectedValueOnce(new Error('official profile install failed'))
      .mockResolvedValueOnce({
        surface: 'app_action',
        command: 'node <official-profile-package-apply.ts> --intent first_install',
        stdout: '{}',
        parsed: { official_profile_package_apply: { status: 'completed', intent: 'first_install' } },
        ok: true,
      });

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.applyOfficialProfileInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-official-profile-background')).toHaveTextContent(
        'settings.firstRun.officialProfile.attention'
      )
    );
    expect(screen.queryByTestId('opl-first-run-user-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-ready-entry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'guid.uiOptimization.firstRun.completion.primaryAction' })).toBeEnabled();
    expect(screen.queryByTestId('opl-first-run-enter-app')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'settings.firstRun.help' }));
    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent('official profile install failed');
    expect(bridgeMocks.applyOfficialProfileInvoke).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('opl-first-run-official-profile-retry'));

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(bridgeMocks.applyOfficialProfileInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('opl-first-run-ready-entry')).toBeInTheDocument());
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
    expect(screen.getByTestId('opl-first-run-completion')).toHaveTextContent(
      'guid.uiOptimization.firstRun.completion.summary'
    );
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent(
      'settings.firstRun.stepProgress'
    );
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('settings.firstRun.enterGuid');
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent(
      'settings.firstRun.stage full_readiness_maintenance'
    );
    expect(beginnerPrimary.queryByTestId('opl-settings-environment')).not.toBeInTheDocument();
    expect(beginnerPrimary.queryByTestId('opl-first-run-retry-button')).not.toBeInTheDocument();
    expect(beginnerPrimary.queryByTestId('opl-first-run-open-environment-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-next-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-blockers-list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.firstRun.help' }));

    expect(screen.getByTestId('opl-first-run-stage')).toHaveTextContent(
      'settings.firstRun.stage full_readiness_maintenance'
    );
    expect(screen.getByTestId('opl-first-run-background-maintenance-secondary')).toHaveTextContent(
      'settings.firstRun.beginner.backgroundMaintenanceWithCount 2'
    );
    expect(screen.queryByTestId('opl-first-run-core-progress')).not.toBeInTheDocument();
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
    bridgeMocks.getInitializeInvoke.mockResolvedValue(workspaceBlockedInitializeResult);
    bridgeMocks.getAppStateInvoke.mockResolvedValue(workspaceFastStateResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(screen.getByTestId('opl-first-run-workspace-path')).toHaveTextContent('/Users/example/current-workspace');

    const openWorkspace = screen.getByRole('button', { name: 'settings.workspacePage.actions.openWorkspace' });
    const recheckWorkspace = screen.getByRole('button', { name: 'settings.workspacePage.actions.recheck' });
    const chooseWorkspace = within(screen.getByTestId('opl-first-run-primary-action')).getByRole('button', {
      name: 'settings.firstRun.actions.chooseWorkspace',
    });
    expect(openWorkspace.querySelector('svg')).toBeNull();
    expect(recheckWorkspace.querySelector('svg')).toBeNull();
    expect(chooseWorkspace.querySelector('svg')).toBeNull();

    fireEvent.click(openWorkspace);
    await waitFor(() =>
      expect(bridgeMocks.openFolderWithInvoke).toHaveBeenCalledWith({
        folder_path: '/Users/example/current-workspace',
        tool: 'explorer',
      })
    );

    bridgeMocks.openFolderWithInvoke.mockRejectedValueOnce(new Error('open failed'));
    fireEvent.click(openWorkspace);
    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.workspace')
    );

    fireEvent.click(recheckWorkspace);
    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));

    fireEvent.click(chooseWorkspace);

    await waitFor(() =>
      expect(bridgeMocks.showOpenInvoke).toHaveBeenCalledWith({
        defaultPath: '/Users/example/current-workspace',
        properties: ['openDirectory', 'createDirectory'],
      })
    );
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'workspace_root_set',
      dryRun: false,
      payloadRefsOnlyJson: { path: '/Users/example/workspace' },
    });
    expect(bridgeMocks.runInstallPrepInvoke).not.toHaveBeenCalled();
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('opl-first-run-workspace-path')).toHaveTextContent('/Users/example/workspace');
  });

  it('does not read Desktop fast state for a WebUI workspace blocker', async () => {
    platformMocks.isElectronDesktop.mockReturnValue(false);
    bridgeMocks.getInitializeInvoke.mockResolvedValue(workspaceBlockedInitializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.getAppStateInvoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId('opl-first-run-workspace-recovery')).not.toBeInTheDocument();
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

  it('requires explicit confirmation after Gateway setup before binding model access', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(blockedInitializeResult).mockResolvedValue(initializeResult);
    bridgeMocks.getAppStateInvoke
      .mockResolvedValueOnce(gatewayFastStateResult)
      .mockResolvedValueOnce(gatewayManagedKeyStateResult)
      .mockResolvedValueOnce(gatewayManagedKeyStateResult)
      .mockResolvedValueOnce(gatewayModelReadyStateResult);
    cacheFastOplAppState(gatewayFastStateResult.parsed, '20:00:00');

    render(
      <>
        <CoreReadinessProbe />
        <FirstRun />
      </>
    );

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('core-readiness-probe')).toHaveTextContent('blocked');
    expect(within(screen.getByTestId('opl-first-run-gateway-account-method')).getByRole('radio')).toBeChecked();
    expect(screen.getByTestId('opl-first-run-gateway-email-input')).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-gateway-password-input')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-codex-api-key-input')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.accessPage.gatewayAccount.deviceLabel')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('opl-first-run-gateway-email-input'), {
      target: { value: ' user@example.com ' },
    });
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-password-input'), {
      target: { value: 'gateway-password' },
    });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-login-button'));

    await waitFor(() =>
      expect(bridgeMocks.loginGatewayAccountInvoke).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'gateway-password',
      })
    );
    expect(bridgeMocks.loginGatewayAccountInvoke.mock.calls[0][0]).not.toHaveProperty('deviceLabel');
    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'gateway_account_complete_setup',
      dryRun: false,
      payloadJson: { group_id: 'codex-group' },
    });
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'gateway_account_use_for_model_access' })
    );
    expect(screen.getByTestId('opl-first-run-gateway-login-success')).toHaveTextContent(
      'settings.firstRun.gatewayAccount.successTitle'
    );
    expect(screen.getByTestId('opl-first-run-gateway-login-success')).toHaveTextContent(
      'settings.firstRun.gatewayAccount.confirmDescription'
    );
    expect(screen.queryByTestId('opl-first-run-gateway-email-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-first-run-gateway-password-input')).not.toBeInTheDocument();
    const modelAccessConfirm = screen.getByTestId('opl-first-run-gateway-model-access-confirm');
    expect(modelAccessConfirm).toHaveTextContent('settings.firstRun.gatewayAccount.confirmButton');
    expect(modelAccessConfirm).toBeEnabled();
    expect(modelAccessConfirm).toHaveFocus();
    expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent('gateway-password');
    fireEvent.click(modelAccessConfirm);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(4));
    expect(bridgeMocks.executeActionInvoke.mock.calls.map(([input]) => input)).toEqual([
      {
        actionId: 'gateway_account_complete_setup',
        dryRun: false,
        payloadJson: { group_id: 'codex-group' },
      },
      {
        actionId: 'gateway_account_use_for_model_access',
        dryRun: false,
      },
    ]);
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('core-readiness-probe')).toHaveTextContent('ready'));
    await waitFor(() => expect(screen.getByTestId('opl-first-run-completion')).toBeInTheDocument());
    expect(screen.queryByTestId('opl-first-run-gateway-password-input')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('gateway-password');
  });

  it('offers explicit model-access confirmation for an existing managed Gateway key', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(blockedInitializeResult).mockResolvedValue(initializeResult);
    bridgeMocks.getAppStateInvoke
      .mockResolvedValueOnce(gatewayManagedKeyStateResult)
      .mockResolvedValueOnce(gatewayManagedKeyStateResult)
      .mockResolvedValueOnce(gatewayModelReadyStateResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-email-input'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-password-input'), {
      target: { value: 'gateway-password' },
    });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-login-button'));

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'gateway_account_use_for_model_access' })
    );
    const modelAccessConfirm = screen.getByTestId('opl-first-run-gateway-model-access-confirm');
    expect(modelAccessConfirm).toBeEnabled();
    expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1);
    fireEvent.click(modelAccessConfirm);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(3));
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledTimes(1);
    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'gateway_account_use_for_model_access',
      dryRun: false,
    });
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'gateway_account_complete_setup' })
    );
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('opl-first-run-completion')).toBeInTheDocument());
  });

  it('fails closed when the fresh projection no longer exposes the model-access action', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(gatewayManagedKeyStateResult).mockResolvedValueOnce(
      createGatewayFastStateResult({
        managedKey: { name: 'OPL-APP-TEST', status: 'active', ownership: 'opl_app' },
      })
    );

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-email-input'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-password-input'), {
      target: { value: 'gateway-password' },
    });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-login-button'));

    await waitFor(() => expect(screen.getByTestId('opl-first-run-gateway-model-access-confirm')).toBeInTheDocument());
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-model-access-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent(
        'settings.accessPage.gatewayAccount.errors.internalContractViolation'
      )
    );
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2);
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
  });

  it('fails closed on unresolved Gateway groups and clears the password without claiming readiness', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      ...gatewayFastStateResult,
      parsed: {
        app_state: {
          settings_control_center: {
            app_settings_read_model: {
              opl_gateway_account: {
                ...gatewayFastStateResult.parsed.app_state.settings_control_center.app_settings_read_model
                  .opl_gateway_account,
                available_groups: [
                  { group_id: 'research', label: 'Research' },
                  { group_id: 'engineering', label: 'Engineering' },
                ],
              },
            },
          },
        },
      },
    });

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-email-input'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-password-input'), {
      target: { value: 'gateway-password' },
    });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-login-button'));

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent(
        'settings.accessPage.gatewayAccount.errors.groupSelectionRequired'
      )
    );
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalled();
    expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('opl-first-run-ready-entry')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-gateway-password-input')).toHaveValue('');
    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent('group_selection_required');
    expect(screen.getByTestId('opl-first-run-technical-details')).not.toHaveTextContent('gateway-password');
  });

  it('clears Gateway passwords after typed login failure and after method switching', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);
    bridgeMocks.loginGatewayAccountInvoke.mockResolvedValueOnce({
      ok: false,
      errorCode: 'invalid_credentials',
      stateRefreshRequired: false,
    });

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-email-input'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByTestId('opl-first-run-gateway-password-input'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-login-button'));

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent(
        'settings.accessPage.gatewayAccount.errors.invalidCredentials'
      )
    );
    expect(screen.getByTestId('opl-first-run-gateway-password-input')).toHaveValue('');
    expect(bridgeMocks.getAppStateInvoke).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('opl-first-run-gateway-password-input'), {
      target: { value: 'new-password' },
    });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-key-method'));
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-account-method'));
    expect(screen.getByTestId('opl-first-run-gateway-password-input')).toHaveValue('');
  });

  it('defaults WebUI to Gateway account login while retaining API Key compatibility', async () => {
    platformMocks.isElectronDesktop.mockReturnValue(false);
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-access-methods')).toBeInTheDocument();
    expect(within(screen.getByTestId('opl-first-run-gateway-account-method')).getByRole('radio')).toBeChecked();
    expect(screen.getByTestId('opl-first-run-gateway-email-input')).toBeInTheDocument();
    const password = screen.getByTestId('opl-first-run-gateway-password-input');
    expect(password).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-gateway-login-button')).toBeInTheDocument();
    fireEvent.change(password, { target: { value: 'webui-account-secret' } });
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-key-method'));
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-account-method'));
    expect(screen.getByTestId('opl-first-run-gateway-password-input')).toHaveValue('');
    expect(bridgeMocks.loginGatewayAccountInvoke).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('webui-account-secret');
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
    fireEvent.click(screen.getByText('settings.firstRun.technicalDetails'));
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-key-method'));
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
    act(() =>
      resolveConfigure?.({
        ...configureCodexResult,
        stdout: 'configured secret-key',
        parsed: { codex_config: { status: 'completed', diagnostic: 'secret-key' } },
      })
    );
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('opl-first-run-completion')).toBeInTheDocument());
    expect(screen.queryByTestId('opl-first-run-task-panel')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('opl-first-run-ready-entry')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'guid.uiOptimization.firstRun.completion.primaryAction' })).toHaveFocus();
    expect(screen.queryByTestId('opl-first-run-configure-codex-button')).not.toBeInTheDocument();
    expect(screen.getByText(/"diagnostic": "\[REDACTED\]"/)).toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-technical-details')).not.toHaveTextContent('secret-key');
  });

  it('keeps Gateway failures localized while preserving the raw error in technical details', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);
    bridgeMocks.configureCodexInvoke.mockRejectedValueOnce(new Error('provider rejected secret-key'));

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-key-method'));
    fireEvent.change(screen.getByTestId('opl-first-run-codex-api-key-input'), { target: { value: 'secret-key' } });
    fireEvent.click(screen.getByTestId('opl-first-run-configure-codex-button'));

    await waitFor(() =>
      expect(screen.getByTestId('opl-first-run-user-error')).toHaveTextContent('settings.firstRun.error.codexConfig')
    );
    expect(messageMocks.error).not.toHaveBeenCalled();
    expect(screen.getByTestId('opl-first-run-beginner-primary')).not.toHaveTextContent('provider rejected');
    expect(screen.getByTestId('opl-first-run-codex-api-key-input')).toHaveValue('secret-key');

    fireEvent.click(screen.getByRole('button', { name: 'settings.firstRun.help' }));
    expect(screen.getByTestId('opl-first-run-technical-error')).toHaveTextContent('provider rejected [REDACTED]');
    expect(screen.getByTestId('opl-first-run-technical-error')).not.toHaveTextContent('secret-key');
  });

  it('keeps existing Codex recheck outside the account and API Key method switch', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValue(blockedInitializeResult);

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    expect(
      within(screen.getByTestId('opl-first-run-access-methods')).queryByTestId('opl-first-run-recheck-existing')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-first-run-recheck-existing')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('opl-first-run-recheck-existing'));

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId('opl-first-run-gateway-key-method'));
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
    fireEvent.click(screen.getByRole('button', { name: 'settings.firstRun.help' }));
    fireEvent.click(screen.getByTestId('opl-first-run-open-environment-button'));

    await waitFor(() => expect(bridgeMocks.runStartupMaintenanceInvoke).toHaveBeenCalledTimes(1));
    for (const radio of within(screen.getByTestId('opl-first-run-access-methods')).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByTestId('opl-first-run-gateway-email-input')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-gateway-password-input')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-gateway-login-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-recheck-existing')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-retry-button')).toBeDisabled();
    expect(screen.getByTestId('opl-first-run-install-button')).toBeDisabled();

    act(() => resolveMaintenance?.(startupMaintenanceResult));
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
  });

  it('runs startup maintenance without blocking the ready entry', async () => {
    bridgeMocks.runStartupMaintenanceInvoke.mockReturnValueOnce(
      new Promise<typeof startupMaintenanceResult>((resolve) => {
        resolveMaintenance = resolve;
      })
    );

    render(<FirstRun />);

    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'settings.firstRun.help' }));
    fireEvent.click(screen.getByTestId('opl-first-run-open-environment-button'));

    await waitFor(() => expect(bridgeMocks.runStartupMaintenanceInvoke).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('opl-first-run-ready-entry').closest('button')).toBeEnabled();

    await act(async () => {
      resolveMaintenance?.(startupMaintenanceResult);
    });
    await waitFor(() => expect(bridgeMocks.getInitializeInvoke).toHaveBeenCalledTimes(2));
  });
});

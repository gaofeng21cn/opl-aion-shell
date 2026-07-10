import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { configService } from '@/common/config/configService';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import { SWRConfig } from 'swr';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  openFolderInvoke: vi.fn(),
  getStartOnBootStatusInvoke: vi.fn(),
  getGpuStatusInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
    application: {
      getStartOnBootStatus: { invoke: bridgeMocks.getStartOnBootStatusInvoke },
      getGpuStatus: { invoke: bridgeMocks.getGpuStatusInvoke },
      getCdpStatus: {
        invoke: vi.fn().mockResolvedValue({ success: true, data: { isDevMode: false } }),
      },
      isDevToolsOpened: { invoke: vi.fn() },
      devToolsStateChanged: { on: vi.fn(() => vi.fn()) },
    },
    systemSettings: {
      setCloseToTray: { invoke: vi.fn() },
    },
    shell: {
      openFolderWith: { invoke: bridgeMocks.openFolderInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => {
      const labels: Record<string, string> = {
        'common.open': 'Open',
        'settings.oplDeveloperProfileStates.maintainer': 'Maintainer',
        'settings.oplDeveloperCapabilities.source_channel': 'Capability source',
        'settings.oplDeveloperCapabilities.workspace_trust': 'Workspace access',
        'settings.oplDeveloperCapabilities.github_authority': 'Repository access',
        'settings.oplDeveloperCapabilityStates.available': 'Available',
      };
      return labels[key] ?? options?.defaultValue ?? key;
    },
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
        'codex.oplFlowIntelligenceEnhancementMode': false,
      };
      return defaults[key];
    }),
    set: vi.fn(() => Promise.resolve()),
    setLocal: vi.fn(),
  },
}));

describe('SystemModalContent OPL App state', () => {
  const openDetails = (testId: string) => {
    const details = screen.getByTestId(testId) as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    return details;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configService.get).mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        'system.notificationEnabled': true,
        'system.autoPreviewOfficeFiles': true,
        'codex.oplFlowIntelligenceEnhancementMode': false,
      };
      return defaults[key];
    });
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
            enabled: 'on',
            status: 'ready',
            effective_state: 'active_direct',
            description: 'Developer mode from app state',
          },
          developer_profile: {
            profile_id: 'maintainer',
            status: 'ready',
            level: 'maintainer',
            source: 'repo_authority_direct_write',
            impact: 'May use direct repository repair routes for required OPL repos.',
            capabilities: {
              source_channel: {
                status: 'ready',
                level: 'managed_package_channel',
                source: 'agent_latest_package_channel',
                impact: 'This module uses the managed GHCR capability packages channel.',
              },
              workspace_trust: {
                status: 'ready',
                level: 'selected_workspace_only',
                source: 'workspace_root',
                impact: 'Only the selected workspace is trusted by default.',
              },
              github_authority: {
                status: 'ready',
                level: 'direct_write',
                source: 'github_repo_permissions',
                impact: 'Direct repository repair routes are available.',
              },
            },
            legacy_developer_mode: {
              effective_state: 'active_direct',
            },
          },
          paths: {
            workspace_root: {
              selected_path: '/Users/example/OPL Workspace',
              source: 'state',
            },
            logs_dir: '/Users/example/.opl/logs',
          },
          opl_flow_context: {
            flow_id: 'opl-flow',
            source: 'one-person-lab-app/contracts/app-product-profile.json#codex.opl_flow_context',
            delivery: 'session_scoped_preset_context',
            language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
            user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
          },
        },
      },
    });
    bridgeMocks.executeActionInvoke.mockImplementation(({ actionId }: { actionId: string }) =>
      Promise.resolve({
        surface: 'app_action',
        command: `opl app action execute --action ${actionId} --json`,
        stdout: '{}',
        ok: true,
        parsed: {
          app_action_execution: {
            result:
              actionId === 'intelligence_enhancement_enable'
                ? {
                    opl_flow_intelligence_enhancement_action: {
                      status: 'completed',
                      status_readback: { enabled: true },
                    },
                  }
                : {
                    opl_flow_intelligence_enhancement: { enabled: false },
                  },
          },
        },
      })
    );
    bridgeMocks.openFolderInvoke.mockResolvedValue(undefined);
  });

  const renderWithFreshSWR = () =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SystemModalContent />
      </SWRConfig>
    );

  it('shows read-only App paths and human-readable capabilities while technical values stay collapsed', async () => {
    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(await screen.findByText('/Users/example/OPL Workspace')).toBeInTheDocument();
    expect(screen.getByText('/Users/example/.opl/logs')).toBeInTheDocument();
    expect(screen.getByText('settings.advancedPathsTitle')).toBeInTheDocument();
    expect(screen.queryByText('settings.language')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.notification')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.startOnBoot')).not.toBeInTheDocument();
    expect(screen.queryByText('Developer mode from app state')).not.toBeInTheDocument();
    expect(screen.getByText('settings.developerProfileDesc')).toBeInTheDocument();
    expect(screen.getByTestId('opl-developer-profile-status')).toHaveTextContent('Maintainer');
    expect(screen.getByTestId('opl-developer-capability-source_channel')).toHaveTextContent('Capability source');
    expect(screen.getByTestId('opl-developer-capability-source_channel')).toHaveTextContent('Available');
    expect(screen.getByTestId('opl-developer-capability-github_authority')).toHaveTextContent('Repository access');
    expect(document.body).not.toHaveTextContent('managed_package_channel');
    expect(document.body).not.toHaveTextContent('direct_write');
    expect(screen.queryByText('opl-flow')).not.toBeInTheDocument();
    expect(
      screen.queryByText('one-person-lab-app/contracts/app-product-profile.json#codex.opl_flow_context')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-flow-details')).not.toHaveAttribute('open');
    expect(screen.getByTestId('developer-settings-details')).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: 'Open settings.workDir' }));
    await waitFor(() =>
      expect(bridgeMocks.openFolderInvoke).toHaveBeenCalledWith({
        folder_path: '/Users/example/OPL Workspace',
        tool: 'explorer',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open settings.logDir' }));
    await waitFor(() =>
      expect(bridgeMocks.openFolderInvoke).toHaveBeenCalledWith({
        folder_path: '/Users/example/.opl/logs',
        tool: 'explorer',
      })
    );
    expect(bridgeMocks.executeActionInvoke).not.toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'workspace_root_set' })
    );

    openDetails('opl-developer-profile-details');
    expect(await screen.findByText(/source_channel: managed_package_channel/)).toBeInTheDocument();

    openDetails('opl-flow-details');
    expect(await screen.findByText('opl-flow')).toBeInTheDocument();
    expect(
      screen.getByText('one-person-lab-app/contracts/app-product-profile.json#codex.opl_flow_context')
    ).toBeInTheDocument();
    expect(screen.getByTestId('opl-flow-context-row')).toHaveTextContent('settings.oplFlowContextDesc');
  });

  it('persists OPL Flow intelligence enhancement mode from the settings switch', async () => {
    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    openDetails('opl-flow-details');

    fireEvent.click(within(screen.getByTestId('opl-flow-intelligence-enhancement-mode-row')).getByRole('switch'));

    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_enable',
        dryRun: false,
      })
    );
    await waitFor(() =>
      expect(configService.set).toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', true)
    );
  });

  it('defaults OPL Flow intelligence enhancement mode on when the config key is unset', async () => {
    let resolveStatus: ((value: unknown) => void) | null = null;
    vi.mocked(configService.get).mockImplementation((key: string) => {
      const defaults: Record<string, unknown> = {
        'system.notificationEnabled': true,
        'system.autoPreviewOfficeFiles': true,
      };
      return defaults[key];
    });
    bridgeMocks.executeActionInvoke.mockImplementation(({ actionId }: { actionId: string }) => {
      if (actionId === 'intelligence_enhancement_status') {
        return new Promise((resolve) => {
          resolveStatus = resolve;
        });
      }
      return Promise.resolve({
        surface: 'app_action',
        command: `opl app action execute --action ${actionId} --json`,
        stdout: '{}',
        ok: true,
        parsed: {
          app_action_execution: {
            result: {
              opl_flow_intelligence_enhancement_action: {
                status: 'completed',
                status_readback: { enabled: true },
              },
            },
          },
        },
      });
    });

    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    openDetails('opl-flow-details');

    expect(
      within(screen.getByTestId('opl-flow-intelligence-enhancement-mode-row')).getByRole('switch')
    ).toHaveAttribute('aria-checked', 'true');

    resolveStatus?.({
      surface: 'app_action',
      command: 'opl app action execute --action intelligence_enhancement_status --json',
      stdout: '{}',
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            opl_flow_intelligence_enhancement: { enabled: true },
          },
        },
      },
    });
  });

  it('does not override an explicit false intelligence enhancement preference from status readback', async () => {
    bridgeMocks.executeActionInvoke.mockResolvedValue({
      surface: 'app_action',
      command: 'opl app action execute --action intelligence_enhancement_status --json',
      stdout: '{}',
      ok: true,
      parsed: {
        app_action_execution: {
          result: {
            opl_flow_intelligence_enhancement: { enabled: true },
          },
        },
      },
    });

    renderWithFreshSWR();

    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      })
    );
    openDetails('opl-flow-details');

    expect(
      within(screen.getByTestId('opl-flow-intelligence-enhancement-mode-row')).getByRole('switch')
    ).toHaveAttribute('aria-checked', 'false');
    expect(configService.setLocal).not.toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', true);
  });

  it('does not expose machine Developer Mode states in the status pill', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          schema_version: 'opl_app_state.v1',
          developer_mode: {
            effective_state: 'blocked',
            description: 'Developer mode from app state',
          },
          paths: {
            workspace_root_path: '/Users/example/OPL Workspace',
            logs_dir: '/Users/example/.opl/logs',
          },
        },
      },
    });

    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    expect(screen.getByTestId('opl-developer-profile-status')).toHaveTextContent('settings.unavailable');
    expect(screen.getByTestId('opl-developer-profile-row')).not.toHaveTextContent('blocked');
    openDetails('opl-flow-details');
    expect(screen.getByTestId('opl-flow-context-row')).toHaveTextContent('settings.unavailable');
  });

  it('does not render legacy OPL Agent Codex context without current OPL Flow context', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      surface: 'app_state_fast',
      command: 'opl app state --profile fast --json',
      stdout: '{}',
      parsed: {
        app_state: {
          schema_version: 'opl_app_state.v1',
          developer_mode: {
            effective_state: 'active_direct',
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

    renderWithFreshSWR();

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    openDetails('opl-flow-details');
    expect(screen.getByTestId('opl-flow-context-row')).toHaveTextContent('settings.unavailable');
    expect(screen.getByTestId('opl-flow-context-row')).not.toHaveTextContent('pages.settings_system');
  });
});

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import RuntimeSettings from '@/renderer/pages/settings/sections/RuntimeSettings';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getInitialize: { invoke: vi.fn() },
      runInstallPrep: { invoke: vi.fn() },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
    shell: {
      openFolderWith: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const renderedValues = Object.values(values ?? {})
        .filter((value) => typeof value === 'string' && value.length > 0)
        .join(' ');
      return renderedValues ? `${key} ${renderedValues}` : key;
    },
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const appStateResult = {
  surface: 'app_state_fast',
  command: 'opl app state --profile fast --json',
  stdout: '{}',
  parsed: {
    app_state: {
      schema_version: 'opl_app_state.v1',
      surface_kind: 'opl_app_state',
      operator: { status: 'ready', summary: 'ready' },
      core: {
        codex: {
          parsed_version: '0.125.0',
          default_model: 'gpt-5.5',
          default_reasoning_effort: 'xhigh',
        },
      },
      provider: {
        temporal: { status: 'attention_needed', health_status: 'attention_needed' },
      },
      paths: {
        family_workspace_root: {
          selected_path: '/Users/example/workspace',
        },
      },
      modules: {
        summary: { default_modules_count: 4, healthy_default_modules_count: 4 },
        source: {
          mode: 'sibling_workspace',
          modules_root: '/Users/example/workspace',
        },
        items: [
          {
            module_id: 'medautoscience',
            display_name: 'Med Auto Science',
            status: 'attention_needed',
            path: '/Users/example/workspace/med-autoscience',
          },
        ],
      },
      actions: [],
    },
  },
};

describe('RuntimeSettings app state bridge usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResult);
    bridgeMocks.getDrilldownInvoke.mockResolvedValue({
      surface: 'runtime_full',
      command: 'opl runtime app-operator-drilldown --detail full --json',
      stdout: '{}',
      parsed: { app_operator_drilldown: { surface_kind: 'opl_app_operator_drilldown_read_model', status: 'ready' } },
    });
  });

  it('loads the fast OPL app state on initial render and fast App state on page refresh', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('settings.oplEnvironmentPage.actions.refresh'));

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenLastCalledWith({ profile: 'fast' });
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();
  });

  it('renders runtime status and module path-source values through i18n aliases', async () => {
    render(<RuntimeSettings />);

    await waitFor(() =>
      expect(
        screen.getAllByText('settings.oplEnvironmentPage.status.attention_required attention_required').length
      ).toBeGreaterThan(0)
    );
    expect(document.body.textContent).toContain(
      'settings.oplEnvironmentPage.moduleVersion.pathSources.familyWorkspaceRoot'
    );
    expect(screen.queryByText('settings.oplEnvironmentPage.status.attention_needed')).not.toBeInTheDocument();
  });

  it('keeps the Settings Runtime refresh button idle during cached background revalidation', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: appStateResult.parsed,
        loadedAt: '09:00:00',
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    const button = screen.getByText('settings.oplEnvironmentPage.actions.refresh').closest('button');
    expect(button?.className).not.toContain('arco-btn-loading');
    expect(button?.getAttribute('aria-busy')).not.toBe('true');

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('deduplicates Settings Runtime refresh while the initial App state read is still pending', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );

    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1));
    const button = screen.getByText('settings.oplEnvironmentPage.actions.refresh').closest('button');
    expect(button).toBeTruthy();

    fireEvent.click(button!);

    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(1);
    expect(button?.className).toContain('arco-btn-loading');

    await act(async () => {
      resolveState(appStateResult);
    });

    await waitFor(() => expect(button?.className).not.toContain('arco-btn-loading'));
  });

  it('keeps the Runtime page refresh button idle during cached background revalidation', async () => {
    let resolveState: (value: typeof appStateResult) => void = () => {};
    bridgeMocks.getAppStateInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    localStorage.setItem(
      'opl.appState.fast.v1',
      JSON.stringify({
        payload: appStateResult.parsed,
        loadedAt: '09:00:00',
      })
    );

    render(<RuntimePage />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    const button = screen.getByText('common.refresh').closest('button');
    expect(button?.className).not.toContain('arco-btn-loading');
    expect(button?.getAttribute('aria-busy')).not.toBe('true');

    await act(async () => {
      resolveState(appStateResult);
    });
  });

  it('keeps Runtime page safe actions on the App action boundary', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ...appStateResult,
      parsed: {
        app_state: {
          ...appStateResult.parsed.app_state,
          actions: [
            {
              action_id: 'legacy-runtime-action',
              submit_via: 'opl runtime action execute',
            },
            {
              action_id: 'app-boundary-action',
              submit_via: 'opl app action execute',
            },
          ],
        },
      },
    });

    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByText('app-boundary-action').length).toBeGreaterThan(0));
    expect(screen.queryByText('legacy-runtime-action')).not.toBeInTheDocument();
  });
});

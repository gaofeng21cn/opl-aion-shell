import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StartupGate from '@/renderer/components/layout/StartupGate';
import { resetOplAppStateLoadsForTest } from '@/renderer/hooks/system/useOplAppState';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { seconds?: number }) => (params?.seconds ? `${key}:${params.seconds}` : key),
  }),
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid='navigate-target'>{to}</div>,
  useNavigate: () => bridgeMocks.navigate,
}));

const readyAppStateResult = {
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
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/workspace',
          exists: true,
          writable: true,
          health_status: 'ready',
        },
      },
    },
  },
};

const blockedAppStateResult = {
  ...readyAppStateResult,
  parsed: {
    app_state: {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          api_key_present: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/workspace',
          exists: true,
          writable: true,
          health_status: 'ready',
        },
      },
    },
  },
};

const existingCodexAccessResult = {
  ...readyAppStateResult,
  parsed: {
    app_state: {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          api_key_present: false,
          model_access_ready: true,
          model_access_source: 'codex_login',
          opl_gateway_configured: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/workspace',
          exists: true,
          writable: true,
          health_status: 'ready',
        },
      },
    },
  },
};

describe('StartupGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetOplAppStateLoadsForTest();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows startup preflight while reading fast app state', () => {
    bridgeMocks.getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    expect(screen.getByTestId('opl-startup-gate')).toBeInTheDocument();
    expect(screen.getByTestId('opl-startup-gate')).toHaveTextContent('common.uiOptimization.startup.brand');
    expect(screen.getByTestId('opl-startup-gate')).toHaveTextContent('common.uiOptimization.startup.stages.workspace');
    expect(screen.getByTestId('opl-startup-gate')).toHaveTextContent('common.uiOptimization.startup.stages.assistant');
    expect(screen.getByTestId('opl-startup-gate')).toHaveTextContent(
      'common.uiOptimization.startup.stages.modelAccess'
    );
    expect(screen.queryByText('common.uiOptimization.startup.viewDetails')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-startup-gate')).not.toHaveTextContent('%');
    expect(screen.getByText('common.startupPreflight.skipCheck')).toBeInTheDocument();
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' });
  });

  it('enters guid when the fast startup read exceeds the soft deadline', async () => {
    vi.useFakeTimers();
    bridgeMocks.getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid');
  });

  it('lets users skip the fast startup read and enter OPL without changing readiness', () => {
    bridgeMocks.getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    fireEvent.click(screen.getByText('common.startupPreflight.skipCheck'));

    expect(bridgeMocks.navigate).toHaveBeenCalledWith('/guid', { replace: true });
  });

  it('routes ready non-first-run installs directly to guid', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(readyAppStateResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });

  it('renders model access as active for a frame before navigating', async () => {
    let routeDecisionFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      routeDecisionFrame = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(readyAppStateResult);

    render(<StartupGate />);

    await waitFor(() => {
      expect(
        screen.getByText('common.uiOptimization.startup.stages.modelAccess').closest('[data-state]')
      ).toHaveAttribute('data-state', 'active');
    });
    expect(screen.queryByTestId('navigate-target')).not.toBeInTheDocument();
    expect(routeDecisionFrame).not.toBeNull();

    act(() => {
      routeDecisionFrame?.(16);
    });

    expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid');
  });

  it('routes existing Codex model access directly to guid without OPL Gateway setup', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(existingCodexAccessResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });

  it('routes blocked installs to guid where inline operation gates remain available', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(blockedAppStateResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });

  it('routes unknown readiness to guid without synthesizing a first-run decision', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      ...readyAppStateResult,
      parsed: { app_state: {} },
    });

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });

  it('routes app-state read failures to guid', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      ...readyAppStateResult,
      ok: false,
      error: { message: 'app state failed' },
    });

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });

  it('routes app-state output-limit failures to guid', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      ...readyAppStateResult,
      ok: false,
      error: { message: 'OPL runtime command output exceeded 5242880 bytes' },
    });
    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });
});

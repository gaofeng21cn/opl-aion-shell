import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StartupGate from '@/renderer/components/layout/StartupGate';

const bridgeMocks = vi.hoisted(() => ({
  getInitializeInvoke: vi.fn(),
  getAppStateInvoke: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getInitialize: { invoke: bridgeMocks.getInitializeInvoke },
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
          health_status: 'ready',
        },
      },
    },
  },
};

describe('StartupGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows startup preflight while reading fast app state', () => {
    bridgeMocks.getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    expect(screen.getByTestId('opl-startup-gate')).toBeInTheDocument();
    expect(screen.getByTestId('opl-startup-gate')).toHaveTextContent('common.startupPreflight.steps.startupState');
    expect(screen.getByText('common.startupPreflight.skipCheck')).toBeInTheDocument();
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' });
    expect(bridgeMocks.getInitializeInvoke).not.toHaveBeenCalled();
  });

  it('shows elapsed wait feedback instead of a fixed percent when state read is slow', () => {
    vi.useFakeTimers();
    bridgeMocks.getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('common.startupPreflight.messages.stillReadingStartupState:3')).toBeInTheDocument();
    expect(screen.queryByText('70%')).not.toBeInTheDocument();
  });

  it('lets users skip the startup wait and enter guid without claiming readiness', () => {
    bridgeMocks.getAppStateInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    fireEvent.click(screen.getByText('common.startupPreflight.skipCheck'));

    expect(bridgeMocks.navigate).toHaveBeenCalledWith('/guid', { replace: true });
  });

  it('routes ready non-first-run installs directly to guid', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(readyAppStateResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
    expect(bridgeMocks.getInitializeInvoke).not.toHaveBeenCalled();
  });

  it('routes blocked installs to first-run', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(blockedAppStateResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/first-run'));
  });

  it('routes app state failures to first-run', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({
      ...readyAppStateResult,
      ok: false,
      error: { message: 'app state failed' },
    });

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/first-run'));
  });
});

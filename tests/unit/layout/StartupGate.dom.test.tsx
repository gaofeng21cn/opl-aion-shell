import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StartupGate from '@/renderer/components/layout/StartupGate';

const bridgeMocks = vi.hoisted(() => ({
  getInitializeInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getInitialize: { invoke: bridgeMocks.getInitializeInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid='navigate-target'>{to}</div>,
}));

const readyInitializeResult = {
  surface: 'system_initialize',
  command: 'opl system initialize --json',
  stdout: '{}',
  parsed: {
    system_initialize: {
      setup_flow: {
        is_first_run: false,
        ready_to_launch: true,
        blocking_items: [],
        maintenance_items: [],
      },
      readiness: {
        launch_ready: true,
      },
    },
  },
};

const blockedInitializeResult = {
  ...readyInitializeResult,
  parsed: {
    system_initialize: {
      setup_flow: {
        is_first_run: false,
        ready_to_launch: false,
        blocking_items: ['codex_config'],
        maintenance_items: [],
      },
      readiness: {
        launch_ready: false,
      },
    },
  },
};

describe('StartupGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows startup preflight while checking initialize status', () => {
    bridgeMocks.getInitializeInvoke.mockReturnValue(new Promise(() => {}));

    render(<StartupGate />);

    expect(screen.getByTestId('opl-startup-gate')).toBeInTheDocument();
    expect(screen.getByTestId('opl-startup-gate')).toHaveTextContent(
      'common.startupPreflight.steps.firstRunStatus'
    );
  });

  it('routes ready non-first-run installs directly to guid', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(readyInitializeResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/guid'));
  });

  it('routes blocked installs to first-run', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce(blockedInitializeResult);

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/first-run'));
  });

  it('routes initialize failures to first-run', async () => {
    bridgeMocks.getInitializeInvoke.mockResolvedValueOnce({
      ...readyInitializeResult,
      ok: false,
      error: { message: 'initialize failed' },
    });

    render(<StartupGate />);

    await waitFor(() => expect(screen.getByTestId('navigate-target')).toHaveTextContent('/first-run'));
  });
});

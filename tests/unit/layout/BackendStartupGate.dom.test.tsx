import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import BackendStartupGate from '@/renderer/components/layout/BackendStartupGate';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

type Bridge = NonNullable<Window['__backendStartupBridge']>;

function installBridge(initial: BackendStartupFailureInfo | null): {
  push: (next: BackendStartupFailureInfo | null) => void;
} {
  let listener: ((state: BackendStartupFailureInfo | null) => void) | undefined;
  const bridge: Bridge = {
    getState: () => initial,
    subscribe: (callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
  };
  window.__backendStartupBridge = bridge;
  return {
    push: (next) =>
      act(() => {
        listener?.(next);
      }),
  };
}

const gateProps = {
  renderStarting: () => <div data-testid='view-starting' />,
  renderFailure: (failure: BackendStartupFailureInfo) => <div data-testid='view-failure'>{failure.reason}</div>,
  renderApp: () => <div data-testid='view-app' />,
};

afterEach(() => {
  cleanup();
  delete window.__backendStartupBridge;
  delete window.__backendStartupFailure;
});

describe('BackendStartupGate', () => {
  it('switches from pending startup to the App when ready arrives', () => {
    const { push } = installBridge({ reason: 'backend_startup_pending_slow' });
    render(<BackendStartupGate {...gateProps} />);

    expect(screen.getByTestId('view-starting')).toBeInTheDocument();
    push(null);
    expect(screen.getByTestId('view-app')).toBeInTheDocument();
    expect(screen.queryByTestId('view-starting')).not.toBeInTheDocument();
  });

  it('switches from pending startup to an honest exit failure', () => {
    const { push } = installBridge({ reason: 'backend_startup_pending_slow' });
    render(<BackendStartupGate {...gateProps} />);

    push({ reason: 'backend_startup_exited' });
    expect(screen.getByTestId('view-failure')).toHaveTextContent('backend_startup_exited');
    expect(screen.queryByTestId('view-app')).not.toBeInTheDocument();
  });

  it('renders the App when startup has no failure state', () => {
    installBridge(null);
    render(<BackendStartupGate {...gateProps} />);
    expect(screen.getByTestId('view-app')).toBeInTheDocument();
  });
});

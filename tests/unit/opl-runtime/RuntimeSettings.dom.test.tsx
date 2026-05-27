import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RuntimeSettings from '@/renderer/pages/settings/RuntimeSettings';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
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
        temporal: { status: 'ready', health_status: 'ready' },
      },
      modules: {
        summary: { default_modules_count: 4, healthy_default_modules_count: 4 },
        items: [],
      },
      actions: [],
    },
  },
};

describe('RuntimeSettings app state bridge usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResult);
    bridgeMocks.getDrilldownInvoke.mockResolvedValue({
      surface: 'runtime_full',
      command: 'opl runtime app-operator-drilldown --detail full --json',
      stdout: '{}',
      parsed: { app_operator_drilldown: { surface_kind: 'opl_app_operator_drilldown_read_model', status: 'ready' } },
    });
  });

  it('loads the fast OPL app state on initial render and refresh', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('common.refresh'));

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.getAppStateInvoke).toHaveBeenLastCalledWith({ profile: 'fast' });
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();
  });

  it('uses full operator drilldown only for explicit full detail loading', async () => {
    render(<RuntimeSettings />);

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'fast' }));

    fireEvent.click(screen.getByText('settings.runtime.actions.loadFull'));

    await waitFor(() => expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledWith({ profile: 'full' }));
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('settings.runtime.actions.loadDrilldown'));

    await waitFor(() => expect(bridgeMocks.getDrilldownInvoke).toHaveBeenCalledWith({ detail: 'full' }));
  });
});

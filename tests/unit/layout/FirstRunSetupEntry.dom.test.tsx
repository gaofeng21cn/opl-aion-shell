import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirstRunSetupEntry from '@/renderer/components/layout/Sider/FirstRunSetupEntry';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  appState: { value: {} as Record<string, unknown> },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState.value }),
}));

describe('FirstRunSetupEntry', () => {
  beforeEach(() => {
    mocks.navigate.mockClear();
    mocks.appState.value = {};
  });

  it('shows a persistent non-modal recovery entry for confirmed incomplete setup', async () => {
    mocks.appState.value = {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          model_access_ready: false,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
          exists: true,
          health_status: 'ready',
        },
      },
    };

    render(<FirstRunSetupEntry collapsed={false} isMobile={false} />);

    await userEvent.click(screen.getByTestId('opl-first-run-resume-entry'));
    expect(mocks.navigate).toHaveBeenCalledWith('/first-run');
  });

  it('stays hidden for unknown or fully ready state', () => {
    const { rerender } = render(<FirstRunSetupEntry collapsed={false} isMobile={false} />);
    expect(screen.queryByTestId('opl-first-run-resume-entry')).not.toBeInTheDocument();

    mocks.appState.value = {
      schema_version: 'opl_app_state.v1',
      core: {
        codex: {
          installed: true,
          model_access_ready: true,
          version_status: 'compatible',
          health_status: 'ready',
        },
      },
      paths: {
        workspace_root: {
          selected_path: '/Users/example/OPL Workspace',
          exists: true,
          health_status: 'ready',
        },
      },
    };
    rerender(<FirstRunSetupEntry collapsed={false} isMobile={false} />);
    expect(screen.queryByTestId('opl-first-run-resume-entry')).not.toBeInTheDocument();
  });
});

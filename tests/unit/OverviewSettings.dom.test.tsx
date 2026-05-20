import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = vi.fn();
const mockRunOplCommand = vi.fn();
const mockWebuiGetStatus = vi.fn();
let useFreshMessageApi = false;

vi.mock('react-i18next', () => {
  const t = (key: string, options?: Record<string, string | number>) =>
    options ? `${key}:${Object.values(options).join('|')}` : key;
  return {
    useTranslation: () => ({ t }),
  };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@arco-design/web-react', async () => {
  const React = await import('react');
  const Text = ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>;
  const Title = ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { heading?: number }) => (
    <h4 {...props}>{children}</h4>
  );
  const Typography = { Text, Title };
  const Button = ({
    children,
    loading,
    icon: _icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: React.ReactNode }) => (
    <button {...props} aria-busy={loading ? 'true' : undefined}>
      {children}
    </button>
  );
  const Card = ({
    children,
    bordered: _bordered,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { bordered?: boolean }) => <div {...props}>{children}</div>;
  const Space = ({ children, wrap: _wrap, ...props }: React.HTMLAttributes<HTMLDivElement> & { wrap?: boolean }) => (
    <div {...props}>{children}</div>
  );
  const Tag = ({
    children,
    color: _color,
    size: _size,
    ...props
  }: React.HTMLAttributes<HTMLSpanElement> & { color?: string; size?: string }) => <span {...props}>{children}</span>;
  const messageApi = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
  const Message = { useMessage: () => [useFreshMessageApi ? { ...messageApi } : messageApi, null] };
  return { Button, Card, Message, Space, Tag, Typography };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      runOplCommand: { invoke: (...args: unknown[]) => mockRunOplCommand(...args) },
    },
    webui: {
      getStatus: { invoke: (...args: unknown[]) => mockWebuiGetStatus(...args) },
    },
  },
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-wrapper'>{children}</div>,
}));

globalThis.__OPL_OVERVIEW_STATUS_TIMEOUT_MS__ = 5;

import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';

describe('OverviewSettings module health summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useFreshMessageApi = false;
    mockWebuiGetStatus.mockResolvedValue({ success: true, data: { running: false } });
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: { codex: { installed: true, health_status: 'ready' } },
          workspace_root: { selected_path: '/Users/tester/workspace', health_status: 'ready' },
          domain_modules: {
            summary: { total_modules_count: 0, healthy_modules_count: 0, installed_modules_count: 0 },
            modules: [],
          },
        },
      }),
      stderr: '',
    });
  });

  it('uses domain module summary totals without treating non-actionable dirty modules as attention', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: { codex: { installed: true, health_status: 'ready' } },
          workspace_root: { selected_path: '/Users/tester/workspace', health_status: 'ready' },
          domain_modules: {
            summary: { total_modules_count: 4, healthy_modules_count: 3, installed_modules_count: 4 },
            modules: [
              {
                module_id: 'medautoscience',
                installed: true,
                health_status: 'ready',
                recommended_action: null,
                available_actions: [],
              },
              {
                module_id: 'meddeepscientist',
                installed: true,
                health_status: 'dirty',
                recommended_action: null,
                available_actions: [],
              },
            ],
          },
        },
      }),
      stderr: '',
    });

    render(<OverviewSettings />);

    expect(await screen.findByText('settings.overviewPage.modulesReady:4')).toBeInTheDocument();
    expect(screen.queryByText(/settings\.overviewPage\.modulesNeedAttention/)).not.toBeInTheDocument();
  });

  it('does not re-run overview loading when the message API identity changes across renders', async () => {
    useFreshMessageApi = true;

    render(<OverviewSettings />);

    await screen.findByText('settings.overviewPage.modulesUnknown');
    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockRunOplCommand).toHaveBeenCalledTimes(1);
  });

  it('clears the refresh loading state after a manual overview reload', async () => {
    render(<OverviewSettings />);

    const refreshButton = await screen.findByText('settings.overviewPage.actions.refresh');
    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledTimes(2);
      expect(refreshButton).not.toHaveAttribute('aria-busy');
    });
  });

  it('settles a slow overview refresh without leaving the Refresh Status button busy', async () => {
    mockRunOplCommand.mockReturnValue(new Promise(() => {}));

    render(<OverviewSettings />);

    const refreshButton = screen.getByText('settings.overviewPage.actions.refresh');
    expect(refreshButton).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => {
      expect(refreshButton).not.toHaveAttribute('aria-busy');
    });
    expect(await screen.findByText('settings.overviewPage.modulesUnknown')).toBeInTheDocument();
  });

  it('settles a slow WebUI status read without leaving the Refresh Status button busy', async () => {
    mockWebuiGetStatus.mockReturnValue(new Promise(() => {}));

    render(<OverviewSettings />);

    const refreshButton = screen.getByText('settings.overviewPage.actions.refresh');
    expect(refreshButton).toHaveAttribute('aria-busy', 'true');

    await waitFor(() => {
      expect(mockRunOplCommand).toHaveBeenCalledTimes(1);
      expect(refreshButton).not.toHaveAttribute('aria-busy');
    });
    expect(await screen.findByText('settings.overviewPage.modulesUnknown')).toBeInTheDocument();
  });

  it('counts only modules with executable install/update/reinstall/remove actions as attention', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: { codex: { installed: true, health_status: 'ready' } },
          workspace_root: { selected_path: '/Users/tester/workspace', health_status: 'ready' },
          domain_modules: {
            summary: { total: 4, healthy: 2, installed: 4 },
            modules: [
              {
                module_id: 'medautoscience',
                installed: true,
                health_status: 'dirty',
                recommended_action: 'reinstall',
                available_actions: ['remove', 'reinstall'],
              },
              {
                module_id: 'redcube',
                installed: true,
                health_status: 'outdated',
                recommended_action: null,
                available_actions: ['update'],
              },
              {
                module_id: 'meddeepscientist',
                installed: true,
                health_status: 'dirty',
                recommended_action: null,
                available_actions: [],
              },
            ],
          },
        },
      }),
      stderr: '',
    });

    render(<OverviewSettings />);

    expect(await screen.findByText('settings.overviewPage.modulesNeedAttention:2|4')).toBeInTheDocument();
  });

  it('treats installed dirty default modules without repair actions as ready in g2 summaries', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: { codex: { installed: true, health_status: 'ready' } },
          workspace_root: { selected_path: '/Users/tester/workspace', health_status: 'ready' },
          domain_modules: {
            summary: {
              total_modules_count: 3,
              installed_modules_count: 3,
              healthy_modules_count: 1,
            },
            modules: [
              {
                module_id: 'medautoscience',
                installed: true,
                health_status: 'dirty',
                recommended_action: null,
                available_actions: [],
              },
              {
                module_id: 'medautogrant',
                installed: true,
                health_status: 'ready',
                recommended_action: null,
                available_actions: [],
              },
              {
                module_id: 'redcube',
                installed: true,
                health_status: 'dirty',
                recommended_action: null,
                available_actions: [],
              },
            ],
          },
        },
      }),
      stderr: '',
    });

    render(<OverviewSettings />);

    expect(await screen.findByText('settings.overviewPage.modulesReady:3')).toBeInTheDocument();
    expect(screen.queryByText(/settings\.overviewPage\.modulesNeedAttention/)).not.toBeInTheDocument();
  });

  it('routes the Foundry Agent card to the Foundry Agents tab instead of capabilities', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          domain_modules: {
            summary: { total_modules_count: 4, healthy_modules_count: 4, installed_modules_count: 4 },
            modules: [],
          },
        },
      }),
      stderr: '',
    });

    render(<OverviewSettings />);

    await screen.findByText('settings.overviewPage.modulesReady:4');
    fireEvent.click(screen.getAllByText('settings.overviewPage.actions.openFoundryAgents')[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/settings/runtime?tab=environment#modules');
  });

  it('shows unknown module status when system initialize output cannot be parsed', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'not json',
      stderr: '',
    });

    render(<OverviewSettings />);

    expect(await screen.findByText('settings.overviewPage.modulesUnknown')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/settings\.overviewPage\.modulesNeedAttention/)).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('settings.oplEnvironmentPage.status.unknown').length).toBeGreaterThan(0);
  });

  it('shows unknown module status when system initialize fails', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'failed',
    });

    render(<OverviewSettings />);

    expect(await screen.findByText('settings.overviewPage.modulesUnknown')).toBeInTheDocument();
    expect(screen.queryByText(/settings\.overviewPage\.modulesNeedAttention/)).not.toBeInTheDocument();
  });
});

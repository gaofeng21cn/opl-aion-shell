import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = vi.fn();
const mockRunOplCommand = vi.fn();
const mockWebuiGetStatus = vi.fn();

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
    loading: _loading,
    icon: _icon,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; icon?: React.ReactNode }) => (
    <button {...props}>{children}</button>
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
  const Message = { useMessage: () => [messageApi, null] };
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

import OverviewSettings from '@/renderer/pages/settings/sections/OverviewSettings';

describe('OverviewSettings module health summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebuiGetStatus.mockResolvedValue({ success: true, data: { running: false } });
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          core_engines: { codex: { installed: true, health_status: 'ready' } },
          workspace_root: { selected_path: '/Users/tester/workspace', health_status: 'ready' },
          domain_modules: {
            summary: { total: 0, healthy: 0, installed: 0 },
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
            summary: { total: 4, healthy: 3, installed: 4 },
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

  it('routes the module card to runtime environment modules instead of capabilities', async () => {
    mockRunOplCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        system_initialize: {
          domain_modules: {
            summary: { total: 4, healthy: 4, installed: 4 },
            modules: [],
          },
        },
      }),
      stderr: '',
    });

    render(<OverviewSettings />);

    await screen.findByText('settings.overviewPage.modulesReady:4');
    const openRuntimeButtons = screen.getAllByText('settings.overviewPage.actions.openRuntime');
    fireEvent.click(openRuntimeButtons[2]);

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

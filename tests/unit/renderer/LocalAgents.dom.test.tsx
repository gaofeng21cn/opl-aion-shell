import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useManagedAgentsMock, healthCheckInvoke, refreshCatalog, messageSuccess, messageWarning, messageError } =
  vi.hoisted(() => ({
    useManagedAgentsMock: vi.fn(),
    healthCheckInvoke: vi.fn(),
    refreshCatalog: vi.fn(),
    messageSuccess: vi.fn(),
    messageWarning: vi.fn(),
    messageError: vi.fn(),
  }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'settings.agentManagement.errorCodes.command_not_found') {
        return `diagnostic:${String(options?.command)}`;
      }
      return (options?.defaultValue as string | undefined) ?? key;
    },
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: [], isLoading: false, isValidating: false })),
  mutate: vi.fn(),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: messageSuccess,
      warning: messageWarning,
      error: messageError,
    },
  };
});

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  useManagedAgents: useManagedAgentsMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      createCustomAgent: { invoke: vi.fn() },
      updateCustomAgent: { invoke: vi.fn() },
      deleteCustomAgent: { invoke: vi.fn() },
      setAgentEnabled: { invoke: vi.fn() },
      checkManagedAgentHealthById: { invoke: healthCheckInvoke },
    },
  },
}));

vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@/renderer/pages/settings/AgentSettings/AgentHubModal', () => ({ AgentHubModal: () => null }));
vi.mock('@/renderer/pages/settings/AgentSettings/InlineAgentEditor', () => ({ default: () => null }));

import LocalAgents from '@/renderer/pages/settings/AgentSettings/LocalAgents';

describe('LocalAgents managed catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useManagedAgentsMock.mockReturnValue({
      agents: [
        {
          id: 'codex-managed',
          name: 'Managed Codex',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'codex',
          enabled: true,
          installed: true,
          status: 'online',
        },
      ],
      isRefreshing: false,
      refreshCatalog,
    });
    healthCheckInvoke.mockResolvedValue({ id: 'codex-managed', name: 'Managed Codex', status: 'online' });
    refreshCatalog.mockResolvedValue(undefined);
  });

  it('renders managed rows and probes health through the per-id route', async () => {
    render(<LocalAgents />);

    expect(useManagedAgentsMock).toHaveBeenCalled();
    expect(screen.getByText('Managed Codex')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.testConnectionBtn' }));

    await waitFor(() => {
      expect(healthCheckInvoke).toHaveBeenCalledWith({ id: 'codex-managed' });
      expect(refreshCatalog).toHaveBeenCalled();
    });
  });

  it('keeps missing agents out of the detected section while showing their guidance', () => {
    useManagedAgentsMock.mockReturnValue({
      agents: [
        {
          id: 'codex-managed',
          name: 'Managed Codex',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'codex',
          enabled: true,
          installed: true,
          status: 'online',
        },
        {
          id: 'claude-missing',
          name: 'Claude Code',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'claude',
          enabled: true,
          installed: false,
          status: 'missing',
          last_check_error_message: 'Claude CLI was not found.',
          last_check_guidance: 'Install the Claude CLI, then check again.',
        },
        {
          id: 'gemini-offline',
          name: 'Gemini CLI',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'gemini',
          enabled: true,
          installed: true,
          status: 'offline',
          last_check_guidance: 'Sign in to Gemini CLI, then check again.',
        },
        {
          id: 'opencode-disabled',
          name: 'OpenCode',
          agent_type: 'acp',
          agent_source: 'builtin',
          backend: 'opencode',
          enabled: false,
          installed: true,
          status: 'unchecked',
        },
        {
          id: 'aionrs-unchecked',
          name: 'AionRS',
          agent_type: 'aionrs',
          agent_source: 'internal',
          backend: 'aionrs',
          enabled: true,
          installed: true,
          status: 'unchecked',
        },
      ],
      isRefreshing: false,
      refreshCatalog,
    });

    render(<LocalAgents />);

    const detectedSection = screen.getByTestId('detected-agents-section');
    const unavailableSection = screen.getByTestId('unavailable-agents-section');

    expect(within(detectedSection).getByText('Managed Codex')).toBeInTheDocument();
    expect(within(detectedSection).getByText('AionRS')).toBeInTheDocument();
    expect(within(detectedSection).getByText('settings.firstRun.status.unknown')).toBeInTheDocument();
    expect(within(detectedSection).queryByText('Claude Code')).not.toBeInTheDocument();
    expect(within(detectedSection).queryByText('Gemini CLI')).not.toBeInTheDocument();
    expect(within(detectedSection).queryByText('OpenCode')).not.toBeInTheDocument();
    expect(within(unavailableSection).getByText('Claude Code')).toBeInTheDocument();
    expect(within(unavailableSection).getByText('Gemini CLI')).toBeInTheDocument();
    expect(within(unavailableSection).getByText('OpenCode')).toBeInTheDocument();
    expect(within(unavailableSection).getByText('settings.firstRun.status.missing')).toBeInTheDocument();
    expect(within(unavailableSection).getByText('settings.firstRun.status.disabled')).toBeInTheDocument();
    expect(within(unavailableSection).getByText('Install the Claude CLI, then check again.')).toBeInTheDocument();
    expect(within(unavailableSection).getByText('Sign in to Gemini CLI, then check again.')).toBeInTheDocument();
  });

  it('formats structured health-check failures before showing the warning', async () => {
    healthCheckInvoke.mockResolvedValue({
      id: 'codex-managed',
      name: 'Managed Codex',
      agent_type: 'acp',
      agent_source: 'builtin',
      backend: 'codex',
      enabled: true,
      installed: false,
      status: 'missing',
      last_check_error_code: 'command_not_found',
      last_check_error_message: 'raw backend failure',
      last_check_error_details: { command: 'codex' },
      last_check_guidance: 'Install Codex CLI.',
    });

    render(<LocalAgents />);
    fireEvent.click(screen.getByRole('button', { name: 'settings.testConnectionBtn' }));

    await waitFor(() => {
      expect(messageWarning).toHaveBeenCalledWith('diagnostic:codex');
    });
  });
});

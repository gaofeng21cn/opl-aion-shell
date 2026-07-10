import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useManagedAgentsMock, healthCheckInvoke, refreshCatalog } = vi.hoisted(() => ({
  useManagedAgentsMock: vi.fn(),
  healthCheckInvoke: vi.fn(),
  refreshCatalog: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
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
vi.mock('@/renderer/pages/settings/AgentSettings/AgentCard', () => ({
  default: (props: { agent: { name: string }; onTestConnection?: () => void }) => (
    <div>
      <span>{props.agent.name}</span>
      {props.onTestConnection ? <button onClick={props.onTestConnection}>health</button> : null}
    </div>
  ),
}));

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

    fireEvent.click(screen.getByText('health'));

    await waitFor(() => {
      expect(healthCheckInvoke).toHaveBeenCalledWith({ id: 'codex-managed' });
      expect(refreshCatalog).toHaveBeenCalled();
    });
  });
});

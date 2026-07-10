import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useSWRMock, mutateMock, fetchManagedAgentsMock } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
  mutateMock: vi.fn(),
  fetchManagedAgentsMock: vi.fn(),
}));

vi.mock('swr', () => ({
  default: useSWRMock,
  mutate: mutateMock,
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  MANAGED_AGENTS_SWR_KEY: 'agents.managed',
  fetchManagedAgents: fetchManagedAgentsMock,
}));

import {
  getManagedAgents,
  refreshManagedAgentCatalogAndAssistants,
  useManagedAgents,
} from '@/renderer/hooks/agent/useManagedAgents';

describe('useManagedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateMock.mockResolvedValue(undefined);
    useSWRMock.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      isValidating: false,
    });
  });

  it('subscribes to the management catalog', () => {
    renderHook(() => useManagedAgents());

    expect(useSWRMock).toHaveBeenCalledWith('agents.managed', fetchManagedAgentsMock);
  });

  it('refreshes management and assistant caches without calling a legacy refresh endpoint', async () => {
    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.refreshCatalog();
    });

    expect(mutateMock).toHaveBeenCalledWith('agents.managed');
    expect(mutateMock).toHaveBeenCalledWith('assistants.list');
    expect(mutateMock).toHaveBeenCalledWith('assistants');
    expect(result.current).not.toHaveProperty('refreshCustomAgents');
  });

  it('shares the same refresh helper with non-hook catalog mutations', async () => {
    await refreshManagedAgentCatalogAndAssistants();

    expect(mutateMock).toHaveBeenCalledWith('agents.managed');
    expect(mutateMock).toHaveBeenCalledWith('assistants.list');
    expect(mutateMock).toHaveBeenCalledWith('assistants');
  });

  it('fetches and seeds the managed cache for non-hook consumers', async () => {
    const agents = [{ id: 'codex', name: 'Codex' }];
    fetchManagedAgentsMock.mockResolvedValue(agents);

    await expect(getManagedAgents()).resolves.toEqual(agents);
    expect(mutateMock).toHaveBeenCalledWith('agents.managed', agents, { revalidate: false });
  });
});

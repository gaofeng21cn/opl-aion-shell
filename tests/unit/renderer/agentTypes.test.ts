import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getManagedAgentsInvoke } = vi.hoisted(() => ({
  getManagedAgentsInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getManagedAgents: { invoke: getManagedAgentsInvoke },
    },
  },
}));

import { MANAGED_AGENTS_SWR_KEY, fetchManagedAgents } from '@/renderer/utils/model/agentTypes';

describe('managed agent catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the dedicated management cache key and endpoint', async () => {
    const agents = [
      {
        id: 'codex',
        name: 'Codex',
        agent_type: 'acp',
        agent_source: 'builtin',
        enabled: true,
        installed: true,
        status: 'online',
      },
    ];
    getManagedAgentsInvoke.mockResolvedValue(agents);

    expect(MANAGED_AGENTS_SWR_KEY).toBe('agents.managed');
    await expect(fetchManagedAgents()).resolves.toEqual(agents);
    expect(getManagedAgentsInvoke).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid management payload instead of silently treating it as an empty catalog', async () => {
    getManagedAgentsInvoke.mockResolvedValue({ agents: [] });

    await expect(fetchManagedAgents()).rejects.toThrow('Managed agent catalog must be an array');
  });
});

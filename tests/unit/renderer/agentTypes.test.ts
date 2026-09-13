import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getManagedAgentsInvoke, modelsInvoke } = vi.hoisted(() => ({
  getManagedAgentsInvoke: vi.fn(),
  modelsInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getManagedAgents: { invoke: getManagedAgentsInvoke },
    },
    codexThreads: { models: { invoke: modelsInvoke } },
  },
}));

import { MANAGED_AGENTS_SWR_KEY, fetchManagedAgents } from '@/renderer/utils/model/agentTypes';
import { buildAgentRuntimeModelInfo } from '@/renderer/utils/model/agentRuntimeCatalog';
import { buildCodexDefaultModelInfo, resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';

const oldModel = { id: 'gpt-5.6-sol', label: 'Sol', isDefault: true, supportedReasoningEfforts: ['max'] };
const liveModel = { id: 'gpt-6-astra', label: 'Astra', isDefault: true, supportedReasoningEfforts: ['max', 'ultra'] };
const staleAgent = {
  id: 'native-codex',
  backend: 'codex',
  agent_source: 'builtin',
  available_models: { available_models: [oldModel], current_model_id: oldModel.id },
  config_options: [
    { category: 'model', type: 'select', current_value: oldModel.id, options: [{ value: oldModel.id }] },
  ],
};

async function readAutoSelection() {
  const [agent] = await fetchManagedAgents();
  return resolveOplCodexAutoSelection(buildCodexDefaultModelInfo(buildAgentRuntimeModelInfo(agent)));
}

describe('managed agent catalog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it.each(['builtin', 'internal'])(
    'refreshes %s Codex Auto from the live CLI without rewriting the saved agent',
    async (agent_source) => {
      const agent = { ...staleAgent, agent_source };
      const original = structuredClone(agent);
      getManagedAgentsInvoke.mockResolvedValue([agent]);
      modelsInvoke.mockResolvedValueOnce([liveModel]).mockResolvedValueOnce([oldModel]);

      await expect(readAutoSelection()).resolves.toEqual({ modelId: 'gpt-6-astra', reasoningEffort: 'max' });
      // A later authoritative catalog must also permit a compatible older model.
      await expect(readAutoSelection()).resolves.toEqual({ modelId: 'gpt-5.6-sol', reasoningEffort: 'max' });
      expect(modelsInvoke).toHaveBeenCalledTimes(2);
      expect(agent).toEqual(original);
    }
  );

  it('uses the App catalog-unavailable fallback when live refresh fails, even with stale config options', async () => {
    getManagedAgentsInvoke.mockResolvedValue([staleAgent]);
    modelsInvoke.mockRejectedValue(new Error('CLI unavailable'));

    await expect(readAutoSelection()).resolves.toEqual({ modelId: 'gpt-6-astra', reasoningEffort: 'max' });
  });

  it('preserves the WebUI catalog when the native transport is unavailable', async () => {
    const agents = [staleAgent];
    getManagedAgentsInvoke.mockResolvedValue(agents);
    modelsInvoke.mockResolvedValue(null);

    await expect(fetchManagedAgents()).resolves.toBe(agents);
  });

  it('leaves custom and extension executors on their own catalogs', async () => {
    const agents = ['custom', 'extension'].map((agent_source) => ({ ...staleAgent, agent_source }));
    getManagedAgentsInvoke.mockResolvedValue(agents);

    await expect(fetchManagedAgents()).resolves.toBe(agents);
    expect(modelsInvoke).not.toHaveBeenCalled();
  });
});

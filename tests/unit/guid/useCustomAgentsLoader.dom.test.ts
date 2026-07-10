import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { assistantCatalog } = vi.hoisted(() => ({
  assistantCatalog: [
    {
      id: 'mas',
      source: 'generated',
      name: 'MAS',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 1,
      preset_agent_type: 'codex',
      agent_id: 'codex-managed',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
      agent_status: 'online',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    },
    {
      id: 'unrelated-upstream-assistant',
      source: 'builtin',
      name: 'Unrelated',
      name_i18n: {},
      description_i18n: {},
      enabled: true,
      sort_order: 2,
      preset_agent_type: 'claude',
      agent_id: 'claude-managed',
      agent: { type: 'acp', source: 'builtin', acp_backend: 'claude' },
      agent_status: 'online',
      enabled_skills: [],
      custom_skill_names: [],
      disabled_builtin_skills: [],
      context_i18n: {},
      prompts: [],
      prompts_i18n: {},
      models: [],
    },
  ],
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: assistantCatalog })),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    assistants: { list: { invoke: vi.fn() } },
  },
}));

import { useCustomAgentsLoader } from '@/renderer/pages/guid/hooks/useCustomAgentsLoader';

describe('useCustomAgentsLoader', () => {
  it('derives OPL Home assistants from the assistant catalog without an agent-list facade', () => {
    const { result } = renderHook(() => useCustomAgentsLoader());

    expect(result.current.catalogAssistants).toBe(assistantCatalog);
    expect(result.current.assistants.map((assistant) => assistant.id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
    ]);
    expect(result.current.assistants[0]).toMatchObject({
      id: 'med-autoscience',
      agent_id: 'codex-managed',
      agent: { acp_backend: 'codex' },
    });
    expect(result.current).not.toHaveProperty('refreshCustomAgents');
  });
});

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { usePresetAssistantResolver } from '@/renderer/pages/guid/hooks/usePresetAssistantResolver';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readAssistantRule: { invoke: vi.fn() },
      readAssistantSkill: { invoke: vi.fn() },
    },
  },
}));

const assistant: Assistant = {
  id: 'assistant-aionrs',
  source: 'user',
  name: 'AionRS Assistant',
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 0,
  agent_id: 'runtime-aionrs',
  agent: { type: 'aionrs', source: 'internal' },
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
};

describe('usePresetAssistantResolver', () => {
  it('resolves runtime from the canonical assistant agent fields', () => {
    const { result } = renderHook(() => usePresetAssistantResolver({ assistants: [assistant], localeKey: 'en-US' }));

    expect(
      result.current.resolvePresetAgentType({
        agent_type: 'acp',
        backend: 'codex',
        custom_agent_id: assistant.id,
      })
    ).toBe('aionrs');
  });
});

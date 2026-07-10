import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  buildChannelAgentOptions,
  buildChannelAssistantSelection,
  resolveChannelAssistantSelection,
} from '@/renderer/components/settings/SettingsModal/contents/channels/assistantOptions';

const assistants: Assistant[] = [
  {
    id: 'assistant-aionrs',
    source: 'generated',
    name: 'AionRS',
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    agent_id: 'runtime-aionrs',
    agent: { type: 'aionrs', source: 'internal' },
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
    id: 'assistant-codex',
    source: 'generated',
    name: 'Codex',
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 1,
    agent_id: 'runtime-codex',
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
];

describe('Channel assistant options', () => {
  it('uses Assistant business ids while preserving runtime metadata for display logic', () => {
    expect(buildChannelAgentOptions(assistants)).toEqual([
      {
        assistant_id: 'assistant-aionrs',
        runtime_agent_id: 'runtime-aionrs',
        agent_type: 'aionrs',
        backend: undefined,
        name: 'AionRS',
      },
      {
        assistant_id: 'assistant-codex',
        runtime_agent_id: 'runtime-codex',
        agent_type: 'acp',
        backend: 'codex',
        name: 'Codex',
      },
    ]);
  });

  it('serializes only canonical assistant identity', () => {
    expect(buildChannelAssistantSelection(buildChannelAgentOptions(assistants)[1])).toEqual({
      assistant_id: 'assistant-codex',
    });
  });

  it('does not silently replace a missing saved assistant', () => {
    expect(resolveChannelAssistantSelection({ assistant_id: 'deleted-assistant' }, assistants)).toEqual({
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    });
  });
});

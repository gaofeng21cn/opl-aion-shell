import { describe, expect, it } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { selectRunnableConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

const assistant = (id: string, agentId: string): Assistant => ({
  id,
  source: 'generated',
  name: id,
  name_i18n: {},
  description_i18n: {},
  enabled: true,
  sort_order: 0,
  agent_id: agentId,
  agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
  agent_status: 'online',
  enabled_skills: [],
  custom_skill_names: [],
  disabled_builtin_skills: [],
  context_i18n: {},
  prompts: [],
  prompts_i18n: {},
  models: [],
});

const managed = (id: string, status: ManagedAgent['status'], enabled = true, installed = true): ManagedAgent => ({
  id,
  name: id,
  agent_type: 'acp',
  backend: 'codex',
  agent_source: 'builtin',
  enabled,
  installed,
  status,
});

describe('conversation agent projection', () => {
  it('keeps assistant identity and excludes missing, offline, disabled, and uninstalled runtime rows', () => {
    const result = selectRunnableConversationAgents(
      [
        managed('runtime-online', 'online'),
        managed('runtime-unchecked', 'unchecked'),
        managed('runtime-missing', 'missing'),
        managed('runtime-offline', 'offline'),
        managed('runtime-disabled', 'online', false),
        managed('runtime-uninstalled', 'online', true, false),
      ],
      [
        assistant('assistant-online', 'runtime-online'),
        assistant('assistant-unchecked', 'runtime-unchecked'),
        assistant('assistant-missing', 'runtime-missing'),
        assistant('assistant-offline', 'runtime-offline'),
        assistant('assistant-disabled', 'runtime-disabled'),
        assistant('assistant-uninstalled', 'runtime-uninstalled'),
      ]
    );

    expect(result.map((entry) => entry.id)).toEqual(['assistant-online', 'assistant-unchecked']);
    expect(result[0]).toMatchObject({
      assistant_id: 'assistant-online',
      managed_agent_id: 'runtime-online',
      agent_status: 'online',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { toBackendAgent } from '@/common/adapter/teamMapper';

describe('Team request mapper', () => {
  it('writes Assistant business identity without legacy runtime fields', () => {
    const result = toBackendAgent({
      role: 'leader',
      status: 'pending',
      agent_type: 'codex',
      agent_name: 'Leader',
      assistant_id: 'assistant-codex',
      conversation_type: 'acp',
      model: 'gpt-5.6-sol',
    });

    expect(result).toEqual({
      name: 'Leader',
      role: 'lead',
      model: 'gpt-5.6-sol',
      assistant_id: 'assistant-codex',
    });
  });

  it('fails closed when Assistant identity is absent', () => {
    expect(() =>
      toBackendAgent({
        role: 'leader',
        status: 'pending',
        agent_type: 'codex',
        agent_name: 'Leader',
        conversation_type: 'acp',
      })
    ).toThrow('assistant_id is required');
  });
});

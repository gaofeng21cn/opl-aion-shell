import { describe, expect, it } from 'vitest';
import {
  fromBackendTeam,
  fromBackendTeamAgentRenamedEvent,
  fromBackendTeamAgentSpawnedEvent,
  fromBackendTeamAgentStatusEvent,
  toBackendAgent,
} from '@/common/adapter/teamMapper';

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

describe('Team response mapper', () => {
  it('maps the AionCore assistants and leader_assistant_id fields', () => {
    const result = fromBackendTeam({
      id: 'team-1',
      name: 'Alpha',
      workspace: '/tmp/team',
      assistants: [
        {
          slot_id: 'slot-1',
          assistant_name: 'Lead',
          name: 'Lead',
          role: 'lead',
          conversation_id: 'conversation-1',
          assistant_backend: 'codex',
          backend: 'codex',
          model: 'gpt-5.6-sol',
          assistant_id: 'assistant-codex',
          status: 'idle',
          pending_confirmations: 2,
        },
      ],
      leader_assistant_id: 'slot-1',
      created_at: 100,
      updated_at: 200,
    });

    expect(result.leader_agent_id).toBe('slot-1');
    expect(result.agents).toEqual([
      expect.objectContaining({
        slot_id: 'slot-1',
        agent_name: 'Lead',
        agent_type: 'codex',
        assistant_id: 'assistant-codex',
        pending_confirmations: 2,
      }),
    ]);
  });

  it('maps AionCore lifecycle events to the renderer Team contract', () => {
    expect(
      fromBackendTeamAgentStatusEvent({
        team_id: 'team-1',
        slot_id: 'slot-1',
        status: 'working',
      })
    ).toEqual({
      team_id: 'team-1',
      slot_id: 'slot-1',
      status: 'active',
    });

    expect(
      fromBackendTeamAgentSpawnedEvent({
        team_id: 'team-1',
        assistant: {
          slot_id: 'slot-2',
          conversation_id: 'conversation-2',
          assistant_name: 'Reviewer',
          assistant_backend: 'codex',
          assistant_id: 'assistant-reviewer',
          role: 'teammate',
          status: 'idle',
        },
      })
    ).toEqual({
      team_id: 'team-1',
      agent: expect.objectContaining({
        slot_id: 'slot-2',
        agent_name: 'Reviewer',
        agent_type: 'codex',
        assistant_id: 'assistant-reviewer',
      }),
    });

    expect(
      fromBackendTeamAgentRenamedEvent({
        team_id: 'team-1',
        slot_id: 'slot-2',
        name: 'Reviewer 2',
      })
    ).toEqual({
      team_id: 'team-1',
      slot_id: 'slot-2',
      new_name: 'Reviewer 2',
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildAgentRuntimeModeState,
  buildAgentRuntimeModelInfo,
  buildAgentRuntimeSlashCommands,
} from '@/renderer/utils/model/agentRuntimeCatalog';

describe('managed agent runtime catalog', () => {
  it('reads live flat runtime metadata', () => {
    const agent = {
      available_models: {
        current_model_id: 'gpt-5.4',
        available_models: [{ id: 'gpt-5.4', label: 'GPT-5.4' }],
      },
      available_modes: {
        current_mode_id: 'full-access',
        available_modes: [{ id: 'full-access', name: 'Full access' }],
      },
      available_commands: [{ name: 'review', description: 'Review changes' }],
    };

    expect(buildAgentRuntimeModelInfo(agent)?.current_model_id).toBe('gpt-5.4');
    expect(buildAgentRuntimeModeState(agent)).toEqual({
      currentMode: 'full-access',
      options: [{ value: 'full-access', label: 'Full access', description: undefined }],
    });
    expect(buildAgentRuntimeSlashCommands(agent).map((command) => command.name)).toContain('review');
  });

  it('uses the same explicit fields under handshake when flat metadata is absent', () => {
    const agent = {
      handshake: {
        available_models: {
          current_model_id: 'sonnet',
          available_models: [{ id: 'sonnet', label: 'Sonnet' }],
        },
        available_modes: {
          current_mode_id: 'plan',
          available_modes: [{ id: 'plan', name: 'Plan' }],
        },
        available_commands: [{ name: 'status', description: 'Show status' }],
      },
    };

    expect(buildAgentRuntimeModelInfo(agent)?.current_model_id).toBe('sonnet');
    expect(buildAgentRuntimeModeState(agent).currentMode).toBe('plan');
    expect(buildAgentRuntimeSlashCommands(agent).map((command) => command.name)).toContain('status');
  });

  it('preserves an explicitly empty managed model catalog', () => {
    expect(
      buildAgentRuntimeModelInfo({
        available_models: {
          current_model_id: null,
          current_model_label: null,
          available_models: [],
        },
      })
    ).toEqual({
      current_model_id: null,
      current_model_label: null,
      available_models: [],
    });
  });
});

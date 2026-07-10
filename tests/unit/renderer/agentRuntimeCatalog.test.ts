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
      state: 'ready',
      currentMode: 'full-access',
      options: [{ value: 'full-access', label: 'Full access', description: undefined }],
    });
    expect(buildAgentRuntimeSlashCommands(agent)).toMatchObject({
      state: 'ready',
      commands: expect.arrayContaining([expect.objectContaining({ name: 'review' })]),
    });
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
    expect(buildAgentRuntimeSlashCommands(agent)).toMatchObject({
      state: 'ready',
      commands: expect.arrayContaining([expect.objectContaining({ name: 'status' })]),
    });
  });

  it('preserves Codex model/list metadata needed by Auto selection', () => {
    expect(
      buildAgentRuntimeModelInfo({
        available_models: {
          current_model_id: 'gpt-6',
          available_models: [
            {
              id: 'gpt-6',
              label: 'GPT-6',
              isDefault: true,
              supportedReasoningEfforts: [{ reasoningEffort: 'xhigh' }, { reasoningEffort: 'ultra' }],
              defaultReasoningEffort: 'xhigh',
              hidden: false,
              upgrade: null,
            },
          ],
        },
      })?.available_models[0]
    ).toMatchObject({
      id: 'gpt-6',
      isDefault: true,
      supportedReasoningEfforts: [{ reasoningEffort: 'xhigh' }, { reasoningEffort: 'ultra' }],
      defaultReasoningEffort: 'xhigh',
      hidden: false,
      upgrade: null,
    });
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

  it('distinguishes unknown runtime metadata from an explicitly empty mode or command catalog', () => {
    expect(buildAgentRuntimeModeState({})).toEqual({ state: 'unknown', options: [] });
    expect(
      buildAgentRuntimeModeState({
        available_modes: { current_mode_id: null, available_modes: [] },
      })
    ).toEqual({ state: 'empty', options: [] });
    expect(buildAgentRuntimeSlashCommands({})).toEqual({ state: 'unknown', commands: [] });
    expect(buildAgentRuntimeSlashCommands({ available_commands: [] })).toEqual({ state: 'empty', commands: [] });
  });
});

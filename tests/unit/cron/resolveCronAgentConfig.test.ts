import { describe, expect, it } from 'vitest';
import {
  isOplCodexCronJob,
  resolveCronAgentConfig,
  resolveCronEditProviderId,
  resolveOplScheduledCodexAssistant,
  shouldIncludeCronAgentConfig,
  type OplScheduledCodexCandidate,
} from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';
import type { ICronJob } from '@/common/adapter/ipcBridge';

const codexCandidate = (id: string): OplScheduledCodexCandidate => ({
  id,
  source: 'generated',
  enabled: true,
  name: 'Codex',
  name_i18n: {},
  agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
});

describe('Cron assistant write config', () => {
  it('resolves exactly one generated enabled Codex assistant', () => {
    expect(resolveOplScheduledCodexAssistant([codexCandidate('assistant-codex')])).toEqual({
      status: 'ready',
      assistant: codexCandidate('assistant-codex'),
    });
    expect(
      resolveOplScheduledCodexAssistant([
        { ...codexCandidate('disabled-codex'), enabled: false },
        { ...codexCandidate('user-codex'), source: 'user' },
      ])
    ).toEqual({ status: 'missing' });
  });

  it('keeps missing and ambiguous Codex identity local to composition', () => {
    expect(resolveOplScheduledCodexAssistant([])).toEqual({ status: 'missing' });
    expect(resolveOplScheduledCodexAssistant([codexCandidate('codex-a'), codexCandidate('codex-b')])).toEqual({
      status: 'ambiguous',
    });
  });

  it('distinguishes Codex jobs from legacy non-Codex jobs without rewriting either', () => {
    const candidates = [codexCandidate('assistant-codex')];
    expect(isOplCodexCronJob(cronJob('acp', { name: 'Codex', assistant_id: 'assistant-codex' }), candidates)).toBe(
      true
    );
    expect(isOplCodexCronJob(cronJob('acp', { name: 'Codex', backend: 'codex' }), [])).toBe(true);
    expect(isOplCodexCronJob(cronJob('acp', { name: 'Claude', backend: 'claude' }), candidates)).toBe(false);
  });

  it('writes assistant identity without legacy runtime fields', () => {
    const config = resolveCronAgentConfig({
      assistantId: 'assistant-codex',
      assistants: [
        {
          id: 'assistant-codex',
          name: 'Codex',
          name_i18n: { 'zh-CN': '代码助手' },
          agent: { type: 'acp', source: 'builtin', acp_backend: 'codex' },
        },
      ],
      localeKey: 'zh-CN',
      getMode: () => 'full-access',
      aionrsModelRequiredMessage: 'model required',
    });

    expect(config).toEqual({
      name: '代码助手',
      assistant_id: 'assistant-codex',
      mode: 'full-access',
      model_id: undefined,
      config_options: undefined,
      workspace: undefined,
    });
    expect(config).not.toHaveProperty('backend');
    expect(config).not.toHaveProperty('custom_agent_id');
    expect(config).not.toHaveProperty('is_preset');
  });

  it('includes provider model identity for aionrs assistants', () => {
    const config = resolveCronAgentConfig({
      assistantId: 'assistant-aionrs',
      assistants: [
        {
          id: 'assistant-aionrs',
          name: 'AionRS',
          name_i18n: {},
          agent: { type: 'aionrs', source: 'internal' },
        },
      ],
      selectedAionrsProvider: { id: 'provider-gemini' },
      model_id: 'gemini-2.5-pro',
      getMode: () => 'yolo',
      aionrsModelRequiredMessage: 'model required',
    });

    expect(config.model).toEqual({
      provider_id: 'provider-gemini',
      model: 'gemini-2.5-pro',
      use_model: 'gemini-2.5-pro',
    });
  });

  it('fails closed for stale assistant identity', () => {
    expect(() =>
      resolveCronAgentConfig({
        assistantId: 'deleted-assistant',
        assistants: [],
        getMode: () => undefined,
        aionrsModelRequiredMessage: 'model required',
      })
    ).toThrow('assistant_id is required');
  });

  it('reads the exact AionRS provider from the model DTO', () => {
    expect(
      resolveCronEditProviderId({
        name: 'AionRS',
        backend: 'legacy-wrong-provider',
        model: {
          provider_id: 'provider-canonical',
          model: 'gemini-2.5-pro',
        },
      })
    ).toBe('provider-canonical');
  });

  it('omits agent_config whenever an edit starts or ends in existing-conversation mode', () => {
    expect(
      shouldIncludeCronAgentConfig({
        isEditMode: true,
        originalExecutionMode: 'existing',
        nextExecutionMode: 'new_conversation',
      })
    ).toBe(false);
    expect(
      shouldIncludeCronAgentConfig({
        isEditMode: true,
        originalExecutionMode: 'new_conversation',
        nextExecutionMode: 'existing',
      })
    ).toBe(false);
    expect(
      shouldIncludeCronAgentConfig({
        isEditMode: true,
        originalExecutionMode: 'new_conversation',
        nextExecutionMode: 'new_conversation',
      })
    ).toBe(true);
    expect(
      shouldIncludeCronAgentConfig({
        isEditMode: false,
        originalExecutionMode: undefined,
        nextExecutionMode: 'existing',
      })
    ).toBe(true);
  });
});

function cronJob(agentType: string, agentConfig: ICronJob['metadata']['agent_config']): ICronJob {
  return {
    metadata: {
      agent_type: agentType,
      agent_config: agentConfig,
    },
  } as ICronJob;
}

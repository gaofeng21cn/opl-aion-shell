import { describe, expect, it } from 'vitest';
import { resolveCronAgentConfig } from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';

describe('Cron assistant write config', () => {
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
});

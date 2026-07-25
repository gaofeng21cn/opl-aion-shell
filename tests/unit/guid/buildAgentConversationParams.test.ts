import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configService } from '@/common/config/configService';
import { getOplDefaultCodexReasoningEffort } from '@/common/config/oplProductProfile';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';

const model = {
  id: 'codex',
  platform: 'openai',
  name: 'Codex',
  use_model: 'gpt-5.6-sol',
};

describe('buildAgentConversationParams OPL flow context', () => {
  beforeEach(() => {
    configService.reset();
  });

  afterEach(() => {
    configService.reset();
  });

  it('keeps OPL Flow metadata and preset rules without generated App session context', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Research plan',
      workspace: '/Users/example/workspace',
      model,
      custom_agent_id: 'builtin-mas',
      is_preset: true,
      preset_agent_type: 'codex',
      preset_resources: {
        rules: 'Existing assistant rule.',
      },
      language: 'en-US',
    });

    expect(params.extra.preset_context).toBe('Existing assistant rule.');
    expect(params.extra.opl_flow_context).toEqual({
      flow_id: 'opl-flow',
      source: 'opl-flow-package-policy',
      delivery: 'package_installed_user_profile_only',
      language: 'follow_ui_locale_zh_only_when_ui_zh',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    });
    expect(params.extra).not.toHaveProperty('opl_app_session_context');
  });

  it('preserves caller-provided OPL flow context overrides', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'General task',
      workspace: '/Users/example/workspace',
      model,
      extra: {
        opl_flow_context: {
          flow_id: 'custom-flow',
          source: 'test',
          delivery: 'session_scoped_preset_context',
          language: 'en-US',
          user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
        },
      },
    });

    expect(params.extra.opl_flow_context?.flow_id).toBe('custom-flow');
    expect(params.extra.opl_flow_context?.language).toBe('en-US');
  });

  it('does not generate locale-specific base context', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: '科研计划',
      workspace: '/Users/example/workspace',
      model,
      is_preset: true,
      preset_agent_type: 'codex',
      preset_resources: {
        rules: '已有智能体规则。',
      },
      language: 'zh-CN',
    });

    expect(params.extra.preset_context).toBe('已有智能体规则。');
    expect(params.extra).not.toHaveProperty('opl_app_session_context');
  });

  it('appends saved user instructions directly to existing preset rules', () => {
    configService.setLocal('codex.oplAppSessionContextAdditional', 'Prefer concise progress summaries.');

    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Additional context',
      workspace: '/Users/example/workspace',
      model,
      is_preset: true,
      preset_agent_type: 'codex',
      preset_resources: { rules: 'Existing assistant rule.' },
      language: 'en-US',
    });

    expect(params.extra.preset_context).toBe('Existing assistant rule.\n\nPrefer concise progress summaries.');
    expect(params.extra).not.toHaveProperty('opl_app_session_context');
  });

  it('injects nothing when the legacy additional-instructions storage value is empty', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Empty instructions',
      workspace: '/Users/example/workspace',
      model,
      language: 'en-US',
    });

    expect(params.extra).not.toHaveProperty('preset_context');
    expect(params.extra).not.toHaveProperty('opl_app_session_context');
  });

  it('sets the App-generated Codex reasoning default while preserving user overrides', () => {
    const defaultParams = buildAgentConversationParams({
      backend: 'codex',
      name: 'Default reasoning',
      workspace: '/Users/example/workspace',
      model,
    });

    expect(defaultParams.model?.use_model).toBe('gpt-5.6-sol');
    expect(defaultParams.extra.pending_config_options).toEqual({
      reasoning_effort: getOplDefaultCodexReasoningEffort(),
    });

    expect(
      buildAgentConversationParams({
        backend: 'codex',
        name: 'Manual reasoning',
        workspace: '/Users/example/workspace',
        model,
        config_options: { reasoning_effort: 'high' },
      }).extra.pending_config_options
    ).toEqual({ reasoning_effort: 'high' });
  });
});

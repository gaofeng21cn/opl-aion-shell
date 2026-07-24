import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configService } from '@/common/config/configService';
import { getOplAppSessionContextPolicy, getOplDefaultCodexReasoningEffort } from '@/common/config/oplProductProfile';
import generatedProfile from '@/common/config/oplProductProfile/oplProductProfile.generated.json';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';

const model = {
  id: 'codex',
  platform: 'openai',
  name: 'Codex',
  use_model: 'gpt-5.6-sol',
};

const liveAppState = {
  agent_packages: {
    directory: {
      entries: [
        {
          package_id: 'mas',
          package_role: 'standard_agent',
          installed: true,
          display_name: 'Med Auto Science',
          description: 'Research, papers, and data analysis',
          capability_metadata: {
            source: 'normalized_owner_manifest',
            required_skill_ids: ['med-autoscience'],
            optional_skill_refs: ['officecli-docx'],
          },
        },
        {
          package_id: 'oma',
          package_role: 'standard_agent',
          installed: true,
          display_name: 'OPL Meta Agent',
          description: 'Create, take over, and inspect Foundry Agents',
          capability_metadata: {
            source: 'normalized_owner_manifest',
            required_skill_ids: ['opl-meta-agent'],
            optional_skill_refs: [],
          },
        },
      ],
    },
  },
};

describe('buildAgentConversationParams OPL flow context', () => {
  beforeEach(() => {
    configService.reset();
  });

  afterEach(() => {
    configService.reset();
  });

  it('adds App-owned context metadata and prepends localized agent routes without replacing preset context', () => {
    const appSessionContextPolicy = getOplAppSessionContextPolicy();
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
      appState: liveAppState,
    });

    expect(params.extra.preset_context).toContain('## About this conversation');
    expect(params.extra.preset_context).toContain('Med Auto Science: Research, papers, and data analysis');
    expect(params.extra.preset_context).toContain('OPL Meta Agent: Create, take over, and inspect Foundry Agents');
    expect(params.extra.preset_context).not.toContain('本对话由 One Person Lab App 发起');
    expect(params.extra.preset_context).toContain('Existing assistant rule.');
    expect(params.extra.preset_context).toMatch(/Med Auto Science[\s\S]+Existing assistant rule\./);
    expect(params.extra.opl_flow_context).toEqual({
      flow_id: 'opl-flow',
      source: 'opl-flow-package-policy',
      delivery: 'package_installed_user_profile_only',
      language: 'follow_ui_locale_zh_only_when_ui_zh',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    });
    expect(appSessionContextPolicy.source).toBe(generatedProfile.codex.opl_app_session_context.source);
    expect(params.extra.opl_app_session_context).toEqual({
      owner: 'one-person-lab-app',
      source: appSessionContextPolicy.source,
      additional_instructions: false,
      effect: 'next_new_conversation',
    });
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

  it('uses the Chinese OPL flow context for Chinese UI sessions', () => {
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

    expect(params.extra.preset_context).toContain('## 关于本次会话');
    expect(params.extra.preset_context).toContain('本对话由 One Person Lab App 发起');
    expect(params.extra.preset_context).toContain('已有智能体规则。');
    expect(params.extra.preset_context).not.toContain('## About this conversation');
  });

  it('appends saved OPL App instructions without replacing the generated agent directory', () => {
    configService.setLocal('codex.oplAppSessionContextAdditional', 'Prefer concise progress summaries.');

    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Additional context',
      workspace: '/Users/example/workspace',
      model,
      language: 'en-US',
      appState: liveAppState,
    });

    expect(params.extra.preset_context).toContain('Med Auto Science: Research, papers, and data analysis');
    expect(params.extra.preset_context).toContain('## Additional User Instructions');
    expect(params.extra.preset_context).toContain('Prefer concise progress summaries.');
    expect(params.extra.opl_app_session_context?.additional_instructions).toBe(true);
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

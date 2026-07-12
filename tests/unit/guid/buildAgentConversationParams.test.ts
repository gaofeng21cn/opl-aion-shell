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

  it('adds App-owned context metadata and prepends localized agent routes without replacing preset context', () => {
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

    expect(params.extra.preset_context).toContain('## OPL App Session Context');
    expect(params.extra.preset_context).toContain('MAS (Med Auto Science): research, papers, data analysis');
    expect(params.extra.preset_context).toContain('OMA (OPL Meta Agent): create, take over, inspect');
    expect(params.extra.preset_context).not.toContain('你正在 One Person Lab App');
    expect(params.extra.preset_context).toContain('Existing assistant rule.');
    expect(params.extra.preset_context).toMatch(/MAS \(Med Auto Science\)[\s\S]+Existing assistant rule\./);
    expect(params.extra.opl_flow_context).toEqual({
      flow_id: 'opl-flow',
      source: 'opl-flow-package-policy',
      delivery: 'package_installed_user_profile_only',
      language: 'follow_ui_locale_zh_only_when_ui_zh',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    });
    expect(params.extra.opl_app_session_context).toEqual({
      owner: 'one-person-lab-app',
      source: 'gui.professional_agent_packages.session_routing_summary_i18n',
      mode: 'automatic',
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

    expect(params.extra.preset_context).toContain('## OPL App 会话上下文');
    expect(params.extra.preset_context).toContain('你正在 One Person Lab App');
    expect(params.extra.preset_context).toContain('已有智能体规则。');
    expect(params.extra.preset_context).not.toContain('## OPL App Session Context');
  });

  it('uses a saved custom OPL App context for the next new conversation', () => {
    configService.setLocal('codex.oplAppSessionContextMode', 'custom');
    configService.setLocal('codex.oplAppSessionContextCustom', 'Custom OPL routing context.');

    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Custom context',
      workspace: '/Users/example/workspace',
      model,
      language: 'en-US',
    });

    expect(params.extra.preset_context).toBe('Custom OPL routing context.');
    expect(params.extra.opl_app_session_context?.mode).toBe('custom');
  });

  it('does not inject prompt text for the intelligence enhancement setting', () => {
    configService.setLocal('codex.oplFlowIntelligenceEnhancementMode', true);

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

    expect(params.extra.preset_context).toMatch(/你正在 One Person Lab App[\s\S]+已有智能体规则。/);
    expect(params.extra.preset_context).not.toContain('DO NOT send optional commentary');
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

import { describe, expect, it } from 'vitest';

import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
  resolveEffectiveOplAppSessionContext,
} from '@/common/utils/buildAgentConversationParams';

const model = {
  provider: 'openai',
  use_model: 'gpt-4.1',
  model: 'gpt-4.1',
};

describe('buildAgentConversationParams agent type policy', () => {
  it('always keeps the generated OPL agent directory as the base session context', () => {
    const context = resolveEffectiveOplAppSessionContext('zh-CN');

    expect(context.hasAdditionalInstructions).toBe(false);
    expect(context.content).toContain('MAS（Med Auto Science）：科研、论文、数据分析、审稿、返修和投稿');
    expect(context.content).toContain('OMA（OPL Meta Agent）：创建、接管、检查和改进 OPL Foundry Agent');
  });

  it('appends user instructions without replacing the generated OPL agent directory', () => {
    const context = resolveEffectiveOplAppSessionContext('en-US', {
      additionalInstructions: 'Prefer concise progress summaries.',
    });

    expect(context.hasAdditionalInstructions).toBe(true);
    expect(context.content).toContain('MAS (Med Auto Science): research, papers, data analysis, peer review');
    expect(context.content).toContain('## Additional User Instructions');
    expect(context.content).toContain('Prefer concise progress summaries.');
  });

  it('maps only aionrs to top-level aionrs', () => {
    expect(getConversationTypeForBackend('aionrs')).toBe('aionrs');
  });

  it('maps ACP vendors and deprecated runtime labels to acp', () => {
    for (const backend of ['claude', 'codex', 'gemini', 'openclaw', 'openclaw-gateway', 'nanobot', 'remote']) {
      expect(getConversationTypeForBackend(backend)).toBe('acp');
    }
  });

  it('builds OpenClaw as an ACP backend instead of openclaw-gateway', () => {
    const params = buildAgentConversationParams({
      backend: 'openclaw',
      name: 'OpenClaw',
      workspace: '/tmp/aionui-openclaw',
      model,
    });

    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('openclaw');
    expect(params.extra.agent_name).toBe('OpenClaw');
    expect(params.extra.gateway).toBeUndefined();
  });

  it('creates Codex conversations as ACP backend conversations', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'Codex CLI',
      agent_name: 'Codex CLI',
      workspace: '/tmp/aionui-codex',
      model,
    });

    expect(params.type).toBe('acp');
    expect(params.extra.backend).toBe('codex');
  });

  it('does not produce remote or nanobot top-level conversation types', () => {
    for (const backend of ['remote', 'nanobot']) {
      const params = buildAgentConversationParams({
        backend,
        name: backend,
        workspace: `/tmp/aionui-${backend}`,
        model,
      });

      expect(params.type).toBe('acp');
      expect(params.extra.backend).toBe(backend);
      expect(params.extra.remote_agent_id).toBeUndefined();
    }
  });

  it('sends top-level assistant identity only for a backend-known assistant', () => {
    const backendAssistant = buildAgentConversationParams({
      backend: 'codex',
      name: 'Known assistant',
      workspace: '/tmp/aionui-known-assistant',
      model,
      is_preset: true,
      preset_agent_type: 'codex',
      preset_assistant_id: 'opl-purpose-id',
      backend_assistant_id: 'assistant-from-api',
    });
    const syntheticAssistant = buildAgentConversationParams({
      backend: 'codex',
      name: 'Synthetic assistant',
      workspace: '/tmp/aionui-synthetic-assistant',
      model,
      is_preset: true,
      preset_agent_type: 'codex',
      preset_assistant_id: 'opl-purpose-id',
    });

    expect(backendAssistant.assistant).toEqual({ id: 'assistant-from-api', locale: 'zh-CN' });
    expect(syntheticAssistant.assistant).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildAgentConversationParams,
  getConversationTypeForBackend,
} from '@/common/utils/buildAgentConversationParams';

const model = {
  provider: 'openai',
  use_model: 'gpt-4.1',
  model: 'gpt-4.1',
};

describe('buildAgentConversationParams agent type policy', () => {
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

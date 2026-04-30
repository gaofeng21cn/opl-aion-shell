/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TProviderWithModel } from '../../src/common/config/storage';
import { OPL_APP_ACTIVATION_POLICY, OPL_CODEX_CONTEXT_SNIPPET } from '../../src/common/config/oplSkills';
import { buildAgentConversationParams } from '../../src/common/utils/buildAgentConversationParams';

const mockModel = {} as unknown as TProviderWithModel;

describe('buildAgentConversationParams', () => {
  it('builds ACP params for regular backends', () => {
    const params = buildAgentConversationParams({
      backend: 'qwen',
      name: 'Conversation Name',
      agentName: 'Qwen Code',
      workspace: '/workspace',
      model: mockModel,
      cliPath: '/usr/local/bin/qwen',
      currentModelId: 'qwen3-coder-plus',
      sessionMode: 'yolo',
      extra: {
        teamId: 'team-1',
      },
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'Conversation Name',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        backend: 'qwen',
        agentName: 'Qwen Code',
        cliPath: '/usr/local/bin/qwen',
        currentModelId: 'qwen3-coder-plus',
        sessionMode: 'yolo',
        teamId: 'team-1',
      }),
    });
    expect(params.extra.presetContext).toBeUndefined();
  });

  it('injects the OPL activation policy for plain Codex ACP conversations', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'One Person Lab',
      agentName: 'Codex',
      workspace: '/workspace',
      model: mockModel,
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'One Person Lab',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        backend: 'codex',
        agentName: 'Codex',
        presetContext: OPL_CODEX_CONTEXT_SNIPPET,
      }),
    });
    expect(params.extra.presetContext).toContain(OPL_APP_ACTIVATION_POLICY);
    expect(params.extra.presetContext).toContain('优先按 MAS 路线处理');
  });

  it('normalizes retired Gemini preset params to Codex ACP', () => {
    const params = buildAgentConversationParams({
      backend: 'gemini',
      name: 'Preset Gemini',
      agentName: 'Preset Gemini',
      workspace: '/workspace',
      model: { id: 'provider-1', useModel: 'gemini-2.0-flash' } as unknown as TProviderWithModel,
      customAgentId: 'assistant-1',
      isPreset: true,
      presetAgentType: 'gemini',
      presetResources: {
        rules: 'PRESET RULES',
        enabledSkills: ['skill-a'],
      },
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'Preset Gemini',
      model: { id: 'provider-1', useModel: 'gemini-2.0-flash' },
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        presetAssistantId: 'assistant-1',
        presetContext: `${OPL_CODEX_CONTEXT_SNIPPET}\n\nPRESET RULES`,
        enabledSkills: expect.arrayContaining(['mas', 'mag', 'rca', 'skill-a']),
        backend: 'codex',
      }),
    });
  });

  it('builds remote params with remote agent id', () => {
    const params = buildAgentConversationParams({
      backend: 'remote',
      name: 'Remote Conversation',
      workspace: '/workspace',
      model: mockModel,
      customAgentId: 'remote-agent-id',
    });

    expect(params).toEqual({
      type: 'remote',
      name: 'Remote Conversation',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        remoteAgentId: 'remote-agent-id',
      }),
    });
  });

  it('builds ACP params for extension adapters routed through customAgentId', () => {
    const params = buildAgentConversationParams({
      backend: 'custom',
      name: 'OPL ACP Conversation',
      agentName: 'OPL ACP',
      workspace: '/workspace',
      model: mockModel,
      cliPath: '/usr/local/bin/node',
      customAgentId: 'ext:opl-acp-extension:opl-acp',
      currentModelId: 'gpt-5.4',
      sessionMode: 'default',
    });

    expect(params).toEqual({
      type: 'acp',
      name: 'OPL ACP Conversation',
      model: {},
      extra: expect.objectContaining({
        workspace: '/workspace',
        customWorkspace: true,
        backend: 'custom',
        agentName: 'OPL ACP',
        cliPath: '/usr/local/bin/node',
        customAgentId: 'ext:opl-acp-extension:opl-acp',
        currentModelId: 'gpt-5.4',
        sessionMode: 'default',
      }),
    });
  });
});

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';
import { useGuidSend } from '@/renderer/pages/guid/hooks/useGuidSend';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: mocks.createConversation,
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('@/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: (input: string) => input,
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  updateWorkspaceTime: vi.fn(),
}));

function buildMcpServer(id: string, name: string) {
  return {
    id,
    name,
    enabled: true,
    transport: {
      type: 'stdio' as const,
      command: 'echo',
    },
    created_at: 1,
    updated_at: 1,
    original_json: '{}',
  };
}

function buildDeps(): GuidSendDeps {
  return {
    input: 'hello',
    setInput: vi.fn(),
    files: [],
    setFiles: vi.fn(),
    dir: '/tmp/opl',
    setDir: vi.fn(),
    setLoading: vi.fn(),
    loading: false,
    selectedAgent: 'codex',
    selectedAgentKey: 'custom:mas',
    selectedAgentInfo: {
      id: 'mas',
      custom_agent_id: 'mas',
      agent_type: 'codex',
      backend: 'codex',
      name: '科研',
      is_preset: true,
      avatar: 'MAS',
    },
    is_presetAgent: true,
    selectedMode: 'default',
    selectedAcpModel: null,
    currentAcpCachedModelInfo: {
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5（超高）',
      available_models: [],
    },
    current_model: {
      id: 'gpt-5.5',
      name: 'GPT-5.5',
      use_model: 'gpt-5.5',
      provider: 'gflab',
      base_url: 'https://gflabtoken.cn/v1',
      api_key: 'test',
    },
    findAgentByKey: vi.fn(),
    getEffectiveAgentType: vi.fn().mockReturnValue({
      agent_type: 'codex',
      isFallback: false,
      originalType: 'codex',
      isAvailable: true,
    }),
    resolvePresetRulesAndSkills: vi.fn().mockResolvedValue({}),
    resolveEnabledSkills: vi.fn().mockReturnValue(['mas', 'aionui-skills', 'cron']),
    resolveDisabledBuiltinSkills: vi.fn().mockReturnValue(['aionui-webui-setup']),
    guidDisabledBuiltinSkills: ['aionui-skills', 'aionui-webui-setup', 'skill-creator', 'cron'],
    guidEnabledSkills: ['mas', 'aionui-skills', 'cron'],
    availableMcpServers: [buildMcpServer('unknown-mcp', 'Unknown MCP'), buildMcpServer('cron', 'cron')],
    selectedMcpServerIds: ['unknown-mcp', 'cron'],
    currentEffectiveAgentInfo: {
      agent_type: 'codex',
      isFallback: false,
      originalType: 'codex',
      isAvailable: true,
    },
    isGoogleAuth: false,
    setMentionOpen: vi.fn(),
    setMentionQuery: vi.fn(),
    setMentionSelectorOpen: vi.fn(),
    setMentionActiveIndex: vi.fn(),
    navigate: mocks.navigate,
    t: ((key: string) => key) as GuidSendDeps['t'],
    language: 'zh-CN',
  };
}

describe('useGuidSend OPL ordinary capability whitelist', () => {
  beforeEach(() => {
    mocks.createConversation.mockReset();
    mocks.createConversation.mockResolvedValue({ id: 'conversation-1' });
    mocks.navigate.mockReset();
    sessionStorage.clear();
  });

  it('filters skills and MCP servers before creating an ordinary OPL Codex conversation', async () => {
    const { result } = renderHook(() => useGuidSend(buildDeps()));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    const payload = mocks.createConversation.mock.calls[0][0];
    expect(payload.type).toBe('acp');
    expect(payload.extra.preset_enabled_skills).toEqual(['mas']);
    expect(payload.extra.exclude_auto_inject_skills).toEqual([
      'aionui-skills',
      'aionui-webui-setup',
      'skill-creator',
      'cron',
    ]);
    expect(payload.extra.selected_mcp_server_ids).toEqual([]);
    expect(payload.extra.selected_session_mcp_servers).toEqual([]);
    expect(payload.extra.opl_agent_package_invocation).toEqual({
      route_kind: 'agent_package_shortcut',
      executor: 'codex_cli',
      package_id: 'mas',
      shortcut_id: 'research',
      codex_visible_entry: 'mas',
      required_skill_ids: ['mas'],
      source: 'opl_app_home',
    });
    expect(payload.extra.opl_assistant_route).toMatchObject({
      route_kind: 'builtin_capability',
      executor: 'codex_cli',
      assistant_id: 'mas',
      assistant_short_name: 'MAS',
      source: 'opl_app_home',
    });
    expect(payload.extra.pending_config_options).toEqual({ reasoning_effort: 'xhigh' });
  });
});

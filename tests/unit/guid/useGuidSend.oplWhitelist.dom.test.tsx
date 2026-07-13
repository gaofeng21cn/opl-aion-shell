import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';
import { useGuidSend } from '@/renderer/pages/guid/hooks/useGuidSend';
import { resolveOplActiveShortcut } from '@/renderer/pages/guid/utils/activeShortcut';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  activatePackage: vi.fn(),
  navigate: vi.fn(),
  appState: {} as Record<string, unknown>,
  messageError: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: {
        invoke: mocks.createConversation,
      },
    },
    oplRuntime: {
      executeAction: {
        invoke: mocks.activatePackage,
      },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    error: mocks.messageError,
    warning: vi.fn(),
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

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  useOplAppState: () => ({ appState: mocks.appState }),
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
    projectContextRefs: [],
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
    activeShortcut: resolveOplActiveShortcut('mas'),
    selectedMode: 'default',
    selectedAcpModel: null,
    selectedReasoningEffort: null,
    currentAcpCachedModelInfo: {
      current_model_id: 'gpt-5.6-sol',
      current_model_label: 'GPT-5.6-Sol',
      available_models: [],
    },
    current_model: {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6-Sol',
      use_model: 'gpt-5.6-sol',
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
    resolveEnabledSkills: vi.fn().mockReturnValue(['med-autoscience', 'aionui-skills', 'cron']),
    resolveDisabledBuiltinSkills: vi.fn().mockReturnValue(['aionui-webui-setup']),
    guidDisabledBuiltinSkills: ['aionui-skills', 'aionui-webui-setup', 'skill-creator', 'cron'],
    guidEnabledSkills: ['med-autoscience', 'aionui-skills', 'cron'],
    availableMcpServers: [buildMcpServer('unknown-mcp', 'Unknown MCP'), buildMcpServer('cron', 'cron')],
    selectedMcpServerIds: ['unknown-mcp', 'cron'],
    currentEffectiveAgentInfo: {
      agent_type: 'codex',
      isFallback: false,
      originalType: 'codex',
      isAvailable: true,
    },
    setMentionOpen: vi.fn(),
    setMentionQuery: vi.fn(),
    setMentionSelectorOpen: vi.fn(),
    setMentionActiveIndex: vi.fn(),
    navigate: mocks.navigate,
    t: ((key: string, options?: Record<string, string>) =>
      key === 'guid.home.launchBlocked' ? `${options?.reason}: ${options?.actions}` : key) as GuidSendDeps['t'],
    language: 'zh-CN',
  };
}

describe('useGuidSend OPL ordinary capability whitelist', () => {
  beforeEach(() => {
    mocks.createConversation.mockReset();
    mocks.createConversation.mockResolvedValue({ id: 'conversation-1' });
    mocks.activatePackage.mockReset();
    mocks.activatePackage.mockImplementation(
      ({ payloadRefsOnlyJson }: { payloadRefsOnlyJson: Record<string, unknown> }) => {
        const packageId = String(payloadRefsOnlyJson.package_id);
        const targetWorkspace = String(payloadRefsOnlyJson.target_workspace);
        const useBoundaryId = String(payloadRefsOnlyJson.use_boundary_id);
        const useReceiptRef = `opl://agent-package/use/${packageId}/test-receipt`;
        return Promise.resolve({
          ok: true,
          parsed: {
            app_action_execution: {
              action_id: 'agent_package_activate',
              result: {
                opl_agent_package_activation: {
                  package_id: packageId,
                  launch_allowed: true,
                  use_boundary_id: useBoundaryId,
                  use_receipt_ref: useReceiptRef,
                  package_use_binding: {
                    use_boundary_id: useBoundaryId,
                    use_receipt_ref: useReceiptRef,
                    scope: 'workspace',
                    target_root: targetWorkspace,
                    root_package: { package_id: packageId },
                  },
                },
              },
            },
          },
        });
      }
    );
    mocks.navigate.mockReset();
    mocks.appState = {
      agent_packages: {
        status_index: {
          packages: {
            mas: {
              package_id: 'mas',
              operational_ready: true,
              launch_allowed: true,
            },
          },
        },
      },
    };
    mocks.messageError.mockReset();
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
    expect(payload.model.use_model).toBe('gpt-5.6-sol');
    expect(payload.extra.current_model_id).toBe('gpt-5.6-sol');
    expect(payload.extra.preset_enabled_skills).toEqual(['med-autoscience']);
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
      codex_visible_entry: 'med-autoscience',
      required_skill_ids: ['med-autoscience'],
      source: 'opl_app_home',
    });
    expect(mocks.activatePackage).toHaveBeenCalledTimes(1);
    const activationRequest = mocks.activatePackage.mock.calls[0][0];
    expect(activationRequest).toMatchObject({
      actionId: 'agent_package_activate',
      dryRun: false,
      payloadRefsOnlyJson: {
        package_id: 'mas',
        scope: 'workspace',
        target_workspace: '/tmp/opl',
      },
    });
    expect(payload.extra.opl_agent_package_activation).toMatchObject({
      action_id: 'agent_package_activate',
      package_id: 'mas',
      scope: 'workspace',
      target_workspace: '/tmp/opl',
      launch_allowed: true,
      use_receipt_ref: 'opl://agent-package/use/mas/test-receipt',
      use_binding: {
        scope: 'workspace',
        target_root: '/tmp/opl',
        root_package: { package_id: 'mas' },
      },
    });
    expect(payload.extra.opl_assistant_route).toMatchObject({
      route_kind: 'builtin_capability',
      executor: 'codex_cli',
      assistant_id: 'mas',
      assistant_short_name: 'MAS',
      source: 'opl_app_home',
    });
    expect(payload.extra.pending_config_options).toEqual({ reasoning_effort: 'max' });
  });

  it('launches a user-visible non-default OMA shortcut without depending on default visibility', async () => {
    mocks.appState = {
      agent_packages: {
        status_index: {
          packages: {
            oma: {
              package_id: 'oma',
              operational_ready: true,
              launch_allowed: true,
            },
          },
        },
      },
    };
    const deps = buildDeps();
    deps.activeShortcut = resolveOplActiveShortcut('oma');
    deps.guidEnabledSkills = ['opl-meta-agent'];

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await result.current.handleSend();
    });

    const payload = mocks.createConversation.mock.calls[0][0];
    expect(payload.extra.opl_agent_package_invocation).toEqual({
      route_kind: 'agent_package_shortcut',
      executor: 'codex_cli',
      package_id: 'oma',
      shortcut_id: 'oma',
      codex_visible_entry: 'opl-meta-agent',
      required_skill_ids: ['opl-meta-agent'],
      source: 'opl_app_home',
    });
    expect(payload.extra.opl_assistant_route).toBeUndefined();
  });

  it('blocks ordinary package launch when Framework reports package_not_installed', async () => {
    mocks.appState = {
      agent_packages: {
        status_index: {
          packages: {
            mas: {
              package_id: 'mas',
              operational_ready: true,
              launch_allowed: true,
              launch_blocked_reason: 'package_not_installed',
              allowed_when_blocked: ['status', 'doctor', 'repair'],
            },
          },
        },
      },
    };
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(deps.resolvePresetRulesAndSkills).not.toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith(expect.stringContaining('package_not_installed'));
  });

  it('blocks ordinary canonical package launch when its Framework status entry is missing', async () => {
    mocks.appState = { agent_packages: { status_index: { packages: {} } } };
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(deps.resolvePresetRulesAndSkills).not.toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith(expect.stringContaining('package_not_installed'));
  });

  it('activates a scope-required package before creating its workspace conversation', async () => {
    mocks.appState = {
      agent_packages: {
        status_index: {
          packages: {
            mas: {
              package_id: 'mas',
              operational_ready: false,
              launch_allowed: false,
              launch_blocked_reason: 'scope_materialization_scope_required',
              allowed_when_blocked: ['status', 'doctor', 'repair'],
            },
          },
        },
      },
    };
    const { result } = renderHook(() => useGuidSend(buildDeps()));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
  });

  it('requires a workspace before activating an OPL package shortcut', async () => {
    const deps = buildDeps();
    deps.dir = '';
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith('guid.workspace.specifyWorkspace');
  });

  it('fails closed when Framework activation does not return a use binding', async () => {
    mocks.activatePackage.mockResolvedValue({
      ok: true,
      parsed: {
        app_action_execution: {
          action_id: 'agent_package_activate',
          result: {
            opl_agent_package_activation: {
              package_id: 'mas',
              launch_allowed: true,
              use_boundary_id: 'incomplete-boundary',
              use_receipt_ref: 'opl://agent-package/use/mas/incomplete',
              package_use_binding: null,
            },
          },
        },
      },
    });
    const { result } = renderHook(() => useGuidSend(buildDeps()));

    await expect(result.current.handleSend()).rejects.toThrow('invalid launch receipt');

    expect(mocks.createConversation).not.toHaveBeenCalled();
  });

  it('sends an unknown future Auto model with its highest advertised reasoning effort', async () => {
    const deps = buildDeps();
    deps.currentAcpCachedModelInfo = {
      current_model_id: 'gpt-6',
      current_model_label: 'GPT-6',
      available_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        {
          id: 'gpt-6',
          label: 'GPT-6',
          isDefault: true,
          supportedReasoningEfforts: [
            { reasoningEffort: 'high' },
            { reasoningEffort: 'xhigh' },
            { reasoningEffort: 'ultra' },
          ],
        },
      ],
      catalog_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        {
          id: 'gpt-6',
          label: 'GPT-6',
          isDefault: true,
          supportedReasoningEfforts: [
            { reasoningEffort: 'high' },
            { reasoningEffort: 'xhigh' },
            { reasoningEffort: 'ultra' },
          ],
        },
      ],
    };

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await result.current.handleSend();
    });

    const payload = mocks.createConversation.mock.calls[0][0];
    expect(payload.extra.current_model_id).toBe('gpt-6');
    expect(payload.extra.pending_config_options).toEqual({ reasoning_effort: 'ultra' });
  });

  it('keeps project refs separate from attachments while sending both through the existing file context path', async () => {
    const deps = buildDeps();
    deps.files = ['/tmp/opl/draft.pdf'];
    deps.projectContextRefs = [
      {
        path: '/tmp/opl/docs/protocol.md',
        name: 'protocol.md',
        relativePath: 'docs/protocol.md',
        isFile: true,
      },
    ];

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await result.current.handleSend();
    });

    const payload = mocks.createConversation.mock.calls[0][0];
    expect(payload.extra.default_files).toEqual(['/tmp/opl/draft.pdf']);
    expect(payload.extra.project_context_refs).toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem('acp_initial_message_conversation-1') || '{}').files).toEqual([
      '/tmp/opl/docs/protocol.md',
      '/tmp/opl/draft.pdf',
    ]);
  });
});

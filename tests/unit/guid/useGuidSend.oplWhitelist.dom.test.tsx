import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidSendDeps } from '@/renderer/pages/guid/hooks/useGuidSend';
import { useGuidSend } from '@/renderer/pages/guid/hooks/useGuidSend';
import { resolveOplActiveShortcut } from '@/renderer/pages/guid/utils/activeShortcut';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  activatePackage: vi.fn(),
  navigate: vi.fn(),
  emit: vi.fn(),
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
    emit: mocks.emit,
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

function buildMcpServer(id: string, name: string, builtin = false) {
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
    builtin,
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
    activeShortcut: resolveOplActiveShortcut(
      'mas',
      buildPackageAppState('mas', { operational_ready: true, launch_allowed: true })
    ),
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
    availableMcpServers: [
      buildMcpServer('unknown-mcp', 'Unknown MCP'),
      buildMcpServer('cron', 'cron'),
      buildMcpServer('third-party-builtin', 'Third Party Builtin', true),
      buildMcpServer('aionui-team', 'AionUI Team'),
      buildMcpServer('safe-id', 'team_runtime'),
    ],
    selectedMcpServerIds: ['unknown-mcp', 'cron', 'third-party-builtin', 'aionui-team', 'safe-id'],
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
    appState: mocks.appState,
  };
}

function buildActivationAction(packageId: string, workspaceRequired = true) {
  return {
    action_id: 'agent_package_activate',
    action_ref: 'app_state.actions#agent_package_activate',
    payload: {
      package_id: packageId,
      ...(workspaceRequired ? { scope: 'workspace' } : {}),
    },
    required_payload_fields: workspaceRequired
      ? ['package_id', 'scope', 'target_workspace or target_quest']
      : ['package_id'],
    confirmation_required: false,
  };
}

function buildPackageAppState(packageId: string, status: Record<string, unknown> | null, workspaceRequired = true) {
  const shortcutIdByPackage: Record<string, string> = { mas: 'research', oma: 'oma' };
  return {
    agent_packages: {
      directory: {
        entries: [
          {
            package_id: packageId,
            display_name: packageId.toUpperCase(),
            package_role: 'standard_agent',
            installed: true,
            capability_metadata: {
              source: 'normalized_owner_manifest',
              required_skill_ids: packageId === 'mas' ? ['med-autoscience'] : ['opl-meta-agent'],
              optional_skill_refs: packageId === 'mas' ? ['officecli-docx'] : [],
            },
            home_shortcuts: [
              {
                shortcut_id: shortcutIdByPackage[packageId] ?? packageId,
                label_i18n: { 'zh-CN': packageId.toUpperCase(), 'en-US': packageId.toUpperCase() },
                default_visible: true,
                user_configurable: true,
                route: {
                  route_kind: 'agent_package_shortcut',
                  executor: 'codex_cli',
                  codex_visible_entry: packageId === 'mas' ? 'med-autoscience' : 'opl-meta-agent',
                },
              },
            ],
            package_version: '1.0.0',
            available_actions: [buildActivationAction(packageId, workspaceRequired)],
          },
        ],
      },
      status_index: {
        packages: status ? { [packageId]: { package_id: packageId, ...status } } : {},
        home_shortcut_preferences: [
          {
            package_id: packageId,
            shortcut_id: shortcutIdByPackage[packageId] ?? packageId,
            visible: true,
            sort_order: 0,
            source: 'default',
            installed: true,
          },
        ],
      },
    },
  };
}

describe('useGuidSend OPL ordinary capability policy', () => {
  beforeEach(() => {
    mocks.createConversation.mockReset();
    mocks.createConversation.mockResolvedValue({ id: 'conversation-1' });
    mocks.activatePackage.mockReset();
    mocks.navigate.mockReset();
    mocks.emit.mockReset();
    mocks.appState = buildPackageAppState('mas', { operational_ready: true, launch_allowed: true });
    mocks.messageError.mockReset();
    sessionStorage.clear();
  });

  it('creates a projectless ordinary Codex conversation without an Agent Package or workspace', async () => {
    const deps = buildDeps();
    deps.dir = '';
    deps.selectedAgentInfo = undefined;
    deps.is_presetAgent = false;
    deps.activeShortcut = null;
    deps.guidEnabledSkills = [];
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: 'acp',
        extra: expect.objectContaining({
          workspace: '',
          custom_workspace: false,
          opl_agent_package_invocation: undefined,
        }),
      })
    );
    expect(mocks.emit).toHaveBeenCalledWith('chat.history.refresh', { id: 'conversation-1' });
  });

  it('preserves the Home draft when conversation creation returns no conversation', async () => {
    mocks.createConversation.mockResolvedValue(null);
    const deps = buildDeps();
    deps.files = ['/tmp/opl/draft.pdf'];
    const { result } = renderHook(() => useGuidSend(deps));

    act(() => result.current.sendMessageHandler());

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('conversation.createFailed'));
    expect(deps.setInput).not.toHaveBeenCalled();
    expect(deps.setFiles).not.toHaveBeenCalled();
    expect(deps.setDir).not.toHaveBeenCalled();
  });

  it('preserves the Home draft when conversation creation rejects', async () => {
    mocks.createConversation.mockRejectedValue(new Error('create rejected'));
    const deps = buildDeps();
    deps.files = ['/tmp/opl/draft.pdf'];
    const { result } = renderHook(() => useGuidSend(deps));

    act(() => result.current.sendMessageHandler());

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalled());
    expect(deps.setInput).not.toHaveBeenCalled();
    expect(deps.setFiles).not.toHaveBeenCalled();
    expect(deps.setDir).not.toHaveBeenCalled();
  });

  it('consumes only the accepted Home snapshot and keeps post-submit input', async () => {
    const deps = buildDeps();
    deps.files = ['/tmp/opl/sent.pdf'];
    const { result } = renderHook(() => useGuidSend(deps));

    act(() => result.current.sendMessageHandler());

    await waitFor(() => expect(deps.setInput).toHaveBeenCalledTimes(1));
    const updateInput = vi.mocked(deps.setInput).mock.calls[0][0] as (current: string) => string;
    const updateFiles = vi.mocked(deps.setFiles).mock.calls[0][0] as (current: string[]) => string[];
    const updateDir = vi.mocked(deps.setDir).mock.calls[0][0] as (current: string) => string;

    expect(updateInput('hello')).toBe('');
    expect(updateInput('typed while creating')).toBe('typed while creating');
    expect(updateFiles(['/tmp/opl/sent.pdf', '/tmp/opl/new.pdf'])).toEqual(['/tmp/opl/new.pdf']);
    expect(updateDir('/tmp/opl')).toBe('');
    expect(updateDir('/tmp/other')).toBe('/tmp/other');
  });

  it('preserves configured MCP servers while filtering forbidden Team MCP servers', async () => {
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
    expect(payload.extra.selected_mcp_server_ids).toEqual(['unknown-mcp', 'cron']);
    expect(payload.extra.selected_session_mcp_servers).toEqual([
      {
        id: 'third-party-builtin',
        name: 'Third Party Builtin',
        transport: { type: 'stdio', command: 'echo' },
      },
    ]);
    expect(payload.extra.opl_agent_package_invocation).toEqual({
      route_kind: 'agent_package_shortcut',
      executor: 'codex_cli',
      package_id: 'mas',
      shortcut_id: 'research',
      codex_visible_entry: 'med-autoscience',
      required_skill_ids: ['med-autoscience'],
      source: 'opl_app_home',
    });
    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(payload.extra.opl_agent_package_activation).toBeUndefined();
    expect(payload.extra.opl_assistant_route).toBeUndefined();
    expect(payload.extra.pending_config_options).toEqual({ reasoning_effort: 'max' });
  });

  it('launches a user-visible non-default OMA shortcut without depending on default visibility', async () => {
    mocks.appState = buildPackageAppState('oma', { operational_ready: true, launch_allowed: true });
    const deps = buildDeps();
    deps.activeShortcut = resolveOplActiveShortcut('oma', mocks.appState);
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
    expect(mocks.activatePackage).not.toHaveBeenCalled();
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
    const blockedMessage = mocks.messageError.mock.calls[0][0];
    expect(blockedMessage).toMatchObject({ className: 'opl-agent-package-launch-blocked' });
    expect(blockedMessage.content.props['data-testid']).toBe('opl-agent-package-launch-blocked');
    expect(blockedMessage.content.props['data-opl-package-id']).toBe('mas');
    expect(blockedMessage.content.props['data-opl-block-reason']).toBe('package_not_installed');
    expect(blockedMessage.content.props['data-opl-repair-actions']).toBe('status,doctor,repair');
    expect(blockedMessage.content.props.children).toContain('package_not_installed');
  });

  it('blocks selected Package launch when fresh capability metadata is absent', async () => {
    mocks.appState = buildPackageAppState('mas', { operational_ready: true, launch_allowed: true });
    delete mocks.appState.agent_packages.directory.entries[0].capability_metadata;
    const deps = buildDeps();
    deps.activeShortcut = resolveOplActiveShortcut('mas', mocks.appState);

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(deps.resolvePresetRulesAndSkills).not.toHaveBeenCalled();
    const blockedMessage = mocks.messageError.mock.calls[0][0];
    expect(blockedMessage.content.props['data-opl-package-id']).toBe('mas');
    expect(blockedMessage.content.props['data-opl-block-reason']).toBe('capability_metadata_missing');
  });

  it('continues package launch while its Framework status entry is still loading', async () => {
    mocks.appState = buildPackageAppState('mas', null);
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(deps.resolvePresetRulesAndSkills).toHaveBeenCalledTimes(1);
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('creates a workspace conversation without pre-activating a scope-required package', async () => {
    mocks.appState = buildPackageAppState('mas', {
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'scope_materialization_scope_required',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
    });
    const { result } = renderHook(() => useGuidSend(buildDeps()));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0].extra.workspace).toBe('/tmp/opl');
  });

  it('creates a projectless professional-agent conversation without pre-activation', async () => {
    const deps = buildDeps();
    deps.dir = '';
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0].extra.workspace).toBe('');
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('does not execute a package-id-only projected activation from Home', async () => {
    mocks.appState = buildPackageAppState('mas', { operational_ready: true, launch_allowed: true }, false);
    const deps = buildDeps();
    deps.dir = '';
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0].extra.workspace).toBe('');
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('does not pre-activate live_verification_deferred before creating the conversation', async () => {
    mocks.appState = buildPackageAppState(
      'mas',
      {
        operational_ready: false,
        launch_allowed: false,
        launch_blocked_reason: 'live_verification_deferred',
      },
      false
    );
    const deps = buildDeps();
    deps.dir = '';
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('ignores a legacy projected workspace target when creating a projectless conversation', async () => {
    const deps = buildDeps();
    deps.dir = '';
    const baseActivationAction = buildActivationAction('mas');
    const activationAction = {
      ...baseActivationAction,
      payload: {
        ...baseActivationAction.payload,
        target_workspace: '/Users/example/global-workspace',
      },
    };
    mocks.appState = {
      agent_packages: {
        directory: {
          entries: [{ package_id: 'mas', available_actions: [activationAction] }],
        },
      },
    };
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0].extra.workspace).toBe('');
    expect(mocks.createConversation.mock.calls[0][0].extra.opl_agent_package_activation).toBeUndefined();
  });

  it('shows a localized Framework blocked verdict without creating or enqueueing a conversation', async () => {
    mocks.appState = buildPackageAppState('mas', {
      operational_ready: false,
      launch_allowed: false,
      launch_blocked_reason: 'package_disabled',
      allowed_when_blocked: ['status', 'doctor', 'repair'],
    });
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    act(() => result.current.sendMessageHandler());
    await waitFor(() => expect(mocks.messageError).toHaveBeenCalled());

    expect(mocks.activatePackage).not.toHaveBeenCalled();
    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(deps.resolvePresetRulesAndSkills).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
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

  it('sends only explicit session attachments and deduplicates them in insertion order', async () => {
    const deps = buildDeps();
    deps.files = ['/tmp/opl/draft.pdf', '/tmp/opl/evidence.csv', '/tmp/opl/draft.pdf'];

    const { result } = renderHook(() => useGuidSend(deps));
    await act(async () => {
      await result.current.handleSend();
    });

    const payload = mocks.createConversation.mock.calls[0][0];
    expect(payload.extra.default_files).toEqual(['/tmp/opl/draft.pdf', '/tmp/opl/evidence.csv']);
    expect(payload.extra.project_context_refs).toBeUndefined();
    expect(JSON.parse(sessionStorage.getItem('acp_initial_message_conversation-1') || '{}').files).toEqual([
      '/tmp/opl/draft.pdf',
      '/tmp/opl/evidence.csv',
    ]);
  });
});

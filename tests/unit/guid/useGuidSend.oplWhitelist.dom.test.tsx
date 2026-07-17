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

function buildPackageUseBinding(packageId: string, targetWorkspace: string) {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    root_package: {
      package_id: packageId,
      package_version: '1.0.0',
    },
    scope: 'workspace',
    target_root: targetWorkspace,
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
  return {
    agent_packages: {
      directory: {
        entries: [
          {
            package_id: packageId,
            package_version: '1.0.0',
            available_actions: [buildActivationAction(packageId, workspaceRequired)],
          },
        ],
      },
      status_index: {
        packages: status ? { [packageId]: { package_id: packageId, ...status } } : {},
      },
    },
  };
}

function buildActivationExecution(payloadRefsOnlyJson: Record<string, unknown>) {
  const packageId = String(payloadRefsOnlyJson.package_id);
  const targetWorkspace =
    typeof payloadRefsOnlyJson.target_workspace === 'string' ? payloadRefsOnlyJson.target_workspace : null;
  const scope = typeof payloadRefsOnlyJson.scope === 'string' ? payloadRefsOnlyJson.scope : null;
  return {
    ok: true,
    parsed: {
      app_action_execution: {
        surface_kind: 'opl_app_action_execution.v1',
        action_id: 'agent_package_activate',
        dry_run: false,
        result: {
          opl_agent_package_activation: {
            surface_kind: 'opl_agent_package_activation',
            status: 'activated',
            dry_run: false,
            writes_performed: true,
            package_id: packageId,
            operational_ready: true,
            launch_allowed: true,
            launch_blocked_reason: null,
            package_lock: {
              package_id: packageId,
              package_version: '1.0.0',
            },
            ...(targetWorkspace
              ? {
                  materialization_readiness: {
                    status: 'current',
                    scope,
                    target_root: targetWorkspace,
                  },
                  scope_materializations: [
                    {
                      scope,
                      target_root: targetWorkspace,
                    },
                  ],
                  package_use_binding: buildPackageUseBinding(packageId, targetWorkspace),
                }
              : {}),
          },
        },
      },
    },
  };
}

function activationFromResponse(response: ReturnType<typeof buildActivationExecution>): Record<string, unknown> {
  return response.parsed.app_action_execution.result.opl_agent_package_activation;
}

describe('useGuidSend OPL ordinary capability whitelist', () => {
  beforeEach(() => {
    mocks.createConversation.mockReset();
    mocks.createConversation.mockResolvedValue({ id: 'conversation-1' });
    mocks.activatePackage.mockReset();
    mocks.activatePackage.mockImplementation(
      ({ payloadRefsOnlyJson }: { payloadRefsOnlyJson: Record<string, unknown> }) =>
        Promise.resolve(buildActivationExecution(payloadRefsOnlyJson))
    );
    mocks.navigate.mockReset();
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
    expect(activationRequest.payloadRefsOnlyJson).not.toHaveProperty('use_boundary_id');
    expect(payload.extra.opl_agent_package_activation).toMatchObject({
      action_id: 'agent_package_activate',
      package_id: 'mas',
      package_version: '1.0.0',
      scope: 'workspace',
      target_workspace: '/tmp/opl',
      launch_allowed: true,
      use_binding: {
        scope: 'workspace',
        target_root: '/tmp/opl',
        root_package: { package_id: 'mas', package_version: '1.0.0' },
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
    mocks.appState = buildPackageAppState('oma', { operational_ready: true, launch_allowed: true });
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
    const blockedMessage = mocks.messageError.mock.calls[0][0];
    expect(blockedMessage).toMatchObject({ className: 'opl-agent-package-launch-blocked' });
    expect(blockedMessage.content.props['data-testid']).toBe('opl-agent-package-launch-blocked');
    expect(blockedMessage.content.props['data-opl-package-id']).toBe('mas');
    expect(blockedMessage.content.props['data-opl-block-reason']).toBe('package_not_installed');
    expect(blockedMessage.content.props['data-opl-repair-actions']).toBe('status,doctor,repair');
    expect(blockedMessage.content.props.children).toContain('package_not_installed');
  });

  it('continues package launch while its Framework status entry is still loading', async () => {
    mocks.appState = buildPackageAppState('mas', null);
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(deps.resolvePresetRulesAndSkills).toHaveBeenCalledTimes(1);
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('activates a scope-required package before creating its workspace conversation', async () => {
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

  it('activates a package-id-only projected action without a Workspace', async () => {
    mocks.appState = buildPackageAppState('mas', { operational_ready: true, launch_allowed: true }, false);
    const deps = buildDeps();
    deps.dir = '';
    const { result } = renderHook(() => useGuidSend(deps));

    await act(async () => {
      await result.current.handleSend();
    });

    expect(mocks.activatePackage).toHaveBeenCalledWith({
      actionId: 'agent_package_activate',
      dryRun: false,
      payloadRefsOnlyJson: { package_id: 'mas' },
    });
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation.mock.calls[0][0].extra.workspace).toBe('');
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('JIT activates live_verification_deferred instead of pre-blocking the package', async () => {
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

    expect(mocks.activatePackage).toHaveBeenCalledTimes(1);
    expect(mocks.createConversation).toHaveBeenCalledTimes(1);
    expect(mocks.messageError).not.toHaveBeenCalled();
  });

  it('shows a localized invalid-activation error before creating a conversation', async () => {
    mocks.activatePackage.mockResolvedValue({
      ok: true,
      parsed: {
        app_action_execution: {
          action_id: 'unexpected_action',
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
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    act(() => result.current.sendMessageHandler());
    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('guid.home.packageLaunchErrors.invalid'));

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(deps.resolvePresetRulesAndSkills).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it.each([
    {
      caseId: 'selected package drift',
      errorKey: 'guid.home.packageLaunchErrors.selectionMismatch',
      mutate: (activation: Record<string, unknown>) => {
        activation.package_id = 'foreign-package';
      },
    },
    {
      caseId: 'installed version drift',
      errorKey: 'guid.home.packageLaunchErrors.versionMismatch',
      mutate: (activation: Record<string, unknown>) => {
        const lock = activation.package_lock as Record<string, unknown>;
        lock.package_version = '9.9.9';
        const binding = activation.package_use_binding as Record<string, unknown>;
        const rootPackage = binding.root_package as Record<string, unknown>;
        rootPackage.package_version = '9.9.9';
      },
    },
    {
      caseId: 'target-root drift',
      errorKey: 'guid.home.packageLaunchErrors.targetMismatch',
      mutate: (activation: Record<string, unknown>) => {
        const binding = activation.package_use_binding as Record<string, unknown>;
        binding.target_root = '/tmp/foreign';
      },
    },
  ])(
    'shows a localized $caseId error before conversation creation or initial-message enqueue',
    async ({ mutate, errorKey }) => {
      mocks.activatePackage.mockImplementation(
        ({ payloadRefsOnlyJson }: { payloadRefsOnlyJson: Record<string, unknown> }) => {
          const response = buildActivationExecution(payloadRefsOnlyJson);
          mutate(activationFromResponse(response));
          return Promise.resolve(response);
        }
      );
      const deps = buildDeps();
      const { result } = renderHook(() => useGuidSend(deps));

      act(() => result.current.sendMessageHandler());
      await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith(errorKey));

      expect(mocks.createConversation).not.toHaveBeenCalled();
      expect(deps.resolvePresetRulesAndSkills).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    }
  );

  it('shows a localized Framework blocked verdict without creating or enqueueing a conversation', async () => {
    mocks.activatePackage.mockImplementation(
      ({ payloadRefsOnlyJson }: { payloadRefsOnlyJson: Record<string, unknown> }) => {
        const response = buildActivationExecution(payloadRefsOnlyJson);
        const activation = activationFromResponse(response);
        activation.status = 'blocked';
        activation.writes_performed = false;
        activation.operational_ready = false;
        activation.launch_allowed = false;
        activation.launch_blocked_reason = 'package_disabled';
        activation.use_receipt_ref = null;
        activation.package_use_binding = null;
        return Promise.resolve(response);
      }
    );
    const deps = buildDeps();
    const { result } = renderHook(() => useGuidSend(deps));

    act(() => result.current.sendMessageHandler());
    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('guid.home.packageLaunchErrors.blocked'));

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

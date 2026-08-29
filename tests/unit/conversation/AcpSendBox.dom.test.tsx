import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AcpSendBox from '@/renderer/pages/conversation/platforms/acp/AcpSendBox';
import type { UseAcpMessageReturn } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';
import type { EnsureConversationRuntimeResponse } from '@/common/types/platform/acpTypes';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

let isMobileLayout = false;

const acpModelInfoMocks = vi.hoisted(() => ({
  selectModel: vi.fn(),
  selectAutoModel: vi.fn(),
  setConfigOption: vi.fn(),
  configSet: vi.fn(),
  configSetLocal: vi.fn(),
  getMode: vi.fn(),
  warmupConversation: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { invoke: vi.fn().mockResolvedValue([]) },
    },
    conversation: {
      stop: { invoke: vi.fn().mockResolvedValue(undefined) },
      warmup: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    acpConversation: {
      sendMessage: { invoke: vi.fn().mockResolvedValue({ msg_id: 'message-id' }) },
      getMode: { invoke: acpModelInfoMocks.getMode },
      setMode: { invoke: vi.fn().mockResolvedValue(undefined) },
      getModel: { invoke: vi.fn().mockResolvedValue(null) },
      setModel: { invoke: vi.fn().mockResolvedValue(undefined) },
      getConfigOptions: { invoke: vi.fn().mockResolvedValue({ config_options: [] }) },
      setConfigOption: { invoke: vi.fn().mockResolvedValue({ confirmation: 'observed', config_options: [] }) },
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => undefined),
    set: acpModelInfoMocks.configSet,
    setLocal: acpModelInfoMocks.configSetLocal,
    subscribe: vi.fn(() => vi.fn()),
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key),
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div data-testid='agent-mode-selector' />,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: ({ backend, waitForWarmup }: { backend?: string; waitForWarmup?: boolean }) => (
    <button
      type='button'
      data-testid='acp-model-selector'
      data-backend={backend}
      data-wait-for-warmup={waitForWarmup ? 'true' : 'false'}
    >
      Model
    </button>
  ),
}));

vi.mock('@/renderer/components/chat/MobileActionSheet', () => ({
  default: ({
    open,
    entries,
  }: {
    open: boolean;
    entries: Array<{
      key: string;
      label: React.ReactNode;
      meta?: React.ReactNode;
      trailingIcon?: React.ReactNode;
      dividerBefore?: boolean;
      disabled?: boolean;
      submenu?: {
        options: Array<{ key: string; label: React.ReactNode; active?: boolean; disabled?: boolean }>;
        onSelect: (key: string) => void;
      };
      onClick?: () => void;
    }>;
  }) =>
    open ? (
      <div data-testid='mobile-action-sheet'>
        {entries.map((entry) => (
          <div key={entry.key} data-mobile-entry-key={entry.key}>
            {entry.dividerBefore && <div role='separator' data-testid={`mobile-action-sheet-divider-${entry.key}`} />}
            <button
              type='button'
              data-testid={`mobile-action-sheet-${entry.key}`}
              data-divider-before={entry.dividerBefore ? 'true' : 'false'}
              disabled={entry.disabled}
              onClick={entry.onClick}
            >
              {entry.label}
              {entry.meta ? ` ${entry.meta}` : ''}
              {entry.trailingIcon && (
                <span data-testid={`mobile-action-sheet-${entry.key}-trailing-icon`}>{entry.trailingIcon}</span>
              )}
            </button>
            {entry.submenu?.options.map((option) => (
              <button
                key={`${entry.key}:${option.key}`}
                type='button'
                data-testid={`mobile-action-sheet-option-${entry.key}-${option.key}`}
                data-active={option.active ? 'true' : 'false'}
                disabled={option.disabled}
                onClick={() => entry.submenu?.onSelect(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    ) : null,
  useAttachEntry: () => ({
    entries: [{ key: 'attach', label: 'Add files', onClick: vi.fn() }],
    hiddenFileInput: null,
  }),
}));

vi.mock('@/renderer/components/chat/SendBox', () => ({
  default: ({
    prefix,
    rightTools,
    onMobilePlusClick,
  }: {
    prefix?: React.ReactNode;
    rightTools?: React.ReactNode;
    onMobilePlusClick?: () => void;
  }) => (
    <div data-testid='sendbox'>
      {prefix ? <div data-testid='sendbox-prefix'>{prefix}</div> : null}
      {rightTools ? <div data-testid='sendbox-right-tools'>{rightTools}</div> : null}
      {onMobilePlusClick ? (
        <button data-testid='mobile-plus-button' type='button' onClick={onMobilePlusClick}>
          more
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({
  default: () => <div data-testid='command-queue-panel' />,
}));

vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({
  default: ({ running }: { running?: boolean }) => (
    <div data-testid='thought-display' data-running={running ? 'true' : 'false'} />
  ),
}));

vi.mock('@/renderer/components/media/FileAttachButton', () => ({
  default: () => <div data-testid='file-attach-button' />,
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  default: () => <div data-testid='file-preview' />,
}));

vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='horizontal-file-list'>{children}</div>,
}));

vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({ checkAndUpdateTitle: vi.fn() }),
}));

vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  createSetUploadFile: () => vi.fn(),
  getSendBoxDraftHook: () => () => ({
    data: { atPath: [], uploadFile: [], content: '' },
    mutate: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  createSetUploadFile: () => vi.fn(),
  useSendBoxFiles: () => ({ handleFilesAdded: vi.fn(), clearFiles: vi.fn() }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: isMobileLayout }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    loadedSkills: ['arbitrary-skill'],
    loadedMcpServers: ['raw-mcp'],
    loadedMcpStatuses: [{ id: 'raw-mcp', name: 'Raw MCP', status: 'loaded' }],
  }),
}));

vi.mock('@/renderer/hooks/agent/useAcpModelInfo', () => ({
  useAcpModelInfo: () => ({
    model_info: {
      current_model_id: 'gpt-5.4',
      current_model_label: 'GPT-5.4',
      available_models: [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
        { id: 'gpt-5.4', label: 'GPT-5.4' },
      ],
    },
    canSwitch: true,
    selectModel: acpModelInfoMocks.selectModel,
    selectAutoModel: acpModelInfoMocks.selectAutoModel,
    selectReasoningEffort: vi.fn().mockResolvedValue(undefined),
    thoughtLevel: {
      id: 'reasoning_effort',
      category: 'thought_level',
      currentValue: 'high',
      options: [
        { value: 'high', label: 'High' },
        { value: 'xhigh', label: 'Extra high' },
        { value: 'max', label: 'Max' },
        { value: 'ultra', label: 'Ultra' },
      ],
    },
    setStatus: { state: 'idle' },
    setConfigOption: acpModelInfoMocks.setConfigOption,
  }),
}));

vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: () => ({ openFileSelector: vi.fn(), onSlashBuiltinCommand: vi.fn() }),
}));

vi.mock('@/renderer/hooks/ui/useLatestRef', () => ({
  useLatestRef: (value: unknown) => ({ current: value }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  shouldEnqueueConversationCommand: () => false,
  useConversationCommandQueue: () => ({
    items: [],
    isPaused: false,
    isInteractionLocked: false,
    hasPendingCommands: false,
    enqueue: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    reorder: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    lockInteraction: vi.fn(),
    unlockInteraction: vi.fn(),
    resetActiveExecution: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ setSendBoxHandler: vi.fn() }),
}));

vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: () => null,
}));

vi.mock('@/renderer/services/FileService', () => ({
  allSupportedExts: [],
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
  useAddEventListener: vi.fn(),
}));

vi.mock('@/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: (_current: unknown[], selected: unknown[]) => selected,
}));

vi.mock('@/renderer/utils/file/messageFiles', () => ({
  collectChatFileRefs: () => [],
  splitChatFileRefs: () => ({ uploadFiles: [], atPath: [] }),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage', () => ({
  useAcpInitialMessage: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/warmupConversation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/pages/conversation/utils/warmupConversation')>();
  return {
    ...actual,
    warmupConversation: acpModelInfoMocks.warmupConversation,
  };
});

const messageState = (): UseAcpMessageReturn =>
  ({
    running: false,
    hasHydratedRunningState: true,
    aiProcessing: false,
    setAiProcessing: vi.fn(),
    resetState: vi.fn(),
    hasThinkingMessage: false,
    slashCommands: [],
    fetchSlashCommands: vi.fn(),
  }) as unknown as UseAcpMessageReturn;

describe('AcpSendBox OPL fixed Codex mode surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileLayout = false;
    acpModelInfoMocks.selectAutoModel.mockResolvedValue(undefined);
    acpModelInfoMocks.setConfigOption.mockResolvedValue([]);
    acpModelInfoMocks.configSet.mockResolvedValue(undefined);
    acpModelInfoMocks.getMode.mockResolvedValue({ initialized: true, mode: 'full-access' });
    acpModelInfoMocks.warmupConversation.mockResolvedValue(undefined);
  });

  it('shows the permission mode selector for ordinary Codex conversations', () => {
    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    expect(screen.getByTestId('sendbox')).toBeInTheDocument();
    const decisionControls = screen.getByTestId('acp-sendbox-decision-controls');
    expect(within(decisionControls).getByTestId('acp-model-selector')).toHaveAttribute('data-backend', 'codex');
    expect(within(decisionControls).getByTestId('acp-model-selector')).toHaveAttribute('data-wait-for-warmup', 'true');
    expect(within(decisionControls).getByTestId('agent-mode-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-conversation-model-status')).not.toBeInTheDocument();
  });

  it('keeps the permission mode selector for non-Codex ACP conversations', () => {
    render(<AcpSendBox conversation_id='claude-conversation' backend='claude' messageState={messageState()} />);

    expect(screen.getByTestId('acp-model-selector')).toHaveAttribute('data-backend', 'claude');
    expect(screen.getByTestId('agent-mode-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-conversation-model-status')).not.toBeInTheDocument();
  });

  it('keeps only the active capability in the composer context strip', () => {
    render(
      <AcpSendBox
        conversation_id='codex-conversation'
        backend='codex'
        workspacePath='/workspace/research'
        branch='codex/context'
        activeCapabilityLabel='Research'
        messageState={messageState()}
      />
    );

    expect(screen.getByTestId('conversation-composer-context-strip')).toBeInTheDocument();
    expect(screen.getByTestId('composer-active-capability')).toHaveTextContent('guid.home.activeCapability');
    expect(screen.queryByTestId('composer-project-context')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composer-projectless-context')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composer-local-context')).not.toBeInTheDocument();
    expect(screen.queryByTestId('composer-branch-context')).not.toBeInTheDocument();
  });

  it('does not reserve context-strip space without an active capability', () => {
    render(
      <AcpSendBox
        conversation_id='codex-conversation'
        backend='codex'
        workspacePath='/workspace/research'
        branch='codex/context'
        messageState={messageState()}
      />
    );

    expect(screen.queryByTestId('conversation-composer-context-strip')).not.toBeInTheDocument();
  });

  it('shows the mobile permission action and live non-forbidden Skills for ordinary Codex conversations', () => {
    isMobileLayout = true;

    render(
      <AcpSendBox
        conversation_id='codex-conversation'
        backend='codex'
        activeCapabilityLabel='Research'
        messageState={messageState()}
      />
    );

    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    expect(screen.getByTestId('mobile-action-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-attach')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-permission')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-active-capability')).toHaveTextContent('guid.home.activeCapability');
    expect(screen.getByTestId('mobile-action-sheet-skills')).toHaveTextContent('guid.context.skillsGroup 1');
    expect(screen.getByTestId('mobile-action-sheet-option-skills-arbitrary-skill')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-action-sheet-mcp')).not.toBeInTheDocument();
    expect(screen.queryByTestId('acp-model-selector')).not.toBeInTheDocument();
  });

  it('shows App model menu semantics in the mobile ACP action sheet', () => {
    isMobileLayout = true;

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    const sheet = screen.getByTestId('mobile-action-sheet');
    const entryOrder = Array.from(sheet.querySelectorAll<HTMLElement>('[data-mobile-entry-key]')).map(
      (entry) => entry.dataset.mobileEntryKey
    );
    const modelEntryIndex = entryOrder.indexOf('model');
    expect(entryOrder.slice(modelEntryIndex, modelEntryIndex + 3)).toEqual([
      'model',
      'reasoning',
      'reset-session-defaults',
    ]);
    expect(screen.queryByTestId('mobile-action-sheet-auto')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-model')).toHaveTextContent('Model');
    expect(screen.getByTestId('mobile-action-sheet-reasoning')).toHaveTextContent('Reasoning');
    expect(screen.getByTestId('mobile-action-sheet-option-model-__auto')).toHaveTextContent('Auto (recommended)');
    expect(
      Array.from(
        screen
          .getByTestId('mobile-action-sheet-model')
          .parentElement?.querySelectorAll<HTMLElement>('[data-testid^="mobile-action-sheet-option-model-"]') ?? []
      ).map((option) => option.dataset.testid)
    ).toEqual([
      'mobile-action-sheet-option-model-__auto',
      'mobile-action-sheet-option-model-gpt-5.6-sol',
      'mobile-action-sheet-option-model-gpt-5.4',
    ]);
    expect(screen.queryByTestId('mobile-action-sheet-intelligence-enhancement')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-action-sheet-option-intelligence-enhancement-enable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-action-sheet-option-intelligence-enhancement-disable')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-option-reasoning-max')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-action-sheet-option-reasoning-ultra')).toBeInTheDocument();
    const resetEntry = screen.getByTestId('mobile-action-sheet-reset-session-defaults');
    expect(resetEntry).toHaveAttribute('data-divider-before', 'true');
    expect(screen.getByTestId('mobile-action-sheet-divider-reset-session-defaults')).toHaveAttribute(
      'role',
      'separator'
    );
    expect(
      screen
        .getByTestId('mobile-action-sheet-reset-session-defaults-trailing-icon')
        .querySelector('[data-opl-icon="refresh"]')
    ).not.toBeNull();
  });

  it('uses the prepared runtime snapshot without issuing a mode GET when the mobile sheet opens', async () => {
    isMobileLayout = true;
    const prepared: EnsureConversationRuntimeResponse = {
      recovered: true,
      config_options: [
        {
          id: 'mode',
          category: 'mode',
          option_type: 'select',
          current_value: 'full-access',
          options: [{ value: 'full-access', label: 'Full access' }],
        },
      ],
      runtime: {
        state: 'idle',
        can_send_message: true,
        has_task: false,
        is_processing: false,
        pending_confirmations: 0,
        turn_id: null,
      },
    };
    acpModelInfoMocks.warmupConversation.mockResolvedValue(prepared);

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);
    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    await waitFor(() => expect(acpModelInfoMocks.warmupConversation).toHaveBeenCalledWith('codex-conversation'));
    await waitFor(() =>
      expect(screen.getByTestId('mobile-action-sheet-option-permission-full-access')).toHaveAttribute(
        'data-active',
        'true'
      )
    );
    expect(acpModelInfoMocks.getMode).not.toHaveBeenCalled();
  });

  it('uses a prepared mobile mode that is absent from the cached and static catalogs', async () => {
    isMobileLayout = true;
    const prepared: EnsureConversationRuntimeResponse = {
      recovered: true,
      config_options: [
        {
          id: 'mode',
          category: 'mode',
          option_type: 'select',
          current_value: 'runtime-agent',
          options: [{ value: 'runtime-agent', label: 'Runtime Agent' }],
        },
      ],
      runtime: {
        state: 'idle',
        can_send_message: true,
        has_task: false,
        is_processing: false,
        pending_confirmations: 0,
        turn_id: null,
      },
    };
    acpModelInfoMocks.warmupConversation.mockResolvedValue(prepared);
    acpModelInfoMocks.getMode.mockRejectedValue(new Error('session mode is not initialized'));

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);
    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    await waitFor(() =>
      expect(screen.getByTestId('mobile-action-sheet-option-session-modes-mode-runtime-agent')).toHaveAttribute(
        'data-active',
        'true'
      )
    );
    expect(screen.queryByTestId('mobile-action-sheet-option-permission-full-access')).not.toBeInTheDocument();
    expect(acpModelInfoMocks.getMode).not.toHaveBeenCalled();
  });

  it('uses the live mode endpoint when the prepared mobile snapshot has no mode', async () => {
    isMobileLayout = true;
    const prepared: EnsureConversationRuntimeResponse = {
      recovered: true,
      config_options: [],
      runtime: {
        state: 'idle',
        can_send_message: true,
        has_task: false,
        is_processing: false,
        pending_confirmations: 0,
        turn_id: null,
      },
    };
    acpModelInfoMocks.warmupConversation.mockResolvedValue(prepared);
    acpModelInfoMocks.getMode.mockResolvedValue({ initialized: true, mode: 'full-access' });

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);
    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    await waitFor(() =>
      expect(screen.getByTestId('mobile-action-sheet-option-permission-full-access')).toHaveAttribute(
        'data-active',
        'true'
      )
    );
    expect(acpModelInfoMocks.getMode).toHaveBeenCalledWith({ conversation_id: 'codex-conversation' });
  });

  it('delegates model Auto and Reset to the shared Auto action', () => {
    isMobileLayout = true;

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-model-__auto'));
    fireEvent.click(screen.getByTestId('mobile-action-sheet-reset-session-defaults'));

    expect(acpModelInfoMocks.selectAutoModel).toHaveBeenCalledTimes(2);
    expect(acpModelInfoMocks.selectModel).not.toHaveBeenCalled();
    expect(acpModelInfoMocks.setConfigOption).not.toHaveBeenCalled();
  });

  it('keeps a visible elapsed-time thinking indicator while an ACP request is pending', () => {
    render(
      <AcpSendBox
        conversation_id='codex-conversation'
        backend='codex'
        messageState={{ ...messageState(), aiProcessing: true }}
      />
    );

    expect(screen.getByTestId('thought-display')).toHaveAttribute('data-running', 'true');
  });

  it('keeps the elapsed-time indicator visible while the backend is running even after thinking starts', () => {
    render(
      <AcpSendBox
        conversation_id='codex-conversation'
        backend='codex'
        messageState={{ ...messageState(), running: true, hasThinkingMessage: true }}
      />
    );

    expect(screen.getByTestId('thought-display')).toHaveAttribute('data-running', 'true');
  });
});

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AcpSendBox from '@/renderer/pages/conversation/platforms/acp/AcpSendBox';
import type { UseAcpMessageReturn } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

let isMobileLayout = false;
let intelligencePreference: boolean | undefined;

const acpModelInfoMocks = vi.hoisted(() => ({
  selectModel: vi.fn(),
  selectAutoModel: vi.fn(),
  setConfigOption: vi.fn(),
  executeAction: vi.fn(),
  configSet: vi.fn(),
  configSetLocal: vi.fn(),
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
      getMode: { invoke: vi.fn().mockResolvedValue({ initialized: true, mode: 'full-access' }) },
      setMode: { invoke: vi.fn().mockResolvedValue(undefined) },
      getModel: { invoke: vi.fn().mockResolvedValue(null) },
      setModel: { invoke: vi.fn().mockResolvedValue(undefined) },
      getConfigOptions: { invoke: vi.fn().mockResolvedValue({ config_options: [] }) },
      setConfigOption: { invoke: vi.fn().mockResolvedValue({ confirmation: 'observed', config_options: [] }) },
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
    oplRuntime: {
      executeAction: { invoke: acpModelInfoMocks.executeAction },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn((key: string) => {
      if (key === 'codex.oplFlowIntelligenceEnhancementMode') return intelligencePreference;
      return undefined;
    }),
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
      submenu?: {
        options: Array<{ key: string; label: React.ReactNode; active?: boolean }>;
        onSelect: (key: string) => void;
      };
      onClick?: () => void;
    }>;
  }) =>
    open ? (
      <div data-testid='mobile-action-sheet'>
        {entries.map((entry) => (
          <div key={entry.key}>
            <button type='button' data-testid={`mobile-action-sheet-${entry.key}`} onClick={entry.onClick}>
              {entry.label}
              {entry.meta ? ` ${entry.meta}` : ''}
            </button>
            {entry.submenu?.options.map((option) => (
              <button
                key={`${entry.key}:${option.key}`}
                type='button'
                data-testid={`mobile-action-sheet-option-${entry.key}-${option.key}`}
                data-active={option.active ? 'true' : 'false'}
                onClick={() => entry.submenu?.onSelect(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    ) : null,
  useAttachEntry: () => ({ entries: [], hiddenFileInput: null }),
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
  buildDisplayMessage: (input: string) => input,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage', () => ({
  useAcpInitialMessage: vi.fn(),
}));

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

const intelligenceStatusResult = (enabled: boolean) => ({
  ok: true,
  parsed: {
    app_action_execution: {
      result: {
        opl_flow_intelligence_enhancement: { enabled },
      },
    },
  },
});

describe('AcpSendBox OPL fixed Codex mode surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMobileLayout = false;
    intelligencePreference = undefined;
    acpModelInfoMocks.setConfigOption.mockResolvedValue([]);
    acpModelInfoMocks.executeAction.mockImplementation(({ actionId }: { actionId: string }) =>
      Promise.resolve(intelligenceStatusResult(actionId === 'intelligence_enhancement_status' ? false : true))
    );
    acpModelInfoMocks.configSet.mockResolvedValue(undefined);
  });

  it('hides the permission mode selector for ordinary Codex conversations', () => {
    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    expect(screen.getByTestId('sendbox')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-mode-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('opl-conversation-model-status')).not.toBeInTheDocument();
  });

  it('keeps the permission mode selector for non-Codex ACP conversations', () => {
    render(<AcpSendBox conversation_id='claude-conversation' backend='claude' messageState={messageState()} />);

    expect(screen.getByTestId('agent-mode-selector')).toBeInTheDocument();
    expect(screen.queryByTestId('opl-conversation-model-status')).not.toBeInTheDocument();
  });

  it('hides the mobile permission action for ordinary Codex conversations', () => {
    isMobileLayout = true;

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    expect(screen.getByTestId('mobile-action-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-action-sheet-permission')).not.toBeInTheDocument();
  });

  it('shows App model menu semantics in the mobile ACP action sheet', () => {
    isMobileLayout = true;

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    expect(screen.getByTestId('mobile-action-sheet-auto')).toHaveTextContent('Auto (recommended)');
    expect(screen.getByTestId('mobile-action-sheet-reasoning')).toHaveTextContent('Reasoning');
    expect(screen.getByTestId('mobile-action-sheet-model')).toHaveTextContent('Model');
    expect(screen.getByTestId('mobile-action-sheet-intelligence-enhancement')).toHaveTextContent(
      'Intelligence enhancement'
    );
    expect(screen.queryByTestId('mobile-action-sheet-option-model-__auto')).not.toBeInTheDocument();
  });

  it('refreshes intelligence enhancement status when opening the mobile action sheet', async () => {
    isMobileLayout = true;
    intelligencePreference = true;
    acpModelInfoMocks.executeAction.mockResolvedValueOnce(intelligenceStatusResult(false));

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));

    await waitFor(() => {
      expect(acpModelInfoMocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      });
      expect(acpModelInfoMocks.configSetLocal).toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', false);
    });
    await waitFor(() =>
      expect(screen.getByTestId('mobile-action-sheet-option-intelligence-enhancement-disable')).toHaveAttribute(
        'data-active',
        'true'
      )
    );
  });

  it('restores Auto as latest strongest model plus max reasoning from the mobile action sheet', async () => {
    isMobileLayout = true;

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));
    fireEvent.click(screen.getByTestId('mobile-action-sheet-auto'));

    expect(acpModelInfoMocks.selectAutoModel).toHaveBeenCalledTimes(1);
    expect(acpModelInfoMocks.selectModel).not.toHaveBeenCalled();
    await waitFor(() => expect(acpModelInfoMocks.setConfigOption).toHaveBeenCalledWith('reasoning_effort', 'max'));
  });

  it('runs the intelligence enhancement enable action and persists config from the mobile action sheet', async () => {
    isMobileLayout = true;
    intelligencePreference = false;

    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    fireEvent.click(screen.getByTestId('mobile-plus-button'));
    await waitFor(() =>
      expect(acpModelInfoMocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_status',
        dryRun: false,
      })
    );
    fireEvent.click(screen.getByTestId('mobile-action-sheet-option-intelligence-enhancement-enable'));

    await waitFor(() =>
      expect(acpModelInfoMocks.executeAction).toHaveBeenCalledWith({
        actionId: 'intelligence_enhancement_enable',
        dryRun: false,
      })
    );
    await waitFor(() =>
      expect(acpModelInfoMocks.configSet).toHaveBeenCalledWith('codex.oplFlowIntelligenceEnhancementMode', true)
    );
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

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AcpSendBox from '@/renderer/pages/conversation/platforms/acp/AcpSendBox';
import type { UseAcpMessageReturn } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

let isMobileLayout = false;

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
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
  },
}));

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
  default: ({ open, entries }: { open: boolean; entries: Array<{ key: string; label: string; meta?: string }> }) =>
    open ? (
      <div data-testid='mobile-action-sheet'>
        {entries.map((entry) => (
          <div key={entry.key} data-testid={`mobile-action-sheet-${entry.key}`}>
            {entry.label}
            {entry.meta ? ` ${entry.meta}` : ''}
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

describe('AcpSendBox OPL fixed Codex mode surface', () => {
  beforeEach(() => {
    isMobileLayout = false;
  });

  it('hides the permission mode selector for ordinary Codex conversations', () => {
    render(<AcpSendBox conversation_id='codex-conversation' backend='codex' messageState={messageState()} />);

    expect(screen.getByTestId('sendbox')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-mode-selector')).not.toBeInTheDocument();
    expect(screen.getByTestId('opl-conversation-model-status')).toHaveTextContent('Model: GPT-5.5');
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

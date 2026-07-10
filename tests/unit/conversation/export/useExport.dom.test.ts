import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(),
  getFileMetadata: vi.fn(),
  getConversationMessages: vi.fn(),
  getWorkspace: vi.fn(),
  createZip: vi.fn(),
  cancelZip: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: { getPath: { invoke: mocks.getPath } },
    database: { getConversationMessages: { invoke: mocks.getConversationMessages } },
    conversation: { getWorkspace: { invoke: mocks.getWorkspace } },
    dialog: { showOpen: { invoke: vi.fn() } },
    fs: {
      getFileMetadata: { invoke: mocks.getFileMetadata },
      createZip: { invoke: mocks.createZip },
      cancelZip: { invoke: mocks.cancelZip },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: mocks.messageSuccess,
    error: mocks.messageError,
    warning: mocks.messageWarning,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useExport } from '@/renderer/pages/conversation/GroupedHistory/hooks/useExport';

const conversation = {
  id: 'conv-1',
  name: 'Review topic',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: {
    backend: 'raw-provider-secret',
    runtime: { authority: 'must-not-export' },
  },
} as unknown as TChatConversation;

const messages = [
  {
    id: 'message-1',
    type: 'text',
    position: 'right',
    content: { content: 'Visible user text', providerTrace: 'must-not-export' },
    provider: { raw: 'must-not-export' },
  },
  {
    id: 'message-2',
    type: 'tool_call',
    position: 'left',
    content: { runtimeAuthority: 'must-not-export' },
  },
] as unknown as TMessage[];

const renderExport = (selectedConversationIds = new Set<string>()) => {
  const setSelectedConversationIds = vi.fn();
  const onBatchModeChange = vi.fn();
  const view = renderHook(() =>
    useExport({
      conversations: [conversation],
      selectedConversationIds,
      setSelectedConversationIds,
      onBatchModeChange,
    })
  );
  return { ...view, setSelectedConversationIds, onBatchModeChange };
};

const openSingleExport = async (result: ReturnType<typeof renderExport>['result']) => {
  act(() => result.current.handleExportConversation(conversation));
  await waitFor(() => expect(result.current.exportTargetPath).toBe('/exports'));
  act(() => result.current.setExportFileName('review.zip'));
};

describe('GroupedHistory export flow', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPath.mockResolvedValue('/exports');
    mocks.getFileMetadata.mockRejectedValue(new Error('not found'));
    mocks.getConversationMessages.mockResolvedValue({ items: messages });
    mocks.getWorkspace.mockResolvedValue([]);
    mocks.createZip.mockResolvedValue(true);
    mocks.cancelZip.mockResolvedValue(true);
  });

  it('exports a batch only after confirmation and omits raw provider/runtime fields', async () => {
    const { result, setSelectedConversationIds, onBatchModeChange } = renderExport(new Set(['conv-1']));

    act(() => result.current.handleBatchExport());
    await waitFor(() => expect(result.current.exportTargetPath).toBe('/exports'));
    expect(mocks.createZip).not.toHaveBeenCalled();
    act(() => result.current.setExportFileName('batch-review.zip'));
    await act(() => result.current.handleConfirmExport());

    expect(mocks.createZip).toHaveBeenCalledTimes(1);
    const request = mocks.createZip.mock.calls[0]?.[0] as {
      path: string;
      files: Array<{ name: string; content?: string }>;
    };
    expect(request.path).toBe('/exports/batch-review.zip');
    const jsonFile = request.files.find((file) => file.name.endsWith('/conversation/conversation.json'));
    expect(jsonFile?.content).toContain('Visible user text');
    expect(jsonFile?.content).not.toContain('raw-provider-secret');
    expect(jsonFile?.content).not.toContain('must-not-export');
    expect(setSelectedConversationIds).toHaveBeenCalledWith(new Set());
    expect(onBatchModeChange).toHaveBeenCalledWith(false);
    expect(mocks.messageSuccess).toHaveBeenCalledWith('conversation.history.exportSuccess');
  });

  it('keeps the confirmation open and explains a failed write', async () => {
    mocks.createZip.mockResolvedValue(false);
    const { result } = renderExport();
    await openSingleExport(result);

    await act(() => result.current.handleConfirmExport());

    expect(result.current.exportModalVisible).toBe(true);
    expect(mocks.messageError).toHaveBeenCalledWith('conversation.history.exportFailed');
  });

  it('does not create an incomplete ZIP when conversation messages cannot be read', async () => {
    mocks.getConversationMessages.mockRejectedValue(new Error('read failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderExport();
    await openSingleExport(result);

    await act(() => result.current.handleConfirmExport());

    expect(mocks.createZip).not.toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith('conversation.history.exportFailed');
    consoleError.mockRestore();
  });

  it('cancels an in-flight export without reporting success', async () => {
    let resolveCreateZip!: (value: boolean) => void;
    mocks.createZip.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCreateZip = resolve;
      })
    );
    const { result } = renderExport();
    await openSingleExport(result);

    act(() => {
      void result.current.handleConfirmExport();
    });
    await waitFor(() => expect(mocks.createZip).toHaveBeenCalledTimes(1));
    const requestId = mocks.createZip.mock.calls[0]?.[0].request_id as string;
    act(() => result.current.closeExportModal());

    expect(mocks.cancelZip).toHaveBeenCalledWith({ request_id: requestId });
    resolveCreateZip(true);
    await waitFor(() => expect(mocks.messageWarning).toHaveBeenCalledWith('conversation.history.exportCanceled'));
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationExport } from '@/renderer/hooks/file/useConversationExport';

const mocks = vi.hoisted(() => ({
  getConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  getPath: vi.fn(),
  showOpen: vi.fn(),
  writeFile: vi.fn(),
  copyText: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: { getPath: { invoke: mocks.getPath } },
    database: { getConversationMessages: { invoke: mocks.getConversationMessages } },
    dialog: { showOpen: { invoke: mocks.showOpen } },
    fs: { writeFile: { invoke: mocks.writeFile } },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: mocks.getConversation,
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: mocks.copyText,
}));

const conversation = {
  id: 'conv-1',
  name: 'Export review',
  type: 'codex',
  created_at: 1,
  modified_at: 1,
  extra: { workspace: '/workspace' },
} as unknown as TChatConversation;

const messages = [
  {
    id: 'm1',
    conversation_id: conversation.id,
    type: 'text',
    position: 'right',
    content: { content: 'API_KEY=secret-value-12345' },
  },
  {
    id: 'm2',
    conversation_id: conversation.id,
    type: 'text',
    position: 'left',
    content: { content: 'Done' },
  },
] as TMessage[];

const renderExport = () => {
  const success = vi.fn();
  const error = vi.fn();
  const result = renderHook(() =>
    useConversationExport({
      conversation_id: conversation.id,
      workspace: '/workspace',
      t: (key) => key,
      messageApi: { success, error },
    })
  );
  return { ...result, success, error };
};

const openExport = async (result: ReturnType<typeof renderExport>['result']) => {
  await act(async () => {
    await result.current.openExportFlow();
  });
};

const keyboardEvent = (key: string) =>
  ({ key, shiftKey: false, preventDefault: vi.fn() }) as unknown as ReactKeyboardEvent;

describe('useConversationExport', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getConversation.mockResolvedValue(conversation);
    mocks.getConversationMessages.mockResolvedValue({ items: messages, total: messages.length, has_more: false });
    mocks.getPath.mockResolvedValue('/desktop');
    mocks.writeFile.mockResolvedValue(true);
    mocks.copyText.mockResolvedValue(undefined);
  });

  it('loads bounded ascending history and copies Markdown only', async () => {
    const { result, success } = renderExport();
    await openExport(result);

    expect(result.current.step).toBe('menu');
    expect(result.current.format).toBe('markdown');
    expect(result.current.filename).toMatch(/\.md$/);
    expect(result.current.directory).toBe('');
    expect(mocks.getConversationMessages).toHaveBeenCalledWith({
      conversation_id: conversation.id,
      page: 0,
      page_size: 200,
      order: 'ASC',
      content_mode: 'compact',
    });

    act(() => result.current.onSelectMenuItem('copy'));
    await waitFor(() => expect(mocks.copyText).toHaveBeenCalledTimes(1));
    expect(mocks.copyText.mock.calls[0]?.[0]).toContain('# Export review');
    expect(mocks.copyText.mock.calls[0]?.[0]).not.toMatch(/^\s*\{/);
    expect(success).toHaveBeenCalledWith('messages.export.copySuccess');
  });

  it('requires an explicitly selected directory and saves JSON with a matching extension', async () => {
    const { result, error } = renderExport();
    await openExport(result);

    act(() => {
      result.current.onSelectMenuItem('save');
      result.current.setFormat('json');
      result.current.setFilename('review.md');
    });
    await act(async () => {
      await result.current.submitFilename();
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('messages.export.directoryRequired');

    mocks.showOpen.mockResolvedValueOnce([]).mockResolvedValueOnce(['/exports']);
    await act(async () => {
      await result.current.selectDirectory();
    });
    expect(error).toHaveBeenCalledWith('messages.export.directoryCancelled');
    expect(mocks.writeFile).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.selectDirectory();
    });
    expect(mocks.showOpen).toHaveBeenLastCalledWith({
      defaultPath: '/workspace',
      properties: ['openDirectory', 'createDirectory'],
    });
    expect(result.current.directory).toBe('/exports');

    await act(async () => {
      await result.current.submitFilename();
    });
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: '/exports/review.json',
      data: expect.stringMatching(/^\{\n/),
    });
    expect(JSON.parse(mocks.writeFile.mock.calls[0]?.[0].data)).toEqual(
      expect.objectContaining({
        title: 'Export review',
        messages: [
          { role: 'user', content: 'API_KEY=[REDACTED]' },
          { role: 'assistant', content: 'Done' },
        ],
      })
    );
  });

  it('keeps failures visible and never reports a failed write as success', async () => {
    mocks.writeFile.mockResolvedValue(false);
    const { result, success, error } = renderExport();
    await openExport(result);
    act(() => result.current.onSelectMenuItem('save'));
    mocks.showOpen.mockResolvedValue(['/exports']);
    await act(async () => {
      await result.current.selectDirectory();
      await result.current.submitFilename();
    });

    expect(error).toHaveBeenCalledWith('messages.export.saveFailed');
    expect(success).not.toHaveBeenCalled();
    expect(result.current.step).toBe('filename');
  });

  it('shows message loading failure without opening the export menu', async () => {
    mocks.getConversationMessages.mockRejectedValue(new Error('read failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, error } = renderExport();

    await openExport(result);

    expect(result.current.step).toBe('closed');
    expect(error).toHaveBeenCalledWith('messages.export.prepareFailed');
    consoleError.mockRestore();
  });

  it('preserves Escape, ArrowUp, ArrowDown, and Enter navigation', async () => {
    const { result } = renderExport();
    await openExport(result);

    act(() => result.current.handleKeyDown(keyboardEvent('ArrowDown')));
    expect(result.current.activeIndex).toBe(1);
    act(() => result.current.handleKeyDown(keyboardEvent('ArrowUp')));
    expect(result.current.activeIndex).toBe(0);
    act(() => result.current.handleKeyDown(keyboardEvent('ArrowDown')));
    act(() => result.current.handleKeyDown(keyboardEvent('Enter')));
    expect(result.current.step).toBe('filename');
    act(() => result.current.handleKeyDown(keyboardEvent('Escape')));
    expect(result.current.step).toBe('menu');
    act(() => result.current.handleKeyDown(keyboardEvent('Escape')));
    expect(result.current.step).toBe('closed');
  });
});

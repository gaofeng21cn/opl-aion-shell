import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspacePaste } from '@/renderer/pages/conversation/Workspace/hooks/useWorkspacePaste';

const mocks = vi.hoisted(() => ({
  conversationGet: vi.fn(),
  projectGet: vi.fn(),
  copyFiles: vi.fn(),
  showOpen: vi.fn(),
  uploadFile: vi.fn(),
  trackerFinish: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { get: { invoke: mocks.conversationGet } },
    project: { get: { invoke: mocks.projectGet } },
    fs: { copyFilesToWorkspace: { invoke: mocks.copyFiles } },
    dialog: { showOpen: { invoke: mocks.showOpen } },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: vi.fn(() => true), set: vi.fn() },
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onFocus: vi.fn() }),
}));

vi.mock('@/renderer/services/FileService', () => ({
  UPLOAD_ABORTED_ERROR: 'Upload aborted',
  uploadFileViaHttp: mocks.uploadFile,
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  trackUpload: () => ({ onProgress: vi.fn(), finish: mocks.trackerFinish }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

describe('useWorkspacePaste WebUI project uploads', () => {
  afterEach(() => {
    document.querySelectorAll('input[type="file"]').forEach((input) => input.remove());
    vi.clearAllMocks();
  });

  it('copies uploaded bytes into the selected Project Explorer folder before refreshing', async () => {
    mocks.conversationGet.mockResolvedValue({ project_id: 'project-1' });
    mocks.projectGet.mockResolvedValue({ explorer: { workspace_pe_id: 'pe-workspace' } });
    mocks.uploadFile.mockResolvedValue('/tmp/aionui/general/input.csv');
    mocks.copyFiles.mockResolvedValue({ copied_files: ['/projects/data/input.csv'], failed_files: [] });
    const refreshWorkspace = vi.fn();
    const messageApi = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
    const selectedNodeRef = { current: { relativePath: 'data', fullPath: '/projects/data' } };
    const { result, unmount } = renderHook(() =>
      useWorkspacePaste({
        conversation_id: 'conversation-1',
        workspace: '/projects',
        messageApi,
        t: (key) => key,
        files: [],
        selected: ['data'],
        selectedNodeRef,
        refreshWorkspace,
        pasteConfirm: { visible: false, file_name: '', filesToPaste: [], doNotAsk: false, targetFolder: null },
        setPasteConfirm: vi.fn(),
        closePasteConfirm: vi.fn(),
      })
    );

    act(() => result.current.handleUploadDeviceFiles());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['subject,value\nA,1\n'], 'input.csv', { type: 'text/csv' });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        file_paths: ['/tmp/aionui/general/input.csv'],
        target: { pe_id: 'pe-workspace', relative_path: 'data' },
      })
    );
    expect(mocks.conversationGet).toHaveBeenCalledWith({ id: 'conversation-1' });
    expect(mocks.projectGet).toHaveBeenCalledWith({ project_id: 'project-1' });
    await waitFor(() => expect(refreshWorkspace).toHaveBeenCalled());
    expect(messageApi.success).toHaveBeenCalled();
    expect(messageApi.error).not.toHaveBeenCalled();

    unmount();
  });

  it('re-reads a lazily bound conversation before resolving its Project Explorer target', async () => {
    mocks.conversationGet
      .mockResolvedValueOnce({ project_id: undefined })
      .mockResolvedValueOnce({ project_id: 'project-1' });
    mocks.projectGet.mockResolvedValue({ explorer: { workspace_pe_id: 'pe-workspace' } });
    mocks.uploadFile.mockResolvedValue('/tmp/aionui/general/input.csv');
    mocks.copyFiles.mockResolvedValue({ copied_files: ['/projects/input.csv'], failed_files: [] });
    const refreshWorkspace = vi.fn();
    const messageApi = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
    const selectedNodeRef = { current: null };
    const { result, unmount } = renderHook(() =>
      useWorkspacePaste({
        conversation_id: 'conversation-1',
        workspace: '/projects',
        messageApi,
        t: (key) => key,
        files: [],
        selected: [],
        selectedNodeRef,
        refreshWorkspace,
        pasteConfirm: { visible: false, file_name: '', filesToPaste: [], doNotAsk: false, targetFolder: null },
        setPasteConfirm: vi.fn(),
        closePasteConfirm: vi.fn(),
      })
    );

    act(() => result.current.handleUploadDeviceFiles());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: { files: [new File(['id\n1\n'], 'input.csv', { type: 'text/csv' })] },
    });

    await waitFor(() =>
      expect(mocks.copyFiles).toHaveBeenCalledWith({
        file_paths: ['/tmp/aionui/general/input.csv'],
        target: { pe_id: 'pe-workspace', relative_path: '' },
      })
    );
    expect(mocks.conversationGet).toHaveBeenCalledTimes(2);
    expect(mocks.conversationGet).toHaveBeenNthCalledWith(1, { id: 'conversation-1' });
    expect(mocks.conversationGet).toHaveBeenNthCalledWith(2, { id: 'conversation-1' });
    expect(mocks.projectGet).toHaveBeenCalledWith({ project_id: 'project-1' });
    expect(messageApi.error).not.toHaveBeenCalled();

    unmount();
  });
});

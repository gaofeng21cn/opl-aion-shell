import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeMocks = vi.hoisted(() => ({
  showOpenProvider: vi.fn(),
  showWorkspaceProvider: vi.fn(),
}));

const electronMocks = vi.hoisted(() => ({
  focusedWindow: { id: 1 },
  showOpenDialog: vi.fn(),
}));

const runtimeMocks = vi.hoisted(() => ({
  projectWorkspacePath: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: {
      showOpen: { provider: bridgeMocks.showOpenProvider },
      showWorkspace: { provider: bridgeMocks.showWorkspaceProvider },
    },
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: () => electronMocks.focusedWindow,
    getAllWindows: () => [electronMocks.focusedWindow],
  },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
}));

vi.mock('@/process/services/runtime-execution', () => ({
  getWindowsWslRuntime: () => ({ projectWorkspacePath: runtimeMocks.projectWorkspacePath }),
}));

import { initDialogBridge } from '@/process/bridge/dialogBridge';

describe('dialog bridge workspace projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initDialogBridge();
  });

  it('keeps the generic local picker unchanged', async () => {
    electronMocks.showOpenDialog.mockResolvedValueOnce({ filePaths: ['D:\\evidence.pdf'] });
    const handler = bridgeMocks.showOpenProvider.mock.calls[0][0];

    await expect(handler({ properties: ['openFile'] })).resolves.toEqual(['D:\\evidence.pdf']);
    expect(runtimeMocks.projectWorkspacePath).not.toHaveBeenCalled();
  });

  it('returns host and canonical runtime paths for a workspace selection', async () => {
    electronMocks.showOpenDialog.mockResolvedValueOnce({ filePaths: ['D:\\研究\\RCT'] });
    runtimeMocks.projectWorkspacePath.mockResolvedValueOnce('/mnt/d/研究/RCT');
    const handler = bridgeMocks.showWorkspaceProvider.mock.calls[0][0];

    await expect(handler({ properties: ['openDirectory', 'createDirectory'] })).resolves.toEqual({
      host_path: 'D:\\研究\\RCT',
      runtime_path: '/mnt/d/研究/RCT',
    });
    expect(runtimeMocks.projectWorkspacePath).toHaveBeenCalledWith('D:\\研究\\RCT');
  });

  it('rejects a non-absolute projected runtime path', async () => {
    electronMocks.showOpenDialog.mockResolvedValueOnce({ filePaths: ['D:\\研究\\RCT'] });
    runtimeMocks.projectWorkspacePath.mockResolvedValueOnce('relative/workspace');
    const handler = bridgeMocks.showWorkspaceProvider.mock.calls[0][0];

    await expect(handler({ properties: ['openDirectory'] })).rejects.toThrow('runtime path must be absolute');
  });
});

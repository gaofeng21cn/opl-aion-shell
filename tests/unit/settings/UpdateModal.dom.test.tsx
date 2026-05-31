import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UpdateModal from '@/renderer/components/settings/UpdateModal';

const bridgeMocks = vi.hoisted(() => ({
  updateOpenOn: vi.fn(),
  updateCheckInvoke: vi.fn(),
  updateDownloadInvoke: vi.fn(),
  updateDownloadProgressOn: vi.fn(),
  autoUpdateStatusOn: vi.fn(),
  autoUpdateCheckInvoke: vi.fn(),
  autoUpdateDownloadInvoke: vi.fn(),
  autoUpdateQuitAndInstallInvoke: vi.fn(),
  shellOpenExternalInvoke: vi.fn(),
  shellOpenFileInvoke: vi.fn(),
  shellShowItemInFolderInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    update: {
      open: { on: bridgeMocks.updateOpenOn },
      check: { invoke: bridgeMocks.updateCheckInvoke },
      download: { invoke: bridgeMocks.updateDownloadInvoke },
      downloadProgress: { on: bridgeMocks.updateDownloadProgressOn },
    },
    autoUpdate: {
      status: { on: bridgeMocks.autoUpdateStatusOn },
      check: { invoke: bridgeMocks.autoUpdateCheckInvoke },
      download: { invoke: bridgeMocks.autoUpdateDownloadInvoke },
      quitAndInstall: { invoke: bridgeMocks.autoUpdateQuitAndInstallInvoke },
    },
    shell: {
      openExternal: { invoke: bridgeMocks.shellOpenExternalInvoke },
      openFile: { invoke: bridgeMocks.shellOpenFileInvoke },
      showItemInFolder: { invoke: bridgeMocks.shellShowItemInFolderInvoke },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'update.modalTitle': '检查更新',
        'update.checking': '正在检查更新',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    visible,
    children,
    style,
    contentStyle,
  }: {
    visible: boolean;
    children: React.ReactNode;
    style?: { height?: string | number; width?: string | number };
    contentStyle?: { height?: string | number };
  }) =>
    visible ? (
      <div data-testid='aion-modal' data-modal-width={style?.width} data-content-height={contentStyle?.height}>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('UpdateModal checking layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    bridgeMocks.updateOpenOn.mockReturnValue(() => undefined);
    bridgeMocks.updateDownloadProgressOn.mockReturnValue(() => undefined);
    bridgeMocks.autoUpdateStatusOn.mockReturnValue(() => undefined);
    bridgeMocks.autoUpdateCheckInvoke.mockReturnValue(new Promise(() => undefined));
    bridgeMocks.updateCheckInvoke.mockReturnValue(new Promise(() => undefined));
  });

  it('uses matching modal and content dimensions while checking', async () => {
    render(<UpdateModal />);

    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));

    const modal = await screen.findByTestId('aion-modal');
    expect(modal).toHaveAttribute('data-modal-width', '400px');
    expect(modal).toHaveAttribute('data-content-height', '224px');

    await waitFor(() => expect(screen.getByText('正在检查更新')).toBeInTheDocument());
    expect(screen.getByText('正在检查更新').parentElement).toHaveClass('min-h-224px', 'h-full', 'box-border');
  });
});

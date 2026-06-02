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
    i18n: {
      language: globalThis.localStorage?.getItem('test.i18nLanguage') ?? 'zh-CN',
    },
    t: (key: string) => {
      const translations: Record<string, string> = {
        'update.modalTitle': '检查更新',
        'update.checking': '正在检查更新',
        'update.availableTitle': '发现新版本',
        'update.downloadButton': '下载',
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

  it('selects zh-CN release notes from hidden release blocks when the current language is Chinese', async () => {
    localStorage.setItem('test.i18nLanguage', 'zh-CN');
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValue({ success: true, data: { checked: true } });
    bridgeMocks.updateCheckInvoke.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.0.0',
        updateAvailable: true,
        latest: {
          tagName: 'v1.1.0',
          version: '1.1.0',
          name: 'v1.1.0',
          body: [
            'Public English intro',
            '<!-- OPL_RELEASE_NOTES:en-US',
            'English release notes',
            '-->',
            '<!-- OPL_RELEASE_NOTES:zh-CN',
            '中文更新说明',
            '-->',
          ].join('\n'),
          htmlUrl: 'https://example.test/releases/v1.1.0',
          prerelease: false,
          draft: false,
          assets: [],
          recommendedAsset: {
            name: 'One Person Lab.dmg',
            url: 'https://example.test/download.dmg',
            size: 1024,
          },
        },
      },
    });

    render(<UpdateModal />);
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));

    expect(await screen.findByText('中文更新说明')).toBeInTheDocument();
    expect(screen.queryByText('English release notes')).not.toBeInTheDocument();
  });

  it('falls back to en-US release notes when the current language block is missing', async () => {
    localStorage.setItem('test.i18nLanguage', 'fr-FR');
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValue({
      success: true,
      data: {
        checked: true,
        updateInfo: {
          version: '1.1.0',
          releaseNotes: [
            'Public English intro',
            '<!-- OPL_RELEASE_NOTES:en-US -->',
            'English release notes',
            '<!-- /OPL_RELEASE_NOTES:en-US -->',
            '<!-- OPL_RELEASE_NOTES:zh-CN -->',
            '中文更新说明',
            '<!-- /OPL_RELEASE_NOTES:zh-CN -->',
          ].join('\n'),
        },
      },
    });
    bridgeMocks.updateCheckInvoke.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.0.0',
        updateAvailable: true,
      },
    });

    render(<UpdateModal />);
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));

    expect(await screen.findByText('English release notes')).toBeInTheDocument();
    expect(screen.queryByText('中文更新说明')).not.toBeInTheDocument();
  });
});

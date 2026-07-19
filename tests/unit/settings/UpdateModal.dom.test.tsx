import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UpdateModal, { selectLocalizedReleaseNotes } from '@/renderer/components/settings/UpdateModal';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  updateOpenOn: vi.fn(),
  updateCheckInvoke: vi.fn(),
  updateDownloadInvoke: vi.fn(),
  updateDownloadProgressOn: vi.fn(),
  autoUpdateStatusOn: vi.fn(),
  autoUpdateGetStatusSnapshotInvoke: vi.fn(),
  autoUpdateCheckInvoke: vi.fn(),
  autoUpdateDownloadInvoke: vi.fn(),
  autoUpdateQuitAndInstallInvoke: vi.fn(),
  shellOpenExternalInvoke: vi.fn(),
  shellOpenFileInvoke: vi.fn(),
  shellShowItemInFolderInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
    },
    update: {
      open: { on: bridgeMocks.updateOpenOn },
      check: { invoke: bridgeMocks.updateCheckInvoke },
      download: { invoke: bridgeMocks.updateDownloadInvoke },
      downloadProgress: { on: bridgeMocks.updateDownloadProgressOn },
    },
    autoUpdate: {
      status: { on: bridgeMocks.autoUpdateStatusOn },
      getStatusSnapshot: { invoke: bridgeMocks.autoUpdateGetStatusSnapshotInvoke },
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
        'update.readyToInstall': '准备安装',
        'update.installWarning': '安装期间请勿手动打开应用，应用将自动重启。',
        'update.installNow': '立即安装',
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
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke.mockResolvedValue(null);
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      parsed: { app_state: { update_channel: 'stable' } },
    });
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

  it('replays a downloaded startup snapshot and prompts for restart after a late mount', async () => {
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke.mockResolvedValue({
      status: 'downloaded',
      version: '26.7.19',
    });

    render(<UpdateModal />);

    expect(await screen.findByText('准备安装')).toBeInTheDocument();
    expect(screen.getByText('立即安装')).toBeInTheDocument();
    expect(bridgeMocks.autoUpdateCheckInvoke).not.toHaveBeenCalled();
  });

  it('keeps an available startup update in the background until download completes', async () => {
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke.mockResolvedValue({
      status: 'available',
      version: '26.7.19',
    });

    render(<UpdateModal />);

    await waitFor(() => expect(bridgeMocks.autoUpdateGetStatusSnapshotInvoke).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('aion-modal')).not.toBeInTheDocument();
  });

  it('does not let a stale manual-check snapshot overwrite a newer live downloaded event', async () => {
    let statusListener: ((event: { status: string; version?: string }) => void) | undefined;
    let resolveManualSnapshot: ((status: { status: 'available'; version: string }) => void) | undefined;
    bridgeMocks.autoUpdateStatusOn.mockImplementation((listener) => {
      statusListener = listener;
      return () => undefined;
    });
    bridgeMocks.autoUpdateGetStatusSnapshotInvoke
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveManualSnapshot = resolve;
          })
      );
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValue({
      success: true,
      data: { checked: true, updateInfo: { version: '26.7.19' } },
    });
    bridgeMocks.updateCheckInvoke.mockResolvedValue({
      success: true,
      data: { currentVersion: '26.7.18', updateAvailable: false },
    });

    render(<UpdateModal />);
    await waitFor(() => expect(bridgeMocks.autoUpdateGetStatusSnapshotInvoke).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));
    await waitFor(() => expect(bridgeMocks.autoUpdateGetStatusSnapshotInvoke).toHaveBeenCalledTimes(2));

    await act(async () => {
      statusListener?.({ status: 'downloaded', version: '26.7.19' });
    });
    expect(screen.getByText('准备安装')).toBeInTheDocument();

    await act(async () => {
      resolveManualSnapshot?.({ status: 'available', version: '26.7.19' });
    });
    expect(screen.getByText('准备安装')).toBeInTheDocument();
    expect(screen.queryByText('update.downloadingTitle')).not.toBeInTheDocument();
  });

  it('uses the app-state preview channel for both updater checks and ignores legacy local storage', async () => {
    localStorage.setItem('update.includeNightly', 'false');
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      parsed: { app_state: { release: { channel: 'preview' } } },
    });
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValue({ success: true, data: { checked: true } });
    bridgeMocks.updateCheckInvoke.mockResolvedValue({
      success: true,
      data: { currentVersion: '1.0.0', updateAvailable: false },
    });

    render(<UpdateModal />);
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));

    await waitFor(() => expect(bridgeMocks.autoUpdateCheckInvoke).toHaveBeenCalledWith({ channel: 'nightly' }));
    expect(bridgeMocks.updateCheckInvoke).toHaveBeenCalledWith({ channel: 'nightly' });
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
    const releaseNotes = [
      'Public English intro',
      '<!-- OPL_RELEASE_NOTES:en-US -->',
      'English release notes',
      '<!-- /OPL_RELEASE_NOTES:en-US -->',
      '<!-- OPL_RELEASE_NOTES:zh-CN -->',
      '中文更新说明',
      '<!-- /OPL_RELEASE_NOTES:zh-CN -->',
    ].join('\n');

    expect(selectLocalizedReleaseNotes(releaseNotes, 'fr-FR')).toBe('English release notes');
  });

  it('passes downloaded updater zip path to the App-managed installer', async () => {
    let progressListener: ((event: unknown) => void) | undefined;
    bridgeMocks.autoUpdateCheckInvoke.mockResolvedValue({ success: true, data: { checked: true } });
    bridgeMocks.updateDownloadProgressOn.mockImplementation((listener: (event: unknown) => void) => {
      progressListener = listener;
      return () => undefined;
    });
    bridgeMocks.updateCheckInvoke.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '26.6.3',
        updateAvailable: true,
        latest: {
          tagName: 'v26.6.5',
          version: '26.6.5',
          name: 'v26.6.5',
          body: '',
          htmlUrl: 'https://example.test/releases/v26.6.5',
          prerelease: false,
          draft: false,
          assets: [],
          recommendedAsset: {
            name: 'One-Person-Lab-26.6.5-mac-arm64.zip',
            url: 'https://example.test/One-Person-Lab-26.6.5-mac-arm64.zip',
            size: 1024,
            updateRole: 'updater',
          },
        },
      },
    });
    bridgeMocks.updateDownloadInvoke.mockResolvedValue({
      success: true,
      data: {
        downloadId: 'download-1',
        file_path: '/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip',
        updateRole: 'updater',
      },
    });

    render(<UpdateModal />);
    window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'about' } }));

    fireEvent.click(await screen.findByText('下载'));
    await waitFor(() => {
      expect(bridgeMocks.updateDownloadInvoke).toHaveBeenCalledWith({
        url: 'https://example.test/One-Person-Lab-26.6.5-mac-arm64.zip',
        fallbackUrl: undefined,
        file_name: 'One-Person-Lab-26.6.5-mac-arm64.zip',
        updateRole: 'updater',
      });
    });
    await waitFor(() => {
      expect(bridgeMocks.updateDownloadProgressOn.mock.calls.length).toBeGreaterThan(1);
    });

    await act(async () => {
      progressListener?.({
        downloadId: 'download-1',
        status: 'completed',
        receivedBytes: 1024,
        totalBytes: 1024,
        percent: 100,
        file_path: '/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip',
      });
    });

    fireEvent.click(await screen.findByText('立即安装'));
    expect(bridgeMocks.autoUpdateQuitAndInstallInvoke).toHaveBeenCalledWith({
      file_path: '/Users/test/Downloads/One-Person-Lab-26.6.5-mac-arm64.zip',
      version: '26.6.5',
    });
  });
});

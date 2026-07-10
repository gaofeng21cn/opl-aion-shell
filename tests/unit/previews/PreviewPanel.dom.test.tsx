/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeTab: {} as Record<string, unknown>,
  downloadFileFromPath: vi.fn(),
  downloadTextContent: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: { openFile: { invoke: vi.fn() } },
  },
}));

vi.mock('@/renderer/utils/file/download', () => ({
  downloadFileFromPath: mocks.downloadFileFromPath,
  downloadTextContent: mocks.downloadTextContent,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: () => ({ splitRatio: 50, createDragHandle: () => null }),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    isOpen: true,
    tabs: [mocks.activeTab],
    activeTabId: 'tab-1',
    activeTab: mocks.activeTab,
    closeTab: vi.fn(),
    switchTab: vi.fn(),
    closePreview: vi.fn(),
    updateContent: vi.fn(),
    saveContent: vi.fn(async () => true),
    addDomSnippet: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewToolbarExtrasContext', () => ({
  PreviewToolbarExtrasProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/renderer/pages/conversation/Preview/hooks', () => ({
  usePreviewHistory: () => ({
    historyVersions: [],
    historyLoading: false,
    snapshotSaving: false,
    historyError: null,
    historyTarget: null,
    refreshHistory: vi.fn(),
    handleSaveSnapshot: vi.fn(),
    handleSnapshotSelect: vi.fn(),
    messageApi: { error: mocks.messageError, success: vi.fn() },
    messageContextHolder: null,
  }),
  usePreviewKeyboardShortcuts: vi.fn(),
  useScrollSync: () => ({ handleEditorScroll: vi.fn(), handlePreviewScroll: vi.fn() }),
  useTabOverflow: () => ({ tabsContainerRef: { current: null }, tabFadeState: {} }),
  useThemeDetection: () => 'light',
}));

vi.mock('@/renderer/pages/conversation/Preview/components/PreviewPanel', () => ({
  PreviewTabs: () => null,
  PreviewToolbar: ({ onDownload }: { onDownload: () => void }) => (
    <button type='button' onClick={onDownload}>
      download
    </button>
  ),
  PreviewContextMenu: () => null,
  PreviewConfirmModals: () => null,
  PreviewHistoryDropdown: () => null,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer', () => ({
  default: () => <div data-testid='markdown-viewer' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/editors/CodeEditor', () => ({
  default: () => <div data-testid='code-editor' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/viewers/PDFViewer', () => ({
  default: () => <div data-testid='pdf-viewer' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/components/viewers/DiffViewer', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/ExcelViewer', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/editors/HTMLEditor', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/renderers/HTMLRenderer', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/ImageViewer', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/editors/MarkdownEditor', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/OfficeDocViewer', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/PptViewer', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/Preview/components/viewers/URLViewer', () => ({ default: () => null }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import PreviewPanel from '@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel';

const setActiveTab = (content_type: string, metadata: Record<string, unknown> = {}) => {
  mocks.activeTab = {
    id: 'tab-1',
    title: 'Artifact',
    content: '# content',
    content_type,
    metadata,
    isDirty: false,
  };
};

describe('PreviewPanel artifact routing', () => {
  beforeEach(() => {
    mocks.downloadFileFromPath.mockReset();
    mocks.downloadTextContent.mockReset();
    mocks.messageError.mockReset();
  });

  it.each([
    ['markdown', 'markdown-viewer'],
    ['code', 'code-editor'],
    ['pdf', 'pdf-viewer'],
  ])('routes %s artifacts to the matching renderer', (contentType, testId) => {
    setActiveTab(contentType);
    render(<PreviewPanel />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('downloads an in-memory markdown artifact only after the toolbar action', async () => {
    setActiveTab('markdown', { file_name: 'report.md' });
    render(<PreviewPanel />);

    expect(mocks.downloadTextContent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'download' }));

    await waitFor(() =>
      expect(mocks.downloadTextContent).toHaveBeenCalledWith('# content', 'report.md', 'text/markdown;charset=utf-8')
    );
  });

  it('shows a user-facing error when artifact download fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.downloadTextContent.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    setActiveTab('code', { file_name: 'broken.ts', language: 'typescript' });
    render(<PreviewPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'download' }));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('messages.downloadFailed'));
    consoleError.mockRestore();
  });
});

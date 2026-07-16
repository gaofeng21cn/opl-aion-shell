import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  handleExportConversation: vi.fn(),
  handleBatchExport: vi.fn(),
  navigate: vi.fn(),
  emptyHistory: false,
}));

const conversation = {
  id: 'conv-1',
  name: 'Review topic',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: {},
} as unknown as TChatConversation;

vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({ batchMode, conversation: row, onExport }: Record<string, unknown>) =>
    batchMode ? null : (
      <button
        type='button'
        onClick={() => (onExport as (value: TChatConversation) => void)?.(row as TChatConversation)}
      >
        row export
      </button>
    ),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/SortableConversationRow', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/DragOverlayContent', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/components/WorkspaceCollapse', () => ({
  default: ({
    header,
    trailing,
    children,
  }: React.PropsWithChildren<{ header: React.ReactNode; trailing?: React.ReactNode }>) => (
    <div data-testid='workspace-group'>
      {header}
      {trailing}
      {children}
    </div>
  ),
}));
vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/DirectorySelectionModal', () => ({ default: () => null }));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: mocks.emptyHistory ? [] : [conversation],
    isConversationGenerating: () => false,
    hasCompletionUnread: () => false,
    expandedWorkspaces: ['/workspace/review'],
    pinnedConversations: [],
    timelineSections: mocks.emptyHistory
      ? []
      : [
          {
            key: 'today',
            label: 'Today',
            items: [
              {
                type: 'workspace',
                workspaceGroup: {
                  workspace: '/workspace/review',
                  display_name: 'review',
                  conversations: [conversation],
                },
              },
            ],
          },
        ],
    handleToggleWorkspace: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useBatchSelection', () => ({
  useBatchSelection: () => ({
    selectedConversationIds: new Set(['conv-1']),
    setSelectedConversationIds: vi.fn(),
    selectedCount: 1,
    allSelected: false,
    toggleSelectedConversation: vi.fn(),
    handleToggleSelectAll: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions', () => ({
  useConversationActions: () => ({
    renameModalVisible: false,
    renameModalName: '',
    setRenameModalName: vi.fn(),
    renameLoading: false,
    dropdownVisibleId: null,
    handleConversationClick: vi.fn(),
    handleDeleteClick: vi.fn(),
    handleBatchDelete: vi.fn(),
    handleEditStart: vi.fn(),
    handleRenameConfirm: vi.fn(),
    handleRenameCancel: vi.fn(),
    handleTogglePin: vi.fn(),
    handleArchive: vi.fn(),
    handleRestore: vi.fn(),
    handleReset: vi.fn(),
    handleMenuVisibleChange: vi.fn(),
    handleOpenMenu: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useExport', () => ({
  useExport: () => ({
    exportTask: null,
    exportModalVisible: false,
    exportTargetPath: '',
    exportFileName: '',
    exportModalLoading: false,
    showExportDirectorySelector: false,
    setShowExportDirectorySelector: vi.fn(),
    setExportFileName: vi.fn(),
    closeExportModal: vi.fn(),
    handleSelectExportDirectoryFromModal: vi.fn(),
    handleSelectExportFolder: vi.fn(),
    handleExportConversation: mocks.handleExportConversation,
    handleBatchExport: mocks.handleBatchExport,
    handleConfirmExport: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop', () => ({
  useDragAndDrop: () => ({
    sensors: [],
    activeId: null,
    activeConversation: null,
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
    isDragEnabled: false,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  useCronJobsMap: () => ({ getJobStatus: () => 'none', markAsRead: vi.fn(), setActiveConversation: vi.fn() }),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DragOverlay: ({ children }: React.PropsWithChildren) => <>{children}</>,
  closestCenter: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: React.PropsWithChildren) => <>{children}</>,
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({}),
}));

import GroupedHistory from '@/renderer/pages/conversation/GroupedHistory';

describe('GroupedHistory export entries', () => {
  beforeEach(() => {
    mocks.handleExportConversation.mockReset();
    mocks.handleBatchExport.mockReset();
    mocks.navigate.mockReset();
    mocks.emptyHistory = false;
  });

  it('wires the conversation row export entry to the existing export hook', () => {
    render(<GroupedHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'row export' }));
    expect(mocks.handleExportConversation).toHaveBeenCalledWith(conversation);
  });

  it('wires the batch export action to the same confirmed export flow', () => {
    render(<GroupedHistory batchMode />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.batchExport' }));
    expect(mocks.handleBatchExport).toHaveBeenCalledTimes(1);
  });

  it('keeps workspace groups cwd-only without project context or a cascading remove action', () => {
    render(<GroupedHistory />);

    expect(screen.getByTestId('workspace-group')).toHaveTextContent('review');
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.newConversationWithWorkspace' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { state: { workspace: '/workspace/review' } });
    expect(screen.queryByText('conversation.history.removeProject')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.history.projectContext.add')).not.toBeInTheDocument();
  });

  it('renders a compact monochrome conversation empty state without the carrier illustration', () => {
    mocks.emptyHistory = true;
    render(<GroupedHistory />);

    const emptyState = screen.getByTestId('conversation-history-empty');
    expect(emptyState).toHaveTextContent('conversation.history.noHistory');
    expect(emptyState.querySelector('svg')).not.toBeNull();
    expect(emptyState.querySelector('.text-13px')).not.toBeNull();
    expect(document.querySelector('.arco-empty')).toBeNull();
  });
});

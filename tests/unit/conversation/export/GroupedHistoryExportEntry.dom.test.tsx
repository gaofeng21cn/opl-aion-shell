import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  handleExportConversation: vi.fn(),
  handleBatchExport: vi.fn(),
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
vi.mock('@/renderer/pages/conversation/components/WorkspaceCollapse', () => ({ default: () => null }));
vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));
vi.mock('@/renderer/components/settings/DirectorySelectionModal', () => ({ default: () => null }));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [conversation],
    isConversationGenerating: () => false,
    hasCompletionUnread: () => false,
    expandedWorkspaces: [],
    pinnedConversations: [conversation],
    timelineSections: [],
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
    handleRemoveProject: vi.fn(),
    removeProjectTarget: null,
    removeProjectLoading: false,
    handleRemoveProjectCancel: vi.fn(),
    handleRemoveProjectConfirm: vi.fn(),
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
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

import GroupedHistory from '@/renderer/pages/conversation/GroupedHistory';

describe('GroupedHistory export entries', () => {
  beforeEach(() => {
    mocks.handleExportConversation.mockReset();
    mocks.handleBatchExport.mockReset();
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
});

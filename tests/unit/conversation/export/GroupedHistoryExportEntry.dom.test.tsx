import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { TChatConversation } from '@/common/config/storage';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const mocks = vi.hoisted(() => ({
  handleExportConversation: vi.fn(),
  handleBatchExport: vi.fn(),
  handleMoveToProject: vi.fn(),
  handleProjectAdoption: vi.fn(),
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

const projectlessConversation = {
  id: 'conv-projectless',
  name: 'Projectless topic',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: {
    backend: 'codex',
    canonical_thread_id: 'thread-projectless',
    custom_workspace: false,
  },
} as TChatConversation;

vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({ batchMode, conversation: row, onExport, onMoveToProject }: Record<string, unknown>) =>
    batchMode ? null : (
      <>
        {(row as TChatConversation).id === 'conv-1' && (
          <button
            type='button'
            onClick={() => (onExport as (value: TChatConversation) => void)?.(row as TChatConversation)}
          >
            row export
          </button>
        )}
        {onMoveToProject && (
          <button
            type='button'
            onClick={() => (onMoveToProject as (value: TChatConversation) => void)(row as TChatConversation)}
          >
            move projectless row
          </button>
        )}
      </>
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
    conversations: mocks.emptyHistory ? [] : [conversation, projectlessConversation],
    isConversationGenerating: () => false,
    isConversationWaitingConfirmation: () => false,
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
              {
                type: 'conversation',
                conversation: projectlessConversation,
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
    projectAdoptionConversation: null,
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
    handleMoveToProject: mocks.handleMoveToProject,
    handleProjectAdoption: mocks.handleProjectAdoption,
    handleProjectAdoptionConfirm: vi.fn(),
    handleProjectAdoptionCancel: vi.fn(),
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
    mocks.handleMoveToProject.mockReset();
    mocks.handleProjectAdoption.mockReset();
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
    const newConversationAction = screen.getByRole('button', {
      name: 'conversation.history.newConversationWithWorkspace',
    });
    expect(newConversationAction).toHaveClass('workspace-collapse__new-conversation-action');
    expect(newConversationAction).not.toHaveClass('hidden', 'group-hover:flex');
    fireEvent.click(newConversationAction);
    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { state: { workspace: '/workspace/review' } });
    expect(screen.queryByText('conversation.history.removeProject')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.history.projectContext.add')).not.toBeInTheDocument();
  });

  it('keeps the project action hidden at rest only for fine pointers and reveals it for row hover or focus', () => {
    const layoutCss = fs.readFileSync(path.join(repoRoot, 'packages/desktop/src/renderer/styles/layout.css'), 'utf8');

    expect(layoutCss).toContain('@media (hover: hover) and (pointer: fine)');
    expect(layoutCss).toContain('.workspace-collapse__new-conversation-action {\n    opacity: 0;');
    expect(layoutCss).toContain('.workspace-collapse__header:hover .workspace-collapse__new-conversation-action');
    expect(layoutCss).toContain(
      '.workspace-collapse__header:focus-within .workspace-collapse__new-conversation-action'
    );
    expect(layoutCss).toContain('.workspace-collapse__new-conversation-action:focus-visible');
  });

  it.each(['Enter', ' '])('keeps the workspace shortcut keyboard activation for %s', (key) => {
    render(<GroupedHistory />);
    const newConversationAction = screen.getByRole('button', {
      name: 'conversation.history.newConversationWithWorkspace',
    });

    fireEvent.keyDown(newConversationAction, { key });

    expect(mocks.navigate).toHaveBeenCalledWith('/guid', { state: { workspace: '/workspace/review' } });
  });

  it('exposes one-time project adoption only for the projectless canonical row', () => {
    render(<GroupedHistory />);

    fireEvent.click(screen.getByRole('button', { name: 'move projectless row' }));
    expect(mocks.handleMoveToProject).toHaveBeenCalledWith(projectlessConversation);
    expect(screen.getAllByRole('button', { name: 'move projectless row' })).toHaveLength(1);
  });

  it('moves an eligible projectless row through native drag and drop', () => {
    render(<GroupedHistory />);

    const source = screen.getByRole('button', { name: 'move projectless row' }).closest('[draggable="true"]');
    const target = screen.getByTestId('workspace-group').parentElement;
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();

    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: vi.fn(),
    };
    fireEvent.dragStart(source!, { dataTransfer });
    fireEvent.dragEnter(target!, { dataTransfer });
    fireEvent.drop(target!, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', projectlessConversation.id);
    expect(mocks.handleProjectAdoption).toHaveBeenCalledWith(projectlessConversation, '/workspace/review');
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

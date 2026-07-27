/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import DirectorySelectionModal from '@/renderer/components/settings/DirectorySelectionModal';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Input, Modal, Tooltip } from '@arco-design/web-react';
import { Export, FolderOpen, MessageOne, Plus, Right, Tips } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import WorkspaceCollapse from '../components/WorkspaceCollapse';
import ConversationRow from './ConversationRow';
import DragOverlayContent from './DragOverlayContent';
import SortableConversationRow from './SortableConversationRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useExport } from './hooks/useExport';
import { isProjectlessCanonicalConversation } from './hooks/canonicalThreadLifecycle';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
  afterPinnedContent,
  archived = false,
}) => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [activeProjectAdoptionConversation, setActiveProjectAdoptionConversation] = useState<TChatConversation | null>(
    null
  );
  const [activeProjectAdoptionWorkspace, setActiveProjectAdoptionWorkspace] = useState<string | null>(null);
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();

  // Persist section collapsed state across reloads.
  const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...next]));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const SectionLabel = useCallback(
    ({ sectionKey, label, trailing }: { sectionKey: string; label: string; trailing?: React.ReactNode }) => {
      const isCollapsed = collapsedSections.has(sectionKey);
      return (
        <div
          className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer'
          onClick={() => toggleSection(sectionKey)}
        >
          <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
            {label}
          </span>
          <span className='ml-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
            <Right
              theme='outline'
              size={12}
              className={classNames('transition-transform duration-150', { 'rotate-90': !isCollapsed })}
            />
          </span>
          {trailing && (
            <div className='ml-auto' onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
        </div>
      );
    },
    [collapsedSections, toggleSection]
  );

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
  } = useConversations(archived);

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    projectAdoptionConversation,
    dropdownVisibleId,
    handleConversationClick,
    handleDeleteClick,
    handleBatchDelete,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleArchive,
    handleRestore,
    handleReset,
    handleMoveToProject,
    handleProjectAdoption,
    handleProjectAdoptionConfirm,
    handleProjectAdoptionCancel,
    handleMenuVisibleChange,
    handleOpenMenu,
  } = useConversationActions({
    batchMode,
    conversations,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
  });

  const {
    exportTask,
    exportModalVisible,
    exportTargetPath,
    exportFileName,
    exportModalLoading,
    showExportDirectorySelector,
    setShowExportDirectorySelector,
    setExportFileName,
    closeExportModal,
    handleSelectExportDirectoryFromModal,
    handleSelectExportFolder,
    handleExportConversation,
    handleBatchExport,
    handleConfirmExport,
  } = useExport({
    conversations,
    selectedConversationIds,
    setSelectedConversationIds,
    onBatchModeChange,
  });

  const { sensors, activeId, activeConversation, handleDragStart, handleDragEnd, handleDragCancel, isDragEnabled } =
    useDragAndDrop({
      pinnedConversations,
      batchMode,
      collapsed,
    });

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation): ConversationRowProps => {
      const isGenerating = isConversationGenerating(conversation.id);
      return {
        conversation,
        isGenerating,
        hasCompletionUnread: hasCompletionUnread(conversation.id),
        collapsed,
        tooltipEnabled,
        batchMode,
        checked: selectedConversationIds.has(conversation.id),
        selected: id === conversation.id,
        menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
        onToggleChecked: toggleSelectedConversation,
        onConversationClick: handleConversationClick,
        onOpenMenu: handleOpenMenu,
        onMenuVisibleChange: handleMenuVisibleChange,
        onEditStart: handleEditStart,
        onDelete: handleDeleteClick,
        onExport: handleExportConversation,
        onTogglePin: handleTogglePin,
        onArchive: handleArchive,
        onRestore: handleRestore,
        onReset: handleReset,
        onMoveToProject:
          !archived && !isGenerating && isProjectlessCanonicalConversation(conversation)
            ? handleMoveToProject
            : undefined,
        archivedView: archived,
        getJobStatus,
      };
    },
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      hasCompletionUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleEditStart,
      handleDeleteClick,
      handleExportConversation,
      handleTogglePin,
      handleArchive,
      handleRestore,
      handleReset,
      handleMoveToProject,
      archived,
      getJobStatus,
    ]
  );

  const renderConversation = (conversation: TChatConversation, dimIcon = false) => {
    const rowProps = getConversationRowProps(conversation);
    return <ConversationRow key={conversation.id} {...rowProps} dimIcon={dimIcon} />;
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  // Codex-style split: project folders (workspaces) on top, free conversations below.
  // Projects section: collect all workspace groups across timeline sections, ordered by recency.
  const workspaceGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{ workspace: string; displayName: string; conversations: TChatConversation[] }> = [];
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'workspace' && item.workspaceGroup && !seen.has(item.workspaceGroup.workspace)) {
          seen.add(item.workspaceGroup.workspace);
          groups.push({
            workspace: item.workspaceGroup.workspace,
            displayName: item.workspaceGroup.display_name,
            conversations: item.workspaceGroup.conversations,
          });
        }
      }
    }
    return groups;
  }, [timelineSections]);

  const startWorkspaceConversation = useCallback(
    (workspace: string) => {
      void navigate('/guid', { state: { workspace } });
    },
    [navigate]
  );

  const resetProjectAdoptionDrag = useCallback(() => {
    setActiveProjectAdoptionConversation(null);
    setActiveProjectAdoptionWorkspace(null);
  }, []);

  const handleProjectAdoptionDrop = useCallback(
    (workspace: string) => {
      const conversation = activeProjectAdoptionConversation;
      resetProjectAdoptionDrag();
      if (conversation) void handleProjectAdoption(conversation, workspace);
    },
    [activeProjectAdoptionConversation, handleProjectAdoption, resetProjectAdoptionDrag]
  );

  // Conversations section: keep timeline grouping (today/yesterday/...) but only show non-workspace conversations.
  const conversationOnlySections = useMemo(
    () =>
      timelineSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.type === 'conversation' && item.conversation),
        }))
        .filter((section) => section.items.length > 0),
    [timelineSections]
  );

  const projectAdoptionDragEnabled = !archived && !batchMode && !collapsed && !isMobile && workspaceGroups.length > 0;

  const renderProjectlessConversation = (conversation: TChatConversation) => {
    const eligible = isProjectlessCanonicalConversation(conversation) && !isConversationGenerating(conversation.id);
    const draggable = projectAdoptionDragEnabled && eligible;
    return (
      <div
        key={conversation.id}
        draggable={draggable}
        onDragStart={(event) => {
          if (!draggable) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', conversation.id);
          setActiveProjectAdoptionConversation(conversation);
        }}
        onDragEnd={resetProjectAdoptionDrag}
        className={classNames('min-w-0', {
          'opacity-55': activeProjectAdoptionConversation?.id === conversation.id,
        })}
      >
        {renderConversation(conversation)}
      </div>
    );
  };

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
    return (
      <>
        {afterPinnedContent}
        <div
          className='chat-history__placeholder flex flex-col items-center justify-center gap-8px px-12px py-32px text-center text-t-tertiary'
          data-testid='conversation-history-empty'
        >
          <span className='flex h-20px w-20px items-center justify-center leading-none' aria-hidden='true'>
            <MessageOne theme='outline' size='20' fill='currentColor' />
          </span>
          <span className='text-13px leading-18px'>
            {t(archived ? 'conversation.history.noArchived' : 'conversation.history.noHistory')}
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={handleRenameConfirm}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>

      <Modal
        visible={exportModalVisible}
        title={t('conversation.history.exportDialogTitle')}
        onCancel={closeExportModal}
        footer={null}
        style={{ borderRadius: '12px' }}
        className='conversation-export-modal'
        alignCenter
        getPopupContainer={() => document.body}
      >
        <div className='py-8px'>
          <div className='text-14px mb-16px text-t-secondary'>
            {exportTask?.mode === 'batch'
              ? t('conversation.history.exportDialogBatchDescription', { count: exportTask.conversation_ids.length })
              : t('conversation.history.exportDialogSingleDescription')}
          </div>

          <div className='mb-16px p-16px rounded-12px bg-fill-1'>
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportFileName')}</div>
            <Input
              className='mb-16px'
              value={exportFileName}
              onChange={setExportFileName}
              disabled={exportModalLoading}
            />
            <div className='text-14px mb-8px text-t-primary'>{t('conversation.history.exportTargetFolder')}</div>
            <div
              className='flex items-center justify-between px-12px py-10px rounded-8px transition-colors'
              style={{
                backgroundColor: 'var(--color-bg-1)',
                border: '1px solid var(--color-border-2)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
                opacity: exportModalLoading ? 0.55 : 1,
              }}
              onClick={() => {
                void handleSelectExportFolder();
              }}
            >
              <span
                className='text-14px overflow-hidden text-ellipsis whitespace-nowrap'
                style={{ color: exportTargetPath ? 'var(--color-text-1)' : 'var(--color-text-3)' }}
              >
                {exportTargetPath || t('conversation.history.exportSelectFolder')}
              </span>
              <FolderOpen theme='outline' size='18' fill='var(--color-text-3)' />
            </div>
          </div>

          <div className='flex items-center gap-8px mb-20px text-14px text-t-secondary'>
            <Tips theme='outline' size='16' fill='currentColor' aria-hidden='true' />
            <span>{t('conversation.history.exportDialogHint')}</span>
          </div>

          <div className='flex gap-12px justify-end'>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={closeExportModal}
            >
              {t('common.cancel')}
            </button>
            <button
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: 'none',
                backgroundColor: exportModalLoading ? 'var(--color-fill-3)' : 'var(--color-text-1)',
                color: 'var(--color-bg-1)',
                cursor: exportModalLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '0.85';
                }
              }}
              onMouseLeave={(event) => {
                if (!exportModalLoading) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
              onClick={() => {
                void handleConfirmExport();
              }}
              disabled={exportModalLoading}
            >
              {exportModalLoading ? t('conversation.history.exporting') : t('common.confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <DirectorySelectionModal
        visible={showExportDirectorySelector}
        onConfirm={handleSelectExportDirectoryFromModal}
        onCancel={() => setShowExportDirectorySelector(false)}
      />

      <DirectorySelectionModal
        visible={projectAdoptionConversation !== null}
        onConfirm={(paths) => {
          void handleProjectAdoptionConfirm(paths);
        }}
        onCancel={handleProjectAdoptionCancel}
      />

      {batchMode && !collapsed && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                icon={<Export theme='outline' size='14' />}
                onClick={handleBatchExport}
              >
                {t('conversation.history.batchExport')}
              </Button>
              <Button
                className='!col-span-2 !w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                onClick={handleBatchDelete}
              >
                {t('conversation.history.batchDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div>
        {/* L1: Pinned section */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {pinnedConversations.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='pinned' label={t('conversation.history.pinnedSection')} />}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedConversations.map((conversation) => {
                      const props = getConversationRowProps(conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={conversation.id} {...props} />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          )}

          <DragOverlay dropAnimation={null}>
            {activeId && activeConversation ? <DragOverlayContent conversation={activeConversation} /> : null}
          </DragOverlay>
        </DndContext>

        {/* Slot 由父级（Sider）填入：例如 Team / CronJob sections，位于「置顶」之后、「项目」之前 */}
        {afterPinnedContent}

        {/* L1: Projects section — workspace folders, peer to conversations */}
        {workspaceGroups.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && <SectionLabel sectionKey='projects' label={t('conversation.history.projectsSection')} />}
            {!collapsedSections.has('projects') &&
              workspaceGroups.map((group) => {
                return (
                  <div
                    key={group.workspace}
                    className={classNames('min-w-0 rd-8px transition-colors', {
                      'bg-fill-2': activeProjectAdoptionWorkspace === group.workspace,
                    })}
                    onDragEnter={(event) => {
                      if (!activeProjectAdoptionConversation) return;
                      event.preventDefault();
                      setActiveProjectAdoptionWorkspace(group.workspace);
                    }}
                    onDragOver={(event) => {
                      if (!activeProjectAdoptionConversation) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDragLeave={(event) => {
                      const nextTarget = event.relatedTarget;
                      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                      setActiveProjectAdoptionWorkspace(null);
                    }}
                    onDrop={(event) => {
                      if (!activeProjectAdoptionConversation) return;
                      event.preventDefault();
                      handleProjectAdoptionDrop(group.workspace);
                    }}
                  >
                    <WorkspaceCollapse
                      expanded={expandedWorkspaces.includes(group.workspace)}
                      onToggle={() => handleToggleWorkspace(group.workspace)}
                      siderCollapsed={collapsed}
                      header={
                        <span className='text-14px font-[500] truncate flex-1 text-t-primary min-w-0'>
                          {group.displayName}
                        </span>
                      }
                      trailing={
                        !archived ? (
                          <span className='flex items-center gap-6px'>
                            <Tooltip content={t('conversation.history.newConversationWithWorkspace')} position='top'>
                              <span
                                role='button'
                                tabIndex={0}
                                aria-label={t('conversation.history.newConversationWithWorkspace')}
                                className={classNames(
                                  'opl-codex-icon-button flex-center cursor-pointer sider-action-btn',
                                  isMobile ? 'flex' : 'hidden group-hover:flex'
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startWorkspaceConversation(group.workspace);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    startWorkspaceConversation(group.workspace);
                                  }
                                }}
                              >
                                <Plus theme='outline' size='14' fill='currentColor' className='block leading-none' />
                              </span>
                            </Tooltip>
                          </span>
                        ) : null
                      }
                    >
                      <div className={classNames('flex flex-col min-w-0', { 'mt-1px': !collapsed })}>
                        {group.conversations.map((conversation) => renderConversation(conversation, true))}
                      </div>
                    </WorkspaceCollapse>
                  </div>
                );
              })}
          </div>
        )}

        {/* L1: Conversations section — peer to projects, internally split by timeline */}
        {conversationOnlySections.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel sectionKey='conversations' label={t('conversation.history.conversationsSection')} />
            )}
            {!collapsedSections.has('conversations') &&
              conversationOnlySections.map((section) => (
                <div key={section.timeline} className='min-w-0'>
                  {!collapsed && conversationOnlySections.length > 1 && (
                    <div className='flex items-center px-16px h-24px select-none'>
                      <span className='text-12px text-t-secondary font-[500] leading-none'>{section.timeline}</span>
                    </div>
                  )}
                  {section.items.map((item) =>
                    item.type === 'conversation' && item.conversation
                      ? renderProjectlessConversation(item.conversation)
                      : null
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
};

export default WorkspaceGroupedHistory;

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { emitter } from '@/renderer/utils/emitter';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/ui/focus';
import { Message, Modal } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { normalizeConversationCreateErrorCode } from '../../utils/conversationCreateError';
import { isConversationPinned } from '../utils/groupingHelpers';
import {
  adoptProjectlessCanonicalConversation,
  canonicalCodexThreadId,
  executeCanonicalThreadLifecycle,
  finishCanonicalLifecycleWithLocalProjection,
  isProjectlessCanonicalConversation,
} from './canonicalThreadLifecycle';

type UseConversationActionsParams = {
  batchMode: boolean;
  conversations: TChatConversation[];
  onSessionClick?: () => void;
  onBatchModeChange?: (value: boolean) => void;
  selectedConversationIds: Set<string>;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  markAsRead: (conversation_id: string) => void;
};

export const useConversationActions = ({
  batchMode,
  conversations,
  onSessionClick,
  onBatchModeChange,
  selectedConversationIds,
  setSelectedConversationIds,
  toggleSelectedConversation,
  markAsRead,
}: UseConversationActionsParams) => {
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameModalName, setRenameModalName] = useState<string>('');
  const [renameModalId, setRenameModalId] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [projectAdoptionConversation, setProjectAdoptionConversation] = useState<TChatConversation | null>(null);
  const [dropdownVisibleId, setDropdownVisibleId] = useState<string | null>(null);
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const materializingThreadIdsRef = useRef(new Set<string>());
  const adoptingThreadIdsRef = useRef(new Set<string>());
  const workspaceRepairThreadIdsRef = useRef(new Set<string>());

  // Close dropdown when entering batch mode
  useEffect(() => {
    if (batchMode) {
      setDropdownVisibleId(null);
    }
  }, [batchMode]);

  const handleConversationClick = useCallback(
    (conversation: TChatConversation) => {
      setDropdownVisibleId(null);
      if (batchMode) {
        toggleSelectedConversation(conversation);
        return;
      }
      blockMobileInputFocus();
      blurActiveElement();

      void (async () => {
        let conversationId = conversation.id;
        if (conversation.type === 'acp' && conversation.extra.canonical_thread_stub) {
          const threadId = conversation.extra.canonical_thread_id ?? conversation.extra.acp_session_id;
          if (!threadId || materializingThreadIdsRef.current.has(threadId)) return;
          materializingThreadIdsRef.current.add(threadId);
          try {
            const createdConversation = await ipcBridge.conversation.createWithConversation.invoke({
              conversation: {
                ...conversation,
                extra: { ...conversation.extra, canonical_thread_stub: false },
              },
            });
            conversationId = createdConversation.id;
            emitter.emit('chat.history.refresh');
          } catch (error) {
            console.error('Failed to materialize canonical Codex task:', error);
            if (
              normalizeConversationCreateErrorCode(error) === 'WORKSPACE_PATH_UNAVAILABLE' &&
              conversation.extra.workspace?.trim()
            ) {
              workspaceRepairThreadIdsRef.current.add(threadId);
              setProjectAdoptionConversation(conversation);
              return;
            }
            Message.error(t('conversation.createFailed'));
            return;
          } finally {
            materializingThreadIdsRef.current.delete(threadId);
          }
        }

        markAsRead(conversationId);
        void navigate(`/conversation/${conversationId}`);
        onSessionClick?.();
      })();
    },
    [batchMode, toggleSelectedConversation, markAsRead, navigate, onSessionClick, t]
  );

  const removeConversation = useCallback(
    async (conversation: TChatConversation) => {
      const canonicalResult = await executeCanonicalThreadLifecycle(conversation, {
        action: 'delete',
        reason: 'Delete task from the task directory',
      });
      const success = await finishCanonicalLifecycleWithLocalProjection(canonicalResult, () =>
        ipcBridge.conversation.remove.invoke({ id: conversation.id })
      );
      if (!success) return false;

      emitter.emit('conversation.deleted', conversation.id);
      if (id === conversation.id) {
        void navigate('/');
      }
      return true;
    },
    [id, navigate]
  );

  const handleDeleteClick = useCallback(
    (conversation_id: string) => {
      const conversation = conversations.find((candidate) => candidate.id === conversation_id);
      if (!conversation) return;
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const success = await removeConversation(conversation);
            if (success) {
              emitter.emit('chat.history.refresh');
              Message.success(t('conversation.history.deleteSuccess'));
            } else {
              Message.error(t('conversation.history.deleteFailed'));
            }
          } catch (error) {
            console.error('Failed to remove conversation:', error);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [conversations, removeConversation, t]
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }

    Modal.confirm({
      title: t('conversation.history.batchDelete'),
      content: t('conversation.history.batchDeleteConfirm', { count: selectedConversationIds.size }),
      okText: t('conversation.history.confirmDelete'),
      cancelText: t('conversation.history.cancelDelete'),
      okButtonProps: { status: 'warning' },
      onOk: async () => {
        const selectedIds = Array.from(selectedConversationIds);
        try {
          const selected = conversations.filter((conversation) => selectedIds.includes(conversation.id));
          const results = await Promise.all(selected.map((conversation) => removeConversation(conversation)));
          const successCount = results.filter(Boolean).length;
          emitter.emit('chat.history.refresh');
          if (successCount > 0) {
            Message.success(t('conversation.history.batchDeleteSuccess', { count: successCount }));
          } else {
            Message.error(t('conversation.history.deleteFailed'));
          }
        } catch (error) {
          console.error('Failed to batch delete conversations:', error);
          Message.error(t('conversation.history.deleteFailed'));
        } finally {
          setSelectedConversationIds(new Set());
          onBatchModeChange?.(false);
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [conversations, onBatchModeChange, removeConversation, selectedConversationIds, t, setSelectedConversationIds]);

  const handleEditStart = useCallback((conversation: TChatConversation) => {
    setRenameModalId(conversation.id);
    setRenameModalName(conversation.name);
    setRenameModalVisible(true);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameModalId || !renameModalName.trim()) return;

    setRenameLoading(true);
    try {
      const conversation = conversations.find((candidate) => candidate.id === renameModalId);
      const canonicalResult = await executeCanonicalThreadLifecycle(conversation, {
        action: 'rename',
        name: renameModalName.trim(),
        reason: 'Rename task from the task directory',
      });
      const success = await finishCanonicalLifecycleWithLocalProjection(canonicalResult, () =>
        ipcBridge.conversation.update.invoke({
          id: renameModalId,
          updates: { name: renameModalName.trim() },
        })
      );

      if (success) {
        await refreshConversationCache(renameModalId);
        emitter.emit('chat.history.refresh');
        setRenameModalVisible(false);
        setRenameModalId(null);
        setRenameModalName('');
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        Message.error(t('conversation.history.renameFailed'));
      }
    } catch (error) {
      console.error('Failed to update conversation name:', error);
      Message.error(t('conversation.history.renameFailed'));
    } finally {
      setRenameLoading(false);
    }
  }, [conversations, renameModalId, renameModalName, t]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setRenameModalId(null);
    setRenameModalName('');
  }, []);

  const handleTogglePin = useCallback(
    async (conversation: TChatConversation) => {
      const pinned = isConversationPinned(conversation);

      try {
        const pinUpdate = {
          pinned: !pinned,
          pinned_at: pinned ? undefined : Date.now(),
        } as Partial<TChatConversation['extra']>;
        let success: boolean;
        if (conversation.type === 'acp' && conversation.extra.canonical_thread_stub) {
          await ipcBridge.conversation.createWithConversation.invoke({
            conversation: {
              ...conversation,
              extra: {
                ...conversation.extra,
                ...pinUpdate,
                canonical_thread_stub: false,
              },
            },
          });
          success = true;
        } else {
          success = await ipcBridge.conversation.update.invoke({
            id: conversation.id,
            updates: { extra: pinUpdate } as Partial<TChatConversation>,
            merge_extra: true,
          });
        }

        if (success) {
          emitter.emit('chat.history.refresh');
        } else {
          Message.error(t('conversation.history.pinFailed'));
        }
      } catch (error) {
        console.error('Failed to toggle pin conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const setArchivedState = useCallback(
    async (conversation: TChatConversation, archived: boolean) => {
      try {
        const canonicalResult = await executeCanonicalThreadLifecycle(conversation, {
          action: archived ? 'archive' : 'unarchive',
          reason: archived ? 'Archive task from the task directory' : 'Restore task to the task directory',
        });
        const success = await finishCanonicalLifecycleWithLocalProjection(canonicalResult, () =>
          ipcBridge.conversation.update.invoke({
            id: conversation.id,
            updates: {
              extra: {
                archived,
                archived_at: archived ? Date.now() : undefined,
              } as Partial<TChatConversation['extra']>,
            } as Partial<TChatConversation>,
            merge_extra: true,
          })
        );
        if (!success) {
          Message.error(t(archived ? 'conversation.history.archiveFailed' : 'conversation.history.restoreFailed'));
          return;
        }

        emitter.emit('chat.history.refresh');
        Message.success(t(archived ? 'conversation.history.archiveSuccess' : 'conversation.history.restoreSuccess'));
        if (archived && id === conversation.id) {
          void navigate('/guid');
        }
      } catch (error) {
        console.error(`Failed to ${archived ? 'archive' : 'restore'} conversation:`, error);
        Message.error(t(archived ? 'conversation.history.archiveFailed' : 'conversation.history.restoreFailed'));
      }
    },
    [id, navigate, t]
  );

  const handleArchive = useCallback(
    (conversation: TChatConversation) => {
      void setArchivedState(conversation, true);
    },
    [setArchivedState]
  );

  const handleRestore = useCallback(
    (conversation: TChatConversation) => {
      void setArchivedState(conversation, false);
    },
    [setArchivedState]
  );

  const handleReset = useCallback(
    (conversation_id: string) => {
      Modal.confirm({
        title: t('conversation.history.resetTitle'),
        content: t('conversation.history.resetConfirm'),
        okText: t('conversation.history.confirmReset'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          try {
            await ipcBridge.conversation.reset.invoke({ id: conversation_id });
            emitter.emit('conversation.reset', conversation_id);
            emitter.emit('chat.history.refresh');
            Message.success(t('conversation.history.resetSuccess'));
          } catch (error) {
            console.error('Failed to reset conversation:', error);
            Message.error(t('conversation.history.resetFailed'));
          }
        },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [t]
  );

  const handleProjectAdoption = useCallback(
    async (conversation: TChatConversation, workspace: string): Promise<boolean> => {
      const threadId = canonicalCodexThreadId(conversation);
      const repairingUnavailableWorkspace = threadId ? workspaceRepairThreadIdsRef.current.has(threadId) : false;
      if (!isProjectlessCanonicalConversation(conversation) && !repairingUnavailableWorkspace) return false;
      if (!threadId || adoptingThreadIdsRef.current.has(threadId)) return false;

      adoptingThreadIdsRef.current.add(threadId);
      try {
        const success = await adoptProjectlessCanonicalConversation(conversation, workspace, {
          allowExistingWorkspace: repairingUnavailableWorkspace,
        });
        if (!success) {
          Message.error(t('conversation.history.moveToProjectFailed'));
          return false;
        }
        workspaceRepairThreadIdsRef.current.delete(threadId);
        emitter.emit('chat.history.refresh');
        Message.success(t('conversation.history.moveToProjectSuccess'));
        return true;
      } finally {
        adoptingThreadIdsRef.current.delete(threadId);
      }
    },
    [t]
  );

  const handleMoveToProject = useCallback((conversation: TChatConversation) => {
    if (!isProjectlessCanonicalConversation(conversation)) return;
    setDropdownVisibleId(null);
    setProjectAdoptionConversation(conversation);
  }, []);

  const handleProjectAdoptionConfirm = useCallback(
    async (paths: string[] | undefined) => {
      const workspace = paths?.[0]?.trim();
      if (!workspace || !projectAdoptionConversation) return;
      if (await handleProjectAdoption(projectAdoptionConversation, workspace)) {
        setProjectAdoptionConversation(null);
      }
    },
    [handleProjectAdoption, projectAdoptionConversation]
  );

  const handleProjectAdoptionCancel = useCallback(() => {
    const threadId = canonicalCodexThreadId(projectAdoptionConversation);
    if (threadId) workspaceRepairThreadIdsRef.current.delete(threadId);
    setProjectAdoptionConversation(null);
  }, [projectAdoptionConversation]);

  const handleMenuVisibleChange = useCallback((conversation_id: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversation_id : null);
  }, []);

  const handleOpenMenu = useCallback((conversation: TChatConversation) => {
    setDropdownVisibleId(conversation.id);
  }, []);

  return {
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
  };
};

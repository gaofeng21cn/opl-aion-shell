/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { isConversationArchived } from '../utils/groupingHelpers';
import type { GroupedHistoryResult } from '../types';
import { canonicalCodexThreadId } from './canonicalThreadLifecycle';
import {
  dispatchWorkspaceExpansionChange,
  readExpandedWorkspaces,
  ARCHIVED_WORKSPACE_EXPANSION_STORAGE_KEY,
  WORKSPACE_EXPANSION_STORAGE_KEY,
} from './useWorkspaceExpansionState';

export const filterConversationsForHistorySurface = (
  conversations: TChatConversation[],
  archived: boolean,
  canonicalArchiveStateByThreadId: ReadonlyMap<string, boolean>
): TChatConversation[] => {
  return conversations.filter((conversation) => {
    const threadId = canonicalCodexThreadId(conversation);
    if (!threadId) return isConversationArchived(conversation) === archived;

    const canonicalArchived = canonicalArchiveStateByThreadId.get(threadId);
    if (canonicalArchived !== undefined) return canonicalArchived === archived;
    return isConversationArchived(conversation) === archived;
  });
};

export const filterHistoryToConversationIds = (
  history: GroupedHistoryResult,
  visibleConversationIds: ReadonlySet<string>
): GroupedHistoryResult => ({
  pinnedConversations: history.pinnedConversations.filter((conversation) =>
    visibleConversationIds.has(conversation.id)
  ),
  timelineSections: history.timelineSections
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          const conversations = item.workspaceGroup.conversations.filter((conversation) =>
            visibleConversationIds.has(conversation.id)
          );
          return conversations.length > 0
            ? [{ ...item, workspaceGroup: { ...item.workspaceGroup, conversations } }]
            : [];
        }
        return item.conversation && visibleConversationIds.has(item.conversation.id) ? [item] : [];
      }),
    }))
    .filter((section) => section.items.length > 0),
});

export const useConversations = (archived = false) => {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => readExpandedWorkspaces(archived));
  const { id } = useParams();
  const {
    conversations,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    clearCompletionUnread,
    setActiveConversation,
    groupedHistory,
    archivedHistory,
    canonicalArchiveStateByThreadId,
  } = useConversationHistoryContext();

  // Track whether auto-expand has already been performed to avoid
  // re-expanding workspaces after a user manually collapses them (#1156)
  const hasAutoExpandedRef = useRef(false);

  // Scroll active conversation into view.
  // Use double-RAF to wait for async sibling content (e.g. CronJobSiderSection)
  // to finish rendering before calculating scroll position.
  useEffect(() => {
    if (!id) {
      setActiveConversation(null);
      return;
    }

    setActiveConversation(id);
    clearCompletionUnread(id);
    let cancelled = false;
    let outerRafId: number;
    let innerRafId: number;
    outerRafId = requestAnimationFrame(() => {
      innerRafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const element = document.getElementById('c-' + id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRafId);
      cancelAnimationFrame(innerRafId);
    };
  }, [clearCompletionUnread, id, setActiveConversation]);

  // Persist expansion state
  useEffect(() => {
    try {
      localStorage.setItem(
        archived ? ARCHIVED_WORKSPACE_EXPANSION_STORAGE_KEY : WORKSPACE_EXPANSION_STORAGE_KEY,
        JSON.stringify(expandedWorkspaces)
      );
    } catch {
      // ignore
    }

    dispatchWorkspaceExpansionChange(expandedWorkspaces, archived);
  }, [archived, expandedWorkspaces]);

  const visibleConversations = filterConversationsForHistorySurface(
    conversations,
    archived,
    canonicalArchiveStateByThreadId
  );
  const visibleConversationIds = new Set(visibleConversations.map((conversation) => conversation.id));
  const history = filterHistoryToConversationIds(archived ? archivedHistory : groupedHistory, visibleConversationIds);
  const { pinnedConversations, timelineSections } = history;

  // Auto-expand all workspaces on first load only (#1156)
  useEffect(() => {
    if (hasAutoExpandedRef.current) return;
    if (expandedWorkspaces.length > 0) {
      hasAutoExpandedRef.current = true;
      return;
    }
    const allWorkspaces: string[] = [];
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          allWorkspaces.push(item.workspaceGroup.workspace);
        }
      });
    });
    if (allWorkspaces.length > 0) {
      setExpandedWorkspaces(allWorkspaces);
      hasAutoExpandedRef.current = true;
    }
  }, [timelineSections]);

  // Remove stale workspace entries that no longer exist in the data
  useEffect(() => {
    const currentWorkspaces = new Set<string>();
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          currentWorkspaces.add(item.workspaceGroup.workspace);
        }
      });
    });
    if (currentWorkspaces.size === 0) return;
    setExpandedWorkspaces((prev) => {
      const filtered = prev.filter((ws) => currentWorkspaces.has(ws));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [timelineSections]);

  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((item) => item !== workspace);
      }
      return [...prev, workspace];
    });
  }, []);

  return {
    conversations: visibleConversations,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
  };
};

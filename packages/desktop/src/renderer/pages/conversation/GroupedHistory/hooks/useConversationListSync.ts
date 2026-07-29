/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDirectory } from '@/common/types/codex/appServerThreads';
import {
  canonicalCodexThreadId,
  projectCanonicalCodexThread,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Whitelist of message types that indicate content generation is in progress.
 * Only these types should trigger the sidebar loading spinner.
 * Using a whitelist (instead of a blacklist) prevents unknown/internal message
 * types (e.g. slash_commands_updated, acp_context_usage) from falsely
 * triggering the generating state.
 */
const isGeneratingStreamMessage = (type: string): boolean => {
  return (
    type === 'content' ||
    type === 'start' ||
    type === 'thought' ||
    type === 'thinking' ||
    type === 'tool_group' ||
    type === 'acp_tool_call' ||
    type === 'acp_permission' ||
    type === 'permission' ||
    type === 'plan'
  );
};

const isTerminalAgentStatus = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const { status } = data as { status?: string };
  return status === 'error' || status === 'disconnected';
};

const isTerminalStreamMessage = (message: { type: string; data: unknown }): boolean => {
  return (
    message.type === 'finish' ||
    message.type === 'error' ||
    (message.type === 'agent_status' && isTerminalAgentStatus(message.data))
  );
};

const isTerminalTurnState = (state: string): boolean => {
  return state === 'ai_waiting_input' || state === 'error' || state === 'stopped';
};

export type SidebarStreamGuardDecision = {
  markGenerating: boolean;
  clearCompleted: boolean;
  lateIgnored: boolean;
};

export const getSidebarStreamGuardDecision = ({
  type,
  completed,
}: {
  type: string;
  completed: boolean;
}): SidebarStreamGuardDecision => {
  if (!isGeneratingStreamMessage(type)) {
    return {
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    };
  }

  if (type === 'start') {
    return {
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    };
  }

  if (completed) {
    return {
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    };
  }

  return {
    markGenerating: true,
    clearCompleted: false,
    lateIgnored: false,
  };
};

type ConversationListSyncSnapshot = {
  conversations: TChatConversation[];
  generatingConversationIds: Set<string>;
  completionUnreadConversationIds: Set<string>;
  canonicalArchiveStateByThreadId: ReadonlyMap<string, boolean>;
};

const listeners = new Set<() => void>();

let isStoreInitialized = false;
let conversationsState: TChatConversation[] = [];
let generatingConversationIdsState = new Set<string>();
let completionUnreadConversationIdsState = new Set<string>();
let completedConversationIdsState = new Set<string>();
let conversation_idsState = new Set<string>();
let pendingCanonicalConversationIdsState = new Set<string>();
let canonicalArchiveStateByThreadIdState = new Map<string, boolean>();
let refreshSequenceState = 0;
let activeConversationIdState: string | null = null;
let snapshotState: ConversationListSyncSnapshot = {
  conversations: conversationsState,
  generatingConversationIds: generatingConversationIdsState,
  completionUnreadConversationIds: completionUnreadConversationIdsState,
  canonicalArchiveStateByThreadId: canonicalArchiveStateByThreadIdState,
};

const emitStoreChange = () => {
  snapshotState = {
    conversations: conversationsState,
    generatingConversationIds: generatingConversationIdsState,
    completionUnreadConversationIds: completionUnreadConversationIdsState,
    canonicalArchiveStateByThreadId: canonicalArchiveStateByThreadIdState,
  };
  listeners.forEach((listener) => listener());
};

const subscribeConversationListSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getConversationListSyncSnapshot = (): ConversationListSyncSnapshot => snapshotState;

/**
 * Codex app-server owns task identity and lifecycle. Shell rows only add local
 * UI preferences or provide a lazy, rebuildable projection for unseen tasks.
 */
export const mergeCanonicalThreadDirectory = (
  localConversations: TChatConversation[],
  directory: CodexThreadDirectory | null,
  preserveLocalConversationIds: ReadonlySet<string> = new Set()
): TChatConversation[] => {
  if (!directory) return localConversations;

  const returnedThreadIds = new Set(directory.threads.map((thread) => thread.id));
  const cachedByThreadId = new Map<string, Extract<TChatConversation, { type: 'acp' }>>();
  const unmatchedLocal = localConversations.filter((conversation) => {
    const threadId = canonicalCodexThreadId(conversation);
    if (threadId && returnedThreadIds.has(threadId)) {
      cachedByThreadId.set(threadId, conversation as Extract<TChatConversation, { type: 'acp' }>);
      return false;
    }

    // Only a complete overview may retire unmatched Codex cache rows. A bounded
    // recent directory remains useful without turning older local rows into ghosts.
    if (!directory.complete) return true;
    if (preserveLocalConversationIds.has(conversation.id)) return true;
    return conversation.type !== 'acp' || conversation.extra.backend !== 'codex';
  });

  directory.threads.forEach((thread) => {
    const cached = cachedByThreadId.get(thread.id);
    if (!cached) return;
    const canonicalProjectId = thread.projectId.trim() || cached.extra.canonical_project_id?.trim() || '';
    cachedByThreadId.set(thread.id, {
      ...cached,
      extra: {
        ...cached.extra,
        workspace: thread.workspace,
        custom_workspace: Boolean(canonicalProjectId),
        canonical_project_id: canonicalProjectId || undefined,
      },
    });
  });

  return [
    ...unmatchedLocal,
    ...directory.threads.map((thread) => projectCanonicalCodexThread(thread, cachedByThreadId.get(thread.id))),
  ];
};

export const visibleConversationIds = (conversations: TChatConversation[]): Set<string> => {
  return new Set(conversations.map((conversation) => conversation.id));
};

const refreshConversations = (createdConversation?: TChatConversation) => {
  if (
    createdConversation?.type === 'acp' &&
    createdConversation.extra.backend === 'codex' &&
    canonicalCodexThreadId(createdConversation)
  ) {
    pendingCanonicalConversationIdsState = new Set(pendingCanonicalConversationIdsState).add(createdConversation.id);
  }

  const refreshSequence = ++refreshSequenceState;
  void Promise.allSettled([
    ipcBridge.database.getUserConversations.invoke({ limit: 10000 }),
    ipcBridge.codexThreads.list.invoke({ includeArchived: true }),
  ]).then(([localResult, canonicalResult]) => {
    if (refreshSequence !== refreshSequenceState) return;

    const items =
      localResult.status === 'fulfilled' && Array.isArray(localResult.value?.items) ? localResult.value.items : [];
    if (localResult.status === 'rejected') {
      console.error('[WorkspaceGroupedHistory] Failed to load shell conversation cache:', localResult.reason);
    }
    if (canonicalResult.status === 'rejected') {
      console.error('[WorkspaceGroupedHistory] Failed to load canonical Codex task directory:', canonicalResult.reason);
    }

    const filteredData = items.filter((conv) => {
      // Legacy rows from the pre-provider-probe health check flow are hidden
      // from normal history. New health checks must not create conversations.
      const extra = conv.extra as { is_health_check?: boolean; team_id?: string; teamId?: string } | undefined;
      return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId;
    });
    const canonicalDirectory = canonicalResult.status === 'fulfilled' ? canonicalResult.value : null;
    if (canonicalDirectory && canonicalDirectory.host !== 'webui-local-cache') {
      const nextArchiveStateByThreadId = canonicalDirectory.complete
        ? new Map<string, boolean>()
        : new Map(canonicalArchiveStateByThreadIdState);
      canonicalDirectory.threads.forEach((thread) => {
        nextArchiveStateByThreadId.set(thread.id, thread.archived);
      });
      canonicalArchiveStateByThreadIdState = nextArchiveStateByThreadId;
    }
    conversationsState = mergeCanonicalThreadDirectory(
      filteredData,
      canonicalDirectory,
      pendingCanonicalConversationIdsState
    );
    conversation_idsState = visibleConversationIds(conversationsState);

    if (canonicalDirectory) {
      const returnedThreadIds = new Set(canonicalDirectory.threads.map((thread) => thread.id));
      const localById = new Map(items.map((conversation) => [conversation.id, conversation]));
      pendingCanonicalConversationIdsState = new Set(
        [...pendingCanonicalConversationIdsState].filter((conversationId) => {
          const threadId = canonicalCodexThreadId(localById.get(conversationId));
          return Boolean(threadId && !returnedThreadIds.has(threadId));
        })
      );
    }
    emitStoreChange();
  });
};

const markGenerating = (conversation_id: string) => {
  if (generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  generatingConversationIdsState = new Set(generatingConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearGenerating = (conversation_id: string) => {
  if (!generatingConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(generatingConversationIdsState);
  next.delete(conversation_id);
  generatingConversationIdsState = next;
  emitStoreChange();
};

const markCompletionUnread = (conversation_id: string) => {
  if (completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  completionUnreadConversationIdsState = new Set(completionUnreadConversationIdsState).add(conversation_id);
  emitStoreChange();
};

const clearCompletionUnreadState = (conversation_id: string) => {
  if (!completionUnreadConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completionUnreadConversationIdsState);
  next.delete(conversation_id);
  completionUnreadConversationIdsState = next;
  emitStoreChange();
};

const markCompleted = (conversation_id: string) => {
  completedConversationIdsState = new Set(completedConversationIdsState).add(conversation_id);
};

const clearCompleted = (conversation_id: string) => {
  if (!completedConversationIdsState.has(conversation_id)) {
    return;
  }

  const next = new Set(completedConversationIdsState);
  next.delete(conversation_id);
  completedConversationIdsState = next;
};

const logLateStreamIgnored = (conversation_id: string, type: string) => {
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'warn',
      tag: 'conversationRuntimeView',
      message: 'late_stream_ignored_for_runtime',
      data: {
        conversation_id,
        stream_type: type,
      },
    })
    .catch(() => {});
};

const setActiveConversationState = (conversation_id: string | null) => {
  activeConversationIdState = conversation_id;
};

const initializeConversationListSyncStore = () => {
  if (isStoreInitialized) {
    return;
  }

  isStoreInitialized = true;
  refreshConversations();

  addEventListener('chat.history.refresh', refreshConversations);
  ipcBridge.conversation.listChanged.on((event) => {
    if (event.action === 'deleted') {
      clearGenerating(event.conversation_id);
      clearCompletionUnreadState(event.conversation_id);
      clearCompleted(event.conversation_id);
      const nextPendingIds = new Set(pendingCanonicalConversationIdsState);
      nextPendingIds.delete(event.conversation_id);
      pendingCanonicalConversationIdsState = nextPendingIds;
    }
    refreshConversations();
  });
  ipcBridge.conversation.responseStream.on((message) => {
    const conversation_id = message.conversation_id;
    if (!conversation_id) {
      return;
    }

    if (!conversation_idsState.has(conversation_id)) {
      refreshConversations();
    }

    if (isTerminalStreamMessage(message)) {
      const wasGenerating = generatingConversationIdsState.has(conversation_id);
      if (wasGenerating && activeConversationIdState !== conversation_id) {
        markCompletionUnread(conversation_id);
      }
      clearGenerating(conversation_id);
      return;
    }

    const decision = getSidebarStreamGuardDecision({
      type: message.type,
      completed: completedConversationIdsState.has(conversation_id),
    });
    if (decision.clearCompleted) {
      clearCompleted(conversation_id);
    }
    if (decision.lateIgnored) {
      logLateStreamIgnored(conversation_id, message.type);
      return;
    }
    if (decision.markGenerating) {
      markGenerating(conversation_id);
    }
  });
  ipcBridge.conversation.turnCompleted.on((event) => {
    if (isTerminalTurnState(event.state) && activeConversationIdState !== event.session_id) {
      markCompletionUnread(event.session_id);
    }
    markCompleted(event.session_id);
    clearGenerating(event.session_id);
    refreshConversations();
  });
};

export const useConversationListSync = () => {
  useEffect(() => {
    initializeConversationListSyncStore();
  }, []);

  const { conversations, generatingConversationIds, completionUnreadConversationIds } = useSyncExternalStore(
    subscribeConversationListSync,
    getConversationListSyncSnapshot,
    getConversationListSyncSnapshot
  );

  const clearCompletionUnread = useCallback((conversation_id: string) => {
    clearCompletionUnreadState(conversation_id);
  }, []);

  const setActiveConversation = useCallback((conversation_id: string | null) => {
    setActiveConversationState(conversation_id);
  }, []);

  const isConversationGenerating = useCallback(
    (conversation_id: string) => {
      return generatingConversationIds.has(conversation_id);
    },
    [generatingConversationIds]
  );

  const hasCompletionUnread = useCallback(
    (conversation_id: string) => {
      return completionUnreadConversationIds.has(conversation_id);
    },
    [completionUnreadConversationIds]
  );

  return {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    canonicalArchiveStateByThreadId: snapshotState.canonicalArchiveStateByThreadId,
    clearCompletionUnread,
    setActiveConversation,
  };
};

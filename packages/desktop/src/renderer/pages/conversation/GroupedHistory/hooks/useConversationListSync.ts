/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDirectory } from '@/common/types/codex/appServerThreads';
import { readOplTransportBindingsProjection, type OplTransportBinding } from '@/common/types/opl/uiContributions';
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

export type ProjectedTransportThreadBinding = {
  conversationId: string;
  canonicalThreadHost: string;
  threadId: string;
  temporaryWorkspace?: boolean;
};

export const projectTransportBinding = (
  binding: Pick<
    OplTransportBinding,
    'channelSessionId' | 'canonicalThreadHost' | 'canonicalThreadId' | 'projectAffinity'
  >
): ProjectedTransportThreadBinding => ({
  conversationId: binding.channelSessionId,
  canonicalThreadHost: binding.canonicalThreadHost,
  threadId: binding.canonicalThreadId,
  temporaryWorkspace: binding.projectAffinity === 'projectless',
});

export type LegacyWeixinCanonicalThreadBinding = {
  conversationId: string;
  threadId: string;
};

const workspaceLeaf = (workspace: string): string => {
  const normalized = workspace
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
  return normalized.split('/').at(-1) ?? '';
};

const isWeixinCodexTransportConversation = (conversation: TChatConversation): boolean => {
  return conversation.source === 'weixin' && conversation.type === 'acp' && conversation.extra.backend === 'codex';
};

// Temporary migration fallback until the shared provider callback produces transport bindings end to end.
export const inferLegacyWeixinCanonicalThreadBindings = (
  localConversations: TChatConversation[],
  directory: CodexThreadDirectory | null,
  projectedConversationIds: ReadonlySet<string> = new Set()
): LegacyWeixinCanonicalThreadBinding[] => {
  if (!directory) return [];
  const threadByTemporaryWorkspace = new Map<string, (typeof directory.threads)[number] | null>();
  directory.threads.forEach((thread) => {
    const leaf = workspaceLeaf(thread.workspace);
    if (!leaf.startsWith('codex-temp-')) return;
    threadByTemporaryWorkspace.set(leaf, threadByTemporaryWorkspace.has(leaf) ? null : thread);
  });
  return localConversations.flatMap((conversation) => {
    if (
      projectedConversationIds.has(conversation.id) ||
      !isWeixinCodexTransportConversation(conversation) ||
      canonicalCodexThreadId(conversation)
    ) {
      return [];
    }
    const isTemporaryWorkspace = (conversation.extra as { is_temporary_workspace?: boolean }).is_temporary_workspace;
    const expectedWorkspaceLeaf = `codex-temp-${conversation.id}`;
    if (isTemporaryWorkspace !== true || workspaceLeaf(conversation.extra.workspace ?? '') !== expectedWorkspaceLeaf) {
      return [];
    }
    const thread = threadByTemporaryWorkspace.get(expectedWorkspaceLeaf);
    return thread ? [{ conversationId: conversation.id, threadId: thread.id }] : [];
  });
};

const applyLegacyWeixinCanonicalThreadBindings = (
  localConversations: TChatConversation[],
  bindings: LegacyWeixinCanonicalThreadBinding[]
): TChatConversation[] => {
  if (bindings.length === 0) return localConversations;
  const threadIdByConversationId = new Map(bindings.map((binding) => [binding.conversationId, binding.threadId]));
  return localConversations.map((conversation) => {
    const threadId = threadIdByConversationId.get(conversation.id);
    if (!threadId || conversation.type !== 'acp') return conversation;
    return {
      ...conversation,
      extra: {
        ...conversation.extra,
        canonical_thread_id: threadId,
      },
    };
  });
};

const uniqueProjectedTransportBindings = (
  bindings: readonly ProjectedTransportThreadBinding[]
): ReadonlyMap<string, ProjectedTransportThreadBinding> => {
  const unique = new Map<string, ProjectedTransportThreadBinding | null>();
  bindings.forEach((binding) => {
    if (!unique.has(binding.conversationId)) {
      unique.set(binding.conversationId, binding);
      return;
    }
    const current = unique.get(binding.conversationId);
    if (!current) return;
    if (current.threadId !== binding.threadId || current.canonicalThreadHost !== binding.canonicalThreadHost) {
      unique.set(binding.conversationId, null);
      return;
    }
    if (binding.temporaryWorkspace === true && current.temporaryWorkspace !== true) {
      unique.set(binding.conversationId, { ...current, temporaryWorkspace: true });
    }
  });
  return new Map(
    [...unique.entries()].filter((entry): entry is [string, ProjectedTransportThreadBinding] => entry[1] !== null)
  );
};

export const createSingleFlightDirtyReplay = (operation: () => Promise<void>): (() => Promise<void>) => {
  let running = false;
  let dirty = false;
  let activePromise: Promise<void> | null = null;

  const request = (): Promise<void> => {
    dirty = true;
    if (!running) {
      running = true;
      activePromise = (async () => {
        try {
          while (dirty) {
            dirty = false;
            // Refreshes are intentionally serialized; a concurrent request only marks the trailing replay dirty.
            // eslint-disable-next-line no-await-in-loop
            await operation();
          }
        } finally {
          running = false;
          activePromise = null;
          if (dirty) void request().catch(() => {});
        }
      })();
    }
    return activePromise ?? Promise.resolve();
  };

  return request;
};

const listeners = new Set<() => void>();

let isStoreInitialized = false;
let localConversationsState: TChatConversation[] = [];
let canonicalDirectoryState: CodexThreadDirectory | null = null;
let projectedTransportBindingsState: ProjectedTransportThreadBinding[] = [];
let conversationsState: TChatConversation[] = [];
let generatingConversationIdsState = new Set<string>();
let completionUnreadConversationIdsState = new Set<string>();
let completedConversationIdsState = new Set<string>();
let conversation_idsState = new Set<string>();
let pendingCanonicalConversationIdsState = new Set<string>();
let canonicalArchiveStateByThreadIdState = new Map<string, boolean>();
const pendingLocalConversationRefreshIdsState = new Set<string>();
const deletedConversationIdsState = new Set<string>();
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
  preserveLocalConversationIds: ReadonlySet<string> = new Set(),
  projectedTransportBindings: readonly ProjectedTransportThreadBinding[] = []
): TChatConversation[] => {
  if (!directory) return localConversations;

  const projectedBindingByConversationId = uniqueProjectedTransportBindings(projectedTransportBindings);
  const returnedThreadIds = new Set(directory.threads.map((thread) => thread.id));
  const temporaryTransportThreadIds = new Set<string>();
  const cachedByThreadId = new Map<string, Extract<TChatConversation, { type: 'acp' }>>();
  const unmatchedLocal = localConversations.filter((conversation) => {
    const projectedBinding = projectedBindingByConversationId.get(conversation.id);
    const hasProjectedBinding = projectedBindingByConversationId.has(conversation.id);
    const applicableProjectedBinding =
      projectedBinding?.canonicalThreadHost === directory.host ? projectedBinding : null;
    const legacyTransportThreadId =
      !hasProjectedBinding && isWeixinCodexTransportConversation(conversation)
        ? canonicalCodexThreadId(conversation)
        : null;
    const isTransport = hasProjectedBinding || Boolean(legacyTransportThreadId);
    const threadId =
      applicableProjectedBinding?.threadId ??
      legacyTransportThreadId ??
      (!isTransport ? canonicalCodexThreadId(conversation) : null);
    if (threadId && returnedThreadIds.has(threadId)) {
      if (isTransport) {
        const legacyTemporary = (conversation.extra as { is_temporary_workspace?: boolean }).is_temporary_workspace;
        if (applicableProjectedBinding?.temporaryWorkspace === true || legacyTemporary === true) {
          temporaryTransportThreadIds.add(threadId);
        }
      } else if (conversation.type === 'acp') {
        cachedByThreadId.set(threadId, conversation);
      }
      return false;
    }

    if (isWeixinCodexTransportConversation(conversation) || hasProjectedBinding) return true;

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
    ...directory.threads.map((thread) => {
      const projected = projectCanonicalCodexThread(thread, cachedByThreadId.get(thread.id));
      if (!temporaryTransportThreadIds.has(thread.id)) return projected;
      return {
        ...projected,
        extra: {
          ...projected.extra,
          is_temporary_workspace: true,
        },
      };
    }),
  ];
};

export const visibleConversationIds = (conversations: TChatConversation[]): Set<string> => {
  return new Set(conversations.map((conversation) => conversation.id));
};

const isVisibleHistoryConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { is_health_check?: boolean; team_id?: string; teamId?: string } | undefined;
  return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId;
};

const applyConversationProjection = () => {
  conversationsState = mergeCanonicalThreadDirectory(
    localConversationsState.filter(isVisibleHistoryConversation),
    canonicalDirectoryState,
    pendingCanonicalConversationIdsState,
    projectedTransportBindingsState
  );
  conversation_idsState = visibleConversationIds(conversationsState);
  emitStoreChange();
};

const upsertLocalConversation = (conversation: TChatConversation) => {
  const index = localConversationsState.findIndex((candidate) => candidate.id === conversation.id);
  if (index < 0) {
    localConversationsState = [conversation, ...localConversationsState];
    return;
  }
  const next = [...localConversationsState];
  next[index] = conversation;
  localConversationsState = next;
};

const refreshConversationDirectory = async () => {
  const [localResult, canonicalResult, appStateResult] = await Promise.allSettled([
    ipcBridge.database.getUserConversations.invoke({ limit: 10000 }),
    ipcBridge.codexThreads.list.invoke({ includeArchived: true }),
    ipcBridge.oplRuntime.getAppState.invoke({ profile: 'fast' }),
  ]);

  if (localResult.status === 'fulfilled' && Array.isArray(localResult.value?.items)) {
    localConversationsState = localResult.value.items;
  } else if (localResult.status === 'rejected') {
    console.error('[WorkspaceGroupedHistory] Failed to load shell conversation cache:', localResult.reason);
  }
  if (canonicalResult.status === 'rejected') {
    console.error('[WorkspaceGroupedHistory] Failed to load canonical Codex task directory:', canonicalResult.reason);
  }
  const transportBindingsProjection =
    appStateResult.status === 'fulfilled' && appStateResult.value?.ok !== false
      ? readOplTransportBindingsProjection(appStateResult.value?.parsed)
      : readOplTransportBindingsProjection(null);
  projectedTransportBindingsState =
    transportBindingsProjection.status === 'available'
      ? transportBindingsProjection.bindings.map(projectTransportBinding)
      : [];

  const canonicalDirectory = canonicalResult.status === 'fulfilled' ? canonicalResult.value : null;
  if (canonicalDirectory) {
    const projectedConversationIds = new Set(projectedTransportBindingsState.map((binding) => binding.conversationId));
    const legacyBindings = inferLegacyWeixinCanonicalThreadBindings(
      localConversationsState,
      canonicalDirectory,
      projectedConversationIds
    );
    if (legacyBindings.length > 0) {
      localConversationsState = applyLegacyWeixinCanonicalThreadBindings(localConversationsState, legacyBindings);
      const persistenceResults = await Promise.allSettled(
        legacyBindings.map(async (binding) => {
          const updated = await ipcBridge.conversation.update.invoke({
            id: binding.conversationId,
            updates: { extra: { canonical_thread_id: binding.threadId } } as Partial<TChatConversation>,
            merge_extra: true,
          });
          if (!updated) throw new Error(`Conversation ${binding.conversationId} rejected canonical thread binding.`);
        })
      );
      persistenceResults.forEach((result) => {
        if (result.status === 'rejected') {
          console.warn('[WorkspaceGroupedHistory] Failed to persist legacy WeChat thread binding:', result.reason);
        }
      });
    }
    canonicalDirectoryState = canonicalDirectory;
    if (canonicalDirectory.host !== 'webui-local-cache') {
      const nextArchiveStateByThreadId = canonicalDirectory.complete
        ? new Map<string, boolean>()
        : new Map(canonicalArchiveStateByThreadIdState);
      canonicalDirectory.threads.forEach((thread) => {
        nextArchiveStateByThreadId.set(thread.id, thread.archived);
      });
      canonicalArchiveStateByThreadIdState = nextArchiveStateByThreadId;
    }

    const returnedThreadIds = new Set(canonicalDirectory.threads.map((thread) => thread.id));
    const localById = new Map(localConversationsState.map((conversation) => [conversation.id, conversation]));
    pendingCanonicalConversationIdsState = new Set(
      [...pendingCanonicalConversationIdsState].filter((conversationId) => {
        const threadId = canonicalCodexThreadId(localById.get(conversationId));
        return Boolean(threadId && !returnedThreadIds.has(threadId));
      })
    );
  }

  applyConversationProjection();
};

const requestConversationDirectoryRefresh = createSingleFlightDirtyReplay(refreshConversationDirectory);

const refreshChangedLocalConversations = async () => {
  const conversationIds = [...pendingLocalConversationRefreshIdsState];
  pendingLocalConversationRefreshIdsState.clear();
  const results = await Promise.allSettled(
    conversationIds.map((conversationId) => ipcBridge.conversation.get.invoke({ id: conversationId }))
  );
  let changed = false;
  results.forEach((result, index) => {
    const conversationId = conversationIds[index];
    if (!conversationId || deletedConversationIdsState.has(conversationId)) return;
    if (result.status === 'fulfilled') {
      upsertLocalConversation(result.value);
      changed = true;
      return;
    }
    console.error('[WorkspaceGroupedHistory] Failed to refresh changed conversation:', conversationId, result.reason);
  });
  if (changed) applyConversationProjection();
};

const requestChangedLocalConversationsRefresh = createSingleFlightDirtyReplay(refreshChangedLocalConversations);

const refreshLocalConversation = (conversationId: string) => {
  deletedConversationIdsState.delete(conversationId);
  pendingLocalConversationRefreshIdsState.add(conversationId);
  void requestChangedLocalConversationsRefresh().catch((error) => {
    console.error('[WorkspaceGroupedHistory] Failed to drain changed conversations:', error);
  });
};

const refreshConversations = (createdConversation?: TChatConversation) => {
  if (
    createdConversation?.type === 'acp' &&
    createdConversation.extra.backend === 'codex' &&
    canonicalCodexThreadId(createdConversation)
  ) {
    pendingCanonicalConversationIdsState = new Set(pendingCanonicalConversationIdsState).add(createdConversation.id);
    upsertLocalConversation(createdConversation);
    applyConversationProjection();
  }
  void requestConversationDirectoryRefresh().catch((error) => {
    console.error('[WorkspaceGroupedHistory] Failed to drain conversation directory refresh:', error);
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
      deletedConversationIdsState.add(event.conversation_id);
      pendingLocalConversationRefreshIdsState.delete(event.conversation_id);
      localConversationsState = localConversationsState.filter(
        (conversation) => conversation.id !== event.conversation_id
      );
      clearGenerating(event.conversation_id);
      clearCompletionUnreadState(event.conversation_id);
      clearCompleted(event.conversation_id);
      const nextPendingIds = new Set(pendingCanonicalConversationIdsState);
      nextPendingIds.delete(event.conversation_id);
      pendingCanonicalConversationIdsState = nextPendingIds;
      applyConversationProjection();
      refreshConversations();
      return;
    }
    if (event.action === 'updated') {
      refreshLocalConversation(event.conversation_id);
      return;
    }
    deletedConversationIdsState.delete(event.conversation_id);
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

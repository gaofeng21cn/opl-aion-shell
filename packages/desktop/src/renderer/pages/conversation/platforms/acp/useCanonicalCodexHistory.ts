/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import { mergeAcpToolCallContent, preferTextMessageVersion, transformMessage } from '@/common/chat/chatLib';
import type { CodexThreadDescriptor, CodexThreadHistoryItem } from '@/common/types/codex/appServerThreads';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { reconcileCanonicalThreadRuntime } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { useEffect } from 'react';
import { captureCanonicalReplayCursor, readCanonicalStreamReplay } from './useAcpMessage';

const MAX_RECONCILE_ATTEMPTS = 2;
const RECONCILE_RETRY_MS = 150;

type CanonicalHistoryCallbacks = {
  reconcileCanonicalThread: (thread: CodexThreadDescriptor) => void;
  markCanonicalSnapshotCovered: (sequence: number) => void;
  replayCanonicalMessages: (messages: IResponseMessage[]) => void;
};

function historyMessage(item: CodexThreadHistoryItem, conversationId: string): TMessage | undefined {
  const type =
    item.kind === 'thinking'
      ? 'thinking'
      : item.kind === 'plan'
        ? 'plan'
        : item.kind === 'tool'
          ? 'acp_tool_call'
          : item.role === 'user'
            ? 'user_content'
            : 'text';
  const response: IResponseMessage = {
    type,
    data: item.data ?? item.text,
    msg_id: item.id,
    turn_id: item.turnId,
    conversation_id: conversationId,
    created_at: item.createdAt ? Date.parse(item.createdAt) : undefined,
    replace: true,
  };
  return transformMessage(response);
}

function messageKeys(message: TMessage): string[] {
  return [message.id, message.msg_id].filter((value): value is string => Boolean(value));
}

function toolStatusRank(message: Extract<TMessage, { type: 'acp_tool_call' }>): number {
  const status = message.content.update.status;
  if (status === 'completed' || status === 'failed') return 2;
  if (status === 'in_progress') return 1;
  return 0;
}

function mergeCanonicalWithLive(canonical: TMessage, live: TMessage | undefined): TMessage {
  if (!live || canonical.type !== live.type) return canonical;
  if (canonical.type === 'text' && live.type === 'text') {
    return preferTextMessageVersion(canonical, live);
  }
  if (canonical.type === 'thinking' && live.type === 'thinking') {
    const longer = live.content.content.length > canonical.content.content.length ? live : canonical;
    return {
      ...canonical,
      created_at: Math.max(canonical.created_at ?? 0, live.created_at ?? 0) || undefined,
      content: {
        ...canonical.content,
        ...longer.content,
        status:
          canonical.content.status === 'done' || live.content.status === 'done'
            ? ('done' as const)
            : ('thinking' as const),
        duration: live.content.duration ?? canonical.content.duration,
      },
    };
  }
  if (canonical.type === 'acp_tool_call' && live.type === 'acp_tool_call') {
    const liveIsNewer = toolStatusRank(live) >= toolStatusRank(canonical);
    return {
      ...(liveIsNewer ? canonical : live),
      ...(liveIsNewer ? live : canonical),
      content: liveIsNewer
        ? mergeAcpToolCallContent(canonical.content, live.content)
        : mergeAcpToolCallContent(live.content, canonical.content),
    };
  }
  return canonical;
}

export function mergeCanonicalHistory(current: TMessage[], history: TMessage[], conversationId: string): TMessage[] {
  const otherConversations = current.filter((message) => message.conversation_id !== conversationId);
  const live = current.filter((message) => message.conversation_id === conversationId);
  const liveByKey = new Map(live.flatMap((message) => messageKeys(message).map((key) => [key, message] as const)));
  const hydrated = history.map((message) => {
    const matchingLive = messageKeys(message)
      .map((key) => liveByKey.get(key))
      .find((candidate) => candidate?.type === message.type);
    return mergeCanonicalWithLive(message, matchingLive);
  });
  const hydratedKeys = new Set(hydrated.flatMap(messageKeys));
  const liveOnly = live.filter((message) => messageKeys(message).every((key) => !hydratedKeys.has(key)));
  return [...otherConversations, ...hydrated, ...liveOnly];
}

export function useCanonicalCodexHistory(
  conversationId: string,
  threadId?: string,
  callbacks?: CanonicalHistoryCallbacks
): void {
  const update = useUpdateMessageList();
  const reconcileCanonicalThread = callbacks?.reconcileCanonicalThread;
  const markCanonicalSnapshotCovered = callbacks?.markCanonicalSnapshotCovered;
  const replayCanonicalMessages = callbacks?.replayCanonicalMessages;

  useEffect(() => {
    if (!conversationId || !threadId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const reconcile = async (attempt: number): Promise<void> => {
      const replayCursor = captureCanonicalReplayCursor(conversationId);
      try {
        const detail = await ipcBridge.codexThreads.read.invoke({ threadId, conversationId });
        if (cancelled) return;
        const history = detail.history
          .map((item) => historyMessage(item, conversationId))
          .filter((item): item is TMessage => item !== undefined);
        update((current) => mergeCanonicalHistory(current, history, conversationId));

        reconcileCanonicalThread?.(detail.thread);
        markCanonicalSnapshotCovered?.(replayCursor);
        const lastTurnId = detail.history.toReversed().find((item) => item.turnId)?.turnId ?? null;
        reconcileCanonicalThreadRuntime(conversationId, detail.thread.activeTurnId, lastTurnId);

        const replay = readCanonicalStreamReplay(conversationId, replayCursor);
        replayCanonicalMessages?.(replay.messages);
        if (!replay.complete && attempt + 1 < MAX_RECONCILE_ATTEMPTS) {
          retryTimer = setTimeout(() => void reconcile(attempt + 1), RECONCILE_RETRY_MS);
        }
      } catch (error) {
        if (cancelled) return;
        if (attempt + 1 < MAX_RECONCILE_ATTEMPTS) {
          retryTimer = setTimeout(() => void reconcile(attempt + 1), RECONCILE_RETRY_MS);
          return;
        }
        console.error('[useCanonicalCodexHistory] Failed to reconcile canonical thread history:', error);
      }
    };

    void reconcile(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    conversationId,
    markCanonicalSnapshotCovered,
    reconcileCanonicalThread,
    replayCanonicalMessages,
    threadId,
    update,
  ]);
}

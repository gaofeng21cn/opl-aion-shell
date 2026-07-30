/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import { preferTextMessageVersion, transformMessage } from '@/common/chat/chatLib';
import type { CodexThreadHistoryItem } from '@/common/types/codex/appServerThreads';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { useEffect } from 'react';

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

export function mergeCanonicalHistory(current: TMessage[], history: TMessage[], conversationId: string): TMessage[] {
  const otherConversations = current.filter((message) => message.conversation_id !== conversationId);
  const live = current.filter((message) => message.conversation_id === conversationId);
  const liveByKey = new Map(live.flatMap((message) => messageKeys(message).map((key) => [key, message] as const)));
  const hydrated = history.map((message) => {
    const matchingLive = messageKeys(message)
      .map((key) => liveByKey.get(key))
      .find((candidate) => candidate?.type === message.type);
    if (message.type === 'text' && matchingLive?.type === 'text') {
      return preferTextMessageVersion(message, matchingLive);
    }
    return message;
  });
  const hydratedKeys = new Set(hydrated.flatMap(messageKeys));
  const liveOnly = live.filter((message) => messageKeys(message).every((key) => !hydratedKeys.has(key)));
  return [...otherConversations, ...hydrated, ...liveOnly];
}

export function useCanonicalCodexHistory(conversationId: string, threadId?: string): void {
  const update = useUpdateMessageList();

  useEffect(() => {
    if (!conversationId || !threadId) return;
    let cancelled = false;
    void ipcBridge.codexThreads.read
      .invoke({ threadId, conversationId })
      .then((detail) => {
        if (cancelled) return;
        const history = detail.history
          .map((item) => historyMessage(item, conversationId))
          .filter((item): item is TMessage => item !== undefined);
        update((current) => mergeCanonicalHistory(current, history, conversationId));
      })
      .catch((error) => {
        console.error('[useCanonicalCodexHistory] Failed to read canonical thread history:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, threadId, update]);
}

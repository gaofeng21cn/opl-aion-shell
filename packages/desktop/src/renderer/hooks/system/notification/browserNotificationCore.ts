/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type NotificationKind = 'confirmation' | 'turnCompleted';
export type StreamMessage = {
  type?: string;
  conversation_id?: string;
  turn_id?: string;
  msg_id?: string;
  data?: unknown;
};

export const CONVERSATION_NAME_MAX_LENGTH = 20;

export const truncateConversationName = (name: string, maxLength = CONVERSATION_NAME_MAX_LENGTH): string => {
  const characters = Array.from(name.trim());
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join('')}\u2026` : characters.join('');
};

export const isWaitingConfirmationStreamMessage = (type: string): boolean =>
  type === 'permission' || type === 'acp_permission' || type === 'ask';

export const extractConfirmationId = (message: StreamMessage): string | undefined => {
  if (!message.data || typeof message.data !== 'object') return undefined;
  const data = message.data as Record<string, unknown>;
  let id: unknown;
  if (message.type === 'ask') id = data.request_id;
  if (message.type === 'permission') id = data.call_id || data.id;
  if (message.type === 'acp_permission' && data.tool_call && typeof data.tool_call === 'object') {
    id = (data.tool_call as Record<string, unknown>).tool_call_id;
  }
  return typeof id === 'string' && id ? id : undefined;
};

export type NotificationGate = {
  isElectron: boolean;
  hasNotificationApi: boolean;
  isSecureContext: boolean;
  permission: 'default' | 'granted' | 'denied';
  settingEnabled: boolean;
  documentHidden: boolean;
};

export const shouldShowNotification = (gate: NotificationGate): boolean =>
  !gate.isElectron &&
  gate.hasNotificationApi &&
  gate.isSecureContext &&
  gate.permission === 'granted' &&
  gate.settingEnabled &&
  gate.documentHidden;

export const createBrowserNotificationController = (deps: {
  shouldShow: () => boolean;
  bodyFor: (kind: NotificationKind, conversationId?: string) => string;
  show: (payload: { body: string; conversationId?: string; kind: NotificationKind }) => void;
}) => {
  const notified = new Set<string>();
  const completed = new Set<string>();
  const activeTurnIds = new Map<string, string>();
  const notifiedCompletionIds = new Map<string, string | undefined>();
  const onStreamMessage = (message: StreamMessage): void => {
    const conversationId = message.conversation_id;
    if (!conversationId || !message.type) return;
    if (message.type === 'start') {
      completed.delete(conversationId);
      activeTurnIds.delete(conversationId);
      notifiedCompletionIds.delete(conversationId);
    }
    if (message.turn_id && message.type !== 'finish') activeTurnIds.set(conversationId, message.turn_id);
    const status =
      message.data && typeof message.data === 'object' ? (message.data as { status?: string }).status : undefined;
    if (
      message.type === 'error' ||
      (message.type === 'agent_status' && (status === 'error' || status === 'disconnected'))
    ) {
      completed.add(conversationId);
      return;
    }
    const kind = isWaitingConfirmationStreamMessage(message.type)
      ? 'confirmation'
      : message.type === 'finish'
        ? 'turnCompleted'
        : null;
    if (!kind || (kind === 'confirmation' && completed.has(conversationId))) return;
    if (kind === 'turnCompleted') completed.add(conversationId);
    const eventId =
      kind === 'confirmation'
        ? (extractConfirmationId(message) ?? message.msg_id)
        : (message.turn_id ?? activeTurnIds.get(conversationId));
    const key = eventId ? JSON.stringify([conversationId, kind, eventId]) : undefined;
    // Some finish frames omit turn_id; the following turn.completed frame supplies it.
    if (
      kind === 'turnCompleted' &&
      notifiedCompletionIds.has(conversationId) &&
      (!eventId || !notifiedCompletionIds.get(conversationId))
    ) {
      if (key) notified.add(key);
      if (eventId) notifiedCompletionIds.set(conversationId, eventId);
      return;
    }
    if ((key && notified.has(key)) || !deps.shouldShow()) return;
    if (key) notified.add(key);
    if (kind === 'turnCompleted') notifiedCompletionIds.set(conversationId, eventId);
    deps.show({ body: deps.bodyFor(kind, conversationId), conversationId, kind });
  };
  return { onStreamMessage };
};

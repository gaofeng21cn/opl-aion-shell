import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserNotificationController,
  extractConfirmationId,
  shouldShowNotification,
  truncateConversationName,
} from '@/renderer/hooks/system/notification/browserNotificationCore';

describe('conversation notification controller', () => {
  it('coalesces a finish frame without turn_id with the owner completion event', () => {
    const show = vi.fn();
    const controller = createBrowserNotificationController({ shouldShow: () => true, show, bodyFor: () => 'done' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'a' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'a', turn_id: 't1' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'a' });
    expect(show).toHaveBeenCalledTimes(1);
    controller.onStreamMessage({ type: 'start', conversation_id: 'a', turn_id: 't2' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'a' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'a', turn_id: 't2' });
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('deduplicates both event channels by conversation and request or turn identity', () => {
    const show = vi.fn();
    const controller = createBrowserNotificationController({
      shouldShow: () => true,
      show,
      bodyFor: (kind, id) => `${id}:${kind}`,
    });
    const request = { type: 'ask', conversation_id: 'a', msg_id: 'stream-1', data: { request_id: 'request-1' } };
    controller.onStreamMessage(request);
    controller.onStreamMessage({ ...request, msg_id: 'replayed-stream' });
    controller.onStreamMessage({ ...request, conversation_id: 'b' });
    const finish = { type: 'finish', conversation_id: 'a', turn_id: 'turn-1' };
    controller.onStreamMessage(finish);
    controller.onStreamMessage({ ...finish, conversation_id: 'b' });
    controller.onStreamMessage(finish);
    expect(show).toHaveBeenCalledTimes(4);
    expect(show).toHaveBeenNthCalledWith(1, { kind: 'confirmation', conversationId: 'a', body: 'a:confirmation' });
  });

  it('does not expose late permission replays as new waiting notifications after completion', () => {
    const show = vi.fn();
    const controller = createBrowserNotificationController({ shouldShow: () => true, show, bodyFor: () => 'event' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'a', turn_id: 't1' });
    controller.onStreamMessage({ type: 'permission', conversation_id: 'a', data: { call_id: 'late' } });
    controller.onStreamMessage({ type: 'start', conversation_id: 'a', turn_id: 't2' });
    controller.onStreamMessage({
      type: 'acp_permission',
      conversation_id: 'a',
      data: { tool_call: { tool_call_id: 'new' } },
    });
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('does not consume an event while notifications are disabled', () => {
    let enabled = false;
    const show = vi.fn();
    const controller = createBrowserNotificationController({ shouldShow: () => enabled, show, bodyFor: () => 'event' });
    const event = { type: 'ask', conversation_id: 'a', data: { request_id: 'r' } };
    controller.onStreamMessage(event);
    enabled = true;
    controller.onStreamMessage(event);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('limits titles by Unicode characters without breaking surrogate pairs', () => {
    expect(truncateConversationName('  Report  ')).toBe('Report');
    expect(truncateConversationName('ab\u{1f9ea}cd', 3)).toBe('ab\u{1f9ea}\u2026');
    expect(Array.from(truncateConversationName('a'.repeat(24)))).toHaveLength(21);
    expect(extractConfirmationId({ type: 'permission', data: { id: 'fallback' } })).toBe('fallback');
  });

  it('requires a hidden secure browser with pre-existing permission and enabled preference', () => {
    const gate = {
      isElectron: false,
      hasNotificationApi: true,
      isSecureContext: true,
      permission: 'granted' as const,
      settingEnabled: true,
      documentHidden: true,
    };
    expect(shouldShowNotification(gate)).toBe(true);
    for (const change of [
      { isElectron: true },
      { hasNotificationApi: false },
      { isSecureContext: false },
      { permission: 'default' as const },
      { permission: 'denied' as const },
      { settingEnabled: false },
      { documentHidden: false },
    ]) {
      expect(shouldShowNotification({ ...gate, ...change })).toBe(false);
    }
  });
});

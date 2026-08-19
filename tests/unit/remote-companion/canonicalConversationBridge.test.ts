import { describe, expect, it, vi } from 'vitest';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type { CodexThreadApprovalDecision } from '@/common/types/codex/appServerThreads';
import {
  CanonicalConversationBridge,
  type CanonicalConversationPort,
} from '@/process/services/remote-companion/canonicalConversationBridge';

function thread(activeTurnId: string | null = null) {
  return {
    id: 'thread-001',
    title: 'Canonical thread',
    summary: '',
    status: activeTurnId ? ('running' as const) : ('idle' as const),
    projectId: '',
    workspace: '/workspace/project',
    host: 'codex-app-server',
    owner: null,
    goal: null,
    parentThreadId: null,
    ancestorThreadIds: [],
    activeTurnId,
    archived: false,
    updatedAt: '2026-08-19T00:00:00.000Z',
  };
}

function portFixture() {
  const responseListeners = new Set<(message: IResponseMessage) => void>();
  const completedListeners = new Set<(event: IConversationTurnCompletedEvent) => void>();
  let approvalPending = true;
  const port: CanonicalConversationPort = {
    listThreads: vi.fn().mockResolvedValue({
      schema: 'opl_codex_thread_directory.v1',
      host: 'codex-app-server',
      complete: true,
      threads: [thread()],
    }),
    readThread: vi.fn().mockResolvedValue({ thread: thread('turn-001'), history: [] }),
    startThread: vi.fn().mockResolvedValue(thread()),
    startWithDesktopDefaults: vi
      .fn()
      .mockResolvedValue({ thread: thread('turn-started'), turn: { msgId: 'msg-1', turnId: 'turn-started' } }),
    startTurn: vi.fn().mockResolvedValue({ msgId: 'msg-2', turnId: 'turn-002' }),
    interruptTurn: vi.fn().mockResolvedValue(undefined),
    listPendingApprovals: vi.fn().mockImplementation(() =>
      approvalPending
        ? [
            {
              type: 'acp_permission',
              data: { options: [{ option_id: 'accept' }], tool_call: { tool_call_id: 'approval-001' } },
              msg_id: 'approval-message-001',
              turn_id: 'turn-001',
              conversation_id: 'thread-001',
            },
          ]
        : []
    ),
    respondApproval: vi.fn().mockImplementation(() => {
      approvalPending = false;
    }),
    onResponse: vi.fn((listener: (message: IResponseMessage) => void) => {
      responseListeners.add(listener);
      return () => responseListeners.delete(listener);
    }),
    onTurnCompleted: vi.fn((listener: (event: IConversationTurnCompletedEvent) => void) => {
      completedListeners.add(listener);
      return () => completedListeners.delete(listener);
    }),
  };
  return { port, responseListeners, completedListeners };
}

describe('CanonicalConversationBridge', () => {
  it('uses the canonical adapter for list, open, start and send without local history', async () => {
    const fixture = portFixture();
    const bridge = new CanonicalConversationBridge({ port: fixture.port });

    await bridge.list({ includeArchived: true });
    await bridge.open('thread-001');
    const emptyStart = await bridge.start({ workspace: '/workspace/project' });
    const textStart = await bridge.start({ workspace: '/workspace/project', text: 'Start this', msgId: 'request-1' });
    const sent = await bridge.send({ threadId: 'thread-001', text: 'Continue this', msgId: 'request-2' });

    expect(fixture.port.listThreads).toHaveBeenCalledWith({ includeArchived: true });
    expect(fixture.port.readThread).toHaveBeenCalledWith('thread-001', undefined);
    expect(fixture.port.startThread).toHaveBeenCalledWith({ workspace: '/workspace/project' });
    expect(fixture.port.startWithDesktopDefaults).toHaveBeenCalledWith({
      workspace: '/workspace/project',
      text: 'Start this',
      msgId: 'request-1',
    });
    expect(fixture.port.startTurn).toHaveBeenCalledWith({
      threadId: 'thread-001',
      conversationId: 'thread-001',
      msgId: 'request-2',
      input: 'Continue this',
    });
    expect(emptyStart.kind).toBe('thread');
    expect(textStart.kind).toBe('turn');
    expect(sent.turnId).toBe('turn-002');
  });

  it('derives stop from canonical readback and rejects a client-selected turn id', async () => {
    const fixture = portFixture();
    const bridge = new CanonicalConversationBridge({ port: fixture.port });

    await bridge.stop({ threadId: 'thread-001' });
    expect(fixture.port.interruptTurn).toHaveBeenCalledWith({
      threadId: 'thread-001',
      conversationId: 'thread-001',
      turnId: 'turn-001',
    });
    await expect(bridge.stop({ threadId: 'thread-001', turnId: 'client-turn' } as never)).rejects.toThrow();
    expect(fixture.port.interruptTurn).toHaveBeenCalledTimes(1);
  });

  it('checks the canonical pending approval before responding once', async () => {
    const fixture = portFixture();
    const bridge = new CanonicalConversationBridge({ port: fixture.port });

    await expect(
      bridge.respondApproval({
        threadId: 'thread-001',
        requestId: 'approval-001',
        decision: 'decline',
      })
    ).rejects.toThrow('no longer pending');
    expect(fixture.port.respondApproval).not.toHaveBeenCalled();
    await bridge.respondApproval({
      threadId: 'thread-001',
      requestId: 'approval-message-001',
      decision: 'accept',
    });
    expect(fixture.port.respondApproval).toHaveBeenCalledWith({
      requestId: 'approval-message-001',
      decision: 'accept',
    });
    await expect(
      bridge.respondApproval({
        threadId: 'thread-001',
        requestId: 'approval-message-001',
        decision: 'decline' as CodexThreadApprovalDecision,
      })
    ).rejects.toThrow('no longer pending');
    expect(fixture.port.respondApproval).toHaveBeenCalledTimes(1);
  });

  it('subscribes to filtered response/completion events and disposes idempotently', () => {
    const fixture = portFixture();
    const bridge = new CanonicalConversationBridge({ port: fixture.port });
    const listener = vi.fn();
    const subscription = bridge.stream({ threadId: 'thread-001', turnId: 'turn-001' }, listener);
    const message: IResponseMessage = {
      type: 'text',
      data: 'delta',
      msg_id: 'message-001',
      turn_id: 'turn-001',
      conversation_id: 'thread-001',
    };
    const event = { session_id: 'thread-001', turn_id: 'turn-001' } as IConversationTurnCompletedEvent;
    fixture.responseListeners.forEach((callback) => callback(message));
    fixture.completedListeners.forEach((callback) => callback(event));
    fixture.responseListeners.forEach((callback) => callback({ ...message, turn_id: 'other-turn' }));
    expect(listener).toHaveBeenCalledTimes(2);
    subscription.dispose();
    subscription.dispose();
    fixture.responseListeners.forEach((callback) => callback(message));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('only refreshes when explicitly requested', async () => {
    const fixture = portFixture();
    const bridge = new CanonicalConversationBridge({ port: fixture.port });
    await bridge.refresh();
    await bridge.refresh({ threadId: 'thread-001' });
    expect(fixture.port.listThreads).toHaveBeenCalledTimes(1);
    expect(fixture.port.readThread).toHaveBeenCalledTimes(1);
  });
});

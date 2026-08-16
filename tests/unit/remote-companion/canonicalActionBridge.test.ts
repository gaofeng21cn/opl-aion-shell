import { describe, expect, it, vi } from 'vitest';
import {
  RemoteCanonicalActionBridge,
  type RemoteActionDispatchError,
  type RemoteCanonicalActionPort,
} from '@/process/services/remote-companion/canonicalActionBridge';
import type { RemoteActionRequest } from '@/common/types/remoteCompanion';

function request(overrides: Partial<RemoteActionRequest> = {}): RemoteActionRequest {
  return {
    pair_id: 'pair-test-001',
    key_epoch: 1,
    request_id: 'request-001',
    action_id: 'canonical_task.list',
    payload: {},
    ...overrides,
  };
}

function port(): RemoteCanonicalActionPort {
  return {
    listThreads: vi.fn().mockResolvedValue({
      schema: 'opl_codex_thread_directory.v1',
      host: 'codex-app-server',
      complete: true,
      threads: [
        {
          id: 'thread-001',
          title: 'Research task',
          summary: 'Canonical summary',
          status: 'active',
          activeTurnId: 'turn-001',
          updatedAt: '2026-08-17T12:00:00.000Z',
        },
      ],
    }),
    readThread: vi.fn().mockResolvedValue({
      thread: {
        id: 'thread-001',
        title: 'Research task',
        summary: 'Canonical summary',
        status: 'active',
        activeTurnId: 'turn-001',
        updatedAt: '2026-08-17T12:00:00.000Z',
      },
      history: [
        {
          id: 'message-001',
          turnId: 'turn-001',
          role: 'assistant',
          kind: 'text',
          text: 'Canonical response',
          status: 'completed',
          createdAt: '2026-08-17T12:00:00.000Z',
        },
      ],
    }),
    startTurn: vi.fn().mockResolvedValue({ turnId: 'turn-002', msgId: 'message-002' }),
    interruptTurn: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RemoteCanonicalActionBridge', () => {
  it('routes list, read, send, and stop through the existing canonical port', async () => {
    const canonical = port();
    const bridge = new RemoteCanonicalActionBridge(canonical);

    const list = await bridge.execute(request());
    expect(list.accepted).toBe(true);
    expect(list.payload.tasks).toEqual([
      {
        canonical_thread_id: 'thread-001',
        title: 'Research task',
        summary: 'Canonical summary',
        status: 'active',
        active_turn_id: 'turn-001',
        updated_at: '2026-08-17T12:00:00.000Z',
      },
    ]);

    const read = await bridge.execute(request({ action_id: 'canonical_task.read', canonical_thread_id: 'thread-001' }));
    expect(read.payload.thread).toMatchObject({ canonical_thread_id: 'thread-001' });
    expect(read.payload.history).toEqual([expect.objectContaining({ id: 'message-001', text: 'Canonical response' })]);

    const send = await bridge.execute(
      request({
        request_id: 'request-send-001',
        action_id: 'canonical_task.send_text',
        canonical_thread_id: 'thread-001',
        payload: { text: 'Continue the canonical task' },
      })
    );
    expect(send.payload).toEqual({ canonical_turn_id: 'turn-002', message_id: 'message-002' });
    expect(canonical.startTurn).toHaveBeenCalledWith({
      threadId: 'thread-001',
      conversationId: 'thread-001',
      msgId: 'request-send-001',
      input: 'Continue the canonical task',
    });

    const stop = await bridge.execute(
      request({
        request_id: 'request-stop-001',
        action_id: 'canonical_turn.stop',
        canonical_thread_id: 'thread-001',
        payload: { canonical_turn_id: 'turn-001' },
      })
    );
    expect(stop.payload).toEqual({ canonical_turn_id: 'turn-001' });
    expect(canonical.interruptTurn).toHaveBeenCalledWith({
      threadId: 'thread-001',
      conversationId: 'thread-001',
      turnId: 'turn-001',
    });
  });

  it('keeps task start, high-impact approval, and pair revoke out without owner mappings', async () => {
    const bridge = new RemoteCanonicalActionBridge(port());

    await expect(
      bridge.execute(request({ action_id: 'canonical_task.start', request_id: 'request-start-001' }))
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'unsupported_action_mapping' });
    await expect(
      bridge.execute(
        request({
          action_id: 'canonical_approval.respond',
          request_id: 'request-approval-001',
          payload: { impact: 'high', decision: 'approve', approval_request_id: 'approval-001' },
        })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'desktop_only' });
    await expect(
      bridge.execute(request({ action_id: 'pair.revoke', request_id: 'request-revoke-001' }))
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'unsupported_action_mapping' });
  });

  it('rejects malformed remote input before calling the canonical port', async () => {
    const canonical = port();
    const bridge = new RemoteCanonicalActionBridge(canonical);
    await expect(
      bridge.execute(
        request({
          action_id: 'canonical_task.send_text',
          canonical_thread_id: 'thread-001',
          payload: { text: ' ' },
        })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'invalid_payload' });
    expect(canonical.startTurn).not.toHaveBeenCalled();
  });
});

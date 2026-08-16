import { describe, expect, it, vi } from 'vitest';
import type {
  CodexThreadApprovalDecision,
  CodexThreadDescriptor,
  CodexThreadDetail,
} from '@/common/types/codex/appServerThreads';
import type { RemoteActionRequest, RemoteActionResponse } from '@/common/types/remoteCompanion';
import {
  RemoteCanonicalActionBridge,
  type RemoteActionDispatchError,
  type RemoteApprovalProjection,
  type RemoteCanonicalActionPort,
} from '@/process/services/remote-companion/canonicalActionBridge';

const THREAD_ID = 'thread-001';
const PAIR_ID = 'pair-test-001';

function thread(overrides: Partial<CodexThreadDescriptor> = {}): CodexThreadDescriptor {
  return {
    id: THREAD_ID,
    title: 'Research task',
    summary: 'Canonical summary',
    status: 'running',
    projectId: 'project-001',
    workspace: '/workspace/project',
    host: 'codex-app-server',
    owner: null,
    goal: null,
    parentThreadId: null,
    ancestorThreadIds: [],
    activeTurnId: 'turn-001',
    archived: false,
    updatedAt: '2026-08-17T12:00:00.000Z',
    ...overrides,
  };
}

function detail(overrides: Partial<CodexThreadDescriptor> = {}): CodexThreadDetail {
  return {
    thread: thread(overrides),
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
  };
}

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

function portFixture() {
  const listThreads = vi.fn().mockResolvedValue({
    schema: 'opl_codex_thread_directory.v1' as const,
    host: 'codex-app-server',
    complete: true,
    threads: [thread()],
  });
  const readThread = vi.fn().mockResolvedValue(detail());
  const listApprovals = vi.fn().mockResolvedValue([] as RemoteApprovalProjection[]);
  const startTurn = vi.fn().mockResolvedValue({ turnId: 'turn-002', msgId: 'message-002' });
  const startWithDesktopDefaults = vi.fn().mockResolvedValue({
    thread: thread({ id: 'thread-started', title: 'Started task', activeTurnId: null }),
    turn: { turnId: 'turn-started', msgId: 'message-started' },
  });
  const interruptTurn = vi.fn().mockResolvedValue(undefined);
  const revokePair = vi.fn().mockResolvedValue(undefined);
  const respondRemoteApproval = vi
    .fn<(request: { approval_id: string; decision: CodexThreadApprovalDecision }) => Promise<void>>()
    .mockResolvedValue(undefined);
  const port: RemoteCanonicalActionPort = {
    listThreads,
    readThread,
    listApprovals,
    startTurn,
    startWithDesktopDefaults,
    interruptTurn,
    revokePair,
    respondRemoteApproval,
  };
  return {
    port,
    listThreads,
    readThread,
    listApprovals,
    startTurn,
    startWithDesktopDefaults,
    interruptTurn,
    revokePair,
    respondRemoteApproval,
  };
}

describe('RemoteCanonicalActionBridge', () => {
  it('returns the App wire task and thread projections', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);

    const list = await bridge.execute(request());
    expect(list.payload).toEqual({
      complete: true,
      tasks: [
        {
          id: THREAD_ID,
          title: 'Research task',
          status: 'running',
          updated_at: '2026-08-17T12:00:00.000Z',
          needs_user_action: false,
          active_turn_id: 'turn-001',
        },
      ],
    });

    const read = await bridge.execute(
      request({ action_id: 'canonical_task.read', canonical_thread_id: THREAD_ID, request_id: 'request-read-001' })
    );
    expect(read.payload).toEqual({
      thread_id: THREAD_ID,
      messages: [
        {
          id: 'message-001',
          role: 'assistant',
          text: 'Canonical response',
          created_at: '2026-08-17T12:00:00.000Z',
        },
      ],
      approval: null,
    });
  });

  it('starts a task through desktop defaults and sends the request text', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);

    const response = await bridge.execute(
      request({
        request_id: 'request-start-001',
        action_id: 'canonical_task.start',
        payload: { text: 'Start the canonical task' },
      })
    );

    expect(fixture.startWithDesktopDefaults).toHaveBeenCalledWith({
      text: 'Start the canonical task',
      msgId: 'request-start-001',
    });
    expect(response.payload).toEqual({
      canonical_thread_id: 'thread-started',
      canonical_turn_id: 'turn-started',
      message_id: 'message-started',
      task: {
        id: 'thread-started',
        title: 'Started task',
        status: 'running',
        updated_at: '2026-08-17T12:00:00.000Z',
        needs_user_action: false,
        active_turn_id: null,
      },
    });
  });

  it('maps pair.revoke to the pairing service port', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);

    const response = await bridge.execute(
      request({ action_id: 'pair.revoke', request_id: 'request-revoke-001', payload: {} })
    );

    expect(response.payload).toEqual({ pair_id: PAIR_ID });
    expect(fixture.revokePair).toHaveBeenCalledWith(PAIR_ID);
  });

  it('resolves stop from the canonical active turn and rejects a client-selected turn id', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);

    const response = await bridge.execute(
      request({
        request_id: 'request-stop-001',
        action_id: 'canonical_turn.stop',
        canonical_thread_id: THREAD_ID,
        payload: {},
      })
    );
    expect(response.payload).toEqual({ canonical_turn_id: 'turn-001' });
    expect(fixture.readThread).toHaveBeenCalledWith(THREAD_ID);
    expect(fixture.interruptTurn).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      conversationId: THREAD_ID,
      turnId: 'turn-001',
    });

    await expect(
      bridge.execute(
        request({
          request_id: 'request-stop-002',
          action_id: 'canonical_turn.stop',
          canonical_thread_id: THREAD_ID,
          payload: { canonical_turn_id: 'client-selected-turn' },
        })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'invalid_payload' });
    expect(fixture.interruptTurn).toHaveBeenCalledTimes(1);
  });

  it('maps low and medium remote approval decisions to owner one-shot decisions', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);
    fixture.listApprovals
      .mockResolvedValueOnce([
        {
          id: 'approval-low',
          summary: 'Fetch remote data',
          impact: 'low',
          allowed_decisions: ['approve', 'reject'],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'approval-medium',
          summary: 'Apply file change',
          impact: 'medium',
          allowed_decisions: ['approve', 'reject'],
        },
      ]);

    const low = await bridge.execute(
      request({
        request_id: 'request-approval-low',
        action_id: 'canonical_approval.respond',
        canonical_thread_id: THREAD_ID,
        payload: { approval_id: 'approval-low', decision: 'approve' },
      })
    );
    const medium = await bridge.execute(
      request({
        request_id: 'request-approval-medium',
        action_id: 'canonical_approval.respond',
        canonical_thread_id: THREAD_ID,
        payload: { approval_id: 'approval-medium', decision: 'reject' },
      })
    );

    expect(low.payload).toEqual({ approval_id: 'approval-low', decision: 'approve' });
    expect(medium.payload).toEqual({ approval_id: 'approval-medium', decision: 'reject' });
    expect(fixture.respondRemoteApproval).toHaveBeenNthCalledWith(1, {
      approval_id: 'approval-low',
      decision: 'accept',
    });
    expect(fixture.respondRemoteApproval).toHaveBeenNthCalledWith(2, {
      approval_id: 'approval-medium',
      decision: 'decline',
    });
  });

  it('keeps high-impact and unavailable approval decisions on the desktop', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);
    fixture.listApprovals.mockResolvedValue([
      {
        id: 'approval-high',
        summary: 'Run command',
        impact: 'high',
        allowed_decisions: ['approve', 'reject'],
      },
    ]);

    await expect(
      bridge.execute(
        request({
          request_id: 'request-approval-high',
          action_id: 'canonical_approval.respond',
          canonical_thread_id: THREAD_ID,
          payload: { approval_id: 'approval-high', decision: 'approve' },
        })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'desktop_only' });
    expect(fixture.respondRemoteApproval).not.toHaveBeenCalled();

    fixture.listApprovals.mockResolvedValue([
      {
        id: 'approval-low',
        summary: 'Fetch data',
        impact: 'low',
        allowed_decisions: ['approve'],
      },
    ]);
    await expect(
      bridge.execute(
        request({
          request_id: 'request-approval-invalid',
          action_id: 'canonical_approval.respond',
          canonical_thread_id: THREAD_ID,
          payload: { approval_id: 'approval-low', decision: 'reject' },
        })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'invalid_payload' });
  });

  it('rejects unsupported payload fields before calling the canonical port', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);

    await expect(
      bridge.execute(
        request({ action_id: 'canonical_task.list', payload: { unexpected: true }, request_id: 'request-list-invalid' })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'invalid_payload' });
    await expect(
      bridge.execute(
        request({
          action_id: 'canonical_task.start',
          payload: { text: 'start', unexpected: true },
          request_id: 'request-start-invalid',
        })
      )
    ).rejects.toMatchObject<Partial<RemoteActionDispatchError>>({ code: 'invalid_payload' });
    expect(fixture.listThreads).not.toHaveBeenCalled();
    expect(fixture.startWithDesktopDefaults).not.toHaveBeenCalled();
  });

  it('projects snake_case snapshots and terminal events', async () => {
    const fixture = portFixture();
    const bridge = new RemoteCanonicalActionBridge(fixture.port);
    fixture.listApprovals.mockResolvedValue([
      {
        id: 'approval-low',
        summary: 'Fetch remote data',
        impact: 'low',
        allowed_decisions: ['approve'],
      },
    ]);

    const listRequest = request({ request_id: 'request-project-list' });
    const listResponse = await bridge.execute(listRequest);
    const listEvents = await bridge.project(listRequest, listResponse);
    expect(listEvents).toEqual([
      {
        event_type: 'task.list_snapshot',
        payload: {
          complete: true,
          tasks: [
            {
              id: THREAD_ID,
              title: 'Research task',
              status: 'running',
              updated_at: '2026-08-17T12:00:00.000Z',
              needs_user_action: true,
              active_turn_id: 'turn-001',
            },
          ],
        },
      },
    ]);

    const readRequest = request({
      request_id: 'request-project-read',
      action_id: 'canonical_task.read',
      canonical_thread_id: THREAD_ID,
    });
    const readResponse = await bridge.execute(readRequest);
    const readEvents = await bridge.project(readRequest, readResponse);
    expect(readEvents).toEqual([
      {
        event_type: 'task.snapshot',
        payload: {
          task: {
            id: THREAD_ID,
            title: 'Research task',
            status: 'running',
            updated_at: '2026-08-17T12:00:00.000Z',
            needs_user_action: true,
            active_turn_id: 'turn-001',
          },
        },
      },
      {
        event_type: 'thread.snapshot',
        payload: {
          thread_id: THREAD_ID,
          messages: [
            {
              id: 'message-001',
              role: 'assistant',
              text: 'Canonical response',
              created_at: '2026-08-17T12:00:00.000Z',
            },
          ],
          approval: { id: 'approval-low', summary: 'Fetch remote data', impact: 'low' },
        },
      },
    ]);

    const stopRequest = request({
      request_id: 'request-project-stop',
      action_id: 'canonical_turn.stop',
      canonical_thread_id: THREAD_ID,
    });
    const stopResponse: RemoteActionResponse = {
      request_id: stopRequest.request_id,
      accepted: true,
      action_id: stopRequest.action_id,
      payload: { canonical_turn_id: 'turn-001' },
    };
    const stopEvents = await bridge.project(stopRequest, stopResponse);
    expect(stopEvents.at(-1)).toEqual({
      event_type: 'turn.stopped',
      payload: { thread_id: THREAD_ID, turn_id: 'turn-001' },
    });
  });
});

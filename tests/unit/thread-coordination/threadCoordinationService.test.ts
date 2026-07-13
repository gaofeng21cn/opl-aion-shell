import { describe, expect, it, vi } from 'vitest';
import type {
  CodexThreadDescriptor,
  ThreadCoordinationAuditEvent,
  ThreadCoordinationDeliveryRequest,
} from '@/common/types/codex/threadCoordination';
import {
  ThreadCoordinationService,
  type CodexThreadCoordinationPort,
  type CodexThreadListSnapshot,
} from '@/process/services/threadCoordination';
import type { ThreadCoordinationAuditStore } from '@/process/services/threadCoordination/auditStore';

function thread(overrides: Partial<CodexThreadDescriptor> = {}): CodexThreadDescriptor {
  return {
    id: 'receiver',
    title: 'Receiver',
    summary: 'Receiver summary',
    status: 'idle',
    projectId: 'project-a',
    workspace: '/workspace/project-a',
    host: 'local',
    owner: 'Codex',
    goal: 'Finish the task',
    parentThreadId: null,
    ancestorThreadIds: [],
    activeTurnId: null,
    activeWriteSet: [],
    activePermission: null,
    archived: false,
    updatedAt: '2026-07-13T00:00:00.000Z',
    ...overrides,
  };
}

function memoryAuditStore(): ThreadCoordinationAuditStore & { events: ThreadCoordinationAuditEvent[] } {
  const events: ThreadCoordinationAuditEvent[] = [];
  return {
    events,
    append: (event) => events.push(event),
    readRecent: (limit) => events.slice(-limit).reverse(),
    hasIdempotencyKey: (key) =>
      events.some((event) => event.idempotencyKey === key && event.result !== 'confirmation_required'),
  };
}

function snapshot(threads: CodexThreadDescriptor[]): CodexThreadListSnapshot {
  return {
    host: 'codex-app-server',
    protocolVersion: '0.144.1',
    currentThreadId: 'sender',
    currentProjectId: 'project-a',
    threads,
  };
}

function port(threads: CodexThreadDescriptor[]): CodexThreadCoordinationPort {
  return {
    listThreads: vi.fn().mockResolvedValue(snapshot(threads)),
    readThread: vi.fn().mockImplementation(async (threadId: string) => ({
      thread: threads.find((candidate) => candidate.id === threadId) ?? thread({ id: threadId }),
      history: [],
    })),
    resumeThread: vi.fn().mockImplementation(async (threadId: string) =>
      thread({
        ...threads.find((candidate) => candidate.id === threadId),
        id: threadId,
        status: 'idle',
      })
    ),
    forkThread: vi.fn().mockResolvedValue(thread({ id: 'forked-thread' })),
    archiveThread: vi.fn().mockResolvedValue(undefined),
    startTurn: vi.fn().mockResolvedValue('new-turn'),
    steerTurn: vi.fn().mockResolvedValue('active-turn'),
  };
}

function delivery(overrides: Partial<ThreadCoordinationDeliveryRequest> = {}): ThreadCoordinationDeliveryRequest {
  return {
    action: 'deliver',
    sourceThreadId: 'sender',
    targetThreadId: 'receiver',
    actor: { kind: 'model', id: 'sender-model', threadId: 'sender' },
    reason: 'Coordinate independent work',
    message: 'Inspect the requested boundary.',
    permission: 'read_only',
    writeSet: [],
    idempotencyKey: 'delivery-1',
    route: { visitedThreadIds: ['sender'], hopCount: 1 },
    ...overrides,
  };
}

describe('ThreadCoordinationService', () => {
  it('fails closed when no Codex app-server host adapter is connected', async () => {
    const auditStore = memoryAuditStore();
    const service = new ThreadCoordinationService({ auditStore });

    const overview = await service.getOverview();

    expect(overview.availability.status).toBe('unavailable');
    expect(overview.availability.reasonCode).toBe('protocol_unavailable');
    expect(overview.threads).toEqual([]);
  });

  it('exposes only top-level threads in the overview', async () => {
    const service = new ThreadCoordinationService({
      auditStore: memoryAuditStore(),
      port: port([thread({ id: 'top-level' }), thread({ id: 'subagent', parentThreadId: 'top-level' })]),
    });

    const overview = await service.getOverview();

    expect(overview.availability.status).toBe('available');
    expect(overview.threads.map((candidate) => candidate.id)).toEqual(['top-level']);
  });

  it('starts a turn for an idle target and records visible delivery audit fields', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const auditStore = memoryAuditStore();
    const service = new ThreadCoordinationService({
      port: adapter,
      auditStore,
      now: () => new Date('2026-07-13T01:00:00.000Z'),
      createId: () => 'audit-1',
    });

    const result = await service.execute(delivery({ message: 'Inspect with api_key=secret-value and report.' }));

    expect(result.protocolMethod).toBe('turn/start');
    expect(adapter.startTurn).toHaveBeenCalledOnce();
    expect(auditStore.events[0]).toMatchObject({
      senderLabel: 'Sender',
      receiverLabel: 'Receiver',
      reason: 'Coordinate independent work',
      messageSummary: 'Inspect with api_key=*** and report.',
      protocolMethod: 'turn/start',
      permissionDecision: { requested: 'read_only', decision: 'allowed' },
      writeSetDecision: { decision: 'not_applicable', requestedPathCount: 0 },
      threadStatusBefore: 'idle',
      threadStatusAfter: 'running',
      observedAt: '2026-07-13T01:00:00.000Z',
      completedAt: '2026-07-13T01:00:00.000Z',
      result: 'accepted',
    });
  });

  it('steers the active turn with its id precondition for a running target', async () => {
    const adapter = port([
      thread({ id: 'sender', title: 'Sender' }),
      thread({ status: 'running', activeTurnId: 'turn-active' }),
    ]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const request = delivery();
    const confirmation = await service.execute(request);

    expect(confirmation.outcome).toBe('confirmation_required');
    expect(confirmation.confirmation?.risks).toContain('active_turn_steer');
    expect(adapter.steerTurn).not.toHaveBeenCalled();

    const result = await service.execute({ ...request, confirmationToken: confirmation.confirmation?.token });

    expect(result.protocolMethod).toBe('turn/steer');
    expect(adapter.steerTurn).toHaveBeenCalledWith(
      expect.objectContaining({ targetThreadId: 'receiver' }),
      'turn-active'
    );
    expect(adapter.startTurn).not.toHaveBeenCalled();
  });

  it('resumes a not-loaded thread before starting its turn', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread({ status: 'not_loaded' })]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const result = await service.execute(delivery());

    expect(adapter.resumeThread).toHaveBeenCalledWith('receiver');
    expect(adapter.startTurn).toHaveBeenCalledOnce();
    expect(result.protocolMethod).toBe('turn/start');
  });

  it('rejects repeated routes and duplicate idempotency keys', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const auditStore = memoryAuditStore();
    const service = new ThreadCoordinationService({ port: adapter, auditStore });

    const loop = await service.execute(
      delivery({ idempotencyKey: 'loop', route: { visitedThreadIds: ['sender', 'receiver'], hopCount: 2 } })
    );
    const first = await service.execute(delivery({ idempotencyKey: 'duplicate' }));
    const duplicate = await service.execute(delivery({ idempotencyKey: 'duplicate' }));

    expect(loop.errorCode).toBe('delivery_loop');
    expect(first.ok).toBe(true);
    expect(duplicate.errorCode).toBe('duplicate_delivery');
  });

  it('blocks cross-project writes and overlap with another running thread', async () => {
    const sender = thread({ id: 'sender', title: 'Sender' });
    const crossProjectTarget = thread({ projectId: 'project-b', workspace: '/workspace/project-b' });
    const crossProjectService = new ThreadCoordinationService({
      port: port([sender, crossProjectTarget]),
      auditStore: memoryAuditStore(),
    });

    const crossProject = await crossProjectService.execute(
      delivery({ permission: 'workspace_write', writeSet: ['/workspace/project-b/src'] })
    );

    const conflictAdapter = port([
      sender,
      thread(),
      thread({
        id: 'other',
        status: 'running',
        activeTurnId: 'other-turn',
        activeWriteSet: ['/workspace/project-a/src'],
      }),
    ]);
    const conflictService = new ThreadCoordinationService({
      port: conflictAdapter,
      auditStore: memoryAuditStore(),
    });
    const conflict = await conflictService.execute(
      delivery({
        permission: 'workspace_write',
        writeSet: ['/workspace/project-a/src/components'],
        idempotencyKey: 'conflict',
      })
    );

    expect(crossProject.errorCode).toBe('cross_project_write');
    expect(conflict.errorCode).toBe('write_set_conflict');
    expect(conflictAdapter.startTurn).not.toHaveBeenCalled();
  });

  it('denies permission expansion before checking a running turn write set', async () => {
    const adapter = port([
      thread({ id: 'sender', title: 'Sender' }),
      thread({ status: 'running', activeTurnId: null, activeWriteSet: [] }),
    ]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const result = await service.execute(
      delivery({ permission: 'workspace_write', writeSet: ['/workspace/project-a/src'] })
    );

    expect(result.errorCode).toBe('permission_expansion_denied');
    expect(adapter.steerTurn).not.toHaveBeenCalled();
  });

  it('requires confirmation for cross-project read-only delivery and workspace writes', async () => {
    const sender = thread({ id: 'sender', title: 'Sender' });
    const crossProjectTarget = thread({ projectId: 'project-b', workspace: '/workspace/project-b' });
    const crossProjectAdapter = port([sender, crossProjectTarget]);
    const crossProjectService = new ThreadCoordinationService({
      port: crossProjectAdapter,
      auditStore: memoryAuditStore(),
    });
    const crossProject = await crossProjectService.execute(delivery());

    const writeAdapter = port([sender, thread()]);
    const writeService = new ThreadCoordinationService({ port: writeAdapter, auditStore: memoryAuditStore() });
    const write = await writeService.execute(
      delivery({
        permission: 'workspace_write',
        writeSet: ['/workspace/project-a/src'],
        idempotencyKey: 'workspace-write',
      })
    );

    expect(crossProject.confirmation?.risks).toEqual(['cross_project_delivery']);
    expect(crossProjectAdapter.startTurn).not.toHaveBeenCalled();
    expect(write.confirmation?.risks).toEqual(['workspace_write']);
    expect(writeAdapter.startTurn).not.toHaveBeenCalled();
  });

  it('binds archive confirmation to the lifecycle request instead of delivery authorization', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });
    const archiveRequest = {
      action: 'archive' as const,
      targetThreadId: 'receiver',
      actor: { kind: 'user' as const, id: 'operator', threadId: 'sender' },
      reason: 'Archive completed work',
    };

    const confirmation = await service.execute(archiveRequest);
    const invalidReuse = await service.execute(
      delivery({ confirmationToken: confirmation.confirmation?.token, idempotencyKey: 'not-archive' })
    );
    const secondConfirmation = await service.execute(archiveRequest);
    const archived = await service.execute({
      ...archiveRequest,
      confirmationToken: secondConfirmation.confirmation?.token,
    });

    expect(confirmation.outcome).toBe('confirmation_required');
    expect(invalidReuse.errorCode).toBe('confirmation_invalid');
    expect(archived.ok).toBe(true);
    expect(adapter.archiveThread).toHaveBeenCalledWith('receiver');
  });
});

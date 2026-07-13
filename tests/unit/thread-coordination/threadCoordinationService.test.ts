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
    findAcceptedByIdempotencyKey: (key) =>
      events.find(
        (event) => event.action === 'deliver' && event.result === 'accepted' && event.idempotencyKey === key
      ) ?? null,
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
    unarchiveThread: vi.fn().mockImplementation(async (threadId: string) =>
      thread({
        ...threads.find((candidate) => candidate.id === threadId),
        id: threadId,
        status: 'idle',
        archived: false,
      })
    ),
    startReview: vi.fn().mockResolvedValue({ reviewThreadId: 'receiver', turnId: 'review-turn' }),
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
    permission: 'inherit',
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
      permissionDecision: { requested: 'inherit', decision: 'not_applicable' },
      writeSetDecision: { decision: 'not_applicable', requestedPathCount: 0 },
      threadStatusBefore: 'idle',
      threadStatusAfter: 'running',
      observedAt: '2026-07-13T01:00:00.000Z',
      completedAt: '2026-07-13T01:00:00.000Z',
      result: 'accepted',
    });
  });

  it('steers the active turn without adding an OPL permission confirmation', async () => {
    const adapter = port([
      thread({ id: 'sender', title: 'Sender' }),
      thread({ status: 'running', activeTurnId: 'turn-active' }),
    ]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const result = await service.execute(delivery());

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

  it('reports repeated routes as advisory and replays the first accepted receipt for an identical request key', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const auditStore = memoryAuditStore();
    const service = new ThreadCoordinationService({ port: adapter, auditStore });

    const loop = await service.execute(
      delivery({ idempotencyKey: 'loop', route: { visitedThreadIds: ['sender', 'receiver'], hopCount: 2 } })
    );
    const first = await service.execute(delivery({ idempotencyKey: 'duplicate' }));
    const duplicate = await service.execute(delivery({ idempotencyKey: 'duplicate' }));

    expect(loop.ok).toBe(true);
    expect(loop.advisories).toContain('delegation_cycle');
    expect(first.ok).toBe(true);
    expect(duplicate).toEqual(first);
    expect(adapter.listThreads).toHaveBeenCalledTimes(2);
    expect(adapter.startTurn).toHaveBeenCalledTimes(2);
    expect(auditStore.events).toHaveLength(2);
  });

  it('coalesces concurrent retries for one idempotency key into a single dispatch', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const auditStore = memoryAuditStore();
    const service = new ThreadCoordinationService({ port: adapter, auditStore });

    const [first, retry] = await Promise.all([
      service.execute(delivery({ idempotencyKey: 'concurrent' })),
      service.execute(delivery({ idempotencyKey: 'concurrent' })),
    ]);

    expect(retry).toEqual(first);
    expect(adapter.listThreads).toHaveBeenCalledOnce();
    expect(adapter.startTurn).toHaveBeenCalledOnce();
    expect(auditStore.events).toHaveLength(1);
  });

  it('allows the same message to be sent again with a new request key', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const first = await service.execute(delivery({ idempotencyKey: 'first-request' }));
    const repeatedMessage = await service.execute(delivery({ idempotencyKey: 'second-request' }));

    expect(first.ok).toBe(true);
    expect(repeatedMessage.ok).toBe(true);
    expect(adapter.startTurn).toHaveBeenCalledTimes(2);
  });

  it('allows cross-project delivery and reports write-set overlap as advisory metadata', async () => {
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

    expect(crossProject.ok).toBe(true);
    expect(crossProject.advisories).toEqual(['cross_project_context', 'workspace_context_changed']);
    expect(conflict.ok).toBe(true);
    expect(conflict.advisories).toContain('write_set_overlap');
    expect(conflictAdapter.startTurn).toHaveBeenCalledOnce();
  });

  it('inherits the running thread permission policy instead of imposing an OPL write scope', async () => {
    const adapter = port([
      thread({ id: 'sender', title: 'Sender' }),
      thread({ status: 'running', activeTurnId: 'turn-active', activeWriteSet: [] }),
    ]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const result = await service.execute(
      delivery({ permission: 'workspace_write', writeSet: ['/workspace/project-a/src'] })
    );

    expect(result.ok).toBe(true);
    expect(result.protocolMethod).toBe('turn/steer');
    expect(adapter.steerTurn).toHaveBeenCalledOnce();
  });

  it('allows path hints outside the directory where a running thread started', async () => {
    const adapter = port([
      thread({ id: 'sender', title: 'Sender' }),
      thread({
        status: 'running',
        activeTurnId: 'turn-active',
        activePermission: 'workspace_write',
        activeWriteSet: ['/workspace/project-a/src'],
      }),
    ]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const result = await service.execute(
      delivery({ permission: 'workspace_write', writeSet: ['/workspace/project-a'] })
    );

    expect(result.ok).toBe(true);
    expect(result.advisories).toEqual([]);
    expect(adapter.steerTurn).toHaveBeenCalledOnce();
  });

  it('does not add confirmation for cross-project delivery or a running turn steer', async () => {
    const sender = thread({ id: 'sender', title: 'Sender' });
    const crossProjectTarget = thread({ projectId: 'project-b', workspace: '/workspace/project-b' });
    const crossProjectAdapter = port([sender, crossProjectTarget]);
    const crossProjectService = new ThreadCoordinationService({
      port: crossProjectAdapter,
      auditStore: memoryAuditStore(),
    });
    const crossProject = await crossProjectService.execute(delivery());

    const writeAdapter = port([sender, thread({ status: 'running', activeTurnId: 'turn-active' })]);
    const writeService = new ThreadCoordinationService({ port: writeAdapter, auditStore: memoryAuditStore() });
    const write = await writeService.execute(
      delivery({
        permission: 'workspace_write',
        writeSet: ['/workspace/project-a/src'],
        idempotencyKey: 'workspace-write',
      })
    );

    expect(crossProject.ok).toBe(true);
    expect(crossProjectAdapter.startTurn).toHaveBeenCalledOnce();
    expect(write.ok).toBe(true);
    expect(writeAdapter.steerTurn).toHaveBeenCalledOnce();
  });

  it('archives directly through the Codex App Server lifecycle method', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });
    const archiveRequest = {
      action: 'archive' as const,
      targetThreadId: 'receiver',
      actor: { kind: 'user' as const, id: 'operator', threadId: 'sender' },
      reason: 'Archive completed work',
    };

    const archived = await service.execute(archiveRequest);

    expect(archived.ok).toBe(true);
    expect(archived.protocolMethod).toBe('thread/archive');
    expect(adapter.archiveThread).toHaveBeenCalledWith('receiver');
  });

  it('restores an archived top-level thread through thread/unarchive', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread({ status: 'archived', archived: true })]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const restored = await service.execute({
      action: 'unarchive',
      targetThreadId: 'receiver',
      actor: { kind: 'user', id: 'operator', threadId: 'sender' },
      reason: 'Restore archived work',
    });

    expect(restored.ok).toBe(true);
    expect(restored.protocolMethod).toBe('thread/unarchive');
    expect(adapter.unarchiveThread).toHaveBeenCalledWith('receiver');
    expect(adapter.archiveThread).not.toHaveBeenCalled();
  });

  it('starts a typed inline review for the selected thread', async () => {
    const adapter = port([thread({ id: 'sender', title: 'Sender' }), thread()]);
    const service = new ThreadCoordinationService({ port: adapter, auditStore: memoryAuditStore() });

    const reviewed = await service.execute({
      action: 'review',
      targetThreadId: 'receiver',
      actor: { kind: 'user', id: 'operator', threadId: 'sender' },
      reason: 'Review current changes',
      target: { type: 'uncommittedChanges' },
      delivery: 'inline',
    });

    expect(reviewed.ok).toBe(true);
    expect(reviewed.protocolMethod).toBe('review/start');
    expect(reviewed.reviewThreadId).toBe('receiver');
    expect(adapter.startReview).toHaveBeenCalledWith(
      expect.objectContaining({
        targetThreadId: 'receiver',
        target: { type: 'uncommittedChanges' },
        delivery: 'inline',
      })
    );
  });
});

import type {
  CodexThreadApprovalDecision,
  CodexThreadDetail,
  CodexThreadDirectory,
  CodexThreadDescriptor,
  CodexThreadTurnStartResult,
} from '@/common/types/codex/appServerThreads';
import type {
  RemoteActionRequest,
  RemoteActionResponse,
  RemoteCompanionEventType,
} from '@/common/types/remoteCompanion';

export type RemoteApprovalImpact = 'low' | 'medium' | 'high';

export type RemoteApprovalProjection = {
  id: string;
  summary: string;
  impact: RemoteApprovalImpact;
  allowed_decisions: string[];
};

export type RemoteTaskProjection = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  needs_user_action: boolean;
  active_turn_id: string | null;
};

export type RemoteMessageProjection = {
  id: string;
  role: string;
  text: string;
  created_at: string | null;
};

export type RemoteProjectionEvent = {
  event_type: Exclude<RemoteCompanionEventType, 'action.accepted' | 'action.rejected'>;
  payload: Record<string, unknown>;
};

export type RemoteCanonicalActionPort = {
  listThreads(): Promise<CodexThreadDirectory>;
  readThread(threadId: string): Promise<CodexThreadDetail>;
  listApprovals?(threadId: string): Promise<RemoteApprovalProjection[]>;
  startTurn(request: {
    threadId: string;
    conversationId: string;
    msgId: string;
    input: string;
  }): Promise<CodexThreadTurnStartResult>;
  startWithDesktopDefaults?(request: {
    text: string;
    msgId: string;
  }): Promise<{ thread: CodexThreadDescriptor; turn: CodexThreadTurnStartResult }>;
  interruptTurn(request: { threadId: string; conversationId: string; turnId: string }): Promise<void>;
  respondRemoteApproval?(request: { approval_id: string; decision: CodexThreadApprovalDecision }): Promise<void>;
  subscribeEvents?(listener: (event: RemoteProjectionEvent) => void): () => void;
};

export class RemoteActionDispatchError extends Error {
  readonly code: 'invalid_payload' | 'unsupported_action_mapping' | 'desktop_only' | 'canonical_failure';

  constructor(code: RemoteActionDispatchError['code'], message: string) {
    super(message);
    this.name = 'RemoteActionDispatchError';
    this.code = code;
  }
}

function requiredString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new RemoteActionDispatchError('invalid_payload', `Remote action requires ${field}.`);
  }
  return value.trim();
}

function ownerDecisionForRemote(decision: string): CodexThreadApprovalDecision {
  if (decision === 'approve') return 'accept';
  if (decision === 'reject') return 'decline';
  throw new RemoteActionDispatchError('invalid_payload', 'The approval decision is not available.');
}

function requireThreadId(request: RemoteActionRequest): string {
  const threadId = request.canonical_thread_id?.trim();
  if (!threadId) throw new RemoteActionDispatchError('invalid_payload', 'Remote action requires canonical_thread_id.');
  return threadId;
}

function requireEmptyPayload(request: RemoteActionRequest): void {
  if (Object.keys(request.payload).length > 0) {
    throw new RemoteActionDispatchError(
      'invalid_payload',
      `Remote action ${request.action_id} does not accept payload fields.`
    );
  }
}

function taskProjection(
  thread: CodexThreadDescriptor,
  approvals: RemoteApprovalProjection[] = []
): RemoteTaskProjection {
  return {
    id: thread.id,
    title: thread.title,
    status: thread.status,
    updated_at: thread.updatedAt,
    needs_user_action: approvals.length > 0,
    active_turn_id: thread.activeTurnId,
  };
}

function messageProjection(detail: CodexThreadDetail): RemoteMessageProjection[] {
  return detail.history.map((item) => ({
    id: item.id,
    role: item.role,
    text: item.text,
    created_at: item.createdAt,
  }));
}

function wireApproval(approval: RemoteApprovalProjection | undefined): Record<string, unknown> | null {
  return approval
    ? {
        id: approval.id,
        summary: approval.summary,
        impact: approval.impact,
      }
    : null;
}

function threadResponse(detail: CodexThreadDetail, approval?: RemoteApprovalProjection): Record<string, unknown> {
  return {
    thread_id: detail.thread.id,
    messages: messageProjection(detail),
    approval: wireApproval(approval),
  };
}

export class RemoteCanonicalActionBridge {
  private readonly port: RemoteCanonicalActionPort;

  constructor(port: RemoteCanonicalActionPort) {
    this.port = port;
  }

  subscribeEvents(listener: (event: RemoteProjectionEvent) => void): () => void {
    return this.port.subscribeEvents?.(listener) ?? (() => undefined);
  }

  async execute(request: RemoteActionRequest): Promise<RemoteActionResponse> {
    try {
      switch (request.action_id) {
        case 'canonical_task.list': {
          requireEmptyPayload(request);
          const directory = await this.port.listThreads();
          return this.accept(request, await this.taskListResponse(directory));
        }
        case 'canonical_task.read': {
          requireEmptyPayload(request);
          const detail = await this.port.readThread(requireThreadId(request));
          const approvals = await this.approvalsFor(detail.thread.id);
          return this.accept(request, threadResponse(detail, approvals[0]));
        }
        case 'canonical_task.refresh': {
          requireEmptyPayload(request);
          if (request.canonical_thread_id?.trim()) {
            const detail = await this.port.readThread(request.canonical_thread_id.trim());
            const approvals = await this.approvalsFor(detail.thread.id);
            return this.accept(request, threadResponse(detail, approvals[0]));
          }
          return this.accept(request, await this.taskListResponse(await this.port.listThreads()));
        }
        case 'canonical_task.start': {
          const text = requiredString(request.payload, 'text');
          this.requireOnlyFields(request, ['text']);
          if (!this.port.startWithDesktopDefaults) {
            throw new RemoteActionDispatchError(
              'unsupported_action_mapping',
              'Starting a remote task is unavailable until the desktop-default bridge is owner-projected.'
            );
          }
          const started = await this.port.startWithDesktopDefaults({ text, msgId: request.request_id });
          return this.accept(request, {
            canonical_thread_id: started.thread.id,
            canonical_turn_id: started.turn.turnId,
            message_id: started.turn.msgId,
            task: taskProjection(started.thread),
          });
        }
        case 'canonical_task.send_text': {
          const threadId = requireThreadId(request);
          const text = requiredString(request.payload, 'text');
          this.requireOnlyFields(request, ['text']);
          if (text.length > 60_000) {
            throw new RemoteActionDispatchError('invalid_payload', 'Remote text is too large.');
          }
          const result = await this.port.startTurn({
            threadId,
            conversationId: threadId,
            msgId: request.request_id,
            input: text,
          });
          return this.accept(request, { canonical_turn_id: result.turnId, message_id: result.msgId });
        }
        case 'canonical_turn.stop': {
          const threadId = requireThreadId(request);
          requireEmptyPayload(request);
          const detail = await this.port.readThread(threadId);
          const turnId = detail.thread.activeTurnId;
          if (!turnId) throw new RemoteActionDispatchError('invalid_payload', 'The canonical task has no active turn.');
          await this.port.interruptTurn({ threadId, conversationId: threadId, turnId });
          return this.accept(request, { canonical_turn_id: turnId });
        }
        case 'canonical_approval.respond': {
          const threadId = requireThreadId(request);
          this.requireOnlyFields(request, ['approval_id', 'decision']);
          if (!this.port.respondRemoteApproval || !this.port.listApprovals) {
            throw new RemoteActionDispatchError(
              'desktop_only',
              'Remote approval responses remain desktop-only until owner impact projection is available.'
            );
          }
          const approvalId = requiredString(request.payload, 'approval_id');
          const decision = requiredString(request.payload, 'decision');
          const ownerDecision = ownerDecisionForRemote(decision);
          const approval = (await this.port.listApprovals(threadId)).find((item) => item.id === approvalId);
          if (!approval) throw new RemoteActionDispatchError('invalid_payload', 'The approval is no longer pending.');
          if (approval.impact === 'high') {
            throw new RemoteActionDispatchError('desktop_only', 'High-impact approvals must remain on the desktop.');
          }
          if (!approval.allowed_decisions.includes(decision)) {
            throw new RemoteActionDispatchError('invalid_payload', 'The approval decision is not available.');
          }
          await this.port.respondRemoteApproval({
            approval_id: approvalId,
            decision: ownerDecision,
          });
          return this.accept(request, { approval_id: approvalId, decision });
        }
        case 'pair.revoke':
          requireEmptyPayload(request);
          throw new RemoteActionDispatchError(
            'unsupported_action_mapping',
            'Pair revocation is handled by the pairing service.'
          );
      }
    } catch (error) {
      if (error instanceof RemoteActionDispatchError) throw error;
      throw new RemoteActionDispatchError('canonical_failure', 'The canonical desktop action did not complete.');
    }
  }

  async project(request: RemoteActionRequest, response: RemoteActionResponse): Promise<RemoteProjectionEvent[]> {
    if (!response.accepted) return [];
    switch (request.action_id) {
      case 'canonical_task.list':
        return [await this.projectTaskList()];
      case 'canonical_task.read':
        return this.projectThread(requireThreadId(request));
      case 'canonical_task.refresh':
        return request.canonical_thread_id?.trim()
          ? this.projectThread(request.canonical_thread_id.trim())
          : [await this.projectTaskList()];
      case 'canonical_task.start': {
        const threadId = this.payloadString(response.payload, 'canonical_thread_id');
        return this.projectThread(threadId);
      }
      case 'canonical_task.send_text':
        return this.projectThread(requireThreadId(request));
      case 'canonical_turn.stop': {
        const threadId = requireThreadId(request);
        const events = await this.projectThread(threadId);
        const turnId = this.payloadString(response.payload, 'canonical_turn_id');
        events.push({ event_type: 'turn.stopped', payload: { thread_id: threadId, turn_id: turnId } });
        return events;
      }
      case 'canonical_approval.respond': {
        const threadId = requireThreadId(request);
        const events = await this.projectThread(threadId);
        events.push({
          event_type: 'approval.resolved',
          payload: {
            thread_id: threadId,
            approval_id: this.payloadString(response.payload, 'approval_id'),
            decision: this.payloadString(response.payload, 'decision'),
          },
        });
        return events;
      }
      case 'pair.revoke':
        return [];
    }
  }

  private async projectTaskList(): Promise<RemoteProjectionEvent> {
    const directory = await this.port.listThreads();
    const response = await this.taskListResponse(directory);
    return { event_type: 'task.list_snapshot', payload: response };
  }

  private async projectThread(threadId: string): Promise<RemoteProjectionEvent[]> {
    const detail = await this.port.readThread(threadId);
    const approvals = await this.approvalsFor(threadId);
    return [
      { event_type: 'task.snapshot', payload: { task: taskProjection(detail.thread, approvals) } },
      { event_type: 'thread.snapshot', payload: threadResponse(detail, approvals[0]) },
    ];
  }

  private async approvalsFor(threadId: string): Promise<RemoteApprovalProjection[]> {
    return this.port.listApprovals ? await this.port.listApprovals(threadId) : [];
  }

  private async taskListResponse(directory: CodexThreadDirectory): Promise<Record<string, unknown>> {
    const tasks = await Promise.all(
      directory.threads.map(async (thread) => taskProjection(thread, await this.approvalsFor(thread.id)))
    );
    return { complete: directory.complete, tasks };
  }

  private requireOnlyFields(request: RemoteActionRequest, fields: string[]): void {
    const actual = Object.keys(request.payload).sort();
    const expected = [...fields].sort();
    if (actual.length !== expected.length || actual.some((field, index) => field !== expected[index])) {
      throw new RemoteActionDispatchError(
        'invalid_payload',
        `Remote action ${request.action_id} has unsupported fields.`
      );
    }
  }

  private payloadString(payload: Record<string, unknown>, field: string): string {
    const value = payload[field];
    if (typeof value !== 'string' || !value)
      throw new RemoteActionDispatchError('canonical_failure', `Missing ${field}.`);
    return value;
  }

  private accept(request: RemoteActionRequest, payload: Record<string, unknown>): RemoteActionResponse {
    return {
      request_id: request.request_id,
      accepted: true,
      action_id: request.action_id,
      payload,
    };
  }
}

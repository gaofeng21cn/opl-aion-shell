import type {
  CodexThreadApprovalResponseRequest,
  CodexThreadDetail,
  CodexThreadDirectory,
  CodexThreadDescriptor,
  CodexThreadTurnStartResult,
} from '@/common/types/codex/appServerThreads';
import type { RemoteActionRequest, RemoteActionResponse } from '@/common/types/remoteCompanion';

export type RemoteCanonicalActionPort = {
  listThreads(): Promise<CodexThreadDirectory>;
  readThread(threadId: string): Promise<CodexThreadDetail>;
  startTurn(request: {
    threadId: string;
    conversationId: string;
    msgId: string;
    input: string;
  }): Promise<CodexThreadTurnStartResult>;
  interruptTurn(request: { threadId: string; conversationId: string; turnId: string }): Promise<void>;
  /**
   * Optional owner-projected capability. The stock Codex app-server adapter
   * does not yet expose a low/medium impact classification, so approvals stay
   * desktop-only until an owner-backed implementation is supplied.
   */
  respondRemoteApproval?(request: CodexThreadApprovalResponseRequest): Promise<void>;
  /** Same owner-bound requirement applies to starting a task with desktop defaults. */
  startWithDesktopDefaults?(): Promise<CodexThreadDescriptor>;
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

function requireThreadId(request: RemoteActionRequest): string {
  const threadId = request.canonical_thread_id?.trim();
  if (!threadId) throw new RemoteActionDispatchError('invalid_payload', 'Remote action requires canonical_thread_id.');
  return threadId;
}

function taskSummary(thread: CodexThreadDescriptor): Record<string, unknown> {
  return {
    canonical_thread_id: thread.id,
    title: thread.title,
    summary: thread.summary,
    status: thread.status,
    active_turn_id: thread.activeTurnId,
    updated_at: thread.updatedAt,
  };
}

function taskDetail(detail: CodexThreadDetail): Record<string, unknown> {
  return {
    thread: taskSummary(detail.thread),
    history: detail.history.map((item) => ({
      id: item.id,
      turn_id: item.turnId,
      role: item.role,
      kind: item.kind,
      text: item.text,
      status: item.status,
      created_at: item.createdAt,
    })),
  };
}

export class RemoteCanonicalActionBridge {
  private readonly port: RemoteCanonicalActionPort;

  constructor(port: RemoteCanonicalActionPort) {
    this.port = port;
  }

  async execute(request: RemoteActionRequest): Promise<RemoteActionResponse> {
    try {
      switch (request.action_id) {
        case 'canonical_task.list': {
          const directory = await this.port.listThreads();
          return this.accept(request, { complete: directory.complete, tasks: directory.threads.map(taskSummary) });
        }
        case 'canonical_task.read': {
          const detail = await this.port.readThread(requireThreadId(request));
          return this.accept(request, taskDetail(detail));
        }
        case 'canonical_task.refresh': {
          if (request.canonical_thread_id?.trim()) {
            const detail = await this.port.readThread(request.canonical_thread_id.trim());
            return this.accept(request, taskDetail(detail));
          }
          const directory = await this.port.listThreads();
          return this.accept(request, { complete: directory.complete, tasks: directory.threads.map(taskSummary) });
        }
        case 'canonical_task.start': {
          if (!this.port.startWithDesktopDefaults) {
            throw new RemoteActionDispatchError(
              'unsupported_action_mapping',
              'Starting a remote task is unavailable until the desktop-default bridge is owner-projected.'
            );
          }
          return this.accept(request, { task: taskSummary(await this.port.startWithDesktopDefaults()) });
        }
        case 'canonical_task.send_text': {
          const threadId = requireThreadId(request);
          const text = requiredString(request.payload, 'text');
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
          const turnId = requiredString(request.payload, 'canonical_turn_id');
          await this.port.interruptTurn({ threadId, conversationId: threadId, turnId });
          return this.accept(request, { canonical_turn_id: turnId });
        }
        case 'canonical_approval.respond': {
          if (!this.port.respondRemoteApproval) {
            throw new RemoteActionDispatchError(
              'desktop_only',
              'Remote approval responses remain desktop-only until owner impact projection is available.'
            );
          }
          const impact = requiredString(request.payload, 'impact');
          if (impact !== 'low' && impact !== 'medium') {
            throw new RemoteActionDispatchError('desktop_only', 'High-impact approvals must remain on the desktop.');
          }
          const decision = requiredString(
            request.payload,
            'decision'
          ) as CodexThreadApprovalResponseRequest['decision'];
          const approvalRequestId = requiredString(request.payload, 'approval_request_id');
          await this.port.respondRemoteApproval({ requestId: approvalRequestId, decision });
          return this.accept(request, { approval_request_id: approvalRequestId });
        }
        case 'pair.revoke':
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

  private accept(request: RemoteActionRequest, payload: Record<string, unknown>): RemoteActionResponse {
    return {
      request_id: request.request_id,
      accepted: true,
      action_id: request.action_id,
      payload,
    };
  }
}

export const __remoteCanonicalActionBridgeTest = { taskSummary, taskDetail };

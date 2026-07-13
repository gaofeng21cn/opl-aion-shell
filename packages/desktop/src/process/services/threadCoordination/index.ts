/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CODEX_THREAD_COORDINATION_METHODS,
  type CodexThreadCoordinationMethod,
  type CodexThreadDescriptor,
  type CodexThreadDetail,
  type CodexThreadServerRequest,
  type ThreadCoordinationActionRequest,
  type ThreadCoordinationActionResult,
  type ThreadCoordinationAdvisory,
  type ThreadCoordinationAuditEvent,
  type ThreadCoordinationAuditResult,
  type ThreadCoordinationErrorCode,
  type ThreadCoordinationHandoffRequest,
  type ThreadCoordinationLifecycleRequest,
  type ThreadCoordinationOverview,
  type ThreadCoordinationOverviewRequest,
  type ThreadCoordinationPermissionDecision,
  type ThreadCoordinationReadResult,
  type ThreadCoordinationResolveServerRequest,
  type ThreadCoordinationResolveServerRequestResult,
  type ThreadCoordinationReviewRequest,
  type ThreadCoordinationWriteSetDecision,
} from '@/common/types/codex/threadCoordination';
import type { ThreadCoordinationAuditStore } from './auditStore';

export type CodexThreadListSnapshot = {
  host: string;
  protocolVersion: string;
  currentThreadId: string | null;
  currentProjectId: string | null;
  threads: CodexThreadDescriptor[];
};

export type CodexThreadReviewStartResult = {
  reviewThreadId: string;
  turnId: string;
};

export type CodexThreadCoordinationPort = {
  listThreads: (request: ThreadCoordinationOverviewRequest) => Promise<CodexThreadListSnapshot>;
  readThread: (threadId: string) => Promise<CodexThreadDetail>;
  resumeThread: (threadId: string) => Promise<CodexThreadDescriptor>;
  forkThread: (threadId: string) => Promise<CodexThreadDescriptor>;
  renameThread: (threadId: string, name: string) => Promise<void>;
  updateThreadWorkspace: (threadId: string, workspace: string) => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
  unarchiveThread: (threadId: string) => Promise<CodexThreadDescriptor>;
  deleteThread: (threadId: string) => Promise<void>;
  listPendingServerRequests?: () => CodexThreadServerRequest[];
  resolveServerRequest?: (request: ThreadCoordinationResolveServerRequest) => boolean;
  startReview: (request: ThreadCoordinationReviewRequest) => Promise<CodexThreadReviewStartResult>;
  startTurn: (request: Extract<ThreadCoordinationActionRequest, { action: 'deliver' }>) => Promise<string>;
  steerTurn: (
    request: Extract<ThreadCoordinationActionRequest, { action: 'deliver' }>,
    expectedTurnId: string
  ) => Promise<string>;
  dispose?: () => void;
};

type ServiceOptions = {
  port?: CodexThreadCoordinationPort;
  auditStore: ThreadCoordinationAuditStore;
  now?: () => Date;
  createId?: () => string;
};

type ActionFailure = {
  code: ThreadCoordinationErrorCode;
  message: string;
};

type PolicyAudit = {
  permission: ThreadCoordinationPermissionDecision;
  writeSet: ThreadCoordinationWriteSetDecision;
};

type DeliveryEvaluation = {
  failure: ActionFailure | null;
  advisories: ThreadCoordinationAdvisory[];
  policy: PolicyAudit;
};

type FinishOptions = {
  target?: CodexThreadDescriptor;
  source?: CodexThreadDescriptor;
  protocolMethod?: CodexThreadCoordinationMethod | null;
  forkedThreadId?: string | null;
  reviewThreadId?: string | null;
  failure?: ActionFailure;
  outcome?: ThreadCoordinationAuditResult;
  policy?: PolicyAudit;
  statusAfter?: CodexThreadDescriptor['status'] | null;
  advisories?: ThreadCoordinationAdvisory[];
};

const MAX_ROUTE_HOPS = 4;
const MESSAGE_SUMMARY_LIMIT = 180;

function unavailableOverview(
  auditStore: ThreadCoordinationAuditStore,
  failure: ActionFailure,
  host: string | null = null,
  protocolVersion: string | null = null
): ThreadCoordinationOverview {
  return {
    schema: 'opl_codex_thread_coordination_overview.v1',
    availability: {
      status: 'unavailable',
      host,
      protocolVersion,
      methods: [...CODEX_THREAD_COORDINATION_METHODS],
      reasonCode: failure.code,
      detail: failure.message,
    },
    currentThreadId: null,
    currentProjectId: null,
    threads: [],
    audit: auditStore.readRecent(20),
  };
}

function normalizedPaths(paths: string[]): string[] {
  return [
    ...new Set(
      paths
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => path.resolve(entry))
    ),
  ];
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

function writeSetsOverlap(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizedPaths(left);
  const normalizedRight = normalizedPaths(right);
  return normalizedLeft.some((leftPath) => normalizedRight.some((rightPath) => pathsOverlap(leftPath, rightPath)));
}

function threadLabel(thread: CodexThreadDescriptor | undefined, fallback: string): string {
  return thread?.title.trim() || fallback;
}

function boundedMessageSummary(message: string): string | null {
  const normalized = message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***')
    .replace(/(bearer\s+)[^\s]+/gi, '$1***')
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s]+/gi, '$1***')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, MESSAGE_SUMMARY_LIMIT) : null;
}

function notApplicablePolicy(): PolicyAudit {
  return {
    permission: { requested: null, decision: 'not_applicable', reason: 'No delivery permission requested.' },
    writeSet: {
      requestedPathCount: 0,
      decision: 'not_applicable',
      reason: 'No delivery write set requested.',
      conflictingThreadId: null,
    },
  };
}

function initialDeliveryPolicy(request: Extract<ThreadCoordinationActionRequest, { action: 'deliver' }>): PolicyAudit {
  const requestedPathCount = normalizedPaths(request.writeSet).length;
  return {
    permission: {
      requested: request.permission,
      decision: 'not_applicable',
      reason: 'The target thread keeps its existing Codex approval and sandbox policy.',
    },
    writeSet: {
      requestedPathCount,
      decision: requestedPathCount > 0 ? 'allowed' : 'not_applicable',
      reason: requestedPathCount > 0 ? 'Expected paths are advisory coordination metadata.' : 'No path hints supplied.',
      conflictingThreadId: null,
    },
  };
}

function replayAcceptedDelivery(event: ThreadCoordinationAuditEvent): ThreadCoordinationActionResult {
  return {
    ok: true,
    outcome: 'accepted',
    action: 'deliver',
    targetThreadId: event.receiverThreadId,
    forkedThreadId: null,
    reviewThreadId: null,
    protocolMethod: event.protocolMethod,
    auditId: event.id,
    errorCode: event.errorCode,
    message: event.resultMessage,
    advisories: event.advisories ?? [],
  };
}

function reviewTargetFailure(request: ThreadCoordinationReviewRequest): ActionFailure | null {
  if (request.target.type === 'baseBranch' && !request.target.branch.trim()) {
    return { code: 'invalid_request', message: 'Review base branch is required.' };
  }
  if (request.target.type === 'commit' && !request.target.sha.trim()) {
    return { code: 'invalid_request', message: 'Review commit SHA is required.' };
  }
  if (request.target.type === 'custom' && !request.target.instructions.trim()) {
    return { code: 'invalid_request', message: 'Custom review instructions are required.' };
  }
  return null;
}

export class ThreadCoordinationService {
  private readonly port?: CodexThreadCoordinationPort;
  private readonly auditStore: ThreadCoordinationAuditStore;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly deliveryExecutions = new Map<string, Promise<ThreadCoordinationActionResult>>();

  constructor(options: ServiceOptions) {
    this.port = options.port;
    this.auditStore = options.auditStore;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  async getOverview(request: ThreadCoordinationOverviewRequest = {}): Promise<ThreadCoordinationOverview> {
    if (!this.port) {
      return unavailableOverview(this.auditStore, {
        code: 'protocol_unavailable',
        message: 'Codex app-server host adapter is not connected.',
      });
    }
    try {
      const snapshot = await this.port.listThreads(request);
      return {
        schema: 'opl_codex_thread_coordination_overview.v1',
        availability: {
          status: 'available',
          host: snapshot.host,
          protocolVersion: snapshot.protocolVersion,
          methods: [...CODEX_THREAD_COORDINATION_METHODS],
          reasonCode: null,
          detail: null,
        },
        currentThreadId: snapshot.currentThreadId,
        currentProjectId: snapshot.currentProjectId,
        threads: snapshot.threads.filter((thread) => thread.parentThreadId === null),
        audit: this.auditStore.readRecent(20),
      };
    } catch (error) {
      return unavailableOverview(this.auditStore, {
        code: 'protocol_error',
        message: error instanceof Error ? error.message : 'Codex app-server host adapter failed.',
      });
    }
  }

  async readThread(threadId: string): Promise<ThreadCoordinationReadResult> {
    if (!threadId.trim()) return { ok: false, errorCode: 'invalid_request', message: 'Thread id is required.' };
    if (!this.port) {
      return {
        ok: false,
        errorCode: 'protocol_unavailable',
        message: 'Codex app-server host adapter is not connected.',
      };
    }
    try {
      const detail = await this.port.readThread(threadId);
      if (detail.thread.parentThreadId !== null) {
        return { ok: false, errorCode: 'not_top_level_thread', message: 'Only top-level threads can be coordinated.' };
      }
      return { ok: true, detail };
    } catch (error) {
      return {
        ok: false,
        errorCode: 'protocol_error',
        message: error instanceof Error ? error.message : 'Could not read the Codex thread.',
      };
    }
  }

  listPendingServerRequests(): CodexThreadServerRequest[] {
    return this.port?.listPendingServerRequests?.() ?? [];
  }

  resolveServerRequest(request: ThreadCoordinationResolveServerRequest): ThreadCoordinationResolveServerRequestResult {
    if (!request.requestId.trim()) {
      return { ok: false, errorCode: 'invalid_request', message: 'Server request id is required.' };
    }
    if (!this.port?.resolveServerRequest) {
      return {
        ok: false,
        errorCode: 'server_request_handler_unavailable',
        message: 'Codex app-server request handling is unavailable.',
      };
    }
    try {
      if (!this.port.resolveServerRequest(request)) {
        return {
          ok: false,
          errorCode: 'server_request_not_pending',
          message: 'The Codex server request is no longer pending.',
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        errorCode: 'protocol_error',
        message: error instanceof Error ? error.message : 'Could not resolve the Codex server request.',
      };
    }
  }

  async execute(request: ThreadCoordinationActionRequest): Promise<ThreadCoordinationActionResult> {
    if (request.action !== 'deliver') return this.executeOnce(request);
    const idempotencyKey = request.idempotencyKey.trim();
    if (!idempotencyKey) return this.executeOnce(request);

    const accepted = this.auditStore.findAcceptedByIdempotencyKey(idempotencyKey);
    if (accepted) return replayAcceptedDelivery(accepted);

    const activeExecution = this.deliveryExecutions.get(idempotencyKey);
    if (activeExecution) return activeExecution;

    const execution = this.executeOnce(request);
    this.deliveryExecutions.set(idempotencyKey, execution);
    try {
      return await execution;
    } finally {
      if (this.deliveryExecutions.get(idempotencyKey) === execution) {
        this.deliveryExecutions.delete(idempotencyKey);
      }
    }
  }

  private async executeOnce(request: ThreadCoordinationActionRequest): Promise<ThreadCoordinationActionResult> {
    const targetThreadId = request.targetThreadId.trim();
    if (!targetThreadId || !request.reason.trim()) {
      return this.finish(request, {
        failure: { code: 'invalid_request', message: 'Target thread and coordination reason are required.' },
      });
    }
    if (!this.port) {
      return this.finish(request, {
        failure: { code: 'protocol_unavailable', message: 'Codex app-server host adapter is not connected.' },
      });
    }

    let snapshot: CodexThreadListSnapshot;
    try {
      snapshot = await this.port.listThreads({
        includeArchived: true,
        sourceThreadIdHint: request.actor.threadId ?? undefined,
      });
    } catch (error) {
      return this.finish(request, {
        failure: {
          code: 'protocol_error',
          message: error instanceof Error ? error.message : 'Could not discover Codex threads.',
        },
      });
    }

    const target = snapshot.threads.find((thread) => thread.id === targetThreadId);
    if (!target) {
      return this.finish(request, {
        failure: { code: 'thread_not_found', message: 'Target thread was not found.' },
      });
    }
    if (target.parentThreadId !== null) {
      return this.finish(request, {
        target,
        failure: { code: 'not_top_level_thread', message: 'Only top-level threads can be coordinated.' },
      });
    }

    if (request.action === 'deliver') return this.executeDelivery(request, snapshot, target);
    if (request.action === 'review') return this.executeReview(request, target);
    return this.executeLifecycle(request, target);
  }

  private async executeLifecycle(
    request: ThreadCoordinationLifecycleRequest | ThreadCoordinationHandoffRequest,
    target: CodexThreadDescriptor
  ): Promise<ThreadCoordinationActionResult> {
    try {
      if (request.action === 'handoff') {
        const workspace = request.workspace.trim();
        if (!path.isAbsolute(workspace)) {
          return this.finish(request, {
            target,
            failure: { code: 'invalid_request', message: 'Handoff workspace must be an absolute path.' },
          });
        }
        if (target.status === 'running' || target.status === 'archived' || target.status === 'system_error') {
          return this.finish(request, {
            target,
            failure: {
              code: 'thread_not_writable',
              message: 'The Codex task must be idle before its working directory can be handed off.',
            },
          });
        }
        await this.port?.updateThreadWorkspace(target.id, workspace);
        return this.finish(request, {
          target,
          protocolMethod: 'thread/settings/update',
          statusAfter: target.status,
        });
      }
      if (request.action === 'resume') {
        const resumed = await this.port?.resumeThread(target.id);
        return this.finish(request, {
          target,
          protocolMethod: 'thread/resume',
          statusAfter: resumed?.status ?? target.status,
        });
      }
      if (request.action === 'fork') {
        const forked = await this.port?.forkThread(target.id);
        return this.finish(request, {
          target,
          protocolMethod: 'thread/fork',
          forkedThreadId: forked?.id ?? null,
          statusAfter: target.status,
        });
      }
      if (request.action === 'rename') {
        const name = request.name.trim();
        if (!name) {
          return this.finish(request, {
            target,
            failure: { code: 'invalid_request', message: 'Thread name is required.' },
          });
        }
        await this.port?.renameThread(target.id, name);
        return this.finish(request, {
          target,
          protocolMethod: 'thread/name/set',
          statusAfter: target.status,
        });
      }
      if (request.action === 'unarchive') {
        const restored = await this.port?.unarchiveThread(target.id);
        return this.finish(request, {
          target,
          protocolMethod: 'thread/unarchive',
          statusAfter: restored?.status ?? 'idle',
        });
      }
      if (request.action === 'delete') {
        await this.port?.deleteThread(target.id);
        return this.finish(request, {
          target,
          protocolMethod: 'thread/delete',
          statusAfter: null,
        });
      }
      await this.port?.archiveThread(target.id);
      return this.finish(request, { target, protocolMethod: 'thread/archive', statusAfter: 'archived' });
    } catch (error) {
      return this.finish(request, {
        target,
        failure: {
          code: 'protocol_error',
          message: error instanceof Error ? error.message : 'Codex thread action failed.',
        },
      });
    }
  }

  private async executeReview(
    request: ThreadCoordinationReviewRequest,
    target: CodexThreadDescriptor
  ): Promise<ThreadCoordinationActionResult> {
    const invalidTarget = reviewTargetFailure(request);
    if (invalidTarget) return this.finish(request, { target, failure: invalidTarget });
    if (target.status === 'archived' || target.status === 'system_error') {
      return this.finish(request, {
        target,
        failure: { code: 'thread_not_writable', message: 'Target thread cannot start a review in its current state.' },
      });
    }
    try {
      const review = await this.port?.startReview(request);
      return this.finish(request, {
        target,
        protocolMethod: 'review/start',
        reviewThreadId: review?.reviewThreadId ?? null,
        statusAfter: request.delivery === 'inline' ? 'running' : target.status,
      });
    } catch (error) {
      return this.finish(request, {
        target,
        failure: {
          code: 'protocol_error',
          message: error instanceof Error ? error.message : 'Codex review action failed.',
        },
      });
    }
  }

  private async executeDelivery(
    request: Extract<ThreadCoordinationActionRequest, { action: 'deliver' }>,
    snapshot: CodexThreadListSnapshot,
    target: CodexThreadDescriptor
  ): Promise<ThreadCoordinationActionResult> {
    const source = snapshot.threads.find((thread) => thread.id === request.sourceThreadId);
    const evaluation = this.evaluateDelivery(request, snapshot.threads, source, target);
    if (evaluation.failure) {
      return this.finish(request, {
        target,
        source,
        failure: evaluation.failure,
        policy: evaluation.policy,
        advisories: evaluation.advisories,
      });
    }

    try {
      if (target.status === 'running') {
        if (!target.activeTurnId) {
          return this.finish(request, {
            target,
            source,
            policy: evaluation.policy,
            advisories: evaluation.advisories,
            failure: { code: 'running_turn_unknown', message: 'Running thread has no active turn precondition.' },
          });
        }
        await this.port?.steerTurn(request, target.activeTurnId);
        return this.finish(request, {
          target,
          source,
          protocolMethod: 'turn/steer',
          policy: evaluation.policy,
          advisories: evaluation.advisories,
          statusAfter: 'running',
        });
      }

      let resumed = target;
      if (target.status === 'not_loaded') resumed = (await this.port?.resumeThread(target.id)) ?? target;
      if (resumed.status === 'running') {
        if (!resumed.activeTurnId) {
          return this.finish(request, {
            target: resumed,
            source,
            policy: evaluation.policy,
            advisories: evaluation.advisories,
            failure: { code: 'running_turn_unknown', message: 'Resumed thread has no active turn precondition.' },
          });
        }
        await this.port?.steerTurn(request, resumed.activeTurnId);
        return this.finish(request, {
          target: resumed,
          source,
          protocolMethod: 'turn/steer',
          policy: evaluation.policy,
          advisories: evaluation.advisories,
          statusAfter: 'running',
        });
      }
      if (resumed.status !== 'idle' && resumed.status !== 'not_loaded') {
        return this.finish(request, {
          target: resumed,
          source,
          policy: evaluation.policy,
          advisories: evaluation.advisories,
          failure: { code: 'thread_not_writable', message: 'Target thread cannot accept a new turn.' },
        });
      }
      await this.port?.startTurn(request);
      return this.finish(request, {
        target: resumed,
        source,
        protocolMethod: 'turn/start',
        policy: evaluation.policy,
        advisories: evaluation.advisories,
        statusAfter: 'running',
      });
    } catch (error) {
      return this.finish(request, {
        target,
        source,
        policy: evaluation.policy,
        advisories: evaluation.advisories,
        failure: {
          code: 'protocol_error',
          message: error instanceof Error ? error.message : 'Thread delivery failed.',
        },
      });
    }
  }

  private evaluateDelivery(
    request: Extract<ThreadCoordinationActionRequest, { action: 'deliver' }>,
    threads: CodexThreadDescriptor[],
    source: CodexThreadDescriptor | undefined,
    target: CodexThreadDescriptor
  ): DeliveryEvaluation {
    const policy = initialDeliveryPolicy(request);
    const denyPermission = (failure: ActionFailure): DeliveryEvaluation => {
      policy.permission.decision = 'denied';
      policy.permission.reason = failure.message;
      return { failure, advisories: [], policy };
    };

    if (!source) return denyPermission({ code: 'thread_not_found', message: 'Sender thread was not found.' });
    if (source.parentThreadId !== null) {
      return denyPermission({
        code: 'not_top_level_thread',
        message: 'Only top-level threads can coordinate through this host.',
      });
    }
    if (!request.message.trim() || !request.idempotencyKey.trim()) {
      return denyPermission({ code: 'invalid_request', message: 'Message and idempotency key are required.' });
    }
    if (source.id === target.id) {
      return denyPermission({ code: 'self_delivery', message: 'A thread cannot send work to itself.' });
    }
    if (source.host !== target.host) {
      return denyPermission({
        code: 'cross_host_delivery',
        message: 'Cross-host delivery is not supported by this host.',
      });
    }
    const writeSet = normalizedPaths(request.writeSet);
    if (target.status === 'system_error' || target.status === 'archived') {
      return denyPermission({
        code: 'thread_not_writable',
        message: 'Target thread cannot accept delivery in its current state.',
      });
    }

    const advisories: ThreadCoordinationAdvisory[] = [];
    if (source.projectId !== target.projectId) advisories.push('cross_project_context');
    if (source.workspace !== target.workspace) advisories.push('workspace_context_changed');
    if (
      request.route.hopCount < 0 ||
      request.route.hopCount >= MAX_ROUTE_HOPS ||
      request.route.visitedThreadIds.includes(target.id)
    ) {
      advisories.push('delegation_cycle');
    }
    const conflictingThread = threads.find(
      (thread) =>
        thread.id !== target.id && thread.status === 'running' && writeSetsOverlap(writeSet, thread.activeWriteSet)
    );
    if (conflictingThread) {
      advisories.push('write_set_overlap');
      policy.writeSet.reason = `Expected paths overlap running thread ${conflictingThread.id}; delivery remains allowed.`;
      policy.writeSet.conflictingThreadId = conflictingThread.id;
    }
    return { failure: null, advisories, policy };
  }

  private finish(request: ThreadCoordinationActionRequest, options: FinishOptions): ThreadCoordinationActionResult {
    const auditId = this.createId();
    const observedAt = this.now().toISOString();
    const outcome: ThreadCoordinationAuditResult =
      options.outcome ??
      (options.failure
        ? options.failure.code === 'protocol_error' || options.failure.code === 'protocol_unavailable'
          ? 'failed'
          : 'rejected'
        : 'accepted');
    const policy = options.policy ?? notApplicablePolicy();
    const event: ThreadCoordinationAuditEvent = {
      schema: 'opl_codex_thread_coordination_audit.v1',
      id: auditId,
      observedAt,
      completedAt: this.now().toISOString(),
      actor: request.actor,
      action: request.action,
      senderThreadId: request.action === 'deliver' ? request.sourceThreadId : request.actor.threadId,
      receiverThreadId: request.targetThreadId,
      senderLabel: threadLabel(
        options.source,
        request.action === 'deliver' ? request.sourceThreadId : request.actor.id
      ),
      receiverLabel: threadLabel(options.target, request.targetThreadId),
      reason: request.reason.trim(),
      messageSummary: request.action === 'deliver' ? boundedMessageSummary(request.message) : null,
      result: outcome,
      resultMessage: options.failure?.message ?? `Accepted by ${options.protocolMethod ?? 'host'}.`,
      protocolMethod: options.protocolMethod ?? null,
      permission: request.action === 'deliver' ? request.permission : null,
      writeSet: request.action === 'deliver' ? normalizedPaths(request.writeSet) : [],
      permissionDecision: policy.permission,
      writeSetDecision: policy.writeSet,
      threadStatusBefore: options.target?.status ?? null,
      threadStatusAfter: options.statusAfter ?? options.target?.status ?? null,
      idempotencyKey: request.action === 'deliver' ? request.idempotencyKey.trim() : null,
      errorCode: options.failure?.code ?? null,
      advisories: options.advisories ?? [],
    };
    this.auditStore.append(event);
    return {
      ok: outcome === 'accepted',
      outcome,
      action: request.action,
      targetThreadId: request.targetThreadId,
      forkedThreadId: options.forkedThreadId ?? null,
      reviewThreadId: options.reviewThreadId ?? null,
      protocolMethod: options.protocolMethod ?? null,
      auditId,
      errorCode: options.failure?.code ?? null,
      message: event.resultMessage,
      advisories: event.advisories,
    };
  }
}

export { JsonlThreadCoordinationAuditStore } from './auditStore';

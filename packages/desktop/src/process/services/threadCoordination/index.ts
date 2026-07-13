/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  CODEX_THREAD_COORDINATION_METHODS,
  type CodexThreadCoordinationMethod,
  type CodexThreadDescriptor,
  type CodexThreadDetail,
  type ThreadCoordinationActionRequest,
  type ThreadCoordinationActionResult,
  type ThreadCoordinationAuditEvent,
  type ThreadCoordinationAuditResult,
  type ThreadCoordinationErrorCode,
  type ThreadCoordinationOverview,
  type ThreadCoordinationOverviewRequest,
  type ThreadCoordinationPermissionDecision,
  type ThreadCoordinationReadResult,
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

export type CodexThreadCoordinationPort = {
  listThreads: (request: ThreadCoordinationOverviewRequest) => Promise<CodexThreadListSnapshot>;
  readThread: (threadId: string) => Promise<CodexThreadDetail>;
  resumeThread: (threadId: string) => Promise<CodexThreadDescriptor>;
  forkThread: (threadId: string) => Promise<CodexThreadDescriptor>;
  archiveThread: (threadId: string) => Promise<void>;
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
  risks: string[];
  policy: PolicyAudit;
};

type PendingConfirmation = {
  signature: string;
  expiresAtMs: number;
  risks: string[];
};

type FinishOptions = {
  target?: CodexThreadDescriptor;
  source?: CodexThreadDescriptor;
  protocolMethod?: CodexThreadCoordinationMethod | null;
  forkedThreadId?: string | null;
  failure?: ActionFailure;
  outcome?: ThreadCoordinationAuditResult;
  confirmation?: ThreadCoordinationActionResult['confirmation'];
  policy?: PolicyAudit;
  statusAfter?: CodexThreadDescriptor['status'] | null;
};

const MAX_ROUTE_HOPS = 4;
const CONFIRMATION_TTL_MS = 2 * 60 * 1000;
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

function writeSetIsContainedBy(requested: string[], allowed: string[]): boolean {
  const normalizedAllowed = normalizedPaths(allowed);
  return normalizedPaths(requested).every((requestedPath) =>
    normalizedAllowed.some(
      (allowedPath) => requestedPath === allowedPath || requestedPath.startsWith(`${allowedPath}${path.sep}`)
    )
  );
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
  return {
    permission: { requested: request.permission, decision: 'allowed', reason: 'Requested permission passed policy.' },
    writeSet: {
      requestedPathCount: normalizedPaths(request.writeSet).length,
      decision: request.permission === 'workspace_write' ? 'allowed' : 'not_applicable',
      reason:
        request.permission === 'workspace_write'
          ? 'Declared write set passed conflict checks.'
          : 'Read-only delivery has no write set.',
      conflictingThreadId: null,
    },
  };
}

function signatureFor(request: ThreadCoordinationActionRequest): string {
  const { confirmationToken: _confirmationToken, ...unsigned } = request;
  return createHash('sha256').update(JSON.stringify(unsigned)).digest('hex');
}

export class ThreadCoordinationService {
  private readonly port?: CodexThreadCoordinationPort;
  private readonly auditStore: ThreadCoordinationAuditStore;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly confirmations = new Map<string, PendingConfirmation>();

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

  async execute(request: ThreadCoordinationActionRequest): Promise<ThreadCoordinationActionResult> {
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

    if (request.action !== 'deliver') return this.executeLifecycle(request, target);
    return this.executeDelivery(request, snapshot, target);
  }

  private async executeLifecycle(
    request: Exclude<ThreadCoordinationActionRequest, { action: 'deliver' }>,
    target: CodexThreadDescriptor
  ): Promise<ThreadCoordinationActionResult> {
    if (request.action === 'archive') {
      const confirmation = this.confirmationFor(request, ['archive_lifecycle']);
      if (confirmation.failure) {
        return this.finish(request, { target, protocolMethod: 'thread/archive', failure: confirmation.failure });
      }
      if (confirmation.required) {
        return this.finish(request, {
          target,
          protocolMethod: 'thread/archive',
          outcome: 'confirmation_required',
          confirmation: confirmation.required,
          failure: { code: 'confirmation_required', message: 'Archive requires explicit confirmation.' },
        });
      }
    }

    try {
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
      });
    }

    const intendedMethod: CodexThreadCoordinationMethod = target.status === 'running' ? 'turn/steer' : 'turn/start';
    const confirmation = this.confirmationFor(request, evaluation.risks);
    if (confirmation.failure) {
      return this.finish(request, {
        target,
        source,
        protocolMethod: intendedMethod,
        failure: confirmation.failure,
        policy: evaluation.policy,
      });
    }
    if (confirmation.required) {
      evaluation.policy.permission.decision = 'confirmation_required';
      evaluation.policy.permission.reason = `Explicit confirmation required: ${evaluation.risks.join(', ')}.`;
      if (request.permission === 'workspace_write') {
        evaluation.policy.writeSet.decision = 'confirmation_required';
        evaluation.policy.writeSet.reason = 'Write set is conflict-free but requires high-risk confirmation.';
      }
      return this.finish(request, {
        target,
        source,
        protocolMethod: intendedMethod,
        outcome: 'confirmation_required',
        confirmation: confirmation.required,
        failure: { code: 'confirmation_required', message: 'High-risk thread action requires explicit confirmation.' },
        policy: evaluation.policy,
      });
    }

    try {
      if (target.status === 'running') {
        if (!target.activeTurnId) {
          return this.finish(request, {
            target,
            source,
            policy: evaluation.policy,
            failure: { code: 'running_turn_unknown', message: 'Running thread has no active turn precondition.' },
          });
        }
        await this.port?.steerTurn(request, target.activeTurnId);
        return this.finish(request, {
          target,
          source,
          protocolMethod: 'turn/steer',
          policy: evaluation.policy,
          statusAfter: 'running',
        });
      }

      let resumed = target;
      if (target.status === 'not_loaded') resumed = (await this.port?.resumeThread(target.id)) ?? target;
      if (resumed.status === 'running') {
        const resumedConfirmation = this.confirmationFor(request, ['active_turn_steer']);
        if (resumedConfirmation.required) {
          evaluation.policy.permission.decision = 'confirmation_required';
          evaluation.policy.permission.reason = 'Resume joined an active turn; steering requires confirmation.';
          return this.finish(request, {
            target: resumed,
            source,
            protocolMethod: 'turn/steer',
            outcome: 'confirmation_required',
            confirmation: resumedConfirmation.required,
            failure: { code: 'confirmation_required', message: 'Active-turn steer requires explicit confirmation.' },
            policy: evaluation.policy,
          });
        }
        if (!resumed.activeTurnId) {
          return this.finish(request, {
            target: resumed,
            source,
            policy: evaluation.policy,
            failure: { code: 'running_turn_unknown', message: 'Resumed thread has no active turn precondition.' },
          });
        }
        await this.port?.steerTurn(request, resumed.activeTurnId);
        return this.finish(request, {
          target: resumed,
          source,
          protocolMethod: 'turn/steer',
          policy: evaluation.policy,
          statusAfter: 'running',
        });
      }
      if (resumed.status !== 'idle' && resumed.status !== 'not_loaded') {
        return this.finish(request, {
          target: resumed,
          source,
          policy: evaluation.policy,
          failure: { code: 'thread_not_writable', message: 'Target thread cannot accept a new turn.' },
        });
      }
      await this.port?.startTurn(request);
      return this.finish(request, {
        target: resumed,
        source,
        protocolMethod: 'turn/start',
        policy: evaluation.policy,
        statusAfter: 'running',
      });
    } catch (error) {
      return this.finish(request, {
        target,
        source,
        policy: evaluation.policy,
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
      return { failure, risks: [], policy };
    };
    const denyWriteSet = (failure: ActionFailure, conflictingThreadId: string | null = null): DeliveryEvaluation => {
      policy.writeSet.decision = 'denied';
      policy.writeSet.reason = failure.message;
      policy.writeSet.conflictingThreadId = conflictingThreadId;
      return { failure, risks: [], policy };
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
    if (
      request.route.hopCount < 0 ||
      request.route.hopCount >= MAX_ROUTE_HOPS ||
      request.route.visitedThreadIds.includes(target.id)
    ) {
      return denyPermission({
        code: 'delivery_loop',
        message: 'Delivery route would repeat a thread or exceed the hop limit.',
      });
    }
    if (this.auditStore.hasIdempotencyKey(request.idempotencyKey)) {
      return denyPermission({ code: 'duplicate_delivery', message: 'This delivery was already recorded.' });
    }

    const writeSet = normalizedPaths(request.writeSet);
    if (request.permission === 'read_only' && writeSet.length > 0) {
      return denyWriteSet({ code: 'invalid_request', message: 'Read-only delivery cannot declare a write set.' });
    }
    if (request.permission === 'workspace_write' && writeSet.length === 0) {
      return denyWriteSet({
        code: 'write_set_required',
        message: 'Workspace-write delivery requires an explicit write set.',
      });
    }
    if (source.projectId !== target.projectId && request.permission !== 'read_only') {
      return denyPermission({ code: 'cross_project_write', message: 'Cross-project delivery is read-only.' });
    }

    if (request.permission === 'workspace_write') {
      if (target.status === 'running' && target.activePermission !== 'workspace_write') {
        return denyPermission({
          code: 'permission_expansion_denied',
          message: 'turn/steer cannot expand the active turn permission profile.',
        });
      }
      if (target.status === 'running' && target.activeWriteSet.length === 0) {
        return denyWriteSet({ code: 'write_set_unknown', message: 'Running target has no declared write set.' });
      }
      if (target.status === 'running' && !writeSetIsContainedBy(writeSet, target.activeWriteSet)) {
        return denyWriteSet({
          code: 'write_set_conflict',
          message: 'Steering would expand the running target write set.',
        });
      }
      const conflictingThread = threads.find(
        (thread) =>
          thread.id !== target.id &&
          thread.status === 'running' &&
          thread.projectId === target.projectId &&
          writeSetsOverlap(writeSet, thread.activeWriteSet)
      );
      if (conflictingThread) {
        return denyWriteSet(
          { code: 'write_set_conflict', message: `Write set conflicts with running thread ${conflictingThread.id}.` },
          conflictingThread.id
        );
      }
    }
    if (target.status === 'system_error' || target.status === 'archived') {
      return denyPermission({
        code: 'thread_not_writable',
        message: 'Target thread cannot accept delivery in its current state.',
      });
    }

    const risks: string[] = [];
    if (source.projectId !== target.projectId) risks.push('cross_project_delivery');
    if (request.permission === 'workspace_write') risks.push('workspace_write');
    if (target.status === 'running') risks.push('active_turn_steer');
    return { failure: null, risks, policy };
  }

  private confirmationFor(
    request: ThreadCoordinationActionRequest,
    risks: string[]
  ): { required: ThreadCoordinationActionResult['confirmation']; failure: ActionFailure | null } {
    const nowMs = this.now().getTime();
    const token = request.confirmationToken?.trim();
    if (token) {
      const pending = this.confirmations.get(token);
      this.confirmations.delete(token);
      if (!pending || pending.expiresAtMs < nowMs || pending.signature !== signatureFor(request)) {
        return {
          required: null,
          failure: {
            code: 'confirmation_invalid',
            message: 'Confirmation is missing, expired, or bound to another request.',
          },
        };
      }
      return { required: null, failure: null };
    }
    if (risks.length === 0) return { required: null, failure: null };
    const confirmationToken = this.createId();
    const expiresAtMs = nowMs + CONFIRMATION_TTL_MS;
    this.confirmations.set(confirmationToken, {
      signature: signatureFor(request),
      expiresAtMs,
      risks: [...risks],
    });
    return {
      required: {
        token: confirmationToken,
        expiresAt: new Date(expiresAtMs).toISOString(),
        risks: [...risks],
      },
      failure: null,
    };
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
      idempotencyKey: request.action === 'deliver' ? request.idempotencyKey : null,
      errorCode: options.failure?.code ?? null,
    };
    this.auditStore.append(event);
    return {
      ok: outcome === 'accepted',
      outcome,
      action: request.action,
      targetThreadId: request.targetThreadId,
      forkedThreadId: options.forkedThreadId ?? null,
      protocolMethod: options.protocolMethod ?? null,
      auditId,
      errorCode: options.failure?.code ?? null,
      message: event.resultMessage,
      confirmation: options.confirmation ?? null,
    };
  }
}

export { JsonlThreadCoordinationAuditStore } from './auditStore';

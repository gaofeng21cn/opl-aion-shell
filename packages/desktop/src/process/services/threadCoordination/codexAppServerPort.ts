/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import type {
  CodexThreadCoordinationStatus,
  CodexThreadDescriptor,
  CodexThreadDetail,
  CodexThreadHistoryItem,
  CodexThreadServerRequest,
  CodexThreadServerRequestMethod,
  ThreadCoordinationDeliveryRequest,
  ThreadCoordinationOverviewRequest,
  ThreadCoordinationResolveServerRequest,
  ThreadCoordinationReviewRequest,
} from '@/common/types/codex/threadCoordination';
import type { CodexThreadCoordinationPort, CodexThreadListSnapshot, CodexThreadReviewStartResult } from './index';
import { CodexAppServerJsonRpcClient, type CodexAppServerJsonRpc } from './jsonRpcClient';
import { resolveCodexCliPath } from './codexCliResolver';

type JsonRecord = Record<string, unknown>;
type RawThread = JsonRecord & {
  id: string;
  cwd: string;
  status: JsonRecord;
  turns: JsonRecord[];
};

type ActiveCoordinationRegistration = {
  writeSet: string[];
  turnId: string;
};

type PortOptions = {
  rpc: CodexAppServerJsonRpc;
  host?: string;
  protocolVersion?: string;
  pageSize?: number;
  maxPages?: number;
};

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;
const OPL_VISIBLE_THREAD_SOURCE_KINDS = [
  'cli',
  'vscode',
  'exec',
  'appServer',
  'subAgent',
  'subAgentReview',
  'subAgentCompact',
  'subAgentThreadSpawn',
  'subAgentOther',
  'unknown',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`Invalid Codex app-server ${label}.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid Codex app-server ${label}.`);
  return value;
}

function isUnmaterializedThreadReadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('not materialized yet') &&
    error.message.includes('includeTurns is unavailable before first user message')
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).filter(Boolean);
}

function serverRequestMethod(value: string): CodexThreadServerRequestMethod | null {
  if (
    value === 'item/commandExecution/requestApproval' ||
    value === 'item/fileChange/requestApproval' ||
    value === 'item/permissions/requestApproval' ||
    value === 'item/tool/requestUserInput' ||
    value === 'mcpServer/elicitation/request' ||
    value === 'execCommandApproval' ||
    value === 'applyPatchApproval'
  ) {
    return value;
  }
  return null;
}

function mapServerRequest(
  request: ReturnType<CodexAppServerJsonRpc['listPendingServerRequests']>[number]
): CodexThreadServerRequest | null {
  const method = serverRequestMethod(request.method);
  const params = optionalRecord(request.params);
  if (!method || !params) return null;
  const legacy = method === 'execCommandApproval' || method === 'applyPatchApproval';
  const threadId = optionalString(legacy ? params.conversationId : params.threadId);
  if (!threadId) return null;
  const questions = Array.isArray(params.questions)
    ? params.questions.filter(isRecord).map((question) => ({
        id: requiredString(question.id, 'server request question id'),
        header: optionalString(question.header) ?? '',
        question: requiredString(question.question, 'server request question'),
        isOther: question.isOther === true,
        isSecret: question.isSecret === true,
        options: Array.isArray(question.options)
          ? question.options.filter(isRecord).map((option) => ({
              label: requiredString(option.label, 'server request option label'),
              description: optionalString(option.description) ?? '',
            }))
          : null,
      }))
    : [];
  const command = Array.isArray(params.command)
    ? params.command.filter((entry): entry is string => typeof entry === 'string').join(' ')
    : optionalString(params.command);
  const elicitation =
    method === 'mcpServer/elicitation/request'
      ? {
          mode: optionalString(params.mode) ?? 'form',
          serverName: optionalString(params.serverName) ?? '',
          message: optionalString(params.message) ?? '',
          url: optionalString(params.url),
          requestedSchema: params.requestedSchema ?? null,
        }
      : null;
  return {
    requestId: request.requestId,
    method,
    kind:
      method === 'item/tool/requestUserInput'
        ? 'user_input'
        : method === 'item/permissions/requestApproval'
          ? 'permissions_approval'
          : method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval'
            ? 'file_change_approval'
            : method === 'mcpServer/elicitation/request'
              ? 'mcp_elicitation'
              : 'command_approval',
    threadId,
    turnId: optionalString(params.turnId),
    itemId: optionalString(params.itemId),
    observedAt: request.observedAt,
    reason: optionalString(params.reason),
    command,
    cwd: optionalString(params.cwd),
    availableDecisions: stringArray(params.availableDecisions),
    questions,
    requestedPermissions: optionalRecord(params.permissions),
    elicitation,
  };
}

function approvalResult(
  method: CodexThreadServerRequestMethod,
  decision: Extract<ThreadCoordinationResolveServerRequest['response'], { kind: 'approval' }>['decision']
): unknown {
  if (method === 'execCommandApproval' || method === 'applyPatchApproval') {
    const legacyDecision =
      decision === 'accept'
        ? 'approved'
        : decision === 'accept_for_session'
          ? 'approved_for_session'
          : decision === 'cancel'
            ? 'abort'
            : 'denied';
    return { decision: legacyDecision };
  }
  return {
    decision: decision === 'accept_for_session' ? 'acceptForSession' : decision,
  };
}

function responseForServerRequest(
  request: CodexThreadServerRequest,
  response: ThreadCoordinationResolveServerRequest['response']
): unknown | null {
  if (request.kind === 'command_approval' || request.kind === 'file_change_approval') {
    return response.kind === 'approval' ? approvalResult(request.method, response.decision) : null;
  }
  if (request.kind === 'permissions_approval') {
    if (response.kind !== 'permissions') return null;
    return {
      permissions: response.decision === 'decline' ? {} : (request.requestedPermissions ?? {}),
      scope: response.decision === 'accept_for_session' ? 'session' : 'turn',
    };
  }
  if (request.kind === 'user_input') {
    if (response.kind !== 'user_input') return null;
    return {
      answers: Object.fromEntries(Object.entries(response.answers).map(([id, answers]) => [id, { answers }])),
    };
  }
  if (request.kind === 'mcp_elicitation') {
    if (response.kind !== 'mcp_elicitation') return null;
    return {
      action: response.action,
      content: response.action === 'accept' ? response.content : null,
      _meta: null,
    };
  }
  return null;
}

function statusFromRaw(raw: JsonRecord, archived: boolean): CodexThreadCoordinationStatus {
  if (archived) return 'archived';
  if (raw.type === 'active') return 'running';
  if (raw.type === 'idle') return 'idle';
  if (raw.type === 'systemError') return 'system_error';
  return 'not_loaded';
}

function isoFromSeconds(value: unknown): string {
  const seconds = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Date(seconds * 1000).toISOString();
}

function turnStatus(value: unknown): CodexThreadHistoryItem['status'] {
  if (value === 'inProgress') return 'in_progress';
  if (value === 'completed' || value === 'failed' || value === 'interrupted') return value;
  return 'unknown';
}

function userInputText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => (isRecord(entry) && entry.type === 'text' && typeof entry.text === 'string' ? entry.text : ''))
    .filter(Boolean)
    .join('\n');
}

function historyFromTurns(turns: JsonRecord[]): CodexThreadHistoryItem[] {
  const history: CodexThreadHistoryItem[] = [];
  turns.forEach((turn) => {
    const turnId = requiredString(turn.id, 'turn id');
    const status = turnStatus(turn.status);
    const createdAt = typeof turn.startedAt === 'number' ? isoFromSeconds(turn.startedAt) : null;
    const items = Array.isArray(turn.items) ? turn.items : [];
    items.forEach((itemValue) => {
      if (!isRecord(itemValue) || typeof itemValue.id !== 'string') return;
      let role: CodexThreadHistoryItem['role'] = 'unknown';
      let text = '';
      if (itemValue.type === 'userMessage') {
        role = 'user';
        text = userInputText(itemValue.content);
      } else if (itemValue.type === 'agentMessage' || itemValue.type === 'plan') {
        role = 'assistant';
        text = typeof itemValue.text === 'string' ? itemValue.text : '';
      } else if (itemValue.type === 'hookPrompt') {
        role = 'system';
        text = 'Hook prompt';
      } else if (typeof itemValue.type === 'string') {
        role = 'tool';
        text = itemValue.type;
      }
      if (!text) return;
      history.push({ id: itemValue.id, turnId, role, text: text.slice(0, 4_000), status, createdAt });
    });
  });
  return history;
}

function activeTurnId(turns: JsonRecord[]): string | null {
  const active = [...turns].reverse().find((turn) => turn.status === 'inProgress');
  return active && typeof active.id === 'string' ? active.id : null;
}

function projectId(raw: JsonRecord): string {
  const gitInfo = isRecord(raw.gitInfo) ? raw.gitInfo : null;
  return optionalString(gitInfo?.originUrl) ?? requiredString(raw.cwd, 'thread cwd');
}

function mapThread(
  raw: RawThread,
  archived: boolean,
  ancestors: string[],
  registration: ActiveCoordinationRegistration | undefined,
  host: string,
  goal: string | null = null
): CodexThreadDescriptor {
  const status = statusFromRaw(raw.status, archived);
  const turns = Array.isArray(raw.turns) ? raw.turns.filter(isRecord) : [];
  return {
    id: raw.id,
    title: optionalString(raw.name) ?? optionalString(raw.preview)?.slice(0, 80) ?? raw.id,
    summary: optionalString(raw.preview) ?? '',
    status,
    projectId: projectId(raw),
    workspace: raw.cwd,
    host,
    owner: optionalString(raw.agentRole) ?? optionalString(raw.agentNickname),
    goal,
    parentThreadId: optionalString(raw.parentThreadId),
    ancestorThreadIds: ancestors,
    activeTurnId: activeTurnId(turns) ?? (status === 'running' ? (registration?.turnId ?? null) : null),
    activeWriteSet: status === 'running' ? (registration?.writeSet ?? []) : [],
    activePermission: null,
    archived,
    updatedAt: isoFromSeconds(raw.updatedAt),
  };
}

function parseThread(value: unknown): RawThread {
  const raw = requiredRecord(value, 'thread') as RawThread;
  raw.id = requiredString(raw.id, 'thread id');
  raw.cwd = requiredString(raw.cwd, 'thread cwd');
  raw.status = requiredRecord(raw.status, 'thread status');
  raw.turns = Array.isArray(raw.turns) ? raw.turns.filter(isRecord) : [];
  return raw;
}

function ancestorsFor(thread: RawThread, byId: Map<string, RawThread>): string[] {
  const ancestors: string[] = [];
  let cursor = optionalString(thread.parentThreadId) ?? optionalString(thread.forkedFromId);
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    ancestors.push(cursor);
    const parent = byId.get(cursor);
    cursor = parent ? (optionalString(parent.parentThreadId) ?? optionalString(parent.forkedFromId)) : null;
  }
  return ancestors;
}

function deliveryText(request: ThreadCoordinationDeliveryRequest): string {
  return [
    `Cross-thread coordination from ${request.sourceThreadId}.`,
    `Reason: ${request.reason}`,
    '',
    request.message,
  ].join('\n');
}

export class CodexAppServerThreadCoordinationPort implements CodexThreadCoordinationPort {
  private readonly rpc: CodexAppServerJsonRpc;
  private readonly host: string;
  private readonly protocolVersion: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly activeCoordination = new Map<string, ActiveCoordinationRegistration>();

  constructor(options: PortOptions) {
    this.rpc = options.rpc;
    this.host = options.host ?? os.hostname();
    this.protocolVersion = options.protocolVersion ?? 'v2';
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.rpc.onNotification((method, params) => {
      if (method !== 'turn/completed' || !isRecord(params)) return;
      const threadId = optionalString(params.threadId);
      if (threadId) this.activeCoordination.delete(threadId);
    });
  }

  async listThreads(request: ThreadCoordinationOverviewRequest): Promise<CodexThreadListSnapshot> {
    const rawThreads = [
      ...(await this.listPages(false, request.workspace)),
      ...(request.includeArchived ? await this.listPages(true, request.workspace) : []),
    ];
    const byId = new Map(rawThreads.map(({ thread }) => [thread.id, thread]));
    const descriptors: CodexThreadDescriptor[] = [];
    for (const { thread, archived } of rawThreads) {
      let hydrated = thread;
      if (thread.status.type === 'active') {
        try {
          hydrated = await this.readRawThread(thread.id);
        } catch {
          // Keep the list row but leave active turn/write state unknown and fail closed for risky writes.
        }
      }
      descriptors.push(
        mapThread(hydrated, archived, ancestorsFor(thread, byId), this.activeCoordination.get(thread.id), this.host)
      );
    }
    const filtered = request.projectId
      ? descriptors.filter((thread) => thread.projectId === request.projectId)
      : descriptors;
    const hinted = request.sourceThreadIdHint
      ? filtered.find((thread) => thread.id === request.sourceThreadIdHint)
      : undefined;
    return {
      host: this.host,
      protocolVersion: this.protocolVersion,
      currentThreadId: hinted?.id ?? null,
      currentProjectId: hinted?.projectId ?? null,
      threads: filtered,
    };
  }

  async readThread(threadId: string): Promise<CodexThreadDetail> {
    const raw = await this.readRawThread(threadId);
    let goal: string | null = null;
    try {
      const goalResult = requiredRecord(
        await this.rpc.request('thread/goal/get', { threadId }),
        'thread goal response'
      );
      goal = isRecord(goalResult.goal) ? optionalString(goalResult.goal.objective) : null;
    } catch {
      // Older app-server versions may not expose thread goals.
    }
    const descriptor = mapThread(raw, false, [], this.activeCoordination.get(threadId), this.host, goal);
    return { thread: descriptor, history: historyFromTurns(raw.turns) };
  }

  async resumeThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/resume', { threadId, excludeTurns: false }),
      'thread resume response'
    );
    return mapThread(parseThread(response.thread), false, [], this.activeCoordination.get(threadId), this.host);
  }

  async forkThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/fork', { threadId, excludeTurns: true }),
      'thread fork response'
    );
    return mapThread(parseThread(response.thread), false, [threadId], undefined, this.host);
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    await this.rpc.request('thread/name/set', { threadId, name });
  }

  async updateThreadWorkspace(threadId: string, workspace: string): Promise<void> {
    await this.rpc.request('thread/settings/update', { threadId, cwd: workspace });
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.rpc.request('thread/archive', { threadId });
    this.activeCoordination.delete(threadId);
  }

  async unarchiveThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/unarchive', { threadId }),
      'thread unarchive response'
    );
    return mapThread(parseThread(response.thread), false, [], this.activeCoordination.get(threadId), this.host);
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.rpc.request('thread/delete', { threadId });
    this.activeCoordination.delete(threadId);
  }

  listPendingServerRequests(): CodexThreadServerRequest[] {
    return this.rpc
      .listPendingServerRequests()
      .map(mapServerRequest)
      .filter((request) => request !== null);
  }

  resolveServerRequest(request: ThreadCoordinationResolveServerRequest): boolean {
    const pending = this.listPendingServerRequests().find((entry) => entry.requestId === request.requestId);
    if (!pending) return false;
    const result = responseForServerRequest(pending, request.response);
    return result !== null && this.rpc.resolveServerRequest(request.requestId, result);
  }

  async startReview(request: ThreadCoordinationReviewRequest): Promise<CodexThreadReviewStartResult> {
    const response = requiredRecord(
      await this.rpc.request('review/start', {
        threadId: request.targetThreadId,
        target: request.target,
        delivery: request.delivery,
      }),
      'review start response'
    );
    const turn = requiredRecord(response.turn, 'review start turn');
    return {
      reviewThreadId: requiredString(response.reviewThreadId, 'review thread id'),
      turnId: requiredString(turn.id, 'review turn id'),
    };
  }

  async steerReview(reviewThreadId: string, expectedTurnId: string, context: string): Promise<string> {
    const response = requiredRecord(
      await this.rpc.request('turn/steer', {
        threadId: reviewThreadId,
        input: [{ type: 'text', text: context, text_elements: [] }],
        expectedTurnId,
      }),
      'review turn steer response'
    );
    return requiredString(response.turnId, 'steered review turn id');
  }

  async startTurn(request: ThreadCoordinationDeliveryRequest): Promise<string> {
    // Omitting turn-level context and permission overrides preserves the
    // target thread's sticky Codex settings.
    const response = requiredRecord(
      await this.rpc.request('turn/start', {
        threadId: request.targetThreadId,
        clientUserMessageId: request.idempotencyKey,
        input: [{ type: 'text', text: deliveryText(request), text_elements: [] }],
        responsesapiClientMetadata: {
          opl_coordination_sender: request.sourceThreadId,
          opl_coordination_idempotency_key: request.idempotencyKey,
        },
      }),
      'turn start response'
    );
    const turn = requiredRecord(response.turn, 'turn start turn');
    const turnId = requiredString(turn.id, 'turn id');
    this.activeCoordination.set(request.targetThreadId, {
      writeSet: [...request.writeSet],
      turnId,
    });
    return turnId;
  }

  async steerTurn(request: ThreadCoordinationDeliveryRequest, expectedTurnId: string): Promise<string> {
    const response = requiredRecord(
      await this.rpc.request('turn/steer', {
        threadId: request.targetThreadId,
        clientUserMessageId: request.idempotencyKey,
        input: [{ type: 'text', text: deliveryText(request), text_elements: [] }],
        responsesapiClientMetadata: {
          opl_coordination_sender: request.sourceThreadId,
          opl_coordination_idempotency_key: request.idempotencyKey,
        },
        expectedTurnId,
      }),
      'turn steer response'
    );
    return requiredString(response.turnId, 'steered turn id');
  }

  dispose(): void {
    this.rpc.dispose();
    this.activeCoordination.clear();
  }

  private async readRawThread(threadId: string): Promise<RawThread> {
    let result: unknown;
    try {
      result = await this.rpc.request('thread/read', { threadId, includeTurns: true });
    } catch (error) {
      if (!isUnmaterializedThreadReadError(error)) throw error;
      result = await this.rpc.request('thread/read', { threadId, includeTurns: false });
    }
    const response = requiredRecord(result, 'thread read response');
    return parseThread(response.thread);
  }

  private async listPages(
    archived: boolean,
    workspace?: string
  ): Promise<Array<{ thread: RawThread; archived: boolean }>> {
    const threads: Array<{ thread: RawThread; archived: boolean }> = [];
    let cursor: string | null = null;
    for (let page = 0; page < this.maxPages; page += 1) {
      const response = requiredRecord(
        await this.rpc.request('thread/list', {
          cursor,
          limit: this.pageSize,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          sourceKinds: OPL_VISIBLE_THREAD_SOURCE_KINDS,
          archived,
          ...(workspace ? { cwd: workspace } : {}),
        }),
        'thread list response'
      );
      if (!Array.isArray(response.data)) throw new Error('Invalid Codex app-server thread list data.');
      response.data.forEach((value) => threads.push({ thread: parseThread(value), archived }));
      cursor = optionalString(response.nextCursor);
      if (!cursor) return threads;
    }
    throw new Error('Codex app-server thread list exceeded the pagination safety limit.');
  }
}

export function createProductionCodexThreadCoordinationPort(): CodexAppServerThreadCoordinationPort {
  return new CodexAppServerThreadCoordinationPort({
    rpc: new CodexAppServerJsonRpcClient({ executable: resolveCodexCliPath }),
    host: os.hostname(),
    protocolVersion: 'v2',
  });
}

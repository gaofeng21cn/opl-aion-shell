/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type {
  CodexThreadApprovalDecision,
  CodexThreadApprovalResponseRequest,
  CodexThreadConfigurationUpdateRequest,
  CodexReviewStartRequest,
  CodexReviewStartResult,
  CodexThreadDescriptor,
  CodexThreadDetail,
  CodexThreadDirectory,
  CodexThreadDirectoryRequest,
  CodexThreadHistoryItem,
  CodexThreadInteraction,
  CodexThreadModelDescriptor,
  CodexThreadSettings,
  CodexThreadStartRequest,
  CodexThreadTurnInterruptRequest,
  CodexThreadTurnStartRequest,
  CodexThreadTurnStartResult,
} from '@/common/types/codex/appServerThreads';
import { getWindowsWslRuntime } from '../runtime-execution';
import type { WindowsWslRuntimeExecution } from '../runtime-execution';
import { resolveCodexCliPath } from './codexCliResolver';

type JsonRecord = Record<string, unknown>;
type JsonRpcRequestId = number | string;
type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};
type RawThread = JsonRecord & {
  id: string;
  cwd: string;
  status: JsonRecord;
  turns: JsonRecord[];
  canAcceptDirectInput?: boolean | null;
};

export type CodexAppServerRpc = {
  request: <T>(method: string, params: unknown, timeoutMs?: number) => Promise<T>;
  onNotification?: (handler: (method: string, params: unknown) => void) => () => void;
  onServerRequest?: (handler: (requestId: JsonRpcRequestId, method: string, params: unknown) => boolean) => () => void;
  respond?: (requestId: JsonRpcRequestId, result: unknown) => void;
  dispose: () => void;
};

export type CodexAppServerEventSink = {
  response: (message: IResponseMessage) => void;
  turnCompleted: (event: IConversationTurnCompletedEvent) => void;
};

type AdapterOptions = {
  rpc: CodexAppServerRpc;
  host?: string;
  pageSize?: number;
  maxPages?: number;
};

type CodexAppServerProcess = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'stderr' | 'kill' | 'on'>;
type SpawnCodexAppServerProcess = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean }
) => CodexAppServerProcess;
type StopCodexAppServerProcess = (process: CodexAppServerProcess) => void;

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;
const MAX_STDERR_CHARS = 2_000;

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

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function recordedCwd(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('Invalid Codex app-server thread cwd.');
  return value.trim() ? value : '';
}

function isoFromSeconds(value: unknown): string {
  const seconds = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Date(seconds * 1000).toISOString();
}

function isUnmaterializedThreadReadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('not materialized yet') &&
    error.message.includes('includeTurns is unavailable before first user message')
  );
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

const OPL_SESSION_CONTEXT_MARKERS = [
  '## OPL App 会话上下文',
  '## OPL App Session Context',
  '## 关于本次会话',
  '## About this conversation',
] as const;

function cleanOplThreadTitleFromTurns(turns: JsonRecord[]): string | null {
  for (const turn of turns) {
    const items = Array.isArray(turn.items) ? turn.items : [];
    for (const value of items) {
      if (!isRecord(value) || value.type !== 'userMessage') continue;
      const content = userInputText(value.content).trim();
      if (!content.startsWith('[Assistant Rules]\n')) continue;
      const closingTag = '\n[/Assistant Rules]';
      const closingIndex = content.indexOf(closingTag);
      if (closingIndex < 0) continue;
      const rules = content.slice(0, closingIndex);
      if (!OPL_SESSION_CONTEXT_MARKERS.some((marker) => rules.includes(marker))) continue;
      const userPrompt = content
        .slice(closingIndex + closingTag.length)
        .trim()
        .replace(/\s+/g, ' ');
      if (userPrompt) return userPrompt.slice(0, 80);
    }
  }
  return null;
}

function hasPollutedOplThreadTitle(thread: RawThread): boolean {
  const title = optionalString(thread.name);
  if (!title?.startsWith('[Assistant Rules]')) return false;
  return OPL_SESSION_CONTEXT_MARKERS.some((marker) => title.includes(marker.replace(/^## /, '')));
}

function historyFromTurns(turns: JsonRecord[]): CodexThreadHistoryItem[] {
  const history: CodexThreadHistoryItem[] = [];
  turns.forEach((turn) => {
    const turnId = requiredString(turn.id, 'turn id');
    const status = turnStatus(turn.status);
    const createdAt = typeof turn.startedAt === 'number' ? isoFromSeconds(turn.startedAt) : null;
    const items = Array.isArray(turn.items) ? turn.items : [];
    items.forEach((value) => {
      if (!isRecord(value) || typeof value.id !== 'string') return;
      let role: CodexThreadHistoryItem['role'] = 'unknown';
      let kind: CodexThreadHistoryItem['kind'] = 'text';
      let text = '';
      let data: unknown;
      if (value.type === 'userMessage') {
        role = 'user';
        text = userInputText(value.content);
      } else if (value.type === 'agentMessage') {
        role = 'assistant';
        text = typeof value.text === 'string' ? value.text : '';
      } else if (value.type === 'reasoning') {
        role = 'assistant';
        kind = 'thinking';
        const summary = Array.isArray(value.summary) ? value.summary.filter((entry) => typeof entry === 'string') : [];
        const content = Array.isArray(value.content) ? value.content.filter((entry) => typeof entry === 'string') : [];
        text = [...summary, ...content].join('\n');
        data = { content: text, subject: 'Reasoning', status: 'done' };
      } else if (value.type === 'plan') {
        role = 'assistant';
        kind = 'plan';
        text = typeof value.text === 'string' ? value.text : '';
        data = {
          session_id: turnId,
          update: {
            sessionUpdate: 'plan',
            entries: text ? [{ content: text, status: 'completed' }] : [],
          },
        };
      } else if (value.type === 'hookPrompt') {
        role = 'system';
        text = 'Hook prompt';
      } else if (typeof value.type === 'string') {
        role = 'tool';
        kind = 'tool';
        text = threadItemTitle(value);
        data = toolCallMessage(
          { conversationId: 'history', workspace: '', turnId: null },
          value,
          turnId,
          threadItemFailed(value) ? 'failed' : 'completed',
          Date.now()
        )?.data;
      }
      if (text || data) {
        history.push({
          id: value.id,
          turnId,
          role,
          kind,
          text: text.slice(0, 40_000),
          ...(data ? { data } : {}),
          status,
          createdAt,
        });
      }
    });
  });
  return history;
}

function parseThread(value: unknown): RawThread {
  const raw = requiredRecord(value, 'thread') as RawThread;
  raw.id = requiredString(raw.id, 'thread id');
  raw.cwd = recordedCwd(raw.cwd);
  raw.status = requiredRecord(raw.status, 'thread status');
  raw.turns = Array.isArray(raw.turns) ? raw.turns.filter(isRecord) : [];
  return raw;
}

function statusFromRaw(raw: JsonRecord, archived: boolean): CodexThreadDescriptor['status'] {
  if (archived) return 'archived';
  if (raw.type === 'active') return 'running';
  if (raw.type === 'idle') return 'idle';
  if (raw.type === 'systemError') return 'system_error';
  return 'not_loaded';
}

function activeTurnId(turns: JsonRecord[]): string | null {
  const active = [...turns].reverse().find((turn) => turn.status === 'inProgress');
  return active && typeof active.id === 'string' ? active.id : null;
}

function projectId(raw: JsonRecord): string {
  return optionalString(raw.projectId)?.trim() ?? '';
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

function mapThread(
  raw: RawThread,
  archived: boolean,
  ancestors: string[],
  host: string,
  goal: string | null = null,
  explicitProjectId?: string
): CodexThreadDescriptor {
  const turns = raw.turns.filter(isRecord);
  return {
    id: raw.id,
    title: optionalString(raw.name) ?? optionalString(raw.preview)?.slice(0, 80) ?? raw.id,
    summary: optionalString(raw.preview) ?? '',
    status: statusFromRaw(raw.status, archived),
    projectId: explicitProjectId ?? projectId(raw),
    workspace: recordedCwd(raw.cwd),
    host,
    owner: optionalString(raw.agentRole) ?? optionalString(raw.agentNickname),
    goal,
    parentThreadId: optionalString(raw.parentThreadId),
    ancestorThreadIds: ancestors,
    activeTurnId: activeTurnId(turns),
    archived,
    updatedAt: isoFromSeconds(raw.updatedAt),
  };
}

type ActiveConversation = {
  conversationId: string;
  workspace: string;
  turnId: string | null;
};

type PendingApproval = {
  requestId: JsonRpcRequestId;
  threadId: string;
  turnId: string;
  method:
    | 'item/commandExecution/requestApproval'
    | 'item/fileChange/requestApproval'
    | 'item/tool/requestUserInput'
    | 'item/permissions/requestApproval'
    | 'mcpServer/elicitation/request';
  decisions: Set<CodexThreadApprovalDecision>;
  decisionPayloads: Map<CodexThreadApprovalDecision, unknown>;
  title: string;
  kind: 'edit' | 'execute' | 'fetch';
  rawInput: Record<string, unknown>;
  interaction: CodexThreadInteraction;
};

const CODEX_APPROVAL_DECISIONS = new Set<CodexThreadApprovalDecision>([
  'accept',
  'acceptForSession',
  'acceptAlways',
  'acceptWithExecpolicyAmendment',
  'applyNetworkPolicyAmendment',
  'decline',
  'cancel',
]);

function messageFor(
  context: ActiveConversation,
  type: string,
  data: unknown,
  msgId: string,
  turnId: string,
  createdAt = Date.now()
): IResponseMessage {
  return {
    type,
    data,
    msg_id: msgId,
    turn_id: turnId,
    conversation_id: context.conversationId,
    created_at: createdAt,
  };
}

function threadItemKind(item: JsonRecord): 'edit' | 'execute' | 'fetch' | 'think' | 'other' {
  if (item.type === 'commandExecution') return 'execute';
  if (item.type === 'fileChange') return 'edit';
  if (
    item.type === 'mcpToolCall' ||
    item.type === 'dynamicToolCall' ||
    item.type === 'webSearch' ||
    item.type === 'imageGeneration' ||
    item.type === 'imageView'
  ) {
    return 'fetch';
  }
  if (item.type === 'reasoning' || item.type === 'plan') return 'think';
  return 'other';
}

function threadItemTitle(item: JsonRecord): string {
  if (item.type === 'commandExecution') return optionalString(item.command) ?? 'Run command';
  if (item.type === 'fileChange') return 'Apply file changes';
  if (item.type === 'mcpToolCall') {
    const server = optionalString(item.server);
    const tool = optionalString(item.tool);
    return [server, tool].filter(Boolean).join(' / ') || 'Call MCP tool';
  }
  if (item.type === 'dynamicToolCall') {
    const namespace = optionalString(item.namespace);
    const tool = optionalString(item.tool);
    return [namespace, tool].filter(Boolean).join(' / ') || 'Call tool';
  }
  if (item.type === 'collabAgentToolCall') return optionalString(item.tool) ?? 'Codex subagent';
  if (item.type === 'subAgentActivity') return `Codex subagent ${optionalString(item.kind) ?? 'activity'}`;
  if (item.type === 'imageGeneration') return 'Generate image';
  if (item.type === 'imageView') return 'View image';
  if (item.type === 'webSearch') return 'Search the web';
  return typeof item.type === 'string' ? item.type : 'Codex tool';
}

function threadItemFailed(item: JsonRecord): boolean {
  return (
    item.status === 'failed' ||
    item.status === 'declined' ||
    item.status === 'error' ||
    (item.type === 'commandExecution' && typeof item.exitCode === 'number' && item.exitCode !== 0)
  );
}

function safeJsonText(value: unknown): string | null {
  try {
    return JSON.stringify(value, null, 2).slice(0, 40_000);
  } catch {
    return null;
  }
}

function toolResultText(item: JsonRecord): string | null {
  const aggregate = optionalString(item.aggregatedOutput);
  if (aggregate) return aggregate.slice(0, 40_000);

  if (item.type === 'mcpToolCall') {
    const result = isRecord(item.result) ? item.result : null;
    const content = Array.isArray(result?.content) ? result.content.filter(isRecord) : [];
    const lines = content.flatMap((entry) => {
      const text = optionalString(entry.text);
      if (text) return [text];
      const uri = optionalString(entry.uri);
      if (uri) return [uri];
      if (entry.type === 'image') {
        const mimeType = optionalString(entry.mimeType) ?? 'image/png';
        const data = optionalString(entry.data);
        return data ? [`![MCP image](data:${mimeType};base64,${data})`] : [`[image] ${mimeType}`];
      }
      if (entry.type === 'audio') {
        const mimeType = optionalString(entry.mimeType) ?? 'audio/mpeg';
        const data = optionalString(entry.data);
        return data ? [`[audio](data:${mimeType};base64,${data})`] : [`[audio] ${mimeType}`];
      }
      return [];
    });
    if (result?.structuredContent !== undefined && result.structuredContent !== null) {
      const structured = safeJsonText(result.structuredContent);
      if (structured) lines.push(structured);
    }
    const error = isRecord(item.error) ? optionalString(item.error.message) : null;
    if (error) lines.push(error);
    return lines.join('\n').slice(0, 40_000) || null;
  }

  if (item.type === 'dynamicToolCall') {
    const items = Array.isArray(item.contentItems) ? item.contentItems.filter(isRecord) : [];
    const lines = items.flatMap((entry) => {
      const text = optionalString(entry.text);
      if (text) return [text];
      const imageUrl = optionalString(entry.imageUrl);
      if (imageUrl) return [`![tool image](${imageUrl})`];
      const audioUrl = optionalString(entry.audioUrl);
      if (audioUrl) return [`[tool audio](${audioUrl})`];
      return [];
    });
    return lines.join('\n').slice(0, 40_000) || null;
  }

  if (item.type === 'imageGeneration') {
    return optionalString(item.savedPath) ?? optionalString(item.revisedPrompt);
  }
  if (item.type === 'imageView') return optionalString(item.path);

  return null;
}

function toolCallMessage(
  context: ActiveConversation,
  item: JsonRecord,
  turnId: string,
  status: 'in_progress' | 'completed' | 'failed',
  createdAt: number
): IResponseMessage | null {
  const itemId = optionalString(item.id);
  if (!itemId) return null;
  const command = optionalString(item.command);
  const output = toolResultText(item);
  const argumentsValue = isRecord(item.arguments) ? item.arguments : null;
  const collabRawInput =
    item.type === 'collabAgentToolCall'
      ? {
          receiverThreadIds: Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds : [],
          agentsStates: isRecord(item.agentsStates) ? item.agentsStates : {},
          ...(optionalString(item.model) ? { model: optionalString(item.model) } : {}),
          ...(optionalString(item.reasoningEffort) ? { reasoningEffort: optionalString(item.reasoningEffort) } : {}),
        }
      : null;
  const subagentRawInput =
    item.type === 'subAgentActivity'
      ? {
          ...(optionalString(item.agentThreadId) ? { agentThreadId: optionalString(item.agentThreadId) } : {}),
          ...(optionalString(item.agentPath) ? { agentPath: optionalString(item.agentPath) } : {}),
          ...(optionalString(item.kind) ? { activityKind: optionalString(item.kind) } : {}),
        }
      : null;
  const meta =
    item.type === 'collabAgentToolCall'
      ? {
          codex: {
            collaboration: {
              tool: optionalString(item.tool) ?? 'subagent',
              senderThreadId: optionalString(item.senderThreadId),
              receiverThreadIds: Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds : [],
            },
          },
        }
      : item.type === 'subAgentActivity' && optionalString(item.agentThreadId)
        ? {
            codex: {
              subagent: {
                threadId: optionalString(item.agentThreadId),
                path: optionalString(item.agentPath),
                activity: optionalString(item.kind),
              },
            },
          }
        : null;
  const changes = Array.isArray(item.changes) ? item.changes.filter(isRecord) : [];
  const diffContent = changes
    .map((change) => {
      const path = optionalString(change.path);
      const diff = optionalString(change.diff);
      return path && diff
        ? {
            type: 'diff' as const,
            path,
            old_text: '',
            new_text: diff,
          }
        : null;
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);
  const outputContent = output
    ? [
        {
          type: 'content' as const,
          content: { type: 'text' as const, text: output },
        },
      ]
    : [];
  return messageFor(
    context,
    'acp_tool_call',
    {
      session_id: itemId,
      update: {
        sessionUpdate: status === 'in_progress' ? 'tool_call' : 'tool_call_update',
        tool_call_id: itemId,
        status,
        title: threadItemTitle(item),
        kind: threadItemKind(item),
        ...(command
          ? { rawInput: { command } }
          : argumentsValue
            ? { rawInput: argumentsValue }
            : collabRawInput
              ? { rawInput: collabRawInput }
              : subagentRawInput
                ? { rawInput: subagentRawInput }
                : {}),
        ...(output ? { rawOutput: { aggregatedOutput: output } } : {}),
        ...(diffContent.length > 0 || outputContent.length > 0 ? { content: [...diffContent, ...outputContent] } : {}),
        ...(meta ? { _meta: meta } : {}),
      },
    },
    itemId,
    turnId,
    createdAt
  );
}

function permissionModeParams(mode: string | undefined): JsonRecord {
  if (mode === 'read-only' || mode === 'plan') {
    return {
      approvalPolicy: 'on-request',
      sandboxPolicy: { type: 'readOnly', networkAccess: true },
    };
  }
  if (mode === 'full-access') {
    return {
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
    };
  }
  return {
    approvalPolicy: 'on-request',
    sandboxPolicy: {
      type: 'workspaceWrite',
      writableRoots: [],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    },
  };
}

function permissionModeFromResponse(value: JsonRecord): CodexThreadSettings['permissionMode'] {
  const sandbox = isRecord(value.sandbox) ? value.sandbox : null;
  if (sandbox?.type === 'readOnly') return 'read-only';
  if (sandbox?.type === 'dangerFullAccess' || value.approvalPolicy === 'never') return 'full-access';
  return 'default';
}

function settingsFromResponse(value: JsonRecord): CodexThreadSettings {
  return {
    model: requiredString(value.model, 'thread model'),
    effort: optionalString(value.reasoningEffort),
    permissionMode: permissionModeFromResponse(value),
  };
}

function modelsFromResponse(value: unknown): CodexThreadModelDescriptor[] {
  const response = requiredRecord(value, 'model list response');
  const data = Array.isArray(response.data) ? response.data.filter(isRecord) : [];
  return data.flatMap((model) => {
    const id = optionalString(model.id) ?? optionalString(model.model);
    if (!id) return [];
    const efforts = Array.isArray(model.supportedReasoningEfforts)
      ? model.supportedReasoningEfforts.flatMap((entry) => {
          if (!isRecord(entry)) return [];
          const effort = optionalString(entry.reasoningEffort);
          return effort ? [effort] : [];
        })
      : [];
    return [
      {
        id,
        label: optionalString(model.displayName) ?? id,
        description: optionalString(model.description) ?? '',
        supportedReasoningEfforts: efforts,
        defaultReasoningEffort: optionalString(model.defaultReasoningEffort),
        isDefault: model.isDefault === true,
      },
    ];
  });
}

const LOCAL_IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.heic', '.jpeg', '.jpg', '.png', '.webp']);
const LOCAL_AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav', '.webm']);

function turnInputForFile(file: string): JsonRecord {
  const normalized = requiredString(file, 'turn input file');
  const extension = path.extname(normalized).toLowerCase();
  if (LOCAL_IMAGE_EXTENSIONS.has(extension)) return { type: 'localImage', path: normalized };
  if (LOCAL_AUDIO_EXTENSIONS.has(extension)) return { type: 'localAudio', path: normalized };
  return {
    type: 'mention',
    name: path.basename(normalized),
    path: normalized,
  };
}

function approvalLabel(decision: CodexThreadApprovalDecision): string {
  if (decision === 'accept') return 'Allow once';
  if (decision === 'acceptForSession') return 'Allow for this task';
  if (decision === 'acceptAlways') return 'Always allow';
  if (decision === 'acceptWithExecpolicyAmendment') return 'Allow similar commands';
  if (decision === 'applyNetworkPolicyAmendment') return 'Apply network rule';
  if (decision === 'decline') return 'Deny';
  return 'Cancel turn';
}

function approvalKind(method: PendingApproval['method']): PendingApproval['kind'] {
  if (method === 'item/fileChange/requestApproval') return 'edit';
  if (method === 'mcpServer/elicitation/request' || method === 'item/tool/requestUserInput') return 'fetch';
  return 'execute';
}

function approvalMessage(context: ActiveConversation, approval: PendingApproval): IResponseMessage {
  const requestId = String(approval.requestId);
  return messageFor(
    context,
    'acp_permission',
    {
      session_id: approval.threadId,
      options: [...approval.decisions].map((decision) => ({
        option_id: decision,
        name: approvalLabel(decision),
        kind:
          decision === 'accept' ||
          decision === 'acceptWithExecpolicyAmendment' ||
          decision === 'applyNetworkPolicyAmendment'
            ? 'allow_once'
            : decision === 'acceptForSession' || decision === 'acceptAlways'
              ? 'allow_always'
              : decision === 'decline'
                ? 'reject_once'
                : 'reject_always',
      })),
      tool_call: {
        tool_call_id: requestId,
        raw_input: {
          ...approval.rawInput,
          codex_app_server_request: true,
          codex_interaction: approval.interaction,
        },
        status: 'pending',
        title: approval.title,
        kind: approval.kind,
      },
    },
    requestId,
    approval.turnId
  );
}

function approvalDecision(value: unknown): { id: CodexThreadApprovalDecision; payload: unknown } | null {
  if (typeof value === 'string' && CODEX_APPROVAL_DECISIONS.has(value as CodexThreadApprovalDecision)) {
    return { id: value as CodexThreadApprovalDecision, payload: value };
  }
  if (!isRecord(value)) return null;
  if (isRecord(value.acceptWithExecpolicyAmendment)) {
    return { id: 'acceptWithExecpolicyAmendment', payload: value };
  }
  if (isRecord(value.applyNetworkPolicyAmendment)) {
    return { id: 'applyNetworkPolicyAmendment', payload: value };
  }
  return null;
}

function persistModes(meta: unknown): Set<'session' | 'always'> {
  if (!isRecord(meta)) return new Set();
  const persist = meta.persist;
  const values = Array.isArray(persist) ? persist : [persist];
  return new Set(values.filter((value): value is 'session' | 'always' => value === 'session' || value === 'always'));
}

function userInputInteraction(value: unknown): CodexThreadInteraction & { kind: 'request_user_input' } {
  const questions = Array.isArray(value)
    ? value.flatMap((question) => {
        if (!isRecord(question)) return [];
        const id = optionalString(question.id);
        const prompt = optionalString(question.question);
        if (!id || !prompt) return [];
        const options = Array.isArray(question.options)
          ? question.options.flatMap((option) => {
              if (!isRecord(option)) return [];
              const label = optionalString(option.label);
              if (!label) return [];
              return [{ label, description: optionalString(option.description) ?? '' }];
            })
          : null;
        return [
          {
            id,
            header: optionalString(question.header) ?? '',
            question: prompt,
            isOther: question.isOther === true,
            isSecret: question.isSecret === true,
            options,
          },
        ];
      })
    : [];
  return { kind: 'request_user_input', questions };
}

function grantedPermissions(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(isRecord(value.network) ? { network: value.network } : {}),
    ...(isRecord(value.fileSystem) ? { fileSystem: value.fileSystem } : {}),
  };
}

function defaultSpawn(
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean }
): CodexAppServerProcess {
  return spawn(executable, args, {
    env: options.env,
    windowsHide: options.windowsHide,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function defaultStop(process: CodexAppServerProcess): void {
  process.kill();
}

class StdioCodexAppServerTransport implements CodexAppServerRpc {
  private process: CodexAppServerProcess | null = null;
  private startPromise: Promise<void> | null = null;
  private nextId = 1;
  private stdoutBuffer = '';
  private stderrTail = '';
  private disposed = false;
  private readonly pending = new Map<number, PendingRequest>();
  private notificationHandler: ((method: string, params: unknown) => void) | null = null;
  private serverRequestHandler: ((requestId: JsonRpcRequestId, method: string, params: unknown) => boolean) | null =
    null;

  constructor(
    private readonly executable: string | (() => string),
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    private readonly spawnProcess: SpawnCodexAppServerProcess = defaultSpawn,
    private readonly stopProcess: StopCodexAppServerProcess = defaultStop
  ) {}

  async request<T>(method: string, params: unknown, timeoutMs = this.requestTimeoutMs): Promise<T> {
    await this.start();
    return this.sendRequest<T>(method, params, timeoutMs);
  }

  onNotification(handler: (method: string, params: unknown) => void): () => void {
    this.notificationHandler = handler;
    return () => {
      if (this.notificationHandler === handler) this.notificationHandler = null;
    };
  }

  onServerRequest(handler: (requestId: JsonRpcRequestId, method: string, params: unknown) => boolean): () => void {
    this.serverRequestHandler = handler;
    return () => {
      if (this.serverRequestHandler === handler) this.serverRequestHandler = null;
    };
  }

  respond(requestId: JsonRpcRequestId, result: unknown): void {
    this.write({ id: requestId, result });
  }

  dispose(): void {
    this.disposed = true;
    this.notificationHandler = null;
    this.serverRequestHandler = null;
    this.rejectPending(new Error('Codex app-server adapter was disposed.'));
    if (this.process) this.stopProcess(this.process);
    this.process = null;
    this.startPromise = null;
  }

  private async start(): Promise<void> {
    if (this.disposed) throw new Error('Codex app-server adapter was disposed.');
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      const executable = typeof this.executable === 'function' ? this.executable() : this.executable;
      const child = this.spawnProcess(executable, ['app-server', '--stdio'], {
        env: this.env,
        windowsHide: true,
      });
      this.process = child;
      this.stdoutBuffer = '';
      this.stderrTail = '';
      child.stdout.on('data', (chunk: Buffer | string) => this.handleStdout(String(chunk)));
      child.stderr.on('data', (chunk: Buffer | string) => {
        this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-MAX_STDERR_CHARS);
      });
      child.on('error', (error: Error) => this.handleExit(error));
      child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
        this.handleExit(
          new Error(
            `Codex app-server exited (code=${String(code)}, signal=${String(signal)}).${
              this.stderrTail ? ` ${this.stderrTail.trim()}` : ''
            }`
          )
        )
      );
      await this.sendRequest(
        'initialize',
        {
          clientInfo: { name: 'opl-aion-shell', title: 'One Person Lab App', version: '1' },
          capabilities: { experimentalApi: true, requestAttestation: false },
        },
        this.requestTimeoutMs
      );
      this.write({ method: 'initialized' });
    })().catch((error) => {
      if (this.process) this.stopProcess(this.process);
      this.process = null;
      this.startPromise = null;
      throw error;
    });
    return this.startPromise;
  }

  private sendRequest<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    if (!this.process) return Promise.reject(new Error('Codex app-server process is not running.'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { method, timeout, resolve: (value) => resolve(value as T), reject });
      try {
        this.write({ method, id, params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(`Could not write Codex app-server request: ${method}`));
      }
    });
  }

  private write(payload: JsonRecord): void {
    if (!this.process?.stdin.writable) throw new Error('Codex app-server stdin is unavailable.');
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.stdoutBuffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let payload: unknown;
    try {
      payload = JSON.parse(line) as unknown;
    } catch {
      return;
    }
    if (!isRecord(payload)) return;
    if ((typeof payload.id === 'number' || typeof payload.id === 'string') && !('method' in payload)) {
      const numericId = typeof payload.id === 'number' ? payload.id : Number(payload.id);
      const pending = this.pending.get(numericId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(numericId);
      if (isRecord(payload.error)) {
        const message = typeof payload.error.message === 'string' ? payload.error.message : pending.method;
        pending.reject(new Error(`Codex app-server ${pending.method} failed: ${message}`));
      } else {
        pending.resolve(payload.result);
      }
      return;
    }
    if (typeof payload.method !== 'string') return;
    if (!('id' in payload)) {
      this.notificationHandler?.(payload.method, payload.params);
      return;
    }
    if (typeof payload.id !== 'number' && typeof payload.id !== 'string') return;
    const id = payload.id as JsonRpcRequestId;
    if (payload.method === 'currentTime/read') {
      this.write({ id, result: { currentTimeAt: Math.floor(Date.now() / 1000) } });
      return;
    }
    if (this.serverRequestHandler?.(id, payload.method, payload.params)) return;
    this.write({ id, error: { code: -32601, message: `Unsupported server request: ${payload.method}` } });
  }

  private handleExit(error: Error): void {
    if (!this.process) return;
    this.process = null;
    this.startPromise = null;
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pending.clear();
  }
}

export class CodexAppServerAdapter {
  private readonly rpc: CodexAppServerRpc;
  private readonly host: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly assignedProjectAffinities = new Map<string, string>();
  private readonly activeConversations = new Map<string, ActiveConversation>();
  private readonly startingThreads = new Set<string>();
  private readonly loadedThreads = new Set<string>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private eventSink: CodexAppServerEventSink | null = null;
  private readonly disposeNotification?: () => void;
  private readonly disposeServerRequest?: () => void;

  constructor(options: AdapterOptions) {
    this.rpc = options.rpc;
    this.host = options.host ?? os.hostname();
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.disposeNotification = this.rpc.onNotification?.((method, params) => this.handleNotification(method, params));
    this.disposeServerRequest = this.rpc.onServerRequest?.((requestId, method, params) =>
      this.handleServerRequest(requestId, method, params)
    );
  }

  setEventSink(sink: CodexAppServerEventSink | null): void {
    this.eventSink = sink;
  }

  listPendingApprovals(threadIdValue: string, conversationIdValue: string): IResponseMessage[] {
    const threadId = requiredString(threadIdValue, 'pending approval thread id');
    const conversationId = requiredString(conversationIdValue, 'pending approval conversation id');
    const active = this.activeConversations.get(threadId);
    const context: ActiveConversation = {
      conversationId,
      workspace: active?.workspace ?? '',
      turnId: active?.turnId ?? null,
    };
    return [...this.pendingApprovals.values()]
      .filter((approval) => approval.threadId === threadId)
      .map((approval) => approvalMessage(context, approval));
  }

  async listThreads(request: CodexThreadDirectoryRequest = {}): Promise<CodexThreadDirectory> {
    const activePage = await this.listPages(false, request.workspace);
    const archivedPage = request.includeArchived
      ? await this.listPages(true, request.workspace)
      : { items: [], complete: true };
    const rawThreads = [...activePage.items, ...archivedPage.items];
    const byId = new Map(rawThreads.map(({ thread }) => [thread.id, thread]));
    const descriptors: CodexThreadDescriptor[] = [];
    for (const { thread, archived } of rawThreads) {
      let hydrated = thread;
      const repairPollutedTitle = hasPollutedOplThreadTitle(thread);
      if (thread.status.type === 'active' || repairPollutedTitle) {
        try {
          hydrated = await this.readRawThread(thread.id);
        } catch {
          // A list row remains useful when an active thread cannot be hydrated.
        }
      }
      if (repairPollutedTitle) {
        const cleanTitle = cleanOplThreadTitleFromTurns(hydrated.turns);
        if (cleanTitle) {
          try {
            await this.renameThread(thread.id, cleanTitle);
            const renamed = await this.readRawThread(thread.id);
            if (optionalString(renamed.name) === cleanTitle) hydrated = renamed;
          } catch {
            // Keep the canonical title unchanged when repair cannot be verified.
          }
        }
      }
      descriptors.push(
        mapThread(
          hydrated,
          archived,
          ancestorsFor(thread, byId),
          this.host,
          null,
          this.assignedProjectAffinities.get(thread.id)
        )
      );
    }
    return {
      schema: 'opl_codex_thread_directory.v1',
      host: this.host,
      complete: activePage.complete && archivedPage.complete,
      threads: request.projectId ? descriptors.filter((thread) => thread.projectId === request.projectId) : descriptors,
    };
  }

  async readThread(threadId: string, conversationId?: string): Promise<CodexThreadDetail> {
    const previousContext = this.activeConversations.get(threadId);
    const context = conversationId
      ? {
          conversationId: requiredString(conversationId, 'thread conversation id'),
          workspace: previousContext?.workspace ?? '',
          turnId: previousContext?.turnId ?? null,
        }
      : null;
    if (context) this.activeConversations.set(threadId, context);

    let raw: RawThread;
    let settings: CodexThreadSettings | undefined;
    let models: CodexThreadModelDescriptor[] | undefined;
    try {
      if (context) {
        const resumed = await this.resumeRawThread(threadId);
        raw = resumed.thread;
        settings = settingsFromResponse(resumed.response);
        try {
          models = modelsFromResponse(await this.rpc.request('model/list', { limit: 100, includeHidden: false }));
        } catch {
          // A current thread remains usable when an older app-server cannot list models.
        }
      } else {
        raw = await this.readRawThread(threadId);
      }
    } catch (error) {
      if (context) {
        if (previousContext) this.activeConversations.set(threadId, previousContext);
        else this.activeConversations.delete(threadId);
      }
      throw error;
    }
    let goal: string | null = null;
    try {
      const result = requiredRecord(await this.rpc.request('thread/goal/get', { threadId }), 'thread goal response');
      goal = isRecord(result.goal) ? optionalString(result.goal.objective) : null;
    } catch {
      // Goal read is optional across app-server versions.
    }
    const thread = mapThread(raw, false, [], this.host, goal, this.assignedProjectAffinities.get(threadId));
    this.loadedThreads.add(threadId);
    if (context) {
      context.workspace = thread.workspace;
      context.turnId = thread.activeTurnId;
    }
    return {
      thread,
      history: historyFromTurns(raw.turns),
      ...(settings ? { settings } : {}),
      ...(models ? { models } : {}),
    };
  }

  async startThread(request: CodexThreadStartRequest): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/start', {
        cwd: requiredString(request.workspace, 'thread workspace'),
        ...(request.model?.trim() ? { model: request.model.trim() } : {}),
      }),
      'thread start response'
    );
    const thread = mapThread(parseThread(response.thread), false, [], this.host);
    this.loadedThreads.add(thread.id);
    return thread;
  }

  async resumeThread(threadId: string): Promise<CodexThreadDescriptor> {
    const resumed = await this.resumeRawThread(threadId);
    const thread = mapThread(resumed.thread, false, [], this.host);
    this.loadedThreads.add(thread.id);
    return thread;
  }

  async forkThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/fork', { threadId, excludeTurns: true }),
      'thread fork response'
    );
    const thread = mapThread(parseThread(response.thread), false, [threadId], this.host);
    this.loadedThreads.add(thread.id);
    return thread;
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    await this.rpc.request('thread/name/set', { threadId, name: requiredString(name, 'thread name') });
  }

  async updateThreadSettings(threadId: string, cwd: string): Promise<void> {
    await this.rpc.request('thread/settings/update', {
      threadId,
      cwd: requiredString(cwd, 'thread cwd'),
    });
  }

  async configureThread(request: CodexThreadConfigurationUpdateRequest): Promise<CodexThreadDetail> {
    const threadId = requiredString(request.threadId, 'thread configuration id');
    const params: JsonRecord = { threadId };
    if (request.model !== undefined) params.model = requiredString(request.model, 'thread model');
    if (request.effort !== undefined)
      params.effort = request.effort ? requiredString(request.effort, 'thread effort') : null;
    if (request.permissionMode !== undefined) Object.assign(params, permissionModeParams(request.permissionMode));
    if (Object.keys(params).length === 1) throw new Error('Canonical Codex thread configuration is empty.');
    await this.rpc.request('thread/settings/update', params);
    return this.readThread(threadId, this.activeConversations.get(threadId)?.conversationId);
  }

  async assignProjectAffinity(threadId: string, projectIdValue: string): Promise<CodexThreadDescriptor> {
    const raw = await this.readRawThread(threadId);
    const existingProjectId = this.assignedProjectAffinities.get(threadId) ?? projectId(raw);
    if (existingProjectId) throw new Error('Canonical thread already has explicit project affinity.');

    const selectedProjectId = requiredString(projectIdValue, 'thread project affinity').trim();
    this.assignedProjectAffinities.set(threadId, selectedProjectId);
    return mapThread(raw, false, [], this.host, null, selectedProjectId);
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.rpc.request('thread/archive', { threadId });
  }

  async unarchiveThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/unarchive', { threadId }),
      'thread unarchive response'
    );
    return mapThread(parseThread(response.thread), false, [], this.host);
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.rpc.request('thread/delete', { threadId });
    this.assignedProjectAffinities.delete(threadId);
    this.activeConversations.delete(threadId);
    this.startingThreads.delete(threadId);
    this.loadedThreads.delete(threadId);
  }

  async startTurn(request: CodexThreadTurnStartRequest): Promise<CodexThreadTurnStartResult> {
    const threadId = requiredString(request.threadId, 'turn thread id');
    const conversationId = requiredString(request.conversationId, 'turn conversation id');
    const msgId = requiredString(request.msgId, 'turn user message id');
    const input = requiredString(request.input, 'turn input');
    const previousContext = this.activeConversations.get(threadId);
    if (this.startingThreads.has(threadId) || previousContext?.turnId) {
      throw new Error('Canonical Codex thread already has an active turn.');
    }
    this.startingThreads.add(threadId);
    const reservation: ActiveConversation = {
      conversationId,
      workspace: previousContext?.workspace ?? '',
      turnId: 'starting',
    };
    this.activeConversations.set(threadId, reservation);

    try {
      const thread = await this.readThread(threadId, conversationId).then((detail) => detail.thread);
      if (thread.activeTurnId) throw new Error('Canonical Codex thread already has an active turn.');
      const context = this.activeConversations.get(threadId) ?? reservation;
      if (context.conversationId !== conversationId) {
        throw new Error('Canonical Codex turn reservation changed before send.');
      }
      context.workspace = thread.workspace;
      context.turnId = 'starting';
      const response = requiredRecord(
        await this.rpc.request('turn/start', {
          threadId,
          clientUserMessageId: msgId,
          input: [{ type: 'text', text: input, text_elements: [] }, ...(request.files ?? []).map(turnInputForFile)],
          ...(request.model?.trim() ? { model: request.model.trim() } : {}),
          ...(request.effort?.trim() ? { effort: request.effort.trim() } : {}),
          ...permissionModeParams(request.permissionMode),
        }),
        'turn start response'
      );
      const turn = requiredRecord(response.turn, 'turn start turn');
      const turnId = requiredString(turn.id, 'turn id');
      context.turnId = turnId;
      this.startingThreads.delete(threadId);
      return { msgId, turnId };
    } catch (error) {
      this.startingThreads.delete(threadId);
      const current = this.activeConversations.get(threadId);
      if (current?.conversationId === conversationId && current.turnId === 'starting') {
        if (previousContext) this.activeConversations.set(threadId, previousContext);
        else this.activeConversations.delete(threadId);
      }
      throw error;
    }
  }

  async interruptTurn(request: CodexThreadTurnInterruptRequest): Promise<void> {
    const threadId = requiredString(request.threadId, 'interrupt thread id');
    const turnId = requiredString(request.turnId, 'interrupt turn id');
    const conversationId = requiredString(request.conversationId, 'interrupt conversation id');
    const active = this.activeConversations.get(threadId);
    if (active && active.conversationId !== conversationId) {
      throw new Error('Canonical Codex turn does not belong to the selected conversation.');
    }
    if (active?.turnId && active.turnId !== turnId) {
      throw new Error('Canonical Codex turn does not match the active turn.');
    }
    await this.rpc.request('turn/interrupt', { threadId, turnId });
  }

  async respondApproval(request: CodexThreadApprovalResponseRequest): Promise<void> {
    const requestId = requiredString(request.requestId, 'approval request id');
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) throw new Error('Canonical Codex approval request is no longer pending.');
    if (!pending.decisions.has(request.decision)) {
      throw new Error(`Canonical Codex approval decision is unavailable: ${request.decision}`);
    }
    if (!this.rpc.respond) throw new Error('Codex app-server transport cannot answer approval requests.');
    switch (pending.method) {
      case 'item/tool/requestUserInput': {
        const questions = pending.interaction.kind === 'request_user_input' ? pending.interaction.questions : [];
        const answers = request.answers ?? {};
        const missing = questions.find((question) => !Array.isArray(answers[question.id]?.answers));
        if (missing) throw new Error(`Canonical Codex user input is missing an answer for: ${missing.id}`);
        this.rpc.respond(pending.requestId, { answers });
        break;
      }
      case 'item/permissions/requestApproval': {
        const requested = pending.interaction.kind === 'permissions' ? pending.interaction.request.permissions : {};
        const accepted = request.decision === 'accept' || request.decision === 'acceptForSession';
        this.rpc.respond(pending.requestId, {
          permissions: accepted ? grantedPermissions(requested) : {},
          scope: request.decision === 'acceptForSession' ? 'session' : 'turn',
        });
        break;
      }
      case 'mcpServer/elicitation/request': {
        const elicitation = pending.interaction.kind === 'mcp_elicitation' ? pending.interaction.elicitation : null;
        const accepted =
          request.decision === 'accept' ||
          request.decision === 'acceptForSession' ||
          request.decision === 'acceptAlways';
        this.rpc.respond(pending.requestId, {
          action: accepted ? 'accept' : request.decision,
          content: accepted && elicitation?.mode !== 'url' ? (request.content ?? {}) : null,
          _meta:
            request.decision === 'acceptForSession'
              ? { persist: 'session' }
              : request.decision === 'acceptAlways'
                ? { persist: 'always' }
                : null,
        });
        break;
      }
      default:
        this.rpc.respond(pending.requestId, {
          decision: pending.decisionPayloads.get(request.decision) ?? request.decision,
        });
    }
    this.pendingApprovals.delete(requestId);
  }

  async startReview(request: CodexReviewStartRequest): Promise<CodexReviewStartResult> {
    const response = requiredRecord(
      await this.rpc.request('review/start', {
        threadId: request.threadId,
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

  dispose(): void {
    this.disposeNotification?.();
    this.disposeServerRequest?.();
    this.eventSink = null;
    this.assignedProjectAffinities.clear();
    this.activeConversations.clear();
    this.startingThreads.clear();
    this.loadedThreads.clear();
    this.pendingApprovals.clear();
    this.rpc.dispose();
  }

  private async readRawThread(threadId: string): Promise<RawThread> {
    let result: unknown;
    try {
      result = await this.rpc.request('thread/read', { threadId, includeTurns: true });
    } catch (error) {
      if (!isUnmaterializedThreadReadError(error)) throw error;
      result = await this.rpc.request('thread/read', { threadId, includeTurns: false });
    }
    return parseThread(requiredRecord(result, 'thread read response').thread);
  }

  private async resumeRawThread(threadId: string): Promise<{ response: JsonRecord; thread: RawThread }> {
    const response = requiredRecord(
      await this.rpc.request('thread/resume', { threadId, excludeTurns: false }),
      'thread resume response'
    );
    return { response, thread: parseThread(response.thread) };
  }

  private emit(message: IResponseMessage): void {
    this.eventSink?.response(message);
  }

  private handleNotification(method: string, value: unknown): void {
    if (!isRecord(value)) return;
    const threadId = optionalString(value.threadId);
    if (!threadId) return;
    const context = this.activeConversations.get(threadId);
    if (!context) return;
    if (method === 'serverRequest/resolved') {
      const requestId =
        typeof value.requestId === 'number' || typeof value.requestId === 'string' ? String(value.requestId) : null;
      if (requestId) this.pendingApprovals.delete(requestId);
      return;
    }
    const turnId =
      optionalString(value.turnId) ?? (isRecord(value.turn) ? optionalString(value.turn.id) : null) ?? 'canonical-turn';

    if (method === 'turn/started') {
      context.turnId = turnId;
      this.emit(messageFor(context, 'start', { session_id: threadId }, turnId, turnId));
      return;
    }
    if (method === 'item/agentMessage/delta') {
      const itemId = optionalString(value.itemId);
      if (itemId && typeof value.delta === 'string') {
        this.emit(messageFor(context, 'text', value.delta, itemId, turnId));
      }
      return;
    }
    if (method === 'item/plan/delta') {
      const itemId = optionalString(value.itemId);
      if (itemId && typeof value.delta === 'string') {
        this.emit(
          messageFor(
            context,
            'plan',
            {
              session_id: threadId,
              update: {
                sessionUpdate: 'plan',
                entries: [{ content: value.delta, status: 'in_progress' }],
              },
            },
            itemId,
            turnId
          )
        );
      }
      return;
    }
    if (
      method === 'item/commandExecution/outputDelta' ||
      method === 'item/mcpToolCall/progress' ||
      method === 'item/fileChange/patchUpdated'
    ) {
      const itemId = optionalString(value.itemId);
      if (!itemId) return;
      const content =
        method === 'item/fileChange/patchUpdated' && Array.isArray(value.changes)
          ? value.changes
              .filter(isRecord)
              .map((change) => ({
                type: 'diff' as const,
                path: optionalString(change.path) ?? '',
                old_text: '',
                new_text: optionalString(change.diff) ?? '',
              }))
              .filter((change) => change.path && change.new_text)
          : undefined;
      const delta =
        typeof value.delta === 'string' ? value.delta : typeof value.message === 'string' ? value.message : undefined;
      const visibleContent =
        content ??
        (delta ? [{ type: 'content' as const, content: { type: 'text' as const, text: delta } }] : undefined);
      this.emit(
        messageFor(
          context,
          'acp_tool_call',
          {
            session_id: itemId,
            update: {
              sessionUpdate: 'tool_call_update',
              tool_call_id: itemId,
              status: 'in_progress',
              title: method === 'item/mcpToolCall/progress' ? 'MCP tool progress' : 'Codex tool',
              kind:
                method === 'item/fileChange/patchUpdated' ? 'edit' : method.includes('command') ? 'execute' : 'fetch',
              ...(delta ? { rawOutput: { aggregatedOutput: delta } } : {}),
              ...(visibleContent?.length ? { content: visibleContent } : {}),
            },
          },
          itemId,
          turnId
        )
      );
      return;
    }
    if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
      const itemId = optionalString(value.itemId);
      if (itemId && typeof value.delta === 'string') {
        this.emit(
          messageFor(
            context,
            'thinking',
            { content: value.delta, subject: 'Reasoning', status: 'thinking' },
            itemId,
            turnId
          )
        );
      }
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      if (!isRecord(value.item)) return;
      const item = value.item;
      const itemId = optionalString(item.id);
      const timestamp =
        typeof value.startedAtMs === 'number'
          ? value.startedAtMs
          : typeof value.completedAtMs === 'number'
            ? value.completedAtMs
            : Date.now();
      if (method === 'item/completed' && item.type === 'agentMessage' && itemId && typeof item.text === 'string') {
        this.emit({ ...messageFor(context, 'text', item.text, itemId, turnId, timestamp), replace: true });
        return;
      }
      if (method === 'item/completed' && item.type === 'reasoning' && itemId) {
        this.emit(
          messageFor(
            context,
            'thinking',
            { content: '', subject: 'Reasoning', status: 'done' },
            itemId,
            turnId,
            timestamp
          )
        );
        return;
      }
      if (
        item.type === 'commandExecution' ||
        item.type === 'fileChange' ||
        item.type === 'mcpToolCall' ||
        item.type === 'dynamicToolCall' ||
        item.type === 'webSearch' ||
        item.type === 'imageGeneration' ||
        item.type === 'imageView' ||
        item.type === 'collabAgentToolCall' ||
        item.type === 'subAgentActivity'
      ) {
        const message = toolCallMessage(
          context,
          item,
          turnId,
          method === 'item/started' ? 'in_progress' : threadItemFailed(item) ? 'failed' : 'completed',
          timestamp
        );
        if (message) this.emit(message);
      }
      return;
    }
    if (method === 'error') {
      const error = isRecord(value.error) ? value.error : value;
      const message = optionalString(error.message) ?? 'Codex app-server turn failed.';
      this.emit(messageFor(context, 'error', { message }, turnId, turnId));
      return;
    }
    if (method !== 'turn/completed' || !isRecord(value.turn)) return;

    const turn = value.turn;
    const completedTurnId = optionalString(turn.id) ?? turnId;
    const failed = turn.status === 'failed';
    if (failed) {
      const error = isRecord(turn.error) ? optionalString(turn.error.message) : null;
      this.emit(
        messageFor(
          context,
          'error',
          { message: error ?? 'Canonical Codex turn failed.' },
          completedTurnId,
          completedTurnId
        )
      );
    }
    this.emit(messageFor(context, 'finish', { session_id: threadId }, completedTurnId, completedTurnId));
    context.turnId = null;
    for (const [key, approval] of this.pendingApprovals) {
      if (approval.turnId === completedTurnId) this.pendingApprovals.delete(key);
    }
    this.eventSink?.turnCompleted({
      session_id: context.conversationId,
      turn_id: completedTurnId,
      status: 'finished',
      state: failed ? 'error' : 'ai_waiting_input',
      detail: failed ? 'Canonical Codex turn failed.' : '',
      can_send_message: true,
      runtime: {
        state: 'idle',
        can_send_message: true,
        has_task: false,
        task_status: 'finished',
        is_processing: false,
        pending_confirmations: 0,
        turn_id: null,
      },
      workspace: context.workspace,
      model: { platform: 'codex', name: 'Codex', use_model: '' },
      last_message: { content: null, created_at: Date.now() },
    });
  }

  private handleServerRequest(requestId: JsonRpcRequestId, method: string, value: unknown): boolean {
    if (
      (method !== 'item/commandExecution/requestApproval' &&
        method !== 'item/fileChange/requestApproval' &&
        method !== 'item/tool/requestUserInput' &&
        method !== 'item/permissions/requestApproval' &&
        method !== 'mcpServer/elicitation/request') ||
      !isRecord(value) ||
      !this.eventSink
    ) {
      return false;
    }
    const threadId = optionalString(value.threadId);
    if (!threadId) return false;
    const context = this.activeConversations.get(threadId);
    if (!context) return false;
    const key = String(requestId);
    const turnId = optionalString(value.turnId) ?? context.turnId ?? `request-${key}`;
    if (turnId === 'starting') return false;

    const command = optionalString(value.command);
    const reason = optionalString(value.reason) ?? optionalString(value.message);
    let interaction: CodexThreadInteraction = { kind: 'approval' };
    let decisions: CodexThreadApprovalDecision[] = [];
    let decisionPayloads = new Map<CodexThreadApprovalDecision, unknown>();
    let title = reason ?? command ?? 'Permission request';
    let rawInput: Record<string, unknown> = {
      ...(command ? { command } : {}),
      ...(reason ? { description: reason } : {}),
      ...(optionalString(value.cwd) ? { cwd: optionalString(value.cwd) } : {}),
    };

    if (method === 'item/tool/requestUserInput') {
      const userInput = userInputInteraction(value.questions);
      interaction = userInput;
      decisions = ['accept'];
      title = userInput.questions[0]?.header || userInput.questions[0]?.question || 'Codex requests input';
    } else if (method === 'item/permissions/requestApproval') {
      const permissions = isRecord(value.permissions) ? value.permissions : {};
      interaction = {
        kind: 'permissions',
        request: {
          cwd: optionalString(value.cwd) ?? context.workspace,
          reason,
          permissions,
        },
      };
      decisions = ['accept', 'acceptForSession', 'decline'];
      title = reason ?? 'Grant additional permissions';
      rawInput = {
        ...rawInput,
        permissions,
      };
    } else if (method === 'mcpServer/elicitation/request') {
      const mode = value.mode === 'url' || value.mode === 'openai/form' || value.mode === 'form' ? value.mode : 'form';
      const meta = value._meta;
      interaction = {
        kind: 'mcp_elicitation',
        elicitation: {
          mode,
          message: optionalString(value.message) ?? '',
          ...(isRecord(value.requestedSchema) ? { requestedSchema: value.requestedSchema } : {}),
          ...(optionalString(value.url) ? { url: optionalString(value.url) ?? undefined } : {}),
          ...(meta !== undefined ? { meta } : {}),
        },
      };
      decisions = ['accept'];
      const supportedPersistModes = persistModes(meta);
      if (supportedPersistModes.has('session')) decisions.push('acceptForSession');
      if (supportedPersistModes.has('always')) decisions.push('acceptAlways');
      decisions.push('decline', 'cancel');
      title = `MCP ${optionalString(value.serverName) ?? 'server'} requests input`;
      rawInput = {
        ...rawInput,
        ...(optionalString(value.url) ? { url: optionalString(value.url) } : {}),
      };
    } else {
      const available = Array.isArray(value.availableDecisions)
        ? value.availableDecisions.flatMap((decision) => {
            const normalized = approvalDecision(decision);
            return normalized ? [normalized] : [];
          })
        : [];
      const normalized =
        available.length > 0
          ? available
          : (['accept', 'acceptForSession', 'decline', 'cancel'] as CodexThreadApprovalDecision[]).map((decision) => ({
              id: decision,
              payload: decision,
            }));
      decisions = normalized.map(({ id }) => id);
      decisionPayloads = new Map(normalized.map(({ id, payload }) => [id, payload]));
      title =
        reason ?? command ?? (method === 'item/fileChange/requestApproval' ? 'Apply file changes' : 'Run command');
      rawInput = {
        ...rawInput,
        ...(value.additionalPermissions !== undefined ? { additionalPermissions: value.additionalPermissions } : {}),
        ...(value.networkApprovalContext !== undefined ? { networkApprovalContext: value.networkApprovalContext } : {}),
        ...(value.grantRoot !== undefined ? { grantRoot: value.grantRoot } : {}),
      };
    }

    const pending: PendingApproval = {
      requestId,
      threadId,
      turnId,
      method,
      decisions: new Set(decisions),
      decisionPayloads,
      title,
      kind: approvalKind(method),
      rawInput,
      interaction,
    };
    this.pendingApprovals.set(key, pending);

    this.emit(approvalMessage(context, pending));
    return true;
  }

  private async listPages(
    archived: boolean,
    workspace?: string
  ): Promise<{ items: Array<{ thread: RawThread; archived: boolean }>; complete: boolean }> {
    const threads: Array<{ thread: RawThread; archived: boolean }> = [];
    let cursor: string | null = null;
    const visitedCursors = new Set<string>();
    for (let page = 0; page < this.maxPages; page += 1) {
      const threadListParams = {
        cursor,
        limit: this.pageSize,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        archived,
        useStateDbOnly: true,
        ...(workspace ? { cwd: workspace } : {}),
      };
      const response = requiredRecord(await this.rpc.request('thread/list', threadListParams), 'thread list response');
      if (!Array.isArray(response.data)) throw new Error('Invalid Codex app-server thread list data.');
      response.data.forEach((value) => threads.push({ thread: parseThread(value), archived }));
      cursor = optionalString(response.nextCursor);
      if (!cursor) return { items: threads, complete: true };
      if (visitedCursors.has(cursor)) return { items: threads, complete: false };
      visitedCursors.add(cursor);
    }
    return { items: threads, complete: false };
  }
}

export function createProductionCodexAppServerAdapter(
  options: {
    platform?: NodeJS.Platform;
    windowsRuntime?: WindowsWslRuntimeExecution | null;
  } = {}
): CodexAppServerAdapter {
  const platform = options.platform ?? process.platform;
  if (platform === 'win32') {
    const runtime = options.windowsRuntime ?? getWindowsWslRuntime();
    if (!runtime) throw new Error('Windows Codex App Server requires the initialized OPL Linux runtime.');
    const handles = new WeakMap<CodexAppServerProcess, ReturnType<WindowsWslRuntimeExecution['spawn']>>();
    const spawnProcess: SpawnCodexAppServerProcess = (_executable, args) => {
      const handle = runtime.spawn({ program: 'codex-app-server', args });
      handles.set(handle.child, handle);
      return handle.child;
    };
    const stopProcess: StopCodexAppServerProcess = (process) => {
      const handle = handles.get(process);
      if (!handle) throw new Error('The Codex App Server process is not owned by OPL Linux.');
      void handle.terminate(5000);
    };
    return new CodexAppServerAdapter({
      rpc: new StdioCodexAppServerTransport(
        'codex',
        process.env,
        DEFAULT_REQUEST_TIMEOUT_MS,
        spawnProcess,
        stopProcess
      ),
    });
  }
  return new CodexAppServerAdapter({ rpc: new StdioCodexAppServerTransport(resolveCodexCliPath) });
}

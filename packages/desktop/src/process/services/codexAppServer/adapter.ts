/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import type {
  CodexReviewStartRequest,
  CodexReviewStartResult,
  CodexThreadDescriptor,
  CodexThreadDetail,
  CodexThreadDirectory,
  CodexThreadDirectoryRequest,
  CodexThreadHistoryItem,
  CodexThreadStartRequest,
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
};

export type CodexAppServerRpc = {
  request: <T>(method: string, params: unknown, timeoutMs?: number) => Promise<T>;
  dispose: () => void;
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
      let text = '';
      if (value.type === 'userMessage') {
        role = 'user';
        text = userInputText(value.content);
      } else if (value.type === 'agentMessage' || value.type === 'plan') {
        role = 'assistant';
        text = typeof value.text === 'string' ? value.text : '';
      } else if (value.type === 'hookPrompt') {
        role = 'system';
        text = 'Hook prompt';
      } else if (typeof value.type === 'string') {
        role = 'tool';
        text = value.type;
      }
      if (text) history.push({ id: value.id, turnId, role, text: text.slice(0, 4_000), status, createdAt });
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
  return recordedCwd(raw.cwd);
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
  goal: string | null = null
): CodexThreadDescriptor {
  const turns = raw.turns.filter(isRecord);
  return {
    id: raw.id,
    title: optionalString(raw.name) ?? optionalString(raw.preview)?.slice(0, 80) ?? raw.id,
    summary: optionalString(raw.preview) ?? '',
    status: statusFromRaw(raw.status, archived),
    projectId: projectId(raw),
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

  dispose(): void {
    this.disposed = true;
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
    if (typeof payload.method !== 'string' || !('id' in payload)) return;
    if (typeof payload.id !== 'number' && typeof payload.id !== 'string') return;
    const id = payload.id as JsonRpcRequestId;
    if (payload.method === 'currentTime/read') {
      this.write({ id, result: { currentTimeAt: Math.floor(Date.now() / 1000) } });
      return;
    }
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

  constructor(options: AdapterOptions) {
    this.rpc = options.rpc;
    this.host = options.host ?? os.hostname();
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
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
      descriptors.push(mapThread(hydrated, archived, ancestorsFor(thread, byId), this.host));
    }
    return {
      schema: 'opl_codex_thread_directory.v1',
      host: this.host,
      complete: activePage.complete && archivedPage.complete,
      threads: request.projectId ? descriptors.filter((thread) => thread.projectId === request.projectId) : descriptors,
    };
  }

  async readThread(threadId: string): Promise<CodexThreadDetail> {
    const raw = await this.readRawThread(threadId);
    let goal: string | null = null;
    try {
      const result = requiredRecord(await this.rpc.request('thread/goal/get', { threadId }), 'thread goal response');
      goal = isRecord(result.goal) ? optionalString(result.goal.objective) : null;
    } catch {
      // Goal read is optional across app-server versions.
    }
    return { thread: mapThread(raw, false, [], this.host, goal), history: historyFromTurns(raw.turns) };
  }

  async startThread(request: CodexThreadStartRequest): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/start', {
        cwd: requiredString(request.workspace, 'thread workspace'),
        ...(request.model?.trim() ? { model: request.model.trim() } : {}),
      }),
      'thread start response'
    );
    return mapThread(parseThread(response.thread), false, [], this.host);
  }

  async resumeThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/resume', { threadId, excludeTurns: false }),
      'thread resume response'
    );
    return mapThread(parseThread(response.thread), false, [], this.host);
  }

  async forkThread(threadId: string): Promise<CodexThreadDescriptor> {
    const response = requiredRecord(
      await this.rpc.request('thread/fork', { threadId, excludeTurns: true }),
      'thread fork response'
    );
    return mapThread(parseThread(response.thread), false, [threadId], this.host);
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

  private async listPages(
    archived: boolean,
    workspace?: string
  ): Promise<{ items: Array<{ thread: RawThread; archived: boolean }>; complete: boolean }> {
    const threads: Array<{ thread: RawThread; archived: boolean }> = [];
    let cursor: string | null = null;
    const visitedCursors = new Set<string>();
    for (let page = 0; page < this.maxPages; page += 1) {
      const response = requiredRecord(
        await this.rpc.request('thread/list', {
          cursor,
          limit: this.pageSize,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          archived,
          useStateDbOnly: true,
          ...(workspace ? { cwd: workspace } : {}),
        }),
        'thread list response'
      );
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

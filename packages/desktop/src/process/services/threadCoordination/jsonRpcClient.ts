/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

type JsonRecord = Record<string, unknown>;
type PendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type JsonRpcRequestId = number | string;

export type CodexAppServerPendingRequest = {
  requestId: string;
  method: string;
  params: unknown;
  observedAt: string;
};

type PendingServerRequest = CodexAppServerPendingRequest & {
  rawId: JsonRpcRequestId;
};

export type CodexAppServerProcess = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'stderr' | 'kill' | 'on'>;
export type SpawnCodexAppServerProcess = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean }
) => CodexAppServerProcess;

export type CodexAppServerJsonRpc = {
  request: <T>(method: string, params: unknown, timeoutMs?: number) => Promise<T>;
  onNotification: (listener: (method: string, params: unknown) => void) => () => void;
  listPendingServerRequests: () => CodexAppServerPendingRequest[];
  resolveServerRequest: (requestId: string, result: unknown) => boolean;
  dispose: () => void;
};

type ClientOptions = {
  executable: string | (() => string);
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  spawnProcess?: SpawnCodexAppServerProcess;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const MAX_STDERR_CHARS = 2_000;
const INTERACTIVE_SERVER_REQUEST_METHODS = new Set([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
  'execCommandApproval',
  'applyPatchApproval',
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serverRequestKey(id: JsonRpcRequestId): string {
  return `${typeof id}:${String(id)}`;
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

export class CodexAppServerJsonRpcClient implements CodexAppServerJsonRpc {
  private readonly executable: string | (() => string);
  private readonly env: NodeJS.ProcessEnv;
  private readonly requestTimeoutMs: number;
  private readonly spawnProcess: SpawnCodexAppServerProcess;
  private process: CodexAppServerProcess | null = null;
  private startPromise: Promise<void> | null = null;
  private nextId = 1;
  private stdoutBuffer = '';
  private stderrTail = '';
  private disposed = false;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingServerRequests = new Map<string, PendingServerRequest>();
  private readonly notificationListeners = new Set<(method: string, params: unknown) => void>();

  constructor(options: ClientOptions) {
    this.executable = options.executable;
    this.env = options.env ?? process.env;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.spawnProcess = options.spawnProcess ?? defaultSpawn;
  }

  async request<T>(method: string, params: unknown, timeoutMs = this.requestTimeoutMs): Promise<T> {
    await this.start();
    return this.sendRequest<T>(method, params, timeoutMs);
  }

  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  listPendingServerRequests(): CodexAppServerPendingRequest[] {
    return [...this.pendingServerRequests.values()]
      .map(({ rawId: _rawId, ...request }) => request)
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  }

  resolveServerRequest(requestId: string, result: unknown): boolean {
    const pending = this.pendingServerRequests.get(requestId);
    if (!pending) return false;
    this.write({ id: pending.rawId, result });
    this.pendingServerRequests.delete(requestId);
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.rejectPending(new Error('Codex app-server client was disposed.'));
    this.process?.kill();
    this.process = null;
    this.startPromise = null;
    this.pendingServerRequests.clear();
  }

  private async start(): Promise<void> {
    if (this.disposed) throw new Error('Codex app-server client was disposed.');
    if (this.process && this.startPromise) return this.startPromise;
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
      child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        this.handleExit(
          new Error(
            `Codex app-server exited (code=${String(code)}, signal=${String(signal)}).${
              this.stderrTail ? ` ${this.stderrTail.trim()}` : ''
            }`
          )
        );
      });

      await this.sendRequest(
        'initialize',
        {
          clientInfo: { name: 'opl-aion-shell', title: 'One Person Lab App', version: '1' },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            optOutNotificationMethods: [
              'item/agentMessage/delta',
              'item/reasoning/textDelta',
              'item/reasoning/summaryTextDelta',
              'command/exec/outputDelta',
              'process/outputDelta',
            ],
          },
        },
        this.requestTimeoutMs
      );
      this.write({ method: 'initialized' });
    })().catch((error) => {
      this.process?.kill();
      this.process = null;
      this.startPromise = null;
      throw error;
    });
    return this.startPromise;
  }

  private sendRequest<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    if (!this.process) return Promise.reject(new Error('Codex app-server process is not running.'));
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        timeout,
        resolve: (value) => resolve(value as T),
        reject,
      });
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
    if ('id' in payload) {
      if (typeof payload.id !== 'number' && typeof payload.id !== 'string') return;
      if (payload.method === 'currentTime/read') {
        this.write({ id: payload.id, result: { currentTimeAt: Math.floor(Date.now() / 1000) } });
        return;
      }
      if (INTERACTIVE_SERVER_REQUEST_METHODS.has(payload.method)) {
        const requestId = serverRequestKey(payload.id);
        this.pendingServerRequests.set(requestId, {
          requestId,
          rawId: payload.id,
          method: payload.method,
          params: payload.params,
          observedAt: new Date().toISOString(),
        });
        return;
      }
      this.write({
        id: payload.id,
        error: { code: -32601, message: `Unsupported server request: ${payload.method}` },
      });
      return;
    }
    if (payload.method === 'serverRequest/resolved' && isRecord(payload.params)) {
      const requestId = payload.params.requestId;
      if (typeof requestId === 'number' || typeof requestId === 'string') {
        this.pendingServerRequests.delete(serverRequestKey(requestId));
      }
    }
    this.notificationListeners.forEach((listener) => listener(payload.method as string, payload.params));
  }

  private handleExit(error: Error): void {
    if (!this.process) return;
    this.process = null;
    this.startPromise = null;
    this.pendingServerRequests.clear();
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

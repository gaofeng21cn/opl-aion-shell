/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type {
  CodexThreadApprovalDecision,
  CodexThreadApprovalResponseRequest,
  CodexThreadDescriptor,
  CodexThreadDetail,
  CodexThreadDirectory,
  CodexThreadDirectoryRequest,
  CodexThreadTurnInterruptRequest,
  CodexThreadTurnStartRequest,
  CodexThreadStartRequest,
  CodexThreadTurnStartResult,
} from '@/common/types/codex/appServerThreads';

export type CanonicalConversationEvent =
  | { kind: 'response'; message: IResponseMessage }
  | { kind: 'turn_completed'; event: IConversationTurnCompletedEvent };

export type CanonicalConversationSubscription = {
  dispose: () => void;
};

export type CanonicalConversationPort = {
  listThreads: (request?: CodexThreadDirectoryRequest) => Promise<CodexThreadDirectory>;
  readThread: (threadId: string, conversationId?: string) => Promise<CodexThreadDetail>;
  startThread: (request: CodexThreadStartRequest) => Promise<CodexThreadDescriptor>;
  startWithDesktopDefaults: (request: { text: string; msgId: string; workspace: string }) => Promise<{
    thread: CodexThreadDescriptor;
    turn: CodexThreadTurnStartResult;
  }>;
  startTurn: (request: CodexThreadTurnStartRequest) => Promise<CodexThreadTurnStartResult>;
  interruptTurn: (request: CodexThreadTurnInterruptRequest) => Promise<void>;
  respondApproval: (request: CodexThreadApprovalResponseRequest) => Promise<void>;
  listPendingApprovals: (threadId: string, conversationId: string) => IResponseMessage[] | Promise<IResponseMessage[]>;
  onResponse: (listener: (message: IResponseMessage) => void) => () => void;
  onTurnCompleted: (listener: (event: IConversationTurnCompletedEvent) => void) => () => void;
};

export type CanonicalConversationStartInput = {
  workspace: string;
  text?: string;
  msgId?: string;
  model?: string;
};

export type CanonicalConversationStartResult =
  | { kind: 'thread'; thread: CodexThreadDescriptor }
  | { kind: 'turn'; thread: CodexThreadDescriptor; turn: CodexThreadTurnStartResult };

export type CanonicalConversationRefreshResult =
  | { scope: 'directory'; directory: CodexThreadDirectory }
  | { scope: 'conversation'; detail: CodexThreadDetail };

export type CanonicalConversationBridgeOptions = {
  port: CanonicalConversationPort;
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`Canonical conversation requires an exact ${field}.`);
  }
  return value;
}

function optionalExactString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

function approvalMatches(message: IResponseMessage, requestId: string, decision: CodexThreadApprovalDecision): boolean {
  const data = message.data && typeof message.data === 'object' ? (message.data as Record<string, unknown>) : null;
  const toolCall =
    data?.tool_call && typeof data.tool_call === 'object' ? (data.tool_call as Record<string, unknown>) : null;
  if (message.msg_id !== requestId && toolCall?.tool_call_id !== requestId) return false;
  const options = Array.isArray(data?.options) ? data.options : [];
  return options.some((option) => {
    const record = option && typeof option === 'object' ? (option as Record<string, unknown>) : null;
    return record?.option_id === decision;
  });
}

export class CanonicalConversationBridge {
  private readonly port: CanonicalConversationPort;

  constructor(options: CanonicalConversationBridgeOptions) {
    this.port = options.port;
  }

  async directory(request: CodexThreadDirectoryRequest = {}): Promise<CodexThreadDirectory> {
    return this.port.listThreads(request);
  }

  async list(request: CodexThreadDirectoryRequest = {}): Promise<CodexThreadDirectory> {
    return this.directory(request);
  }

  async history(threadIdValue: string, conversationIdValue?: string): Promise<CodexThreadDetail> {
    const threadId = requiredString(threadIdValue, 'thread id');
    const conversationId = optionalExactString(conversationIdValue, 'conversation id');
    return this.port.readThread(threadId, conversationId);
  }

  async open(threadIdValue: string, conversationIdValue?: string): Promise<CodexThreadDetail> {
    return this.history(threadIdValue, conversationIdValue);
  }

  async start(input: CanonicalConversationStartInput): Promise<CanonicalConversationStartResult> {
    const workspace = requiredString(input.workspace, 'workspace');
    const text = input.text === undefined ? undefined : requiredString(input.text, 'start text');
    if (text === undefined) {
      return {
        kind: 'thread',
        thread: await this.port.startThread({
          workspace,
          ...(input.model === undefined ? {} : { model: requiredString(input.model, 'model') }),
        } satisfies CodexThreadStartRequest),
      };
    }
    const msgId = requiredString(input.msgId, 'start message id');
    return {
      kind: 'turn',
      ...(await this.port.startWithDesktopDefaults({ text, msgId, workspace })),
    };
  }

  async send(input: {
    threadId: string;
    text: string;
    msgId: string;
    conversationId?: string;
  }): Promise<CodexThreadTurnStartResult> {
    const threadId = requiredString(input.threadId, 'thread id');
    const conversationId =
      input.conversationId === undefined ? threadId : requiredString(input.conversationId, 'conversation id');
    return this.port.startTurn({
      threadId,
      conversationId,
      msgId: requiredString(input.msgId, 'message id'),
      input: requiredString(input.text, 'text'),
    });
  }

  async stop(input: { threadId: string; conversationId?: string; turnId?: never }): Promise<{ turnId: string }> {
    if (Object.hasOwn(input, 'turnId')) throw new Error('Canonical stop does not accept a client-selected turn id.');
    const threadId = requiredString(input.threadId, 'thread id');
    const conversationId =
      input.conversationId === undefined ? threadId : requiredString(input.conversationId, 'conversation id');
    const detail = await this.port.readThread(threadId, conversationId);
    const turnId = detail.thread.activeTurnId;
    if (!turnId) throw new Error('Canonical conversation has no active turn.');
    await this.port.interruptTurn({ threadId, conversationId, turnId });
    return { turnId };
  }

  async respondApproval(input: {
    threadId: string;
    requestId: string;
    decision: CodexThreadApprovalDecision;
    conversationId?: string;
    answers?: CodexThreadApprovalResponseRequest['answers'];
    content?: CodexThreadApprovalResponseRequest['content'];
  }): Promise<void> {
    const threadId = requiredString(input.threadId, 'thread id');
    const requestId = requiredString(input.requestId, 'approval request id');
    const conversationId =
      input.conversationId === undefined ? threadId : requiredString(input.conversationId, 'conversation id');
    const pending = (await this.port.listPendingApprovals(threadId, conversationId)).find((message) =>
      approvalMatches(message, requestId, input.decision)
    );
    if (!pending) throw new Error('Canonical approval request or decision is no longer pending.');
    await this.port.respondApproval({
      requestId,
      decision: input.decision,
      ...(input.answers === undefined ? {} : { answers: input.answers }),
      ...(input.content === undefined ? {} : { content: input.content }),
    });
  }

  subscribe(
    input: { threadId: string; conversationId?: string; turnId?: string },
    listener: (event: CanonicalConversationEvent) => void
  ): CanonicalConversationSubscription {
    const threadId = requiredString(input.threadId, 'thread id');
    const conversationIds = new Set([threadId]);
    if (input.conversationId !== undefined)
      conversationIds.add(requiredString(input.conversationId, 'conversation id'));
    const turnId = input.turnId === undefined ? undefined : requiredString(input.turnId, 'turn id');
    let disposed = false;
    const responseDispose = this.port.onResponse((message) => {
      if (disposed || !conversationIds.has(message.conversation_id) || (turnId && message.turn_id !== turnId)) return;
      listener({ kind: 'response', message });
    });
    const completedDispose = this.port.onTurnCompleted((event) => {
      if (disposed || !conversationIds.has(event.session_id) || (turnId && event.turn_id !== turnId)) return;
      listener({ kind: 'turn_completed', event });
    });
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        responseDispose();
        completedDispose();
      },
    };
  }

  stream(
    input: { threadId: string; conversationId?: string; turnId?: string },
    listener: (event: CanonicalConversationEvent) => void
  ): CanonicalConversationSubscription {
    return this.subscribe(input, listener);
  }

  async refresh(
    input: {
      threadId?: string;
      conversationId?: string;
      directory?: CodexThreadDirectoryRequest;
    } = {}
  ): Promise<CanonicalConversationRefreshResult> {
    if (input.threadId !== undefined) {
      return {
        scope: 'conversation',
        detail: await this.history(input.threadId, input.conversationId),
      };
    }
    if (input.conversationId !== undefined) throw new Error('Conversation refresh requires a thread id.');
    return { scope: 'directory', directory: await this.directory(input.directory) };
  }
}

export function createCanonicalConversationBridge(port: CanonicalConversationPort): CanonicalConversationBridge {
  return new CanonicalConversationBridge({ port });
}

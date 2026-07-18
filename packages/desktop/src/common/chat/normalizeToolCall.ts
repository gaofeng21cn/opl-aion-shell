import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';

export type NormalizedToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';

export interface NormalizedToolCall {
  key: string;
  name: string;
  status: NormalizedToolStatus;
  description?: string;
  input?: string;
  output?: string;
  truncated?: boolean;
  messageId?: string;
  conversationId?: string;
}

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const formatCommand = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((part) => typeof part === 'string')) return value.join(' ');
  return undefined;
};

// ===== tool_group → NormalizedToolCall[] =====

function normalizeToolGroupStatus(status: string): NormalizedToolStatus {
  switch (status) {
    case 'Success':
      return 'completed';
    case 'Error':
      return 'error';
    case 'Canceled':
      return 'canceled';
    case 'Pending':
      return 'pending';
    case 'Executing':
    case 'Confirming':
    default:
      return 'running';
  }
}

const getResultDisplayText = (
  result_display: IMessageToolGroup['content'][0]['result_display']
): string | undefined => {
  if (!result_display) return undefined;
  if (typeof result_display === 'string') return result_display;
  if ('file_diff' in result_display) return result_display.file_diff;
  if ('img_url' in result_display) return result_display.relative_path || result_display.img_url;
  return undefined;
};

export function normalizeToolGroup(message: IMessageToolGroup): NormalizedToolCall[] {
  if (!Array.isArray(message.content)) return [];
  return message.content.map(({ name, call_id, description, confirmationDetails, status, result_display }) => {
    let desc = typeof description === 'string' ? description.slice(0, 100) : '';
    const type = confirmationDetails?.type;
    if (type === 'edit') desc = confirmationDetails.file_name;
    if (type === 'exec') desc = confirmationDetails.command;
    if (type === 'info') desc = confirmationDetails.urls?.join(';') || confirmationDetails.title;
    if (type === 'mcp') desc = confirmationDetails.server_name + ':' + confirmationDetails.tool_name;

    let input: string | undefined;
    if (confirmationDetails) {
      const { title: _title, type: _type, ...rest } = confirmationDetails;
      if (Object.keys(rest).length) input = formatValue(rest);
    } else if (description) {
      input = description;
    }

    return {
      key: call_id,
      name,
      status: normalizeToolGroupStatus(status),
      description: desc,
      input,
      output: getResultDisplayText(result_display),
    };
  });
}

// ===== acp_tool_call → NormalizedToolCall =====

function normalizeAcpStatus(status: string): NormalizedToolStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
}

const buildParamSummary = (kind: string, rawInput?: Record<string, unknown>): string | undefined => {
  if (!rawInput) return undefined;

  if (kind === 'read' || kind === 'edit') {
    return (rawInput.file_path as string) || (rawInput.path as string) || (rawInput.file_name as string);
  }
  if (kind === 'execute') {
    return formatCommand(rawInput.command);
  }
  if (kind === 'search' || kind === 'grep') {
    const parts: string[] = [];
    if (rawInput.pattern) parts.push(`"${rawInput.pattern}"`);
    if (rawInput.path) parts.push(`in ${rawInput.path}`);
    else if (rawInput.glob) parts.push(`in ${rawInput.glob}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }
  if (kind === 'glob') {
    const parts: string[] = [];
    if (rawInput.pattern) parts.push(`${rawInput.pattern}`);
    if (rawInput.path) parts.push(`in ${rawInput.path}`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }
  if (kind === 'write') {
    return (rawInput.file_path as string) || (rawInput.path as string);
  }

  for (const key of ['file_path', 'command', 'path', 'pattern', 'query', 'url']) {
    if (key === 'command') {
      const command = formatCommand(rawInput[key]);
      if (command) return command;
    } else if (rawInput[key] && typeof rawInput[key] === 'string') {
      return rawInput[key] as string;
    }
  }
  return undefined;
};

type AcpRawOutputCompat = {
  aggregated_output?: unknown;
  aggregatedOutput?: unknown;
  formatted_output?: unknown;
  formattedOutput?: unknown;
  stdout?: unknown;
  stderr?: unknown;
};

const getNonEmptyText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
};

const joinOutputStreams = (stdout: string, stderr: string): string => {
  if (!stdout) return stderr;
  if (!stderr) return stdout;
  return `${stdout}${stdout.endsWith('\n') ? '' : '\n'}${stderr}`;
};

const getRawOutputText = (rawOutput: AcpRawOutputCompat | undefined): string | undefined => {
  if (!rawOutput) return undefined;
  const aggregate = getNonEmptyText(
    rawOutput.aggregated_output,
    rawOutput.aggregatedOutput,
    rawOutput.formatted_output,
    rawOutput.formattedOutput
  );
  if (aggregate !== undefined) return aggregate;

  return (
    joinOutputStreams(getNonEmptyText(rawOutput.stdout) ?? '', getNonEmptyText(rawOutput.stderr) ?? '') || undefined
  );
};

type AcpToolCallUpdateCompat = IMessageAcpToolCall['content']['update'] & {
  session_update?: string;
  raw_input?: Record<string, unknown>;
  raw_output?: AcpRawOutputCompat;
  rawOutput?: AcpRawOutputCompat;
  _meta?: Record<string, unknown>;
};

type AcpToolCallContentCompat = IMessageAcpToolCall['content'] & {
  _compact?: {
    truncated?: boolean;
    original_size?: number;
    preview_chars?: number;
  };
  update?: AcpToolCallUpdateCompat;
};

export function normalizeAcpToolCall(message: IMessageAcpToolCall): NormalizedToolCall | undefined {
  const content = message.content as AcpToolCallContentCompat | undefined;
  const update = content?.update;
  if (!update) return undefined;

  const rawInput = update.rawInput ?? update.raw_input;
  const input = rawInput ? formatValue(rawInput) : undefined;

  let output: string | undefined;
  const rawOutput = getRawOutputText(update.raw_output ?? update.rawOutput);
  if (rawOutput !== undefined) {
    output = rawOutput;
  } else if (Array.isArray(update.content) && update.content.length) {
    output = update.content
      .map((item) => {
        if (item.type === 'content' && item.content?.text) return item.content.text;
        if (item.type === 'diff' && 'path' in item) return `[diff] ${item.path}`;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  const keyParam = buildParamSummary(update.kind, rawInput);

  return {
    key: update.tool_call_id,
    name: update.title,
    status: normalizeAcpStatus(update.status),
    description: keyParam || formatCommand(rawInput?.command) || update.kind,
    input,
    output,
    truncated: content?._compact?.truncated === true,
    messageId: message.id,
    conversationId: message.conversation_id,
  };
}

export type NormalizedSubagentActivityStatus = 'active' | 'done';

export interface NormalizedSubagentActivity {
  threadId: string;
  name: string;
  path?: string;
  prompt?: string;
  message?: string;
  result?: string;
  model?: string;
  reasoningEffort?: string;
  tool?: string;
  status: NormalizedSubagentActivityStatus;
  rawStatus: string;
  sourceToolKey: string;
  sourceToolKeys: string[];
}

const ACTIVE_SUBAGENT_STATES = new Set(['pendingInit', 'running']);
const DONE_SUBAGENT_STATES = new Set(['interrupted', 'completed', 'errored', 'shutdown', 'notFound']);
const ACTIVE_SUBAGENT_TOOL_STATUSES = new Set(['pending', 'in_progress']);
const DONE_SUBAGENT_TOOL_STATUSES = new Set(['completed', 'failed']);

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map(nonEmptyString).filter((item): item is string => item !== undefined))]
    : [];

const normalizeSubagentState = (status: unknown): NormalizedSubagentActivityStatus | undefined => {
  if (typeof status !== 'string') return undefined;
  if (ACTIVE_SUBAGENT_STATES.has(status)) return 'active';
  if (DONE_SUBAGENT_STATES.has(status)) return 'done';
  return undefined;
};

const normalizeSubagentToolStatus = (status: unknown): NormalizedSubagentActivityStatus | undefined => {
  if (typeof status !== 'string') return undefined;
  if (ACTIVE_SUBAGENT_TOOL_STATUSES.has(status)) return 'active';
  if (DONE_SUBAGENT_TOOL_STATUSES.has(status)) return 'done';
  return undefined;
};

const subagentName = (path: string | undefined, threadId: string): string =>
  path?.split('/').findLast((part) => part.length > 0) ?? threadId;

const mergeSubagentActivity = (
  existing: NormalizedSubagentActivity | undefined,
  incoming: NormalizedSubagentActivity
): NormalizedSubagentActivity => {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    path: incoming.path ?? existing.path,
    prompt: incoming.prompt ?? existing.prompt,
    message: incoming.message ?? existing.message,
    result: incoming.result ?? existing.result,
    model: incoming.model ?? existing.model,
    reasoningEffort: incoming.reasoningEffort ?? existing.reasoningEffort,
    tool: incoming.tool ?? existing.tool,
    name: incoming.path ? incoming.name : existing.name,
    sourceToolKeys: [...new Set([...existing.sourceToolKeys, ...incoming.sourceToolKeys])],
  };
};

/**
 * Projects Codex delegated execution metadata from existing ACP tool calls.
 * Invalid or unknown metadata is deliberately ignored so the generic tool row remains usable.
 */
export function normalizeSubagentActivities(messages: ToolMessage[]): NormalizedSubagentActivity[] {
  const byThreadId = new Map<string, NormalizedSubagentActivity>();

  for (const message of messages) {
    if (message.type !== 'acp_tool_call') continue;
    const content = message.content as AcpToolCallContentCompat | undefined;
    const update = content?.update;
    const sourceToolKey = nonEmptyString(update?.tool_call_id);
    if (!update || !sourceToolKey) continue;

    const rawInput = update.rawInput ?? update.raw_input;
    const meta = asRecord(update._meta);
    const codex = asRecord(meta?.codex);
    const collaboration = asRecord(codex?.collaboration);
    const subagent = asRecord(codex?.subagent);
    if (!collaboration && !subagent) continue;

    const subagentThreadId = nonEmptyString(subagent?.threadId);
    const path = nonEmptyString(subagent?.path);
    const prompt = nonEmptyString(rawInput?.prompt);
    const model = nonEmptyString(rawInput?.model);
    const reasoningEffort = nonEmptyString(rawInput?.reasoningEffort ?? rawInput?.reasoning_effort);
    const result = getRawOutputText(update.raw_output ?? update.rawOutput);
    const tool = nonEmptyString(collaboration?.tool);
    const agentStates = asRecord(rawInput?.agentsStates);

    for (const threadId of stringArray(collaboration?.receiverThreadIds)) {
      const agentState = asRecord(agentStates?.[threadId]);
      const rawStatus = nonEmptyString(agentState?.status);
      const status = normalizeSubagentState(rawStatus);
      if (!status || !rawStatus) continue;
      const candidatePath = subagentThreadId === threadId ? path : undefined;
      const candidate: NormalizedSubagentActivity = {
        threadId,
        name: subagentName(candidatePath, threadId),
        path: candidatePath,
        prompt,
        message: nonEmptyString(agentState?.message),
        result,
        model,
        reasoningEffort,
        tool,
        status,
        rawStatus,
        sourceToolKey,
        sourceToolKeys: [sourceToolKey],
      };
      byThreadId.set(threadId, mergeSubagentActivity(byThreadId.get(threadId), candidate));
    }

    if (subagentThreadId) {
      const rawStatus = nonEmptyString(update.status);
      const status = normalizeSubagentToolStatus(rawStatus);
      if (status && rawStatus) {
        const candidate: NormalizedSubagentActivity = {
          threadId: subagentThreadId,
          name: subagentName(path, subagentThreadId),
          path,
          prompt,
          result,
          model,
          reasoningEffort,
          tool,
          status,
          rawStatus,
          sourceToolKey,
          sourceToolKeys: [sourceToolKey],
        };
        byThreadId.set(subagentThreadId, mergeSubagentActivity(byThreadId.get(subagentThreadId), candidate));
      }
    }
  }

  return [...byThreadId.values()];
}

// ===== tool_call → NormalizedToolCall =====

function normalizeToolCallStatus(status?: string): NormalizedToolStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'running':
      return 'running';
    default:
      return 'pending';
  }
}

export function normalizeToolCall(message: IMessageToolCall): NormalizedToolCall | undefined {
  const { call_id, name, status, input, output, args, description } = message.content;
  if (!call_id) return undefined;

  const displayInput = input
    ? formatValue(input)
    : args && Object.keys(args).length > 0
      ? formatValue(args)
      : undefined;

  return {
    key: call_id,
    name,
    status: normalizeToolCallStatus(status),
    description: description || undefined,
    input: displayInput,
    output,
  };
}

// ===== Unified entry =====

export type ToolMessage = IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall;

export function normalizeToolMessages(messages: ToolMessage[]): NormalizedToolCall[] {
  return messages
    .flatMap((m) => {
      if (m.type === 'tool_group') return normalizeToolGroup(m);
      if (m.type === 'acp_tool_call') return normalizeAcpToolCall(m);
      if (m.type === 'tool_call') return normalizeToolCall(m);
      return undefined;
    })
    .filter((item): item is NormalizedToolCall => item !== undefined);
}

export function hasRunningToolMessages(messages: ToolMessage[]): boolean {
  return messages.some((m) => {
    if (m.type === 'tool_group') {
      return Array.isArray(m.content) && m.content.some((t) => normalizeToolGroupStatus(t.status) === 'running');
    }
    if (m.type === 'acp_tool_call') {
      return m.content?.update && normalizeAcpStatus(m.content.update.status) === 'running';
    }
    if (m.type === 'tool_call') {
      return normalizeToolCallStatus(m.content?.status) === 'running';
    }
    return false;
  });
}

import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';

const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
const TRAILING_WINDOWS_FILENAME_CHARS_RE = /[. ]+$/g;
const WINDOWS_RESERVED_NAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const OBVIOUS_SECRET_RE =
  /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{20,})\b/g;
const AUTHORIZATION_TOKEN_RE = /(\b(?:Bearer|Basic)\s+)[A-Za-z0-9._~+/-]{8,}=*/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const TOKEN_ASSIGNMENT_RE =
  /(\b(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|token)\b\s*[:=]\s*)(["'`]?)([A-Za-z0-9._~+/=-]{8,})(\2)/gi;
const SENSITIVE_KEY_RE =
  /(?:api[_-]?key|client[_-]?secret|access[_-]?key|secret|password|private[_-]?key|token|authorization)/i;
const REDACTED_VALUE = '[REDACTED]';
const DEFAULT_MAX_EXPORT_PAGES = 10_000;
const MAX_ASCII_CONTROL_CODE_POINT = 0x1f;
const DELETE_CONTROL_CODE_POINT = 0x7f;
const padTimestampPart = (value: number): string => String(value).padStart(2, '0');

export const CONVERSATION_EXPORT_PAGE_SIZE = 200;

export type ConversationExportFormat = 'markdown' | 'json';
export type MessageRole = 'user' | 'assistant' | 'system';
type ShareableMessageRole = Exclude<MessageRole, 'system'>;

export type ExportTranscriptLabels = {
  conversation: string;
  exportedAt: string;
  noMessages: string;
  redactionNotice: string;
} & Record<ShareableMessageRole, string>;

export type ConversationExportMessage = {
  role: ShareableMessageRole;
  content: string;
};

export type ConversationExportDocument = {
  title: string;
  exported_at: string;
  messages: ConversationExportMessage[];
  redacted: boolean;
};

export type ConversationMessagesPageRequest = {
  limit: number;
  before?: string;
  after?: string;
  anchor_message_id?: string;
  content_mode: 'compact' | 'full';
};

export type ConversationMessagesPage = {
  items: TMessage[];
  oldest_cursor?: string;
  newest_cursor?: string;
  has_more_before?: boolean;
  has_more_after?: boolean;
  oldestCursor?: string;
  newestCursor?: string;
  hasMoreBefore?: boolean;
  hasMoreAfter?: boolean;
};

type FetchConversationMessagesPage = (request: ConversationMessagesPageRequest) => Promise<ConversationMessagesPage>;

type FetchAllConversationMessagesOptions = {
  pageSize?: number;
  maxPages?: number;
};

export const sanitizeFileName = (name: string): string => {
  const cleaned = name
    .normalize('NFC')
    .split('')
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint === undefined || (codePoint > MAX_ASCII_CONTROL_CODE_POINT && codePoint !== DELETE_CONTROL_CODE_POINT)
      );
    })
    .join('')
    .replace(INVALID_FILENAME_CHARS_RE, '_')
    .trim()
    .replace(TRAILING_WINDOWS_FILENAME_CHARS_RE, '')
    .replace(/^\.+/, (dots) => '_'.repeat(dots.length));
  const safeName = cleaned || 'conversation';
  const withoutTrailingChars = safeName.replace(TRAILING_WINDOWS_FILENAME_CHARS_RE, '') || 'conversation';
  const withReservedNameSuffix = WINDOWS_RESERVED_NAME_RE.test(withoutTrailingChars)
    ? `${withoutTrailingChars}_`
    : withoutTrailingChars;
  return withReservedNameSuffix.slice(0, 80);
};

const normalizeDefaultExportSegment = (name: string): string => {
  const normalized = sanitizeFileName(name)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'conversation';
};

export const joinFilePath = (dir: string, file_name: string): string => {
  const separator = dir.includes('\\') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${file_name}` : `${dir}${separator}${file_name}`;
};

export const formatTimestamp = (time = Date.now()): string => {
  const date = new Date(time);
  return `${date.getFullYear()}${padTimestampPart(date.getMonth() + 1)}${padTimestampPart(date.getDate())}-${padTimestampPart(date.getHours())}${padTimestampPart(date.getMinutes())}${padTimestampPart(date.getSeconds())}`;
};

const formatDefaultExportFileDate = (time = Date.now()): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${padTimestampPart(date.getMonth() + 1)}-${padTimestampPart(date.getDate())}`;
};

const getPageSignature = (items: TMessage[]): string => {
  return items.map((message) => message.id).join('\u0000');
};

const readHasMoreBefore = (page: ConversationMessagesPage): boolean | undefined => {
  if (typeof page.has_more_before === 'boolean') {
    return page.has_more_before;
  }
  if (typeof page.hasMoreBefore === 'boolean') {
    return page.hasMoreBefore;
  }
  return undefined;
};

const readOldestCursor = (page: ConversationMessagesPage): string | undefined => {
  const cursor = page.oldest_cursor ?? page.oldestCursor;
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
};

const sortMessagesByCreatedAt = (messages: TMessage[]): TMessage[] => {
  return messages
    .map((message, index) => ({ message, index }))
    .toSorted((left, right) => {
      const leftCreatedAt = Number((left.message as { created_at?: unknown }).created_at);
      const rightCreatedAt = Number((right.message as { created_at?: unknown }).created_at);
      const leftTime = Number.isFinite(leftCreatedAt) ? leftCreatedAt : Number.POSITIVE_INFINITY;
      const rightTime = Number.isFinite(rightCreatedAt) ? rightCreatedAt : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.index - right.index;
    })
    .map(({ message }) => message);
};

export const fetchAllConversationMessages = async (
  fetchPage: FetchConversationMessagesPage,
  options: FetchAllConversationMessagesOptions = {}
): Promise<TMessage[]> => {
  const pageSize = options.pageSize ?? CONVERSATION_EXPORT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_EXPORT_PAGES;
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('Conversation export page size must be a positive integer.');
  }
  if (!Number.isInteger(maxPages) || maxPages <= 0) {
    throw new Error('Conversation export maximum page count must be a positive integer.');
  }

  const messages: TMessage[] = [];
  const seenPageSignatures = new Set<string>();
  const seenMessageIds = new Set<string>();
  const seenCursors = new Set<string>();
  let before: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    // Cursor pages are sequential because each response defines the next older boundary.
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchPage({
      limit: pageSize,
      ...(before ? { before } : {}),
      content_mode: 'compact',
    });
    if (!result || !Array.isArray(result.items)) {
      throw new Error(`Conversation export received an invalid page at index ${page}.`);
    }
    if (result.items.length > pageSize) {
      throw new Error(`Conversation export page ${page} exceeded the requested page size.`);
    }
    const hasMoreBefore = readHasMoreBefore(result);
    if (hasMoreBefore === undefined) {
      throw new Error(`Conversation export received missing cursor metadata at page ${page}.`);
    }

    if (result.items.length === 0) {
      if (hasMoreBefore) {
        throw new Error(`Conversation export received an empty page with more history at index ${page}.`);
      }
      return sortMessagesByCreatedAt(messages);
    }

    const signature = getPageSignature(result.items);
    if (seenPageSignatures.has(signature)) {
      throw new Error(`Conversation export received a repeated page at index ${page}.`);
    }
    seenPageSignatures.add(signature);
    result.items.forEach((message) => {
      if (!message?.id) {
        throw new Error(`Conversation export received a message without an id at page ${page}.`);
      }
      if (seenMessageIds.has(message.id)) {
        throw new Error(`Conversation export received a duplicate message id at page ${page}.`);
      }
      seenMessageIds.add(message.id);
    });
    messages.unshift(...result.items);

    if (!hasMoreBefore) {
      return sortMessagesByCreatedAt(messages);
    }

    const oldestCursor = readOldestCursor(result);
    if (!oldestCursor) {
      throw new Error(`Conversation export received missing oldest cursor at page ${page}.`);
    }
    if (oldestCursor === before || seenCursors.has(oldestCursor)) {
      throw new Error(`Conversation export received a repeated cursor at page ${page}.`);
    }
    seenCursors.add(oldestCursor);
    before = oldestCursor;
  }

  throw new Error(`Conversation export exceeded the maximum of ${maxPages} pages.`);
};

export const readMessageContent = (message: TMessage): string => {
  const content = message.content as Record<string, unknown> | string | undefined;
  if (typeof content === 'string') {
    return content;
  }
  if (content && typeof content === 'object' && typeof content.content === 'string') {
    return content.content;
  }

  try {
    return JSON.stringify(content ?? {}, null, 2);
  } catch {
    return String(content ?? '');
  }
};

export const getMessageRoleKey = (message: TMessage): MessageRole => {
  if (message.position === 'right') return 'user';
  if (message.position === 'left') return 'assistant';
  return 'system';
};

const getShareableMessageRole = (message: TMessage): ShareableMessageRole | null => {
  const role = getMessageRoleKey(message);
  return role === 'system' ? null : role;
};

const readShareableMessageContent = (message: TMessage): string => {
  if (message.type !== 'text') {
    return '';
  }
  const content = message.content as Record<string, unknown> | string | undefined;
  if (typeof content === 'string') {
    return content;
  }
  return content && typeof content.content === 'string' ? content.content : '';
};

const isShareableMessage = (message: TMessage): boolean => {
  return message.type === 'text' && !message.hidden && getShareableMessageRole(message) !== null;
};

const isUserTextMessage = (message: TMessage): boolean => {
  return isShareableMessage(message) && message.position === 'right';
};

export const redactSensitiveText = (input: string): { text: string; redacted: boolean } => {
  let text = input.replace(TOKEN_ASSIGNMENT_RE, (_match, prefix: string, quote: string) => {
    return `${prefix}${quote}${REDACTED_VALUE}${quote}`;
  });
  text = text.replace(AUTHORIZATION_TOKEN_RE, `$1${REDACTED_VALUE}`);
  text = text.replace(JWT_RE, REDACTED_VALUE);
  text = text.replace(OBVIOUS_SECRET_RE, REDACTED_VALUE);
  return { text, redacted: text !== input };
};

const redactSensitiveValue = (value: unknown): { value: unknown; redacted: boolean } => {
  if (typeof value === 'string') {
    const redactedText = redactSensitiveText(value);
    return { value: redactedText.text, redacted: redactedText.redacted };
  }
  if (Array.isArray(value)) {
    let redacted = false;
    const items = value.map((item) => {
      const result = redactSensitiveValue(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: items, redacted };
  }
  if (value && typeof value === 'object') {
    let redacted = false;
    const object = Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (SENSITIVE_KEY_RE.test(key)) {
          redacted = true;
          return [key, REDACTED_VALUE];
        }
        const result = redactSensitiveValue(nestedValue);
        redacted ||= result.redacted;
        return [key, result.value];
      })
    );
    return { value: object, redacted };
  }
  return { value, redacted: false };
};

const redactExportContent = (content: string): { text: string; redacted: boolean } => {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return redactSensitiveText(content);
    }
    const result = redactSensitiveValue(parsed);
    return { text: JSON.stringify(result.value, null, 2), redacted: result.redacted };
  } catch {
    return redactSensitiveText(content);
  }
};

const buildConversationExportDocument = (
  conversation: TChatConversation,
  messages: TMessage[],
  labels: ExportTranscriptLabels,
  exportedAt: string
): ConversationExportDocument => {
  const rawTitle = (conversation.name || labels.conversation).trim().replace(/\s+/g, ' ') || labels.conversation;
  const redactedTitle = redactSensitiveText(rawTitle);
  let redacted = redactedTitle.redacted;
  const exportMessages: ConversationExportMessage[] = [];

  messages.forEach((message) => {
    if (!isShareableMessage(message)) {
      return;
    }
    const role = getShareableMessageRole(message);
    const content = readShareableMessageContent(message).trim();
    if (!role || !content) {
      return;
    }
    const redactedContent = redactExportContent(content);
    redacted ||= redactedContent.redacted;
    exportMessages.push({ role, content: redactedContent.text });
  });

  return {
    title: redactedTitle.text,
    exported_at: exportedAt,
    messages: exportMessages,
    redacted,
  };
};

const buildMarkdownTranscript = (document: ConversationExportDocument, labels: ExportTranscriptLabels): string => {
  const lines = [`# ${document.title}`, '', `${labels.exportedAt}: ${document.exported_at}`];
  if (document.redacted) {
    lines.push('', `> ${labels.redactionNotice}`);
  }

  document.messages.forEach((message) => {
    lines.push('', `## ${labels[message.role]}`, '', message.content);
  });

  if (document.messages.length === 0) {
    lines.push('', labels.noMessages);
  }

  return lines.join('\n').trimEnd();
};

export const buildConversationExportContent = (
  conversation: TChatConversation,
  messages: TMessage[],
  format: ConversationExportFormat,
  labels: ExportTranscriptLabels,
  exportedAt = new Date().toISOString()
): string => {
  const document = buildConversationExportDocument(conversation, messages, labels, exportedAt);
  return format === 'json' ? JSON.stringify(document, null, 2) : buildMarkdownTranscript(document, labels);
};

export const buildConversationExportText = (
  conversation: TChatConversation,
  messages: TMessage[],
  labels: ExportTranscriptLabels
): string => {
  return buildConversationExportContent(conversation, messages, 'markdown', labels);
};

const getExportExtension = (format: ConversationExportFormat): string => {
  return format === 'json' ? 'json' : 'md';
};

export const buildDefaultExportFileName = (
  conversationName: string,
  format: ConversationExportFormat = 'markdown',
  time = Date.now()
): string => {
  const safeName = normalizeDefaultExportSegment(conversationName).slice(0, 48).replace(/-+$/g, '') || 'conversation';
  return `${formatDefaultExportFileDate(time)}-${safeName}.${getExportExtension(format)}`;
};

export const getDefaultExportFileNameSource = (conversation: TChatConversation, messages: TMessage[]): string => {
  const firstUserMessage = messages.find(isUserTextMessage);
  const firstUserMessageContent = firstUserMessage ? readShareableMessageContent(firstUserMessage).trim() : '';
  const rawSource = firstUserMessageContent || conversation.name || 'conversation';
  return redactSensitiveText(rawSource).text;
};

export const normalizeExportFileName = (input: string, format: ConversationExportFormat = 'markdown'): string => {
  const trimmed = input.normalize('NFC').trim();
  const withoutExtension = trimmed.replace(/\.(?:md|markdown|json|txt)$/i, '');
  return `${sanitizeFileName(withoutExtension || 'conversation')}.${getExportExtension(format)}`;
};

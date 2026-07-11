import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';

const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
const OBVIOUS_SECRET_RE =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
const BEARER_TOKEN_RE = /(\bBearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi;
const TOKEN_ASSIGNMENT_RE =
  /(\b(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|token)\b\s*[:=]\s*)(["'`]?)([A-Za-z0-9._~+/=-]{8,})(\2)/gi;
const REDACTED_VALUE = '[REDACTED]';
const DEFAULT_MAX_EXPORT_PAGES = 10_000;
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
  page: number;
  page_size: number;
};

export type ConversationMessagesPage = {
  items: TMessage[];
  total?: number;
  has_more?: boolean;
  hasMore?: boolean;
};

type FetchConversationMessagesPage = (request: ConversationMessagesPageRequest) => Promise<ConversationMessagesPage>;

type FetchAllConversationMessagesOptions = {
  pageSize?: number;
  maxPages?: number;
};

export const sanitizeFileName = (name: string): string => {
  const cleaned = name.replace(INVALID_FILENAME_CHARS_RE, '_').trim();
  return (cleaned || 'conversation').slice(0, 80);
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

const readHasMore = (page: ConversationMessagesPage): boolean | undefined => {
  if (typeof page.has_more === 'boolean') {
    return page.has_more;
  }
  if (typeof page.hasMore === 'boolean') {
    return page.hasMore;
  }
  return undefined;
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
  let knownTotal: number | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    // Pages are intentionally sequential because each response determines whether another page is valid.
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchPage({ page, page_size: pageSize });
    if (!result || !Array.isArray(result.items)) {
      throw new Error(`Conversation export received an invalid page at index ${page}.`);
    }
    if (result.items.length > pageSize) {
      throw new Error(`Conversation export page ${page} exceeded the requested page size.`);
    }
    if (result.total !== undefined) {
      if (!Number.isInteger(result.total) || result.total < 0) {
        throw new Error(`Conversation export received an invalid total at page ${page}.`);
      }
      knownTotal = Math.max(knownTotal ?? 0, result.total);
    }

    if (result.items.length > 0) {
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
      messages.push(...result.items);
    }

    if (knownTotal !== undefined && messages.length > knownTotal) {
      throw new Error(`Conversation export loaded more messages than the reported total at page ${page}.`);
    }

    const hasMore = readHasMore(result);
    const completeByTotal = knownTotal !== undefined && messages.length === knownTotal;
    if (completeByTotal) {
      return messages;
    }

    const shortPage = result.items.length < pageSize;
    if (shortPage) {
      if (hasMore === true || (knownTotal !== undefined && messages.length < knownTotal)) {
        throw new Error(`Conversation export received an incomplete page at index ${page}.`);
      }
      return messages;
    }

    if (hasMore === false) {
      if (knownTotal !== undefined && messages.length < knownTotal) {
        throw new Error(`Conversation export stopped before the reported total at page ${page}.`);
      }
      return messages;
    }
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
  text = text.replace(BEARER_TOKEN_RE, `$1${REDACTED_VALUE}`);
  text = text.replace(OBVIOUS_SECRET_RE, REDACTED_VALUE);
  return { text, redacted: text !== input };
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
    const redactedContent = redactSensitiveText(content);
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
  const trimmed = input.trim();
  const withoutExtension = trimmed.replace(/\.(?:md|markdown|json|txt)$/i, '');
  return `${sanitizeFileName(withoutExtension || 'conversation')}.${getExportExtension(format)}`;
};

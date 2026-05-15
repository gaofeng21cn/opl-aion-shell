import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

const AT_FILE_BOUNDARY_RE = /[\s,;!?()[\]{}]/;

export type AssistantMentionItem = FileOrFolderItem & {
  mentionKind: 'assistant';
  aliases: string[];
  insertText: string;
};

export type MentionMenuItem = FileOrFolderItem | AssistantMentionItem;

const ASSISTANT_MENTION_ITEMS: AssistantMentionItem[] = [
  {
    path: '@opl',
    name: 'One Person Lab',
    isFile: false,
    relativePath: '@opl',
    mentionKind: 'assistant',
    aliases: ['opl', 'one person lab', 'one-person-lab', 'lab'],
    insertText: '@opl',
  },
  {
    path: '@mas',
    name: 'Med Auto Science',
    isFile: false,
    relativePath: '@mas',
    mentionKind: 'assistant',
    aliases: ['mas', 'med auto science', 'med-autoscience', 'medautosci', 'science'],
    insertText: '@mas',
  },
  {
    path: '@mag',
    name: 'Med Auto Grant',
    isFile: false,
    relativePath: '@mag',
    mentionKind: 'assistant',
    aliases: ['mag', 'med auto grant', 'med-autogrant', 'grant'],
    insertText: '@mag',
  },
  {
    path: '@rca',
    name: 'RedCube AI',
    isFile: false,
    relativePath: '@rca',
    mentionKind: 'assistant',
    aliases: ['rca', 'redcube', 'redcube ai', 'redcube-ai', 'deck', 'slides'],
    insertText: '@rca',
  },
];

export type ActiveAtFileQuery = {
  start: number;
  end: number;
  query: string;
  rawQuery: string;
  token: string;
};

function isBoundaryChar(char: string): boolean {
  return AT_FILE_BOUNDARY_RE.test(char);
}

function isEscaped(value: string, index: number): boolean {
  let backslashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && value[cursor] === '\\') {
    backslashCount += 1;
    cursor -= 1;
  }
  return backslashCount % 2 === 1;
}

function unescapeAtFileQuery(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

export function escapeAtFilePath(path: string): string {
  return path.replace(/([\\\s,;!?()[\]{}])/g, '\\$1');
}

export function getActiveAtFileQuery(value: string, caretPosition: number): ActiveAtFileQuery | null {
  if (!value) {
    return null;
  }

  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  let atIndex = -1;

  for (let index = safeCaret - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === '@' && !isEscaped(value, index)) {
      const previousChar = index > 0 ? value[index - 1] : '';
      if (!previousChar || isBoundaryChar(previousChar)) {
        atIndex = index;
        break;
      }
    }

    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      return null;
    }
  }

  if (atIndex === -1) {
    return null;
  }

  let tokenEnd = value.length;
  for (let index = atIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      tokenEnd = index;
      break;
    }
  }

  if (safeCaret < atIndex || safeCaret > tokenEnd) {
    return null;
  }

  const rawQuery = value.slice(atIndex + 1, tokenEnd);
  return {
    start: atIndex,
    end: tokenEnd,
    query: unescapeAtFileQuery(rawQuery),
    rawQuery,
    token: value.slice(atIndex, tokenEnd),
  };
}

export function getAllAtFileQueries(value: string): ActiveAtFileQuery[] {
  if (!value) {
    return [];
  }

  const queries: ActiveAtFileQuery[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '@' || isEscaped(value, index)) {
      continue;
    }

    const previousChar = index > 0 ? value[index - 1] : '';
    if (previousChar && !isBoundaryChar(previousChar)) {
      continue;
    }

    let tokenEnd = value.length;
    for (let cursor = index + 1; cursor < value.length; cursor += 1) {
      const nextChar = value[cursor];
      if (isBoundaryChar(nextChar) && !isEscaped(value, cursor)) {
        tokenEnd = cursor;
        break;
      }
    }

    const rawQuery = value.slice(index + 1, tokenEnd);
    queries.push({
      start: index,
      end: tokenEnd,
      query: unescapeAtFileQuery(rawQuery),
      rawQuery,
      token: value.slice(index, tokenEnd),
    });

    index = tokenEnd - 1;
  }

  return queries;
}

export function buildAtFileInsertion(item: FileOrFolderItem): string {
  const path = item.relativePath || item.path;
  return `@${escapeAtFilePath(path)}`;
}

function normalizeMentionQuery(value: string): string {
  return value.trim().toLowerCase();
}

function scoreAssistantMention(item: AssistantMentionItem, query: string): number {
  if (!query) {
    return 1;
  }

  const candidates = [item.name, item.relativePath, ...item.aliases].map((value) => value?.toLowerCase() ?? '');
  if (candidates.some((value) => value === query || value === `@${query}`)) {
    return 400;
  }
  if (candidates.some((value) => value.startsWith(query) || value.startsWith(`@${query}`))) {
    return 300;
  }
  if (candidates.some((value) => value.includes(query))) {
    return 200;
  }
  return -1;
}

export function isAssistantMentionItem(item: MentionMenuItem): item is AssistantMentionItem {
  return (item as Partial<AssistantMentionItem>).mentionKind === 'assistant';
}

export function filterAssistantMentionItems(query: string): AssistantMentionItem[] {
  const normalizedQuery = normalizeMentionQuery(query);
  return ASSISTANT_MENTION_ITEMS.map((item) => ({
    item,
    score: scoreAssistantMention(item, normalizedQuery),
  }))
    .filter((entry) => entry.score >= 0)
    .toSorted((left, right) => right.score - left.score)
    .map((entry) => entry.item);
}

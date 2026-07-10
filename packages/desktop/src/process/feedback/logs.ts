/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const LOG_SUFFIXES = ['.log', '.aioncore.log', '.aionrs.log'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const YEAR_DIR_PATTERN = /^\d{4}$/;
const MONTH_OR_DAY_DIR_PATTERN = /^\d{2}$/;
const DEFAULT_LOG_DAYS = 3;
const REDACTED = '[REDACTED]';
const REDACTED_HOME = '[REDACTED_HOME]';
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const OPENAI_KEY_PATTERN = /\bsk-[a-z0-9_-]{4,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[a-z0-9._~+/=-]+/gi;
const AUTHORIZATION_HEADER_PATTERN = /\bAuthorization\s*:\s*[^\r\n]+/gi;
const SENSITIVE_KEY_NAME =
  '(?:[a-z0-9]+[_-])*(?:api[ _-]?key|auth[_-]?token|access[_-]?token|refresh[_-]?token|token|client[_-]?secret|secret|password|passwd)';
const SENSITIVE_ASSIGNMENT_PATTERN = new RegExp(
  `((?:["']?\\b${SENSITIVE_KEY_NAME}\\b["']?)\\s*(?:=|:)\\s*)(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\s,;&}\\]]+)`,
  'gi'
);
const SENSITIVE_FLAG_PATTERN = new RegExp(
  `((?:--?)${SENSITIVE_KEY_NAME}\\s+)(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|\\S+)`,
  'gi'
);
const SENSITIVE_QUERY_KEYS = new Set([
  'apikey',
  'auth',
  'authorization',
  'authtoken',
  'accesstoken',
  'refreshtoken',
  'token',
  'key',
  'secret',
  'clientsecret',
  'password',
  'passwd',
  'credential',
  'signature',
  'sig',
  'session',
  'sessionid',
  'code',
]);
const GENERIC_HOME_PATTERNS = [/\/Users\/[^/\s"'<>]+/g, /\/home\/[^/\s"'<>]+/g, /[a-z]:\\Users\\[^\\\s"'<>]+/gi];

export type FeedbackLogAttachment = {
  filename: string;
  data: Buffer;
  contentType: 'application/gzip';
};

type FeedbackLogCandidate = {
  date: string;
  path: string;
};

function normalizeSensitiveQueryKey(key: string): string {
  return key.toLowerCase().replaceAll('-', '').replaceAll('_', '');
}

function redactUrl(rawUrl: string): string {
  const trailingMatch = rawUrl.match(/[),.;!?]+$/);
  const trailing = trailingMatch?.[0] ?? '';
  const candidate = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;

  try {
    const url = new URL(candidate);
    let changed = false;
    if (url.username) {
      url.username = REDACTED;
      changed = true;
    }
    if (url.password) {
      url.password = REDACTED;
      changed = true;
    }
    for (const key of url.searchParams.keys()) {
      if (SENSITIVE_QUERY_KEYS.has(normalizeSensitiveQueryKey(key))) {
        url.searchParams.set(key, REDACTED);
        changed = true;
      }
    }
    return changed ? `${url.toString()}${trailing}` : rawUrl;
  } catch {
    return rawUrl;
  }
}

function replaceHomePath(content: string, homePath: string): string {
  if (!homePath) {
    return content;
  }

  let redacted = content.split(homePath).join(REDACTED_HOME);
  const alternateHomePath = path.sep === '/' ? homePath.replaceAll('/', '\\') : homePath.replaceAll('\\', '/');
  if (alternateHomePath !== homePath) {
    redacted = redacted.split(alternateHomePath).join(REDACTED_HOME);
  }
  return redacted;
}

export function redactFeedbackLogContent(content: string, homePath = homedir()): string {
  let redacted = content.replace(URL_PATTERN, redactUrl);
  redacted = replaceHomePath(redacted, homePath);
  for (const pattern of GENERIC_HOME_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED_HOME);
  }
  return redacted
    .replace(AUTHORIZATION_HEADER_PATTERN, `Authorization: ${REDACTED}`)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(OPENAI_KEY_PATTERN, REDACTED)
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1${REDACTED}`)
    .replace(SENSITIVE_FLAG_PATTERN, `$1${REDACTED}`);
}

function isFeedbackLogFileForDate(file: string, date: string): boolean {
  return LOG_SUFFIXES.some((suffix) => file === `${date}${suffix}`);
}

function normalizeLogDirs(logsDirs: string | string[]): string[] {
  const dirs = Array.isArray(logsDirs) ? logsDirs : [logsDirs];
  const seen = new Set<string>();
  const normalizedDirs: string[] = [];
  for (const dir of dirs) {
    const normalizedDir = path.resolve(dir);
    if (!seen.has(normalizedDir)) {
      seen.add(normalizedDir);
      normalizedDirs.push(normalizedDir);
    }
  }

  return normalizedDirs;
}

export function getRecentFeedbackLogPathsFromDirs(logsDirs: string[], days = DEFAULT_LOG_DAYS): string[] {
  const pathsByDate = new Map<string, Set<string>>();

  for (const logsDir of normalizeLogDirs(logsDirs)) {
    for (const candidate of collectFeedbackLogCandidates(logsDir)) {
      let paths = pathsByDate.get(candidate.date);
      if (!paths) {
        paths = new Set<string>();
        pathsByDate.set(candidate.date, paths);
      }
      paths.add(candidate.path);
    }
  }

  const recentDates = [...pathsByDate.keys()].toSorted().toReversed().slice(0, days);
  return recentDates.flatMap((dateStr) => [...(pathsByDate.get(dateStr) ?? [])].toSorted());
}

function collectFeedbackLogCandidates(logsDir: string): FeedbackLogCandidate[] {
  const candidates: FeedbackLogCandidate[] = [];
  let yearsOrFiles: string[];
  try {
    yearsOrFiles = fs.readdirSync(logsDir);
  } catch {
    return candidates;
  }

  for (const name of yearsOrFiles) {
    const fullPath = path.join(logsDir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const match = DATE_PATTERN.exec(name);
        if (match && isFeedbackLogFileForDate(name, match[0])) {
          candidates.push({ date: match[0], path: fullPath });
        }
        continue;
      }

      if (stat.isDirectory() && YEAR_DIR_PATTERN.test(name)) {
        collectDatedLogCandidates(candidates, fullPath, name);
      }
    } catch {
      // skip unreadable entries
    }
  }

  return candidates;
}

function collectDatedLogCandidates(candidates: FeedbackLogCandidate[], yearDir: string, year: string): void {
  for (const month of readDirNames(yearDir)) {
    if (!MONTH_OR_DAY_DIR_PATTERN.test(month)) {
      continue;
    }

    const monthDir = path.join(yearDir, month);
    if (!isDirectory(monthDir)) {
      continue;
    }

    for (const day of readDirNames(monthDir)) {
      if (!MONTH_OR_DAY_DIR_PATTERN.test(day)) {
        continue;
      }

      const dayDir = path.join(monthDir, day);
      if (!isDirectory(dayDir)) {
        continue;
      }

      const date = `${year}-${month}-${day}`;
      for (const file of readDirNames(dayDir)) {
        const filePath = path.join(dayDir, file);
        if (isFile(filePath) && isFeedbackLogFileForDate(file, date)) {
          candidates.push({ date, path: filePath });
        }
      }
    }
  }
}

function readDirNames(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function getLogHeaderName(logPath: string, rootDir: string, showRelativePath: boolean): string {
  if (!showRelativePath) {
    return path.basename(logPath);
  }

  const relativePath = path.relative(rootDir, logPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return path.basename(logPath);
  }

  return relativePath.split(path.sep).join('/');
}

export function getRecentFeedbackLogPaths(logsDir: string, days = DEFAULT_LOG_DAYS): string[] {
  const normalizedDir = normalizeLogDirs(logsDir)[0];
  return getRecentFeedbackLogPathsFromDirs([normalizedDir], days);
}

export function collectFeedbackLogAttachment(logsDirs: string | string[]): FeedbackLogAttachment | null {
  const normalizedDirs = normalizeLogDirs(logsDirs);
  const logPaths = getRecentFeedbackLogPathsFromDirs(normalizedDirs);
  if (logPaths.length === 0) {
    return null;
  }

  const parts: string[] = [];
  for (const logPath of logPaths) {
    const basename = getLogHeaderName(logPath, normalizedDirs[0], true);
    const content = redactFeedbackLogContent(fs.readFileSync(logPath, 'utf8'));
    parts.push(`=== ${basename} ===\n${content}\n`);
  }

  return {
    filename: 'logs.gz',
    data: zlib.gzipSync(Buffer.from(parts.join('\n'), 'utf8')),
    contentType: 'application/gzip',
  };
}

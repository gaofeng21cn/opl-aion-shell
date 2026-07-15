import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';

const normalizeAbsolutePath = (value: string): string => {
  const path = stripWindowsVerbatimPrefix(value.trim()).replace(/\\/g, '/');
  const drive = path.match(/^([A-Za-z]:)(?:\/|$)/)?.[1];
  const rooted = path.startsWith('/');
  const unc = path.startsWith('//');
  const prefix = drive ? `${drive}/` : unc ? '//' : rooted ? '/' : '';
  const remainder = drive ? path.slice(drive.length) : path;
  const parts: string[] = [];

  for (const part of remainder.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const normalized = `${prefix}${parts.join('/')}`;
  if (normalized === '/' || /^[A-Za-z]:\/$/.test(normalized)) return normalized;
  return normalized.replace(/\/$/, '');
};

const comparablePath = (value: string): string => {
  const normalized = normalizeAbsolutePath(value);
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized;
};

export const canonicalWorkspacePath = (workspace: string): string => normalizeAbsolutePath(workspace);

export const workspaceRelativePath = (workspace: string, candidate: string): string | null => {
  const root = canonicalWorkspacePath(workspace);
  const trimmedCandidate = candidate.trim();
  if (!root || !trimmedCandidate) return null;

  const normalizedCandidate = trimmedCandidate.replace(/\\/g, '/');
  const isAbsolute =
    normalizedCandidate.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedCandidate) ||
    normalizedCandidate.startsWith('//');
  const absoluteCandidate = isAbsolute ? normalizedCandidate : `${root.replace(/\/$/, '')}/${normalizedCandidate}`;
  const path = normalizeAbsolutePath(absoluteCandidate);
  const comparableRoot = comparablePath(root);
  const comparableCandidate = comparablePath(path);
  const childPrefix = comparableRoot.endsWith('/') ? comparableRoot : `${comparableRoot}/`;
  if (comparableCandidate === comparableRoot || !comparableCandidate.startsWith(childPrefix)) return null;

  return path.slice(root.length).replace(/^\/+/, '') || null;
};

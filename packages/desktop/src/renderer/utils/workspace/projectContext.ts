import type { ProjectContextRef } from '@/common/config/configKeys';
import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';

export type ProjectContextInputMap = Record<string, ProjectContextRef[]>;

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

export const isWorkspaceContextPath = (workspace: string, candidate: string): boolean => {
  const root = comparablePath(workspace);
  const path = comparablePath(candidate);
  const childPrefix = root.endsWith('/') ? root : `${root}/`;
  return Boolean(root && path && (path === root || path.startsWith(childPrefix)));
};

export const createProjectContextRef = (
  workspace: string,
  candidate: string,
  isFile: boolean
): ProjectContextRef | null => {
  const root = canonicalWorkspacePath(workspace);
  const path = normalizeAbsolutePath(candidate);
  if (!isWorkspaceContextPath(root, path)) return null;

  const relativePath = path === root ? undefined : path.slice(root.length).replace(/^\/+/, '');
  return {
    path,
    name: path.split('/').pop() || path,
    isFile,
    ...(relativePath ? { relativePath } : {}),
  };
};

export const sanitizeProjectContextRefs = (
  workspace: string,
  refs: readonly ProjectContextRef[] | undefined
): ProjectContextRef[] => {
  const result: ProjectContextRef[] = [];
  const seen = new Set<string>();

  for (const ref of refs ?? []) {
    if (!ref || typeof ref.path !== 'string' || typeof ref.isFile !== 'boolean') continue;
    const normalized = createProjectContextRef(workspace, ref.path, ref.isFile);
    if (!normalized) continue;
    const key = comparablePath(normalized.path);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
};

export const getProjectContextRefs = (
  inputs: ProjectContextInputMap | undefined,
  workspace: string
): ProjectContextRef[] => sanitizeProjectContextRefs(workspace, inputs?.[canonicalWorkspacePath(workspace)]);

export const appendProjectContextRefs = (
  workspace: string,
  current: readonly ProjectContextRef[],
  additions: readonly ProjectContextRef[]
): ProjectContextRef[] => sanitizeProjectContextRefs(workspace, [...current, ...additions]);

export const updateProjectContextInputs = (
  inputs: ProjectContextInputMap | undefined,
  workspace: string,
  refs: readonly ProjectContextRef[]
): ProjectContextInputMap => {
  const next = { ...inputs };
  const key = canonicalWorkspacePath(workspace);
  const sanitized = sanitizeProjectContextRefs(workspace, refs);
  if (sanitized.length) next[key] = sanitized;
  else delete next[key];
  return next;
};

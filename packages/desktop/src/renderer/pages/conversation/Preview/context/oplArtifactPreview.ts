/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import { LARGE_TEXT_PREVIEW_MAX_LENGTH, LARGE_TEXT_PREVIEW_THRESHOLD } from '../constants';
import { FILE_EXTENSION_MAP, getContentTypeByExtension, getFileExtension } from '../fileUtils';
import type { PreviewContextValue } from './PreviewContext';

const OPL_REF_SCHEMES = new Set(['artifact', 'evidence']);
const CODE_EXTENSIONS = new Set([
  'bash',
  'bib',
  'c',
  'cc',
  'cfg',
  'cjs',
  'conf',
  'cpp',
  'cs',
  'css',
  'env',
  'fish',
  'go',
  'graphql',
  'gql',
  'h',
  'hpp',
  'ini',
  'java',
  'js',
  'json',
  'jsonl',
  'jsx',
  'kt',
  'kts',
  'less',
  'log',
  'lua',
  'mjs',
  'php',
  'proto',
  'ps1',
  'py',
  'r',
  'rb',
  'rs',
  'sass',
  'scss',
  'sh',
  'sql',
  'swift',
  'tex',
  'toml',
  'ts',
  'tsx',
  'txt',
  'xml',
  'yaml',
  'yml',
  'zsh',
]);
const PATH_MAX_LENGTH = 4096;

export type OplArtifactPreviewFailureReason = 'path_missing' | 'unsafe_ref' | 'unsupported_ref' | 'unavailable';

export type OplArtifactPreviewTarget = {
  ref: string;
  relativePath?: string;
  filePath: string;
  fileName: string;
  contentType: PreviewContentType;
  workspace?: string;
};

export type OplArtifactPreviewResolution =
  | { ok: true; target: OplArtifactPreviewTarget }
  | { ok: false; reason: OplArtifactPreviewFailureReason };

type OplArtifactPreviewIo = {
  getFileMetadata: (request: { path: string; workspace?: string }) => Promise<{ isDirectory?: boolean } | null>;
  readFile: (request: { path: string; workspace?: string }) => Promise<string | null>;
  getImageBase64: (request: { path: string; workspace?: string }) => Promise<string | null>;
};

type OpenOplArtifactPreviewOptions = {
  ref: string;
  workspace?: string;
  openPreview: PreviewContextValue['openPreview'];
  io?: OplArtifactPreviewIo;
};

const DEFAULT_IO: OplArtifactPreviewIo = {
  getFileMetadata: (request) => ipcBridge.fs.getFileMetadata.invoke(request),
  readFile: (request) => ipcBridge.fs.readFile.invoke(request),
  getImageBase64: (request) => ipcBridge.fs.getImageBase64.invoke(request),
};

const normalizeSeparators = (value: string): string => value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');

const hasUnsafePathCharacters = (value: string): boolean =>
  value.includes('\0') || value.includes('\r') || value.includes('\n') || value.includes('?') || value.includes('#');

const normalizeWorkspace = (workspace?: string): string | undefined => {
  const value = workspace?.trim();
  if (!value || value.length > PATH_MAX_LENGTH || hasUnsafePathCharacters(value)) return undefined;
  const normalized = normalizeSeparators(value).replace(/\/$/, '');
  const isAbsolute = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized);
  if (!isAbsolute || normalized === '/' || normalized.split('/').some((part) => part === '..' || part === '.')) {
    return undefined;
  }
  return normalized;
};

const pathTypeForRef = (relativePath: string): PreviewContentType | undefined => {
  const extension = getFileExtension(relativePath);
  if (!extension) return undefined;
  if (CODE_EXTENSIONS.has(extension)) return 'code';

  const contentType = getContentTypeByExtension(relativePath);
  if (contentType === 'code' || contentType === 'url') return undefined;
  return FILE_EXTENSION_MAP[contentType].includes(extension) ? contentType : undefined;
};

const decodeRefPath = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const extractRefPath = (ref: string): { path?: string; schemeRef: boolean } | undefined => {
  const schemeMatch = ref.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i);
  if (!schemeMatch) {
    const isWindowsAbsolute = /^[a-z]:[\\/]/i.test(ref);
    if (!isWindowsAbsolute && /^[a-z][a-z0-9+.-]*:/i.test(ref)) return undefined;
    return { path: ref, schemeRef: false };
  }
  if (!OPL_REF_SCHEMES.has(schemeMatch[1].toLowerCase())) return undefined;
  return { path: schemeMatch[2].replace(/^\/+/, ''), schemeRef: true };
};

const workspaceContainsPath = (workspace: string, filePath: string): boolean => {
  const caseInsensitive = /^[a-z]:\//i.test(workspace);
  const base = caseInsensitive ? workspace.toLowerCase() : workspace;
  const candidate = caseInsensitive ? filePath.toLowerCase() : filePath;
  return candidate === base || candidate.startsWith(`${base}/`);
};

export const resolveOplArtifactPreviewTarget = (ref: string, workspace?: string): OplArtifactPreviewResolution => {
  const normalizedWorkspace = normalizeWorkspace(workspace);
  const sourceRef = typeof ref === 'string' ? ref.trim() : '';
  if (!sourceRef) return { ok: false, reason: 'path_missing' };
  if (sourceRef.length > PATH_MAX_LENGTH || hasUnsafePathCharacters(sourceRef)) {
    return { ok: false, reason: 'unsafe_ref' };
  }
  if (sourceRef.startsWith('//') || sourceRef.startsWith('\\')) {
    return { ok: false, reason: 'unsafe_ref' };
  }

  const extracted = extractRefPath(sourceRef);
  if (!extracted) return { ok: false, reason: 'unsupported_ref' };
  const rawPath = extracted.path ?? '';
  if (!extracted.schemeRef && /%(?:2f|5c)/i.test(rawPath)) {
    return { ok: false, reason: 'unsafe_ref' };
  }
  const decodedPath = extracted.path ? decodeRefPath(extracted.path) : undefined;
  if (!decodedPath) return { ok: false, reason: 'path_missing' };

  const rawNormalizedPath = normalizeSeparators(rawPath).replace(/^\.\//, '');
  const normalizedPath = normalizeSeparators(decodedPath).replace(/^\.\//, '');
  if (
    !normalizedPath ||
    normalizedPath.length > PATH_MAX_LENGTH ||
    hasUnsafePathCharacters(normalizedPath) ||
    normalizedPath.split('/').some((part) => part === '..' || part === '.') ||
    normalizedPath.startsWith('~/')
  ) {
    return { ok: false, reason: 'unsafe_ref' };
  }

  const isAbsolute = normalizedPath.startsWith('/') || /^[a-z]:\//i.test(normalizedPath);
  const rawIsAbsolute = rawNormalizedPath.startsWith('/') || /^[a-z]:\//i.test(rawNormalizedPath);
  if (extracted.schemeRef && isAbsolute) return { ok: false, reason: 'unsafe_ref' };
  if (!extracted.schemeRef && isAbsolute && !rawIsAbsolute) return { ok: false, reason: 'unsafe_ref' };
  if (!isAbsolute && !normalizedWorkspace) return { ok: false, reason: 'path_missing' };

  const filePath = isAbsolute ? normalizedPath : `${normalizedWorkspace}/${normalizedPath}`;
  const scopedWorkspace =
    normalizedWorkspace && workspaceContainsPath(normalizedWorkspace, filePath) ? normalizedWorkspace : undefined;
  const relativePath = scopedWorkspace ? filePath.slice(scopedWorkspace.length).replace(/^\/+/, '') : undefined;
  const contentType = pathTypeForRef(relativePath ?? filePath);
  if ((scopedWorkspace && !relativePath) || !contentType) return { ok: false, reason: 'unsupported_ref' };
  const fileName = filePath.split('/').pop();
  if (!fileName) return { ok: false, reason: 'unsupported_ref' };

  return {
    ok: true,
    target: {
      ref: sourceRef,
      filePath,
      fileName,
      contentType,
      ...(relativePath ? { relativePath } : {}),
      ...(scopedWorkspace ? { workspace: scopedWorkspace } : {}),
    },
  };
};

export const openOplArtifactPreview = async ({
  ref,
  workspace,
  openPreview,
  io = DEFAULT_IO,
}: OpenOplArtifactPreviewOptions): Promise<OplArtifactPreviewResolution> => {
  const resolution = resolveOplArtifactPreviewTarget(ref, workspace);
  if (!resolution.ok) return resolution;

  const { target } = resolution;
  const request: { path: string; workspace?: string } = { path: target.filePath };
  if (target.workspace) request.workspace = target.workspace;
  try {
    const metadata = await io.getFileMetadata(request);
    if (!metadata || metadata.isDirectory) return { ok: false, reason: 'unavailable' };

    let content = '';
    let truncated = false;
    if (target.contentType === 'image') {
      const image = await io.getImageBase64(request);
      if (!image) return { ok: false, reason: 'unavailable' };
      content = image;
    } else if (!['pdf', 'ppt', 'word', 'excel'].includes(target.contentType)) {
      const body = await io.readFile(request);
      if (body == null) return { ok: false, reason: 'unavailable' };
      truncated = body.length > LARGE_TEXT_PREVIEW_THRESHOLD;
      content = truncated ? body.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH) : body;
    }

    openPreview(content, target.contentType, {
      title: target.fileName,
      file_name: target.fileName,
      file_path: target.filePath,
      editable: false,
      truncated,
      ...(target.workspace ? { workspace: target.workspace } : {}),
    });
    return resolution;
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
};

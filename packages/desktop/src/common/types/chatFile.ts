/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/** Source-tagged file reference accepted by AionCore's chat message API. */
export type ChatFileRef =
  | { kind: 'project'; pe_id: string; relative_path: string }
  | { kind: 'upload'; path: string }
  | { kind: 'local'; path: string };

export const projectFileRef = (pe_id: string, relative_path: string): ChatFileRef => ({
  kind: 'project',
  pe_id,
  relative_path,
});

export const uploadFileRef = (path: string): ChatFileRef => ({ kind: 'upload', path });

export const localFileRef = (path: string): ChatFileRef => ({ kind: 'local', path });

export const chatFileRefPath = (ref: ChatFileRef | string): string => {
  if (typeof ref === 'string') return ref;
  return ref.kind === 'project' ? ref.relative_path : ref.path;
};

export const chatFileRefKey = (ref: ChatFileRef | string): string => {
  if (typeof ref === 'string') return `legacy-upload\0${ref}`;
  return ref.kind === 'project' ? `project\0${ref.pe_id}\0${ref.relative_path}` : `${ref.kind}\0${ref.path}`;
};

export const isChatFileRef = (value: unknown): value is ChatFileRef => {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Record<string, unknown>;
  if (ref.kind === 'project') return typeof ref.pe_id === 'string' && typeof ref.relative_path === 'string';
  if (ref.kind === 'upload' || ref.kind === 'local') return typeof ref.path === 'string';
  return false;
};

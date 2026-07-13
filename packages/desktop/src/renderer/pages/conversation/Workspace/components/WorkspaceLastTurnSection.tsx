/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { useMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { canonicalWorkspacePath, createProjectContextRef } from '@/renderer/utils/workspace/projectContext';
import { History } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useMemo } from 'react';

type WorkspaceLastTurnSectionProps = {
  t: TFunction;
  workspace: string;
};

const FILE_INPUT_KEYS = ['file_path', 'filePath', 'path', 'file_name'] as const;

function workspaceRelativePath(workspace: string, candidate: string): string | null {
  const trimmedCandidate = candidate.trim();
  if (!trimmedCandidate) return null;

  const normalizedCandidate = trimmedCandidate.replace(/\\/g, '/');
  const isAbsolute = normalizedCandidate.startsWith('/') || /^[A-Za-z]:\//.test(normalizedCandidate);
  const absoluteCandidate = isAbsolute
    ? normalizedCandidate
    : `${canonicalWorkspacePath(workspace)}/${normalizedCandidate}`;
  return createProjectContextRef(workspace, absoluteCandidate, true)?.relativePath ?? null;
}

function editCandidates(message: Extract<TMessage, { type: 'acp_tool_call' }>): string[] {
  const update = message.content.update;
  if (update.kind !== 'edit' || update.status !== 'completed') return [];

  const candidates: string[] = [];
  for (const item of update.content ?? []) {
    if (item.type === 'diff' && item.path) candidates.push(item.path);
  }
  for (const location of update.locations ?? []) {
    if (location.path) candidates.push(location.path);
  }
  for (const key of FILE_INPUT_KEYS) {
    const value = update.rawInput?.[key];
    if (typeof value === 'string') candidates.push(value);
  }
  return candidates;
}

export function getLastTurnEditedFiles(messages: readonly TMessage[], workspace: string): string[] {
  let lastUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type === 'text' && message.position === 'right' && !message.hidden) {
      lastUserMessageIndex = index;
      break;
    }
  }
  if (lastUserMessageIndex < 0) return [];

  const files: string[] = [];
  const seen = new Set<string>();
  for (const message of messages.slice(lastUserMessageIndex + 1)) {
    if (message.type !== 'acp_tool_call') continue;
    for (const candidate of editCandidates(message)) {
      const relativePath = workspaceRelativePath(workspace, candidate);
      if (!relativePath || seen.has(relativePath)) continue;
      seen.add(relativePath);
      files.push(relativePath);
    }
  }
  return files;
}

const WorkspaceLastTurnSection: React.FC<WorkspaceLastTurnSectionProps> = ({ t, workspace }) => {
  const messages = useMessageList();
  const editedFiles = useMemo(() => getLastTurnEditedFiles(messages, workspace), [messages, workspace]);

  return (
    <section className='border-t border-solid border-[var(--color-border-2)] pt-16px'>
      <div className='mb-10px flex items-center gap-6px text-13px font-semibold text-t-primary'>
        <History size={16} />
        {t('conversation.workspace.review.lastTurnTitle')}
      </div>
      {editedFiles.length ? (
        <ul className='m-0 flex list-none flex-col gap-6px p-0'>
          {editedFiles.map((file) => (
            <li key={file} className='min-w-0 font-mono text-12px leading-18px text-t-secondary' title={file}>
              <span className='block truncate'>{file}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className='text-12px leading-18px text-t-tertiary'>{t('conversation.workspace.review.lastTurnEmpty')}</div>
      )}
    </section>
  );
};

export default WorkspaceLastTurnSection;

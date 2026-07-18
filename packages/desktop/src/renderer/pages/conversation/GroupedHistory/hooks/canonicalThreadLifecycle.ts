/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDescriptor } from '@/common/types/codex/appServerThreads';

type CanonicalLifecycleAction =
  | { action: 'rename'; name: string; reason: string }
  | { action: 'archive' | 'unarchive' | 'delete'; reason: string };

export function canonicalCodexThreadId(conversation: TChatConversation | null | undefined): string | null {
  if (conversation?.type !== 'acp' || conversation.extra.backend !== 'codex') return null;
  return conversation.extra.canonical_thread_id?.trim() || conversation.extra.acp_session_id?.trim() || null;
}

export function projectCanonicalCodexThread(
  thread: CodexThreadDescriptor,
  cached?: Extract<TChatConversation, { type: 'acp' }>,
  options: { materialized?: boolean } = {}
): Extract<TChatConversation, { type: 'acp' }> {
  const parsedTimestamp = Date.parse(thread.updatedAt);
  const modifiedAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  return {
    ...(cached ?? {
      id: thread.id,
      created_at: modifiedAt,
      type: 'acp' as const,
      source: 'codex-app-server',
    }),
    id: cached?.id ?? thread.id,
    name: thread.title,
    desc: thread.summary,
    modified_at: modifiedAt,
    status: thread.status === 'running' ? 'running' : 'finished',
    extra: {
      ...cached?.extra,
      backend: 'codex',
      workspace: thread.workspace,
      custom_workspace: Boolean(thread.workspace),
      acp_session_id: thread.id,
      canonical_thread_id: thread.id,
      canonical_thread_stub: cached ? false : options.materialized !== true,
      canonical_thread_host: thread.host,
      archived: thread.archived,
      archived_at: thread.archived ? (cached?.extra.archived_at ?? modifiedAt) : undefined,
    },
  };
}

export async function executeCanonicalThreadLifecycle(
  conversation: TChatConversation | null | undefined,
  action: CanonicalLifecycleAction
): Promise<boolean | null> {
  const threadId = canonicalCodexThreadId(conversation);
  if (!threadId) return null;

  try {
    if (action.action === 'rename') {
      await ipcBridge.codexThreads.rename.invoke({ threadId, name: action.name });
    } else {
      await ipcBridge.codexThreads[action.action].invoke({ threadId });
    }
    return true;
  } catch (error) {
    console.error(`Canonical Codex thread ${action.action} failed:`, error);
    return false;
  }
}

export async function finishCanonicalLifecycleWithLocalProjection(
  canonicalResult: boolean | null,
  updateLocalProjection: () => Promise<boolean>
): Promise<boolean> {
  if (canonicalResult === false) return false;
  if (canonicalResult === null) return updateLocalProjection();

  try {
    await updateLocalProjection();
  } catch (error) {
    console.warn('Canonical task changed, but its rebuildable shell projection could not be updated:', error);
  }
  return true;
}

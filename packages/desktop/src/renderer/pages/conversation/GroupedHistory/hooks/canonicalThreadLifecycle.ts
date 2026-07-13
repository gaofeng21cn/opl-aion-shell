/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { ThreadCoordinationLifecycleRequest } from '@/common/types/codex/threadCoordination';

type CanonicalLifecycleAction =
  | { action: 'rename'; name: string; reason: string }
  | { action: 'archive' | 'unarchive' | 'delete'; reason: string };

export function canonicalCodexThreadId(conversation: TChatConversation | null | undefined): string | null {
  if (conversation?.type !== 'acp' || conversation.extra.backend !== 'codex') return null;
  return conversation.extra.canonical_thread_id?.trim() || conversation.extra.acp_session_id?.trim() || null;
}

export async function executeCanonicalThreadLifecycle(
  conversation: TChatConversation | null | undefined,
  action: CanonicalLifecycleAction
): Promise<boolean | null> {
  const threadId = canonicalCodexThreadId(conversation);
  if (!threadId) return null;

  const base = {
    targetThreadId: threadId,
    actor: { kind: 'user' as const, id: 'opl-app-user', threadId },
    reason: action.reason,
  };
  const request: ThreadCoordinationLifecycleRequest =
    action.action === 'rename' ? { ...base, action: 'rename', name: action.name } : { ...base, action: action.action };
  const result = await ipcBridge.threadCoordination.execute.invoke({ request });
  return result.ok;
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

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

type CanonicalProjectAdoptionOptions = {
  /** Allow repair of a recorded project whose filesystem path became unavailable. */
  allowExistingWorkspace?: boolean;
};

export function canonicalCodexThreadId(conversation: TChatConversation | null | undefined): string | null {
  if (conversation?.type !== 'acp' || conversation.extra.backend !== 'codex') return null;
  return conversation.extra.canonical_thread_id?.trim() || conversation.extra.acp_session_id?.trim() || null;
}

export function isProjectlessCanonicalConversation(
  conversation: TChatConversation | null | undefined
): conversation is Extract<TChatConversation, { type: 'acp' }> {
  const explicitlyProjectless = conversation?.extra.custom_workspace === false;
  const missingRecordedCwd = !conversation?.extra.workspace?.trim();
  return canonicalCodexThreadId(conversation) !== null && (explicitlyProjectless || missingRecordedCwd);
}

export function projectCanonicalCodexThread(
  thread: CodexThreadDescriptor,
  cached?: Extract<TChatConversation, { type: 'acp' }>,
  options: { materialized?: boolean } = {}
): Extract<TChatConversation, { type: 'acp' }> {
  const parsedTimestamp = Date.parse(thread.updatedAt);
  const modifiedAt = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
  const hasCanonicalProjectWorkspace = Boolean(thread.projectId.trim() && thread.workspace.trim());
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
      custom_workspace: hasCanonicalProjectWorkspace,
      acp_session_id: thread.id,
      canonical_thread_id: thread.id,
      canonical_thread_stub: cached ? false : options.materialized !== true,
      canonical_thread_host: thread.host,
      archived: thread.archived,
      archived_at: thread.archived ? (cached?.extra.archived_at ?? modifiedAt) : undefined,
    },
  };
}

export async function adoptProjectlessCanonicalConversation(
  conversation: TChatConversation | null | undefined,
  workspace: string,
  options: CanonicalProjectAdoptionOptions = {}
): Promise<boolean> {
  if (canonicalCodexThreadId(conversation) === null) return false;
  const canonicalConversation = conversation as Extract<TChatConversation, { type: 'acp' }>;
  const canAdoptProjectless = isProjectlessCanonicalConversation(conversation);
  const canRepairRecordedWorkspace = options.allowExistingWorkspace === true;
  if (!canAdoptProjectless && !canRepairRecordedWorkspace) return false;
  const threadId = canonicalCodexThreadId(canonicalConversation);
  const selectedWorkspace = workspace.trim();
  if (!threadId || !selectedWorkspace) return false;

  try {
    const canonicalBefore = await ipcBridge.codexThreads.read.invoke({ threadId });
    if (canRepairRecordedWorkspace) {
      const recordedWorkspace = canonicalConversation.extra.workspace?.trim();
      if (
        !recordedWorkspace ||
        canonicalBefore.thread.workspace !== recordedWorkspace ||
        canonicalBefore.thread.projectId !== recordedWorkspace
      ) {
        return false;
      }
    } else if (canonicalBefore.thread.projectId.trim()) {
      return false;
    }

    await ipcBridge.codexThreads.updateSettings.invoke({ threadId, cwd: selectedWorkspace });
    const canonicalReadback = await ipcBridge.codexThreads.read.invoke({ threadId });
    if (
      canonicalReadback.thread.workspace !== selectedWorkspace ||
      canonicalReadback.thread.projectId !== selectedWorkspace
    ) {
      throw new Error('Canonical thread cwd readback did not match the selected project.');
    }

    const nextConversation = {
      ...canonicalConversation,
      extra: {
        ...canonicalConversation.extra,
        workspace: selectedWorkspace,
        custom_workspace: true,
        canonical_thread_stub: false,
      },
    };
    try {
      let localConversationId = canonicalConversation.id;
      if (canonicalConversation.extra.canonical_thread_stub) {
        const createdConversation = await ipcBridge.conversation.createWithConversation.invoke({
          conversation: nextConversation,
        });
        localConversationId = createdConversation.id;
      } else {
        const updated = await ipcBridge.conversation.update.invoke({
          id: canonicalConversation.id,
          updates: {
            extra: {
              workspace: selectedWorkspace,
              custom_workspace: true,
            },
          } as Partial<TChatConversation>,
          merge_extra: true,
        });
        if (!updated) throw new Error('Local project affinity projection update was rejected.');
      }

      const localReadback = await ipcBridge.conversation.get.invoke({ id: localConversationId });
      if (
        canonicalCodexThreadId(localReadback) !== threadId ||
        localReadback.extra.workspace !== selectedWorkspace ||
        localReadback.extra.custom_workspace !== true
      ) {
        throw new Error('Local project affinity projection readback did not match the canonical cwd.');
      }
    } catch (error) {
      console.warn('Canonical cwd changed, but its rebuildable shell affinity projection could not be updated:', error);
    }
    return true;
  } catch (error) {
    console.error('Canonical project affinity adoption failed:', error);
    return false;
  }
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

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { getSystemDir } from '../utils/initStorage';
import { getDefaultAutoUpdateCacheRoot } from '../services/autoUpdateCacheCleanup';
import {
  archiveConversationArtifacts,
  buildLocalDataLifecycleInventory,
  deleteArchivedConversationArtifacts,
  executeLogRetentionPlan,
  executeRuntimePointerPrunePlan,
  executeUpdaterCacheCleanupPlan,
  resolveLogRetentionPlan,
  resolveRuntimePointerPrunePlan,
  resolveUpdaterCacheCleanupDryRunPlan,
  type ConversationArchiveReceipt,
} from '../services/localDataLifecycle';

const RETAIN_DAYS = 30;
const RETAIN_LOG_FILES = 7;
const MAX_TOTAL_LOG_BYTES = 10 * 1024 * 1024;

function appCacheName(): string {
  return process.env.OPL_APP_UPDATER_CACHE_DIR_NAME?.trim() || 'one-person-lab-aion-shell-updater';
}

function userDataRoot(): string {
  return app.getPath('userData');
}

function lifecycleRoot(): string {
  return path.join(userDataRoot(), 'local-data-lifecycle');
}

function archiveRoot(): string {
  return path.join(lifecycleRoot(), 'archives');
}

function receiptRoot(): string {
  return path.join(lifecycleRoot(), 'receipts');
}

function runtimeRoot(): string {
  return process.env.OPL_RUNTIME_TOOLCHAIN_ROOT?.trim() || path.join(userDataRoot(), 'runtime');
}

function updaterCacheRoot(): string {
  return getDefaultAutoUpdateCacheRoot({
    appCacheDirName: appCacheName(),
  });
}

function retiredUpdaterCacheRoots(): string[] {
  return [
    getDefaultAutoUpdateCacheRoot({
      appCacheDirName: 'aionui-updater',
    }),
  ];
}

function conversationRoot(): string {
  return path.join(getSystemDir().workDir, 'conversations');
}

function receiptPathFromRequest(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Local data lifecycle receipt path is required.');
  }
  return normalized;
}

function readArchiveReceipt(receiptPath: string): ConversationArchiveReceipt {
  const parsed = JSON.parse(fs.readFileSync(receiptPathFromRequest(receiptPath), 'utf8')) as ConversationArchiveReceipt;
  if (parsed.schema !== 'opl_conversation_archive_receipt.v1') {
    throw new Error('Conversation archive receipt is invalid.');
  }
  return parsed;
}

export function initLocalDataLifecycleBridge(): void {
  ipcBridge.localDataLifecycle.getInventory.provider(() =>
    Promise.resolve(
      buildLocalDataLifecycleInventory({
        dataRoot: getSystemDir().workDir,
        updaterCacheRoots: [updaterCacheRoot(), ...retiredUpdaterCacheRoots()],
        conversationRoots: [conversationRoot()],
        runtimeRoot: runtimeRoot(),
        logsRoot: getSystemDir().logDir,
      })
    )
  );

  ipcBridge.localDataLifecycle.archiveConversations.provider(() =>
    Promise.resolve(
      archiveConversationArtifacts({
        conversationId: 'all-conversations',
        sourcePaths: [conversationRoot()],
        archiveRoot: archiveRoot(),
        receiptRoot: receiptRoot(),
      })
    )
  );

  ipcBridge.localDataLifecycle.restoreConversationProof.provider(({ receiptPath }) => {
    const receipt = readArchiveReceipt(receiptPath);
    if (!fs.existsSync(receipt.manifest_path) || !fs.existsSync(receipt.restore_probe_path)) {
      throw new Error('Conversation archive restore proof is missing.');
    }
    return Promise.resolve(receipt);
  });

  ipcBridge.localDataLifecycle.deleteConversationArtifacts.provider(({ receiptPath, confirmation }) =>
    Promise.resolve(
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: receiptPathFromRequest(receiptPath),
        receiptRoot: receiptRoot(),
        confirmation,
      })
    )
  );

  ipcBridge.localDataLifecycle.planRuntimePrune.provider(() =>
    Promise.resolve(
      resolveRuntimePointerPrunePlan({
        runtimeRoot: runtimeRoot(),
      })
    )
  );

  ipcBridge.localDataLifecycle.executeRuntimePrune.provider(({ plan, planHash }) =>
    Promise.resolve(
      executeRuntimePointerPrunePlan({
        plan,
        planHash,
        receiptRoot: receiptRoot(),
      })
    )
  );

  ipcBridge.localDataLifecycle.planLogRotation.provider(() =>
    Promise.resolve(
      resolveLogRetentionPlan({
        logsRoot: getSystemDir().logDir,
        retainDays: RETAIN_DAYS,
        retainFiles: RETAIN_LOG_FILES,
        maxTotalBytes: MAX_TOTAL_LOG_BYTES,
      })
    )
  );

  ipcBridge.localDataLifecycle.executeLogRotation.provider(({ plan, planHash }) =>
    Promise.resolve(
      executeLogRetentionPlan({
        plan,
        planHash,
        receiptRoot: receiptRoot(),
      })
    )
  );

  ipcBridge.localDataLifecycle.planUpdaterCacheCleanup.provider(() =>
    Promise.resolve(
      resolveUpdaterCacheCleanupDryRunPlan({
        cacheRoots: [updaterCacheRoot()],
        retiredCacheRoots: retiredUpdaterCacheRoots(),
      })
    )
  );

  ipcBridge.localDataLifecycle.executeUpdaterCacheCleanup.provider(({ plan, planHash }) =>
    Promise.resolve(
      executeUpdaterCacheCleanupPlan({
        plan,
        planHash,
        receiptRoot: receiptRoot(),
      })
    )
  );
}

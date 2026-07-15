/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { getSystemDir } from '../utils/initStorage';
import { getDefaultAutoUpdateCacheRoot } from '../services/autoUpdateCacheCleanup';
import {
  archiveConversationArtifacts,
  deleteArchivedConversationArtifacts,
  executeLogRetentionPlan,
  executeRuntimePointerPrunePlan,
  executeUpdaterCacheCleanupPlan,
  resolveLogRetentionPlan,
  resolveRuntimePointerPrunePlan,
  resolveUpdaterCacheCleanupDryRunPlan,
  restoreConversationArchiveArtifacts,
  verifyConversationArchiveReceipt,
} from '../services/localDataLifecycle';
import type { LocalDataLifecycleInventory, LocalDataLifecycleInventoryInput } from '../services/localDataLifecycle';
import { LocalDataLifecycleInventorySnapshotStore } from '../services/localDataLifecycle/inventorySnapshot';
import type { LocalDataInventoryWorkerResponse } from '../worker/localDataInventoryProtocol';

const RETAIN_DAYS = 30;
const RETAIN_LOG_FILES = 7;
const MAX_TOTAL_LOG_BYTES = 10 * 1024 * 1024;
const INVENTORY_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const INVENTORY_STARTUP_SCAN_DELAY_MS = 2000;

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

function inventorySnapshotPath(): string {
  return path.join(lifecycleRoot(), 'inventory-snapshot.json');
}

function shellToolchainRuntimeRoot(): string {
  return path.join(getSystemDir().workDir, 'runtime');
}

function managedOplRuntimeRoot(): string {
  const configuredRoot = process.env.OPL_RUNTIME_TOOLCHAIN_ROOT?.trim();
  if (configuredRoot) return configuredRoot;
  if (process.platform !== 'darwin') {
    throw new Error('OPL_RUNTIME_TOOLCHAIN_ROOT is required outside the macOS desktop release.');
  }
  return path.join(app.getPath('home'), 'Library', 'Application Support', 'OPL', 'runtime');
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

function inventoryInput(): LocalDataLifecycleInventoryInput {
  return {
    dataRoot: getSystemDir().workDir,
    updaterCacheRoots: [updaterCacheRoot(), ...retiredUpdaterCacheRoots()],
    conversationRoots: [conversationRoot()],
    runtimeRoots: [shellToolchainRuntimeRoot(), managedOplRuntimeRoot()],
    logsRoot: getSystemDir().logDir,
  };
}

function scanInventoryInWorker(input: LocalDataLifecycleInventoryInput): Promise<LocalDataLifecycleInventory> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(app.getAppPath(), 'out', 'main', 'localDataInventoryWorker.js'), {
      workerData: input,
    });
    let settled = false;
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    worker.once('message', (response: LocalDataInventoryWorkerResponse) => {
      if (settled) return;
      settled = true;
      if ('error' in response) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.inventory);
    });
    worker.once('error', rejectOnce);
    worker.once('exit', (code) => {
      if (code !== 0) rejectOnce(new Error(`Local data inventory worker exited with code ${code}.`));
    });
  });
}

export function initLocalDataLifecycleBridge(): void {
  const inventoryStore = new LocalDataLifecycleInventorySnapshotStore({
    snapshotPath: inventorySnapshotPath(),
    ttlMs: INVENTORY_SNAPSHOT_TTL_MS,
    scan: () => scanInventoryInWorker(inventoryInput()),
    onUpdated: (snapshot) => ipcBridge.localDataLifecycle.inventoryUpdated.emit(snapshot),
  });

  ipcBridge.localDataLifecycle.getInventorySnapshot.provider(() => Promise.resolve(inventoryStore.getSnapshot()));
  ipcBridge.localDataLifecycle.refreshInventory.provider(() => inventoryStore.refresh({ force: true }));
  ipcBridge.localDataLifecycle.getInventory.provider(async () => {
    const snapshot = await inventoryStore.refresh({ force: true });
    if (!snapshot.inventory) throw new Error('Local data lifecycle inventory is unavailable.');
    return snapshot.inventory;
  });

  const startupScan = setTimeout(() => {
    void inventoryStore.refresh().catch((error) => {
      console.warn('[LocalDataLifecycle] Delayed inventory scan failed:', error);
    });
  }, INVENTORY_STARTUP_SCAN_DELAY_MS);
  startupScan.unref?.();

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

  ipcBridge.localDataLifecycle.restoreConversationProof.provider(({ receiptPath }) =>
    Promise.resolve(
      verifyConversationArchiveReceipt({
        archiveReceiptPath: receiptPathFromRequest(receiptPath),
        archiveRoot: archiveRoot(),
        receiptRoot: receiptRoot(),
        allowedSourcePaths: [conversationRoot()],
      })
    )
  );

  ipcBridge.localDataLifecycle.restoreConversationArchive.provider(({ receiptPath }) =>
    Promise.resolve(
      restoreConversationArchiveArtifacts({
        archiveReceiptPath: receiptPathFromRequest(receiptPath),
        archiveRoot: archiveRoot(),
        receiptRoot: receiptRoot(),
        allowedSourcePaths: [conversationRoot()],
      })
    )
  );

  ipcBridge.localDataLifecycle.deleteConversationArtifacts.provider(({ receiptPath, confirmation }) =>
    Promise.resolve(
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: receiptPathFromRequest(receiptPath),
        archiveRoot: archiveRoot(),
        receiptRoot: receiptRoot(),
        allowedSourcePaths: [conversationRoot()],
        confirmation,
      })
    )
  );

  ipcBridge.localDataLifecycle.planRuntimePrune.provider(() =>
    Promise.resolve(
      resolveRuntimePointerPrunePlan({
        runtimeRoot: managedOplRuntimeRoot(),
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

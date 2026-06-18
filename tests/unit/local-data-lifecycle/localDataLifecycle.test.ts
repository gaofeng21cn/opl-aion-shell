import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
} from '@/process/services/localDataLifecycle';

let tempRoot: string;

const writeFile = (filePath: string, content = 'data') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const touchFile = (filePath: string, mtime: Date) => {
  fs.utimesSync(filePath, mtime, mtime);
};

const exists = (filePath: string) => fs.existsSync(filePath);

describe('local data lifecycle service', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-local-data-lifecycle-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('builds an inventory without treating conversation artifacts as automatic delete candidates', () => {
    const dataRoot = path.join(tempRoot, 'opl-data');
    const conversationRoot = path.join(dataRoot, 'conversations', 'conversation-1');
    const updaterCacheRoot = path.join(tempRoot, 'updater-cache');
    const runtimeRoot = path.join(tempRoot, 'runtime');
    const logsRoot = path.join(tempRoot, 'logs');
    writeFile(path.join(updaterCacheRoot, 'update.zip'), 'installer');
    writeFile(path.join(conversationRoot, 'paper.md'), 'paper');
    writeFile(path.join(runtimeRoot, 'current', 'bin', 'opl'), 'runtime');
    writeFile(path.join(logsRoot, '2026-06-18.log'), 'log');

    const inventory = buildLocalDataLifecycleInventory({
      dataRoot,
      updaterCacheRoots: [updaterCacheRoot],
      conversationRoots: [conversationRoot],
      runtimeRoot,
      logsRoot,
    });

    expect(inventory.schema).toBe('opl_local_data_lifecycle_inventory.v1');
    expect(inventory.total_bytes).toBe(
      Buffer.byteLength('installer') +
        Buffer.byteLength('paper') +
        Buffer.byteLength('runtime') +
        Buffer.byteLength('log')
    );
    expect(inventory.sections.map((section) => section.id)).toEqual([
      'updater_cache',
      'conversation_artifacts',
      'runtime_toolchain',
      'logs',
    ]);
    expect(inventory.sections[0]).toMatchObject({
      id: 'updater_cache',
      cleanup_mode: 'stale_installer_package_cleanup_allowed',
      silent_delete_allowed: true,
      roots: [{ path: updaterCacheRoot, exists: true, bytes: Buffer.byteLength('installer') }],
    });
    expect(inventory.sections[1]).toMatchObject({
      id: 'conversation_artifacts',
      cleanup_mode: 'archive_required_before_cleanup',
      silent_delete_allowed: false,
      roots: [{ path: conversationRoot, exists: true, bytes: Buffer.byteLength('paper') }],
    });
  });

  it('plans log rotation by age, count, and total size without deleting files', () => {
    const logsRoot = path.join(tempRoot, 'logs');
    const now = new Date('2026-06-18T12:00:00Z');
    const newest = path.join(logsRoot, '2026-06-18.log');
    const previous = path.join(logsRoot, '2026-06-17.log');
    const old = path.join(logsRoot, '2026-05-01.log');
    const backend = path.join(logsRoot, 'logs', '2026-05-02.log');
    const notes = path.join(logsRoot, 'notes.txt');
    writeFile(newest, 'newest');
    writeFile(previous, 'previous');
    writeFile(old, 'old-log');
    writeFile(backend, 'backend-old-log');
    writeFile(notes, 'not-a-log');
    touchFile(newest, new Date('2026-06-18T11:00:00Z'));
    touchFile(previous, new Date('2026-06-17T11:00:00Z'));
    touchFile(old, new Date('2026-05-01T11:00:00Z'));
    touchFile(backend, new Date('2026-05-02T11:00:00Z'));
    touchFile(notes, new Date('2026-05-01T11:00:00Z'));

    const plan = resolveLogRetentionPlan({
      logsRoot,
      now,
      retainDays: 30,
      retainFiles: 2,
      maxTotalBytes: Buffer.byteLength('newest') + Buffer.byteLength('previous'),
    });

    expect(plan.mode).toBe('dry_run');
    expect(plan.plan_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.remove_candidates.map((candidate) => candidate.path).sort()).toEqual([backend, old].sort());
    expect(plan.keep_paths).toEqual([newest, previous]);
    expect(plan.remove_candidates.every((candidate) => candidate.reason.length > 0)).toBe(true);
    expect(exists(old)).toBe(true);
    expect(exists(backend)).toBe(true);
    expect(exists(notes)).toBe(true);
  });

  it('plans runtime pruning from current and rollback pointers only', () => {
    const runtimeRoot = path.join(tempRoot, 'runtime');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const previousRuntime = path.join(runtimeRoot, 'previous-26.6.17');
    const staleRuntime = path.join(runtimeRoot, 'stale-26.6.16');
    const stagedRuntime = path.join(runtimeRoot, 'staged', '26.6.19');
    writeFile(path.join(currentRuntime, 'bin', 'opl'), 'current');
    writeFile(path.join(previousRuntime, 'bin', 'opl'), 'previous');
    writeFile(path.join(staleRuntime, 'bin', 'opl'), 'stale');
    writeFile(path.join(stagedRuntime, 'bin', 'opl'), 'staged');
    writeFile(
      path.join(runtimeRoot, 'current.json'),
      `${JSON.stringify({
        runtime_home: currentRuntime,
        previous_runtime_home: previousRuntime,
      })}\n`
    );
    writeFile(path.join(runtimeRoot, 'rollback.json'), `${JSON.stringify({ runtime_home: previousRuntime })}\n`);

    const plan = resolveRuntimePointerPrunePlan({ runtimeRoot });

    expect(plan.mode).toBe('dry_run');
    expect(plan.protected_paths.sort()).toEqual(
      [
        currentRuntime,
        previousRuntime,
        path.join(runtimeRoot, 'current.json'),
        path.join(runtimeRoot, 'rollback.json'),
      ].sort()
    );
    expect(plan.remove_candidates.map((candidate) => candidate.path).sort()).toEqual(
      [stagedRuntime, staleRuntime].sort()
    );
    expect(plan.remove_candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: staleRuntime, reason: 'unreferenced_runtime_root' }),
        expect.objectContaining({ path: stagedRuntime, reason: 'unreferenced_staged_runtime' }),
      ])
    );
    expect(exists(staleRuntime)).toBe(true);
    expect(exists(stagedRuntime)).toBe(true);
  });

  it('archives conversation artifacts with a restore proof before explicit deletion can run', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'conversation-1');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeFile(path.join(conversationRoot, 'paper.md'), 'paper');
    writeFile(path.join(conversationRoot, 'results', 'summary.json'), '{"ok":true}');

    expect(() =>
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: path.join(receiptsRoot, 'missing.json'),
        receiptRoot: receiptsRoot,
        confirmation: 'delete:conversation-1',
      })
    ).toThrow(/archive receipt/i);

    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'conversation-1',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
      now: new Date('2026-06-18T12:00:00Z'),
    });

    expect(archiveReceipt.schema).toBe('opl_conversation_archive_receipt.v1');
    expect(archiveReceipt.source_paths).toEqual([conversationRoot]);
    expect(exists(archiveReceipt.archive_path)).toBe(true);
    expect(exists(archiveReceipt.manifest_path)).toBe(true);
    expect(exists(archiveReceipt.restore_probe_path)).toBe(true);
    expect(exists(archiveReceipt.receipt_path)).toBe(true);
    expect(exists(conversationRoot)).toBe(true);

    const deleteReceipt = deleteArchivedConversationArtifacts({
      archiveReceiptPath: archiveReceipt.receipt_path,
      receiptRoot: receiptsRoot,
      confirmation: 'delete:conversation-1',
      now: new Date('2026-06-18T12:01:00Z'),
    });

    expect(deleteReceipt.schema).toBe('opl_conversation_delete_receipt.v1');
    expect(deleteReceipt.conversation_id).toBe('conversation-1');
    expect(deleteReceipt.deleted_paths).toEqual([conversationRoot]);
    expect(deleteReceipt.archive_receipt_path).toBe(archiveReceipt.receipt_path);
    expect(exists(deleteReceipt.receipt_path)).toBe(true);
    expect(exists(conversationRoot)).toBe(false);
    expect(exists(archiveReceipt.archive_path)).toBe(true);
  });

  it('executes runtime pointer pruning only from the dry-run plan and writes a receipt', () => {
    const runtimeRoot = path.join(tempRoot, 'runtime');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const previousRuntime = path.join(runtimeRoot, 'previous-26.6.17');
    const staleRuntime = path.join(runtimeRoot, 'stale-26.6.16');
    const stagedRuntime = path.join(runtimeRoot, 'staged', '26.6.19');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeFile(path.join(currentRuntime, 'bin', 'opl'), 'current');
    writeFile(path.join(previousRuntime, 'bin', 'opl'), 'previous');
    writeFile(path.join(staleRuntime, 'bin', 'opl'), 'stale');
    writeFile(path.join(stagedRuntime, 'bin', 'opl'), 'staged');
    writeFile(
      path.join(runtimeRoot, 'current.json'),
      `${JSON.stringify({
        runtime_home: currentRuntime,
        previous_runtime_home: previousRuntime,
      })}\n`
    );

    const plan = resolveRuntimePointerPrunePlan({ runtimeRoot });
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan: { ...plan, plan_hash: 'wrong' },
        receiptRoot: receiptsRoot,
        planHash: 'wrong',
      })
    ).toThrow(/plan hash/i);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: '',
      })
    ).toThrow(/matching dry-run plan hash/i);

    const receipt = executeRuntimePointerPrunePlan({
      plan,
      receiptRoot: receiptsRoot,
      planHash: plan.plan_hash,
      now: new Date('2026-06-18T12:00:00Z'),
    });

    expect(receipt.schema).toBe('opl_runtime_pointer_prune_receipt.v1');
    expect(receipt.runtime_root).toBe(runtimeRoot);
    expect(receipt.dry_run_plan_id).toBe(plan.plan_id);
    expect(receipt.protected_paths.sort()).toEqual(
      [currentRuntime, previousRuntime, path.join(runtimeRoot, 'current.json')].sort()
    );
    expect(receipt.deleted_paths.sort()).toEqual([stagedRuntime, staleRuntime].sort());
    expect(receipt.deleted_bytes).toBe(Buffer.byteLength('stale') + Buffer.byteLength('staged'));
    expect(exists(receipt.receipt_path)).toBe(true);
    expect(exists(currentRuntime)).toBe(true);
    expect(exists(previousRuntime)).toBe(true);
    expect(exists(staleRuntime)).toBe(false);
    expect(exists(stagedRuntime)).toBe(false);
  });

  it('executes bounded log rotation only for dry-run log candidates and writes a receipt', () => {
    const logsRoot = path.join(tempRoot, 'logs');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const now = new Date('2026-06-18T12:00:00Z');
    const newest = path.join(logsRoot, '2026-06-18.log');
    const old = path.join(logsRoot, '2026-05-01.log');
    const notes = path.join(logsRoot, 'notes.txt');
    writeFile(newest, 'newest');
    writeFile(old, 'old-log');
    writeFile(notes, 'notes');
    touchFile(newest, new Date('2026-06-18T11:00:00Z'));
    touchFile(old, new Date('2026-05-01T11:00:00Z'));
    touchFile(notes, new Date('2026-05-01T11:00:00Z'));

    const plan = resolveLogRetentionPlan({
      logsRoot,
      now,
      retainDays: 30,
      retainFiles: 1,
      maxTotalBytes: Buffer.byteLength('newest'),
    });
    const receipt = executeLogRetentionPlan({
      plan,
      receiptRoot: receiptsRoot,
      planHash: plan.plan_hash,
      now: new Date('2026-06-18T12:01:00Z'),
    });

    expect(receipt.schema).toBe('opl_log_rotation_receipt.v1');
    expect(receipt.logs_root).toBe(logsRoot);
    expect(receipt.dry_run_plan_id).toBe(plan.plan_id);
    expect(receipt.deleted_paths).toEqual([old]);
    expect(receipt.deleted_bytes).toBe(Buffer.byteLength('old-log'));
    expect(exists(receipt.receipt_path)).toBe(true);
    expect(exists(newest)).toBe(true);
    expect(exists(old)).toBe(false);
    expect(exists(notes)).toBe(true);
  });

  it('plans and executes updater cache cleanup with a receipt while preserving active metadata and retired roots', () => {
    const cacheRoot = path.join(tempRoot, 'one-person-lab-aion-shell-updater');
    const retiredCacheRoot = path.join(tempRoot, 'aionui-updater');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const activePackage = path.join(cacheRoot, 'pending', 'active.zip');
    const stalePackage = path.join(cacheRoot, 'pending', 'stale.zip');
    const retiredPackage = path.join(retiredCacheRoot, 'pending', 'legacy.zip');
    const notes = path.join(cacheRoot, 'pending', 'notes.txt');
    const retiredNotes = path.join(retiredCacheRoot, 'notes.txt');
    const metadata = path.join(cacheRoot, 'pending', 'update-info.json');
    const retiredMetadata = path.join(retiredCacheRoot, 'pending', 'update-info.json');
    writeFile(activePackage, 'active');
    writeFile(stalePackage, 'stale');
    writeFile(retiredPackage, 'legacy');
    writeFile(notes, 'notes');
    writeFile(retiredNotes, 'retired-notes');
    writeFile(metadata, JSON.stringify({ filePath: activePackage }));
    writeFile(retiredMetadata, JSON.stringify({ filePath: retiredPackage }));

    const plan = resolveUpdaterCacheCleanupDryRunPlan({
      cacheRoots: [cacheRoot],
      retiredCacheRoots: [retiredCacheRoot],
      now: new Date('2026-06-18T12:00:00Z'),
    });
    expect([...plan.cache_roots].sort()).toEqual([cacheRoot, retiredCacheRoot].sort());
    expect([...plan.remove_candidates].sort((left, right) => left.path.localeCompare(right.path))).toEqual([
      {
        path: retiredPackage,
        bytes: Buffer.byteLength('legacy'),
        reason: 'stale_installer_package',
      },
      {
        path: stalePackage,
        bytes: Buffer.byteLength('stale'),
        reason: 'stale_installer_package',
      },
    ]);

    const receipt = executeUpdaterCacheCleanupPlan({
      plan,
      receiptRoot: receiptsRoot,
      planHash: plan.plan_hash,
      now: new Date('2026-06-18T12:01:00Z'),
    });

    expect(receipt.schema).toBe('opl_updater_cache_cleanup_receipt.v1');
    expect(receipt.deleted_paths.sort()).toEqual([retiredPackage, stalePackage].sort());
    expect(receipt.deleted_bytes).toBe(Buffer.byteLength('legacy') + Buffer.byteLength('stale'));
    expect(exists(receipt.receipt_path)).toBe(true);
    expect(exists(stalePackage)).toBe(false);
    expect(exists(retiredPackage)).toBe(false);
    expect(exists(activePackage)).toBe(true);
    expect(exists(metadata)).toBe(true);
    expect(exists(retiredMetadata)).toBe(true);
    expect(exists(notes)).toBe(true);
    expect(exists(retiredNotes)).toBe(true);
  });
});

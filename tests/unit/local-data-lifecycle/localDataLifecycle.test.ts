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
  restoreConversationArchiveArtifacts,
  resolveLogRetentionPlan,
  resolveRuntimePointerPrunePlan,
  resolveUpdaterCacheCleanupDryRunPlan,
} from '@/process/services/localDataLifecycle';

let tempRoot: string;

const writeFile = (filePath: string, content = 'data') => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const writeRuntimeGeneration = (runtimeHome: string, content: string) => {
  writeFile(path.join(runtimeHome, 'bin', 'opl'), content);
  writeFile(path.join(runtimeHome, '.opl-full-runtime-installed.json'), '');
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
    const shellRuntimeRoot = path.join(dataRoot, 'runtime');
    const managedRuntimeRoot = path.join(tempRoot, 'OPL', 'runtime');
    const logsRoot = path.join(tempRoot, 'logs');
    writeFile(path.join(updaterCacheRoot, 'update.zip'), 'installer');
    writeFile(path.join(conversationRoot, 'paper.md'), 'paper');
    writeFile(path.join(shellRuntimeRoot, 'managed-tools', 'acp', 'codex-acp'), 'shell-runtime');
    writeRuntimeGeneration(path.join(managedRuntimeRoot, 'current'), 'managed-runtime');
    writeFile(path.join(logsRoot, '2026-06-18.log'), 'log');

    const inventory = buildLocalDataLifecycleInventory({
      dataRoot,
      updaterCacheRoots: [updaterCacheRoot],
      conversationRoots: [conversationRoot],
      runtimeRoots: [shellRuntimeRoot, managedRuntimeRoot],
      logsRoot,
    });

    expect(inventory.schema).toBe('opl_local_data_lifecycle_inventory.v1');
    expect(inventory.total_bytes).toBe(
      Buffer.byteLength('installer') +
        Buffer.byteLength('paper') +
        Buffer.byteLength('shell-runtime') +
        Buffer.byteLength('managed-runtime') +
        Buffer.byteLength('log')
    );
    expect(inventory.sections.map((section) => section.id)).toEqual([
      'updater_cache',
      'user_data_artifacts',
      'runtime_substrate',
      'logs',
    ]);
    expect(inventory.sections[0]).toMatchObject({
      id: 'updater_cache',
      cleanup_mode: 'stale_installer_package_cleanup_allowed',
      silent_delete_allowed: true,
      roots: [{ path: updaterCacheRoot, exists: true, bytes: Buffer.byteLength('installer') }],
    });
    expect(inventory.sections[1]).toMatchObject({
      id: 'user_data_artifacts',
      cleanup_mode: 'archive_required_before_cleanup',
      silent_delete_allowed: false,
      roots: [{ path: conversationRoot, exists: true, bytes: Buffer.byteLength('paper') }],
    });
    expect(inventory.sections[2]).toMatchObject({
      id: 'runtime_substrate',
      cleanup_mode: 'pointer_based_dry_run_required',
      silent_delete_allowed: false,
    });
    expect(inventory.sections[2].roots.map((root) => root.path).sort()).toEqual(
      [shellRuntimeRoot, managedRuntimeRoot].sort()
    );
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
    const previousAlias = path.join(runtimeRoot, 'previous');
    const toolcacheRoot = path.join(runtimeRoot, 'toolcache');
    const generationsRoot = path.join(runtimeRoot, 'generations');
    const nonRuntimeStagedRoot = path.join(runtimeRoot, 'staged', 'codex-cli');
    writeRuntimeGeneration(currentRuntime, 'current');
    writeRuntimeGeneration(previousRuntime, 'previous');
    writeRuntimeGeneration(previousAlias, 'previous-alias');
    writeRuntimeGeneration(staleRuntime, 'stale');
    writeRuntimeGeneration(stagedRuntime, 'staged');
    writeFile(path.join(toolcacheRoot, 'codex', 'cache.zip'), 'toolcache');
    writeFile(path.join(generationsRoot, 'metadata.json'), '{}');
    writeFile(path.join(nonRuntimeStagedRoot, 'download.zip'), 'download');
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
    expect(plan.authority_state).toBe('ready');
    expect(plan.blocked_reason).toBeNull();
    expect(plan.candidate_marker).toBe('.opl-full-runtime-installed.json');
    expect(plan.protected_paths.sort()).toEqual(
      [
        currentRuntime,
        previousRuntime,
        previousAlias,
        toolcacheRoot,
        generationsRoot,
        path.join(runtimeRoot, 'staged'),
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
    expect(plan.remove_candidates.some((candidate) => candidate.path === nonRuntimeStagedRoot)).toBe(false);
  });

  it('blocks runtime pruning when a shell toolchain root has no managed runtime authority', () => {
    const runtimeRoot = path.join(tempRoot, 'opl-data', 'runtime');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeFile(path.join(runtimeRoot, 'bun-1.3.13', 'bun'), 'bun');
    writeFile(path.join(runtimeRoot, 'node', 'node-v24', 'bin', 'node'), 'node');
    writeFile(path.join(runtimeRoot, 'managed-tools', 'acp', 'codex-acp'), 'acp');

    const plan = resolveRuntimePointerPrunePlan({ runtimeRoot });

    expect(plan.authority_state).toBe('blocked');
    expect(plan.blocked_reason).toBe('current_runtime_pointer_missing_or_invalid');
    expect(plan.remove_candidates).toEqual([]);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: plan.plan_hash,
        selectedPaths: [],
      })
    ).toThrow(/runtime prune is blocked/i);
  });

  it('blocks managed runtime pruning when current points to a runtime without the install marker', () => {
    const runtimeRoot = path.join(tempRoot, 'OPL', 'runtime');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const staleRuntime = path.join(runtimeRoot, '26.6.17');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeFile(path.join(currentRuntime, 'bin', 'opl'), 'current-without-marker');
    writeRuntimeGeneration(staleRuntime, 'stale');
    writeFile(path.join(runtimeRoot, 'current.json'), `${JSON.stringify({ runtime_home: currentRuntime })}\n`);

    const plan = resolveRuntimePointerPrunePlan({ runtimeRoot });

    expect(plan.authority_state).toBe('blocked');
    expect(plan.blocked_reason).toBe('current_runtime_install_marker_missing');
    expect(plan.remove_candidates).toEqual([]);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: plan.plan_hash,
        selectedPaths: [],
      })
    ).toThrow(/runtime prune is blocked/i);
    expect(exists(staleRuntime)).toBe(true);
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
        archiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [conversationRoot],
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
      archiveRoot,
      receiptRoot: receiptsRoot,
      allowedSourcePaths: [conversationRoot],
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

  it('refuses deletion when the archive receipt is outside the lifecycle receipt root', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'outside-receipt');
    const archiveRoot = path.join(tempRoot, 'archives');
    const archiveReceiptsRoot = path.join(tempRoot, 'archive-receipts');
    const lifecycleReceiptsRoot = path.join(tempRoot, 'lifecycle-receipts');
    writeFile(path.join(conversationRoot, 'paper.md'), 'paper');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'outside-receipt',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: archiveReceiptsRoot,
    });

    expect(() =>
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot,
        receiptRoot: lifecycleReceiptsRoot,
        allowedSourcePaths: [conversationRoot],
        confirmation: 'delete:outside-receipt',
      })
    ).toThrow(/outside the local data lifecycle receipt directory/i);
    expect(exists(conversationRoot)).toBe(true);
  });

  it('refuses deletion when the archive payload is outside the lifecycle archive root', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'outside-archive');
    const archiveRoot = path.join(tempRoot, 'archives');
    const lifecycleArchiveRoot = path.join(tempRoot, 'lifecycle-archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeFile(path.join(conversationRoot, 'paper.md'), 'paper');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'outside-archive',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
    });

    expect(() =>
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot: lifecycleArchiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [conversationRoot],
        confirmation: 'delete:outside-archive',
      })
    ).toThrow(/outside the local data lifecycle archive directory/i);
    expect(exists(conversationRoot)).toBe(true);
  });

  it('refuses deletion when archived sources differ from the current conversation root', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'archived');
    const currentConversationRoot = path.join(tempRoot, 'conversations', 'current');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeFile(path.join(conversationRoot, 'paper.md'), 'paper');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'archived',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
    });

    expect(() =>
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [currentConversationRoot],
        confirmation: 'delete:archived',
      })
    ).toThrow(/do not match the current conversation data roots/i);
    expect(exists(conversationRoot)).toBe(true);
  });

  it('rejects changed receipt, manifest, restore probe, or archived contents before deleting sources', () => {
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const cases = ['receipt', 'manifest', 'probe', 'contents'] as const;

    for (const failure of cases) {
      const conversationRoot = path.join(tempRoot, 'conversations', `delete-${failure}`);
      const sourceFile = path.join(conversationRoot, 'paper.md');
      writeFile(sourceFile, `paper-${failure}`);
      const archiveReceipt = archiveConversationArtifacts({
        conversationId: `delete-${failure}`,
        sourcePaths: [conversationRoot],
        archiveRoot,
        receiptRoot: receiptsRoot,
      });

      if (failure === 'receipt') {
        const receipt = JSON.parse(fs.readFileSync(archiveReceipt.receipt_path, 'utf8')) as Record<string, unknown>;
        writeFile(
          archiveReceipt.receipt_path,
          `${JSON.stringify({ ...receipt, receipt_path: path.join(receiptsRoot, 'different.json') }, null, 2)}\n`
        );
      }
      if (failure === 'manifest') fs.appendFileSync(archiveReceipt.manifest_path, ' ');
      if (failure === 'probe') {
        const probe = JSON.parse(fs.readFileSync(archiveReceipt.restore_probe_path, 'utf8')) as Record<string, unknown>;
        writeFile(archiveReceipt.restore_probe_path, `${JSON.stringify({ ...probe, entry_count: 99 }, null, 2)}\n`);
      }
      if (failure === 'contents') {
        writeFile(
          path.join(archiveReceipt.archive_path, 'contents', path.basename(conversationRoot), 'paper.md'),
          'changed'
        );
      }

      expect(() =>
        deleteArchivedConversationArtifacts({
          archiveReceiptPath: archiveReceipt.receipt_path,
          archiveRoot,
          receiptRoot: receiptsRoot,
          allowedSourcePaths: [conversationRoot],
          confirmation: `delete:delete-${failure}`,
        })
      ).toThrow(
        failure === 'receipt'
          ? /receipt path/i
          : failure === 'manifest'
            ? /manifest hash/i
            : failure === 'probe'
              ? /restore probe/i
              : /integrity/i
      );
      expect(fs.readFileSync(sourceFile, 'utf8')).toBe(`paper-${failure}`);
    }
  });

  it.skipIf(process.platform === 'win32')('refuses deletion through a symlinked archive path', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'archive-symlink');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const sourceFile = path.join(conversationRoot, 'paper.md');
    writeFile(sourceFile, 'paper');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'archive-symlink',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
    });
    const relocatedArchive = path.join(tempRoot, 'outside-archives', path.basename(archiveReceipt.archive_path));
    fs.mkdirSync(path.dirname(relocatedArchive), { recursive: true });
    fs.renameSync(archiveReceipt.archive_path, relocatedArchive);
    fs.symlinkSync(relocatedArchive, archiveReceipt.archive_path, 'dir');

    expect(() =>
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [conversationRoot],
        confirmation: 'delete:archive-symlink',
      })
    ).toThrow(/symbolic link|symlink/i);
    expect(fs.readFileSync(sourceFile, 'utf8')).toBe('paper');
    expect(exists(path.join(relocatedArchive, 'manifest.json'))).toBe(true);
  });

  it.skipIf(process.platform === 'win32')('refuses deletion when a conversation source becomes a symlink', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'source-symlink');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const sourceFile = path.join(conversationRoot, 'paper.md');
    writeFile(sourceFile, 'paper');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'source-symlink',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
    });
    const relocatedSource = path.join(tempRoot, 'outside-conversations', 'source-symlink');
    fs.mkdirSync(path.dirname(relocatedSource), { recursive: true });
    fs.renameSync(conversationRoot, relocatedSource);
    fs.symlinkSync(relocatedSource, conversationRoot, 'dir');

    expect(() =>
      deleteArchivedConversationArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [conversationRoot],
        confirmation: 'delete:source-symlink',
      })
    ).toThrow(/source path.*symlink/i);
    expect(fs.lstatSync(conversationRoot).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(relocatedSource, 'paper.md'), 'utf8')).toBe('paper');
  });

  it('restores archived conversation files and writes a restore receipt', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'conversation-restore');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const paperPath = path.join(conversationRoot, 'paper.md');
    const summaryPath = path.join(conversationRoot, 'results', 'summary.json');
    writeFile(paperPath, 'paper');
    writeFile(summaryPath, '{"ok":true}');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'conversation-restore',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
      now: new Date('2026-06-18T12:00:00Z'),
    });
    fs.rmSync(conversationRoot, { recursive: true });

    const restoreReceipt = restoreConversationArchiveArtifacts({
      archiveReceiptPath: archiveReceipt.receipt_path,
      archiveRoot,
      receiptRoot: receiptsRoot,
      allowedSourcePaths: [conversationRoot],
      now: new Date('2026-06-18T12:02:00Z'),
    });

    expect(restoreReceipt).toMatchObject({
      schema: 'opl_conversation_restore_receipt.v1',
      conversation_id: 'conversation-restore',
      archive_receipt_path: archiveReceipt.receipt_path,
      archive_sha256: archiveReceipt.archive_sha256,
    });
    expect(restoreReceipt.restored_paths.toSorted()).toEqual([paperPath, summaryPath].toSorted());
    expect(fs.readFileSync(paperPath, 'utf8')).toBe('paper');
    expect(fs.readFileSync(summaryPath, 'utf8')).toBe('{"ok":true}');
    expect(exists(restoreReceipt.receipt_path)).toBe(true);
    expect(fs.readdirSync(path.dirname(conversationRoot)).some((entry) => entry.includes('.opl-restore-'))).toBe(false);
  });

  it('rejects a changed receipt, manifest, restore probe, or archived file before restoring targets', () => {
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const cases = ['receipt', 'manifest', 'probe', 'contents'] as const;

    for (const failure of cases) {
      const conversationRoot = path.join(tempRoot, 'conversations', failure);
      const sourceFile = path.join(conversationRoot, 'paper.md');
      writeFile(sourceFile, `paper-${failure}`);
      const archiveReceipt = archiveConversationArtifacts({
        conversationId: `conversation-${failure}`,
        sourcePaths: [conversationRoot],
        archiveRoot,
        receiptRoot: receiptsRoot,
      });
      fs.rmSync(conversationRoot, { recursive: true });

      if (failure === 'receipt') {
        const receipt = JSON.parse(fs.readFileSync(archiveReceipt.receipt_path, 'utf8')) as Record<string, unknown>;
        writeFile(
          archiveReceipt.receipt_path,
          `${JSON.stringify({ ...receipt, receipt_path: path.join(receiptsRoot, 'different.json') }, null, 2)}\n`
        );
      }
      if (failure === 'manifest') fs.appendFileSync(archiveReceipt.manifest_path, ' ');
      if (failure === 'probe') {
        const probe = JSON.parse(fs.readFileSync(archiveReceipt.restore_probe_path, 'utf8')) as Record<string, unknown>;
        writeFile(archiveReceipt.restore_probe_path, `${JSON.stringify({ ...probe, entry_count: 99 }, null, 2)}\n`);
      }
      if (failure === 'contents') {
        writeFile(
          path.join(archiveReceipt.archive_path, 'contents', path.basename(conversationRoot), 'paper.md'),
          'changed'
        );
      }

      expect(() =>
        restoreConversationArchiveArtifacts({
          archiveReceiptPath: archiveReceipt.receipt_path,
          archiveRoot,
          receiptRoot: receiptsRoot,
          allowedSourcePaths: [conversationRoot],
        })
      ).toThrow(
        failure === 'receipt'
          ? /receipt path/i
          : failure === 'manifest'
            ? /manifest hash/i
            : failure === 'probe'
              ? /restore probe/i
              : /integrity/i
      );
      expect(exists(sourceFile)).toBe(false);
    }
  });

  it('fails closed on a restore target collision without writing other archived files', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'conversation-collision');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const existingTarget = path.join(conversationRoot, 'paper.md');
    const missingTarget = path.join(conversationRoot, 'results', 'summary.json');
    writeFile(existingTarget, 'archived-paper');
    writeFile(missingTarget, '{"archived":true}');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'conversation-collision',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
    });
    fs.rmSync(conversationRoot, { recursive: true });
    writeFile(existingTarget, 'newer-local-paper');

    expect(() =>
      restoreConversationArchiveArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [conversationRoot],
      })
    ).toThrow(/target already exists.*existing files were not changed/i);
    expect(fs.readFileSync(existingTarget, 'utf8')).toBe('newer-local-paper');
    expect(exists(missingTarget)).toBe(false);
  });

  it('refuses to restore an archive outside the current conversation data roots', () => {
    const conversationRoot = path.join(tempRoot, 'conversations', 'conversation-boundary');
    const archiveRoot = path.join(tempRoot, 'archives');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    const sourceFile = path.join(conversationRoot, 'paper.md');
    writeFile(sourceFile, 'paper');
    const archiveReceipt = archiveConversationArtifacts({
      conversationId: 'conversation-boundary',
      sourcePaths: [conversationRoot],
      archiveRoot,
      receiptRoot: receiptsRoot,
    });
    fs.rmSync(conversationRoot, { recursive: true });

    expect(() =>
      restoreConversationArchiveArtifacts({
        archiveReceiptPath: archiveReceipt.receipt_path,
        archiveRoot,
        receiptRoot: receiptsRoot,
        allowedSourcePaths: [path.join(tempRoot, 'different-conversation-root')],
      })
    ).toThrow(/current conversation data roots/i);
    expect(exists(sourceFile)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'rolls back committed files when the restore receipt cannot be committed',
    () => {
      const conversationRoot = path.join(tempRoot, 'conversations', 'conversation-rollback');
      const archiveRoot = path.join(tempRoot, 'archives');
      const receiptsRoot = path.join(tempRoot, 'receipts');
      const firstTarget = path.join(conversationRoot, 'paper.md');
      const secondTarget = path.join(conversationRoot, 'results', 'summary.json');
      writeFile(firstTarget, 'paper');
      writeFile(secondTarget, '{"ok":true}');
      const archiveReceipt = archiveConversationArtifacts({
        conversationId: 'conversation-rollback',
        sourcePaths: [conversationRoot],
        archiveRoot,
        receiptRoot: receiptsRoot,
      });
      fs.rmSync(conversationRoot, { recursive: true });

      fs.chmodSync(receiptsRoot, 0o500);
      try {
        expect(() =>
          restoreConversationArchiveArtifacts({
            archiveReceiptPath: archiveReceipt.receipt_path,
            archiveRoot,
            receiptRoot: receiptsRoot,
            allowedSourcePaths: [conversationRoot],
          })
        ).toThrow(/rolled back/i);
      } finally {
        fs.chmodSync(receiptsRoot, 0o700);
      }
      expect(exists(firstTarget)).toBe(false);
      expect(exists(secondTarget)).toBe(false);
      expect(exists(conversationRoot)).toBe(false);
      expect(fs.readdirSync(path.dirname(conversationRoot)).some((entry) => entry.includes('.opl-restore-'))).toBe(
        false
      );
    }
  );

  it('executes runtime pointer pruning only from the dry-run plan and writes a receipt', () => {
    const runtimeRoot = path.join(tempRoot, 'runtime');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const previousRuntime = path.join(runtimeRoot, 'previous-26.6.17');
    const staleRuntime = path.join(runtimeRoot, 'stale-26.6.16');
    const stagedRuntime = path.join(runtimeRoot, 'staged', '26.6.19');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeRuntimeGeneration(currentRuntime, 'current');
    writeRuntimeGeneration(previousRuntime, 'previous');
    writeRuntimeGeneration(staleRuntime, 'stale');
    writeRuntimeGeneration(stagedRuntime, 'staged');
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
        selectedPaths: [staleRuntime],
      })
    ).toThrow(/plan hash/i);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: '',
        selectedPaths: [staleRuntime],
      })
    ).toThrow(/matching dry-run plan hash/i);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: plan.plan_hash,
        selectedPaths: [],
      })
    ).toThrow(/at least one dry-run candidate/i);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: plan.plan_hash,
        selectedPaths: [staleRuntime, staleRuntime],
      })
    ).toThrow(/duplicate paths/i);
    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: plan.plan_hash,
        selectedPaths: [path.join(runtimeRoot, 'not-in-plan')],
      })
    ).toThrow(/outside the dry-run candidates/i);

    const receipt = executeRuntimePointerPrunePlan({
      plan,
      receiptRoot: receiptsRoot,
      planHash: plan.plan_hash,
      selectedPaths: [staleRuntime],
      now: new Date('2026-06-18T12:00:00Z'),
    });

    expect(receipt.schema).toBe('opl_runtime_pointer_prune_receipt.v1');
    expect(receipt.runtime_root).toBe(runtimeRoot);
    expect(receipt.dry_run_plan_id).toBe(plan.plan_id);
    expect(receipt.protected_paths.sort()).toEqual(
      [currentRuntime, previousRuntime, path.join(runtimeRoot, 'current.json'), path.join(runtimeRoot, 'staged')].sort()
    );
    expect(receipt.deleted_paths).toEqual([staleRuntime]);
    expect(receipt.deleted_bytes).toBe(Buffer.byteLength('stale'));
    expect(exists(receipt.receipt_path)).toBe(true);
    expect(exists(currentRuntime)).toBe(true);
    expect(exists(previousRuntime)).toBe(true);
    expect(exists(staleRuntime)).toBe(false);
    expect(exists(stagedRuntime)).toBe(true);
  });

  it('refuses runtime pruning when pointer authority changes after the dry-run plan', () => {
    const runtimeRoot = path.join(tempRoot, 'runtime');
    const currentRuntime = path.join(runtimeRoot, 'current');
    const staleRuntime = path.join(runtimeRoot, '26.6.17');
    const receiptsRoot = path.join(tempRoot, 'receipts');
    writeRuntimeGeneration(currentRuntime, 'current');
    writeRuntimeGeneration(staleRuntime, 'stale');
    const pointerPath = path.join(runtimeRoot, 'current.json');
    writeFile(pointerPath, `${JSON.stringify({ runtime_home: currentRuntime })}\n`);
    const plan = resolveRuntimePointerPrunePlan({ runtimeRoot });

    writeFile(pointerPath, `${JSON.stringify({ runtime_home: staleRuntime })}\n`);

    expect(() =>
      executeRuntimePointerPrunePlan({
        plan,
        receiptRoot: receiptsRoot,
        planHash: plan.plan_hash,
        selectedPaths: [staleRuntime],
      })
    ).toThrow(/authority changed/i);
    expect(exists(staleRuntime)).toBe(true);
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
      selectedPaths: [old],
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
      selectedPaths: [stalePackage],
      now: new Date('2026-06-18T12:01:00Z'),
    });

    expect(receipt.schema).toBe('opl_updater_cache_cleanup_receipt.v1');
    expect(receipt.deleted_paths).toEqual([stalePackage]);
    expect(receipt.deleted_bytes).toBe(Buffer.byteLength('stale'));
    expect(exists(receipt.receipt_path)).toBe(true);
    expect(exists(stalePackage)).toBe(false);
    expect(exists(retiredPackage)).toBe(true);
    expect(exists(activePackage)).toBe(true);
    expect(exists(metadata)).toBe(true);
    expect(exists(retiredMetadata)).toBe(true);
    expect(exists(notes)).toBe(true);
    expect(exists(retiredNotes)).toBe(true);
  });
});

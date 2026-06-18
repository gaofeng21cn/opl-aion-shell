/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAutoUpdateCacheCleanupPlan } from '../autoUpdateCacheCleanup';

type LifecycleSectionId = 'updater_cache' | 'conversation_artifacts' | 'runtime_toolchain' | 'logs';
type CleanupMode =
  | 'stale_installer_package_cleanup_allowed'
  | 'archive_required_before_cleanup'
  | 'pointer_based_dry_run_required'
  | 'bounded_rotation_dry_run_required';

type InventoryRoot = {
  path: string;
  exists: boolean;
  bytes: number;
};

type InventorySection = {
  id: LifecycleSectionId;
  cleanup_mode: CleanupMode;
  silent_delete_allowed: boolean;
  roots: InventoryRoot[];
  bytes: number;
};

export type LocalDataLifecycleInventory = {
  schema: 'opl_local_data_lifecycle_inventory.v1';
  total_bytes: number;
  sections: InventorySection[];
};

export type ConversationArchiveReceipt = {
  schema: 'opl_conversation_archive_receipt.v1';
  conversation_id: string;
  source_paths: string[];
  archive_path: string;
  archive_sha256: string;
  manifest_path: string;
  restore_probe_path: string;
  receipt_path: string;
  created_at: string;
};

export type ConversationDeleteReceipt = {
  schema: 'opl_conversation_delete_receipt.v1';
  conversation_id: string;
  deleted_paths: string[];
  archive_receipt_path: string;
  confirmed_at: string;
  receipt_path: string;
  created_at: string;
};

export type LogRetentionCandidate = {
  path: string;
  bytes: number;
  reason: 'older_than_retention_days' | 'exceeds_retained_file_count' | 'exceeds_total_log_bytes';
};

export type LogRetentionPlan = {
  schema: 'opl_log_retention_plan.v1';
  mode: 'dry_run';
  plan_id: string;
  plan_hash: string;
  logs_root: string;
  keep_paths: string[];
  remove_candidates: LogRetentionCandidate[];
  remove_bytes: number;
  created_at: string;
};

export type LogRotationReceipt = {
  schema: 'opl_log_rotation_receipt.v1';
  logs_root: string;
  dry_run_plan_id: string;
  deleted_paths: string[];
  deleted_bytes: number;
  receipt_path: string;
  created_at: string;
};

export type RuntimePruneCandidate = {
  path: string;
  bytes: number;
  reason: 'unreferenced_runtime_root' | 'unreferenced_staged_runtime';
};

export type RuntimePointerPrunePlan = {
  schema: 'opl_runtime_pointer_prune_plan.v1';
  mode: 'dry_run';
  plan_id: string;
  plan_hash: string;
  runtime_root: string;
  protected_paths: string[];
  remove_candidates: RuntimePruneCandidate[];
  remove_bytes: number;
  created_at: string;
};

export type RuntimePointerPruneReceipt = {
  schema: 'opl_runtime_pointer_prune_receipt.v1';
  runtime_root: string;
  dry_run_plan_id: string;
  protected_paths: string[];
  deleted_paths: string[];
  deleted_bytes: number;
  receipt_path: string;
  created_at: string;
};

export type UpdaterCacheCleanupCandidate = {
  path: string;
  bytes: number;
  reason: 'stale_installer_package';
};

export type UpdaterCacheCleanupDryRunPlan = {
  schema: 'opl_updater_cache_cleanup_plan.v1';
  mode: 'dry_run';
  plan_id: string;
  plan_hash: string;
  cache_roots: string[];
  keep_paths: string[];
  remove_candidates: UpdaterCacheCleanupCandidate[];
  remove_bytes: number;
  created_at: string;
};

export type UpdaterCacheCleanupReceipt = {
  schema: 'opl_updater_cache_cleanup_receipt.v1';
  dry_run_plan_id: string;
  cache_roots: string[];
  deleted_paths: string[];
  deleted_bytes: number;
  receipt_path: string;
  created_at: string;
};

type RuntimePointerPrunePlanInput = {
  runtimeRoot: string;
  pointerFileNames?: string[];
  now?: Date;
};

type LogRetentionPlanInput = {
  logsRoot: string;
  now?: Date;
  retainDays: number;
  retainFiles: number;
  maxTotalBytes: number;
};

type LocalDataLifecycleInventoryInput = {
  dataRoot: string;
  updaterCacheRoots?: string[];
  conversationRoots?: string[];
  runtimeRoot?: string;
  logsRoot?: string;
};

type ArchiveConversationArtifactsInput = {
  conversationId: string;
  sourcePaths: string[];
  archiveRoot: string;
  receiptRoot: string;
  now?: Date;
};

type DeleteArchivedConversationArtifactsInput = {
  archiveReceiptPath: string;
  receiptRoot: string;
  confirmation: string;
  now?: Date;
};

type ExecuteRuntimePointerPrunePlanInput = {
  plan: RuntimePointerPrunePlan;
  receiptRoot: string;
  planHash: string;
  now?: Date;
};

type ExecuteLogRetentionPlanInput = {
  plan: LogRetentionPlan;
  receiptRoot: string;
  planHash: string;
  now?: Date;
};

type UpdaterCacheCleanupPlanInput = {
  cacheRoots: string[];
  retiredCacheRoots?: string[];
  keepPaths?: string[];
  now?: Date;
};

type ExecuteUpdaterCacheCleanupPlanInput = {
  plan: UpdaterCacheCleanupDryRunPlan;
  receiptRoot: string;
  planHash: string;
  now?: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_POINTER_FILE_NAMES = ['current.json', 'rollback.json'];
const RUNTIME_METADATA_FILES = new Set(DEFAULT_POINTER_FILE_NAMES);
const UPDATE_PACKAGE_EXTENSIONS = new Set(['.zip', '.dmg', '.exe', '.deb']);
const UPDATE_PACKAGE_NAMES = new Set(['update.zip']);

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function fileSize(filePath: string): number {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) return 0;
    if (stat.isDirectory()) {
      return fs.readdirSync(filePath).reduce((total, entry) => total + fileSize(path.join(filePath, entry)), 0);
    }
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function inventoryRoot(rootPath: string): InventoryRoot {
  const exists = isDirectory(rootPath) || fs.existsSync(rootPath);
  return {
    path: rootPath,
    exists,
    bytes: exists ? fileSize(rootPath) : 0,
  };
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean).map((entry) => path.resolve(entry)))).sort();
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sha256Text(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function receiptFile(root: string, prefix: string, id: string): string {
  return path.join(root, `${prefix}-${id}.json`);
}

function hashPlan(value: unknown): string {
  return sha256Text(JSON.stringify(value));
}

function isSameOrInside(root: string, candidate: string): boolean {
  const relativePath = path.relative(path.resolve(root), path.resolve(candidate));
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function collectPointerPaths(runtimeRoot: string, pointerFileNames: string[]): string[] {
  const protectedPaths: string[] = [];
  for (const fileName of pointerFileNames) {
    const pointerPath = path.join(runtimeRoot, fileName);
    const pointer = readJsonRecord(pointerPath);
    if (fs.existsSync(pointerPath)) protectedPaths.push(pointerPath);
    for (const key of [
      'runtime_home',
      'previous_runtime_home',
      'rollback_runtime_home',
      'runtime_root',
      'root',
      'path',
    ]) {
      const rawPath = stringField(pointer, key);
      if (!rawPath) continue;
      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.join(runtimeRoot, rawPath);
      if (isSameOrInside(runtimeRoot, targetPath) && isDirectory(targetPath)) {
        protectedPaths.push(targetPath);
      }
    }
  }
  const currentAlias = path.join(runtimeRoot, 'current');
  if (isDirectory(currentAlias)) protectedPaths.push(currentAlias);
  return uniquePaths(protectedPaths);
}

function listRuntimeRootCandidates(runtimeRoot: string): string[] {
  if (!isDirectory(runtimeRoot)) return [];
  const topLevel = fs
    .readdirSync(runtimeRoot)
    .map((entry) => path.join(runtimeRoot, entry))
    .filter((entryPath) => isDirectory(entryPath));
  const stagedRoot = path.join(runtimeRoot, 'staged');
  const stagedVersions = isDirectory(stagedRoot)
    ? fs
        .readdirSync(stagedRoot)
        .map((entry) => path.join(stagedRoot, entry))
        .filter((entryPath) => isDirectory(entryPath))
    : [];
  return [...topLevel.filter((entryPath) => path.resolve(entryPath) !== path.resolve(stagedRoot)), ...stagedVersions];
}

function runtimeCandidateReason(runtimeRoot: string, candidatePath: string): RuntimePruneCandidate['reason'] {
  const relativePath = path.relative(runtimeRoot, candidatePath);
  return relativePath.startsWith(`staged${path.sep}`) ? 'unreferenced_staged_runtime' : 'unreferenced_runtime_root';
}

function collectLogFiles(root: string): Array<{ path: string; bytes: number; mtimeMs: number }> {
  if (!isDirectory(root)) return [];
  const results: Array<{ path: string; bytes: number; mtimeMs: number }> = [];
  const visit = (dirPath: string) => {
    for (const entry of fs.readdirSync(dirPath)) {
      const entryPath = path.join(dirPath, entry);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (stat.isFile() && path.extname(entryPath) === '.log') {
        results.push({ path: entryPath, bytes: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  };
  visit(root);
  return results.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path));
}

function firstLogRemovalReason(input: {
  file: { mtimeMs: number };
  index: number;
  accumulatedBytes: number;
  nowMs: number;
  retainDays: number;
  retainFiles: number;
  maxTotalBytes: number;
}): LogRetentionCandidate['reason'] | null {
  if (input.index < input.retainFiles) return null;
  if (input.nowMs - input.file.mtimeMs > input.retainDays * DAY_MS) return 'older_than_retention_days';
  if (input.accumulatedBytes > input.maxTotalBytes) return 'exceeds_total_log_bytes';
  return 'exceeds_retained_file_count';
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return [root];
  if (!stat.isDirectory()) return [];
  return fs
    .readdirSync(root)
    .flatMap((entry) => listFiles(path.join(root, entry)))
    .sort();
}

function archiveEntry(sourceRoot: string, filePath: string, archiveContentsRoot: string) {
  const relativePath = path.relative(sourceRoot, filePath);
  const targetPath = path.join(archiveContentsRoot, path.basename(sourceRoot), relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(filePath, targetPath);
  return {
    source_path: sourceRoot,
    relative_path: path.join(path.basename(sourceRoot), relativePath),
    bytes: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  };
}

function runtimePlanPayload(plan: RuntimePointerPrunePlan) {
  return {
    schema: plan.schema,
    mode: plan.mode,
    plan_id: plan.plan_id,
    runtime_root: plan.runtime_root,
    protected_paths: plan.protected_paths,
    remove_candidates: plan.remove_candidates,
    remove_bytes: plan.remove_bytes,
    created_at: plan.created_at,
  };
}

function logPlanPayload(plan: LogRetentionPlan) {
  return {
    schema: plan.schema,
    mode: plan.mode,
    plan_id: plan.plan_id,
    logs_root: plan.logs_root,
    keep_paths: plan.keep_paths,
    remove_candidates: plan.remove_candidates,
    remove_bytes: plan.remove_bytes,
    created_at: plan.created_at,
  };
}

function updaterPlanPayload(plan: UpdaterCacheCleanupDryRunPlan) {
  return {
    schema: plan.schema,
    mode: plan.mode,
    plan_id: plan.plan_id,
    cache_roots: plan.cache_roots,
    keep_paths: plan.keep_paths,
    remove_candidates: plan.remove_candidates,
    remove_bytes: plan.remove_bytes,
    created_at: plan.created_at,
  };
}

function isUpdatePackage(filePath: string): boolean {
  return UPDATE_PACKAGE_NAMES.has(path.basename(filePath)) || UPDATE_PACKAGE_EXTENSIONS.has(path.extname(filePath));
}

function isInsideAnyRoot(roots: string[], candidate: string): boolean {
  return roots.some((root) => isSameOrInside(root, candidate));
}

export function buildLocalDataLifecycleInventory(input: LocalDataLifecycleInventoryInput): LocalDataLifecycleInventory {
  const conversationRoots = input.conversationRoots?.length
    ? input.conversationRoots
    : [path.join(input.dataRoot, 'conversations')];
  const sectionInputs: Array<{
    id: LifecycleSectionId;
    cleanupMode: CleanupMode;
    silentDeleteAllowed: boolean;
    roots: string[];
  }> = [
    {
      id: 'updater_cache',
      cleanupMode: 'stale_installer_package_cleanup_allowed',
      silentDeleteAllowed: true,
      roots: input.updaterCacheRoots ?? [],
    },
    {
      id: 'conversation_artifacts',
      cleanupMode: 'archive_required_before_cleanup',
      silentDeleteAllowed: false,
      roots: conversationRoots,
    },
    {
      id: 'runtime_toolchain',
      cleanupMode: 'pointer_based_dry_run_required',
      silentDeleteAllowed: false,
      roots: input.runtimeRoot ? [input.runtimeRoot] : [],
    },
    {
      id: 'logs',
      cleanupMode: 'bounded_rotation_dry_run_required',
      silentDeleteAllowed: false,
      roots: input.logsRoot ? [input.logsRoot] : [],
    },
  ];

  const sections = sectionInputs.map((section) => {
    const roots = section.roots.map(inventoryRoot);
    return {
      id: section.id,
      cleanup_mode: section.cleanupMode,
      silent_delete_allowed: section.silentDeleteAllowed,
      roots,
      bytes: roots.reduce((total, root) => total + root.bytes, 0),
    } satisfies InventorySection;
  });

  return {
    schema: 'opl_local_data_lifecycle_inventory.v1',
    total_bytes: sections.reduce((total, section) => total + section.bytes, 0),
    sections,
  };
}

export function archiveConversationArtifacts(input: ArchiveConversationArtifactsInput): ConversationArchiveReceipt {
  const conversationId = input.conversationId.trim();
  if (!conversationId) throw new Error('Conversation id is required before archiving conversation artifacts.');
  const sourcePaths = uniquePaths(input.sourcePaths);
  if (sourcePaths.length === 0) throw new Error('At least one conversation source path is required before archive.');

  const createdAt = (input.now ?? new Date()).toISOString();
  const receiptId = sha256Text(`${conversationId}:${createdAt}:${sourcePaths.join('\n')}`).slice(0, 16);
  const archivePath = path.join(input.archiveRoot, `${conversationId}-${receiptId}`);
  const archiveContentsRoot = path.join(archivePath, 'contents');
  const manifestPath = path.join(archivePath, 'manifest.json');
  const restoreProbePath = path.join(archivePath, 'restore-probe.json');
  fs.mkdirSync(archiveContentsRoot, { recursive: true });

  const entries = sourcePaths.flatMap((sourcePath) =>
    listFiles(sourcePath).map((filePath) => archiveEntry(sourcePath, filePath, archiveContentsRoot))
  );
  const manifest = {
    schema: 'opl_conversation_archive_manifest.v1',
    conversation_id: conversationId,
    source_paths: sourcePaths,
    entries,
    created_at: createdAt,
  };
  writeJson(manifestPath, manifest);
  const archiveSha256 = sha256File(manifestPath);
  writeJson(restoreProbePath, {
    schema: 'opl_conversation_restore_probe.v1',
    conversation_id: conversationId,
    archive_sha256: archiveSha256,
    entry_count: entries.length,
    checked_at: createdAt,
  });

  const receiptPath = receiptFile(input.receiptRoot, 'conversation-archive', receiptId);
  const receipt: ConversationArchiveReceipt = {
    schema: 'opl_conversation_archive_receipt.v1',
    conversation_id: conversationId,
    source_paths: sourcePaths,
    archive_path: archivePath,
    archive_sha256: archiveSha256,
    manifest_path: manifestPath,
    restore_probe_path: restoreProbePath,
    receipt_path: receiptPath,
    created_at: createdAt,
  };
  writeJson(receiptPath, receipt);
  return receipt;
}

export function deleteArchivedConversationArtifacts(
  input: DeleteArchivedConversationArtifactsInput
): ConversationDeleteReceipt {
  if (!input.archiveReceiptPath || !fs.existsSync(input.archiveReceiptPath)) {
    throw new Error('Archive receipt is required before deleting conversation artifacts.');
  }
  const archiveReceipt = readJsonRecord(input.archiveReceiptPath) as ConversationArchiveReceipt | null;
  if (archiveReceipt?.schema !== 'opl_conversation_archive_receipt.v1') throw new Error('Archive receipt is invalid.');
  if (input.confirmation !== `delete:${archiveReceipt.conversation_id}`) {
    throw new Error('Explicit delete confirmation is required before deleting conversation artifacts.');
  }
  const manifest = readJsonRecord(archiveReceipt.manifest_path) as { source_paths?: string[] } | null;
  if (!manifest || sha256File(archiveReceipt.manifest_path) !== archiveReceipt.archive_sha256) {
    throw new Error('Archive manifest does not match its receipt.');
  }
  if (!fs.existsSync(archiveReceipt.restore_probe_path)) throw new Error('Archive restore proof is missing.');

  const deletedPaths: string[] = [];
  for (const sourcePath of uniquePaths(manifest.source_paths ?? [])) {
    if (!fs.existsSync(sourcePath)) continue;
    fs.rmSync(sourcePath, { recursive: true, force: false });
    deletedPaths.push(sourcePath);
  }
  const createdAt = (input.now ?? new Date()).toISOString();
  const receiptPath = receiptFile(
    input.receiptRoot,
    'conversation-delete',
    sha256Text(`${archiveReceipt.conversation_id}:${createdAt}`).slice(0, 16)
  );
  const receipt: ConversationDeleteReceipt = {
    schema: 'opl_conversation_delete_receipt.v1',
    conversation_id: archiveReceipt.conversation_id,
    deleted_paths: deletedPaths,
    archive_receipt_path: input.archiveReceiptPath,
    confirmed_at: createdAt,
    receipt_path: receiptPath,
    created_at: createdAt,
  };
  writeJson(receiptPath, receipt);
  return receipt;
}

export function resolveLogRetentionPlan(input: LogRetentionPlanInput): LogRetentionPlan {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const keepPaths: string[] = [];
  const removeCandidates: LogRetentionCandidate[] = [];
  let accumulatedBytes = 0;

  collectLogFiles(input.logsRoot).forEach((file, index) => {
    accumulatedBytes += file.bytes;
    const reason = firstLogRemovalReason({
      file,
      index,
      accumulatedBytes,
      nowMs,
      retainDays: input.retainDays,
      retainFiles: input.retainFiles,
      maxTotalBytes: input.maxTotalBytes,
    });
    if (reason) {
      removeCandidates.push({ path: file.path, bytes: file.bytes, reason });
      return;
    }
    keepPaths.push(file.path);
  });

  const payload = {
    schema: 'opl_log_retention_plan.v1' as const,
    mode: 'dry_run' as const,
    plan_id: crypto.randomUUID(),
    logs_root: input.logsRoot,
    keep_paths: keepPaths,
    remove_candidates: removeCandidates,
    remove_bytes: removeCandidates.reduce((total, candidate) => total + candidate.bytes, 0),
    created_at: now.toISOString(),
  };
  return { ...payload, plan_hash: hashPlan(payload) };
}

export function executeLogRetentionPlan(input: ExecuteLogRetentionPlanInput): LogRotationReceipt {
  if (hashPlan(logPlanPayload(input.plan)) !== input.plan.plan_hash) {
    throw new Error('Log rotation dry-run plan hash is invalid.');
  }
  if (input.planHash !== input.plan.plan_hash) {
    throw new Error('Matching dry-run plan hash is required before log rotation.');
  }
  const deletedPaths: string[] = [];
  let deletedBytes = 0;
  for (const candidate of input.plan.remove_candidates) {
    if (!isSameOrInside(input.plan.logs_root, candidate.path) || path.extname(candidate.path) !== '.log') {
      throw new Error('Log rotation can only delete .log files inside the logs root.');
    }
    if (!fs.existsSync(candidate.path)) continue;
    deletedBytes += fs.statSync(candidate.path).size;
    fs.rmSync(candidate.path, { force: false });
    deletedPaths.push(candidate.path);
  }
  const createdAt = (input.now ?? new Date()).toISOString();
  const receiptPath = receiptFile(input.receiptRoot, 'log-rotation', input.plan.plan_id);
  const receipt: LogRotationReceipt = {
    schema: 'opl_log_rotation_receipt.v1',
    logs_root: input.plan.logs_root,
    dry_run_plan_id: input.plan.plan_id,
    deleted_paths: deletedPaths,
    deleted_bytes: deletedBytes,
    receipt_path: receiptPath,
    created_at: createdAt,
  };
  writeJson(receiptPath, receipt);
  return receipt;
}

export function resolveRuntimePointerPrunePlan(input: RuntimePointerPrunePlanInput): RuntimePointerPrunePlan {
  const runtimeRoot = path.resolve(input.runtimeRoot);
  const protectedPaths = collectPointerPaths(runtimeRoot, input.pointerFileNames ?? DEFAULT_POINTER_FILE_NAMES);
  const protectedSet = new Set(protectedPaths.map((entry) => path.resolve(entry)));
  const removeCandidates = listRuntimeRootCandidates(runtimeRoot)
    .filter((candidate) => !protectedSet.has(path.resolve(candidate)))
    .filter((candidate) => !RUNTIME_METADATA_FILES.has(path.basename(candidate)))
    .map((candidate) => ({
      path: candidate,
      bytes: fileSize(candidate),
      reason: runtimeCandidateReason(runtimeRoot, candidate),
    }));
  const payload = {
    schema: 'opl_runtime_pointer_prune_plan.v1' as const,
    mode: 'dry_run' as const,
    plan_id: crypto.randomUUID(),
    runtime_root: runtimeRoot,
    protected_paths: protectedPaths,
    remove_candidates: removeCandidates,
    remove_bytes: removeCandidates.reduce((total, candidate) => total + candidate.bytes, 0),
    created_at: (input.now ?? new Date()).toISOString(),
  };
  return { ...payload, plan_hash: hashPlan(payload) };
}

export function executeRuntimePointerPrunePlan(input: ExecuteRuntimePointerPrunePlanInput): RuntimePointerPruneReceipt {
  if (hashPlan(runtimePlanPayload(input.plan)) !== input.plan.plan_hash) {
    throw new Error('Runtime prune dry-run plan hash is invalid.');
  }
  if (input.planHash !== input.plan.plan_hash) {
    throw new Error('Matching dry-run plan hash is required before runtime prune.');
  }
  const protectedSet = new Set(input.plan.protected_paths.map((entry) => path.resolve(entry)));
  const deletedPaths: string[] = [];
  let deletedBytes = 0;
  for (const candidate of input.plan.remove_candidates) {
    const resolvedCandidate = path.resolve(candidate.path);
    if (!isSameOrInside(input.plan.runtime_root, resolvedCandidate)) {
      throw new Error('Runtime prune can only delete paths inside the runtime root.');
    }
    if (protectedSet.has(resolvedCandidate)) throw new Error('Runtime prune dry-run plan contains a protected path.');
    if (!fs.existsSync(resolvedCandidate)) continue;
    deletedBytes += fileSize(resolvedCandidate);
    fs.rmSync(resolvedCandidate, { recursive: true, force: false });
    deletedPaths.push(resolvedCandidate);
  }
  const createdAt = (input.now ?? new Date()).toISOString();
  const receiptPath = receiptFile(input.receiptRoot, 'runtime-prune', input.plan.plan_id);
  const receipt: RuntimePointerPruneReceipt = {
    schema: 'opl_runtime_pointer_prune_receipt.v1',
    runtime_root: input.plan.runtime_root,
    dry_run_plan_id: input.plan.plan_id,
    protected_paths: input.plan.protected_paths,
    deleted_paths: deletedPaths,
    deleted_bytes: deletedBytes,
    receipt_path: receiptPath,
    created_at: createdAt,
  };
  writeJson(receiptPath, receipt);
  return receipt;
}

export function resolveUpdaterCacheCleanupDryRunPlan(
  input: UpdaterCacheCleanupPlanInput
): UpdaterCacheCleanupDryRunPlan {
  const currentPlans = input.cacheRoots.map((cacheRoot) =>
    resolveAutoUpdateCacheCleanupPlan({ cacheRoot, keepPaths: input.keepPaths, protectPendingPackages: true })
  );
  const retiredPlans = (input.retiredCacheRoots ?? []).map((cacheRoot) =>
    resolveAutoUpdateCacheCleanupPlan({ cacheRoot, protectPendingPackages: false })
  );
  const plans = [...currentPlans, ...retiredPlans];
  const removeCandidates = plans.flatMap((plan) =>
    plan.removePaths.map((removePath) => ({
      path: removePath,
      bytes: fileSize(removePath),
      reason: 'stale_installer_package' as const,
    }))
  );
  const payload = {
    schema: 'opl_updater_cache_cleanup_plan.v1' as const,
    mode: 'dry_run' as const,
    plan_id: crypto.randomUUID(),
    cache_roots: plans.map((plan) => plan.cacheRoot),
    keep_paths: uniquePaths(plans.flatMap((plan) => plan.keepPaths)),
    remove_candidates: removeCandidates,
    remove_bytes: removeCandidates.reduce((total, candidate) => total + candidate.bytes, 0),
    created_at: (input.now ?? new Date()).toISOString(),
  };
  return { ...payload, plan_hash: hashPlan(payload) };
}

export function executeUpdaterCacheCleanupPlan(input: ExecuteUpdaterCacheCleanupPlanInput): UpdaterCacheCleanupReceipt {
  if (hashPlan(updaterPlanPayload(input.plan)) !== input.plan.plan_hash) {
    throw new Error('Updater cache cleanup dry-run plan hash is invalid.');
  }
  if (input.planHash !== input.plan.plan_hash) {
    throw new Error('Matching dry-run plan hash is required before updater cache cleanup.');
  }
  const deletedPaths: string[] = [];
  let deletedBytes = 0;
  for (const candidate of input.plan.remove_candidates) {
    const resolvedCandidate = path.resolve(candidate.path);
    if (!isInsideAnyRoot(input.plan.cache_roots, resolvedCandidate) || !isUpdatePackage(resolvedCandidate)) {
      throw new Error('Updater cache cleanup can only delete installer packages inside declared cache roots.');
    }
    if (!fs.existsSync(resolvedCandidate)) continue;
    deletedBytes += fs.statSync(resolvedCandidate).size;
    fs.rmSync(resolvedCandidate, { force: false });
    deletedPaths.push(resolvedCandidate);
  }
  const createdAt = (input.now ?? new Date()).toISOString();
  const receiptPath = receiptFile(input.receiptRoot, 'updater-cache-cleanup', input.plan.plan_id);
  const receipt: UpdaterCacheCleanupReceipt = {
    schema: 'opl_updater_cache_cleanup_receipt.v1',
    dry_run_plan_id: input.plan.plan_id,
    cache_roots: input.plan.cache_roots,
    deleted_paths: uniquePaths(deletedPaths),
    deleted_bytes: deletedBytes,
    receipt_path: receiptPath,
    created_at: createdAt,
  };
  writeJson(receiptPath, receipt);
  return receipt;
}

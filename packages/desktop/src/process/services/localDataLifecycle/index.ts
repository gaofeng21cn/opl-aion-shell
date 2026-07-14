/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveAutoUpdateCacheCleanupPlan } from '../autoUpdateCacheCleanup';

type LifecycleSectionId = 'updater_cache' | 'user_data_artifacts' | 'runtime_substrate' | 'logs';
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

export type ConversationRestoreReceipt = {
  schema: 'opl_conversation_restore_receipt.v1';
  conversation_id: string;
  restored_paths: string[];
  archive_receipt_path: string;
  archive_sha256: string;
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
  pointer_file_names?: string[];
  authority_state?: 'ready' | 'blocked';
  blocked_reason?: string | null;
  candidate_marker?: '.opl-full-runtime-installed.json';
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

export type LocalDataLifecycleInventoryInput = {
  dataRoot: string;
  updaterCacheRoots?: string[];
  conversationRoots?: string[];
  runtimeRoots?: string[];
  logsRoot?: string;
};

type ArchiveConversationArtifactsInput = {
  conversationId: string;
  sourcePaths: string[];
  archiveRoot: string;
  receiptRoot: string;
  now?: Date;
};

type VerifyConversationArchiveReceiptInput = {
  archiveReceiptPath: string;
  archiveRoot: string;
  receiptRoot: string;
  allowedSourcePaths: string[];
};

type DeleteArchivedConversationArtifactsInput = VerifyConversationArchiveReceiptInput & {
  confirmation: string;
  now?: Date;
};

type RestoreConversationArchiveArtifactsInput = VerifyConversationArchiveReceiptInput & {
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
const RUNTIME_INSTALL_MARKER = '.opl-full-runtime-installed.json';
const RUNTIME_RESERVED_ROOT_NAMES = new Set(['current', 'previous', 'toolcache', 'generations', 'staged']);
const UPDATE_PACKAGE_EXTENSIONS = new Set(['.zip', '.dmg', '.exe', '.deb']);
const UPDATE_PACKAGE_NAMES = new Set(['update.zip']);

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isPlainDirectory(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isPlainFile(filePath: string): boolean {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
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

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  let linked = false;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.linkSync(temporaryPath, filePath);
    linked = true;
    fs.unlinkSync(temporaryPath);
  } catch (error) {
    if (linked) fs.rmSync(filePath, { force: true });
    throw error;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
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

function requirePathInsidePlainRoot(rootPath: string, candidatePath: string, label: string): void {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedCandidate = path.resolve(candidatePath);
  if (!isSameOrInside(normalizedRoot, normalizedCandidate) || normalizedRoot === normalizedCandidate) {
    throw new Error(`${label} is outside its managed root.`);
  }
  if (!isPlainDirectory(normalizedRoot)) {
    throw new Error(`${label} root is missing, invalid, or symlinked.`);
  }
  const relativePath = path.relative(normalizedRoot, normalizedCandidate);
  let currentPath = normalizedRoot;
  for (const segment of relativePath.split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(currentPath);
    } catch (error) {
      throw new Error(`${label} is missing or unreadable.`, { cause: error });
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} must not traverse a symbolic link.`);
  }
}

function collectPointerPaths(runtimeRoot: string, pointerFileNames: string[]): string[] {
  const protectedPaths: string[] = [];
  for (const fileName of pointerFileNames) {
    const pointerPath = path.join(runtimeRoot, fileName);
    const pointer = readJsonRecord(pointerPath);
    if (isPlainFile(pointerPath)) protectedPaths.push(pointerPath);
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
      if (isSameOrInside(runtimeRoot, targetPath) && isPlainDirectory(targetPath)) {
        protectedPaths.push(targetPath);
      }
    }
  }
  for (const rootName of RUNTIME_RESERVED_ROOT_NAMES) {
    const reservedRoot = path.join(runtimeRoot, rootName);
    if (isPlainDirectory(reservedRoot)) protectedPaths.push(reservedRoot);
  }
  return uniquePaths(protectedPaths);
}

function resolveRuntimePruneAuthority(
  runtimeRoot: string,
  pointerFileNames: string[]
): { state: 'ready' | 'blocked'; blockedReason: string | null; protectedPaths: string[] } {
  const protectedPaths = collectPointerPaths(runtimeRoot, pointerFileNames);
  if (!isPlainDirectory(runtimeRoot)) {
    return { state: 'blocked', blockedReason: 'managed_runtime_root_missing_or_symlinked', protectedPaths };
  }
  const currentPointerPath = path.join(runtimeRoot, 'current.json');
  const currentPointer = readJsonRecord(currentPointerPath);
  const currentRuntimeValue = stringField(currentPointer, 'runtime_home');
  if (!isPlainFile(currentPointerPath) || !currentRuntimeValue) {
    return { state: 'blocked', blockedReason: 'current_runtime_pointer_missing_or_invalid', protectedPaths };
  }
  const currentRuntimePath = path.isAbsolute(currentRuntimeValue)
    ? path.resolve(currentRuntimeValue)
    : path.resolve(runtimeRoot, currentRuntimeValue);
  if (!isSameOrInside(runtimeRoot, currentRuntimePath) || !isPlainDirectory(currentRuntimePath)) {
    return { state: 'blocked', blockedReason: 'current_runtime_pointer_target_is_not_a_managed_root', protectedPaths };
  }
  if (!isPlainFile(path.join(currentRuntimePath, RUNTIME_INSTALL_MARKER))) {
    return { state: 'blocked', blockedReason: 'current_runtime_install_marker_missing', protectedPaths };
  }
  return { state: 'ready', blockedReason: null, protectedPaths };
}

function isRuntimeGenerationRoot(candidatePath: string): boolean {
  return isPlainDirectory(candidatePath) && isPlainFile(path.join(candidatePath, RUNTIME_INSTALL_MARKER));
}

function listRuntimeRootCandidates(runtimeRoot: string): string[] {
  if (!isPlainDirectory(runtimeRoot)) return [];
  const topLevel = fs
    .readdirSync(runtimeRoot)
    .map((entry) => path.join(runtimeRoot, entry))
    .filter((entryPath) => isRuntimeGenerationRoot(entryPath))
    .filter((entryPath) => !RUNTIME_RESERVED_ROOT_NAMES.has(path.basename(entryPath)));
  const stagedRoot = path.join(runtimeRoot, 'staged');
  const stagedVersions = isPlainDirectory(stagedRoot)
    ? fs
        .readdirSync(stagedRoot)
        .map((entry) => path.join(stagedRoot, entry))
        .filter((entryPath) => isRuntimeGenerationRoot(entryPath))
    : [];
  return [...topLevel, ...stagedVersions];
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

type ConversationArchiveManifestEntry = {
  source_path: string;
  relative_path: string;
  bytes: number;
  sha256: string;
};

type VerifiedConversationArchiveEntry = ConversationArchiveManifestEntry & {
  archive_file_path: string;
  target_path: string;
  relative_target_path: string;
};

type VerifiedConversationArchive = {
  receipt: ConversationArchiveReceipt;
  entries: VerifiedConversationArchiveEntry[];
};

function pathEntryExists(filePath: string): boolean {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid.`);
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string, label: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as string[];
}

function requireRegularFile(filePath: string, label: string): void {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is invalid.`);
  } catch (error) {
    if (error instanceof Error && error.message === `${label} is invalid.`) throw error;
    throw new Error(`${label} is missing or unreadable.`, { cause: error });
  }
}

function requireAbsolutePath(record: Record<string, unknown>, key: string, label: string): string {
  const value = requireString(record, key, label);
  if (!path.isAbsolute(value)) throw new Error(`${label} must be absolute.`);
  return path.normalize(value);
}

function samePaths(left: string[], right: string[]): boolean {
  const normalizedLeft = uniquePaths(left);
  const normalizedRight = uniquePaths(right);
  return (
    normalizedLeft.length === left.length &&
    normalizedRight.length === right.length &&
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((entry, index) => entry === normalizedRight[index])
  );
}

function validateManifestEntry(
  rawEntry: unknown,
  sourcePaths: string[],
  archiveContentsRoot: string
): VerifiedConversationArchiveEntry {
  if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
    throw new Error('Archive manifest contains an invalid entry.');
  }
  const record = rawEntry as Record<string, unknown>;
  const sourcePath = requireAbsolutePath(record, 'source_path', 'Archive entry source path');
  if (!sourcePaths.includes(sourcePath)) throw new Error('Archive entry source path is not declared by the receipt.');

  const relativePath = requireString(record, 'relative_path', 'Archive entry relative path');
  const normalizedRelativePath = path.normalize(relativePath);
  if (
    path.isAbsolute(relativePath) ||
    normalizedRelativePath !== relativePath ||
    normalizedRelativePath === '..' ||
    normalizedRelativePath.startsWith(`..${path.sep}`)
  ) {
    throw new Error('Archive entry relative path escapes the archive contents root.');
  }

  const sourceBaseName = path.basename(sourcePath);
  const relativeTargetPath = path.relative(sourceBaseName, normalizedRelativePath);
  if (
    !sourceBaseName ||
    relativeTargetPath === '..' ||
    relativeTargetPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTargetPath)
  ) {
    throw new Error('Archive entry does not map to its declared source path.');
  }

  const bytes = record.bytes;
  const sha256 = record.sha256;
  if (!Number.isSafeInteger(bytes) || (bytes as number) < 0) throw new Error('Archive entry byte count is invalid.');
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error('Archive entry hash is invalid.');
  }

  const archiveFilePath = path.resolve(archiveContentsRoot, normalizedRelativePath);
  if (!isSameOrInside(archiveContentsRoot, archiveFilePath)) {
    throw new Error('Archive entry escapes the archive contents root.');
  }
  requirePathInsidePlainRoot(archiveContentsRoot, archiveFilePath, 'Archived file');
  requireRegularFile(archiveFilePath, 'Archived file');
  const archivedFileSize = fs.statSync(archiveFilePath).size;
  if (archivedFileSize !== bytes || sha256File(archiveFilePath) !== sha256) {
    throw new Error(`Archived file integrity check failed: ${archiveFilePath}`);
  }

  const targetPath = relativeTargetPath ? path.join(sourcePath, relativeTargetPath) : sourcePath;
  if (!isSameOrInside(sourcePath, targetPath)) throw new Error('Archive entry target escapes its source path.');
  return {
    source_path: sourcePath,
    relative_path: normalizedRelativePath,
    bytes,
    sha256,
    archive_file_path: archiveFilePath,
    target_path: targetPath,
    relative_target_path: relativeTargetPath,
  };
}

function verifyConversationArchive(input: VerifyConversationArchiveReceiptInput): VerifiedConversationArchive {
  const archiveReceiptPath = path.resolve(input.archiveReceiptPath);
  const normalizedReceiptRoot = path.resolve(input.receiptRoot);
  const normalizedArchiveRoot = path.resolve(input.archiveRoot);
  if (!isSameOrInside(normalizedReceiptRoot, archiveReceiptPath) || archiveReceiptPath === normalizedReceiptRoot) {
    throw new Error('Archive receipt is outside the local data lifecycle receipt directory.');
  }
  requirePathInsidePlainRoot(normalizedReceiptRoot, archiveReceiptPath, 'Archive receipt');
  requireRegularFile(archiveReceiptPath, 'Archive receipt');

  const receiptRecord = readJsonRecord(archiveReceiptPath);
  if (receiptRecord?.schema !== 'opl_conversation_archive_receipt.v1') throw new Error('Archive receipt is invalid.');
  const receiptPath = requireAbsolutePath(receiptRecord, 'receipt_path', 'Archive receipt path');
  const archivePath = requireAbsolutePath(receiptRecord, 'archive_path', 'Archive path');
  const manifestPath = requireAbsolutePath(receiptRecord, 'manifest_path', 'Archive manifest path');
  const restoreProbePath = requireAbsolutePath(receiptRecord, 'restore_probe_path', 'Archive restore probe path');
  const archiveSha256 = requireString(receiptRecord, 'archive_sha256', 'Archive manifest hash');
  const conversationId = requireString(receiptRecord, 'conversation_id', 'Archive conversation id');
  const createdAt = requireString(receiptRecord, 'created_at', 'Archive receipt timestamp');
  const receiptSourcePaths = requireStringArray(receiptRecord, 'source_paths', 'Archive receipt source paths');
  if (receiptSourcePaths.some((entry) => !path.isAbsolute(entry))) {
    throw new Error('Archive receipt source paths must be absolute.');
  }
  if (receiptPath !== archiveReceiptPath) throw new Error('Archive receipt path does not match the requested receipt.');
  if (!isSameOrInside(normalizedArchiveRoot, archivePath) || archivePath === normalizedArchiveRoot) {
    throw new Error('Archive path is outside the local data lifecycle archive directory.');
  }
  requirePathInsidePlainRoot(normalizedArchiveRoot, archivePath, 'Archive path');
  if (manifestPath !== path.join(archivePath, 'manifest.json')) {
    throw new Error('Archive manifest path does not match the archive receipt.');
  }
  if (restoreProbePath !== path.join(archivePath, 'restore-probe.json')) {
    throw new Error('Archive restore probe path does not match the archive receipt.');
  }
  if (!/^[a-f0-9]{64}$/.test(archiveSha256)) throw new Error('Archive manifest hash is invalid.');
  if (uniquePaths(receiptSourcePaths).length !== receiptSourcePaths.length) {
    throw new Error('Archive receipt source paths are invalid.');
  }
  const allowedSourcePaths = uniquePaths(input.allowedSourcePaths);
  if (allowedSourcePaths.length === 0 || !samePaths(receiptSourcePaths, allowedSourcePaths)) {
    throw new Error('Archive receipt source paths do not match the current conversation data roots.');
  }

  requireRegularFile(manifestPath, 'Archive manifest');
  if (sha256File(manifestPath) !== archiveSha256) throw new Error('Archive manifest hash does not match its receipt.');
  const manifest = readJsonRecord(manifestPath);
  if (manifest?.schema !== 'opl_conversation_archive_manifest.v1') throw new Error('Archive manifest is invalid.');
  if (requireString(manifest, 'conversation_id', 'Archive manifest conversation id') !== conversationId) {
    throw new Error('Archive manifest conversation id does not match its receipt.');
  }
  if (requireString(manifest, 'created_at', 'Archive manifest timestamp') !== createdAt) {
    throw new Error('Archive manifest timestamp does not match its receipt.');
  }
  const manifestSourcePaths = requireStringArray(manifest, 'source_paths', 'Archive manifest source paths');
  if (manifestSourcePaths.some((entry) => !path.isAbsolute(entry))) {
    throw new Error('Archive manifest source paths must be absolute.');
  }
  if (!samePaths(receiptSourcePaths, manifestSourcePaths)) {
    throw new Error('Archive manifest source paths do not match its receipt.');
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error('Archive manifest has no restorable file entries.');
  }

  requireRegularFile(restoreProbePath, 'Archive restore probe');
  const restoreProbe = readJsonRecord(restoreProbePath);
  if (restoreProbe?.schema !== 'opl_conversation_restore_probe.v1')
    throw new Error('Archive restore probe is invalid.');
  if (
    requireString(restoreProbe, 'conversation_id', 'Archive restore probe conversation id') !== conversationId ||
    requireString(restoreProbe, 'archive_sha256', 'Archive restore probe hash') !== archiveSha256 ||
    requireString(restoreProbe, 'checked_at', 'Archive restore probe timestamp') !== createdAt ||
    restoreProbe.entry_count !== manifest.entries.length
  ) {
    throw new Error('Archive restore probe does not match the receipt and manifest.');
  }

  const archiveContentsRoot = path.join(archivePath, 'contents');
  const entries = manifest.entries.map((entry) =>
    validateManifestEntry(entry, uniquePaths(receiptSourcePaths), archiveContentsRoot)
  );
  const targetPaths = entries.map((entry) => path.resolve(entry.target_path));
  const archiveFilePaths = entries.map((entry) => path.resolve(entry.archive_file_path));
  if (new Set(targetPaths).size !== targetPaths.length || new Set(archiveFilePaths).size !== archiveFilePaths.length) {
    throw new Error('Archive manifest contains duplicate file entries.');
  }

  return {
    receipt: {
      schema: 'opl_conversation_archive_receipt.v1',
      conversation_id: conversationId,
      source_paths: uniquePaths(receiptSourcePaths),
      archive_path: archivePath,
      archive_sha256: archiveSha256,
      manifest_path: manifestPath,
      restore_probe_path: restoreProbePath,
      receipt_path: receiptPath,
      created_at: createdAt,
    },
    entries,
  };
}

function requireAvailableTarget(targetPath: string): void {
  if (pathEntryExists(targetPath)) {
    throw new Error(
      `Restore stopped because the target already exists: ${targetPath}. Existing files were not changed.`
    );
  }
  let currentPath = path.dirname(targetPath);
  while (!pathEntryExists(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) throw new Error(`Restore target parent is unavailable: ${targetPath}`);
    currentPath = parentPath;
  }
  const stat = fs.lstatSync(currentPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Restore stopped because a target parent is not a directory: ${currentPath}`);
  }
}

function ensureTargetDirectory(directoryPath: string, createdDirectories: string[]): void {
  const missingDirectories: string[] = [];
  let currentPath = directoryPath;
  while (!pathEntryExists(currentPath)) {
    missingDirectories.push(currentPath);
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) throw new Error(`Restore target directory is unavailable: ${directoryPath}`);
    currentPath = parentPath;
  }
  const stat = fs.lstatSync(currentPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Restore target parent is not a directory: ${currentPath}`);
  }
  for (const missingDirectory of missingDirectories.toReversed()) {
    fs.mkdirSync(missingDirectory);
    createdDirectories.push(missingDirectory);
  }
}

function nearestExistingDirectory(targetPath: string): string {
  let currentPath = path.dirname(targetPath);
  while (!pathEntryExists(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) throw new Error(`Restore staging directory is unavailable for: ${targetPath}`);
    currentPath = parentPath;
  }
  const stat = fs.lstatSync(currentPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Restore staging parent is not a directory: ${currentPath}`);
  }
  return currentPath;
}

function commitStagedFileWithoutOverwrite(stagedPath: string, targetPath: string): void {
  try {
    fs.linkSync(stagedPath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Restore stopped because the target already exists: ${targetPath}. Existing files were not changed.`,
        { cause: error }
      );
    }
    throw error;
  }
}

function runtimePlanPayload(plan: RuntimePointerPrunePlan) {
  return {
    schema: plan.schema,
    mode: plan.mode,
    plan_id: plan.plan_id,
    runtime_root: plan.runtime_root,
    pointer_file_names: plan.pointer_file_names,
    authority_state: plan.authority_state,
    blocked_reason: plan.blocked_reason,
    candidate_marker: plan.candidate_marker,
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
      id: 'user_data_artifacts',
      cleanupMode: 'archive_required_before_cleanup',
      silentDeleteAllowed: false,
      roots: conversationRoots,
    },
    {
      id: 'runtime_substrate',
      cleanupMode: 'pointer_based_dry_run_required',
      silentDeleteAllowed: false,
      roots: uniquePaths(input.runtimeRoots ?? []),
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

export function verifyConversationArchiveReceipt(
  input: VerifyConversationArchiveReceiptInput
): ConversationArchiveReceipt {
  return verifyConversationArchive(input).receipt;
}

export function restoreConversationArchiveArtifacts(
  input: RestoreConversationArchiveArtifactsInput
): ConversationRestoreReceipt {
  const verifiedArchive = verifyConversationArchive(input);
  for (const entry of verifiedArchive.entries) requireAvailableTarget(entry.target_path);

  const restoreId = crypto.randomUUID();
  const stagingRoots = new Map<string, string>();
  const stagedEntries: Array<VerifiedConversationArchiveEntry & { staged_path: string }> = [];
  const committedPaths: string[] = [];
  const createdDirectories: string[] = [];

  try {
    for (const entry of verifiedArchive.entries) {
      let stagingRoot = stagingRoots.get(entry.source_path);
      if (!stagingRoot) {
        const stagingParent = nearestExistingDirectory(entry.source_path);
        stagingRoot = fs.mkdtempSync(
          path.join(stagingParent, `.${path.basename(entry.source_path)}.opl-restore-${restoreId}-`)
        );
        stagingRoots.set(entry.source_path, stagingRoot);
      }
      const stagedPath = path.join(stagingRoot, entry.relative_target_path || '__opl_root_file__');
      fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
      fs.copyFileSync(entry.archive_file_path, stagedPath, fs.constants.COPYFILE_EXCL);
      if (fs.statSync(stagedPath).size !== entry.bytes || sha256File(stagedPath) !== entry.sha256) {
        throw new Error(`Restore staging integrity check failed: ${entry.target_path}`);
      }
      stagedEntries.push({ ...entry, staged_path: stagedPath });
    }

    for (const entry of stagedEntries) {
      requireAvailableTarget(entry.target_path);
      ensureTargetDirectory(path.dirname(entry.target_path), createdDirectories);
      requireAvailableTarget(entry.target_path);
      commitStagedFileWithoutOverwrite(entry.staged_path, entry.target_path);
      committedPaths.push(entry.target_path);
      fs.unlinkSync(entry.staged_path);
    }

    const createdAt = (input.now ?? new Date()).toISOString();
    const receiptPath = receiptFile(input.receiptRoot, 'conversation-restore', restoreId);
    const receipt: ConversationRestoreReceipt = {
      schema: 'opl_conversation_restore_receipt.v1',
      conversation_id: verifiedArchive.receipt.conversation_id,
      restored_paths: [...committedPaths],
      archive_receipt_path: verifiedArchive.receipt.receipt_path,
      archive_sha256: verifiedArchive.receipt.archive_sha256,
      receipt_path: receiptPath,
      created_at: createdAt,
    };
    writeJsonAtomic(receiptPath, receipt);
    return receipt;
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const committedPath of committedPaths.toReversed()) {
      try {
        fs.rmSync(committedPath, { force: false });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    for (const createdDirectory of createdDirectories.toReversed()) {
      try {
        fs.rmdirSync(createdDirectory);
      } catch (rollbackError) {
        if (pathEntryExists(createdDirectory)) {
          rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
        }
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`Restore failed and rollback was incomplete: ${message}. ${rollbackErrors.join(' ')}`, {
        cause: error,
      });
    }
    throw new Error(`Restore failed; archived files were rolled back: ${message}`, { cause: error });
  } finally {
    for (const stagingRoot of stagingRoots.values()) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
  }
}

export function deleteArchivedConversationArtifacts(
  input: DeleteArchivedConversationArtifactsInput
): ConversationDeleteReceipt {
  const archiveReceipt = verifyConversationArchiveReceipt(input);
  if (input.confirmation !== `delete:${archiveReceipt.conversation_id}`) {
    throw new Error('Explicit delete confirmation is required before deleting conversation artifacts.');
  }

  const sourcePathsToDelete = archiveReceipt.source_paths.filter((sourcePath) => pathEntryExists(sourcePath));
  for (const sourcePath of sourcePathsToDelete) {
    if (!isPlainDirectory(sourcePath) && !isPlainFile(sourcePath)) {
      throw new Error(`Conversation source path is invalid or symlinked: ${sourcePath}`);
    }
  }

  const deletedPaths: string[] = [];
  for (const sourcePath of sourcePathsToDelete) {
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
    archive_receipt_path: archiveReceipt.receipt_path,
    confirmed_at: createdAt,
    receipt_path: receiptPath,
    created_at: createdAt,
  };
  writeJsonAtomic(receiptPath, receipt);
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
  const pointerFileNames = [...(input.pointerFileNames ?? DEFAULT_POINTER_FILE_NAMES)];
  const authority = resolveRuntimePruneAuthority(runtimeRoot, pointerFileNames);
  const protectedSet = new Set(authority.protectedPaths.map((entry) => path.resolve(entry)));
  const removeCandidates =
    authority.state === 'ready'
      ? listRuntimeRootCandidates(runtimeRoot)
          .filter((candidate) => !protectedSet.has(path.resolve(candidate)))
          .map((candidate) => ({
            path: candidate,
            bytes: fileSize(candidate),
            reason: runtimeCandidateReason(runtimeRoot, candidate),
          }))
      : [];
  const payload = {
    schema: 'opl_runtime_pointer_prune_plan.v1' as const,
    mode: 'dry_run' as const,
    plan_id: crypto.randomUUID(),
    runtime_root: runtimeRoot,
    pointer_file_names: pointerFileNames,
    authority_state: authority.state,
    blocked_reason: authority.blockedReason,
    candidate_marker: RUNTIME_INSTALL_MARKER as '.opl-full-runtime-installed.json',
    protected_paths: authority.protectedPaths,
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
  if (input.plan.authority_state !== 'ready') {
    throw new Error(
      `Runtime prune is blocked: ${input.plan.blocked_reason ?? 'managed runtime authority is unavailable'}.`
    );
  }
  if (input.plan.candidate_marker !== RUNTIME_INSTALL_MARKER) {
    throw new Error('Runtime prune is blocked: managed runtime candidate marker is missing or invalid.');
  }
  const liveAuthority = resolveRuntimePruneAuthority(
    input.plan.runtime_root,
    input.plan.pointer_file_names ?? DEFAULT_POINTER_FILE_NAMES
  );
  if (liveAuthority.state !== 'ready' || !samePaths(liveAuthority.protectedPaths, input.plan.protected_paths)) {
    throw new Error('Runtime prune authority changed after the dry-run plan; create a fresh plan.');
  }
  const protectedSet = new Set(input.plan.protected_paths.map((entry) => path.resolve(entry)));
  const liveCandidateSet = new Set(
    listRuntimeRootCandidates(input.plan.runtime_root).map((entry) => path.resolve(entry))
  );
  const deletedPaths: string[] = [];
  let deletedBytes = 0;
  for (const candidate of input.plan.remove_candidates) {
    const resolvedCandidate = path.resolve(candidate.path);
    if (!isSameOrInside(input.plan.runtime_root, resolvedCandidate)) {
      throw new Error('Runtime prune can only delete paths inside the runtime root.');
    }
    if (protectedSet.has(resolvedCandidate)) throw new Error('Runtime prune dry-run plan contains a protected path.');
    if (!fs.existsSync(resolvedCandidate)) continue;
    if (!liveCandidateSet.has(resolvedCandidate) || !isRuntimeGenerationRoot(resolvedCandidate)) {
      throw new Error('Runtime prune candidate is no longer a verified managed runtime generation.');
    }
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

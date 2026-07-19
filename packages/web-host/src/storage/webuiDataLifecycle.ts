import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { WebuiDataLifecycleHostConfig, WebuiDataLifecycleManagedRoot } from '../types.js';

export const WEBUI_DATA_LIFECYCLE_CAPABILITY_ID = 'carrier_host.storage.webui_data_volume.lifecycle' as const;
export const WEBUI_DATA_LIFECYCLE_PLAN_ACTION_ID = 'settings_plan_webui_data_volume_cleanup' as const;
export const WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID = 'settings_execute_webui_data_volume_cleanup' as const;
export const WEBUI_DATA_LIFECYCLE_RESTORE_ACTION_ID = 'settings_restore_webui_data_volume_cleanup' as const;

const DEFAULT_PLAN_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 20_000;
const DEFAULT_MAX_SCANNED_BYTES = 512 * 1024 * 1024;
const DEFAULT_SCAN_DEADLINE_MS = 3_000;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const COPY_BUFFER_BYTES = 64 * 1024;
const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;

type PlanFile = {
  root_id: string;
  relative_path: string;
  bytes: number;
  mtime_ms: number;
  sha256: string;
  dev: number;
  ino: number;
};

type StoredPlan = {
  plan_id: string;
  plan_hash: string;
  exact_confirmation: string;
  created_at: string;
  expires_at: string;
  files: PlanFile[];
  used: boolean;
  completed_response?: WebuiDataLifecycleExecuteResponse;
};

type ArchiveManifestFile = {
  root_id: string;
  relative_path: string;
  bytes: number;
  sha256: string;
  archive_relative_path: string;
  archive_sha256: string;
};

type ArchiveManifest = {
  schema: 'opl_webui_data_volume_archive_manifest.v1';
  receipt_id: string;
  plan_id: string;
  plan_hash: string;
  created_at: string;
  files: ArchiveManifestFile[];
};

type PersistedReceipt = {
  schema: 'opl_webui_data_volume_cleanup_receipt.v1';
  receipt_id: string;
  action_id: typeof WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID;
  status: 'archived' | 'completed' | 'recovery_required' | 'restored';
  plan_id: string;
  plan_hash: string;
  archive_manifest_sha256: string;
  archived_bytes: number;
  deleted_bytes: number;
  created_at: string;
  restored_at?: string;
};

export type WebuiDataLifecycleCapability = {
  schema: 'opl_webui_data_volume_lifecycle_capability.v1';
  capability_id: typeof WEBUI_DATA_LIFECYCLE_CAPABILITY_ID;
  endpoint_status: 'available';
  endpoint_availability: 'host_owner_injected';
  plan_action_id: typeof WEBUI_DATA_LIFECYCLE_PLAN_ACTION_ID;
  execute_action_id: typeof WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID;
  restore_action_id: typeof WEBUI_DATA_LIFECYCLE_RESTORE_ACTION_ID;
  raw_path_transport_allowed: false;
};

export type WebuiDataLifecyclePlanResponse = {
  schema: 'opl_webui_data_volume_cleanup_plan.v1';
  action_id: typeof WEBUI_DATA_LIFECYCLE_PLAN_ACTION_ID;
  plan_id: string;
  plan_hash: string;
  exact_confirmation: string;
  estimated_reclaimable_bytes: number;
  candidate_count: number;
  restore_supported: true;
  observed_at: string;
  expires_at: string;
};

export type WebuiDataLifecycleExecuteRequest = {
  plan_id: string;
  plan_hash: string;
  exact_confirmation: string;
};

export type WebuiDataLifecycleRestoreRequest = {
  receipt_ref: string;
};

export type WebuiDataLifecycleReadback = {
  status: 'ready';
  terminal: true;
  observed_at: string;
  bytes: number | null;
  reclaimable_bytes: number | null;
  receipt_ref: string;
  restore_status: 'available' | 'restored';
};

export type WebuiDataLifecycleExecuteResponse = {
  schema: 'opl_webui_data_volume_cleanup_receipt.v1';
  receipt_id: string;
  action_id: typeof WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID;
  status: 'completed';
  plan_id: string;
  plan_hash: string;
  receipt_ref: string;
  restore_action_ref: string;
  archive_ref: string;
  archive_manifest_ref: string;
  archive_sha256: string;
  archived_bytes: number;
  deleted_bytes: number;
  readback: WebuiDataLifecycleReadback;
};

export type WebuiDataLifecycleRestoreResponse = {
  schema: 'opl_webui_data_volume_restore_receipt.v1';
  action_id: typeof WEBUI_DATA_LIFECYCLE_RESTORE_ACTION_ID;
  status: 'completed';
  receipt_ref: string;
  restore_receipt_ref: string;
  restored_bytes: number;
  readback: WebuiDataLifecycleReadback;
};

export class WebuiDataLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
    readonly receiptRef: string | null = null
  ) {
    super(message);
  }
}

function isSameOrInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function rootsOverlap(left: string, right: string): boolean {
  return isSameOrInside(left, right) || isSameOrInside(right, left);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function opaqueHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizedRelativePath(root: string, candidate: string): string {
  const relative = path.relative(root, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new WebuiDataLifecycleError('MANAGED_PATH_INVALID', 'A managed storage entry is outside its owner root.');
  }
  return relative.split(path.sep).join('/');
}

function relativePathSegments(value: string): string[] {
  const segments = value.split('/');
  if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new WebuiDataLifecycleError('MANAGED_PATH_INVALID', 'A managed storage entry has an invalid relative path.');
  }
  return segments;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function readBoundedJson(filePath: string): Record<string, unknown> {
  let descriptor: number | null = null;
  try {
    const pathStat = fs.lstatSync(filePath);
    if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size > MAX_RECEIPT_BYTES) {
      throw new WebuiDataLifecycleError('RECEIPT_INVALID', 'The lifecycle receipt is invalid.');
    }
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_RECEIPT_BYTES || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
      throw new WebuiDataLifecycleError('RECEIPT_INVALID', 'The lifecycle receipt is invalid.');
    }
    const buffer = Buffer.alloc(stat.size);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new WebuiDataLifecycleError('RECEIPT_INVALID', 'The lifecycle receipt is invalid.');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof WebuiDataLifecycleError) throw error;
    throw new WebuiDataLifecycleError('RECEIPT_INVALID', 'The lifecycle receipt is invalid.');
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function fileDigest(filePath: string, deadline: number, now: () => number): { sha256: string; stat: fs.Stats } {
  let descriptor: number | null = null;
  try {
    const before = fs.lstatSync(filePath);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new WebuiDataLifecycleError('MANAGED_FILE_INVALID', 'A managed storage entry is not a regular file.');
    }
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | O_NOFOLLOW);
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new WebuiDataLifecycleError('MANAGED_FILE_CHANGED', 'Managed storage changed during inspection.');
    }
    const digest = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let offset = 0;
    while (offset < opened.size) {
      if (now() > deadline)
        throw new WebuiDataLifecycleError('SCAN_DEADLINE_EXCEEDED', 'Storage inspection timed out.');
      const count = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, opened.size - offset), offset);
      if (count <= 0)
        throw new WebuiDataLifecycleError('MANAGED_FILE_CHANGED', 'Managed storage changed during inspection.');
      digest.update(buffer.subarray(0, count));
      offset += count;
    }
    const after = fs.fstatSync(descriptor);
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino
    ) {
      throw new WebuiDataLifecycleError('MANAGED_FILE_CHANGED', 'Managed storage changed during inspection.');
    }
    return { sha256: digest.digest('hex'), stat: after };
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function copyFileVerified(source: string, target: string, expectedBytes: number, expectedSha256: string): void {
  let sourceDescriptor: number | null = null;
  let targetDescriptor: number | null = null;
  let targetCreated = false;
  try {
    const before = fs.lstatSync(source);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new WebuiDataLifecycleError('ARCHIVE_SOURCE_INVALID', 'A lifecycle archive source is invalid.');
    }
    sourceDescriptor = fs.openSync(source, fs.constants.O_RDONLY | O_NOFOLLOW);
    const opened = fs.fstatSync(sourceDescriptor);
    if (!opened.isFile() || opened.size !== expectedBytes || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new WebuiDataLifecycleError('PLAN_STALE', 'Managed storage changed after the plan was created.');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    targetDescriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    targetCreated = true;
    const digest = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let offset = 0;
    while (offset < opened.size) {
      const count = fs.readSync(sourceDescriptor, buffer, 0, Math.min(buffer.length, opened.size - offset), offset);
      if (count <= 0) throw new WebuiDataLifecycleError('PLAN_STALE', 'Managed storage changed during archive.');
      let written = 0;
      while (written < count) {
        written += fs.writeSync(targetDescriptor, buffer, written, count - written, offset + written);
      }
      digest.update(buffer.subarray(0, count));
      offset += count;
    }
    fs.fsyncSync(targetDescriptor);
    const after = fs.fstatSync(sourceDescriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || digest.digest('hex') !== expectedSha256) {
      throw new WebuiDataLifecycleError('PLAN_STALE', 'Managed storage changed during archive.');
    }
  } catch (error) {
    if (targetDescriptor !== null) {
      fs.closeSync(targetDescriptor);
      targetDescriptor = null;
    }
    if (targetCreated) fs.rmSync(target, { force: true });
    throw error;
  } finally {
    if (targetDescriptor !== null) fs.closeSync(targetDescriptor);
    if (sourceDescriptor !== null) fs.closeSync(sourceDescriptor);
  }
}

export const __webuiDataLifecycleTest = { copyFileVerified };

function receiptIdFromRef(receiptRef: string): string {
  const match = /^opl-webui-data-volume-receipt:([0-9a-f-]{36})$/.exec(receiptRef);
  if (!match) throw new WebuiDataLifecycleError('RECEIPT_REF_INVALID', 'The lifecycle receipt reference is invalid.');
  return match[1];
}

export class WebuiDataVolumeLifecycleManager {
  private readonly dataRoot: string;
  private readonly projectsRoot: string | null;
  private readonly recoveryRoot: string;
  private readonly archivesRoot: string;
  private readonly receiptsRoot: string;
  private readonly managedRoots: WebuiDataLifecycleManagedRoot[];
  private readonly managedRootsById: Map<string, WebuiDataLifecycleManagedRoot>;
  private readonly planTtlMs: number;
  private readonly maxEntries: number;
  private readonly maxScannedBytes: number;
  private readonly scanDeadlineMs: number;
  private readonly now: () => Date;
  private readonly plans = new Map<string, StoredPlan>();
  private mutationInFlight = false;

  constructor(config: WebuiDataLifecycleHostConfig) {
    this.dataRoot = path.resolve(config.dataDir);
    this.projectsRoot = config.projectsDir ? path.resolve(config.projectsDir) : null;
    this.recoveryRoot = path.resolve(config.recoveryRoot);
    this.archivesRoot = path.join(this.recoveryRoot, 'archives');
    this.receiptsRoot = path.join(this.recoveryRoot, 'receipts');
    this.planTtlMs = config.planTtlMs ?? DEFAULT_PLAN_TTL_MS;
    this.maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxScannedBytes = config.maxScannedBytes ?? DEFAULT_MAX_SCANNED_BYTES;
    this.scanDeadlineMs = config.scanDeadlineMs ?? DEFAULT_SCAN_DEADLINE_MS;
    this.now = config.now ?? (() => new Date());
    this.managedRoots = config.managedRoots.map((root) => ({ ...root, path: path.resolve(root.path) }));
    this.managedRootsById = new Map(this.managedRoots.map((root) => [root.id, root]));
    this.assertConfiguration();
    fs.mkdirSync(this.recoveryRoot, { recursive: true, mode: 0o700 });
    const recoveryStat = fs.lstatSync(this.recoveryRoot);
    if (!recoveryStat.isDirectory() || recoveryStat.isSymbolicLink()) {
      throw new WebuiDataLifecycleError('CONFIGURATION_INVALID', 'The recovery root is unavailable.', 503);
    }
  }

  capability(): WebuiDataLifecycleCapability {
    return {
      schema: 'opl_webui_data_volume_lifecycle_capability.v1',
      capability_id: WEBUI_DATA_LIFECYCLE_CAPABILITY_ID,
      endpoint_status: 'available',
      endpoint_availability: 'host_owner_injected',
      plan_action_id: WEBUI_DATA_LIFECYCLE_PLAN_ACTION_ID,
      execute_action_id: WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID,
      restore_action_id: WEBUI_DATA_LIFECYCLE_RESTORE_ACTION_ID,
      raw_path_transport_allowed: false,
    };
  }

  plan(): WebuiDataLifecyclePlanResponse {
    const now = this.now();
    const files = this.collectPlanFiles();
    const planId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.planTtlMs);
    const hashPayload = {
      schema: 'opl_webui_data_volume_cleanup_plan.v1',
      plan_id: planId,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      files: files.map(({ dev: _dev, ino: _ino, ...file }) => file),
    };
    const planHash = opaqueHash(hashPayload);
    const exactConfirmation = `cleanup:webui-data-volume:${planId}:${planHash}`;
    const stored: StoredPlan = {
      plan_id: planId,
      plan_hash: planHash,
      exact_confirmation: exactConfirmation,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      files,
      used: false,
    };
    this.plans.set(planId, stored);
    this.prunePlans(now);
    return {
      schema: 'opl_webui_data_volume_cleanup_plan.v1',
      action_id: WEBUI_DATA_LIFECYCLE_PLAN_ACTION_ID,
      plan_id: planId,
      plan_hash: planHash,
      exact_confirmation: exactConfirmation,
      estimated_reclaimable_bytes: files.reduce((total, file) => total + file.bytes, 0),
      candidate_count: files.length,
      restore_supported: true,
      observed_at: stored.created_at,
      expires_at: stored.expires_at,
    };
  }

  execute(input: WebuiDataLifecycleExecuteRequest): WebuiDataLifecycleExecuteResponse {
    return this.withMutation(() => this.executeLocked(input));
  }

  restore(input: WebuiDataLifecycleRestoreRequest): WebuiDataLifecycleRestoreResponse {
    return this.withMutation(() => this.restoreLocked(input));
  }

  private assertConfiguration(): void {
    const filesystemRoot = path.parse(this.dataRoot).root;
    if (this.dataRoot === filesystemRoot || this.recoveryRoot === path.parse(this.recoveryRoot).root) {
      throw new WebuiDataLifecycleError('CONFIGURATION_INVALID', 'Lifecycle roots cannot be filesystem roots.', 503);
    }
    if (
      rootsOverlap(this.recoveryRoot, this.dataRoot) ||
      (this.projectsRoot && rootsOverlap(this.recoveryRoot, this.projectsRoot))
    ) {
      throw new WebuiDataLifecycleError(
        'CONFIGURATION_INVALID',
        'The recovery root must be separate from data and projects.',
        503
      );
    }
    if (this.managedRoots.length === 0 || this.managedRootsById.size !== this.managedRoots.length) {
      throw new WebuiDataLifecycleError(
        'CONFIGURATION_INVALID',
        'Managed lifecycle roots must be explicit and unique.',
        503
      );
    }
    if (
      !isFinitePositive(this.planTtlMs) ||
      !isFinitePositive(this.maxEntries) ||
      !isFinitePositive(this.maxScannedBytes) ||
      !isFinitePositive(this.scanDeadlineMs)
    ) {
      throw new WebuiDataLifecycleError('CONFIGURATION_INVALID', 'Lifecycle limits must be finite and positive.', 503);
    }
    for (const root of this.managedRoots) {
      if (
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(root.id) ||
        !isSameOrInside(this.dataRoot, root.path) ||
        root.path === this.dataRoot ||
        (this.projectsRoot && rootsOverlap(this.projectsRoot, root.path))
      ) {
        throw new WebuiDataLifecycleError('CONFIGURATION_INVALID', 'A managed lifecycle root is invalid.', 503);
      }
    }
    for (let left = 0; left < this.managedRoots.length; left += 1) {
      for (let right = left + 1; right < this.managedRoots.length; right += 1) {
        if (rootsOverlap(this.managedRoots[left].path, this.managedRoots[right].path)) {
          throw new WebuiDataLifecycleError('CONFIGURATION_INVALID', 'Managed lifecycle roots cannot overlap.', 503);
        }
      }
    }
  }

  private collectPlanFiles(): PlanFile[] {
    const deadline = Date.now() + this.scanDeadlineMs;
    const clock = Date.now;
    const files: PlanFile[] = [];
    let entries = 0;
    let scannedBytes = 0;
    for (const root of this.managedRoots) {
      if (!fs.existsSync(root.path)) continue;
      const rootStat = fs.lstatSync(root.path);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        throw new WebuiDataLifecycleError('MANAGED_ROOT_INVALID', 'A managed lifecycle root is unavailable.');
      }
      const stack = [root.path];
      while (stack.length > 0) {
        if (clock() > deadline)
          throw new WebuiDataLifecycleError('SCAN_DEADLINE_EXCEEDED', 'Storage inspection timed out.');
        const directory = stack.pop()!;
        const names = fs.readdirSync(directory).toSorted();
        for (const name of names) {
          entries += 1;
          if (entries > this.maxEntries) {
            throw new WebuiDataLifecycleError(
              'SCAN_ENTRY_LIMIT_EXCEEDED',
              'Storage inspection exceeded its entry limit.'
            );
          }
          const candidate = path.join(directory, name);
          const stat = fs.lstatSync(candidate);
          if (stat.isSymbolicLink()) continue;
          if (stat.isDirectory()) {
            stack.push(candidate);
            continue;
          }
          if (!stat.isFile()) continue;
          scannedBytes += stat.size;
          if (scannedBytes > this.maxScannedBytes) {
            throw new WebuiDataLifecycleError(
              'SCAN_BYTE_LIMIT_EXCEEDED',
              'Storage inspection exceeded its byte limit.'
            );
          }
          const digest = fileDigest(candidate, deadline, clock);
          files.push({
            root_id: root.id,
            relative_path: normalizedRelativePath(root.path, candidate),
            bytes: digest.stat.size,
            mtime_ms: digest.stat.mtimeMs,
            sha256: digest.sha256,
            dev: digest.stat.dev,
            ino: digest.stat.ino,
          });
        }
      }
    }
    return files.toSorted(
      (left, right) =>
        left.root_id.localeCompare(right.root_id) || left.relative_path.localeCompare(right.relative_path)
    );
  }

  private executeLocked(input: WebuiDataLifecycleExecuteRequest): WebuiDataLifecycleExecuteResponse {
    const plan = this.plans.get(input.plan_id);
    if (!plan) throw new WebuiDataLifecycleError('PLAN_NOT_FOUND', 'Create a fresh lifecycle plan.');
    if (input.plan_hash !== plan.plan_hash || input.exact_confirmation !== plan.exact_confirmation) {
      throw new WebuiDataLifecycleError('CONFIRMATION_MISMATCH', 'The lifecycle confirmation does not match the plan.');
    }
    if (plan.completed_response) return plan.completed_response;
    if (plan.used) throw new WebuiDataLifecycleError('PLAN_ALREADY_USED', 'The lifecycle plan was already used.');
    if (this.now().getTime() > Date.parse(plan.expires_at)) {
      this.plans.delete(plan.plan_id);
      throw new WebuiDataLifecycleError('PLAN_EXPIRED', 'The lifecycle plan expired; create a fresh plan.');
    }
    plan.used = true;
    const currentFiles = this.collectPlanFiles();
    if (JSON.stringify(currentFiles) !== JSON.stringify(plan.files)) {
      throw new WebuiDataLifecycleError('PLAN_STALE', 'Managed storage changed after the plan was created.');
    }

    const receiptId = crypto.randomUUID();
    const receiptRef = `opl-webui-data-volume-receipt:${receiptId}`;
    const stagingRoot = path.join(this.recoveryRoot, 'staging', receiptId);
    const archiveRoot = path.join(this.archivesRoot, receiptId);
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    const manifestFiles: ArchiveManifestFile[] = [];
    try {
      for (const file of plan.files) {
        const source = this.managedFilePath(file);
        const archiveRelativePath = path.posix.join('files', file.root_id, file.relative_path);
        const target = path.join(stagingRoot, ...relativePathSegments(archiveRelativePath));
        copyFileVerified(source, target, file.bytes, file.sha256);
        manifestFiles.push({
          root_id: file.root_id,
          relative_path: file.relative_path,
          bytes: file.bytes,
          sha256: file.sha256,
          archive_relative_path: archiveRelativePath,
          archive_sha256: file.sha256,
        });
      }
      const manifest: ArchiveManifest = {
        schema: 'opl_webui_data_volume_archive_manifest.v1',
        receipt_id: receiptId,
        plan_id: plan.plan_id,
        plan_hash: plan.plan_hash,
        created_at: this.now().toISOString(),
        files: manifestFiles,
      };
      writeJsonAtomic(path.join(stagingRoot, 'manifest.json'), manifest);
      fs.mkdirSync(this.archivesRoot, { recursive: true });
      fs.renameSync(stagingRoot, archiveRoot);
    } catch (error) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      throw error;
    }

    const manifestPath = path.join(archiveRoot, 'manifest.json');
    const manifestSha256 = fileDigest(manifestPath, Number.POSITIVE_INFINITY, Date.now).sha256;
    const persisted: PersistedReceipt = {
      schema: 'opl_webui_data_volume_cleanup_receipt.v1',
      receipt_id: receiptId,
      action_id: WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID,
      status: 'archived',
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      archive_manifest_sha256: manifestSha256,
      archived_bytes: plan.files.reduce((total, file) => total + file.bytes, 0),
      deleted_bytes: 0,
      created_at: this.now().toISOString(),
    };
    writeJsonAtomic(this.receiptPath(receiptId), persisted);

    try {
      for (const file of plan.files) {
        const source = this.managedFilePath(file);
        const digest = fileDigest(source, Number.POSITIVE_INFINITY, Date.now);
        if (digest.sha256 !== file.sha256 || digest.stat.dev !== file.dev || digest.stat.ino !== file.ino) {
          throw new WebuiDataLifecycleError('PLAN_STALE', 'Managed storage changed during cleanup.');
        }
        fs.rmSync(source);
        persisted.deleted_bytes += file.bytes;
      }
      persisted.status = 'completed';
      this.removeEmptyManagedDirectories();
      writeJsonAtomic(this.receiptPath(receiptId), persisted);
    } catch {
      persisted.status = 'recovery_required';
      writeJsonAtomic(this.receiptPath(receiptId), persisted);
      throw new WebuiDataLifecycleError(
        'EXECUTION_RECOVERY_REQUIRED',
        'Cleanup stopped after creating a recoverable archive.',
        409,
        receiptRef
      );
    }

    const response: WebuiDataLifecycleExecuteResponse = {
      schema: 'opl_webui_data_volume_cleanup_receipt.v1',
      receipt_id: receiptId,
      action_id: WEBUI_DATA_LIFECYCLE_EXECUTE_ACTION_ID,
      status: 'completed',
      plan_id: plan.plan_id,
      plan_hash: plan.plan_hash,
      receipt_ref: receiptRef,
      restore_action_ref: WEBUI_DATA_LIFECYCLE_RESTORE_ACTION_ID,
      archive_ref: `opl-webui-data-volume-archive:${receiptId}`,
      archive_manifest_ref: `opl-webui-data-volume-manifest:${receiptId}`,
      archive_sha256: manifestSha256,
      archived_bytes: persisted.archived_bytes,
      deleted_bytes: persisted.deleted_bytes,
      readback: this.readback(receiptRef, 'available'),
    };
    plan.completed_response = response;
    return response;
  }

  private restoreLocked(input: WebuiDataLifecycleRestoreRequest): WebuiDataLifecycleRestoreResponse {
    const receiptId = receiptIdFromRef(input.receipt_ref);
    const receipt = readBoundedJson(this.receiptPath(receiptId)) as unknown as PersistedReceipt;
    if (receipt.schema !== 'opl_webui_data_volume_cleanup_receipt.v1' || receipt.receipt_id !== receiptId) {
      throw new WebuiDataLifecycleError('RECEIPT_INVALID', 'The lifecycle receipt is invalid.');
    }
    if (receipt.status === 'restored') return this.readRestoreResponse(receiptId, input.receipt_ref);
    const manifestPath = path.join(this.archivesRoot, receiptId, 'manifest.json');
    const manifestHash = fileDigest(manifestPath, Number.POSITIVE_INFINITY, Date.now).sha256;
    if (manifestHash !== receipt.archive_manifest_sha256) {
      throw new WebuiDataLifecycleError('ARCHIVE_MANIFEST_INVALID', 'The lifecycle archive manifest is invalid.');
    }
    const manifest = readBoundedJson(manifestPath) as unknown as ArchiveManifest;
    if (manifest.schema !== 'opl_webui_data_volume_archive_manifest.v1' || manifest.receipt_id !== receiptId) {
      throw new WebuiDataLifecycleError('ARCHIVE_MANIFEST_INVALID', 'The lifecycle archive manifest is invalid.');
    }

    const restored: Array<{ target: string; bytes: number }> = [];
    try {
      for (const file of manifest.files) {
        const root = this.managedRootsById.get(file.root_id);
        if (!root)
          throw new WebuiDataLifecycleError('ARCHIVE_MANIFEST_INVALID', 'The lifecycle archive manifest is invalid.');
        const target = path.join(root.path, ...relativePathSegments(file.relative_path));
        if (!isSameOrInside(root.path, target) || fs.existsSync(target)) {
          throw new WebuiDataLifecycleError(
            'RESTORE_COLLISION',
            'Restore is blocked because managed data already exists.'
          );
        }
        this.ensureSafeParent(root.path, path.dirname(target));
        const archivePath = path.join(
          this.archivesRoot,
          receiptId,
          ...relativePathSegments(file.archive_relative_path)
        );
        copyFileVerified(archivePath, target, file.bytes, file.archive_sha256);
        restored.push({ target, bytes: file.bytes });
      }
    } catch (error) {
      for (const file of restored.toReversed()) fs.rmSync(file.target, { force: true });
      throw error;
    }

    const restoredBytes = restored.reduce((total, file) => total + file.bytes, 0);
    receipt.status = 'restored';
    receipt.restored_at = this.now().toISOString();
    writeJsonAtomic(this.receiptPath(receiptId), receipt);
    const response: WebuiDataLifecycleRestoreResponse = {
      schema: 'opl_webui_data_volume_restore_receipt.v1',
      action_id: WEBUI_DATA_LIFECYCLE_RESTORE_ACTION_ID,
      status: 'completed',
      receipt_ref: input.receipt_ref,
      restore_receipt_ref: `opl-webui-data-volume-restore:${receiptId}`,
      restored_bytes: restoredBytes,
      readback: this.readback(input.receipt_ref, 'restored'),
    };
    writeJsonAtomic(this.restoreReceiptPath(receiptId), response);
    return response;
  }

  private readRestoreResponse(receiptId: string, sourceReceiptRef: string): WebuiDataLifecycleRestoreResponse {
    const value = readBoundedJson(this.restoreReceiptPath(receiptId)) as unknown as WebuiDataLifecycleRestoreResponse;
    if (value.schema !== 'opl_webui_data_volume_restore_receipt.v1' || value.receipt_ref !== sourceReceiptRef) {
      throw new WebuiDataLifecycleError('RESTORE_RECEIPT_INVALID', 'The lifecycle restore receipt is invalid.');
    }
    return value;
  }

  private managedFilePath(file: Pick<PlanFile, 'root_id' | 'relative_path'>): string {
    const root = this.managedRootsById.get(file.root_id);
    if (!root) throw new WebuiDataLifecycleError('MANAGED_PATH_INVALID', 'The managed lifecycle root is unavailable.');
    const candidate = path.join(root.path, ...relativePathSegments(file.relative_path));
    if (!isSameOrInside(root.path, candidate)) {
      throw new WebuiDataLifecycleError('MANAGED_PATH_INVALID', 'A managed storage entry is outside its owner root.');
    }
    return candidate;
  }

  private ensureSafeParent(root: string, parent: string): void {
    const relative = path.relative(root, parent);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new WebuiDataLifecycleError('RESTORE_TARGET_INVALID', 'The lifecycle restore target is invalid.');
    }
    let current = root;
    if (!fs.existsSync(current)) fs.mkdirSync(current, { recursive: true, mode: 0o700 });
    const rootStat = fs.lstatSync(current);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new WebuiDataLifecycleError('RESTORE_TARGET_INVALID', 'The lifecycle restore target is invalid.');
    }
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (!fs.existsSync(current)) fs.mkdirSync(current, { mode: 0o700 });
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new WebuiDataLifecycleError('RESTORE_TARGET_INVALID', 'The lifecycle restore target is invalid.');
      }
    }
  }

  private removeEmptyManagedDirectories(): void {
    const visit = (root: string, current: string): void => {
      if (!fs.existsSync(current)) return;
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return;
      for (const name of fs.readdirSync(current)) {
        const child = path.join(current, name);
        const childStat = fs.lstatSync(child);
        if (childStat.isDirectory() && !childStat.isSymbolicLink()) visit(root, child);
      }
      if (current !== root && fs.readdirSync(current).length === 0) fs.rmdirSync(current);
    };
    for (const root of this.managedRoots) visit(root.path, root.path);
  }

  private readback(receiptRef: string, restoreStatus: 'available' | 'restored'): WebuiDataLifecycleReadback {
    const files = this.collectPlanFiles();
    const bytes = files.reduce((total, file) => total + file.bytes, 0);
    return {
      status: 'ready',
      terminal: true,
      observed_at: this.now().toISOString(),
      bytes,
      reclaimable_bytes: bytes,
      receipt_ref: receiptRef,
      restore_status: restoreStatus,
    };
  }

  private receiptPath(receiptId: string): string {
    return path.join(this.receiptsRoot, `${receiptId}.json`);
  }

  private restoreReceiptPath(receiptId: string): string {
    return path.join(this.receiptsRoot, `${receiptId}.restore.json`);
  }

  private prunePlans(now: Date): void {
    for (const [planId, plan] of this.plans) {
      if (Date.parse(plan.expires_at) < now.getTime() && !plan.completed_response) this.plans.delete(planId);
    }
  }

  private withMutation<T>(operation: () => T): T {
    if (this.mutationInFlight) {
      throw new WebuiDataLifecycleError('MUTATION_IN_PROGRESS', 'Another lifecycle mutation is already in progress.');
    }
    this.mutationInFlight = true;
    try {
      return operation();
    } finally {
      this.mutationInFlight = false;
    }
  }
}

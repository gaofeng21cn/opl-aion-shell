/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LocalDataLifecycleInventory } from './index';

export type LocalDataLifecycleInventorySnapshot = {
  schema: 'opl_local_data_lifecycle_inventory_snapshot.v1';
  inventory: LocalDataLifecycleInventory | null;
  observed_at: string | null;
  scan_duration_ms: number | null;
  stale: boolean;
  error: string | null;
};

type InventorySnapshotStoreOptions = {
  snapshotPath: string;
  ttlMs: number;
  scan: () => LocalDataLifecycleInventory | Promise<LocalDataLifecycleInventory>;
  onUpdated?: (snapshot: LocalDataLifecycleInventorySnapshot) => void;
  now?: () => Date;
};

function emptySnapshot(): LocalDataLifecycleInventorySnapshot {
  return {
    schema: 'opl_local_data_lifecycle_inventory_snapshot.v1',
    inventory: null,
    observed_at: null,
    scan_duration_ms: null,
    stale: true,
    error: null,
  };
}

function isInventory(value: unknown): value is LocalDataLifecycleInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const inventory = value as Partial<LocalDataLifecycleInventory>;
  return (
    inventory.schema === 'opl_local_data_lifecycle_inventory.v1' &&
    typeof inventory.total_bytes === 'number' &&
    Array.isArray(inventory.sections)
  );
}

function readSnapshotFile(snapshotPath: string): LocalDataLifecycleInventorySnapshot | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Partial<LocalDataLifecycleInventorySnapshot>;
    if (
      parsed.schema !== 'opl_local_data_lifecycle_inventory_snapshot.v1' ||
      !isInventory(parsed.inventory) ||
      typeof parsed.observed_at !== 'string' ||
      typeof parsed.scan_duration_ms !== 'number'
    ) {
      return null;
    }
    return {
      schema: parsed.schema,
      inventory: parsed.inventory,
      observed_at: parsed.observed_at,
      scan_duration_ms: parsed.scan_duration_ms,
      stale: parsed.stale === true,
      error: typeof parsed.error === 'string' ? parsed.error : null,
    };
  } catch {
    return null;
  }
}

function writeSnapshotFile(snapshotPath: string, snapshot: LocalDataLifecycleInventorySnapshot): void {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const temporaryPath = `${snapshotPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, snapshotPath);
}

export class LocalDataLifecycleInventorySnapshotStore {
  private snapshot: LocalDataLifecycleInventorySnapshot | null = null;
  private loaded = false;
  private inflight: Promise<LocalDataLifecycleInventorySnapshot> | null = null;

  constructor(private readonly options: InventorySnapshotStoreOptions) {}

  getSnapshot(): LocalDataLifecycleInventorySnapshot {
    if (!this.loaded) {
      this.snapshot = readSnapshotFile(this.options.snapshotPath);
      this.loaded = true;
    }
    const current = this.snapshot ?? emptySnapshot();
    const observedAt = current.observed_at ? Date.parse(current.observed_at) : Number.NaN;
    const stale =
      current.stale ||
      !Number.isFinite(observedAt) ||
      (this.options.now?.() ?? new Date()).getTime() - observedAt >= this.options.ttlMs;
    return stale === current.stale ? current : { ...current, stale };
  }

  refresh(options: { force?: boolean } = {}): Promise<LocalDataLifecycleInventorySnapshot> {
    if (this.inflight) return this.inflight;
    const current = this.getSnapshot();
    if (!options.force && current.inventory && !current.stale) return Promise.resolve(current);

    const request = Promise.resolve().then(async () => {
      const startedAt = Date.now();
      try {
        const inventory = await this.options.scan();
        const snapshot: LocalDataLifecycleInventorySnapshot = {
          schema: 'opl_local_data_lifecycle_inventory_snapshot.v1',
          inventory,
          observed_at: (this.options.now?.() ?? new Date()).toISOString(),
          scan_duration_ms: Math.max(0, Date.now() - startedAt),
          stale: false,
          error: null,
        };
        writeSnapshotFile(this.options.snapshotPath, snapshot);
        this.snapshot = snapshot;
        this.loaded = true;
        this.options.onUpdated?.(snapshot);
        return snapshot;
      } catch (error) {
        const snapshot: LocalDataLifecycleInventorySnapshot = {
          ...current,
          stale: true,
          error: error instanceof Error ? error.message : String(error),
        };
        this.snapshot = snapshot;
        this.loaded = true;
        this.options.onUpdated?.(snapshot);
        throw error;
      }
    });
    this.inflight = request;
    const clearInflight = () => {
      if (this.inflight === request) this.inflight = null;
    };
    void request.then(clearInflight, clearInflight);
    return request;
  }
}

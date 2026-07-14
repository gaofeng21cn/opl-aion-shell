import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataLifecycleInventorySnapshotStore } from '@/process/services/localDataLifecycle/inventorySnapshot';

const inventory = {
  schema: 'opl_local_data_lifecycle_inventory.v1' as const,
  total_bytes: 42,
  sections: [],
};

describe('local data lifecycle inventory snapshot', () => {
  let tempRoot: string;
  let now: Date;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-inventory-snapshot-'));
    now = new Date('2026-07-14T08:00:00.000Z');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('persists a fresh scan and marks it stale only after the TTL', async () => {
    const snapshotPath = path.join(tempRoot, 'inventory.json');
    const store = new LocalDataLifecycleInventorySnapshotStore({
      snapshotPath,
      ttlMs: 5 * 60 * 1000,
      scan: () => inventory,
      now: () => now,
    });

    const refreshed = await store.refresh();
    expect(refreshed.inventory?.total_bytes).toBe(42);
    expect(refreshed.stale).toBe(false);

    const restoredStore = new LocalDataLifecycleInventorySnapshotStore({
      snapshotPath,
      ttlMs: 5 * 60 * 1000,
      scan: () => inventory,
      now: () => now,
    });
    expect(restoredStore.getSnapshot().stale).toBe(false);

    now = new Date('2026-07-14T08:05:00.000Z');
    expect(restoredStore.getSnapshot().stale).toBe(true);
  });

  it('shares one scan across concurrent refresh requests', async () => {
    const scan = vi.fn(() => inventory);
    const store = new LocalDataLifecycleInventorySnapshotStore({
      snapshotPath: path.join(tempRoot, 'inventory.json'),
      ttlMs: 5 * 60 * 1000,
      scan,
      now: () => now,
    });

    const first = store.refresh({ force: true });
    const second = store.refresh({ force: true });

    expect(first).toBe(second);
    await first;
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('clears a failed inflight scan so a later refresh can recover', async () => {
    const scan = vi
      .fn<() => typeof inventory>()
      .mockImplementationOnce(() => {
        throw new Error('scan failed');
      })
      .mockReturnValue(inventory);
    const store = new LocalDataLifecycleInventorySnapshotStore({
      snapshotPath: path.join(tempRoot, 'inventory.json'),
      ttlMs: 5 * 60 * 1000,
      scan,
      now: () => now,
    });

    await expect(store.refresh({ force: true })).rejects.toThrow('scan failed');
    const recovered = await store.refresh({ force: true });

    expect(recovered.error).toBeNull();
    expect(recovered.inventory?.total_bytes).toBe(42);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('returns an unknown stale snapshot when persisted data is invalid', () => {
    const snapshotPath = path.join(tempRoot, 'inventory.json');
    fs.writeFileSync(snapshotPath, '{not-json', 'utf8');
    const store = new LocalDataLifecycleInventorySnapshotStore({
      snapshotPath,
      ttlMs: 5 * 60 * 1000,
      scan: () => inventory,
      now: () => now,
    });

    expect(store.getSnapshot()).toMatchObject({
      inventory: null,
      observed_at: null,
      scan_duration_ms: null,
      stale: true,
      error: null,
    });
  });
});

import type { LocalDataLifecycleInventory, LocalDataLifecycleInventoryInput } from '../services/localDataLifecycle';

export type LocalDataInventoryWorkerRequest = LocalDataLifecycleInventoryInput;

export type LocalDataInventoryWorkerResponse =
  | { ok: true; inventory: LocalDataLifecycleInventory }
  | { ok: false; error: string };

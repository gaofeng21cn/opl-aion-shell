import { parentPort, workerData } from 'node:worker_threads';
import { buildLocalDataLifecycleInventory } from '../services/localDataLifecycle';
import type { LocalDataInventoryWorkerRequest, LocalDataInventoryWorkerResponse } from './localDataInventoryProtocol';

function post(response: LocalDataInventoryWorkerResponse): void {
  parentPort?.postMessage(response);
}

try {
  post({
    ok: true,
    inventory: buildLocalDataLifecycleInventory(workerData as LocalDataInventoryWorkerRequest),
  });
} catch (error) {
  post({ ok: false, error: error instanceof Error ? error.message : String(error) });
}

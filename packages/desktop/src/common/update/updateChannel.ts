export type OplAppUpdateChannel = 'stable' | 'preview';
export type UpdaterReleaseChannel = 'stable' | 'nightly';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export function resolveOplAppUpdateChannel(payload: unknown): OplAppUpdateChannel {
  const envelope = asRecord(payload);
  const appState = asRecord(envelope.app_state ?? payload);
  const release = asRecord(appState.release);
  const managedUpdate = asRecord(appState.managed_update_plane);
  const projectedChannel =
    asNonEmptyString(release.channel) ??
    asNonEmptyString(appState.update_channel) ??
    asNonEmptyString(managedUpdate.update_channel);

  return projectedChannel === 'preview' ? 'preview' : 'stable';
}

export function resolveUpdaterReleaseChannel(payload: unknown): UpdaterReleaseChannel {
  return resolveOplAppUpdateChannel(payload) === 'preview' ? 'nightly' : 'stable';
}

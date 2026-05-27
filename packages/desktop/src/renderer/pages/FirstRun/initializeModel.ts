import type { FirstRunChecklistItem, FirstRunInitialize } from './types';

type JsonRecord = Record<string, unknown>;

export const FIRST_RUN_ITEM_IDS = [
  'workspace_root',
  'codex',
  'codex_config',
  'domain_modules',
  'family_runtime_provider',
  'recommended_skills',
] as const;

export type FirstRunItemId = (typeof FIRST_RUN_ITEM_IDS)[number];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readInitializePayload(parsed: unknown): FirstRunInitialize | null {
  if (!isRecord(parsed)) return null;
  const raw = parsed.system_initialize;
  return isRecord(raw) ? (raw as FirstRunInitialize) : null;
}

function readRecord(record: unknown, key: string): JsonRecord | null {
  if (!isRecord(record)) return null;
  const value = record[key];
  return isRecord(value) ? value : null;
}

function readString(record: unknown, key: string): string | null {
  if (!isRecord(record)) return null;
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(record: unknown, key: string): boolean | null {
  if (!isRecord(record)) return null;
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function readAppStatePayload(parsed: unknown): JsonRecord | null {
  if (!isRecord(parsed)) return null;
  const appState = readRecord(parsed, 'app_state') ?? parsed;
  return readString(appState, 'schema_version') === 'opl_app_state.v1' ? appState : null;
}

export function isCoreLaunchReadyFromAppState(parsed: unknown): boolean {
  const appState = readAppStatePayload(parsed);
  const codex = readRecord(readRecord(appState, 'core'), 'codex');
  const paths = readRecord(appState, 'paths');
  const workspaceRoot = readRecord(paths, 'workspace_root');
  const selectedWorkspace = readString(workspaceRoot, 'selected_path') ?? readString(paths, 'workspace_root_path');
  const workspaceExists = readBoolean(workspaceRoot, 'exists');
  const workspaceHealth = readString(workspaceRoot, 'health_status');
  const codexInstalled = readBoolean(codex, 'installed');
  const codexConfigured = readBoolean(codex, 'api_key_present');
  const codexVersionStatus = readString(codex, 'version_status');
  const codexHealth = readString(codex, 'health_status');

  return Boolean(
    selectedWorkspace
      && workspaceExists !== false
      && workspaceHealth !== 'missing'
      && workspaceHealth !== 'blocking'
      && codexInstalled === true
      && codexConfigured === true
      && codexVersionStatus !== 'incompatible'
      && codexHealth !== 'missing'
      && codexHealth !== 'blocking'
  );
}

export function findChecklistItem(
  initialize: FirstRunInitialize | null,
  itemId: FirstRunItemId
): FirstRunChecklistItem | null {
  const item = initialize?.checklist?.find((entry) => entry.item_id === itemId);
  return item ?? null;
}

export function formatProgressText(initialize: FirstRunInitialize | null): string {
  const progress = initialize?.setup_flow?.progress;
  const ready = progress?.ready_required_count ?? progress?.required_completed_count ?? 0;
  const total = progress?.total_required_count ?? progress?.required_total_count ?? 0;
  return `${ready}/${total}`;
}

export function coreProgressPercent(initialize: FirstRunInitialize | null): number {
  const progress = initialize?.setup_flow?.progress;
  const ready = progress?.ready_required_count ?? progress?.required_completed_count ?? 0;
  const total = progress?.total_required_count ?? progress?.required_total_count ?? 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((ready / total) * 100)));
}

export function hasCodexConfigBlocker(initialize: FirstRunInitialize | null): boolean {
  const item = findChecklistItem(initialize, 'codex_config');
  return item?.blocking === true;
}

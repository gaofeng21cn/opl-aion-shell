import type { FirstRunChecklistItem, FirstRunInitialize } from './types';

type JsonRecord = Record<string, unknown>;
const CORE_ITEM_IDS = ['workspace_root', 'codex', 'codex_config'] as const;
const READY_ITEM_STATUSES = new Set(['ready', 'installed', 'detected', 'configured', 'disabled']);
const REQUIRED_PROGRESS_FIELDS = [
  'ready_required_count',
  'total_required_count',
  'ready_full_readiness_count',
  'total_full_readiness_count',
  'ready_optional_count',
  'total_optional_count',
] as const;

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isProgress(value: unknown): value is JsonRecord {
  if (!isRecord(value) || !REQUIRED_PROGRESS_FIELDS.every((field) => isNonNegativeFiniteNumber(value[field]))) {
    return false;
  }
  return (
    value.ready_required_count <= value.total_required_count &&
    value.ready_full_readiness_count <= value.total_full_readiness_count &&
    value.ready_optional_count <= value.total_optional_count
  );
}

function isChecklist(value: unknown): value is FirstRunChecklistItem[] {
  if (!Array.isArray(value)) return false;
  const valid = value.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.item_id === 'string' &&
      typeof entry.label === 'string' &&
      typeof entry.status === 'string' &&
      typeof entry.blocking === 'boolean' &&
      ['core_launch', 'full_readiness', 'optional'].includes(String(entry.readiness_layer)) &&
      ['blocking', 'maintenance', 'info'].includes(String(entry.severity)) &&
      typeof entry.next_visible_step === 'string' &&
      typeof entry.detail_summary === 'string'
  );
  return valid && new Set(value.map((entry) => entry.item_id)).size === value.length;
}

function hasInitializeShape(value: JsonRecord): value is JsonRecord & FirstRunInitialize {
  const setupFlow = value.setup_flow;
  const checklist = value.checklist;
  if (
    !isRecord(setupFlow) ||
    typeof setupFlow.phase !== 'string' ||
    !setupFlow.phase.trim() ||
    typeof setupFlow.ready_to_launch !== 'boolean' ||
    !isProgress(setupFlow.progress) ||
    !isStringArray(setupFlow.blocking_items) ||
    !isStringArray(setupFlow.maintenance_items) ||
    !isChecklist(checklist)
  ) {
    return false;
  }
  const coreItems = CORE_ITEM_IDS.map((itemId) => checklist.find((item) => item.item_id === itemId));
  if (coreItems.some((item) => !item || item.readiness_layer !== 'core_launch')) return false;
  if (setupFlow.ready_to_launch) {
    return (
      setupFlow.blocking_items.length === 0 &&
      setupFlow.progress.ready_required_count === setupFlow.progress.total_required_count &&
      coreItems.every((item) => item && !item.blocking && READY_ITEM_STATUSES.has(item.status))
    );
  }
  return true;
}

export function readInitializePayload(parsed: unknown): FirstRunInitialize | null {
  if (!isRecord(parsed)) return null;
  const raw = parsed.system_initialize;
  return isRecord(raw) && hasInitializeShape(raw) ? raw : null;
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
  const codexConfigured = readBoolean(codex, 'model_access_ready') ?? readBoolean(codex, 'api_key_present');
  const codexVersionStatus = readString(codex, 'version_status');
  const codexHealth = readString(codex, 'health_status');

  return Boolean(
    selectedWorkspace &&
    workspaceExists !== false &&
    workspaceHealth !== 'missing' &&
    workspaceHealth !== 'blocking' &&
    codexInstalled === true &&
    codexConfigured === true &&
    codexVersionStatus !== 'incompatible' &&
    codexHealth !== 'missing' &&
    codexHealth !== 'blocking'
  );
}

export function findChecklistItem(
  initialize: FirstRunInitialize | null,
  itemId: FirstRunItemId
): FirstRunChecklistItem | null {
  const item = initialize?.checklist?.find((entry) => entry.item_id === itemId);
  return item ?? null;
}

export function formatFullReadinessProgressText(initialize: FirstRunInitialize | null): string {
  const progress = initialize?.setup_flow?.progress;
  const ready = progress?.ready_full_readiness_count ?? 0;
  const total = progress?.total_full_readiness_count ?? 0;
  return `${ready}/${total}`;
}

export function formatMaintenanceProgressText(initialize: FirstRunInitialize | null): string {
  const progress = initialize?.setup_flow?.progress;
  const ready = progress?.ready_optional_count ?? 0;
  const total = progress?.total_optional_count ?? 0;
  return `${ready}/${total}`;
}

export function hasCodexConfigBlocker(initialize: FirstRunInitialize | null): boolean {
  const item = findChecklistItem(initialize, 'codex_config');
  return item?.blocking === true;
}

export function findNextVisibleStep(initialize: FirstRunInitialize | null): string | null {
  const blockingItem = initialize?.checklist?.find((item) => item.blocking && item.next_visible_step);
  if (blockingItem?.next_visible_step) return blockingItem.next_visible_step;
  const actionableItem = initialize?.checklist?.find((item) => item.next_visible_step);
  return actionableItem?.next_visible_step ?? null;
}

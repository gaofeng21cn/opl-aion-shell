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

import { getOplHomeAgentShortcuts, type OplHomeAgentShortcut } from '@/common/config/oplProductProfile';
import { canonicalizeOplProfessionalAgentId } from '@/common/config/oplProductProfile';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'opl.homeAgentShortcutPreferences.v2';
const APP_STATE_FAST_CACHE_KEY = 'opl.appState.fast.v1';

export type OplHomeShortcutPreferences = {
  hiddenShortcutIds: string[];
  visibleShortcutIds: string[];
  orderedShortcutIds: string[];
};

export type OplHomeShortcutDescriptor = Pick<
  OplHomeAgentShortcut,
  | 'shortcut_id'
  | 'package_id'
  | 'primary_label'
  | 'package_short_name'
  | 'codex_visible_entry'
  | 'required_skill_ids'
  | 'source'
  | 'executor'
  | 'display_policy'
  | 'home_entry_policy'
  | 'default_visible'
  | 'user_configurable'
> & {
  visible: boolean;
  installed: boolean;
  preference_source: 'default' | 'user_preference';
  sort_order: number | null;
};

const EMPTY_PREFERENCES: OplHomeShortcutPreferences = {
  hiddenShortcutIds: [],
  visibleShortcutIds: [],
  orderedShortcutIds: [],
};
let currentPreferences: OplHomeShortcutPreferences | null = null;
let observedAppStateRaw: string | null = null;
const preferenceListeners = new Set<() => void>();

function removeLegacyStoredPreferences(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Framework App-state remains authoritative when localStorage is unavailable.
  }
}

function publishPreferences(preferences: OplHomeShortcutPreferences): OplHomeShortcutPreferences {
  if (
    currentPreferences &&
    currentPreferences.hiddenShortcutIds.length === preferences.hiddenShortcutIds.length &&
    currentPreferences.hiddenShortcutIds.every((value, index) => value === preferences.hiddenShortcutIds[index]) &&
    currentPreferences.visibleShortcutIds.length === preferences.visibleShortcutIds.length &&
    currentPreferences.visibleShortcutIds.every((value, index) => value === preferences.visibleShortcutIds[index]) &&
    currentPreferences.orderedShortcutIds.length === preferences.orderedShortcutIds.length &&
    currentPreferences.orderedShortcutIds.every((value, index) => value === preferences.orderedShortcutIds[index])
  ) {
    return currentPreferences;
  }
  currentPreferences = preferences;
  preferenceListeners.forEach((listener) => listener());
  return preferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function appStateRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return isRecord(value.app_state) ? value.app_state : value;
}

function shortcutPreferenceRecords(appState: unknown): Record<string, unknown>[] {
  const state = appStateRecord(appState);
  const agentPackages = isRecord(state.agent_packages) ? state.agent_packages : {};
  const statusIndex = isRecord(agentPackages.status_index) ? agentPackages.status_index : {};
  const legacyPackages = isRecord(state.opl_agent_packages) ? state.opl_agent_packages : {};
  const legacyPackageStatus = isRecord(state.opl_agent_package_status) ? state.opl_agent_package_status : {};
  const projectedSurfaces = [
    recordList(statusIndex.home_shortcut_preferences),
    recordList(agentPackages.home_shortcut_preferences),
    recordList(legacyPackages.home_shortcut_preferences),
    recordList(legacyPackageStatus.home_shortcut_preferences),
  ];
  return projectedSurfaces.find((records) => records.length > 0) ?? [];
}

export function getOplHomeAgentShortcutsFromAppState(appState: unknown): OplHomeShortcutDescriptor[] {
  const records = shortcutPreferenceRecords(appState);
  const state = appStateRecord(appState);
  const agentPackages = isRecord(state.agent_packages) ? state.agent_packages : {};
  const directory = isRecord(agentPackages.directory) ? agentPackages.directory : {};
  const directoryEntries = new Map(
    recordList(directory.entries).flatMap((entry) => {
      const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
      return packageId ? [[canonicalizeOplProfessionalAgentId(packageId), entry] as const] : [];
    })
  );
  const presentations = getOplHomeAgentShortcuts();
  const presentationByTuple = new Map<string, OplHomeAgentShortcut>(
    presentations.map(
      (shortcut) =>
        [`${canonicalizeOplProfessionalAgentId(shortcut.package_id)}\n${shortcut.shortcut_id}`, shortcut] as const
    )
  );
  const descriptors = new Map<string, OplHomeShortcutDescriptor>();
  presentations.forEach((presentation, sortOrder) => {
    const canonicalPackageId = canonicalizeOplProfessionalAgentId(presentation.package_id);
    const directoryEntry = directoryEntries.get(canonicalPackageId);
    if (!directoryEntry || directoryEntry.package_role !== 'standard_agent') return;
    const packageId =
      typeof directoryEntry.package_id === 'string' && directoryEntry.package_id.trim()
        ? directoryEntry.package_id.trim()
        : presentation.package_id;
    const displayName =
      typeof directoryEntry.display_name === 'string' && directoryEntry.display_name.trim()
        ? directoryEntry.display_name.trim()
        : packageId;
    const tuple = `${canonicalPackageId}\n${presentation.shortcut_id}`;
    descriptors.set(tuple, {
      ...presentation,
      package_id: packageId,
      primary_label: presentation.primary_label || displayName,
      package_short_name: presentation.package_short_name || displayName,
      codex_visible_entry:
        (typeof directoryEntry.codex_visible_entry === 'string' && directoryEntry.codex_visible_entry.trim()) ||
        presentation.codex_visible_entry ||
        packageId,
      required_skill_ids: [],
      visible: presentation.default_visible,
      installed: directoryEntry.installed !== false,
      preference_source: 'default',
      sort_order: sortOrder,
    });
  });
  for (const entry of records) {
    const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
    const shortcutId = typeof entry.shortcut_id === 'string' ? entry.shortcut_id.trim() : '';
    const canonicalPackageId = canonicalizeOplProfessionalAgentId(packageId);
    const directoryEntry = directoryEntries.get(canonicalPackageId);
    if (!packageId || !shortcutId || !directoryEntry || directoryEntry.package_role !== 'standard_agent') continue;
    const tuple = `${canonicalPackageId}\n${shortcutId}`;
    const existing = descriptors.get(tuple);
    if (existing && existing.preference_source === 'user_preference') continue;
    const presentation = presentationByTuple.get(tuple);
    const displayName =
      typeof directoryEntry.display_name === 'string' && directoryEntry.display_name.trim()
        ? directoryEntry.display_name.trim()
        : packageId;
    const preferenceSource = entry.source === 'user_preference' ? 'user_preference' : 'default';
    descriptors.set(tuple, {
      shortcut_id: shortcutId,
      package_id: packageId,
      primary_label: presentation?.primary_label ?? displayName,
      package_short_name: presentation?.package_short_name ?? displayName,
      codex_visible_entry:
        (typeof directoryEntry.codex_visible_entry === 'string' && directoryEntry.codex_visible_entry.trim()) ||
        presentation?.codex_visible_entry ||
        packageId,
      required_skill_ids: [],
      source: 'opl_app_home',
      executor: 'codex_cli',
      display_policy: 'purpose_first',
      home_entry_policy: 'visible_click_to_start',
      default_visible:
        preferenceSource === 'default' ? entry.visible === true : (presentation?.default_visible ?? false),
      visible: entry.visible === true,
      installed: entry.installed !== false && directoryEntry.installed !== false,
      preference_source: preferenceSource,
      user_configurable: true,
      sort_order: typeof entry.sort_order === 'number' && Number.isFinite(entry.sort_order) ? entry.sort_order : null,
    });
  }
  return [...descriptors.values()].toSorted(
    (left, right) =>
      (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
      left.package_id.localeCompare(right.package_id) ||
      left.shortcut_id.localeCompare(right.shortcut_id)
  );
}

function shortcutPreferencesFromRecords(records: Record<string, unknown>[]): OplHomeShortcutPreferences | null {
  if (records.length === 0) return null;

  const validShortcutIds = new Set(
    records.map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id.trim() : '')).filter(Boolean)
  );
  const userPreferences = records.filter((entry) => entry.source === 'user_preference');
  const hiddenShortcutIds = userPreferences
    .filter((entry) => entry.visible === false)
    .map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id : null))
    .filter((shortcutId): shortcutId is string => Boolean(shortcutId && validShortcutIds.has(shortcutId)));

  const visibleShortcutIds = userPreferences
    .filter((entry) => entry.visible === true)
    .map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id : null))
    .filter((shortcutId): shortcutId is string => Boolean(shortcutId && validShortcutIds.has(shortcutId)));

  const orderedShortcutIds = userPreferences
    .filter((entry) => typeof entry.sort_order === 'number' && Number.isFinite(entry.sort_order))
    .toSorted((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id : null))
    .filter((shortcutId): shortcutId is string => Boolean(shortcutId && validShortcutIds.has(shortcutId)));

  return {
    hiddenShortcutIds: [...new Set(hiddenShortcutIds)],
    visibleShortcutIds: [...new Set(visibleShortcutIds)],
    orderedShortcutIds: [...new Set(orderedShortcutIds)],
  };
}

export function getOplHomeShortcutPreferencesFromAppState(appState: unknown): OplHomeShortcutPreferences | null {
  return shortcutPreferencesFromRecords(shortcutPreferenceRecords(appState));
}

export type OplHomeShortcutPreferenceReadback = {
  shortcutId: string;
  visible: boolean;
  sortOrder: number;
};

export function getOplHomeShortcutPreferenceReadback(
  appState: unknown,
  shortcutId: string
): OplHomeShortcutPreferenceReadback | null {
  const record = shortcutPreferenceRecords(appState).find(
    (entry) => entry.source === 'user_preference' && entry.shortcut_id === shortcutId
  );
  if (!record || typeof record.visible !== 'boolean') return null;
  if (typeof record.sort_order !== 'number' || !Number.isFinite(record.sort_order)) return null;
  return {
    shortcutId,
    visible: record.visible,
    sortOrder: record.sort_order,
  };
}

function readCachedAppStatePreferences(): OplHomeShortcutPreferences | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(APP_STATE_FAST_CACHE_KEY);
    if (!raw) return null;
    const cached = appStateRecord(JSON.parse(raw) as unknown);
    return getOplHomeShortcutPreferencesFromAppState(cached.payload ?? cached);
  } catch {
    return null;
  }
}

function sortShortcuts<T extends Pick<OplHomeAgentShortcut, 'shortcut_id'>>(
  shortcuts: T[],
  orderedShortcutIds: string[]
): T[] {
  const order = new Map(orderedShortcutIds.map((id, index) => [id, index]));
  return [...shortcuts].toSorted((a, b) => {
    const aOrder = order.get(a.shortcut_id);
    const bOrder = order.get(b.shortcut_id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    const aProjectedOrder = 'sort_order' in a && typeof a.sort_order === 'number' ? a.sort_order : null;
    const bProjectedOrder = 'sort_order' in b && typeof b.sort_order === 'number' ? b.sort_order : null;
    if (aProjectedOrder !== null || bProjectedOrder !== null) {
      return (aProjectedOrder ?? Number.MAX_SAFE_INTEGER) - (bProjectedOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return shortcuts.indexOf(a) - shortcuts.indexOf(b);
  });
}

export function getOplHomeShortcutPreferences(): OplHomeShortcutPreferences {
  removeLegacyStoredPreferences();
  if (typeof localStorage !== 'undefined') {
    const appStateRaw = localStorage.getItem(APP_STATE_FAST_CACHE_KEY);
    if (appStateRaw !== observedAppStateRaw) {
      observedAppStateRaw = appStateRaw;
      currentPreferences = readCachedAppStatePreferences() ?? currentPreferences;
    }
  }
  currentPreferences ??= readCachedAppStatePreferences() ?? EMPTY_PREFERENCES;
  return currentPreferences;
}

export function replaceOplHomeShortcutPreferences(preferences: OplHomeShortcutPreferences): OplHomeShortcutPreferences {
  return publishPreferences(preferences);
}

export function useOplHomeShortcutPreferences(): OplHomeShortcutPreferences {
  return useSyncExternalStore(
    (listener) => {
      preferenceListeners.add(listener);
      return () => preferenceListeners.delete(listener);
    },
    getOplHomeShortcutPreferences,
    getOplHomeShortcutPreferences
  );
}

export function getOplOrderedHomeAgentShortcuts<T extends Pick<OplHomeAgentShortcut, 'shortcut_id'>>(
  shortcuts?: T[]
): T[] {
  const preferences = getOplHomeShortcutPreferences();
  return sortShortcuts(shortcuts ?? (getOplHomeAgentShortcuts() as unknown as T[]), preferences.orderedShortcutIds);
}

export function isOplHomeShortcutVisible(
  shortcut: Pick<OplHomeAgentShortcut, 'shortcut_id' | 'default_visible'> & { visible?: boolean },
  preferences: OplHomeShortcutPreferences = getOplHomeShortcutPreferences()
): boolean {
  if (preferences.hiddenShortcutIds.includes(shortcut.shortcut_id)) return false;
  if (shortcut.default_visible) return true;
  return preferences.visibleShortcutIds.includes(shortcut.shortcut_id);
}

export function getOplVisibleHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  const preferences = getOplHomeShortcutPreferences();
  return sortShortcuts(getOplHomeAgentShortcuts(), preferences.orderedShortcutIds).filter((shortcut) =>
    isOplHomeShortcutVisible(shortcut, preferences)
  );
}

export function setOplHomeShortcutHidden(
  shortcutId: string,
  hidden: boolean,
  availableShortcuts: Array<Pick<OplHomeAgentShortcut, 'shortcut_id' | 'default_visible'>> = getOplHomeAgentShortcuts()
): OplHomeShortcutPreferences {
  const preferences = getOplHomeShortcutPreferences();
  const hiddenIds = new Set(preferences.hiddenShortcutIds);
  const visibleIds = new Set(preferences.visibleShortcutIds);
  const shortcut = availableShortcuts.find((entry) => entry.shortcut_id === shortcutId);
  if (hidden) {
    hiddenIds.add(shortcutId);
    visibleIds.delete(shortcutId);
  } else {
    hiddenIds.delete(shortcutId);
    if (shortcut && !shortcut.default_visible) visibleIds.add(shortcutId);
  }
  const next = {
    ...preferences,
    hiddenShortcutIds: [...hiddenIds],
    visibleShortcutIds: [...visibleIds],
  };
  return publishPreferences(next);
}

export function moveOplHomeShortcut(
  shortcutId: string,
  direction: -1 | 1,
  availableShortcuts: Array<Pick<OplHomeAgentShortcut, 'shortcut_id'>> = getOplHomeAgentShortcuts()
): OplHomeShortcutPreferences {
  const shortcuts = getOplOrderedHomeAgentShortcuts(availableShortcuts);
  const ids = shortcuts.map((shortcut) => shortcut.shortcut_id);
  const index = ids.indexOf(shortcutId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return getOplHomeShortcutPreferences();
  [ids[index], ids[target]] = [ids[target], ids[index]];
  const next = {
    ...getOplHomeShortcutPreferences(),
    orderedShortcutIds: ids,
  };
  return publishPreferences(next);
}

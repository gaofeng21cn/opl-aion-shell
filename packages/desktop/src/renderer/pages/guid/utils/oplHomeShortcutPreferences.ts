import { getOplHomeAgentShortcuts, type OplHomeAgentShortcut } from '@/common/config/oplProductProfile';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'opl.homeAgentShortcutPreferences.v2';
const APP_STATE_FAST_CACHE_KEY = 'opl.appState.fast.v1';

export type OplHomeShortcutPreferences = {
  hiddenShortcutIds: string[];
  visibleShortcutIds: string[];
  orderedShortcutIds: string[];
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

function shortcutPreferencesFromRecords(records: Record<string, unknown>[]): OplHomeShortcutPreferences | null {
  if (records.length === 0) return null;

  const validShortcutIds = new Set(getOplHomeAgentShortcuts().map((shortcut) => shortcut.shortcut_id));
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
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
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

function sortShortcuts(shortcuts: OplHomeAgentShortcut[], orderedShortcutIds: string[]): OplHomeAgentShortcut[] {
  const order = new Map(orderedShortcutIds.map((id, index) => [id, index]));
  return [...shortcuts].sort((a, b) => {
    const aOrder = order.get(a.shortcut_id);
    const bOrder = order.get(b.shortcut_id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
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

export function getOplOrderedHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  const preferences = getOplHomeShortcutPreferences();
  return sortShortcuts(getOplHomeAgentShortcuts(), preferences.orderedShortcutIds);
}

export function isOplHomeShortcutVisible(
  shortcut: OplHomeAgentShortcut,
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

export function setOplHomeShortcutHidden(shortcutId: string, hidden: boolean): OplHomeShortcutPreferences {
  const preferences = getOplHomeShortcutPreferences();
  const hiddenIds = new Set(preferences.hiddenShortcutIds);
  const visibleIds = new Set(preferences.visibleShortcutIds);
  const shortcut = getOplHomeAgentShortcuts().find((entry) => entry.shortcut_id === shortcutId);
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

export function moveOplHomeShortcut(shortcutId: string, direction: -1 | 1): OplHomeShortcutPreferences {
  const shortcuts = getOplOrderedHomeAgentShortcuts();
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

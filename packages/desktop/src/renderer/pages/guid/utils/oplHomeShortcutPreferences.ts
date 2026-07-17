import { getOplHomeAgentShortcuts, type OplHomeAgentShortcut } from '@/common/config/oplProductProfile';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'opl.homeAgentShortcutPreferences.v1';
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
let observedStoredRaw: string | null = null;
let observedAppStateRaw: string | null = null;
const preferenceListeners = new Set<() => void>();

function readStoredPreferences(): OplHomeShortcutPreferences {
  if (typeof localStorage === 'undefined') return EMPTY_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PREFERENCES;
    const value = JSON.parse(raw) as Partial<OplHomeShortcutPreferences>;
    return {
      hiddenShortcutIds: Array.isArray(value.hiddenShortcutIds) ? value.hiddenShortcutIds.filter(isString) : [],
      visibleShortcutIds: Array.isArray(value.visibleShortcutIds) ? value.visibleShortcutIds.filter(isString) : [],
      orderedShortcutIds: Array.isArray(value.orderedShortcutIds) ? value.orderedShortcutIds.filter(isString) : [],
    };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

function writeStoredPreferences(preferences: OplHomeShortcutPreferences): void {
  if (typeof localStorage === 'undefined') return;
  observedStoredRaw = JSON.stringify(preferences);
  localStorage.setItem(STORAGE_KEY, observedStoredRaw);
}

function publishPreferences(preferences: OplHomeShortcutPreferences): OplHomeShortcutPreferences {
  currentPreferences = preferences;
  writeStoredPreferences(preferences);
  preferenceListeners.forEach((listener) => listener());
  return preferences;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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

function shortcutPreferencesFromRecords(records: Record<string, unknown>[]): OplHomeShortcutPreferences | null {
  if (records.length === 0) return null;

  const validShortcutIds = new Set(getOplHomeAgentShortcuts().map((shortcut) => shortcut.shortcut_id));
  const hiddenShortcutIds = records
    .filter((entry) => entry.visible === false)
    .map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id : null))
    .filter((shortcutId): shortcutId is string => Boolean(shortcutId && validShortcutIds.has(shortcutId)));

  const visibleShortcutIds = records
    .filter((entry) => entry.visible === true)
    .map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id : null))
    .filter((shortcutId): shortcutId is string => Boolean(shortcutId && validShortcutIds.has(shortcutId)));

  const orderedShortcutIds = records
    .filter(
      (entry) =>
        entry.source === 'user_preference' && typeof entry.sort_order === 'number' && Number.isFinite(entry.sort_order)
    )
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
  const state = appStateRecord(appState);
  const packages = isRecord(state.opl_agent_packages) ? state.opl_agent_packages : {};
  const packageStatus = isRecord(state.opl_agent_package_status) ? state.opl_agent_package_status : {};
  return shortcutPreferencesFromRecords(
    recordList(packages.home_shortcut_preferences).concat(recordList(packageStatus.home_shortcut_preferences))
  );
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
  if (typeof localStorage !== 'undefined') {
    const storedRaw = localStorage.getItem(STORAGE_KEY);
    const appStateRaw = localStorage.getItem(APP_STATE_FAST_CACHE_KEY);
    if (storedRaw !== observedStoredRaw || appStateRaw !== observedAppStateRaw) {
      observedStoredRaw = storedRaw;
      observedAppStateRaw = appStateRaw;
      currentPreferences = readCachedAppStatePreferences() ?? readStoredPreferences();
    }
  }
  currentPreferences ??= readCachedAppStatePreferences() ?? readStoredPreferences();
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

import { getOplHomeAgentShortcuts, type OplHomeAgentShortcut } from '@/common/config/oplProductProfile';

const STORAGE_KEY = 'opl.homeAgentShortcutPreferences.v1';
const APP_STATE_FAST_CACHE_KEY = 'opl.appState.fast.v1';

export type OplHomeShortcutPreferences = {
  hiddenShortcutIds: string[];
  orderedShortcutIds: string[];
};

const EMPTY_PREFERENCES: OplHomeShortcutPreferences = {
  hiddenShortcutIds: [],
  orderedShortcutIds: [],
};

function readStoredPreferences(): OplHomeShortcutPreferences {
  if (typeof localStorage === 'undefined') return EMPTY_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PREFERENCES;
    const value = JSON.parse(raw) as Partial<OplHomeShortcutPreferences>;
    return {
      hiddenShortcutIds: Array.isArray(value.hiddenShortcutIds) ? value.hiddenShortcutIds.filter(isString) : [],
      orderedShortcutIds: Array.isArray(value.orderedShortcutIds) ? value.orderedShortcutIds.filter(isString) : [],
    };
  } catch {
    return EMPTY_PREFERENCES;
  }
}

function writeStoredPreferences(preferences: OplHomeShortcutPreferences): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
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

  const orderedShortcutIds = records
    .filter((entry) => typeof entry.sort_order === 'number' && Number.isFinite(entry.sort_order))
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
    .map((entry) => (typeof entry.shortcut_id === 'string' ? entry.shortcut_id : null))
    .filter((shortcutId): shortcutId is string => Boolean(shortcutId && validShortcutIds.has(shortcutId)));

  return {
    hiddenShortcutIds: [...new Set(hiddenShortcutIds)],
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
  return readCachedAppStatePreferences() ?? readStoredPreferences();
}

export function getOplOrderedHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  const preferences = getOplHomeShortcutPreferences();
  return sortShortcuts(getOplHomeAgentShortcuts(), preferences.orderedShortcutIds);
}

export function getOplVisibleHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  const preferences = getOplHomeShortcutPreferences();
  const hidden = new Set(preferences.hiddenShortcutIds);
  return sortShortcuts(getOplHomeAgentShortcuts(), preferences.orderedShortcutIds).filter(
    (shortcut) => shortcut.default_visible && !hidden.has(shortcut.shortcut_id)
  );
}

export function setOplHomeShortcutHidden(shortcutId: string, hidden: boolean): OplHomeShortcutPreferences {
  const preferences = getOplHomeShortcutPreferences();
  const hiddenIds = new Set(preferences.hiddenShortcutIds);
  if (hidden) {
    hiddenIds.add(shortcutId);
  } else {
    hiddenIds.delete(shortcutId);
  }
  const next = {
    ...preferences,
    hiddenShortcutIds: [...hiddenIds],
  };
  writeStoredPreferences(next);
  return next;
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
  writeStoredPreferences(next);
  return next;
}

import { getOplHomeAgentShortcuts, type OplHomeAgentShortcut } from '@/common/config/oplProductProfile';

const STORAGE_KEY = 'opl.homeAgentShortcutPreferences.v1';

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
  return readStoredPreferences();
}

export function getOplOrderedHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  const preferences = readStoredPreferences();
  return sortShortcuts(getOplHomeAgentShortcuts(), preferences.orderedShortcutIds);
}

export function getOplVisibleHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  const preferences = readStoredPreferences();
  const hidden = new Set(preferences.hiddenShortcutIds);
  return sortShortcuts(getOplHomeAgentShortcuts(), preferences.orderedShortcutIds).filter(
    (shortcut) => shortcut.default_visible && !hidden.has(shortcut.shortcut_id)
  );
}

export function setOplHomeShortcutHidden(shortcutId: string, hidden: boolean): OplHomeShortcutPreferences {
  const preferences = readStoredPreferences();
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
  if (index < 0 || target < 0 || target >= ids.length) return readStoredPreferences();
  [ids[index], ids[target]] = [ids[target], ids[index]];
  const next = {
    ...readStoredPreferences(),
    orderedShortcutIds: ids,
  };
  writeStoredPreferences(next);
  return next;
}

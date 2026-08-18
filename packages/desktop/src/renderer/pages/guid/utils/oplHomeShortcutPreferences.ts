import type { OplHomeAgentShortcut } from '@/common/config/oplProductProfile';
import { useSyncExternalStore } from 'react';
import { getOplPackageAppContributionsFromAppState } from './oplAppContributions';

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
  icon_id: string | null;
  primary_label_i18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  route_kind: 'agent_package_shortcut';
  visible: boolean;
  installed: boolean;
  preference_source: 'default' | 'user_preference';
  sort_order: number | null;
};

export type OplHomeAppNavigationDescriptor = {
  navigation_id: string;
  package_id: string;
  label_i18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  view_id: string;
  icon_id: string | null;
  installed: boolean;
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

function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(nonBlankString).filter((entry): entry is string => Boolean(entry)))];
}

function appStateRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return isRecord(value.app_state) ? value.app_state : value;
}

function shortcutPreferenceRecords(appState: unknown): Record<string, unknown>[] {
  const state = appStateRecord(appState);
  const agentPackages = isRecord(state.agent_packages) ? state.agent_packages : {};
  const statusIndex = isRecord(agentPackages.status_index) ? agentPackages.status_index : {};
  return recordList(statusIndex.home_shortcut_preferences);
}

export function getOplHomeAgentShortcutsFromAppState(appState: unknown): OplHomeShortcutDescriptor[] {
  const records = shortcutPreferenceRecords(appState);
  const state = appStateRecord(appState);
  const agentPackages = isRecord(state.agent_packages) ? state.agent_packages : {};
  const directory = isRecord(agentPackages.directory) ? agentPackages.directory : {};
  const directoryEntries = new Map(
    recordList(directory.entries).flatMap((entry) => {
      const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
      return packageId ? [[packageId, entry] as const] : [];
    })
  );
  const descriptors = new Map<string, OplHomeShortcutDescriptor>();
  for (const [directoryPackageId, directoryEntry] of directoryEntries) {
    if (directoryEntry.package_role !== 'standard_agent') continue;
    const packageId = nonBlankString(directoryEntry.package_id);
    if (!packageId) continue;
    const displayNameI18n = isRecord(directoryEntry.display_name_i18n) ? directoryEntry.display_name_i18n : {};
    const displayName =
      nonBlankString(displayNameI18n['zh-CN']) ??
      nonBlankString(displayNameI18n['en-US']) ??
      nonBlankString(directoryEntry.display_name) ??
      packageId;
    const packageShortName = nonBlankString(directoryEntry.package_short_name) ?? displayName;
    const capabilityMetadata = isRecord(directoryEntry.capability_metadata) ? directoryEntry.capability_metadata : {};
    const requiredSkillIds = stringList(capabilityMetadata.required_skill_ids);
    for (const [sortOrder, shortcut] of recordList(directoryEntry.home_shortcuts).entries()) {
      const shortcutId = nonBlankString(shortcut.shortcut_id);
      const labelI18n = isRecord(shortcut.label_i18n) ? shortcut.label_i18n : {};
      const primaryLabelI18n = Object.fromEntries(
        (['zh-CN', 'en-US'] as const).flatMap((locale) => {
          const label = nonBlankString(labelI18n[locale]);
          return label ? [[locale, label]] : [];
        })
      ) as Partial<Record<'zh-CN' | 'en-US', string>>;
      const primaryLabel = primaryLabelI18n['zh-CN'] ?? primaryLabelI18n['en-US'];
      const route = isRecord(shortcut.route) ? shortcut.route : {};
      const executor = nonBlankString(route.executor);
      const codexVisibleEntry = nonBlankString(route.codex_visible_entry);
      if (
        !shortcutId ||
        !primaryLabel ||
        route.route_kind !== 'agent_package_shortcut' ||
        executor !== 'codex_cli' ||
        !codexVisibleEntry ||
        typeof shortcut.default_visible !== 'boolean' ||
        typeof shortcut.user_configurable !== 'boolean'
      ) {
        continue;
      }
      const tuple = `${directoryPackageId}\n${shortcutId}`;
      if (descriptors.has(tuple)) continue;
      descriptors.set(tuple, {
        shortcut_id: shortcutId,
        package_id: packageId,
        icon_id: nonBlankString(shortcut.icon_id),
        primary_label: primaryLabel,
        primary_label_i18n: primaryLabelI18n,
        package_short_name: packageShortName,
        codex_visible_entry: codexVisibleEntry,
        required_skill_ids: requiredSkillIds,
        route_kind: 'agent_package_shortcut',
        source: 'opl_app_home',
        executor: 'codex_cli',
        display_policy: 'purpose_first',
        home_entry_policy: 'visible_click_to_start',
        default_visible: shortcut.default_visible,
        visible: shortcut.default_visible,
        installed: directoryEntry.installed !== false,
        preference_source: 'default',
        user_configurable: shortcut.user_configurable,
        sort_order: sortOrder,
      });
    }
  }
  for (const entry of records) {
    const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
    const shortcutId = typeof entry.shortcut_id === 'string' ? entry.shortcut_id.trim() : '';
    const directoryEntry = directoryEntries.get(packageId);
    if (!packageId || !shortcutId || !directoryEntry || directoryEntry.package_role !== 'standard_agent') continue;
    const tuple = `${packageId}\n${shortcutId}`;
    const existing = descriptors.get(tuple);
    if (!existing || existing.preference_source === 'user_preference') continue;
    const preferenceSource = entry.source === 'user_preference' ? 'user_preference' : 'default';
    descriptors.set(tuple, {
      ...existing,
      visible: typeof entry.visible === 'boolean' ? entry.visible : existing.visible,
      installed: existing.installed,
      preference_source: preferenceSource,
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

/** Resolve role-neutral Package navigation without assuming an Agent route or executor. */
export function getOplHomeAppNavigationFromAppState(appState: unknown): OplHomeAppNavigationDescriptor[] {
  return getOplPackageAppContributionsFromAppState(appState)
    .flatMap(({ packageId, installed, contributions }) =>
      contributions.navigation.map((entry) => ({
        navigation_id: entry.navigationId,
        package_id: packageId,
        label_i18n: { ...entry.labelI18n },
        view_id: entry.viewId,
        icon_id: entry.iconId ?? null,
        installed,
        sort_order: entry.sortOrder ?? null,
      }))
    )
    .toSorted(
      (left, right) =>
        (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        left.package_id.localeCompare(right.package_id) ||
        left.navigation_id.localeCompare(right.navigation_id)
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
  return sortShortcuts(shortcuts ?? [], preferences.orderedShortcutIds);
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
  return [];
}

export function setOplHomeShortcutHidden(
  shortcutId: string,
  hidden: boolean,
  availableShortcuts: Array<Pick<OplHomeAgentShortcut, 'shortcut_id' | 'default_visible'>> = []
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
  availableShortcuts: Array<Pick<OplHomeAgentShortcut, 'shortcut_id'>> = []
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

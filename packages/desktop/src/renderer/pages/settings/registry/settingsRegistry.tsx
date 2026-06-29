import {
  Communication,
  Computer,
  Dashboard,
  Earth,
  FolderOpen,
  Lightning,
  Puzzle,
  SettingConfig,
  SwitchThemes,
  System,
  Toolkit,
} from '@icon-park/react';
import React from 'react';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import {
  getOplGuiSettingsControlPlane,
  getOplGuiLegacySettingsRouteRedirects,
  getOplGuiSettingsSecondaryPageIds,
  getOplGuiSettingsVisibleTabs,
} from '@/common/config/oplProductProfile';
import { iconColors } from '@/renderer/styles/colors';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

export const APP_SETTINGS_TOP_LEVEL_TAB_IDS = [
  'general',
  'access',
  'capabilities',
  'environment',
  'storage',
  'appearance',
  'advanced',
] as const;

export type AppSettingsTopLevelTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

const APP_SETTINGS_TOP_LEVEL_TAB_SET = new Set<string>(APP_SETTINGS_TOP_LEVEL_TAB_IDS);
const settingsControlPlane = getOplGuiSettingsControlPlane();
const profileTabIds = getOplGuiSettingsVisibleTabs();
const secondaryPageIds = getOplGuiSettingsSecondaryPageIds();

export const BUILTIN_TAB_IDS = APP_SETTINGS_TOP_LEVEL_TAB_IDS.filter((id) => profileTabIds.includes(id));

export type BuiltinSettingsTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

const OPL_SETTINGS_SECONDARY_SEARCH_IDS = ['workspace', 'local-services'] as const;

export const OPL_SEARCHABLE_SECONDARY_TAB_IDS = OPL_SETTINGS_SECONDARY_SEARCH_IDS.filter((id) =>
  secondaryPageIds.includes(id)
);

export const SETTINGS_DEFAULT_ROUTE = settingsControlPlane?.default_route ?? '/settings/general';

export const SETTINGS_ROUTE_PATHS = Object.fromEntries(
  BUILTIN_TAB_IDS.map((id) => [
    id,
    settingsControlPlane?.ordinary_routes.find((route) => route.id === id)?.path ?? `/settings/${id}`,
  ])
) as Record<BuiltinSettingsTabId, string>;

const legacyRedirectTargets = getOplGuiLegacySettingsRouteRedirects();
const legacyAnchorRemap = settingsControlPlane?.extension_anchor_remap ?? legacyRedirectTargets;

const redirectRouteFor = (legacyId: string, targetId: string): string => {
  if (legacyId === 'skills-hub') return '/settings/capabilities?tab=skills';
  if (legacyId === 'tools') return '/settings/capabilities?tab=tools';
  if (legacyId === 'storage' || (secondaryPageIds.includes(legacyId) && legacyId === targetId)) {
    return `/settings/${legacyId}`;
  }
  if (!APP_SETTINGS_TOP_LEVEL_TAB_SET.has(targetId)) return SETTINGS_DEFAULT_ROUTE;
  return `/settings/${targetId}`;
};

export const LEGACY_SETTINGS_ROUTE_REDIRECTS = Object.fromEntries(
  [
    ...Object.entries(legacyRedirectTargets),
    ...OPL_SETTINGS_SECONDARY_SEARCH_IDS.map((id) => [id, id] as const),
    ['storage', 'storage'],
    ['about', 'advanced'],
  ].map(([legacyId, targetId]) => [legacyId, redirectRouteFor(legacyId, targetId)])
);

export const LEGACY_SETTINGS_ANCHOR_REMAP: Record<string, string> = {
  ...legacyAnchorRemap,
  about: 'advanced',
};
export const LEGACY_ANCHOR_REMAP = LEGACY_SETTINGS_ANCHOR_REMAP;

export const GROUP_HEADER_BEFORE: Record<BuiltinSettingsTabId, string | undefined> = {
  general: undefined,
  access: undefined,
  capabilities: undefined,
  environment: undefined,
  storage: undefined,
  appearance: undefined,
  advanced: undefined,
};

const controlPlaneLabelKeys = Object.fromEntries(
  (settingsControlPlane?.ordinary_routes ?? []).map((route) => [route.id, route.label_key])
);

export const OPL_SETTINGS_TAB_LABEL_KEYS: Record<string, string> = {
  general: 'settings.overview',
  workspace: 'settings.workspace',
  'local-services': 'settings.localServices',
  environment: 'settings.maintenance',
  storage: 'settings.storage',
  capabilities: 'settings.capabilities',
  access: 'settings.onboarding',
  appearance: 'settings.preferences',
  advanced: 'settings.advanced',
  ...controlPlaneLabelKeys,
};

const controlPlaneDefaultLabels = Object.fromEntries(
  (settingsControlPlane?.ordinary_routes ?? []).map((route) => [route.id, route.default_label_en])
);

export const OPL_SETTINGS_TAB_DEFAULT_LABELS: Record<string, string> = {
  general: 'Overview',
  workspace: 'Workspace',
  'local-services': 'Local Services',
  environment: 'Maintenance',
  storage: 'Storage',
  capabilities: 'Capabilities',
  access: 'Get Started',
  appearance: 'Preferences',
  advanced: 'Advanced',
  ...controlPlaneDefaultLabels,
};

export const OPL_SETTINGS_SEARCH_TERMS: Record<string, string[]> = {
  general: ['overview', 'status', 'next step', 'workspace', 'model', 'maintenance', 'capabilities', 'remote access'],
  access: ['setup', 'access', 'model', 'account', 'api key', 'workspace', 'web', 'docker', 'remote'],
  workspace: ['workspace', 'work directory', 'project folder', 'logs', 'modules root', 'paths', 'permission'],
  'local-services': ['local services', 'health', 'codex', 'temporal', 'background', 'modules', 'capability packs'],
  capabilities: ['capabilities', 'agents', 'skills', 'tools', 'voice', 'mas', 'mag', 'rca', 'oma', 'bookforge'],
  environment: ['maintenance', 'updates', 'runtime', 'toolchain', 'packages', 'repair', 'rollback', 'health'],
  storage: ['data', 'storage', 'cleanup', 'archive', 'restore', 'logs', 'cache', 'runtime roots'],
  appearance: ['preferences', 'appearance', 'theme', 'language', 'startup'],
  advanced: ['advanced', 'developer', 'diagnostics', 'about', 'version', 'logs', 'raw refs'],
};

export type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export type SettingsIconSlot = 'modal' | 'siderDesktop' | 'siderMobile';

export function getSettingsTabLabel(tabId: string, t: TranslateFn): string {
  return t(OPL_SETTINGS_TAB_LABEL_KEYS[tabId] ?? `settings.${tabId}`, {
    defaultValue: OPL_SETTINGS_TAB_DEFAULT_LABELS[tabId] ?? tabId,
  });
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function getSettingsTabSearchText(tabId: string, label: string): string {
  return normalizeSearchText([tabId, label, ...(OPL_SETTINGS_SEARCH_TERMS[tabId] ?? [])].join(' '));
}

export function getSettingsTabIcon(tabId: string, slot: SettingsIconSlot): React.ReactElement {
  if (slot === 'modal') {
    const modalIcons: Record<string, React.ReactElement> = {
      general: <Computer theme='outline' size='20' fill={iconColors.secondary} />,
      workspace: <FolderOpen theme='outline' size='20' fill={iconColors.secondary} />,
      'local-services': <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      environment: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      storage: <Toolkit theme='outline' size='20' fill={iconColors.secondary} />,
      capabilities: <Lightning theme='outline' size='20' fill={iconColors.secondary} />,
      access: <Earth theme='outline' size='20' fill={iconColors.secondary} />,
      appearance: <SwitchThemes theme='outline' size='20' fill={iconColors.secondary} />,
      advanced: <SettingConfig theme='outline' size='20' fill={iconColors.secondary} />,
    };
    return modalIcons[tabId] ?? <Puzzle theme='outline' size='20' fill={iconColors.secondary} />;
  }

  const siderIcons: Record<string, React.ReactElement> = {
    general: <Dashboard />,
    access: slot === 'siderDesktop' ? <Earth /> : <Communication />,
    capabilities: <Lightning />,
    environment: <Toolkit />,
    storage: <Toolkit />,
    appearance: <SwitchThemes />,
    advanced: <System />,
  };
  return siderIcons[tabId] ?? <Puzzle />;
}

export function resolveLegacySettingsAnchor(anchor: string): string {
  return LEGACY_SETTINGS_ANCHOR_REMAP[anchor] ?? anchor;
}

export function resolveLegacySettingsRoute(tabId: string): string {
  return LEGACY_SETTINGS_ROUTE_REDIRECTS[tabId] ?? `/settings/${tabId}`;
}

export function normalizeOplSettingsTab(tabId: string): string {
  return LEGACY_SETTINGS_ANCHOR_REMAP[tabId] ?? tabId;
}

export type SettingsCapabilityDetailTab = 'skills' | 'tools';

export function capabilityDetailTabFor(tabId: string): SettingsCapabilityDetailTab {
  if (tabId === 'tools') return 'tools';
  return 'skills';
}

type RegistryItem = {
  id: string;
};

type BuildSettingsItemsOptions<Item extends RegistryItem> = {
  builtinItems: Item[];
  extensionTabs: IExtensionSettingsTab[];
  toExtensionItem: (tab: IExtensionSettingsTab) => Item;
};

export function buildSettingsItemsWithExtensions<Item extends RegistryItem>({
  builtinItems,
  extensionTabs,
  toExtensionItem,
}: BuildSettingsItemsOptions<Item>): Item[] {
  const result = [...builtinItems];
  const builtinIds = new Set(result.map((item) => item.id));
  const beforeMap = new Map<string, IExtensionSettingsTab[]>();
  const afterMap = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];

  for (const tab of extensionTabs) {
    const rawAnchor = tab.position?.relativeTo;
    const anchor = rawAnchor ? resolveLegacySettingsAnchor(rawAnchor) : undefined;
    if (!anchor || !builtinIds.has(anchor)) {
      unanchored.push(tab);
      continue;
    }

    const map = tab.position?.placement === 'before' ? beforeMap : afterMap;
    let list = map.get(anchor);
    if (!list) {
      list = [];
      map.set(anchor, list);
    }
    list.push(tab);
  }

  for (let i = result.length - 1; i >= 0; i--) {
    const id = result[i].id;
    const afters = afterMap.get(id);
    if (afters) result.splice(i + 1, 0, ...afters.map(toExtensionItem));
    const befores = beforeMap.get(id);
    if (befores) result.splice(i, 0, ...befores.map(toExtensionItem));
  }

  if (unanchored.length > 0) {
    const advancedIdx = result.findIndex((item) => item.id === 'advanced');
    const insertIdx = advancedIdx >= 0 ? advancedIdx : result.length;
    result.splice(insertIdx, 0, ...unanchored.map(toExtensionItem));
  }

  return result;
}

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  path: string;
  searchText: string;
};

type BuildNavOptions = {
  builtinItems: SettingsNavItem[];
  extensionTabs: IExtensionSettingsTab[];
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
  extensionIconClassName: string;
};

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn): SettingsNavItem[] {
  const slot: SettingsIconSlot = isDesktop ? 'siderDesktop' : 'siderMobile';
  return BUILTIN_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t);
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, slot),
      path: id,
      searchText: getSettingsTabSearchText(id, label),
    };
  });
}

export function buildSettingsNavItems({
  builtinItems,
  extensionTabs,
  resolveExtTabName,
  extensionIconClassName,
}: BuildNavOptions): SettingsNavItem[] {
  return buildSettingsItemsWithExtensions({
    builtinItems,
    extensionTabs,
    toExtensionItem: (tab) => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      const label = resolveExtTabName(tab);
      return {
        id: tab.id,
        label,
        icon: resolvedIcon ? <img src={resolvedIcon} alt='' className={extensionIconClassName} /> : <Puzzle />,
        isImageIcon: Boolean(resolvedIcon),
        path: `ext/${tab.id}`,
        searchText: normalizeSearchText([tab.id, label, tab.extensionName ?? ''].join(' ')),
      };
    },
  });
}

export type SettingsModalMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  searchText: string;
};

type BuildModalMenuOptions = {
  extensionTabs: IExtensionSettingsTab[];
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
  t: TranslateFn;
};

export function getBuiltinSettingsModalItems(t: TranslateFn): SettingsModalMenuItem[] {
  return BUILTIN_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t);
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, 'modal'),
      searchText: getSettingsTabSearchText(id, label),
    };
  });
}

export function getSearchableSecondarySettingsModalItems(t: TranslateFn): SettingsModalMenuItem[] {
  return OPL_SEARCHABLE_SECONDARY_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t);
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, 'modal'),
      searchText: getSettingsTabSearchText(id, label),
    };
  });
}

export function buildSettingsModalMenuItems({
  extensionTabs,
  resolveExtTabName,
  t,
}: BuildModalMenuOptions): SettingsModalMenuItem[] {
  return buildSettingsItemsWithExtensions({
    builtinItems: getBuiltinSettingsModalItems(t),
    extensionTabs,
    toExtensionItem: (tab) => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      const label = resolveExtTabName(tab);
      return {
        id: tab.id,
        label,
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-20px h-20px object-contain' />
        ) : (
          <Puzzle theme='outline' size='20' fill={iconColors.secondary} />
        ),
        searchText: normalizeSearchText([tab.id, label, tab.extensionName ?? ''].join(' ')),
      };
    },
  });
}

export type SettingsShellWrapperPolicy = 'host_provides_wrapper';

export type SettingsShellRenderSlot = {
  id: string;
  routeId: string;
  componentKey: string;
  wrapperPolicy: SettingsShellWrapperPolicy;
  subrouteQueryParam?: string;
  legacySubroutes?: Record<string, string>;
};

const fallbackRouteSlots: Record<string, { slotId: string; componentKey: string }> = {
  general: { slotId: 'settings_general', componentKey: 'OverviewSettings' },
  workspace: { slotId: 'workspace', componentKey: 'WorkspaceSettings' },
  'local-services': { slotId: 'local_services', componentKey: 'LocalServicesSettings' },
  access: { slotId: 'settings_access', componentKey: 'AccessSettingsContent' },
  capabilities: { slotId: 'settings_capabilities', componentKey: 'CapabilitiesSettingsContent' },
  environment: { slotId: 'settings_environment', componentKey: 'RuntimeSettings' },
  storage: { slotId: 'settings_storage', componentKey: 'StorageSettings' },
  appearance: { slotId: 'settings_theme', componentKey: 'AppearanceModalContent' },
  advanced: { slotId: 'settings_advanced', componentKey: 'SystemModalContent' },
};

const routeSlotIds = new Map<string, string>();
for (const route of settingsControlPlane?.ordinary_routes ?? []) {
  routeSlotIds.set(route.id, route.slot_id);
}
for (const page of settingsControlPlane?.secondary_pages ?? []) {
  routeSlotIds.set(page.id, page.slot_id);
}

function normalizeWrapperPolicy(value: string | undefined): SettingsShellWrapperPolicy {
  if (value === 'host_provides_wrapper') return value;
  return 'host_provides_wrapper';
}

export function getSettingsRenderSlot(routeId: string): SettingsShellRenderSlot | null {
  const normalizedRouteId = normalizeOplSettingsTab(routeId);
  const slotId = routeSlotIds.get(normalizedRouteId) ?? fallbackRouteSlots[normalizedRouteId]?.slotId;
  if (!slotId) return null;

  const slotConfig = settingsControlPlane?.slot_registry?.[slotId];
  const fallback = fallbackRouteSlots[normalizedRouteId];
  const componentKey = slotConfig?.component_key ?? fallback?.componentKey;
  if (!componentKey) return null;

  return {
    id: slotId,
    routeId: normalizedRouteId,
    componentKey,
    wrapperPolicy: normalizeWrapperPolicy(slotConfig?.wrapper_policy),
    subrouteQueryParam: slotConfig?.subroute_query_param,
    legacySubroutes: slotConfig?.legacy_subroutes,
  };
}

export function getSettingsRenderSlots(): SettingsShellRenderSlot[] {
  return [...BUILTIN_TAB_IDS, ...OPL_SEARCHABLE_SECONDARY_TAB_IDS]
    .map((id) => getSettingsRenderSlot(id))
    .filter((slot): slot is SettingsShellRenderSlot => Boolean(slot));
}

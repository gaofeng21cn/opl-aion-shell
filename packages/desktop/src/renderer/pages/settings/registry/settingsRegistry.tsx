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
  getOplGuiSettingsSecondaryPageIds,
  getOplGuiSettingsVisibleTabs,
  type OplSettingsControlPlane,
  type OplSettingsControlPlaneRoute,
  type OplSettingsControlPlaneSecondaryPage,
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

const settingsControlPlane = getOplGuiSettingsControlPlane();
const profileTabIds = getOplGuiSettingsVisibleTabs();
const secondaryPageIds = getOplGuiSettingsSecondaryPageIds();
const ordinaryRoutes = settingsControlPlane?.ordinary_routes ?? [];
const contractSecondaryPages = settingsControlPlane?.secondary_pages ?? [];
const shellSecondaryPages: OplSettingsControlPlaneSecondaryPage[] = contractSecondaryPages.some(
  (page) => page.id === 'resources'
)
  ? []
  : [
      {
        id: 'resources',
        path: '/settings/resources',
        ia_group: 'setup_access',
        slot_id: 'settings_resources',
        visibility: 'secondary_or_deep_link',
      },
    ];
const secondaryPages = [...contractSecondaryPages, ...shellSecondaryPages];
const ordinaryRoutesById = new Map(ordinaryRoutes.map((route) => [route.id, route]));
const secondaryPagesById = new Map(secondaryPages.map((page) => [page.id, page]));

export const BUILTIN_TAB_IDS = APP_SETTINGS_TOP_LEVEL_TAB_IDS.filter((id) => profileTabIds.includes(id));

export type BuiltinSettingsTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

export const OPL_SEARCHABLE_SECONDARY_TAB_IDS = secondaryPages
  .filter((page) => secondaryPageIds.includes(page.id) && page.visibility === 'secondary_or_deep_link')
  .map((page) => page.id);

export const SETTINGS_DEFAULT_ROUTE = settingsControlPlane?.default_route ?? '/settings/general';

export const SETTINGS_ROUTE_PATHS: Record<string, string> = Object.fromEntries(
  [...ordinaryRoutes, ...secondaryPages].map((route) => [route.id, route.path])
);

const pathToSettingsRoute = (path: string): string => {
  const normalized = path.trim();
  return normalized.startsWith('/settings/') || normalized === '/settings' ? normalized : SETTINGS_DEFAULT_ROUTE;
};

const parseSettingsRouteTarget = (routeId: string): { routeId: string; queryParams: Record<string, string> } => {
  const [baseRouteId, query = ''] = routeId.split('?', 2);
  return {
    routeId: baseRouteId,
    queryParams: Object.fromEntries(new URLSearchParams(query).entries()),
  };
};

const routePathFor = (routeId: string): string => {
  const routeTarget = parseSettingsRouteTarget(routeId);
  const route = ordinaryRoutesById.get(routeTarget.routeId);
  const query = new URLSearchParams(routeTarget.queryParams).toString();
  const suffix = query ? `?${query}` : '';
  if (route) return `${pathToSettingsRoute(route.path)}${suffix}`;
  const page = secondaryPagesById.get(routeTarget.routeId);
  if (page) return `${pathToSettingsRoute(page.path)}${suffix}`;
  return SETTINGS_DEFAULT_ROUTE;
};

export function getOplGuiLegacySettingsRouteRedirects(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(settingsControlPlane?.legacy_route_redirects ?? {}).map(([legacyId, targetId]) => [
      legacyId,
      routePathFor(targetId),
    ])
  );
}

export const LEGACY_SETTINGS_ROUTE_REDIRECTS = getOplGuiLegacySettingsRouteRedirects();

export const LEGACY_SETTINGS_ANCHOR_REMAP: Record<string, string> = settingsControlPlane?.extension_anchor_remap
  ? { ...settingsControlPlane.extension_anchor_remap }
  : {};
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

const controlPlaneLabelKeys = Object.fromEntries(ordinaryRoutes.map((route) => [route.id, route.label_key]));

export const OPL_SETTINGS_TAB_LABEL_KEYS: Record<string, string> = {
  ...controlPlaneLabelKeys,
};

const controlPlaneDefaultLabels = Object.fromEntries(ordinaryRoutes.map((route) => [route.id, route.default_label_en]));

export const OPL_SETTINGS_TAB_DEFAULT_LABELS: Record<string, string> = {
  ...controlPlaneDefaultLabels,
};

export const OPL_SETTINGS_SEARCH_TERMS: Record<string, string[]> = {
  general: ['overview', 'status', 'next step', 'workspace', 'model', 'maintenance', 'capabilities', 'remote access'],
  access: ['setup', 'access', 'model', 'account', 'api key', 'web', 'remote'],
  resources: ['resources', 'connections', 'docker', 'webui', 'workspace', 'cloud', 'hosted', 'external'],
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
  const route = ordinaryRoutesById.get(tabId);
  return t(OPL_SETTINGS_TAB_LABEL_KEYS[tabId] ?? `settings.${tabId}`, {
    defaultValue:
      OPL_SETTINGS_TAB_DEFAULT_LABELS[tabId] ?? route?.default_label_en ?? secondaryPagesById.get(tabId)?.id ?? tabId,
  });
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

export function getSettingsTabSearchText(tabId: string, label: string): string {
  const route = ordinaryRoutesById.get(tabId);
  const page = secondaryPagesById.get(tabId);
  return normalizeSearchText(
    [
      tabId,
      label,
      route?.default_label_en,
      route?.default_label_zh,
      route?.ia_group,
      route?.state_source,
      route?.refresh_source,
      page?.ia_group,
      page?.visibility,
      ...(OPL_SETTINGS_SEARCH_TERMS[tabId] ?? []),
    ].join(' ')
  );
}

export function getSettingsTabIcon(tabId: string, slot: SettingsIconSlot): React.ReactElement {
  const iconToken = ordinaryRoutesById.get(tabId)?.icon_token ?? tabId;
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
    return (
      modalIcons[iconToken] ?? modalIcons[tabId] ?? <Puzzle theme='outline' size='20' fill={iconColors.secondary} />
    );
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
  return siderIcons[iconToken] ?? siderIcons[tabId] ?? <Puzzle />;
}

export function resolveLegacySettingsAnchor(anchor: string): string {
  return LEGACY_SETTINGS_ANCHOR_REMAP[anchor] ?? anchor;
}

export function resolveLegacySettingsRoute(tabId: string): string {
  return LEGACY_SETTINGS_ROUTE_REDIRECTS[tabId] ?? routePathFor(tabId);
}

export function normalizeOplSettingsTab(tabId: string): string {
  return LEGACY_SETTINGS_ANCHOR_REMAP[tabId] ?? tabId;
}

export type SettingsCapabilityDetailTab = 'skills' | 'tools';

const SETTINGS_CAPABILITY_DETAIL_TABS = new Set<string>(['skills', 'tools']);

const normalizeCapabilityDetailTab = (value: string | undefined): SettingsCapabilityDetailTab | null => {
  return value && SETTINGS_CAPABILITY_DETAIL_TABS.has(value) ? (value as SettingsCapabilityDetailTab) : null;
};

export type SettingsRenderTarget = {
  routeId: string;
  capabilitiesTab: SettingsCapabilityDetailTab;
};

export function resolveSettingsRenderTarget(tabId: string): SettingsRenderTarget {
  const routeTarget = parseSettingsRouteTarget(settingsControlPlane?.legacy_route_redirects?.[tabId] ?? tabId);
  const routeId = routeSlotIds.has(routeTarget.routeId)
    ? routeTarget.routeId
    : normalizeOplSettingsTab(routeTarget.routeId);
  const slot = getSettingsRenderSlot(routeId);
  const subrouteParam = slot?.subrouteQueryParam ?? 'tab';
  const tabFromRoute = normalizeCapabilityDetailTab(routeTarget.queryParams[subrouteParam]);
  const tabFromLegacySlot = normalizeCapabilityDetailTab(slot?.legacySubroutes?.[tabId]);

  return {
    routeId,
    capabilitiesTab: tabFromRoute ?? tabFromLegacySlot ?? 'skills',
  };
}

export function capabilityDetailTabFor(tabId: string): SettingsCapabilityDetailTab {
  return resolveSettingsRenderTarget(tabId).capabilitiesTab;
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
    const path = routePathFor(id).replace(/^\/settings\/?/, '');
    return {
      id,
      label,
      icon: getSettingsTabIcon(id, slot),
      path,
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

const routeSlotIds = new Map<string, string>();
for (const route of settingsControlPlane.ordinary_routes) {
  routeSlotIds.set(route.id, route.slot_id);
}
for (const page of secondaryPages) {
  routeSlotIds.set(page.id, page.slot_id);
}

type SettingsRouteComponentKey =
  | 'OverviewSettings'
  | 'WorkspaceSettings'
  | 'LocalServicesSettings'
  | 'AccessSettingsContent'
  | 'CapabilitiesSettingsContent'
  | 'RuntimeSettings'
  | 'StorageSettings'
  | 'AppearanceModalContent'
  | 'SystemModalContent';

const SHELL_SLOT_REGISTRY: OplSettingsControlPlane['slot_registry'] = {
  settings_resources: {
    component_key: 'AccessSettingsContent',
    wrapper_policy: 'host_provides_wrapper',
  },
};

const ROUTE_COMPONENT_KEYS = new Set<string>([
  'OverviewSettings',
  'WorkspaceSettings',
  'LocalServicesSettings',
  'AccessSettingsContent',
  'CapabilitiesSettingsContent',
  'RuntimeSettings',
  'StorageSettings',
  'AppearanceModalContent',
  'SystemModalContent',
]);

function normalizeWrapperPolicy(value: string | undefined): SettingsShellWrapperPolicy {
  if (value === 'host_provides_wrapper') return value;
  return 'host_provides_wrapper';
}

export function getSettingsRenderSlot(routeId: string): SettingsShellRenderSlot | null {
  const normalizedRouteId = routeSlotIds.has(routeId) ? routeId : normalizeOplSettingsTab(routeId);
  const slotId = routeSlotIds.get(normalizedRouteId);
  if (!slotId) return null;

  const slotConfig = settingsControlPlane.slot_registry[slotId] ?? SHELL_SLOT_REGISTRY[slotId];
  const componentKey = slotConfig?.component_key;
  if (!componentKey || !ROUTE_COMPONENT_KEYS.has(componentKey)) return null;

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
  return [...settingsControlPlane.ordinary_routes.map((route) => route.id), ...secondaryPages.map((page) => page.id)]
    .map((id) => getSettingsRenderSlot(id))
    .filter((slot): slot is SettingsShellRenderSlot => Boolean(slot));
}

export type SettingsRouteDefinition = {
  routeId: string;
  path: string;
  componentKey: SettingsRouteComponentKey;
};

function pathSegmentFor(settingsPath: string): string {
  return pathToSettingsRoute(settingsPath).replace(/^\/settings\/?/, '');
}

function routeDefinitionFrom(route: OplSettingsControlPlaneRoute | OplSettingsControlPlaneSecondaryPage) {
  const slot = getSettingsRenderSlot(route.id);
  if (!slot || !ROUTE_COMPONENT_KEYS.has(slot.componentKey)) return null;
  return {
    routeId: route.id,
    path: pathSegmentFor(route.path),
    componentKey: slot.componentKey as SettingsRouteComponentKey,
  };
}

export function getSettingsRouteDefinitions(): SettingsRouteDefinition[] {
  const seenPaths = new Set<string>();
  return [...settingsControlPlane.ordinary_routes, ...secondaryPages]
    .map(routeDefinitionFrom)
    .filter((definition): definition is SettingsRouteDefinition => {
      if (!definition || seenPaths.has(definition.path)) return false;
      seenPaths.add(definition.path);
      return true;
    });
}

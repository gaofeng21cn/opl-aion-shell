import {
  CloudStorage,
  DashboardOne,
  FolderOpen,
  HardDisk,
  Info,
  Key,
  Link,
  Puzzle,
  Robot,
  SettingConfig,
  Theme,
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

export const APP_SETTINGS_TOP_LEVEL_TAB_IDS = [
  'general',
  'gateway',
  'access',
  'workspace',
  'agents',
  'capabilities',
  'resources',
  'environment',
  'storage',
  'appearance',
] as const;

export type AppSettingsTopLevelTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

const settingsControlPlane = getOplGuiSettingsControlPlane();
const extensionTabMountAllowlist = new Set(
  Array.isArray(settingsControlPlane.extension_tab_policy.mount_allowlist)
    ? settingsControlPlane.extension_tab_policy.mount_allowlist.filter(
        (tabId): tabId is string => typeof tabId === 'string' && tabId.length > 0
      )
    : []
);

export function isOplExtensionSettingsTabMountable(tabId: string): boolean {
  return extensionTabMountAllowlist.has(tabId);
}
const profileTabIds = getOplGuiSettingsVisibleTabs();
const secondaryPageIds = getOplGuiSettingsSecondaryPageIds();
const ordinaryRoutes = settingsControlPlane?.ordinary_routes ?? [];
const contractSecondaryPages = settingsControlPlane?.secondary_pages ?? [];
const shellSecondaryPages: OplSettingsControlPlaneSecondaryPage[] = [];
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

const parseSettingsRouteTarget = (
  routeId: string
): { routeId: string; queryParams: Record<string, string>; anchor: string } => {
  const [routeAndQuery, anchor = ''] = routeId.split('#', 2);
  const [baseRouteId, query = ''] = routeAndQuery.split('?', 2);
  return {
    routeId: baseRouteId,
    queryParams: Object.fromEntries(new URLSearchParams(query).entries()),
    anchor,
  };
};

const routePathFor = (routeId: string): string => {
  const routeTarget = parseSettingsRouteTarget(routeId);
  const route = ordinaryRoutesById.get(routeTarget.routeId);
  const queryParams = new URLSearchParams(routeTarget.queryParams);
  if (routeTarget.anchor) {
    queryParams.set(settingsControlPlane.experience_contract.global_search.anchor_query_param, routeTarget.anchor);
  }
  const query = queryParams.toString();
  const suffix = query ? `?${query}` : '';
  if (route) return `${pathToSettingsRoute(route.path)}${suffix}`;
  const page = secondaryPagesById.get(routeTarget.routeId);
  if (page) return `${pathToSettingsRoute(page.path)}${suffix}`;
  return SETTINGS_DEFAULT_ROUTE;
};

export function getOplGuiLegacySettingsRouteRedirects(): Record<string, string> {
  const compatibilityRedirects = Object.fromEntries(
    Object.entries(settingsControlPlane.compatibility_redirects).map(([sourceId, redirect]) => [
      sourceId,
      routePathFor(`${redirect.target_route_id}#${redirect.anchor}`),
    ])
  );
  const legacyRedirects = Object.fromEntries(
    Object.entries(settingsControlPlane?.legacy_route_redirects ?? {}).map(([legacyId, targetId]) => [
      legacyId,
      routePathFor(targetId),
    ])
  );
  return { ...compatibilityRedirects, ...legacyRedirects };
}

export const LEGACY_SETTINGS_ROUTE_REDIRECTS = getOplGuiLegacySettingsRouteRedirects();

export const LEGACY_SETTINGS_ANCHOR_REMAP: Record<string, string> = settingsControlPlane?.extension_anchor_remap
  ? { ...settingsControlPlane.extension_anchor_remap }
  : {};
export const LEGACY_ANCHOR_REMAP = LEGACY_SETTINGS_ANCHOR_REMAP;

const controlPlaneLabelKeys = Object.fromEntries(ordinaryRoutes.map((route) => [route.id, route.label_key]));

export const OPL_SETTINGS_TAB_LABEL_KEYS: Record<string, string> = {
  ...controlPlaneLabelKeys,
};

const controlPlaneDefaultLabels = Object.fromEntries(ordinaryRoutes.map((route) => [route.id, route.default_label_en]));

export const OPL_SETTINGS_TAB_DEFAULT_LABELS: Record<string, string> = {
  ...controlPlaneDefaultLabels,
};

const settingsExperience = settingsControlPlane.experience_contract;
const settingsPageExperienceById = new Map(
  Object.values(settingsExperience.page_contracts).map((page) => [page.product_page_id, page])
);
const settingsSearchIndexEntries = settingsExperience.search_index.entries;

export const OPL_SETTINGS_SEARCH_TERMS: Record<string, string[]> = Object.fromEntries(
  Object.values(settingsExperience.page_contracts).map((page) => [
    page.route_id,
    settingsSearchIndexEntries
      .filter((entry) => entry.page_id === page.product_page_id)
      .flatMap((entry) => [entry.label_en, entry.label_zh, ...entry.keywords_en, ...entry.keywords_zh]),
  ])
);
export type SettingsSearchEntry = {
  id: string;
  pageId: string;
  pageLabel: string;
  itemLabel: string;
  resultLabel: string;
  path: string;
  anchor: string;
  searchText: string;
};

export function getSettingsSearchEntries(_t: TranslateFn, language = 'en'): SettingsSearchEntry[] {
  const useChinese = language.toLowerCase().startsWith('zh');
  return settingsSearchIndexEntries.flatMap((entry) => {
    const pageExperience = settingsPageExperienceById.get(entry.page_id);
    if (!pageExperience) return [];
    const routeId = pageExperience.route_id;
    if (!ordinaryRoutesById.has(routeId) && !secondaryPagesById.has(routeId)) return [];
    const pageLabel = useChinese ? pageExperience.label_zh : pageExperience.label_en;
    const itemLabel = useChinese ? entry.label_zh : entry.label_en;
    const route = routePathFor(`${routeId}#${entry.anchor}`).replace(/^\/settings\/?/, '');
    const routeMetadata = ordinaryRoutesById.get(routeId) ?? secondaryPagesById.get(routeId);
    const routeLabels = routeMetadata as Partial<OplSettingsControlPlaneRoute>;
    return [
      {
        id: entry.id,
        pageId: routeId,
        pageLabel,
        itemLabel,
        resultLabel: `${pageLabel} > ${itemLabel}`,
        path: route,
        anchor: entry.anchor,
        searchText: normalizeSearchText(
          [
            entry.page_id,
            routeId,
            pageLabel,
            routeLabels.default_label_en,
            routeLabels.default_label_zh,
            pageExperience.label_en,
            pageExperience.label_zh,
            entry.label_en,
            entry.label_zh,
            itemLabel,
            ...entry.keywords_en,
            ...entry.keywords_zh,
          ].join(' ')
        ),
      },
    ];
  });
}

export type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export type SettingsIconSlot = 'modal' | 'siderDesktop' | 'siderMobile';

type SettingsIconFactory = (size: number) => React.ReactElement;

const SETTINGS_ICON_PARK_ICONS: Record<string, SettingsIconFactory> = {
  dashboard: (size) => <DashboardOne theme='outline' size={size} />,
  general: (size) => <DashboardOne theme='outline' size={size} />,
  gateway: (size) => <CloudStorage theme='outline' size={size} />,
  access: (size) => <Key theme='outline' size={size} />,
  workspace: (size) => <FolderOpen theme='outline' size={size} />,
  agents: (size) => <Robot theme='outline' size={size} />,
  capabilities: (size) => <Puzzle theme='outline' size={size} />,
  resources: (size) => <Link theme='outline' size={size} />,
  maintenance: (size) => <Toolkit theme='outline' size={size} />,
  'local-services': (size) => <Toolkit theme='outline' size={size} />,
  environment: (size) => <Toolkit theme='outline' size={size} />,
  storage: (size) => <HardDisk theme='outline' size={size} />,
  appearance: (size) => <Theme theme='outline' size={size} />,
  advanced: (size) => <SettingConfig theme='outline' size={size} />,
  about: (size) => <Info theme='outline' size={size} />,
};

export function getSettingsTabLabel(tabId: string, t: TranslateFn, language = 'en'): string {
  const route = ordinaryRoutesById.get(tabId);
  const defaultLabel = language.toLowerCase().startsWith('zh') ? route?.default_label_zh : route?.default_label_en;
  return t(OPL_SETTINGS_TAB_LABEL_KEYS[tabId] ?? `settings.${tabId}`, {
    defaultValue: defaultLabel ?? OPL_SETTINGS_TAB_DEFAULT_LABELS[tabId] ?? secondaryPagesById.get(tabId)?.id ?? tabId,
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
      route?.scope,
      route?.intent,
      route?.risk,
      route?.frequency,
      page?.ia_group,
      page?.visibility,
      page?.scope,
      page?.intent,
      page?.risk,
      page?.frequency,
      ...(OPL_SETTINGS_SEARCH_TERMS[tabId] ?? []),
    ].join(' ')
  );
}

export function getSettingsTabIcon(tabId: string, _slot: SettingsIconSlot): React.ReactElement {
  const iconToken = ordinaryRoutesById.get(tabId)?.icon_token ?? tabId;
  const icon =
    SETTINGS_ICON_PARK_ICONS[iconToken] ?? SETTINGS_ICON_PARK_ICONS[tabId] ?? SETTINGS_ICON_PARK_ICONS.gateway;
  return (
    <span className='inline-flex text-t-secondary' aria-hidden='true'>
      {icon(16)}
    </span>
  );
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

export type SettingsCapabilityDetailTab = 'opl_flow_managed' | 'manual_and_third_party';

const SETTINGS_CAPABILITY_DETAIL_TABS = new Set<string>(['opl_flow_managed', 'manual_and_third_party']);

const normalizeCapabilityDetailTab = (value: string | undefined): SettingsCapabilityDetailTab | null => {
  if (value === 'opl-flow-managed') return 'opl_flow_managed';
  if (value === 'third-party' || value === 'skills' || value === 'tools' || value === 'assistants') {
    return 'manual_and_third_party';
  }
  return value && SETTINGS_CAPABILITY_DETAIL_TABS.has(value) ? (value as SettingsCapabilityDetailTab) : null;
};

export type SettingsRenderTarget = {
  routeId: string;
  capabilitiesTab: SettingsCapabilityDetailTab;
  anchor?: string;
};

export function resolveSettingsRenderTarget(tabId: string): SettingsRenderTarget {
  const compatibilityRedirect = settingsControlPlane.compatibility_redirects[tabId];
  const redirectTarget = compatibilityRedirect
    ? `${compatibilityRedirect.target_route_id}#${compatibilityRedirect.anchor}`
    : (settingsControlPlane.legacy_route_redirects[tabId] ?? tabId);
  const routeTarget = parseSettingsRouteTarget(redirectTarget);
  const routeId = routeSlotIds.has(routeTarget.routeId)
    ? routeTarget.routeId
    : normalizeOplSettingsTab(routeTarget.routeId);
  const slot = getSettingsRenderSlot(routeId);
  const subrouteParam = slot?.subrouteQueryParam ?? 'tab';
  const tabFromRoute = normalizeCapabilityDetailTab(routeTarget.queryParams[subrouteParam]);
  const tabFromAnchor = normalizeCapabilityDetailTab(routeTarget.anchor);
  const tabFromLegacySlot = normalizeCapabilityDetailTab(slot?.legacySubroutes?.[tabId]);

  return {
    routeId,
    capabilitiesTab: tabFromRoute ?? tabFromAnchor ?? tabFromLegacySlot ?? 'opl_flow_managed',
    ...(routeTarget.anchor ? { anchor: routeTarget.anchor } : {}),
  };
}

export function focusSettingsAnchor(anchor: string): boolean {
  const anchorElement = document.getElementById(anchor);
  if (!anchorElement) return false;
  const focusTarget = anchorElement.hasAttribute('aria-hidden')
    ? (anchorElement.closest<HTMLElement>('.opl-settings-section') ?? anchorElement)
    : anchorElement;
  focusTarget.scrollIntoView({ block: 'start' });
  if (focusTarget.tabIndex < 0) focusTarget.tabIndex = -1;
  focusTarget.focus({ preventScroll: true });
  return true;
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
  const classifiedExtensionTabs = extensionTabs.filter((tab) => isOplExtensionSettingsTabMountable(tab.id));
  const builtinIds = new Set(result.map((item) => item.id));
  const beforeMap = new Map<string, IExtensionSettingsTab[]>();
  const afterMap = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];

  for (const tab of classifiedExtensionTabs) {
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

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn, language = 'en'): SettingsNavItem[] {
  const slot: SettingsIconSlot = isDesktop ? 'siderDesktop' : 'siderMobile';
  return BUILTIN_TAB_IDS.map((id) => {
    const label = getSettingsTabLabel(id, t, language);
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
}: BuildNavOptions): SettingsNavItem[] {
  return buildSettingsItemsWithExtensions({
    builtinItems,
    extensionTabs,
    toExtensionItem: (tab) => {
      const label = resolveExtTabName(tab);
      return {
        id: tab.id,
        label,
        icon: <Puzzle theme='outline' size='16' />,
        isImageIcon: false,
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
      const label = resolveExtTabName(tab);
      return {
        id: tab.id,
        label,
        icon: <Puzzle theme='outline' size='16' />,
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
  | 'GatewaySettingsContent'
  | 'WorkspaceSettings'
  | 'LocalServicesSettings'
  | 'AccessSettingsContent'
  | 'ResourcesSettingsContent'
  | 'CapabilitiesSettingsContent'
  | 'AgentPackagesSettingsContent'
  | 'RuntimeSettings'
  | 'StorageSettings'
  | 'AppearanceModalContent'
  | 'AboutModalContent'
  | 'SystemModalContent';

const SHELL_SLOT_REGISTRY: OplSettingsControlPlane['slot_registry'] = {};

const ROUTE_COMPONENT_KEYS = new Set<string>([
  'OverviewSettings',
  'GatewaySettingsContent',
  'WorkspaceSettings',
  'LocalServicesSettings',
  'AccessSettingsContent',
  'ResourcesSettingsContent',
  'CapabilitiesSettingsContent',
  'AgentPackagesSettingsContent',
  'RuntimeSettings',
  'StorageSettings',
  'AppearanceModalContent',
  'AboutModalContent',
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

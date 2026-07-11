import {
  Communication,
  Computer,
  Dashboard,
  Earth,
  FolderOpen,
  Lightning,
  LinkCloud,
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
  'workspace',
  'capabilities',
  'resources',
  'environment',
  'storage',
  'appearance',
] as const;

export type AppSettingsTopLevelTabId = (typeof APP_SETTINGS_TOP_LEVEL_TAB_IDS)[number];

const settingsControlPlane = getOplGuiSettingsControlPlane();
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

const SETTINGS_ICON_COLORS: Record<string, string> = {
  general: 'var(--color-primary-6)',
  access: 'rgb(var(--green-6))',
  workspace: 'rgb(var(--cyan-6))',
  capabilities: 'rgb(var(--purple-6))',
  resources: 'rgb(var(--blue-6))',
  environment: 'rgb(var(--orange-6))',
  storage: 'rgb(var(--cyan-6))',
  appearance: 'rgb(var(--magenta-6))',
  advanced: 'rgb(var(--gray-6))',
  about: 'rgb(var(--blue-6))',
};

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

export function getSettingsTabIcon(tabId: string, slot: SettingsIconSlot): React.ReactElement {
  const iconToken = ordinaryRoutesById.get(tabId)?.icon_token ?? tabId;
  const iconColor = SETTINGS_ICON_COLORS[iconToken] ?? SETTINGS_ICON_COLORS[tabId] ?? iconColors.secondary;
  if (slot === 'modal') {
    const modalIcons: Record<string, React.ReactElement> = {
      general: <Computer theme='outline' size='20' fill={iconColor} />,
      workspace: <FolderOpen theme='outline' size='20' fill={iconColor} />,
      'local-services': <Toolkit theme='outline' size='20' fill={iconColor} />,
      resources: <LinkCloud theme='outline' size='20' fill={iconColor} />,
      environment: <Toolkit theme='outline' size='20' fill={iconColor} />,
      storage: <Toolkit theme='outline' size='20' fill={iconColor} />,
      capabilities: <Lightning theme='outline' size='20' fill={iconColor} />,
      access: <Earth theme='outline' size='20' fill={iconColor} />,
      appearance: <SwitchThemes theme='outline' size='20' fill={iconColor} />,
      advanced: <SettingConfig theme='outline' size='20' fill={iconColor} />,
    };
    return modalIcons[iconToken] ?? modalIcons[tabId] ?? <Puzzle theme='outline' size='20' fill={iconColor} />;
  }

  const siderIcons: Record<string, React.ReactElement> = {
    general: <Dashboard fill={iconColor} style={{ color: iconColor }} />,
    access:
      slot === 'siderDesktop' ? (
        <Earth fill={iconColor} style={{ color: iconColor }} />
      ) : (
        <Communication fill={iconColor} style={{ color: iconColor }} />
      ),
    workspace: <FolderOpen fill={iconColor} style={{ color: iconColor }} />,
    capabilities: <Lightning fill={iconColor} style={{ color: iconColor }} />,
    resources: <LinkCloud fill={iconColor} style={{ color: iconColor }} />,
    environment: <Toolkit fill={iconColor} style={{ color: iconColor }} />,
    storage: <Toolkit fill={iconColor} style={{ color: iconColor }} />,
    appearance: <SwitchThemes fill={iconColor} style={{ color: iconColor }} />,
    advanced: <System fill={iconColor} style={{ color: iconColor }} />,
  };
  return siderIcons[iconToken] ?? siderIcons[tabId] ?? <Puzzle fill={iconColor} style={{ color: iconColor }} />;
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
  const tabFromLegacySlot = normalizeCapabilityDetailTab(slot?.legacySubroutes?.[tabId]);

  return {
    routeId,
    capabilitiesTab: tabFromRoute ?? tabFromLegacySlot ?? 'skills',
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
  | 'ResourcesSettingsContent'
  | 'CapabilitiesSettingsContent'
  | 'RuntimeSettings'
  | 'StorageSettings'
  | 'AppearanceModalContent'
  | 'AboutModalContent'
  | 'SystemModalContent';

const SHELL_SLOT_REGISTRY: OplSettingsControlPlane['slot_registry'] = {};

const ROUTE_COMPONENT_KEYS = new Set<string>([
  'OverviewSettings',
  'WorkspaceSettings',
  'LocalServicesSettings',
  'AccessSettingsContent',
  'ResourcesSettingsContent',
  'CapabilitiesSettingsContent',
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

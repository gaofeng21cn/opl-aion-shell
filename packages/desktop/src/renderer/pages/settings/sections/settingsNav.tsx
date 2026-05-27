import {
  Communication,
  Dashboard,
  Earth,
  Info,
  Lightning,
  Puzzle,
  SwitchThemes,
  System,
  Toolkit,
} from '@icon-park/react';
import React from 'react';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { getOplGuiLegacySettingsRouteRedirects, getOplGuiSettingsVisibleTabs } from '@/common/config/oplProductProfile';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

export const BUILTIN_TAB_IDS = getOplGuiSettingsVisibleTabs() as [
  'overview',
  'runtime',
  'capabilities',
  'access',
  'appearance',
  'system',
  'about',
];

export type BuiltinSettingsTabId = (typeof BUILTIN_TAB_IDS)[number];

export const SETTINGS_DEFAULT_ROUTE = '/settings/overview';

export const SETTINGS_ROUTE_PATHS = Object.fromEntries(BUILTIN_TAB_IDS.map((id) => [id, `/settings/${id}`])) as Record<
  BuiltinSettingsTabId,
  string
>;

const legacyRedirectTargets = getOplGuiLegacySettingsRouteRedirects();

const redirectRouteFor = (legacyId: string, targetId: string): string => {
  if (legacyId === 'skills-hub') return '/settings/capabilities?tab=skills';
  if (legacyId === 'tools') return '/settings/capabilities?tab=tools';
  return `/settings/${targetId}`;
};

export const LEGACY_SETTINGS_ROUTE_REDIRECTS = Object.fromEntries(
  Object.entries(legacyRedirectTargets).map(([legacyId, targetId]) => [legacyId, redirectRouteFor(legacyId, targetId)])
);

export const LEGACY_SETTINGS_ANCHOR_REMAP = legacyRedirectTargets;
export const LEGACY_ANCHOR_REMAP = LEGACY_SETTINGS_ANCHOR_REMAP;

export const GROUP_HEADER_BEFORE: Record<BuiltinSettingsTabId, string | undefined> = {
  overview: 'settings.groupOverview',
  runtime: 'settings.groupRuntime',
  capabilities: undefined,
  access: 'settings.groupApp',
  appearance: undefined,
  system: undefined,
  about: 'settings.groupAbout',
};

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  path: string;
};

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

type BuildNavOptions = {
  builtinItems: SettingsNavItem[];
  extensionTabs: IExtensionSettingsTab[];
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
  extensionIconClassName: string;
};

const BUILTIN_TAB_ID_SET = new Set<string>(BUILTIN_TAB_IDS);

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn): SettingsNavItem[] {
  const builtinMap: Record<BuiltinSettingsTabId, SettingsNavItem> = {
    overview: {
      id: 'overview',
      label: t('settings.overview', { defaultValue: 'Overview' }),
      icon: <Dashboard />,
      path: 'overview',
    },
    runtime: {
      id: 'runtime',
      label: t('settings.runtime', { defaultValue: 'Runtime' }),
      icon: <Toolkit />,
      path: 'runtime',
    },
    capabilities: {
      id: 'capabilities',
      label: t('settings.capabilities', { defaultValue: 'Capabilities' }),
      icon: <Lightning />,
      path: 'capabilities',
    },
    access: {
      id: 'access',
      label: t('settings.access', { defaultValue: 'Access' }),
      icon: isDesktop ? <Earth /> : <Communication />,
      path: 'access',
    },
    appearance: {
      id: 'appearance',
      label: t('settings.appearance', { defaultValue: 'Appearance' }),
      icon: <SwitchThemes />,
      path: 'appearance',
    },
    system: {
      id: 'system',
      label: t('settings.system'),
      icon: <System />,
      path: 'system',
    },
    about: {
      id: 'about',
      label: t('settings.about'),
      icon: <Info />,
      path: 'about',
    },
  };

  return BUILTIN_TAB_IDS.map((id) => builtinMap[id]);
}

export function buildSettingsNavItems({
  builtinItems,
  extensionTabs,
  resolveExtTabName,
  extensionIconClassName,
}: BuildNavOptions): SettingsNavItem[] {
  const result = [...builtinItems];
  const beforeMap = new Map<string, IExtensionSettingsTab[]>();
  const afterMap = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];

  for (const tab of extensionTabs) {
    const rawAnchor = tab.position?.relativeTo;
    const anchor = rawAnchor ? (LEGACY_SETTINGS_ANCHOR_REMAP[rawAnchor] ?? rawAnchor) : undefined;
    if (!anchor || !BUILTIN_TAB_ID_SET.has(anchor)) {
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

  const toNavItem = (tab: IExtensionSettingsTab): SettingsNavItem => {
    const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
    return {
      id: tab.id,
      label: resolveExtTabName(tab),
      icon: resolvedIcon ? <img src={resolvedIcon} alt='' className={extensionIconClassName} /> : <Puzzle />,
      isImageIcon: Boolean(resolvedIcon),
      path: `ext/${tab.id}`,
    };
  };

  for (let i = result.length - 1; i >= 0; i--) {
    const id = result[i].id;
    const afters = afterMap.get(id);
    if (afters) result.splice(i + 1, 0, ...afters.map(toNavItem));
    const befores = beforeMap.get(id);
    if (befores) result.splice(i, 0, ...befores.map(toNavItem));
  }

  if (unanchored.length > 0) {
    const systemIdx = result.findIndex((item) => item.id === 'system');
    const insertIdx = systemIdx >= 0 ? systemIdx : result.length;
    result.splice(insertIdx, 0, ...unanchored.map(toNavItem));
  }

  return result;
}

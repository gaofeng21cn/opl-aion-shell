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
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';

export const BUILTIN_TAB_IDS = [
  'overview',
  'runtime',
  'capabilities',
  'access',
  'appearance',
  'system',
  'about',
] as const;

export type BuiltinSettingsTabId = (typeof BUILTIN_TAB_IDS)[number];

export const SETTINGS_DEFAULT_ROUTE = '/settings/overview';

export const SETTINGS_ROUTE_PATHS: Record<BuiltinSettingsTabId, string> = {
  overview: '/settings/overview',
  runtime: '/settings/runtime',
  capabilities: '/settings/capabilities',
  access: '/settings/access',
  appearance: '/settings/appearance',
  system: '/settings/system',
  about: '/settings/about',
};

export const LEGACY_SETTINGS_ANCHOR_REMAP: Record<string, BuiltinSettingsTabId> = {
  gemini: 'capabilities',
  model: 'runtime',
  assistants: 'capabilities',
  agent: 'runtime',
  'skills-hub': 'capabilities',
  tools: 'capabilities',
  personalization: 'appearance',
  display: 'appearance',
  pet: 'appearance',
  webui: 'access',
  opl: 'runtime',
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

export const GROUP_HEADER_BEFORE: Record<BuiltinSettingsTabId, string | undefined> = {
  overview: 'settings.groupOverview',
  runtime: 'settings.groupRuntime',
  capabilities: undefined,
  access: 'settings.groupApp',
  appearance: undefined,
  system: undefined,
  about: 'settings.groupAbout',
};

const BUILTIN_TAB_ID_SET = new Set<string>(BUILTIN_TAB_IDS);

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn): SettingsNavItem[] {
  return [
    {
      id: 'overview',
      label: t('settings.overview', { defaultValue: 'Overview' }),
      icon: <Dashboard />,
      path: 'overview',
    },
    {
      id: 'runtime',
      label: t('settings.runtime', { defaultValue: 'Runtime' }),
      icon: <Toolkit />,
      path: 'runtime',
    },
    {
      id: 'capabilities',
      label: t('settings.capabilities', { defaultValue: 'Capabilities' }),
      icon: <Lightning />,
      path: 'capabilities',
    },
    {
      id: 'access',
      label: t('settings.access', { defaultValue: 'Access' }),
      icon: isDesktop ? <Earth /> : <Communication />,
      path: 'access',
    },
    {
      id: 'appearance',
      label: t('settings.appearance', { defaultValue: 'Appearance' }),
      icon: <SwitchThemes />,
      path: 'appearance',
    },
    {
      id: 'system',
      label: t('settings.system'),
      icon: <System />,
      path: 'system',
    },
    {
      id: 'about',
      label: t('settings.about'),
      icon: <Info />,
      path: 'about',
    },
  ];
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
    const rawAnchor = tab.position?.anchor;
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

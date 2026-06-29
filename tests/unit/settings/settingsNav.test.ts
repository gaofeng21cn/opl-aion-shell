import { describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_TAB_IDS,
  LEGACY_SETTINGS_ROUTE_REDIRECTS,
  SETTINGS_DEFAULT_ROUTE,
  buildSettingsNavItems,
  getBuiltinSettingsNavItems,
} from '@/renderer/pages/settings/sections/settingsNav';
import { buildSettingsModalMenuItems } from '@/renderer/pages/settings/registry/settingsRegistry';
import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplGuiSettingsControlPlane: () => null,
  getOplGuiSettingsVisibleTabs: () => [
    'general',
    'access',
    'capabilities',
    'environment',
    'storage',
    'appearance',
    'advanced',
    'about',
  ],
  getOplGuiSettingsSecondaryPageIds: () => ['about', 'update', 'theme', 'workspace', 'local-services'],
  getOplGuiLegacySettingsRouteRedirects: () => ({
    overview: 'general',
    runtime: 'environment',
    system: 'advanced',
    model: 'environment',
    agent: 'capabilities',
    assistants: 'capabilities',
    'skills-hub': 'capabilities',
    tools: 'capabilities',
    display: 'appearance',
    webui: 'access',
    pet: 'appearance',
    storage: 'storage',
    workspace: 'workspace',
    'local-services': 'local-services',
  }),
}));

const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

describe('settingsNav App-owned tabs', () => {
  it('exposes the ordinary Settings tabs in App product order', () => {
    expect(BUILTIN_TAB_IDS).toEqual([
      'general',
      'access',
      'capabilities',
      'environment',
      'storage',
      'appearance',
      'advanced',
    ]);
    expect(SETTINGS_DEFAULT_ROUTE).toBe('/settings/general');
    expect(getBuiltinSettingsNavItems(true, t).map((item) => item.label)).toEqual([
      'Overview',
      'Get Started',
      'Capabilities',
      'Maintenance',
      'Storage',
      'Preferences',
      'Advanced',
    ]);
  });

  it('redirects legacy settings routes to App-owned settings pages', () => {
    expect(LEGACY_SETTINGS_ROUTE_REDIRECTS).toEqual({
      overview: '/settings/general',
      runtime: '/settings/environment',
      workspace: '/settings/workspace',
      'local-services': '/settings/local-services',
      system: '/settings/advanced',
      model: '/settings/environment',
      agent: '/settings/capabilities',
      assistants: '/settings/capabilities',
      'skills-hub': '/settings/capabilities?tab=skills',
      tools: '/settings/capabilities?tab=tools',
      storage: '/settings/storage',
      display: '/settings/appearance',
      webui: '/settings/access',
      pet: '/settings/appearance',
      about: '/settings/about',
    });
  });

  it('remaps legacy extension anchors before inserting extension settings tabs', () => {
    const extensionTabs: IExtensionSettingsTab[] = [
      {
        id: 'skills-extension',
        label: 'Skills Extension',
        url: 'https://example.test/skills',
        position: { relativeTo: 'skills-hub', placement: 'before' },
        order: 0,
        extensionName: 'Skills Pack',
      },
      {
        id: 'tools-extension',
        label: 'Tools Extension',
        url: 'https://example.test/tools',
        position: { relativeTo: 'tools', placement: 'after' },
        order: 1,
        extensionName: 'Tools Pack',
      },
    ];

    const items = buildSettingsNavItems({
      builtinItems: getBuiltinSettingsNavItems(true, t),
      extensionTabs,
      resolveExtTabName: (tab) => tab.label,
      extensionIconClassName: 'icon',
    }).map((item) => item.id);

    expect(items).toEqual([
      'general',
      'access',
      'skills-extension',
      'capabilities',
      'tools-extension',
      'environment',
      'storage',
      'appearance',
      'advanced',
    ]);
  });

  it('inserts unanchored extension settings before Advanced in page and modal hosts', () => {
    const extensionTabs: IExtensionSettingsTab[] = [
      {
        id: 'unanchored-extension',
        label: 'Unanchored Extension',
        url: 'https://example.test/unanchored',
        order: 0,
        extensionName: 'Diagnostics Pack',
      },
    ];

    const navIds = buildSettingsNavItems({
      builtinItems: getBuiltinSettingsNavItems(true, t),
      extensionTabs,
      resolveExtTabName: (tab) => tab.label,
      extensionIconClassName: 'icon',
    }).map((item) => item.id);
    const modalIds = buildSettingsModalMenuItems({
      extensionTabs,
      resolveExtTabName: (tab) => tab.label,
      t,
    }).map((item) => item.id);

    expect(navIds).toEqual([
      'general',
      'access',
      'capabilities',
      'environment',
      'storage',
      'appearance',
      'unanchored-extension',
      'advanced',
    ]);
    expect(modalIds).toEqual(navIds);
  });
});

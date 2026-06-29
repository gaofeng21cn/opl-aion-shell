import { describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_TAB_IDS,
  LEGACY_SETTINGS_ROUTE_REDIRECTS,
  SETTINGS_DEFAULT_ROUTE,
  buildSettingsNavItems,
  getBuiltinSettingsNavItems,
} from '@/renderer/pages/settings/sections/settingsNav';
import { buildSettingsModalMenuItems } from '@/renderer/pages/settings/registry/settingsRegistry';
import { getSettingsRenderSlot, getSettingsRenderSlots } from '@/renderer/pages/settings/registry/settingsRegistry';
import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';

const { controlPlane } = vi.hoisted(() => ({
  controlPlane: {
    default_route: '/settings/general',
    ordinary_routes: [
      {
        id: 'general',
        path: '/settings/general',
        label_key: 'settings.overview',
        default_label_en: 'Overview',
        slot_id: 'settings_general',
      },
      {
        id: 'access',
        path: '/settings/access',
        label_key: 'settings.onboarding',
        default_label_en: 'Setup & Access',
        slot_id: 'settings_access',
      },
      {
        id: 'capabilities',
        path: '/settings/capabilities',
        label_key: 'settings.capabilities',
        default_label_en: 'Capabilities',
        slot_id: 'settings_capabilities',
      },
      {
        id: 'environment',
        path: '/settings/environment',
        label_key: 'settings.maintenance',
        default_label_en: 'Maintenance & Updates',
        slot_id: 'settings_environment',
      },
      {
        id: 'storage',
        path: '/settings/storage',
        label_key: 'settings.storage',
        default_label_en: 'Data & Storage',
        slot_id: 'settings_storage',
      },
      {
        id: 'appearance',
        path: '/settings/appearance',
        label_key: 'settings.preferences',
        default_label_en: 'Preferences',
        slot_id: 'settings_theme',
      },
      {
        id: 'advanced',
        path: '/settings/advanced',
        label_key: 'settings.advanced',
        default_label_en: 'Advanced',
        slot_id: 'settings_advanced',
      },
    ],
    secondary_pages: [
      { id: 'workspace', path: '/settings/workspace', ia_group: 'overview', slot_id: 'workspace' },
      { id: 'local-services', path: '/settings/local-services', ia_group: 'maintenance', slot_id: 'local_services' },
    ],
    extension_anchor_remap: {
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
      about: 'advanced',
    },
    slot_registry: {
      settings_general: { component_key: 'OverviewSettings', wrapper_policy: 'host_provides_wrapper' },
      settings_access: { component_key: 'AccessSettingsContent', wrapper_policy: 'host_provides_wrapper' },
      settings_capabilities: {
        component_key: 'CapabilitiesSettingsContent',
        wrapper_policy: 'host_provides_wrapper',
        subroute_query_param: 'tab',
        legacy_subroutes: { 'skills-hub': 'skills', tools: 'tools' },
      },
      settings_environment: { component_key: 'RuntimeSettings', wrapper_policy: 'host_provides_wrapper' },
      settings_storage: { component_key: 'StorageSettings', wrapper_policy: 'host_provides_wrapper' },
      settings_theme: { component_key: 'AppearanceModalContent', wrapper_policy: 'host_provides_wrapper' },
      settings_advanced: { component_key: 'SystemModalContent', wrapper_policy: 'host_provides_wrapper' },
      workspace: { component_key: 'WorkspaceSettings', wrapper_policy: 'host_provides_wrapper' },
      local_services: { component_key: 'LocalServicesSettings', wrapper_policy: 'host_provides_wrapper' },
    },
  },
}));

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplGuiSettingsControlPlane: () => controlPlane,
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
      'Setup & Access',
      'Capabilities',
      'Maintenance & Updates',
      'Data & Storage',
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
      about: '/settings/advanced',
    });
  });

  it('keeps legacy tabs out of ordinary Settings host slots', () => {
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).toEqual([
      'general',
      'access',
      'capabilities',
      'environment',
      'storage',
      'appearance',
      'advanced',
      'workspace',
      'local-services',
    ]);
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).not.toContain('runtime');
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).not.toContain('tools');
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).not.toContain('about');
  });

  it('maps App route ids to explicit Settings shell render slots', () => {
    expect(getSettingsRenderSlot('general')).toMatchObject({
      id: 'settings_general',
      routeId: 'general',
      componentKey: 'OverviewSettings',
      wrapperPolicy: 'host_provides_wrapper',
    });
    expect(getSettingsRenderSlot('webui')).toMatchObject({
      id: 'settings_access',
      routeId: 'access',
      componentKey: 'AccessSettingsContent',
      wrapperPolicy: 'host_provides_wrapper',
    });
    expect(getSettingsRenderSlot('tools')).toMatchObject({
      id: 'settings_capabilities',
      routeId: 'capabilities',
      componentKey: 'CapabilitiesSettingsContent',
      subrouteQueryParam: 'tab',
      legacySubroutes: { 'skills-hub': 'skills', tools: 'tools' },
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

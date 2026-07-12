import { describe, expect, it, vi } from 'vitest';
import {
  BUILTIN_TAB_IDS,
  LEGACY_SETTINGS_ROUTE_REDIRECTS,
  SETTINGS_DEFAULT_ROUTE,
  buildSettingsNavItems,
  getBuiltinSettingsNavItems,
  getSettingsTabSearchText,
} from '@/renderer/pages/settings/sections/settingsNav';
import { buildSettingsModalMenuItems } from '@/renderer/pages/settings/registry/settingsRegistry';
import {
  capabilityDetailTabFor,
  getSettingsRenderSlot,
  getSettingsRenderSlots,
  resolveSettingsRenderTarget,
} from '@/renderer/pages/settings/registry/settingsRegistry';
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
        id: 'workspace',
        path: '/settings/workspace',
        label_key: 'settings.workspace',
        default_label_en: 'Workspace',
        default_label_zh: '工作区',
        icon_token: 'workspace',
        ia_group: 'overview',
        slot_id: 'workspace',
        state_source: 'opl app state --profile fast --json',
        refresh_source: 'opl app state --profile fast --json',
        scope: 'selected_workspace',
        intent: 'configure_and_inspect_paths_permissions_and_artifact_roots',
        risk: 'read_only_or_reversible_local_path_actions',
        frequency: 'first_run_and_project_switching',
      },
      {
        id: 'capabilities',
        path: '/settings/capabilities',
        label_key: 'settings.capabilities',
        default_label_en: 'Capabilities',
        slot_id: 'settings_capabilities',
      },
      {
        id: 'resources',
        path: '/settings/resources',
        label_key: 'settings.resources',
        default_label_en: 'Resources & Connections',
        slot_id: 'settings_resources',
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
        id: 'personalization',
        path: '/settings/personalization',
        label_key: 'settings.personalizationNav',
        default_label_en: 'Personalization',
        slot_id: 'settings_personalization',
      },
    ],
    secondary_pages: [
      {
        id: 'advanced',
        path: '/settings/advanced',
        ia_group: 'advanced',
        slot_id: 'settings_advanced',
        visibility: 'secondary_or_deep_link',
      },
      {
        id: 'about',
        path: '/settings/about',
        ia_group: 'advanced',
        slot_id: 'about',
        visibility: 'secondary_or_deep_link',
      },
    ],
    compatibility_redirects: {
      update: {
        target_route_id: 'environment',
        anchor: 'updates',
      },
      theme: {
        target_route_id: 'appearance',
        anchor: 'themes',
      },
      'local-services': {
        target_route_id: 'environment',
        anchor: 'services',
      },
    },
    experience_contract: {
      global_search: {
        anchor_query_param: 'section',
      },
      page_contracts: {},
      search_index: {
        entries: [],
      },
    },
    legacy_route_redirects: {
      overview: 'general',
      runtime: 'environment',
      system: 'advanced',
      model: 'environment',
      agent: 'capabilities',
      assistants: 'capabilities?tab=skills',
      'skills-hub': 'capabilities?tab=skills',
      tools: 'capabilities?tab=tools',
      display: 'appearance',
      webui: 'resources',
      pet: 'appearance',
    },
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
      webui: 'resources',
      pet: 'appearance',
      about: 'advanced',
    },
    extension_tab_policy: {
      default_visibility: 'hidden_until_app_classified',
      mount_allowlist: ['skills-extension', 'tools-extension'],
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
      settings_personalization: {
        component_key: 'PersonalizationSettingsContent',
        wrapper_policy: 'host_provides_wrapper',
      },
      settings_advanced: { component_key: 'SystemModalContent', wrapper_policy: 'host_provides_wrapper' },
      settings_resources: { component_key: 'ResourcesSettingsContent', wrapper_policy: 'host_provides_wrapper' },
      about: { component_key: 'SystemModalContent', wrapper_policy: 'host_provides_wrapper' },
      update: { component_key: 'RuntimeSettings', wrapper_policy: 'host_provides_wrapper' },
      workspace: { component_key: 'WorkspaceSettings', wrapper_policy: 'host_provides_wrapper' },
      local_services: { component_key: 'LocalServicesSettings', wrapper_policy: 'host_provides_wrapper' },
    },
    state_action_policy: {
      default_state_source: 'opl app state --profile fast --json',
      default_refresh_source: 'opl app state --profile fast --json',
      full_profile_policy: 'diagnostic_or_release_evidence_only',
      action_route: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json',
      recommended_action_ids: {
        doctor: 'doctor',
        repair: 'repair',
      },
      shell_must_not_own: [
        'runtime truth',
        'provider implementation',
        'domain truth',
        'owner receipts',
        'release readiness',
      ],
    },
  },
}));

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplGuiSettingsControlPlane: () => controlPlane,
  getOplGuiSettingsVisibleTabs: () => [
    'general',
    'access',
    'workspace',
    'capabilities',
    'resources',
    'environment',
    'storage',
    'appearance',
    'personalization',
  ],
  getOplGuiSettingsSecondaryPageIds: () => ['advanced', 'about'],
}));

const t = (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key;

describe('settingsNav App-owned tabs', () => {
  it('exposes the ordinary Settings tabs in App product order', () => {
    expect(BUILTIN_TAB_IDS).toEqual([
      'general',
      'access',
      'workspace',
      'capabilities',
      'resources',
      'environment',
      'storage',
      'appearance',
      'personalization',
    ]);
    expect(SETTINGS_DEFAULT_ROUTE).toBe('/settings/general');
    expect(getBuiltinSettingsNavItems(true, t).map((item) => item.label)).toEqual([
      'Overview',
      'Setup & Access',
      'Workspace',
      'Capabilities',
      'Resources & Connections',
      'Maintenance & Updates',
      'Data & Storage',
      'Preferences',
      'Personalization',
    ]);
  });

  it('redirects legacy settings routes to App-owned settings pages', () => {
    expect(LEGACY_SETTINGS_ROUTE_REDIRECTS).toEqual({
      update: '/settings/environment?section=updates',
      theme: '/settings/appearance?section=themes',
      'local-services': '/settings/environment?section=services',
      overview: '/settings/general',
      runtime: '/settings/environment',
      system: '/settings/advanced',
      model: '/settings/environment',
      agent: '/settings/capabilities',
      assistants: '/settings/capabilities?tab=skills',
      'skills-hub': '/settings/capabilities?tab=skills',
      tools: '/settings/capabilities?tab=tools',
      display: '/settings/appearance',
      webui: '/settings/resources',
      pet: '/settings/appearance',
    });
  });

  it('keeps legacy tabs out of ordinary Settings host slots', () => {
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).toEqual([
      'general',
      'access',
      'workspace',
      'capabilities',
      'resources',
      'environment',
      'storage',
      'appearance',
      'personalization',
      'advanced',
      'about',
    ]);
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).not.toContain('runtime');
    expect(getSettingsRenderSlots().map((slot) => slot.routeId)).not.toContain('tools');
    expect(getSettingsRenderSlot('about')).toMatchObject({
      id: 'about',
      routeId: 'about',
      componentKey: 'SystemModalContent',
      wrapperPolicy: 'host_provides_wrapper',
    });
  });

  it('maps App route ids to explicit Settings shell render slots', () => {
    expect(getSettingsRenderSlot('general')).toMatchObject({
      id: 'settings_general',
      routeId: 'general',
      componentKey: 'OverviewSettings',
      wrapperPolicy: 'host_provides_wrapper',
    });
    expect(getSettingsRenderSlot('webui')).toMatchObject({
      id: 'settings_resources',
      routeId: 'resources',
      componentKey: 'ResourcesSettingsContent',
      wrapperPolicy: 'host_provides_wrapper',
    });
    expect(getSettingsRenderSlot('tools')).toMatchObject({
      id: 'settings_capabilities',
      routeId: 'capabilities',
      componentKey: 'CapabilitiesSettingsContent',
      subrouteQueryParam: 'tab',
      legacySubroutes: { 'skills-hub': 'skills', tools: 'tools' },
    });
    expect(getSettingsRenderSlot('appearance')).toMatchObject({
      id: 'settings_theme',
      routeId: 'appearance',
      componentKey: 'AppearanceModalContent',
      wrapperPolicy: 'host_provides_wrapper',
    });
    expect(getSettingsRenderSlot('theme')).toBeNull();
    expect(resolveSettingsRenderTarget('theme')).toEqual({
      routeId: 'appearance',
      capabilitiesTab: 'skills',
      anchor: 'themes',
    });
    expect(resolveSettingsRenderTarget('update').anchor).toBe('updates');
    expect(resolveSettingsRenderTarget('local-services').anchor).toBe('services');
    expect(getSettingsRenderSlot('workspace')).toMatchObject({
      id: 'workspace',
      routeId: 'workspace',
      componentKey: 'WorkspaceSettings',
      wrapperPolicy: 'host_provides_wrapper',
    });
    expect(getSettingsRenderSlot('resources')).toMatchObject({
      id: 'settings_resources',
      routeId: 'resources',
      componentKey: 'ResourcesSettingsContent',
      wrapperPolicy: 'host_provides_wrapper',
    });
  });

  it('derives capabilities detail tabs from App control-plane legacy subroutes', () => {
    expect(resolveSettingsRenderTarget('skills-hub')).toEqual({
      routeId: 'capabilities',
      capabilitiesTab: 'skills',
    });
    expect(resolveSettingsRenderTarget('tools')).toEqual({
      routeId: 'capabilities',
      capabilitiesTab: 'tools',
    });
    expect(resolveSettingsRenderTarget('assistants')).toEqual({
      routeId: 'capabilities',
      capabilitiesTab: 'skills',
    });
    expect(capabilityDetailTabFor('tools')).toBe('tools');
    expect(capabilityDetailTabFor('capabilities')).toBe('skills');
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
      'workspace',
      'skills-extension',
      'capabilities',
      'tools-extension',
      'resources',
      'environment',
      'storage',
      'appearance',
      'personalization',
    ]);
  });

  it('hides unclassified extension settings from page and modal hosts', () => {
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
      'workspace',
      'capabilities',
      'resources',
      'environment',
      'storage',
      'appearance',
      'personalization',
    ]);
    expect(modalIds).toEqual(navIds);
  });

  it('includes route metadata in Settings search text', () => {
    expect(getSettingsTabSearchText('workspace', 'Workspace')).toContain('selected_workspace');
    expect(getSettingsTabSearchText('workspace', 'Workspace')).toContain('project_switching');
  });
});

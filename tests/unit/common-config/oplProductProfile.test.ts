import { afterEach, describe, expect, it, vi } from 'vitest';
import generatedProfile from '@/common/config/oplProductProfile/oplProductProfile.generated.json';
import {
  getOplCommandLineToolsInstallMessage,
  getOplCodexDefaultPermissionMode,
  getOplCodexModelDisplayOptions,
  getOplFlowContextPolicy,
  getOplProductDisplayName,
  getOplOrdinaryChromeName,
  getOplGlobalFeedbackIssueUrl,
  getOplDefaultExecutorAgentKey,
  getOplHomeComposerStateContract,
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  getOplCodexAutoModelPolicy,
  getOplDeferredFirstLaunchBlockers,
  getOplDeveloperProfileSettings,
  getOplGuiDefaultCssThemeId,
  getOplGuiSettingsControlPlane,
  getOplGuiLegacySettingsRouteRedirects,
  getOplGuiSettingsSecondaryPageIds,
  getOplGuiSettingsVisibleTabs,
  getOplPostLoginSetupCheckTimeoutMs,
  getOplSettingsControlPlaneActionContract,
  getOplSettingsUserNavigationProjection,
  getOplHomeModelStatusLabel,
  getOplModelStatusDisplayText,
  getOplRuntimeEnvironmentItems,
  filterOplOrdinaryMcpServers,
  filterOplOrdinaryMcpStatuses,
  filterOplOrdinarySkillCatalog,
  filterOplOrdinarySkillNames,
  filterOplOrdinarySessionMcpServers,
  getOplNewConversationAdditionalInstructionsPolicy,
  getOplOrdinaryCapabilitySelectorPolicy,
  getOplOrdinaryForbiddenCapabilityPolicy,
  getOplReadyToLaunchCoreItems,
  getOplReadyToLaunchNonBlockingItems,
  getOplRetiredCodexModels,
  getOplScheduledTasksPolicy,
  isOplCodexCliFixedExecutor,
  isOplForbiddenTeamMcpName,
  OPL_PRODUCT_PROFILE,
  sanitizeOplOrdinaryConversationExtra,
  shouldDefaultCodexCssTheme,
  shouldShowOplCodexModelAutoOption,
  shouldShowOplCodexModelList,
  shouldShowOplCodexModelSelector,
  shouldShowOplConversationBackendSelector,
  shouldShowOplConversationModelSelector,
  shouldShowOplConversationPermissionModeSelector,
  shouldShowOplHomeExecutorSelector,
  shouldShowOplHomePermissionModeSelector,
} from '@/common/config/oplProductProfile';
import {
  buildCodexDefaultModelInfo,
  DEFAULT_CODEX_MODEL_DISPLAY_LABEL,
  DEFAULT_CODEX_MODEL_ID,
  DEFAULT_CODEX_MODEL_WITH_REASONING_ID,
  DEFAULT_CODEX_MODELS,
  DEFAULT_CODEX_REASONING_EFFORT,
  resolveOplCodexAutoSelection,
  selectDefaultCodexModelId,
} from '@/common/types/codex/codexModels';
import { migrateThemeConfig } from '@/common/theme/migrateThemeConfig';
import { LIGHT_THEME_ID } from '@/common/theme/constants';

describe('OPL generated product profile', () => {
  afterEach(() => {
    vi.doUnmock('@/common/config/oplProductProfile/oplProductProfile.generated.json');
  });

  it('exposes the App-owned visible product name', () => {
    expect(OPL_PRODUCT_PROFILE.schema_version).toBe(2);
    expect(getOplProductDisplayName()).toBe('One Person Lab App');
    expect(OPL_PRODUCT_PROFILE.product.display_name).toBe('One Person Lab App');
    expect(getOplOrdinaryChromeName()).toBe('One Person Lab');
    expect(OPL_PRODUCT_PROFILE.product.ordinary_chrome_name).toBe('One Person Lab');
    expect(getOplGlobalFeedbackIssueUrl()).toBe('https://github.com/gaofeng21cn/one-person-lab-app/issues/new');
    expect(
      OPL_PRODUCT_PROFILE.first_run.beginner_presentation.post_install_ai_self_check_entry.target_state_checks
    ).toContain('user_authored_additional_instructions_optional_and_never_generated');
  });

  it('exposes the App-owned post-login setup check timeout', () => {
    expect(getOplPostLoginSetupCheckTimeoutMs()).toBe(20_000);
  });

  it('exposes one App-owned Scheduled Tasks policy without a second scheduler or executor selector', () => {
    expect(getOplScheduledTasksPolicy()).toEqual({
      owner: 'app_automation_surface',
      cron_skill_packaged: false,
      exposure: 'automation_page_and_task_routing',
      product_policy_ref: 'contracts/app-gui-product-contract.json#scheduled_tasks_policy',
      route: '/scheduled',
      scheduler_authority: 'active_carrier_native_scheduler_and_store',
      single_scheduler_store_required: true,
      ordinary_sider_entry_visible: true,
      executor: 'codex_cli',
      executor_selector_visible: false,
    });
  });

  it('exposes the App-owned account avatar and titlebar help icon policies', () => {
    expect(OPL_PRODUCT_PROFILE.gui.home.utility_icon_policy).toMatchObject({
      library: 'icon_park_react_for_opl_owned_utility_icons',
      opl_owned_settings_navigation_and_overview: 'icon_park_react_outline_16px_monochrome',
      settings_icon_geometry: 'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar',
      icon_text_action_geometry: {
        icon_size_px: 16,
        icon_slot_px: 20,
        icon_background: 'transparent_none',
        alignment: 'icon_slot_and_label_share_one_vertical_centerline',
      },
    });
    expect(OPL_PRODUCT_PROFILE.gui.home.utility_icon_policy.account_identity_avatar).toEqual({
      shape: 'circle',
      background: 'semantic_success_green',
      foreground: 'inverse',
      han_name_initials: 'first_han_character_only',
      non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints',
      email_fallback_initials: 'first_two_local_part_codepoints_uppercase',
      empty_fallback: 'OP',
    });
    expect(OPL_PRODUCT_PROFILE.gui.home.utility_icon_policy.global_feedback_action).toMatchObject({
      icon: 'circle_question',
      icon_style: 'regular_outline',
    });
  });

  it('exposes the App-generated Codex default model profile', () => {
    expect(getOplDefaultCodexModel()).toBe('gpt-5.6-sol');
    expect(getOplDefaultCodexReasoningEffort()).toBe('max');
    expect(DEFAULT_CODEX_MODEL_ID).toBe('gpt-5.6-sol');
    expect(DEFAULT_CODEX_REASONING_EFFORT).toBe('max');
    expect(DEFAULT_CODEX_MODEL_WITH_REASONING_ID).toBe('gpt-5.6-sol/max');
    expect(DEFAULT_CODEX_MODEL_DISPLAY_LABEL).toBe('5.6 Sol');
    expect(DEFAULT_CODEX_MODELS[0]?.id).toBe('gpt-5.6-sol');
    expect(DEFAULT_CODEX_MODELS[0]?.label).toBe('5.6 Sol');
    expect(DEFAULT_CODEX_MODELS.map((model) => model.id)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.2',
    ]);
    expect(DEFAULT_CODEX_MODELS.map((model) => model.id)).not.toEqual(
      expect.arrayContaining([
        'gpt-5.3-codex-spark',
        'gpt-5.3-codex',
        'gpt-5.2-codex',
        'gpt-5.1-codex-max',
        'gpt-5.1-codex-mini',
      ])
    );
  });

  it('accepts a future App-generated reasoning effort without a Shell allowlist change', async () => {
    const futureEffort = 'future-deep';
    const futureProfile = structuredClone(generatedProfile);
    futureProfile.default_session_profile.reasoning_effort = futureEffort;
    futureProfile.gui.home.codex_default_reasoning_effort = futureEffort;
    futureProfile.gui.home.codex_model_display_options.default_reasoning_effort = futureEffort;
    futureProfile.gui.home.codex_model_display_options.auto_option.catalog_unavailable_fallback_reasoning_effort =
      futureEffort;
    futureProfile.gui.home.codex_model_display_options.user_reasoning_effort_options.push(futureEffort);
    Object.assign(futureProfile.gui.home.codex_model_display_options.reasoning_labels, {
      [futureEffort]: { zh: '未来推理', en: 'Future reasoning' },
    });
    futureProfile.codex.default_reasoning_effort = futureEffort;
    futureProfile.codex.auto_model_policy.configured_default.reasoning_effort = futureEffort;
    futureProfile.codex.auto_model_policy.known_model_reasoning_effort_overrides['gpt-5.6-sol'] = futureEffort;
    futureProfile.codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort = futureEffort;

    vi.resetModules();
    vi.doMock('@/common/config/oplProductProfile/oplProductProfile.generated.json', () => ({
      default: futureProfile,
    }));
    const futureProfileModule = await import('@/common/config/oplProductProfile');

    expect(futureProfileModule.getOplDefaultCodexReasoningEffort()).toBe(futureEffort);
    expect(futureProfileModule.getOplCodexModelDisplayOptions().reasoning_labels[futureEffort]).toEqual({
      zh: '未来推理',
      en: 'Future reasoning',
    });
  });

  it('does not export retired Profile-derived Skill or session-route authorities', async () => {
    const profileModule = await import('@/common/config/oplProductProfile');

    expect(profileModule).not.toHaveProperty('getOplAssistantSkillProfiles');
    expect(profileModule).not.toHaveProperty('getOplAssistantSkillProfile');
    expect(profileModule).not.toHaveProperty('getOplOrdinarySkillAllowlist');
    expect(profileModule).not.toHaveProperty('getOplCodexSessionContext');
    expect(profileModule).not.toHaveProperty('getOplLegacyCodexSessionContexts');
    expect(profileModule).not.toHaveProperty('getOplAgentPackageInvocationReceiptPolicy');
    expect(profileModule).not.toHaveProperty('getOplBuiltinAssistantRouteReceiptPolicy');
    expect(profileModule).not.toHaveProperty('getOplFirstPartyPackagePresentations');
    expect(profileModule).not.toHaveProperty('getOplHomeAgentShortcuts');
  });

  it('keeps App-owned GUI defaults for theme, fixed Codex executor, and visible model controls', () => {
    expect(getOplDefaultExecutorAgentKey()).toBe('codex');
    expect(getOplGuiDefaultCssThemeId()).toBe('default-theme');
    expect(shouldDefaultCodexCssTheme()).toBe(false);
    expect(migrateThemeConfig({ theme: 'light', 'css.activeThemeId': '', 'css.themes': [] })['theme.activeId']).toBe(
      LIGHT_THEME_ID
    );
    expect(
      migrateThemeConfig({ theme: 'light', 'css.activeThemeId': 'codex', 'css.themes': [] })['theme.activeId']
    ).toBe(LIGHT_THEME_ID);
    expect(getOplCodexDefaultPermissionMode()).toBe('full-access');
    expect(isOplCodexCliFixedExecutor()).toBe(true);
    expect(shouldShowOplHomeExecutorSelector()).toBe(false);
    expect(shouldShowOplHomePermissionModeSelector()).toBe(true);
    expect(getOplHomeComposerStateContract()).toMatchObject({
      contract_id: 'opl_home_composer_state.v1',
      executor: 'codex',
      shortcut_package_membership_source_ref: 'app_state.agent_packages.directory.entries[package_role=standard_agent]',
      shortcut_preference_source_ref: 'app_state.agent_packages.status_index.home_shortcut_preferences[]',
      shortcut_availability_source_ref:
        'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.packages[].presence',
      unknown_standard_agent_allowed: true,
      invariants: {
        model_reasoning_visible: true,
        permission_access_visible: true,
        executor_selector_visible: false,
        active_shortcut_changes_executor: false,
        default_visibility_governs_execution: false,
      },
      semantic_probe: { failure_field: 'missing_controls' },
    });
    expect(shouldShowOplConversationBackendSelector()).toBe(false);
    expect(shouldShowOplConversationModelSelector()).toBe(true);
    expect(shouldShowOplConversationPermissionModeSelector()).toBe(true);
    expect(shouldShowOplCodexModelSelector()).toBe(true);
    expect(shouldShowOplCodexModelList()).toBe(true);
    expect(shouldShowOplCodexModelAutoOption()).toBe(true);
    expect(getOplHomeModelStatusLabel('zh-CN')).toBe('5.6 Sol');
    expect(getOplHomeModelStatusLabel('en-US')).toBe('5.6 Sol');
    expect(getOplModelStatusDisplayText('zh-CN')).toBe('模型: 5.6 Sol');
    expect(getOplModelStatusDisplayText('en-US')).toBe('Model: 5.6 Sol');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_model_policy).toBe('codex_cli_latest_strongest_model_selector_visible');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_default_model).toBe('gpt-5.6-sol');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_precise_model_display_policy).toBe(
      'friendly_model_with_discoverable_model_and_reasoning_summary_rows'
    );
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.policy_source_ref).toBe(
      'contracts/app-product-profile.json#codex.auto_model_policy'
    );
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.user_can_override_model).toBe(true);
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.user_can_restore_auto).toBe(true);
    expect(getOplCodexAutoModelPolicy()).toMatchObject({
      mode_default: 'auto',
      configured_default: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      model_catalog_source: 'codex_cli_model_list',
      catalog_response_models_field: 'data',
      catalog_default_model_field: 'isDefault',
      catalog_supported_reasoning_efforts_field: 'supportedReasoningEfforts',
      catalog_supported_reasoning_effort_option_value_field: 'reasoningEffort',
      catalog_pagination_request_cursor_field: 'cursor',
      catalog_pagination_response_cursor_field: 'nextCursor',
      catalog_pagination_completion_policy: 'exhaust_pages_until_next_cursor_is_null',
      unknown_default_model_policy: 'accept_catalog_default_even_when_not_in_frontier_model_preference_order',
      unknown_model_reasoning_effort_policy: 'highest_supported_reasoning_effort_from_catalog',
      catalog_unavailable_fallback: { model: 'gpt-5.6-sol', reasoning_effort: 'max' },
      persistence_policy: {
        auto: 'persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog',
        fixed: 'persist_selected_model_and_reasoning_effort',
        reasoning_override_from_auto: 'pin_current_resolved_model_and_exit_auto',
      },
    });
    expect(getOplCodexModelDisplayOptions()).toMatchObject({
      display_policy: 'friendly_model_name_with_session_configuration_summary_rows',
      button_label_policy: 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix',
      raw_model_id_visible_in_ordinary_ui: false,
      reasoning_effort_visible_for_every_option: false,
      reasoning_effort_menu_visible: true,
      reasoning_menu_title_zh: '推理强度',
      reasoning_menu_title_en: 'Reasoning',
      reasoning_effort_override_surface: 'session_configuration_reasoning_summary_row_submenu',
      reasoning_effort_options_source: 'acp_codex_config_options_enum',
      auto_option_current_resolution_visible: true,
      model_menu_policy: 'model_summary_row_nested_submenu_with_auto_and_fixed_options',
      menu_structure: {
        root_rows: ['model', 'reasoning_effort', 'reset_defaults'],
        summary_row_policy: 'localized_label_left_current_value_and_chevron_right',
        reset_defaults_policy: 'restore_auto_model_and_app_default_reasoning',
        summary_row_icon_policy: 'no_leading_icons',
        reset_icon_policy: 'single_trailing_reset_outline_icon',
        home_and_conversation_share_menu_component: true,
      },
      auto_option: {
        label_zh: '自动（推荐）',
        description_zh: '跟随 Codex CLI 当前默认模型与 App 推理策略',
        catalog_unavailable_fallback_model: 'gpt-5.6-sol',
        catalog_unavailable_fallback_reasoning_effort: 'max',
      },
      visible_models: [
        { id: 'gpt-5.6-sol', label_zh: '5.6 Sol' },
        { id: 'gpt-5.6-terra', label_zh: '5.6 Terra' },
        { id: 'gpt-5.6-luna', label_zh: '5.6 Luna' },
        { id: 'gpt-5.5', label_zh: '5.5' },
        { id: 'gpt-5.4', label_zh: '5.4' },
        { id: 'gpt-5.4-mini', label_zh: '5.4 Mini' },
        { id: 'gpt-5.2', label_zh: '5.2' },
      ],
    });
    expect(getOplCodexModelDisplayOptions().user_reasoning_effort_options).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra',
    ]);
    expect(getOplRetiredCodexModels()).toEqual([
      'gpt-5.3-codex-spark',
      'gpt-5.3-codex',
      'gpt-5.2-codex',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex-mini',
    ]);
  });

  it('uses App state directory, status, and capability metadata as dynamic Agent authority', () => {
    expect(getOplHomeComposerStateContract()).toMatchObject({
      shortcut_package_membership_source_ref: 'app_state.agent_packages.directory.entries[package_role=standard_agent]',
      shortcut_preference_source_ref: 'app_state.agent_packages.status_index.home_shortcut_preferences[]',
      shortcut_availability_source_ref:
        'app_state.agent_packages.directory.entries + app_state.agent_packages.status_index.packages[].presence',
      unknown_standard_agent_allowed: true,
    });
    expect(getOplHomeComposerStateContract()).not.toHaveProperty('shortcut_package_ids');
    expect(OPL_PRODUCT_PROFILE.gui).not.toHaveProperty('agent_package_invocation_receipt_policy');
    expect(OPL_PRODUCT_PROFILE.gui).not.toHaveProperty('builtin_assistant_route_receipt_policy');
    expect(OPL_PRODUCT_PROFILE.gui.agent_package_registry).not.toHaveProperty('starter_package_metadata');
    expect(getOplOrdinaryCapabilitySelectorPolicy()).toMatchObject({
      palette_agent_catalog_source_ref: 'app_state.agent_packages.directory.entries[package_role=standard_agent]',
      palette_agent_status_source_ref: 'app_state.agent_packages.status_index.packages[]',
      palette_agent_availability_policy:
        'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable',
      palette_agent_action_policy: 'directory_available_actions_and_recommended_action_ref_only',
      palette_unknown_standard_agent_policy: 'include_without_app_package_id_branch',
      skill_source_ref: 'owner_or_carrier_projected_capability_metadata_for_the_selected_package',
    });
    expect(getOplOrdinaryCapabilitySelectorPolicy()).not.toHaveProperty('palette_required_agent_package_ids');
    expect(getOplNewConversationAdditionalInstructionsPolicy()).toMatchObject({
      content_owner: 'user',
      generated_base_context_allowed: false,
      agent_route_fallback_allowed: false,
      empty_value_policy: 'inject_nothing',
    });
  });

  it.each([
    [
      'Home fixed Package membership',
      (profile: typeof generatedProfile) => {
        (profile.gui.home.home_composer_state_contract as Record<string, unknown>).shortcut_package_ids = [null, 'mas'];
      },
      'Home composer state contract drifted from fixed Codex controls',
    ],
    [
      'retired static Package invocation policy',
      (profile: typeof generatedProfile) => {
        (profile.gui as unknown as Record<string, unknown>).agent_package_invocation_receipt_policy = {};
      },
      'gui.agent_package_invocation_receipt_policy is forbidden static Package authority',
    ],
    [
      'retired static built-in assistant route policy',
      (profile: typeof generatedProfile) => {
        (profile.gui as unknown as Record<string, unknown>).builtin_assistant_route_receipt_policy = {};
      },
      'gui.builtin_assistant_route_receipt_policy is forbidden static Package authority',
    ],
    [
      'retired static Package presentation metadata',
      (profile: typeof generatedProfile) => {
        (profile.gui.agent_package_registry as unknown as Record<string, unknown>).starter_package_metadata = [];
      },
      'gui.agent_package_registry.starter_package_metadata is forbidden static Package authority',
    ],
    [
      'palette fixed Package membership',
      (profile: typeof generatedProfile) => {
        const policy = profile.gui.ordinary_capability_selector_policy as Record<string, unknown>;
        policy.palette_agent_catalog_source_ref = 'professional_agent_packages';
        policy.palette_required_agent_package_ids = ['mas'];
      },
      'ordinary capability selector policy is unsupported',
    ],
    [
      'Profile-derived Skill source',
      (profile: typeof generatedProfile) => {
        profile.gui.ordinary_capability_selector_policy.skill_source_ref =
          'gui.professional_agent_packages.required_skill_ids + optional_skill_ids';
      },
      'ordinary capability selector policy is unsupported',
    ],
    [
      'Profile-derived session route fallback',
      (profile: typeof generatedProfile) => {
        (profile.codex as Record<string, unknown>).opl_app_session_context = {
          source: 'gui.professional_agent_packages.session_routing_summary_i18n',
        };
      },
      'codex.opl_app_session_context is retired static session or Skill authority',
    ],
    [
      'palette availability without fresh presence and callability',
      (profile: typeof generatedProfile) => {
        profile.gui.ordinary_capability_selector_policy.palette_agent_availability_policy =
          'show_only_real_app_allowlisted_packages_supported_by_the_active_adapter';
      },
      'ordinary capability selector policy is unsupported',
    ],
  ])('rejects legacy fixed authority drift: %s', async (_name, mutateProfile, expectedMessage) => {
    const driftedProfile = structuredClone(generatedProfile);
    mutateProfile(driftedProfile);

    vi.resetModules();
    vi.doMock('@/common/config/oplProductProfile/oplProductProfile.generated.json', () => ({
      default: driftedProfile,
    }));

    await expect(import('@/common/config/oplProductProfile')).rejects.toThrow(expectedMessage);
  });

  it('rejects a generated Home composer contract that hides executor-owned controls', async () => {
    const driftedProfile = structuredClone(generatedProfile);
    driftedProfile.gui.home.home_composer_state_contract.invariants.model_reasoning_visible = false;

    vi.resetModules();
    vi.doMock('@/common/config/oplProductProfile/oplProductProfile.generated.json', () => ({
      default: driftedProfile,
    }));

    await expect(import('@/common/config/oplProductProfile')).rejects.toThrow(
      'Home composer state contract drifted from fixed Codex controls'
    );
  });

  it('exposes App-owned settings navigation and runtime environment profile slices', () => {
    expect(getOplGuiSettingsVisibleTabs()).toEqual([
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
    ]);
    expect(getOplGuiSettingsSecondaryPageIds()).toEqual(['about']);
    expect(getOplGuiLegacySettingsRouteRedirects()).toEqual({
      overview: 'general',
      runtime: 'environment',
      system: 'environment#diagnostics',
      advanced: 'environment#diagnostics',
      model: 'access',
      agent: 'agents',
      assistants: 'capabilities#third-party',
      'skills-hub': 'capabilities#third-party',
      tools: 'capabilities#third-party',
      display: 'appearance',
      webui: 'resources',
      pet: 'appearance',
    });
    const controlPlane = getOplGuiSettingsControlPlane();
    const userNavigation = getOplSettingsUserNavigationProjection();
    expect(controlPlane.source_contract_ref).toBe('contracts/app-gui-product-contract.json#settings_navigation');
    expect(controlPlane.default_route).toBe('/settings/general');
    expect(controlPlane.ordinary_routes.map((route) => route.id)).toEqual(getOplGuiSettingsVisibleTabs());
    expect(controlPlane.secondary_pages.map((page) => page.id)).toEqual(getOplGuiSettingsSecondaryPageIds());
    expect(controlPlane.ordinary_routes).toHaveLength(10);
    expect(userNavigation.schema).toBe('opl_app_settings_user_navigation.v2');
    expect(userNavigation.primary_group_order).toEqual([
      'overview',
      'account_models',
      'connections_deployment',
      'workspace',
      'agents_capabilities',
      'runtime_maintenance',
      'preferences',
    ]);
    expect(userNavigation.primary_groups.map((group) => group.id)).toEqual(userNavigation.primary_group_order);
    expect(userNavigation.primary_groups.find((group) => group.id === 'connections_deployment')).toMatchObject({
      default_destination_id: 'resources_connections',
      destination_ids: ['resources_connections'],
    });
    expect(userNavigation.primary_groups.find((group) => group.id === 'runtime_maintenance')).toMatchObject({
      default_destination_id: 'runtime_services',
      destination_ids: ['runtime_services', 'updates_repairs', 'logs_diagnostics'],
    });
    expect(userNavigation.destinations.map((destination) => destination.route_id)).toEqual(
      expect.arrayContaining(getOplGuiSettingsVisibleTabs())
    );
    expect(new Set(userNavigation.destinations.map((destination) => destination.route_id))).toEqual(
      new Set(getOplGuiSettingsVisibleTabs())
    );
    expect(userNavigation.auxiliary_entries).toEqual([
      expect.objectContaining({ id: 'about', route_id: 'about', placement: 'sidebar_bottom' }),
    ]);
    expect(userNavigation.responsive_navigation).toMatchObject({
      mobile_horizontal_tab_strip_allowed: false,
      mobile_navigation_scroll_axis: 'vertical',
      minimum_viewport_px: { width: 400, height: 600 },
    });
    expect(userNavigation.footer_policy.duplicate_settings_entry).toBe('forbidden_inside_settings');
    userNavigation.primary_groups[0]?.destination_ids.push('preferences');
    expect(getOplSettingsUserNavigationProjection().primary_groups[0]?.destination_ids).toEqual(['overview_status']);
    expect(controlPlane.compatibility_redirects).toMatchObject({
      update: { target_route_id: 'environment', anchor: 'updates' },
      theme: { target_route_id: 'appearance', anchor: 'themes' },
      'local-services': { target_route_id: 'environment', anchor: 'services' },
    });
    expect(controlPlane.extension_anchor_remap['skills-hub']).toBe('capabilities');
    expect(controlPlane.ordinary_routes.find((route) => route.id === 'workspace')).toMatchObject({
      path: '/settings/workspace',
      label_key: 'settings.workspacePersonalization',
      icon_token: 'workspace',
      scope: 'workspace',
      intent: 'configure',
      risk: 'confirmation_required',
      frequency: 'first_run_or_project_switch',
    });
    expect(controlPlane.secondary_pages.map((page) => page.id)).not.toContain('workspace');
    expect(controlPlane.ordinary_routes.find((route) => route.id === 'resources')).toMatchObject({
      path: '/settings/resources',
      label_key: 'settings.resources',
      icon_token: 'resources',
      scope: 'resource',
      intent: 'configure',
    });
    expect(controlPlane.slot_registry.settings_environment.component_key).toBe('RuntimeSettings');
    expect(controlPlane.slot_registry.settings_resources.component_key).toBe('ResourcesSettingsContent');
    expect(controlPlane.slot_registry.about.component_key).toBe('AboutModalContent');
    expect(controlPlane.slot_registry.update.component_key).toBe('RuntimeSettings');
    expect(controlPlane.slot_registry.workspace.component_key).toBe('WorkspaceSettings');
    expect(controlPlane.slot_registry.local_services.component_key).toBe('LocalServicesSettings');
    expect(controlPlane.state_action_policy).toMatchObject({
      default_state_source: 'opl app state --profile fast --json',
      default_refresh_source: 'opl app state --profile fast --json',
      action_route: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json',
      recommended_action_ids: {
        doctor: 'doctor',
        repair: 'repair',
      },
    });
    expect(controlPlane.state_action_policy.shell_must_not_own).toEqual(
      expect.arrayContaining(['runtime truth', 'provider implementation', 'domain truth', 'owner receipts'])
    );
    const actionContract = getOplSettingsControlPlaneActionContract();
    expect(actionContract.action_route).toBe(
      'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json'
    );
    actionContract.recommended_action_ids.doctor = 'caller-local-action';
    expect(getOplSettingsControlPlaneActionContract().recommended_action_ids.doctor).toBe('doctor');
    actionContract.shell_must_not_own.push('caller-local-policy');
    expect(getOplSettingsControlPlaneActionContract().shell_must_not_own).not.toContain('caller-local-policy');
    controlPlane.state_action_policy.recommended_action_ids.repair = 'caller-local-action';
    expect(getOplGuiSettingsControlPlane().state_action_policy.recommended_action_ids.repair).toBe('repair');
    controlPlane.state_action_policy.shell_must_not_own.push('caller-local-policy');
    expect(getOplGuiSettingsControlPlane().state_action_policy.shell_must_not_own).not.toContain('caller-local-policy');
    expect(getOplRuntimeEnvironmentItems()).toEqual([
      'codex',
      'temporal',
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-meta-agent',
      'app',
    ]);
    expect(getOplDeveloperProfileSettings()).toMatchObject({
      default_profile: 'standard_user',
      opt_in_policy: 'automatic_for_matching_identity_and_authorized_repositories_with_explicit_off',
    });
  });

  it('rejects a generated Settings navigation projection that breaks the mobile contract', async () => {
    const driftedProfile = structuredClone(generatedProfile);
    driftedProfile.settings.control_plane.user_navigation_projection.responsive_navigation.mobile_horizontal_tab_strip_allowed = true;

    vi.resetModules();
    vi.doMock('@/common/config/oplProductProfile/oplProductProfile.generated.json', () => ({
      default: driftedProfile,
    }));

    await expect(import('@/common/config/oplProductProfile')).rejects.toThrow(
      'settings.control_plane.user_navigation_projection.responsive_navigation is invalid'
    );
  });

  it('ignores any reintroduced ordinary MCP visibility allowlist', async () => {
    const driftedProfile = structuredClone(generatedProfile);
    const selectorPolicy = driftedProfile.gui.ordinary_capability_selector_policy as Record<string, unknown>;
    selectorPolicy.visible_mcp_server_ids = ['listed-only'];

    vi.resetModules();
    vi.doMock('@/common/config/oplProductProfile/oplProductProfile.generated.json', () => ({
      default: driftedProfile,
    }));

    const driftedModule = await import('@/common/config/oplProductProfile');
    expect(
      driftedModule.filterOplOrdinaryMcpServers([
        { id: 'unlisted-user-server', name: 'Unlisted User Server' },
        { id: 'aionui-team', name: 'AionUI Team' },
      ])
    ).toEqual([{ id: 'unlisted-user-server', name: 'Unlisted User Server' }]);
  });

  it('preserves user and third-party MCP state while scrubbing AionUI Team state', () => {
    const selectorPolicy = getOplOrdinaryCapabilitySelectorPolicy();
    expect(selectorPolicy).toMatchObject({
      authority: 'owner_or_carrier_skill_projection_and_mcp_negative_filter',
      palette_agent_catalog_source_ref: 'app_state.agent_packages.directory.entries[package_role=standard_agent]',
      palette_agent_status_source_ref: 'app_state.agent_packages.status_index.packages[]',
      palette_agent_availability_policy:
        'join_by_package_id_and_use_fresh_directory_installed_plus_status_index_presence.present_and_presence.callable',
      palette_agent_action_policy: 'directory_available_actions_and_recommended_action_ref_only',
      palette_unknown_standard_agent_policy: 'include_without_app_package_id_branch',
      skill_source_ref: 'owner_or_carrier_projected_capability_metadata_for_the_selected_package',
      conversation_loaded_skill_display_policy: 'preserve_owner_or_carrier_projected_loaded_skills',
      mcp_server_source_ref: 'configured_user_and_third_party_mcp_servers',
      mcp_menu_policy: 'preserve_configured_user_and_third_party_servers_except_explicit_forbidden_matchers',
      conversation_loaded_mcp_display_policy: 'preserve_non_forbidden_configured_servers',
      unmatched_mcp_policy: 'preserve_end_to_end_without_app_allowlist_membership',
    });
    expect(selectorPolicy).not.toHaveProperty('visible_mcp_server_ids');
    expect(selectorPolicy.required_preservation_targets).toEqual([
      'mcp directory entries not matching forbidden_mcp_matchers',
      'mcp status entries not matching forbidden_mcp_matchers',
      'new conversation create payload mcp_servers not matching forbidden_mcp_matchers',
      'conversation snapshot mcp_servers and mcp_statuses not matching forbidden_mcp_matchers',
    ]);
    expect(getOplOrdinaryForbiddenCapabilityPolicy()).toEqual({
      exact: ['aionui-team'],
      prefixes: ['team_', 'mcp__aionui-team'],
      contains: ['aionui-team'],
      extra_keys: [
        'team_mcp_stdio_config',
        'team_id',
        'teamId',
        'team_lead_team_id',
        'team_lead_team_slot_id',
        'team_lead_conversation_id',
        'tl',
      ],
    });
    expect(isOplForbiddenTeamMcpName('aionui-team')).toBe(true);
    expect(isOplForbiddenTeamMcpName('team_list_models')).toBe(true);
    expect(isOplForbiddenTeamMcpName('mcp__aionui-team-team_members')).toBe(true);
    expect(isOplForbiddenTeamMcpName('custom-aionui-team-shadow')).toBe(true);
    expect(isOplForbiddenTeamMcpName('mas')).toBe(false);

    const configuredServers = [
      { id: 'user-files', name: 'User Files' },
      { id: 'third-party-search', name: 'Third Party Search' },
      { id: 'aionui-team', name: 'AionUI Team' },
      { id: 'safe-id', name: 'team_internal' },
    ];
    expect(filterOplOrdinaryMcpServers(configuredServers)).toEqual(configuredServers.slice(0, 2));
    expect(
      filterOplOrdinaryMcpStatuses([
        { id: 'user-files', name: 'User Files', status: 'loaded' as const },
        { id: 'mcp__aionui-team-members', name: 'Team Members', status: 'loaded' as const },
      ])
    ).toEqual([{ id: 'user-files', name: 'User Files', status: 'loaded' }]);
    expect(
      filterOplOrdinarySessionMcpServers([
        { id: 'third-party-search', name: 'Third Party Search' },
        { id: 'team_runtime', name: 'Runtime Team' },
      ])
    ).toEqual([{ id: 'third-party-search', name: 'Third Party Search' }]);

    const extra = sanitizeOplOrdinaryConversationExtra({
      workspace: '/tmp/opl',
      backend: 'codex',
      mcp_servers: ['aionui-team', 'team_list_models', 'unknown-mcp'],
      mcp_statuses: [
        { id: 'aionui-team', name: 'aionui-team', status: 'loaded' as const },
        { id: 'mcp__aionui-team-team_members', name: 'team_members', status: 'failed' as const },
        { id: 'unknown-mcp', name: 'Unknown MCP', status: 'loaded' as const },
      ],
      session_mcp_servers: [
        { id: 'aionui-team', name: 'aionui-team', transport: { type: 'stdio' as const, command: 'mcp-team-stdio' } },
        {
          id: 'third-party-search',
          name: 'Third Party Search',
          transport: { type: 'stdio' as const, command: 'third-party-search' },
        },
      ],
      team_mcp_stdio_config: { port: 62520 },
      team_id: 'team-1',
      teamId: 'team-1',
      team_lead_team_id: 'team-1',
      team_lead_team_slot_id: 'slot-1',
      team_lead_conversation_id: 'conversation-1',
      tl: 1,
    });

    expect(extra).toMatchObject({
      workspace: '/tmp/opl',
      backend: 'codex',
      mcp_servers: ['unknown-mcp'],
      mcp_statuses: [{ id: 'unknown-mcp', name: 'Unknown MCP', status: 'loaded' }],
      session_mcp_servers: [
        {
          id: 'third-party-search',
          name: 'Third Party Search',
          transport: { type: 'stdio', command: 'third-party-search' },
        },
      ],
    });
    expect(extra).not.toHaveProperty('team_mcp_stdio_config');
    expect(extra).not.toHaveProperty('team_id');
    expect(extra).not.toHaveProperty('teamId');
    expect(extra).not.toHaveProperty('team_lead_team_id');
    expect(extra).not.toHaveProperty('team_lead_team_slot_id');
    expect(extra).not.toHaveProperty('team_lead_conversation_id');
    expect(extra).not.toHaveProperty('tl');
  });

  it('keeps Home shortcut membership on the dynamic Package projection', () => {
    expect(generatedProfile.gui.home).not.toHaveProperty('home_agent_shortcuts');
    expect(OPL_PRODUCT_PROFILE.gui.home).not.toHaveProperty('home_agent_shortcuts');
    expect(OPL_PRODUCT_PROFILE.gui).not.toHaveProperty('professional_agent_packages');
    expect(OPL_PRODUCT_PROFILE.gui).not.toHaveProperty('default_assistants');
    expect(OPL_PRODUCT_PROFILE.gui).not.toHaveProperty('non_default_assistants');
    expect(OPL_PRODUCT_PROFILE.gui.home).not.toHaveProperty('home_purpose_entries');
    expect(OPL_PRODUCT_PROFILE.companion_payloads.additional_package_skill_ids).toEqual(['opl-meta-agent']);
  });

  it.each([[], [{ shortcut_id: 'legacy-static-shortcut' }]])(
    'rejects any legacy static Home shortcut authority: %j',
    async (homeAgentShortcuts) => {
      const malformedProfile = structuredClone(generatedProfile) as typeof generatedProfile & {
        gui: { home: { home_agent_shortcuts?: unknown } };
      };
      malformedProfile.gui.home.home_agent_shortcuts = homeAgentShortcuts;

      vi.resetModules();
      vi.doMock('@/common/config/oplProductProfile/oplProductProfile.generated.json', () => ({
        default: malformedProfile,
      }));

      await expect(import('@/common/config/oplProductProfile')).rejects.toThrow(
        'gui.home.home_agent_shortcuts is retired static presentation authority'
      );
    }
  );

  it('exposes App-managed OPL Flow context policy without allowing caller mutation', () => {
    const policy = getOplFlowContextPolicy();

    expect(policy).toEqual({
      flow_id: 'opl-flow',
      source: 'opl-flow-package-policy',
      policy_source_ref: 'gaofeng21cn/opl-flow:contracts/workflow-policy.json',
      delivery: 'package_installed_user_profile_only',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
      language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
      app_role: 'display_framework_projection_and_execute_projected_actions_only',
      dependency_policy: 'framework_resolves_declared_dependencies_without_app_lock_or_payload_prerequisite',
      migration_policy: 'framework_executes_conflict_retirement_with_backup_receipt_and_rollback',
    });

    policy.source = 'caller-local-source';
    expect(getOplFlowContextPolicy().source).toBe('opl-flow-package-policy');
    expect(getOplFlowContextPolicy().optional_user_modes).toBeUndefined();
  });

  it('uses the App preference order without treating it as a fixed-model allowlist', () => {
    expect(selectDefaultCodexModelId([{ id: 'gpt-5.1-codex-mini' }, { id: 'gpt-5.2-codex' }, { id: 'gpt-5.4' }])).toBe(
      'gpt-5.4'
    );
    expect(selectDefaultCodexModelId([{ id: 'gpt-5.5' }, { id: 'gpt-5.6-codex' }, { id: 'gpt-5.6-mini' }])).toBe(
      'gpt-5.5'
    );
    expect(selectDefaultCodexModelId([{ id: 'gpt-6' }, { id: 'gpt-5.6-sol' }])).toBe('gpt-5.6-sol');
    expect(selectDefaultCodexModelId([{ id: 'gpt-5.6-luna' }, { id: 'gpt-5.6-terra' }, { id: 'gpt-5.5' }])).toBe(
      'gpt-5.6-terra'
    );
    expect(selectDefaultCodexModelId()).toBe('gpt-5.6-sol');
    expect(
      buildCodexDefaultModelInfo({
        current_model_id: 'gpt-5.2-codex',
        current_model_label: 'gpt-5.2-codex',
        available_models: [
          { id: 'gpt-5.6', label: 'gpt-5.6' },
          { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
        ],
      })
    ).toMatchObject({
      current_model_id: 'gpt-5.6-sol',
      current_model_label: '5.6 Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: '5.6 Sol' },
        { id: 'gpt-5.6-terra', label: '5.6 Terra' },
        { id: 'gpt-5.6-luna', label: '5.6 Luna' },
        { id: 'gpt-5.5', label: '5.5' },
        { id: 'gpt-5.4', label: '5.4' },
        { id: 'gpt-5.4-mini', label: '5.4 Mini' },
        { id: 'gpt-5.2', label: '5.2' },
        { id: 'gpt-5.6', label: 'gpt-5.6' },
      ],
    });
    expect(
      buildCodexDefaultModelInfo({
        current_model_id: null,
        current_model_label: null,
        available_models: [{ id: 'gpt-5.6-sol', label: 'Hidden by runtime', hidden: true }],
      }).available_models
    ).toContainEqual({ id: 'gpt-5.6-sol', label: '5.6 Sol' });
    expect(
      buildCodexDefaultModelInfo({
        current_model_id: null,
        current_model_label: null,
        available_models: [],
      })
    ).toMatchObject({
      current_model_id: 'gpt-5.6-sol',
      current_model_label: '5.6 Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: '5.6 Sol' },
        { id: 'gpt-5.6-terra', label: '5.6 Terra' },
        { id: 'gpt-5.6-luna', label: '5.6 Luna' },
        { id: 'gpt-5.5', label: '5.5' },
        { id: 'gpt-5.4', label: '5.4' },
        { id: 'gpt-5.4-mini', label: '5.4 Mini' },
        { id: 'gpt-5.2', label: '5.2' },
      ],
    });
    expect(
      buildCodexDefaultModelInfo({
        current_model_id: 'gpt-6',
        current_model_label: 'GPT-6',
        available_models: [
          { id: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
          { id: 'gpt-5.2', label: 'GPT-5.2' },
          { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini' },
          { id: 'gpt-6', label: 'GPT-6' },
          { id: 'gpt-5.4', label: 'GPT-5.4' },
          { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
          { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          { id: 'gpt-5.5', label: 'GPT-5.5' },
          { id: 'gpt-6-hidden', label: 'GPT-6 Hidden', hidden: true },
        ],
      })
    ).toMatchObject({
      current_model_id: 'gpt-5.6-sol',
      current_model_label: '5.6 Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: '5.6 Sol' },
        { id: 'gpt-5.6-terra', label: '5.6 Terra' },
        { id: 'gpt-5.6-luna', label: '5.6 Luna' },
        { id: 'gpt-5.5', label: '5.5' },
        { id: 'gpt-5.4', label: '5.4' },
        { id: 'gpt-5.4-mini', label: '5.4 Mini' },
        { id: 'gpt-5.2', label: '5.2' },
        { id: 'gpt-6', label: 'GPT-6' },
      ],
    });
    expect(buildCodexDefaultModelInfo()).toMatchObject({
      current_model_id: 'gpt-5.6-sol',
      current_model_label: '5.6 Sol',
      available_models: [
        { id: 'gpt-5.6-sol', label: '5.6 Sol' },
        { id: 'gpt-5.6-terra', label: '5.6 Terra' },
        { id: 'gpt-5.6-luna', label: '5.6 Luna' },
        { id: 'gpt-5.5', label: '5.5' },
        { id: 'gpt-5.4', label: '5.4' },
        { id: 'gpt-5.4-mini', label: '5.4 Mini' },
        { id: 'gpt-5.2', label: '5.2' },
      ],
    });
  });

  it('keeps App reasoning policy for a known Codex catalog default', () => {
    expect(
      resolveOplCodexAutoSelection({
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: [
          {
            id: 'gpt-5.6-sol',
            label: 'GPT-5.6-Sol',
            isDefault: true,
            supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'ultra' }],
          },
        ],
      })
    ).toEqual({ modelId: 'gpt-5.6-sol', reasoningEffort: 'max' });
  });

  it('accepts an unknown Codex catalog default at its highest advertised reasoning effort', () => {
    expect(
      resolveOplCodexAutoSelection({
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: [
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          {
            id: 'gpt-6',
            label: 'GPT-6',
            isDefault: true,
            supportedReasoningEfforts: [
              { reasoningEffort: 'medium' },
              { reasoningEffort: 'high' },
              { reasoningEffort: 'ultra' },
            ],
          },
        ],
      })
    ).toEqual({ modelId: 'gpt-6', reasoningEffort: 'ultra' });
  });

  it('excludes a hidden unknown catalog default from Auto selection', () => {
    expect(
      resolveOplCodexAutoSelection({
        current_model_id: 'gpt-5.6-sol',
        current_model_label: 'GPT-5.6-Sol',
        available_models: [
          { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
          {
            id: 'gpt-6-preview',
            label: 'GPT-6 Preview',
            isDefault: true,
            hidden: true,
            supportedReasoningEfforts: [{ reasoningEffort: 'ultra' }],
          },
        ],
      })
    ).toEqual({ modelId: 'gpt-5.6-sol', reasoningEffort: 'max' });
  });

  it('falls back to the App default when the Codex catalog is unavailable', () => {
    expect(resolveOplCodexAutoSelection(null)).toEqual({ modelId: 'gpt-5.6-sol', reasoningEffort: 'max' });
  });

  it('preserves owner- or carrier-projected Skill names while trimming blanks and duplicates', () => {
    expect(filterOplOrdinarySkillNames([' owner-skill ', 'unknown-skill', 'owner-skill', ''])).toEqual([
      'owner-skill',
      'unknown-skill',
    ]);
    expect(
      filterOplOrdinarySkillCatalog([
        { name: ' owner-skill ', source: 'owner' },
        { name: 'unknown-skill', source: 'carrier' },
        { name: 'owner-skill', source: 'duplicate' },
      ])
    ).toEqual([
      { name: 'owner-skill', source: 'owner' },
      { name: 'unknown-skill', source: 'carrier' },
    ]);
  });

  it('exposes first-run deferred blockers and Command Line Tools copy from the generated profile', () => {
    expect(getOplDeferredFirstLaunchBlockers()).toEqual([
      'domain_modules',
      'family_runtime_provider',
      'recommended_skills',
      'native_helpers',
      'repo_sync',
      'command_line_tools_install',
      'ecosystem_module_updates',
    ]);
    expect(getOplReadyToLaunchCoreItems()).toEqual(['workspace_root', 'codex_cli', 'codex_config']);
    expect(getOplReadyToLaunchNonBlockingItems()).toEqual([
      'domain_modules',
      'family_runtime_provider',
      'recommended_skills',
      'native_helpers',
      'repo_sync',
      'command_line_tools_install',
      'ecosystem_module_updates',
    ]);
    expect(getOplCommandLineToolsInstallMessage()).toContain('Command Line Tools installer has been opened');
    expect(getOplCommandLineToolsInstallMessage()).toContain('You can keep using One Person Lab');
    expect(getOplCommandLineToolsInstallMessage()).toContain('resume them from Settings');
  });

  it('allows only optional user-authored instructions for new conversations', () => {
    expect(getOplNewConversationAdditionalInstructionsPolicy()).toEqual({
      content_owner: 'user',
      delivery: 'new_conversation_additional_instructions_only',
      storage_key: 'codex.oplAppSessionContextAdditional',
      storage_key_status: 'legacy_compatibility_storage_key',
      generated_base_context_allowed: false,
      agent_route_fallback_allowed: false,
      empty_value_policy: 'inject_nothing',
      reset_behavior: 'clear_additional_instructions',
      effect: 'next_new_conversation',
    });
  });
});

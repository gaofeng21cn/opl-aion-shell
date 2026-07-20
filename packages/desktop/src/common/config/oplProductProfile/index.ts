/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import generatedProfile from './oplProductProfile.generated.json';
import type { IConversationMcpStatus, IMcpServer, ISessionMcpServer } from '@/common/config/storage';

export type OplCodexReasoningEffort = string;
export type OplCodexAutoModelPolicy = {
  authority: 'one-person-lab-app';
  configured_default: { model: string; reasoning_effort: OplCodexReasoningEffort };
  mode_default: 'auto';
  model_catalog_source: 'codex_cli_model_list';
  catalog_response_models_field: 'data';
  catalog_default_model_field: 'isDefault';
  catalog_supported_reasoning_efforts_field: 'supportedReasoningEfforts';
  catalog_supported_reasoning_effort_option_value_field: 'reasoningEffort';
  catalog_reasoning_effort_order_policy: 'last_advertised_supported_reasoning_effort_is_highest';
  catalog_pagination_request_cursor_field: 'cursor';
  catalog_pagination_response_cursor_field: 'nextCursor';
  catalog_pagination_completion_policy: 'exhaust_pages_until_next_cursor_is_null';
  catalog_hidden_model_field: 'hidden';
  catalog_hidden_model_policy: 'exclude_hidden_models_from_auto_and_fixed_options';
  frontier_model_preference_order_role: 'known_model_fallback_and_fixed_option_preference_not_allowlist';
  frontier_model_preference_order: string[];
  known_model_reasoning_effort_overrides: Record<string, OplCodexReasoningEffort>;
  unknown_default_model_policy: 'accept_catalog_default_even_when_not_in_frontier_model_preference_order';
  unknown_model_reasoning_effort_policy: 'highest_supported_reasoning_effort_from_catalog';
  catalog_without_default_policy: 'first_available_known_model_then_first_catalog_model';
  catalog_unavailable_fallback: { model: string; reasoning_effort: OplCodexReasoningEffort };
  persistence_policy: {
    auto: 'persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog';
    fixed: 'persist_selected_model_and_reasoning_effort';
    state_encoding: 'auto_has_no_model_snapshot_fixed_has_model_and_reasoning';
    reasoning_override_from_auto: 'pin_current_resolved_model_and_exit_auto';
    stale_fixed_model: 'preserve_fixed_selection_as_unavailable_until_user_restores_auto_or_selects_available_model';
  };
};
export type OplGlobalFeedbackAction = {
  placement: 'titlebar_trailing_utility';
  icon: 'circle_question';
  icon_style: 'regular_outline';
  target_url: 'https://github.com/gaofeng21cn/one-person-lab-app/issues/new';
  open_mode: 'external_browser_user_review_and_submit';
  prefill_fields: ['localized_title', 'localized_body', 'current_route', 'app_release_version'];
  startup_failure_action: {
    placement: 'blocking_startup_failure_dialog';
    delivery_channel: 'electron_main_process_native_open_external_via_preload_ipc';
    backend_dependency: 'none';
    submission_policy: 'external_browser_user_review_and_submit';
    automatic_submission: false;
    prefill_fields: [
      'localized_title',
      'localized_body',
      'app_release_version',
      'platform',
      'architecture',
      'startup_failure_reason',
      'backend_boundary_code',
      'backend_boundary_stage',
    ];
    automatic_attachment_policy: 'forbidden_no_logs_paths_credentials_or_user_content';
  };
  shell_local_delivery_forbidden: true;
};
export type OplAccountIdentityAvatarPolicy = {
  shape: 'circle';
  background: 'semantic_success_green';
  foreground: 'inverse';
  han_name_initials: 'first_han_character_only';
  non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints';
  email_fallback_initials: 'first_two_local_part_codepoints_uppercase';
  empty_fallback: 'OP';
};
export const OPL_CODEX_CSS_THEME_ID = 'codex';
export const OPL_CLASSIC_CSS_THEME_ID = 'default-theme';
export const OPL_VISIBLE_CSS_THEME_IDS = [OPL_CODEX_CSS_THEME_ID, OPL_CLASSIC_CSS_THEME_ID] as const;
export type OplVisibleCssThemeId = (typeof OPL_VISIBLE_CSS_THEME_IDS)[number];

const OPL_PROFESSIONAL_AGENT_ID_ALIASES = new Map<string, string>([
  ['medautoscience', 'mas'],
  ['mas', 'mas'],
  ['medautogrant', 'mag'],
  ['mag', 'mag'],
  ['redcubeai', 'rca'],
  ['redcube', 'rca'],
  ['rca', 'rca'],
  ['oplbookforge', 'obf'],
  ['bookforge', 'obf'],
  ['obf', 'obf'],
  ['oplmetaagent', 'oma'],
  ['oma', 'oma'],
]);

function normalizeOplProfessionalAgentAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isOplVisibleCssThemeId(value: unknown): value is OplVisibleCssThemeId {
  return typeof value === 'string' && OPL_VISIBLE_CSS_THEME_IDS.includes(value as OplVisibleCssThemeId);
}

export function canonicalizeOplProfessionalAgentId(value: string): string {
  const trimmed = value
    .replace(/^builtin-/, '')
    .trim()
    .toLowerCase();
  return OPL_PROFESSIONAL_AGENT_ID_ALIASES.get(normalizeOplProfessionalAgentAlias(trimmed)) ?? trimmed;
}

export type OplHomeAssistant = {
  id: string;
  display_name: string;
  short_name: string;
  home_purpose_label: string;
  home_entry_display_policy: 'purpose_first';
  role: string;
  home_entry_policy: 'purpose_entry_target';
  avatar: string;
  description_i18n: Record<string, string>;
  prompts_i18n: Record<string, string[]>;
};

export type OplHomePurposeEntry = {
  id: string;
  primary_label: string;
  target_assistant_id: string;
  target_assistant_short_name: string;
  display_policy: 'purpose_first';
  home_entry_policy: 'visible_click_to_start';
};

export type OplHomeAgentShortcut = {
  shortcut_id: string;
  package_id: string;
  primary_label: string;
  package_short_name: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
  source: 'opl_app_home';
  executor: 'codex_cli';
  display_policy: 'purpose_first';
  home_entry_policy: 'visible_click_to_start';
  default_visible: boolean;
  user_configurable: boolean;
};

export type OplHomeComposerStateContract = {
  contract_id: 'opl_home_composer_state.v1';
  executor: 'codex';
  shortcut_package_ids: Array<string | null>;
  viewports: ['desktop', 'mobile'];
  availability_states: ['available', 'unavailable'];
  invariants: {
    model_reasoning_visible: true;
    permission_access_visible: true;
    executor_selector_visible: false;
    active_shortcut_changes_executor: false;
    default_visibility_governs_execution: false;
  };
  semantic_probe: {
    root_test_id: 'opl-guid-entry';
    state_attributes: Record<string, string>;
    desktop_required_controls: string[];
    mobile_required_controls: string[];
    forbidden_controls: string[];
    failure_field: 'missing_controls';
  };
};

export type OplNonDefaultAssistant = {
  id: string;
  display_name: string;
  short_name: string;
  role: string;
  home_entry_policy: 'explicit_or_settings_only' | 'settings_managed_home_shortcut';
  home_default_visible: boolean;
  avatar: string;
  description_i18n: Record<string, string>;
  prompts_i18n: Record<string, string[]>;
};

export type OplAssistantSkillProfile = {
  assistant_id: string;
  required_skills: string[];
  optional_skills: string[];
  required_skill_policy: 'checked_locked';
  optional_skill_policy: 'unchecked_user_selectable';
  skill_menu_policy: 'assistant_scoped_required_checked_optional_visible';
};

export type OplProfessionalAgentPackage = {
  package_id: string;
  display_name: string;
  display_name_i18n: Record<'zh-CN' | 'en-US', string>;
  short_name: string;
  role: string;
  package_kind: string;
  installed_manageable: boolean;
  default_home_visible: boolean;
  codex_visible_entry: string;
  home_shortcut_ids: string[];
  required_skill_ids: string[];
  optional_skill_ids: string[];
  description_i18n: Record<'zh-CN' | 'en-US', string>;
  session_routing_summary_i18n: Record<'zh-CN' | 'en-US', string>;
  required_skill_policy: 'checked_locked';
  optional_skill_policy: 'unchecked_user_selectable';
  skill_menu_policy: 'assistant_scoped_required_checked_optional_visible';
};

export type OplFirstPartyPackagePresentation = {
  package_id: string;
  display_name: string;
  description: string;
  display_name_i18n: Record<'zh-CN' | 'en-US', string>;
  description_i18n: Record<'zh-CN' | 'en-US', string>;
};

export type OplAgentPackageInvocationReceiptPolicy = {
  scope: 'package_shortcut_launch_to_codex_conversation';
  required_for_package_shortcuts: string[];
  route_kind: 'agent_package_shortcut';
  executor: 'codex_cli';
  source: 'opl_app_home';
  required_fields: string[];
  receipt_authority: 'launch_fact_only_no_session_behavior_domain_workflow_or_readiness';
  must_not_govern: string[];
  must_not_depend_on_visible_backend_selection: true;
};

export type OplBuiltinAssistantRouteReceiptPolicy = {
  migration_alias_for?: 'agent_package_invocation_receipt_policy';
  scope: 'home_purpose_entry_to_conversation';
  required_for_assistants: string[];
  route_kind: 'builtin_capability';
  executor: 'codex_cli';
  source: 'opl_app_home';
  required_fields: string[];
  must_not_depend_on_visible_backend_selection: true;
};

export type OplAgentReferenceAdmissionPolicy = {
  active_agent_package_cardinality: 'zero_or_one';
  selection_authority: 'home_starter_new_session_capability_palette_or_explicit_capability_route_only';
  at_mention_agent_selection_allowed: false;
  plain_text_agent_reference_changes_active_package: false;
  multiple_agent_reference_policy: 'may_coexist_as_prompt_context_but_never_create_multiple_active_agent_packages';
  cross_agent_semantic_admission_owner: 'target_primary_skill_over_complete_current_user_request';
  deterministic_cross_agent_routing_allowed: false;
  oma_engineering_admission: 'explicit_target_agent_and_explicit_agent_engineering_objective_required';
  deliverable_failure_policy: 'repair_current_deliverable_never_authorize_agent_engineering';
  existing_conversation_rebinding_allowed: false;
};

export type OplOrdinaryCapabilitySelectorPolicy = {
  scope: 'home_composer_and_ordinary_conversation';
  authority: 'app_owned_opl_allowlist';
  agent_reference_admission_policy: OplAgentReferenceAdmissionPolicy;
  skill_source_ref: 'gui.professional_agent_packages.required_skill_ids + optional_skill_ids';
  skill_menu_policy: 'assistant_scoped_required_checked_optional_visible';
  conversation_loaded_skill_display_policy: 'filter_to_ordinary_skill_allowlist';
  mcp_server_source_ref: 'gui.ordinary_capability_selector_policy.visible_mcp_server_ids';
  mcp_menu_policy: 'empty_until_app_explicitly_whitelists_opl_mcp_servers';
  visible_mcp_server_ids: string[];
  conversation_loaded_mcp_display_policy: 'filter_to_visible_mcp_server_ids';
  forbidden_skill_examples: string[];
  forbidden_mcp_policy: 'do_not_surface_user_or_aionui_mcp_servers_in_ordinary_home_without_app_profile_allowlist';
  forbidden_mcp_examples: string[];
  conversation_snapshot_policy: 'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations';
  forbidden_mcp_matchers: {
    exact: string[];
    prefixes: string[];
    contains: string[];
  };
  scrub_extra_keys: string[];
  required_scrub_targets: string[];
};

export type OplOrdinaryForbiddenCapabilityPolicy = {
  exact: string[];
  prefixes: string[];
  contains: string[];
  extra_keys: string[];
};

export type OplFlowContextPolicy = {
  flow_id: 'opl-flow';
  source: string;
  policy_source_ref: 'gaofeng21cn/opl-flow:contracts/workflow-policy.json';
  delivery: 'package_installed_user_profile_only';
  user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts';
  language_policy: 'follow_ui_locale_zh_only_when_ui_zh';
  app_role: 'install_sync_diagnose_user_profile_only';
  dependency_policy: 'full_bundles_opl_flow_requires_and_recommends_closure';
  migration_policy: 'framework_executes_conflict_retirement_with_backup_receipt_and_rollback';
};

export type OplAppSessionContextPolicy = {
  owner: 'one-person-lab-app';
  source: 'gui.professional_agent_packages.session_routing_summary_i18n';
  delivery: 'new_codex_conversation_preset_context';
  generation_policy: 'profile_agent_routes';
  update_policy: 'regenerated_when_app_product_profile_syncs';
  user_agents_policy: 'codex_reads_user_and_repo_agents_independently';
  customization: {
    additional_instructions_key: 'codex.oplAppSessionContextAdditional';
    base_context_edit_policy: 'generated_read_only';
    user_edit_policy: 'append_additional_instructions_only';
    reset_behavior: 'clear_additional_instructions';
    effect: 'next_new_conversation';
  };
};

type OplCodexSessionContext = {
  'zh-CN': string[];
  'en-US': string[];
};

export type OplCodexModelDisplayModel = {
  id: string;
  label_zh: string;
  label_en: string;
};

export type OplCodexModelDisplayOptions = {
  display_policy: 'friendly_model_name_primary_reasoning_primary_model_secondary_menu';
  button_label_policy: 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix';
  raw_model_id_visible_in_ordinary_ui: false;
  reasoning_effort_visible_for_every_option: false;
  reasoning_effort_menu_visible: true;
  reasoning_menu_title_zh: string;
  reasoning_menu_title_en: string;
  reasoning_effort_override_surface: 'model_selector_primary_menu';
  reasoning_effort_options_source: 'acp_codex_config_options_enum';
  default_reasoning_effort: OplCodexReasoningEffort;
  auto_option_current_resolution_visible: true;
  model_menu_policy: 'current_model_secondary_submenu';
  auto_option: {
    id: '__auto';
    label_zh: string;
    label_en: string;
    description_zh: string;
    description_en: string;
    catalog_unavailable_fallback_model: string;
    catalog_unavailable_fallback_reasoning_effort: OplCodexReasoningEffort;
    follows_latest_strongest: true;
  };
  fixed_model_description_zh: string;
  fixed_model_description_en: string;
  reasoning_labels: Record<OplCodexReasoningEffort, { zh: string; en: string }>;
  user_reasoning_effort_options: OplCodexReasoningEffort[];
  visible_models: OplCodexModelDisplayModel[];
};

type OplPostInstallAiSelfCheckEntry = {
  trigger: string;
  target_route: '/guid';
  route_state: 'postInstallSelfCheck';
  prompt_policy: 'localized Codex CLI post-install self-check prompt describing target OPL working mode and repair path';
  target_state_checks: string[];
  mutation_policy: 'diagnose_first_no_file_mutation_without_user_confirmation';
  release_gate_policy: 'user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt';
};

export type OplDeveloperProfileCapabilityAxis =
  | 'source_channel'
  | 'workspace_trust'
  | 'github_authority'
  | 'agent_automation'
  | 'runtime_mutation_scope';

export type OplDeveloperProfileCapability = {
  standard_default: string;
  developer_opt_in: string;
  display_policy: string;
};

export type OplDeveloperProfileSettings = {
  label_key: string;
  description_key: string;
  hide_machine_status: boolean;
  source: string;
  default_profile: string;
  opt_in_policy: string;
  capability_axes: OplDeveloperProfileCapabilityAxis[];
  capabilities: Record<OplDeveloperProfileCapabilityAxis, OplDeveloperProfileCapability>;
  state_keys: Record<string, string>;
};

export type OplSettingsControlPlaneRoute = {
  id: string;
  path: string;
  label_key: string;
  default_label_en: string;
  default_label_zh: string;
  icon_token: string;
  ia_group: string;
  slot_id: string;
  state_source: string;
  refresh_source: string;
  scope?: string;
  intent?: string;
  risk?: string;
  frequency?: string;
};

export type OplSettingsControlPlaneSecondaryPage = {
  id: string;
  path: string;
  ia_group: string;
  slot_id: string;
  visibility: string;
  scope?: string;
  intent?: string;
  risk?: string;
  frequency?: string;
};

export type OplSettingsCompatibilityRedirect = {
  source_route_id: string;
  source_path: string;
  target_route_id: string;
  target_path: string;
  product_page_id: string;
  anchor: string;
  anchor_query_param: string;
};

export type OplSettingsSearchIndexEntry = {
  id: string;
  page_id: string;
  anchor: string;
  label_zh: string;
  label_en: string;
  keywords_zh: string[];
  keywords_en: string[];
};

export type OplSettingsPageExperience = {
  product_page_id: string;
  route_id: string;
  label_zh: string;
  label_en: string;
};

export type OplSettingsExperienceContract = {
  global_search: {
    entry_testid: string;
    results_testid: string;
    result_item_testid: string;
    empty_state_testid: string;
    anchor_query_param: string;
  };
  page_contracts: Record<string, OplSettingsPageExperience>;
  search_index: {
    schema: string;
    entries: OplSettingsSearchIndexEntry[];
  };
};

export const OPL_SETTINGS_PRIMARY_GROUP_IDS = [
  'overview',
  'account_models',
  'workspace',
  'agents_capabilities',
  'runtime_maintenance',
  'preferences',
] as const;
export type OplSettingsPrimaryGroupId = (typeof OPL_SETTINGS_PRIMARY_GROUP_IDS)[number];

export const OPL_SETTINGS_CARRIER_ROUTE_IDS = [
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
export type OplSettingsCarrierRouteId = (typeof OPL_SETTINGS_CARRIER_ROUTE_IDS)[number];

export const OPL_SETTINGS_DESTINATION_IDS = [
  'overview_status',
  'account_access',
  'models',
  'resources_connections',
  'working_directory',
  'data_storage',
  'agents',
  'capabilities',
  'instructions_context',
  'runtime_services',
  'logs_diagnostics',
  'preferences',
] as const;
export type OplSettingsDestinationId = (typeof OPL_SETTINGS_DESTINATION_IDS)[number];

export type OplSettingsUserNavigationPrimaryGroup = {
  id: OplSettingsPrimaryGroupId;
  label_zh: string;
  label_en: string;
  default_destination_id: OplSettingsDestinationId;
  destination_ids: OplSettingsDestinationId[];
};

export type OplSettingsUserNavigationDestination = {
  id: OplSettingsDestinationId;
  owner_group_id: OplSettingsPrimaryGroupId;
  route_id: OplSettingsCarrierRouteId;
  anchor?: string;
  label_zh: string;
  label_en: string;
  transport_owner_policy?: string;
};

export type OplSettingsUserNavigationOwnerBinding = {
  content_id: string;
  user_destination_id: OplSettingsDestinationId;
  transport_route_id: OplSettingsCarrierRouteId;
  anchor: string;
};

export type OplSettingsUserNavigationAuxiliaryEntry = {
  id: 'about';
  route_id: 'about';
  placement: 'sidebar_bottom';
  label_zh: string;
  label_en: string;
};

export type OplSettingsUserNavigationProjection = {
  schema: 'opl_app_settings_user_navigation.v1';
  source_ref: 'contracts/app-gui-product-contract.json#settings_navigation.settings_ia';
  carrier_route_policy: 'ten_stable_ordinary_route_ids_paths_slots_and_anchors_remain_addressable_but_are_not_rendered_as_ten_primary_navigation_items';
  primary_group_order: OplSettingsPrimaryGroupId[];
  primary_groups: OplSettingsUserNavigationPrimaryGroup[];
  destinations: OplSettingsUserNavigationDestination[];
  secondary_owner_bindings: OplSettingsUserNavigationOwnerBinding[];
  auxiliary_entries: OplSettingsUserNavigationAuxiliaryEntry[];
  responsive_navigation: {
    desktop: 'six_primary_groups_with_the_active_group_expanded_to_second_level_destinations';
    mobile: 'category_list_then_second_level_destination_with_a_visible_back_control';
    mobile_horizontal_tab_strip_allowed: false;
    mobile_navigation_scroll_axis: 'vertical';
    minimum_viewport_px: { width: 400; height: 600 };
    keyboard_policy: 'all_primary_groups_second_level_destinations_back_and_about_are_reachable_in_logical_order';
  };
  global_search_policy: 'preserve_one_bilingual_item_level_search_across_all_carrier_routes_and_owner_anchors';
  footer_policy: {
    duplicate_settings_entry: 'forbidden_inside_settings';
    about_placement: 'sidebar_bottom_auxiliary_entry';
    account_and_update_controls: 'compact_footer_without_reclassifying_them_as_primary_groups';
  };
};

export type OplSettingsControlPlane = {
  source_contract_ref: 'contracts/app-gui-product-contract.json#settings_navigation';
  default_route: string;
  route_identity_policy: string;
  ordinary_visible_tabs: string[];
  ordinary_routes: OplSettingsControlPlaneRoute[];
  secondary_pages: OplSettingsControlPlaneSecondaryPage[];
  compatibility_redirects: Record<string, OplSettingsCompatibilityRedirect>;
  legacy_route_redirects: Record<string, string>;
  extension_anchor_remap: Record<string, string>;
  extension_tab_policy: Record<string, unknown>;
  slot_registry: Record<
    string,
    {
      component_key: string;
      wrapper_policy: string;
      subroute_query_param?: string;
      legacy_subroutes?: Record<string, string>;
    }
  >;
  state_action_policy: OplSettingsControlPlaneActionContract;
  experience_contract: OplSettingsExperienceContract;
  user_navigation_projection: OplSettingsUserNavigationProjection;
};

export type OplSettingsControlPlaneActionContract = {
  default_state_source: string;
  default_refresh_source: string;
  full_profile_policy: string;
  action_route: string;
  recommended_action_ids: {
    doctor: string;
    repair: string;
  };
  shell_must_not_own: string[];
};

export type OplAgentPackageRegistry = {
  default_registry_url: string;
  source_ref: string;
  shell_consumption_policy: string;
  first_party_release_set_metadata: OplFirstPartyPackagePresentation[];
};

export type OplNativeAutomationPolicy = {
  owner: 'app_automation_surface';
  cron_skill_packaged: false;
  exposure: 'automation_page_and_task_routing';
  product_policy_ref: 'contracts/app-gui-product-contract.json#scheduled_tasks_policy';
  route: '/scheduled';
  scheduler_authority: 'active_carrier_native_scheduler_and_store';
  single_scheduler_store_required: true;
  ordinary_sider_entry_visible: true;
  executor: 'codex_cli';
  executor_selector_visible: false;
};

type AppProductProfile = {
  schema_version: 2;
  owner: 'one-person-lab-app';
  purpose: 'app_owned_product_profile';
  state: string;
  app_repo: 'gaofeng21cn/one-person-lab-app';
  product: {
    id: 'one_person_lab_app';
    display_name: 'One Person Lab App';
    ordinary_chrome_name: 'One Person Lab';
    primary_surface: string;
    supported_release_platforms: string[];
    positioning: string;
    primary_user_path: string;
  };
  default_session_profile: {
    provider: 'gflab';
    base_url: 'https://gflabtoken.cn/v1';
    executor: 'codex_cli';
    model: string;
    reasoning_effort: OplCodexReasoningEffort | null;
  };
  gui: {
    authority: 'app_repo_owned_product_truth';
    implementation_carrier: 'opl-aion-shell';
    appearance: {
      default_css_theme_id: 'default-theme';
      default_css_theme_name: string;
      codex_theme_default_enabled: false;
    };
    home: {
      primary_input_surface: 'single_card';
      nested_input_card_frames_allowed: false;
      codex_cli_fixed_executor: true;
      home_executor_selector_visible: false;
      codex_model_selector_visible: boolean;
      codex_model_list_visible: boolean;
      codex_model_policy: 'codex_cli_latest_strongest_model_selector_visible';
      codex_model_auto_option_visible: boolean;
      codex_default_model: string;
      codex_default_reasoning_effort: OplCodexReasoningEffort | null;
      codex_default_permission_mode: 'full-access';
      permission_mode_selector_visible: true;
      home_composer_state_contract: OplHomeComposerStateContract;
      conversation_backend_selector_visible: false;
      conversation_model_selector_visible: boolean;
      conversation_permission_mode_selector_visible: true;
      codex_home_model_status_label: string;
      codex_home_model_status_label_en: string;
      codex_precise_model_display_policy: 'friendly_model_primary_reasoning_primary_model_secondary_menu';
      codex_auto_model_selection: {
        policy_source_ref: 'contracts/app-product-profile.json#codex.auto_model_policy';
        user_can_override_model: boolean;
        user_can_override_reasoning_effort?: boolean;
        user_can_restore_auto: boolean;
        selection_persists_into_conversation: true;
      };
      utility_icon_policy: {
        library: 'icon_park_react_for_opl_owned_utility_icons';
        opl_owned_settings_navigation_and_overview: 'icon_park_react_outline_16px_monochrome';
        settings_icon_geometry: 'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar';
        icon_text_action_geometry: {
          icon_size_px: 16;
          icon_slot_px: 20;
          icon_color: 'currentColor';
          icon_background: 'transparent_none';
          icon_label_gap_px: 8;
          alignment: 'icon_slot_and_label_share_one_vertical_centerline';
          contrast_policy: 'button_foreground_color_applies_to_icon_and_label_together';
          disabled_policy: 'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon';
        };
        upstream_fork_body_bulk_icon_rewrite: 'forbidden';
        refresh_actions: 'icon_only_with_tooltip_and_accessible_name';
        model_reasoning_control: 'text_and_disclosure_without_brain_icon';
        account_identity_avatar: OplAccountIdentityAvatarPolicy;
        global_feedback_action: OplGlobalFeedbackAction;
        scope: 'opl_owned_overlay_surfaces_not_upstream_fork_body';
      };
      codex_model_display_options: OplCodexModelDisplayOptions;
      home_purpose_entries: OplHomePurposeEntry[];
      home_agent_shortcuts: OplHomeAgentShortcut[];
      retired_codex_models_must_not_be_exposed: string[];
    };
    agent_package_invocation_receipt_policy: OplAgentPackageInvocationReceiptPolicy;
    builtin_assistant_route_receipt_policy: OplBuiltinAssistantRouteReceiptPolicy;
    ordinary_capability_selector_policy: OplOrdinaryCapabilitySelectorPolicy;
    agent_package_registry: OplAgentPackageRegistry;
    professional_agent_packages: OplProfessionalAgentPackage[];
    default_assistants: OplHomeAssistant[];
    assistant_skill_profiles: OplAssistantSkillProfile[];
    non_default_assistants: OplNonDefaultAssistant[];
  };
  codex: {
    default_model: string;
    default_reasoning_effort: OplCodexReasoningEffort | null;
    auto_model_policy: OplCodexAutoModelPolicy;
    opl_flow_context: OplFlowContextPolicy;
    opl_app_session_context: OplAppSessionContextPolicy;
    default_visible_skills: string[];
    skill_priority: string[];
    session_context_lines: string[];
    session_context_i18n?: OplCodexSessionContext;
  };
  companion_payloads: {
    default_packaged_codex_skill_ids: string[];
    additional_package_skill_ids: string[];
    official_codex_runtime_capabilities: {
      preferred_capability_ids: string[];
    };
    native_automation: OplNativeAutomationPolicy;
  };
  first_run: {
    readiness_layers: string[];
    ready_to_launch_gate: {
      id: 'ready_to_launch';
      ui_order: 'before_first_conversation_not_before_guid';
      guid_navigation_blocking: false;
      required_core_items: string[];
      must_not_require: string[];
    };
    full_readiness_layers: string[];
    deferred_blockers: string[];
    runtime_provider: {
      full_readiness_provider: 'temporal';
      ready_to_launch_blocking: false;
    };
    command_line_tools: {
      auto_request_installer: boolean;
      blocks_full_first_launch: boolean;
      messages: string[];
    };
    beginner_presentation: {
      audience: 'beginner_non_technical_users';
      presentation_mode: 'simplified_first_run';
      primary_user_goal: 'enter_guid_now_or_complete_guided_setup_first';
      primary_steps: string[];
      primary_progress_signal: string;
      advanced_progress_disclosure: 'collapsed_or_secondary';
      background_maintenance_presentation: 'collapsed_technical_non_blocking';
      technical_detail_policy: 'hidden_until_expanded_or_error';
      completion_navigation_policy: 'manual_guid_entry_available_before_or_after_ready_no_automatic_route';
      defer_navigation_policy: 'explicit_enter_guid_available_before_ready_without_mutating_readiness';
      post_install_ai_self_check_entry: OplPostInstallAiSelfCheckEntry;
    };
  };
  settings: {
    visible_tabs: string[];
    secondary_page_ids: string[];
    environment_items: string[];
    legacy_route_redirects: Record<string, string>;
    control_plane: OplSettingsControlPlane;
    developer_profile: OplDeveloperProfileSettings;
  };
  boundary: {
    app_does_not_own: string[];
  };
};

const OPL_DEVELOPER_PROFILE_CAPABILITY_AXES: OplDeveloperProfileCapabilityAxis[] = [
  'source_channel',
  'workspace_trust',
  'github_authority',
  'agent_automation',
  'runtime_mutation_scope',
];
const REQUIRED_ORDINARY_FORBIDDEN_CAPABILITY_POLICY: OplOrdinaryForbiddenCapabilityPolicy = {
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
};
const REQUIRED_ORDINARY_TEAM_SCRUB_TARGETS = [
  'mcp_servers entries matching forbidden_mcp_matchers',
  'mcp_statuses entries matching forbidden_mcp_matchers',
  'session_mcp_servers entries matching forbidden_mcp_matchers',
  'scrub_extra_keys',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  context: string,
  options: { allowBlank?: boolean; allowEmpty?: boolean } = {}
): string[] {
  const value = record[key];
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.some((entry) => typeof entry !== 'string' || (!options.allowBlank && !entry.trim()))
  ) {
    throw new Error(`Invalid OPL product profile: ${context}.${key} must be a non-empty string array`);
  }
  const normalized = value.map((entry) => (options.allowBlank ? entry : entry.trim()));
  const comparable = normalized.filter((entry) => entry.trim());
  if (new Set(comparable).size !== comparable.length) {
    throw new Error(`Invalid OPL product profile: ${context}.${key} must not contain duplicate non-empty entries`);
  }
  return normalized;
}

function readForbiddenCapabilityPolicy(value: Record<string, unknown>): OplOrdinaryForbiddenCapabilityPolicy {
  const matchers = value.forbidden_mcp_matchers;
  if (!isRecord(matchers)) {
    throw new Error(
      'Invalid OPL product profile: gui.ordinary_capability_selector_policy.forbidden_mcp_matchers must be an object'
    );
  }
  const policy = {
    exact: readStringArray(matchers, 'exact', 'gui.ordinary_capability_selector_policy.forbidden_mcp_matchers'),
    prefixes: readStringArray(matchers, 'prefixes', 'gui.ordinary_capability_selector_policy.forbidden_mcp_matchers'),
    contains: readStringArray(matchers, 'contains', 'gui.ordinary_capability_selector_policy.forbidden_mcp_matchers'),
    extra_keys: readStringArray(value, 'scrub_extra_keys', 'gui.ordinary_capability_selector_policy'),
  };
  if (JSON.stringify(policy) !== JSON.stringify(REQUIRED_ORDINARY_FORBIDDEN_CAPABILITY_POLICY)) {
    throw new Error('Invalid OPL product profile: ordinary forbidden Team MCP policy changed unexpectedly');
  }
  return policy;
}

function validatePostInstallAiSelfCheckEntry(entry: unknown, context: string): OplPostInstallAiSelfCheckEntry {
  if (!isRecord(entry)) {
    throw new Error(`Invalid OPL product profile: ${context} must be declared`);
  }
  if (
    entry.target_route !== '/guid' ||
    entry.route_state !== 'postInstallSelfCheck' ||
    entry.prompt_policy !==
      'localized Codex CLI post-install self-check prompt describing target OPL working mode and repair path' ||
    entry.mutation_policy !== 'diagnose_first_no_file_mutation_without_user_confirmation' ||
    entry.release_gate_policy !== 'user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt'
  ) {
    throw new Error(`Invalid OPL product profile: ${context} has invalid route or policy`);
  }
  const targetStateChecks = readStringArray(entry, 'target_state_checks', context);
  for (const required of [
    'codex_cli_callable',
    'ui_language_policy',
    'session_scoped_opl_app_context',
    'user_agents_md_respected_no_overwrite',
    'mas_mag_rca_routes_visible',
    'opl_meta_agent_capability_visible',
    'codex_skills_plugins_visible',
    'module_update_skill_plugin_continuity',
  ]) {
    if (!targetStateChecks.includes(required)) {
      throw new Error(`Invalid OPL product profile: ${context}.target_state_checks missing ${required}`);
    }
  }
  return {
    trigger: typeof entry.trigger === 'string' ? entry.trigger : '',
    target_route: '/guid',
    route_state: 'postInstallSelfCheck',
    prompt_policy:
      'localized Codex CLI post-install self-check prompt describing target OPL working mode and repair path',
    target_state_checks: targetStateChecks,
    mutation_policy: 'diagnose_first_no_file_mutation_without_user_confirmation',
    release_gate_policy: 'user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt',
  };
}

function readReasoningEffort(value: unknown, context: string): OplCodexReasoningEffort | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid OPL product profile: ${context} must be a non-empty string`);
  }
  return value.trim();
}

function readRequiredReasoningEffort(value: unknown, context: string): OplCodexReasoningEffort {
  const reasoningEffort = readReasoningEffort(value, context);
  if (!reasoningEffort) {
    throw new Error(`Invalid OPL product profile: ${context} must be non-null`);
  }
  return reasoningEffort;
}

function readOplCodexAutoModelPolicy(
  codex: Record<string, unknown>,
  defaultModel: string,
  defaultReasoningEffort: OplCodexReasoningEffort
): OplCodexAutoModelPolicy {
  const value = codex.auto_model_policy;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: codex.auto_model_policy must be an object');
  }
  if (
    value.authority !== 'one-person-lab-app' ||
    value.mode_default !== 'auto' ||
    value.model_catalog_source !== 'codex_cli_model_list' ||
    value.catalog_response_models_field !== 'data' ||
    value.catalog_default_model_field !== 'isDefault' ||
    value.catalog_supported_reasoning_efforts_field !== 'supportedReasoningEfforts' ||
    value.catalog_supported_reasoning_effort_option_value_field !== 'reasoningEffort' ||
    value.catalog_reasoning_effort_order_policy !== 'last_advertised_supported_reasoning_effort_is_highest' ||
    value.catalog_pagination_request_cursor_field !== 'cursor' ||
    value.catalog_pagination_response_cursor_field !== 'nextCursor' ||
    value.catalog_pagination_completion_policy !== 'exhaust_pages_until_next_cursor_is_null' ||
    value.catalog_hidden_model_field !== 'hidden' ||
    value.catalog_hidden_model_policy !== 'exclude_hidden_models_from_auto_and_fixed_options' ||
    value.frontier_model_preference_order_role !== 'known_model_fallback_and_fixed_option_preference_not_allowlist' ||
    value.unknown_default_model_policy !== 'accept_catalog_default_even_when_not_in_frontier_model_preference_order' ||
    value.unknown_model_reasoning_effort_policy !== 'highest_supported_reasoning_effort_from_catalog' ||
    value.catalog_without_default_policy !== 'first_available_known_model_then_first_catalog_model'
  ) {
    throw new Error('Invalid OPL product profile: codex.auto_model_policy semantics are unsupported');
  }
  const configuredDefault = value.configured_default;
  if (
    !isRecord(configuredDefault) ||
    configuredDefault.model !== defaultModel ||
    readRequiredReasoningEffort(
      configuredDefault.reasoning_effort,
      'codex.auto_model_policy.configured_default.reasoning_effort'
    ) !== defaultReasoningEffort
  ) {
    throw new Error('Invalid OPL product profile: Codex configured default must match its generated projections');
  }
  const frontierModelPreferenceOrder = readStringArray(
    value,
    'frontier_model_preference_order',
    'codex.auto_model_policy'
  );
  const rawOverrides = value.known_model_reasoning_effort_overrides;
  if (!isRecord(rawOverrides)) {
    throw new Error('Invalid OPL product profile: Codex known model reasoning overrides must be an object');
  }
  const knownModelReasoningEffortOverrides = Object.fromEntries(
    Object.entries(rawOverrides).map(([model, effort]) => [
      model,
      readRequiredReasoningEffort(effort, `codex.auto_model_policy.known_model_reasoning_effort_overrides.${model}`),
    ])
  );
  const fallback = value.catalog_unavailable_fallback;
  const persistence = value.persistence_policy;
  if (
    !isRecord(fallback) ||
    fallback.model !== defaultModel ||
    readRequiredReasoningEffort(
      fallback.reasoning_effort,
      'codex.auto_model_policy.catalog_unavailable_fallback.reasoning_effort'
    ) !== defaultReasoningEffort ||
    !isRecord(persistence) ||
    persistence.auto !== 'persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog' ||
    persistence.fixed !== 'persist_selected_model_and_reasoning_effort' ||
    persistence.state_encoding !== 'auto_has_no_model_snapshot_fixed_has_model_and_reasoning' ||
    persistence.reasoning_override_from_auto !== 'pin_current_resolved_model_and_exit_auto' ||
    persistence.stale_fixed_model !==
      'preserve_fixed_selection_as_unavailable_until_user_restores_auto_or_selects_available_model'
  ) {
    throw new Error('Invalid OPL product profile: Codex Auto fallback or persistence policy is invalid');
  }
  return {
    authority: 'one-person-lab-app',
    configured_default: { model: defaultModel, reasoning_effort: defaultReasoningEffort },
    mode_default: 'auto',
    model_catalog_source: 'codex_cli_model_list',
    catalog_response_models_field: 'data',
    catalog_default_model_field: 'isDefault',
    catalog_supported_reasoning_efforts_field: 'supportedReasoningEfforts',
    catalog_supported_reasoning_effort_option_value_field: 'reasoningEffort',
    catalog_reasoning_effort_order_policy: 'last_advertised_supported_reasoning_effort_is_highest',
    catalog_pagination_request_cursor_field: 'cursor',
    catalog_pagination_response_cursor_field: 'nextCursor',
    catalog_pagination_completion_policy: 'exhaust_pages_until_next_cursor_is_null',
    catalog_hidden_model_field: 'hidden',
    catalog_hidden_model_policy: 'exclude_hidden_models_from_auto_and_fixed_options',
    frontier_model_preference_order_role: 'known_model_fallback_and_fixed_option_preference_not_allowlist',
    frontier_model_preference_order: frontierModelPreferenceOrder,
    known_model_reasoning_effort_overrides: knownModelReasoningEffortOverrides,
    unknown_default_model_policy: 'accept_catalog_default_even_when_not_in_frontier_model_preference_order',
    unknown_model_reasoning_effort_policy: 'highest_supported_reasoning_effort_from_catalog',
    catalog_without_default_policy: 'first_available_known_model_then_first_catalog_model',
    catalog_unavailable_fallback: { model: defaultModel, reasoning_effort: defaultReasoningEffort },
    persistence_policy: {
      auto: 'persist_auto_mode_only_resolve_model_and_reasoning_from_fresh_catalog',
      fixed: 'persist_selected_model_and_reasoning_effort',
      state_encoding: 'auto_has_no_model_snapshot_fixed_has_model_and_reasoning',
      reasoning_override_from_auto: 'pin_current_resolved_model_and_exit_auto',
      stale_fixed_model: 'preserve_fixed_selection_as_unavailable_until_user_restores_auto_or_selects_available_model',
    },
  };
}

function readStringRecord(value: unknown, context: string): Record<string, string> {
  if (!isRecord(value)) {
    throw new Error(`Invalid OPL product profile: ${context} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0
    )
  );
}

function readStringArrayRecord(value: unknown, context: string): Record<string, string[]> {
  if (!isRecord(value)) {
    throw new Error(`Invalid OPL product profile: ${context} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string[]] => {
      if (!Array.isArray(entry[1])) return false;
      return entry[1].every((item) => typeof item === 'string' && item.trim().length > 0);
    })
  );
}

function readCodexModelDisplayOptions(
  guiHome: Record<string, unknown>,
  defaultReasoningEffort: OplCodexReasoningEffort | null,
  defaultModel: string,
  frontierModelPreferenceOrder: string[]
): OplCodexModelDisplayOptions {
  if (!defaultReasoningEffort) {
    throw new Error('Invalid OPL product profile: Codex model display options require non-null reasoning effort');
  }
  const value = guiHome.codex_model_display_options;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: gui.home.codex_model_display_options must be declared');
  }
  if (
    value.display_policy !== 'friendly_model_name_primary_reasoning_primary_model_secondary_menu' ||
    value.button_label_policy !== 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix' ||
    value.raw_model_id_visible_in_ordinary_ui !== false ||
    value.reasoning_effort_visible_for_every_option !== false ||
    value.reasoning_effort_menu_visible !== true ||
    value.reasoning_menu_title_zh !== '推理' ||
    value.reasoning_menu_title_en !== 'Reasoning' ||
    value.reasoning_effort_override_surface !== 'model_selector_primary_menu' ||
    value.reasoning_effort_options_source !== 'acp_codex_config_options_enum' ||
    value.auto_option_current_resolution_visible !== true ||
    value.model_menu_policy !== 'current_model_secondary_submenu' ||
    value.fixed_model_description_zh !== '固定此模型' ||
    value.fixed_model_description_en !== 'Use this model'
  ) {
    throw new Error('Invalid OPL product profile: Codex model display options must use friendly labels');
  }

  const displayDefaultReasoningEffort = readRequiredReasoningEffort(
    value.default_reasoning_effort,
    'gui.home.codex_model_display_options.default_reasoning_effort'
  );
  if (displayDefaultReasoningEffort !== defaultReasoningEffort) {
    throw new Error('Invalid OPL product profile: Codex model display default reasoning must match Codex default');
  }

  const autoOption = isRecord(value.auto_option) ? value.auto_option : null;
  if (
    !autoOption ||
    autoOption.id !== '__auto' ||
    autoOption.label_zh !== '自动（推荐）' ||
    autoOption.label_en !== 'Auto (recommended)' ||
    autoOption.catalog_unavailable_fallback_model !== defaultModel ||
    autoOption.follows_latest_strongest !== true
  ) {
    throw new Error('Invalid OPL product profile: Codex auto model display option is invalid');
  }
  const autoReasoningEffort = readRequiredReasoningEffort(
    autoOption.catalog_unavailable_fallback_reasoning_effort,
    'gui.home.codex_model_display_options.auto_option.catalog_unavailable_fallback_reasoning_effort'
  );
  if (autoReasoningEffort !== defaultReasoningEffort) {
    throw new Error('Invalid OPL product profile: Codex auto model display reasoning must match Codex default');
  }

  const reasoningLabels = isRecord(value.reasoning_labels) ? value.reasoning_labels : null;
  const userReasoningEffortOptions = Array.isArray(value.user_reasoning_effort_options)
    ? value.user_reasoning_effort_options.map((entry, index) =>
        readRequiredReasoningEffort(
          entry,
          `gui.home.codex_model_display_options.user_reasoning_effort_options[${index}]`
        )
      )
    : [];
  if (
    userReasoningEffortOptions.length < 3 ||
    !userReasoningEffortOptions.includes(defaultReasoningEffort) ||
    new Set(userReasoningEffortOptions).size !== userReasoningEffortOptions.length
  ) {
    throw new Error('Invalid OPL product profile: Codex user reasoning effort options must expose the ACP enum');
  }
  for (const effort of userReasoningEffortOptions) {
    const label = isRecord(reasoningLabels?.[effort]) ? reasoningLabels[effort] : null;
    if (typeof label?.zh !== 'string' || !label.zh.trim() || typeof label.en !== 'string' || !label.en.trim()) {
      throw new Error(`Invalid OPL product profile: Codex reasoning effort option ${effort} must have labels`);
    }
  }

  if (!Array.isArray(value.visible_models)) {
    throw new Error('Invalid OPL product profile: Codex model display visible_models must be an array');
  }
  const visibleModels = value.visible_models.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: Codex model display visible_models[${index}] must be an object`);
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const labelZh = typeof entry.label_zh === 'string' ? entry.label_zh.trim() : '';
    const labelEn = typeof entry.label_en === 'string' ? entry.label_en.trim() : '';
    if (!id || !labelZh || !labelEn || labelZh === id || labelEn === id || 'reasoning_effort' in entry) {
      throw new Error(
        `Invalid OPL product profile: Codex model display option ${id || index} must use friendly labels without reasoning`
      );
    }
    return {
      id,
      label_zh: labelZh,
      label_en: labelEn,
    };
  });
  if (JSON.stringify(visibleModels.map((model) => model.id)) !== JSON.stringify(frontierModelPreferenceOrder)) {
    throw new Error('Invalid OPL product profile: Codex model display options must match frontier preference order');
  }
  const retiredVisibleModelIds = new Set([
    'gpt-5.3-codex-spark',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex-mini',
  ]);
  for (const model of visibleModels) {
    if (retiredVisibleModelIds.has(model.id)) {
      throw new Error(`Invalid OPL product profile: retired Codex model ${model.id} must not be visible`);
    }
  }

  return {
    display_policy: 'friendly_model_name_primary_reasoning_primary_model_secondary_menu',
    button_label_policy: 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix',
    raw_model_id_visible_in_ordinary_ui: false,
    reasoning_effort_visible_for_every_option: false,
    reasoning_effort_menu_visible: true,
    reasoning_menu_title_zh: '推理',
    reasoning_menu_title_en: 'Reasoning',
    reasoning_effort_override_surface: 'model_selector_primary_menu',
    reasoning_effort_options_source: 'acp_codex_config_options_enum',
    default_reasoning_effort: displayDefaultReasoningEffort,
    auto_option_current_resolution_visible: true,
    model_menu_policy: 'current_model_secondary_submenu',
    auto_option: {
      id: '__auto',
      label_zh: '自动（推荐）',
      label_en: 'Auto (recommended)',
      description_zh: typeof autoOption.description_zh === 'string' ? autoOption.description_zh : '',
      description_en: typeof autoOption.description_en === 'string' ? autoOption.description_en : '',
      catalog_unavailable_fallback_model: defaultModel,
      catalog_unavailable_fallback_reasoning_effort: autoReasoningEffort,
      follows_latest_strongest: true,
    },
    fixed_model_description_zh: '固定此模型',
    fixed_model_description_en: 'Use this model',
    reasoning_labels: Object.fromEntries(
      Object.entries(reasoningLabels ?? {}).flatMap(([key, label]) => {
        if (!key.trim() || !isRecord(label)) return [];
        if (typeof label.zh !== 'string' || !label.zh.trim() || typeof label.en !== 'string' || !label.en.trim()) {
          return [];
        }
        return [[key, { zh: label.zh.trim(), en: label.en.trim() }]];
      })
    ) as Record<OplCodexReasoningEffort, { zh: string; en: string }>,
    user_reasoning_effort_options: userReasoningEffortOptions,
    visible_models: visibleModels,
  };
}

function readDeveloperProfileCapability(
  value: unknown,
  axis: OplDeveloperProfileCapabilityAxis
): OplDeveloperProfileCapability {
  if (!isRecord(value)) {
    throw new Error(`Invalid OPL product profile: settings.developer_profile.capabilities.${axis} must be an object`);
  }
  const standardDefault = typeof value.standard_default === 'string' ? value.standard_default.trim() : '';
  const developerOptIn = typeof value.developer_opt_in === 'string' ? value.developer_opt_in.trim() : '';
  const displayPolicy = typeof value.display_policy === 'string' ? value.display_policy.trim() : '';
  if (!standardDefault || !developerOptIn || !displayPolicy) {
    throw new Error(`Invalid OPL product profile: settings.developer_profile.capabilities.${axis} is incomplete`);
  }
  return {
    standard_default: standardDefault,
    developer_opt_in: developerOptIn,
    display_policy: displayPolicy,
  };
}

function readDeveloperProfileSettings(settings: Record<string, unknown>): OplDeveloperProfileSettings {
  const developerProfile = settings.developer_profile;
  if (!isRecord(developerProfile)) {
    throw new Error('Invalid OPL product profile: settings.developer_profile must be declared');
  }
  const capabilityAxes = readStringArray(
    developerProfile,
    'capability_axes',
    'settings.developer_profile'
  ) as OplDeveloperProfileCapabilityAxis[];
  if (capabilityAxes.join(',') !== OPL_DEVELOPER_PROFILE_CAPABILITY_AXES.join(',')) {
    throw new Error('Invalid OPL product profile: Developer Profile capability axes must match OPL App');
  }
  if (
    developerProfile.source !== 'app_state.developer_profile + app_state.modules[].source_policy' ||
    developerProfile.default_profile !== 'standard_user' ||
    developerProfile.opt_in_policy !== 'automatic_for_matching_identity_and_authorized_repositories_with_explicit_off'
  ) {
    throw new Error('Invalid OPL product profile: Developer Profile source and defaults must match OPL App');
  }
  const capabilities = isRecord(developerProfile.capabilities) ? developerProfile.capabilities : null;
  if (!capabilities) {
    throw new Error('Invalid OPL product profile: settings.developer_profile.capabilities must be an object');
  }
  const capabilityEntries = Object.fromEntries(
    OPL_DEVELOPER_PROFILE_CAPABILITY_AXES.map((axis) => [
      axis,
      readDeveloperProfileCapability(capabilities[axis], axis),
    ])
  ) as Record<OplDeveloperProfileCapabilityAxis, OplDeveloperProfileCapability>;

  return {
    label_key: typeof developerProfile.label_key === 'string' ? developerProfile.label_key : '',
    description_key: typeof developerProfile.description_key === 'string' ? developerProfile.description_key : '',
    hide_machine_status: developerProfile.hide_machine_status === true,
    source: developerProfile.source,
    default_profile: developerProfile.default_profile,
    opt_in_policy: developerProfile.opt_in_policy,
    capability_axes: capabilityAxes,
    capabilities: capabilityEntries,
    state_keys: readStringRecord(developerProfile.state_keys, 'settings.developer_profile.state_keys'),
  };
}

function readProductProfile(value: Record<string, unknown>): AppProductProfile['product'] {
  const product = value.product;
  if (!isRecord(product)) {
    throw new Error('Invalid OPL product profile: product must be declared');
  }
  const supportedReleasePlatforms = readStringArray(product, 'supported_release_platforms', 'product');
  if (
    product.id !== 'one_person_lab_app' ||
    product.display_name !== 'One Person Lab App' ||
    product.ordinary_chrome_name !== 'One Person Lab' ||
    typeof product.primary_surface !== 'string' ||
    typeof product.positioning !== 'string' ||
    typeof product.primary_user_path !== 'string'
  ) {
    throw new Error('Invalid OPL product profile: product identity must match One Person Lab App');
  }
  return {
    id: 'one_person_lab_app',
    display_name: 'One Person Lab App',
    ordinary_chrome_name: 'One Person Lab',
    primary_surface: product.primary_surface,
    supported_release_platforms: supportedReleasePlatforms,
    positioning: product.positioning,
    primary_user_path: product.primary_user_path,
  };
}

function readHomePurposeEntries(guiHome: Record<string, unknown>): OplHomePurposeEntry[] {
  const value = guiHome.home_purpose_entries;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Invalid OPL product profile: gui.home.home_purpose_entries must be a non-empty array');
  }

  const entries = value.map((entry, index): OplHomePurposeEntry => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: gui.home.home_purpose_entries[${index}] must be an object`);
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const primaryLabel = typeof entry.primary_label === 'string' ? entry.primary_label.trim() : '';
    const targetAssistantId = typeof entry.target_assistant_id === 'string' ? entry.target_assistant_id.trim() : '';
    const targetAssistantShortName =
      typeof entry.target_assistant_short_name === 'string' ? entry.target_assistant_short_name.trim() : '';
    if (!id || !primaryLabel || !targetAssistantId || !targetAssistantShortName) {
      throw new Error(`Invalid OPL product profile: gui.home.home_purpose_entries[${index}] has blank fields`);
    }
    if (entry.display_policy !== 'purpose_first' || entry.home_entry_policy !== 'visible_click_to_start') {
      throw new Error(`Invalid OPL product profile: purpose entry ${id} must be visible purpose-first`);
    }
    return {
      id,
      primary_label: primaryLabel,
      target_assistant_id: targetAssistantId,
      target_assistant_short_name: targetAssistantShortName,
      display_policy: 'purpose_first',
      home_entry_policy: 'visible_click_to_start',
    };
  });

  if (entries.map((entry) => entry.id).join(',') !== ['research', 'grant', 'ppt', 'book'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must be research, grant, ppt, and book');
  }
  if (entries.map((entry) => entry.primary_label).join(',') !== ['科研', '基金', '演示', '写书'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must expose App-owned labels');
  }
  if (entries.map((entry) => entry.target_assistant_id).join(',') !== ['mas', 'mag', 'rca', 'obf'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must target MAS, MAG, RCA, and BookForge');
  }
  return entries;
}

function readHomeAgentShortcuts(guiHome: Record<string, unknown>): OplHomeAgentShortcut[] {
  const value = guiHome.home_agent_shortcuts;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Invalid OPL product profile: gui.home.home_agent_shortcuts must be a non-empty array');
  }

  const shortcuts = value.map((entry, index): OplHomeAgentShortcut => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: gui.home.home_agent_shortcuts[${index}] must be an object`);
    }
    const shortcutId = typeof entry.shortcut_id === 'string' ? entry.shortcut_id.trim() : '';
    const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
    const primaryLabel = typeof entry.primary_label === 'string' ? entry.primary_label.trim() : '';
    const packageShortName = typeof entry.package_short_name === 'string' ? entry.package_short_name.trim() : '';
    const codexVisibleEntry = typeof entry.codex_visible_entry === 'string' ? entry.codex_visible_entry.trim() : '';
    if (!shortcutId || !packageId || !primaryLabel || !packageShortName || !codexVisibleEntry) {
      throw new Error(`Invalid OPL product profile: gui.home.home_agent_shortcuts[${index}] has blank fields`);
    }
    if (
      entry.source !== 'opl_app_home' ||
      entry.executor !== 'codex_cli' ||
      entry.display_policy !== 'purpose_first' ||
      entry.home_entry_policy !== 'visible_click_to_start'
    ) {
      throw new Error(`Invalid OPL product profile: home agent shortcut ${shortcutId} has unsupported policy`);
    }
    return {
      shortcut_id: shortcutId,
      package_id: packageId,
      primary_label: primaryLabel,
      package_short_name: packageShortName,
      codex_visible_entry: codexVisibleEntry,
      required_skill_ids: readStringArray(entry, 'required_skill_ids', `gui.home.home_agent_shortcuts.${shortcutId}`),
      source: 'opl_app_home',
      executor: 'codex_cli',
      display_policy: 'purpose_first',
      home_entry_policy: 'visible_click_to_start',
      default_visible: entry.default_visible === true,
      user_configurable: entry.user_configurable === true,
    };
  });
  const ids = shortcuts.map((shortcut) => shortcut.shortcut_id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Invalid OPL product profile: gui.home.home_agent_shortcuts must not contain duplicate ids');
  }
  for (const required of ['research', 'grant', 'ppt', 'book']) {
    if (!ids.includes(required)) {
      throw new Error(`Invalid OPL product profile: home agent shortcuts must include ${required}`);
    }
  }
  if (!shortcuts.every((shortcut) => shortcut.user_configurable)) {
    throw new Error('Invalid OPL product profile: home agent shortcuts must be user configurable');
  }
  return shortcuts;
}

function readHomeComposerStateContract(guiHome: Record<string, unknown>): OplHomeComposerStateContract {
  const value = guiHome.home_composer_state_contract;
  if (!isRecord(value) || !isRecord(value.invariants) || !isRecord(value.semantic_probe)) {
    throw new Error('Invalid OPL product profile: gui.home.home_composer_state_contract must be an object');
  }
  const semanticProbe = value.semantic_probe;
  const stateAttributes = semanticProbe.state_attributes;
  const shortcutPackageIds = value.shortcut_package_ids;
  if (
    value.contract_id !== 'opl_home_composer_state.v1' ||
    value.executor !== 'codex' ||
    JSON.stringify(shortcutPackageIds) !== JSON.stringify([null, 'mas', 'mag', 'rca', 'obf', 'oma']) ||
    JSON.stringify(value.viewports) !== JSON.stringify(['desktop', 'mobile']) ||
    JSON.stringify(value.availability_states) !== JSON.stringify(['available', 'unavailable']) ||
    value.invariants.model_reasoning_visible !== true ||
    value.invariants.permission_access_visible !== true ||
    value.invariants.executor_selector_visible !== false ||
    value.invariants.active_shortcut_changes_executor !== false ||
    value.invariants.default_visibility_governs_execution !== false ||
    semanticProbe.root_test_id !== 'opl-guid-entry' ||
    !isRecord(stateAttributes) ||
    stateAttributes.executor !== 'data-opl-composer-executor' ||
    stateAttributes.active_shortcut_id !== 'data-opl-active-shortcut' ||
    stateAttributes.model_reasoning_visible !== 'data-opl-model-reasoning-visible' ||
    stateAttributes.permission_access_visible !== 'data-opl-permission-access-visible' ||
    stateAttributes.executor_selector_visible !== 'data-opl-executor-selector-visible' ||
    JSON.stringify(semanticProbe.desktop_required_controls) !==
      JSON.stringify(['guid-model-selector', 'agent-mode-selector-*']) ||
    JSON.stringify(semanticProbe.mobile_required_controls) !==
      JSON.stringify([
        'mobile-action-sheet-model',
        'mobile-action-sheet-reasoning',
        'mobile-action-sheet-permission',
      ]) ||
    JSON.stringify(semanticProbe.forbidden_controls) !== JSON.stringify(['agent-pill-*']) ||
    semanticProbe.failure_field !== 'missing_controls'
  ) {
    throw new Error('Invalid OPL product profile: Home composer state contract drifted from fixed Codex controls');
  }
  return {
    contract_id: 'opl_home_composer_state.v1',
    executor: 'codex',
    shortcut_package_ids: [...(shortcutPackageIds as Array<string | null>)],
    viewports: ['desktop', 'mobile'],
    availability_states: ['available', 'unavailable'],
    invariants: {
      model_reasoning_visible: true,
      permission_access_visible: true,
      executor_selector_visible: false,
      active_shortcut_changes_executor: false,
      default_visibility_governs_execution: false,
    },
    semantic_probe: {
      root_test_id: 'opl-guid-entry',
      state_attributes: { ...(stateAttributes as Record<string, string>) },
      desktop_required_controls: [...(semanticProbe.desktop_required_controls as string[])],
      mobile_required_controls: [...(semanticProbe.mobile_required_controls as string[])],
      forbidden_controls: [...(semanticProbe.forbidden_controls as string[])],
      failure_field: 'missing_controls',
    },
  };
}

function readAgentPackageRegistry(gui: Record<string, unknown>): OplAgentPackageRegistry {
  const value = gui.agent_package_registry;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: gui.agent_package_registry must be an object');
  }
  const defaultRegistryUrl = readString(value, 'default_registry_url', 'gui.agent_package_registry');
  try {
    if (new URL(defaultRegistryUrl).protocol !== 'https:') throw new Error('unsupported protocol');
  } catch {
    throw new Error('Invalid OPL product profile: gui.agent_package_registry.default_registry_url must be HTTPS');
  }
  const metadata = value.first_party_release_set_metadata;
  if (!Array.isArray(metadata)) {
    throw new Error(
      'Invalid OPL product profile: gui.agent_package_registry.first_party_release_set_metadata must be an array'
    );
  }
  return {
    default_registry_url: defaultRegistryUrl,
    source_ref: readString(value, 'source_ref', 'gui.agent_package_registry'),
    shell_consumption_policy: readString(value, 'shell_consumption_policy', 'gui.agent_package_registry'),
    first_party_release_set_metadata: metadata.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(
          `Invalid OPL product profile: gui.agent_package_registry.first_party_release_set_metadata[${index}] must be an object`
        );
      }
      const context = `gui.agent_package_registry.first_party_release_set_metadata[${index}]`;
      const packageId = readString(entry, 'package_id', context);
      const displayName = readString(entry, 'display_name', context);
      const description = readString(entry, 'description', context);
      const displayNameI18n = isRecord(entry.display_name_i18n)
        ? readStringRecord(entry.display_name_i18n, `${context}.display_name_i18n`)
        : { 'zh-CN': displayName, 'en-US': displayName };
      const descriptionI18n = isRecord(entry.description_i18n)
        ? readStringRecord(entry.description_i18n, `${context}.description_i18n`)
        : { 'zh-CN': description, 'en-US': description };
      return {
        package_id: packageId,
        display_name: displayName,
        description,
        display_name_i18n: {
          'zh-CN': displayNameI18n['zh-CN'],
          'en-US': displayNameI18n['en-US'],
        },
        description_i18n: {
          'zh-CN': descriptionI18n['zh-CN'],
          'en-US': descriptionI18n['en-US'],
        },
      };
    }),
  };
}

function readProfessionalAgentPackages(gui: Record<string, unknown>): OplProfessionalAgentPackage[] {
  const value = gui.professional_agent_packages;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Invalid OPL product profile: gui.professional_agent_packages must be a non-empty array');
  }

  const packages = value.map((entry, index): OplProfessionalAgentPackage => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: gui.professional_agent_packages[${index}] must be an object`);
    }
    const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
    const displayName = typeof entry.display_name === 'string' ? entry.display_name.trim() : '';
    const shortName = typeof entry.short_name === 'string' ? entry.short_name.trim() : '';
    const role = typeof entry.role === 'string' ? entry.role.trim() : '';
    const packageKind = typeof entry.package_kind === 'string' ? entry.package_kind.trim() : '';
    const codexVisibleEntry = typeof entry.codex_visible_entry === 'string' ? entry.codex_visible_entry.trim() : '';
    const sessionRoutingSummaryI18n = readStringRecord(
      entry.session_routing_summary_i18n,
      `gui.professional_agent_packages.${packageId}.session_routing_summary_i18n`
    );
    const displayNameI18n = isRecord(entry.display_name_i18n)
      ? readStringRecord(entry.display_name_i18n, `gui.professional_agent_packages.${packageId}.display_name_i18n`)
      : { 'zh-CN': displayName, 'en-US': displayName };
    const descriptionI18n = isRecord(entry.description_i18n)
      ? readStringRecord(entry.description_i18n, `gui.professional_agent_packages.${packageId}.description_i18n`)
      : sessionRoutingSummaryI18n;
    if (!packageId || !displayName || !shortName || !role || !packageKind || !codexVisibleEntry) {
      throw new Error(`Invalid OPL product profile: gui.professional_agent_packages[${index}] has blank fields`);
    }
    if (
      entry.installed_manageable !== true ||
      entry.required_skill_policy !== 'checked_locked' ||
      entry.optional_skill_policy !== 'unchecked_user_selectable' ||
      entry.skill_menu_policy !== 'assistant_scoped_required_checked_optional_visible'
    ) {
      throw new Error(`Invalid OPL product profile: professional agent package ${packageId} has unsupported policy`);
    }
    return {
      package_id: packageId,
      display_name: displayName,
      display_name_i18n: {
        'zh-CN': displayNameI18n['zh-CN'],
        'en-US': displayNameI18n['en-US'],
      },
      short_name: shortName,
      role,
      package_kind: packageKind,
      installed_manageable: true,
      default_home_visible: entry.default_home_visible === true,
      codex_visible_entry: codexVisibleEntry,
      home_shortcut_ids: readStringArray(entry, 'home_shortcut_ids', `gui.professional_agent_packages.${packageId}`, {
        allowEmpty: true,
      }),
      required_skill_ids: readStringArray(entry, 'required_skill_ids', `gui.professional_agent_packages.${packageId}`),
      optional_skill_ids: readStringArray(entry, 'optional_skill_ids', `gui.professional_agent_packages.${packageId}`, {
        allowEmpty: true,
      }),
      description_i18n: {
        'zh-CN': descriptionI18n['zh-CN'],
        'en-US': descriptionI18n['en-US'],
      },
      session_routing_summary_i18n: {
        'zh-CN': sessionRoutingSummaryI18n['zh-CN'],
        'en-US': sessionRoutingSummaryI18n['en-US'],
      },
      required_skill_policy: 'checked_locked',
      optional_skill_policy: 'unchecked_user_selectable',
      skill_menu_policy: 'assistant_scoped_required_checked_optional_visible',
    };
  });
  const packageIds = packages.map((agentPackage) => agentPackage.package_id);
  if (new Set(packageIds).size !== packageIds.length) {
    throw new Error('Invalid OPL product profile: gui.professional_agent_packages must not contain duplicate ids');
  }
  for (const required of ['mas', 'mag', 'rca', 'obf', 'oma']) {
    if (!packageIds.includes(required)) {
      throw new Error(`Invalid OPL product profile: professional agent packages must include ${required}`);
    }
  }
  return packages;
}

function readDefaultHomeAssistants(gui: Record<string, unknown>): OplHomeAssistant[] {
  const value = gui.default_assistants;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must be a non-empty array');
  }

  const assistants = value.map((entry, index): OplHomeAssistant => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: gui.default_assistants[${index}] must be an object`);
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const displayName = typeof entry.display_name === 'string' ? entry.display_name.trim() : '';
    const shortName = typeof entry.short_name === 'string' ? entry.short_name.trim() : '';
    const homePurposeLabel = typeof entry.home_purpose_label === 'string' ? entry.home_purpose_label.trim() : '';
    const role = typeof entry.role === 'string' ? entry.role.trim() : '';
    const avatar = typeof entry.avatar === 'string' ? entry.avatar.trim() : '';
    if (!id || !displayName || !shortName || !homePurposeLabel || !role || !avatar) {
      throw new Error(`Invalid OPL product profile: gui.default_assistants[${index}] has blank identity fields`);
    }
    if (entry.home_entry_display_policy !== 'purpose_first' || entry.home_entry_policy !== 'purpose_entry_target') {
      throw new Error(`Invalid OPL product profile: default assistant ${id} must target a purpose-first home entry`);
    }
    const descriptionI18n = readStringRecord(entry.description_i18n, `gui.default_assistants.${id}.description_i18n`);
    const promptsI18n = readStringArrayRecord(entry.prompts_i18n, `gui.default_assistants.${id}.prompts_i18n`);
    if (Object.keys(descriptionI18n).length === 0 || Object.keys(promptsI18n).length === 0) {
      throw new Error(
        `Invalid OPL product profile: default assistant ${id} must include localized description and prompts`
      );
    }
    return {
      id,
      display_name: displayName,
      short_name: shortName,
      home_purpose_label: homePurposeLabel,
      home_entry_display_policy: 'purpose_first',
      role,
      home_entry_policy: 'purpose_entry_target',
      avatar,
      description_i18n: descriptionI18n,
      prompts_i18n: promptsI18n,
    };
  });

  const ids = assistants.map((assistant) => assistant.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must not contain duplicate ids');
  }
  for (const required of ['mas', 'mag', 'rca', 'obf']) {
    if (!ids.includes(required)) {
      throw new Error(`Invalid OPL product profile: gui.default_assistants must include ${required}`);
    }
  }
  if (ids.includes('oma')) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must not include oma');
  }
  if (ids.includes('mds')) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must not include mds');
  }
  const purposeLabels = assistants.map((assistant) => assistant.home_purpose_label);
  if (purposeLabels.join(',') !== ['科研', '基金', '演示', '写书'].join(',')) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must expose purpose-first labels');
  }
  return assistants;
}

function readNonDefaultAssistants(gui: Record<string, unknown>): OplNonDefaultAssistant[] {
  const value = gui.non_default_assistants;
  if (!Array.isArray(value)) {
    throw new Error('Invalid OPL product profile: gui.non_default_assistants must be an array');
  }

  const assistants = value.map((entry, index): OplNonDefaultAssistant => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: gui.non_default_assistants[${index}] must be an object`);
    }
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const displayName = typeof entry.display_name === 'string' ? entry.display_name.trim() : '';
    const shortName = typeof entry.short_name === 'string' ? entry.short_name.trim() : '';
    const role = typeof entry.role === 'string' ? entry.role.trim() : '';
    const avatar = typeof entry.avatar === 'string' ? entry.avatar.trim() : '';
    if (!id || !displayName || !shortName || !role || !avatar) {
      throw new Error(`Invalid OPL product profile: gui.non_default_assistants[${index}] has blank identity fields`);
    }
    const homeEntryPolicy = entry.home_entry_policy;
    const homeDefaultVisible = entry.home_default_visible;
    const validHomePolicy =
      id === 'oma'
        ? homeEntryPolicy === 'settings_managed_home_shortcut' && homeDefaultVisible === true
        : homeEntryPolicy === 'explicit_or_settings_only' && homeDefaultVisible === false;
    if (!validHomePolicy) {
      throw new Error(`Invalid OPL product profile: non-default assistant ${id} has unsupported home policy`);
    }
    const normalizedHomeEntryPolicy: OplNonDefaultAssistant['home_entry_policy'] =
      id === 'oma' ? 'settings_managed_home_shortcut' : 'explicit_or_settings_only';
    const normalizedHomeDefaultVisible = id === 'oma';
    return {
      id,
      display_name: displayName,
      short_name: shortName,
      role,
      home_entry_policy: normalizedHomeEntryPolicy,
      home_default_visible: normalizedHomeDefaultVisible,
      avatar,
      description_i18n: readStringRecord(entry.description_i18n, `gui.non_default_assistants.${id}.description_i18n`),
      prompts_i18n: readStringArrayRecord(entry.prompts_i18n, `gui.non_default_assistants.${id}.prompts_i18n`),
    };
  });

  const ids = assistants.map((assistant) => assistant.id);
  if (!ids.includes('oma')) {
    throw new Error('Invalid OPL product profile: gui.non_default_assistants must include oma');
  }
  return assistants;
}

function readAssistantSkillProfiles(gui: Record<string, unknown>): OplAssistantSkillProfile[] {
  const value = gui.assistant_skill_profiles;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Invalid OPL product profile: gui.assistant_skill_profiles must be a non-empty array');
  }

  const profiles = value.map((entry, index): OplAssistantSkillProfile => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: gui.assistant_skill_profiles[${index}] must be an object`);
    }
    const assistantId = typeof entry.assistant_id === 'string' ? entry.assistant_id.trim() : '';
    if (!assistantId) {
      throw new Error(`Invalid OPL product profile: gui.assistant_skill_profiles[${index}] must have assistant_id`);
    }
    if (
      entry.required_skill_policy !== 'checked_locked' ||
      entry.optional_skill_policy !== 'unchecked_user_selectable' ||
      entry.skill_menu_policy !== 'assistant_scoped_required_checked_optional_visible'
    ) {
      throw new Error(`Invalid OPL product profile: assistant skill profile ${assistantId} has unsupported policy`);
    }
    return {
      assistant_id: assistantId,
      required_skills: readStringArray(entry, 'required_skills', `gui.assistant_skill_profiles.${assistantId}`),
      optional_skills: readStringArray(entry, 'optional_skills', `gui.assistant_skill_profiles.${assistantId}`),
      required_skill_policy: 'checked_locked',
      optional_skill_policy: 'unchecked_user_selectable',
      skill_menu_policy: 'assistant_scoped_required_checked_optional_visible',
    };
  });

  if (profiles.map((profile) => profile.assistant_id).join(',') !== ['mas', 'mag', 'rca', 'obf'].join(',')) {
    throw new Error('Invalid OPL product profile: assistant skill profiles must be MAS, MAG, RCA, and BookForge');
  }
  for (const profile of profiles) {
    const requiredSkillsByAssistant: Record<string, string[]> = {
      mas: ['med-autoscience'],
      mag: ['med-autogrant'],
      rca: ['redcube-ai'],
      obf: ['opl-bookforge'],
    };
    if (profile.required_skills.join(',') !== (requiredSkillsByAssistant[profile.assistant_id] ?? []).join(',')) {
      throw new Error(`Invalid OPL product profile: assistant ${profile.assistant_id} must require its matching skill`);
    }
    if ('hidden_home_skill_names' in profile) {
      throw new Error(`Invalid OPL product profile: assistant ${profile.assistant_id} must not carry UI hiding policy`);
    }
  }
  return profiles;
}

function readAgentPackageInvocationReceiptPolicy(gui: Record<string, unknown>): OplAgentPackageInvocationReceiptPolicy {
  const value = gui.agent_package_invocation_receipt_policy;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: gui.agent_package_invocation_receipt_policy must be an object');
  }
  const requiredForShortcuts = readStringArray(
    value,
    'required_for_package_shortcuts',
    'gui.agent_package_invocation_receipt_policy'
  );
  const requiredFields = readStringArray(value, 'required_fields', 'gui.agent_package_invocation_receipt_policy');
  const mustNotGovern = readStringArray(value, 'must_not_govern', 'gui.agent_package_invocation_receipt_policy');
  if (
    value.scope !== 'package_shortcut_launch_to_codex_conversation' ||
    value.route_kind !== 'agent_package_shortcut' ||
    value.executor !== 'codex_cli' ||
    value.source !== 'opl_app_home' ||
    value.receipt_authority !== 'launch_fact_only_no_session_behavior_domain_workflow_or_readiness' ||
    value.must_not_depend_on_visible_backend_selection !== true
  ) {
    throw new Error('Invalid OPL product profile: agent package invocation receipt policy is unsupported');
  }
  for (const requiredField of [
    'route_kind',
    'executor',
    'package_id',
    'shortcut_id',
    'codex_visible_entry',
    'required_skill_ids',
    'source',
  ]) {
    if (!requiredFields.includes(requiredField)) {
      throw new Error(`Invalid OPL product profile: package invocation receipt policy must include ${requiredField}`);
    }
  }
  for (const forbiddenAuthority of ['session_behavior', 'domain_workflow', 'domain_readiness']) {
    if (!mustNotGovern.includes(forbiddenAuthority)) {
      throw new Error(
        `Invalid OPL product profile: package invocation receipt policy must not govern ${forbiddenAuthority}`
      );
    }
  }
  return {
    scope: 'package_shortcut_launch_to_codex_conversation',
    required_for_package_shortcuts: requiredForShortcuts,
    route_kind: 'agent_package_shortcut',
    executor: 'codex_cli',
    source: 'opl_app_home',
    required_fields: requiredFields,
    receipt_authority: 'launch_fact_only_no_session_behavior_domain_workflow_or_readiness',
    must_not_govern: mustNotGovern,
    must_not_depend_on_visible_backend_selection: true,
  };
}

function readBuiltinAssistantRouteReceiptPolicy(gui: Record<string, unknown>): OplBuiltinAssistantRouteReceiptPolicy {
  const value = gui.builtin_assistant_route_receipt_policy;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: gui.builtin_assistant_route_receipt_policy must be an object');
  }
  const requiredForAssistants = readStringArray(
    value,
    'required_for_assistants',
    'gui.builtin_assistant_route_receipt_policy'
  );
  const requiredFields = readStringArray(value, 'required_fields', 'gui.builtin_assistant_route_receipt_policy');
  if (
    requiredForAssistants.join(',') !== ['mas', 'mag', 'rca', 'obf'].join(',') ||
    value.scope !== 'home_purpose_entry_to_conversation' ||
    value.route_kind !== 'builtin_capability' ||
    value.executor !== 'codex_cli' ||
    value.source !== 'opl_app_home' ||
    value.must_not_depend_on_visible_backend_selection !== true
  ) {
    throw new Error('Invalid OPL product profile: built-in assistant route receipt policy is unsupported');
  }
  for (const requiredField of ['route_kind', 'executor', 'assistant_id', 'assistant_short_name', 'source']) {
    if (!requiredFields.includes(requiredField)) {
      throw new Error(`Invalid OPL product profile: route receipt policy must include ${requiredField}`);
    }
  }
  return {
    ...(value.migration_alias_for === 'agent_package_invocation_receipt_policy'
      ? { migration_alias_for: 'agent_package_invocation_receipt_policy' as const }
      : {}),
    scope: 'home_purpose_entry_to_conversation',
    required_for_assistants: requiredForAssistants,
    route_kind: 'builtin_capability',
    executor: 'codex_cli',
    source: 'opl_app_home',
    required_fields: requiredFields,
    must_not_depend_on_visible_backend_selection: true,
  };
}

function readOrdinaryCapabilitySelectorPolicy(gui: Record<string, unknown>): OplOrdinaryCapabilitySelectorPolicy {
  const value = gui.ordinary_capability_selector_policy;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: gui.ordinary_capability_selector_policy must be an object');
  }
  const agentReferenceAdmissionPolicy = value.agent_reference_admission_policy;
  if (
    !isRecord(agentReferenceAdmissionPolicy) ||
    agentReferenceAdmissionPolicy.active_agent_package_cardinality !== 'zero_or_one' ||
    agentReferenceAdmissionPolicy.selection_authority !==
      'home_starter_new_session_capability_palette_or_explicit_capability_route_only' ||
    agentReferenceAdmissionPolicy.at_mention_agent_selection_allowed !== false ||
    agentReferenceAdmissionPolicy.plain_text_agent_reference_changes_active_package !== false ||
    agentReferenceAdmissionPolicy.multiple_agent_reference_policy !==
      'may_coexist_as_prompt_context_but_never_create_multiple_active_agent_packages' ||
    agentReferenceAdmissionPolicy.cross_agent_semantic_admission_owner !==
      'target_primary_skill_over_complete_current_user_request' ||
    agentReferenceAdmissionPolicy.deterministic_cross_agent_routing_allowed !== false ||
    agentReferenceAdmissionPolicy.oma_engineering_admission !==
      'explicit_target_agent_and_explicit_agent_engineering_objective_required' ||
    agentReferenceAdmissionPolicy.deliverable_failure_policy !==
      'repair_current_deliverable_never_authorize_agent_engineering' ||
    agentReferenceAdmissionPolicy.existing_conversation_rebinding_allowed !== false
  ) {
    throw new Error(
      'Invalid OPL product profile: gui.ordinary_capability_selector_policy Agent reference admission is unsupported'
    );
  }
  const visibleMcpServerIds = Array.isArray(value.visible_mcp_server_ids)
    ? value.visible_mcp_server_ids.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    : [];
  if (visibleMcpServerIds.some((entry) => !entry) || new Set(visibleMcpServerIds).size !== visibleMcpServerIds.length) {
    throw new Error(
      'Invalid OPL product profile: gui.ordinary_capability_selector_policy.visible_mcp_server_ids must be unique strings'
    );
  }
  const forbiddenSkillExamples = readStringArray(
    value,
    'forbidden_skill_examples',
    'gui.ordinary_capability_selector_policy'
  );
  const forbiddenMcpExamples = readStringArray(
    value,
    'forbidden_mcp_examples',
    'gui.ordinary_capability_selector_policy'
  );
  const requiredScrubTargets = readStringArray(
    value,
    'required_scrub_targets',
    'gui.ordinary_capability_selector_policy'
  );
  const forbiddenPolicy = readForbiddenCapabilityPolicy(value);
  if (
    value.scope !== 'home_composer_and_ordinary_conversation' ||
    value.authority !== 'app_owned_opl_allowlist' ||
    value.skill_source_ref !== 'gui.professional_agent_packages.required_skill_ids + optional_skill_ids' ||
    value.skill_menu_policy !== 'assistant_scoped_required_checked_optional_visible' ||
    value.conversation_loaded_skill_display_policy !== 'filter_to_ordinary_skill_allowlist' ||
    value.mcp_server_source_ref !== 'gui.ordinary_capability_selector_policy.visible_mcp_server_ids' ||
    value.mcp_menu_policy !== 'empty_until_app_explicitly_whitelists_opl_mcp_servers' ||
    value.conversation_loaded_mcp_display_policy !== 'filter_to_visible_mcp_server_ids' ||
    value.forbidden_mcp_policy !==
      'do_not_surface_user_or_aionui_mcp_servers_in_ordinary_home_without_app_profile_allowlist' ||
    value.conversation_snapshot_policy !==
      'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations'
  ) {
    throw new Error('Invalid OPL product profile: ordinary capability selector policy is unsupported');
  }
  for (const forbidden of ['aionui-skills', 'aionui-webui-setup', 'skill-creator', 'cron']) {
    if (!forbiddenSkillExamples.includes(forbidden)) {
      throw new Error(`Invalid OPL product profile: ordinary selector forbidden examples must include ${forbidden}`);
    }
  }
  for (const forbidden of ['aionui-team', 'team_*', 'mcp__aionui-team*', 'team_mcp_stdio_config', 'team_id/teamId']) {
    if (!forbiddenMcpExamples.includes(forbidden)) {
      throw new Error(
        `Invalid OPL product profile: ordinary selector forbidden MCP examples must include ${forbidden}`
      );
    }
  }
  if (JSON.stringify(requiredScrubTargets) !== JSON.stringify(REQUIRED_ORDINARY_TEAM_SCRUB_TARGETS)) {
    throw new Error('Invalid OPL product profile: ordinary selector Team scrub targets are unsupported');
  }
  return {
    scope: 'home_composer_and_ordinary_conversation',
    authority: 'app_owned_opl_allowlist',
    agent_reference_admission_policy: {
      active_agent_package_cardinality: 'zero_or_one',
      selection_authority: 'home_starter_new_session_capability_palette_or_explicit_capability_route_only',
      at_mention_agent_selection_allowed: false,
      plain_text_agent_reference_changes_active_package: false,
      multiple_agent_reference_policy: 'may_coexist_as_prompt_context_but_never_create_multiple_active_agent_packages',
      cross_agent_semantic_admission_owner: 'target_primary_skill_over_complete_current_user_request',
      deterministic_cross_agent_routing_allowed: false,
      oma_engineering_admission: 'explicit_target_agent_and_explicit_agent_engineering_objective_required',
      deliverable_failure_policy: 'repair_current_deliverable_never_authorize_agent_engineering',
      existing_conversation_rebinding_allowed: false,
    },
    skill_source_ref: 'gui.professional_agent_packages.required_skill_ids + optional_skill_ids',
    skill_menu_policy: 'assistant_scoped_required_checked_optional_visible',
    conversation_loaded_skill_display_policy: 'filter_to_ordinary_skill_allowlist',
    mcp_server_source_ref: 'gui.ordinary_capability_selector_policy.visible_mcp_server_ids',
    mcp_menu_policy: 'empty_until_app_explicitly_whitelists_opl_mcp_servers',
    visible_mcp_server_ids: visibleMcpServerIds,
    conversation_loaded_mcp_display_policy: 'filter_to_visible_mcp_server_ids',
    forbidden_skill_examples: forbiddenSkillExamples,
    forbidden_mcp_policy: 'do_not_surface_user_or_aionui_mcp_servers_in_ordinary_home_without_app_profile_allowlist',
    forbidden_mcp_examples: forbiddenMcpExamples,
    conversation_snapshot_policy:
      'scrub_disabled_team_mcp_and_team_metadata_before_rendering_or_inheriting_ordinary_conversations',
    forbidden_mcp_matchers: {
      exact: forbiddenPolicy.exact,
      prefixes: forbiddenPolicy.prefixes,
      contains: forbiddenPolicy.contains,
    },
    scrub_extra_keys: forbiddenPolicy.extra_keys,
    required_scrub_targets: requiredScrubTargets,
  };
}

function readOplFlowContextPolicy(codex: Record<string, unknown>): OplFlowContextPolicy {
  const value = codex.opl_flow_context;
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: codex.opl_flow_context must be an object');
  }
  const source = typeof value.source === 'string' ? value.source.trim() : '';
  if (
    value.flow_id !== 'opl-flow' ||
    !source ||
    value.policy_source_ref !== 'gaofeng21cn/opl-flow:contracts/workflow-policy.json' ||
    value.delivery !== 'package_installed_user_profile_only' ||
    value.user_agents_policy !== 'respect_user_agents_no_overwrite_detect_conflicts' ||
    value.language_policy !== 'follow_ui_locale_zh_only_when_ui_zh' ||
    value.app_role !== 'install_sync_diagnose_user_profile_only' ||
    value.dependency_policy !== 'full_bundles_opl_flow_requires_and_recommends_closure' ||
    value.migration_policy !== 'framework_executes_conflict_retirement_with_backup_receipt_and_rollback'
  ) {
    throw new Error('Invalid OPL product profile: codex.opl_flow_context is unsupported');
  }
  return {
    flow_id: 'opl-flow',
    source,
    policy_source_ref: 'gaofeng21cn/opl-flow:contracts/workflow-policy.json',
    delivery: 'package_installed_user_profile_only',
    user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
    app_role: 'install_sync_diagnose_user_profile_only',
    dependency_policy: 'full_bundles_opl_flow_requires_and_recommends_closure',
    migration_policy: 'framework_executes_conflict_retirement_with_backup_receipt_and_rollback',
  };
}

function readOplAppSessionContextPolicy(codex: Record<string, unknown>): OplAppSessionContextPolicy {
  const value = codex.opl_app_session_context;
  const customization = isRecord(value) && isRecord(value.customization) ? value.customization : null;
  if (
    !isRecord(value) ||
    value.owner !== 'one-person-lab-app' ||
    value.source !== 'gui.professional_agent_packages.session_routing_summary_i18n' ||
    value.delivery !== 'new_codex_conversation_preset_context' ||
    value.generation_policy !== 'profile_agent_routes' ||
    value.update_policy !== 'regenerated_when_app_product_profile_syncs' ||
    value.user_agents_policy !== 'codex_reads_user_and_repo_agents_independently' ||
    customization?.additional_instructions_key !== 'codex.oplAppSessionContextAdditional' ||
    customization.base_context_edit_policy !== 'generated_read_only' ||
    customization.user_edit_policy !== 'append_additional_instructions_only' ||
    customization.reset_behavior !== 'clear_additional_instructions' ||
    customization.effect !== 'next_new_conversation'
  ) {
    throw new Error('Invalid OPL product profile: codex.opl_app_session_context is unsupported');
  }
  return {
    owner: 'one-person-lab-app',
    source: 'gui.professional_agent_packages.session_routing_summary_i18n',
    delivery: 'new_codex_conversation_preset_context',
    generation_policy: 'profile_agent_routes',
    update_policy: 'regenerated_when_app_product_profile_syncs',
    user_agents_policy: 'codex_reads_user_and_repo_agents_independently',
    customization: {
      additional_instructions_key: 'codex.oplAppSessionContextAdditional',
      base_context_edit_policy: 'generated_read_only',
      user_edit_policy: 'append_additional_instructions_only',
      reset_behavior: 'clear_additional_instructions',
      effect: 'next_new_conversation',
    },
  };
}

function readOplNativeAutomationPolicy(companionPayloads: Record<string, unknown>): OplNativeAutomationPolicy {
  const policy = companionPayloads.native_automation;
  if (!isRecord(policy)) {
    throw new Error('Invalid OPL product profile: companion_payloads.native_automation must be an object');
  }

  const expected: OplNativeAutomationPolicy = {
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
  };

  for (const [key, value] of Object.entries(expected)) {
    if (policy[key] !== value) {
      throw new Error(`Invalid OPL product profile: companion_payloads.native_automation.${key} is invalid`);
    }
  }

  return expected;
}

function validateOplProductProfile(value: unknown): AppProductProfile {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: root must be an object');
  }
  if (value.schema_version !== 2) {
    throw new Error('Invalid OPL product profile: unsupported schema_version');
  }
  if (value.owner !== 'one-person-lab-app') {
    throw new Error('Invalid OPL product profile: owner must be one-person-lab-app');
  }
  if (value.purpose !== 'app_owned_product_profile') {
    throw new Error('Invalid OPL product profile: purpose must be app_owned_product_profile');
  }
  if (value.app_repo !== 'gaofeng21cn/one-person-lab-app') {
    throw new Error('Invalid OPL product profile: app_repo must point to one-person-lab-app');
  }

  const product = readProductProfile(value);
  const defaultSession = value.default_session_profile;
  const gui = value.gui;
  const codex = value.codex;
  const firstRun = value.first_run;
  const companionPayloads = value.companion_payloads;
  const commandLineTools = isRecord(firstRun) ? firstRun.command_line_tools : null;
  const settings = value.settings;
  const boundary = value.boundary;
  if (
    !isRecord(defaultSession) ||
    !isRecord(gui) ||
    !isRecord(codex) ||
    !isRecord(firstRun) ||
    !isRecord(companionPayloads) ||
    !isRecord(commandLineTools)
  ) {
    throw new Error('Invalid OPL product profile: missing default session, codex, or first-run section');
  }
  if (!isRecord(settings) || !isRecord(boundary)) {
    throw new Error('Invalid OPL product profile: missing settings or boundary section');
  }
  const visibleSettingsTabs = readStringArray(settings, 'visible_tabs', 'settings');
  const developerProfile = readDeveloperProfileSettings(settings);
  const nativeAutomation = readOplNativeAutomationPolicy(companionPayloads);
  const expectedTabs = [
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
  ];
  if (visibleSettingsTabs.join(',') !== expectedTabs.join(',')) {
    throw new Error('Invalid OPL product profile: GUI settings tabs must match OPL App');
  }
  const settingsIa = isRecord(settings.settings_information_architecture)
    ? settings.settings_information_architecture
    : null;
  const secondaryPageIds = settingsIa
    ? readStringArray(settingsIa, 'secondary_page_ids', 'settings.settings_information_architecture')
    : [];
  if (secondaryPageIds.join(',') !== 'about') {
    throw new Error('Invalid OPL product profile: GUI secondary settings pages must match OPL App');
  }
  const environmentItems = readStringArray(settings, 'environment_items', 'settings');
  const legacySettingsRouteRedirects = readStringRecord(
    settings.legacy_route_redirects,
    'settings.legacy_route_redirects'
  );
  const expectedLegacySettingsRouteRedirects: Record<string, string> = {
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
  };
  if (JSON.stringify(legacySettingsRouteRedirects) !== JSON.stringify(expectedLegacySettingsRouteRedirects)) {
    throw new Error('Invalid OPL product profile: GUI legacy settings redirects must match OPL App');
  }
  const settingsControlPlane = readSettingsControlPlane(settings.control_plane);
  if (defaultSession.executor !== 'codex_cli') {
    throw new Error('Invalid OPL product profile: default_session_profile.executor must be codex_cli');
  }
  if (defaultSession.provider !== 'gflab' || defaultSession.base_url !== 'https://gflabtoken.cn/v1') {
    throw new Error('Invalid OPL product profile: default session provider endpoint must be gflab');
  }

  const model = typeof defaultSession.model === 'string' ? defaultSession.model.trim() : '';
  const codexModel = typeof codex.default_model === 'string' ? codex.default_model.trim() : '';
  if (!model || model !== codexModel) {
    throw new Error('Invalid OPL product profile: default model fields must match');
  }
  const readinessLayers = readStringArray(firstRun, 'readiness_layers', 'first_run');
  const readyToLaunchGate = firstRun.ready_to_launch_gate;
  const runtimeProvider = firstRun.runtime_provider;
  if (!isRecord(readyToLaunchGate) || !isRecord(runtimeProvider)) {
    throw new Error('Invalid OPL product profile: missing first-run ready_to_launch or runtime provider policy');
  }
  if (
    readinessLayers.length !== 1 ||
    readinessLayers[0] !== 'core' ||
    readyToLaunchGate.id !== 'ready_to_launch' ||
    readyToLaunchGate.ui_order !== 'before_first_conversation_not_before_guid' ||
    readyToLaunchGate.guid_navigation_blocking !== false
  ) {
    throw new Error('Invalid OPL product profile: ready_to_launch must gate first conversation without blocking /guid');
  }
  if (runtimeProvider.full_readiness_provider !== 'temporal' || runtimeProvider.ready_to_launch_blocking !== false) {
    throw new Error('Invalid OPL product profile: Temporal runtime provider must be non-blocking for ready_to_launch');
  }
  const readyToLaunchCoreItems = readStringArray(
    readyToLaunchGate,
    'required_core_items',
    'first_run.ready_to_launch_gate'
  );
  const readyToLaunchExcludedItems = readStringArray(
    readyToLaunchGate,
    'must_not_require',
    'first_run.ready_to_launch_gate'
  );
  const fullReadinessLayers = readStringArray(firstRun, 'full_readiness_layers', 'first_run');
  const beginnerPresentation = isRecord(firstRun.beginner_presentation) ? firstRun.beginner_presentation : null;
  if (
    !beginnerPresentation ||
    beginnerPresentation.audience !== 'beginner_non_technical_users' ||
    beginnerPresentation.presentation_mode !== 'simplified_first_run' ||
    beginnerPresentation.primary_user_goal !== 'enter_guid_now_or_complete_guided_setup_first' ||
    beginnerPresentation.advanced_progress_disclosure !== 'collapsed_or_secondary' ||
    beginnerPresentation.background_maintenance_presentation !== 'collapsed_technical_non_blocking' ||
    beginnerPresentation.technical_detail_policy !== 'hidden_until_expanded_or_error' ||
    beginnerPresentation.completion_navigation_policy !==
      'manual_guid_entry_available_before_or_after_ready_no_automatic_route' ||
    beginnerPresentation.defer_navigation_policy !==
      'explicit_enter_guid_available_before_ready_without_mutating_readiness'
  ) {
    throw new Error('Invalid OPL product profile: first-run beginner presentation policy is invalid');
  }
  const beginnerPresentationPrimarySteps = readStringArray(
    beginnerPresentation,
    'primary_steps',
    'first_run.beginner_presentation'
  );
  const postInstallAiSelfCheckEntry = validatePostInstallAiSelfCheckEntry(
    beginnerPresentation.post_install_ai_self_check_entry,
    'first_run.beginner_presentation.post_install_ai_self_check_entry'
  );
  const reasoningEffort = readReasoningEffort(
    defaultSession.reasoning_effort,
    'default_session_profile.reasoning_effort'
  );
  const codexReasoningEffort = readReasoningEffort(codex.default_reasoning_effort, 'codex.default_reasoning_effort');
  if (reasoningEffort !== codexReasoningEffort) {
    throw new Error('Invalid OPL product profile: default reasoning effort fields must match');
  }
  if (!codexReasoningEffort) {
    throw new Error('Invalid OPL product profile: Codex Auto requires a non-null fallback reasoning effort');
  }
  const codexAutoModelPolicy = readOplCodexAutoModelPolicy(codex, codexModel, codexReasoningEffort);

  const guiAppearance = gui.appearance;
  const guiHome = gui.home;
  if (!isRecord(guiAppearance) || !isRecord(guiHome)) {
    throw new Error('Invalid OPL product profile: missing GUI appearance or home section');
  }
  if (gui.authority !== 'app_repo_owned_product_truth' || gui.implementation_carrier !== 'opl-aion-shell') {
    throw new Error('Invalid OPL product profile: GUI authority must come from the App repo');
  }
  if (guiAppearance.default_css_theme_id !== 'default-theme' || guiAppearance.codex_theme_default_enabled !== false) {
    throw new Error('Invalid OPL product profile: GUI appearance must default to the default theme');
  }
  if (
    guiHome.primary_input_surface !== 'single_card' ||
    guiHome.nested_input_card_frames_allowed !== false ||
    guiHome.codex_cli_fixed_executor !== true ||
    guiHome.home_executor_selector_visible !== false ||
    guiHome.codex_model_selector_visible !== true ||
    guiHome.codex_model_list_visible !== true ||
    guiHome.codex_model_policy !== 'codex_cli_latest_strongest_model_selector_visible' ||
    guiHome.codex_model_auto_option_visible !== true ||
    guiHome.permission_mode_selector_visible !== true ||
    guiHome.conversation_backend_selector_visible !== false ||
    guiHome.conversation_model_selector_visible !== true ||
    guiHome.conversation_permission_mode_selector_visible !== true ||
    guiHome.codex_precise_model_display_policy !== 'friendly_model_primary_reasoning_primary_model_secondary_menu'
  ) {
    throw new Error('Invalid OPL product profile: GUI home contract must expose App-owned model selection');
  }
  const utilityIconPolicy = guiHome.utility_icon_policy;
  const accountIdentityAvatar = isRecord(utilityIconPolicy) ? utilityIconPolicy.account_identity_avatar : null;
  const iconTextActionGeometry = isRecord(utilityIconPolicy) ? utilityIconPolicy.icon_text_action_geometry : null;
  const globalFeedbackAction = isRecord(utilityIconPolicy) ? utilityIconPolicy.global_feedback_action : null;
  const startupFailureAction = isRecord(globalFeedbackAction) ? globalFeedbackAction.startup_failure_action : null;
  const globalFeedbackPrefillFields = isRecord(globalFeedbackAction)
    ? readStringArray(globalFeedbackAction, 'prefill_fields', 'gui.home.utility_icon_policy.global_feedback_action')
    : [];
  const startupFailurePrefillFields = isRecord(startupFailureAction)
    ? readStringArray(
        startupFailureAction,
        'prefill_fields',
        'gui.home.utility_icon_policy.global_feedback_action.startup_failure_action'
      )
    : [];
  if (
    !isRecord(utilityIconPolicy) ||
    utilityIconPolicy.library !== 'icon_park_react_for_opl_owned_utility_icons' ||
    utilityIconPolicy.opl_owned_settings_navigation_and_overview !== 'icon_park_react_outline_16px_monochrome' ||
    utilityIconPolicy.settings_icon_geometry !==
      'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar' ||
    !isRecord(iconTextActionGeometry) ||
    iconTextActionGeometry.icon_size_px !== 16 ||
    iconTextActionGeometry.icon_slot_px !== 20 ||
    iconTextActionGeometry.icon_color !== 'currentColor' ||
    iconTextActionGeometry.icon_background !== 'transparent_none' ||
    iconTextActionGeometry.icon_label_gap_px !== 8 ||
    iconTextActionGeometry.alignment !== 'icon_slot_and_label_share_one_vertical_centerline' ||
    iconTextActionGeometry.contrast_policy !== 'button_foreground_color_applies_to_icon_and_label_together' ||
    iconTextActionGeometry.disabled_policy !== 'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon' ||
    utilityIconPolicy.upstream_fork_body_bulk_icon_rewrite !== 'forbidden' ||
    utilityIconPolicy.refresh_actions !== 'icon_only_with_tooltip_and_accessible_name' ||
    utilityIconPolicy.model_reasoning_control !== 'text_and_disclosure_without_brain_icon' ||
    utilityIconPolicy.scope !== 'opl_owned_overlay_surfaces_not_upstream_fork_body' ||
    !isRecord(accountIdentityAvatar) ||
    accountIdentityAvatar.shape !== 'circle' ||
    accountIdentityAvatar.background !== 'semantic_success_green' ||
    accountIdentityAvatar.foreground !== 'inverse' ||
    accountIdentityAvatar.han_name_initials !== 'first_han_character_only' ||
    accountIdentityAvatar.non_han_name_initials !==
      'first_letters_of_first_two_words_uppercase_else_first_two_codepoints' ||
    accountIdentityAvatar.email_fallback_initials !== 'first_two_local_part_codepoints_uppercase' ||
    accountIdentityAvatar.empty_fallback !== 'OP' ||
    !isRecord(globalFeedbackAction) ||
    globalFeedbackAction.placement !== 'titlebar_trailing_utility' ||
    globalFeedbackAction.icon !== 'circle_question' ||
    globalFeedbackAction.icon_style !== 'regular_outline' ||
    globalFeedbackAction.target_url !== 'https://github.com/gaofeng21cn/one-person-lab-app/issues/new' ||
    globalFeedbackAction.open_mode !== 'external_browser_user_review_and_submit' ||
    JSON.stringify(globalFeedbackPrefillFields) !==
      JSON.stringify(['localized_title', 'localized_body', 'current_route', 'app_release_version']) ||
    !isRecord(startupFailureAction) ||
    startupFailureAction.placement !== 'blocking_startup_failure_dialog' ||
    startupFailureAction.delivery_channel !== 'electron_main_process_native_open_external_via_preload_ipc' ||
    startupFailureAction.backend_dependency !== 'none' ||
    startupFailureAction.submission_policy !== 'external_browser_user_review_and_submit' ||
    startupFailureAction.automatic_submission !== false ||
    JSON.stringify(startupFailurePrefillFields) !==
      JSON.stringify([
        'localized_title',
        'localized_body',
        'app_release_version',
        'platform',
        'architecture',
        'startup_failure_reason',
        'backend_boundary_code',
        'backend_boundary_stage',
      ]) ||
    startupFailureAction.automatic_attachment_policy !== 'forbidden_no_logs_paths_credentials_or_user_content' ||
    globalFeedbackAction.shell_local_delivery_forbidden !== true
  ) {
    throw new Error('Invalid OPL product profile: global feedback must route to the App-owned GitHub issue page');
  }
  if (
    guiHome.codex_default_model !== model ||
    guiHome.codex_default_reasoning_effort !== codexReasoningEffort ||
    guiHome.codex_default_permission_mode !== 'full-access'
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex defaults must use the App default model');
  }
  const homeModelStatusLabel =
    typeof guiHome.codex_home_model_status_label === 'string' ? guiHome.codex_home_model_status_label.trim() : '';
  const homeModelStatusLabelEn =
    typeof guiHome.codex_home_model_status_label_en === 'string' ? guiHome.codex_home_model_status_label_en.trim() : '';
  if (
    !homeModelStatusLabel ||
    !homeModelStatusLabelEn ||
    /推理|reasoning/i.test(homeModelStatusLabel) ||
    /推理|reasoning/i.test(homeModelStatusLabelEn)
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex model status label must omit repeated reasoning');
  }
  const autoModelSelection = guiHome.codex_auto_model_selection;
  if (
    !isRecord(autoModelSelection) ||
    autoModelSelection.policy_source_ref !== 'contracts/app-product-profile.json#codex.auto_model_policy' ||
    autoModelSelection.user_can_override_model !== true ||
    autoModelSelection.user_can_restore_auto !== true ||
    autoModelSelection.selection_persists_into_conversation !== true
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex model policy must expose model override and restore');
  }
  const frontierModelPreferenceOrder = codexAutoModelPolicy.frontier_model_preference_order;
  const codexModelDisplayOptions = readCodexModelDisplayOptions(
    guiHome,
    codexReasoningEffort,
    codexModel,
    frontierModelPreferenceOrder
  );
  const defaultDisplayModel = codexModelDisplayOptions.visible_models.find((model) => model.id === codexModel);
  if (
    homeModelStatusLabel !== defaultDisplayModel?.label_zh ||
    homeModelStatusLabelEn !== defaultDisplayModel.label_en
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex model status label must match the App default model');
  }
  const homePurposeEntries = readHomePurposeEntries(guiHome);
  const homeAgentShortcuts = readHomeAgentShortcuts(guiHome);
  const homeComposerStateContract = readHomeComposerStateContract(guiHome);
  const retiredCodexModels = readStringArray(guiHome, 'retired_codex_models_must_not_be_exposed', 'gui.home');
  const agentPackageInvocationReceiptPolicy = readAgentPackageInvocationReceiptPolicy(gui);
  const builtinAssistantRouteReceiptPolicy = readBuiltinAssistantRouteReceiptPolicy(gui);
  const ordinaryCapabilitySelectorPolicy = readOrdinaryCapabilitySelectorPolicy(gui);
  const agentPackageRegistry = readAgentPackageRegistry(gui);
  const oplFlowContext = readOplFlowContextPolicy(codex);
  const oplAppSessionContext = readOplAppSessionContextPolicy(codex);
  const sessionContextI18n = isRecord(codex.session_context_i18n)
    ? {
        'zh-CN': readStringArray(codex.session_context_i18n, 'zh-CN', 'codex.session_context_i18n', {
          allowBlank: true,
        }),
        'en-US': readStringArray(codex.session_context_i18n, 'en-US', 'codex.session_context_i18n', {
          allowBlank: true,
        }),
      }
    : undefined;
  const defaultVisibleSkills = readStringArray(codex, 'default_visible_skills', 'codex');
  const skillPriority = readStringArray(codex, 'skill_priority', 'codex');
  const defaultPackagedCodexSkillIds = readStringArray(
    companionPayloads,
    'default_packaged_codex_skill_ids',
    'companion_payloads'
  );
  const additionalPackageSkillIds = readStringArray(
    companionPayloads,
    'additional_package_skill_ids',
    'companion_payloads'
  );
  const officialCodexRuntimeCapabilities = companionPayloads.official_codex_runtime_capabilities;
  if (!isRecord(officialCodexRuntimeCapabilities)) {
    throw new Error('Invalid OPL product profile: missing official Codex runtime capabilities');
  }
  const officialCodexRuntimeCapabilityIds = readStringArray(
    officialCodexRuntimeCapabilities,
    'preferred_capability_ids',
    'companion_payloads.official_codex_runtime_capabilities'
  );
  const missingPrioritySkills = defaultVisibleSkills.filter((skill) => !skillPriority.includes(skill));
  if (missingPrioritySkills.length > 0) {
    throw new Error('Invalid OPL product profile: skill_priority must include default skills');
  }
  const missingPackagedVisibleSkills = defaultVisibleSkills.filter(
    (skill) => !defaultPackagedCodexSkillIds.includes(skill)
  );
  if (missingPackagedVisibleSkills.length > 0) {
    throw new Error('Invalid OPL product profile: default visible skills must be packaged');
  }
  const hiddenDefaultPackagedSkills = defaultPackagedCodexSkillIds.filter(
    (skill) => !defaultVisibleSkills.includes(skill)
  );
  if (hiddenDefaultPackagedSkills.length > 0) {
    throw new Error('Invalid OPL product profile: default packaged skills must be default visible');
  }
  const defaultHomeAssistants = readDefaultHomeAssistants(gui);
  const assistantSkillProfiles = readAssistantSkillProfiles(gui);
  const professionalAgentPackages = readProfessionalAgentPackages(gui);
  const professionalPackageById = new Map(
    professionalAgentPackages.map((agentPackage) => [agentPackage.package_id, agentPackage])
  );
  for (const shortcut of homeAgentShortcuts) {
    const agentPackage = professionalPackageById.get(shortcut.package_id);
    if (!agentPackage) {
      throw new Error(
        `Invalid OPL product profile: home shortcut ${shortcut.shortcut_id} references unknown package ${shortcut.package_id}`
      );
    }
    if (
      shortcut.codex_visible_entry !== agentPackage.codex_visible_entry ||
      shortcut.package_short_name !== agentPackage.short_name ||
      shortcut.required_skill_ids.join(',') !== agentPackage.required_skill_ids.join(',') ||
      !agentPackage.home_shortcut_ids.includes(shortcut.shortcut_id)
    ) {
      throw new Error(`Invalid OPL product profile: home shortcut ${shortcut.shortcut_id} is not aligned to package`);
    }
  }
  for (const requiredShortcut of homeAgentShortcuts.filter((shortcut) => shortcut.default_visible)) {
    if (!agentPackageInvocationReceiptPolicy.required_for_package_shortcuts.includes(requiredShortcut.shortcut_id)) {
      throw new Error(
        `Invalid OPL product profile: package invocation receipt policy missing shortcut ${requiredShortcut.shortcut_id}`
      );
    }
  }
  const availableSkillSet = new Set([
    ...defaultPackagedCodexSkillIds,
    ...additionalPackageSkillIds,
    ...officialCodexRuntimeCapabilityIds,
  ]);
  for (const agentPackage of professionalAgentPackages) {
    const unpackagedProfileSkills = agentPackage.required_skill_ids.filter((skill) => !availableSkillSet.has(skill));
    if (unpackagedProfileSkills.length > 0) {
      throw new Error(
        `Invalid OPL product profile: agent package ${agentPackage.package_id} references unpackaged skills: ${unpackagedProfileSkills.join(', ')}`
      );
    }
    if (agentPackage.optional_skill_ids.includes('morph-ppt')) {
      throw new Error(
        `Invalid OPL product profile: agent package ${agentPackage.package_id} must not expose retired morph-ppt`
      );
    }
  }
  const nonDefaultAssistants = readNonDefaultAssistants(gui);
  if (!additionalPackageSkillIds.includes('opl-meta-agent')) {
    throw new Error('Invalid OPL product profile: explicit OMA package policy must be declared');
  }
  if (
    skillPriority.includes('morph-ppt') ||
    defaultPackagedCodexSkillIds.includes('morph-ppt') ||
    additionalPackageSkillIds.includes('morph-ppt')
  ) {
    throw new Error('Invalid OPL product profile: morph-ppt must not be part of App skill wiring');
  }

  const appDoesNotOwn = readStringArray(boundary, 'app_does_not_own', 'boundary');
  for (const forbidden of [
    'runtime_truth',
    'provider_implementation',
    'domain_truth',
    'domain_quality_verdict',
    'domain_artifact_authority',
  ]) {
    if (!appDoesNotOwn.includes(forbidden)) {
      throw new Error(`Invalid OPL product profile: boundary.app_does_not_own must include ${forbidden}`);
    }
  }

  return {
    schema_version: 2,
    owner: 'one-person-lab-app',
    purpose: 'app_owned_product_profile',
    state: typeof value.state === 'string' ? value.state : '',
    app_repo: 'gaofeng21cn/one-person-lab-app',
    product,
    default_session_profile: {
      provider: 'gflab',
      base_url: 'https://gflabtoken.cn/v1',
      executor: 'codex_cli',
      model,
      reasoning_effort: reasoningEffort,
    },
    gui: {
      authority: 'app_repo_owned_product_truth',
      implementation_carrier: 'opl-aion-shell',
      appearance: {
        default_css_theme_id: 'default-theme',
        default_css_theme_name:
          typeof guiAppearance.default_css_theme_name === 'string' ? guiAppearance.default_css_theme_name : 'Default',
        codex_theme_default_enabled: false,
      },
      home: {
        primary_input_surface: 'single_card',
        nested_input_card_frames_allowed: false,
        codex_cli_fixed_executor: true,
        home_executor_selector_visible: false,
        codex_model_selector_visible: true,
        codex_model_list_visible: true,
        codex_model_policy: 'codex_cli_latest_strongest_model_selector_visible',
        codex_model_auto_option_visible: true,
        codex_default_model: model,
        codex_default_reasoning_effort: codexReasoningEffort,
        codex_default_permission_mode: 'full-access',
        permission_mode_selector_visible: true,
        home_composer_state_contract: homeComposerStateContract,
        conversation_backend_selector_visible: false,
        conversation_model_selector_visible: true,
        conversation_permission_mode_selector_visible: true,
        codex_home_model_status_label: homeModelStatusLabel,
        codex_home_model_status_label_en: homeModelStatusLabelEn,
        codex_precise_model_display_policy: 'friendly_model_primary_reasoning_primary_model_secondary_menu',
        codex_auto_model_selection: {
          policy_source_ref: 'contracts/app-product-profile.json#codex.auto_model_policy',
          user_can_override_model: true,
          ...(autoModelSelection.user_can_override_reasoning_effort === true
            ? { user_can_override_reasoning_effort: true }
            : {}),
          user_can_restore_auto: true,
          selection_persists_into_conversation: true,
        },
        utility_icon_policy: {
          library: 'icon_park_react_for_opl_owned_utility_icons',
          opl_owned_settings_navigation_and_overview: 'icon_park_react_outline_16px_monochrome',
          settings_icon_geometry: 'stable_16px_slot_1_5_to_1_75px_visual_stroke_no_colored_tile_or_letter_avatar',
          icon_text_action_geometry: {
            icon_size_px: 16,
            icon_slot_px: 20,
            icon_color: 'currentColor',
            icon_background: 'transparent_none',
            icon_label_gap_px: 8,
            alignment: 'icon_slot_and_label_share_one_vertical_centerline',
            contrast_policy: 'button_foreground_color_applies_to_icon_and_label_together',
            disabled_policy: 'apply_disabled_opacity_to_the_whole_control_never_hide_only_the_icon',
          },
          upstream_fork_body_bulk_icon_rewrite: 'forbidden',
          refresh_actions: 'icon_only_with_tooltip_and_accessible_name',
          model_reasoning_control: 'text_and_disclosure_without_brain_icon',
          account_identity_avatar: {
            shape: 'circle',
            background: 'semantic_success_green',
            foreground: 'inverse',
            han_name_initials: 'first_han_character_only',
            non_han_name_initials: 'first_letters_of_first_two_words_uppercase_else_first_two_codepoints',
            email_fallback_initials: 'first_two_local_part_codepoints_uppercase',
            empty_fallback: 'OP',
          },
          global_feedback_action: {
            placement: 'titlebar_trailing_utility',
            icon: 'circle_question',
            icon_style: 'regular_outline',
            target_url: 'https://github.com/gaofeng21cn/one-person-lab-app/issues/new',
            open_mode: 'external_browser_user_review_and_submit',
            prefill_fields: ['localized_title', 'localized_body', 'current_route', 'app_release_version'],
            startup_failure_action: {
              placement: 'blocking_startup_failure_dialog',
              delivery_channel: 'electron_main_process_native_open_external_via_preload_ipc',
              backend_dependency: 'none',
              submission_policy: 'external_browser_user_review_and_submit',
              automatic_submission: false,
              prefill_fields: [
                'localized_title',
                'localized_body',
                'app_release_version',
                'platform',
                'architecture',
                'startup_failure_reason',
                'backend_boundary_code',
                'backend_boundary_stage',
              ],
              automatic_attachment_policy: 'forbidden_no_logs_paths_credentials_or_user_content',
            },
            shell_local_delivery_forbidden: true,
          },
          scope: 'opl_owned_overlay_surfaces_not_upstream_fork_body',
        },
        codex_model_display_options: codexModelDisplayOptions,
        home_purpose_entries: homePurposeEntries,
        home_agent_shortcuts: homeAgentShortcuts,
        retired_codex_models_must_not_be_exposed: retiredCodexModels,
      },
      agent_package_invocation_receipt_policy: agentPackageInvocationReceiptPolicy,
      builtin_assistant_route_receipt_policy: builtinAssistantRouteReceiptPolicy,
      ordinary_capability_selector_policy: ordinaryCapabilitySelectorPolicy,
      agent_package_registry: agentPackageRegistry,
      professional_agent_packages: professionalAgentPackages,
      default_assistants: defaultHomeAssistants,
      assistant_skill_profiles: assistantSkillProfiles,
      non_default_assistants: nonDefaultAssistants,
    },
    codex: {
      default_model: codexModel,
      default_reasoning_effort: codexReasoningEffort,
      auto_model_policy: codexAutoModelPolicy,
      opl_flow_context: oplFlowContext,
      opl_app_session_context: oplAppSessionContext,
      default_visible_skills: defaultVisibleSkills,
      skill_priority: skillPriority,
      session_context_lines: readStringArray(codex, 'session_context_lines', 'codex', { allowBlank: true }),
      ...(sessionContextI18n ? { session_context_i18n: sessionContextI18n } : {}),
    },
    companion_payloads: {
      default_packaged_codex_skill_ids: defaultPackagedCodexSkillIds,
      additional_package_skill_ids: additionalPackageSkillIds,
      official_codex_runtime_capabilities: {
        preferred_capability_ids: officialCodexRuntimeCapabilityIds,
      },
      native_automation: nativeAutomation,
    },
    first_run: {
      readiness_layers: ['core'],
      ready_to_launch_gate: {
        id: 'ready_to_launch',
        ui_order: 'before_first_conversation_not_before_guid',
        guid_navigation_blocking: false,
        required_core_items: readyToLaunchCoreItems,
        must_not_require: readyToLaunchExcludedItems,
      },
      full_readiness_layers: fullReadinessLayers,
      deferred_blockers: readStringArray(firstRun, 'deferred_blockers', 'first_run'),
      runtime_provider: {
        full_readiness_provider: 'temporal',
        ready_to_launch_blocking: false,
      },
      command_line_tools: {
        auto_request_installer: commandLineTools.auto_request_installer === true,
        blocks_full_first_launch: commandLineTools.blocks_full_first_launch === true,
        messages: readStringArray(commandLineTools, 'messages', 'first_run.command_line_tools'),
      },
      beginner_presentation: {
        audience: 'beginner_non_technical_users',
        presentation_mode: 'simplified_first_run',
        primary_user_goal: 'enter_guid_now_or_complete_guided_setup_first',
        primary_steps: beginnerPresentationPrimarySteps,
        primary_progress_signal:
          typeof beginnerPresentation.primary_progress_signal === 'string'
            ? beginnerPresentation.primary_progress_signal
            : 'Core completed and total count',
        advanced_progress_disclosure: 'collapsed_or_secondary',
        background_maintenance_presentation: 'collapsed_technical_non_blocking',
        technical_detail_policy: 'hidden_until_expanded_or_error',
        completion_navigation_policy: 'manual_guid_entry_available_before_or_after_ready_no_automatic_route',
        defer_navigation_policy: 'explicit_enter_guid_available_before_ready_without_mutating_readiness',
        post_install_ai_self_check_entry: postInstallAiSelfCheckEntry,
      },
    },
    settings: {
      visible_tabs: visibleSettingsTabs,
      secondary_page_ids: secondaryPageIds,
      environment_items: environmentItems,
      legacy_route_redirects: legacySettingsRouteRedirects,
      control_plane: settingsControlPlane,
      developer_profile: developerProfile,
    },
    boundary: {
      app_does_not_own: appDoesNotOwn,
    },
  };
}

function readSettingsControlPlane(value: unknown): OplSettingsControlPlane {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: settings.control_plane must be an object');
  }
  const ordinaryVisibleTabs = readStringArray(value, 'ordinary_visible_tabs', 'settings.control_plane');
  const ordinaryRoutes = readSettingsControlPlaneRoutes(value.ordinary_routes, 'ordinary_routes');
  const secondaryPages = readSettingsControlPlaneSecondaryPages(value.secondary_pages);
  const compatibilityRedirects = readSettingsCompatibilityRedirects(value.compatibility_redirects);
  const legacyRouteRedirects = readStringRecord(
    value.legacy_route_redirects,
    'settings.control_plane.legacy_route_redirects'
  );
  const extensionAnchorRemap = readStringRecord(
    value.extension_anchor_remap,
    'settings.control_plane.extension_anchor_remap'
  );
  const slotRegistry = readSettingsControlPlaneSlotRegistry(value.slot_registry);
  const actionContract = readSettingsControlPlaneActionContract(value.state_action_policy);
  const experienceContract = readSettingsExperienceContract(value.experience_contract);
  const userNavigationProjection = readSettingsUserNavigationProjection(
    value.user_navigation_projection,
    ordinaryRoutes,
    secondaryPages
  );
  if (value.source_contract_ref !== 'contracts/app-gui-product-contract.json#settings_navigation') {
    throw new Error('Invalid OPL product profile: settings.control_plane must project the App control-plane contract');
  }
  if (typeof value.default_route !== 'string' || !value.default_route.startsWith('/settings/')) {
    throw new Error('Invalid OPL product profile: settings.control_plane.default_route must be a settings route');
  }
  if (ordinaryRoutes.map((route) => route.id).join(',') !== ordinaryVisibleTabs.join(',')) {
    throw new Error(
      'Invalid OPL product profile: settings.control_plane ordinary routes must match ordinary_visible_tabs'
    );
  }
  for (const route of [...ordinaryRoutes, ...secondaryPages]) {
    if (!slotRegistry[route.slot_id]) {
      throw new Error(`Invalid OPL product profile: settings.control_plane missing slot ${route.slot_id}`);
    }
  }
  return {
    source_contract_ref: 'contracts/app-gui-product-contract.json#settings_navigation',
    default_route: value.default_route,
    route_identity_policy: readString(value, 'route_identity_policy', 'settings.control_plane'),
    ordinary_visible_tabs: ordinaryVisibleTabs,
    ordinary_routes: ordinaryRoutes,
    secondary_pages: secondaryPages,
    compatibility_redirects: compatibilityRedirects,
    legacy_route_redirects: legacyRouteRedirects,
    extension_anchor_remap: extensionAnchorRemap,
    extension_tab_policy: isRecord(value.extension_tab_policy) ? { ...value.extension_tab_policy } : {},
    slot_registry: slotRegistry,
    state_action_policy: actionContract,
    experience_contract: experienceContract,
    user_navigation_projection: userNavigationProjection,
  };
}

function readSettingsUserNavigationProjection(
  value: unknown,
  ordinaryRoutes: OplSettingsControlPlaneRoute[],
  secondaryPages: OplSettingsControlPlaneSecondaryPage[]
): OplSettingsUserNavigationProjection {
  const context = 'settings.control_plane.user_navigation_projection';
  if (!isRecord(value)) {
    throw new Error(`Invalid OPL product profile: ${context} must be an object`);
  }
  if (
    value.schema !== 'opl_app_settings_user_navigation.v1' ||
    value.source_ref !== 'contracts/app-gui-product-contract.json#settings_navigation.settings_ia' ||
    value.carrier_route_policy !==
      'ten_stable_ordinary_route_ids_paths_slots_and_anchors_remain_addressable_but_are_not_rendered_as_ten_primary_navigation_items'
  ) {
    throw new Error(`Invalid OPL product profile: ${context} authority or carrier policy is invalid`);
  }

  const carrierRouteIds = ordinaryRoutes.map((route) => route.id);
  if (carrierRouteIds.join(',') !== OPL_SETTINGS_CARRIER_ROUTE_IDS.join(',')) {
    throw new Error(`Invalid OPL product profile: ${context} must preserve ten stable carrier routes`);
  }
  const carrierRouteIdSet = new Set<string>(carrierRouteIds);
  const groupIdSet = new Set<string>(OPL_SETTINGS_PRIMARY_GROUP_IDS);
  const destinationIdSet = new Set<string>(OPL_SETTINGS_DESTINATION_IDS);
  const primaryGroupOrder = readStringArray(value, 'primary_group_order', context);
  if (primaryGroupOrder.join(',') !== OPL_SETTINGS_PRIMARY_GROUP_IDS.join(',')) {
    throw new Error(`Invalid OPL product profile: ${context}.primary_group_order must define the six App groups`);
  }

  if (!Array.isArray(value.primary_groups)) {
    throw new Error(`Invalid OPL product profile: ${context}.primary_groups must be an array`);
  }
  const primaryGroups = value.primary_groups.map((entry, index): OplSettingsUserNavigationPrimaryGroup => {
    const entryContext = `${context}.primary_groups[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: ${entryContext} must be an object`);
    }
    const id = readString(entry, 'id', entryContext);
    const defaultDestinationId = readString(entry, 'default_destination_id', entryContext);
    const destinationIds = readStringArray(entry, 'destination_ids', entryContext);
    if (
      !groupIdSet.has(id) ||
      !destinationIdSet.has(defaultDestinationId) ||
      destinationIds.some((destinationId) => !destinationIdSet.has(destinationId)) ||
      !destinationIds.includes(defaultDestinationId)
    ) {
      throw new Error(`Invalid OPL product profile: ${entryContext} contains an unknown group or destination`);
    }
    return {
      id: id as OplSettingsPrimaryGroupId,
      label_zh: readString(entry, 'label_zh', entryContext),
      label_en: readString(entry, 'label_en', entryContext),
      default_destination_id: defaultDestinationId as OplSettingsDestinationId,
      destination_ids: destinationIds as OplSettingsDestinationId[],
    };
  });
  if (primaryGroups.map((group) => group.id).join(',') !== primaryGroupOrder.join(',')) {
    throw new Error(`Invalid OPL product profile: ${context}.primary_groups must follow primary_group_order`);
  }

  if (!Array.isArray(value.destinations)) {
    throw new Error(`Invalid OPL product profile: ${context}.destinations must be an array`);
  }
  const destinations = value.destinations.map((entry, index): OplSettingsUserNavigationDestination => {
    const entryContext = `${context}.destinations[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: ${entryContext} must be an object`);
    }
    const id = readString(entry, 'id', entryContext);
    const ownerGroupId = readString(entry, 'owner_group_id', entryContext);
    const routeId = readString(entry, 'route_id', entryContext);
    const anchor = readOptionalString(entry, 'anchor');
    const transportOwnerPolicy = readOptionalString(entry, 'transport_owner_policy');
    if (!destinationIdSet.has(id) || !groupIdSet.has(ownerGroupId) || !carrierRouteIdSet.has(routeId)) {
      throw new Error(`Invalid OPL product profile: ${entryContext} contains an unknown destination, group, or route`);
    }
    return {
      id: id as OplSettingsDestinationId,
      owner_group_id: ownerGroupId as OplSettingsPrimaryGroupId,
      route_id: routeId as OplSettingsCarrierRouteId,
      ...(anchor ? { anchor } : {}),
      label_zh: readString(entry, 'label_zh', entryContext),
      label_en: readString(entry, 'label_en', entryContext),
      ...(transportOwnerPolicy ? { transport_owner_policy: transportOwnerPolicy } : {}),
    };
  });
  if (destinations.map((destination) => destination.id).join(',') !== OPL_SETTINGS_DESTINATION_IDS.join(',')) {
    throw new Error(`Invalid OPL product profile: ${context}.destinations must define each App destination once`);
  }
  const destinationById = new Map(destinations.map((destination) => [destination.id, destination]));
  const groupedDestinationIds = primaryGroups.flatMap((group) => group.destination_ids);
  if (
    groupedDestinationIds.length !== destinations.length ||
    new Set(groupedDestinationIds).size !== destinations.length
  ) {
    throw new Error(`Invalid OPL product profile: ${context} must assign every destination to exactly one group`);
  }
  for (const group of primaryGroups) {
    if (
      group.destination_ids.some((destinationId) => destinationById.get(destinationId)?.owner_group_id !== group.id)
    ) {
      throw new Error(`Invalid OPL product profile: ${context} destination ownership does not match its group`);
    }
  }

  if (!Array.isArray(value.secondary_owner_bindings)) {
    throw new Error(`Invalid OPL product profile: ${context}.secondary_owner_bindings must be an array`);
  }
  const secondaryOwnerBindings = value.secondary_owner_bindings.map(
    (entry, index): OplSettingsUserNavigationOwnerBinding => {
      const entryContext = `${context}.secondary_owner_bindings[${index}]`;
      if (!isRecord(entry)) {
        throw new Error(`Invalid OPL product profile: ${entryContext} must be an object`);
      }
      const userDestinationId = readString(entry, 'user_destination_id', entryContext);
      const transportRouteId = readString(entry, 'transport_route_id', entryContext);
      if (!destinationIdSet.has(userDestinationId) || !carrierRouteIdSet.has(transportRouteId)) {
        throw new Error(`Invalid OPL product profile: ${entryContext} contains an unknown destination or route`);
      }
      return {
        content_id: readString(entry, 'content_id', entryContext),
        user_destination_id: userDestinationId as OplSettingsDestinationId,
        transport_route_id: transportRouteId as OplSettingsCarrierRouteId,
        anchor: readString(entry, 'anchor', entryContext),
      };
    }
  );

  if (!Array.isArray(value.auxiliary_entries) || value.auxiliary_entries.length !== 1) {
    throw new Error(`Invalid OPL product profile: ${context}.auxiliary_entries must contain About only`);
  }
  const auxiliaryEntry = value.auxiliary_entries[0];
  if (
    !isRecord(auxiliaryEntry) ||
    auxiliaryEntry.id !== 'about' ||
    auxiliaryEntry.route_id !== 'about' ||
    auxiliaryEntry.placement !== 'sidebar_bottom' ||
    !secondaryPages.some((page) => page.id === 'about')
  ) {
    throw new Error(`Invalid OPL product profile: ${context}.auxiliary_entries must bind sidebar-bottom About`);
  }
  const auxiliaryEntries: OplSettingsUserNavigationAuxiliaryEntry[] = [
    {
      id: 'about',
      route_id: 'about',
      placement: 'sidebar_bottom',
      label_zh: readString(auxiliaryEntry, 'label_zh', `${context}.auxiliary_entries[0]`),
      label_en: readString(auxiliaryEntry, 'label_en', `${context}.auxiliary_entries[0]`),
    },
  ];

  const responsiveNavigation = value.responsive_navigation;
  const minimumViewport = isRecord(responsiveNavigation) ? responsiveNavigation.minimum_viewport_px : null;
  if (
    !isRecord(responsiveNavigation) ||
    !isRecord(minimumViewport) ||
    responsiveNavigation.desktop !== 'six_primary_groups_with_the_active_group_expanded_to_second_level_destinations' ||
    responsiveNavigation.mobile !== 'category_list_then_second_level_destination_with_a_visible_back_control' ||
    responsiveNavigation.mobile_horizontal_tab_strip_allowed !== false ||
    responsiveNavigation.mobile_navigation_scroll_axis !== 'vertical' ||
    minimumViewport.width !== 400 ||
    minimumViewport.height !== 600 ||
    responsiveNavigation.keyboard_policy !==
      'all_primary_groups_second_level_destinations_back_and_about_are_reachable_in_logical_order'
  ) {
    throw new Error(`Invalid OPL product profile: ${context}.responsive_navigation is invalid`);
  }
  const footerPolicy = value.footer_policy;
  if (
    value.global_search_policy !==
      'preserve_one_bilingual_item_level_search_across_all_carrier_routes_and_owner_anchors' ||
    !isRecord(footerPolicy) ||
    footerPolicy.duplicate_settings_entry !== 'forbidden_inside_settings' ||
    footerPolicy.about_placement !== 'sidebar_bottom_auxiliary_entry' ||
    footerPolicy.account_and_update_controls !== 'compact_footer_without_reclassifying_them_as_primary_groups'
  ) {
    throw new Error(`Invalid OPL product profile: ${context} search or footer policy is invalid`);
  }

  return {
    schema: 'opl_app_settings_user_navigation.v1',
    source_ref: 'contracts/app-gui-product-contract.json#settings_navigation.settings_ia',
    carrier_route_policy:
      'ten_stable_ordinary_route_ids_paths_slots_and_anchors_remain_addressable_but_are_not_rendered_as_ten_primary_navigation_items',
    primary_group_order: primaryGroupOrder as OplSettingsPrimaryGroupId[],
    primary_groups: primaryGroups,
    destinations,
    secondary_owner_bindings: secondaryOwnerBindings,
    auxiliary_entries: auxiliaryEntries,
    responsive_navigation: {
      desktop: 'six_primary_groups_with_the_active_group_expanded_to_second_level_destinations',
      mobile: 'category_list_then_second_level_destination_with_a_visible_back_control',
      mobile_horizontal_tab_strip_allowed: false,
      mobile_navigation_scroll_axis: 'vertical',
      minimum_viewport_px: { width: 400, height: 600 },
      keyboard_policy: 'all_primary_groups_second_level_destinations_back_and_about_are_reachable_in_logical_order',
    },
    global_search_policy: 'preserve_one_bilingual_item_level_search_across_all_carrier_routes_and_owner_anchors',
    footer_policy: {
      duplicate_settings_entry: 'forbidden_inside_settings',
      about_placement: 'sidebar_bottom_auxiliary_entry',
      account_and_update_controls: 'compact_footer_without_reclassifying_them_as_primary_groups',
    },
  };
}

function readSettingsCompatibilityRedirects(value: unknown): Record<string, OplSettingsCompatibilityRedirect> {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: settings.control_plane.compatibility_redirects must be an object');
  }
  return Object.fromEntries(
    Object.entries(value).map(([id, entry]) => {
      if (!isRecord(entry)) {
        throw new Error(
          `Invalid OPL product profile: settings.control_plane.compatibility_redirects.${id} must be an object`
        );
      }
      const redirect: OplSettingsCompatibilityRedirect = {
        source_route_id: readString(entry, 'source_route_id', `settings.control_plane.compatibility_redirects.${id}`),
        source_path: readString(entry, 'source_path', `settings.control_plane.compatibility_redirects.${id}`),
        target_route_id: readString(entry, 'target_route_id', `settings.control_plane.compatibility_redirects.${id}`),
        target_path: readString(entry, 'target_path', `settings.control_plane.compatibility_redirects.${id}`),
        product_page_id: readString(entry, 'product_page_id', `settings.control_plane.compatibility_redirects.${id}`),
        anchor: readString(entry, 'anchor', `settings.control_plane.compatibility_redirects.${id}`),
        anchor_query_param: readString(
          entry,
          'anchor_query_param',
          `settings.control_plane.compatibility_redirects.${id}`
        ),
      };
      if (redirect.source_route_id !== id || redirect.anchor_query_param !== 'section') {
        throw new Error(`Invalid OPL product profile: incompatible Settings redirect ${id}`);
      }
      return [id, redirect];
    })
  );
}

function readSettingsExperienceContract(value: unknown): OplSettingsExperienceContract {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: settings.control_plane.experience_contract must be an object');
  }
  const globalSearch = value.global_search;
  const pageContracts = value.page_contracts;
  const searchIndex = value.search_index;
  if (!isRecord(globalSearch) || !isRecord(pageContracts) || !isRecord(searchIndex)) {
    throw new Error('Invalid OPL product profile: Settings experience contract is incomplete');
  }
  const pages = Object.fromEntries(
    Object.entries(pageContracts).map(([id, entry]) => {
      if (!isRecord(entry)) {
        throw new Error(`Invalid OPL product profile: Settings page experience ${id} must be an object`);
      }
      const page: OplSettingsPageExperience = {
        product_page_id: readString(entry, 'product_page_id', `settings.control_plane.experience_contract.${id}`),
        route_id: readString(entry, 'route_id', `settings.control_plane.experience_contract.${id}`),
        label_zh: readString(entry, 'label_zh', `settings.control_plane.experience_contract.${id}`),
        label_en: readString(entry, 'label_en', `settings.control_plane.experience_contract.${id}`),
      };
      if (page.product_page_id !== id) {
        throw new Error(`Invalid OPL product profile: Settings page experience id mismatch for ${id}`);
      }
      return [id, page];
    })
  );
  const entries = searchIndex.entries;
  if (!Array.isArray(entries)) {
    throw new Error('Invalid OPL product profile: Settings search index entries must be an array');
  }
  return {
    global_search: {
      entry_testid: readString(
        globalSearch,
        'entry_testid',
        'settings.control_plane.experience_contract.global_search'
      ),
      results_testid: readString(
        globalSearch,
        'results_testid',
        'settings.control_plane.experience_contract.global_search'
      ),
      result_item_testid: readString(
        globalSearch,
        'result_item_testid',
        'settings.control_plane.experience_contract.global_search'
      ),
      empty_state_testid: readString(
        globalSearch,
        'empty_state_testid',
        'settings.control_plane.experience_contract.global_search'
      ),
      anchor_query_param: readString(
        globalSearch,
        'anchor_query_param',
        'settings.control_plane.experience_contract.global_search'
      ),
    },
    page_contracts: pages,
    search_index: {
      schema: readString(searchIndex, 'schema', 'settings.control_plane.experience_contract.search_index'),
      entries: entries.map((entry, index): OplSettingsSearchIndexEntry => {
        if (!isRecord(entry)) {
          throw new Error(`Invalid OPL product profile: Settings search entry ${index} must be an object`);
        }
        const pageId = readString(
          entry,
          'page_id',
          `settings.control_plane.experience_contract.search_index[${index}]`
        );
        if (!pages[pageId]) {
          throw new Error(
            `Invalid OPL product profile: Settings search entry ${index} references unknown page ${pageId}`
          );
        }
        return {
          id: readString(entry, 'id', `settings.control_plane.experience_contract.search_index[${index}]`),
          page_id: pageId,
          anchor: readString(entry, 'anchor', `settings.control_plane.experience_contract.search_index[${index}]`),
          label_zh: readString(entry, 'label_zh', `settings.control_plane.experience_contract.search_index[${index}]`),
          label_en: readString(entry, 'label_en', `settings.control_plane.experience_contract.search_index[${index}]`),
          keywords_zh: readStringArray(
            entry,
            'keywords_zh',
            `settings.control_plane.experience_contract.search_index[${index}]`
          ),
          keywords_en: readStringArray(
            entry,
            'keywords_en',
            `settings.control_plane.experience_contract.search_index[${index}]`
          ),
        };
      }),
    },
  };
}

function readSettingsControlPlaneActionContract(value: unknown): OplSettingsControlPlaneActionContract {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: settings.control_plane.state_action_policy must be an object');
  }
  const shellMustNotOwn = readStringArray(value, 'shell_must_not_own', 'settings.control_plane.state_action_policy');
  if (
    readString(value, 'default_state_source', 'settings.control_plane.state_action_policy') !==
      'opl app state --profile fast --json' ||
    readString(value, 'default_refresh_source', 'settings.control_plane.state_action_policy') !==
      'opl app state --profile fast --json' ||
    readString(value, 'action_route', 'settings.control_plane.state_action_policy') !==
      'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json'
  ) {
    throw new Error('Invalid OPL product profile: settings control plane must consume App state/action surfaces');
  }
  for (const forbidden of ['runtime truth', 'provider implementation', 'domain truth', 'owner receipts']) {
    if (!shellMustNotOwn.includes(forbidden)) {
      throw new Error(`Invalid OPL product profile: settings action policy missing shell boundary ${forbidden}`);
    }
  }
  return {
    default_state_source: 'opl app state --profile fast --json',
    default_refresh_source: 'opl app state --profile fast --json',
    full_profile_policy: readString(value, 'full_profile_policy', 'settings.control_plane.state_action_policy'),
    action_route: 'opl app action execute --action <action_id> [--payload <json>] [--dry-run] --json',
    recommended_action_ids: readSettingsRecommendedActionIds(value.recommended_action_ids),
    shell_must_not_own: shellMustNotOwn,
  };
}

function readSettingsRecommendedActionIds(
  value: unknown
): OplSettingsControlPlaneActionContract['recommended_action_ids'] {
  if (!isRecord(value)) {
    throw new Error(
      'Invalid OPL product profile: settings.control_plane.state_action_policy.recommended_action_ids must be an object'
    );
  }
  return {
    doctor: readString(value, 'doctor', 'settings.control_plane.state_action_policy.recommended_action_ids'),
    repair: readString(value, 'repair', 'settings.control_plane.state_action_policy.recommended_action_ids'),
  };
}

function readString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid OPL product profile: ${label}.${key} must be a non-empty string`);
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readSettingsRouteMetadata(record: Record<string, unknown>): Partial<OplSettingsControlPlaneRoute> {
  const metadata: Partial<OplSettingsControlPlaneRoute> = {};
  for (const key of ['scope', 'intent', 'risk', 'frequency'] as const) {
    const value = readOptionalString(record, key);
    if (value) metadata[key] = value;
  }
  return metadata;
}

function readSettingsControlPlaneRoutes(value: unknown, label: string): OplSettingsControlPlaneRoute[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid OPL product profile: settings.control_plane.${label} must be an array`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid OPL product profile: settings.control_plane.${label}[${index}] must be an object`);
    }
    return {
      id: readString(entry, 'id', `settings.control_plane.${label}[${index}]`),
      path: readString(entry, 'path', `settings.control_plane.${label}[${index}]`),
      label_key: readString(entry, 'label_key', `settings.control_plane.${label}[${index}]`),
      default_label_en: readString(entry, 'default_label_en', `settings.control_plane.${label}[${index}]`),
      default_label_zh: readString(entry, 'default_label_zh', `settings.control_plane.${label}[${index}]`),
      icon_token: readString(entry, 'icon_token', `settings.control_plane.${label}[${index}]`),
      ia_group: readString(entry, 'ia_group', `settings.control_plane.${label}[${index}]`),
      slot_id: readString(entry, 'slot_id', `settings.control_plane.${label}[${index}]`),
      state_source: readString(entry, 'state_source', `settings.control_plane.${label}[${index}]`),
      refresh_source: readString(entry, 'refresh_source', `settings.control_plane.${label}[${index}]`),
      ...readSettingsRouteMetadata(entry),
    };
  });
}

function readSettingsControlPlaneSecondaryPages(value: unknown): OplSettingsControlPlaneSecondaryPage[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid OPL product profile: settings.control_plane.secondary_pages must be an array');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(
        `Invalid OPL product profile: settings.control_plane.secondary_pages[${index}] must be an object`
      );
    }
    return {
      id: readString(entry, 'id', `settings.control_plane.secondary_pages[${index}]`),
      path: readString(entry, 'path', `settings.control_plane.secondary_pages[${index}]`),
      ia_group: readString(entry, 'ia_group', `settings.control_plane.secondary_pages[${index}]`),
      slot_id: readString(entry, 'slot_id', `settings.control_plane.secondary_pages[${index}]`),
      visibility: readString(entry, 'visibility', `settings.control_plane.secondary_pages[${index}]`),
      ...readSettingsRouteMetadata(entry),
    };
  });
}

function readSettingsControlPlaneSlotRegistry(value: unknown): OplSettingsControlPlane['slot_registry'] {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: settings.control_plane.slot_registry must be an object');
  }
  return Object.fromEntries(
    Object.entries(value).map(([slotId, entry]) => {
      if (!isRecord(entry)) {
        throw new Error(
          `Invalid OPL product profile: settings.control_plane.slot_registry.${slotId} must be an object`
        );
      }
      return [
        slotId,
        {
          component_key: readString(entry, 'component_key', `settings.control_plane.slot_registry.${slotId}`),
          wrapper_policy: readString(entry, 'wrapper_policy', `settings.control_plane.slot_registry.${slotId}`),
          ...(typeof entry.subroute_query_param === 'string'
            ? { subroute_query_param: entry.subroute_query_param }
            : {}),
          ...(isRecord(entry.legacy_subroutes)
            ? {
                legacy_subroutes: readStringRecord(
                  entry.legacy_subroutes,
                  `settings.control_plane.slot_registry.${slotId}.legacy_subroutes`
                ),
              }
            : {}),
        },
      ];
    })
  );
}

export const OPL_PRODUCT_PROFILE = validateOplProductProfile(generatedProfile);

export function getOplProductDisplayName(): string {
  return OPL_PRODUCT_PROFILE.product.display_name;
}

export function getOplOrdinaryChromeName(): string {
  return OPL_PRODUCT_PROFILE.product.ordinary_chrome_name;
}

export function getOplGlobalFeedbackIssueUrl(): string {
  return OPL_PRODUCT_PROFILE.gui.home.utility_icon_policy.global_feedback_action.target_url;
}

export function buildOplAppIssueUrl(baseUrl: string, title: string, body: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return url.toString();
}

export function getOplDefaultCodexModel(): string {
  return OPL_PRODUCT_PROFILE.codex.default_model;
}

export function getOplDefaultCodexReasoningEffort(): OplCodexReasoningEffort | null {
  return OPL_PRODUCT_PROFILE.codex.default_reasoning_effort;
}

export function getOplCodexAutoModelPolicy(): OplCodexAutoModelPolicy {
  const policy = OPL_PRODUCT_PROFILE.codex.auto_model_policy;
  return {
    ...policy,
    frontier_model_preference_order: [...policy.frontier_model_preference_order],
    known_model_reasoning_effort_overrides: { ...policy.known_model_reasoning_effort_overrides },
    catalog_unavailable_fallback: { ...policy.catalog_unavailable_fallback },
    persistence_policy: { ...policy.persistence_policy },
  };
}

export function getOplDefaultExecutorAgentKey(): string {
  return 'codex';
}

export function getOplGuiDefaultCssThemeId(): string {
  return OPL_PRODUCT_PROFILE.gui.appearance.default_css_theme_id;
}

export function shouldDefaultCodexCssTheme(): boolean {
  return OPL_PRODUCT_PROFILE.gui.appearance.codex_theme_default_enabled;
}

export function getOplCodexDefaultPermissionMode(): string {
  return OPL_PRODUCT_PROFILE.gui.home.codex_default_permission_mode;
}

export function getOplRetiredCodexModels(): string[] {
  return [...OPL_PRODUCT_PROFILE.gui.home.retired_codex_models_must_not_be_exposed];
}

export function getOplCodexFrontierModelPreferenceOrder(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.auto_model_policy.frontier_model_preference_order];
}

export function getOplCodexModelDisplayOptions(): OplCodexModelDisplayOptions {
  return {
    ...OPL_PRODUCT_PROFILE.gui.home.codex_model_display_options,
    auto_option: {
      ...OPL_PRODUCT_PROFILE.gui.home.codex_model_display_options.auto_option,
    },
    reasoning_labels: {
      ...OPL_PRODUCT_PROFILE.gui.home.codex_model_display_options.reasoning_labels,
    },
    user_reasoning_effort_options: [
      ...OPL_PRODUCT_PROFILE.gui.home.codex_model_display_options.user_reasoning_effort_options,
    ],
    visible_models: OPL_PRODUCT_PROFILE.gui.home.codex_model_display_options.visible_models.map((model) => ({
      ...model,
    })),
  };
}

export function shouldShowOplCodexModelSelector(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.codex_model_selector_visible;
}

export function shouldShowOplCodexModelList(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.codex_model_list_visible;
}

export function shouldShowOplCodexModelAutoOption(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.codex_model_auto_option_visible;
}

export function isOplCodexCliFixedExecutor(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.codex_cli_fixed_executor;
}

export function shouldShowOplHomeExecutorSelector(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.home_executor_selector_visible;
}

export function shouldShowOplHomePermissionModeSelector(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.permission_mode_selector_visible;
}

export function getOplHomeComposerStateContract(): OplHomeComposerStateContract {
  const contract = OPL_PRODUCT_PROFILE.gui.home.home_composer_state_contract;
  return {
    ...contract,
    shortcut_package_ids: [...contract.shortcut_package_ids],
    viewports: [...contract.viewports],
    availability_states: [...contract.availability_states],
    invariants: { ...contract.invariants },
    semantic_probe: {
      ...contract.semantic_probe,
      state_attributes: { ...contract.semantic_probe.state_attributes },
      desktop_required_controls: [...contract.semantic_probe.desktop_required_controls],
      mobile_required_controls: [...contract.semantic_probe.mobile_required_controls],
      forbidden_controls: [...contract.semantic_probe.forbidden_controls],
    },
  };
}

export function shouldShowOplConversationBackendSelector(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.conversation_backend_selector_visible;
}

export function shouldShowOplConversationModelSelector(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.conversation_model_selector_visible;
}

export function shouldShowOplConversationPermissionModeSelector(): boolean {
  return OPL_PRODUCT_PROFILE.gui.home.conversation_permission_mode_selector_visible;
}

export function getOplHomeModelStatusLabel(localeKey: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return localeKey === 'en-US'
    ? OPL_PRODUCT_PROFILE.gui.home.codex_home_model_status_label_en
    : OPL_PRODUCT_PROFILE.gui.home.codex_home_model_status_label;
}

export function getOplDefaultCodexModelDisplayLabel(): string {
  return getOplHomeModelStatusLabel('zh-CN');
}

export function getOplModelStatusDisplayText(localeKey: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  const label = getOplHomeModelStatusLabel(localeKey);
  return localeKey === 'en-US' ? `Model: ${label}` : `模型: ${label}`;
}

export function getOplDefaultHomeAssistants(): OplHomeAssistant[] {
  return OPL_PRODUCT_PROFILE.gui.default_assistants.map((assistant) => ({
    ...assistant,
    description_i18n: { ...assistant.description_i18n },
    prompts_i18n: Object.fromEntries(
      Object.entries(assistant.prompts_i18n).map(([locale, prompts]) => [locale, [...prompts]])
    ),
  }));
}

export function getOplHomeAgentShortcuts(): OplHomeAgentShortcut[] {
  return OPL_PRODUCT_PROFILE.gui.home.home_agent_shortcuts.map((shortcut) => ({
    ...shortcut,
    required_skill_ids: [...shortcut.required_skill_ids],
  }));
}

export function getOplAgentPackageRegistryUrl(): string {
  return OPL_PRODUCT_PROFILE.gui.agent_package_registry.default_registry_url;
}

export function getOplFirstPartyPackagePresentations(): OplFirstPartyPackagePresentation[] {
  return OPL_PRODUCT_PROFILE.gui.agent_package_registry.first_party_release_set_metadata.map((entry) => ({
    ...entry,
    display_name_i18n: { ...entry.display_name_i18n },
    description_i18n: { ...entry.description_i18n },
  }));
}

export function getOplProfessionalAgentPackages(): OplProfessionalAgentPackage[] {
  return OPL_PRODUCT_PROFILE.gui.professional_agent_packages.map((agentPackage) => ({
    ...agentPackage,
    display_name_i18n: { ...agentPackage.display_name_i18n },
    home_shortcut_ids: [...agentPackage.home_shortcut_ids],
    required_skill_ids: [...agentPackage.required_skill_ids],
    optional_skill_ids: [...agentPackage.optional_skill_ids],
    description_i18n: { ...agentPackage.description_i18n },
    session_routing_summary_i18n: { ...agentPackage.session_routing_summary_i18n },
  }));
}

export function getOplProfessionalAgentPackage(packageId: string): OplProfessionalAgentPackage | undefined {
  const normalizedId = canonicalizeOplProfessionalAgentId(packageId);
  const agentPackage = OPL_PRODUCT_PROFILE.gui.professional_agent_packages.find(
    (entry) => entry.package_id === normalizedId
  );
  if (!agentPackage) return undefined;
  return {
    ...agentPackage,
    display_name_i18n: { ...agentPackage.display_name_i18n },
    home_shortcut_ids: [...agentPackage.home_shortcut_ids],
    required_skill_ids: [...agentPackage.required_skill_ids],
    optional_skill_ids: [...agentPackage.optional_skill_ids],
    description_i18n: { ...agentPackage.description_i18n },
    session_routing_summary_i18n: { ...agentPackage.session_routing_summary_i18n },
  };
}

export function getOplAssistantSkillProfiles(): OplAssistantSkillProfile[] {
  return OPL_PRODUCT_PROFILE.gui.professional_agent_packages
    .filter((agentPackage) => agentPackage.default_home_visible)
    .map((agentPackage) => ({
      assistant_id: agentPackage.package_id,
      required_skills: [...agentPackage.required_skill_ids],
      optional_skills: [...agentPackage.optional_skill_ids],
      required_skill_policy: agentPackage.required_skill_policy,
      optional_skill_policy: agentPackage.optional_skill_policy,
      skill_menu_policy: agentPackage.skill_menu_policy,
    }));
}

export function getOplAssistantSkillProfile(assistantId: string): OplAssistantSkillProfile | undefined {
  const normalizedId = canonicalizeOplProfessionalAgentId(assistantId);
  const agentPackage = getOplProfessionalAgentPackage(normalizedId);
  if (!agentPackage) return undefined;
  return {
    assistant_id: agentPackage.package_id,
    required_skills: [...agentPackage.required_skill_ids],
    optional_skills: [...agentPackage.optional_skill_ids],
    required_skill_policy: agentPackage.required_skill_policy,
    optional_skill_policy: agentPackage.optional_skill_policy,
    skill_menu_policy: agentPackage.skill_menu_policy,
  };
}

export function getOplAgentPackageInvocationReceiptPolicy(): OplAgentPackageInvocationReceiptPolicy {
  const policy = OPL_PRODUCT_PROFILE.gui.agent_package_invocation_receipt_policy;
  return {
    ...policy,
    required_for_package_shortcuts: [...policy.required_for_package_shortcuts],
    required_fields: [...policy.required_fields],
    must_not_govern: [...policy.must_not_govern],
  };
}

export function getOplBuiltinAssistantRouteReceiptPolicy(): OplBuiltinAssistantRouteReceiptPolicy {
  const policy = OPL_PRODUCT_PROFILE.gui.builtin_assistant_route_receipt_policy;
  return {
    ...policy,
    required_for_assistants: [...policy.required_for_assistants],
    required_fields: [...policy.required_fields],
  };
}

export function getOplOrdinaryCapabilitySelectorPolicy(): OplOrdinaryCapabilitySelectorPolicy {
  const policy = OPL_PRODUCT_PROFILE.gui.ordinary_capability_selector_policy;
  return {
    ...policy,
    agent_reference_admission_policy: { ...policy.agent_reference_admission_policy },
    visible_mcp_server_ids: [...policy.visible_mcp_server_ids],
    forbidden_skill_examples: [...policy.forbidden_skill_examples],
    forbidden_mcp_examples: [...policy.forbidden_mcp_examples],
    forbidden_mcp_matchers: {
      exact: [...policy.forbidden_mcp_matchers.exact],
      prefixes: [...policy.forbidden_mcp_matchers.prefixes],
      contains: [...policy.forbidden_mcp_matchers.contains],
    },
    scrub_extra_keys: [...policy.scrub_extra_keys],
    required_scrub_targets: [...policy.required_scrub_targets],
  };
}

export function getOplOrdinarySkillAllowlist(): string[] {
  const skills = OPL_PRODUCT_PROFILE.gui.professional_agent_packages.flatMap((agentPackage) => [
    ...agentPackage.required_skill_ids,
    ...agentPackage.optional_skill_ids,
  ]);
  return Array.from(new Set(skills));
}

export function getOplOrdinaryMcpServerAllowlist(): string[] {
  return [...OPL_PRODUCT_PROFILE.gui.ordinary_capability_selector_policy.visible_mcp_server_ids];
}

export function getOplOrdinaryForbiddenCapabilityPolicy(): OplOrdinaryForbiddenCapabilityPolicy {
  const policy = OPL_PRODUCT_PROFILE.gui.ordinary_capability_selector_policy;
  return {
    exact: [...policy.forbidden_mcp_matchers.exact],
    prefixes: [...policy.forbidden_mcp_matchers.prefixes],
    contains: [...policy.forbidden_mcp_matchers.contains],
    extra_keys: [...policy.scrub_extra_keys],
  };
}

export function filterOplOrdinarySkillNames(names: string[]): string[] {
  const allowlist = new Set(getOplOrdinarySkillAllowlist());
  return names.filter((name, index) => allowlist.has(name) && names.indexOf(name) === index);
}

export function filterOplOrdinarySkillCatalog<T extends { name: string }>(skills: T[]): T[] {
  const allowlist = new Set(getOplOrdinarySkillAllowlist());
  return skills.filter((skill) => allowlist.has(skill.name));
}

export function filterOplOrdinaryMcpServers<T extends Pick<IMcpServer, 'id' | 'name'>>(servers: T[]): T[] {
  const allowlist = new Set(getOplOrdinaryMcpServerAllowlist());
  return servers.filter(
    (server) =>
      (allowlist.has(server.id) || allowlist.has(server.name)) &&
      !isOplForbiddenTeamMcpName(server.id) &&
      !isOplForbiddenTeamMcpName(server.name)
  );
}

export function filterOplOrdinaryMcpStatuses<T extends IConversationMcpStatus>(statuses: T[]): T[] {
  const allowlist = new Set(getOplOrdinaryMcpServerAllowlist());
  return statuses.filter(
    (status) =>
      (allowlist.has(status.id) || allowlist.has(status.name)) &&
      !isOplForbiddenTeamMcpName(status.id) &&
      !isOplForbiddenTeamMcpName(status.name)
  );
}

export function isOplForbiddenTeamMcpName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  const policy = getOplOrdinaryForbiddenCapabilityPolicy();
  return (
    policy.exact.includes(normalized) ||
    policy.prefixes.some((prefix) => normalized.startsWith(prefix)) ||
    policy.contains.some((fragment) => normalized.includes(fragment))
  );
}

export function filterOplOrdinarySessionMcpServers<T extends Pick<ISessionMcpServer, 'id' | 'name'>>(
  servers: T[]
): T[] {
  return filterOplOrdinaryMcpServers(servers).filter(
    (server) => !isOplForbiddenTeamMcpName(server.id) && !isOplForbiddenTeamMcpName(server.name)
  );
}

export function sanitizeOplOrdinaryConversationExtra<T extends Record<string, unknown> | undefined>(extra: T): T {
  if (!extra) return extra;
  const sanitized: Record<string, unknown> = { ...extra };
  const mcpServers = Array.isArray(sanitized.mcp_servers) ? (sanitized.mcp_servers as string[]) : undefined;
  const mcpStatuses = Array.isArray(sanitized.mcp_statuses)
    ? (sanitized.mcp_statuses as IConversationMcpStatus[])
    : undefined;
  const sessionMcpServers = Array.isArray(sanitized.session_mcp_servers)
    ? (sanitized.session_mcp_servers as ISessionMcpServer[])
    : undefined;

  if (mcpServers) {
    sanitized.mcp_servers = filterOplOrdinaryMcpServers(mcpServers.map((name) => ({ id: name, name }))).map(
      (server) => server.name
    );
  }
  if (mcpStatuses) {
    sanitized.mcp_statuses = filterOplOrdinaryMcpStatuses(mcpStatuses).filter(
      (status) => !isOplForbiddenTeamMcpName(status.id) && !isOplForbiddenTeamMcpName(status.name)
    );
  }
  if (sessionMcpServers) {
    sanitized.session_mcp_servers = filterOplOrdinarySessionMcpServers(sessionMcpServers);
  }

  for (const key of getOplOrdinaryForbiddenCapabilityPolicy().extra_keys) {
    delete sanitized[key];
  }

  return sanitized as T;
}

export function getOplFlowContextPolicy(): OplFlowContextPolicy {
  const policy = OPL_PRODUCT_PROFILE.codex.opl_flow_context;
  return { ...policy };
}

export function getOplAppSessionContextPolicy(): OplAppSessionContextPolicy {
  return {
    ...OPL_PRODUCT_PROFILE.codex.opl_app_session_context,
    customization: {
      ...OPL_PRODUCT_PROFILE.codex.opl_app_session_context.customization,
    },
  };
}

export function getOplDefaultCodexSkills(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.default_visible_skills];
}

export function getOplDefaultPackagedCodexSkills(): string[] {
  return [...OPL_PRODUCT_PROFILE.companion_payloads.default_packaged_codex_skill_ids];
}

export function getOplPackagedCodexSkills(): string[] {
  return [
    ...OPL_PRODUCT_PROFILE.companion_payloads.default_packaged_codex_skill_ids,
    ...OPL_PRODUCT_PROFILE.companion_payloads.additional_package_skill_ids,
  ];
}

export function getOplScheduledTasksPolicy(): OplNativeAutomationPolicy {
  return { ...OPL_PRODUCT_PROFILE.companion_payloads.native_automation };
}

export function getOplSkillPriority(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.skill_priority];
}

export function getOplCodexSessionContext(): string {
  return getOplCodexSessionContextForLocale('zh-CN');
}

export function getOplCodexSessionContextForLocale(locale: 'zh-CN' | 'en-US'): string {
  const context = OPL_PRODUCT_PROFILE.codex.session_context_i18n?.[locale];
  const routeLines = OPL_PRODUCT_PROFILE.gui.professional_agent_packages.map((agentPackage) => {
    const summary = agentPackage.session_routing_summary_i18n[locale];
    return locale === 'en-US'
      ? `- ${agentPackage.short_name} (${agentPackage.display_name}): ${summary}.`
      : `- ${agentPackage.short_name}（${agentPackage.display_name}）：${summary}。`;
  });
  return (context ?? OPL_PRODUCT_PROFILE.codex.session_context_lines)
    .flatMap((line) => (line === '{{agent_routes}}' ? routeLines : [line]))
    .join('\n')
    .trim();
}

export function getOplLegacyCodexSessionContexts(): string[] {
  return [getOplCodexSessionContext()];
}

export function getOplDeferredFirstLaunchBlockers(): string[] {
  return [...OPL_PRODUCT_PROFILE.first_run.deferred_blockers];
}

export function getOplReadyToLaunchCoreItems(): string[] {
  return [...OPL_PRODUCT_PROFILE.first_run.ready_to_launch_gate.required_core_items];
}

export function getOplReadyToLaunchNonBlockingItems(): string[] {
  return [...OPL_PRODUCT_PROFILE.first_run.ready_to_launch_gate.must_not_require];
}

export function getOplCommandLineToolsInstallMessage(): string {
  return OPL_PRODUCT_PROFILE.first_run.command_line_tools.messages.join('\n');
}

function cloneOplSettingsUserNavigationProjection(
  projection: OplSettingsUserNavigationProjection
): OplSettingsUserNavigationProjection {
  return {
    ...projection,
    primary_group_order: [...projection.primary_group_order],
    primary_groups: projection.primary_groups.map((group) => ({
      ...group,
      destination_ids: [...group.destination_ids],
    })),
    destinations: projection.destinations.map((destination) => ({ ...destination })),
    secondary_owner_bindings: projection.secondary_owner_bindings.map((binding) => ({ ...binding })),
    auxiliary_entries: projection.auxiliary_entries.map((entry) => ({ ...entry })),
    responsive_navigation: {
      ...projection.responsive_navigation,
      minimum_viewport_px: { ...projection.responsive_navigation.minimum_viewport_px },
    },
    footer_policy: { ...projection.footer_policy },
  };
}

/** Return the App-owned Settings navigation grouping without exposing mutable profile state. */
export function getOplSettingsUserNavigationProjection(): OplSettingsUserNavigationProjection {
  return cloneOplSettingsUserNavigationProjection(
    OPL_PRODUCT_PROFILE.settings.control_plane.user_navigation_projection
  );
}

export function getOplGuiSettingsControlPlane(): OplSettingsControlPlane {
  const controlPlane = OPL_PRODUCT_PROFILE.settings.control_plane;
  return {
    ...controlPlane,
    ordinary_visible_tabs: [...controlPlane.ordinary_visible_tabs],
    ordinary_routes: controlPlane.ordinary_routes.map((route) => ({ ...route })),
    secondary_pages: controlPlane.secondary_pages.map((page) => ({ ...page })),
    compatibility_redirects: Object.fromEntries(
      Object.entries(controlPlane.compatibility_redirects).map(([id, redirect]) => [id, { ...redirect }])
    ),
    legacy_route_redirects: { ...controlPlane.legacy_route_redirects },
    extension_anchor_remap: { ...controlPlane.extension_anchor_remap },
    extension_tab_policy: { ...controlPlane.extension_tab_policy },
    slot_registry: Object.fromEntries(
      Object.entries(controlPlane.slot_registry).map(([slotId, slot]) => [
        slotId,
        {
          ...slot,
          ...(slot.legacy_subroutes ? { legacy_subroutes: { ...slot.legacy_subroutes } } : {}),
        },
      ])
    ),
    state_action_policy: {
      ...controlPlane.state_action_policy,
      recommended_action_ids: { ...controlPlane.state_action_policy.recommended_action_ids },
      shell_must_not_own: [...controlPlane.state_action_policy.shell_must_not_own],
    },
    experience_contract: {
      global_search: { ...controlPlane.experience_contract.global_search },
      page_contracts: Object.fromEntries(
        Object.entries(controlPlane.experience_contract.page_contracts).map(([id, page]) => [id, { ...page }])
      ),
      search_index: {
        ...controlPlane.experience_contract.search_index,
        entries: controlPlane.experience_contract.search_index.entries.map((entry) => ({
          ...entry,
          keywords_zh: [...entry.keywords_zh],
          keywords_en: [...entry.keywords_en],
        })),
      },
    },
    user_navigation_projection: cloneOplSettingsUserNavigationProjection(controlPlane.user_navigation_projection),
  };
}

/** Return the exact App-owned routes exposed through the branded deep-link protocol. */
export function getOplAppDeepLinkRoutes(): string[] {
  const controlPlane = OPL_PRODUCT_PROFILE.settings.control_plane;
  return [
    '/guid',
    '/archived',
    '/scheduled',
    ...controlPlane.ordinary_routes.map((route) => route.path),
    ...controlPlane.secondary_pages.map((page) => page.path),
  ];
}

export function isOplAppDeepLinkRoute(route: string): boolean {
  return getOplAppDeepLinkRoutes().includes(route);
}

export function getOplGuiSettingsVisibleTabs(): string[] {
  return [...OPL_PRODUCT_PROFILE.settings.control_plane.ordinary_visible_tabs];
}

export function getOplGuiSettingsSecondaryPageIds(): string[] {
  return OPL_PRODUCT_PROFILE.settings.control_plane.secondary_pages.map((page) => page.id);
}

export function getOplGuiLegacySettingsRouteRedirects(): Record<string, string> {
  return { ...OPL_PRODUCT_PROFILE.settings.control_plane.legacy_route_redirects };
}

export function getOplSettingsControlPlaneActionContract(): OplSettingsControlPlaneActionContract {
  const policy = OPL_PRODUCT_PROFILE.settings.control_plane.state_action_policy;
  return {
    ...policy,
    recommended_action_ids: { ...policy.recommended_action_ids },
    shell_must_not_own: [...policy.shell_must_not_own],
  };
}

export function getOplRuntimeEnvironmentItems(): string[] {
  return [...OPL_PRODUCT_PROFILE.settings.environment_items];
}

export function getOplDeveloperProfileSettings(): OplDeveloperProfileSettings {
  const developerProfile = OPL_PRODUCT_PROFILE.settings.developer_profile;
  return {
    ...developerProfile,
    capability_axes: [...developerProfile.capability_axes],
    capabilities: Object.fromEntries(
      developerProfile.capability_axes.map((axis) => [axis, { ...developerProfile.capabilities[axis] }])
    ) as Record<OplDeveloperProfileCapabilityAxis, OplDeveloperProfileCapability>,
    state_keys: { ...developerProfile.state_keys },
  };
}

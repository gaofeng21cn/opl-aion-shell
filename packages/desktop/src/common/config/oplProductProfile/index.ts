/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import generatedProfile from './oplProductProfile.generated.json';
import type { IConversationMcpStatus, IMcpServer, ISessionMcpServer } from '@/common/config/storage';

export type OplCodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'ultra';
export const OPL_CODEX_CSS_THEME_ID = 'codex';
export const OPL_CLASSIC_CSS_THEME_ID = 'default-theme';
export const OPL_VISIBLE_CSS_THEME_IDS = [OPL_CODEX_CSS_THEME_ID, OPL_CLASSIC_CSS_THEME_ID] as const;
export type OplVisibleCssThemeId = (typeof OPL_VISIBLE_CSS_THEME_IDS)[number];

const OPL_PROFESSIONAL_AGENT_ID_ALIASES = new Map<string, string>([
  ['medautoscience', 'med-autoscience'],
  ['mas', 'med-autoscience'],
  ['medautogrant', 'med-autogrant'],
  ['mag', 'med-autogrant'],
  ['redcubeai', 'redcube-ai'],
  ['redcube', 'redcube-ai'],
  ['rca', 'redcube-ai'],
  ['oplbookforge', 'opl-bookforge'],
  ['bookforge', 'opl-bookforge'],
  ['obf', 'opl-bookforge'],
  ['oplmetaagent', 'opl-meta-agent'],
  ['oma', 'opl-meta-agent'],
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

export type OplNonDefaultAssistant = {
  id: string;
  display_name: string;
  short_name: string;
  role: string;
  home_entry_policy: 'explicit_or_settings_only';
  home_default_visible: false;
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
  short_name: string;
  role: string;
  package_kind: string;
  installed_manageable: boolean;
  default_home_visible: boolean;
  codex_visible_entry: string;
  home_shortcut_ids: string[];
  required_skill_ids: string[];
  optional_skill_ids: string[];
  required_skill_policy: 'checked_locked';
  optional_skill_policy: 'unchecked_user_selectable';
  skill_menu_policy: 'assistant_scoped_required_checked_optional_visible';
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

export type OplOrdinaryCapabilitySelectorPolicy = {
  scope: 'home_composer_and_ordinary_conversation';
  authority: 'app_owned_opl_allowlist';
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
  delivery: 'session_scoped_preset_context';
  user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts';
  language_policy: 'follow_ui_locale_zh_only_when_ui_zh';
  optional_user_modes?: {
    intelligence_enhancement: {
      id: 'intelligence_enhancement';
      settings_key: 'codex.oplFlowIntelligenceEnhancementMode';
      label_key: 'settings.oplFlowIntelligenceEnhancementMode';
      description_key: 'settings.oplFlowIntelligenceEnhancementModeDesc';
      provider: 'codexcont';
      local_proxy_base_url: 'http://127.0.0.1:8787/v1';
      upstream_policy: 'preserve_current_codex_provider_via_local_responses_proxy';
      behavior_policy: 'local_proxy_reasoning_continuation_no_prompt_injection_no_quick_action';
      service_policy: 'opl_flow_managed_persistent_service_macos_launch_agent_linux_systemd_user_docker_startup_repair';
      default_enabled: true;
      status_action_id: 'intelligence_enhancement_status';
      enable_action_id: 'intelligence_enhancement_enable';
      disable_action_id: 'intelligence_enhancement_disable';
      repair_action_id: 'intelligence_enhancement_repair';
      uninstall_action_id: 'intelligence_enhancement_uninstall';
    };
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
  display_policy: 'friendly_model_name_primary_reasoning_primary_model_and_intelligence_secondary_menus';
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
  intelligence_enhancement_menu_policy: 'default_on_secondary_submenu_with_enable_disable_actions';
  intelligence_enhancement_default_enabled: true;
  auto_option: {
    id: '__auto';
    label_zh: string;
    label_en: string;
    description_zh: string;
    description_en: string;
    resolved_model: string;
    resolved_model_label_zh: string;
    resolved_model_label_en: string;
    resolved_reasoning_effort: OplCodexReasoningEffort;
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
  prompt_policy: 'localized Codex CLI read-only diagnosis prompt describing target OPL working mode';
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

export type OplSettingsControlPlane = {
  source_contract_ref: 'contracts/app-settings-control-plane.json';
  default_route: string;
  route_identity_policy: string;
  ordinary_visible_tabs: string[];
  ordinary_routes: OplSettingsControlPlaneRoute[];
  secondary_pages: OplSettingsControlPlaneSecondaryPage[];
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

type AppProductProfile = {
  schema_version: 1;
  owner: 'one-person-lab-app';
  purpose: 'app_owned_product_profile';
  state: string;
  app_repo: 'gaofeng21cn/one-person-lab-app';
  product: {
    id: 'one_person_lab_app';
    display_name: 'One Person Lab App';
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
      permission_mode_selector_visible: false;
      conversation_backend_selector_visible: false;
      conversation_model_selector_visible: boolean;
      conversation_permission_mode_selector_visible: false;
      codex_home_model_status_label: string;
      codex_home_model_status_label_en: string;
      codex_precise_model_display_policy: 'friendly_model_primary_reasoning_primary_model_and_intelligence_secondary_menus';
      codex_auto_model_selection: {
        strategy: 'codex_cli_auto_latest_available_frontier';
        model_list_source?: 'codex_cli_handshake_available_models';
        frontier_model_preference_order_role?: 'exact_visible_model_allowlist_order_and_fallback_with_codex_cli_availability_filter';
        user_can_override_model: boolean;
        user_can_override_reasoning_effort?: boolean;
        user_can_restore_auto: boolean;
        selection_persists_into_conversation: true;
        frontier_model_preference_order: string[];
      };
      codex_model_display_options: OplCodexModelDisplayOptions;
      home_purpose_entries: OplHomePurposeEntry[];
      home_agent_shortcuts: OplHomeAgentShortcut[];
      retired_codex_models_must_not_be_exposed: string[];
    };
    agent_package_invocation_receipt_policy: OplAgentPackageInvocationReceiptPolicy;
    builtin_assistant_route_receipt_policy: OplBuiltinAssistantRouteReceiptPolicy;
    ordinary_capability_selector_policy: OplOrdinaryCapabilitySelectorPolicy;
    professional_agent_packages: OplProfessionalAgentPackage[];
    default_assistants: OplHomeAssistant[];
    assistant_skill_profiles: OplAssistantSkillProfile[];
    non_default_assistants: OplNonDefaultAssistant[];
  };
  codex: {
    default_model: string;
    default_reasoning_effort: OplCodexReasoningEffort | null;
    opl_flow_context: OplFlowContextPolicy;
    default_visible_skills: string[];
    skill_priority: string[];
    session_context_lines: string[];
    session_context_i18n?: OplCodexSessionContext;
  };
  companion_payloads: {
    default_packaged_codex_skill_ids: string[];
    packaged_not_default_visible_codex_skill_ids: string[];
  };
  first_run: {
    readiness_layers: string[];
    ready_to_launch_gate: {
      id: 'ready_to_launch';
      ui_order: 'before_guid';
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
      primary_user_goal: 'reach_guid_with_codex_ready';
      primary_steps: string[];
      primary_progress_signal: string;
      advanced_progress_disclosure: 'collapsed_or_secondary';
      background_maintenance_presentation: 'collapsed_technical_non_blocking';
      technical_detail_policy: 'hidden_until_expanded_or_error';
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

const CODEX_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'ultra']);
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
    'session_scoped_opl_flow_context',
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
    prompt_policy: 'localized Codex CLI read-only diagnosis prompt describing target OPL working mode',
    target_state_checks: targetStateChecks,
    mutation_policy: 'diagnose_first_no_file_mutation_without_user_confirmation',
    release_gate_policy: 'user_visible_entry_complements_non_blocking_codex_ai_self_check_receipt',
  };
}

function readReasoningEffort(value: unknown, context: string): OplCodexReasoningEffort | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !CODEX_REASONING_EFFORTS.has(value)) {
    throw new Error(`Invalid OPL product profile: ${context} is unsupported`);
  }
  return value as OplCodexReasoningEffort;
}

function readRequiredReasoningEffort(value: unknown, context: string): OplCodexReasoningEffort {
  const reasoningEffort = readReasoningEffort(value, context);
  if (!reasoningEffort) {
    throw new Error(`Invalid OPL product profile: ${context} must be non-null`);
  }
  return reasoningEffort;
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
    value.display_policy !== 'friendly_model_name_primary_reasoning_primary_model_and_intelligence_secondary_menus' ||
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
    value.intelligence_enhancement_menu_policy !== 'default_on_secondary_submenu_with_enable_disable_actions' ||
    value.intelligence_enhancement_default_enabled !== true ||
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
    autoOption.resolved_model !== defaultModel ||
    autoOption.follows_latest_strongest !== true
  ) {
    throw new Error('Invalid OPL product profile: Codex auto model display option is invalid');
  }
  const autoReasoningEffort = readRequiredReasoningEffort(
    autoOption.resolved_reasoning_effort,
    'gui.home.codex_model_display_options.auto_option.resolved_reasoning_effort'
  );
  if (autoReasoningEffort !== defaultReasoningEffort) {
    throw new Error('Invalid OPL product profile: Codex auto model display reasoning must match Codex default');
  }

  const reasoningLabels = isRecord(value.reasoning_labels) ? value.reasoning_labels : null;
  const xhighReasoningLabel = isRecord(reasoningLabels?.xhigh) ? reasoningLabels.xhigh : null;
  const ultraReasoningLabel = isRecord(reasoningLabels?.ultra) ? reasoningLabels.ultra : null;
  const highReasoningLabel = isRecord(reasoningLabels?.high) ? reasoningLabels.high : null;
  if (
    highReasoningLabel?.zh !== '推理高' ||
    highReasoningLabel.en !== 'High reasoning' ||
    xhighReasoningLabel?.zh !== '推理超高' ||
    xhighReasoningLabel.en !== 'Extra high reasoning' ||
    ultraReasoningLabel?.zh !== '推理极高' ||
    ultraReasoningLabel.en !== 'Ultra reasoning'
  ) {
    throw new Error(
      'Invalid OPL product profile: Codex model display options must label high, xhigh, and ultra reasoning'
    );
  }
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
    display_policy: 'friendly_model_name_primary_reasoning_primary_model_and_intelligence_secondary_menus',
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
    intelligence_enhancement_menu_policy: 'default_on_secondary_submenu_with_enable_disable_actions',
    intelligence_enhancement_default_enabled: true,
    auto_option: {
      id: '__auto',
      label_zh: '自动（推荐）',
      label_en: 'Auto (recommended)',
      description_zh: typeof autoOption.description_zh === 'string' ? autoOption.description_zh : '',
      description_en: typeof autoOption.description_en === 'string' ? autoOption.description_en : '',
      resolved_model: defaultModel,
      resolved_model_label_zh:
        typeof autoOption.resolved_model_label_zh === 'string' ? autoOption.resolved_model_label_zh : defaultModel,
      resolved_model_label_en:
        typeof autoOption.resolved_model_label_en === 'string' ? autoOption.resolved_model_label_en : defaultModel,
      resolved_reasoning_effort: autoReasoningEffort,
      follows_latest_strongest: true,
    },
    fixed_model_description_zh: '固定此模型',
    fixed_model_description_en: 'Use this model',
    reasoning_labels: {
      ...Object.fromEntries(
        Object.entries(reasoningLabels ?? {}).flatMap(([key, label]) => {
          if (!CODEX_REASONING_EFFORTS.has(key) || !isRecord(label)) return [];
          if (typeof label.zh !== 'string' || typeof label.en !== 'string') return [];
          return [[key, { zh: label.zh.trim(), en: label.en.trim() }]];
        })
      ),
      high: { zh: '推理高', en: 'High reasoning' },
      xhigh: { zh: '推理超高', en: 'Extra high reasoning' },
      ultra: { zh: '推理极高', en: 'Ultra reasoning' },
    } as Record<OplCodexReasoningEffort, { zh: string; en: string }>,
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
    developerProfile.opt_in_policy !== 'explicit_opt_in_only'
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
    typeof product.primary_surface !== 'string' ||
    typeof product.positioning !== 'string' ||
    typeof product.primary_user_path !== 'string'
  ) {
    throw new Error('Invalid OPL product profile: product identity must match One Person Lab App');
  }
  return {
    id: 'one_person_lab_app',
    display_name: 'One Person Lab App',
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
  if (
    entries.map((entry) => entry.target_assistant_id).join(',') !==
    ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge'].join(',')
  ) {
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
      required_skill_policy: 'checked_locked',
      optional_skill_policy: 'unchecked_user_selectable',
      skill_menu_policy: 'assistant_scoped_required_checked_optional_visible',
    };
  });
  const packageIds = packages.map((agentPackage) => agentPackage.package_id);
  if (new Set(packageIds).size !== packageIds.length) {
    throw new Error('Invalid OPL product profile: gui.professional_agent_packages must not contain duplicate ids');
  }
  for (const required of ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge', 'opl-meta-agent']) {
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
  for (const required of ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge']) {
    if (!ids.includes(required)) {
      throw new Error(`Invalid OPL product profile: gui.default_assistants must include ${required}`);
    }
  }
  if (ids.includes('opl-meta-agent')) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must not include opl-meta-agent');
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
    if (entry.home_entry_policy !== 'explicit_or_settings_only' || entry.home_default_visible !== false) {
      throw new Error(`Invalid OPL product profile: non-default assistant ${id} must be settings-only`);
    }
    return {
      id,
      display_name: displayName,
      short_name: shortName,
      role,
      home_entry_policy: 'explicit_or_settings_only',
      home_default_visible: false,
      avatar,
      description_i18n: readStringRecord(entry.description_i18n, `gui.non_default_assistants.${id}.description_i18n`),
      prompts_i18n: readStringArrayRecord(entry.prompts_i18n, `gui.non_default_assistants.${id}.prompts_i18n`),
    };
  });

  const ids = assistants.map((assistant) => assistant.id);
  if (!ids.includes('opl-meta-agent')) {
    throw new Error('Invalid OPL product profile: gui.non_default_assistants must include opl-meta-agent');
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

  if (
    profiles.map((profile) => profile.assistant_id).join(',') !==
    ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge'].join(',')
  ) {
    throw new Error('Invalid OPL product profile: assistant skill profiles must be MAS, MAG, RCA, and BookForge');
  }
  for (const profile of profiles) {
    const requiredSkillsByAssistant: Record<string, string[]> = {
      'med-autoscience': ['med-autoscience'],
      'med-autogrant': ['med-autogrant'],
      'redcube-ai': ['redcube-ai'],
      'opl-bookforge': ['opl-bookforge'],
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
    requiredForAssistants.join(',') !== ['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge'].join(',') ||
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
    value.delivery !== 'session_scoped_preset_context' ||
    value.user_agents_policy !== 'respect_user_agents_no_overwrite_detect_conflicts' ||
    value.language_policy !== 'follow_ui_locale_zh_only_when_ui_zh'
  ) {
    throw new Error('Invalid OPL product profile: codex.opl_flow_context is unsupported');
  }
  const optionalUserModes = isRecord(value.optional_user_modes) ? value.optional_user_modes : null;
  const intelligenceEnhancementMode =
    optionalUserModes && isRecord(optionalUserModes.intelligence_enhancement)
      ? optionalUserModes.intelligence_enhancement
      : null;
  const parsedIntelligenceEnhancementMode =
    intelligenceEnhancementMode &&
    intelligenceEnhancementMode.id === 'intelligence_enhancement' &&
    intelligenceEnhancementMode.settings_key === 'codex.oplFlowIntelligenceEnhancementMode' &&
    intelligenceEnhancementMode.label_key === 'settings.oplFlowIntelligenceEnhancementMode' &&
    intelligenceEnhancementMode.description_key === 'settings.oplFlowIntelligenceEnhancementModeDesc' &&
    intelligenceEnhancementMode.provider === 'codexcont' &&
    intelligenceEnhancementMode.local_proxy_base_url === 'http://127.0.0.1:8787/v1' &&
    intelligenceEnhancementMode.upstream_policy === 'preserve_current_codex_provider_via_local_responses_proxy' &&
    intelligenceEnhancementMode.behavior_policy ===
      'local_proxy_reasoning_continuation_no_prompt_injection_no_quick_action' &&
    intelligenceEnhancementMode.service_policy ===
      'opl_flow_managed_persistent_service_macos_launch_agent_linux_systemd_user_docker_startup_repair' &&
    intelligenceEnhancementMode.default_enabled === true &&
    intelligenceEnhancementMode.status_action_id === 'intelligence_enhancement_status' &&
    intelligenceEnhancementMode.enable_action_id === 'intelligence_enhancement_enable' &&
    intelligenceEnhancementMode.disable_action_id === 'intelligence_enhancement_disable' &&
    intelligenceEnhancementMode.repair_action_id === 'intelligence_enhancement_repair' &&
    intelligenceEnhancementMode.uninstall_action_id === 'intelligence_enhancement_uninstall'
      ? {
          id: 'intelligence_enhancement' as const,
          settings_key: 'codex.oplFlowIntelligenceEnhancementMode' as const,
          label_key: 'settings.oplFlowIntelligenceEnhancementMode' as const,
          description_key: 'settings.oplFlowIntelligenceEnhancementModeDesc' as const,
          provider: 'codexcont' as const,
          local_proxy_base_url: 'http://127.0.0.1:8787/v1' as const,
          upstream_policy: 'preserve_current_codex_provider_via_local_responses_proxy' as const,
          behavior_policy: 'local_proxy_reasoning_continuation_no_prompt_injection_no_quick_action' as const,
          service_policy:
            'opl_flow_managed_persistent_service_macos_launch_agent_linux_systemd_user_docker_startup_repair' as const,
          default_enabled: true as const,
          status_action_id: 'intelligence_enhancement_status' as const,
          enable_action_id: 'intelligence_enhancement_enable' as const,
          disable_action_id: 'intelligence_enhancement_disable' as const,
          repair_action_id: 'intelligence_enhancement_repair' as const,
          uninstall_action_id: 'intelligence_enhancement_uninstall' as const,
        }
      : null;
  if (optionalUserModes && !parsedIntelligenceEnhancementMode) {
    throw new Error(
      'Invalid OPL product profile: codex.opl_flow_context.optional_user_modes.intelligence_enhancement is unsupported'
    );
  }
  return {
    flow_id: 'opl-flow',
    source,
    delivery: 'session_scoped_preset_context',
    user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
    ...(parsedIntelligenceEnhancementMode
      ? { optional_user_modes: { intelligence_enhancement: parsedIntelligenceEnhancementMode } }
      : {}),
  };
}

function validateOplProductProfile(value: unknown): AppProductProfile {
  if (!isRecord(value)) {
    throw new Error('Invalid OPL product profile: root must be an object');
  }
  if (value.schema_version !== 1) {
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
  const expectedTabs = [
    'general',
    'access',
    'workspace',
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
  if (secondaryPageIds.join(',') !== 'advanced,about,update,theme,local-services') {
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
    system: 'advanced',
    model: 'environment',
    agent: 'capabilities',
    assistants: 'capabilities',
    'skills-hub': 'capabilities',
    tools: 'capabilities',
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
    readyToLaunchGate.ui_order !== 'before_guid'
  ) {
    throw new Error('Invalid OPL product profile: first-run launch gate must be Core ready_to_launch before /guid');
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
    beginnerPresentation.primary_user_goal !== 'reach_guid_with_codex_ready' ||
    beginnerPresentation.advanced_progress_disclosure !== 'collapsed_or_secondary' ||
    beginnerPresentation.background_maintenance_presentation !== 'collapsed_technical_non_blocking' ||
    beginnerPresentation.technical_detail_policy !== 'hidden_until_expanded_or_error'
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
    guiHome.permission_mode_selector_visible !== false ||
    guiHome.conversation_backend_selector_visible !== false ||
    guiHome.conversation_model_selector_visible !== true ||
    guiHome.conversation_permission_mode_selector_visible !== false ||
    guiHome.codex_precise_model_display_policy !==
      'friendly_model_primary_reasoning_primary_model_and_intelligence_secondary_menus'
  ) {
    throw new Error('Invalid OPL product profile: GUI home contract must expose App-owned model selection');
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
    autoModelSelection.strategy !== 'codex_cli_auto_latest_available_frontier' ||
    autoModelSelection.model_list_source !== 'codex_cli_handshake_available_models' ||
    autoModelSelection.frontier_model_preference_order_role !==
      'exact_visible_model_allowlist_order_and_fallback_with_codex_cli_availability_filter' ||
    autoModelSelection.user_can_override_model !== true ||
    autoModelSelection.user_can_restore_auto !== true ||
    autoModelSelection.selection_persists_into_conversation !== true
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex model policy must expose model override and restore');
  }
  const frontierModelPreferenceOrder = readStringArray(
    autoModelSelection,
    'frontier_model_preference_order',
    'gui.home.codex_auto_model_selection'
  );
  const codexModelDisplayOptions = readCodexModelDisplayOptions(
    guiHome,
    codexReasoningEffort,
    codexModel,
    frontierModelPreferenceOrder
  );
  if (
    homeModelStatusLabel !== codexModelDisplayOptions.auto_option.resolved_model_label_zh ||
    homeModelStatusLabelEn !== codexModelDisplayOptions.auto_option.resolved_model_label_en
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex model status label must match the App default model');
  }
  const homePurposeEntries = readHomePurposeEntries(guiHome);
  const homeAgentShortcuts = readHomeAgentShortcuts(guiHome);
  const retiredCodexModels = readStringArray(guiHome, 'retired_codex_models_must_not_be_exposed', 'gui.home');
  const agentPackageInvocationReceiptPolicy = readAgentPackageInvocationReceiptPolicy(gui);
  const builtinAssistantRouteReceiptPolicy = readBuiltinAssistantRouteReceiptPolicy(gui);
  const ordinaryCapabilitySelectorPolicy = readOrdinaryCapabilitySelectorPolicy(gui);
  const oplFlowContext = readOplFlowContextPolicy(codex);
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
  const packagedNotDefaultVisibleCodexSkillIds = readStringArray(
    companionPayloads,
    'packaged_not_default_visible_codex_skill_ids',
    'companion_payloads'
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
  const packagedSkillSet = new Set([...defaultPackagedCodexSkillIds, ...packagedNotDefaultVisibleCodexSkillIds]);
  for (const agentPackage of professionalAgentPackages) {
    const unpackagedProfileSkills = [...agentPackage.required_skill_ids, ...agentPackage.optional_skill_ids].filter(
      (skill) => !packagedSkillSet.has(skill)
    );
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
  if (
    !defaultPackagedCodexSkillIds.includes('superpowers') ||
    !packagedNotDefaultVisibleCodexSkillIds.includes('opl-meta-agent')
  ) {
    throw new Error('Invalid OPL product profile: superpowers and explicit OMA package policy must be declared');
  }
  if (
    skillPriority.includes('morph-ppt') ||
    defaultPackagedCodexSkillIds.includes('morph-ppt') ||
    packagedNotDefaultVisibleCodexSkillIds.includes('morph-ppt')
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
    schema_version: 1,
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
        permission_mode_selector_visible: false,
        conversation_backend_selector_visible: false,
        conversation_model_selector_visible: true,
        conversation_permission_mode_selector_visible: false,
        codex_home_model_status_label: homeModelStatusLabel,
        codex_home_model_status_label_en: homeModelStatusLabelEn,
        codex_precise_model_display_policy:
          'friendly_model_primary_reasoning_primary_model_and_intelligence_secondary_menus',
        codex_auto_model_selection: {
          strategy: 'codex_cli_auto_latest_available_frontier',
          model_list_source: 'codex_cli_handshake_available_models',
          frontier_model_preference_order_role:
            'exact_visible_model_allowlist_order_and_fallback_with_codex_cli_availability_filter',
          user_can_override_model: true,
          ...(autoModelSelection.user_can_override_reasoning_effort === true
            ? { user_can_override_reasoning_effort: true }
            : {}),
          user_can_restore_auto: true,
          selection_persists_into_conversation: true,
          frontier_model_preference_order: frontierModelPreferenceOrder,
        },
        codex_model_display_options: codexModelDisplayOptions,
        home_purpose_entries: homePurposeEntries,
        home_agent_shortcuts: homeAgentShortcuts,
        retired_codex_models_must_not_be_exposed: retiredCodexModels,
      },
      agent_package_invocation_receipt_policy: agentPackageInvocationReceiptPolicy,
      builtin_assistant_route_receipt_policy: builtinAssistantRouteReceiptPolicy,
      ordinary_capability_selector_policy: ordinaryCapabilitySelectorPolicy,
      professional_agent_packages: professionalAgentPackages,
      default_assistants: defaultHomeAssistants,
      assistant_skill_profiles: assistantSkillProfiles,
      non_default_assistants: nonDefaultAssistants,
    },
    codex: {
      default_model: codexModel,
      default_reasoning_effort: codexReasoningEffort,
      opl_flow_context: oplFlowContext,
      default_visible_skills: defaultVisibleSkills,
      skill_priority: skillPriority,
      session_context_lines: readStringArray(codex, 'session_context_lines', 'codex', { allowBlank: true }),
      ...(sessionContextI18n ? { session_context_i18n: sessionContextI18n } : {}),
    },
    companion_payloads: {
      default_packaged_codex_skill_ids: defaultPackagedCodexSkillIds,
      packaged_not_default_visible_codex_skill_ids: packagedNotDefaultVisibleCodexSkillIds,
    },
    first_run: {
      readiness_layers: ['core'],
      ready_to_launch_gate: {
        id: 'ready_to_launch',
        ui_order: 'before_guid',
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
        primary_user_goal: 'reach_guid_with_codex_ready',
        primary_steps: beginnerPresentationPrimarySteps,
        primary_progress_signal:
          typeof beginnerPresentation.primary_progress_signal === 'string'
            ? beginnerPresentation.primary_progress_signal
            : 'Core completed and total count',
        advanced_progress_disclosure: 'collapsed_or_secondary',
        background_maintenance_presentation: 'collapsed_technical_non_blocking',
        technical_detail_policy: 'hidden_until_expanded_or_error',
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
  if (value.source_contract_ref !== 'contracts/app-settings-control-plane.json') {
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
    source_contract_ref: 'contracts/app-settings-control-plane.json',
    default_route: value.default_route,
    route_identity_policy: readString(value, 'route_identity_policy', 'settings.control_plane'),
    ordinary_visible_tabs: ordinaryVisibleTabs,
    ordinary_routes: ordinaryRoutes,
    secondary_pages: secondaryPages,
    legacy_route_redirects: legacyRouteRedirects,
    extension_anchor_remap: extensionAnchorRemap,
    extension_tab_policy: isRecord(value.extension_tab_policy) ? { ...value.extension_tab_policy } : {},
    slot_registry: slotRegistry,
    state_action_policy: actionContract,
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

export function getOplDefaultCodexModel(): string {
  return OPL_PRODUCT_PROFILE.codex.default_model;
}

export function getOplDefaultCodexReasoningEffort(): OplCodexReasoningEffort | null {
  return OPL_PRODUCT_PROFILE.codex.default_reasoning_effort;
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
  return [...OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.frontier_model_preference_order];
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

export function getOplProfessionalAgentPackages(): OplProfessionalAgentPackage[] {
  return OPL_PRODUCT_PROFILE.gui.professional_agent_packages.map((agentPackage) => ({
    ...agentPackage,
    home_shortcut_ids: [...agentPackage.home_shortcut_ids],
    required_skill_ids: [...agentPackage.required_skill_ids],
    optional_skill_ids: [...agentPackage.optional_skill_ids],
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
    home_shortcut_ids: [...agentPackage.home_shortcut_ids],
    required_skill_ids: [...agentPackage.required_skill_ids],
    optional_skill_ids: [...agentPackage.optional_skill_ids],
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
  return {
    ...policy,
    ...(policy.optional_user_modes
      ? {
          optional_user_modes: {
            intelligence_enhancement: { ...policy.optional_user_modes.intelligence_enhancement },
          },
        }
      : {}),
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
    ...OPL_PRODUCT_PROFILE.companion_payloads.packaged_not_default_visible_codex_skill_ids,
  ];
}

export function getOplSkillPriority(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.skill_priority];
}

export function getOplCodexSessionContext(): string {
  return OPL_PRODUCT_PROFILE.codex.session_context_lines.join('\n').trim();
}

export function getOplCodexSessionContextForLocale(locale: 'zh-CN' | 'en-US'): string {
  const context = OPL_PRODUCT_PROFILE.codex.session_context_i18n?.[locale];
  return (context ?? OPL_PRODUCT_PROFILE.codex.session_context_lines).join('\n').trim();
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

export function getOplGuiSettingsControlPlane(): OplSettingsControlPlane {
  const controlPlane = OPL_PRODUCT_PROFILE.settings.control_plane;
  return {
    ...controlPlane,
    ordinary_visible_tabs: [...controlPlane.ordinary_visible_tabs],
    ordinary_routes: controlPlane.ordinary_routes.map((route) => ({ ...route })),
    secondary_pages: controlPlane.secondary_pages.map((page) => ({ ...page })),
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
  };
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

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import generatedProfile from './oplProductProfile.generated.json';
import type { IConversationMcpStatus, IMcpServer, ISessionMcpServer } from '@/common/config/storage';

export type OplCodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
export const OPL_CODEX_CSS_THEME_ID = 'codex';
export const OPL_CLASSIC_CSS_THEME_ID = 'default-theme';
export const OPL_VISIBLE_CSS_THEME_IDS = [OPL_CODEX_CSS_THEME_ID, OPL_CLASSIC_CSS_THEME_ID] as const;
export type OplVisibleCssThemeId = (typeof OPL_VISIBLE_CSS_THEME_IDS)[number];

export function isOplVisibleCssThemeId(value: unknown): value is OplVisibleCssThemeId {
  return typeof value === 'string' && OPL_VISIBLE_CSS_THEME_IDS.includes(value as OplVisibleCssThemeId);
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

export type OplBuiltinAssistantRouteReceiptPolicy = {
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
  skill_source_ref: 'gui.assistant_skill_profiles.required_skills + optional_skills';
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
  display_policy: 'friendly_model_name_primary_reasoning_configurable_in_model_menu';
  button_label_policy: 'auto_or_fixed_model_compact_label_with_selected_reasoning_effort';
  raw_model_id_visible_in_ordinary_ui: false;
  reasoning_effort_visible_for_every_option: false;
  reasoning_effort_menu_visible: true;
  reasoning_menu_title_zh: string;
  reasoning_menu_title_en: string;
  reasoning_effort_override_surface: 'model_configuration_menu';
  reasoning_effort_options_source: 'acp_codex_config_options_enum';
  default_reasoning_effort: OplCodexReasoningEffort;
  auto_option_current_resolution_visible: true;
  model_menu_policy: 'last_submenu_collapsed_by_default';
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
      codex_precise_model_display_policy: 'friendly_model_primary_reasoning_configurable_in_model_menu';
      codex_auto_model_selection: {
        strategy: 'codex_cli_auto_latest_available_frontier';
        model_list_source?: 'codex_cli_handshake_available_models';
        frontier_model_preference_order_role?: 'fallback_when_codex_cli_model_list_unavailable';
        user_can_override_model: boolean;
        user_can_override_reasoning_effort?: boolean;
        user_can_restore_auto: boolean;
        selection_persists_into_conversation: true;
        frontier_model_preference_order: string[];
      };
      codex_model_display_options: OplCodexModelDisplayOptions;
      home_purpose_entries: OplHomePurposeEntry[];
      retired_codex_models_must_not_be_exposed: string[];
    };
    builtin_assistant_route_receipt_policy: OplBuiltinAssistantRouteReceiptPolicy;
    ordinary_capability_selector_policy: OplOrdinaryCapabilitySelectorPolicy;
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
    developer_profile: OplDeveloperProfileSettings;
  };
  boundary: {
    app_does_not_own: string[];
  };
};

const CODEX_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);
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
  options: { allowBlank?: boolean } = {}
): string[] {
  const value = record[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
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
    entry.prompt_policy !== 'localized Codex CLI read-only diagnosis prompt describing target OPL working mode' ||
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
    value.display_policy !== 'friendly_model_name_primary_reasoning_configurable_in_model_menu' ||
    value.button_label_policy !== 'auto_or_fixed_model_compact_label_with_selected_reasoning_effort' ||
    value.raw_model_id_visible_in_ordinary_ui !== false ||
    value.reasoning_effort_visible_for_every_option !== false ||
    value.reasoning_effort_menu_visible !== true ||
    value.reasoning_menu_title_zh !== '推理' ||
    value.reasoning_menu_title_en !== 'Reasoning' ||
    value.reasoning_effort_override_surface !== 'model_configuration_menu' ||
    value.reasoning_effort_options_source !== 'acp_codex_config_options_enum' ||
    value.auto_option_current_resolution_visible !== true ||
    value.model_menu_policy !== 'last_submenu_collapsed_by_default' ||
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
  const highReasoningLabel = isRecord(reasoningLabels?.high) ? reasoningLabels.high : null;
  if (
    highReasoningLabel?.zh !== '推理高' ||
    highReasoningLabel.en !== 'High reasoning' ||
    xhighReasoningLabel?.zh !== '推理超高' ||
    xhighReasoningLabel.en !== 'Ultra reasoning'
  ) {
    throw new Error('Invalid OPL product profile: Codex model display options must label high and xhigh reasoning');
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
    'gpt-5.3-codex',
    'gpt-5.2',
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
    display_policy: 'friendly_model_name_primary_reasoning_configurable_in_model_menu',
    button_label_policy: 'auto_or_fixed_model_compact_label_with_selected_reasoning_effort',
    raw_model_id_visible_in_ordinary_ui: false,
    reasoning_effort_visible_for_every_option: false,
    reasoning_effort_menu_visible: true,
    reasoning_menu_title_zh: '推理',
    reasoning_menu_title_en: 'Reasoning',
    reasoning_effort_override_surface: 'model_configuration_menu',
    reasoning_effort_options_source: 'acp_codex_config_options_enum',
    default_reasoning_effort: displayDefaultReasoningEffort,
    auto_option_current_resolution_visible: true,
    model_menu_policy: 'last_submenu_collapsed_by_default',
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
      xhigh: { zh: '推理超高', en: 'Ultra reasoning' },
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
  if (entries.map((entry) => entry.target_assistant_id).join(',') !== ['mas', 'mag', 'rca', 'bookforge'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must target MAS, MAG, RCA, and BookForge');
  }
  return entries;
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
  for (const required of ['mas', 'mag', 'rca', 'bookforge']) {
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

  if (profiles.map((profile) => profile.assistant_id).join(',') !== ['mas', 'mag', 'rca', 'bookforge'].join(',')) {
    throw new Error('Invalid OPL product profile: assistant skill profiles must be MAS, MAG, RCA, and BookForge');
  }
  for (const profile of profiles) {
    const requiredSkillsByAssistant: Record<string, string[]> = {
      mas: ['mas'],
      mag: ['mag'],
      rca: ['rca'],
      bookforge: ['opl-bookforge'],
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
    requiredForAssistants.join(',') !== ['mas', 'mag', 'rca', 'bookforge'].join(',') ||
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
    value.skill_source_ref !== 'gui.assistant_skill_profiles.required_skills + optional_skills' ||
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
    skill_source_ref: 'gui.assistant_skill_profiles.required_skills + optional_skills',
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
  return {
    flow_id: 'opl-flow',
    source,
    delivery: 'session_scoped_preset_context',
    user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
    language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
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
  const expectedTabs = ['general', 'access', 'capabilities', 'environment', 'storage', 'appearance', 'advanced'];
  if (visibleSettingsTabs.join(',') !== expectedTabs.join(',')) {
    throw new Error('Invalid OPL product profile: GUI settings tabs must match OPL App');
  }
  const settingsIa = isRecord(settings.settings_information_architecture)
    ? settings.settings_information_architecture
    : null;
  const secondaryPageIds = settingsIa
    ? readStringArray(settingsIa, 'secondary_page_ids', 'settings.settings_information_architecture')
    : [];
  if (secondaryPageIds.join(',') !== 'about,update,theme') {
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
    webui: 'access',
    pet: 'appearance',
  };
  if (JSON.stringify(legacySettingsRouteRedirects) !== JSON.stringify(expectedLegacySettingsRouteRedirects)) {
    throw new Error('Invalid OPL product profile: GUI legacy settings redirects must match OPL App');
  }
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
    guiHome.codex_precise_model_display_policy !== 'friendly_model_primary_reasoning_configurable_in_model_menu'
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
  if (homeModelStatusLabel !== 'GPT-5.5' || homeModelStatusLabelEn !== 'GPT-5.5') {
    throw new Error(
      'Invalid OPL product profile: GUI home Codex model status label must be GPT-5.5 without repeated reasoning'
    );
  }
  const autoModelSelection = guiHome.codex_auto_model_selection;
  if (
    !isRecord(autoModelSelection) ||
    autoModelSelection.strategy !== 'codex_cli_auto_latest_available_frontier' ||
    autoModelSelection.model_list_source !== 'codex_cli_handshake_available_models' ||
    autoModelSelection.frontier_model_preference_order_role !== 'fallback_when_codex_cli_model_list_unavailable' ||
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
  const homePurposeEntries = readHomePurposeEntries(guiHome);
  const retiredCodexModels = readStringArray(guiHome, 'retired_codex_models_must_not_be_exposed', 'gui.home');
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
  const defaultPackagedSkillSet = new Set(defaultPackagedCodexSkillIds);
  for (const profile of assistantSkillProfiles) {
    const unpackagedProfileSkills = [...profile.required_skills, ...profile.optional_skills].filter(
      (skill) => !defaultPackagedSkillSet.has(skill)
    );
    if (unpackagedProfileSkills.length > 0) {
      throw new Error(
        `Invalid OPL product profile: assistant ${profile.assistant_id} references unpackaged skills: ${unpackagedProfileSkills.join(', ')}`
      );
    }
    if (profile.optional_skills.includes('morph-ppt')) {
      throw new Error(
        `Invalid OPL product profile: assistant ${profile.assistant_id} must not expose retired morph-ppt`
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
        codex_precise_model_display_policy: 'friendly_model_primary_reasoning_configurable_in_model_menu',
        codex_auto_model_selection: {
          strategy: 'codex_cli_auto_latest_available_frontier',
          model_list_source: 'codex_cli_handshake_available_models',
          frontier_model_preference_order_role: 'fallback_when_codex_cli_model_list_unavailable',
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
        retired_codex_models_must_not_be_exposed: retiredCodexModels,
      },
      builtin_assistant_route_receipt_policy: builtinAssistantRouteReceiptPolicy,
      ordinary_capability_selector_policy: ordinaryCapabilitySelectorPolicy,
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
      developer_profile: developerProfile,
    },
    boundary: {
      app_does_not_own: appDoesNotOwn,
    },
  };
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

export function getOplAssistantSkillProfiles(): OplAssistantSkillProfile[] {
  return OPL_PRODUCT_PROFILE.gui.assistant_skill_profiles.map((profile) => ({
    ...profile,
    required_skills: [...profile.required_skills],
    optional_skills: [...profile.optional_skills],
  }));
}

export function getOplAssistantSkillProfile(assistantId: string): OplAssistantSkillProfile | undefined {
  const normalizedId = assistantId
    .replace(/^builtin-/, '')
    .trim()
    .toLowerCase();
  const profile = OPL_PRODUCT_PROFILE.gui.assistant_skill_profiles.find((entry) => entry.assistant_id === normalizedId);
  if (!profile) return undefined;
  return {
    ...profile,
    required_skills: [...profile.required_skills],
    optional_skills: [...profile.optional_skills],
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
  const skills = OPL_PRODUCT_PROFILE.gui.assistant_skill_profiles.flatMap((profile) => [
    ...profile.required_skills,
    ...profile.optional_skills,
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
  return { ...OPL_PRODUCT_PROFILE.codex.opl_flow_context };
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

export function getOplGuiSettingsVisibleTabs(): string[] {
  return [...OPL_PRODUCT_PROFILE.settings.visible_tabs];
}

export function getOplGuiSettingsSecondaryPageIds(): string[] {
  return [...OPL_PRODUCT_PROFILE.settings.secondary_page_ids];
}

export function getOplGuiLegacySettingsRouteRedirects(): Record<string, string> {
  return { ...OPL_PRODUCT_PROFILE.settings.legacy_route_redirects };
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

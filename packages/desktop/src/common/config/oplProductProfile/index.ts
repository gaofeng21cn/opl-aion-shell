/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import generatedProfile from './oplProductProfile.generated.json';

export type OplCodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
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

type AppProductProfile = {
  schema_version: 1;
  owner: 'one-person-lab-app';
  purpose: 'app_owned_product_profile';
  state: string;
  app_repo: 'gaofeng21cn/one-person-lab-app';
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
      codex_model_selector_visible: false;
      codex_model_list_visible: false;
      codex_model_policy: 'codex_cli_auto_model_hidden_on_home';
      codex_model_auto_option_visible: false;
      codex_default_model: string;
      codex_default_reasoning_effort: OplCodexReasoningEffort | null;
      codex_default_permission_mode: 'full-access';
      permission_mode_selector_visible: false;
      conversation_backend_selector_visible: false;
      conversation_model_selector_visible: false;
      conversation_permission_mode_selector_visible: false;
      codex_home_model_status_label: string;
      codex_home_model_status_label_en: string;
      codex_precise_model_display_policy: 'technical_details_or_connected_state_only';
      codex_auto_model_selection: {
        strategy: 'codex_cli_auto_latest_available_frontier';
        user_can_override_model: false;
        user_can_restore_auto: false;
        selection_persists_into_conversation: true;
        frontier_model_preference_order: string[];
      };
      home_purpose_entries: OplHomePurposeEntry[];
      retired_codex_models_must_not_be_exposed: string[];
    };
    builtin_assistant_route_receipt_policy: OplBuiltinAssistantRouteReceiptPolicy;
    default_assistants: OplHomeAssistant[];
    assistant_skill_profiles: OplAssistantSkillProfile[];
    non_default_assistants: OplNonDefaultAssistant[];
  };
  codex: {
    default_model: string;
    default_reasoning_effort: OplCodexReasoningEffort | null;
    default_visible_skills: string[];
    skill_priority: string[];
    session_context_lines: string[];
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
  };
  settings: {
    visible_tabs: string[];
    environment_items: string[];
    legacy_route_redirects: Record<string, string>;
    developer_mode: {
      hide_machine_status: boolean;
      state_keys: Record<string, string>;
    };
  };
  boundary: {
    app_does_not_own: string[];
  };
};

const CODEX_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);

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

function readReasoningEffort(value: unknown, context: string): OplCodexReasoningEffort | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !CODEX_REASONING_EFFORTS.has(value)) {
    throw new Error(`Invalid OPL product profile: ${context} is unsupported`);
  }
  return value as OplCodexReasoningEffort;
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

  if (entries.map((entry) => entry.id).join(',') !== ['research', 'grant', 'ppt'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must be research, grant, and ppt');
  }
  if (entries.map((entry) => entry.primary_label).join(',') !== ['科研', '基金', 'PPT'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must expose App-owned labels');
  }
  if (entries.map((entry) => entry.target_assistant_id).join(',') !== ['mas', 'mag', 'rca'].join(',')) {
    throw new Error('Invalid OPL product profile: purpose entries must target MAS, MAG, and RCA');
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
  for (const required of ['mas', 'mag', 'rca']) {
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
  if (purposeLabels.join(',') !== ['科研', '基金', 'PPT'].join(',')) {
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

  if (profiles.map((profile) => profile.assistant_id).join(',') !== ['mas', 'mag', 'rca'].join(',')) {
    throw new Error('Invalid OPL product profile: assistant skill profiles must be MAS, MAG, and RCA');
  }
  for (const profile of profiles) {
    if (profile.required_skills.join(',') !== profile.assistant_id) {
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
    requiredForAssistants.join(',') !== ['mas', 'mag', 'rca'].join(',') ||
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

  const defaultSession = value.default_session_profile;
  const gui = value.gui;
  const codex = value.codex;
  const firstRun = value.first_run;
  const companionPayloads = value.companion_payloads;
  const commandLineTools = isRecord(firstRun) ? firstRun.command_line_tools : null;
  const settings = value.settings;
  const developerMode = isRecord(settings) ? settings.developer_mode : null;
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
  if (!isRecord(settings) || !isRecord(developerMode) || !isRecord(boundary)) {
    throw new Error('Invalid OPL product profile: missing settings or boundary section');
  }
  const visibleSettingsTabs = readStringArray(settings, 'visible_tabs', 'settings');
  const expectedTabs = ['overview', 'runtime', 'capabilities', 'access', 'appearance', 'system', 'about'];
  if (visibleSettingsTabs.join(',') !== expectedTabs.join(',')) {
    throw new Error('Invalid OPL product profile: GUI settings tabs must match OPL App');
  }
  const environmentItems = readStringArray(settings, 'environment_items', 'settings');
  const legacySettingsRouteRedirects = readStringRecord(
    settings.legacy_route_redirects,
    'settings.legacy_route_redirects'
  );
  const expectedLegacySettingsRouteRedirects: Record<string, string> = {
    model: 'runtime',
    agent: 'runtime',
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
    guiHome.codex_model_selector_visible !== false ||
    guiHome.codex_model_list_visible !== false ||
    guiHome.codex_model_policy !== 'codex_cli_auto_model_hidden_on_home' ||
    guiHome.codex_model_auto_option_visible !== false ||
    guiHome.permission_mode_selector_visible !== false ||
    guiHome.conversation_backend_selector_visible !== false ||
    guiHome.conversation_model_selector_visible !== false ||
    guiHome.conversation_permission_mode_selector_visible !== false ||
    guiHome.codex_precise_model_display_policy !== 'technical_details_or_connected_state_only'
  ) {
    throw new Error('Invalid OPL product profile: GUI home contract must hide executor and model selection');
  }
  if (
    guiHome.codex_default_model !== 'codex_cli_auto' ||
    guiHome.codex_default_reasoning_effort !== codexReasoningEffort ||
    guiHome.codex_default_permission_mode !== 'full-access'
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex defaults must use Codex CLI auto selection');
  }
  const homeModelStatusLabel =
    typeof guiHome.codex_home_model_status_label === 'string' ? guiHome.codex_home_model_status_label.trim() : '';
  const homeModelStatusLabelEn =
    typeof guiHome.codex_home_model_status_label_en === 'string' ? guiHome.codex_home_model_status_label_en.trim() : '';
  if (homeModelStatusLabel !== '自动' || homeModelStatusLabelEn !== 'Auto') {
    throw new Error('Invalid OPL product profile: GUI home Codex model status label must be automatic');
  }
  const autoModelSelection = guiHome.codex_auto_model_selection;
  if (
    !isRecord(autoModelSelection) ||
    autoModelSelection.strategy !== 'codex_cli_auto_latest_available_frontier' ||
    autoModelSelection.user_can_override_model !== false ||
    autoModelSelection.user_can_restore_auto !== false ||
    autoModelSelection.selection_persists_into_conversation !== true
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex model policy must stay automatic');
  }
  readStringArray(autoModelSelection, 'frontier_model_preference_order', 'gui.home.codex_auto_model_selection');
  const homePurposeEntries = readHomePurposeEntries(guiHome);
  const retiredCodexModels = readStringArray(guiHome, 'retired_codex_models_must_not_be_exposed', 'gui.home');
  const builtinAssistantRouteReceiptPolicy = readBuiltinAssistantRouteReceiptPolicy(gui);
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
        codex_model_selector_visible: false,
        codex_model_list_visible: false,
        codex_model_policy: 'codex_cli_auto_model_hidden_on_home',
        codex_model_auto_option_visible: false,
        codex_default_model: 'codex_cli_auto',
        codex_default_reasoning_effort: codexReasoningEffort,
        codex_default_permission_mode: 'full-access',
        permission_mode_selector_visible: false,
        conversation_backend_selector_visible: false,
        conversation_model_selector_visible: false,
        conversation_permission_mode_selector_visible: false,
        codex_home_model_status_label: homeModelStatusLabel,
        codex_home_model_status_label_en: homeModelStatusLabelEn,
        codex_precise_model_display_policy: 'technical_details_or_connected_state_only',
        codex_auto_model_selection: {
          strategy: 'codex_cli_auto_latest_available_frontier',
          user_can_override_model: false,
          user_can_restore_auto: false,
          selection_persists_into_conversation: true,
          frontier_model_preference_order: readStringArray(
            autoModelSelection,
            'frontier_model_preference_order',
            'gui.home.codex_auto_model_selection'
          ),
        },
        home_purpose_entries: homePurposeEntries,
        retired_codex_models_must_not_be_exposed: retiredCodexModels,
      },
      builtin_assistant_route_receipt_policy: builtinAssistantRouteReceiptPolicy,
      default_assistants: defaultHomeAssistants,
      assistant_skill_profiles: assistantSkillProfiles,
      non_default_assistants: nonDefaultAssistants,
    },
    codex: {
      default_model: codexModel,
      default_reasoning_effort: codexReasoningEffort,
      default_visible_skills: defaultVisibleSkills,
      skill_priority: skillPriority,
      session_context_lines: readStringArray(codex, 'session_context_lines', 'codex', { allowBlank: true }),
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
    },
    settings: {
      visible_tabs: visibleSettingsTabs,
      environment_items: environmentItems,
      legacy_route_redirects: legacySettingsRouteRedirects,
      developer_mode: {
        hide_machine_status: developerMode.hide_machine_status === true,
        state_keys: readStringRecord(developerMode.state_keys, 'settings.developer_mode.state_keys'),
      },
    },
    boundary: {
      app_does_not_own: appDoesNotOwn,
    },
  };
}

export const OPL_PRODUCT_PROFILE = validateOplProductProfile(generatedProfile);

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

export function getOplDefaultCodexSkills(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.default_visible_skills];
}

export function getOplDefaultPackagedCodexSkills(): string[] {
  return [...OPL_PRODUCT_PROFILE.companion_payloads.default_packaged_codex_skill_ids];
}

export function getOplSkillPriority(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.skill_priority];
}

export function getOplCodexSessionContext(): string {
  return OPL_PRODUCT_PROFILE.codex.session_context_lines.join('\n').trim();
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

export function getOplGuiLegacySettingsRouteRedirects(): Record<string, string> {
  return { ...OPL_PRODUCT_PROFILE.settings.legacy_route_redirects };
}

export function getOplRuntimeEnvironmentItems(): string[] {
  return [...OPL_PRODUCT_PROFILE.settings.environment_items];
}

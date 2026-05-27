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
  role: string;
  home_entry_policy: 'visible_click_to_start';
  avatar: string;
  description_i18n: Record<string, string>;
  prompts_i18n: Record<string, string[]>;
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
      default_css_theme_id: 'codex';
      default_css_theme_name: string;
      codex_theme_default_enabled: true;
    };
    home: {
      primary_input_surface: 'single_card';
      nested_input_card_frames_allowed: false;
      codex_model_selector_visible: false;
      codex_model_list_visible: false;
      codex_model_policy: 'auto_latest_frontier_from_codex_capabilities_or_app_default';
      codex_default_model: string;
      codex_default_reasoning_effort: OplCodexReasoningEffort | null;
      codex_default_permission_mode: 'full-access';
      retired_codex_models_must_not_be_exposed: string[];
    };
    default_assistants: OplHomeAssistant[];
  };
  codex: {
    default_model: string;
    default_reasoning_effort: OplCodexReasoningEffort | null;
    default_visible_skills: string[];
    skill_priority: string[];
    session_context_lines: string[];
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
    legacy_route_redirects?: Record<string, string>;
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
    const role = typeof entry.role === 'string' ? entry.role.trim() : '';
    const avatar = typeof entry.avatar === 'string' ? entry.avatar.trim() : '';
    if (!id || !displayName || !shortName || !role || !avatar) {
      throw new Error(`Invalid OPL product profile: gui.default_assistants[${index}] has blank identity fields`);
    }
    if (entry.home_entry_policy !== 'visible_click_to_start') {
      throw new Error(`Invalid OPL product profile: default assistant ${id} must be visible click-to-start`);
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
      role,
      home_entry_policy: 'visible_click_to_start',
      avatar,
      description_i18n: descriptionI18n,
      prompts_i18n: promptsI18n,
    };
  });

  const ids = assistants.map((assistant) => assistant.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must not contain duplicate ids');
  }
  for (const required of ['mas', 'mag', 'rca', 'oma']) {
    if (!ids.includes(required)) {
      throw new Error(`Invalid OPL product profile: gui.default_assistants must include ${required}`);
    }
  }
  if (ids.includes('mds')) {
    throw new Error('Invalid OPL product profile: gui.default_assistants must not include mds');
  }
  return assistants;
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
  const commandLineTools = isRecord(firstRun) ? firstRun.command_line_tools : null;
  const settings = value.settings;
  const developerMode = isRecord(settings) ? settings.developer_mode : null;
  const boundary = value.boundary;
  if (
    !isRecord(defaultSession) ||
    !isRecord(gui) ||
    !isRecord(codex) ||
    !isRecord(firstRun) ||
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
  const legacySettingsRouteRedirects = isRecord(settings.legacy_route_redirects)
    ? readStringRecord(settings.legacy_route_redirects, 'settings.legacy_route_redirects')
    : {
        model: 'runtime',
        agent: 'runtime',
        assistants: 'capabilities',
        'skills-hub': 'capabilities',
        tools: 'capabilities',
        display: 'appearance',
        webui: 'access',
        pet: 'appearance',
      };
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
  if (guiAppearance.default_css_theme_id !== 'codex' || guiAppearance.codex_theme_default_enabled !== true) {
    throw new Error('Invalid OPL product profile: GUI appearance must default to the Codex theme');
  }
  if (
    guiHome.primary_input_surface !== 'single_card' ||
    guiHome.nested_input_card_frames_allowed !== false ||
    guiHome.codex_model_selector_visible !== false ||
    guiHome.codex_model_list_visible !== false ||
    guiHome.codex_model_policy !== 'auto_latest_frontier_from_codex_capabilities_or_app_default'
  ) {
    throw new Error('Invalid OPL product profile: GUI home contract must hide Codex model selection');
  }
  if (
    guiHome.codex_default_model !== codexModel ||
    guiHome.codex_default_reasoning_effort !== codexReasoningEffort ||
    guiHome.codex_default_permission_mode !== 'full-access'
  ) {
    throw new Error('Invalid OPL product profile: GUI home Codex defaults must match App Codex defaults');
  }
  const retiredCodexModels = readStringArray(guiHome, 'retired_codex_models_must_not_be_exposed', 'gui.home');
  const defaultHomeAssistants = readDefaultHomeAssistants(gui);

  const defaultVisibleSkills = readStringArray(codex, 'default_visible_skills', 'codex');
  const skillPriority = readStringArray(codex, 'skill_priority', 'codex');
  const missingPrioritySkills = defaultVisibleSkills.filter((skill) => !skillPriority.includes(skill));
  if (missingPrioritySkills.length > 0 || !skillPriority.includes('morph-ppt')) {
    throw new Error('Invalid OPL product profile: skill_priority must include default skills and morph-ppt');
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
        default_css_theme_id: 'codex',
        default_css_theme_name:
          typeof guiAppearance.default_css_theme_name === 'string' ? guiAppearance.default_css_theme_name : 'Codex',
        codex_theme_default_enabled: true,
      },
      home: {
        primary_input_surface: 'single_card',
        nested_input_card_frames_allowed: false,
        codex_model_selector_visible: false,
        codex_model_list_visible: false,
        codex_model_policy: 'auto_latest_frontier_from_codex_capabilities_or_app_default',
        codex_default_model: codexModel,
        codex_default_reasoning_effort: codexReasoningEffort,
        codex_default_permission_mode: 'full-access',
        retired_codex_models_must_not_be_exposed: retiredCodexModels,
      },
      default_assistants: defaultHomeAssistants,
    },
    codex: {
      default_model: codexModel,
      default_reasoning_effort: codexReasoningEffort,
      default_visible_skills: defaultVisibleSkills,
      skill_priority: skillPriority,
      session_context_lines: readStringArray(codex, 'session_context_lines', 'codex', { allowBlank: true }),
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

export function getOplDefaultHomeAssistants(): OplHomeAssistant[] {
  return OPL_PRODUCT_PROFILE.gui.default_assistants.map((assistant) => ({
    ...assistant,
    description_i18n: { ...assistant.description_i18n },
    prompts_i18n: Object.fromEntries(
      Object.entries(assistant.prompts_i18n).map(([locale, prompts]) => [locale, [...prompts]])
    ),
  }));
}

export function getOplDefaultCodexSkills(): string[] {
  return [...OPL_PRODUCT_PROFILE.codex.default_visible_skills];
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import generatedProfile from '@/common/config/oplProductProfile/oplProductProfile.generated.json';
import {
  getOplCodexSessionContext,
  getOplCommandLineToolsInstallMessage,
  getOplCodexDefaultPermissionMode,
  getOplCodexModelDisplayOptions,
  getOplFlowContextPolicy,
  getOplAgentPackageInvocationReceiptPolicy,
  getOplProductDisplayName,
  getOplAssistantSkillProfile,
  getOplAssistantSkillProfiles,
  getOplBuiltinAssistantRouteReceiptPolicy,
  getOplDefaultHomeAssistants,
  getOplDefaultExecutorAgentKey,
  getOplHomeAgentShortcuts,
  getOplProfessionalAgentPackages,
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  getOplCodexAutoModelPolicy,
  getOplDefaultCodexSkills,
  getOplDeferredFirstLaunchBlockers,
  getOplGuiDefaultCssThemeId,
  getOplGuiSettingsControlPlane,
  getOplGuiLegacySettingsRouteRedirects,
  getOplGuiSettingsSecondaryPageIds,
  getOplGuiSettingsVisibleTabs,
  getOplSettingsControlPlaneActionContract,
  getOplHomeModelStatusLabel,
  getOplModelStatusDisplayText,
  getOplRuntimeEnvironmentItems,
  getOplOrdinaryForbiddenCapabilityPolicy,
  getOplReadyToLaunchCoreItems,
  getOplReadyToLaunchNonBlockingItems,
  getOplRetiredCodexModels,
  getOplSkillPriority,
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
      'friendly_model_primary_reasoning_primary_model_and_intelligence_secondary_menus'
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
      display_policy: 'friendly_model_name_primary_reasoning_primary_model_and_intelligence_secondary_menus',
      button_label_policy: 'resolved_model_compact_label_with_selected_reasoning_effort_no_auto_prefix',
      raw_model_id_visible_in_ordinary_ui: false,
      reasoning_effort_visible_for_every_option: false,
      reasoning_effort_menu_visible: true,
      reasoning_menu_title_zh: '推理',
      reasoning_menu_title_en: 'Reasoning',
      reasoning_effort_override_surface: 'model_selector_primary_menu',
      reasoning_effort_options_source: 'acp_codex_config_options_enum',
      auto_option_current_resolution_visible: true,
      model_menu_policy: 'current_model_secondary_submenu',
      intelligence_enhancement_menu_policy: 'default_off_secondary_submenu_with_enable_disable_actions',
      intelligence_enhancement_default_enabled: false,
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

  it('exposes App-owned settings navigation and runtime environment profile slices', () => {
    expect(getOplGuiSettingsVisibleTabs()).toEqual([
      'general',
      'access',
      'workspace',
      'capabilities',
      'resources',
      'environment',
      'storage',
      'appearance',
    ]);
    expect(getOplGuiSettingsSecondaryPageIds()).toEqual(['advanced', 'about']);
    expect(getOplGuiLegacySettingsRouteRedirects()).toEqual({
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
    });
    const controlPlane = getOplGuiSettingsControlPlane();
    expect(controlPlane.source_contract_ref).toBe('contracts/app-gui-product-contract.json#settings_navigation');
    expect(controlPlane.default_route).toBe('/settings/general');
    expect(controlPlane.ordinary_routes.map((route) => route.id)).toEqual(getOplGuiSettingsVisibleTabs());
    expect(controlPlane.secondary_pages.map((page) => page.id)).toEqual(getOplGuiSettingsSecondaryPageIds());
    expect(controlPlane.compatibility_redirects).toMatchObject({
      update: { target_route_id: 'environment', anchor: 'updates' },
      theme: { target_route_id: 'appearance', anchor: 'themes' },
      'local-services': { target_route_id: 'environment', anchor: 'services' },
    });
    expect(controlPlane.extension_anchor_remap['skills-hub']).toBe('capabilities');
    expect(controlPlane.ordinary_routes.find((route) => route.id === 'workspace')).toMatchObject({
      path: '/settings/workspace',
      label_key: 'settings.workspace',
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
  });

  it('scrubs AionUI Team MCP state from ordinary OPL conversation snapshots', () => {
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
      mcp_servers: [],
      mcp_statuses: [],
      session_mcp_servers: [],
    });
    expect(extra).not.toHaveProperty('team_mcp_stdio_config');
    expect(extra).not.toHaveProperty('team_id');
    expect(extra).not.toHaveProperty('teamId');
    expect(extra).not.toHaveProperty('team_lead_team_id');
    expect(extra).not.toHaveProperty('team_lead_team_slot_id');
    expect(extra).not.toHaveProperty('team_lead_conversation_id');
    expect(extra).not.toHaveProperty('tl');
  });

  it('exposes App-owned default home assistants without AionUI legacy entries', () => {
    const assistants = getOplDefaultHomeAssistants();

    expect(assistants.map((assistant) => assistant.id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
    ]);
    expect(assistants.map((assistant) => assistant.display_name)).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
      'OPL Book Forge',
    ]);
    expect(assistants.map((assistant) => assistant.short_name)).toEqual(['MAS', 'MAG', 'RCA', 'OBF']);
    expect(assistants.map((assistant) => assistant.home_purpose_label)).toEqual(['科研', '基金', '演示', '写书']);
    expect(OPL_PRODUCT_PROFILE.gui.home.home_purpose_entries.map((entry) => entry.id)).toEqual([
      'research',
      'grant',
      'ppt',
      'book',
    ]);
    expect(OPL_PRODUCT_PROFILE.gui.home.home_purpose_entries.map((entry) => entry.target_assistant_id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
    ]);
    expect(
      OPL_PRODUCT_PROFILE.gui.home.home_purpose_entries.every((entry) => entry.display_policy === 'purpose_first')
    ).toBe(true);
    expect(getOplHomeAgentShortcuts().map((shortcut) => shortcut.shortcut_id)).toEqual([
      'research',
      'grant',
      'ppt',
      'book',
      'oma',
    ]);
    expect(getOplHomeAgentShortcuts().map((shortcut) => shortcut.package_id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
      'opl-meta-agent',
    ]);
    expect(getOplHomeAgentShortcuts().every((shortcut) => shortcut.user_configurable)).toBe(true);
    expect(getOplHomeAgentShortcuts().find((shortcut) => shortcut.shortcut_id === 'oma')?.default_visible).toBe(false);
    expect(getOplProfessionalAgentPackages().map((agentPackage) => agentPackage.package_id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
      'opl-meta-agent',
    ]);
    expect(
      Object.fromEntries(
        getOplProfessionalAgentPackages().map((agentPackage) => [
          agentPackage.package_id,
          agentPackage.codex_visible_entry,
        ])
      )
    ).toMatchObject({
      'med-autoscience': 'med-autoscience',
      'med-autogrant': 'med-autogrant',
      'redcube-ai': 'redcube-ai',
      'opl-bookforge': 'opl-bookforge',
      'opl-meta-agent': 'opl-meta-agent',
    });
    expect(assistants.every((assistant) => assistant.home_entry_display_policy === 'purpose_first')).toBe(true);
    expect(assistants.every((assistant) => assistant.home_entry_policy === 'purpose_entry_target')).toBe(true);
    expect(assistants.map((assistant) => assistant.id)).not.toEqual(expect.arrayContaining(['mds', 'cowork']));
    expect(assistants.map((assistant) => assistant.id)).not.toContain('opl-meta-agent');
    expect(OPL_PRODUCT_PROFILE.gui.non_default_assistants.map((assistant) => assistant.id)).toEqual(['opl-meta-agent']);
    expect(OPL_PRODUCT_PROFILE.gui.non_default_assistants[0]?.home_default_visible).toBe(false);
    expect(OPL_PRODUCT_PROFILE.gui.non_default_assistants[0]?.home_entry_policy).toBe('explicit_or_settings_only');

    assistants.push({ ...assistants[0], id: 'caller-local-assistant' });
    expect(getOplDefaultHomeAssistants().map((assistant) => assistant.id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
    ]);
  });

  it('exposes assistant-scoped home skill profiles from the App contract', () => {
    const profiles = getOplAssistantSkillProfiles();

    expect(profiles.map((profile) => profile.assistant_id)).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
    ]);
    expect(Object.fromEntries(profiles.map((profile) => [profile.assistant_id, profile.required_skills]))).toEqual({
      'med-autoscience': ['med-autoscience'],
      'med-autogrant': ['med-autogrant'],
      'redcube-ai': ['redcube-ai'],
      'opl-bookforge': ['opl-bookforge'],
    });
    expect(getOplAssistantSkillProfile('med-autogrant')?.required_skills).toEqual(['med-autogrant']);
    expect(getOplAssistantSkillProfile('mag')?.required_skills).toEqual(['med-autogrant']);
    expect(getOplAssistantSkillProfile('obf')?.required_skills).toEqual(['opl-bookforge']);
    expect(getOplAssistantSkillProfile('redcube-ai')?.optional_skills).toEqual(['officecli-pptx', 'ui-ux-pro-max']);
    expect(profiles.every((profile) => !profile.optional_skills.includes('morph-ppt'))).toBe(true);
    expect(profiles.every((profile) => profile.required_skill_policy === 'checked_locked')).toBe(true);
    expect(
      profiles.every((profile) => profile.skill_menu_policy === 'assistant_scoped_required_checked_optional_visible')
    ).toBe(true);
    const availableSkillIds = new Set([
      ...OPL_PRODUCT_PROFILE.companion_payloads.default_packaged_codex_skill_ids,
      ...OPL_PRODUCT_PROFILE.companion_payloads.packaged_not_default_visible_codex_skill_ids,
      ...OPL_PRODUCT_PROFILE.companion_payloads.official_codex_runtime_capabilities.preferred_capability_ids,
    ]);
    expect(
      profiles.every((profile) =>
        [...profile.required_skills, ...profile.optional_skills].every((skill) => availableSkillIds.has(skill))
      )
    ).toBe(true);
    expect(profiles.every((profile) => !('hidden_home_skill_names' in profile))).toBe(true);

    profiles[0].required_skills.push('caller-local-skill');
    expect(getOplAssistantSkillProfile('med-autoscience')?.required_skills).toEqual(['med-autoscience']);
  });

  it('exposes the built-in assistant route receipt policy', () => {
    const packagePolicy = getOplAgentPackageInvocationReceiptPolicy();
    expect(packagePolicy.required_for_package_shortcuts).toEqual(['research', 'grant', 'ppt', 'book', 'oma']);
    expect(packagePolicy.route_kind).toBe('agent_package_shortcut');
    expect(packagePolicy.executor).toBe('codex_cli');
    expect(packagePolicy.source).toBe('opl_app_home');
    expect(packagePolicy.required_fields).toEqual([
      'route_kind',
      'executor',
      'package_id',
      'shortcut_id',
      'codex_visible_entry',
      'required_skill_ids',
      'source',
    ]);
    expect(packagePolicy.receipt_authority).toBe('launch_fact_only_no_session_behavior_domain_workflow_or_readiness');
    expect(packagePolicy.must_not_govern).toEqual(['session_behavior', 'domain_workflow', 'domain_readiness']);

    const policy = getOplBuiltinAssistantRouteReceiptPolicy();

    expect(policy.migration_alias_for).toBe('agent_package_invocation_receipt_policy');
    expect(policy.required_for_assistants).toEqual(['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge']);
    expect(policy.route_kind).toBe('builtin_capability');
    expect(policy.executor).toBe('codex_cli');
    expect(policy.source).toBe('opl_app_home');
    expect(policy.required_fields).toEqual([
      'route_kind',
      'executor',
      'assistant_id',
      'assistant_short_name',
      'source',
    ]);

    policy.required_for_assistants.push('caller-local-assistant');
    expect(getOplBuiltinAssistantRouteReceiptPolicy().required_for_assistants).toEqual([
      'med-autoscience',
      'med-autogrant',
      'redcube-ai',
      'opl-bookforge',
    ]);
  });

  it('exposes App-managed OPL Flow context policy without allowing caller mutation', () => {
    const policy = getOplFlowContextPolicy();

    expect(policy).toEqual({
      flow_id: 'opl-flow',
      source: 'one-person-lab-app',
      delivery: 'session_scoped_preset_context',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
      language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
      optional_user_modes: {
        intelligence_enhancement: {
          id: 'intelligence_enhancement',
          settings_key: 'codex.oplFlowIntelligenceEnhancementMode',
          label_key: 'settings.oplFlowIntelligenceEnhancementMode',
          description_key: 'settings.oplFlowIntelligenceEnhancementModeDesc',
          provider: 'codexcont',
          local_proxy_base_url: 'http://127.0.0.1:8787/v1',
          upstream_policy: 'preserve_current_codex_provider_via_local_responses_proxy',
          behavior_policy: 'local_proxy_reasoning_continuation_no_prompt_injection_no_quick_action',
          service_policy:
            'opl_flow_managed_persistent_service_macos_launch_agent_linux_systemd_user_docker_startup_repair',
          default_enabled: false,
          status_action_id: 'intelligence_enhancement_status',
          enable_action_id: 'intelligence_enhancement_enable',
          disable_action_id: 'intelligence_enhancement_disable',
          repair_action_id: 'intelligence_enhancement_repair',
          uninstall_action_id: 'intelligence_enhancement_uninstall',
        },
      },
    });

    policy.source = 'caller-local-source';
    expect(getOplFlowContextPolicy().source).toBe('one-person-lab-app');
    (policy.optional_user_modes!.intelligence_enhancement as { provider: string }).provider = 'caller-local-provider';
    expect(getOplFlowContextPolicy().optional_user_modes?.intelligence_enhancement.provider).toBe('codexcont');
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

  it('exposes default visible skills without allowing caller mutation', () => {
    const skills = getOplDefaultCodexSkills();

    skills.push('caller-local-skill');

    expect(getOplDefaultCodexSkills()).toEqual(['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge']);
  });

  it('keeps display priority aligned with default skills without retired morph-ppt wiring', () => {
    const skillPriority = getOplSkillPriority();

    expect(skillPriority).toEqual(['med-autoscience', 'med-autogrant', 'redcube-ai', 'opl-bookforge']);
    expect(skillPriority).toEqual(expect.arrayContaining(getOplDefaultCodexSkills()));
    expect(skillPriority).not.toContain('morph-ppt');
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

  it('exposes the Codex session context without embedded secrets', () => {
    const context = getOplCodexSessionContext();

    expect(context).toContain('OPL App 默认会话规则');
    expect(context).toContain('Codex CLI 是固定执行器');
    expect(context).toContain('普通用户主路径不选择 executor');
    expect(context).not.toContain('api_key');
    expect(context).not.toContain('experimental_bearer_token');
  });
});

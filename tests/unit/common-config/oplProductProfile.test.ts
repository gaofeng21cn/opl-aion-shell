import { describe, expect, it } from 'vitest';
import {
  getOplCodexSessionContext,
  getOplCommandLineToolsInstallMessage,
  getOplCodexDefaultPermissionMode,
  getOplFlowContextPolicy,
  getOplAssistantSkillProfile,
  getOplAssistantSkillProfiles,
  getOplBuiltinAssistantRouteReceiptPolicy,
  getOplDefaultHomeAssistants,
  getOplDefaultExecutorAgentKey,
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  getOplDefaultCodexSkills,
  getOplDeferredFirstLaunchBlockers,
  getOplGuiDefaultCssThemeId,
  getOplGuiLegacySettingsRouteRedirects,
  getOplGuiSettingsVisibleTabs,
  getOplHomeModelStatusLabel,
  getOplModelStatusDisplayText,
  getOplRuntimeEnvironmentItems,
  getOplReadyToLaunchCoreItems,
  getOplReadyToLaunchNonBlockingItems,
  getOplRetiredCodexModels,
  getOplSkillPriority,
  isOplCodexCliFixedExecutor,
  OPL_PRODUCT_PROFILE,
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
  selectDefaultCodexModelId,
} from '@/common/types/codex/codexModels';
import { normalizeOplActiveThemeId, OPL_LEGACY_CODEX_THEME_ID } from '@/renderer/utils/theme/themeCssSync';

describe('OPL generated product profile', () => {
  it('exposes the App-generated Codex default model profile', () => {
    expect(getOplDefaultCodexModel()).toBe('gpt-5.5');
    expect(getOplDefaultCodexReasoningEffort()).toBe('xhigh');
    expect(DEFAULT_CODEX_MODEL_ID).toBe('gpt-5.5');
    expect(DEFAULT_CODEX_REASONING_EFFORT).toBe('xhigh');
    expect(DEFAULT_CODEX_MODEL_WITH_REASONING_ID).toBe('gpt-5.5/xhigh');
    expect(DEFAULT_CODEX_MODEL_DISPLAY_LABEL).toBe('GPT-5.5（超高）');
    expect(DEFAULT_CODEX_MODELS[0]?.id).toBe('gpt-5.5');
    expect(DEFAULT_CODEX_MODELS[0]?.label).toBe('GPT-5.5（超高）');
    expect(DEFAULT_CODEX_MODELS.map((model) => model.id)).toEqual(['gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2']);
    expect(DEFAULT_CODEX_MODELS.map((model) => model.id)).not.toEqual(
      expect.arrayContaining(['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'])
    );
  });

  it('keeps App-owned GUI defaults for theme, fixed Codex executor, and visible model controls', () => {
    expect(getOplDefaultExecutorAgentKey()).toBe('codex');
    expect(getOplGuiDefaultCssThemeId()).toBe('default-theme');
    expect(shouldDefaultCodexCssTheme()).toBe(false);
    expect(normalizeOplActiveThemeId('')).toBe('default-theme');
    expect(normalizeOplActiveThemeId(OPL_LEGACY_CODEX_THEME_ID)).toBe('default-theme');
    expect(getOplCodexDefaultPermissionMode()).toBe('full-access');
    expect(isOplCodexCliFixedExecutor()).toBe(true);
    expect(shouldShowOplHomeExecutorSelector()).toBe(false);
    expect(shouldShowOplHomePermissionModeSelector()).toBe(false);
    expect(shouldShowOplConversationBackendSelector()).toBe(false);
    expect(shouldShowOplConversationModelSelector()).toBe(true);
    expect(shouldShowOplConversationPermissionModeSelector()).toBe(false);
    expect(shouldShowOplCodexModelSelector()).toBe(true);
    expect(shouldShowOplCodexModelList()).toBe(true);
    expect(shouldShowOplCodexModelAutoOption()).toBe(true);
    expect(getOplHomeModelStatusLabel('zh-CN')).toBe('GPT-5.5（超高）');
    expect(getOplHomeModelStatusLabel('en-US')).toBe('GPT-5.5 (Ultra)');
    expect(getOplModelStatusDisplayText('zh-CN')).toBe('模型: GPT-5.5（超高）');
    expect(getOplModelStatusDisplayText('en-US')).toBe('Model: GPT-5.5 (Ultra)');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_model_policy).toBe('codex_cli_latest_strongest_model_selector_visible');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_default_model).toBe('gpt-5.5');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_precise_model_display_policy).toBe(
      'friendly_default_model_and_reasoning_visible'
    );
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.strategy).toBe(
      'codex_cli_auto_latest_available_frontier'
    );
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.user_can_override_model).toBe(true);
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.user_can_restore_auto).toBe(true);
    expect(getOplRetiredCodexModels()).toEqual(['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini']);
  });

  it('exposes App-owned settings navigation and runtime environment profile slices', () => {
    expect(getOplGuiSettingsVisibleTabs()).toEqual([
      'general',
      'access',
      'capabilities',
      'environment',
      'appearance',
      'advanced',
      'about',
    ]);
    expect(getOplGuiLegacySettingsRouteRedirects()).toEqual({
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
    });
    expect(getOplRuntimeEnvironmentItems()).toEqual(['codex', 'temporal', 'mas', 'mag', 'rca', 'app']);
  });

  it('exposes App-owned default home assistants without AionUI legacy entries', () => {
    const assistants = getOplDefaultHomeAssistants();

    expect(assistants.map((assistant) => assistant.id)).toEqual(['mas', 'mag', 'rca']);
    expect(assistants.map((assistant) => assistant.display_name)).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
    ]);
    expect(assistants.map((assistant) => assistant.home_purpose_label)).toEqual(['科研', '基金', '演示']);
    expect(OPL_PRODUCT_PROFILE.gui.home.home_purpose_entries.map((entry) => entry.id)).toEqual([
      'research',
      'grant',
      'ppt',
    ]);
    expect(OPL_PRODUCT_PROFILE.gui.home.home_purpose_entries.map((entry) => entry.target_assistant_id)).toEqual([
      'mas',
      'mag',
      'rca',
    ]);
    expect(
      OPL_PRODUCT_PROFILE.gui.home.home_purpose_entries.every((entry) => entry.display_policy === 'purpose_first')
    ).toBe(true);
    expect(assistants.every((assistant) => assistant.home_entry_display_policy === 'purpose_first')).toBe(true);
    expect(assistants.every((assistant) => assistant.home_entry_policy === 'purpose_entry_target')).toBe(true);
    expect(assistants.map((assistant) => assistant.id)).not.toEqual(expect.arrayContaining(['mds', 'cowork']));
    expect(assistants.map((assistant) => assistant.id)).not.toContain('oma');
    expect(OPL_PRODUCT_PROFILE.gui.non_default_assistants.map((assistant) => assistant.id)).toEqual(['oma']);
    expect(OPL_PRODUCT_PROFILE.gui.non_default_assistants[0]?.home_default_visible).toBe(false);
    expect(OPL_PRODUCT_PROFILE.gui.non_default_assistants[0]?.home_entry_policy).toBe('explicit_or_settings_only');

    assistants.push({ ...assistants[0], id: 'caller-local-assistant' });
    expect(getOplDefaultHomeAssistants().map((assistant) => assistant.id)).toEqual(['mas', 'mag', 'rca']);
  });

  it('exposes assistant-scoped home skill profiles from the App contract', () => {
    const profiles = getOplAssistantSkillProfiles();

    expect(profiles.map((profile) => profile.assistant_id)).toEqual(['mas', 'mag', 'rca']);
    expect(Object.fromEntries(profiles.map((profile) => [profile.assistant_id, profile.required_skills]))).toEqual({
      mas: ['mas'],
      mag: ['mag'],
      rca: ['rca'],
    });
    expect(getOplAssistantSkillProfile('builtin-mag')?.required_skills).toEqual(['mag']);
    expect(getOplAssistantSkillProfile('rca')?.optional_skills).toEqual(['officecli-pptx', 'ui-ux-pro-max']);
    expect(profiles.every((profile) => !profile.optional_skills.includes('morph-ppt'))).toBe(true);
    expect(profiles.every((profile) => profile.required_skill_policy === 'checked_locked')).toBe(true);
    expect(
      profiles.every((profile) => profile.skill_menu_policy === 'assistant_scoped_required_checked_optional_visible')
    ).toBe(true);
    const packagedSkillIds = new Set(OPL_PRODUCT_PROFILE.companion_payloads.default_packaged_codex_skill_ids);
    expect(
      profiles.every((profile) =>
        [...profile.required_skills, ...profile.optional_skills].every((skill) => packagedSkillIds.has(skill))
      )
    ).toBe(true);
    expect(profiles.every((profile) => !('hidden_home_skill_names' in profile))).toBe(true);

    profiles[0].required_skills.push('caller-local-skill');
    expect(getOplAssistantSkillProfile('mas')?.required_skills).toEqual(['mas']);
  });

  it('exposes the built-in assistant route receipt policy', () => {
    const policy = getOplBuiltinAssistantRouteReceiptPolicy();

    expect(policy.required_for_assistants).toEqual(['mas', 'mag', 'rca']);
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
    expect(getOplBuiltinAssistantRouteReceiptPolicy().required_for_assistants).toEqual(['mas', 'mag', 'rca']);
  });

  it('exposes App-managed OPL Flow context policy without allowing caller mutation', () => {
    const policy = getOplFlowContextPolicy();

    expect(policy).toEqual({
      flow_id: 'opl-flow',
      source: 'one-person-lab-app',
      delivery: 'session_scoped_preset_context',
      user_agents_policy: 'respect_user_agents_no_overwrite_detect_conflicts',
      language_policy: 'follow_ui_locale_zh_only_when_ui_zh',
    });

    policy.source = 'caller-local-source';
    expect(getOplFlowContextPolicy().source).toBe('one-person-lab-app');
  });

  it('selects the newest frontier Codex model without exposing retired choices', () => {
    expect(selectDefaultCodexModelId([{ id: 'gpt-5.1-codex-mini' }, { id: 'gpt-5.2-codex' }, { id: 'gpt-5.4' }])).toBe(
      'gpt-5.5'
    );
    expect(selectDefaultCodexModelId([{ id: 'gpt-5.5' }, { id: 'gpt-5.6-codex' }, { id: 'gpt-5.6-mini' }])).toBe(
      'gpt-5.6-codex'
    );
    expect(
      buildCodexDefaultModelInfo({
        current_model_id: 'gpt-5.2-codex',
        current_model_label: 'gpt-5.2-codex',
        available_models: [
          { id: 'gpt-5.6', label: 'gpt-5.6' },
          { id: 'gpt-5.1-codex-mini', label: 'gpt-5.1-codex-mini' },
        ],
      })
    ).toEqual({
      current_model_id: 'gpt-5.6',
      current_model_label: 'gpt-5.6',
      available_models: [{ id: 'gpt-5.6', label: 'gpt-5.6' }],
    });
    expect(buildCodexDefaultModelInfo()).toEqual({
      current_model_id: 'gpt-5.5',
      current_model_label: 'GPT-5.5（超高）',
      available_models: [
        { id: 'gpt-5.5', label: 'GPT-5.5（超高）' },
        { id: 'gpt-5.4', label: 'gpt-5.4' },
        { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
        { id: 'gpt-5.2', label: 'gpt-5.2' },
      ],
    });
  });

  it('exposes default visible skills without allowing caller mutation', () => {
    const skills = getOplDefaultCodexSkills();

    skills.push('caller-local-skill');

    expect(getOplDefaultCodexSkills()).toEqual([
      'mas',
      'mag',
      'rca',
      'superpowers',
      'cron',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'officecli-academic-paper',
      'officecli-data-dashboard',
      'officecli-financial-model',
      'officecli-pitch-deck',
      'pdf',
      'mineru-document-extractor',
      'ui-ux-pro-max',
    ]);
  });

  it('keeps display priority aligned with default skills without retired morph-ppt wiring', () => {
    const skillPriority = getOplSkillPriority();

    expect(skillPriority).toEqual([
      'mas',
      'mag',
      'rca',
      'superpowers',
      'cron',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'officecli-academic-paper',
      'officecli-data-dashboard',
      'officecli-financial-model',
      'officecli-pitch-deck',
      'pdf',
      'mineru-document-extractor',
      'ui-ux-pro-max',
    ]);
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

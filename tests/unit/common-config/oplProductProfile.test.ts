import { describe, expect, it } from 'vitest';
import {
  getOplCodexSessionContext,
  getOplCommandLineToolsInstallMessage,
  getOplCodexDefaultPermissionMode,
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
    expect(DEFAULT_CODEX_MODEL_DISPLAY_LABEL).toBe('gpt-5.5xhigh');
    expect(DEFAULT_CODEX_MODELS[0]?.id).toBe('gpt-5.5');
    expect(DEFAULT_CODEX_MODELS[0]?.label).toBe('gpt-5.5xhigh');
    expect(DEFAULT_CODEX_MODELS).toHaveLength(1);
    expect(DEFAULT_CODEX_MODELS.map((model) => model.id)).not.toEqual(
      expect.arrayContaining(['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'])
    );
  });

  it('keeps App-owned GUI defaults for theme, fixed Codex executor, and hidden home controls', () => {
    expect(getOplDefaultExecutorAgentKey()).toBe('codex');
    expect(getOplGuiDefaultCssThemeId()).toBe('codex');
    expect(shouldDefaultCodexCssTheme()).toBe(true);
    expect(normalizeOplActiveThemeId('')).toBe('codex');
    expect(normalizeOplActiveThemeId(OPL_LEGACY_CODEX_THEME_ID)).toBe('codex');
    expect(getOplCodexDefaultPermissionMode()).toBe('full-access');
    expect(isOplCodexCliFixedExecutor()).toBe(true);
    expect(shouldShowOplHomeExecutorSelector()).toBe(false);
    expect(shouldShowOplHomePermissionModeSelector()).toBe(false);
    expect(shouldShowOplCodexModelSelector()).toBe(false);
    expect(shouldShowOplCodexModelList()).toBe(false);
    expect(shouldShowOplCodexModelAutoOption()).toBe(false);
    expect(getOplHomeModelStatusLabel('zh-CN')).toBe('自动');
    expect(getOplHomeModelStatusLabel('en-US')).toBe('Auto');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_model_policy).toBe('codex_cli_auto_model_hidden_on_home');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_default_model).toBe('codex_cli_auto');
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_precise_model_display_policy).toBe(
      'technical_details_or_connected_state_only'
    );
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.strategy).toBe(
      'codex_cli_auto_latest_available_frontier'
    );
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.user_can_override_model).toBe(false);
    expect(OPL_PRODUCT_PROFILE.gui.home.codex_auto_model_selection.user_can_restore_auto).toBe(false);
    expect(getOplRetiredCodexModels()).toEqual(['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini']);
  });

  it('exposes App-owned settings navigation and runtime environment profile slices', () => {
    expect(getOplGuiSettingsVisibleTabs()).toEqual([
      'overview',
      'runtime',
      'capabilities',
      'access',
      'appearance',
      'system',
      'about',
    ]);
    expect(getOplGuiLegacySettingsRouteRedirects()).toEqual({
      model: 'runtime',
      agent: 'runtime',
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
    expect(assistants.map((assistant) => assistant.home_purpose_label)).toEqual(['科研', '基金', 'PPT']);
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
  });

  it('exposes default visible skills without allowing caller mutation', () => {
    const skills = getOplDefaultCodexSkills();

    skills.push('caller-local-skill');

    expect(getOplDefaultCodexSkills()).toEqual([
      'mas',
      'mag',
      'rca',
      'superpowers',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'mineru-document-extractor',
      'ui-ux-pro-max',
    ]);
  });

  it('keeps display priority aligned with default skills and the morph-ppt companion route', () => {
    const skillPriority = getOplSkillPriority();

    expect(skillPriority).toEqual([
      'mas',
      'mag',
      'rca',
      'superpowers',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'mineru-document-extractor',
      'ui-ux-pro-max',
      'morph-ppt',
    ]);
    expect(skillPriority).toEqual(expect.arrayContaining(getOplDefaultCodexSkills()));
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

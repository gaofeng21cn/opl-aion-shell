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
  getOplReadyToLaunchCoreItems,
  getOplReadyToLaunchNonBlockingItems,
  getOplRetiredCodexModels,
  getOplSkillPriority,
  shouldDefaultCodexCssTheme,
} from '@/common/config/oplProductProfile';
import {
  buildCodexDefaultModelInfo,
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
    expect(DEFAULT_CODEX_MODELS[0]?.id).toBe('gpt-5.5');
    expect(DEFAULT_CODEX_MODELS).toHaveLength(1);
    expect(DEFAULT_CODEX_MODELS.map((model) => model.id)).not.toEqual(
      expect.arrayContaining(['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini'])
    );
  });

  it('keeps App-owned GUI defaults for theme, home model policy, and Codex permissions', () => {
    expect(getOplDefaultExecutorAgentKey()).toBe('codex');
    expect(getOplGuiDefaultCssThemeId()).toBe('codex');
    expect(shouldDefaultCodexCssTheme()).toBe(true);
    expect(normalizeOplActiveThemeId('')).toBe('codex');
    expect(normalizeOplActiveThemeId(OPL_LEGACY_CODEX_THEME_ID)).toBe('codex');
    expect(getOplCodexDefaultPermissionMode()).toBe('full-access');
    expect(getOplRetiredCodexModels()).toEqual(['gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini']);
  });

  it('exposes App-owned default home assistants without AionUI legacy entries', () => {
    const assistants = getOplDefaultHomeAssistants();

    expect(assistants.map((assistant) => assistant.id)).toEqual(['mas', 'mag', 'rca', 'oma']);
    expect(assistants.map((assistant) => assistant.display_name)).toEqual([
      'Med Auto Science',
      'Med Auto Grant',
      'RedCube AI',
      'OPL Meta Agent',
    ]);
    expect(assistants.every((assistant) => assistant.home_entry_policy === 'visible_click_to_start')).toBe(true);
    expect(assistants.map((assistant) => assistant.id)).not.toEqual(expect.arrayContaining(['mds', 'cowork']));

    assistants.push({ ...assistants[0], id: 'caller-local-assistant' });
    expect(getOplDefaultHomeAssistants().map((assistant) => assistant.id)).toEqual(['mas', 'mag', 'rca', 'oma']);
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
      available_models: [],
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
    expect(context).toContain('默认仍使用 Codex CLI 会话语义');
    expect(context).not.toContain('api_key');
    expect(context).not.toContain('experimental_bearer_token');
  });
});

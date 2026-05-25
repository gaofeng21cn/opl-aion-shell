import { describe, expect, it } from 'vitest';
import {
  getOplCodexSessionContext,
  getOplCommandLineToolsInstallMessage,
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  getOplDefaultCodexSkills,
  getOplDeferredFirstLaunchBlockers,
  getOplSkillPriority,
} from '@/common/config/oplProductProfile';
import {
  DEFAULT_CODEX_MODEL_ID,
  DEFAULT_CODEX_MODEL_WITH_REASONING_ID,
  DEFAULT_CODEX_MODELS,
  DEFAULT_CODEX_REASONING_EFFORT,
} from '@/common/types/codex/codexModels';

describe('OPL generated product profile', () => {
  it('exposes the App-generated Codex default model profile', () => {
    expect(getOplDefaultCodexModel()).toBe('gpt-5.5');
    expect(getOplDefaultCodexReasoningEffort()).toBe('xhigh');
    expect(DEFAULT_CODEX_MODEL_ID).toBe('gpt-5.5');
    expect(DEFAULT_CODEX_REASONING_EFFORT).toBe('xhigh');
    expect(DEFAULT_CODEX_MODEL_WITH_REASONING_ID).toBe('gpt-5.5/xhigh');
    expect(DEFAULT_CODEX_MODELS[0]?.id).toBe('gpt-5.5');
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

import { describe, it, expect } from 'vitest';
import {
  OPL_APP_ACTIVATION_POLICY,
  OPL_CODEX_CONTEXT_SNIPPET,
  OPL_DEFAULT_CODEX_SKILLS,
  mergeOplDefaultCodexContext,
  mergeOplDefaultCodexSkills,
} from '@/common/config/oplSkills';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';

describe('OPL default Codex skills', () => {
  it('adds MAS, MAG, RCA, superpowers, and Office skills to plain Codex conversations', () => {
    const params = buildAgentConversationParams({
      backend: 'codex',
      name: 'One Person Lab',
      workspace: '/tmp/opl',
      model: {},
    });

    expect(params.extra?.enabledSkills).toEqual([...OPL_DEFAULT_CODEX_SKILLS]);
    expect(params.extra?.presetContext).toBe(OPL_CODEX_CONTEXT_SNIPPET);
    expect(params.extra?.presetContext).toContain(OPL_APP_ACTIVATION_POLICY);
    expect(params.extra?.presetContext).toContain('不要求用户输入 @MAS');
  });

  it('keeps the OPL activation policy scoped to conversation context instead of AGENTS files', () => {
    const context = mergeOplDefaultCodexContext('PRESET RULES');

    expect(context).toBe(`${OPL_CODEX_CONTEXT_SNIPPET}\n\nPRESET RULES`);
    expect(context).toContain(OPL_APP_ACTIVATION_POLICY);
    expect(context).not.toContain('AGENTS.md');
  });

  it('appends the OPL App Codex session addendum before preset rules', () => {
    const context = mergeOplDefaultCodexContext('PRESET RULES', {
      codexSessionAddendum: 'Prefer the DPCC workspace.',
    });

    expect(context).toBe(
      `${OPL_CODEX_CONTEXT_SNIPPET}\n\n## OPL App Session Addendum\n\nPrefer the DPCC workspace.\n\nPRESET RULES`
    );
    expect(context).not.toContain('AGENTS.md');
  });

  it('preserves user-enabled skills after the OPL default family and companion skills', () => {
    expect(mergeOplDefaultCodexSkills(['officecli', 'mas', 'custom-skill'])).toEqual([
      'mas',
      'mag',
      'rca',
      'superpowers',
      'officecli',
      'officecli-docx',
      'officecli-pptx',
      'officecli-xlsx',
      'ui-ux-pro-max',
      'custom-skill',
    ]);
  });
});

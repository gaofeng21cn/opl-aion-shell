import { describe, it, expect } from 'vitest';
import {
  OPL_APP_ACTIVATION_POLICY,
  OPL_CODEX_CONTEXT_SNIPPET,
  OPL_DEFAULT_CODEX_SKILLS,
  OPL_LEGACY_CODEX_CONTEXT_SNIPPETS,
  mergeOplDefaultCodexContext,
  mergeOplDefaultCodexSkills,
  normalizeOplCodexSessionContext,
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
    expect(params.extra?.presetContext).toContain('默认路由');
    expect(params.extra?.presetContext).toContain('不要要求用户输入 @MAS');
    expect(params.extra?.presetContext).not.toContain('One Person Lab is the default Codex runtime surface');
  });

  it('keeps the OPL activation policy scoped to conversation context instead of AGENTS files', () => {
    const context = mergeOplDefaultCodexContext('PRESET RULES');

    expect(context).toBe(`${OPL_CODEX_CONTEXT_SNIPPET}\n\nPRESET RULES`);
    expect(context).toContain(OPL_APP_ACTIVATION_POLICY);
    expect(context).not.toContain('AGENTS.md');
  });

  it('uses the complete OPL App Codex session context before preset rules', () => {
    const context = mergeOplDefaultCodexContext('PRESET RULES', {
      codexSessionContext: 'Complete OPL session context.',
      codexSessionAddendum: 'Legacy addendum should not win.',
    });

    expect(context).toBe('Complete OPL session context.\n\nPRESET RULES');
    expect(context).not.toContain('Legacy addendum should not win.');
    expect(context).not.toContain('AGENTS.md');
  });

  it('keeps legacy addendum migration before preset rules when no complete context exists', () => {
    const context = mergeOplDefaultCodexContext('PRESET RULES', {
      codexSessionAddendum: 'Prefer the DPCC workspace.',
    });

    expect(context).toBe(
      `${OPL_CODEX_CONTEXT_SNIPPET}\n\n## OPL App 会话补充\n\nPrefer the DPCC workspace.\n\nPRESET RULES`
    );
    expect(context).not.toContain('AGENTS.md');
  });

  it('normalizes previously saved built-in context to the current concise default', () => {
    expect(normalizeOplCodexSessionContext(OPL_LEGACY_CODEX_CONTEXT_SNIPPETS[0])).toBe(OPL_CODEX_CONTEXT_SNIPPET);
    expect(normalizeOplCodexSessionContext('Custom user context')).toBe('Custom user context');
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

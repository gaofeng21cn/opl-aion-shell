import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { computeCssSyncDecision, resolveCssByActiveTheme } from '@/renderer/utils/theme/themeCssSync';
import { CODEX_THEME_ID } from '@/renderer/pages/settings/DisplaySettings/presets';

describe('OPL theme CSS sync', () => {
  it('applies the App-owned Codex theme when stored theme state is empty', () => {
    const expectedCss = resolveCssByActiveTheme(CODEX_THEME_ID, []);

    const decision = computeCssSyncDecision({
      savedCss: '',
      activeThemeId: '',
      savedThemes: [],
      currentUiCss: '',
      lastUiCssUpdateAt: 0,
      now: 10_000,
    });

    expect(decision).toEqual({
      shouldSkipApply: false,
      shouldHealStorage: true,
      effectiveCss: expectedCss,
    });
  });

  it('keeps the Codex preset resource aligned with the App theme instead of legacy AionUI themes', () => {
    const cssPath = path.join(
      process.cwd(),
      'packages/desktop/src/renderer/pages/settings/DisplaySettings/presets/opl-codex.css'
    );
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('One Person Lab Codex Theme');
    expect(css).toContain('--opl-codex-sidebar-bg');
    expect(css).toContain('SF Pro Text');
    expect(css).toContain('border: 0 !important');
    expect(css).not.toMatch(/Retroma|aurora|glittering/i);
    expect(css).not.toContain('Palatino');
  });
});

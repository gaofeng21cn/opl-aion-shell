import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Codex visual parity overlay', () => {
  it('keeps conversation search in the history header as an icon action', () => {
    const sider = read('packages/desktop/src/renderer/components/layout/Sider/index.tsx');
    const searchEntry = read('packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderSearchEntry.tsx');
    const layoutStyles = read('packages/desktop/src/renderer/styles/layout.css');

    expect(sider).toMatch(/data-testid='conversation-history-header'[\s\S]*?<SiderSearchEntry/);
    expect(searchEntry).toContain("'!w-32px !h-32px'");
    expect(searchEntry).not.toMatch(/\sfullWidth(?:\s|=)/);
    expect(layoutStyles).toMatch(
      /\.sider-action-icon-btn-mobile\s*{[^}]*width:\s*32px\s*!important;[^}]*height:\s*32px\s*!important;/
    );
  });

  it('uses the measured neutral rail and semantic composer elevation tokens', () => {
    const baseline = read('packages/desktop/src/renderer/styles/themes/opl-product-baseline.css');
    const focusRing = read('packages/desktop/src/renderer/hooks/chat/useInputFocusRing.ts');
    const sendBox = read('packages/desktop/src/renderer/components/chat/SendBox/index.tsx');
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');

    expect(baseline).toContain('--opl-sidebar-bg: #f0f0f0;');
    expect(baseline).toContain('--opl-composer-shadow:');
    expect(baseline).toContain('--opl-composer-focus-shadow:');
    expect(focusRing).toContain("activeShadow: 'var(--opl-composer-focus-shadow)'");
    expect(focusRing).not.toMatch(/#E1E0FF|#4D4B87|rgba\(77, 75, 135/);
    expect(sendBox).toContain("boxShadow: isInputActive ? activeShadow : 'var(--opl-composer-shadow)'");
    expect(guidStyles).toContain('--opl-home-composer-shadow: var(--opl-composer-shadow);');
  });

  it('keeps Settings navigation and grouped surfaces neutral', () => {
    const settingsStyles = read('packages/desktop/src/renderer/pages/settings/components/settings.css');
    const settingsRegistry = read('packages/desktop/src/renderer/pages/settings/registry/settingsRegistry.tsx');

    expect(settingsStyles).toContain('max-width: 760px;');
    expect(settingsStyles).not.toContain('inset 3px 0 0');
    expect(settingsRegistry).not.toContain('SETTINGS_ICON_COLORS');
    expect(settingsRegistry).toContain('style={{ color: iconColors.secondary }}');
  });
});

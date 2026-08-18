import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function firstCustomProperty(css: string, property: string): string {
  const match = css.match(new RegExp(`${property}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`Missing ${property}`);
  return match[1].trim();
}

function customPropertyInBlock(css: string, selector: string, property: string): string {
  const selectorStart = css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing ${selector}`);
  const blockStart = css.indexOf('{', selectorStart);
  const blockEnd = css.indexOf('}', blockStart);
  const match = css.slice(blockStart + 1, blockEnd).match(new RegExp(`${property}:\\s*([^;]+);`));
  if (!match?.[1]) throw new Error(`Missing ${property} in ${selector}`);
  return match[1].trim();
}

type ThemeMode = 'light' | 'dark';

function lastCustomPropertyInBlocks(css: string, selector: string, property: string): string | undefined {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockPattern = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g');
  const propertyPattern = new RegExp(`${property}:\\s*([^;]+);`);
  let value: string | undefined;
  for (const block of css.matchAll(blockPattern)) {
    const match = block[1]?.match(propertyPattern);
    if (match?.[1]) value = match[1].trim();
  }
  return value;
}

function resolveThemeProperty(
  cssSources: string[],
  property: string,
  mode: ThemeMode,
  seen = new Set<string>()
): string {
  if (seen.has(property)) throw new Error(`Circular custom property reference at ${property}`);
  seen.add(property);

  const modeSelector = mode === 'dark' ? 'body[data-ds-dark-theme]' : 'body:not([data-ds-dark-theme])';
  let value: string | undefined;
  for (let index = cssSources.length - 1; index >= 0 && !value; index -= 1) {
    value = lastCustomPropertyInBlocks(cssSources[index], modeSelector, property);
  }
  for (let index = cssSources.length - 1; index >= 0 && !value; index -= 1) {
    value = lastCustomPropertyInBlocks(cssSources[index], 'body', property);
  }
  if (!value) throw new Error(`Missing ${property} for ${mode} mode`);

  const reference = /^var\((--[^),\s]+)\)$/.exec(value)?.[1];
  return reference ? resolveThemeProperty(cssSources, reference, mode, seen) : value;
}

function colorChannels(color: string): number[] {
  const hexChannels = /^#([0-9a-f]{6})$/i.exec(color)?.[1]?.match(/.{2}/g);
  if (hexChannels) return hexChannels.map((channel) => Number.parseInt(channel, 16));
  const rgbChannels = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color);
  if (rgbChannels) return rgbChannels.slice(1).map(Number);
  throw new Error(`Expected a six-digit hex or rgb color, received ${color}`);
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = colorChannels(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

function unsafeOneSidedBorderClasses(source: string): string[] {
  return [...source.matchAll(/className=['"]([^'"]*)['"]/g)]
    .map((match) => match[1] ?? '')
    .filter((className) => /\bborder-(?:t|b|l|r)\b/.test(className) && /\bborder-solid\b/.test(className))
    .filter((className) => !/\bborder-0\b/.test(className));
}

describe('Codex visual parity overlay', () => {
  it('keeps the first renderer preflight on the product startup stages', () => {
    const main = read('packages/desktop/src/renderer/main.tsx');
    const preflightStart = main.indexOf('if (!ready || !configReady)');
    const preflightEnd = main.indexOf('return (\n    <Router', preflightStart);
    const preflight = main.slice(preflightStart, preflightEnd);

    expect(preflightStart).toBeGreaterThanOrEqual(0);
    expect(preflightEnd).toBeGreaterThan(preflightStart);
    expect(preflight).toContain("t('common.uiOptimization.startup.stages.workspace')");
    expect(preflight).toContain("t('common.uiOptimization.startup.stages.assistant')");
    expect(preflight).toContain("t('common.uiOptimization.startup.stages.modelAccess')");
    expect(preflight).toContain('showProgress={false}');
    expect(preflight).not.toContain('common.startupPreflight.steps.desktopSession');
    expect(preflight).not.toContain('common.startupPreflight.steps.appConfig');
    expect(preflight).not.toContain('common.startupPreflight.steps.firstRunStatus');
    expect(preflight).not.toContain('common.startupPreflight.messages.connectingBackend');
    expect(preflight).not.toContain('common.startupPreflight.messages.loadingConfig');
  });

  it('keeps conversation search in the history header as an icon action', () => {
    const sider = read('packages/desktop/src/renderer/components/layout/Sider/index.tsx');
    const searchEntry = read('packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderSearchEntry.tsx');
    const layoutStyles = read('packages/desktop/src/renderer/styles/layout.css');

    expect(sider).toMatch(/data-testid='conversation-history-header'[\s\S]*?<SiderSearchEntry/);
    expect(sider).toContain('useDesktopAutoUpdateStatus');
    expect(sider).toContain('projectDesktopAutoUpdateStatus');
    expect(sider).toContain('updateAvailable={desktopAutoUpdate.updateAvailable}');
    expect(sider).not.toContain('isManagedAppUpdateAvailable');
    expect(searchEntry).toContain(": '!w-28px !h-28px'");
    expect(searchEntry).not.toMatch(/\sfullWidth(?:\s|=)/);
    expect(layoutStyles).toMatch(
      /\.sider-action-icon-btn-mobile\s*{[^}]*width:\s*32px\s*!important;[^}]*height:\s*32px\s*!important;/
    );
  });

  it('uses the measured neutral rail and semantic composer elevation tokens', () => {
    const baseline = read('packages/desktop/src/renderer/styles/themes/opl-product-baseline.css');
    const codexPreset = read('packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets/opl-codex.css');
    const layout = read('packages/desktop/src/renderer/components/layout/Layout.tsx');
    const layoutStyles = read('packages/desktop/src/renderer/styles/layout.css');
    const unoConfig = read('uno.config.ts');
    const focusRing = read('packages/desktop/src/renderer/hooks/chat/useInputFocusRing.ts');
    const sendBox = read('packages/desktop/src/renderer/components/chat/SendBox/index.tsx');
    const sendBoxStyles = read('packages/desktop/src/renderer/components/chat/SendBox/sendbox.css');
    const primitives = read('packages/desktop/src/renderer/styles/opl-codex-primitives.css');
    const titlebarStyles = read('packages/desktop/src/renderer/components/layout/Titlebar/titlebar.css');
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');
    const guidActionRow = read('packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx');
    const settingsStyles = read('packages/desktop/src/renderer/pages/settings/components/settings.css');
    const sessionMenuStyles = read('packages/desktop/src/renderer/components/agent/OplCodexSessionMenu.module.css');

    expect(firstCustomProperty(baseline, '--opl-sidebar-bg')).toBe('var(--dsw-specific-sidebar-fill)');
    expect(firstCustomProperty(baseline, '--opl-sidebar-hover')).toBe('var(--dsw-specific-sidebar-nav-item-hover)');
    expect(firstCustomProperty(baseline, '--opl-sidebar-active')).toBe('var(--dsw-specific-sidebar-nav-item-active)');
    expect(firstCustomProperty(baseline, '--text-primary')).toBe('var(--dsw-alias-label-primary)');
    expect(firstCustomProperty(baseline, '--text-secondary')).toBe('var(--dsw-alias-label-secondary)');
    expect(firstCustomProperty(baseline, '--color-text-3')).toBe('var(--dsw-alias-label-secondary)');
    expect(layout).toContain("classNames('layout-sider'");
    expect(layout).not.toMatch(/classNames\(['"][^'"]*!bg-2[^'"]*layout-sider/);
    expect(layoutStyles).toMatch(/\.sider-section-label\s*{[^}]*background-color:\s*var\(--opl-sidebar-bg\);/);
    expect(unoConfig).toContain("'t-tertiary': 'var(--color-text-3)'");
    expect(customPropertyInBlock(baseline, 'body {', '--color-text-1')).toBe('var(--dsw-alias-label-primary)');
    expect(customPropertyInBlock(baseline, 'body {', '--color-text-3')).toBe('var(--dsw-alias-label-secondary)');
    expect(customPropertyInBlock(baseline, 'body {', '--color-border-2')).toBe('var(--dsw-alias-border-l1)');
    expect(customPropertyInBlock(baseline, 'body {', '--color-fill-3')).toBe(
      'var(--dsw-alias-interactive-bg-hover-solid)'
    );
    expect(baseline).toContain('body[data-ds-dark-theme]');
    expect(baseline).not.toContain("[data-color-scheme='default'][data-theme='dark']");
    expect(baseline).toMatch(
      /\[data-testid='message-list-scroller'\]\s*{[^}]*padding-left:\s*0;[^}]*padding-right:\s*0;[^}]*overflow-x:\s*hidden;/
    );
    expect(baseline).toMatch(
      /\[data-testid='message-list-content'\]\s*{[^}]*box-sizing:\s*border-box;[^}]*padding-left:\s*20px;[^}]*padding-right:\s*20px;/
    );
    expect(firstCustomProperty(codexPreset, '--opl-codex-sidebar-bg')).toBe('var(--opl-sidebar-bg)');
    expect(firstCustomProperty(codexPreset, '--opl-codex-sidebar-active')).toBe('var(--opl-sidebar-active)');
    expect(codexPreset).not.toContain('rgba(246, 246, 244, 0.84)');
    expect(codexPreset).toMatch(/\.layout-sider\s*{[^}]*background:\s*var\(--opl-codex-sidebar-bg\)\s*!important;/);
    expect(baseline).toContain('--opl-composer-shadow:');
    expect(baseline).toContain('--opl-composer-focus-shadow:');
    expect(firstCustomProperty(baseline, '--opl-composer-border-focus')).toBe(
      'var(--dsw-alias-state-business-primary)'
    );
    expect(firstCustomProperty(baseline, '--opl-composer-shadow')).toBe('var(--dsw-shadow-lv2)');
    expect(firstCustomProperty(baseline, '--opl-composer-context-bg')).toBe('var(--dsw-alias-bg-layer-1)');
    expect(firstCustomProperty(baseline, '--opl-composer-placeholder')).toBe('var(--dsw-alias-label-secondary)');
    expect(firstCustomProperty(baseline, '--opl-composer-send-disabled')).toBe('var(--dsw-alias-label-dimmed)');
    expect(focusRing).toContain("activeShadow: 'var(--opl-composer-focus-shadow)'");
    expect(focusRing).not.toMatch(/#E1E0FF|#4D4B87|rgba\(77, 75, 135/);
    expect(sendBox).toContain("boxShadow: isInputActive ? activeShadow : 'var(--opl-composer-shadow)'");
    expect(primitives).toContain('--opl-codex-control-height: 28px;');
    expect(primitives).toContain('--opl-codex-pill-height: 24px;');
    expect(primitives).toContain('--opl-codex-settings-row-height: 34px;');
    expect(primitives).toContain('--opl-codex-menu-item-min-height: 40px;');
    expect(primitives).toMatch(
      /\.opl-codex-rail-row\s*{[^}]*height:\s*var\(--opl-codex-rail-row-height\)\s*!important;[^}]*border-radius:\s*var\(--opl-codex-rail-row-radius\)\s*!important;/
    );
    expect(titlebarStyles).toMatch(
      /\.app-titlebar__button\s*{[^}]*width:\s*var\(--opl-codex-control-height, 28px\);[^}]*height:\s*var\(--opl-codex-control-height, 28px\);[^}]*border-radius:\s*var\(--opl-codex-control-radius, 8px\);/
    );
    expect(guidStyles).toContain('--opl-home-composer-shadow: var(--opl-composer-shadow);');
    expect(guidStyles).toMatch(/\.guidInputInner\s*{[^}]*min-height:\s*98px;[^}]*padding:\s*10px 8px 6px;/);
    expect(guidStyles).not.toMatch(/\.guidInputInner\s*{[^}]*border:\s*1px solid var\(--opl-composer-border\);/);
    expect(guidStyles).toContain('background: var(--opl-composer-context-bg);');
    expect(guidStyles).toContain('border: 1px solid var(--opl-composer-context-border);');
    expect(guidStyles).toContain('color: var(--opl-composer-placeholder) !important;');
    expect(guidStyles).toContain('color: var(--color-text-3) !important;');
    expect(guidStyles).not.toContain('background: #262626;');
    expect(guidStyles).not.toContain('border-color: #3a3a3a;');
    expect(guidStyles).not.toContain('color: #b4b5bc');
    expect(guidStyles).toMatch(
      /\.actionConfigGroup :global\(\.sendbox-model-btn\)\s*{[^}]*font-family:\s*inherit\s*!important;[^}]*font-size:\s*12px\s*!important;[^}]*font-weight:\s*400\s*!important;[^}]*line-height:\s*18px\s*!important;/
    );
    expect(guidStyles).toMatch(
      /\.actionConfigGroup :global\(\.sendbox-model-btn span\)\s*{[^}]*line-height:\s*18px\s*!important;/
    );
    expect(guidActionRow).toContain('data-permission-mode={selectedMode}');
    expect(guidActionRow).toContain("compactLeadingIcon={<OplIcon name='permission' size={14} />}");
    expect(guidActionRow).toContain("icon={<OplIcon name='send' />}");
    expect(guidActionRow).toContain("getOplVisualPrimitiveProps('icon_button', 'send-button-custom')");
    expect(sendBox).toContain("icon={<OplIcon name='send' aria-hidden='true' />}");
    expect(sendBox).toContain("getOplVisualPrimitiveProps('icon_button', 'send-button-custom')");
    expect(sendBox).toContain("getOplVisualPrimitiveProps('icon_button', 'bg-animate sendbox-stop-button')");
    expect(sendBox).toContain("getOplVisualPrimitiveProps('icon_button', 'sendbox-mobile-plus-btn')");
    expect(sessionMenuStyles).toMatch(
      /\.menuItem:global\(\.arco-dropdown-popup-visible\):focus-visible\s*{[^}]*outline:\s*none;/
    );
    expect(sendBoxStyles).toMatch(
      /\.send-button-custom,[\s\S]*?width:\s*32px\s*!important;[\s\S]*?height:\s*32px\s*!important;[\s\S]*?border:\s*2px solid transparent\s*!important;[\s\S]*?border-radius:\s*50%\s*!important;[\s\S]*?background-clip:\s*padding-box\s*!important;/
    );
    expect(guidStyles).toMatch(
      /\.homeStarter:global\(\.arco-btn\)\s*{[^}]*height:\s*var\(--opl-codex-pill-height\)\s*!important;[^}]*padding:\s*0 8px\s*!important;[^}]*border-radius:\s*var\(--opl-codex-pill-radius\)\s*!important;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-sider__item\s*{[^}]*height:\s*var\(--opl-codex-settings-row-height\);[^}]*flex:\s*0 0 var\(--opl-codex-settings-row-height\);/
    );
    expect(settingsStyles).toMatch(
      /\.settings-sider__destination-rail\s*{[^}]*width:\s*2px;[^}]*height:\s*14px;[^}]*background:\s*transparent;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-sider__destination--active \.settings-sider__destination-rail\s*{[^}]*background:\s*var\(--dsw-alias-state-business-primary\);/
    );
    expect(sendBoxStyles).toMatch(/\.sendbox-panel\.opl-codex-composer--conversation\s*{[^}]*padding:\s*10px 8px 6px;/);
    expect(sendBoxStyles).toMatch(/\.sendbox-panel textarea,[\s\S]*line-height:\s*20px;/);
    expect(sendBoxStyles).toMatch(
      /\.sendbox-tools \.sendbox-model-btn,[\s\S]*?font-family:\s*inherit\s*!important;[\s\S]*?font-size:\s*12px\s*!important;[\s\S]*?font-weight:\s*400\s*!important;[\s\S]*?line-height:\s*18px\s*!important;/
    );
    expect(sendBoxStyles).toMatch(
      /\.sendbox-tools \.sendbox-model-btn \.arco-btn-content,[\s\S]*?\.sendbox-tools \.sendbox-model-btn span,[\s\S]*?line-height:\s*18px\s*!important;/
    );
    expect(sendBoxStyles).not.toContain('stroke-width: 5');
    expect(sendBoxStyles).not.toContain('drop-shadow');
    expect(sendBoxStyles).toMatch(
      /\.sendbox-panel textarea::placeholder\s*{[^}]*color:\s*var\(--text-secondary\)\s*!important;[^}]*opacity:\s*1;/
    );
    expect(sendBoxStyles).not.toContain('#a1a2aa');
    expect(guidStyles).toMatch(/\.guidInputInner\s*{[^}]*border-radius:\s*22px;/);
    expect(codexPreset).toMatch(
      /\.guid-input-card-shell > div:first-child\s*{[^}]*border-radius:\s*22px\s*!important;/
    );
    expect(codexPreset).toMatch(
      /\.guid-input-card-shell > div:first-child,[\s\S]*?\.guid-input-card-inner\s*{[^}]*box-shadow:\s*var\(--opl-composer-shadow\)\s*!important;/
    );
    expect(codexPreset).toContain("[class*='input'][class*='shell']:not(.guid-input-card-shell)");
    expect(codexPreset).toMatch(
      /\.guid-input-card-shell > div:first-child:focus-within,[\s\S]*?\.guid-input-card-inner:focus-within\s*{[^}]*box-shadow:\s*var\(--opl-composer-focus-shadow\)\s*!important;/
    );
  });

  it('keeps muted text and focus indicators above the governed WCAG contrast floors', () => {
    const baseline = read('packages/desktop/src/renderer/styles/themes/opl-product-baseline.css');
    const dshTokens = read(
      'packages/desktop/src/renderer/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
    );
    const cssSources = [dshTokens, baseline];
    const lightMuted = resolveThemeProperty(cssSources, '--color-text-3', 'light');
    const lightFocus = resolveThemeProperty(cssSources, '--opl-focus-ring', 'light');
    const darkMuted = resolveThemeProperty(cssSources, '--color-text-3', 'dark');
    const darkFocus = resolveThemeProperty(cssSources, '--opl-focus-ring', 'dark');
    const lightBackground = resolveThemeProperty(cssSources, '--dsw-alias-bg-base', 'light');
    const darkBackground = resolveThemeProperty(cssSources, '--dsw-alias-bg-base', 'dark');

    expect(firstCustomProperty(baseline, '--color-text-3')).toBe('var(--dsw-alias-label-secondary)');
    expect(firstCustomProperty(baseline, '--opl-focus-ring')).toBe('var(--dsw-alias-state-business-primary)');
    expect(firstCustomProperty(baseline, '--opl-composer-focus-shadow')).toContain('var(--opl-focus-ring)');
    expect(contrastRatio(lightMuted, lightBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightFocus, lightBackground)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(darkMuted, darkBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkFocus, darkBackground)).toBeGreaterThanOrEqual(3);
  });

  it('keeps normal text on Home, conversation, and Settings controls above the WCAG floor', () => {
    const baseline = read('packages/desktop/src/renderer/styles/themes/opl-product-baseline.css');
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');
    const chatLayoutStyles = read(
      'packages/desktop/src/renderer/pages/conversation/components/ChatLayout/chat-layout.css'
    );
    const settingsStyles = read('packages/desktop/src/renderer/pages/settings/components/settings.css');
    const dshTokens = read(
      'packages/desktop/src/renderer/vendor/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
    );
    const cssSources = [dshTokens, baseline];
    const lightFullAccess = resolveThemeProperty(cssSources, '--opl-accent-orange', 'light');
    const darkFullAccess = resolveThemeProperty(cssSources, '--opl-accent-orange', 'dark');
    const darkSecondary = resolveThemeProperty(cssSources, '--text-secondary', 'dark');
    const lightBackground = resolveThemeProperty(cssSources, '--dsw-alias-bg-base', 'light');
    const darkBackground = resolveThemeProperty(cssSources, '--dsw-alias-bg-base', 'dark');

    expect(firstCustomProperty(baseline, '--opl-accent-orange')).toBe('var(--dsw-static-amber-900)');
    expect(customPropertyInBlock(baseline, 'body[data-ds-dark-theme]', '--opl-accent-orange')).toBe(
      'var(--dsw-static-amber-100)'
    );
    expect(guidStyles).toMatch(
      /\.actionConfigGroup\[data-permission-mode='full-access'\][^{]*\{[^}]*color:\s*var\(--opl-accent-orange\)\s*!important;/
    );
    expect(chatLayoutStyles).toMatch(
      /\.conversation-environment-trigger\s*\{[^}]*color:\s*var\(--text-secondary\)\s*!important;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-sider__item-label\s*\{[^}]*color:\s*var\(--text-primary\)\s*!important;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-sider__destination\s*\{[^}]*color:\s*var\(--text-secondary\)\s*!important;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-sider__destination:hover,[\s\S]*?\.settings-sider__destination--active\s*\{[^}]*color:\s*var\(--text-primary\)\s*!important;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-mobile-navigation__row\s*\{[^}]*color:\s*var\(--text-secondary\)\s*!important;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-mobile-navigation__row:hover,[\s\S]*?\.settings-mobile-navigation__row--active\s*\{[^}]*color:\s*var\(--text-primary\)\s*!important;/
    );

    expect(contrastRatio(lightFullAccess, lightBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkFullAccess, darkBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkSecondary, darkBackground)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps Settings navigation and grouped surfaces neutral', () => {
    const settingsStyles = read('packages/desktop/src/renderer/pages/settings/components/settings.css');
    const settingsWrapper = read('packages/desktop/src/renderer/pages/settings/components/SettingsPageWrapper.tsx');
    const settingsRegistry = read('packages/desktop/src/renderer/pages/settings/registry/settingsRegistry.tsx');
    const capabilities = read('packages/desktop/src/renderer/pages/settings/CapabilitiesSettings.tsx');
    const resources = read('packages/desktop/src/renderer/pages/settings/sections/ResourcesSettings.tsx');
    const localServices = read('packages/desktop/src/renderer/pages/settings/sections/LocalServicesSettings.tsx');
    const directoryPicker = read('packages/desktop/src/renderer/components/settings/DirectorySelectionModal.tsx');
    const agentHub = read('packages/desktop/src/renderer/pages/settings/AgentSettings/AgentHubModal.tsx');
    const channelItem = read(
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/ChannelItem.tsx'
    );
    const channelForms = [
      'DingTalkConfigForm.tsx',
      'WecomConfigForm.tsx',
      'TelegramConfigForm.tsx',
      'LarkConfigForm.tsx',
    ].map((fileName) =>
      read(`packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/${fileName}`)
    );
    const larkForm = read(
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/channels/LarkConfigForm.tsx'
    );
    const assistantDrawer = read(
      'packages/desktop/src/renderer/pages/settings/AssistantSettings/AssistantEditDrawer.tsx'
    );
    const oneClickImport = read('packages/desktop/src/renderer/pages/settings/components/OneClickImportModal.tsx');
    const refreshButton = read('packages/desktop/src/renderer/components/opl/OplRefreshIconButton.tsx');

    expect(settingsStyles).toContain('max-width: 760px;');
    expect(settingsWrapper).toContain("'settings-page-content mx-auto w-full'");
    expect(settingsWrapper).not.toContain('md:max-w-1024px');
    expect(capabilities).not.toContain("contentClassName='max-w-none'");
    expect(settingsStyles).toMatch(
      /\.opl-settings-details\s*{[^}]*border:\s*0;[^}]*border-top:\s*1px solid var\(--border-base\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-page-wrapper \.arco-btn > \.i-icon\s*{[^}]*width:\s*20px;[^}]*height:\s*20px;[^}]*background:\s*transparent;[^}]*color:\s*inherit;/
    );
    expect(settingsStyles).toMatch(
      /\.settings-page-wrapper \.arco-btn:not\(\.arco-btn-icon-only\) > \.i-icon \+ span\s*{[^}]*margin-left:\s*8px;/
    );
    expect(resources).toMatch(
      /data-testid='settings-resources-primary'[\s\S]*?<OplConnectionsSection[\s\S]*?id='workspace-resources'/
    );
    expect(localServices).toContain("className='opl-settings-flat-stack'");
    expect(localServices).not.toMatch(/\bCard\b|<Card/);
    expect(settingsStyles).not.toContain('inset 3px 0 0');
    expect(settingsRegistry).not.toContain('SETTINGS_ICON_COLORS');
    expect(settingsRegistry).toContain("from '@/renderer/components/opl/OplVisualProvider'");
    expect(settingsRegistry).toContain("<span className='inline-flex text-t-secondary'");
    expect(settingsRegistry).toContain('<OplIcon name={iconName} size={16} />');
    expect(settingsRegistry).toContain("icon: <OplIcon name='plugin' />");
    expect(settingsRegistry).not.toContain("from '@icon-park/react'");
    expect(settingsRegistry).not.toContain('@fortawesome');
    expect(directoryPicker).toContain("from '@icon-park/react'");
    expect(directoryPicker).not.toContain('@arco-design/web-react/icon');
    expect(directoryPicker).not.toMatch(/📁|📄/);
    expect(agentHub).toContain("from '@icon-park/react'");
    expect(agentHub).not.toContain('@arco-design/web-react/icon');
    expect(channelItem).toContain('export const ChannelEmptyState');
    expect(channelItem).toContain('export const ChannelPreferenceRow');
    expect(channelItem).toContain('export const ChannelStatusBadge');
    expect(channelItem).toContain("success: 'bg-success-1 text-success-6'");
    expect(channelItem).toContain("warning: 'bg-warning-1 text-warning-6'");
    expect(channelItem).toContain("danger: 'bg-danger-1 text-danger-6'");
    expect(channelItem).not.toContain('.arco-empty');
    for (const form of channelForms) {
      expect(form).toContain('ChannelEmptyState');
      expect(form).toContain('ChannelPreferenceRow');
      expect(form).toContain("from './ChannelItem';");
      expect(form).not.toMatch(/\bEmpty\b[\s\S]*from '@arco-design\/web-react'/);
      expect(form).not.toContain('<Empty');
      expect(form).not.toMatch(/style=\{\{ width: (240|260) \}\}/);
      expect(form).not.toMatch(/(?:bg|text|border)-(?:red|green|yellow)-\d+/);
      expect(form).not.toContain('rd-12px');
      expect(form).not.toMatch(/bg-fill-[12]\s+rd-8px/);
      expect(form.match(/border-0 border-t border-solid border-line/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
    expect(larkForm).toContain("data-testid='lark-optional-fields-toggle'");
    expect(larkForm).toContain('aria-expanded={showOptional}');
    expect(larkForm).toContain("aria-controls='lark-optional-fields'");
    expect(assistantDrawer).toContain("data-testid='assistant-edit-flat-content'");
    expect(assistantDrawer).toContain(
      "className='flex flex-col flex-1 gap-20px bg-transparent overflow-y-auto pr-4px'"
    );
    expect(assistantDrawer).toMatch(
      /className='flex items-start gap-8px border-0 border-t border-solid border-line py-12px'[\s\S]*?data-testid='assistant-builtin-readonly-banner'/
    );
    expect(assistantDrawer).toMatch(
      /data-testid='assistant-summary-row'[\s\S]*?<span className='text-12px font-500 text-t-primary'>/
    );
    expect(assistantDrawer).not.toContain('gap-16px bg-fill-2 rounded-16px p-20px overflow-y-auto');
    expect(oneClickImport).toContain('borderRadius: 8');
    expect(oneClickImport).toContain('fill={iconColors.brand}');
    expect(oneClickImport).not.toContain('borderRadius: 16');
    expect(oneClickImport).not.toContain("fill='#165dff'");
    expect(refreshButton).toContain("from '@icon-park/react'");
    expect(refreshButton).toContain("<Refresh aria-hidden='true' theme='outline' size={14} fill='currentColor' />");
    expect(refreshButton).not.toContain('@fortawesome');
  });

  it('keeps the agent directory readable at compact desktop widths without raw package enums', () => {
    const settingsStyles = read('packages/desktop/src/renderer/pages/settings/components/settings.css');
    const capabilities = read('packages/desktop/src/renderer/pages/settings/CapabilitiesSettings.tsx');
    const capabilityProjection = read('packages/desktop/src/renderer/pages/settings/capabilitiesProjection.ts');

    expect(settingsStyles).toMatch(
      /\.opl-settings-capability-row\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) max-content;[^}]*align-items:\s*flex-start;/
    );
    expect(settingsStyles).toMatch(
      /\.opl-settings-capability-description\s*{[^}]*overflow:\s*visible;[^}]*white-space:\s*normal;[^}]*text-overflow:\s*clip;/
    );
    expect(settingsStyles).toMatch(
      /@container settings-page \(max-width: 720px\)\s*{[\s\S]*?\.opl-settings-capability-row\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*?\.opl-settings-row__meta\.opl-settings-capability-meta\s*{[^}]*width:\s*100%;[^}]*flex-direction:\s*row;/
    );
    expect(capabilities).toContain('{item.description}');
    expect(capabilities).not.toContain('localizedCapabilitySummary');
    expect(capabilities).toContain('data-testid={`capability-product-details-${selectedCapability.key}`}');
    expect(capabilities).toContain("t('settings.uiOptimization.capabilities.details.triggerRules')");
    expect(capabilities).toContain('{selectedCapability.description}');
    expect(capabilities).toContain("t('settings.uiOptimization.capabilities.details.source')");
    expect(capabilities).toContain('{selectedSourceLabel}');
    expect(capabilities).toContain('data-testid={`capability-conversation-${item.key}`}');
    expect(capabilities).not.toContain('formatCapabilityDisplayToken(item.trustState)');
    expect(capabilities).not.toMatch(/item\.key === '(?:mas|mag|rca|obf)'/);
    expect(capabilityProjection).not.toContain('DISPLAY_TOKEN_LABELS');
    expect(capabilityProjection).not.toContain('formatCapabilityDisplayToken');
  });

  it('resets unused border sides before drawing Settings separators', () => {
    const separatorSources = [
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/AboutModalContent.tsx',
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/AppearanceModalContent.tsx',
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/SystemModalContent/index.tsx',
      'packages/desktop/src/renderer/components/settings/SettingsModal/contents/ToolsModalContent.tsx',
      'packages/desktop/src/renderer/pages/settings/AppearanceSettings/CssThemeSettings.tsx',
      'packages/desktop/src/renderer/pages/settings/SkillsHubSettings.tsx',
      'packages/desktop/src/renderer/pages/settings/StorageSettings/index.tsx',
      'packages/desktop/src/renderer/pages/settings/ToolsSettings/McpServerToolsList.tsx',
      'packages/desktop/src/renderer/pages/settings/sections/OverviewSettings.tsx',
      'packages/desktop/src/renderer/pages/settings/sections/ResourcesSettings.tsx',
      'packages/desktop/src/renderer/pages/settings/sections/RuntimeSettings.tsx',
    ];

    for (const relativePath of separatorSources) {
      expect(unsafeOneSidedBorderClasses(read(relativePath)), relativePath).toEqual([]);
    }
  });

  it('keeps active Home controls flat, compact, and outline-only', () => {
    const starters = read('packages/desktop/src/renderer/pages/guid/components/HomeStarters.tsx');
    const presetAgent = read('packages/desktop/src/renderer/pages/guid/components/PresetAgentTag.tsx');
    const mentionDropdown = read('packages/desktop/src/renderer/pages/guid/components/MentionDropdown.tsx');
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');
    const skills = read('packages/desktop/src/renderer/pages/settings/SkillsHubSettings.tsx');
    const runtime = read('packages/desktop/src/renderer/pages/settings/sections/RuntimeSettings.tsx');

    expect(starters).not.toContain('CheckOne');
    expect(starters).toContain('aria-pressed={active}');
    expect(presetAgent).toContain("<OplIcon name='checkSmall' size={14}");
    expect(presetAgent).toContain("<OplIcon name='closeFill' size={14}");
    expect(presetAgent).not.toContain('<span>✓</span>');
    expect(mentionDropdown).toContain("from '@/renderer/components/opl/OplVisualProvider'");
    expect(mentionDropdown).toContain("<OplIcon name='closeFill' size={12} />");
    expect(mentionDropdown).not.toContain("from '@icon-park/react'");
    expect(mentionDropdown).not.toContain('@arco-design/web-react/icon');
    expect(guidStyles).toMatch(/\.presetAgentTag\s*{[^}]*border:\s*0;[^}]*border-radius:\s*6px;/);
    expect(guidStyles).toMatch(
      /\.homeStarterActive:global\(\.arco-btn\)\s*{[^}]*border-color:\s*transparent\s*!important;[^}]*box-shadow:\s*inset 0 0 0 1px var\(--dsw-alias-button-ghost-active-border\)\s*!important;/
    );
    expect(skills).toContain("type='secondary'");
    expect(skills).toContain("data-testid='btn-manual-import'");
    expect(skills).toContain('group-focus-within:opacity-100');
    expect(runtime).toContain("data-testid='settings-maintenance-inline-updates'");
    expect(runtime).toContain("className='opl-settings-details opl-settings-surface--diagnostic'");
    expect(runtime).not.toContain("data-testid='settings-maintenance-management-details'");
    expect(runtime).not.toContain('visible={managementVisible}');
  });

  it('keeps Maintenance diagnostics as one flat disclosure', () => {
    const runtime = read('packages/desktop/src/renderer/pages/settings/sections/RuntimeSettings.tsx');
    const zhSettings = JSON.parse(read('packages/desktop/src/renderer/services/i18n/locales/zh-CN/settings.json'));
    const enSettings = JSON.parse(read('packages/desktop/src/renderer/services/i18n/locales/en-US/settings.json'));

    expect(zhSettings.oplEnvironmentPage.advancedDetails).toEqual({
      title: '诊断详情',
      description: '查看运行目录、日志位置和模块来源。',
    });
    expect(enSettings.oplEnvironmentPage.advancedDetails).toEqual({
      title: 'Diagnostics',
      description: 'View runtime folders, log locations, and module sources.',
    });
    expect(zhSettings.oplEnvironmentPage.status.verification_deferred).toBe('首次使用时检查');
    expect(enSettings.oplEnvironmentPage.status.verification_deferred).toBe('Checked on first use');
    expect(runtime).not.toContain("t('settings.oplEnvironmentPage.diagnostics.title')");
    expect(runtime).not.toContain("name='environment-diagnostics'");
  });

  it('keeps the Maintenance anchor consumer inside the page context provider', () => {
    const runtime = read('packages/desktop/src/renderer/pages/settings/sections/RuntimeSettings.tsx');
    const contentStart = runtime.indexOf('const RuntimeSettingsContent: React.FC = () => {');
    const anchorConsumer = runtime.indexOf('const selectedAnchor = useSettingsActiveAnchor();');
    const pageWrapper = runtime.indexOf('<SettingsPageWrapper>\n      <RuntimeSettingsContent />');

    expect(contentStart).toBeGreaterThanOrEqual(0);
    expect(anchorConsumer).toBeGreaterThan(contentStart);
    expect(pageWrapper).toBeGreaterThan(anchorConsumer);
  });

  it('uses the observed Codex conversation typography and unframed process rows', () => {
    const fontSizes = read('packages/desktop/src/common/config/fontSizes.ts');
    const markdown = read('packages/desktop/src/renderer/components/Markdown/ShadowView.tsx');
    const messages = read('packages/desktop/src/renderer/pages/conversation/Messages/components/MessageText.tsx');
    const messageStyles = read('packages/desktop/src/renderer/pages/conversation/Messages/messages.css');
    const chatLayoutStyles = read(
      'packages/desktop/src/renderer/pages/conversation/components/ChatLayout/chat-layout.css'
    );
    const titlebarStyles = read('packages/desktop/src/renderer/components/layout/Titlebar/titlebar.css');
    const toolStyles = read(
      'packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.css'
    );
    const messageList = read('packages/desktop/src/renderer/pages/conversation/Messages/MessageList.tsx');
    const thinkingStyles = read(
      'packages/desktop/src/renderer/pages/conversation/Messages/components/MessageThinking.module.css'
    );
    const fileChanges = read('packages/desktop/src/renderer/components/base/FileChangesPanel.tsx');

    expect(fontSizes).toContain('chat: { default: 15');
    expect(markdown).toContain('line-height: 1.4667;');
    expect(markdown).toContain('font-size: var(--chat-font-size, 15px);');
    expect(markdown).toContain('margin-block-start: 10px;');
    expect(markdown).toContain('margin-block-start: 2px;');
    expect(markdown).toContain('font-size: 12px;');
    expect(markdown).not.toMatch(/isMobile \? '19\.6px'|'28px'/);
    expect(messageStyles).toMatch(
      /\.message-item \.whitespace-pre-wrap\s*{[^}]*font-size:\s*var\(--chat-font-size, 15px\);[^}]*line-height:\s*1\.4667;/
    );
    expect(messageStyles).not.toMatch(/font-size:\s*14px\s*!important|line-height:\s*1\.4\s*!important/);
    expect(messages).toContain("className={classNames('h-20px flex items-center mt-2px gap-6px'");
    expect(messages).not.toContain("className={classNames('h-32px");
    expect(messages).toContain("'message-text-bubble--user p-6px md:p-8px': isUserMessage");
    expect(messages).not.toContain('bg-aou-2');
    expect(messages).not.toContain("borderRadius: '8px 0 8px 8px'");
    expect(chatLayoutStyles).toMatch(
      /\.message-text-bubble--user\s*\{[^}]*background:\s*var\(--color-fill-2, var\(--message-user-bg\)\);/
    );
    expect(chatLayoutStyles).toMatch(/\.message-text-bubble\s*\{[^}]*border-radius:\s*8px;/);
    expect(chatLayoutStyles).toMatch(
      /@media \(max-width:\s*1319px\)[\s\S]*\.conversation-environment-popover\s*\{[^}]*height:\s*min\(340px,\s*42dvh\);/
    );
    expect(chatLayoutStyles).not.toMatch(/conversation-timeline-surface[^}]*padding-(?:right|top)/);
    expect(titlebarStyles).toMatch(
      /\.app-titlebar--mobile-conversation\s*\{[^}]*background:\s*var\(--opl-main-bg, var\(--bg-1\)\)\s*!important;/
    );
    expect(titlebarStyles).not.toMatch(/\.app-titlebar--mobile-conversation\s*\{[^}]*linear-gradient/);
    expect(toolStyles).toMatch(/\.tool-group-summary__body\s*{[^}]*padding:\s*6px 0 0;/);
    expect(toolStyles).not.toMatch(/\.tool-group-summary__body\s*{[^}]*background:/);
    expect(messageList).toContain("data-testid='message-list-skeleton-lines'");
    expect(messageList).not.toContain("border: '1px solid var(--color-border-2)'");
    expect(thinkingStyles).toMatch(/\.body\s*{[^}]*border-left:\s*2px solid var\(--color-border-2\);/);
    expect(thinkingStyles).not.toMatch(/\.body\s*{[^}]*background:/);
    expect(fileChanges).toContain("variant?: 'panel' | 'conversation'");
    expect(fileChanges).toContain("compact ? 'py-2px'");
  });
});

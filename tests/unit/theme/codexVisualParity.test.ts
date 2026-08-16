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

function relativeLuminance(hex: string): number {
  const channels = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]?.match(/.{2}/g);
  if (!channels) throw new Error(`Expected a six-digit hex color, received ${hex}`);
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
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
    expect(searchEntry).toContain("'!w-32px !h-32px'");
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
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');
    const guidActionRow = read('packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx');
    const sessionMenuStyles = read('packages/desktop/src/renderer/components/agent/OplCodexSessionMenu.module.css');

    expect(firstCustomProperty(baseline, '--opl-sidebar-bg')).toBe('#fcfcfc');
    expect(firstCustomProperty(baseline, '--opl-sidebar-hover')).toBe('rgba(0, 0, 0, 0.045)');
    expect(firstCustomProperty(baseline, '--opl-sidebar-active')).toBe('#f0f0f0');
    expect(firstCustomProperty(baseline, '--text-primary')).toBe('var(--color-text-1)');
    expect(firstCustomProperty(baseline, '--text-secondary')).toBe('#5f6368');
    expect(firstCustomProperty(baseline, '--color-text-3')).toBe('#70757a');
    expect(layout).toContain("classNames('layout-sider'");
    expect(layout).not.toMatch(/classNames\(['"][^'"]*!bg-2[^'"]*layout-sider/);
    expect(layoutStyles).toMatch(/\.sider-section-label\s*{[^}]*background-color:\s*var\(--opl-sidebar-bg\);/);
    expect(unoConfig).toContain("'t-tertiary': 'var(--color-text-3)'");
    expect(customPropertyInBlock(baseline, 'body {', '--color-text-1')).toBe('#202124');
    expect(customPropertyInBlock(baseline, 'body {', '--color-text-3')).toBe('#70757a');
    expect(customPropertyInBlock(baseline, 'body {', '--color-border-2')).toBe('rgba(22, 24, 28, 0.08)');
    expect(customPropertyInBlock(baseline, 'body {', '--color-fill-3')).toBe('rgba(229, 229, 227, 0.76)');
    expect(customPropertyInBlock(baseline, "body[arco-theme='dark']", '--color-text-1')).toBe('#f4f5f6');
    expect(customPropertyInBlock(baseline, "body[arco-theme='dark']", '--color-text-3')).toBe('#9298a1');
    expect(customPropertyInBlock(baseline, "body[arco-theme='dark']", '--color-border-2')).toBe(
      'rgba(255, 255, 255, 0.08)'
    );
    expect(customPropertyInBlock(baseline, "body[arco-theme='dark']", '--color-fill-3')).toBe('#34363c');
    expect(baseline).toMatch(
      /\[data-color-scheme='default'\]\[data-theme='dark'\]\s*{[\s\S]*?--bg-2:\s*#202224;[\s\S]*?--text-primary:\s*var\(--color-text-1\);[\s\S]*?--text-secondary:\s*#aeb4bc;[\s\S]*?--dialog-fill-0:\s*#202224;/
    );
    expect(firstCustomProperty(codexPreset, '--opl-codex-sidebar-bg')).toBe('var(--opl-sidebar-bg)');
    expect(firstCustomProperty(codexPreset, '--opl-codex-sidebar-active')).toBe('var(--opl-sidebar-active)');
    expect(codexPreset).not.toContain('rgba(246, 246, 244, 0.84)');
    expect(codexPreset).toMatch(/\.layout-sider\s*{[^}]*background:\s*var\(--opl-codex-sidebar-bg\)\s*!important;/);
    expect(baseline).toContain('--opl-composer-shadow:');
    expect(baseline).toContain('--opl-composer-focus-shadow:');
    expect(firstCustomProperty(baseline, '--opl-composer-border-focus')).toBe('rgba(32, 33, 36, 0.24)');
    expect(firstCustomProperty(baseline, '--opl-composer-shadow')).toBe(
      '0 1px 2px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.05)'
    );
    expect(
      customPropertyInBlock(baseline, "[data-color-scheme='default'][data-theme='dark']", '--opl-composer-shadow')
    ).toBe('0 1px 2px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.18)');
    expect(firstCustomProperty(baseline, '--opl-composer-context-bg')).toBe('#f6f6f5');
    expect(firstCustomProperty(baseline, '--opl-composer-placeholder')).toBe('rgba(32, 33, 36, 0.42)');
    expect(firstCustomProperty(baseline, '--opl-composer-send-disabled')).toBe('#94979b');
    expect(focusRing).toContain("activeShadow: 'var(--opl-composer-focus-shadow)'");
    expect(focusRing).not.toMatch(/#E1E0FF|#4D4B87|rgba\(77, 75, 135/);
    expect(sendBox).toContain("boxShadow: isInputActive ? activeShadow : 'var(--opl-composer-shadow)'");
    expect(guidStyles).toContain('--opl-home-composer-shadow: var(--opl-composer-shadow);');
    expect(guidStyles).toContain('background: var(--dialog-fill-0);');
    expect(guidStyles).toContain('border: 1px solid var(--opl-composer-border);');
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
    expect(guidActionRow).toContain('compactLeadingIcon={<Shield {...OPL_CHROME_ICON_PROPS} size={14} />}');
    expect(guidActionRow).toContain('icon={<ArrowUp {...OPL_CHROME_ICON_PROPS} />}');
    expect(sendBox).toContain("icon={<ArrowUp {...OPL_CHROME_ICON_PROPS} aria-hidden='true' />}");
    expect(sessionMenuStyles).toMatch(
      /\.menuItem:global\(\.arco-dropdown-popup-visible\):focus-visible\s*{[^}]*outline:\s*none;/
    );
    const sendButtonBaseline = baseline.match(
      /\[data-color-scheme='default'\] \.send-button-custom\.arco-btn\s*{[^}]*}/
    )?.[0];
    expect(sendButtonBaseline).toMatch(
      /width:\s*32px;[^}]*min-width:\s*32px;[^}]*height:\s*32px;[^}]*border-width:\s*2px;[^}]*border-color:\s*transparent;[^}]*background-clip:\s*padding-box;/
    );
    expect(sendButtonBaseline).not.toContain('!important');
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
    const codexPreset = read('packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets/opl-codex.css');
    const baselineDarkSelector = "[data-color-scheme='default'][data-theme='dark']";
    const codexDarkSelector = "[data-theme='dark']";

    const lightMuted = firstCustomProperty(baseline, '--color-text-3');
    const lightFocus = firstCustomProperty(baseline, '--opl-focus-ring');
    const darkMuted = customPropertyInBlock(baseline, baselineDarkSelector, '--color-text-3');
    const darkFocus = customPropertyInBlock(baseline, baselineDarkSelector, '--opl-focus-ring');

    expect(lightMuted).toBe('#70757a');
    expect(lightFocus).toBe('#2563eb');
    expect(darkMuted).toBe('#9298a1');
    expect(darkFocus).toBe('#60a5fa');
    expect(firstCustomProperty(codexPreset, '--color-text-3')).toBe(lightMuted);
    expect(firstCustomProperty(codexPreset, '--opl-codex-sidebar-muted-text')).toBe(lightMuted);
    expect(firstCustomProperty(codexPreset, '--opl-codex-focus-ring')).toBe(lightFocus);
    expect(customPropertyInBlock(codexPreset, codexDarkSelector, '--color-text-3')).toBe(darkMuted);
    expect(customPropertyInBlock(codexPreset, codexDarkSelector, '--opl-codex-sidebar-muted-text')).toBe(darkMuted);
    expect(customPropertyInBlock(codexPreset, codexDarkSelector, '--opl-codex-focus-ring')).toBe(darkFocus);
    expect(firstCustomProperty(baseline, '--opl-composer-focus-shadow')).toContain('var(--opl-focus-ring)');
    expect(customPropertyInBlock(baseline, baselineDarkSelector, '--opl-composer-focus-shadow')).toContain(
      'var(--opl-focus-ring)'
    );

    for (const background of ['#ffffff', '#fcfcfc']) {
      expect(contrastRatio(lightMuted, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(lightFocus, background)).toBeGreaterThanOrEqual(3);
    }
    for (const background of ['#171819', '#202224', '#1b1c1e']) {
      expect(contrastRatio(darkMuted, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(darkFocus, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps normal text on Home, conversation, and Settings controls above the WCAG floor', () => {
    const baseline = read('packages/desktop/src/renderer/styles/themes/opl-product-baseline.css');
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');
    const chatLayoutStyles = read(
      'packages/desktop/src/renderer/pages/conversation/components/ChatLayout/chat-layout.css'
    );
    const settingsStyles = read('packages/desktop/src/renderer/pages/settings/components/settings.css');
    const baselineDarkSelector = "[data-color-scheme='default'][data-theme='dark']";

    const lightFullAccess = firstCustomProperty(baseline, '--opl-accent-orange');
    const darkSecondary = customPropertyInBlock(baseline, baselineDarkSelector, '--text-secondary');

    expect(lightFullAccess).toBe('#c2410c');
    expect(darkSecondary).toBe('#aeb4bc');
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

    for (const background of ['#ffffff', '#fcfcfc']) {
      expect(contrastRatio(lightFullAccess, background)).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of ['#171819', '#1b1c1e', '#202224']) {
      expect(contrastRatio(darkSecondary, background)).toBeGreaterThanOrEqual(4.5);
    }
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
    expect(settingsRegistry).toContain("from '@icon-park/react'");
    expect(settingsRegistry).toContain("<span className='inline-flex text-t-secondary'");
    expect(settingsRegistry).toContain('{icon(16)}');
    expect(settingsRegistry).toContain('<Puzzle {...OPL_CHROME_ICON_PROPS} size={size} />');
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
    expect(presetAgent).toContain("<CheckOne theme='outline'");
    expect(presetAgent).toContain("<CloseSmall theme='outline'");
    expect(presetAgent).not.toContain('<span>✓</span>');
    expect(mentionDropdown).toContain("import { CloseSmall, Down, Robot } from '@icon-park/react';");
    expect(mentionDropdown).toContain("<CloseSmall theme='outline' size={12} fill='currentColor' />");
    expect(mentionDropdown).not.toContain('@arco-design/web-react/icon');
    expect(guidStyles).toMatch(/\.presetAgentTag\s*{[^}]*border:\s*0;[^}]*border-radius:\s*6px;/);
    expect(guidStyles).toMatch(
      /\.homeStarterActive:global\(\.arco-btn\)\s*{[^}]*border-color:\s*transparent\s*!important;[^}]*box-shadow:\s*none\s*!important;/
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

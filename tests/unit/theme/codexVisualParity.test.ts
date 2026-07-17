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

function unsafeOneSidedBorderClasses(source: string): string[] {
  return [...source.matchAll(/className=['"]([^'"]*)['"]/g)]
    .map((match) => match[1] ?? '')
    .filter((className) => /\bborder-(?:t|b|l|r)\b/.test(className) && /\bborder-solid\b/.test(className))
    .filter((className) => !/\bborder-0\b/.test(className));
}

describe('Codex visual parity overlay', () => {
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
    const focusRing = read('packages/desktop/src/renderer/hooks/chat/useInputFocusRing.ts');
    const sendBox = read('packages/desktop/src/renderer/components/chat/SendBox/index.tsx');
    const sendBoxStyles = read('packages/desktop/src/renderer/components/chat/SendBox/sendbox.css');
    const guidStyles = read('packages/desktop/src/renderer/pages/guid/index.module.css');

    expect(firstCustomProperty(baseline, '--opl-sidebar-bg')).toBe('#fcfcfc');
    expect(firstCustomProperty(baseline, '--opl-sidebar-hover')).toBe('rgba(0, 0, 0, 0.045)');
    expect(firstCustomProperty(baseline, '--opl-sidebar-active')).toBe('#f0f0f0');
    expect(firstCustomProperty(baseline, '--text-primary')).toBe('#202124');
    expect(firstCustomProperty(baseline, '--text-secondary')).toBe('#5f6368');
    expect(firstCustomProperty(baseline, '--color-text-3')).toBe('#80868b');
    expect(baseline).toMatch(
      /\[data-color-scheme='default'\]\[data-theme='dark'\]\s*{[\s\S]*?--bg-2:\s*#202224;[\s\S]*?--text-primary:\s*#f4f5f6;[\s\S]*?--text-secondary:\s*#aeb4bc;[\s\S]*?--dialog-fill-0:\s*#202224;/
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
    expect(focusRing).toContain("activeShadow: 'var(--opl-composer-focus-shadow)'");
    expect(focusRing).not.toMatch(/#E1E0FF|#4D4B87|rgba\(77, 75, 135/);
    expect(sendBox).toContain("boxShadow: isInputActive ? activeShadow : 'var(--opl-composer-shadow)'");
    expect(guidStyles).toContain('--opl-home-composer-shadow: var(--opl-composer-shadow);');
    expect(guidStyles).toContain('background: var(--dialog-fill-0);');
    expect(guidStyles).toContain('border: 1px solid var(--opl-composer-border);');
    expect(guidStyles).toContain('color: var(--color-text-3) !important;');
    expect(guidStyles).not.toContain('background: #262626;');
    expect(guidStyles).not.toContain('border-color: #3a3a3a;');
    expect(guidStyles).not.toContain('color: #b4b5bc');
    expect(guidStyles).toMatch(
      /\.actionConfigGroup :global\(\.sendbox-model-btn\)\s*{[^}]*font-size:\s*12px\s*!important;/
    );
    expect(sendBoxStyles).toMatch(
      /\.sendbox-tools \.sendbox-model-btn,[\s\S]*?font-size:\s*12px\s*!important;[\s\S]*?line-height:\s*18px\s*!important;/
    );
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
      'WeixinConfigForm.tsx',
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
    expect(settingsRegistry).toContain("<Puzzle theme='outline' size='16' />");
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

    expect(starters).toContain("<CheckOne theme='outline' size={14} fill='currentColor' />");
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
    expect(runtime).toContain('flex min-w-0 flex-wrap items-center justify-start gap-8px sm:justify-end');
  });

  it('uses the observed Codex conversation typography and unframed process rows', () => {
    const fontSizes = read('packages/desktop/src/common/config/fontSizes.ts');
    const markdown = read('packages/desktop/src/renderer/components/Markdown/ShadowView.tsx');
    const messages = read('packages/desktop/src/renderer/pages/conversation/Messages/components/MessageText.tsx');
    const messageStyles = read('packages/desktop/src/renderer/pages/conversation/Messages/messages.css');
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

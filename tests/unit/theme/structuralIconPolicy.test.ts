import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformIconParkImports } from '../../../packages/desktop/electron.vite.config';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const rendererRoot = path.join(repoRoot, 'packages/desktop/src/renderer');
const dshVendorRoot = path.join(rendererRoot, 'vendor/deepseek-harness');
const legacyImportPattern = /@fortawesome|@arco-design\/web-react\/icon/;
const iconParkImportPattern = /from ['"]@icon-park\/react['"]/;
const structuralEmojiPattern = /[⚠✗✓📄❌💾✏🔍📋🎭🎙🧠‼🔐📖🌐⚡🔌💡]/u;

type ChromeIconPolicyTarget = {
  relativePath: string;
  ownedCallsites: readonly string[];
  forbiddenPatterns?: readonly RegExp[];
};

const structuralIconFiles = [
  'packages/desktop/src/renderer/components/media/HorizontalFileList.tsx',
  'packages/desktop/src/renderer/components/agent/ChannelConflictWarning.tsx',
  'packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs.tsx',
  'packages/desktop/src/renderer/pages/conversation/components/ConversationTitleMinimap/index.tsx',
  'packages/desktop/src/renderer/pages/conversation/Messages/components/MessagePlan.tsx',
  'packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolCall.tsx',
  'packages/desktop/src/renderer/pages/conversation/Preview/components/viewers/PDFViewer.tsx',
  'packages/desktop/src/renderer/pages/conversation/Preview/components/viewers/HTMLViewer.tsx',
  'packages/desktop/src/renderer/pages/team/components/TeamTabs.tsx',
  'packages/desktop/src/renderer/pages/team/components/TeamChatEmptyState.tsx',
  'packages/desktop/src/renderer/pages/conversation/Messages/acp/MessageAcpPermission.tsx',
  'packages/desktop/src/renderer/pages/conversation/Messages/components/MessagePermission.tsx',
  'packages/desktop/src/renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx',
  'packages/desktop/src/renderer/pages/settings/components/EditModeModal.tsx',
] as const;

const phaseOneVisualSurfaceFiles = [
  'packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx',
  'packages/desktop/src/renderer/components/agent/AgentModeSelector.tsx',
  'packages/desktop/src/renderer/components/agent/OplCodexSessionMenu.tsx',
  'packages/desktop/src/renderer/components/layout/Titlebar/index.tsx',
  'packages/desktop/src/renderer/components/layout/Layout.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/CronJobSiderSection/CronJobSiderItem.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/CronJobSiderSection/CronJobSiderSection.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/SiderFooter.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/SiderItem.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderPrimaryNav.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderToolbar.tsx',
  'packages/desktop/src/renderer/components/layout/Sider/TeamSiderSection.tsx',
  'packages/desktop/src/renderer/components/media/FileAttachButton.tsx',
  'packages/desktop/src/renderer/components/chat/MobileActionSheet/MobileActionSheet.tsx',
  'packages/desktop/src/renderer/components/chat/MobileActionSheet/useAttachEntry.tsx',
  'packages/desktop/src/renderer/components/chat/SendBox/index.tsx',
  'packages/desktop/src/renderer/components/chat/composer/ComposerCapabilityPalette/ComposerCapabilityPalette.tsx',
  'packages/desktop/src/renderer/components/chat/composer/SpeechInputButton.tsx',
  'packages/desktop/src/renderer/pages/conversation/GroupedHistory/ConversationRow.tsx',
  'packages/desktop/src/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover.tsx',
  'packages/desktop/src/renderer/pages/conversation/GroupedHistory/DragOverlayContent.tsx',
  'packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx',
  'packages/desktop/src/renderer/pages/conversation/components/WorkspaceCollapse.tsx',
  'packages/desktop/src/renderer/pages/conversation/platforms/acp/AcpSendBox.tsx',
  'packages/desktop/src/renderer/pages/guid/CapabilitiesPage.tsx',
  'packages/desktop/src/renderer/pages/guid/PackageContributionPage.tsx',
  'packages/desktop/src/renderer/pages/guid/components/AgentPillBar.tsx',
  'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
  'packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx',
  'packages/desktop/src/renderer/pages/guid/components/GuidSetupNotice.tsx',
  'packages/desktop/src/renderer/pages/guid/components/GuidWorkspaceContextBar.tsx',
  'packages/desktop/src/renderer/pages/guid/components/GuidWorkspaceManagementModal.tsx',
  'packages/desktop/src/renderer/pages/guid/components/HomeStarters.tsx',
  'packages/desktop/src/renderer/pages/guid/components/MentionDropdown.tsx',
  'packages/desktop/src/renderer/pages/guid/components/PresetAgentTag.tsx',
  'packages/desktop/src/renderer/pages/settings/components/SettingsPageWrapper.tsx',
  'packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx',
  'packages/desktop/src/renderer/pages/settings/registry/settingsRegistry.tsx',
] as const;

const deferredVisualSurfaceFiles = [
  'packages/desktop/src/renderer/components/layout/Sider/FirstRunSetupEntry.tsx',
] as const;

const oplVisualIconTargets = [
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Titlebar/index.tsx',
    ownedCallsites: ["<OplIcon name='help' data-testid='app-titlebar-help-icon' aria-hidden='true' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Layout.tsx',
    ownedCallsites: ["<OplIcon name='panelLeft' aria-hidden='true' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderPrimaryNav.tsx',
    ownedCallsites: ["icon: <OplIcon name='data' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderToolbar.tsx',
    ownedCallsites: ["<OplIcon name='newChat'"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Sider/SiderFooter.tsx',
    ownedCallsites: ["<OplIcon name='settings' className='block leading-none' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/chat/SendBox/index.tsx',
    ownedCallsites: ["icon={<OplIcon name='send' aria-hidden='true' />}"],
  },
  {
    relativePath:
      'packages/desktop/src/renderer/components/chat/composer/ComposerCapabilityPalette/ComposerCapabilityPalette.tsx',
    ownedCallsites: ["prefix={<OplIcon name='search' size={14} aria-hidden='true' />}"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/settings/registry/settingsRegistry.tsx',
    ownedCallsites: ['<OplIcon name={iconName} size={16} />'],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx',
    ownedCallsites: ["<OplIcon name='chevronLeft' aria-hidden='true' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/settings/components/SettingsPageWrapper.tsx',
    ownedCallsites: ["prefix={<OplIcon name='search' aria-hidden='true' />}"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx',
    ownedCallsites: ["<OplIcon name='chevronDown' size={16} className='shrink-0' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx',
    ownedCallsites: ["<OplIcon name='chevronDown' size={12} className='shrink-0' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/agent/AgentModeSelector.tsx',
    ownedCallsites: ["{canInteract && <OplIcon name='chevronDown' size={12} className='text-t-tertiary shrink-0' />}"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/guid/components/HomeStarters.tsx',
    ownedCallsites: ["return <OplIcon name='research' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/chat/composer/SpeechInputButton.tsx',
    ownedCallsites: ["<OplIcon name='microphone' aria-hidden='true' />"],
  },
] as const satisfies readonly ChromeIconPolicyTarget[];

const read = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const collectTypeScriptFiles = (directory: string): string[] => {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(absolutePath);
    return /\.tsx?$/.test(entry.name) ? [absolutePath] : [];
  });
};

const sha256 = (absolutePath: string): string =>
  createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');

describe('structural icon policy', () => {
  it('transforms aliased IconPark imports without emitting invalid identifiers', () => {
    const transformed = transformIconParkImports(
      "import { Error as ErrorIcon, FilePdf, Open } from '@icon-park/react';\nconst view = ErrorIcon;"
    );

    expect(transformed).toContain('import { Error as _ErrorIcon, FilePdf as _FilePdf, Open as _Open }');
    expect(transformed).toContain('const ErrorIcon = IconParkHOC(_ErrorIcon);');
    expect(transformed).toContain('const FilePdf = IconParkHOC(_FilePdf);');
    expect(transformed).not.toContain('Error as ErrorIcon as');
  });

  it('keeps legacy icon packages out of active renderer files outside the owned refresh migration lane', () => {
    const legacyFiles = collectTypeScriptFiles(rendererRoot)
      .filter((absolutePath) => !absolutePath.endsWith('/components/opl/OplRefreshIconButton.tsx'))
      .filter((absolutePath) => legacyImportPattern.test(fs.readFileSync(absolutePath, 'utf8')))
      .map((absolutePath) => path.relative(repoRoot, absolutePath));

    expect(legacyFiles).toEqual([]);
  });

  it.each(structuralIconFiles)('%s keeps IconPark outline glyphs on unmigrated upstream surfaces', (relativePath) => {
    const source = read(relativePath);

    expect(source).toContain("from '@icon-park/react'");
    expect(source).not.toMatch(legacyImportPattern);
    expect(source).not.toMatch(structuralEmojiPattern);
  });

  it('pins the DSH cohort and keeps compatibility glyphs behind one OplVisualProvider', () => {
    const visualAdapter = read('packages/desktop/src/renderer/components/opl/OplVisualProvider.tsx');
    const upstreamWrapper = read('packages/desktop/src/renderer/components/IconParkHOC.tsx');
    const manifestPath = path.join(dshVendorRoot, 'visual-source-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      upstream: { commit: string; license: string };
      source_policy: { runtime_authority_imported: boolean; toolchain_compatibility_normalizations: unknown[] };
      vendored_files: Array<{ path: string; sha256: string }>;
    };

    expect(manifest.upstream).toMatchObject({
      commit: '47f943859bef60e4160492346772ded9b24f765a',
      license: 'MIT',
    });
    expect(manifest.source_policy.runtime_authority_imported).toBe(false);
    expect(manifest.source_policy.toolchain_compatibility_normalizations).toHaveLength(1);
    expect(fs.existsSync(path.join(dshVendorRoot, 'LICENSE'))).toBe(true);
    for (const entry of manifest.vendored_files) {
      expect(sha256(path.join(dshVendorRoot, entry.path))).toBe(entry.sha256);
    }

    expect(visualAdapter).toContain('OPL_DSH_VISUAL_SOURCE_COMMIT');
    expect(visualAdapter).toContain('OplVisualProvider');
    expect(visualAdapter).toContain('OplIcon');
    expect(visualAdapter).toContain('data-opl-icon-source');
    expect(visualAdapter).toContain('deepseek-harness');
    expect(visualAdapter).toContain('icon-park-compatibility');
    expect(visualAdapter).toContain('data-ds-dark-theme');
    expect(visualAdapter).not.toContain('useOplAppState');
    expect(visualAdapter).not.toContain('ipcBridge');
    expect(upstreamWrapper).not.toContain('OPL_CHROME_ICON_PROPS');
  });

  it('keeps phase-one visual surfaces on OplIcon and records first-run as the deferred exception', () => {
    for (const relativePath of phaseOneVisualSurfaceFiles) {
      const source = read(relativePath);
      expect(source, relativePath).not.toMatch(iconParkImportPattern);
      expect(source, relativePath).toContain("from '@/renderer/components/opl/OplVisualProvider'");
      expect(source, relativePath).toContain('OplIcon');
    }

    for (const relativePath of deferredVisualSurfaceFiles) {
      const source = read(relativePath);
      expect(source, relativePath).toMatch(iconParkImportPattern);
      expect(source, relativePath).toContain('<Config');
    }
  });

  it.each(oplVisualIconTargets)(
    '$relativePath uses the OplIcon adapter at its owned callsites',
    ({ relativePath, ownedCallsites }) => {
      const source = read(relativePath);

      expect(ownedCallsites.length).toBeGreaterThan(0);
      expect(source).toContain("from '@/renderer/components/opl/OplVisualProvider'");
      for (const ownedCallsite of ownedCallsites) expect(source).toContain(ownedCallsite);
    }
  );
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformIconParkImports } from '../../../packages/desktop/electron.vite.config';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const rendererRoot = path.join(repoRoot, 'packages/desktop/src/renderer');
const legacyImportPattern = /@fortawesome|@arco-design\/web-react\/icon/;
const structuralEmojiPattern = /[⚠✗✓📄❌💾✏🔍📋🎭🎙🧠‼🔐📖🌐⚡🔌💡]/u;

type ChromeIconPolicyTarget = {
  relativePath: string;
  ownedCallsites: readonly string[];
  forbiddenPatterns?: readonly RegExp[];
};

const structuralIconFiles = [
  'packages/desktop/src/renderer/components/layout/Titlebar/index.tsx',
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
  'packages/desktop/src/renderer/pages/conversation/GroupedHistory/index.tsx',
  'packages/desktop/src/renderer/pages/conversation/Messages/acp/MessageAcpPermission.tsx',
  'packages/desktop/src/renderer/pages/conversation/Messages/components/MessagePermission.tsx',
  'packages/desktop/src/renderer/components/settings/SettingsModal/contents/ModelModalContent.tsx',
  'packages/desktop/src/renderer/pages/settings/components/EditModeModal.tsx',
] as const;

const oplChromeIconTargets = [
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Titlebar/index.tsx',
    ownedCallsites: ["<LeftBar aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />"],
    forbiddenPatterns: [/const SidebarIcon/],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/WindowControls.tsx',
    ownedCallsites: ["<SquareSmall {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' />"],
    forbiddenPatterns: [/const WindowMaximizeIcon/, /const WindowRestoreIcon/],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Layout.tsx',
    ownedCallsites: ["<LeftBar {...OPL_CHROME_ICON_PROPS} aria-hidden='true' />"],
    forbiddenPatterns: [/const SidebarIcon/],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderPrimaryNav.tsx',
    ownedCallsites: ['icon: <ChartLine {...OPL_CHROME_ICON_PROPS} />'],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Sider/SiderNav/SiderToolbar.tsx',
    ownedCallsites: ['<Plus\n              {...OPL_CHROME_ICON_PROPS}\n              className='],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/layout/Sider/SiderFooter.tsx',
    ownedCallsites: ["<SettingTwo {...OPL_CHROME_ICON_PROPS} className='block leading-none'"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx',
    ownedCallsites: ["<ArrowLeft aria-hidden='true' {...OPL_CHROME_ICON_PROPS} />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/settings/components/SettingsPageWrapper.tsx',
    ownedCallsites: ['prefix={<Search {...OPL_CHROME_ICON_PROPS} />}'],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/settings/registry/settingsRegistry.tsx',
    ownedCallsites: ['dashboard: (size) => <DashboardOne {...OPL_CHROME_ICON_PROPS} size={size} />'],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/guid/components/GuidActionRow.tsx',
    ownedCallsites: ['icon={<ArrowUp {...OPL_CHROME_ICON_PROPS} />}'],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/guid/components/GuidModelSelector.tsx',
    ownedCallsites: ["<Down {...OPL_CHROME_ICON_PROPS} size={12} className='shrink-0' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/agent/AcpModelSelector.tsx',
    ownedCallsites: ["<Down {...OPL_CHROME_ICON_PROPS} size={12} className='shrink-0' />"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/agent/AgentModeSelector.tsx',
    ownedCallsites: [
      "{canInteract && <Down {...OPL_CHROME_ICON_PROPS} size={12} className='text-t-tertiary shrink-0' />}",
    ],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/chat/SendBox/index.tsx',
    ownedCallsites: ["icon={<ArrowUp {...OPL_CHROME_ICON_PROPS} aria-hidden='true' />}"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/pages/guid/components/HomeStarters.tsx',
    ownedCallsites: ['return <Microscope {...OPL_CHROME_ICON_PROPS} />'],
  },
  {
    relativePath:
      'packages/desktop/src/renderer/components/chat/composer/ComposerCapabilityPalette/ComposerCapabilityPalette.tsx',
    ownedCallsites: ["prefix={<Search {...OPL_CHROME_ICON_PROPS} size={14} aria-hidden='true' />}"],
  },
  {
    relativePath: 'packages/desktop/src/renderer/components/chat/composer/SpeechInputButton.tsx',
    ownedCallsites: ["<Microphone {...OPL_CHROME_ICON_PROPS} aria-hidden='true' />"],
    forbiddenPatterns: [/const SpeechMicIcon/],
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

  it.each(structuralIconFiles)('%s uses IconPark outline glyphs without structural emoji fallbacks', (relativePath) => {
    const source = read(relativePath);

    expect(source).toContain("from '@icon-park/react'");
    expect(source).not.toMatch(legacyImportPattern);
    expect(source).not.toMatch(structuralEmojiPattern);
  });

  it('defines one Codex-aligned optical contract without changing the upstream-wide IconPark wrapper', () => {
    const source = read('packages/desktop/src/renderer/components/opl/oplChromeIcon.ts');
    const visualAdapter = read('packages/desktop/src/renderer/components/opl/OplVisualProvider.tsx');
    const upstreamWrapper = read('packages/desktop/src/renderer/components/IconParkHOC.tsx');

    expect(source).toMatch(/export const OPL_CHROME_ICON_SIZE\s*=\s*16\b/);
    expect(source).toMatch(/export const OPL_CHROME_ICON_STROKE_WIDTH\s*=\s*4\.5\b/);
    expect(source).toMatch(/size:\s*OPL_CHROME_ICON_SIZE\b/);
    expect(source).toMatch(/strokeWidth:\s*OPL_CHROME_ICON_STROKE_WIDTH\b/);
    expect(source).toMatch(/theme:\s*['"]outline['"]/);
    expect(source).toMatch(/fill:\s*['"]currentColor['"]/);
    expect(visualAdapter).toContain('OplVisualProvider');
    expect(visualAdapter).toContain('OplIcon');
    expect(visualAdapter).not.toContain('useOplAppState');
    expect(visualAdapter).not.toContain('ipcBridge');
    expect(upstreamWrapper).not.toContain('OPL_CHROME_ICON_PROPS');
  });

  it.each(oplChromeIconTargets)(
    '$relativePath keeps its listed OPL-owned chrome callsites on the shared optical contract',
    ({ relativePath, ownedCallsites, forbiddenPatterns = [] }) => {
      const source = read(relativePath);

      expect(ownedCallsites.length).toBeGreaterThan(0);
      expect(source).toContain("from '@/renderer/components/opl/oplChromeIcon'");
      for (const forbiddenPattern of forbiddenPatterns) expect(source).not.toMatch(forbiddenPattern);
      for (const ownedCallsite of ownedCallsites) expect(source).toContain(ownedCallsite);
    }
  );
});

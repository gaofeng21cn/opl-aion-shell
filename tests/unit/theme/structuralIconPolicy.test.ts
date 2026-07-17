import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const rendererRoot = path.join(repoRoot, 'packages/desktop/src/renderer');
const legacyImportPattern = /@fortawesome|@arco-design\/web-react\/icon/;
const structuralEmojiPattern = /[⚠✗✓📄❌💾✏🔍📋🎭🎙🧠‼🔐📖🌐⚡🔌💡]/u;

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

const read = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const collectTypeScriptFiles = (directory: string): string[] => {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(absolutePath);
    return /\.tsx?$/.test(entry.name) ? [absolutePath] : [];
  });
};

describe('structural icon policy', () => {
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
});

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { localFileRef, projectFileRef, uploadFileRef } from '@/common/types/chatFile';
import { localSelectionItems } from '@/renderer/utils/file/fileSelection';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { collectChatFileRefs, splitChatFileRefs } from '@/renderer/utils/file/messageFiles';

describe('collectChatFileRefs', () => {
  const projectItem = (pe_id: string, relative_path: string): FileOrFolderItem => ({
    path: `/projects/${relative_path}`,
    name: relative_path.split('/').pop() ?? relative_path,
    isFile: true,
    chatRef: projectFileRef(pe_id, relative_path),
  });

  it('tags browser/device uploads as upload refs', () => {
    expect(collectChatFileRefs(['/tmp/a.txt'], [])).toEqual([{ kind: 'upload', path: '/tmp/a.txt' }]);
  });

  it('preserves Project Explorer and backend-machine source identity', () => {
    expect(
      collectChatFileRefs([], [projectItem('pe-1', 'src/main.ts'), ...localSelectionItems(['/projects/note.md'])])
    ).toEqual([
      { kind: 'project', pe_id: 'pe-1', relative_path: 'src/main.ts' },
      { kind: 'local', path: '/projects/note.md' },
    ]);
  });

  it('treats untagged legacy workspace selections as local backend paths', () => {
    expect(collectChatFileRefs([], [{ path: '/projects/legacy.txt', name: 'legacy.txt', isFile: true }])).toEqual([
      { kind: 'local', path: '/projects/legacy.txt' },
    ]);
  });

  it('deduplicates by source-tagged identity', () => {
    expect(
      collectChatFileRefs(['/tmp/a.txt', '/tmp/a.txt'], [projectItem('pe-1', 'a.txt'), projectItem('pe-1', 'a.txt')])
    ).toEqual([
      { kind: 'upload', path: '/tmp/a.txt' },
      { kind: 'project', pe_id: 'pe-1', relative_path: 'a.txt' },
    ]);
  });
});

describe('splitChatFileRefs', () => {
  it('round-trips upload, project, and local refs through send-box lanes', () => {
    const refs = [uploadFileRef('/tmp/a.txt'), projectFileRef('pe-1', 'src/main.ts'), localFileRef('/projects/b.md')];
    const restored = splitChatFileRefs(refs);
    expect(restored.uploadFiles).toEqual(['/tmp/a.txt']);
    expect(collectChatFileRefs(restored.uploadFiles, restored.atPath)).toEqual(refs);
  });
});

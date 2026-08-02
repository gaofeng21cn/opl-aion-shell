/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDescriptor, CodexThreadDirectory } from '@/common/types/codex/appServerThreads';
import {
  getSidebarStreamGuardDecision,
  mergeCanonicalThreadDirectory,
  visibleConversationIds,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import {
  filterConversationsForHistorySurface,
  filterHistoryToConversationIds,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversations';
import { groupConversationsByWorkspace } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

const thread = (overrides: Partial<CodexThreadDescriptor> = {}): CodexThreadDescriptor => ({
  id: 'thread-1',
  title: 'Canonical task',
  summary: 'App Server summary',
  status: 'idle',
  projectId: 'project',
  workspace: '/tmp/project',
  host: 'host-a',
  owner: null,
  goal: null,
  parentThreadId: null,
  ancestorThreadIds: [],
  activeTurnId: null,
  archived: false,
  updatedAt: '2026-07-13T00:00:00.000Z',
  ...overrides,
});

const directory = (threads: CodexThreadDescriptor[], complete = true): CodexThreadDirectory => ({
  schema: 'opl_codex_thread_directory.v1',
  host: 'host-a',
  complete,
  threads,
});

describe('getSidebarStreamGuardDecision', () => {
  it('marks normal generating stream messages', () => {
    expect(getSidebarStreamGuardDecision({ type: 'content', completed: false })).toEqual({
      markGenerating: true,
      clearCompleted: false,
      lateIgnored: false,
    });
  });

  it('ignores late stream messages after turn completion', () => {
    expect(getSidebarStreamGuardDecision({ type: 'content', completed: true })).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    });
  });

  it('allows a new start event to clear the completion guard', () => {
    expect(getSidebarStreamGuardDecision({ type: 'start', completed: true })).toEqual({
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    });
  });

  it('ignores non-generating messages', () => {
    expect(getSidebarStreamGuardDecision({ type: 'slash_commands_updated', completed: true })).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    });
  });
});

describe('mergeCanonicalThreadDirectory', () => {
  it('projects a canonical task from explicit project affinity rather than recorded cwd', () => {
    const [projected] = mergeCanonicalThreadDirectory([], directory([thread()]));

    expect(projected).toMatchObject({
      id: 'thread-1',
      name: 'Canonical task',
      type: 'acp',
      extra: {
        backend: 'codex',
        acp_session_id: 'thread-1',
        canonical_thread_stub: true,
        workspace: '/tmp/project',
        custom_workspace: true,
        canonical_project_id: 'project',
      },
    });
    expect(groupConversationsByWorkspace([projected], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({ workspace: 'project' }),
      }),
    ]);
  });

  it('keeps a managed Documents Codex task projectless and ungrouped', () => {
    const workspace = '/Users/example/Documents/Codex/2026-07-28/temporary-task';
    const [projected] = mergeCanonicalThreadDirectory([], directory([thread({ workspace, projectId: '' })]));

    expect(projected.extra).toMatchObject({ workspace, custom_workspace: false });
    expect(groupConversationsByWorkspace([projected], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({ type: 'conversation', conversation: projected }),
    ]);
  });

  it('auto-loads an unregistered canonical cwd as a directory group', () => {
    const legacy = {
      id: 'legacy-codex',
      name: 'Legacy task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'legacy-thread',
        workspace: '/tmp/runtime-only',
        custom_workspace: true,
      },
    } as TChatConversation;

    expect(groupConversationsByWorkspace([legacy], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({ workspace: '/tmp/runtime-only', conversations: [legacy] }),
      }),
    ]);
  });

  it('keeps a canonical task without cwd projectless and ungrouped', () => {
    const [projected] = mergeCanonicalThreadDirectory([], directory([thread({ workspace: '', projectId: '' })]));

    expect(projected.extra).toMatchObject({ workspace: '', custom_workspace: false });
    expect(groupConversationsByWorkspace([projected], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({ type: 'conversation', conversation: projected }),
    ]);
  });

  it('keeps Linux, Windows, and WSL managed Codex scratch paths ungrouped', () => {
    for (const workspace of [
      '/home/example/Documents/Codex/2026-08-02/temporary-task',
      'C:\\Users\\example\\Documents\\Codex\\2026-08-02\\temporary-task',
      '/mnt/c/Users/example/Documents/Codex/2026-08-02/temporary-task',
    ]) {
      const [projected] = mergeCanonicalThreadDirectory([], directory([thread({ workspace, projectId: '' })]));

      expect(groupConversationsByWorkspace([projected], (key) => key)[0]?.items).toEqual([
        expect.objectContaining({ type: 'conversation', conversation: projected }),
      ]);
    }
  });

  it('keeps explicit project affinity when canonical recorded cwd is absent', () => {
    const [projected] = mergeCanonicalThreadDirectory([], directory([thread({ workspace: '', projectId: 'project' })]));

    expect(projected.extra).toMatchObject({
      workspace: '',
      custom_workspace: true,
      canonical_project_id: 'project',
    });
  });

  it('preserves an explicitly projectless marker until the canonical cwd is adopted', () => {
    const cached = {
      id: 'local-projectless',
      name: 'Projectless task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '/tmp/stale-runtime-default',
        custom_workspace: false,
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread({ workspace: '', projectId: '' })]));

    expect(projected.extra).toMatchObject({ workspace: '', custom_workspace: false });
  });

  it('groups a canonical recorded cwd without rebuilding project affinity', () => {
    const cached = {
      id: 'local-stale-projectless',
      name: 'Stale projectless task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '',
        custom_workspace: false,
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread({ projectId: '' })]));

    expect(projected.extra).toMatchObject({ workspace: '/tmp/project', custom_workspace: false });
    expect(projected.extra.canonical_project_id).toBeUndefined();
    expect(groupConversationsByWorkspace([projected], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({ workspace: '/tmp/project' }),
      }),
    ]);
  });

  it('keeps a legacy missing explicit affinity marker projectless', () => {
    const cached = {
      id: 'local-legacy',
      name: 'Legacy task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread({ projectId: '' })]));

    expect(projected.extra).toMatchObject({ workspace: '/tmp/project', custom_workspace: false });
  });

  it('keeps an existing explicit affinity stable across shell cache refreshes', () => {
    const cached = {
      id: 'local-bound',
      name: 'Bound task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '/tmp/runtime',
        custom_workspace: true,
        canonical_project_id: '/projects/selected',
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory(
      [cached],
      directory([thread({ workspace: '/tmp/runtime-next', projectId: '' })])
    );

    expect(projected.extra).toMatchObject({
      workspace: '/tmp/runtime-next',
      custom_workspace: true,
      canonical_project_id: '/projects/selected',
    });
  });

  it('replaces stale explicit affinity only from a canonical explicit project id', () => {
    const cached = {
      id: 'local-stale-bound',
      name: 'Stale bound task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '/tmp/runtime',
        custom_workspace: true,
        canonical_project_id: '/projects/old',
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory(
      [cached],
      directory([thread({ workspace: '/tmp/runtime', projectId: '/projects/canonical' })])
    );

    expect(projected.extra).toMatchObject({
      workspace: '/tmp/runtime',
      custom_workspace: true,
      canonical_project_id: '/projects/canonical',
    });
  });

  it('keeps shell UI metadata while App Server owns task title and lifecycle', () => {
    const cached = {
      id: 'local-1',
      name: 'Stale local title',
      created_at: 1,
      modified_at: 1,
      type: 'acp',
      extra: { backend: 'codex', acp_session_id: 'thread-1', pinned: true },
    } as TChatConversation;
    const [projected] = mergeCanonicalThreadDirectory(
      [cached],
      directory([thread({ archived: true, status: 'archived' })])
    );

    expect(projected).toMatchObject({
      id: 'local-1',
      name: 'Canonical task',
      extra: { pinned: true, archived: true, canonical_thread_stub: false },
    });
  });

  it('drops unmatched stale Codex cache rows when the complete App Server overview is available', () => {
    const returned = {
      id: 'local-returned',
      name: 'Stale returned task',
      created_at: 1,
      type: 'acp',
      extra: { backend: 'codex', canonical_thread_id: 'thread-returned' },
    } as TChatConversation;
    const stale = {
      id: 'local-missing',
      name: 'Locally cached task',
      created_at: 1,
      type: 'acp',
      extra: { backend: 'codex', canonical_thread_id: 'thread-missing', pinned: true },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory(
      [returned, stale],
      directory([thread({ id: 'thread-returned', title: 'Fresh returned task' })])
    );

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'local-returned',
        name: 'Fresh returned task',
        extra: expect.objectContaining({ canonical_thread_id: 'thread-returned' }),
      }),
    ]);
  });

  it('keeps a newly created Codex row until its first turn appears in the canonical directory', () => {
    const pending = {
      id: 'local-new',
      name: 'New task',
      created_at: 1,
      type: 'acp',
      status: 'pending',
      extra: { backend: 'codex', acp_session_id: 'thread-new' },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([pending], directory([]), new Set([pending.id]));

    expect(merged).toEqual([pending]);
    expect(visibleConversationIds(merged)).toEqual(new Set([pending.id]));
  });

  it('does not treat a Codex row removed by canonical merge as visible to response streams', () => {
    const stale = {
      id: 'local-stale',
      name: 'Stale task',
      created_at: 1,
      type: 'acp',
      extra: { backend: 'codex', canonical_thread_id: 'thread-missing' },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([stale], directory([]));

    expect(merged).toEqual([]);
    expect(visibleConversationIds(merged).has(stale.id)).toBe(false);
  });

  it('preserves unmatched Codex cache rows when only a bounded recent directory is available', () => {
    const cached = {
      id: 'local-older',
      name: 'Older cached task',
      created_at: 1,
      type: 'acp',
      extra: { backend: 'codex', canonical_thread_id: 'thread-older' },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([cached], directory([thread()], false));

    expect(merged).toEqual([cached, expect.objectContaining({ id: 'thread-1', name: 'Canonical task' })]);
  });

  it('retains unmatched non-Codex local rows without title or workspace deduplication', () => {
    const local = {
      id: 'local-gemini',
      name: 'Canonical task',
      created_at: 1,
      type: 'acp',
      extra: { backend: 'gemini', workspace: '/tmp/project' },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([local], directory([thread()]));

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(local);
    expect(merged[1]).toMatchObject({ id: 'thread-1', name: 'Canonical task' });
  });

  it('matches migrated cache rows by canonical id when the ACP session id differs', () => {
    const cached = {
      id: 'local-1',
      name: 'Migrated task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        acp_session_id: 'legacy-thread-1',
        canonical_thread_id: 'thread-1',
        pinned: true,
      },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([cached], directory([thread()]));

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'local-1',
        extra: expect.objectContaining({
          acp_session_id: 'thread-1',
          canonical_thread_id: 'thread-1',
          pinned: true,
        }),
      }),
    ]);
  });

  it('deduplicates local canonical rows only when the App Server returns that task', () => {
    const duplicate = (id: string): TChatConversation =>
      ({
        id,
        name: 'Duplicate task',
        created_at: 1,
        type: 'acp',
        extra: { backend: 'codex', canonical_thread_id: 'thread-1' },
      }) as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([duplicate('local-1'), duplicate('local-2')], directory([thread()]));

    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe('Canonical task');
  });

  it('falls back to shell cache when the canonical directory is unavailable', () => {
    const cached = { id: 'local-1' } as TChatConversation;
    expect(mergeCanonicalThreadDirectory([cached], null)).toEqual([cached]);
  });
});

describe('canonical archive surface fallback', () => {
  const cachedCodexThread = {
    id: 'local-1',
    name: 'Cached task',
    created_at: 1,
    type: 'acp',
    extra: {
      backend: 'codex',
      canonical_thread_id: 'thread-1',
      archived: false,
    },
  } as TChatConversation;

  it('uses the cached archive state while the first canonical directory request is unavailable', () => {
    expect(filterConversationsForHistorySurface([cachedCodexThread], false, new Map())).toEqual([cachedCodexThread]);
    expect(filterConversationsForHistorySurface([cachedCodexThread], true, new Map())).toEqual([]);
  });

  it('uses the last known canonical archive state after a later timeout', () => {
    const canonicalArchiveState = new Map([['thread-1', true]]);

    expect(filterConversationsForHistorySurface([cachedCodexThread], false, canonicalArchiveState)).toEqual([]);
    expect(filterConversationsForHistorySurface([cachedCodexThread], true, canonicalArchiveState)).toEqual([
      cachedCodexThread,
    ]);
  });

  it('removes timeout-hidden rows from workspace timeline groups', () => {
    const history = {
      pinnedConversations: [cachedCodexThread],
      timelineSections: [
        {
          timeline: 'Recents',
          items: [
            {
              type: 'workspace' as const,
              time: 1,
              workspaceGroup: {
                workspace: '/tmp/project',
                display_name: 'Project',
                conversations: [cachedCodexThread],
              },
            },
          ],
        },
      ],
    };

    expect(filterHistoryToConversationIds(history, new Set())).toEqual({
      pinnedConversations: [],
      timelineSections: [],
    });
  });
});

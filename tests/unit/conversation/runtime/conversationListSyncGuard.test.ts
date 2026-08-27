/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDescriptor, CodexThreadDirectory } from '@/common/types/codex/appServerThreads';
import {
  createSingleFlightDirtyReplay,
  getSidebarStreamGuardDecision,
  mergeCanonicalThreadDirectory,
  projectTransportBinding,
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

describe('createSingleFlightDirtyReplay', () => {
  it('coalesces a burst into one in-flight refresh and one trailing replay', async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const operation = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });
    const requestRefresh = createSingleFlightDirtyReplay(operation);

    const refresh = requestRefresh();
    for (let index = 0; index < 50; index += 1) requestRefresh();

    expect(operation).toHaveBeenCalledTimes(1);
    releases.shift()?.();
    await vi.waitFor(() => expect(operation).toHaveBeenCalledTimes(2));
    expect(maxActive).toBe(1);

    releases.shift()?.();
    await refresh;
    expect(operation).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it('accepts a new refresh after a failed operation', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce(undefined);
    const requestRefresh = createSingleFlightDirtyReplay(operation);

    await expect(requestRefresh()).rejects.toThrow('temporary failure');
    await expect(requestRefresh()).resolves.toBeUndefined();
    expect(operation).toHaveBeenCalledTimes(2);
  });
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
  it('projects a callback binding onto the shared transport projection shape', () => {
    expect(
      projectTransportBinding({
        channelSessionId: 'weixin-user-1',
        canonicalThreadHost: 'local-host',
        canonicalThreadId: 'thread-1',
        projectAffinity: 'projectless',
      })
    ).toEqual({
      conversationId: 'weixin-user-1',
      canonicalThreadHost: 'local-host',
      threadId: 'thread-1',
      temporaryWorkspace: true,
    });
  });

  it('projects a canonical task from explicit project affinity rather than recorded cwd', () => {
    const [projected] = mergeCanonicalThreadDirectory([], directory([thread()]));

    expect(projected).toMatchObject({
      id: 'thread-1',
      name: 'Canonical task',
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        canonical_thread_stub: true,
        workspace: '/tmp/project',
        custom_workspace: true,
        canonical_project_id: 'project',
      },
    });
    expect(projected.extra).not.toHaveProperty('acp_session_id');
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

  it('does not create duplicate leaf-name groups for Codex-managed worktrees', () => {
    const mainWorkspace = '/Users/example/workspace/one-person-lab-cloud';
    const worktreeWorkspace = '/Users/example/.codex/worktrees/abc123/one-person-lab-cloud';
    const [mainTask, worktreeTask] = mergeCanonicalThreadDirectory(
      [],
      directory([
        thread({ id: 'main-thread', workspace: mainWorkspace, projectId: '' }),
        thread({ id: 'worktree-thread', workspace: worktreeWorkspace, projectId: '' }),
      ])
    );

    const items = groupConversationsByWorkspace([mainTask, worktreeTask], (key) => key)[0]?.items ?? [];

    expect(items.filter((item) => item.type === 'workspace')).toEqual([
      expect.objectContaining({
        workspaceGroup: expect.objectContaining({ workspace: mainWorkspace, conversations: [mainTask] }),
      }),
    ]);
    expect(items.filter((item) => item.type === 'conversation')).toEqual([
      expect.objectContaining({ conversation: worktreeTask }),
    ]);
    expect(worktreeTask.extra).toMatchObject({ workspace: worktreeWorkspace, custom_workspace: false });
  });

  it('keeps explicit project affinity authoritative for a Codex-managed worktree', () => {
    const projectId = '/Users/example/workspace/one-person-lab-cloud';
    const workspace = '/Users/example/.codex/worktrees/abc123/one-person-lab-cloud';
    const [projected] = mergeCanonicalThreadDirectory([], directory([thread({ workspace, projectId })]));

    expect(groupConversationsByWorkspace([projected], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({
        type: 'workspace',
        workspaceGroup: expect.objectContaining({ workspace: projectId, conversations: [projected] }),
      }),
    ]);
    expect(projected.extra).toMatchObject({ workspace, canonical_project_id: projectId, custom_workspace: true });
  });

  it('keeps an OPL channel temporary task projectless and ungrouped', () => {
    const workspace = '/Users/example/Library/Application Support/One Person Lab/opl-data/codex-temp-05ee8303';
    const temporary = {
      id: 'canonical-cache',
      name: 'WeChat task',
      created_at: 1,
      type: 'acp',
      source: 'aionui',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace,
        custom_workspace: false,
        is_temporary_workspace: true,
      },
    } as TChatConversation;

    expect(groupConversationsByWorkspace([temporary], (key) => key)[0]?.items).toEqual([
      expect.objectContaining({ type: 'conversation', conversation: temporary }),
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

  it('matches migrated cache rows by canonical id and drops the legacy ACP session mirror', () => {
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
          canonical_thread_id: 'thread-1',
          pinned: true,
        }),
      }),
    ]);
    expect(merged[0]?.extra).not.toHaveProperty('acp_session_id');
  });

  it('preserves cleaned-workspace metadata when the canonical directory refreshes', () => {
    const temporaryWorkspace = '/runtime/conversations/thread-1';
    const recordedWorkspace = '/Users/example/.codex/worktrees/removed/repository';
    const cached = {
      id: 'local-1',
      name: 'Recovered task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: temporaryWorkspace,
        canonical_recorded_workspace: recordedWorkspace,
        workspace_unavailable: true,
        is_temporary_workspace: true,
      },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory(
      [cached],
      directory([thread({ workspace: temporaryWorkspace, projectId: '' })])
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'local-1',
      extra: {
        workspace: temporaryWorkspace,
        canonical_recorded_workspace: recordedWorkspace,
        workspace_unavailable: true,
        is_temporary_workspace: true,
      },
    });
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

  it('prefers a valid shared transport projection over legacy canonical_thread_id', () => {
    const transportWorkspace = '/Users/example/.opl-app-data/conversations/transport-05ee8303';
    const canonicalWorkspace =
      '/Users/example/Library/Application Support/One Person Lab/opl-data/conversations/thread-workspace';
    const transport = {
      id: '05ee8303',
      name: 'wx-acp-codex-user',
      created_at: 1,
      type: 'acp',
      source: 'weixin',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'legacy-thread',
        workspace: transportWorkspace,
        is_temporary_workspace: true,
      },
    } as TChatConversation;
    const cachedCanonical = {
      id: 'canonical-cache',
      name: 'Stale canonical title',
      created_at: 2,
      type: 'acp',
      source: 'aionui',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: canonicalWorkspace,
      },
    } as TChatConversation;
    const canonicalDirectory = directory([thread({ workspace: canonicalWorkspace, projectId: '' })]);

    const merged = mergeCanonicalThreadDirectory([transport, cachedCanonical], canonicalDirectory, new Set(), [
      { conversationId: '05ee8303', canonicalThreadHost: 'host-a', threadId: 'thread-1', temporaryWorkspace: true },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: 'canonical-cache',
      name: 'Canonical task',
      source: 'aionui',
      extra: {
        canonical_thread_id: 'thread-1',
        workspace: canonicalWorkspace,
        custom_workspace: false,
        is_temporary_workspace: true,
      },
    });
    expect(groupConversationsByWorkspace(merged, (key) => key)[0]?.items).toEqual([
      expect.objectContaining({ type: 'conversation', conversation: merged[0] }),
    ]);
    expect(transport.extra).toHaveProperty('canonical_thread_id', 'legacy-thread');
  });

  it('ignores a conflicting legacy binding when a current shared binding exists', () => {
    const transport = {
      id: 'shared-over-legacy',
      name: 'WeChat transport',
      created_at: 1,
      type: 'acp',
      source: 'weixin',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-2',
        workspace: '/tmp/legacy-conflict',
        is_temporary_workspace: true,
      },
    } as TChatConversation;
    const merged = mergeCanonicalThreadDirectory(
      [transport],
      directory([thread(), thread({ id: 'thread-2' })]),
      new Set(),
      [
        {
          conversationId: transport.id,
          canonicalThreadHost: 'host-a',
          threadId: 'thread-1',
          temporaryWorkspace: true,
        },
      ]
    );

    expect(merged.find((conversation) => conversation.extra.canonical_thread_id === 'thread-1')?.extra).toMatchObject({
      is_temporary_workspace: true,
    });
    expect(
      merged.find((conversation) => conversation.extra.canonical_thread_id === 'thread-2')?.extra
    ).not.toMatchObject({
      is_temporary_workspace: true,
    });
  });

  it('fails open when projected transport bindings are ambiguous', () => {
    const workspace = '/Users/example/.opl-app-data/conversations/codex-temp-05ee8303';
    const transport = {
      id: '05ee8303',
      name: 'wx-acp-codex-user',
      created_at: 1,
      type: 'acp',
      source: 'weixin',
      extra: { backend: 'codex', workspace, is_temporary_workspace: true },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory(
      [transport],
      directory([thread({ id: 'thread-1', workspace }), thread({ id: 'thread-2', workspace })]),
      new Set(),
      [
        { conversationId: transport.id, canonicalThreadHost: 'host-a', threadId: 'thread-1' },
        { conversationId: transport.id, canonicalThreadHost: 'host-a', threadId: 'thread-2' },
      ]
    );

    expect(merged).toContain(transport);
  });

  it('keeps a legacy transport row visible without inferring a canonical binding', () => {
    const transport = {
      id: 'unbound-weixin',
      name: 'WeChat transport',
      created_at: 1,
      type: 'acp',
      source: 'weixin',
      extra: { backend: 'codex', workspace: '/tmp/unbound', is_temporary_workspace: true },
    } as TChatConversation;

    expect(mergeCanonicalThreadDirectory([transport], directory([thread()]))).toContain(transport);
  });

  it('does not infer a transport binding from a cached canonical_thread_id', () => {
    const transport = {
      id: 'legacy-weixin',
      name: 'Legacy WeChat transport',
      created_at: 1,
      type: 'acp',
      source: 'weixin',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '/tmp/legacy',
        is_temporary_workspace: true,
      },
    } as TChatConversation;

    const merged = mergeCanonicalThreadDirectory([transport], directory([thread()]));
    expect(merged).toHaveLength(2);
    expect(merged).toContain(transport);
    expect(merged).toContainEqual(
      expect.objectContaining({
        source: 'codex-app-server',
        extra: expect.objectContaining({ canonical_thread_id: 'thread-1' }),
      })
    );
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

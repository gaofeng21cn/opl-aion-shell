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
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

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

const directory = (threads: CodexThreadDescriptor[]): CodexThreadDirectory => ({
  schema: 'opl_codex_thread_directory.v1',
  host: 'host-a',
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
  it('projects an App Server task that has no shell cache row', () => {
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
      },
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

  it('rebuilds a stale projectless cache row from the canonical recorded cwd', () => {
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

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread()]));

    expect(projected.extra).toMatchObject({ workspace: '/tmp/project', custom_workspace: true });
  });

  it('hydrates a legacy missing affinity marker from the canonical recorded cwd', () => {
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

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread()]));

    expect(projected.extra).toMatchObject({ workspace: '/tmp/project', custom_workspace: true });
  });

  it('keeps an existing bound affinity stable across shell cache refreshes', () => {
    const cached = {
      id: 'local-bound',
      name: 'Bound task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '/tmp/project',
        custom_workspace: true,
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread()]));

    expect(projected.extra).toMatchObject({ workspace: '/tmp/project', custom_workspace: true });
  });

  it('replaces stale bound shell affinity with the canonical recorded cwd', () => {
    const cached = {
      id: 'local-stale-bound',
      name: 'Stale bound task',
      created_at: 1,
      type: 'acp',
      extra: {
        backend: 'codex',
        canonical_thread_id: 'thread-1',
        workspace: '/tmp/other-project',
        custom_workspace: true,
      },
    } as TChatConversation;

    const [projected] = mergeCanonicalThreadDirectory([cached], directory([thread()]));

    expect(projected.extra).toMatchObject({ workspace: '/tmp/project', custom_workspace: true });
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

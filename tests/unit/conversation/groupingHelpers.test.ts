import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildArchivedHistory,
  buildGroupedHistory,
  getConversationDirectoryGroup,
  isCodexManagedWorktreeConversation,
  isCodexManagedWorktreeWorkspace,
} from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';
import { buildVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/utils/visibleConversationOrder';

const conversation = (id: string, extra: Record<string, unknown> = {}): TChatConversation =>
  ({
    id,
    name: id,
    type: 'codex',
    created_at: 1,
    modified_at: 1,
    extra,
  }) as unknown as TChatConversation;

const t = (key: string) => key;

const codexConversation = (workspace: string, projectId = ''): TChatConversation =>
  ({
    id: 'codex-thread',
    name: 'Codex task',
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: {
      backend: 'codex',
      workspace,
      canonical_project_id: projectId,
    },
  }) as unknown as TChatConversation;

describe('Codex managed worktree presentation', () => {
  it.each([
    '/Users/example/.codex/worktrees/abc123/one-person-lab-app',
    '/home/example/.codex/worktrees/abc123/one-person-lab-app',
    'C:\\Users\\example\\.codex\\worktrees\\abc123\\one-person-lab-app',
    '/mnt/c/Users/example/.codex/worktrees/abc123/one-person-lab-app',
  ])('recognizes a managed worktree across supported path forms: %s', (workspace) => {
    expect(isCodexManagedWorktreeWorkspace(workspace)).toBe(true);
    expect(isCodexManagedWorktreeConversation(codexConversation(workspace))).toBe(true);
  });

  it('does not mark main workspaces, Documents scratch tasks, or non-Codex rows', () => {
    expect(isCodexManagedWorktreeWorkspace('/Users/example/workspace/one-person-lab-app')).toBe(false);
    expect(isCodexManagedWorktreeWorkspace('/Users/example/Documents/Codex/2026/task')).toBe(false);
    expect(
      isCodexManagedWorktreeConversation(
        conversation('local', {
          backend: 'codex',
          workspace: '/Users/example/.codex/worktrees/abc123/one-person-lab-app',
        })
      )
    ).toBe(false);
  });

  it('keeps explicit Project grouping independent from the worktree indicator', () => {
    const projectId = '/Users/example/workspace/one-person-lab-app';
    const worktree = codexConversation(
      '/Users/example/.codex/worktrees/abc123/one-person-lab-app',
      projectId
    );

    expect(getConversationDirectoryGroup(worktree)).toBe(projectId);
    expect(isCodexManagedWorktreeConversation(worktree)).toBe(true);
  });
});

describe('conversation history archive grouping', () => {
  it('keeps archived conversations out of active history and preserves projectless conversations', () => {
    const active = conversation('active');
    const archived = conversation('archived', { archived: true, archived_at: 2 });

    const result = buildGroupedHistory([active, archived], t);

    expect(result.timelineSections[0]?.items.map((item) => item.conversation?.id)).toEqual(['active']);
  });

  it('orders the archived surface by archive time', () => {
    const older = conversation('older', { archived: true, archived_at: 10 });
    const newer = conversation('newer', { archived: true, archived_at: 20 });

    const result = buildArchivedHistory([older, newer, conversation('active')], t);

    expect(result.timelineSections[0]?.items.map((item) => item.conversation?.id)).toEqual(['newer', 'older']);
    expect(result.pinnedConversations).toEqual([]);
  });

  it('orders only visible ordinary conversations for task navigation', () => {
    const result = buildGroupedHistory(
      [
        conversation('ordinary'),
        conversation('pinned', { pinned: true, pinned_at: 2 }),
        conversation('archived', { archived: true }),
        conversation('team', { team_id: 'team-1' }),
        conversation('cron', { cron_job_id: 'cron-1' }),
      ],
      t
    );

    expect(
      buildVisibleConversationIds({
        ...result,
        expandedWorkspaces: [],
        siderCollapsed: false,
      })
    ).toEqual(['pinned', 'ordinary']);
  });
});

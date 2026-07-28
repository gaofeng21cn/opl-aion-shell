import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildArchivedHistory,
  buildGroupedHistory,
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

  it('does not create a project group from legacy inferred workspace affinity', () => {
    const legacy = conversation('legacy', {
      workspace: '/legacy/unknown-affinity',
      custom_workspace: true,
      workspace_affinity: 'legacy_unknown',
    });

    const result = buildGroupedHistory([legacy], t);

    expect(result.timelineSections[0]?.items).toEqual([
      expect.objectContaining({ type: 'conversation', conversation: legacy }),
    ]);
  });
});

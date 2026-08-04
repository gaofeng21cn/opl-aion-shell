import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDescriptor } from '@/common/types/codex/appServerThreads';
import {
  canonicalCodexThreadId,
  projectCanonicalCodexThread,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';
import { describe, expect, it } from 'vitest';

const thread: CodexThreadDescriptor = {
  id: 'thread-1',
  title: 'Canonical task',
  summary: '',
  status: 'idle',
  projectId: '/workspace/project',
  workspace: '/workspace/project',
  host: 'local',
  owner: null,
  goal: null,
  parentThreadId: null,
  ancestorThreadIds: [],
  activeTurnId: null,
  archived: false,
  updatedAt: '2026-08-04T00:00:00.000Z',
};

describe('canonical Codex task projection', () => {
  it('keeps App Server identity without creating a parallel ACP session identity', () => {
    const projected = projectCanonicalCodexThread(thread);

    expect(projected.extra.canonical_thread_id).toBe(thread.id);
    expect(projected.extra).not.toHaveProperty('acp_session_id');
  });

  it('strips a legacy mirrored ACP session while preserving old-row lookup compatibility', () => {
    const cached = {
      id: 'local-1',
      created_at: 1,
      type: 'acp',
      name: 'Cached task',
      extra: {
        backend: 'codex',
        acp_session_id: thread.id,
      },
    } as TChatConversation;

    expect(canonicalCodexThreadId(cached)).toBe(thread.id);
    expect(
      projectCanonicalCodexThread(thread, cached as Extract<TChatConversation, { type: 'acp' }>).extra
    ).not.toHaveProperty('acp_session_id');
  });
});

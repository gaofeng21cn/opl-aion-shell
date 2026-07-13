/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { CodexThreadDescriptor, ThreadCoordinationOverview } from '@/common/types/codex/threadCoordination';
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
  activeWriteSet: [],
  activePermission: null,
  archived: false,
  updatedAt: '2026-07-13T00:00:00.000Z',
  ...overrides,
});

const overview = (threads: CodexThreadDescriptor[]): ThreadCoordinationOverview => ({
  schema: 'opl_codex_thread_coordination_overview.v1',
  availability: {
    status: 'available',
    host: 'host-a',
    protocolVersion: 'v2',
    methods: [],
    reasonCode: null,
    detail: null,
  },
  currentThreadId: null,
  currentProjectId: null,
  threads,
  audit: [],
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
    const [projected] = mergeCanonicalThreadDirectory([], overview([thread()]));

    expect(projected).toMatchObject({
      id: 'thread-1',
      name: 'Canonical task',
      type: 'acp',
      extra: {
        backend: 'codex',
        acp_session_id: 'thread-1',
        canonical_thread_stub: true,
        workspace: '/tmp/project',
      },
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
      overview([thread({ archived: true, status: 'archived' })])
    );

    expect(projected).toMatchObject({
      id: 'local-1',
      name: 'Canonical task',
      extra: { pinned: true, archived: true, canonical_thread_stub: false },
    });
  });

  it('falls back to shell cache when the canonical directory is unavailable', () => {
    const cached = { id: 'local-1' } as TChatConversation;
    const unavailable = overview([]);
    unavailable.availability.status = 'unavailable';

    expect(mergeCanonicalThreadDirectory([cached], unavailable)).toEqual([cached]);
  });
});

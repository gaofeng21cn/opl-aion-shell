/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildOplConversationHistory,
  getSidebarStreamGuardDecision,
  visibleConversationIds,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

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

describe('buildOplConversationHistory', () => {
  it('keeps the OPL rail local instead of injecting unrelated canonical Codex tasks', () => {
    const oplConversation = {
      id: 'opl-local',
      name: 'OPL local conversation',
      created_at: 1,
      type: 'acp',
      source: 'aionui',
      extra: { backend: 'codex', workspace: '/tmp/opl-local' },
    } as TChatConversation;

    const history = buildOplConversationHistory([oplConversation]);

    expect(history).toEqual([oplConversation]);
    expect(visibleConversationIds(history)).toEqual(new Set(['opl-local']));
  });

  it('does not restore a materialized canonical subagent projection to ordinary OPL history', () => {
    const subagentProjection = {
      id: 'subagent-local-projection',
      name: 'Delegated execution',
      created_at: 1,
      type: 'acp',
      source: 'codex-app-server',
      extra: { backend: 'codex', canonical_thread_id: 'subagent-thread' },
    } as TChatConversation;

    expect(buildOplConversationHistory([subagentProjection])).toEqual([]);
  });
});

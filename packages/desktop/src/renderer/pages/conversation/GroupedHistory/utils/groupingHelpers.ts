/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspace/workspaceHistory';

import type { GroupedHistoryResult, TimelineItem, TimelineSection } from '../types';
import { getConversationSortOrder } from './sortOrderHelpers';

export const isConversationPinned = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { pinned?: boolean } | undefined;
  return Boolean(extra?.pinned);
};

export const isConversationArchived = (conversation: TChatConversation): boolean => {
  return conversation.extra?.archived === true;
};

export const isCronJobConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { cron_job_id?: string } | undefined;
  return Boolean(extra?.cron_job_id);
};

export const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinned_at?: number } | undefined;
  if (typeof extra?.pinned_at === 'number') {
    return extra.pinned_at;
  }
  return 0;
};

const MANAGED_CODEX_SCRATCH_PATTERNS = [
  /^\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^\/home\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^[a-z]:\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
  /^\/mnt\/[a-z]\/Users\/[^/]+\/Documents\/Codex(?:\/|$)/i,
];

export const isManagedCodexScratchWorkspace = (workspace: string): boolean => {
  const normalized = workspace
    .trim()
    .replaceAll('\\', '/')
    .replace(/\/{2,}/g, '/');
  return MANAGED_CODEX_SCRATCH_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const getConversationDirectoryGroup = (conversation: TChatConversation): string | null => {
  const workspace = conversation.extra?.workspace?.trim() ?? '';
  const isCanonicalCodex = conversation.type === 'acp' && conversation.extra.backend === 'codex';
  if (isCanonicalCodex) {
    const explicitProjectId = conversation.extra.canonical_project_id?.trim() ?? '';
    if (explicitProjectId) return explicitProjectId;
    if ((conversation.extra as { is_temporary_workspace?: boolean }).is_temporary_workspace === true) return null;
    if (!workspace || isManagedCodexScratchWorkspace(workspace)) return null;

    // Recorded cwd supplies presentation and a new-task shortcut only. It never
    // creates canonical project affinity or mutates the registered workspace set.
    return workspace;
  }

  return conversation.extra?.custom_workspace && workspace ? workspace : null;
};

export const groupConversationsByWorkspace = (
  conversations: TChatConversation[],
  t: (key: string) => string,
  getSortTime: (conversation: TChatConversation) => number = getActivityTime
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  conversations.forEach((conv) => {
    const projectWorkspace = getConversationDirectoryGroup(conv);

    if (projectWorkspace) {
      if (!allWorkspaceGroups.has(projectWorkspace)) {
        allWorkspaceGroups.set(projectWorkspace, []);
      }
      allWorkspaceGroups.get(projectWorkspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  const items: TimelineItem[] = [];

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = [...convList].toSorted((a, b) => getSortTime(b) - getSortTime(a));
    const latestConversationTime = getSortTime(sortedConvs[0]);
    const updateTime = getWorkspaceUpdateTime(workspace);
    const time = Math.max(updateTime, latestConversationTime);
    items.push({
      type: 'workspace',
      time,
      workspaceGroup: {
        workspace,
        // Managed scratch workspaces are excluded before this point, so every
        // remaining workspace renders as a normal directory group.
        display_name: getWorkspaceDisplayName(workspace, false, t),
        conversations: sortedConvs,
      },
    });
  });

  withoutWorkspaceConvs.forEach((conv) => {
    items.push({
      type: 'conversation',
      time: getSortTime(conv),
      conversation: conv,
    });
  });

  items.sort((a, b) => b.time - a.time);

  if (items.length === 0) return [];

  return [
    {
      timeline: t('conversation.history.recents'),
      items,
    },
  ];
};

/** Check whether a conversation belongs to a team (should be hidden from sidebar). */
const isTeamConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { team_id?: string; teamId?: string } | undefined;
  return Boolean(extra?.team_id || extra?.teamId);
};

export const buildGroupedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  // Team-owned and archived conversations have dedicated surfaces.
  const visibleConversations = conversations.filter(
    (conversation) => !isTeamConversation(conversation) && !isConversationArchived(conversation)
  );

  const pinnedConversations = visibleConversations
    .filter((conversation) => isConversationPinned(conversation))
    .toSorted((a, b) => {
      const orderA = getConversationSortOrder(a);
      const orderB = getConversationSortOrder(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return getConversationPinnedAt(b) - getConversationPinnedAt(a);
    });

  const normalConversations = visibleConversations.filter(
    (conversation) => !isConversationPinned(conversation) && !isCronJobConversation(conversation)
  );

  return {
    pinnedConversations,
    timelineSections: groupConversationsByWorkspace(normalConversations, t),
  };
};

export const buildArchivedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  const archivedConversations = conversations
    .filter((conversation) => !isTeamConversation(conversation) && isConversationArchived(conversation))
    .toSorted((left, right) => (right.extra.archived_at ?? 0) - (left.extra.archived_at ?? 0));

  return {
    pinnedConversations: [],
    timelineSections: groupConversationsByWorkspace(
      archivedConversations,
      t,
      (conversation) => conversation.extra.archived_at ?? getActivityTime(conversation)
    ),
  };
};

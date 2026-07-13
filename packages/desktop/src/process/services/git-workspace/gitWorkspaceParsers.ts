/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import type { GitBranchSummary, GitPullRequestContext, GitWorktreeSummary } from '@/common/types/platform/gitWorkspace';
import { GitWorkspaceAdapterError } from './commandRunner';

export function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function splitNul(value: string): string[] {
  return value.split('\0').filter(Boolean);
}

function shortBranchName(fullRef: string): string | null {
  return fullRef.startsWith('refs/heads/') ? fullRef.slice('refs/heads/'.length) : null;
}

export function parseWorktrees(output: string): GitWorktreeSummary[] {
  const records = output.split('\0\0').filter(Boolean);
  return records.map((record) => {
    let worktreePath = '';
    let head = '';
    let branchRef: string | null = null;
    let detached = false;
    let bare = false;
    let lockedReason: string | null = null;
    let prunableReason: string | null = null;

    for (const field of record.split('\0').filter(Boolean)) {
      const separator = field.indexOf(' ');
      const key = separator === -1 ? field : field.slice(0, separator);
      const value = separator === -1 ? '' : field.slice(separator + 1);
      if (key === 'worktree') worktreePath = value;
      else if (key === 'HEAD') head = value;
      else if (key === 'branch') branchRef = value;
      else if (key === 'detached') detached = true;
      else if (key === 'bare') bare = true;
      else if (key === 'locked') lockedReason = value || 'locked';
      else if (key === 'prunable') prunableReason = value || 'prunable';
    }

    if (!path.isAbsolute(worktreePath) || !head) {
      throw new GitWorkspaceAdapterError('INVALID_COMMAND_OUTPUT', 'Git returned an invalid worktree record.');
    }

    return {
      path: worktreePath,
      head,
      branch: branchRef ? shortBranchName(branchRef) : null,
      branchRef,
      detached,
      bare,
      lockedReason,
      prunableReason,
    };
  });
}

export function parseBranches(
  output: string,
  currentBranch: string | null,
  worktrees: GitWorktreeSummary[]
): GitBranchSummary[] {
  const currentRef = currentBranch ? `refs/heads/${currentBranch}` : null;
  const checkedOutPaths = new Map(
    worktrees.filter((worktree) => worktree.branchRef).map((worktree) => [worktree.branchRef!, worktree.path])
  );

  return output
    .split('\n')
    .filter(Boolean)
    .map((record) => record.split('\0'))
    .filter((fields) => fields.length >= 6 && !fields[5])
    .map(([fullRef, name, head, upstream, upstreamTrack]) => ({
      name,
      fullRef,
      head,
      kind: fullRef.startsWith('refs/heads/') ? ('local' as const) : ('remote' as const),
      current: fullRef === currentRef,
      upstream: upstream || null,
      upstreamTrack: upstreamTrack || null,
      checkedOutAt: checkedOutPaths.get(fullRef) ?? null,
    }))
    .toSorted((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'local' ? -1 : 1;
      return compareStrings(left.name, right.name);
    });
}

export function parsePullRequest(output: string): GitPullRequestContext {
  try {
    const value = JSON.parse(output) as Record<string, unknown>;
    if (
      typeof value.number !== 'number' ||
      typeof value.title !== 'string' ||
      typeof value.url !== 'string' ||
      typeof value.state !== 'string' ||
      typeof value.isDraft !== 'boolean' ||
      typeof value.headRefName !== 'string' ||
      typeof value.baseRefName !== 'string'
    ) {
      return { status: 'unavailable', reason: 'invalid_response' };
    }
    return {
      status: 'available',
      number: value.number,
      title: value.title,
      url: value.url,
      state: value.state,
      isDraft: value.isDraft,
      headRefName: value.headRefName,
      baseRefName: value.baseRefName,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'invalid_response',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

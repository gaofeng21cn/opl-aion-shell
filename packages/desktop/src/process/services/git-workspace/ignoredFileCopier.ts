/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { constants as fsConstants, type Stats } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { GitIgnoredFileCopyReceipt } from '@/common/types/platform/gitWorkspace';
import type { CommandResult, CommandRunnerOptions } from './commandRunner';
import { GitWorkspaceAdapterError } from './commandRunner';
import { compareStrings, splitNul } from './gitWorkspaceParsers';

export type GitCommand = (args: string[], options: CommandRunnerOptions, operation: string) => Promise<CommandResult>;

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function tryLstat(candidate: string): Promise<Stats | null> {
  try {
    return await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new GitWorkspaceAdapterError(
      'COMMAND_FAILED',
      `Failed to inspect path "${candidate}".`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  return Boolean(await tryLstat(candidate));
}

async function hasSymlinkSegment(root: string, relativePath: string): Promise<boolean> {
  const segments = relativePath.split('/').filter(Boolean);
  const paths = segments.map((_, index) => path.join(root, ...segments.slice(0, index + 1)));
  const stats = await Promise.all(paths.map((candidate) => tryLstat(candidate)));
  return stats.some((stat) => stat?.isSymbolicLink() === true);
}

async function copyIgnoredFile(
  sourceRoot: string,
  targetRoot: string,
  relativePath: string,
  receipt: GitIgnoredFileCopyReceipt
): Promise<void> {
  const sourcePath = path.resolve(sourceRoot, relativePath);
  const targetPath = path.resolve(targetRoot, relativePath);
  if (!isInside(sourceRoot, sourcePath) || !isInside(targetRoot, targetPath)) return;
  if ((await hasSymlinkSegment(sourceRoot, relativePath)) || (await hasSymlinkSegment(targetRoot, relativePath))) {
    receipt.skippedSymlinks.push(relativePath);
    return;
  }
  const sourceStat = await tryLstat(sourcePath);
  if (!sourceStat?.isFile()) return;
  if (await pathExists(targetPath)) {
    receipt.skippedExisting.push(relativePath);
    return;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
    await chmod(targetPath, sourceStat.mode);
    receipt.copied.push(relativePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      receipt.skippedExisting.push(relativePath);
      return;
    }
    await unlink(targetPath).catch(() => {});
    throw new GitWorkspaceAdapterError(
      'COMMAND_FAILED',
      `Failed to copy ignored setup file "${relativePath}".`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function copyIgnoredSetupFiles(
  sourceRoot: string,
  targetRoot: string,
  git: GitCommand
): Promise<GitIgnoredFileCopyReceipt> {
  const candidates = new Set<string>();
  const includePath = path.join(sourceRoot, '.worktreeinclude');
  const includeStat = await tryLstat(includePath);
  if (includeStat?.isFile() && !includeStat.isSymbolicLink()) {
    const matched = await git(
      ['-C', sourceRoot, 'ls-files', '--others', '--ignored', `--exclude-from=${includePath}`, '-z'],
      {},
      'read worktree include matches'
    );
    for (const candidate of splitNul(matched.stdout)) candidates.add(candidate);
  }

  const agentsOverride = 'AGENTS.override.md';
  if (await pathExists(path.join(sourceRoot, agentsOverride))) {
    const ignored = await git(
      ['-C', sourceRoot, 'check-ignore', '--quiet', '--', agentsOverride],
      { allowExitCodes: [1] },
      'check AGENTS override ignore status'
    );
    if (ignored.exitCode === 0) candidates.add(agentsOverride);
  }

  const receipt: GitIgnoredFileCopyReceipt = {
    policy: 'worktreeinclude_and_agents_override_only',
    copied: [],
    skippedExisting: [],
    skippedSymlinks: [],
  };
  const validated = await Promise.all(
    [...candidates].toSorted(compareStrings).map(async (relativePath) => {
      const ignored = await git(
        ['-C', sourceRoot, 'check-ignore', '--quiet', '--', relativePath],
        { allowExitCodes: [1] },
        'validate ignored setup file'
      );
      return ignored.exitCode === 0 ? relativePath : null;
    })
  );
  await Promise.all(
    validated
      .filter((relativePath): relativePath is string => relativePath !== null)
      .map((relativePath) => copyIgnoredFile(sourceRoot, targetRoot, relativePath, receipt))
  );
  receipt.copied = receipt.copied.toSorted(compareStrings);
  receipt.skippedExisting = receipt.skippedExisting.toSorted(compareStrings);
  receipt.skippedSymlinks = receipt.skippedSymlinks.toSorted(compareStrings);
  return receipt;
}

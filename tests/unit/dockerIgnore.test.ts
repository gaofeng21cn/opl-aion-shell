import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const dockerIgnorePath = path.join(repoRoot, '.dockerignore');

function readDockerIgnoreEntries(): string[] {
  return fs
    .readFileSync(dockerIgnorePath, 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveTgzContextDisposition(entries: readonly string[], relativePath: string): 'included' | 'excluded' {
  let disposition: 'included' | 'excluded' = 'included';

  for (const entry of entries) {
    if (entry === '*.tgz' && path.posix.basename(relativePath).endsWith('.tgz')) {
      disposition = 'excluded';
    } else if (entry === `!${relativePath}`) {
      disposition = 'included';
    }
  }

  return disposition;
}

describe('Docker WebUI build context', () => {
  it('excludes local worktrees and generated release artifacts', () => {
    const entries = new Set(readDockerIgnoreEntries());

    for (const entry of [
      '.worktrees',
      'artifacts',
      'out',
      'dist',
      'dist-web-cli',
      'build-artifacts',
      'release-assets',
      'packaged-runtimes',
      'resources/bundled-bun',
      'resources/bundled-aioncore',
      'resources/hub',
      'node_modules',
    ]) {
      expect(entries.has(entry), entry).toBe(true);
    }
  });

  it('includes only the frozen Codex archive among tgz files', () => {
    const entries = readDockerIgnoreEntries();
    const tgzIgnoreIndex = entries.indexOf('*.tgz');
    const frozenCodexException = '!.opl-frozen-inputs/codex-cli.tgz';

    expect(tgzIgnoreIndex).toBeGreaterThanOrEqual(0);
    expect(entries[tgzIgnoreIndex + 1]).toBe(frozenCodexException);
    expect(entries.filter((entry) => entry.startsWith('!') && entry.endsWith('.tgz'))).toEqual([frozenCodexException]);
    expect(resolveTgzContextDisposition(entries, '.opl-frozen-inputs/codex-cli.tgz')).toBe('included');

    for (const relativePath of [
      'codex-cli.tgz',
      'other.tgz',
      'nested/other.tgz',
      '.opl-frozen-inputs/other.tgz',
      '.opl-frozen-inputs/nested/codex-cli.tgz',
    ]) {
      expect(resolveTgzContextDisposition(entries, relativePath), relativePath).toBe('excluded');
    }
  });
});

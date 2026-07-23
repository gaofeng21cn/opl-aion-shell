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

  it('places the only frozen archive exception immediately after the recursive tgz rule', () => {
    const entries = readDockerIgnoreEntries();
    const recursiveTgzRule = '**/*.tgz';
    const frozenCodexException = '!.opl-frozen-inputs/codex-cli.tgz';
    const tgzIgnoreIndex = entries.indexOf(recursiveTgzRule);

    expect(tgzIgnoreIndex).toBeGreaterThanOrEqual(0);
    expect(entries[tgzIgnoreIndex + 1]).toBe(frozenCodexException);
    expect(entries).not.toContain('*.tgz');
    expect(entries.filter((entry) => entry.includes('.tgz'))).toEqual([recursiveTgzRule, frozenCodexException]);
    expect(entries.filter((entry) => entry.startsWith('!'))).toEqual([frozenCodexException]);
  });

  it.each([
    'codex-cli.tgz',
    'other.tgz',
    'nested/other.tgz',
    '.opl-frozen-inputs/other.tgz',
    '.opl-frozen-inputs/nested/codex-cli.tgz',
  ])('does not exempt the representative tgz path %s', (relativePath) => {
    const entries = readDockerIgnoreEntries();

    expect(entries).toContain('**/*.tgz');
    expect(entries).not.toContain(`!${relativePath}`);
  });
});

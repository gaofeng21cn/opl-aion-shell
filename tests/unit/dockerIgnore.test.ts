import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const dockerIgnorePath = path.join(repoRoot, '.dockerignore');

describe('Docker WebUI build context', () => {
  it('excludes local worktrees and generated release artifacts', () => {
    const entries = new Set(
      fs
        .readFileSync(dockerIgnorePath, 'utf8')
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    );

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
});

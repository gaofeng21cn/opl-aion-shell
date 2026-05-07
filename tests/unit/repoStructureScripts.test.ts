import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoHygiene = await import(
  pathToFileURL(`${process.cwd()}/scripts/structure/repo-hygiene.mjs`).href
);

describe('repo hygiene structure audit', () => {
  it('rejects tracked generated and runtime payload paths', () => {
    expect(
      repoHygiene.findTrackedHygieneViolations([
        'build/app.js',
        'out/main/index.js',
        'runtime-state/current.json',
        'pkg.egg-info/PKG-INFO',
        '.DS_Store',
        '.agent-contract-baseline.json',
      ])
    ).toEqual([
      '.agent-contract-baseline.json',
      '.DS_Store',
      'build/app.js',
      'out/main/index.js',
      'pkg.egg-info/PKG-INFO',
      'runtime-state/current.json',
    ]);
  });

  it('allows intentional distributables and product assets', () => {
    expect(
      repoHygiene.findTrackedHygieneViolations([
        'examples/ext-wecom-bot/dist/webui/webhook.js',
        'package/README.md',
        'public/pwa/icon-512.png',
        'resources/app.icns',
        'src/process/resources/assistant/cowork/cowork.md',
      ])
    ).toEqual([]);
  });
});

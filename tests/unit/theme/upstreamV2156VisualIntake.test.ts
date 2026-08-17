import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('AionUI v2.1.56 visual intake', () => {
  it('keeps IconPark and Arco Spin on stable inline-flex baselines', () => {
    const baseCss = read('packages/desktop/src/renderer/styles/themes/base.css');
    const arcoCss = read('packages/desktop/src/renderer/styles/arco-override.css');

    expect(baseCss).toMatch(/\.i-icon\s*{[^}]*display:\s*inline-flex;[^}]*vertical-align:\s*middle;/s);
    expect(baseCss).toMatch(/\.i-icon\s*>\s*svg\s*{[^}]*display:\s*block;/s);
    expect(arcoCss).toMatch(/\.arco-spin,\s*\.arco-spin\s*>\s*\.arco-spin-icon\s*{[^}]*inline-flex;/s);
  });

  it('keeps React-coupled libraries in one vendor chunk', () => {
    const viteConfig = read('packages/desktop/electron.vite.config.ts');

    expect(viteConfig).toContain("return 'vendor';");
    for (const retiredChunk of [
      'vendor-react',
      'vendor-arco',
      'vendor-markdown',
      'vendor-highlight',
      'vendor-editor',
    ]) {
      expect(viteConfig).not.toContain(`return '${retiredChunk}'`);
    }
  });
});

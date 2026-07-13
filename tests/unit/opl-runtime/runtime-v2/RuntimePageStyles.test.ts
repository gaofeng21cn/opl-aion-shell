import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtimeStyles = fs.readFileSync(
  new URL('../../../../packages/desktop/src/renderer/pages/runtime/RuntimePage.module.css', import.meta.url),
  'utf8'
);

describe('Runtime V2 text wrapping styles', () => {
  it('inherits one word-boundary-first policy without anywhere wrapping', () => {
    expect(runtimeStyles).toMatch(
      /\.page,\s*\.detailDrawer\s*\{[^}]*overflow-wrap:\s*break-word;[^}]*word-break:\s*normal;/s
    );
    expect(runtimeStyles).toMatch(
      /\.page :global\(\.arco-typography\),\s*\.detailDrawer :global\(\.arco-typography\)\s*\{[^}]*overflow-wrap:\s*inherit;[^}]*word-break:\s*inherit;/s
    );
    expect(runtimeStyles).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtimeStyles = fs.readFileSync(
  new URL('../../../../packages/desktop/src/renderer/pages/runtime/RuntimePage.module.css', import.meta.url),
  'utf8'
);
const runtimePage = fs.readFileSync(
  new URL('../../../../packages/desktop/src/renderer/pages/runtime/index.tsx', import.meta.url),
  'utf8'
);

describe('Runtime V2 text wrapping styles', () => {
  it('uses the quiet workbench title scale and compact page rhythm', () => {
    expect(runtimePage).toContain('heading={3} className={styles.pageTitle}');
    expect(runtimeStyles).toMatch(
      /\.titleGroup\s+\.pageTitle\s*\{[^}]*font-size:\s*20px;[^}]*font-weight:\s*600;[^}]*letter-spacing:\s*0;[^}]*line-height:\s*28px;/s
    );
    expect(runtimeStyles).toMatch(/\.page\s*\{[^}]*padding:\s*20px 24px 24px;/s);
    expect(runtimeStyles).toMatch(/\.pageHeader\s*\{[^}]*gap:\s*16px;[^}]*margin-bottom:\s*16px;/s);
    expect(runtimeStyles).toMatch(/\.workItemRow\s*\{[^}]*padding:\s*12px 14px;/s);
  });

  it('inherits one word-boundary-first policy without anywhere wrapping', () => {
    expect(runtimeStyles).toMatch(
      /\.page,\s*\.detailDrawer\s*\{[^}]*overflow-wrap:\s*break-word;[^}]*word-break:\s*normal;/s
    );
    expect(runtimeStyles).toMatch(
      /\.page :global\(\.arco-typography\),\s*\.detailDrawer :global\(\.arco-typography\)\s*\{[^}]*overflow-wrap:\s*inherit;[^}]*word-break:\s*inherit;/s
    );
    expect(runtimeStyles).not.toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('keeps archive controls and drawer actions within narrow containers', () => {
    expect(runtimeStyles).toMatch(/\.archiveEntry\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;/s);
    expect(runtimeStyles).toMatch(/\.archiveHeader\s*\{[^}]*flex-wrap:\s*wrap;[^}]*min-width:\s*0;/s);
    expect(runtimeStyles).toMatch(/\.archiveHeaderCopy\s*\{[^}]*min-width:\s*0;/s);
    expect(runtimeStyles).toMatch(/\.workItemList\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(runtimeStyles).toMatch(
      /\.detailActions :global\(\.arco-btn\)\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*normal;/s
    );
  });

  it('contains recovery content and long diagnostic tokens at 375 and 400 pixel widths', () => {
    expect(runtimeStyles).toMatch(
      /\.recoveryState\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s
    );
    expect(runtimeStyles).toMatch(
      /\.recoveryActions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*min-width:\s*0;/s
    );
    expect(runtimeStyles).toMatch(
      /\.technicalDetailsContent\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*break-word;/s
    );
    expect(runtimeStyles).toMatch(
      /@media \(max-width:\s*560px\)[\s\S]*\.recoveryActions\s*\{[^}]*align-items:\s*stretch;[^}]*flex-direction:\s*column;/s
    );
  });

  it('keeps the research map stable across desktop and narrow viewports', () => {
    expect(runtimeStyles).toMatch(
      /\.reasoningPage\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s
    );
    expect(runtimeStyles).toMatch(
      /\.reasoningWorkspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(300px, 360px\);[^}]*min-height:\s*520px;[^}]*overflow:\s*hidden;/s
    );
    expect(runtimeStyles).toMatch(
      /\.reasoningCanvas :global\(\.react-flow__node-scientificReasoning\)\s*\{[^}]*width:\s*276px;[^}]*height:\s*152px;/s
    );
    expect(runtimeStyles).toMatch(
      /\.reasoningCanvas\[data-compact='true'\] :global\(\.react-flow__node-scientificReasoning\)\s*\{[^}]*width:\s*184px;[^}]*height:\s*172px;/s
    );
    expect(runtimeStyles).toMatch(/\.reasoningEdgeHistorical :global\([^)]*\)\s*\{[^}]*stroke-dasharray:\s*8 6;/s);
    expect(runtimeStyles).toMatch(
      /\.reasoningEdgeBlocked :global\([^)]*\)\s*\{[^}]*stroke:\s*var\(--color-danger-6\);[^}]*stroke-dasharray:\s*2 5;/s
    );
    expect(runtimeStyles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none;/s);
    expect(runtimeStyles).toMatch(
      /\.reasoningCanvasTools\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*5;[^}]*top:\s*12px;[^}]*right:\s*12px;/s
    );
    expect(runtimeStyles).toMatch(
      /@media \(max-width:\s*1180px\)[\s\S]*\.reasoningWorkspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s
    );
    expect(runtimeStyles).toMatch(
      /@media \(max-width:\s*560px\)[\s\S]*\.reasoningHeaderActions\s*\{[^}]*justify-content:\s*space-between;/s
    );
  });
});

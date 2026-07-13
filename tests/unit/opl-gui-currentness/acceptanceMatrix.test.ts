import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPL_GUI_ACCEPTANCE_GAPS, OPL_GUI_ACCEPTANCE_MATRIX } from './acceptanceMatrix';

const REQUIRED_CAPABILITIES = [
  'desktop-rail-default',
  'mobile-rail-default',
  'desktop-environment-default',
  'mobile-environment-default',
  'desktop-composer-decision-controls',
  'mobile-composer-decision-controls',
  'projectless-text-only',
  'package-starter-unavailable',
  'package-starter-blocked',
  'package-starter-activating',
  'approval-timeline',
  'receipt-timeline',
  'keyboard-focus-return',
  'desktop-webui-shared-semantics',
] as const;

describe('OPL GUI product acceptance matrix', () => {
  it('accounts for every requested currentness capability exactly once', () => {
    const ids = OPL_GUI_ACCEPTANCE_MATRIX.map((entry) => entry.id);

    expect(ids).toEqual(REQUIRED_CAPABILITIES);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds every covered claim to tracked test evidence', () => {
    const covered = OPL_GUI_ACCEPTANCE_MATRIX.filter((entry) => entry.coverage !== 'gap');
    const missingEvidence = covered.flatMap((entry) =>
      entry.evidence
        .filter((evidencePath) => !fs.existsSync(path.resolve(process.cwd(), evidencePath)))
        .map((evidencePath) => `${entry.id}:${evidencePath}`)
    );

    expect(covered.every((entry) => entry.evidence.length > 0)).toBe(true);
    expect(missingEvidence).toEqual([]);
  });

  it('keeps unsupported states as explicit gaps instead of passing or skipping them', () => {
    expect(OPL_GUI_ACCEPTANCE_GAPS.map((entry) => entry.id)).toEqual([
      'package-starter-activating',
      'approval-timeline',
      'desktop-webui-shared-semantics',
    ]);
    expect(OPL_GUI_ACCEPTANCE_GAPS.every((entry) => entry.evidence.length === 0)).toBe(true);
    expect(OPL_GUI_ACCEPTANCE_GAPS.every((entry) => Boolean(entry.gapReason?.trim()))).toBe(true);
  });
});

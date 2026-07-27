import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { compareGuiVisualCohort } from '../../scripts/compare-gui-visual-cohort';

function createContract(masks: unknown[] = []): Record<string, unknown> {
  return {
    reference: {
      bundle_version: '26.707.72221',
      build: '5307',
      observed_on: '2026-07-15',
    },
    candidate: {
      app_contract_ref: 'contracts/app-gui-product-contract.json#gui_maintenance_policy.visual_comparison_protocol',
    },
    comparison_contract: {
      pixel_channel_delta_threshold: 8,
      changed_pixel_ratio_max: 0.25,
      mean_absolute_channel_delta_max: 4,
      alpha_channel_included: true,
      mask_policy: {
        maximum_masked_area_ratio: 0.5,
        allowed_reasons: ['caret_blink'],
      },
      human_review: {
        accepted_verdict: 'accepted',
      },
    },
    scene_matrix: [
      {
        id: 'composer',
        surface_family: 'home',
        viewport: 'desktop',
        theme: 'light',
        locale: 'zh-CN',
        route: '/guid',
        state: 'default',
        image: 'composer.png',
        masks,
      },
    ],
  };
}

async function writePng(filePath: string, pixels: number[]): Promise<void> {
  await sharp(Buffer.from(pixels), { raw: { width: 2, height: 2, channels: 4 } })
    .png()
    .toFile(filePath);
}

async function createFixture(): Promise<{
  root: string;
  referenceDir: string;
  candidateDir: string;
  outputDir: string;
  referencePath: string;
  candidatePath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'opl-gui-visual-cohort-'));
  const referenceDir = path.join(root, 'reference');
  const candidateDir = path.join(root, 'candidate');
  const outputDir = path.join(root, 'out');
  await Promise.all([fs.mkdir(referenceDir), fs.mkdir(candidateDir)]);
  const referencePath = path.join(referenceDir, 'composer.png');
  const candidatePath = path.join(candidateDir, 'composer.png');
  const pixels = [20, 20, 20, 255, 40, 40, 40, 255, 60, 60, 60, 255, 80, 80, 80, 255];
  await Promise.all([writePng(referencePath, pixels), writePng(candidatePath, pixels)]);
  return { root, referenceDir, candidateDir, outputDir, referencePath, candidatePath };
}

describe('compareGuiVisualCohort', () => {
  it('reports scene-bound parity only after an exact SHA-bound accepted review', async () => {
    const fixture = await createFixture();
    const [referenceBytes, candidateBytes] = await Promise.all([
      fs.readFile(fixture.referencePath),
      fs.readFile(fixture.candidatePath),
    ]);
    const referenceSha = createHash('sha256').update(referenceBytes).digest('hex');
    const candidateSha = createHash('sha256').update(candidateBytes).digest('hex');
    const report = await compareGuiVisualCohort({
      contract: createContract(),
      referenceDir: fixture.referenceDir,
      candidateDir: fixture.candidateDir,
      outputDir: fixture.outputDir,
      shellCommit: 'a'.repeat(40),
      packageOrDevBuildIdentity: 'dev-fixture',
      osVersion: 'macOS fixture',
      architecture: 'arm64',
      displayScale: '2',
      reviewManifest: {
        entries: [
          {
            scene_id: 'composer',
            reference_screenshot_sha256: referenceSha,
            candidate_screenshot_sha256: candidateSha,
            verdict: 'accepted',
          },
        ],
      },
    });

    expect(report.status).toBe('passed');
    expect(report.scene_bound_visual_parity).toBe(true);
    expect(report.all_pixel_thresholds_passed).toBe(true);
    await expect(fs.stat(path.join(fixture.outputDir, 'composer.diff.png'))).resolves.toBeDefined();
  });

  it('keeps parity false when the changed pixel is outside the declared threshold', async () => {
    const fixture = await createFixture();
    await writePng(fixture.candidatePath, [220, 20, 20, 255, 40, 40, 40, 255, 60, 60, 60, 255, 80, 80, 80, 255]);
    const report = await compareGuiVisualCohort({
      contract: createContract(),
      referenceDir: fixture.referenceDir,
      candidateDir: fixture.candidateDir,
      outputDir: fixture.outputDir,
      shellCommit: 'a'.repeat(40),
      packageOrDevBuildIdentity: 'dev-fixture',
      osVersion: 'macOS fixture',
      architecture: 'arm64',
      displayScale: '2',
    });

    expect(report.status).toBe('failed');
    expect(report.all_pixel_thresholds_passed).toBe(false);
    expect(report.scene_bound_visual_parity).toBe(false);
  });

  it('excludes an explicitly allowed dynamic mask but rejects an oversized mask', async () => {
    const fixture = await createFixture();
    await writePng(fixture.candidatePath, [220, 20, 20, 255, 40, 40, 40, 255, 60, 60, 60, 255, 80, 80, 80, 255]);
    const report = await compareGuiVisualCohort({
      contract: createContract([{ x: 0, y: 0, width: 1, height: 1, reason: 'caret_blink' }]),
      referenceDir: fixture.referenceDir,
      candidateDir: fixture.candidateDir,
      outputDir: fixture.outputDir,
      shellCommit: 'a'.repeat(40),
      packageOrDevBuildIdentity: 'dev-fixture',
      osVersion: 'macOS fixture',
      architecture: 'arm64',
      displayScale: '2',
    });

    expect(report.status).toBe('review_pending');
    expect(report.all_pixel_thresholds_passed).toBe(true);
    await expect(
      compareGuiVisualCohort({
        contract: createContract([{ x: 0, y: 0, width: 2, height: 2, reason: 'caret_blink' }]),
        referenceDir: fixture.referenceDir,
        candidateDir: fixture.candidateDir,
        outputDir: fixture.outputDir,
        shellCommit: 'a'.repeat(40),
        packageOrDevBuildIdentity: 'dev-fixture',
        osVersion: 'macOS fixture',
        architecture: 'arm64',
        displayScale: '2',
      })
    ).rejects.toThrow(/exceeding the allowed ratio/);
  });

  it('rejects non-exact Shell bindings and output-unsafe scene ids', async () => {
    const fixture = await createFixture();
    const options = {
      contract: createContract(),
      referenceDir: fixture.referenceDir,
      candidateDir: fixture.candidateDir,
      outputDir: fixture.outputDir,
      shellCommit: 'not-an-exact-commit',
      packageOrDevBuildIdentity: 'dev-fixture',
      osVersion: 'macOS fixture',
      architecture: 'arm64',
      displayScale: '2',
    };

    await expect(compareGuiVisualCohort(options)).rejects.toThrow(/exact 40-character lowercase Git commit/);

    const unsafeContract = createContract();
    const [scene] = unsafeContract.scene_matrix as Array<Record<string, unknown>>;
    scene.id = '../escape';
    await expect(
      compareGuiVisualCohort({
        ...options,
        contract: unsafeContract,
        shellCommit: 'a'.repeat(40),
      })
    ).rejects.toThrow(/output-safe identifier/);
  });
});

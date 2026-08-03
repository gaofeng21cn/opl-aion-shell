import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

type JsonRecord = Record<string, unknown>;

export type GuiVisualReviewManifest = {
  schema?: string;
  baseline_id?: string;
  approval_receipt_schema?: string;
  approval_receipt_sha256?: string;
  entries?: Array<{
    scene_id?: string;
    reference_screenshot_sha256?: string;
    candidate_screenshot_sha256?: string;
    verdict?: string;
  }>;
};

export type GuiVisualComparisonOptions = {
  contractBytes: Buffer | string;
  approvalReceiptBytes?: Buffer | string;
  referenceDir: string;
  candidateDir: string;
  outputDir: string;
  shellCommit: string;
  appContractCommit: string;
  appContractSha256: string;
  packageOrDevBuildIdentity: string;
  osVersion: string;
  architecture: string;
  displayScale: string;
  reviewManifest?: GuiVisualReviewManifest;
};

type RgbaImage = {
  data: Buffer;
  width: number;
  height: number;
};

type SceneMask = {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
};

const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const asString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string field: ${field}`);
  }
  return value;
};

const asNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing required numeric field: ${field}`);
  }
  return value;
};

const sha256 = async (filePath: string): Promise<string> =>
  createHash('sha256')
    .update(await fs.readFile(filePath))
    .digest('hex');

async function readRgba(filePath: string): Promise<RgbaImage> {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function readMasks(scene: JsonRecord, allowedReasons: Set<string>): SceneMask[] {
  if (!Array.isArray(scene.masks)) {
    throw new Error(`Scene ${asString(scene.id, 'scene.id')} must declare masks`);
  }

  return scene.masks.map((value, index) => {
    const mask = record(value);
    const parsed = {
      x: asNumber(mask.x, `scene.masks[${index}].x`),
      y: asNumber(mask.y, `scene.masks[${index}].y`),
      width: asNumber(mask.width, `scene.masks[${index}].width`),
      height: asNumber(mask.height, `scene.masks[${index}].height`),
      reason: asString(mask.reason, `scene.masks[${index}].reason`),
    };
    if (
      !Number.isInteger(parsed.x) ||
      !Number.isInteger(parsed.y) ||
      !Number.isInteger(parsed.width) ||
      !Number.isInteger(parsed.height) ||
      parsed.x < 0 ||
      parsed.y < 0 ||
      parsed.width <= 0 ||
      parsed.height <= 0 ||
      !allowedReasons.has(parsed.reason)
    ) {
      throw new Error(`Scene ${asString(scene.id, 'scene.id')} has an invalid declared mask`);
    }
    return parsed;
  });
}

function buildMaskedPixels(
  width: number,
  height: number,
  masks: SceneMask[],
  maximumMaskedAreaRatio: number
): Uint8Array {
  const masked = new Uint8Array(width * height);
  for (const mask of masks) {
    if (mask.x + mask.width > width || mask.y + mask.height > height) {
      throw new Error(`Mask ${mask.reason} is outside the ${width}x${height} screenshot`);
    }
    for (let y = mask.y; y < mask.y + mask.height; y += 1) {
      for (let x = mask.x; x < mask.x + mask.width; x += 1) {
        masked[y * width + x] = 1;
      }
    }
  }
  const maskedCount = masked.reduce((total, value) => total + value, 0);
  if (maskedCount / masked.length > maximumMaskedAreaRatio) {
    throw new Error(
      `Declared masks cover ${(maskedCount / masked.length).toFixed(4)} of the scene, exceeding the allowed ratio`
    );
  }
  return masked;
}

function reviewAccepted(
  reviewManifest: GuiVisualReviewManifest | undefined,
  sceneId: string,
  referenceScreenshotSha256: string,
  candidateScreenshotSha256: string
): boolean {
  return Boolean(
    reviewManifest?.entries?.some(
      (entry) =>
        entry.scene_id === sceneId &&
        entry.reference_screenshot_sha256 === referenceScreenshotSha256 &&
        entry.candidate_screenshot_sha256 === candidateScreenshotSha256 &&
        entry.verdict === 'accepted'
    )
  );
}

function requireBinding(options: GuiVisualComparisonOptions): void {
  for (const [field, value] of Object.entries({
    shellCommit: options.shellCommit,
    appContractCommit: options.appContractCommit,
    appContractSha256: options.appContractSha256,
    packageOrDevBuildIdentity: options.packageOrDevBuildIdentity,
    osVersion: options.osVersion,
    architecture: options.architecture,
    displayScale: options.displayScale,
  })) {
    if (!value.trim()) throw new Error(`Missing required comparison binding: ${field}`);
  }
  if (!/^[0-9a-f]{40}$/.test(options.shellCommit)) {
    throw new Error('Comparison shellCommit must be an exact 40-character lowercase Git commit');
  }
  if (!/^[0-9a-f]{40}$/.test(options.appContractCommit)) {
    throw new Error('Comparison appContractCommit must be an exact 40-character lowercase Git commit');
  }
  if (!/^[0-9a-f]{64}$/.test(options.appContractSha256)) {
    throw new Error('Comparison appContractSha256 must be an exact SHA256');
  }
}

export async function compareGuiVisualCohort(options: GuiVisualComparisonOptions): Promise<JsonRecord> {
  requireBinding(options);
  const contractBytes = Buffer.isBuffer(options.contractBytes)
    ? options.contractBytes
    : Buffer.from(options.contractBytes, 'utf8');
  const actualContractSha256 = createHash('sha256').update(contractBytes).digest('hex');
  if (actualContractSha256 !== options.appContractSha256) {
    throw new Error('App contract bytes do not match appContractSha256');
  }
  const contract = record(JSON.parse(contractBytes.toString('utf8')));
  const comparison = record(contract.comparison_contract);
  const maskPolicy = record(comparison.mask_policy);
  const humanReview = record(comparison.human_review);
  const reference = record(contract.reference);
  const candidate = record(contract.candidate);
  const scenes = Array.isArray(contract.scene_matrix) ? contract.scene_matrix.map(record) : [];
  if (!scenes.length) throw new Error('Visual cohort contract must contain at least one scene');
  const baselineId = asString(reference.baseline_id, 'reference.baseline_id');
  const approvalReceiptSchema = asString(reference.approval_receipt_schema, 'reference.approval_receipt_schema');
  const referenceState = asString(reference.state, 'reference.state');
  if (!['capture_and_human_approval_required', 'approved'].includes(referenceState)) {
    throw new Error(`Unsupported App visual reference state: ${referenceState}`);
  }
  const approvalReceiptSha = reference.approval_receipt_sha256;
  const approvalReceiptFile = reference.approval_receipt_file;
  if (
    approvalReceiptSha !== null &&
    approvalReceiptSha !== undefined &&
    !/^[0-9a-f]{64}$/.test(String(approvalReceiptSha))
  ) {
    throw new Error('reference.approval_receipt_sha256 must be an exact SHA256 when present');
  }
  if (referenceState === 'approved' && !approvalReceiptSha) {
    throw new Error('Approved App visual reference requires an approval receipt SHA256');
  }
  if (referenceState === 'capture_and_human_approval_required' && (approvalReceiptFile || approvalReceiptSha)) {
    throw new Error('Pending App visual reference cannot claim an approval receipt');
  }
  let approvalReceiptVerified = false;
  if (referenceState === 'approved') {
    if (typeof approvalReceiptFile !== 'string' || !approvalReceiptFile || !options.approvalReceiptBytes) {
      throw new Error('Approved App visual reference requires readable approval receipt bytes');
    }
    const approvalReceiptBytes = Buffer.isBuffer(options.approvalReceiptBytes)
      ? options.approvalReceiptBytes
      : Buffer.from(options.approvalReceiptBytes, 'utf8');
    if (createHash('sha256').update(approvalReceiptBytes).digest('hex') !== approvalReceiptSha) {
      throw new Error('Approval receipt bytes do not match the App contract SHA256');
    }
    const approvalReceipt = record(JSON.parse(approvalReceiptBytes.toString('utf8')));
    if (approvalReceipt.schema !== approvalReceiptSchema) {
      throw new Error('Approval receipt schema does not match the App contract');
    }
    approvalReceiptVerified = true;
  }
  if (options.reviewManifest) {
    if (options.reviewManifest.baseline_id !== baselineId) {
      throw new Error('Visual review manifest baseline_id does not match the App-owned baseline');
    }
    if (options.reviewManifest.approval_receipt_schema !== approvalReceiptSchema) {
      throw new Error('Visual review manifest approval receipt schema does not match the App contract');
    }
    if (approvalReceiptSha && options.reviewManifest.approval_receipt_sha256 !== approvalReceiptSha) {
      throw new Error('Visual review manifest approval receipt SHA256 does not match the App contract');
    }
  }

  const channelThreshold = asNumber(
    comparison.pixel_channel_delta_threshold,
    'comparison_contract.pixel_channel_delta_threshold'
  );
  const changedPixelRatioMax = asNumber(
    comparison.changed_pixel_ratio_max,
    'comparison_contract.changed_pixel_ratio_max'
  );
  const meanAbsoluteChannelDeltaMax = asNumber(
    comparison.mean_absolute_channel_delta_max,
    'comparison_contract.mean_absolute_channel_delta_max'
  );
  const maximumMaskedAreaRatio = asNumber(
    maskPolicy.maximum_masked_area_ratio,
    'comparison_contract.mask_policy.maximum_masked_area_ratio'
  );
  const allowedReasons = new Set(
    Array.isArray(maskPolicy.allowed_reasons)
      ? maskPolicy.allowed_reasons.map((value) => asString(value, 'comparison_contract.mask_policy.allowed_reasons'))
      : []
  );
  const includeAlpha = comparison.alpha_channel_included === true;
  const acceptedVerdict = asString(humanReview.accepted_verdict, 'comparison_contract.human_review.accepted_verdict');
  if (acceptedVerdict !== 'accepted') throw new Error('Visual cohort review manifest must use the accepted verdict');

  await fs.mkdir(options.outputDir, { recursive: true });
  const sceneResults: JsonRecord[] = [];

  for (const scene of scenes) {
    const sceneId = asString(scene.id, 'scene.id');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sceneId)) {
      throw new Error(`Scene id must be a lowercase kebab-case output-safe identifier: ${sceneId}`);
    }
    const image = asString(scene.image, `scene ${sceneId}.image`);
    if (path.basename(image) !== image) throw new Error(`Scene ${sceneId} image must be a plain filename`);

    const referencePath = path.join(options.referenceDir, image);
    const candidatePath = path.join(options.candidateDir, image);
    const [referenceImage, candidateImage, referenceScreenshotSha256, candidateScreenshotSha256] = await Promise.all([
      readRgba(referencePath),
      readRgba(candidatePath),
      sha256(referencePath),
      sha256(candidatePath),
    ]);
    if (referenceImage.width !== candidateImage.width || referenceImage.height !== candidateImage.height) {
      throw new Error(
        `Scene ${sceneId} dimensions differ: reference ${referenceImage.width}x${referenceImage.height}, candidate ${candidateImage.width}x${candidateImage.height}`
      );
    }

    const masks = readMasks(scene, allowedReasons);
    const maskedPixels = buildMaskedPixels(referenceImage.width, referenceImage.height, masks, maximumMaskedAreaRatio);
    const channels = includeAlpha ? 4 : 3;
    let comparedPixelCount = 0;
    let changedPixelCount = 0;
    let absoluteChannelDeltaTotal = 0;
    let maxChannelDelta = 0;
    const diff = Buffer.alloc(referenceImage.data.length);

    for (let pixel = 0; pixel < maskedPixels.length; pixel += 1) {
      const offset = pixel * 4;
      if (maskedPixels[pixel]) {
        diff[offset] = 0;
        diff[offset + 1] = 0;
        diff[offset + 2] = 0;
        diff[offset + 3] = 0;
        continue;
      }

      comparedPixelCount += 1;
      let pixelMaxDelta = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        const delta = Math.abs(referenceImage.data[offset + channel] - candidateImage.data[offset + channel]);
        absoluteChannelDeltaTotal += delta;
        pixelMaxDelta = Math.max(pixelMaxDelta, delta);
        maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      if (pixelMaxDelta > channelThreshold) {
        changedPixelCount += 1;
        diff[offset] = 224;
        diff[offset + 1] = 78;
        diff[offset + 2] = 78;
        diff[offset + 3] = 255;
      } else {
        const luminance = Math.round(
          candidateImage.data[offset] * 0.2126 +
            candidateImage.data[offset + 1] * 0.7152 +
            candidateImage.data[offset + 2] * 0.0722
        );
        diff[offset] = luminance;
        diff[offset + 1] = luminance;
        diff[offset + 2] = luminance;
        diff[offset + 3] = 64;
      }
    }
    if (!comparedPixelCount) throw new Error(`Scene ${sceneId} has no unmasked pixels to compare`);

    const changedPixelRatio = changedPixelCount / comparedPixelCount;
    const meanAbsoluteChannelDelta = absoluteChannelDeltaTotal / (comparedPixelCount * channels);
    const pixelThresholdsPassed =
      changedPixelRatio <= changedPixelRatioMax && meanAbsoluteChannelDelta <= meanAbsoluteChannelDeltaMax;
    const visualDeltaReviewed =
      approvalReceiptVerified &&
      reviewAccepted(options.reviewManifest, sceneId, referenceScreenshotSha256, candidateScreenshotSha256);
    const diffPath = path.join(options.outputDir, `${sceneId}.diff.png`);
    await sharp(diff, {
      raw: {
        width: referenceImage.width,
        height: referenceImage.height,
        channels: 4,
      },
    })
      .png()
      .toFile(diffPath);

    sceneResults.push({
      scene_id: sceneId,
      surface_family: asString(scene.surface_family, `scene ${sceneId}.surface_family`),
      viewport: asString(scene.viewport, `scene ${sceneId}.viewport`),
      theme: asString(scene.theme, `scene ${sceneId}.theme`),
      locale: asString(scene.locale, `scene ${sceneId}.locale`),
      route: asString(scene.route, `scene ${sceneId}.route`),
      state: asString(scene.state, `scene ${sceneId}.state`),
      reference_path: referencePath,
      candidate_path: candidatePath,
      reference_screenshot_sha256: referenceScreenshotSha256,
      candidate_screenshot_sha256: candidateScreenshotSha256,
      dimensions: {
        width: referenceImage.width,
        height: referenceImage.height,
        equal: true,
      },
      masks,
      masked_pixel_ratio: maskedPixels.reduce((total, value) => total + value, 0) / maskedPixels.length,
      changed_pixel_ratio: changedPixelRatio,
      mean_absolute_channel_delta: meanAbsoluteChannelDelta,
      max_channel_delta: maxChannelDelta,
      pixel_thresholds_passed: pixelThresholdsPassed,
      visual_delta_reviewed: visualDeltaReviewed,
      approval_receipt_verified: approvalReceiptVerified,
      scene_bound_visual_parity:
        pixelThresholdsPassed && visualDeltaReviewed && referenceState === 'approved' && approvalReceiptVerified,
      diff_png: diffPath,
    });
  }

  const allPixelThresholdsPassed = sceneResults.every((scene) => scene.pixel_thresholds_passed === true);
  const allScenesReviewed = sceneResults.every((scene) => scene.visual_delta_reviewed === true);
  const allScenesPassed =
    sceneResults.every((scene) => scene.scene_bound_visual_parity === true) &&
    referenceState === 'approved' &&
    approvalReceiptVerified;
  return {
    schema: 'opl_shell_gui_visual_comparison_report.v1',
    status: allScenesPassed ? 'passed' : allPixelThresholdsPassed ? 'review_pending' : 'failed',
    binding: {
      baseline_id: baselineId,
      reference_state: referenceState,
      approval_receipt_schema: approvalReceiptSchema,
      approval_receipt_sha256: approvalReceiptSha ?? null,
      approval_receipt_verified: approvalReceiptVerified,
      app_contract_commit: options.appContractCommit,
      app_contract_sha256: options.appContractSha256,
      app_contract_ref: asString(candidate.app_contract_ref, 'candidate.app_contract_ref'),
      shell_commit: options.shellCommit,
      package_or_dev_build_identity: options.packageOrDevBuildIdentity,
      os_version: options.osVersion,
      architecture: options.architecture,
      display_scale: options.displayScale,
    },
    scenes: sceneResults,
    all_pixel_thresholds_passed: allPixelThresholdsPassed,
    all_scenes_reviewed: allScenesReviewed,
    scene_bound_visual_parity: allScenesPassed,
    forbidden_inferences: {
      product_wide_one_to_one: false,
      installed_current: false,
      release_ready: false,
      upstream_absorbed: false,
    },
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error('Arguments must be --key value pairs');
    }
    args[key.slice(2)] = value;
  }
  return args;
}

async function readJson(filePath: string): Promise<JsonRecord> {
  return record(JSON.parse(await fs.readFile(filePath, 'utf8')));
}

const APP_CONTRACT_PATH = 'contracts/app-gui-visual-reference-cohort.json';

function git(repoRoot: string, args: string[], encoding: 'utf8' | 'buffer' = 'utf8'): string | Buffer {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function loadAppContractSnapshot(appRepoRoot: string): {
  contractBytes: Buffer;
  appContractCommit: string;
  appContractSha256: string;
  approvalReceiptBytes?: Buffer;
} {
  const appContractCommit = String(git(appRepoRoot, ['rev-parse', 'origin/main^{commit}'])).trim();
  if (!/^[0-9a-f]{40}$/.test(appContractCommit)) {
    throw new Error(`App origin/main did not resolve to an exact commit: ${appContractCommit}`);
  }
  const contractBytes = git(appRepoRoot, ['show', `${appContractCommit}:${APP_CONTRACT_PATH}`], 'buffer') as Buffer;
  const contract = record(JSON.parse(contractBytes.toString('utf8')));
  const reference = record(contract.reference);
  let approvalReceiptBytes: Buffer | undefined;
  if (reference.state === 'approved') {
    const receiptFile = asString(reference.approval_receipt_file, 'reference.approval_receipt_file');
    if (path.posix.basename(receiptFile) !== receiptFile) {
      throw new Error('App approval receipt file must be a plain filename');
    }
    const receiptPath = path.posix.join(path.posix.dirname(APP_CONTRACT_PATH), receiptFile);
    approvalReceiptBytes = git(appRepoRoot, ['show', `${appContractCommit}:${receiptPath}`], 'buffer') as Buffer;
  }
  return {
    contractBytes,
    appContractCommit,
    appContractSha256: createHash('sha256').update(contractBytes).digest('hex'),
    approvalReceiptBytes,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    'app-repo-root',
    'reference-dir',
    'candidate-dir',
    'output-dir',
    'shell-commit',
    'package-or-dev-build-identity',
    'os-version',
    'architecture',
    'display-scale',
  ];
  for (const field of required) {
    if (!args[field]) throw new Error(`Missing required --${field}`);
  }
  const reviewManifest = args['review-manifest'] ? await readJson(args['review-manifest']) : undefined;
  const appContract = loadAppContractSnapshot(args['app-repo-root']);
  const report = await compareGuiVisualCohort({
    contractBytes: appContract.contractBytes,
    approvalReceiptBytes: appContract.approvalReceiptBytes,
    referenceDir: args['reference-dir'],
    candidateDir: args['candidate-dir'],
    outputDir: args['output-dir'],
    shellCommit: args['shell-commit'],
    appContractCommit: appContract.appContractCommit,
    appContractSha256: appContract.appContractSha256,
    packageOrDevBuildIdentity: args['package-or-dev-build-identity'],
    osVersion: args['os-version'],
    architecture: args.architecture,
    displayScale: args['display-scale'],
    reviewManifest,
  });
  const reportPath = path.join(args['output-dir'], 'report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

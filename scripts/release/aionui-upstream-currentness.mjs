import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;
const ALLOWED_DISPOSITIONS = new Set([
  'selectively_absorbed',
  'reviewed_deferred',
  'reviewed_rejected',
  'reviewed_no_change',
]);
const AIONCORE_RELEASE_TARGETS = {
  'darwin-arm64': ['aarch64', 'apple-darwin', 'tar.gz'],
  'darwin-x64': ['x86_64', 'apple-darwin', 'tar.gz'],
  'linux-arm64': ['aarch64', 'unknown-linux-gnu', 'tar.gz'],
  'linux-x64': ['x86_64', 'unknown-linux-gnu', 'tar.gz'],
  'win32-arm64': ['aarch64', 'pc-windows-msvc', 'zip'],
  'win32-x64': ['x86_64', 'pc-windows-msvc', 'zip'],
};
const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_RECEIPT_PATH = path.join(DEFAULT_REPO_ROOT, 'contracts', 'aionui-upstream-intake.json');

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSha(value, label) {
  const sha = requireString(value, label);
  if (!SHA_PATTERN.test(sha)) throw new Error(`${label} must be a full lowercase Git SHA`);
  return sha;
}

function requireDigest(value, label) {
  const digest = requireString(value, label);
  if (!DIGEST_PATTERN.test(digest)) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return digest;
}

function requireIsoTimestamp(value, label) {
  const timestamp = requireString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${label} must be a UTC ISO-8601 timestamp`);
  }
  return timestamp;
}

export function parseStableTag(value) {
  const match = typeof value === 'string' ? VERSION_PATTERN.exec(value) : null;
  if (!match) return null;
  return {
    tag: `v${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
    parts: match.slice(1).map(Number),
  };
}

export function compareStableTags(left, right) {
  const leftVersion = parseStableTag(left);
  const rightVersion = parseStableTag(right);
  if (!leftVersion || !rightVersion) throw new Error('AionUI release tags must use vMAJOR.MINOR.PATCH');
  for (let index = 0; index < leftVersion.parts.length; index += 1) {
    if (leftVersion.parts[index] !== rightVersion.parts[index]) {
      return leftVersion.parts[index] - rightVersion.parts[index];
    }
  }
  return 0;
}

export function selectLatestStableRelease(releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub releases response must be an array');
  const candidates = releases
    .filter(
      (release) =>
        release &&
        release.draft === false &&
        release.prerelease === false &&
        parseStableTag(release.tag_name) &&
        typeof release.published_at === 'string' &&
        typeof release.html_url === 'string'
    )
    .map((release) => ({
      tag: parseStableTag(release.tag_name).tag,
      published_at: release.published_at,
      draft: false,
      prerelease: false,
      url: release.html_url,
    }))
    .sort((left, right) => compareStableTags(right.tag, left.tag));
  if (candidates.length === 0) throw new Error('AionUI has no official stable semantic-version release');
  return candidates[0];
}

export function parseRemoteTagCommit(output, tag) {
  const directRef = `refs/tags/${tag}`;
  const peeledRef = `${directRef}^{}`;
  let direct = null;
  let peeled = null;
  for (const line of String(output).split(/\r?\n/)) {
    const [sha, ref] = line.trim().split(/\s+/, 2);
    if (!SHA_PATTERN.test(sha ?? '')) continue;
    if (ref === directRef) direct = sha;
    if (ref === peeledRef) peeled = sha;
  }
  const commit = peeled ?? direct;
  if (!commit) throw new Error(`Unable to resolve AionUI release tag ${tag}`);
  return commit;
}

export function validateAionuiIntakeReceipt(value) {
  const receipt = requireObject(value, 'AionUI intake receipt');
  if (receipt.schema !== 'opl_aionui_upstream_intake.v2') {
    throw new Error('AionUI intake receipt schema must be opl_aionui_upstream_intake.v2');
  }
  if (receipt.upstream_repository !== 'https://github.com/iOfficeAI/AionUi.git') {
    throw new Error('AionUI intake receipt repository is not the official upstream');
  }
  if (receipt.channel !== 'stable_tags_only') {
    throw new Error('AionUI intake receipt channel must be stable_tags_only');
  }

  const reviewed = requireObject(receipt.reviewed_release, 'reviewed_release');
  const reviewedTag = parseStableTag(reviewed.tag);
  if (!reviewedTag || reviewedTag.tag !== reviewed.tag) {
    throw new Error('reviewed_release.tag must use canonical vMAJOR.MINOR.PATCH');
  }
  requireSha(reviewed.commit, 'reviewed_release.commit');
  requireIsoTimestamp(reviewed.published_at, 'reviewed_release.published_at');
  if (reviewed.draft !== false || reviewed.prerelease !== false) {
    throw new Error('reviewed_release must be an official non-draft, non-prerelease release');
  }
  requireString(reviewed.url, 'reviewed_release.url');
  if (reviewed.url !== `https://github.com/iOfficeAI/AionUi/releases/tag/${reviewed.tag}`) {
    throw new Error('reviewed_release.url must match its official GitHub release tag');
  }
  if (!ALLOWED_DISPOSITIONS.has(reviewed.disposition)) {
    throw new Error('reviewed_release.disposition is unsupported');
  }

  const absorbed = requireObject(receipt.absorbed_release, 'absorbed_release');
  const absorbedTag = parseStableTag(absorbed.tag);
  if (!absorbedTag || absorbedTag.tag !== absorbed.tag) {
    throw new Error('absorbed_release.tag must use canonical vMAJOR.MINOR.PATCH');
  }
  requireSha(absorbed.commit, 'absorbed_release.commit');
  if (compareStableTags(absorbed.tag, reviewed.tag) > 0) {
    throw new Error('absorbed_release cannot be newer than reviewed_release');
  }
  if (
    reviewed.disposition === 'selectively_absorbed' &&
    (absorbed.tag !== reviewed.tag || absorbed.commit !== reviewed.commit)
  ) {
    throw new Error('selectively_absorbed receipt must bind the reviewed release as absorbed');
  }

  const projection = requireObject(receipt.shell_projection, 'shell_projection');
  if (!Array.isArray(projection.implementation_refs) || projection.implementation_refs.length === 0) {
    throw new Error('shell_projection.implementation_refs must be a non-empty array');
  }
  for (const [index, ref] of projection.implementation_refs.entries()) {
    requireSha(ref, `shell_projection.implementation_refs[${index}]`);
  }
  requireString(projection.human_record, 'shell_projection.human_record');
  if (projection.aioncore_version_source !== 'package.json#aioncoreVersion') {
    throw new Error('shell_projection.aioncore_version_source must be package.json#aioncoreVersion');
  }

  const runtime = requireObject(receipt.managed_runtime, 'managed_runtime');
  const aioncore = requireObject(runtime.aioncore, 'managed_runtime.aioncore');
  const aioncoreVersion = parseStableTag(aioncore.version);
  if (!aioncoreVersion || aioncoreVersion.tag !== aioncore.version) {
    throw new Error('managed_runtime.aioncore.version must be a canonical semantic tag');
  }
  requireSha(aioncore.commit, 'managed_runtime.aioncore.commit');
  requireDigest(aioncore.archive_sha256, 'managed_runtime.aioncore.archive_sha256');
  const releaseAssets = requireObject(aioncore.release_assets, 'managed_runtime.aioncore.release_assets');
  const releaseAssetKeys = Object.keys(releaseAssets).sort();
  const expectedReleaseAssetKeys = Object.keys(AIONCORE_RELEASE_TARGETS).sort();
  if (
    releaseAssetKeys.length !== expectedReleaseAssetKeys.length ||
    releaseAssetKeys.some((key, index) => key !== expectedReleaseAssetKeys[index])
  ) {
    throw new Error(
      `managed_runtime.aioncore.release_assets must contain exactly ${expectedReleaseAssetKeys.join(', ')}`
    );
  }
  const releaseAssetDigests = new Set();
  for (const [runtimeKey, [arch, platform, extension]] of Object.entries(AIONCORE_RELEASE_TARGETS)) {
    const asset = requireObject(releaseAssets[runtimeKey], `managed_runtime.aioncore.release_assets.${runtimeKey}`);
    const expectedName = `aioncore-${aioncore.version}-${arch}-${platform}.${extension}`;
    if (asset.name !== expectedName) {
      throw new Error(`managed_runtime.aioncore.release_assets.${runtimeKey}.name must be ${expectedName}`);
    }
    releaseAssetDigests.add(
      requireDigest(asset.sha256, `managed_runtime.aioncore.release_assets.${runtimeKey}.sha256`)
    );
  }
  if (releaseAssetDigests.size !== expectedReleaseAssetKeys.length) {
    throw new Error('managed_runtime.aioncore.release_assets must bind one distinct digest per platform asset');
  }
  if (aioncore.archive_sha256 !== releaseAssets['darwin-arm64'].sha256) {
    throw new Error('managed_runtime.aioncore.archive_sha256 must project the darwin-arm64 release asset digest');
  }
  if (runtime.managed_resources_schema !== 2) {
    throw new Error('managed_runtime.managed_resources_schema must be 2');
  }
  const projectionPolicy = requireObject(
    runtime.managed_resources_projection,
    'managed_runtime.managed_resources_projection'
  );
  if (projectionPolicy.schema !== 'opl_aioncore_managed_resources_projection.v1') {
    throw new Error(
      'managed_runtime.managed_resources_projection.schema must be opl_aioncore_managed_resources_projection.v1'
    );
  }
  if (
    JSON.stringify(projectionPolicy.included_cli_names) !== JSON.stringify(['codex']) ||
    JSON.stringify(projectionPolicy.excluded_cli_names) !== JSON.stringify(['claude']) ||
    JSON.stringify(projectionPolicy.required_absent_paths) !==
      JSON.stringify([
        'cli/claude',
        'acp',
        'node_modules/@anthropic-ai/claude-code',
        'node_modules/claude-code',
        'claude',
      ])
  ) {
    throw new Error('managed_runtime.managed_resources_projection Codex-only policy is invalid');
  }
  requireDigest(runtime.managed_resources_manifest_sha256, 'managed_runtime.managed_resources_manifest_sha256');
  if (runtime.codex_acp !== undefined) {
    throw new Error('managed_runtime.codex_acp is forbidden for schema v2 direct-CLI resources');
  }
  const nodeRuntime = requireObject(runtime.node_runtime, 'managed_runtime.node_runtime');
  if (!/^\d+\.\d+\.\d+$/.test(nodeRuntime.version)) {
    throw new Error('managed_runtime.node_runtime must identify an exact version');
  }
  requireDigest(nodeRuntime.binary_sha256, 'managed_runtime.node_runtime.binary_sha256');
  const claudeCli = requireObject(runtime.claude_cli, 'managed_runtime.claude_cli');
  if (claudeCli.package !== '@anthropic-ai/claude-code' || !/^\d+\.\d+\.\d+$/.test(claudeCli.version)) {
    throw new Error('managed_runtime.claude_cli must identify an exact official package version');
  }
  requireDigest(claudeCli.binary_sha256, 'managed_runtime.claude_cli.binary_sha256');
  const codexCli = requireObject(runtime.codex_cli, 'managed_runtime.codex_cli');
  if (codexCli.package !== '@openai/codex' || !/^\d+\.\d+\.\d+$/.test(codexCli.version)) {
    throw new Error('managed_runtime.codex_cli must identify an exact official package version');
  }
  requireDigest(codexCli.binary_sha256, 'managed_runtime.codex_cli.binary_sha256');

  const policy = requireObject(receipt.policy, 'policy');
  if (
    policy.broad_history_merge !== 'forbidden' ||
    policy.newer_stable_release !== 'review_required' ||
    policy.network_unknown !== 'unknown_fail_closed_for_release_admission' ||
    policy.product_authority !== 'one-person-lab-app'
  ) {
    throw new Error('AionUI intake receipt policy is inconsistent with the App/Shell boundary');
  }
  return receipt;
}

export function evaluateAionuiCurrentness(receiptValue, observedValue) {
  const receipt = validateAionuiIntakeReceipt(receiptValue);
  const observed = requireObject(observedValue, 'observed release');
  const observedTag = parseStableTag(observed.tag);
  if (!observedTag || observedTag.tag !== observed.tag) {
    throw new Error('observed release tag must use canonical vMAJOR.MINOR.PATCH');
  }
  requireSha(observed.commit, 'observed release commit');
  requireIsoTimestamp(observed.published_at, 'observed release published_at');
  const versionDelta = compareStableTags(observed.tag, receipt.reviewed_release.tag);
  if (versionDelta > 0) {
    return {
      schema: 'opl_aionui_upstream_currentness.v1',
      status: 'review_required',
      reviewed_release: receipt.reviewed_release,
      observed_release: observed,
      release_mutation_performed: false,
    };
  }
  if (versionDelta < 0) {
    throw new Error('GitHub latest stable release is older than the recorded reviewed release');
  }
  if (observed.commit !== receipt.reviewed_release.commit) {
    throw new Error(`AionUI tag ${observed.tag} resolved to a different commit`);
  }
  if (
    observed.published_at !== receipt.reviewed_release.published_at ||
    observed.draft !== false ||
    observed.prerelease !== false ||
    observed.url !== receipt.reviewed_release.url
  ) {
    throw new Error(`AionUI release metadata drifted for ${observed.tag}`);
  }
  return {
    schema: 'opl_aionui_upstream_currentness.v1',
    status: 'current',
    reviewed_release: receipt.reviewed_release,
    observed_release: observed,
    release_mutation_performed: false,
  };
}

function runGit(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

export function validateReceiptAgainstCheckout(receiptValue, repoRoot, gitRunner = runGit) {
  const receipt = validateAionuiIntakeReceipt(receiptValue);
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (packageJson.aioncoreVersion !== receipt.managed_runtime.aioncore.version) {
    throw new Error('Shell package AionCore pin does not match the intake receipt');
  }
  const humanRecordPath = path.resolve(repoRoot, receipt.shell_projection.human_record);
  const relativeRecordPath = path.relative(repoRoot, humanRecordPath);
  if (!relativeRecordPath || relativeRecordPath === '..' || relativeRecordPath.startsWith(`..${path.sep}`)) {
    throw new Error('AionUI human intake record escapes the Shell checkout');
  }
  if (!fs.statSync(humanRecordPath).isFile()) throw new Error('AionUI human intake record is missing');
  for (const ref of receipt.shell_projection.implementation_refs) {
    const result = gitRunner(['merge-base', '--is-ancestor', ref, 'HEAD'], repoRoot);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Shell HEAD does not contain intake implementation ref ${ref}`);
  }
  return receipt;
}

async function fetchLatestStableRelease(receipt, fetchImpl, tagResolver) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'opl-aion-shell-currentness-check',
  };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const response = await fetchImpl('https://api.github.com/repos/iOfficeAI/AionUi/releases?per_page=100', { headers });
  if (!response.ok) throw new Error(`GitHub releases API returned HTTP ${response.status}`);
  const latest = selectLatestStableRelease(await response.json());
  return {
    ...latest,
    commit: await tagResolver(receipt.upstream_repository, latest.tag),
  };
}

async function defaultTagResolver(repository, tag) {
  const result = runGit(
    ['ls-remote', '--tags', repository, `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    DEFAULT_REPO_ROOT
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git exited ${result.status}`).trim());
  }
  return parseRemoteTagCommit(result.stdout, tag);
}

export async function checkAionuiCurrentness(
  receiptValue,
  { fetchImpl = globalThis.fetch, tagResolver = defaultTagResolver } = {}
) {
  const receipt = validateAionuiIntakeReceipt(receiptValue);
  let observed;
  try {
    observed = await fetchLatestStableRelease(receipt, fetchImpl, tagResolver);
  } catch (error) {
    return {
      schema: 'opl_aionui_upstream_currentness.v1',
      status: 'unknown',
      reason: error instanceof Error ? error.message : String(error),
      reviewed_release: receipt.reviewed_release,
      observed_release: null,
      release_mutation_performed: false,
    };
  }
  return evaluateAionuiCurrentness(receipt, observed);
}

function parseArgs(argv) {
  const options = {
    offline: false,
    receiptPath: DEFAULT_RECEIPT_PATH,
    repoRoot: DEFAULT_REPO_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--offline') options.offline = true;
    else if (argument === '--receipt' || argument === '--repo-root') {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a path`);
      if (argument === '--receipt') options.receiptPath = path.resolve(value);
      else options.repoRoot = path.resolve(value);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const receipt = JSON.parse(fs.readFileSync(options.receiptPath, 'utf8'));
  validateReceiptAgainstCheckout(receipt, options.repoRoot);
  if (options.offline) {
    console.log(
      JSON.stringify(
        {
          schema: 'opl_aionui_upstream_currentness.v1',
          status: 'receipt_valid',
          reviewed_release: receipt.reviewed_release,
          release_mutation_performed: false,
        },
        null,
        2
      )
    );
    return;
  }
  const result = await checkAionuiCurrentness(receipt);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'review_required') process.exitCode = 3;
  if (result.status === 'unknown') process.exitCode = 4;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}

/**
 * Prepare aioncore binary for packaging.
 *
 * Resolution order:
 *  1. GitHub Actions artifact download when AIONUI_BACKEND_RUN_ID is set
 *  2. GitHub release download (requires version or defaults to "latest")
 *
 * Output: {projectRoot}/resources/bundled-aioncore/{platform}-{arch}/
 *   - aioncore[.exe]
 *   - manifest.json
 *   - managed-resources/...
 *
 * @module prepare-aioncore
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { verifyBundledAioncoreResources } = require('./verify-bundled-aioncore-resources');

const GITHUB_OWNER = 'iOfficeAI';
const GITHUB_REPO = 'AionCore';
const DEFAULT_DOWNLOAD_ATTEMPTS = 4;
const DEFAULT_DOWNLOAD_RETRY_DELAY_MS = 5000;
const DEFAULT_MANAGED_RESOURCE_PREPARE_ATTEMPTS = 3;
const DEFAULT_MANAGED_RESOURCE_PREPARE_RETRY_DELAY_MS = 5000;
const DEFAULT_MANAGED_RESOURCE_NPM_FETCH_TIMEOUT_MS = 600000;
const DEFAULT_MANAGED_RESOURCE_NPM_FETCH_RETRIES = 5;
const MAX_DOWNLOAD_RETRY_DELAY_MS = 30000;
const MINIMUM_AIONCORE_VERSION = [0, 1, 49];
const REQUIRED_AIONCORE_OPTIONS = ['--recover-corrupted-database'];
const MATERIALIZE_INTERNAL_FILE_SYMLINKS_COMMAND = '--materialize-internal-file-symlinks';
const MANAGED_NODE_PRUNE_RELATIVE_PATHS = [
  'include',
  'share',
  'lib/node_modules/corepack',
  'node_modules/corepack',
  'bin/corepack',
  'corepack',
  'corepack.cmd',
];

const ACTIONS_ARTIFACT_TARGETS = {
  'darwin-arm64': {
    artifactName: 'aioncore-manual-macos-arm64',
    manualPlatform: 'macos-arm64',
  },
  'darwin-x64': {
    artifactName: 'aioncore-manual-macos-x64',
    manualPlatform: 'macos-x64',
  },
  'linux-arm64': {
    artifactName: 'aioncore-manual-linux-arm64',
    manualPlatform: 'linux-arm64',
  },
  'linux-x64': {
    artifactName: 'aioncore-manual-linux-x64',
    manualPlatform: 'linux-x64',
  },
  'win32-arm64': {
    artifactName: 'aioncore-manual-windows-arm64',
    manualPlatform: 'windows-arm64',
  },
  'win32-x64': {
    artifactName: 'aioncore-manual-windows-x64',
    manualPlatform: 'windows-x64',
  },
};

function getActionsArtifactTarget(platform, arch) {
  return ACTIONS_ARTIFACT_TARGETS[`${platform}-${arch}`] || null;
}

function getActionsArtifactName(platform, arch) {
  return getActionsArtifactTarget(platform, arch)?.artifactName || null;
}

function getActionsArtifactMissingMessage({ runId, platform, arch, expectedArtifactName, availableArtifactNames }) {
  const manualPlatform = getActionsArtifactTarget(platform, arch)?.manualPlatform || `${platform}-${arch}`;
  const availableArtifacts =
    Array.isArray(availableArtifactNames) && availableArtifactNames.length ? availableArtifactNames.join(', ') : 'none';
  return [
    `AionCore run ${runId} does not contain artifact [ ${expectedArtifactName} ] required for [ ${platform}-${arch} ].`,
    `Available artifacts: ${availableArtifacts}.`,
    `Re-run AionCore Manual Build with platform [ ${manualPlatform} ] or all.`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirectorySafe(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function copyDirectorySafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.cpSync(sourcePath, targetPath, { recursive: true, verbatimSymlinks: true });
}

function copyFileSafe(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function ensureExecutableMode(filePath) {
  if (process.platform === 'win32') return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {}
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function writePreparedRuntimeManifest(targetDir, input) {
  const manifest = {
    platform: input.platform,
    arch: input.arch,
    version: input.version,
    sourceType: input.sourceType,
    source: input.sourceDetail,
    compatibility: {
      reportedVersion: input.compatibility.version,
      requiredOptions: input.compatibility.requiredOptions,
    },
    files: [input.binaryName, 'managed-resources/'],
  };

  writeJson(path.join(targetDir, 'manifest.json'), manifest);
  return manifest;
}

function safeCacheSegment(value) {
  return String(value).replace(/[^0-9A-Za-z._-]/g, '_');
}

function defaultAioncoreCacheRoot({ platform = process.platform, env = process.env, homeDir = os.homedir() } = {}) {
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Caches', 'One Person Lab', 'aioncore');
  }
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim();
    return path.join(
      localAppData ? path.resolve(localAppData) : path.join(homeDir, 'AppData', 'Local'),
      'One Person Lab',
      'Cache',
      'aioncore'
    );
  }
  const xdgCacheHome = env.XDG_CACHE_HOME?.trim();
  return path.join(
    xdgCacheHome ? path.resolve(xdgCacheHome) : path.join(homeDir, '.cache'),
    'one-person-lab',
    'aioncore'
  );
}

function getAioncoreCachePaths(projectRoot, runtimeKey, cacheVersion) {
  const cacheRoot = process.env.AIONUI_AIONCORE_CACHE_DIR?.trim() || defaultAioncoreCacheRoot();
  const cacheId = `${runtimeKey}-${safeCacheSegment(cacheVersion)}`;
  const resourcesRoot = path.join(cacheRoot, cacheId);
  const runtimeDir = path.join(resourcesRoot, 'bundled-aioncore', runtimeKey);
  return { resourcesRoot, runtimeDir };
}

function isPreparedRuntimeValid(resourcesRoot, electronPlatformName, targetArch) {
  const result = verifyBundledAioncoreResources({ resourcesDir: resourcesRoot, electronPlatformName, targetArch });
  return result.missing.length === 0 && result.invalid.length === 0;
}

function restorePreparedRuntimeFromCache({
  cacheRuntimeDir,
  targetDir,
  resourcesRoot,
  platform,
  arch,
  expectedVersion,
  compatibilityExecFileSync,
}) {
  if (!fs.existsSync(cacheRuntimeDir)) return false;
  if (!isPreparedRuntimeValid(resourcesRoot, platform, arch)) return false;

  removeDirectorySafe(targetDir);
  copyDirectorySafe(cacheRuntimeDir, targetDir);
  try {
    assertAioncoreCompatibility(path.join(targetDir, getBinaryName(platform)), expectedVersion, {
      execFileSync: compatibilityExecFileSync,
    });
  } catch (error) {
    removeDirectorySafe(targetDir);
    throw error;
  }
  return true;
}

function savePreparedRuntimeToCache({ targetDir, cacheRuntimeDir }) {
  const tempRuntimeDir = `${cacheRuntimeDir}.tmp-${process.pid}`;
  removeDirectorySafe(tempRuntimeDir);
  ensureDirectory(path.dirname(cacheRuntimeDir));
  try {
    copyDirectorySafe(targetDir, tempRuntimeDir);
    removeDirectorySafe(cacheRuntimeDir);
    fs.renameSync(tempRuntimeDir, cacheRuntimeDir);
  } finally {
    removeDirectorySafe(tempRuntimeDir);
  }
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function normalizeAioncoreVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/, '');
}

function compareStableVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const delta = left[index] - right[index];
    if (delta !== 0) return delta;
  }
  return 0;
}

function assertAioncoreCompatibility(binaryPath, expectedVersion, options = {}) {
  const execFile = options.execFileSync || execFileSync;
  let versionOutput;
  let helpOutput;

  try {
    versionOutput = String(execFile(binaryPath, ['--version'], { encoding: 'utf-8', timeout: 15000 })).trim();
  } catch (error) {
    throw new Error(
      `AionCore compatibility check failed: --version probe failed for ${binaryPath}: ${error?.message || error}`,
      { cause: error }
    );
  }

  const versionMatch = /^aioncore\s+(\d+)\.(\d+)\.(\d+)$/.exec(versionOutput);
  if (!versionMatch) {
    throw new Error(
      `AionCore compatibility check failed: unrecognized --version output: ${versionOutput || '<empty>'}`
    );
  }

  const reportedVersionParts = versionMatch.slice(1).map(Number);
  const reportedVersion = reportedVersionParts.join('.');
  const normalizedExpectedVersion = normalizeAioncoreVersion(expectedVersion);
  if (normalizedExpectedVersion && reportedVersion !== normalizedExpectedVersion) {
    throw new Error(
      `AionCore compatibility check failed: expected ${normalizedExpectedVersion}, reported ${reportedVersion}`
    );
  }
  if (compareStableVersions(reportedVersionParts, MINIMUM_AIONCORE_VERSION) < 0) {
    throw new Error(`AionCore recovery requires AionCore >= 0.1.49, reported ${reportedVersion}`);
  }

  try {
    helpOutput = String(execFile(binaryPath, ['--help'], { encoding: 'utf-8', timeout: 15000 }));
  } catch (error) {
    throw new Error(
      `AionCore compatibility check failed: --help probe failed for ${binaryPath}: ${error?.message || error}`,
      { cause: error }
    );
  }

  for (const option of REQUIRED_AIONCORE_OPTIONS) {
    if (!helpOutput.includes(option)) {
      throw new Error(`AionCore compatibility check failed: missing required option ${option}`);
    }
  }

  return { version: reportedVersion, requiredOptions: [...REQUIRED_AIONCORE_OPTIONS] };
}

function assertPreparedRuntimeManifestCompatibility(runtimeDir, platform, arch, expectedVersion) {
  const manifestPath = path.join(runtimeDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Prepared AionCore runtime manifest is unreadable: ${manifestPath}`, { cause: error });
  }

  const expected = normalizeAioncoreVersion(expectedVersion);
  const declared = normalizeAioncoreVersion(manifest.version);
  const reported = normalizeAioncoreVersion(manifest.compatibility?.reportedVersion);
  const requiredOptions = Array.isArray(manifest.compatibility?.requiredOptions)
    ? manifest.compatibility.requiredOptions
    : [];

  if (manifest.platform !== platform || manifest.arch !== arch) {
    throw new Error(
      `Prepared AionCore runtime target mismatch: expected ${platform}-${arch}, received ${manifest.platform}-${manifest.arch}`
    );
  }
  if (!expected || declared !== expected || reported !== expected) {
    throw new Error(
      `Prepared AionCore runtime version mismatch: expected ${expected || '<missing>'}, declared ${
        declared || '<missing>'
      }, reported ${reported || '<missing>'}`
    );
  }
  for (const option of REQUIRED_AIONCORE_OPTIONS) {
    if (!requiredOptions.includes(option)) {
      throw new Error(`Prepared AionCore runtime compatibility is missing required option ${option}`);
    }
  }

  return { version: reported, requiredOptions: [...REQUIRED_AIONCORE_OPTIONS] };
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nodeExecutableRelativePath(platform) {
  return platform === 'win32' ? ['node.exe'] : ['bin', 'node'];
}

function removePathIfPresent(targetPath) {
  try {
    fs.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function removeEmptyDirectoriesUpTo(startDir, stopDir) {
  let current = startDir;
  const resolvedStop = path.resolve(stopDir);

  while (path.resolve(current).startsWith(resolvedStop) && path.resolve(current) !== resolvedStop) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
      current = path.dirname(current);
      continue;
    }
    if (fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function realpathIfPresent(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function normalizeInternalSymlinks(rootDir, options = {}, currentDir = rootDir, result = []) {
  if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
    return result;
  }

  const sourceRootDir = options.sourceRootDir || rootDir;
  const resolvedSourceRootDir = realpathIfPresent(sourceRootDir);

  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(absolutePath);
      if (!path.isAbsolute(linkTarget)) {
        continue;
      }

      const normalizedTarget = path.normalize(linkTarget);
      const resolvedTarget = realpathIfPresent(normalizedTarget);
      if (!isPathInside(resolvedTarget, resolvedSourceRootDir)) {
        continue;
      }

      const relocatedTarget = path.join(rootDir, path.relative(resolvedSourceRootDir, resolvedTarget));
      const relativeTarget = path.relative(path.dirname(absolutePath), relocatedTarget) || '.';
      fs.rmSync(absolutePath, { force: true });
      fs.symlinkSync(relativeTarget, absolutePath);
      result.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
      continue;
    }

    if (entry.isDirectory()) {
      normalizeInternalSymlinks(rootDir, options, absolutePath, result);
    }
  }

  return result;
}

function materializeInternalFileSymlinks(rootDir) {
  const resolvedRootDir = fs.realpathSync(rootDir);
  const result = {
    materialized: [],
    hardLinked: [],
    copied: [],
    removedDangling: [],
  };

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
        const linkTarget = fs.readlinkSync(absolutePath);
        const unresolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
        if (!isPathInside(unresolvedTarget, resolvedRootDir)) {
          throw new Error(`Managed resource symlink points outside the bundle: ${relativePath}`);
        }
        let resolvedTarget;
        try {
          resolvedTarget = fs.realpathSync(absolutePath);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
          fs.unlinkSync(absolutePath);
          result.removedDangling.push(relativePath);
          continue;
        }
        if (!isPathInside(resolvedTarget, resolvedRootDir)) {
          throw new Error(`Managed resource symlink points outside the bundle: ${relativePath}`);
        }
        let targetStat;
        try {
          targetStat = fs.statSync(resolvedTarget);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
          fs.unlinkSync(absolutePath);
          result.removedDangling.push(relativePath);
          continue;
        }
        if (!targetStat.isFile()) {
          throw new Error(`Managed resource symlink target is not a file: ${relativePath}`);
        }

        fs.unlinkSync(absolutePath);
        try {
          fs.linkSync(resolvedTarget, absolutePath);
          result.hardLinked.push(relativePath);
        } catch {
          fs.copyFileSync(resolvedTarget, absolutePath);
          fs.chmodSync(absolutePath, fs.statSync(resolvedTarget).mode & 0o777);
          result.copied.push(relativePath);
        }
        result.materialized.push(relativePath);
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      }
    }
  }

  visit(rootDir);
  return result;
}

function resolveManagedNodeExecutable(managedResourcesDir, platform) {
  const nodeRoot = path.join(managedResourcesDir, 'node');
  const executableParts = nodeExecutableRelativePath(platform);
  const candidates = fs
    .readdirSync(nodeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(nodeRoot, entry.name, ...executableParts))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    .toSorted();

  if (candidates.length !== 1) {
    throw new Error(
      `Managed resources must contain exactly one ${platform} Node executable, found ${candidates.length}`
    );
  }
  return candidates[0];
}

function pruneManagedNodeRuntime(managedResourcesDir, platform = process.platform) {
  const nodeRoot = path.join(managedResourcesDir, 'node');
  const result = {
    pruned: [],
    checkedExecutables: [],
    normalizedSymlinks: [],
  };

  if (!fs.existsSync(nodeRoot) || !fs.statSync(nodeRoot).isDirectory()) {
    return result;
  }

  const executableParts = nodeExecutableRelativePath(platform);
  const versions = fs
    .readdirSync(nodeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  for (const version of versions) {
    const versionDir = path.join(nodeRoot, version);
    const executablePath = path.join(versionDir, ...executableParts);
    result.checkedExecutables.push(path.relative(managedResourcesDir, executablePath).split(path.sep).join('/'));

    if (!fs.existsSync(executablePath) || !fs.statSync(executablePath).isFile()) {
      throw new Error(
        `Managed Node runtime is missing required executable: ${path.relative(process.cwd(), executablePath)}`
      );
    }

    for (const relativePath of MANAGED_NODE_PRUNE_RELATIVE_PATHS) {
      const targetPath = path.join(versionDir, ...relativePath.split('/'));
      if (removePathIfPresent(targetPath)) {
        result.pruned.push(path.relative(managedResourcesDir, targetPath).split(path.sep).join('/'));
        removeEmptyDirectoriesUpTo(path.dirname(targetPath), versionDir);
      }
    }

    for (const normalizedSymlink of normalizeInternalSymlinks(versionDir)) {
      result.normalizedSymlinks.push(path.join('node', version, normalizedSymlink).split(path.sep).join('/'));
    }
  }

  return result;
}

function sleepSync(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getDownloadAttempts() {
  return parsePositiveInteger(process.env.AIONUI_AIONCORE_DOWNLOAD_ATTEMPTS, DEFAULT_DOWNLOAD_ATTEMPTS);
}

function getDownloadRetryDelayMs() {
  return parsePositiveInteger(process.env.AIONUI_AIONCORE_DOWNLOAD_RETRY_DELAY_MS, DEFAULT_DOWNLOAD_RETRY_DELAY_MS);
}

function getManagedResourcePrepareAttempts() {
  return parsePositiveInteger(
    process.env.AIONUI_AIONCORE_MANAGED_RESOURCE_ATTEMPTS,
    DEFAULT_MANAGED_RESOURCE_PREPARE_ATTEMPTS
  );
}

function getManagedResourcePrepareRetryDelayMs() {
  return parsePositiveInteger(
    process.env.AIONUI_AIONCORE_MANAGED_RESOURCE_RETRY_DELAY_MS,
    DEFAULT_MANAGED_RESOURCE_PREPARE_RETRY_DELAY_MS
  );
}

function withDefaultEnvValue(env, key, value) {
  return env[key] ? env[key] : String(value);
}

function getManagedResourcePrepareEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    AIONUI_BUNDLED_MANAGED_RESOURCES: '',
    npm_config_fetch_timeout: withDefaultEnvValue(
      baseEnv,
      'npm_config_fetch_timeout',
      DEFAULT_MANAGED_RESOURCE_NPM_FETCH_TIMEOUT_MS
    ),
    npm_config_fetch_retries: withDefaultEnvValue(
      baseEnv,
      'npm_config_fetch_retries',
      DEFAULT_MANAGED_RESOURCE_NPM_FETCH_RETRIES
    ),
    npm_config_audit: withDefaultEnvValue(baseEnv, 'npm_config_audit', 'false'),
    npm_config_fund: withDefaultEnvValue(baseEnv, 'npm_config_fund', 'false'),
  };
}

function prepareManagedResources(binaryPath, targetDir, options = {}) {
  const bundleOut = path.join(targetDir, 'managed-resources');
  const dataDir = path.join(targetDir, '.prepare-data');
  const targetPlatform = options.platform || process.platform;
  const hostPlatform = options.hostPlatform || process.platform;
  const execFile = options.execFileSync || execFileSync;
  const attempts = parsePositiveInteger(options.attempts, getManagedResourcePrepareAttempts());
  const baseDelayMs = parsePositiveInteger(options.retryDelayMs, getManagedResourcePrepareRetryDelayMs());
  const sleep = options.sleep || sleepSync;
  const logger = options.logger || console;
  let lastError = null;

  removeDirectorySafe(bundleOut);
  removeDirectorySafe(dataDir);
  ensureDirectory(dataDir);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    removeDirectorySafe(bundleOut);
    ensureDirectory(bundleOut);
    logger.log(
      `  Preparing managed resources under ${path.relative(process.cwd(), bundleOut)} (${attempt}/${attempts})`
    );

    try {
      execFile(binaryPath, ['--data-dir', dataDir, 'prepare-managed-resources', '--bundle-out', bundleOut], {
        stdio: 'inherit',
        env: getManagedResourcePrepareEnv(options.env || process.env),
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      removeDirectorySafe(bundleOut);
      if (attempt >= attempts) {
        break;
      }

      const delayMs = Math.min(baseDelayMs * attempt, MAX_DOWNLOAD_RETRY_DELAY_MS);
      logger.warn(`  Managed resource preparation attempt ${attempt}/${attempts} failed: ${error?.message || error}`);
      logger.warn(`  Waiting ${delayMs}ms before retrying managed resource preparation`);
      sleep(delayMs);
    }
  }

  if (lastError) {
    removeDirectorySafe(dataDir);
    throw new Error(
      [
        `Managed resource preparation failed after ${attempts} attempts for ${path.relative(process.cwd(), binaryPath)}.`,
        'The partial managed-resources directory was removed; rerun the same build command.',
        `Cause: ${lastError?.message || lastError}`,
      ].join(' '),
      { cause: lastError }
    );
  }

  removeDirectorySafe(dataDir);
  if (hostPlatform === 'win32' && targetPlatform === 'linux') {
    const managedNodeExecutable = resolveManagedNodeExecutable(bundleOut, targetPlatform);
    const output = execFile(
      managedNodeExecutable,
      [__filename, MATERIALIZE_INTERNAL_FILE_SYMLINKS_COMMAND, bundleOut],
      {
        encoding: 'utf8',
        env: options.env || process.env,
      }
    );
    const materialization = JSON.parse(String(output).trim());
    logger.log(
      `  Materialized ${materialization.materialized.length} Linux managed-resource symlink(s) for Windows packaging`
    );
  }
  const pruneResult = pruneManagedNodeRuntime(bundleOut, targetPlatform);
  if (pruneResult.pruned.length > 0) {
    console.log(`  Pruned managed Node runtime resources (${pruneResult.pruned.length} paths)`);
  }
  return bundleOut;
}

// ---------------------------------------------------------------------------
// Source resolvers
// ---------------------------------------------------------------------------

/**
 * Resolve the actual version tag when "latest" is requested.
 * Uses GitHub API via `gh` CLI (needs GH_TOKEN in CI) or falls back to
 * `curl` with an optional Authorization header (GITHUB_TOKEN / GH_TOKEN).
 */
function resolveLatestTag() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // 1. Try gh CLI (honours GH_TOKEN automatically)
  try {
    const out = execSync(`gh api repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest --jq .tag_name`, {
      encoding: 'utf-8',
      timeout: 15000,
    }).trim();
    if (out) return out;
  } catch {
    // gh CLI not available or no token — fall back to curl
  }

  // 2. Curl with optional token to avoid rate-limit 403
  try {
    const authArgs = token ? ['-H', `Authorization: token ${token}`] : [];
    const args = ['-fsSL', ...authArgs, `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`];
    const out = execFileSync('curl', args, { encoding: 'utf-8', timeout: 15000 });
    const tag = JSON.parse(out).tag_name;
    if (tag) return tag;
  } catch {
    // network issue or rate-limited
  }

  return null;
}

/**
 * Build the release asset filename for the given platform/arch/tag.
 *
 * Expected asset naming convention:
 *   aioncore-v0.1.0-aarch64-apple-darwin.tar.gz
 */
function getAssetName(platform, arch, tag) {
  const archMap = { x64: 'x86_64', arm64: 'aarch64' };
  const platformMap = {
    darwin: 'apple-darwin',
    linux: 'unknown-linux-gnu',
    win32: 'pc-windows-msvc',
  };
  const normalizedArch = archMap[arch];
  const normalizedPlatform = platformMap[platform];
  if (!normalizedArch || !normalizedPlatform) return null;
  const ext = platform === 'win32' ? '.zip' : '.tar.gz';
  return `aioncore-${tag}-${normalizedArch}-${normalizedPlatform}${ext}`;
}

function getDownloadUrl(assetName, tag) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${assetName}`;
}

function runDownloadOnce(url, outputPath, options = {}) {
  const platform = options.platform || process.platform;
  const execFile = options.execFileSync || execFileSync;
  const timeout = options.timeout || 120000;

  if (platform === 'win32') {
    const ps = `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${outputPath.replace(/'/g, "''")}'`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      timeout,
    });
    return;
  }

  try {
    execFile('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], { timeout });
  } catch (curlError) {
    try {
      execFile('wget', ['-q', '-O', outputPath, url], { timeout });
    } catch (wgetError) {
      const error = new Error(`curl failed: ${curlError.message}; wget failed: ${wgetError.message}`);
      error.cause = wgetError;
      throw error;
    }
  }
}

function removePartialDownload(outputPath) {
  try {
    fs.rmSync(outputPath, { force: true });
  } catch {}
}

function downloadFile(url, outputPath, options = {}) {
  const attempts = parsePositiveInteger(options.attempts, getDownloadAttempts());
  const baseDelayMs = parsePositiveInteger(options.retryDelayMs, getDownloadRetryDelayMs());
  const sleep = options.sleep || sleepSync;
  const logger = options.logger || console;
  let lastError = null;

  logger.log(`  Downloading aioncore from ${url}`);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (attempt > 1) {
        logger.log(`  Retry aioncore download (${attempt}/${attempts})`);
      }
      runDownloadOnce(url, outputPath, options);
      return;
    } catch (error) {
      lastError = error;
      removePartialDownload(outputPath);
      if (attempt >= attempts) {
        break;
      }

      const delayMs = Math.min(baseDelayMs * attempt, MAX_DOWNLOAD_RETRY_DELAY_MS);
      logger.warn(`  Aioncore download attempt ${attempt}/${attempts} failed: ${error.message}`);
      logger.warn(`  Waiting ${delayMs}ms before retrying aioncore download`);
      sleep(delayMs);
    }
  }

  throw new Error(`aioncore download failed after ${attempts} attempts: ${lastError?.message || 'unknown error'}`);
}

function extractArchive(archivePath, outputDir, platform) {
  ensureDirectory(outputDir);
  if (platform === 'win32' || archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      const ps = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`;
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
    } else {
      execFileSync('unzip', ['-o', archivePath, '-d', outputDir]);
    }
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', outputDir]);
  }
}

function findBinaryInDir(dir, binaryName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === binaryName) return fullPath;
    if (entry.isDirectory()) {
      const found = findBinaryInDir(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
}

function findAioncoreArchiveInDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isFile() &&
      entry.name.startsWith('aioncore-') &&
      (entry.name.endsWith('.zip') || entry.name.endsWith('.tar.gz'))
    ) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findAioncoreArchiveInDir(fullPath);
      if (found) return found;
    }
  }
  return null;
}

function getGitHubToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

function githubApiGetJson(apiPath) {
  const token = getGitHubToken();

  try {
    return JSON.parse(
      execFileSync('gh', ['api', apiPath], {
        encoding: 'utf-8',
        timeout: 15000,
        env: {
          ...process.env,
          GH_TOKEN: token || process.env.GH_TOKEN,
        },
      })
    );
  } catch {
    // gh CLI not available or failed — fall back to curl.
  }

  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (token) {
    headers.push('-H', `Authorization: Bearer ${token}`);
  }

  const url = `https://api.github.com/${apiPath}`;
  const out = execFileSync('curl', ['-fsSL', ...headers, url], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return JSON.parse(out);
}

function downloadFileWithAuth(url, outputPath) {
  const token = getGitHubToken();
  const headers = ['-H', 'Accept: application/vnd.github+json'];
  if (token) {
    headers.push('-H', `Authorization: Bearer ${token}`);
  }

  try {
    execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', ...headers, '-o', outputPath, url], {
      timeout: 120000,
    });
    return;
  } catch {
    // curl may be unavailable in some local environments; try gh before failing.
  }

  execFileSync('gh', ['api', url, '--output', outputPath], {
    timeout: 120000,
    env: {
      ...process.env,
      GH_TOKEN: token || process.env.GH_TOKEN,
    },
  });
}

function listActionsArtifacts(runId) {
  const response = githubApiGetJson(
    `repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts?per_page=100`
  );
  return Array.isArray(response?.artifacts) ? response.artifacts : [];
}

function downloadAndExtractActionsArtifact(platform, arch, runId) {
  const expectedArtifactName = getActionsArtifactName(platform, arch);
  if (!expectedArtifactName) {
    throw new Error(`Unsupported AionCore Actions artifact target: ${platform}-${arch}`);
  }

  const artifacts = listActionsArtifacts(runId);
  const availableArtifactNames = artifacts
    .map((artifact) => artifact.name)
    .filter(Boolean)
    .toSorted();
  const artifact = artifacts.find((candidate) => candidate.name === expectedArtifactName);
  if (!artifact) {
    throw new Error(
      getActionsArtifactMissingMessage({
        runId,
        platform,
        arch,
        expectedArtifactName,
        availableArtifactNames,
      })
    );
  }

  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare-actions', runId, `${platform}-${arch}`);
  const artifactZipPath = path.join(tempDir, `${expectedArtifactName}.zip`);
  const artifactExtractDir = path.join(tempDir, 'artifact');
  const binaryExtractDir = path.join(tempDir, 'binary');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  const downloadUrl =
    artifact.archive_download_url ||
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/artifacts/${artifact.id}/zip`;
  console.log(`  Downloading aioncore from AionCore run ${runId} artifact ${expectedArtifactName}`);
  downloadFileWithAuth(downloadUrl, artifactZipPath);
  extractArchive(artifactZipPath, artifactExtractDir, platform);

  const archivePath = findAioncoreArchiveInDir(artifactExtractDir);
  if (!archivePath) {
    throw new Error(`AionCore artifact ${expectedArtifactName} from run ${runId} does not contain an aioncore archive`);
  }

  extractArchive(archivePath, binaryExtractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(binaryExtractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in AionCore artifact ${expectedArtifactName} from run ${runId}`);
  }

  return {
    binaryPath,
    tempDir,
    artifactName: expectedArtifactName,
    archivePath,
    url: downloadUrl,
  };
}

function downloadAndExtract(platform, arch, tag) {
  const assetName = getAssetName(platform, arch, tag);
  if (!assetName) {
    throw new Error(`Unsupported aioncore target: ${platform}-${arch}`);
  }

  const url = getDownloadUrl(assetName, tag);
  const tempDir = path.join(os.tmpdir(), 'aioncore-prepare', tag, `${platform}-${arch}`);
  const archivePath = path.join(tempDir, assetName);
  const extractDir = path.join(tempDir, 'extracted');

  removeDirectorySafe(tempDir);
  ensureDirectory(tempDir);

  downloadFile(url, archivePath);
  extractArchive(archivePath, extractDir, platform);

  const binaryName = getBinaryName(platform);
  const binaryPath = findBinaryInDir(extractDir, binaryName);
  if (!binaryPath) {
    throw new Error(`Binary ${binaryName} not found in downloaded archive`);
  }

  return { binaryPath, tempDir, url };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Prepare aioncore binary for packaging.
 *
 * @param {object} options - Configuration options
 * @param {string} options.projectRoot - Project root directory
 * @param {string} options.platform - Target platform (process.platform)
 * @param {string} options.arch - Target architecture (process.arch)
 * @param {string} options.version - Backend version (default: 'latest')
 * @returns {{ prepared: true; dir: string; sourceType: string }}
 */
function prepareAioncore(options) {
  const {
    projectRoot,
    platform,
    arch,
    version = 'latest',
    compatibilityExecFileSync,
    materializeInternalSymlinksForWindows = false,
  } = options;
  const runtimeKey = `${platform}-${arch}`;
  const actionsRunId = (process.env.AIONUI_BACKEND_RUN_ID || '').trim();

  let tag = null;
  if (!actionsRunId) {
    // Resolve the actual version tag — release asset filenames include the tag.
    if (version === 'latest') {
      const resolved = resolveLatestTag();
      if (!resolved) {
        throw new Error('Failed to resolve latest aioncore release tag from GitHub API');
      }
      tag = resolved;
      console.log(`Resolved aioncore "latest" → ${tag}`);
    } else {
      tag = version.startsWith('v') ? version : `v${version}`;
    }
  }

  const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', runtimeKey);
  const binaryName = getBinaryName(platform);
  const targetBinaryPath = path.join(targetDir, binaryName);
  const cacheVersion = actionsRunId ? `actions-run-${actionsRunId}` : tag;
  const cachePaths = getAioncoreCachePaths(projectRoot, runtimeKey, cacheVersion);

  console.log(
    `Preparing aioncore for ${runtimeKey} (${actionsRunId ? `actions run: ${actionsRunId}` : `version: ${tag}`})`
  );

  const preparedRuntimeDir = (
    options.preparedRuntimeDir ||
    process.env.AIONUI_PREPARED_AIONCORE_RUNTIME_DIR ||
    ''
  ).trim();
  if (preparedRuntimeDir) {
    const sourceDir = path.resolve(preparedRuntimeDir);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error(`Prepared AionCore runtime directory is missing: ${sourceDir}`);
    }
    if (sourceDir === path.resolve(targetDir)) {
      throw new Error('Prepared AionCore runtime directory must be separate from the packaging target.');
    }

    removeDirectorySafe(targetDir);
    copyDirectorySafe(sourceDir, targetDir);
    try {
      assertPreparedRuntimeManifestCompatibility(targetDir, platform, arch, tag);
      const verification = verifyBundledAioncoreResources({
        resourcesDir: path.join(projectRoot, 'resources'),
        electronPlatformName: platform,
        targetArch: arch,
      });
      if (verification.missing.length > 0 || verification.invalid.length > 0) {
        throw new Error(
          `Prepared AionCore runtime artifact is invalid: ${[
            ...verification.missing.map((entry) => `missing ${entry}`),
            ...verification.invalid,
          ].join(', ')}`
        );
      }
    } catch (error) {
      removeDirectorySafe(targetDir);
      throw error;
    }

    console.log(`  Using target-executed prepared runtime artifact: ${sourceDir}`);
    return { prepared: true, dir: targetDir, sourceType: 'prepared-runtime-artifact' };
  }

  if (
    restorePreparedRuntimeFromCache({
      cacheRuntimeDir: cachePaths.runtimeDir,
      targetDir,
      resourcesRoot: cachePaths.resourcesRoot,
      platform,
      arch,
      expectedVersion: tag,
      compatibilityExecFileSync,
    })
  ) {
    console.log(`  Using cached bundled aioncore: ${path.relative(process.cwd(), cachePaths.runtimeDir)}`);
    return { prepared: true, dir: targetDir, sourceType: 'cache' };
  }

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  let sourcePath = null;
  let sourceType = 'none';
  let sourceDetail = {};
  let tempDir = null;

  // 1. Download from GitHub Actions artifacts when manual build run id is provided.
  if (actionsRunId) {
    const result = downloadAndExtractActionsArtifact(platform, arch, actionsRunId);
    sourcePath = result.binaryPath;
    tempDir = result.tempDir;
    sourceType = 'actions-artifact';
    sourceDetail = {
      runId: actionsRunId,
      artifactName: result.artifactName,
      url: result.url,
    };
    console.log(`  Downloaded from GitHub Actions artifact`);
  }

  // 2. Download from GitHub releases.
  if (!sourcePath && tag) {
    try {
      const result = downloadAndExtract(platform, arch, tag);
      sourcePath = result.binaryPath;
      tempDir = result.tempDir;
      sourceType = 'download';
      sourceDetail = { url: result.url };
      console.log(`  Downloaded from GitHub releases`);
    } catch (error) {
      console.warn(`  Download failed: ${error.message}`);
    }
  }

  // Write result
  if (sourcePath) {
    copyFileSafe(sourcePath, targetBinaryPath);
    ensureExecutableMode(targetBinaryPath);
    let compatibility;
    try {
      compatibility = assertAioncoreCompatibility(targetBinaryPath, tag, {
        execFileSync: compatibilityExecFileSync,
      });
    } catch (error) {
      removeDirectorySafe(targetDir);
      if (tempDir) removeDirectorySafe(tempDir);
      throw error;
    }
    const bundledManagedResourcesDir = prepareManagedResources(targetBinaryPath, targetDir, {
      execFileSync: compatibilityExecFileSync,
      platform,
      hostPlatform: materializeInternalSymlinksForWindows ? 'win32' : process.platform,
    });

    writePreparedRuntimeManifest(targetDir, {
      platform,
      arch,
      version: tag || compatibility.version,
      sourceType,
      sourceDetail,
      compatibility,
      binaryName,
    });
    const verification = verifyBundledAioncoreResources({
      resourcesDir: path.join(projectRoot, 'resources'),
      electronPlatformName: platform,
      targetArch: arch,
    });
    if (verification.missing.length > 0 || verification.invalid.length > 0) {
      removeDirectorySafe(targetDir);
      if (tempDir) removeDirectorySafe(tempDir);
      throw new Error(
        `Prepared AionCore managed resources are invalid: ${[
          ...verification.missing.map((entry) => `missing ${entry}`),
          ...verification.invalid,
        ].join(', ')}`
      );
    }
    savePreparedRuntimeToCache({ targetDir, cacheRuntimeDir: cachePaths.runtimeDir });
    console.log(
      `  Bundled aioncore prepared: resources/bundled-aioncore/${runtimeKey}/${binaryName} [source=${sourceType}]`
    );
    console.log(`  Bundled managed resources prepared: ${bundledManagedResourcesDir}`);

    if (tempDir) removeDirectorySafe(tempDir);
    return { prepared: true, dir: targetDir, sourceType };
  }

  throw new Error(`aioncore binary not found for ${runtimeKey} (tag: ${tag})`);
}

function runInternalCli(args) {
  if (args[0] !== MATERIALIZE_INTERNAL_FILE_SYMLINKS_COMMAND) return false;
  const rootDir = args[1];
  if (!rootDir) {
    throw new Error(`${MATERIALIZE_INTERNAL_FILE_SYMLINKS_COMMAND} requires a managed resources directory`);
  }
  process.stdout.write(`${JSON.stringify(materializeInternalFileSymlinks(path.resolve(rootDir)))}\n`);
  return true;
}

if (require.main === module) {
  try {
    if (!runInternalCli(process.argv.slice(2))) {
      throw new Error(`Unknown prepare-aioncore internal command: ${process.argv[2] || '<missing>'}`);
    }
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  getActionsArtifactName,
  getActionsArtifactMissingMessage,
  normalizeInternalSymlinks,
  prepareAioncore,
  __test__: {
    assertAioncoreCompatibility,
    assertPreparedRuntimeManifestCompatibility,
    defaultAioncoreCacheRoot,
    downloadFile,
    getAioncoreCachePaths,
    getManagedResourcePrepareEnv,
    materializeInternalFileSymlinks,
    normalizeInternalSymlinks,
    prepareAioncore,
    prepareManagedResources,
    runDownloadOnce,
    parsePositiveInteger,
    pruneManagedNodeRuntime,
    resolveManagedNodeExecutable,
    savePreparedRuntimeToCache,
    writePreparedRuntimeManifest,
  },
};

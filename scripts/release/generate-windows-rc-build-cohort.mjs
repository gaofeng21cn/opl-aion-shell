#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RC_VERSION_PATTERN = /^\d+\.\d+\.\d+-rc\.\d+$/;
const MANAGED_RESOURCES_SCHEMA = 'opl_aioncore_managed_resources_projection.v1';
const MANAGED_CODEX_VERSION = '0.146.0';
const MANAGED_ABSENT_PATHS = [
  'cli/claude',
  'acp',
  'node_modules/@anthropic-ai/claude-code',
  'node_modules/claude-code',
  'claude',
];

function requireValue(env, name, pattern) {
  const value = env[name]?.trim() ?? '';
  if (!pattern.test(value)) throw new Error(`${name} is missing or invalid`);
  return value;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function fileIdentity(rootDir, filePath, { allowEmpty = false } = {}) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new Error(`Required cohort file is missing or not a regular file: ${path.relative(rootDir, filePath)}`);
  }
  if (!allowEmpty && stat.size === 0) {
    throw new Error(`Required cohort file is empty: ${path.relative(rootDir, filePath)}`);
  }
  return {
    path: path.relative(rootDir, filePath).replaceAll(path.sep, '/'),
    size_bytes: stat.size,
    sha256: sha256File(filePath),
  };
}

function walkFiles(rootDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  visit(rootDir);
  return files;
}

export function treeIdentity(rootDir, treePath) {
  if (!fs.statSync(treePath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Required packaged tree is missing: ${path.relative(rootDir, treePath)}`);
  }
  const files = walkFiles(treePath);
  if (files.length === 0) throw new Error('Packaged Windows tree is empty');
  const hash = crypto.createHash('sha256');
  let sizeBytes = 0;
  for (const filePath of files) {
    const relativePath = path.relative(treePath, filePath).replaceAll(path.sep, '/');
    const identity = fileIdentity(rootDir, filePath, { allowEmpty: true });
    sizeBytes += identity.size_bytes;
    hash.update(relativePath);
    hash.update('\0');
    hash.update(String(identity.size_bytes));
    hash.update('\0');
    hash.update(identity.sha256);
    hash.update('\n');
  }
  return {
    path: path.relative(rootDir, treePath).replaceAll(path.sep, '/'),
    file_count: files.length,
    size_bytes: sizeBytes,
    sha256: hash.digest('hex'),
    digest_contract: 'sha256(relative_path+NUL+size+NUL+file_sha256+LF)',
  };
}

function isSafeContractPath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !path.posix.isAbsolute(value) &&
    value.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

function readManagedManifest(managedManifestPath) {
  try {
    return JSON.parse(fs.readFileSync(managedManifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Managed resources manifest is not valid JSON: ${error.message}`);
  }
}

function resolveManagedNodeRuntime(managedResourcesRoot, managedManifestPath, runtimeKey) {
  const manifest = readManagedManifest(managedManifestPath);
  const expectedRoot = 'node/node-v24.11.0-linux-x64';
  if (manifest?.schema !== MANAGED_RESOURCES_SCHEMA || manifest.runtimeKey !== runtimeKey) {
    throw new Error(`Managed resources manifest must use ${MANAGED_RESOURCES_SCHEMA} for ${runtimeKey}`);
  }
  if (
    manifest.node?.version !== '24.11.0' ||
    manifest.node?.root !== expectedRoot ||
    manifest.node?.executable !== 'bin/node'
  ) {
    throw new Error(`Managed Node runtime identity is inconsistent with the schema-v2 layout for ${runtimeKey}`);
  }

  const root = path.resolve(managedResourcesRoot, ...expectedRoot.split('/'));
  return {
    root,
    executable: path.join(root, 'bin', 'node'),
    npmLauncher: path.join(root, 'bin', 'npm'),
    npxLauncher: path.join(root, 'bin', 'npx'),
    npmCli: path.join(root, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    npxCli: path.join(root, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    npmRuntime: path.join(root, 'lib', 'node_modules', 'npm', 'lib', 'cli.js'),
  };
}

function resolveManagedCodexPath(managedResourcesRoot, managedManifestPath, runtimeKey) {
  const manifest = readManagedManifest(managedManifestPath);

  if (manifest?.schema !== MANAGED_RESOURCES_SCHEMA || manifest.runtimeKey !== runtimeKey) {
    throw new Error(`Managed resources manifest must use ${MANAGED_RESOURCES_SCHEMA} for ${runtimeKey}`);
  }
  if (
    manifest.source?.schemaVersion !== 2 ||
    !/^[0-9a-f]{64}$/.test(manifest.source?.manifestSha256 || '') ||
    JSON.stringify(manifest.source?.cliNames) !== JSON.stringify([]) ||
    JSON.stringify(manifest.projection?.includedCliNames) !== JSON.stringify(['codex']) ||
    JSON.stringify(manifest.projection?.excludedCliNames) !== JSON.stringify(['claude']) ||
    JSON.stringify(manifest.projection?.requiredAbsentPaths) !== JSON.stringify(MANAGED_ABSENT_PATHS) ||
    manifest.projection?.codexSource?.package !== '@openai/codex' ||
    manifest.projection?.codexSource?.version !== MANAGED_CODEX_VERSION ||
    manifest.projection?.codexSource?.packageSpec !== `@openai/codex@${MANAGED_CODEX_VERSION}-${runtimeKey}` ||
    manifest.projection?.codexSource?.authority !== 'official_npm_platform_package' ||
    manifest.projection?.codexSource?.verifiedByAioncore !== 'v0.1.70'
  ) {
    throw new Error('Managed resources manifest Codex-only projection policy is invalid');
  }
  for (const relativePath of MANAGED_ABSENT_PATHS) {
    if (fs.existsSync(path.join(managedResourcesRoot, ...relativePath.split('/')))) {
      throw new Error(`Managed resources manifest contains forbidden Claude/raw producer path: ${relativePath}`);
    }
  }

  const codexEntries = Array.isArray(manifest.clis) ? manifest.clis.filter((entry) => entry?.name === 'codex') : [];
  if (!Array.isArray(manifest.clis) || manifest.clis.length !== 1 || codexEntries.length !== 1) {
    throw new Error(`Expected one OPL projection managed Codex CLI entry, found ${codexEntries.length}`);
  }

  const codex = codexEntries[0];
  const version = typeof codex.version === 'string' ? codex.version.trim() : '';
  const expectedRoot = `cli/codex/${MANAGED_CODEX_VERSION}/${runtimeKey}`;
  if (
    version !== MANAGED_CODEX_VERSION ||
    codex.root !== expectedRoot ||
    codex.platformDirectory !== runtimeKey ||
    !isSafeContractPath(codex.root) ||
    !isSafeContractPath(codex.executable) ||
    !/^vendor\/[0-9A-Za-z._-]+\/bin\/codex$/.test(codex.executable)
  ) {
    throw new Error('Managed Codex CLI identity is inconsistent with the schema-v2 layout');
  }

  const codexPath = path.resolve(managedResourcesRoot, ...codex.root.split('/'), ...codex.executable.split('/'));
  const codexExecutables = walkFiles(managedResourcesRoot).filter((candidate) => path.basename(candidate) === 'codex');
  if (codexExecutables.length !== 1 || path.resolve(codexExecutables[0]) !== codexPath) {
    throw new Error(
      `Expected one managed Codex executable at the schema-v2 manifest path, found ${codexExecutables.length}`
    );
  }
  return codexPath;
}

export function generateWindowsRcBuildCohort({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  env = process.env,
  git = (...args) => execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim(),
} = {}) {
  const releaseVersion = requireValue(env, 'OPL_WINDOWS_RC_RELEASE_VERSION', RC_VERSION_PATTERN);
  const appSha = requireValue(env, 'OPL_WINDOWS_RC_APP_SHA', SHA_PATTERN);
  const appTree = requireValue(env, 'OPL_WINDOWS_RC_APP_TREE', SHA_PATTERN);
  const expectedShellSha = requireValue(env, 'OPL_WINDOWS_RC_SHELL_SHA', SHA_PATTERN);
  const runId = requireValue(env, 'GITHUB_RUN_ID', /^[1-9][0-9]*$/);
  const runAttempt = requireValue(env, 'GITHUB_RUN_ATTEMPT', /^[1-9][0-9]*$/);
  const platform = env.OPL_WINDOWS_RC_PLATFORM?.trim();
  const arch = env.OPL_WINDOWS_RC_ARCH?.trim();
  const artifactName = env.OPL_WINDOWS_RC_ARTIFACT_NAME?.trim();
  if (platform !== 'windows-x64' || arch !== 'x64' || !artifactName) {
    throw new Error('Windows RC cohort target or artifact name is invalid');
  }

  const shellSha = git('rev-parse', 'HEAD');
  const shellTree = git('rev-parse', 'HEAD^{tree}');
  if (shellSha !== expectedShellSha) {
    throw new Error(`Shell checkout mismatch: expected ${expectedShellSha}, observed ${shellSha}`);
  }

  const outDir = path.join(rootDir, 'out');
  const installerName = `One-Person-Lab-${releaseVersion}-win-x64.exe`;
  const installerPath = path.join(outDir, installerName);
  const packagedTreePath = path.join(outDir, 'win-unpacked');
  const packagedResourcesPath = path.join(packagedTreePath, 'resources');
  const productPath = path.join(packagedResourcesPath, 'opl-linux', 'product.json');
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  const frameworkSha = product.framework_ref;
  if (
    product.schema !== 'opl_linux_product_manifest.v1' ||
    !SHA_PATTERN.test(frameworkSha) ||
    product.native_windows_executor_fallback_allowed !== false
  ) {
    throw new Error('OPL Linux product manifest is incompatible with the Windows RC contract');
  }

  const runtimeRoot = path.join(packagedResourcesPath, 'bundled-aioncore', 'linux-x64');
  const aioncorePath = path.join(runtimeRoot, 'aioncore');
  const runtimeManifestPath = path.join(runtimeRoot, 'manifest.json');
  const managedResourcesRoot = path.join(runtimeRoot, 'managed-resources');
  const managedManifestPath = path.join(managedResourcesRoot, 'manifest.json');
  const managedManifestIdentity = fileIdentity(rootDir, managedManifestPath);
  const managedNode = resolveManagedNodeRuntime(managedResourcesRoot, managedManifestPath, 'linux-x64');
  const codexPath = resolveManagedCodexPath(managedResourcesRoot, managedManifestPath, 'linux-x64');

  return {
    schema: 'opl_windows_rc_build_cohort.v1',
    status: 'sealed',
    release: {
      quality: 'preview',
      display_version: releaseVersion,
      latest_allowed: false,
      stable_updater_allowed: false,
      homebrew_allowed: false,
    },
    source: {
      app: { sha: appSha, tree: appTree },
      shell: { sha: shellSha, tree: shellTree },
      framework_sha: frameworkSha,
    },
    target: {
      platform: 'win32',
      arch,
      runtime_key: 'linux-x64',
    },
    artifact: fileIdentity(rootDir, installerPath),
    packaged_tree: treeIdentity(rootDir, packagedTreePath),
    runtime: {
      execution_substrate: 'dedicated_opl_linux_wsl2',
      wsl2_only_terminal_claim: true,
      native_windows_executor_fallback_allowed: false,
      distribution_product: fileIdentity(rootDir, productPath),
      aioncore: fileIdentity(rootDir, aioncorePath),
      runtime_manifest: fileIdentity(rootDir, runtimeManifestPath),
      managed_resources_manifest: managedManifestIdentity,
      managed_node: fileIdentity(rootDir, managedNode.executable),
      managed_node_tree: treeIdentity(rootDir, managedNode.root),
      managed_npm_launcher: fileIdentity(rootDir, managedNode.npmLauncher),
      managed_npx_launcher: fileIdentity(rootDir, managedNode.npxLauncher),
      managed_npm_cli: fileIdentity(rootDir, managedNode.npmCli),
      managed_npx_cli: fileIdentity(rootDir, managedNode.npxCli),
      managed_npm_runtime: fileIdentity(rootDir, managedNode.npmRuntime),
      codex: fileIdentity(rootDir, codexPath),
    },
    actions: {
      run_id: runId,
      run_attempt: runAttempt,
      artifact_name: artifactName,
    },
  };
}

export function writeWindowsRcBuildCohort(options = {}) {
  const rootDir = options.rootDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const outputPath = path.join(rootDir, 'out', 'opl-windows-rc-build-cohort.json');
  const cohort = generateWindowsRcBuildCohort({ ...options, rootDir });
  fs.writeFileSync(outputPath, `${JSON.stringify(cohort, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = writeWindowsRcBuildCohort();
  process.stdout.write(`${outputPath}\n`);
}

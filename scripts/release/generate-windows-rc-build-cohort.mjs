#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RC_VERSION_PATTERN = /^\d+\.\d+\.\d+-rc\.\d+$/;

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

function findSingleFile(rootDir, predicate, label) {
  const matches = walkFiles(rootDir).filter(predicate);
  if (matches.length !== 1) throw new Error(`Expected one ${label}, found ${matches.length}`);
  return matches[0];
}

function managedCodexPath(managedResourcesPath, manifest) {
  const matches = Array.isArray(manifest.clis) ? manifest.clis.filter((entry) => entry?.name === 'codex') : [];
  if (manifest.schemaVersion !== 2 || manifest.runtimeKey !== 'linux-x64' || matches.length !== 1) {
    throw new Error('Managed resources manifest has no unique Linux x64 Codex CLI identity');
  }
  const codex = matches[0];
  if (
    codex.platformDirectory !== 'linux-x64' ||
    typeof codex.root !== 'string' ||
    !/^cli\/codex\/\d+\.\d+\.\d+\/linux-x64$/.test(codex.root) ||
    typeof codex.executable !== 'string' ||
    !/^vendor\/[A-Za-z0-9._-]+\/bin\/codex$/.test(codex.executable)
  ) {
    throw new Error('Managed Codex CLI identity is invalid');
  }
  return path.join(managedResourcesPath, ...codex.root.split('/'), ...codex.executable.split('/'));
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
  const productPath = path.join(rootDir, 'resources', 'opl-linux', 'product.json');
  const product = JSON.parse(fs.readFileSync(productPath, 'utf8'));
  const frameworkSha = product.framework_ref;
  if (
    product.schema !== 'opl_linux_product_manifest.v1' ||
    !SHA_PATTERN.test(frameworkSha) ||
    product.native_windows_executor_fallback_allowed !== false
  ) {
    throw new Error('OPL Linux product manifest is incompatible with the Windows RC contract');
  }

  const runtimeRoot = path.join(rootDir, 'resources', 'bundled-aioncore', 'linux-x64');
  const aioncorePath = path.join(runtimeRoot, 'aioncore');
  const runtimeManifestPath = path.join(runtimeRoot, 'manifest.json');
  const managedManifestPath = path.join(runtimeRoot, 'managed-resources', 'manifest.json');
  const managedResourcesPath = path.dirname(managedManifestPath);
  const managedManifest = JSON.parse(fs.readFileSync(managedManifestPath, 'utf8'));
  const managedNodePath = findSingleFile(
    path.join(managedResourcesPath, 'node'),
    (candidate) => candidate.replaceAll(path.sep, '/').endsWith('/bin/node'),
    'managed Node executable'
  );
  const codexPath = managedCodexPath(managedResourcesPath, managedManifest);

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
      managed_resources_manifest: fileIdentity(rootDir, managedManifestPath),
      managed_node: fileIdentity(rootDir, managedNodePath),
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

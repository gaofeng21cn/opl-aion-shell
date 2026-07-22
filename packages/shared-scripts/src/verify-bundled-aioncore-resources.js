const fs = require('fs');
const path = require('path');

const REQUIRED_AIONCORE_VERSION = 'v0.1.50';
const REQUIRED_AIONCORE_REPORTED_VERSION = '0.1.50';
const MANAGED_CODEX_ACP_PACKAGE = '@agentclientprotocol/codex-acp';
const LEGACY_CODEX_ACP_PACKAGE = '@zed-industries/codex-acp';
const MANAGED_CODEX_ACP_ENTRYPOINT = 'node_modules/@agentclientprotocol/codex-acp/dist/index.js';

function backendBinaryName(platform) {
  return platform === 'win32' ? 'aioncore.exe' : 'aioncore';
}

function nodeBinaryName(platform) {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function nodeExecutableParts(platform) {
  return platform === 'win32' ? [nodeBinaryName(platform)] : ['bin', nodeBinaryName(platform)];
}

function npmExecutableParts(platform) {
  return platform === 'win32' ? ['npm.cmd'] : ['bin', 'npm'];
}

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function bundledPath(runtimeKey, ...parts) {
  return normalize(path.join('bundled-aioncore', runtimeKey, ...parts));
}

function requireRelativePath(baseDir, runtimeKey, parts, checked, missing) {
  const relativePath = bundledPath(runtimeKey, ...parts);
  checked.push(relativePath);

  if (!fs.existsSync(path.join(baseDir, ...parts))) {
    missing.push(relativePath);
  }
}

function readDirectories(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function isFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function addInvalidSymlinks(root, baseDir, runtimeKey, missing) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(absolutePath);
      if (path.isAbsolute(linkTarget) && isPathInside(path.normalize(linkTarget), baseDir)) {
        missing.push(bundledPath(runtimeKey, path.relative(baseDir, absolutePath)));
        continue;
      }

      try {
        fs.statSync(absolutePath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          missing.push(bundledPath(runtimeKey, path.relative(baseDir, absolutePath)));
          continue;
        }
        throw error;
      }
      continue;
    }

    if (entry.isDirectory()) {
      addInvalidSymlinks(absolutePath, baseDir, runtimeKey, missing);
    }
  }
}

function directorySizeBytes(root) {
  if (!fs.existsSync(root)) return 0;
  const stat = fs.statSync(root);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  let total = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    total += directorySizeBytes(path.join(root, entry.name));
  }
  return total;
}

function addSizeAccounting(accounting, runtimeKey, label, baseDir, ...parts) {
  const absolutePath = path.join(baseDir, ...parts);
  accounting.push({
    label,
    path: bundledPath(runtimeKey, ...parts),
    bytes: directorySizeBytes(absolutePath),
    present: fs.existsSync(absolutePath),
  });
}

function requireManagedNode(baseDir, runtimeKey, platform, checked, missing) {
  const nodeRoot = path.join(baseDir, 'managed-resources', 'node');
  const versions = readDirectories(nodeRoot);
  const requiredExecutables = [nodeExecutableParts(platform), npmExecutableParts(platform)];

  if (versions.length === 0) {
    for (const executableParts of requiredExecutables) {
      const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...executableParts);
      checked.push(relativePath);
      missing.push(relativePath);
    }
    return;
  }

  for (const executableParts of requiredExecutables) {
    const executableFound = versions.some((version) => {
      const executablePath = path.join(nodeRoot, version, ...executableParts);
      return isFile(executablePath);
    });

    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...executableParts);
    checked.push(relativePath);

    if (!executableFound) {
      missing.push(relativePath);
    }
  }

  addInvalidSymlinks(nodeRoot, baseDir, runtimeKey, missing);
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasExactStringEntries(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => typeof entry === 'string' && entry === expected[index])
  );
}

function requireAioncoreManifestContract(baseDir, runtimeKey, platform, arch, invalid) {
  const manifestPath = path.join(baseDir, 'manifest.json');
  if (!isFile(manifestPath)) return;

  const relativePath = bundledPath(runtimeKey, 'manifest.json');
  const manifest = readManifest(manifestPath);
  if (!manifest) {
    invalid.push(`${relativePath}: invalid JSON`);
    return;
  }

  const normalizedVersion = typeof manifest.version === 'string' ? manifest.version.trim().replace(/^v/, '') : '';

  if (
    manifest.platform !== platform ||
    manifest.arch !== arch ||
    normalizedVersion !== REQUIRED_AIONCORE_REPORTED_VERSION ||
    manifest.compatibility?.reportedVersion !== REQUIRED_AIONCORE_REPORTED_VERSION
  ) {
    invalid.push(
      `${relativePath}: expected AionCore ${REQUIRED_AIONCORE_VERSION} for ${runtimeKey} with reported version ${REQUIRED_AIONCORE_REPORTED_VERSION}`
    );
  }
}

function requireManagedAcpTool(baseDir, runtimeKey, toolId, checked, missing) {
  const toolRoot = path.join(baseDir, 'managed-resources', 'acp', toolId);
  const versions = readDirectories(toolRoot);

  if (versions.length === 0) {
    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'acp', toolId, '*', runtimeKey, 'manifest.json');
    checked.push(relativePath);
    missing.push(relativePath);
    return;
  }

  for (const version of versions) {
    const platformRoot = path.join(toolRoot, version, runtimeKey);
    const manifestRelativePath = bundledPath(
      runtimeKey,
      'managed-resources',
      'acp',
      toolId,
      '*',
      runtimeKey,
      'manifest.json'
    );
    checked.push(manifestRelativePath);

    const manifestPath = path.join(platformRoot, 'manifest.json');
    if (!isFile(manifestPath)) {
      missing.push(manifestRelativePath);
      continue;
    }

    const manifest = readManifest(manifestPath);
    const entrypoint = typeof manifest?.entrypoint === 'string' ? manifest.entrypoint : null;
    if (!entrypoint) {
      missing.push(bundledPath(runtimeKey, 'managed-resources', 'acp', toolId, version, runtimeKey, '<entrypoint>'));
      continue;
    }

    const entrypointRelativePath = bundledPath(
      runtimeKey,
      'managed-resources',
      'acp',
      toolId,
      version,
      runtimeKey,
      entrypoint
    );
    checked.push(entrypointRelativePath);

    if (!isFile(path.join(platformRoot, entrypoint))) {
      missing.push(entrypointRelativePath);
    }
  }
}

function requireManagedCodexAcpContract(baseDir, runtimeKey, checked, missing, invalid) {
  const managedResourcesDir = path.join(baseDir, 'managed-resources');
  const rootManifestPath = path.join(managedResourcesDir, 'manifest.json');
  const rootManifestRelativePath = bundledPath(runtimeKey, 'managed-resources', 'manifest.json');
  checked.push(rootManifestRelativePath);
  if (!isFile(rootManifestPath)) {
    missing.push(rootManifestRelativePath);
    return;
  }

  const rootManifest = readManifest(rootManifestPath);
  if (!rootManifest || rootManifest.schemaVersion !== 1 || rootManifest.runtimeKey !== runtimeKey) {
    invalid.push(`${rootManifestRelativePath}: schemaVersion/runtimeKey mismatch`);
    return;
  }

  const codexTools = Array.isArray(rootManifest.acpTools)
    ? rootManifest.acpTools.filter((tool) => tool?.slug === 'codex-acp')
    : [];
  if (codexTools.length !== 1) {
    invalid.push(`${rootManifestRelativePath}: expected exactly one codex-acp tool`);
    return;
  }

  const tool = codexTools[0];
  const managedAcpVersion = typeof tool.version === 'string' ? tool.version.trim() : '';
  const expectedRoot = path.posix.join('acp', 'codex-acp', managedAcpVersion, runtimeKey);
  const platformPackageName = `@openai/codex-${runtimeKey}`;
  const platformPackageRoot = `node_modules/${platformPackageName}`;
  if (
    !/^\d+\.\d+\.\d+$/.test(managedAcpVersion) ||
    tool.packageName !== MANAGED_CODEX_ACP_PACKAGE ||
    tool.root !== expectedRoot ||
    tool.platformDirectory !== runtimeKey ||
    tool.manifest !== 'manifest.json' ||
    tool.entrypoint !== MANAGED_CODEX_ACP_ENTRYPOINT ||
    !hasExactStringEntries(tool.pathEntries, ['node_modules/.bin']) ||
    !Array.isArray(tool.requiredFiles) ||
    !tool.requiredFiles.includes('package.json') ||
    !tool.requiredFiles.includes('package-lock.json') ||
    !Array.isArray(tool.requiredDirectories) ||
    !tool.requiredDirectories.includes('node_modules') ||
    typeof tool.platformExecutable !== 'string' ||
    !tool.platformExecutable.startsWith(`${platformPackageRoot}/`)
  ) {
    invalid.push(`${rootManifestRelativePath}: invalid maintained Codex ACP identity`);
    return;
  }

  const toolRoot = path.resolve(managedResourcesDir, ...expectedRoot.split('/'));
  if (!isPathInside(toolRoot, managedResourcesDir)) {
    invalid.push(`${rootManifestRelativePath}: codex-acp root escapes managed-resources`);
    return;
  }

  const versionRoot = path.join(managedResourcesDir, 'acp', 'codex-acp');
  const installedVersions = readDirectories(versionRoot);
  if (installedVersions.length !== 1 || installedVersions[0] !== managedAcpVersion) {
    invalid.push(`${rootManifestRelativePath}: codex-acp directory versions do not match ${managedAcpVersion}`);
  }

  const requiredFiles = [tool.manifest, tool.entrypoint, tool.platformExecutable, ...tool.requiredFiles];
  for (const relativePath of new Set(requiredFiles)) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      invalid.push(`${rootManifestRelativePath}: codex-acp required file contract is incomplete`);
      continue;
    }
    const absolutePath = path.resolve(toolRoot, ...relativePath.split('/'));
    const checkedPath = bundledPath(runtimeKey, 'managed-resources', expectedRoot, relativePath);
    checked.push(checkedPath);
    if (!isPathInside(absolutePath, toolRoot)) {
      invalid.push(`${checkedPath}: path escapes codex-acp root`);
    } else if (!isFile(absolutePath)) {
      missing.push(checkedPath);
    }
  }
  for (const relativePath of tool.requiredDirectories) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      invalid.push(`${rootManifestRelativePath}: codex-acp required directory contract is incomplete`);
      continue;
    }
    const absolutePath = path.resolve(toolRoot, ...relativePath.split('/'));
    const checkedPath = bundledPath(runtimeKey, 'managed-resources', expectedRoot, relativePath);
    checked.push(checkedPath);
    if (!isPathInside(absolutePath, toolRoot)) {
      invalid.push(`${checkedPath}: path escapes codex-acp root`);
    } else if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
      missing.push(checkedPath);
    }
  }

  const localManifest = readManifest(path.join(toolRoot, 'manifest.json'));
  if (
    !localManifest ||
    localManifest.entrypoint !== MANAGED_CODEX_ACP_ENTRYPOINT ||
    !hasExactStringEntries(localManifest.path_entries, ['node_modules/.bin'])
  ) {
    invalid.push(`${bundledPath(runtimeKey, 'managed-resources', expectedRoot, 'manifest.json')}: contract mismatch`);
  }

  const packageMetadata = [
    ['package.json', 'managed root'],
    [`node_modules/${MANAGED_CODEX_ACP_PACKAGE}/package.json`, 'maintained ACP package'],
    ['node_modules/@openai/codex/package.json', 'Codex package'],
    [`${platformPackageRoot}/package.json`, 'Codex platform package'],
  ];
  for (const [relativePath] of packageMetadata) {
    const checkedPath = bundledPath(runtimeKey, 'managed-resources', expectedRoot, relativePath);
    checked.push(checkedPath);
    if (!isFile(path.join(toolRoot, ...relativePath.split('/')))) {
      missing.push(checkedPath);
    }
  }

  const packageJson = readManifest(path.join(toolRoot, 'package.json'));
  if (
    packageJson?.dependencies?.[MANAGED_CODEX_ACP_PACKAGE] !== managedAcpVersion ||
    packageJson?.dependencies?.[LEGACY_CODEX_ACP_PACKAGE]
  ) {
    invalid.push(
      `${bundledPath(runtimeKey, 'managed-resources', expectedRoot, 'package.json')}: package/version mismatch`
    );
  }

  const packageLock = readManifest(path.join(toolRoot, 'package-lock.json'));
  const lockedAcpPackage = packageLock?.packages?.[`node_modules/${MANAGED_CODEX_ACP_PACKAGE}`];
  const lockedCodexPackage = packageLock?.packages?.['node_modules/@openai/codex'];
  const lockedPlatformPackage = packageLock?.packages?.[platformPackageRoot];
  const lockedCodexVersion =
    typeof lockedCodexPackage?.version === 'string' && /^\d+\.\d+\.\d+$/.test(lockedCodexPackage.version)
      ? lockedCodexPackage.version
      : '';
  if (
    !Number.isInteger(packageLock?.lockfileVersion) ||
    packageLock.lockfileVersion < 2 ||
    packageLock?.packages?.['']?.dependencies?.[MANAGED_CODEX_ACP_PACKAGE] !== managedAcpVersion ||
    lockedAcpPackage?.version !== managedAcpVersion ||
    typeof lockedAcpPackage?.integrity !== 'string' ||
    !lockedAcpPackage.integrity.startsWith('sha512-')
  ) {
    invalid.push(
      `${bundledPath(runtimeKey, 'managed-resources', expectedRoot, 'package-lock.json')}: package/version lock mismatch`
    );
  }
  if (
    !lockedCodexVersion ||
    typeof lockedCodexPackage?.integrity !== 'string' ||
    !lockedCodexPackage.integrity.startsWith('sha512-') ||
    lockedCodexPackage?.optionalDependencies?.[platformPackageName] !==
      `npm:@openai/codex@${lockedCodexVersion}-${runtimeKey}` ||
    lockedPlatformPackage?.name !== '@openai/codex' ||
    lockedPlatformPackage?.version !== `${lockedCodexVersion}-${runtimeKey}` ||
    typeof lockedPlatformPackage?.integrity !== 'string' ||
    !lockedPlatformPackage.integrity.startsWith('sha512-')
  ) {
    invalid.push(
      `${bundledPath(runtimeKey, 'managed-resources', expectedRoot, 'package-lock.json')}: Codex lock contract mismatch`
    );
  }

  const acpPackageJson = readManifest(
    path.join(toolRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'package.json')
  );
  if (
    acpPackageJson?.name !== MANAGED_CODEX_ACP_PACKAGE ||
    acpPackageJson?.version !== managedAcpVersion ||
    acpPackageJson?.bin?.['codex-acp'] !== 'dist/index.js'
  ) {
    invalid.push(
      `${bundledPath(runtimeKey, 'managed-resources', expectedRoot, 'node_modules', MANAGED_CODEX_ACP_PACKAGE, 'package.json')}: maintained ACP package mismatch`
    );
  }

  const codexPackageJson = readManifest(path.join(toolRoot, 'node_modules', '@openai', 'codex', 'package.json'));
  if (
    codexPackageJson?.name !== '@openai/codex' ||
    !lockedCodexVersion ||
    codexPackageJson?.version !== lockedCodexVersion ||
    codexPackageJson?.optionalDependencies?.[platformPackageName] !==
      `npm:@openai/codex@${lockedCodexVersion}-${runtimeKey}`
  ) {
    invalid.push(
      `${bundledPath(runtimeKey, 'managed-resources', expectedRoot, 'node_modules', '@openai/codex', 'package.json')}: expected locked Codex ${lockedCodexVersion || '<missing>'} for ${runtimeKey}`
    );
  }

  const platformPackageJson = readManifest(
    path.join(toolRoot, 'node_modules', '@openai', `codex-${runtimeKey}`, 'package.json')
  );
  if (
    platformPackageJson?.name !== '@openai/codex' ||
    !lockedCodexVersion ||
    platformPackageJson?.version !== `${lockedCodexVersion}-${runtimeKey}`
  ) {
    invalid.push(
      `${bundledPath(runtimeKey, 'managed-resources', expectedRoot, platformPackageRoot, 'package.json')}: expected locked Codex platform package ${lockedCodexVersion || '<missing>'}-${runtimeKey}`
    );
  }

  if (fs.existsSync(path.join(toolRoot, 'node_modules', '@zed-industries', 'codex-acp'))) {
    invalid.push(`${bundledPath(runtimeKey, 'managed-resources', expectedRoot)}: legacy Codex ACP is forbidden`);
  }
}

function verifyBundledAioncoreResources({ resourcesDir, electronPlatformName, targetArch }) {
  const runtimeKey = `${electronPlatformName}-${targetArch}`;
  const baseDir = path.join(resourcesDir, 'bundled-aioncore', runtimeKey);
  const checked = [];
  const missing = [];
  const invalid = [];
  const sizeAccounting = [];

  requireRelativePath(baseDir, runtimeKey, [backendBinaryName(electronPlatformName)], checked, missing);
  requireRelativePath(baseDir, runtimeKey, ['manifest.json'], checked, missing);
  requireRelativePath(baseDir, runtimeKey, ['managed-resources'], checked, missing);
  requireAioncoreManifestContract(baseDir, runtimeKey, electronPlatformName, targetArch, invalid);
  requireManagedNode(baseDir, runtimeKey, electronPlatformName, checked, missing);
  requireManagedAcpTool(baseDir, runtimeKey, 'codex-acp', checked, missing);
  requireManagedAcpTool(baseDir, runtimeKey, 'claude-agent-acp', checked, missing);
  requireManagedCodexAcpContract(baseDir, runtimeKey, checked, missing, invalid);
  addSizeAccounting(sizeAccounting, runtimeKey, 'aioncore-binary', baseDir, backendBinaryName(electronPlatformName));
  addSizeAccounting(sizeAccounting, runtimeKey, 'managed-node', baseDir, 'managed-resources', 'node');
  addSizeAccounting(sizeAccounting, runtimeKey, 'codex-acp', baseDir, 'managed-resources', 'acp', 'codex-acp');
  addSizeAccounting(
    sizeAccounting,
    runtimeKey,
    'claude-agent-acp',
    baseDir,
    'managed-resources',
    'acp',
    'claude-agent-acp'
  );

  return { runtimeKey, checked, missing, invalid, sizeAccounting };
}

module.exports = {
  verifyBundledAioncoreResources,
};

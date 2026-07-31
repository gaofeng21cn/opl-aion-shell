const fs = require('fs');
const path = require('path');

const REQUIRED_AIONCORE_VERSION = 'v0.1.55';
const REQUIRED_AIONCORE_REPORTED_VERSION = '0.1.55';
const REQUIRED_MANAGED_NODE_VERSION = '24.11.0';
const OPL_MANAGED_RESOURCES_SCHEMA = 'opl_aioncore_managed_resources_projection.v1';
const REQUIRED_CODEX_VERSION = '0.144.6';
const REQUIRED_SOURCE_CLI_NAMES = ['claude', 'codex'];
const REQUIRED_INCLUDED_CLI_NAMES = ['codex'];
const REQUIRED_EXCLUDED_CLI_NAMES = ['claude'];
const REQUIRED_ABSENT_PATHS = [
  'cli/claude',
  'acp',
  'node_modules/@anthropic-ai/claude-code',
  'node_modules/claude-code',
  'claude',
];
const CODEX_EXECUTABLE_BY_RUNTIME = {
  'darwin-arm64': 'vendor/aarch64-apple-darwin/bin/codex',
  'darwin-x64': 'vendor/x86_64-apple-darwin/bin/codex',
  'linux-arm64': 'vendor/aarch64-unknown-linux-musl/bin/codex',
  'linux-x64': 'vendor/x86_64-unknown-linux-musl/bin/codex',
  'win32-arm64': 'vendor/aarch64-pc-windows-msvc/bin/codex.exe',
  'win32-x64': 'vendor/x86_64-pc-windows-msvc/bin/codex.exe',
};

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

function npxExecutableParts(platform) {
  return platform === 'win32' ? ['npx.cmd'] : ['bin', 'npx'];
}

function npmRuntimeParts(platform) {
  const npmRoot = platform === 'win32' ? ['node_modules', 'npm'] : ['lib', 'node_modules', 'npm'];
  return [
    [...npmRoot, 'bin', 'npm-cli.js'],
    [...npmRoot, 'bin', 'npx-cli.js'],
    [...npmRoot, 'lib', 'cli.js'],
  ];
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

function readFiles(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
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
  const requiredPaths = [
    nodeExecutableParts(platform),
    npmExecutableParts(platform),
    npxExecutableParts(platform),
    ...npmRuntimeParts(platform),
  ];

  if (versions.length === 0) {
    for (const requiredPath of requiredPaths) {
      const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...requiredPath);
      checked.push(relativePath);
      missing.push(relativePath);
    }
    return;
  }

  for (const requiredPath of requiredPaths) {
    const pathFound = versions.some((version) => {
      const absolutePath = path.join(nodeRoot, version, ...requiredPath);
      return isFile(absolutePath);
    });

    const relativePath = bundledPath(runtimeKey, 'managed-resources', 'node', '*', ...requiredPath);
    checked.push(relativePath);

    if (!pathFound) {
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

function hasSafeContractPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) return false;
  return value.split('/').every((part) => part && part !== '.' && part !== '..');
}

function requireContractEntry(root, relativePath, displayRoot, runtimeKey, kind, checked, missing, invalid) {
  const checkedPath = bundledPath(runtimeKey, 'managed-resources', displayRoot, relativePath || '<missing>');
  checked.push(checkedPath);
  if (!hasSafeContractPath(relativePath)) {
    invalid.push(`${checkedPath}: invalid relative contract path`);
    return;
  }

  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  if (!isPathInside(absolutePath, root)) {
    invalid.push(`${checkedPath}: path escapes managed resource root`);
    return;
  }
  const present = fs.existsSync(absolutePath);
  const matchesKind =
    present && (kind === 'directory' ? fs.statSync(absolutePath).isDirectory() : isFile(absolutePath));
  if (!matchesKind) missing.push(checkedPath);
}

function expectedNodeRoot(runtimeKey) {
  const suffix = runtimeKey.startsWith('win32-') ? runtimeKey.replace(/^win32-/, 'win-') : runtimeKey;
  return `node/node-v${REQUIRED_MANAGED_NODE_VERSION}-${suffix}`;
}

function expectedCliExecutable(name, runtimeKey) {
  return CODEX_EXECUTABLE_BY_RUNTIME[runtimeKey] || '';
}

function requireForbiddenPathAbsence(managedResourcesDir, runtimeKey, checked, invalid) {
  for (const relativePath of REQUIRED_ABSENT_PATHS) {
    const checkedPath = bundledPath(runtimeKey, 'managed-resources', relativePath);
    checked.push(checkedPath);
    if (fs.existsSync(path.join(managedResourcesDir, ...relativePath.split('/')))) {
      invalid.push(`${checkedPath}: forbidden Claude/raw producer path is present`);
    }
  }
}

function requireNoForbiddenProducerEntries(managedResourcesDir, runtimeKey, checked, invalid) {
  if (!fs.existsSync(managedResourcesDir) || !fs.statSync(managedResourcesDir).isDirectory()) return;
  const forbiddenNames = new Set(['claude', 'claude-code', 'acp', '@anthropic-ai']);
  const visit = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(managedResourcesDir, absolutePath).split(path.sep).join('/');
      if (forbiddenNames.has(entry.name) || entry.name.includes('claude')) {
        const checkedPath = bundledPath(runtimeKey, 'managed-resources', relativePath);
        checked.push(checkedPath);
        invalid.push(`${checkedPath}: forbidden Claude/raw producer entry is present`);
        continue;
      }
      if (entry.isDirectory()) visit(absolutePath);
    }
  };
  visit(managedResourcesDir);
}

function requireManagedDirectCliContract(baseDir, runtimeKey, checked, missing, invalid) {
  const managedResourcesDir = path.join(baseDir, 'managed-resources');
  const rootManifestPath = path.join(managedResourcesDir, 'manifest.json');
  const rootManifestRelativePath = bundledPath(runtimeKey, 'managed-resources', 'manifest.json');
  checked.push(rootManifestRelativePath);
  if (!isFile(rootManifestPath)) {
    missing.push(rootManifestRelativePath);
    return;
  }

  const rootManifest = readManifest(rootManifestPath);
  if (!rootManifest || rootManifest.schema !== OPL_MANAGED_RESOURCES_SCHEMA || rootManifest.runtimeKey !== runtimeKey) {
    invalid.push(`${rootManifestRelativePath}: projection schema/runtimeKey mismatch`);
    return;
  }
  if (
    !hasExactStringEntries(readDirectories(managedResourcesDir), ['cli', 'node']) ||
    !hasExactStringEntries(readFiles(managedResourcesDir), ['manifest.json']) ||
    !hasExactStringEntries(readDirectories(path.join(managedResourcesDir, 'cli')), ['codex'])
  ) {
    invalid.push(`${rootManifestRelativePath}: final projection must contain only Node and Codex payloads`);
  }
  if (
    rootManifest.source?.schemaVersion !== 2 ||
    !hasExactStringEntries(rootManifest.source?.cliNames, REQUIRED_SOURCE_CLI_NAMES)
  ) {
    invalid.push(`${rootManifestRelativePath}: invalid upstream source manifest projection`);
  }
  if (!/^[0-9a-f]{64}$/.test(rootManifest.source?.manifestSha256 || '')) {
    invalid.push(`${rootManifestRelativePath}: upstream source manifest digest is invalid`);
  }
  if (
    !hasExactStringEntries(rootManifest.projection?.includedCliNames, REQUIRED_INCLUDED_CLI_NAMES) ||
    !hasExactStringEntries(rootManifest.projection?.excludedCliNames, REQUIRED_EXCLUDED_CLI_NAMES) ||
    !hasExactStringEntries(rootManifest.projection?.requiredAbsentPaths, REQUIRED_ABSENT_PATHS)
  ) {
    invalid.push(`${rootManifestRelativePath}: Codex-only projection policy is invalid`);
  }

  const expectedNode = {
    version: REQUIRED_MANAGED_NODE_VERSION,
    root: expectedNodeRoot(runtimeKey),
    executable: runtimeKey.startsWith('win32-') ? 'node.exe' : 'bin/node',
  };
  if (
    rootManifest.node?.version !== expectedNode.version ||
    rootManifest.node?.root !== expectedNode.root ||
    rootManifest.node?.executable !== expectedNode.executable
  ) {
    invalid.push(`${rootManifestRelativePath}: invalid managed Node identity`);
  } else {
    if (
      !hasExactStringEntries(readDirectories(path.join(managedResourcesDir, 'node')), [
        path.posix.basename(expectedNode.root),
      ])
    ) {
      invalid.push(`${rootManifestRelativePath}: managed Node directory versions do not match ${expectedNode.version}`);
    }
    const platform = runtimeKey.startsWith('win32-') ? 'win32' : runtimeKey.split('-', 1)[0];
    requireContractEntry(
      managedResourcesDir,
      path.posix.join(expectedNode.root, expectedNode.executable),
      '',
      runtimeKey,
      'file',
      checked,
      missing,
      invalid
    );
    for (const requiredPath of [
      npmExecutableParts(platform),
      npxExecutableParts(platform),
      ...npmRuntimeParts(platform),
    ]) {
      requireContractEntry(
        managedResourcesDir,
        path.posix.join(expectedNode.root, ...requiredPath),
        '',
        runtimeKey,
        'file',
        checked,
        missing,
        invalid
      );
    }
  }

  const clis = Array.isArray(rootManifest.clis) ? rootManifest.clis : [];
  const names = clis.map((entry) => entry?.name).sort();
  if (!hasExactStringEntries(names, REQUIRED_INCLUDED_CLI_NAMES)) {
    invalid.push(`${rootManifestRelativePath}: expected exactly codex direct CLI`);
    return;
  }

  const cli = clis.find((entry) => entry?.name === 'codex');
  const expectedRoot = `cli/codex/${REQUIRED_CODEX_VERSION}/${runtimeKey}`;
  const expectedExecutable = expectedCliExecutable('codex', runtimeKey);
  const expectedDirectories = [expectedExecutable.split('/').slice(0, 2).join('/')];
  if (
    cli.version !== REQUIRED_CODEX_VERSION ||
    cli.root !== expectedRoot ||
    cli.platformDirectory !== runtimeKey ||
    cli.executable !== expectedExecutable ||
    !hasExactStringEntries(cli.requiredFiles, []) ||
    !hasExactStringEntries(cli.requiredDirectories, expectedDirectories)
  ) {
    invalid.push(`${rootManifestRelativePath}: invalid managed codex CLI identity`);
  } else {
    const versionRoot = path.join(managedResourcesDir, 'cli', 'codex');
    if (!hasExactStringEntries(readDirectories(versionRoot), [REQUIRED_CODEX_VERSION])) {
      invalid.push(`${rootManifestRelativePath}: codex CLI directory versions do not match ${REQUIRED_CODEX_VERSION}`);
    }
    const runtimeRoot = path.join(versionRoot, REQUIRED_CODEX_VERSION);
    if (!hasExactStringEntries(readDirectories(runtimeRoot), [runtimeKey])) {
      invalid.push(`${rootManifestRelativePath}: codex CLI runtime directories do not match ${runtimeKey}`);
    }

    const cliRoot = path.join(managedResourcesDir, ...expectedRoot.split('/'));
    requireContractEntry(cliRoot, cli.executable, expectedRoot, runtimeKey, 'file', checked, missing, invalid);
    for (const relativePath of cli.requiredFiles) {
      requireContractEntry(cliRoot, relativePath, expectedRoot, runtimeKey, 'file', checked, missing, invalid);
    }
    for (const relativePath of cli.requiredDirectories) {
      requireContractEntry(cliRoot, relativePath, expectedRoot, runtimeKey, 'directory', checked, missing, invalid);
    }
  }

  requireForbiddenPathAbsence(managedResourcesDir, runtimeKey, checked, invalid);
  requireNoForbiddenProducerEntries(managedResourcesDir, runtimeKey, checked, invalid);
  addInvalidSymlinks(managedResourcesDir, baseDir, runtimeKey, missing);
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
  requireManagedDirectCliContract(baseDir, runtimeKey, checked, missing, invalid);
  addSizeAccounting(sizeAccounting, runtimeKey, 'aioncore-binary', baseDir, backendBinaryName(electronPlatformName));
  addSizeAccounting(sizeAccounting, runtimeKey, 'managed-node', baseDir, 'managed-resources', 'node');
  addSizeAccounting(sizeAccounting, runtimeKey, 'claude-cli', baseDir, 'managed-resources', 'cli', 'claude');
  addSizeAccounting(sizeAccounting, runtimeKey, 'codex-cli', baseDir, 'managed-resources', 'cli', 'codex');
  addSizeAccounting(sizeAccounting, runtimeKey, 'raw-claude-producers', baseDir, 'managed-resources', 'acp');

  return { runtimeKey, checked, missing, invalid, sizeAccounting };
}

module.exports = {
  verifyBundledAioncoreResources,
};

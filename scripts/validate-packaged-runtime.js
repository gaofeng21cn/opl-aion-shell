#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_OUT_DIR = path.resolve(__dirname, '..', 'out');
const FULL_RUNTIME_RESOURCE_DIR = 'opl-full-runtime';
const REQUIRED_OPL_TEMPORAL_RUNTIME_PACKAGES = [
  '@temporalio/activity',
  '@temporalio/client',
  '@temporalio/common',
  '@temporalio/worker',
  '@temporalio/workflow',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    outDir: DEFAULT_OUT_DIR,
    requireFullRuntime: false,
    scanAll: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out') {
      const value = args[++index];
      if (!value) throw new Error('Missing value for --out');
      parsed.outDir = path.resolve(value);
      continue;
    }
    if (arg === '--require-full-runtime') {
      parsed.requireFullRuntime = true;
      continue;
    }
    if (arg === '--scan-all') {
      parsed.scanAll = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function listProductionNodeModulePaths(packageLock) {
  return Object.entries(packageLock?.packages ?? {})
    .filter(
      ([packagePath, metadata]) =>
        packagePath.startsWith('node_modules/') &&
        !metadata?.dev &&
        !metadata?.optional &&
        packagePath.split('/').every(Boolean)
    )
    .map(([packagePath]) => packagePath)
    .sort();
}

function validateFullRuntimeResources(resourcesRoot, options = {}) {
  const fullRuntimeRoot = path.join(resourcesRoot, FULL_RUNTIME_RESOURCE_DIR);
  const issues = [];
  if (!fs.existsSync(fullRuntimeRoot)) {
    if (options.require) {
      issues.push(`missing ${FULL_RUNTIME_RESOURCE_DIR} extraResource under ${resourcesRoot}`);
    }
    return { checked: false, resourcesRoot, issues };
  }

  const runtimeRoot = path.join(fullRuntimeRoot, 'runtime', 'current');
  const oplRoot = path.join(runtimeRoot, 'opl');
  const packageJsonPath = path.join(oplRoot, 'package.json');
  const packageLockPath = path.join(oplRoot, 'package-lock.json');
  const packageJson = readJsonFile(packageJsonPath);
  const packageLock = readJsonFile(packageLockPath);
  if (!packageJson) {
    issues.push(`missing or invalid OPL package.json at ${packageJsonPath}`);
  }
  if (!packageLock) {
    issues.push(`missing or invalid OPL package-lock.json at ${packageLockPath}`);
  }

  const manifestPath = path.join(fullRuntimeRoot, 'manifest', 'full-package-manifest.json');
  if (!readJsonFile(manifestPath)) {
    issues.push(`missing or invalid Full runtime manifest at ${manifestPath}`);
  }

  const dependencies = packageJson?.dependencies ?? {};
  for (const packageName of REQUIRED_OPL_TEMPORAL_RUNTIME_PACKAGES) {
    if (typeof dependencies[packageName] !== 'string') {
      issues.push(`OPL Full runtime must declare ${packageName} in dependencies`);
    }
    if (!fs.existsSync(path.join(oplRoot, 'node_modules', ...packageName.split('/'), 'package.json'))) {
      issues.push(`OPL Full runtime is missing node_modules/${packageName}`);
    }
  }

  if (packageLock) {
    const missingProductionPaths = listProductionNodeModulePaths(packageLock).filter(
      (relativePath) => !fs.existsSync(path.join(oplRoot, relativePath))
    );
    for (const relativePath of missingProductionPaths.slice(0, 40)) {
      issues.push(`OPL Full runtime is missing production dependency path ${relativePath}`);
    }
    if (missingProductionPaths.length > 40) {
      issues.push(
        `OPL Full runtime is missing ${missingProductionPaths.length - 40} additional production dependency paths`
      );
    }
  }

  if (fs.existsSync(path.join(oplRoot, 'node_modules', '@temporalio', 'testing'))) {
    issues.push('OPL Full runtime includes dev-only @temporalio/testing');
  }

  return { checked: true, resourcesRoot, issues };
}

function findResourcesRoots(outDir) {
  const roots = new Set();
  if (!fs.existsSync(outDir)) return [];
  const stack = [outDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === 'app.asar') {
        roots.add(path.dirname(fullPath));
      }
    }
  }
  return [...roots].sort();
}

function main() {
  const parsed = parseArgs(process.argv);
  const resourcesRoots = findResourcesRoots(parsed.outDir);
  if (resourcesRoots.length === 0) {
    console.log(`No app.asar found under ${parsed.outDir}; packaged runtime validation skipped.`);
    return;
  }

  let hasFailure = false;
  for (const resourcesRoot of resourcesRoots) {
    console.log(`Runtime resource check: ${resourcesRoot}`);
    const fullRuntime = validateFullRuntimeResources(resourcesRoot, {
      require: parsed.requireFullRuntime,
    });
    if (!fullRuntime.checked && fullRuntime.issues.length === 0) {
      console.log('  OPL Full runtime extraResource not present.');
      continue;
    }
    if (fullRuntime.issues.length > 0) {
      hasFailure = true;
      console.error(`  ${fullRuntime.issues.length} OPL Full runtime issue(s):`);
      for (const issue of fullRuntime.issues.slice(0, 80)) {
        console.error(`   - ${issue}`);
      }
      if (fullRuntime.issues.length > 80) {
        console.error(`   - ... ${fullRuntime.issues.length - 80} more omitted`);
      }
      continue;
    }
    console.log('  OPL Full runtime production dependencies are staged.');
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Packaged runtime validation failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  REQUIRED_OPL_TEMPORAL_RUNTIME_PACKAGES,
  listProductionNodeModulePaths,
  validateFullRuntimeResources,
};

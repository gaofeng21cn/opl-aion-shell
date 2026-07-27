const fs = require('fs');
const path = require('path');

const { REQUIRED_MAIN_PROCESS_RUNTIME_PACKAGES } = require('./validate-packaged-runtime.js');

function dependencyPath(projectRoot, packageName) {
  return path.join(projectRoot, 'node_modules', ...packageName.split('/'));
}

function findPackageStoreNodeModules(packageDir) {
  let current = path.dirname(packageDir);
  while (path.basename(current) !== 'node_modules') {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function copyLocalDependencyLinks(packageDir, targetDir) {
  const sourceNodeModules = findPackageStoreNodeModules(targetDir);
  if (!sourceNodeModules) return;

  const packageJson = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
  const dependencyNames = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);
  const destinationNodeModules = path.join(packageDir, 'node_modules');
  fs.mkdirSync(destinationNodeModules, { recursive: true });
  for (const dependencyName of dependencyNames) {
    const sourceDependency = path.join(sourceNodeModules, ...dependencyName.split('/'));
    if (!fs.existsSync(sourceDependency)) {
      continue;
    }
    const destinationDependency = path.join(destinationNodeModules, ...dependencyName.split('/'));
    fs.mkdirSync(path.dirname(destinationDependency), { recursive: true });
    fs.symlinkSync(
      fs.realpathSync(sourceDependency),
      destinationDependency,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
  }
}

function materializePackagedRuntimeDependencies(projectRoot, packageNames = REQUIRED_MAIN_PROCESS_RUNTIME_PACKAGES) {
  const restored = [];
  const materialized = [];

  function restoreLinks() {
    for (let index = restored.length - 1; index >= 0; index -= 1) {
      const entry = restored[index];
      fs.rmSync(entry.packageDir, { recursive: true, force: true });
      fs.symlinkSync(entry.targetDir, entry.packageDir, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }

  try {
    for (const packageName of packageNames) {
      const packageDir = dependencyPath(projectRoot, packageName);
      const packageJson = path.join(packageDir, 'package.json');
      if (!fs.existsSync(packageJson)) {
        throw new Error(`Packaged runtime dependency is not installed: ${packageName}`);
      }

      const stat = fs.lstatSync(packageDir);
      if (!stat.isSymbolicLink()) {
        continue;
      }

      const targetDir = fs.realpathSync(packageDir);
      const stagedDir = `${packageDir}.opl-materializing-${process.pid}`;
      fs.rmSync(stagedDir, { recursive: true, force: true });

      try {
        fs.cpSync(targetDir, stagedDir, {
          recursive: true,
          dereference: true,
          errorOnExist: true,
        });
        copyLocalDependencyLinks(stagedDir, targetDir);
        fs.rmSync(packageDir, { recursive: true, force: true });
        fs.renameSync(stagedDir, packageDir);
      } catch (error) {
        fs.rmSync(stagedDir, { recursive: true, force: true });
        if (!fs.existsSync(packageDir)) {
          fs.symlinkSync(targetDir, packageDir, process.platform === 'win32' ? 'junction' : 'dir');
        }
        throw error;
      }

      restored.push({ packageDir, targetDir });
      materialized.push(packageName);
    }
  } catch (error) {
    restoreLinks();
    throw error;
  }

  let restorationCompleted = false;
  return {
    materialized,
    restore() {
      if (restorationCompleted) return;
      restoreLinks();
      restorationCompleted = true;
    },
  };
}

module.exports = {
  dependencyPath,
  materializePackagedRuntimeDependencies,
};

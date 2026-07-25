'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SOURCE_FILES = [
  'index.html',
  'main.cjs',
  'package.json',
  'preload.cjs',
  'probe.cjs',
  'renderer.js',
  'styles.css',
];
const ELECTRON_BUILDER_CLI_ENV = 'OPL_ELECTRON_BUILDER_CLI';
const ELECTRON_DIST_ENV = 'OPL_WINDOWS_WSL2_ELECTRON_DIST';

const sourceDir = __dirname;
const repositoryRoot = path.resolve(sourceDir, '../../../../..');
const outputDir = path.join(repositoryRoot, 'out', 'windows-wsl2-validation');
const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-wsl2-validation-'));

function resolveBuilderCli() {
  const override = process.env[ELECTRON_BUILDER_CLI_ENV];
  return override ? path.resolve(override) : require.resolve('electron-builder/cli.js', { paths: [repositoryRoot] });
}

function copyCandidate() {
  for (const filename of SOURCE_FILES) {
    fs.copyFileSync(path.join(sourceDir, filename), path.join(stagingDir, filename));
  }
  const packagePath = path.join(stagingDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.build.directories = { output: outputDir };
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function buildCandidate() {
  const builderCli = resolveBuilderCli();
  if (!fs.statSync(builderCli).isFile()) throw new Error('Electron Builder CLI is not a file.');

  const args = [builderCli, '--projectDir', stagingDir, '--win', 'zip', '--x64', '--publish=never'];
  const electronDist = process.env[ELECTRON_DIST_ENV];
  if (electronDist) {
    const resolvedDist = path.resolve(electronDist);
    if (!fs.statSync(path.join(resolvedDist, 'electron.exe')).isFile()) {
      throw new Error(`${ELECTRON_DIST_ENV} must contain electron.exe.`);
    }
    args.push(`--config.electronDist=${resolvedDist}`);
  }

  const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Electron Builder exited with status ${String(result.status)}.`);
}

try {
  copyCandidate();
  buildCandidate();
} finally {
  fs.rmSync(stagingDir, { force: true, recursive: true });
}

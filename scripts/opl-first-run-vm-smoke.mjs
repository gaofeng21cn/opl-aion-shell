#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PROCESS_NAME = 'One Person Lab';
const DEFAULT_LABELS = {
  window: 'opl-first-run-window',
  progress: 'opl-first-run-progress',
  blockersList: 'opl-first-run-blockers-list',
  installButton: 'opl-first-run-install-button',
  environmentButton: 'opl-first-run-open-environment-button',
  modulesButton: 'opl-first-run-open-modules-button',
  readyEntry: 'opl-first-run-ready-entry',
  settingsEnvironment: 'opl-settings-environment',
};

function usage() {
  process.stdout.write(`Usage:
  node scripts/opl-first-run-vm-smoke.mjs --app "/Applications/One Person Lab.app"
  node scripts/opl-first-run-vm-smoke.mjs --dmg ./dist/One-Person-Lab.dmg

Options:
  --app <path>           Existing packaged .app path.
  --dmg <path>           Release DMG to mount and install into /Applications.
  --install-dir <path>   Install target for --dmg. Default: /Applications.
  --artifacts <path>     Artifact output directory. Default: ./artifacts/opl-first-run-<timestamp>.
  --process-name <name>  macOS process name. Default: One Person Lab.
  --timeout-ms <n>       Wait timeout for UI labels and logs. Default: 180000.
  --assert-clean         Fail if OPL state/log already exists before launch.
  --help                 Show this message.
`);
}

function parseArgs(argv) {
  const options = {
    app: null,
    dmg: null,
    installDir: '/Applications',
    artifacts: null,
    processName: DEFAULT_PROCESS_NAME,
    timeoutMs: 180_000,
    assertClean: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--assert-clean') {
      options.assertClean = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--app') options.app = path.resolve(value);
    else if (arg === '--dmg') options.dmg = path.resolve(value);
    else if (arg === '--install-dir') options.installDir = path.resolve(value);
    else if (arg === '--artifacts') options.artifacts = path.resolve(value);
    else if (arg === '--process-name') options.processName = value;
    else if (arg === '--timeout-ms') options.timeoutMs = Number(value);
    else throw new Error(`Unsupported argument: ${arg}`);
  }

  if (options.app && options.dmg) throw new Error('Use only one of --app or --dmg.');
  if (!options.app && !options.dmg) throw new Error('One of --app or --dmg is required.');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (!options.artifacts) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    options.artifacts = path.resolve('artifacts', `opl-first-run-${stamp}`);
  }
  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(' ')} exited with ${result.status}`,
        result.stdout ? `stdout:\n${result.stdout}` : '',
        result.stderr ? `stderr:\n${result.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return result.stdout ?? '';
}

function assertMacOS() {
  if (process.platform !== 'darwin') {
    throw new Error('OPL GUI first-run smoke must run on macOS.');
  }
}

function defaultFirstRunLogPath() {
  return path.join(os.homedir(), 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl');
}

function defaultOplStatePath() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'OPL', 'state');
}

function assertCleanFirstRunState() {
  const existing = [defaultFirstRunLogPath(), defaultOplStatePath()].filter((entry) => fs.existsSync(entry));
  if (existing.length > 0) {
    throw new Error(`Fresh VM assertion failed; existing OPL state/log found:\n${existing.join('\n')}`);
  }
}

function findAppBundle(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const app = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  return app ? path.join(root, app.name) : null;
}

function mountDmg(dmgPath) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-dmg-'));
  run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint]);
  return mountPoint;
}

function detachDmg(mountPoint) {
  spawnSync('hdiutil', ['detach', mountPoint], { stdio: 'ignore' });
  fs.rmSync(mountPoint, { recursive: true, force: true });
}

function installDmgApp(dmgPath, installDir) {
  const mountPoint = mountDmg(dmgPath);
  try {
    const mountedApp = findAppBundle(mountPoint);
    if (!mountedApp) throw new Error(`No .app bundle found in ${dmgPath}`);
    const targetApp = path.join(installDir, path.basename(mountedApp));
    fs.rmSync(targetApp, { recursive: true, force: true });
    run('ditto', [mountedApp, targetApp]);
    return targetApp;
  } finally {
    detachDmg(mountPoint);
  }
}

function launchApp(appPath) {
  run('open', ['-n', appPath]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runOplJson(args) {
  const result = spawnSync('opl', args, {
    encoding: 'utf8',
    env: { ...process.env, OPL_OUTPUT: 'json' },
  });
  if (result.status !== 0) {
    throw new Error(`opl ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function queryAccessibility(processName) {
  const script = `
const procName = ${JSON.stringify(processName)};
const systemEvents = Application('System Events');
function tryRead(fn) {
  try {
    const value = fn();
    if (value === undefined || value === null) return null;
    return String(value);
  } catch (_) {
    return null;
  }
}
function walk(element, depth, output) {
  if (depth > 8 || output.length > 3000) return;
  output.push({
    role: tryRead(() => element.role()),
    name: tryRead(() => element.name()),
    description: tryRead(() => element.description()),
    title: tryRead(() => element.title()),
    value: tryRead(() => element.value()),
    help: tryRead(() => element.help()),
  });
  let children = [];
  try {
    children = element.uiElements();
  } catch (_) {
    children = [];
  }
  for (const child of children) walk(child, depth + 1, output);
}
const proc = systemEvents.processes.byName(procName);
const output = [];
walk(proc, 0, output);
JSON.stringify(output);
`;
  const raw = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8' });
  return JSON.parse(raw);
}

function treeContainsLabel(tree, label) {
  return tree.some((node) =>
    [node.name, node.description, node.title, node.value, node.help].some((value) => value === label)
  );
}

async function waitForLabels(processName, timeoutMs) {
  const started = Date.now();
  const required = [
    DEFAULT_LABELS.window,
    DEFAULT_LABELS.progress,
    DEFAULT_LABELS.installButton,
    DEFAULT_LABELS.environmentButton,
    DEFAULT_LABELS.modulesButton,
  ];
  let lastTree = [];
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastTree = queryAccessibility(processName);
      const missing = required.filter((label) => !treeContainsLabel(lastTree, label));
      const hasTerminalState =
        treeContainsLabel(lastTree, DEFAULT_LABELS.readyEntry) ||
        treeContainsLabel(lastTree, DEFAULT_LABELS.blockersList);
      if (missing.length === 0 && hasTerminalState) {
        return { tree: lastTree, labels: required };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(2_000);
  }
  const detail = lastError instanceof Error ? lastError.message : JSON.stringify(lastTree.slice(0, 20));
  throw new Error(
    [
      `Timed out waiting for OPL first-run accessibility labels in ${processName}.`,
      'Grant Accessibility permission to the runner shell if System Events cannot read the app.',
      detail,
    ].join('\n')
  );
}

async function waitForFile(filePath, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(filePath)) return;
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

function copyIfExists(source, target) {
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
  }
}

function captureUnifiedLog(processName, target) {
  const predicate = `process == "${processName.replace(/"/g, '\\"')}"`;
  const result = spawnSync('log', ['show', '--last', '10m', '--style', 'compact', '--predicate', predicate], {
    encoding: 'utf8',
  });
  fs.writeFileSync(target, result.stdout || result.stderr || '', 'utf8');
}

async function main() {
  assertMacOS();
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.artifacts, { recursive: true });
  if (options.assertClean) assertCleanFirstRunState();

  const appPath = options.dmg ? installDmgApp(options.dmg, options.installDir) : options.app;
  if (!fs.existsSync(appPath)) throw new Error(`App bundle does not exist: ${appPath}`);

  launchApp(appPath);
  const accessibility = await waitForLabels(options.processName, options.timeoutMs);
  fs.writeFileSync(
    path.join(options.artifacts, 'accessibility-tree.json'),
    JSON.stringify(accessibility.tree, null, 2),
    'utf8'
  );

  const firstRunLog = defaultFirstRunLogPath();
  await waitForFile(firstRunLog, options.timeoutMs);
  copyIfExists(firstRunLog, path.join(options.artifacts, 'first-run.jsonl'));

  fs.writeFileSync(path.join(options.artifacts, 'system-initialize.json'), runOplJson(['system', 'initialize', '--json']));
  fs.writeFileSync(path.join(options.artifacts, 'modules.json'), runOplJson(['modules']));
  spawnSync('screencapture', ['-x', path.join(options.artifacts, 'first-launch.png')], { stdio: 'ignore' });
  captureUnifiedLog(options.processName, path.join(options.artifacts, 'unified-log.txt'));

  process.stdout.write(
    `${JSON.stringify(
      {
        surface_id: 'opl_packaged_gui_first_run_smoke',
        status: 'passed',
        app_path: appPath,
        artifacts: options.artifacts,
        labels: accessibility.labels,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

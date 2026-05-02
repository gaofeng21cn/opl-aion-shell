#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROCESS_NAME = 'One Person Lab';
const DEFAULT_LABELS = {
  window: 'opl-first-run-window',
  progress: 'opl-first-run-progress',
  blockersList: 'opl-first-run-blockers-list',
  installButton: 'opl-first-run-install-button',
  codexApiKeyInput: 'opl-first-run-codex-api-key-input',
  codexConfigureButton: 'opl-first-run-configure-codex-button',
  retryButton: 'opl-first-run-retry-button',
  environmentButton: 'opl-first-run-open-environment-button',
  modulesButton: 'opl-first-run-open-modules-button',
  readyEntry: 'opl-first-run-ready-entry',
  guidEntry: 'opl-guid-entry',
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
  --codex-api-key-file <path>
                         File containing a test Codex API key. The key is read from disk,
                         entered through the GUI wizard, and never passed as a CLI argument.
  --require-codex-config-wizard
                         Fail unless the Codex configuration wizard is seen and submitted.
  --assert-clean         Fail if OPL state/log or app-local GUI state already exists before launch.
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
    codexApiKeyFile: process.env.OPL_FIRST_RUN_CODEX_API_KEY_FILE || null,
    requireCodexConfigWizard: false,
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
    if (arg === '--require-codex-config-wizard') {
      options.requireCodexConfigWizard = true;
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
    else if (arg === '--codex-api-key-file') options.codexApiKeyFile = path.resolve(value);
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

function readCodexApiKey(options) {
  if (!options.codexApiKeyFile) return null;
  const key = fs.readFileSync(options.codexApiKeyFile, 'utf8').trim();
  if (!key) throw new Error(`Codex API key file is empty: ${options.codexApiKeyFile}`);
  return key;
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
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

function defaultOplRuntimeRoot() {
  return path.join(os.homedir(), 'Library', 'Application Support', 'OPL', 'runtime');
}

function defaultAppSupportPath(processName = DEFAULT_PROCESS_NAME) {
  return path.join(os.homedir(), 'Library', 'Application Support', processName);
}

function assertCleanFirstRunState(processName = DEFAULT_PROCESS_NAME) {
  const existing = [defaultFirstRunLogPath(), defaultOplStatePath(), defaultAppSupportPath(processName)].filter((entry) =>
    fs.existsSync(entry)
  );
  if (existing.length > 0) {
    throw new Error(`Fresh VM assertion failed; existing OPL state/log/app-local state found:\n${existing.join('\n')}`);
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
  run('open', ['-n', appPath, '--args', '--force-renderer-accessibility']);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function realpathOrResolve(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch (_) {
    return path.resolve(filePath);
  }
}

function isMainModule(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  return realpathOrResolve(fileURLToPath(moduleUrl)) === realpathOrResolve(argvPath);
}

function findLatestFullRuntimeHome(runtimeRoot = defaultOplRuntimeRoot()) {
  if (!fs.existsSync(runtimeRoot)) return null;
  const currentRuntime = path.join(runtimeRoot, 'current');
  if (fs.existsSync(path.join(currentRuntime, 'bin', 'opl'))) {
    return currentRuntime;
  }

  const pointerPath = path.join(runtimeRoot, 'current.json');
  try {
    const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
    const pointerRuntime = typeof pointer?.runtime_home === 'string' ? pointer.runtime_home.trim() : '';
    if (pointerRuntime && fs.existsSync(path.join(pointerRuntime, 'bin', 'opl'))) {
      return pointerRuntime;
    }
  } catch (_) {
    // Continue to legacy versioned runtime discovery below.
  }

  const candidates = fs
    .readdirSync(runtimeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runtimeRoot, entry.name))
    .filter((runtimeHome) => fs.existsSync(path.join(runtimeHome, 'bin', 'opl')))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  return candidates[0] ?? null;
}

function resolvePythonBin(runtimeHome) {
  const pythonRoot = path.join(runtimeHome, 'python');
  if (!fs.existsSync(pythonRoot)) return null;
  return (
    fs
      .readdirSync(pythonRoot)
      .filter((entry) => entry.startsWith('cpython-'))
      .map((entry) => path.join(pythonRoot, entry, 'bin'))
      .filter((entry) => fs.existsSync(entry))
      .sort()
      .reverse()[0] ?? null
  );
}

function buildFullRuntimeCommandPrefix(runtimeHome) {
  if (!runtimeHome) return '';
  const pythonBin = resolvePythonBin(runtimeHome);
  const pathEntries = [
    path.join(runtimeHome, 'bin'),
    path.join(runtimeHome, 'node', 'bin'),
    path.join(runtimeHome, 'uv', 'bin'),
    ...(pythonBin ? [pythonBin] : []),
  ].join(path.delimiter);
  return [
    `export OPL_FULL_RUNTIME_HOME=${shellQuote(runtimeHome)}`,
    `export OPL_MODULES_ROOT=${shellQuote(path.join(runtimeHome, 'modules'))}`,
    `export OPL_MODULE_PATH_MEDAUTOSCIENCE=${shellQuote(path.join(runtimeHome, 'modules', 'mas'))}`,
    `export OPL_MODULE_PATH_MEDDEEPSCIENTIST=${shellQuote(path.join(runtimeHome, 'modules', 'mds'))}`,
    `export OPL_CODEX_BIN=${shellQuote(path.join(runtimeHome, 'bin', 'codex'))}`,
    `export OPL_HERMES_BIN=${shellQuote(path.join(runtimeHome, 'bin', 'hermes'))}`,
    `export PATH=${shellQuote(pathEntries)}:"$PATH"`,
  ].join(' && ');
}

function runOplJson(args) {
  const runtimeHome = findLatestFullRuntimeHome();
  const command = [
    buildFullRuntimeCommandPrefix(runtimeHome),
    'command -v opl >/dev/null',
    ['opl', ...args].map(shellQuote).join(' '),
  ]
    .filter(Boolean)
    .join(' && ');
  const result = spawnSync('/bin/zsh', ['-lc', command], {
    encoding: 'utf8',
    env: { ...process.env, OPL_OUTPUT: 'json' },
  });
  if (result.status !== 0) {
    throw new Error(`opl ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function queryAccessibility(processName) {
  const expectedLabels = [
    DEFAULT_LABELS.window,
    DEFAULT_LABELS.progress,
    DEFAULT_LABELS.blockersList,
    DEFAULT_LABELS.installButton,
    DEFAULT_LABELS.codexApiKeyInput,
    DEFAULT_LABELS.codexConfigureButton,
    DEFAULT_LABELS.retryButton,
    DEFAULT_LABELS.environmentButton,
    DEFAULT_LABELS.modulesButton,
    DEFAULT_LABELS.readyEntry,
    DEFAULT_LABELS.guidEntry,
  ];
  const script = `
const procName = ${JSON.stringify(processName)};
const systemEvents = Application('System Events');
const maxDepth = 16;
const maxNodes = 1500;
const expectedLabels = new Set(${JSON.stringify(expectedLabels)});
const foundLabels = new Set();
function tryRead(fn) {
  try {
    const value = fn();
    if (value === undefined || value === null) return null;
    return String(value);
  } catch (_) {
    return null;
  }
}
function recordLabels(node) {
  for (const value of [node.name, node.description, node.title, node.value, node.help]) {
    if (expectedLabels.has(value)) foundLabels.add(value);
  }
}
function hasExpectedLabels() {
  for (const label of expectedLabels) {
    if (!foundLabels.has(label)) return false;
  }
  return true;
}
function walk(element, depth, output) {
  if (depth > maxDepth || output.length > maxNodes) return false;
  const role = tryRead(() => element.role());
  const node = {
    role,
    name: tryRead(() => element.name()),
    description: tryRead(() => element.description()),
    title: tryRead(() => element.title()),
    value: tryRead(() => element.value()),
    help: tryRead(() => element.help()),
    position: tryRead(() => element.position()),
    size: tryRead(() => element.size()),
  };
  output.push(node);
  recordLabels(node);
  if (hasExpectedLabels()) return true;
  if (role === 'AXMenuBar' || role === 'AXMenu' || role === 'AXMenuBarItem') return false;
  let children = [];
  try {
    children = element.uiElements();
  } catch (_) {
    children = [];
  }
  for (const child of children) {
    if (walk(child, depth + 1, output)) return true;
  }
  return false;
}
const proc = systemEvents.processes.byName(procName);
const output = [];
const appNode = {
  role: tryRead(() => proc.role()),
  name: tryRead(() => proc.name()),
  description: tryRead(() => proc.description()),
  title: tryRead(() => proc.title()),
  value: null,
  help: null,
};
output.push(appNode);
recordLabels(appNode);
let windows = [];
try {
  windows = proc.windows();
} catch (_) {
  windows = [];
}
for (const window of windows) {
  if (walk(window, 1, output)) break;
}
JSON.stringify(output);
`;
  const raw = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout: 30_000 });
  return JSON.parse(raw);
}

function treeContainsLabel(tree, label) {
  return tree.some((node) =>
    [node.name, node.description, node.title, node.value, node.help].some((value) => value === label)
  );
}

function assertDoesNotContainSecret(label, content, secret) {
  if (secret && content.includes(secret)) {
    throw new Error(`${label} unexpectedly contains the Codex API key.`);
  }
}

function writeTextArtifact(target, content, secret) {
  assertDoesNotContainSecret(path.basename(target), content, secret);
  fs.writeFileSync(target, content, 'utf8');
}

function writeJsonArtifact(target, value, secret) {
  writeTextArtifact(target, `${JSON.stringify(value, null, 2)}\n`, secret);
}

function submitCodexWizard(processName, apiKey) {
  const script = `
ObjC.import('stdlib');
const procName = ${JSON.stringify(processName)};
const inputLabel = ${JSON.stringify(DEFAULT_LABELS.codexApiKeyInput)};
const buttonLabel = ${JSON.stringify(DEFAULT_LABELS.codexConfigureButton)};
const apiKey = $.getenv('OPL_FIRST_RUN_CODEX_API_KEY');
if (!apiKey) throw new Error('Missing OPL_FIRST_RUN_CODEX_API_KEY');
const systemEvents = Application('System Events');
const proc = systemEvents.processes.byName(procName);
function tryRead(fn) {
  try {
    const value = fn();
    if (value === undefined || value === null) return null;
    return String(value);
  } catch (_) {
    return null;
  }
}
function values(element) {
  return [
    tryRead(() => element.name()),
    tryRead(() => element.description()),
    tryRead(() => element.title()),
    tryRead(() => element.value()),
    tryRead(() => element.help()),
  ];
}
function hasLabel(element, label) {
  return values(element).some((value) => value === label);
}
function children(element) {
  try {
    return element.uiElements();
  } catch (_) {
    return [];
  }
}
function find(element, predicate, depth = 0) {
  if (depth > 16) return null;
  if (predicate(element)) return element;
  for (const child of children(element)) {
    const found = find(child, predicate, depth + 1);
    if (found) return found;
  }
  return null;
}
function roleOf(element) {
  return tryRead(() => element.role());
}
function isTextInput(element) {
  const role = roleOf(element);
  return role === 'AXTextField' || role === 'AXTextArea' || role === 'AXComboBox';
}
function findInWindows(predicate) {
  const windows = proc.windows();
  for (const window of windows) {
    const found = find(window, predicate);
    if (found) return found;
  }
  return null;
}
const labelledInput = findInWindows((element) => hasLabel(element, inputLabel));
let input = labelledInput ? find(labelledInput, isTextInput) : null;
if (!input) input = findInWindows(isTextInput);
if (!input) throw new Error('Codex API key input was not found');
try {
  input.actions.byName('AXPress').perform();
} catch (_) {}
try {
  input.focused = true;
} catch (_) {}
try {
  input.value = apiKey;
} catch (_) {}
systemEvents.keystroke('a', { using: 'command down' });
systemEvents.keyCode(51);
systemEvents.keystroke(apiKey);
delay(0.2);
const button = findInWindows((element) => hasLabel(element, buttonLabel));
if (!button) throw new Error('Codex configure button was not found');
try {
  button.actions.byName('AXPress').perform();
} catch (_) {
  button.click();
}
JSON.stringify({ status: 'submitted' });
`;
  execFileSync('osascript', ['-l', 'JavaScript', '-e', script], {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, OPL_FIRST_RUN_CODEX_API_KEY: apiKey },
  });
}

function readFirstRunEvents(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function describeFirstRunFailure(events) {
  const failure = events.findLast?.((event) => event.event_type === 'gui_initialize_failed');
  if (!failure) return null;
  const message = failure.payload?.message || failure.payload?.status || 'unknown first-run failure';
  return String(message);
}

async function waitForFirstRunCompletion(filePath, processName, timeoutMs, codexApiKey, artifactsDir) {
  const started = Date.now();
  let lastEvents = [];
  let lastTree = [];
  let sawCodexWizard = false;
  let submittedCodexWizard = false;
  let capturedCodexWizard = false;
  let lastCodexSubmitAt = 0;
  while (Date.now() - started < timeoutMs) {
    lastEvents = readFirstRunEvents(filePath);
    const completed = lastEvents.findLast?.(
      (event) =>
        event.event_type === 'gui_preparation_completed' &&
        (event.payload?.status === 'prepared' || event.payload?.status === 'already-prepared')
    );
    if (completed) return { events: lastEvents, sawCodexWizard, submittedCodexWizard };
    try {
      lastTree = queryAccessibility(processName);
      const hasCodexWizard =
        treeContainsLabel(lastTree, DEFAULT_LABELS.codexApiKeyInput) &&
        treeContainsLabel(lastTree, DEFAULT_LABELS.codexConfigureButton);
      if (hasCodexWizard) {
        sawCodexWizard = true;
        if (!capturedCodexWizard) {
          const wizardTreePath = path.join(artifactsDir, 'codex-config-wizard-accessibility-tree.json');
          writeJsonArtifact(wizardTreePath, lastTree, codexApiKey);
          spawnSync('screencapture', ['-x', path.join(artifactsDir, 'codex-config-wizard.png')], { stdio: 'ignore' });
          capturedCodexWizard = true;
        }
        if (!submittedCodexWizard || Date.now() - lastCodexSubmitAt > 10_000) {
          if (!codexApiKey) {
            throw new Error(
              'Codex configuration wizard is visible; provide --codex-api-key-file or OPL_FIRST_RUN_CODEX_API_KEY_FILE.'
            );
          }
          submitCodexWizard(processName, codexApiKey);
          submittedCodexWizard = true;
          lastCodexSubmitAt = Date.now();
        }
      }
    } catch (error) {
      if (String(error instanceof Error ? error.message : error).includes('--codex-api-key-file')) throw error;
    }
    await sleep(1_000);
  }

  const failure = describeFirstRunFailure(lastEvents);
  throw new Error(
    [
      `Timed out waiting for successful OPL first-run completion in ${filePath}.`,
      failure ? `Last first-run failure: ${failure}` : '',
      lastTree.length ? `Last accessibility sample: ${JSON.stringify(lastTree.slice(0, 12))}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

async function waitForGuidEntry(processName, timeoutMs) {
  const started = Date.now();
  let lastTree = [];
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastTree = queryAccessibility(processName);
      if (treeContainsLabel(lastTree, DEFAULT_LABELS.guidEntry)) {
        return { tree: lastTree, labels: [DEFAULT_LABELS.guidEntry] };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(2_000);
  }
  const detail = lastError instanceof Error ? lastError.message : JSON.stringify(lastTree.slice(0, 20));
  throw new Error(
    [
      `Timed out waiting for OPL usable entry accessibility label in ${processName}.`,
      'Grant Accessibility permission to the runner shell if System Events cannot read the app.',
      detail,
    ].join('\n')
  );
}

function captureUnifiedLog(processName, target) {
  const predicate = `process == "${processName.replace(/"/g, '\\"')}"`;
  const result = spawnSync('log', ['show', '--last', '10m', '--style', 'compact', '--predicate', predicate], {
    encoding: 'utf8',
  });
  fs.writeFileSync(target, result.stdout || result.stderr || '', 'utf8');
}

function writeOptionalTextArtifact(target, content, secret) {
  try {
    writeTextArtifact(target, content, secret);
  } catch (error) {
    const fallback = `${target}.write-error.txt`;
    fs.writeFileSync(fallback, error instanceof Error ? error.message : String(error), 'utf8');
  }
}

function copyTextFileIfExists(source, target, secret) {
  if (!fs.existsSync(source)) return;
  writeOptionalTextArtifact(target, fs.readFileSync(source, 'utf8'), secret);
}

function collectAppLogArtifacts(options, secret) {
  const logDir = path.dirname(defaultFirstRunLogPath());
  if (!fs.existsSync(logDir)) return;
  const targetDir = path.join(options.artifacts, 'app-logs');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const source = path.join(logDir, entry.name);
    const target = path.join(targetDir, entry.name);
    copyTextFileIfExists(source, target, secret);
  }
}

function collectFileListing(root, target) {
  if (!fs.existsSync(root)) {
    fs.writeFileSync(target, `MISSING ${root}\n`, 'utf8');
    return;
  }
  const result = spawnSync('/usr/bin/find', [root, '-maxdepth', '4', '-print'], {
    encoding: 'utf8',
  });
  fs.writeFileSync(target, result.stdout || result.stderr || '', 'utf8');
}

function collectFailureArtifacts(options, codexApiKey) {
  fs.mkdirSync(options.artifacts, { recursive: true });
  try {
    writeJsonArtifact(
      path.join(options.artifacts, 'failure-accessibility-tree.json'),
      queryAccessibility(options.processName),
      codexApiKey
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(options.artifacts, 'failure-accessibility-error.txt'),
      error instanceof Error ? error.message : String(error),
      'utf8'
    );
  }

  const firstRunLog = defaultFirstRunLogPath();
  copyTextFileIfExists(firstRunLog, path.join(options.artifacts, 'first-run.jsonl'), codexApiKey);
  collectAppLogArtifacts(options, codexApiKey);
  collectFileListing(defaultAppSupportPath(options.processName), path.join(options.artifacts, 'app-support-files.txt'));
  collectFileListing(defaultOplStatePath(), path.join(options.artifacts, 'opl-state-files.txt'));

  for (const [name, args] of [
    ['system-initialize.json', ['system', 'initialize', '--json']],
    ['modules.json', ['modules']],
  ]) {
    try {
      writeTextArtifact(path.join(options.artifacts, name), runOplJson(args), codexApiKey);
    } catch (error) {
      fs.writeFileSync(
        path.join(options.artifacts, `${name}.error.txt`),
        error instanceof Error ? error.message : String(error),
        'utf8'
      );
    }
  }

  spawnSync('screencapture', ['-x', path.join(options.artifacts, 'failure-first-launch.png')], { stdio: 'ignore' });
  const unifiedLogPath = path.join(options.artifacts, 'unified-log.txt');
  captureUnifiedLog(options.processName, unifiedLogPath);
  if (fs.existsSync(unifiedLogPath)) {
    assertDoesNotContainSecret('unified-log.txt', fs.readFileSync(unifiedLogPath, 'utf8'), codexApiKey);
  }
}

async function main() {
  assertMacOS();
  const options = parseArgs(process.argv.slice(2));
  const codexApiKey = readCodexApiKey(options);
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    if (options.assertClean) assertCleanFirstRunState(options.processName);

    const appPath = options.dmg ? installDmgApp(options.dmg, options.installDir) : options.app;
    if (!fs.existsSync(appPath)) throw new Error(`App bundle does not exist: ${appPath}`);

    launchApp(appPath);
    const firstRunLog = defaultFirstRunLogPath();
    const firstRun = await waitForFirstRunCompletion(
      firstRunLog,
      options.processName,
      options.timeoutMs,
      codexApiKey,
      options.artifacts
    );
    if (options.requireCodexConfigWizard && !firstRun.submittedCodexWizard) {
      throw new Error('Expected Codex configuration wizard to appear and be submitted, but it was not observed.');
    }

    const accessibility = await waitForGuidEntry(options.processName, options.timeoutMs);
    writeJsonArtifact(
      path.join(options.artifacts, 'accessibility-tree.json'),
      accessibility.tree,
      codexApiKey
    );

    if (fs.existsSync(firstRunLog)) {
      writeTextArtifact(path.join(options.artifacts, 'first-run.jsonl'), fs.readFileSync(firstRunLog, 'utf8'), codexApiKey);
    }

    writeTextArtifact(
      path.join(options.artifacts, 'system-initialize.json'),
      runOplJson(['system', 'initialize', '--json']),
      codexApiKey
    );
    writeTextArtifact(path.join(options.artifacts, 'modules.json'), runOplJson(['modules']), codexApiKey);
    spawnSync('screencapture', ['-x', path.join(options.artifacts, 'first-launch.png')], { stdio: 'ignore' });
    const unifiedLogPath = path.join(options.artifacts, 'unified-log.txt');
    captureUnifiedLog(options.processName, unifiedLogPath);
    assertDoesNotContainSecret('unified-log.txt', fs.existsSync(unifiedLogPath) ? fs.readFileSync(unifiedLogPath, 'utf8') : '', codexApiKey);

    const summary = {
      surface_id: 'opl_packaged_gui_first_run_smoke',
      status: 'passed',
      app_path: appPath,
      artifacts: options.artifacts,
      codex_config_wizard_seen: firstRun.sawCodexWizard,
      codex_config_wizard_submitted: firstRun.submittedCodexWizard,
      codex_api_key_present: Boolean(codexApiKey),
      labels: accessibility.labels,
    };
    writeJsonArtifact(path.join(options.artifacts, 'smoke-summary.json'), summary, codexApiKey);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    collectFailureArtifacts(options, codexApiKey);
    throw error;
  }
}

export const __test = process.env.NODE_ENV === 'test'
  ? {
      buildFullRuntimeCommandPrefix,
      findLatestFullRuntimeHome,
      isMainModule,
      runOplJson,
    }
  : undefined;

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

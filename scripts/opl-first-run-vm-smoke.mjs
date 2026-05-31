#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROCESS_NAME = 'One Person Lab';
const DEFAULT_LABELS = {
  window: 'opl-first-run-window',
  progress: 'opl-first-run-progress',
  blockersList: 'opl-first-run-blockers-list',
  beginnerPrimary: 'opl-first-run-beginner-primary',
  installButton: 'opl-first-run-install-button',
  codexApiKeyInput: 'opl-first-run-codex-api-key-input',
  codexConfigureButton: 'opl-first-run-configure-codex-button',
  retryButton: 'opl-first-run-retry-button',
  environmentButton: 'opl-first-run-open-environment-button',
  modulesButton: 'opl-first-run-open-modules-button',
  readyEntry: 'opl-first-run-ready-entry',
  guidEntry: 'opl-guid-entry',
  settingsEnvironment: 'opl-settings-environment',
  beginnerSummary: 'opl-first-run-beginner-summary',
  primaryAction: 'opl-first-run-primary-action',
  backgroundMaintenance: 'opl-first-run-background-maintenance-secondary',
  technicalDetailsToggle: 'opl-first-run-technical-details-toggle',
};
const DEFERRED_FULL_FIRST_RUN_BLOCKERS = new Set(['domain_modules', 'family_runtime_provider', 'recommended_skills']);
const RUNTIME_PROFILES = new Set(['full', 'standard']);
const FULL_CODEX_VISIBLE_COMPANION_SKILLS = [
  'officecli',
  'officecli-docx',
  'officecli-pptx',
  'officecli-xlsx',
  'mineru-document-extractor',
  'ui-ux-pro-max',
];
const FULL_PLUGIN_ONLY_DOMAIN_SKILLS = [
  ['mas', 'modules/mas', 'mas'],
  ['mag', 'modules/mag', 'mag'],
  ['rca', 'modules/rca', 'rca'],
];
const FULL_RUNTIME_MODULES = [
  ['medautoscience', 'med-autoscience', path.join('modules', 'mas'), ['agent', 'plugins']],
  ['medautogrant', 'med-autogrant', path.join('modules', 'mag'), ['agent', 'plugins']],
  ['redcube', 'redcube-ai', path.join('modules', 'rca'), ['agent', 'plugins']],
  [
    'oplmetaagent',
    'opl-meta-agent',
    path.join('modules', 'meta-agent'),
    ['agent', 'contracts', path.join('runtime', 'authority_functions')],
  ],
];
const OPL_ASSISTANT_ROUTE_SMOKE_TARGETS = [
  { id: 'mas', badge: '@MAS', shortName: 'MAS' },
  { id: 'mag', badge: '@MAG', shortName: 'MAG' },
  { id: 'rca', badge: '@RCA', shortName: 'RCA' },
];

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
  --settings-smoke       After first launch, navigate all built-in Settings pages through the packaged app.
  --assistant-route-smoke
                         Click MAS/MAG/RCA purpose entries, create receipt-only conversations,
                         and verify each conversation stores the Codex route receipt.
  --cdp-port <n>         CDP port used by packaged-app DOM smoke probes. Default: 9230.
  --runtime-profile <profile>
                         First-run package profile to verify: full or standard. Default: full.
                         The full profile verifies bundled runtime/module/skill equivalence.
                         The standard profile verifies core launch readiness without requiring
                         Full-only bundled modules.
  --codex-api-key-file <path>
                         File containing a test Codex API key. The key is read from disk,
                         entered through the GUI wizard, and never passed as a CLI argument.
  --require-codex-config-wizard
                         Fail unless the Codex configuration wizard is seen and submitted.
                         Use this only for Full/runtime first-run flows that intentionally
                         expose the wizard. Standard DMG smokes treat the wizard as an
                         observed optional path.
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
    settingsSmoke: false,
    assistantRouteSmoke: false,
    cdpPort: 9230,
    runtimeProfile: 'full',
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
    if (arg === '--settings-smoke') {
      options.settingsSmoke = true;
      continue;
    }
    if (arg === '--assistant-route-smoke') {
      options.assistantRouteSmoke = true;
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
    else if (arg === '--cdp-port') options.cdpPort = Number(value);
    else if (arg === '--runtime-profile') options.runtimeProfile = value;
    else if (arg === '--codex-api-key-file') options.codexApiKeyFile = path.resolve(value);
    else throw new Error(`Unsupported argument: ${arg}`);
  }

  if (options.app && options.dmg) throw new Error('Use only one of --app or --dmg.');
  if (!options.app && !options.dmg) throw new Error('One of --app or --dmg is required.');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1024 || options.cdpPort > 65535) {
    throw new Error('--cdp-port must be an integer TCP port between 1024 and 65535.');
  }
  if (!RUNTIME_PROFILES.has(options.runtimeProfile)) {
    throw new Error('--runtime-profile must be one of: full, standard.');
  }
  if (!options.artifacts) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    options.artifacts = path.resolve('artifacts', `opl-first-run-${stamp}`);
  }
  return options;
}

function shouldVerifyFullFirstRunEquivalence(runtimeProfile) {
  return runtimeProfile === 'full';
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

function toRuntimeShellPath(value) {
  if (process.platform !== 'win32') return value;
  return value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

function runtimePathDelimiter() {
  return process.platform === 'win32' ? ':' : path.delimiter;
}

function runtimeShellExecutable() {
  const override = process.env.OPL_FIRST_RUN_SHELL?.trim();
  if (override) return override;
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh';
  if (fs.existsSync('/bin/bash')) return '/bin/bash';
  return 'sh';
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
  const existing = [defaultFirstRunLogPath(), defaultOplStatePath(), defaultAppSupportPath(processName)].filter(
    (entry) => fs.existsSync(entry)
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

function buildLaunchAppArgs(appPath, options) {
  const args = ['--force-renderer-accessibility'];
  args.push(`--aionui-cdp-port=${options.cdpPort}`);
  return ['-n', appPath, '--args', ...args];
}

function launchApp(appPath, options) {
  run('launchctl', ['setenv', 'AIONUI_CDP_PORT', String(options.cdpPort)]);
  run('open', buildLaunchAppArgs(appPath, options));
}

function terminateExistingApp(processName = DEFAULT_PROCESS_NAME) {
  spawnSync('osascript', ['-e', `tell application ${JSON.stringify(processName)} to quit`], { stdio: 'ignore' });
  spawnSync('/usr/bin/pkill', ['-x', processName], { stdio: 'ignore' });
}

function shouldTerminateExistingApp() {
  return process.env.OPL_FIRST_RUN_KEEP_EXISTING_APP !== '1';
}

function eventTimestampMs(event) {
  const timestamp = typeof event?.timestamp === 'string' ? Date.parse(event.timestamp) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
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
  const hermesBin = path.join(runtimeHome, 'bin', 'hermes');
  const runtimeHomeForShell = toRuntimeShellPath(runtimeHome);
  const pathEntries = [
    path.join(runtimeHome, 'bin'),
    path.join(runtimeHome, 'node', 'bin'),
    path.join(runtimeHome, 'uv', 'bin'),
    ...(pythonBin ? [pythonBin] : []),
  ]
    .map(toRuntimeShellPath)
    .join(runtimePathDelimiter());
  return [
    `export OPL_FULL_RUNTIME_HOME=${shellQuote(runtimeHomeForShell)}`,
    `export OPL_PACKAGED_SKILLS_ROOT=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'skills')))}`,
    `export OPL_MODULE_PATH_MEDAUTOSCIENCE=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'mas')))}`,
    `export OPL_MODULE_PATH_MEDAUTOGRANT=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'mag')))}`,
    `export OPL_MODULE_PATH_REDCUBE=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'rca')))}`,
    `export OPL_MODULE_PATH_OPLMETAAGENT=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'meta-agent')))}`,
    `export OPL_CODEX_BIN=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'bin', 'codex')))}`,
    fs.existsSync(hermesBin) ? `export OPL_HERMES_BIN=${shellQuote(toRuntimeShellPath(hermesBin))}` : '',
    `export PATH=${shellQuote(pathEntries)}:"$PATH"`,
  ]
    .filter(Boolean)
    .join(' && ');
}

function listStringValues(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function hasOnlyDeferredFullFirstRunBlockers(blockers) {
  return blockers.every((blocker) => DEFERRED_FULL_FIRST_RUN_BLOCKERS.has(blocker));
}

function isCoreFirstLaunchReady(initialize) {
  if (initialize?.setup_flow?.ready_to_launch === true) return true;
  const readiness = initialize?.readiness ?? {};
  const blockers = listStringValues(initialize?.setup_flow?.blocking_items);
  return (
    readiness.launch_ready === true &&
    readiness.core_ready !== false &&
    readiness.domain_ready !== false &&
    hasOnlyDeferredFullFirstRunBlockers(blockers)
  );
}

function assertPackagedRuntimeModule(runtimeHome, moduleId, repoName, runtimeRelativePath, requiredPayloadPaths) {
  const moduleRoot = path.join(runtimeHome, runtimeRelativePath);
  const markerPath = path.join(moduleRoot, 'opl-runtime-module.json');
  if (!fs.existsSync(markerPath)) {
    throw new Error(`OPL Full runtime module ${moduleId} is missing packaged marker: ${markerPath}`);
  }
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  if (marker.packaged_runtime !== true || marker.module_id !== moduleId || marker.repo_name !== repoName) {
    throw new Error(`OPL Full runtime module ${moduleId} has an invalid packaged marker: ${JSON.stringify(marker)}`);
  }
  const missingPayloadPaths = requiredPayloadPaths.filter(
    (relativePath) => !fs.existsSync(path.join(moduleRoot, relativePath))
  );
  if (missingPayloadPaths.length > 0) {
    throw new Error(
      `OPL Full runtime module ${moduleId} is missing expected payload path(s): ${missingPayloadPaths.join(', ')} in ${moduleRoot}`
    );
  }
}

function assertFullCompanionSkillPayloads(initialize, runtimeHome, options = {}) {
  const codexHome = options.codexHome || process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
  const recommendedSkills = initialize.recommended_skills?.skills ?? [];
  const readySkills = new Map(recommendedSkills.map((skill) => [skill.skill_id, skill.status]));
  for (const skillId of FULL_CODEX_VISIBLE_COMPANION_SKILLS) {
    if (readySkills.get(skillId) !== 'ready') {
      throw new Error(
        `OPL Full first-run companion skill ${skillId} is not ready: ${readySkills.get(skillId) ?? 'missing'}`
      );
    }
    const codexSkillPath = path.join(codexHome, 'skills', skillId, 'SKILL.md');
    const packagedSkillPath = path.join(runtimeHome, 'skills', skillId, 'SKILL.md');
    if (!fs.existsSync(codexSkillPath) && !fs.existsSync(packagedSkillPath)) {
      throw new Error(
        `OPL Full first-run companion skill ${skillId} is missing from Codex-visible or packaged runtime skill sources: ${codexSkillPath}, ${packagedSkillPath}`
      );
    }
  }
}

function assertPackagedDomainPluginSkill(runtimeHome, skillId, runtimeRelativePath, pluginName = skillId) {
  const pluginRoot = path.join(runtimeHome, runtimeRelativePath, 'plugins', pluginName);
  const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const skillPath = path.join(pluginRoot, 'skills', skillId, 'SKILL.md');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`OPL Full runtime domain plugin ${skillId} is missing packaged plugin manifest: ${manifestPath}`);
  }
  if (!fs.existsSync(skillPath)) {
    throw new Error(`OPL Full runtime domain plugin ${skillId} is missing packaged skill entry: ${skillPath}`);
  }
}

function assertFullFirstRunEquivalence(systemInitializeRaw, modulesRaw, options = {}) {
  const systemInitialize = JSON.parse(systemInitializeRaw);
  const initialize = systemInitialize.system_initialize;
  if (!isCoreFirstLaunchReady(initialize)) {
    throw new Error(
      `OPL first-run initialize did not report a launchable core state: ${JSON.stringify({
        ready_to_launch: initialize?.setup_flow?.ready_to_launch ?? null,
        blocking_items: initialize?.setup_flow?.blocking_items ?? [],
        readiness: initialize?.readiness ?? null,
      })}`
    );
  }
  JSON.parse(modulesRaw);
  const runtimeHome = options.runtimeHome || findLatestFullRuntimeHome();
  if (!runtimeHome) {
    throw new Error('OPL Full runtime home was not found after first launch.');
  }
  assertFullCompanionSkillPayloads(initialize, runtimeHome, { codexHome: options.codexHome });
  for (const [moduleId, repoName, runtimeRelativePath, requiredPayloadPaths] of FULL_RUNTIME_MODULES) {
    assertPackagedRuntimeModule(runtimeHome, moduleId, repoName, runtimeRelativePath, requiredPayloadPaths);
  }
  for (const [skillId, runtimeRelativePath, pluginName] of FULL_PLUGIN_ONLY_DOMAIN_SKILLS) {
    assertPackagedDomainPluginSkill(runtimeHome, skillId, runtimeRelativePath, pluginName);
  }
  const assertFullRuntimeToolCallable = (command, args) => {
    const probe = spawnSync(
      runtimeShellExecutable(),
      [
        '-lc',
        [buildFullRuntimeCommandPrefix(runtimeHome), [command, ...args].map(shellQuote).join(' ')]
          .filter(Boolean)
          .join(' && '),
      ],
      {
        encoding: 'utf8',
      }
    );
    if (probe.status !== 0 || !probe.stdout.trim()) {
      throw new Error(`${command} is not callable from the Full runtime PATH: ${probe.stderr || probe.stdout}`);
    }
  };
  assertFullRuntimeToolCallable('officecli', ['--version']);
  assertFullRuntimeToolCallable('mineru-open-api', ['version']);
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
  const result = spawnSync(runtimeShellExecutable(), ['-lc', command], {
    encoding: 'utf8',
    env: { ...process.env, OPL_OUTPUT: 'json' },
  });
  if (result.status !== 0) {
    throw new Error(`opl ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function firstRunAccessibilityExpectedLabels() {
  return [
    DEFAULT_LABELS.window,
    DEFAULT_LABELS.progress,
    DEFAULT_LABELS.blockersList,
    DEFAULT_LABELS.codexApiKeyInput,
    DEFAULT_LABELS.codexConfigureButton,
    DEFAULT_LABELS.readyEntry,
    DEFAULT_LABELS.beginnerSummary,
    DEFAULT_LABELS.primaryAction,
    DEFAULT_LABELS.technicalDetailsToggle,
    DEFAULT_LABELS.guidEntry,
  ];
}

function queryAccessibility(processName) {
  const expectedLabels = firstRunAccessibilityExpectedLabels();
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

function captureMacScreenArtifact(target) {
  if (process.env.OPL_FIRST_RUN_ENABLE_MACOS_SCREENCAPTURE !== '1') {
    fs.writeFileSync(
      `${target}.skipped.txt`,
      [
        'Skipped macOS screencapture to avoid Screen & System Audio permission prompts in clean VM smoke.',
        'Settings page screenshots are captured through CDP instead.',
        '',
      ].join('\n'),
      'utf8'
    );
    return { status: 'skipped', target };
  }

  const result = spawnSync('screencapture', ['-x', target], { stdio: 'ignore' });
  return { status: result.status === 0 ? 'captured' : 'skipped', target };
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

function readFirstRunEvents(filePath, sinceMs = 0) {
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
    .filter(Boolean)
    .filter((event) => eventTimestampMs(event) >= sinceMs);
}

function describeFirstRunFailure(events) {
  const failure = events.findLast?.((event) => event.event_type === 'gui_initialize_failed');
  if (!failure) return null;
  const message = failure.payload?.message || failure.payload?.status || 'unknown first-run failure';
  return String(message);
}

function isFirstRunCompletionEvent(event) {
  if (
    !event ||
    ![
      'gui_preparation_completed',
      'gui_preparation_completed_with_deferred_attention',
      'gui_preparation_skipped',
    ].includes(event.event_type)
  ) {
    return false;
  }
  return event.payload?.status === 'prepared' || event.payload?.status === 'already-prepared';
}

function shouldProbeExistingGuidEntryBeforeFirstRun(options) {
  return options.assertClean !== true && options.requireCodexConfigWizard !== true;
}

function existingStateGuidProbeTimeoutMs(options) {
  return Math.min(options.timeoutMs, 30_000);
}

function shouldWaitForFirstRunCompletion(options) {
  return process.env.OPL_FIRST_RUN_WAIT_FOR_LOG_COMPLETION === '1' && options.requireCodexConfigWizard === true;
}

function shouldWaitForCoreFirstLaunchReady(options) {
  return (
    options.requireCodexConfigWizard === true ||
    options.assertClean === true ||
    shouldVerifyFullFirstRunEquivalence(options.runtimeProfile)
  );
}

function parseSystemInitialize(systemInitializeRaw) {
  const payload = JSON.parse(systemInitializeRaw);
  return payload.system_initialize ?? payload;
}

function summarizeCoreFirstLaunch(systemInitializeRaw) {
  const initialize = parseSystemInitialize(systemInitializeRaw);
  return {
    source: 'opl system initialize --json',
    status: isCoreFirstLaunchReady(initialize) ? 'ready' : 'not_ready',
    ready_to_launch: initialize?.setup_flow?.ready_to_launch ?? null,
    blocking_items: listStringValues(initialize?.setup_flow?.blocking_items),
    readiness: initialize?.readiness ?? null,
  };
}

function createCodexWizardState() {
  return {
    sawCodexWizard: false,
    submittedCodexWizard: false,
    capturedCodexWizard: false,
    lastCodexSubmitAt: 0,
    lastTree: [],
  };
}

function observeCodexConfigWizard(processName, codexApiKey, artifactsDir, state) {
  state.lastTree = queryAccessibility(processName);
  const hasCodexWizard =
    treeContainsLabel(state.lastTree, DEFAULT_LABELS.codexApiKeyInput) &&
    treeContainsLabel(state.lastTree, DEFAULT_LABELS.codexConfigureButton);
  if (!hasCodexWizard) return state;

  state.sawCodexWizard = true;
  if (!state.capturedCodexWizard) {
    const wizardTreePath = path.join(artifactsDir, 'codex-config-wizard-accessibility-tree.json');
    writeJsonArtifact(wizardTreePath, state.lastTree, codexApiKey);
    captureMacScreenArtifact(path.join(artifactsDir, 'codex-config-wizard.png'));
    state.capturedCodexWizard = true;
  }
  if (!state.submittedCodexWizard || Date.now() - state.lastCodexSubmitAt > 10_000) {
    if (!codexApiKey) {
      throw new Error(
        'Codex configuration wizard is visible; provide --codex-api-key-file or OPL_FIRST_RUN_CODEX_API_KEY_FILE.'
      );
    }
    submitCodexWizard(processName, codexApiKey);
    state.submittedCodexWizard = true;
    state.lastCodexSubmitAt = Date.now();
  }
  return state;
}

function codexWizardResult(state) {
  return {
    sawCodexWizard: state.sawCodexWizard,
    submittedCodexWizard: state.submittedCodexWizard,
  };
}

async function waitForCoreFirstLaunchReady(options, codexApiKey) {
  const started = Date.now();
  let lastError = null;
  let lastSystemInitializeRaw = '';
  const wizardState = createCodexWizardState();
  while (Date.now() - started < options.timeoutMs) {
    try {
      observeCodexConfigWizard(options.processName, codexApiKey, options.artifacts, wizardState);
    } catch (error) {
      if (String(error instanceof Error ? error.message : error).includes('--codex-api-key-file')) throw error;
    }
    try {
      lastSystemInitializeRaw = runOplJson(['system', 'initialize', '--json']);
      const initialize = parseSystemInitialize(lastSystemInitializeRaw);
      if (isCoreFirstLaunchReady(initialize)) {
        return {
          systemInitializeRaw: lastSystemInitializeRaw,
          initialize,
          ...codexWizardResult(wizardState),
        };
      }
      lastError = new Error(
        `Core first-launch readiness is not ready: ${JSON.stringify(summarizeCoreFirstLaunch(lastSystemInitializeRaw))}`
      );
    } catch (error) {
      lastError = error;
    }
    await sleep(2_000);
  }
  throw new Error(
    [
      'Timed out waiting for OPL core first-launch readiness from `opl system initialize --json`.',
      lastError ? `Last readiness error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '',
      lastSystemInitializeRaw ? `Last system initialize sample: ${lastSystemInitializeRaw.slice(0, 1200)}` : '',
      wizardState.lastTree.length
        ? `Last accessibility sample: ${JSON.stringify(wizardState.lastTree.slice(0, 12))}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

function cdpProbeTimeoutMs(options) {
  return Math.min(options.timeoutMs, 30_000);
}

function remainingGuidFallbackTimeoutMs(totalTimeoutMs, elapsedMs) {
  return Math.max(0, totalTimeoutMs - elapsedMs);
}

function createSmokeEventWriter(artifactsDir, secret) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const target = path.join(artifactsDir, 'smoke-events.jsonl');
  return (phase, status, details = {}) => {
    const event = {
      timestamp: new Date().toISOString(),
      phase,
      status,
      ...details,
    };
    const line = JSON.stringify(event);
    assertDoesNotContainSecret('smoke-events.jsonl', line, secret);
    fs.appendFileSync(target, `${line}\n`, 'utf8');
    return event;
  };
}

function writeSmokeEventSafely(writeSmokeEvent, phase, status, details = {}) {
  try {
    writeSmokeEvent(phase, status, details);
  } catch (error) {
    process.stderr.write(`[smoke-event] failed to write ${phase}/${status}: ${error.message || String(error)}\n`);
  }
}

async function runSmokePhase(writeSmokeEvent, phase, operation, details = {}) {
  const started = Date.now();
  writeSmokeEventSafely(writeSmokeEvent, phase, 'started', details);
  try {
    const result = await operation();
    writeSmokeEventSafely(writeSmokeEvent, phase, 'passed', {
      duration_ms: Date.now() - started,
    });
    return result;
  } catch (error) {
    writeSmokeEventSafely(writeSmokeEvent, phase, 'failed', {
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function waitForFullFirstRunEquivalence(timeoutMs) {
  const started = Date.now();
  let lastError = null;
  let lastSystemInitializeRaw = '';
  let lastModulesRaw = '';
  while (Date.now() - started < timeoutMs) {
    try {
      lastSystemInitializeRaw = runOplJson(['system', 'initialize', '--json']);
      lastModulesRaw = runOplJson(['modules']);
      assertFullFirstRunEquivalence(lastSystemInitializeRaw, lastModulesRaw);
      return {
        systemInitializeRaw: lastSystemInitializeRaw,
        modulesRaw: lastModulesRaw,
      };
    } catch (error) {
      lastError = error;
      await sleep(2_000);
    }
  }
  throw new Error(
    [
      'Timed out waiting for Full runtime modules and companion skills to materialize after core first launch.',
      lastError ? `Last readiness error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '',
      lastSystemInitializeRaw ? `Last system initialize sample: ${lastSystemInitializeRaw.slice(0, 1200)}` : '',
      lastModulesRaw ? `Last modules sample: ${lastModulesRaw.slice(0, 1200)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

async function waitForFirstRunCompletion(filePath, processName, timeoutMs, codexApiKey, artifactsDir, sinceMs = 0) {
  const started = Date.now();
  let lastEvents = [];
  let lastTree = [];
  let sawCodexWizard = false;
  let submittedCodexWizard = false;
  let capturedCodexWizard = false;
  let lastCodexSubmitAt = 0;
  while (Date.now() - started < timeoutMs) {
    lastEvents = readFirstRunEvents(filePath, sinceMs);
    const completed = lastEvents.findLast?.((event) => isFirstRunCompletionEvent(event));
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
          captureMacScreenArtifact(path.join(artifactsDir, 'codex-config-wizard.png'));
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

function guidEntryReadinessExpression() {
  return `(() => {
    const guidEntry = document.querySelector('[data-testid="opl-guid-entry"], [aria-label="opl-guid-entry"]');
    const guidInput = document.querySelector('[data-testid="guid-input"]');
    const guidSendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const firstRunWindow = document.querySelector('[data-testid="opl-first-run-window"]');
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    const hashOk = window.location.hash.startsWith('#/guid');
    return hashOk && guidEntry && guidInput && guidSendButton && !firstRunWindow && !appLoaderVisible
      ? {
          hash: window.location.hash,
          guidEntryVisible: true,
          guidInputVisible: true,
          guidSendButtonVisible: true,
          hasGuidInput: true,
          hasGuidSendButton: true,
        }
      : false;
  })()`;
}

function guidEntryNavigationExpression() {
  return `(() => {
    const guidEntry = document.querySelector('[data-testid="opl-guid-entry"], [aria-label="opl-guid-entry"]');
    const guidInput = document.querySelector('[data-testid="guid-input"]');
    const guidSendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const firstRunWindow = document.querySelector('[data-testid="opl-first-run-window"]');
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    if (window.location.hash.startsWith('#/guid') && guidEntry && guidInput && guidSendButton && !firstRunWindow && !appLoaderVisible) {
      return {
        hash: window.location.hash,
        guidEntryVisible: true,
        guidInputVisible: true,
        guidSendButtonVisible: true,
        hasGuidInput: true,
        hasGuidSendButton: true,
        navigatedBy: 'ready_entry',
      };
    }
    const readyAnchor = document.querySelector('[aria-label="opl-first-run-ready-entry"], [data-testid="opl-first-run-ready-entry"]');
    const readyButton = readyAnchor?.closest('button') || readyAnchor;
    const disabled =
      !readyButton ||
      readyButton.disabled === true ||
      readyButton.getAttribute('disabled') !== null ||
      readyButton.getAttribute('aria-disabled') === 'true' ||
      readyButton.className.includes('disabled');
    if (readyButton && firstRunWindow && !appLoaderVisible && !disabled) {
      readyButton.click();
    }
    return false;
  })()`;
}

function visibleHomeAssistantControlSelector(assistantId) {
  return `[data-testid="preset-pill-${assistantId}"]`;
}

function homeAssistantDeniedSelectorParts() {
  return [
    '[data-testid="agent-mode-selector"]',
    '[data-testid="aionrs-model-selector"]',
    '[data-testid="acp-model-selector"]',
    '[data-testid="google-model-selector"]',
    '[data-testid^="agent-pill-"]',
    '[class*="sendbox-model"]',
    '.sendbox-model-btn',
  ];
}

function homeAssistantDeniedSelectorExpression() {
  return JSON.stringify(homeAssistantDeniedSelectorParts());
}

function homeAssistantRouteSelectionExpression(target) {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const deniedVisibleBefore = ${homeAssistantDeniedSelectorExpression()}
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(visible)
      .map((node) => node.getAttribute('data-testid') || node.className || node.textContent?.slice(0, 80) || 'unknown');
    if (deniedVisibleBefore.length > 0) {
      return { status: 'failed', reason: 'ordinary_home_selector_visible_before_select', deniedVisible: deniedVisibleBefore };
    }
    if (!window.location.hash.startsWith('#/guid')) {
      window.location.hash = '#/guid';
      return false;
    }
    const card = document.querySelector(${cdpString(visibleHomeAssistantControlSelector(target.id))});
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    if (!visible(card) || !visible(input) || !visible(sendButton)) return false;
    card.click();
    return { clickedAssistantId: ${cdpString(target.id)}, cardText: card.textContent || '' };
  })()`;
}

function homeAssistantRouteReadyExpression(target) {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const text = document.body?.innerText || '';
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const card = document.querySelector(${cdpString(visibleHomeAssistantControlSelector(target.id))});
    const deniedVisible = ${homeAssistantDeniedSelectorExpression()}
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(visible)
      .map((node) => node.getAttribute('data-testid') || node.className || node.textContent?.slice(0, 80) || 'unknown');
    if (deniedVisible.length > 0) {
      return { status: 'failed', reason: 'ordinary_home_selector_visible_after_select', deniedVisible };
    }
    if (!visible(input) || !visible(sendButton) || !visible(card)) return false;
    if (!text.includes(${cdpString(target.badge)})) return false;
    return {
      assistant_id: ${cdpString(target.id)},
      badge: ${cdpString(target.badge)},
      selected_card_text: card.textContent || '',
      selectors_hidden: true,
    };
  })()`;
}

function homeAssistantRouteSendExpression(target, prompt) {
  return `(() => {
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    if (!input || !sendButton) return false;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (!nativeSetter) throw new Error('Could not resolve native input value setter');
    nativeSetter.call(input, ${cdpString(prompt)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (sendButton.disabled || sendButton.getAttribute('disabled') !== null || sendButton.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    sendButton.click();
    return { assistant_id: ${cdpString(target.id)}, promptLength: ${prompt.length} };
  })()`;
}

function createAssistantRouteReceiptConversationExpression(target) {
  return `(async () => {
    const backendPort = window.__backendPort;
    if (!backendPort) return false;
    const route = {
      route_kind: 'builtin_capability',
      executor: 'codex_cli',
      assistant_id: ${cdpString(target.id)},
      assistant_short_name: ${cdpString(target.shortName)},
      source: 'opl_app_home',
    };
    const response = await fetch(\`http://127.0.0.1:\${backendPort}/api/conversations\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'acp',
        name: ${cdpString(`OPL packaged GUI route smoke receipt for ${target.shortName}`)},
        extra: {
          workspace: '',
          custom_workspace: false,
          backend: 'codex',
          preset_assistant_id: ${cdpString(target.id)},
          opl_assistant_route: route,
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(\`POST /api/conversations failed for ${target.id}: \${response.status} \${body}\`);
    }
    const payload = await response.json();
    const conversation = payload?.data || payload;
    const conversationId = conversation?.id;
    if (!conversationId) {
      throw new Error(\`POST /api/conversations returned no conversation id for ${target.id}: \${JSON.stringify(payload)}\`);
    }
    return {
      status: 'created',
      assistant_id: ${cdpString(target.id)},
      conversation_id: conversationId,
      route,
    };
  })()`;
}

function conversationRouteReceiptExpression(target, conversationId = null) {
  const conversationPath = conversationId
    ? `/api/conversations/${encodeURIComponent(conversationId)}`
    : '/api/conversations?limit=10';
  return `(async () => {
    const backendPort = window.__backendPort;
    if (!backendPort) return false;
    const response = await fetch(\`http://127.0.0.1:\${backendPort}${conversationPath}\`);
    if (!response.ok) {
      throw new Error(\`Conversation receipt lookup returned \${response.status}\`);
    }
    const payload = await response.json();
    const conversations = ${conversationId ? '[payload?.data || payload]' : 'payload?.data?.items || payload?.items || []'};
    const matched = conversations.find((conversation) => {
      const route = conversation?.extra?.opl_assistant_route;
      const assistantMatches = route?.assistant_id === ${cdpString(target.id)};
      const conversationMatches = ${conversationId ? `conversation?.id === ${cdpString(conversationId)}` : 'true'};
      return assistantMatches && conversationMatches;
    });
    if (!matched) {
      return {
        status: 'waiting_for_route_receipt',
        assistant_id: ${cdpString(target.id)},
        expected_conversation_id: ${conversationId ? cdpString(conversationId) : 'null'},
        recent_conversation_count: conversations.length,
        recent_routes: conversations.map((conversation) => conversation?.extra?.opl_assistant_route || null),
      };
    }
    const route = matched.extra.opl_assistant_route;
    const invalid = [];
    if (route.route_kind !== 'builtin_capability') invalid.push('route_kind');
    if (route.executor !== 'codex_cli') invalid.push('executor');
    if (route.assistant_short_name !== ${cdpString(target.shortName)}) invalid.push('assistant_short_name');
    if (route.source !== 'opl_app_home') invalid.push('source');
    if (matched.type !== 'acp') invalid.push('conversation_type');
    if (matched.extra?.backend !== 'codex') invalid.push('backend');
    if (invalid.length > 0) {
      throw new Error(\`Invalid OPL assistant route receipt for ${target.id}: \${invalid.join(', ')} \${JSON.stringify({ type: matched.type, extra: matched.extra })}\`);
    }
    return {
      status: 'passed',
      conversation_id: matched.id,
      conversation_type: matched.type,
      backend: matched.extra.backend,
      route,
    };
  })()`;
}

function latestConversationRouteReceiptExpression(target) {
  return conversationRouteReceiptExpression(target);
}

function firstRunBeginnerUxExpression() {
  return `(() => {
    const windowNode = document.querySelector('[data-testid="opl-first-run-window"]');
    const progressNode = document.querySelector('[data-testid="opl-first-run-progress"]');
    const primaryNode = document.querySelector('[data-testid="opl-first-run-beginner-primary"]');
    const summaryNode = document.querySelector('[data-testid="opl-first-run-beginner-summary"]');
    const actionNode = document.querySelector('[data-testid="opl-first-run-primary-action"]');
    const detailsNode = document.querySelector('[data-testid="opl-first-run-technical-details-toggle"]');
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const primaryText = primaryNode?.innerText || '';
    const bodyText = document.body?.innerText || '';
    const deniedPatterns = [
      /settings\\.firstRun\\.stage/,
      /full_readiness/,
      /setup_flow/,
      /overall_state/,
      /action_command_ref/,
      /settings\\.firstRun\\.beginner\\.backgroundMaintenanceWithCount/,
      /后台维护|Background maintenance/,
      /opl system initialize/,
      /runtime command failed/i,
      /\\{\\s*"/,
    ];
    const leakedPrimaryText = deniedPatterns
      .map((pattern) => pattern.exec(primaryText)?.[0])
      .filter(Boolean);
    const detailsExpanded =
      detailsNode?.getAttribute('aria-expanded') === 'true' ||
      detailsNode?.querySelector('[aria-expanded="true"]') ||
      /settings\\.firstRun\\.maintenance\\.title|Maintenance actions|维护操作/.test(bodyText);
    return windowNode && progressNode && primaryNode && summaryNode && actionNode && detailsNode && !appLoaderVisible
      && visible(windowNode)
      && visible(progressNode)
      && visible(primaryNode)
      && visible(summaryNode)
      && visible(actionNode)
      && visible(detailsNode)
      && summaryNode.textContent.trim().length > 0
      && leakedPrimaryText.length === 0
      && !detailsExpanded
      ? {
          hash: window.location.hash,
          beginnerPrimaryVisible: true,
          summaryText: summaryNode.textContent.trim(),
          primaryTextLength: primaryText.length,
          technicalDetailsCollapsed: true,
        }
      : false;
  })()`;
}

async function captureCdpScreenshot(client, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!screenshot?.data) {
    throw new Error(`CDP screenshot capture returned no data: ${target}`);
  }
  fs.writeFileSync(target, Buffer.from(screenshot.data, 'base64'));
}

async function waitForGuidEntryViaCdp(options, secret) {
  const target = await waitForCdpPageTarget(options.cdpPort, cdpProbeTimeoutMs(options));
  const client = await openCdpClient(target.webSocketDebuggerUrl);
  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const firstRunBeginnerUx = await waitForCdpPredicate(
      client,
      firstRunBeginnerUxExpression(),
      options.timeoutMs,
      'OPL first-run beginner screen did not expose the simplified primary layout'
    );
    writeJsonArtifact(path.join(options.artifacts, 'first-run-beginner-ux.json'), firstRunBeginnerUx, secret);
    await captureCdpScreenshot(client, path.join(options.artifacts, 'first-run-beginner.png'));
    const state = await waitForCdpPredicate(
      client,
      guidEntryNavigationExpression(),
      options.timeoutMs,
      'OPL Guid entry did not become ready in the packaged app'
    );
    return { state, firstRunBeginnerUx, labels: [DEFAULT_LABELS.guidEntry] };
  } finally {
    client.close();
  }
}

async function waitForUsableGuidEntry(options, secret) {
  const started = Date.now();
  try {
    writeSmokeEventSafely(options.writeSmokeEvent, 'wait_guid_cdp', 'started', {
      timeout_ms: cdpProbeTimeoutMs(options),
      cdp_port: options.cdpPort,
    });
    const cdp = await waitForGuidEntryViaCdp(options, secret);
    writeSmokeEventSafely(options.writeSmokeEvent, 'wait_guid_cdp', 'passed', {
      duration_ms: Date.now() - started,
    });
    return {
      mode: 'cdp',
      labels: cdp.labels,
      tree: [],
      cdpState: cdp.state,
      firstRunBeginnerUx: cdp.firstRunBeginnerUx,
    };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const fallbackTimeoutMs = remainingGuidFallbackTimeoutMs(options.timeoutMs, elapsedMs);
    writeSmokeEventSafely(options.writeSmokeEvent, 'wait_guid_cdp', 'failed', {
      duration_ms: elapsedMs,
      fallback_timeout_ms: fallbackTimeoutMs,
      error: error instanceof Error ? error.message : String(error),
    });
    if (fallbackTimeoutMs <= 0) {
      throw error;
    }
    return await runSmokePhase(
      options.writeSmokeEvent,
      'wait_guid_accessibility',
      async () => {
        const accessibility = await waitForGuidEntry(options.processName, fallbackTimeoutMs);
        return {
          mode: 'accessibility_fallback',
          labels: accessibility.labels,
          tree: accessibility.tree,
          cdpError: error instanceof Error ? error.message : String(error),
        };
      },
      {
        timeout_ms: fallbackTimeoutMs,
      }
    );
  }
}

function fetchJsonFromLocalhost(port, requestPath, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
        timeout: timeoutMs,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
            reject(new Error(`CDP HTTP ${requestPath} returned ${response.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out reading CDP ${requestPath}`));
    });
    request.on('error', reject);
  });
}

async function waitForCdpPageTarget(port, timeoutMs) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await fetchJsonFromLocalhost(port, '/json/list');
      const pageTarget = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (pageTarget) {
        return pageTarget;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(
    `Timed out waiting for packaged app CDP target on port ${port}: ${lastError?.message ?? 'no target'}`
  );
}

function waitForWebSocketOpen(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out opening CDP websocket')), 10_000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('Failed to open CDP websocket'));
      },
      { once: true }
    );
  });
}

async function openCdpClient(webSocketDebuggerUrl) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('This Node.js runtime does not expose global WebSocket, which is required for CDP settings smoke.');
  }
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      callbacks.reject(new Error(`${message.error.message || 'CDP error'} ${message.error.data || ''}`.trim()));
      return;
    }
    callbacks.resolve(message.result);
  });

  await waitForWebSocketOpen(socket);

  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(`Timed out waiting for CDP response: ${method}`));
        }, 15_000);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluateCdp(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'CDP evaluation failed';
    throw new Error(detail);
  }
  return result.result?.value;
}

async function waitForCdpPredicate(client, expression, timeoutMs, failureMessage) {
  const started = Date.now();
  let lastValue = null;
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastValue = await evaluateCdp(client, expression);
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(
    [
      failureMessage,
      lastError ? `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '',
      lastValue ? `Last value: ${JSON.stringify(lastValue).slice(0, 500)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
}

const SETTINGS_PAGE_SMOKE_TARGETS = [
  {
    id: 'overview',
    hash: '#/settings/overview',
    requiredTextAny: [
      ['One Person Lab'],
      ['Open Runtime Status', '打开运行状态'],
      ['Open Runtime Settings', '打开运行设置'],
    ],
  },
  {
    id: 'runtime',
    hash: '#/settings/runtime',
    requiredTextAny: [['Runtime', '运行'], ['Codex CLI'], ['Temporal'], ['Foundry Modules', '智能体模块']],
  },
  { id: 'capabilities', hash: '#/settings/capabilities', requiredTextAny: [['Capabilities', '能力']] },
  {
    id: 'access',
    hash: '#/settings/access',
    requiredTextAny: [
      ['Access', '访问'],
      ['WebUI', '远程连接'],
    ],
  },
  {
    id: 'appearance',
    hash: '#/settings/appearance',
    requiredTextAny: [
      ['Theme', '主题'],
      ['Codex Theme', 'Codex 主题'],
    ],
  },
  { id: 'system', hash: '#/settings/system', requiredTextAny: [['OPL Developer Mode', 'OPL 开发者模式']] },
  { id: 'about', hash: '#/settings/about', requiredTextAny: [['One Person Lab']] },
];

function cdpString(value) {
  return JSON.stringify(value);
}

function pageReadinessExpression(target) {
  return `(() => {
    const text = document.body?.innerText || '';
    const navItem = document.querySelector('.settings-sider__item[data-settings-id=${cdpString(target.id)}]');
    const requiredTextAny = ${JSON.stringify(target.requiredTextAny)};
    const missingText = requiredTextAny.filter((items) => !items.some((item) => text.includes(item)));
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    const firstRunWindowVisible = Boolean(document.querySelector('[data-testid="opl-first-run-window"]'));
    const hashOk = window.location.hash.startsWith(${cdpString(target.hash)});
    return hashOk && navItem && text.length > 80 && missingText.length === 0 && !appLoaderVisible && !firstRunWindowVisible
      ? {
          id: ${cdpString(target.id)},
          hash: window.location.hash,
          textLength: text.length,
          requiredTextAny,
        }
      : false;
  })()`;
}

function visibleRuntimeRefreshButtonExpression(labelPattern = 'Refresh|刷新') {
  return `function findVisibleRuntimeRefreshButton(labelPattern) {
    const matchesLabel = labelPattern instanceof RegExp
      ? (value) => labelPattern.test(value)
      : (value) => new RegExp(labelPattern).test(value);
    return [...document.querySelectorAll('main button, [class*="settings"] button, [class*="runtime"] button, button')]
      .filter((candidate) => {
        const text = candidate.textContent || '';
        if (!matchesLabel(text)) return false;
        if (candidate.closest('.arco-message, .arco-notification')) return false;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })[0] || null;
  }`;
}

function runtimeStatusReadinessExpression() {
  return `(() => {
    if (!window.location.hash.startsWith('#/runtime')) {
      window.location.hash = '#/runtime';
      return false;
    }
    const text = document.body?.innerText || '';
    const hashOk = window.location.hash.startsWith('#/runtime');
    const titleOk = /OPL Runtime Status|OPL 运行状态/.test(text);
    const summaryOk = /App\\/operator Drilldown|运行状态摘要/.test(text);
    const loadingOnly = /加载中|Loading/.test(text) && !summaryOk;
    return hashOk && titleOk && summaryOk && !loadingOnly
      ? {
          hash: window.location.hash,
          titleReady: titleOk,
          summaryReady: summaryOk,
        }
      : false;
  })()`;
}

async function captureSettingsPage(client, target, options, secret) {
  await evaluateCdp(client, `window.location.hash = ${cdpString(target.hash)}`);
  const pageState = await waitForCdpPredicate(
    client,
    pageReadinessExpression(target),
    30_000,
    `Settings page did not become ready: ${target.id}`
  );
  const screenshotPath = path.join(options.artifacts, 'settings-pages', `${target.id}.png`);
  await captureCdpScreenshot(client, screenshotPath);
  return pageState;
}

async function waitForButtonIdle(client, labels, failureMessage) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return await waitForCdpPredicate(
    client,
    `(() => {
      ${visibleRuntimeRefreshButtonExpression()}
      const button = findVisibleRuntimeRefreshButton(new RegExp(${cdpString(labelPattern)}));
      if (!button) return false;
      return !button.className.includes('arco-btn-loading') && !button.getAttribute('aria-busy')
        ? { buttonReady: true, className: button.className, text: button.textContent || '' }
        : false;
    })()`,
    30_000,
    failureMessage
  );
}

async function exerciseRuntimeRefresh(client, targetHash) {
  await evaluateCdp(client, `window.location.hash = ${cdpString(targetHash)}`);
  if (targetHash === '#/runtime') {
    await waitForCdpPredicate(
      client,
      runtimeStatusReadinessExpression(),
      30_000,
      'Runtime status page did not become ready before refresh'
    );
  }
  await waitForButtonIdle(
    client,
    ['Refresh', '刷新'],
    `Runtime refresh button stayed loading before click: ${targetHash}`
  );
  await evaluateCdp(
    client,
    `(() => {
      ${visibleRuntimeRefreshButtonExpression()}
      const button = findVisibleRuntimeRefreshButton(/Refresh|刷新/);
      if (!button) throw new Error('Runtime Refresh button was not found');
      button.click();
      return true;
    })()`
  );
  return await waitForButtonIdle(
    client,
    ['Refresh', '刷新'],
    `Runtime refresh button stayed loading after click: ${targetHash}`
  );
}

function developerModeStatusExpression() {
  return `(() => {
      const row = document.querySelector('[data-testid="opl-developer-mode-row"]');
      const status = document.querySelector('[data-testid="opl-developer-mode-status"]');
      const text = document.body?.innerText || '';
      if (!row || !status || !/OPL Developer Mode|OPL 开发者模式/.test(text)) return false;
      const rowText = row.textContent || '';
      const machineStatusPattern = /\\b(blocked|developer_apply_safe|direct_repo_fix|fork_pull_request|active_direct|active_pr_only)\\b|Status:|Mode:|Route:|GitHub:|状态：|模式：|路由：|GitHub：/;
      if (machineStatusPattern.test(rowText)) {
        throw new Error(\`OPL Developer Mode row exposed machine status: \${rowText.slice(0, 220)}\`);
      }
      const statusText = (status.textContent || '').trim();
      return statusText.length > 0
        ? {
            developerModeVisible: true,
            statusText,
            rowText,
          }
        : false;
    })()`;
}

async function assertDeveloperModeStatus(client) {
  return await waitForCdpPredicate(
    client,
    developerModeStatusExpression(),
    30_000,
    'System Settings did not expose the OPL Developer Mode status'
  );
}

async function runSettingsSmoke(options, secret) {
  const target = await waitForCdpPageTarget(options.cdpPort, options.timeoutMs);
  const client = await openCdpClient(target.webSocketDebuggerUrl);
  const results = [];
  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    for (const pageTarget of SETTINGS_PAGE_SMOKE_TARGETS) {
      const pageState = await captureSettingsPage(client, pageTarget, options, secret);
      const interactions = {};
      if (pageTarget.id === 'runtime') {
        interactions.settingsRuntimeRefresh = await exerciseRuntimeRefresh(client, '#/settings/runtime');
      }
      if (pageTarget.id === 'system') {
        interactions.developerMode = await assertDeveloperModeStatus(client);
      }
      results.push({ ...pageState, interactions });
    }
    results.push({
      id: 'runtime-status',
      hash: '#/runtime',
      interactions: {
        runtimeRefresh: await exerciseRuntimeRefresh(client, '#/runtime'),
      },
    });
  } finally {
    client.close();
  }
  writeJsonArtifact(
    path.join(options.artifacts, 'settings-smoke-summary.json'),
    {
      surface_id: 'opl_packaged_gui_settings_smoke',
      status: 'passed',
      cdp_port: options.cdpPort,
      pages: results,
    },
    secret
  );
  return results;
}

async function runAssistantRouteSmoke(options, secret) {
  const target = await waitForCdpPageTarget(options.cdpPort, options.timeoutMs);
  const client = await openCdpClient(target.webSocketDebuggerUrl);
  const results = [];
  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    for (const assistantTarget of OPL_ASSISTANT_ROUTE_SMOKE_TARGETS) {
      await evaluateCdp(client, "window.location.hash = '#/guid'");
      await waitForCdpPredicate(
        client,
        guidEntryReadinessExpression(),
        30_000,
        `Guid page did not become ready before assistant route smoke: ${assistantTarget.id}`
      );
      const selected = await waitForCdpPredicate(
        client,
        homeAssistantRouteSelectionExpression(assistantTarget),
        30_000,
        `Could not select OPL built-in assistant: ${assistantTarget.id}`
      );
      if (selected?.status === 'failed') {
        throw new Error(`OPL built-in assistant selection leaked selectors: ${JSON.stringify(selected)}`);
      }
      const ready = await waitForCdpPredicate(
        client,
        homeAssistantRouteReadyExpression(assistantTarget),
        30_000,
        `Selected OPL built-in assistant did not expose the expected badge without selectors: ${assistantTarget.id}`
      );
      if (ready?.status === 'failed') {
        throw new Error(`Selected OPL built-in assistant leaked selectors: ${JSON.stringify(ready)}`);
      }
      await captureCdpScreenshot(
        client,
        path.join(options.artifacts, 'assistant-route-smoke', `${assistantTarget.id}-selected.png`)
      );
      const created = await waitForCdpPredicate(
        client,
        createAssistantRouteReceiptConversationExpression(assistantTarget),
        30_000,
        `Could not create OPL built-in assistant route receipt conversation: ${assistantTarget.id}`
      );
      const receipt = await waitForCdpPredicate(
        client,
        conversationRouteReceiptExpression(assistantTarget, created.conversation_id),
        45_000,
        `Created conversation did not expose the OPL assistant route receipt: ${assistantTarget.id}`
      );
      results.push({
        id: assistantTarget.id,
        badge: assistantTarget.badge,
        selected,
        ready,
        created,
        receipt,
      });
    }
  } finally {
    client.close();
  }
  const summary = {
    surface_id: 'opl_packaged_gui_assistant_route_smoke',
    status: 'passed',
    cdp_port: options.cdpPort,
    assistants: results,
  };
  writeJsonArtifact(path.join(options.artifacts, 'assistant-route-smoke-summary.json'), summary, secret);
  return results;
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
  const logRoots = [
    path.dirname(defaultFirstRunLogPath()),
    path.join(os.homedir(), 'Library', 'Logs', 'AionUi'),
    path.join(os.homedir(), 'Library', 'Logs', 'One Person Lab'),
  ];
  const seen = new Set();
  const targetDir = path.join(options.artifacts, 'app-logs');
  for (const logDir of logRoots) {
    if (seen.has(logDir) || !fs.existsSync(logDir)) continue;
    seen.add(logDir);
    fs.mkdirSync(targetDir, { recursive: true });
    const safeRootName = path.basename(logDir).replace(/[^A-Za-z0-9_.-]/g, '_');
    for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const source = path.join(logDir, entry.name);
      const target = path.join(targetDir, `${safeRootName}-${entry.name}`);
      copyTextFileIfExists(source, target, secret);
    }
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
  collectFileListing(
    path.join(os.homedir(), 'Library', 'Application Support', 'AionUi'),
    path.join(options.artifacts, 'aionui-app-support-files.txt')
  );
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

  captureMacScreenArtifact(path.join(options.artifacts, 'failure-first-launch.png'));
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
  const writeSmokeEvent = createSmokeEventWriter(options.artifacts, codexApiKey);
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    writeSmokeEventSafely(writeSmokeEvent, 'preflight', 'started', {
      runtime_profile: options.runtimeProfile,
      settings_smoke: options.settingsSmoke,
      cdp_port: options.cdpPort,
      assert_clean: options.assertClean,
    });
    if (options.assertClean) {
      await runSmokePhase(writeSmokeEvent, 'assert_clean_state', () => assertCleanFirstRunState(options.processName));
    }
    writeSmokeEventSafely(writeSmokeEvent, 'preflight', 'passed');

    const appPath = await runSmokePhase(
      writeSmokeEvent,
      options.dmg ? 'install_dmg' : 'resolve_app',
      () => (options.dmg ? installDmgApp(options.dmg, options.installDir) : options.app),
      {
        dmg: options.dmg,
        install_dir: options.installDir,
      }
    );
    if (!fs.existsSync(appPath)) throw new Error(`App bundle does not exist: ${appPath}`);

    if (shouldTerminateExistingApp()) {
      await runSmokePhase(
        writeSmokeEvent,
        'terminate_existing_app',
        async () => {
          terminateExistingApp(options.processName);
          await sleep(2_000);
        },
        {
          process_name: options.processName,
          cdp_port: options.cdpPort,
        }
      );
    }
    const launchStartedAtMs = Date.now() - 1_000;
    await runSmokePhase(writeSmokeEvent, 'launch_app', () => launchApp(appPath, options), {
      app_path: appPath,
      cdp_port: options.cdpPort,
    });
    const firstRunLog = defaultFirstRunLogPath();
    let firstRun = null;
    let guidEntry = null;
    let coreFirstLaunch = null;
    if (shouldProbeExistingGuidEntryBeforeFirstRun(options)) {
      try {
        guidEntry = await runSmokePhase(
          writeSmokeEvent,
          'wait_guid_existing_state_probe',
          () =>
            waitForUsableGuidEntry({
              ...options,
              timeoutMs: existingStateGuidProbeTimeoutMs(options),
              writeSmokeEvent,
            }),
          {
            timeout_ms: existingStateGuidProbeTimeoutMs(options),
          }
        );
        firstRun = {
          events: readFirstRunEvents(firstRunLog, launchStartedAtMs),
          sawCodexWizard: false,
          submittedCodexWizard: false,
          existingLaunchFallback: true,
        };
      } catch (_) {
        firstRun = null;
      }
    }
    if (!guidEntry && shouldWaitForCoreFirstLaunchReady(options)) {
      coreFirstLaunch = await waitForCoreFirstLaunchReady(options, codexApiKey);
      writeTextArtifact(
        path.join(options.artifacts, 'system-initialize.json'),
        coreFirstLaunch.systemInitializeRaw,
        codexApiKey
      );
    }
    if (!firstRun && shouldWaitForFirstRunCompletion(options)) {
      firstRun = await runSmokePhase(
        writeSmokeEvent,
        'wait_first_run_completion',
        () =>
          waitForFirstRunCompletion(
            firstRunLog,
            options.processName,
            options.timeoutMs,
            codexApiKey,
            options.artifacts,
            launchStartedAtMs
          ),
        {
          timeout_ms: options.timeoutMs,
        }
      );
    }
    if (coreFirstLaunch) {
      firstRun = {
        ...(firstRun ?? {
          events: readFirstRunEvents(firstRunLog, launchStartedAtMs),
          existingLaunchFallback: false,
        }),
        sawCodexWizard: Boolean(firstRun?.sawCodexWizard || coreFirstLaunch.sawCodexWizard),
        submittedCodexWizard: Boolean(firstRun?.submittedCodexWizard || coreFirstLaunch.submittedCodexWizard),
        coreFirstLaunchReady: true,
      };
    }
    firstRun = firstRun ?? {
      events: readFirstRunEvents(firstRunLog, launchStartedAtMs),
      sawCodexWizard: false,
      submittedCodexWizard: false,
      existingLaunchFallback: false,
    };
    if (options.requireCodexConfigWizard && !firstRun.submittedCodexWizard) {
      throw new Error('Expected Codex configuration wizard to appear and be submitted, but it was not observed.');
    }

    guidEntry =
      guidEntry ??
      (await runSmokePhase(
        writeSmokeEvent,
        'wait_guid_entry',
        () => waitForUsableGuidEntry({ ...options, writeSmokeEvent }, codexApiKey),
        {
          timeout_ms: options.timeoutMs,
          cdp_probe_timeout_ms: cdpProbeTimeoutMs(options),
        }
      ));
    if (guidEntry.tree.length > 0) {
      writeJsonArtifact(path.join(options.artifacts, 'accessibility-tree.json'), guidEntry.tree, codexApiKey);
    }
    if (guidEntry.cdpState) {
      writeJsonArtifact(path.join(options.artifacts, 'guid-entry-cdp.json'), guidEntry.cdpState, codexApiKey);
    }

    const settingsSmoke = options.settingsSmoke
      ? await runSmokePhase(writeSmokeEvent, 'settings_smoke', () => runSettingsSmoke(options, codexApiKey), {
          timeout_ms: options.timeoutMs,
        })
      : [];
    const assistantRouteSmoke = options.assistantRouteSmoke
      ? await runSmokePhase(
          writeSmokeEvent,
          'assistant_route_smoke',
          () => runAssistantRouteSmoke(options, codexApiKey),
          {
            timeout_ms: options.timeoutMs,
          }
        )
      : [];

    if (fs.existsSync(firstRunLog)) {
      writeTextArtifact(
        path.join(options.artifacts, 'first-run.jsonl'),
        fs.readFileSync(firstRunLog, 'utf8'),
        codexApiKey
      );
    }

    if (shouldVerifyFullFirstRunEquivalence(options.runtimeProfile)) {
      const { systemInitializeRaw, modulesRaw } = await runSmokePhase(
        writeSmokeEvent,
        'full_runtime_equivalence',
        () => waitForFullFirstRunEquivalence(options.timeoutMs),
        {
          timeout_ms: options.timeoutMs,
        }
      );
      writeTextArtifact(path.join(options.artifacts, 'system-initialize.json'), systemInitializeRaw, codexApiKey);
      writeTextArtifact(path.join(options.artifacts, 'modules.json'), modulesRaw, codexApiKey);
    }
    captureMacScreenArtifact(path.join(options.artifacts, 'first-launch.png'));
    const unifiedLogPath = path.join(options.artifacts, 'unified-log.txt');
    captureUnifiedLog(options.processName, unifiedLogPath);
    assertDoesNotContainSecret(
      'unified-log.txt',
      fs.existsSync(unifiedLogPath) ? fs.readFileSync(unifiedLogPath, 'utf8') : '',
      codexApiKey
    );

    const summary = {
      surface_id: 'opl_packaged_gui_first_run_smoke',
      status: 'passed',
      app_path: appPath,
      artifacts: options.artifacts,
      runtime_profile: options.runtimeProfile,
      core_first_launch: coreFirstLaunch
        ? summarizeCoreFirstLaunch(coreFirstLaunch.systemInitializeRaw)
        : {
            source: 'existing_guid_entry_probe',
            status: guidEntry ? 'ready' : 'not_checked',
          },
      gui_ready: guidEntry.cdpState ?? {
        mode: guidEntry.mode,
        labels: guidEntry.labels,
      },
      first_run_beginner_ux: guidEntry.firstRunBeginnerUx ?? null,
      codex_config_wizard_seen: firstRun.sawCodexWizard,
      codex_config_wizard_submitted: firstRun.submittedCodexWizard,
      codex_api_key_present: Boolean(codexApiKey),
      existing_launch_fallback: firstRun.existingLaunchFallback === true,
      guid_entry_probe: guidEntry.mode,
      labels: guidEntry.labels,
      settings_smoke: options.settingsSmoke
        ? {
            status: 'passed',
            pages: settingsSmoke.map((page) => page.id),
          }
        : null,
      assistant_route_smoke: options.assistantRouteSmoke
        ? {
            status: 'passed',
            assistants: assistantRouteSmoke.map((assistant) => assistant.id),
          }
        : null,
    };
    writeJsonArtifact(path.join(options.artifacts, 'smoke-summary.json'), summary, codexApiKey);
    writeSmokeEventSafely(writeSmokeEvent, 'summary', 'passed', {
      runtime_profile: options.runtimeProfile,
      guid_entry_probe: guidEntry.mode,
      settings_smoke: summary.settings_smoke?.status ?? null,
      assistant_route_smoke: summary.assistant_route_smoke?.status ?? null,
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    writeSmokeEventSafely(writeSmokeEvent, 'summary', 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    collectFailureArtifacts(options, codexApiKey);
    throw error;
  }
}

export const __test =
  process.env.NODE_ENV === 'test'
    ? {
        buildFullRuntimeCommandPrefix,
        assertFullFirstRunEquivalence,
        assertFullCompanionSkillPayloads,
        captureMacScreenArtifact,
        findLatestFullRuntimeHome,
        isFirstRunCompletionEvent,
        isMainModule,
        runtimeShellExecutable,
        eventTimestampMs,
        shouldProbeExistingGuidEntryBeforeFirstRun,
        cdpProbeTimeoutMs,
        createSmokeEventWriter,
        existingStateGuidProbeTimeoutMs,
        remainingGuidFallbackTimeoutMs,
        shouldWaitForFirstRunCompletion,
        waitForFullFirstRunEquivalence,
        shouldWaitForCoreFirstLaunchReady,
        waitForCoreFirstLaunchReady,
        summarizeCoreFirstLaunch,
        parseSystemInitialize,
        guidEntryReadinessExpression,
        guidEntryNavigationExpression,
        firstRunBeginnerUxExpression,
        firstRunAccessibilityExpectedLabels,
        runOplJson,
        buildLaunchAppArgs,
        shouldTerminateExistingApp,
        SETTINGS_PAGE_SMOKE_TARGETS,
        OPL_ASSISTANT_ROUTE_SMOKE_TARGETS,
        developerModeStatusExpression,
        visibleRuntimeRefreshButtonExpression,
        runtimeStatusReadinessExpression,
        shouldVerifyFullFirstRunEquivalence,
        visibleHomeAssistantControlSelector,
        homeAssistantRouteSelectionExpression,
        homeAssistantRouteReadyExpression,
        homeAssistantRouteSendExpression,
        createAssistantRouteReceiptConversationExpression,
        conversationRouteReceiptExpression,
        latestConversationRouteReceiptExpression,
      }
    : undefined;

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

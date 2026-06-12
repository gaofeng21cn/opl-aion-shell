#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_GUEST_USER = process.env.OPL_FIRST_RUN_GUEST_USER || 'runner';
const DEFAULT_GUEST_NODE_VERSION = process.env.OPL_FIRST_RUN_GUEST_NODE_VERSION || '22.21.1';
const SCRIPT_DIR = path.dirname(fs.realpathSync(new URL(import.meta.url)));
const GUEST_SMOKE_SCRIPT_PATH = path.join(SCRIPT_DIR, 'opl-first-run-vm-smoke.mjs');
const SIGNAL_EXIT_CODES = new Map([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]);
const GUEST_SMOKE_HOST_TIMEOUT_GRACE_MS = 120_000;
const SMOKE_PROFILES = new Map([
  [
    'full-gate',
    {
      runtimeProfile: 'full',
      settingsSmoke: false,
    },
  ],
  [
    'no-clt-clean-vm',
    {
      runtimeProfile: 'standard',
      settingsSmoke: true,
      display: '1920x1080px',
    },
  ],
  [
    'homebrew-standard-cask',
    {
      runtimeProfile: 'standard',
      settingsSmoke: true,
      display: '1920x1080px',
      installMode: 'homebrew-cask',
      homebrewCask: 'one-person-lab',
    },
  ],
]);
const HOMEBREW_CONFLICTING_CASKS = new Map([
  ['one-person-lab', ['one-person-lab-full', 'one-person-lab-nightly']],
  ['one-person-lab-full', ['one-person-lab', 'one-person-lab-nightly']],
  ['one-person-lab-nightly', ['one-person-lab', 'one-person-lab-full']],
]);
const STAGE_TIMING_SLOWEST_LIMIT = 5;

const runtimeState = {
  options: null,
  stage: 'starting',
  stageEvents: [],
  vmLogPath: '',
  tartProcess: null,
  currentChild: null,
  codexApiKeyFile: null,
  ip: '',
  guestArtifactDir: '',
  guestNodeStaging: null,
  copiedArtifacts: false,
  cleanupStarted: false,
};

function usage() {
  process.stdout.write(`Usage:
  node scripts/opl-first-run-tart-smoke.mjs --source-vm macos-clean --dmg ./release/One-Person-Lab.dmg

Options:
  --source-vm <name>       Tart clean snapshot/base VM. Defaults to OPL_FIRST_RUN_TART_SOURCE.
  --dmg <path>             Release DMG on the host.
  --guest-user <name>      SSH user in the guest. Default: ${DEFAULT_GUEST_USER}.
  --ssh-key <path>         SSH private key. Defaults to OPL_FIRST_RUN_GUEST_SSH_KEY.
  --vm-name <name>         Temporary VM name. Default: opl-first-run-<timestamp>.
  --artifacts <path>       Host artifact output directory. Default: ./artifacts/opl-first-run-tart-<timestamp>.
  --guest-workdir <path>   Guest working directory. Default: /tmp/opl-first-run-smoke.
  --process-name <name>    macOS process name. Default: One Person Lab.
  --timeout-ms <n>         VM boot and SSH timeout. Default: 600000.
  --smoke-timeout-ms <n>   Guest GUI smoke timeout. Default: 180000.
  --display <resolution>   Tart display resolution, for example 1920x1080px. Default: 1920x1080px.
  --smoke-profile <name>   Host-side smoke profile: full-gate or no-clt-clean-vm. Default: full-gate.
  --settings-smoke         After first launch, run packaged Settings page smoke checks in the guest.
  --assistant-route-smoke  Verify MAS/MAG/RCA App-home assistant route receipts in the guest.
  --codex-functional-check
                           Generate and require the guest Codex functional check receipt.
                           This implies --assistant-route-smoke and does not call an LLM.
  --codex-ai-self-check
                           Generate a non-blocking guest Codex AI self-check receipt after
                           deterministic initialization and Codex functional checks.
                           This implies --codex-functional-check.
  --codex-ai-self-check-mode <mode>
                           Codex AI self-check mode: diagnose or fix. Default: diagnose.
  --codex-ai-self-check-timeout-ms <n>
                           Codex AI self-check timeout. Default: 120000.
  --cdp-port <n>           CDP port used by packaged GUI smoke probes. Default: 9230.
  --runtime-profile <profile>
                           First-run package profile to verify: full or standard. Default: full.
                           Use standard for the public macOS app DMG when Full-only bundled
                           module/skill equivalence is not expected.
  --install-mode <mode>     Install mode: dmg or homebrew-cask. Default: dmg.
  --homebrew-tap <tap>      Homebrew tap for --install-mode homebrew-cask. Default: gaofeng21cn/one-person-lab.
  --homebrew-cask <name>    Homebrew cask to install. Default: one-person-lab.
  --require-codex-config-wizard
                           Fail unless the guest smoke sees and submits the Codex config wizard.
                           Defaults to false; Full gates still require Codex readiness through
                           opl system initialize and Full runtime equivalence.
  --no-require-codex-config-wizard
                           Do not require the Codex config wizard even when runtime-profile is full.
  --guide-screenshots      Accept the release workflow guide screenshot toggle as a host-side flag.
  --codex-api-key-file <path>
                           Optional host file containing the test Codex API key.
                           If omitted, an ephemeral non-secret smoke key is generated.
  --guest-node-root <path> Copy a host Node.js runtime directory into the guest workdir and use it for the smoke.
  --guest-node-command <cmd>
                           Existing Node.js command in the guest. Skips Node download/probe install.
  --framework-source-archive <path>
                           Optional current-source OPL Framework tar.gz to inject into the packaged app bootstrap.
                           This marks the smoke as current-source evidence, not published release evidence.
  --framework-install-script <path>
                           Optional current-source Framework install.sh paired with --framework-source-archive.
                           The packaged app receives it through OPL_INSTALL_SCRIPT_URL=file://... .
  --dry-run                Resolve arguments and write a host plan without cloning or starting Tart.
  --no-graphics            Start Tart with --no-graphics. Use only for images with a logged-in GUI session.
  --keep-vm                Leave the temporary VM running for debugging.
  --help                   Show this message.
`);
}

function parseArgs(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options = {
    sourceVm: process.env.OPL_FIRST_RUN_TART_SOURCE || '',
    dmg: '',
    guestUser: DEFAULT_GUEST_USER,
    sshKey: process.env.OPL_FIRST_RUN_GUEST_SSH_KEY || '',
    vmName: `opl-first-run-${stamp}`,
    artifacts: path.resolve('artifacts', `opl-first-run-tart-${stamp}`),
    guestWorkdir: '/tmp/opl-first-run-smoke',
    processName: 'One Person Lab',
    timeoutMs: 600_000,
    smokeTimeoutMs: 180_000,
    display: '1920x1080px',
    smokeProfile: 'full-gate',
    settingsSmoke: false,
    assistantRouteSmoke: false,
    codexFunctionalCheck: false,
    codexAiSelfCheck: false,
    codexAiSelfCheckMode: 'diagnose',
    codexAiSelfCheckTimeoutMs: 120_000,
    cdpPort: 9230,
    runtimeProfile: 'full',
    installMode: 'dmg',
    homebrewTap: 'gaofeng21cn/one-person-lab',
    homebrewCask: 'one-person-lab',
    requireCodexConfigWizard: null,
    codexApiKeyFile: process.env.OPL_FIRST_RUN_CODEX_API_KEY_FILE || '',
    guestNodeRoot: '',
    guestNodeCommand: '',
    frameworkSourceArchive: '',
    frameworkInstallScript: '',
    guideScreenshots: false,
    dryRun: false,
    noGraphics: false,
    keepVm: false,
  };
  const explicit = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      usage();
      process.exit(0);
    }
    if (arg === '--no-graphics') {
      options.noGraphics = true;
      explicit.add('noGraphics');
      continue;
    }
    if (arg === '--keep-vm') {
      options.keepVm = true;
      explicit.add('keepVm');
      continue;
    }
    if (arg === '--settings-smoke') {
      options.settingsSmoke = true;
      explicit.add('settingsSmoke');
      continue;
    }
    if (arg === '--assistant-route-smoke') {
      options.assistantRouteSmoke = true;
      explicit.add('assistantRouteSmoke');
      continue;
    }
    if (arg === '--codex-functional-check') {
      options.codexFunctionalCheck = true;
      options.assistantRouteSmoke = true;
      explicit.add('codexFunctionalCheck');
      explicit.add('assistantRouteSmoke');
      continue;
    }
    if (arg === '--codex-ai-self-check') {
      options.codexAiSelfCheck = true;
      options.codexFunctionalCheck = true;
      options.assistantRouteSmoke = true;
      explicit.add('codexAiSelfCheck');
      explicit.add('codexFunctionalCheck');
      explicit.add('assistantRouteSmoke');
      continue;
    }
    if (arg === '--require-codex-config-wizard') {
      options.requireCodexConfigWizard = true;
      explicit.add('requireCodexConfigWizard');
      continue;
    }
    if (arg === '--no-require-codex-config-wizard') {
      options.requireCodexConfigWizard = false;
      explicit.add('requireCodexConfigWizard');
      continue;
    }
    if (arg === '--guide-screenshots') {
      options.guideScreenshots = true;
      explicit.add('guideScreenshots');
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      explicit.add('dryRun');
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    index += 1;
    if (arg === '--source-vm') {
      options.sourceVm = value;
      explicit.add('sourceVm');
    } else if (arg === '--dmg') {
      options.dmg = path.resolve(value);
      explicit.add('dmg');
    } else if (arg === '--guest-user') {
      options.guestUser = value;
      explicit.add('guestUser');
    } else if (arg === '--ssh-key') {
      options.sshKey = path.resolve(value);
      explicit.add('sshKey');
    } else if (arg === '--vm-name') {
      options.vmName = value;
      explicit.add('vmName');
    } else if (arg === '--artifacts') {
      options.artifacts = path.resolve(value);
      explicit.add('artifacts');
    } else if (arg === '--guest-workdir') {
      options.guestWorkdir = value;
      explicit.add('guestWorkdir');
    } else if (arg === '--process-name') {
      options.processName = value;
      explicit.add('processName');
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(value);
      explicit.add('timeoutMs');
    } else if (arg === '--smoke-timeout-ms') {
      options.smokeTimeoutMs = Number(value);
      explicit.add('smokeTimeoutMs');
    } else if (arg === '--display') {
      options.display = value;
      explicit.add('display');
    } else if (arg === '--smoke-profile') {
      options.smokeProfile = value;
      explicit.add('smokeProfile');
    } else if (arg === '--cdp-port') {
      options.cdpPort = Number(value);
      explicit.add('cdpPort');
    } else if (arg === '--runtime-profile') {
      options.runtimeProfile = value;
      explicit.add('runtimeProfile');
    } else if (arg === '--install-mode') {
      options.installMode = value;
      explicit.add('installMode');
    } else if (arg === '--homebrew-tap') {
      options.homebrewTap = value;
      explicit.add('homebrewTap');
    } else if (arg === '--homebrew-cask') {
      options.homebrewCask = value;
      explicit.add('homebrewCask');
    } else if (arg === '--codex-ai-self-check-mode') {
      options.codexAiSelfCheckMode = value;
      explicit.add('codexAiSelfCheckMode');
    } else if (arg === '--codex-ai-self-check-timeout-ms') {
      options.codexAiSelfCheckTimeoutMs = Number(value);
      explicit.add('codexAiSelfCheckTimeoutMs');
    } else if (arg === '--codex-api-key-file') {
      options.codexApiKeyFile = path.resolve(value);
      explicit.add('codexApiKeyFile');
    } else if (arg === '--guest-node-root') {
      options.guestNodeRoot = path.resolve(value);
      explicit.add('guestNodeRoot');
    } else if (arg === '--guest-node-command') {
      options.guestNodeCommand = value;
      explicit.add('guestNodeCommand');
    } else if (arg === '--framework-source-archive') {
      options.frameworkSourceArchive = path.resolve(value);
      explicit.add('frameworkSourceArchive');
    } else if (arg === '--framework-install-script') {
      options.frameworkInstallScript = path.resolve(value);
      explicit.add('frameworkInstallScript');
    } else throw new Error(`Unsupported argument: ${arg}`);
  }

  const profile = SMOKE_PROFILES.get(options.smokeProfile);
  if (!profile) throw new Error(`--smoke-profile must be one of: ${Array.from(SMOKE_PROFILES.keys()).join(', ')}.`);
  for (const [key, value] of Object.entries(profile)) {
    if (!explicit.has(key)) options[key] = value;
  }
  if (!options.sourceVm) throw new Error('--source-vm or OPL_FIRST_RUN_TART_SOURCE is required.');
  if (!['dmg', 'homebrew-cask'].includes(options.installMode)) {
    throw new Error('--install-mode must be one of: dmg, homebrew-cask.');
  }
  if (options.installMode === 'dmg' && !options.dmg) throw new Error('--dmg is required for --install-mode dmg.');
  if (options.installMode === 'homebrew-cask' && !options.homebrewCask) {
    throw new Error('--homebrew-cask is required for --install-mode homebrew-cask.');
  }
  if (!options.dryRun && options.dmg && !fs.existsSync(options.dmg))
    throw new Error(`DMG does not exist: ${options.dmg}`);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (!Number.isFinite(options.smokeTimeoutMs) || options.smokeTimeoutMs <= 0) {
    throw new Error('--smoke-timeout-ms must be positive.');
  }
  if (!/^\d+x\d+(?:pt|px)?$/.test(options.display)) {
    throw new Error('--display must be a Tart display resolution like 1920x1080px.');
  }
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1024 || options.cdpPort > 65535) {
    throw new Error('--cdp-port must be an integer TCP port between 1024 and 65535.');
  }
  if (options.guestNodeRoot) {
    const nodeBin = path.join(options.guestNodeRoot, 'bin', 'node');
    if (!fs.existsSync(nodeBin)) {
      throw new Error(`--guest-node-root must contain bin/node: ${options.guestNodeRoot}`);
    }
    const realNodeBin = fs.realpathSync(nodeBin);
    options.guestNodeRoot = path.resolve(path.dirname(realNodeBin), '..');
  }
  if (options.frameworkSourceArchive && !options.dryRun && !fs.existsSync(options.frameworkSourceArchive)) {
    throw new Error(`Framework source archive does not exist: ${options.frameworkSourceArchive}`);
  }
  if (options.frameworkInstallScript && !options.frameworkSourceArchive) {
    throw new Error('--framework-install-script requires --framework-source-archive.');
  }
  if (options.frameworkInstallScript && !options.dryRun && !fs.existsSync(options.frameworkInstallScript)) {
    throw new Error(`Framework install script does not exist: ${options.frameworkInstallScript}`);
  }
  if (!['full', 'standard'].includes(options.runtimeProfile)) {
    throw new Error('--runtime-profile must be one of: full, standard.');
  }
  if (!['diagnose', 'fix'].includes(options.codexAiSelfCheckMode)) {
    throw new Error('--codex-ai-self-check-mode must be one of: diagnose, fix.');
  }
  if (!Number.isFinite(options.codexAiSelfCheckTimeoutMs) || options.codexAiSelfCheckTimeoutMs <= 0) {
    throw new Error('--codex-ai-self-check-timeout-ms must be positive.');
  }
  if (options.requireCodexConfigWizard === null) options.requireCodexConfigWizard = false;

  return options;
}

function buildDryRunPlan(options) {
  return {
    surface_id: 'opl_tart_gui_first_run_smoke_plan',
    status: 'dry_run',
    smoke_profile: options.smokeProfile,
    source_vm: options.sourceVm,
    vm_name: options.vmName,
    install_mode: options.installMode,
    dmg: options.dmg || null,
    homebrew_tap: options.homebrewTap,
    homebrew_cask: options.homebrewCask,
    homebrew_trusted_casks: homebrewTrustedCaskRefs(options),
    artifacts: options.artifacts,
    guest_workdir: options.guestWorkdir,
    display: options.display,
    settings_smoke: options.settingsSmoke,
    assistant_route_smoke: options.assistantRouteSmoke,
    codex_functional_check: options.codexFunctionalCheck,
    codex_ai_self_check: {
      requested: options.codexAiSelfCheck,
      mode: options.codexAiSelfCheckMode,
      blocking_release_gate: false,
    },
    cdp_port: options.settingsSmoke || options.assistantRouteSmoke ? options.cdpPort : null,
    runtime_profile: options.runtimeProfile,
    require_codex_config_wizard: options.requireCodexConfigWizard,
    guest_node_root: options.guestNodeRoot || null,
    guest_node_command: options.guestNodeCommand || null,
    guest_node_staging: guestNodeStagingPlan(options),
    framework_source_archive: frameworkSourceArchivePlan(options),
    guide_screenshots: options.guideScreenshots,
    no_graphics: options.noGraphics,
    keep_vm: options.keepVm,
  };
}

function hashDirectoryContents(root) {
  const hash = createHash('sha256');
  const visit = (relativeDir) => {
    const absoluteDir = path.join(root, relativeDir);
    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true }).sort((left, right) => {
      return left.name.localeCompare(right.name);
    });
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      const absolutePath = path.join(root, relativePath);
      const stats = fs.lstatSync(absolutePath);
      const normalizedPath = relativePath.split(path.sep).join('/');
      hash.update(`${normalizedPath}\0${stats.mode & 0o777}\0`);
      if (entry.isSymbolicLink()) {
        hash.update(`symlink\0${fs.readlinkSync(absolutePath)}\0`);
      } else if (entry.isDirectory()) {
        hash.update('directory\0');
        visit(relativePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${stats.size}\0`);
        hash.update(fs.readFileSync(absolutePath));
        hash.update('\0');
      } else {
        hash.update(`${entry.isBlockDevice() ? 'block' : entry.isCharacterDevice() ? 'char' : 'other'}\0`);
      }
    }
  };
  visit('');
  return hash.digest('hex');
}

function guestNodeStagingPlan(options) {
  if (!options.guestNodeRoot || options.guestNodeCommand) return null;
  const contentHash = hashDirectoryContents(options.guestNodeRoot);
  const cacheRoot = `${options.guestWorkdir}-node-cache`;
  const guestRoot = `${cacheRoot}/${contentHash}`;
  return {
    strategy: 'reuse_by_content_hash',
    host_path: options.guestNodeRoot,
    content_hash: contentHash,
    cache_root: cacheRoot,
    guest_root: guestRoot,
    guest_node_command: `${guestRoot}/bin/node`,
    cache_hit: null,
  };
}

function homebrewCaskToken(caskRef) {
  return caskRef.split('/').filter(Boolean).at(-1) || caskRef;
}

function homebrewQualifiedCaskRef(tap, caskTokenOrRef) {
  if (caskTokenOrRef.includes('/')) return caskTokenOrRef;
  return `${tap}/${caskTokenOrRef}`;
}

function homebrewTrustedCaskRefs(options) {
  if (options.installMode !== 'homebrew-cask') return [];
  const caskToken = homebrewCaskToken(options.homebrewCask);
  const relatedCasks = HOMEBREW_CONFLICTING_CASKS.get(caskToken) || [];
  return Array.from(
    new Set([
      homebrewQualifiedCaskRef(options.homebrewTap, options.homebrewCask),
      ...relatedCasks.map((relatedCask) => homebrewQualifiedCaskRef(options.homebrewTap, relatedCask)),
    ])
  );
}

function guestFrameworkSourceArchivePath(options) {
  if (!options.frameworkSourceArchive) return null;
  return `${options.guestWorkdir}/${path.basename(options.frameworkSourceArchive)}`;
}

function guestFrameworkInstallScriptPath(options) {
  if (!options.frameworkInstallScript) return null;
  return `${options.guestWorkdir}/opl-framework-install.sh`;
}

function frameworkSourceArchivePlan(options) {
  const guestPath = guestFrameworkSourceArchivePath(options);
  if (!options.frameworkSourceArchive || !guestPath) return null;
  const installScriptGuestPath = guestFrameworkInstallScriptPath(options);
  return {
    evidence_role: 'current_source_framework_archive',
    host_path: options.frameworkSourceArchive,
    guest_path: guestPath,
    install_script_host_path: options.frameworkInstallScript || null,
    install_script_guest_path: installScriptGuestPath,
    install_script_url: installScriptGuestPath ? `file://${installScriptGuestPath}` : null,
    install_source_mode: 'archive',
    source_archive_url: `file://${guestPath}`,
  };
}

function frameworkInstallScriptFinalizeCommand(options) {
  if (!options.frameworkInstallScript) return '';
  const copiedPath = `${options.guestWorkdir}/${path.basename(options.frameworkInstallScript)}`;
  const guestPath = guestFrameworkInstallScriptPath(options);
  return [`mv ${shellQuote(copiedPath)} ${shellQuote(guestPath)}`, `chmod +x ${shellQuote(guestPath)}`].join(' && ');
}

function prepareHostCodexApiKeyFile(options) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-codex-key-'));
  const keyPath = path.join(tempDir, 'codex-api-key.txt');
  if (options.codexApiKeyFile) {
    if (!fs.existsSync(options.codexApiKeyFile)) {
      throw new Error(`Codex API key file does not exist: ${options.codexApiKeyFile}`);
    }
    const key = fs.readFileSync(options.codexApiKeyFile, 'utf8').trim();
    if (!key) {
      throw new Error(`Codex API key file is empty: ${options.codexApiKeyFile}`);
    }
    fs.writeFileSync(keyPath, `${key}\n`, 'utf8');
    return { path: keyPath, temporary: true, tempDir };
  }

  fs.writeFileSync(keyPath, `opl-first-run-smoke-${randomUUID()}\n`, 'utf8');
  return { path: keyPath, temporary: true, tempDir };
}

function appendRuntimeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(`[tart-smoke] ${message}\n`);
  const options = runtimeState.options;
  if (!options) return;
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    fs.appendFileSync(
      path.join(options.artifacts, 'tart-smoke-events.jsonl'),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        event_type: 'host_runtime_event',
        stage: runtimeState.stage,
        message,
        vm_name: options.vmName,
        source_vm: options.sourceVm,
        guest_ip: runtimeState.ip || null,
      })}\n`,
      'utf8'
    );
  } catch (_) {
    // Best-effort diagnostics must not mask the real smoke failure.
  }
  if (!runtimeState.vmLogPath) return;
  try {
    fs.appendFileSync(runtimeState.vmLogPath, line, 'utf8');
  } catch (_) {
    // Best-effort diagnostics must not mask the real smoke failure.
  }
}

function recordStageEvent(stage, timestampMs = Date.now()) {
  runtimeState.stageEvents.push({
    stage,
    startedAtMs: timestampMs,
    startedAt: new Date(timestampMs).toISOString(),
  });
}

function buildStageTimingSummary(stageEvents = runtimeState.stageEvents, completedAtMs = Date.now()) {
  const events = Array.isArray(stageEvents)
    ? stageEvents
        .filter((event) => event && typeof event.stage === 'string' && Number.isFinite(event.startedAtMs))
        .sort((left, right) => left.startedAtMs - right.startedAtMs)
    : [];
  if (events.length === 0) {
    return {
      status: 'missing',
      stages: [],
      total_elapsed_ms: null,
      current_stage: runtimeState.stage,
      last_stage: null,
      guest_node_staging: runtimeState.guestNodeStaging,
      slowest_stages: [],
    };
  }
  const effectiveCompletedAtMs = Math.max(completedAtMs, events.at(-1).startedAtMs);
  const stages = events.map((event, index) => {
    const endedAtMs = events[index + 1]?.startedAtMs ?? effectiveCompletedAtMs;
    const durationMs = Math.max(0, endedAtMs - event.startedAtMs);
    return {
      stage: event.stage,
      started_at: event.startedAt,
      ended_at: new Date(endedAtMs).toISOString(),
      duration_ms: durationMs,
    };
  });
  return {
    status: 'available',
    total_elapsed_ms: Math.max(0, effectiveCompletedAtMs - events[0].startedAtMs),
    current_stage: runtimeState.stage,
    last_stage: events.at(-1).stage,
    guest_node_staging: runtimeState.guestNodeStaging,
    stages,
    slowest_stages: [...stages]
      .sort((left, right) => right.duration_ms - left.duration_ms)
      .slice(0, STAGE_TIMING_SLOWEST_LIMIT)
      .map(({ stage, duration_ms }) => ({ stage, duration_ms })),
  };
}

function setStage(stage) {
  recordStageEvent(stage);
  runtimeState.stage = stage;
  appendRuntimeLog(`stage=${stage}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
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

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runtimeState.currentChild = child;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutMessage = '';
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? Number(options.timeoutMs) : null;
    let timeoutTimer = null;
    let killTimer = null;
    const clearTimers = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
    };
    if (timeoutMs) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        timeoutMessage = `${options.label ?? `${command} ${args.join(' ')}`} timed out after ${timeoutMs}ms`;
        appendRuntimeLog(`child_timeout ${timeoutMessage}`);
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5_000);
      }, timeoutMs);
    }
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimers();
      if (runtimeState.currentChild === child) runtimeState.currentChild = null;
      reject(timedOut ? new Error(timeoutMessage) : error);
    });
    child.once('close', (code, signal) => {
      clearTimers();
      if (runtimeState.currentChild === child) runtimeState.currentChild = null;
      if (timedOut) {
        reject(new Error(`${timeoutMessage}; process exited with ${code ?? `signal ${signal}`}`));
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            [
              `${command} ${args.join(' ')} exited with ${code ?? `signal ${signal}`}`,
              stdout ? `stdout:\n${stdout}` : '',
              stderr ? `stderr:\n${stderr}` : '',
            ]
              .filter(Boolean)
              .join('\n')
          )
        );
        return;
      }
      resolve(stdout);
    });
  });
}

function guestSmokeHostTimeoutMs(options) {
  return options.smokeTimeoutMs + GUEST_SMOKE_HOST_TIMEOUT_GRACE_MS;
}

function runPipe(leftCommand, leftArgs, rightCommand, rightArgs) {
  return new Promise((resolve, reject) => {
    const left = spawn(leftCommand, leftArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    const right = spawn(rightCommand, rightArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    runtimeState.currentChild = right;
    left.stdout.pipe(right.stdin);
    let stderr = '';
    left.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    right.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const failures = [];
    left.once('error', (error) => failures.push(error));
    right.once('error', (error) => failures.push(error));
    left.once('close', (code, signal) => {
      if (code !== 0)
        failures.push(new Error(`${leftCommand} ${leftArgs.join(' ')} exited with ${code ?? `signal ${signal}`}`));
    });
    right.once('close', (code, signal) => {
      if (runtimeState.currentChild === right) runtimeState.currentChild = null;
      if (code !== 0)
        failures.push(new Error(`${rightCommand} ${rightArgs.join(' ')} exited with ${code ?? `signal ${signal}`}`));
      if (failures.length > 0) {
        reject(
          new Error(
            [...failures.map((failure) => failure.message), stderr ? `stderr:\n${stderr}` : '']
              .filter(Boolean)
              .join('\n')
          )
        );
        return;
      }
      resolve('');
    });
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshBaseArgs(options, ip) {
  const args = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=10'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(`${options.guestUser}@${ip}`);
  return args;
}

async function ssh(options, ip, command) {
  return await runAsync('ssh', [...sshBaseArgs(options, ip), command]);
}

async function sshWithRunOptions(options, ip, command, runOptions) {
  return await runAsync('ssh', [...sshBaseArgs(options, ip), command], runOptions);
}

async function scpToGuest(options, ip, sources, targetDir) {
  const args = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(...sources, `${options.guestUser}@${ip}:${targetDir}/`);
  await runAsync('scp', args);
}

async function scpFromGuest(options, ip, sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const args = ['-r', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(`${options.guestUser}@${ip}:${sourceDir}/`, targetDir);
  await runAsync('scp', args);
}

async function copyHostNodeRootToGuest(options, ip) {
  if (!options.guestNodeRoot) return null;
  const staging = guestNodeStagingPlan(options);
  runtimeState.guestNodeStaging = staging;
  await ssh(options, ip, `mkdir -p ${shellQuote(staging.cache_root)}`);
  const cacheStatus = (
    await ssh(options, ip, `if [ -x ${shellQuote(staging.guest_node_command)} ]; then printf hit; else printf miss; fi`)
  ).trim();
  if (cacheStatus === 'hit') {
    staging.cache_hit = true;
    appendRuntimeLog(`guest_node_staging cache_hit=true content_hash=${staging.content_hash}`);
    return staging.guest_node_command;
  }
  staging.cache_hit = false;
  const tmpRoot = `${staging.guest_root}.tmp-${process.pid}`;
  await ssh(options, ip, `rm -rf ${shellQuote(tmpRoot)} && mkdir -p ${shellQuote(tmpRoot)}`);
  await runPipe('tar', ['-C', options.guestNodeRoot, '-cf', '-', '.'], 'ssh', [
    ...sshBaseArgs(options, ip),
    `tar -C ${shellQuote(tmpRoot)} -xf -`,
  ]);
  await ssh(
    options,
    ip,
    [
      `test -x ${shellQuote(`${tmpRoot}/bin/node`)}`,
      `rm -rf ${shellQuote(staging.guest_root)}`,
      `mv ${shellQuote(tmpRoot)} ${shellQuote(staging.guest_root)}`,
    ].join(' && ')
  );
  appendRuntimeLog(`guest_node_staging cache_hit=false content_hash=${staging.content_hash}`);
  return staging.guest_node_command;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitUntil(deadline, fn, failureMessage) {
  while (Date.now() < deadline) {
    const result = fn();
    if (result) return result;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
  }
  throw new Error(failureMessage);
}

function waitForTartIp(vmName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return waitUntil(
    deadline,
    () => {
      const result = spawnSync('tart', ['ip', vmName], { encoding: 'utf8' });
      if (result.status !== 0) return null;
      const ip = result.stdout.trim().split(/\s+/).find(Boolean);
      return ip || null;
    },
    `Timed out waiting for Tart IP for ${vmName}`
  );
}

async function waitForSsh(options, ip, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  let nextProgressLogAt = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await runAsync('ssh', [...sshBaseArgs(options, ip), 'true']);
      return;
    } catch (error) {
      lastError = error;
      if (Date.now() >= nextProgressLogAt) {
        const remainingMs = Math.max(0, deadline - Date.now());
        appendRuntimeLog(`waiting_for_ssh guest=${options.guestUser}@${ip} remaining_ms=${remainingMs}`);
        nextProgressLogAt = Date.now() + 30_000;
      }
      await sleep(2_000);
    }
  }
  const lastMessage =
    lastError instanceof Error ? lastError.message : String(lastError ?? 'no ssh attempt error captured');
  appendRuntimeLog(`ssh_wait_timeout guest=${options.guestUser}@${ip} last_error=${JSON.stringify(lastMessage)}`);
  throw new Error(`Timed out waiting for SSH to ${options.guestUser}@${ip}: ${lastMessage}`);
}

function startVm(options, vmLogPath) {
  const args = ['run'];
  if (options.noGraphics) args.push('--no-graphics');
  args.push(options.vmName);
  const log = fs.openSync(vmLogPath, 'a');
  const child = spawn('tart', args, {
    stdio: ['ignore', log, log],
    detached: false,
  });
  child.on('exit', (code) => {
    fs.appendFileSync(vmLogPath, `\n[tart run exited with ${code}]\n`, 'utf8');
  });
  return child;
}

function stopAndDeleteVm(options) {
  spawnSync('tart', ['stop', options.vmName], { stdio: 'ignore' });
  if (!options.keepVm) {
    spawnSync('tart', ['delete', options.vmName], { stdio: 'ignore' });
  }
}

function writeInterruptedSummary(signal) {
  const options = runtimeState.options;
  if (!options) return;
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    const summary = {
      surface_id: 'opl_tart_gui_first_run_smoke',
      status: 'interrupted',
      signal,
      stage: runtimeState.stage,
      vm_name: options.vmName,
      source_vm: options.sourceVm,
      guest_ip: runtimeState.ip || null,
      guest_artifacts: runtimeState.guestArtifactDir || null,
      host_artifacts: options.artifacts,
      copied_guest_artifacts: runtimeState.copiedArtifacts,
      guest_node_staging: runtimeState.guestNodeStaging,
      stage_timing: buildStageTimingSummary(runtimeState.stageEvents),
    };
    fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  } catch (_) {
    // Best-effort diagnostics must not mask signal handling.
  }
}

async function cleanupRuntime({ copyGuestArtifacts, reason } = { copyGuestArtifacts: true, reason: 'cleanup' }) {
  const options = runtimeState.options;
  if (!options || runtimeState.cleanupStarted) return;
  runtimeState.cleanupStarted = true;
  appendRuntimeLog(`cleanup_started reason=${reason || 'cleanup'}`);

  if (copyGuestArtifacts && runtimeState.ip && runtimeState.guestArtifactDir && !runtimeState.copiedArtifacts) {
    try {
      await scpFromGuest(options, runtimeState.ip, runtimeState.guestArtifactDir, options.artifacts);
      runtimeState.copiedArtifacts = true;
      appendRuntimeLog('copied_guest_artifacts_after_failure');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendRuntimeLog(`artifact_copy_after_failure_failed ${message}`);
    }
  }

  if (runtimeState.codexApiKeyFile?.temporary && runtimeState.codexApiKeyFile.tempDir) {
    fs.rmSync(runtimeState.codexApiKeyFile.tempDir, { recursive: true, force: true });
  }
  if (runtimeState.currentChild && !runtimeState.currentChild.killed) {
    runtimeState.currentChild.kill('SIGTERM');
  }
  if (runtimeState.tartProcess && !runtimeState.tartProcess.killed) {
    runtimeState.tartProcess.kill('SIGTERM');
  }
  stopAndDeleteVm(options);
  appendRuntimeLog('cleanup_finished');
}

if (process.env.NODE_ENV !== 'test') {
  for (const signal of SIGNAL_EXIT_CODES.keys()) {
    process.once(signal, () => {
      appendRuntimeLog(`received_signal signal=${signal}`);
      writeInterruptedSummary(signal);
      cleanupRuntime({ copyGuestArtifacts: false, reason: `signal:${signal}` }).finally(() => {
        process.exit(SIGNAL_EXIT_CODES.get(signal));
      });
    });
  }
}

function assertMacOSHost() {
  if (process.platform !== 'darwin') {
    throw new Error('Tart first-run smoke must run on a macOS host.');
  }
}

function assertTartAvailable() {
  run('tart', ['--version']);
}

function guestSmokeCommand(
  options,
  guestDmgPath,
  guestScriptPath,
  guestArtifactDir,
  guestCodexApiKeyPath,
  guestFrameworkSourceArchivePath = null,
  guestFrameworkInstallScriptPath = null
) {
  const nodeCommand = shellQuote(options.guestNodeCommand);
  const sourceArchiveUrl = guestFrameworkSourceArchivePath ? `file://${guestFrameworkSourceArchivePath}` : null;
  const installScriptUrl = guestFrameworkInstallScriptPath ? `file://${guestFrameworkInstallScriptPath}` : null;
  const sourceArchiveEnv = sourceArchiveUrl
    ? [
        `export OPL_INSTALL_SOURCE_MODE='archive'`,
        `export OPL_SOURCE_ARCHIVE_URL=${shellQuote(sourceArchiveUrl)}`,
        installScriptUrl ? `export OPL_INSTALL_SCRIPT_URL=${shellQuote(installScriptUrl)}` : '',
        `launchctl setenv OPL_INSTALL_SOURCE_MODE 'archive'`,
        `launchctl setenv OPL_SOURCE_ARCHIVE_URL ${shellQuote(sourceArchiveUrl)}`,
        installScriptUrl ? `launchctl setenv OPL_INSTALL_SCRIPT_URL ${shellQuote(installScriptUrl)}` : '',
      ].filter(Boolean)
    : [];
  const smokeArgs = [
    `${nodeCommand} ${shellQuote(guestScriptPath)}`,
    options.installMode === 'homebrew-cask'
      ? `--app ${shellQuote('/Applications/One Person Lab.app')}`
      : `--dmg ${shellQuote(guestDmgPath)}`,
    `--artifacts ${shellQuote(guestArtifactDir)}`,
    `--codex-api-key-file ${shellQuote(guestCodexApiKeyPath)}`,
    options.requireCodexConfigWizard ? '--require-codex-config-wizard' : '',
    '--assert-clean',
    `--process-name ${shellQuote(options.processName)}`,
    `--timeout-ms ${shellQuote(String(options.smokeTimeoutMs))}`,
    options.settingsSmoke ? '--settings-smoke' : '',
    options.assistantRouteSmoke ? '--assistant-route-smoke' : '',
    options.codexFunctionalCheck ? '--codex-functional-check' : '',
    options.codexAiSelfCheck ? '--codex-ai-self-check' : '',
    options.codexAiSelfCheck ? `--codex-ai-self-check-mode ${shellQuote(options.codexAiSelfCheckMode)}` : '',
    options.codexAiSelfCheck
      ? `--codex-ai-self-check-timeout-ms ${shellQuote(String(options.codexAiSelfCheckTimeoutMs))}`
      : '',
    options.settingsSmoke || options.assistantRouteSmoke ? `--cdp-port ${shellQuote(String(options.cdpPort))}` : '',
    `--runtime-profile ${shellQuote(options.runtimeProfile)}`,
    options.guideScreenshots ? '--guide-screenshots' : '',
  ].join(' ');
  return ['set -euo pipefail', ...sourceArchiveEnv, smokeArgs].join('\n');
}

function guestCleanStateProbeCommand() {
  return `
set -euo pipefail
existing=()
for path in "$HOME/Library/Logs/One Person Lab/first-run.jsonl" "$HOME/Library/Application Support/OPL/state" "$HOME/Library/Application Support/One Person Lab"; do
  if [ -e "$path" ]; then
    existing+=("$path")
  fi
done
if [ "\${#existing[@]}" -gt 0 ]; then
  printf 'Fresh VM assertion failed; existing OPL state/log/app-local state found:\\n' >&2
  printf '%s\\n' "\${existing[@]}" >&2
  exit 1
fi
`;
}

function guestHomebrewInstallCommand(options) {
  return `
set -euo pipefail
BREW_BIN=""
if command -v brew >/dev/null 2>&1; then
  BREW_BIN="$(command -v brew)"
elif [ -x /opt/homebrew/bin/brew ]; then
  BREW_BIN="/opt/homebrew/bin/brew"
elif [ -x /usr/local/bin/brew ]; then
  BREW_BIN="/usr/local/bin/brew"
fi
if [ -z "$BREW_BIN" ]; then
  echo "Homebrew is required for the Homebrew cask first-run smoke VM image." >&2
  exit 85
fi
eval "$("$BREW_BIN" shellenv)"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_ENV_HINTS=1
"$BREW_BIN" tap ${shellQuote(options.homebrewTap)}
if "$BREW_BIN" trust --help >/dev/null 2>&1; then
${homebrewTrustedCaskRefs(options)
  .map((caskRef) => `  "$BREW_BIN" trust --cask ${shellQuote(caskRef)}`)
  .join('\n')}
fi
"$BREW_BIN" install --cask ${shellQuote(options.homebrewCask)}
test -d "/Applications/One Person Lab.app"
xattr -dr com.apple.quarantine "/Applications/One Person Lab.app" 2>/dev/null || sudo xattr -dr com.apple.quarantine "/Applications/One Person Lab.app" 2>/dev/null || true
`;
}

function resolveGuestSmokeScriptPath() {
  if (!fs.existsSync(GUEST_SMOKE_SCRIPT_PATH)) {
    throw new Error(`Guest first-run smoke script is missing: ${GUEST_SMOKE_SCRIPT_PATH}`);
  }
  return GUEST_SMOKE_SCRIPT_PATH;
}

async function resolveGuestNodeCommand(options, ip) {
  const installScript = `
set -euo pipefail
if command -v node >/dev/null 2>&1; then
  command -v node
  exit 0
fi
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) NODE_ARCH="arm64" ;;
  x86_64) NODE_ARCH="x64" ;;
  *) echo "Unsupported guest architecture for Node.js: $ARCH" >&2; exit 1 ;;
esac
NODE_VERSION="${DEFAULT_GUEST_NODE_VERSION}"
NODE_DIR="${options.guestWorkdir}/node-v$NODE_VERSION-darwin-$NODE_ARCH"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  mkdir -p ${shellQuote(options.guestWorkdir)}
  curl -fL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-$NODE_ARCH.tar.gz" -o "${options.guestWorkdir}/node.tar.gz"
  tar -xzf "${options.guestWorkdir}/node.tar.gz" -C ${shellQuote(options.guestWorkdir)}
fi
"$NODE_DIR/bin/node" --version >/dev/null
printf '%s\\n' "$NODE_DIR/bin/node"
`;
  return (await ssh(options, ip, installScript)).trim().split(/\r?\n/).at(-1);
}

function readGuestSmokeSummary(hostArtifactsDir) {
  const summaryPath = path.join(hostArtifactsDir, 'artifacts', 'smoke-summary.json');
  if (!fs.existsSync(summaryPath)) return null;
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

function assertGuestSmokeSummary(options, guestSummary) {
  if (!guestSummary) {
    throw new Error('Guest smoke summary is missing from copied artifacts.');
  }
  if (guestSummary.status !== 'passed') {
    throw new Error(`Guest smoke summary did not pass: ${guestSummary.status ?? 'missing status'}`);
  }
  if (guestSummary.runtime_profile !== options.runtimeProfile) {
    throw new Error(
      `Guest smoke runtime profile mismatch: expected ${options.runtimeProfile}, got ${
        guestSummary.runtime_profile ?? 'missing'
      }`
    );
  }
  if (options.requireCodexConfigWizard && !guestSummary.codex_config_wizard_submitted) {
    throw new Error('Guest smoke did not submit the Codex configuration wizard.');
  }
  if (options.settingsSmoke) {
    if (guestSummary.settings_smoke?.status !== 'passed') {
      throw new Error('Guest Settings smoke did not pass.');
    }
    if (!Array.isArray(guestSummary.settings_smoke.pages) || guestSummary.settings_smoke.pages.length === 0) {
      throw new Error('Guest Settings smoke summary did not record visited pages.');
    }
  }
  if (options.assistantRouteSmoke) {
    if (guestSummary.assistant_route_smoke?.status !== 'passed') {
      throw new Error('Guest assistant route smoke did not pass.');
    }
    const assistantIds = guestSummary.assistant_route_smoke.assistants;
    if (
      !Array.isArray(assistantIds) ||
      !['mas', 'mag', 'rca'].every((assistantId) => assistantIds.includes(assistantId))
    ) {
      throw new Error('Guest assistant route smoke summary did not record MAS, MAG, and RCA.');
    }
  }
  if (options.codexFunctionalCheck) {
    const receipt = guestSummary.codex_functional_check;
    if (!receipt) {
      throw new Error('Guest Codex functional check receipt is missing.');
    }
    if (receipt.blocking_release_gate?.deterministic_fields_passed !== true) {
      throw new Error('Guest Codex functional check deterministic fields did not pass.');
    }
    if (receipt.blocking_release_gate?.llm_invocation_required !== false) {
      throw new Error('Guest Codex functional check must not require LLM invocation.');
    }
    if (!['passed', 'diagnostic_skipped'].includes(receipt.status)) {
      throw new Error(`Guest Codex functional check has release-blocking status: ${receipt.status ?? 'missing'}`);
    }
  }
  if (options.codexAiSelfCheck) {
    const receipt = guestSummary.codex_ai_self_check;
    if (!receipt) {
      throw new Error('Guest Codex AI self-check receipt is missing.');
    }
    if (receipt.schema !== 'opl_codex_ai_self_check_receipt.v1') {
      throw new Error('Guest Codex AI self-check receipt has an unexpected schema.');
    }
    if (receipt.blocking_release_gate !== false) {
      throw new Error('Guest Codex AI self-check must remain non-blocking release evidence.');
    }
  }
}

function writeSummary(options, ip, guestArtifactDir) {
  const guestSummary = readGuestSmokeSummary(options.artifacts);
  assertGuestSmokeSummary(options, guestSummary);
  const summary = {
    surface_id: 'opl_tart_gui_first_run_smoke',
    status: 'passed',
    smoke_profile: options.smokeProfile,
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    display: options.display,
    runtime_profile: options.runtimeProfile,
    require_codex_config_wizard: options.requireCodexConfigWizard,
    framework_source_archive: frameworkSourceArchivePlan(options),
    guest_ip: ip,
    guest_artifacts: guestArtifactDir,
    host_artifacts: options.artifacts,
    codex_config_wizard_seen: guestSummary?.codex_config_wizard_seen ?? null,
    codex_config_wizard_submitted: guestSummary?.codex_config_wizard_submitted ?? null,
    codex_api_key_present: guestSummary?.codex_api_key_present ?? null,
    labels: guestSummary?.labels ?? [],
    settings_smoke: guestSummary?.settings_smoke ?? null,
    assistant_route_smoke: guestSummary?.assistant_route_smoke ?? null,
    codex_functional_check: guestSummary?.codex_functional_check ?? null,
    codex_ai_self_check: guestSummary?.codex_ai_self_check ?? null,
    guest_node_staging: runtimeState.guestNodeStaging,
    stage_timing: buildStageTimingSummary(runtimeState.stageEvents),
    guest_summary: guestSummary,
  };
  fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function writeFailedSummary(options, ip, guestArtifactDir, error) {
  const guestSummary = readGuestSmokeSummary(options.artifacts);
  const summary = {
    surface_id: 'opl_tart_gui_first_run_smoke',
    status: 'failed',
    failure_stage: runtimeState.stage,
    error: error instanceof Error ? error.message : String(error),
    smoke_profile: options.smokeProfile,
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    display: options.display,
    runtime_profile: options.runtimeProfile,
    require_codex_config_wizard: options.requireCodexConfigWizard,
    framework_source_archive: frameworkSourceArchivePlan(options),
    guest_ip: ip || null,
    guest_artifacts: guestArtifactDir || null,
    host_artifacts: options.artifacts,
    copied_guest_artifacts: runtimeState.copiedArtifacts,
    codex_config_wizard_seen: guestSummary?.codex_config_wizard_seen ?? null,
    codex_config_wizard_submitted: guestSummary?.codex_config_wizard_submitted ?? null,
    labels: guestSummary?.labels ?? [],
    settings_smoke: guestSummary?.settings_smoke ?? null,
    assistant_route_smoke: guestSummary?.assistant_route_smoke ?? null,
    codex_functional_check: guestSummary?.codex_functional_check ?? null,
    codex_ai_self_check: guestSummary?.codex_ai_self_check ?? null,
    guest_node_staging: runtimeState.guestNodeStaging,
    stage_timing: buildStageTimingSummary(runtimeState.stageEvents),
    guest_summary: guestSummary,
  };
  fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
}

async function main() {
  assertMacOSHost();
  const options = parseArgs(process.argv.slice(2));
  runtimeState.options = options;
  if (options.dryRun) {
    fs.mkdirSync(options.artifacts, { recursive: true });
    const plan = buildDryRunPlan(options);
    fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-plan.json'), JSON.stringify(plan, null, 2));
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  assertTartAvailable();
  fs.mkdirSync(options.artifacts, { recursive: true });

  const vmLogPath = path.join(options.artifacts, 'tart-run.log');
  runtimeState.vmLogPath = vmLogPath;
  let tartProcess = null;
  const codexApiKeyFile = prepareHostCodexApiKeyFile(options);
  runtimeState.codexApiKeyFile = codexApiKeyFile;
  let ip = '';
  let guestArtifactDir = '';
  let copiedArtifacts = false;
  let failure = null;
  try {
    setStage('clone_vm');
    run('tart', ['clone', options.sourceVm, options.vmName]);
    if (options.display) {
      setStage('configure_display');
      run('tart', ['set', options.vmName, '--display', options.display, '--no-display-refit']);
    }
    setStage('start_vm');
    tartProcess = startVm(options, vmLogPath);
    runtimeState.tartProcess = tartProcess;
    setStage('wait_for_ip');
    ip = waitForTartIp(options.vmName, options.timeoutMs);
    runtimeState.ip = ip;
    setStage('wait_for_ssh');
    await waitForSsh(options, ip, options.timeoutMs);

    guestArtifactDir = `${options.guestWorkdir}/artifacts`;
    runtimeState.guestArtifactDir = guestArtifactDir;
    const guestDmgPath = options.dmg ? `${options.guestWorkdir}/${path.basename(options.dmg)}` : null;
    const guestScriptPath = `${options.guestWorkdir}/opl-first-run-vm-smoke.mjs`;
    const guestCodexApiKeyPath = `${options.guestWorkdir}/codex-api-key.txt`;
    setStage('prepare_guest_workdir');
    await ssh(
      options,
      ip,
      `rm -rf ${shellQuote(options.guestWorkdir)} && mkdir -p ${shellQuote(options.guestWorkdir)}`
    );
    setStage('copy_inputs_to_guest');
    const guestFrameworkArchivePath = guestFrameworkSourceArchivePath(options);
    const guestFrameworkInstallerPath = guestFrameworkInstallScriptPath(options);
    const guestInputs = [resolveGuestSmokeScriptPath(), codexApiKeyFile.path];
    if (options.dmg) guestInputs.unshift(options.dmg);
    if (options.frameworkSourceArchive) guestInputs.push(options.frameworkSourceArchive);
    if (options.frameworkInstallScript) guestInputs.push(options.frameworkInstallScript);
    await scpToGuest(options, ip, guestInputs, options.guestWorkdir);
    if (options.frameworkInstallScript) {
      setStage('prepare_framework_install_script');
      await ssh(options, ip, frameworkInstallScriptFinalizeCommand(options));
    }
    if (options.guestNodeRoot && !options.guestNodeCommand) {
      setStage('copy_guest_node_root');
      options.guestNodeCommand = await copyHostNodeRootToGuest(options, ip);
    }
    setStage(options.guestNodeCommand ? 'use_guest_node_command' : 'resolve_guest_node');
    if (!options.guestNodeCommand) {
      options.guestNodeCommand = await resolveGuestNodeCommand(options, ip);
    }
    if (options.installMode === 'homebrew-cask') {
      setStage('assert_clean_state_before_homebrew_install');
      await ssh(options, ip, guestCleanStateProbeCommand());
      setStage('homebrew_cask_install');
      await sshWithRunOptions(options, ip, guestHomebrewInstallCommand(options), {
        label: `ssh homebrew_cask_install ${options.guestUser}@${ip}`,
        timeoutMs: options.timeoutMs,
      });
    }
    setStage('run_guest_smoke');
    await sshWithRunOptions(
      options,
      ip,
      guestSmokeCommand(
        options,
        guestDmgPath,
        guestScriptPath,
        guestArtifactDir,
        guestCodexApiKeyPath,
        guestFrameworkArchivePath,
        guestFrameworkInstallerPath
      ),
      {
        label: `ssh run_guest_smoke ${options.guestUser}@${ip}`,
        timeoutMs: guestSmokeHostTimeoutMs(options),
      }
    );
    setStage('copy_guest_artifacts');
    await scpFromGuest(options, ip, guestArtifactDir, options.artifacts);
    copiedArtifacts = true;
    runtimeState.copiedArtifacts = true;
    setStage('write_summary');
    writeSummary(options, ip, guestArtifactDir);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    runtimeState.ip = ip;
    runtimeState.guestArtifactDir = guestArtifactDir;
    runtimeState.copiedArtifacts = copiedArtifacts || runtimeState.copiedArtifacts;
    await cleanupRuntime({ copyGuestArtifacts: true, reason: 'finally' });
    if (failure) {
      writeFailedSummary(options, ip, guestArtifactDir, failure);
    }
  }
}

function isMainModule(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    return fs.realpathSync(new URL(moduleUrl)) === fs.realpathSync(argvPath);
  } catch (_) {
    return false;
  }
}

export const __test =
  process.env.NODE_ENV === 'test'
    ? {
        assertGuestSmokeSummary,
        buildStageTimingSummary,
        buildDryRunPlan,
        frameworkInstallScriptFinalizeCommand,
        frameworkSourceArchivePlan,
        guestFrameworkSourceArchivePath,
        guestHomebrewInstallCommand,
        guestNodeStagingPlan,
        guestSmokeHostTimeoutMs,
        guestSmokeCommand,
        homebrewTrustedCaskRefs,
        isMainModule,
        parseArgs,
        recordStageEvent,
        resolveGuestSmokeScriptPath,
        runAsync,
        writeFailedSummary,
        writeSummary,
      }
    : undefined;

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

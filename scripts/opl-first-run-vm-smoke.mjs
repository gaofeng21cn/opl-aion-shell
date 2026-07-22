#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  codexApiKeyMethod: 'opl-first-run-gateway-key-method',
  codexApiKeyInput: 'opl-first-run-codex-api-key-input',
  codexConfigureButton: 'opl-first-run-configure-codex-button',
  retryButton: 'opl-first-run-retry-button',
  environmentButton: 'opl-first-run-open-environment-button',
  modulesButton: 'opl-first-run-open-modules-button',
  deferredEntry: 'opl-first-run-enter-app',
  readyEntry: 'opl-first-run-ready-entry',
  guidEntry: 'opl-guid-entry',
  settingsEnvironment: 'opl-settings-environment',
  beginnerSummary: 'opl-first-run-beginner-summary',
  primaryAction: 'opl-first-run-primary-action',
  backgroundMaintenance: 'opl-first-run-background-maintenance-secondary',
  technicalDetailsToggle: 'opl-first-run-technical-details-toggle',
  startupPreflight: 'opl-startup-preflight',
};
const DEFERRED_FULL_FIRST_RUN_BLOCKERS = new Set(['domain_modules', 'family_runtime_provider', 'recommended_skills']);
const RUNTIME_PROFILES = new Set(['full', 'standard']);
const DEFAULT_OPL_PROBE_TIMEOUT_MS = 90_000;
const OPL_JSON_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const OPL_BOOTSTRAP_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const OPL_JSON_DIAGNOSTIC_INLINE_BYTES = 64 * 1024;
const OPL_BOOTSTRAP_TIMEOUT_MS = 900_000;
const FULL_ASSISTANT_READINESS_TIMEOUT_MS = 180_000;
const FULL_ASSISTANT_SEND_TIMEOUT_MS = 180_000;
const MANAGED_NODE_VERSION = 'v22.21.1';
const STANDARD_BOOTSTRAP_RESOURCE = 'opl-install.sh';
const FULL_RUNTIME_RESOURCE_DIR = 'opl-full-runtime';
const FULL_RUNTIME_MANIFEST = 'full-package-manifest.json';
const MAIN_BOOTSTRAP_FATAL_MARKER = 'aionui.main_bootstrap_fatal.v1';
const OPL_CONNECT_MODULES_ARGS = ['connect', 'modules', '--json'];
const FULL_CODEX_VISIBLE_COMPANION_SKILLS = [
  'officecli',
  'officecli-docx',
  'officecli-pptx',
  'officecli-xlsx',
  'mineru-document-extractor',
  'ui-ux-pro-max',
];
const FULL_PLUGIN_ONLY_DOMAIN_SKILLS = [
  ['med-autoscience', 'modules/mas', 'med-autoscience'],
  ['med-autogrant', 'modules/mag', 'med-autogrant'],
  ['redcube-ai', 'modules/rca', 'redcube-ai'],
];
const NON_RETRYABLE_FULL_RUNTIME_EQUIVALENCE_ERROR_PATTERNS = [
  'is missing packaged marker',
  'has an invalid packaged marker',
  'is missing expected payload path(s)',
  'is missing packaged plugin manifest',
  'is missing packaged skill entry',
];
const FULL_RUNTIME_MODULES = [
  ['medautoscience', 'med-autoscience', path.join('modules', 'mas'), ['agent', 'plugins']],
  ['medautogrant', 'med-autogrant', path.join('modules', 'mag'), ['agent', 'plugins']],
  ['redcube', 'redcube-ai', path.join('modules', 'rca'), ['agent', 'plugins']],
  [
    'oplmetaagent',
    'opl-meta-agent',
    path.join('modules', 'meta-agent'),
    [
      path.join('contracts', 'action_catalog.json'),
      path.join('contracts', 'domain_descriptor.json'),
      path.join('contracts', 'foundry_provider.json'),
      path.join('contracts', 'pack_compiler_input.json'),
      path.join('agent', 'stages', 'manifest.json'),
      path.join('agent', 'primary_skill', 'SKILL.md'),
    ],
  ],
  ['oplbookforge', 'opl-bookforge', path.join('modules', 'bookforge'), ['contracts']],
];
const FALLBACK_OPL_ASSISTANT_ROUTE_SMOKE_TARGETS = [
  {
    id: 'mas',
    packageId: 'mas',
    badge: '@科研',
    shortName: 'MAS',
    shortcutId: 'research',
    codexVisibleEntry: 'med-autoscience',
    requiredSkillIds: ['med-autoscience'],
  },
  {
    id: 'mag',
    packageId: 'mag',
    badge: '@基金',
    shortName: 'MAG',
    shortcutId: 'grant',
    codexVisibleEntry: 'med-autogrant',
    requiredSkillIds: ['med-autogrant'],
  },
  {
    id: 'rca',
    packageId: 'rca',
    badge: '@演示',
    shortName: 'RCA',
    shortcutId: 'ppt',
    codexVisibleEntry: 'redcube-ai',
    requiredSkillIds: ['redcube-ai'],
  },
];
const MAS_QUALIFICATION_PROVISIONING_RECEIPT_SURFACE = 'mas_qualification_work_item_provisioning_receipt';
const MAS_QUALIFICATION_PROVISIONING_RECEIPT_VERSION = 1;
const MAS_QUALIFICATION_PROVISIONING_ACTION_ID = 'qualification_work_item_provisioning_authority_evaluate';
const MAS_QUALIFICATION_PROVISIONING_RECEIPT_REF = /^mas-qualification-work-item-provisioning:[a-f0-9]{64}$/;
const MAS_QUALIFICATION_SCOPE = 'full_vm_release_smoke';
const MAS_DOMAIN_ID = 'medautoscience';
const MAS_DOMAIN_TRUTH_OWNER = 'MedAutoScience';
const SAFE_STUDY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
function loadCompiledAssistantRouteExpectations(
  manifestPath = process.env.OPL_FIRST_RUN_COMPILED_EXPECTATIONS,
  runtimeProfile = 'standard',
  allowFallback = process.env.NODE_ENV === 'test'
) {
  if (!manifestPath) {
    if (!allowFallback)
      throw new Error('Release-bound assistant route smoke requires the App compiled first-run expectation manifest.');
    return { targets: FALLBACK_OPL_ASSISTANT_ROUTE_SMOKE_TARGETS, consumption: null };
  }
  const resolved = path.resolve(manifestPath);
  const bytes = fs.readFileSync(resolved);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest?.schema !== 'opl_app_first_run_compiled_expectations.v1') {
    throw new Error(`Compiled first-run expectations at ${manifestPath} have an invalid schema.`);
  }
  const profile = manifest?.profiles?.[runtimeProfile];
  const targets = profile?.semantics?.assistant_targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error(`Compiled first-run expectations at ${manifestPath} have no ${runtimeProfile} assistant targets.`);
  }
  if (
    profile.semantics.artifact_kind !== runtimeProfile ||
    !/^[0-9a-f]{64}$/.test(profile.semantic_digest) ||
    !/^[0-9a-f]{64}$/.test(profile.probe_digest)
  ) {
    throw new Error(
      `Compiled first-run expectations at ${manifestPath} do not bind the ${runtimeProfile} profile and digests.`
    );
  }
  const mapped = targets.map((target) => ({
    id: target.assistant_id,
    packageId: target.package_id,
    badge: target.badge,
    shortName: String(target.assistant_id).toUpperCase(),
    shortcutId: target.shortcut_id,
    codexVisibleEntry: target.codex_visible_entry,
    requiredSkillIds: target.required_skill_ids,
  }));
  for (const target of mapped) {
    if (
      ![target.id, target.packageId, target.shortcutId, target.codexVisibleEntry, target.badge].every(
        (value) => typeof value === 'string' && value.length > 0
      ) ||
      !Array.isArray(target.requiredSkillIds) ||
      target.requiredSkillIds.length === 0 ||
      target.requiredSkillIds.some((value) => typeof value !== 'string' || !value)
    ) {
      throw new Error(
        `Compiled first-run expectations at ${manifestPath} contain a malformed assistant identity axis.`
      );
    }
  }
  return {
    targets: mapped,
    consumption: {
      schema: manifest.schema,
      file_sha256: createHash('sha256').update(bytes).digest('hex'),
      profile: runtimeProfile,
      semantic_digest: profile.semantic_digest,
      probe_digest: profile.probe_digest,
    },
  };
}
function loadAssistantRouteSmokeTargets(manifestPath, runtimeProfile = 'standard', allowFallback) {
  return loadCompiledAssistantRouteExpectations(manifestPath, runtimeProfile, allowFallback).targets;
}
let OPL_ASSISTANT_ROUTE_SMOKE_TARGETS = FALLBACK_OPL_ASSISTANT_ROUTE_SMOKE_TARGETS;
let COMPILED_EXPECTATION_CONSUMPTION = null;
const DEFAULT_CDP_COMMAND_TIMEOUT_MS = 15_000;
const PACKAGED_APP_LAUNCH_ENV_ALLOWLIST = new Set([
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'PATH',
  'LANG',
  'TERM',
  '__CF_USER_TEXT_ENCODING',
  'SSH_AUTH_SOCK',
  'AIONUI_CDP_PORT',
  'OPL_FULL_RUNTIME_PYCACHE_ROOT',
  'PYTHONDONTWRITEBYTECODE',
  'PYTHONPYCACHEPREFIX',
]);
const PACKAGED_APP_LAUNCH_ENV_PREFIX_ALLOWLIST = ['LC_'];
const PACKAGED_APP_LAUNCH_ENV_BLOCKLIST = new Set([
  'AIONUI_MULTI_INSTANCE',
  'AIONUI_DATA_DIR',
  'AIONUI_BACKEND_BIN',
  'AIONUI_BACKEND_BUNDLED_DIR',
  'AIONUI_STATIC_DIR',
  'AIONUI_RENDERER_URL',
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_ENABLE_LOGGING',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_RENDERER_URL',
  'NODE_ENV',
  'NODE_OPTIONS',
  'CI',
  'GITHUB_ACTIONS',
  'RUNNER_TEMP',
  'RUNNER_TOOL_CACHE',
]);
const RUNTIME_ACTION_EVIDENCE_TIMEOUT_MS = 45_000;
const RELEASE_EVIDENCE_ACTION_ID = 'developer_supervisor_refresh';
const TEMPORAL_SERVICE_START_ACTION_ID = 'provider_service_start';
const TEMPORAL_SERVICE_RESTART_ACTION_ID = 'provider_service_restart';
const TEMPORAL_SERVICE_SUPERVISOR_LABEL = 'ai.opl.family-runtime.temporal-service';
const FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON =
  'release_smoke_stage_body_not_started_after_framework_activation';
const TEMPORAL_SERVICE_SUPERVISOR_THROTTLE_MS = 15_000;
const TEMPORAL_SERVICE_SUPERVISOR_TRANSITION_TIMEOUT_MS = TEMPORAL_SERVICE_SUPERVISOR_THROTTLE_MS + 5_000;
const TEMPORAL_SERVICE_SUPERVISOR_TRANSITION_POLL_MS = 500;
const HOST_DEADLINE_SAFETY_MARGIN_MS = 120_000;
const RELEASE_EVIDENCE_SCREENSHOTS = {
  full: path.join('screenshots', 'full.png'),
  action: path.join('screenshots', 'action.png'),
};
const GUIDE_SCREENSHOTS = {
  release: '01-download-release.png',
  dmgInstall: '02-install-dmg.png',
  firstRun: '03-codex-config-needed.png',
  ready: '04-first-run-checking.png',
  researchEntry: '05-opl-ready-research-entry.png',
  environment: '06-research-data-folder.png',
  firstResearch: '07-first-research-entry.png',
  runtimeStatus: '08-opl-runtime-status.png',
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
  --codex-install-phase-timeout-ms <n>
                         Timeout for App install and first-launch setup commands.
                         Defaults to --timeout-ms.
  --codex-readiness-phase-timeout-ms <n>
                         Timeout for Codex readiness and opl initialize checks.
                         Defaults to --timeout-ms.
  --codex-package-tarball <path>
                         Optional local Codex npm package tarball to expose to
                         the packaged app during first-run install.
  --codex-platform-package-tarball <path>
                         Optional local Codex macOS platform package tarball to
                         expose during first-run install.
  --codex-npm-cache-dir <path>
                         Optional npm cache directory to expose to the packaged
                         app during first-run Codex install via NPM_CONFIG_CACHE.
  --bootstrap-launch-diagnostics
                         Run focused packaged bootstrap and initial renderer/CDP
                         launch diagnostics. Skips Codex config/readiness and
                         secondary release smokes.
  --settings-smoke       After first launch, navigate all built-in Settings pages through the packaged app.
  --assistant-route-smoke
                         Verify MAS/MAG/RCA Home launch gates for Standard. For Full,
                         click each entry and verify its receipt-only Codex route.
  --mas-study-provisioning-receipt <path>
                         Domain-owned qualification provisioning receipt used to
                         derive the MAS study_id before any Full Stage provider starts.
  --assistant-workspace <path>
                         Exact provisioned workspace root bound by the MAS receipt.
  --codex-functional-check
                         Write codex-functional-check-summary.json with deterministic
                         post-install Codex behavior fields. This does not call an LLM.
  --codex-ai-self-check
                         After deterministic initialization and Codex functional checks,
                         ask Codex CLI to inspect the target installed OPL working mode.
                         This writes codex-ai-self-check-summary.json as non-blocking
                         AI-first diagnostic evidence.
  --codex-ai-self-check-mode <mode>
                         Codex AI self-check mode: diagnose or fix. Default: diagnose.
                         Release VM gates use diagnose.
  --codex-ai-self-check-timeout-ms <n>
                         Codex AI self-check timeout. Default: 120000.
  --cdp-port <n>         CDP port used by packaged-app DOM smoke probes. Default: 9230.
  --host-deadline-epoch-ms <n>
                         Optional absolute host SSH deadline in Unix epoch milliseconds.
                         Guest phase waits are shortened by a safety margin so
                         failures are reported before the host kills the SSH process.
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
  --guide-screenshots    Capture extra 1920x1080 VM screenshots for the user guide.
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
    codexInstallPhaseTimeoutMs: null,
    codexReadinessPhaseTimeoutMs: null,
    codexPackageTarball: null,
    codexPlatformPackageTarball: null,
    codexNpmCacheDir: null,
    bootstrapLaunchDiagnostics: false,
    settingsSmoke: false,
    assistantRouteSmoke: false,
    masStudyProvisioningReceipt: process.env.OPL_FIRST_RUN_MAS_STUDY_PROVISIONING_RECEIPT
      ? path.resolve(process.env.OPL_FIRST_RUN_MAS_STUDY_PROVISIONING_RECEIPT)
      : null,
    assistantWorkspace: process.env.OPL_FIRST_RUN_ASSISTANT_WORKSPACE
      ? path.resolve(process.env.OPL_FIRST_RUN_ASSISTANT_WORKSPACE)
      : fullAssistantWorkspacePath(),
    codexFunctionalCheck: false,
    codexAiSelfCheck: false,
    codexAiSelfCheckMode: 'diagnose',
    codexAiSelfCheckTimeoutMs: 120_000,
    cdpPort: 9230,
    hostDeadlineEpochMs: process.env.OPL_FIRST_RUN_HOST_DEADLINE_EPOCH_MS
      ? Number(process.env.OPL_FIRST_RUN_HOST_DEADLINE_EPOCH_MS)
      : null,
    runtimeProfile: 'full',
    codexApiKeyFile: process.env.OPL_FIRST_RUN_CODEX_API_KEY_FILE || null,
    requireCodexConfigWizard: false,
    assertClean: false,
    guideScreenshots: false,
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
    if (arg === '--bootstrap-launch-diagnostics') {
      options.bootstrapLaunchDiagnostics = true;
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
    if (arg === '--codex-functional-check') {
      options.codexFunctionalCheck = true;
      options.assistantRouteSmoke = true;
      continue;
    }
    if (arg === '--codex-ai-self-check') {
      options.codexAiSelfCheck = true;
      options.codexFunctionalCheck = true;
      options.assistantRouteSmoke = true;
      continue;
    }
    if (arg === '--guide-screenshots') {
      options.guideScreenshots = true;
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
    else if (arg === '--codex-install-phase-timeout-ms') options.codexInstallPhaseTimeoutMs = Number(value);
    else if (arg === '--codex-readiness-phase-timeout-ms') options.codexReadinessPhaseTimeoutMs = Number(value);
    else if (arg === '--codex-package-tarball') options.codexPackageTarball = path.resolve(value);
    else if (arg === '--codex-platform-package-tarball') options.codexPlatformPackageTarball = path.resolve(value);
    else if (arg === '--codex-npm-cache-dir') options.codexNpmCacheDir = path.resolve(value);
    else if (arg === '--cdp-port') options.cdpPort = Number(value);
    else if (arg === '--runtime-profile') options.runtimeProfile = value;
    else if (arg === '--mas-study-provisioning-receipt') {
      options.masStudyProvisioningReceipt = path.resolve(value);
    } else if (arg === '--assistant-workspace') {
      options.assistantWorkspace = path.resolve(value);
    } else if (arg === '--codex-ai-self-check-mode') options.codexAiSelfCheckMode = value;
    else if (arg === '--codex-ai-self-check-timeout-ms') options.codexAiSelfCheckTimeoutMs = Number(value);
    else if (arg === '--host-deadline-epoch-ms') options.hostDeadlineEpochMs = Number(value);
    else if (arg === '--codex-api-key-file') options.codexApiKeyFile = path.resolve(value);
    else throw new Error(`Unsupported argument: ${arg}`);
  }

  if (options.app && options.dmg) throw new Error('Use only one of --app or --dmg.');
  if (!options.app && !options.dmg) throw new Error('One of --app or --dmg is required.');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (options.codexInstallPhaseTimeoutMs === null) options.codexInstallPhaseTimeoutMs = options.timeoutMs;
  if (options.codexReadinessPhaseTimeoutMs === null) options.codexReadinessPhaseTimeoutMs = options.timeoutMs;
  if (!Number.isFinite(options.codexInstallPhaseTimeoutMs) || options.codexInstallPhaseTimeoutMs <= 0) {
    throw new Error('--codex-install-phase-timeout-ms must be positive.');
  }
  if (!Number.isFinite(options.codexReadinessPhaseTimeoutMs) || options.codexReadinessPhaseTimeoutMs <= 0) {
    throw new Error('--codex-readiness-phase-timeout-ms must be positive.');
  }
  validateCodexInstallPreseedOptions(options);
  if (!Number.isInteger(options.cdpPort) || options.cdpPort < 1024 || options.cdpPort > 65535) {
    throw new Error('--cdp-port must be an integer TCP port between 1024 and 65535.');
  }
  if (
    options.hostDeadlineEpochMs !== null &&
    (!Number.isFinite(options.hostDeadlineEpochMs) || options.hostDeadlineEpochMs <= 0)
  ) {
    throw new Error('--host-deadline-epoch-ms must be a positive Unix epoch millisecond timestamp.');
  }
  if (!RUNTIME_PROFILES.has(options.runtimeProfile)) {
    throw new Error('--runtime-profile must be one of: full, standard.');
  }
  if (!['diagnose', 'fix'].includes(options.codexAiSelfCheckMode)) {
    throw new Error('--codex-ai-self-check-mode must be one of: diagnose, fix.');
  }
  if (!Number.isFinite(options.codexAiSelfCheckTimeoutMs) || options.codexAiSelfCheckTimeoutMs <= 0) {
    throw new Error('--codex-ai-self-check-timeout-ms must be positive.');
  }
  if (!options.artifacts) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    options.artifacts = path.resolve('artifacts', `opl-first-run-${stamp}`);
  }
  if (options.runtimeProfile === 'full' && options.assistantRouteSmoke) {
    resolveMasQualificationProvisioningReceipt(options.masStudyProvisioningReceipt, options.assistantWorkspace);
  }
  assertBootstrapLaunchDiagnosticsOptions(options);
  return options;
}

function shouldVerifyFullFirstRunEquivalence(runtimeProfile) {
  return runtimeProfile === 'full';
}

function assertBootstrapLaunchDiagnosticsOptions(options) {
  if (!options.bootstrapLaunchDiagnostics) return;
  if (
    options.settingsSmoke ||
    options.assistantRouteSmoke ||
    options.codexFunctionalCheck ||
    options.codexAiSelfCheck
  ) {
    throw new Error('--bootstrap-launch-diagnostics cannot be combined with secondary release smokes.');
  }
  if (options.requireCodexConfigWizard) {
    throw new Error('--bootstrap-launch-diagnostics cannot require the Codex configuration wizard.');
  }
}

function resolveOplProbeTimeoutMs(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_OPL_PROBE_TIMEOUT_MS;
  return Math.max(1_000, Math.min(DEFAULT_OPL_PROBE_TIMEOUT_MS, Math.floor(timeoutMs)));
}

function boundTimeoutToHostDeadline(timeoutMs, hostDeadlineEpochMs, label = 'phase', nowMs = Date.now()) {
  if (!Number.isFinite(hostDeadlineEpochMs) || hostDeadlineEpochMs <= 0) return timeoutMs;
  const remainingMs = Math.floor(hostDeadlineEpochMs - nowMs - HOST_DEADLINE_SAFETY_MARGIN_MS);
  if (remainingMs <= 0) {
    throw new Error(`${label} timed out before starting because the host SSH deadline safety margin was exhausted.`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return remainingMs;
  return Math.min(timeoutMs, remainingMs);
}

function withPhaseTimeout(options, timeoutMs, label = 'phase') {
  return { ...options, timeoutMs: boundTimeoutToHostDeadline(timeoutMs, options.hostDeadlineEpochMs, label) };
}

function readCodexApiKey(options) {
  if (!options.codexApiKeyFile) return null;
  const key = fs.readFileSync(options.codexApiKeyFile, 'utf8').trim();
  if (!key) throw new Error(`Codex API key file is empty: ${options.codexApiKeyFile}`);
  return key;
}

function validateCodexInstallPreseedOptions(options) {
  if (options.codexPackageTarball) {
    let stats;
    try {
      stats = fs.statSync(options.codexPackageTarball);
    } catch (_) {
      throw new Error(`--codex-package-tarball does not exist: ${options.codexPackageTarball}`);
    }
    if (!stats.isFile()) {
      throw new Error(`--codex-package-tarball must be a file: ${options.codexPackageTarball}`);
    }
  }
  if (options.codexPlatformPackageTarball) {
    let stats;
    try {
      stats = fs.statSync(options.codexPlatformPackageTarball);
    } catch (_) {
      throw new Error(`--codex-platform-package-tarball does not exist: ${options.codexPlatformPackageTarball}`);
    }
    if (!stats.isFile()) {
      throw new Error(`--codex-platform-package-tarball must be a file: ${options.codexPlatformPackageTarball}`);
    }
  }
  if (options.codexNpmCacheDir) {
    let stats;
    try {
      stats = fs.statSync(options.codexNpmCacheDir);
    } catch (_) {
      throw new Error(`--codex-npm-cache-dir does not exist: ${options.codexNpmCacheDir}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`--codex-npm-cache-dir must be a directory: ${options.codexNpmCacheDir}`);
    }
  }
}

function hashFile(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function directorySizeBytes(root) {
  if (!root || !fs.existsSync(root)) return null;
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stats = fs.lstatSync(current);
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    } else if (stats.isFile()) {
      total += stats.size;
    }
  }
  return total;
}

function safePreseedFileDiagnostics(filePath, expectedKind) {
  if (!filePath) {
    return {
      present: false,
      basename: null,
      type: null,
      size_bytes: null,
      sha256: null,
    };
  }
  const stats = fs.statSync(filePath);
  const isFile = stats.isFile();
  const isDirectory = stats.isDirectory();
  return {
    present: expectedKind === 'file' ? isFile : isDirectory,
    basename: path.basename(filePath),
    type: isFile ? 'file' : isDirectory ? 'directory' : 'other',
    size_bytes: isFile ? stats.size : directorySizeBytes(filePath),
    sha256: isFile ? hashFile(filePath) : null,
  };
}

function codexInstallPreseedDiagnostics(options) {
  const packageTarball = safePreseedFileDiagnostics(options.codexPackageTarball, 'file');
  const platformPackageTarball = safePreseedFileDiagnostics(options.codexPlatformPackageTarball, 'file');
  const npmCacheDir = safePreseedFileDiagnostics(options.codexNpmCacheDir, 'directory');
  return {
    schema: 'opl_codex_install_preseed.v1',
    requested: Boolean(options.codexPackageTarball || options.codexPlatformPackageTarball || options.codexNpmCacheDir),
    package_tarball: packageTarball,
    platform_package_tarball: platformPackageTarball,
    npm_cache_dir: npmCacheDir,
    env: {
      opl_first_run_codex_package_tarball: Boolean(options.codexPackageTarball),
      opl_first_run_codex_platform_package_tarball: Boolean(options.codexPlatformPackageTarball),
      opl_first_run_codex_npm_cache_dir: Boolean(options.codexNpmCacheDir),
      npm_config_cache: Boolean(options.codexNpmCacheDir),
    },
  };
}

function buildCodexInstallPreseedEnv(options) {
  const env = {};
  if (options.codexPackageTarball) {
    env.OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL = options.codexPackageTarball;
  }
  if (options.codexPlatformPackageTarball) {
    env.OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL = options.codexPlatformPackageTarball;
  }
  if (options.codexNpmCacheDir) {
    env.OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR = options.codexNpmCacheDir;
    env.NPM_CONFIG_CACHE = options.codexNpmCacheDir;
    env.npm_config_cache = options.codexNpmCacheDir;
  }
  return env;
}

function installCodexPreseedLaunchEnvironment(options) {
  const env = buildCodexInstallPreseedEnv(options);
  const deadlineMs = phaseDeadlineMs(options.codexInstallPhaseTimeoutMs);
  for (const [key, value] of Object.entries(env)) {
    runWithDeadline('launchctl', ['setenv', key, value], deadlineMs, 'codex_install_preseed');
  }
  return codexInstallPreseedDiagnostics(options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    timeout: options.timeout,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      [
        `${command} ${args.join(' ')} timed out after ${options.timeout}ms`,
        result.stdout ? `stdout:\n${result.stdout}` : '',
        result.stderr ? `stderr:\n${result.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
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

function phaseDeadlineMs(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? Date.now() + timeoutMs : null;
}

function remainingPhaseTimeoutMs(deadlineMs, label) {
  if (!deadlineMs) return undefined;
  const remainingMs = Math.max(0, deadlineMs - Date.now());
  if (remainingMs <= 0) throw new Error(`${label} timed out before starting the next command.`);
  return remainingMs;
}

function runWithDeadline(command, args, deadlineMs, label, options = {}) {
  return run(command, args, { ...options, timeout: remainingPhaseTimeoutMs(deadlineMs, label) });
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseCfBundleExecutableFromPlistText(text) {
  const keyIndex = text.indexOf('<key>CFBundleExecutable</key>');
  if (keyIndex < 0) return null;
  const afterKey = text.slice(keyIndex + '<key>CFBundleExecutable</key>'.length);
  const match = afterKey.match(/<string>([\s\S]*?)<\/string>/);
  const value = match?.[1]?.trim();
  return value ? decodeXmlEntities(value) : null;
}

function readCfBundleExecutable(plistPath) {
  try {
    const parsed = parseCfBundleExecutableFromPlistText(fs.readFileSync(plistPath, 'utf8'));
    if (parsed) return parsed;
  } catch (_) {
    // Continue to the platform plist reader below.
  }
  if (process.platform === 'darwin') {
    const result = spawnSync('plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', plistPath], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    const value = result.status === 0 ? result.stdout?.trim() : '';
    if (value) return value;
  }
  return null;
}

function resolveAppExecutablePath(appPath) {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const executableName = readCfBundleExecutable(plistPath);
  const fallbackName = path.basename(appPath, '.app');
  const candidates = [executableName, fallbackName]
    .filter((name, index, names) => Boolean(name) && names.indexOf(name) === index)
    .map((name) => path.join(appPath, 'Contents', 'MacOS', name));
  const executablePath = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch (_) {
      return false;
    }
  });
  if (executablePath) return executablePath;
  throw new Error(
    `Could not resolve executable for ${appPath}. Checked:\n${candidates.length ? candidates.join('\n') : plistPath}`
  );
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

function userHomeDir() {
  return process.env.HOME || os.homedir();
}

function defaultFirstRunLogPath() {
  return path.join(userHomeDir(), 'Library', 'Logs', 'One Person Lab', 'first-run.jsonl');
}

function defaultOplStatePath() {
  return path.join(userHomeDir(), 'Library', 'Application Support', 'OPL', 'state');
}

function defaultOplRuntimeRoot() {
  return path.join(userHomeDir(), 'Library', 'Application Support', 'OPL', 'runtime');
}

function defaultAppSupportPath(processName = DEFAULT_PROCESS_NAME) {
  return path.join(userHomeDir(), 'Library', 'Application Support', processName);
}

function defaultMainBootstrapFatalLogCandidates(processName = DEFAULT_PROCESS_NAME) {
  const roots = [
    defaultAppSupportPath(processName),
    path.join(userHomeDir(), 'Library', 'Application Support', 'AionUi'),
    path.join(userHomeDir(), 'Library', 'Application Support', 'cn.onepersonlab.opl'),
  ];
  return [...new Set(roots)].map((root) => path.join(root, 'main-bootstrap-fatal.jsonl'));
}

function defaultCdpRegistryPath() {
  return path.join(userHomeDir(), '.opl-cdp-registry.json');
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

function mountDmg(dmgPath, options = {}) {
  const mountPoint = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-dmg-'));
  runWithDeadline(
    'hdiutil',
    ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint],
    options.deadlineMs,
    'install_dmg'
  );
  return mountPoint;
}

function detachDmg(mountPoint) {
  spawnSync('hdiutil', ['detach', mountPoint], { stdio: 'ignore' });
  fs.rmSync(mountPoint, { recursive: true, force: true });
}

function mountGuideDmg(dmgPath) {
  const stdout = run('hdiutil', ['attach', dmgPath, '-readonly']);
  const mountPoint = stdout
    .split(/\r?\n/)
    .map((line) => line.match(/(\/Volumes\/.+)$/)?.[1])
    .filter(Boolean)
    .at(-1);
  if (!mountPoint) throw new Error(`Could not resolve mounted DMG volume for ${dmgPath}`);
  return mountPoint;
}

function detachGuideDmg(mountPoint) {
  spawnSync('hdiutil', ['detach', mountPoint], { stdio: 'ignore' });
}

function installDmgApp(dmgPath, installDir, options = {}) {
  const deadlineMs = options.deadlineMs ?? phaseDeadlineMs(options.timeout);
  const mountPoint = mountDmg(dmgPath, { deadlineMs });
  try {
    const mountedApp = findAppBundle(mountPoint);
    if (!mountedApp) throw new Error(`No .app bundle found in ${dmgPath}`);
    const targetApp = path.join(installDir, path.basename(mountedApp));
    fs.rmSync(targetApp, { recursive: true, force: true });
    runWithDeadline('ditto', [mountedApp, targetApp], deadlineMs, 'install_dmg');
    spawnSync('xattr', ['-dr', 'com.apple.quarantine', targetApp], { stdio: 'ignore' });
    return targetApp;
  } finally {
    detachDmg(mountPoint);
  }
}

function readTextFileSnippet(filePath, maxBytes = 256 * 1024) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function compactDiagnosticText(value, maxLength = 1000) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function appendUniqueDiagnosticText(output, value, source, maxEntries = 24) {
  const text = compactDiagnosticText(value);
  if (!text || output.some((entry) => entry.text === text && entry.source === source)) return;
  output.push({ source, text });
  if (output.length > maxEntries) output.length = maxEntries;
}

function collectBootstrapFatalText(mainBootstrapFatalArtifacts) {
  const output = [];
  const copied = Array.isArray(mainBootstrapFatalArtifacts?.copied) ? mainBootstrapFatalArtifacts.copied : [];
  for (const entry of copied) {
    const target = entry?.target;
    if (!target || !fs.existsSync(target)) continue;
    const lines = readTextFileSnippet(target, 512 * 1024).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        appendUniqueDiagnosticText(output, record?.error?.message, 'main_bootstrap_fatal.error.message');
        appendUniqueDiagnosticText(output, record?.error?.stack, 'main_bootstrap_fatal.error.stack');
      } catch (_) {
        appendUniqueDiagnosticText(output, line, 'main_bootstrap_fatal.raw');
      }
    }
  }
  return output;
}

function collectLaunchLogText(launchLogDir) {
  const output = [];
  for (const [fileName, source] of [
    ['stderr.log', 'launch_stderr'],
    ['stdout.log', 'launch_stdout'],
  ]) {
    const filePath = path.join(launchLogDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    appendUniqueDiagnosticText(output, readTextFileSnippet(filePath, 128 * 1024), source, 8);
  }
  return output;
}

function collectNativeModalText(nativeWindow, bootstrapFatalText, launchLogText) {
  const output = [];
  for (const entry of Array.isArray(nativeWindow?.likely_alert_text) ? nativeWindow.likely_alert_text : []) {
    appendUniqueDiagnosticText(output, entry?.text, entry?.source || 'native_likely_alert');
  }
  for (const entry of Array.isArray(nativeWindow?.window_title_text) ? nativeWindow.window_title_text : []) {
    appendUniqueDiagnosticText(output, entry?.text, entry?.source || 'native_window_title');
  }
  for (const entry of Array.isArray(bootstrapFatalText) ? bootstrapFatalText : []) {
    appendUniqueDiagnosticText(output, entry?.text, entry?.source || 'main_bootstrap_fatal');
  }
  for (const entry of Array.isArray(launchLogText) ? launchLogText : []) {
    appendUniqueDiagnosticText(output, entry?.text, entry?.source || 'launch_log');
  }
  return output;
}

function fileContainsText(filePath, needle, chunkSize = 1024 * 1024) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const needleBuffer = Buffer.from(needle);
    const buffer = Buffer.alloc(chunkSize);
    let carry = Buffer.alloc(0);
    let position = 0;
    for (;;) {
      const bytesRead = fs.readSync(fd, buffer, 0, chunkSize, position);
      if (bytesRead <= 0) return false;
      const haystack = Buffer.concat([carry, buffer.subarray(0, bytesRead)]);
      if (haystack.includes(needleBuffer)) return true;
      carry = haystack.subarray(Math.max(0, haystack.length - needleBuffer.length + 1));
      position += bytesRead;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function detectPackagedMainBootstrap(appPath) {
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  const mainEntryPath = path.join(appPath, 'Contents', 'Resources', 'app.asar', 'out', 'main', 'index.js');
  const diagnostics = {
    schema: 'opl_packaged_app_bootstrap_marker.v1',
    app_path: appPath,
    app_asar_path: appAsarPath,
    app_asar_present: false,
    app_asar_type: null,
    app_asar_size_bytes: null,
    main_entry_path: mainEntryPath,
    main_entry_present: false,
    main_entry_size_bytes: null,
    main_entry_sha256: null,
    fatal_marker: MAIN_BOOTSTRAP_FATAL_MARKER,
    fatal_marker_present: false,
  };
  try {
    const appAsarStats = fs.statSync(appAsarPath);
    diagnostics.app_asar_present = true;
    diagnostics.app_asar_type = appAsarStats.isDirectory() ? 'directory' : appAsarStats.isFile() ? 'file' : 'other';
    diagnostics.app_asar_size_bytes = appAsarStats.isFile() ? appAsarStats.size : null;
    if (appAsarStats.isDirectory()) {
      const stats = fs.statSync(mainEntryPath);
      diagnostics.main_entry_present = stats.isFile();
      diagnostics.main_entry_size_bytes = stats.isFile() ? stats.size : null;
      if (stats.isFile()) {
        diagnostics.main_entry_sha256 = hashFile(mainEntryPath);
        diagnostics.fatal_marker_present = readTextFileSnippet(mainEntryPath).includes(MAIN_BOOTSTRAP_FATAL_MARKER);
      }
    } else if (appAsarStats.isFile()) {
      diagnostics.main_entry_present = true;
      diagnostics.fatal_marker_present = fileContainsText(appAsarPath, MAIN_BOOTSTRAP_FATAL_MARKER);
    }
  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message : String(error);
  }
  return diagnostics;
}

function assertPackagedMainBootstrap(appPath, artifactsDir) {
  const diagnostics = detectPackagedMainBootstrap(appPath);
  writeJsonArtifact(path.join(artifactsDir, 'packaged-app-bootstrap-marker.json'), diagnostics);
  if (!diagnostics.main_entry_present) {
    throw new Error(`Packaged App main entry is missing: ${diagnostics.main_entry_path}`);
  }
  if (!diagnostics.fatal_marker_present) {
    throw new Error(
      [
        'Packaged App does not include the main bootstrap fatal diagnostics marker.',
        `marker=${diagnostics.fatal_marker}`,
        `main_entry=${diagnostics.main_entry_path}`,
      ].join('\n')
    );
  }
  return diagnostics;
}

function captureGuideDmgWindow(dmgPath, target) {
  const mountPoint = mountGuideDmg(dmgPath);
  try {
    const mountedApp = findAppBundle(mountPoint);
    if (!mountedApp) throw new Error(`No .app bundle found in ${dmgPath}`);
    run('open', [mountPoint]);
    run('sleep', ['2']);
    const result = spawnSync('screencapture', ['-x', target], { stdio: 'ignore' });
    if (result.status !== 0) {
      throw new Error(`screencapture exited with ${result.status}`);
    }
    const systemPromptCleanup = [
      dismissGuideScreenCapturePermissionPrompt(),
      dismissGuideScreenCapturePermissionPrompt(),
    ];
    return {
      status: 'captured',
      target,
      source: mountPoint,
      system_prompt_cleanup: systemPromptCleanup,
      finder_window_setup: { status: 'skipped', reason: 'avoid_clean_vm_automation_permission_prompt' },
    };
  } finally {
    detachGuideDmg(mountPoint);
  }
}

function countQuarantineAttributes(target) {
  let count = 0;
  const stack = [target];
  while (stack.length > 0) {
    const current = stack.pop();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (_) {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    }
    const attr = spawnSync('xattr', ['-p', 'com.apple.quarantine', current], {
      encoding: 'utf8',
    });
    if (attr.status === 0) count += 1;
  }
  return count;
}

function buildLaunchAppArgs(appPath, options) {
  const args = buildLaunchExecutableArgs(options);
  return ['-n', appPath, '--args', ...args];
}

function buildLaunchExecutableArgs(options) {
  return ['--force-renderer-accessibility', `--aionui-cdp-port=${options.cdpPort}`];
}

function shouldPreservePackagedLaunchEnvKey(key) {
  return (
    PACKAGED_APP_LAUNCH_ENV_ALLOWLIST.has(key) ||
    PACKAGED_APP_LAUNCH_ENV_PREFIX_ALLOWLIST.some((prefix) => key.startsWith(prefix))
  );
}

function buildPackagedAppLaunchBaseEnv(sourceEnv = process.env) {
  const env = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (PACKAGED_APP_LAUNCH_ENV_BLOCKLIST.has(key)) continue;
    if (!shouldPreservePackagedLaunchEnvKey(key)) continue;
    if (typeof value !== 'string') continue;
    env[key] = value;
  }
  return env;
}

function buildPackagedTemporalAddressEnv(sourceEnv = process.env) {
  const explicitAddress = sourceEnv.OPL_TEMPORAL_ADDRESS?.trim();
  if (explicitAddress) {
    const explicitSource = sourceEnv.OPL_TEMPORAL_ADDRESS_SOURCE?.trim();
    return {
      OPL_TEMPORAL_ADDRESS: explicitAddress,
      ...(explicitSource && explicitSource !== 'packaged_local_default'
        ? { OPL_TEMPORAL_ADDRESS_SOURCE: explicitSource }
        : {}),
    };
  }
  const temporalAddress = sourceEnv.TEMPORAL_ADDRESS?.trim();
  if (temporalAddress) return { TEMPORAL_ADDRESS: temporalAddress };
  const customServiceCommand = sourceEnv.OPL_TEMPORAL_SERVICE_START_COMMAND?.trim();
  if (customServiceCommand) return { OPL_TEMPORAL_SERVICE_START_COMMAND: customServiceCommand };
  return {
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
    OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
  };
}

function resolvePackagedRuntimeStateRoot(sourceEnv = process.env) {
  const explicitStateDir = sourceEnv.OPL_STATE_DIR?.trim();
  if (explicitStateDir) return path.resolve(explicitStateDir);
  const dataDir = sourceEnv.OPL_DATA_DIR?.trim() || sourceEnv.AIONUI_DATA_DIR?.trim();
  if (dataDir) return path.join(path.resolve(dataDir), 'opl', 'state');
  const homeDir = sourceEnv.HOME?.trim() || os.homedir();
  return path.join(homeDir, 'Library', 'Application Support', 'OPL', 'state');
}

function resolvePackagedPythonCacheRoot(sourceEnv = process.env) {
  const explicit = sourceEnv.OPL_FULL_RUNTIME_PYCACHE_ROOT?.trim();
  return path.resolve(
    explicit || path.join(resolvePackagedRuntimeStateRoot(sourceEnv), 'full-runtime', 'python-cache')
  );
}

function buildPackagedPythonRuntimeEnv(sourceEnv = process.env) {
  return {
    OPL_FULL_RUNTIME_PYCACHE_ROOT: resolvePackagedPythonCacheRoot(sourceEnv),
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: resolvePackagedPythonCacheRoot(sourceEnv),
  };
}

function buildLaunchAppEnv(options, sourceEnv = process.env) {
  return {
    ...buildPackagedAppLaunchBaseEnv(sourceEnv),
    ...buildPackagedTemporalAddressEnv(sourceEnv),
    ...buildPackagedPythonRuntimeEnv(sourceEnv),
    AIONUI_CDP_PORT: String(options.cdpPort),
    ...buildCodexInstallPreseedEnv(options),
  };
}

function launchEnvDiagnostics(env) {
  const inheritedKeys = Object.keys(env).sort();
  return {
    AIONUI_CDP_PORT: env.AIONUI_CDP_PORT ?? null,
    OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: Boolean(env.OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL),
    OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: Boolean(env.OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL),
    OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: Boolean(env.OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR),
    NPM_CONFIG_CACHE: Boolean(env.NPM_CONFIG_CACHE),
    PYTHONDONTWRITEBYTECODE: env.PYTHONDONTWRITEBYTECODE ?? null,
    PYTHONPYCACHEPREFIX: env.PYTHONPYCACHEPREFIX ?? null,
    inherited_keys: inheritedKeys,
    blocked_keys_present: [...PACKAGED_APP_LAUNCH_ENV_BLOCKLIST].filter((key) => Object.hasOwn(env, key)).sort(),
  };
}

function launchApp(appPath, options) {
  const deadlineMs = phaseDeadlineMs(options.codexInstallPhaseTimeoutMs);
  const launchEnv = buildLaunchAppEnv(options);
  for (const [key, value] of Object.entries(launchEnvDiagnostics(launchEnv)).filter(
    ([, value]) => typeof value === 'string'
  )) {
    runWithDeadline('launchctl', ['setenv', key, value], deadlineMs, 'launch_app');
  }
  for (const [key, value] of Object.entries(buildCodexInstallPreseedEnv(options))) {
    runWithDeadline('launchctl', ['setenv', key, value], deadlineMs, 'launch_app');
  }
  const executablePath = resolveAppExecutablePath(appPath);
  const launchArgs = buildLaunchExecutableArgs(options);
  const launchLogDir = path.join(options.artifacts, 'launch-app');
  fs.mkdirSync(launchLogDir, { recursive: true });
  const stdoutPath = path.join(launchLogDir, 'stdout.log');
  const stderrPath = path.join(launchLogDir, 'stderr.log');
  const stdout = fs.openSync(stdoutPath, 'a');
  const stderr = fs.openSync(stderrPath, 'a');
  let child;
  try {
    child = spawn(executablePath, launchArgs, {
      cwd: path.dirname(executablePath),
      detached: true,
      env: launchEnv,
      stdio: ['ignore', stdout, stderr],
    });
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
  child.unref();
  writeJsonArtifact(path.join(launchLogDir, 'launch.json'), {
    schema: 'opl_packaged_gui_launch.v1',
    strategy: 'direct_app_executable',
    app_path: appPath,
    executable_path: executablePath,
    args: launchArgs,
    open_args_reference: buildLaunchAppArgs(appPath, options),
    pid: child.pid ?? null,
    detached: true,
    env: launchEnvDiagnostics(launchEnv),
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
  });
}

function verifyGatekeeperLaunchPolicy(appPath, artifactsDir, hooks = {}) {
  const runCommand = hooks.spawnSync ?? spawnSync;
  const codesign = runCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    encoding: 'utf8',
  });
  const spctl = runCommand('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath], {
    encoding: 'utf8',
  });
  const quarantineAttributeCount = countQuarantineAttributes(appPath);
  const localAuthorizationStatus =
    codesign.status === 0 ? (spctl.status === 0 ? 'passed' : 'rejected_allowed_unsigned') : 'failed_allowed_unsigned';
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, 'gatekeeper-launch-policy.json'),
    `${JSON.stringify(
      {
        schema: 'opl_gatekeeper_launch_policy.v1',
        app_path: appPath,
        gatekeeper_required: false,
        quarantine_removal_required: true,
        quarantine_status: quarantineAttributeCount === 0 ? 'absent' : 'present',
        quarantine_attribute_count: quarantineAttributeCount,
        local_authorization_status: localAuthorizationStatus,
        codesign: {
          status: codesign.status,
          stdout: codesign.stdout ?? '',
          stderr: codesign.stderr ?? codesign.error?.message ?? '',
        },
        spctl: {
          status: spctl.status,
          stdout: spctl.stdout ?? '',
          stderr: spctl.stderr ?? spctl.error?.message ?? '',
        },
      },
      null,
      2
    )}\n`
  );
  if (quarantineAttributeCount !== 0) {
    throw new Error(
      [
        'Stable local authorization failed to clear quarantine before first launch.',
        `quarantine_attribute_count=${quarantineAttributeCount}`,
        `codesign status=${codesign.status}`,
        codesign.stdout ? `codesign stdout:\n${codesign.stdout}` : '',
        codesign.stderr ? `codesign stderr:\n${codesign.stderr}` : '',
        `spctl status=${spctl.status}`,
        spctl.stdout ? `spctl stdout:\n${spctl.stdout}` : '',
        spctl.stderr ? `spctl stderr:\n${spctl.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  const blockingCodesignFailure = codesign.status !== 0;
  if (blockingCodesignFailure) {
    throw new Error(
      [
        'Packaged Full App failed the blocking deep codesign verification before first launch.',
        `codesign status=${codesign.status}`,
        codesign.stdout ? `codesign stdout:\n${codesign.stdout}` : '',
        codesign.stderr ? `codesign stderr:\n${codesign.stderr}` : '',
        `receipt=${path.join(artifactsDir, 'gatekeeper-launch-policy.json')}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

function inspectPackagedPythonBytecode(appPath) {
  const paths = [];
  const errors = [];
  const stack = [appPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      errors.push({ path: current, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (stat.isSymbolicLink()) {
      if (path.basename(current) === '__pycache__' || /\.(?:pyc|pyo)$/i.test(path.basename(current))) {
        paths.push(current);
      }
      continue;
    }
    if (stat.isDirectory()) {
      if (path.basename(current) === '__pycache__') paths.push(current);
      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (error) {
        errors.push({ path: current, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      for (const entry of entries) stack.push(path.join(current, entry.name));
      continue;
    }
    if (stat.isFile() && /\.(?:pyc|pyo)$/i.test(path.basename(current))) paths.push(current);
  }
  return { paths: paths.sort(), errors };
}

function verifyPackagedRuntimeIntegrity(appPath, artifactsDir, hooks = {}) {
  const runCommand = hooks.spawnSync ?? spawnSync;
  const phase = hooks.phase ?? 'post_runtime_smoke';
  const receiptName = hooks.receiptName ?? 'packaged-runtime-integrity.json';
  const checkedAfterRuntimeSmoke = hooks.checkedAfterRuntimeSmoke ?? true;
  const pythonBytecode = inspectPackagedPythonBytecode(appPath);
  const codesign = runCommand('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], {
    encoding: 'utf8',
  });
  const spctl = runCommand('spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath], {
    encoding: 'utf8',
  });
  const spctlStatus =
    codesign.status === 0 ? (spctl.status === 0 ? 'passed' : 'rejected_allowed_unsigned') : 'failed_allowed_unsigned';
  const receipt = {
    schema: 'opl_packaged_runtime_integrity.v1',
    app_path: appPath,
    phase,
    status:
      pythonBytecode.errors.length === 0 && pythonBytecode.paths.length === 0 && codesign.status === 0
        ? 'passed'
        : 'failed',
    python_bytecode: {
      forbidden_path_count: pythonBytecode.paths.length,
      forbidden_paths: pythonBytecode.paths,
      inspection_errors: pythonBytecode.errors,
    },
    codesign: {
      status: codesign.status,
      stdout: codesign.stdout ?? '',
      stderr: codesign.stderr ?? codesign.error?.message ?? '',
    },
    spctl: {
      status: spctl.status,
      policy_status: spctlStatus,
      stdout: spctl.stdout ?? '',
      stderr: spctl.stderr ?? spctl.error?.message ?? '',
    },
    checked_after_configure_codex: phase === 'post_configure_pre_launch',
    checked_before_first_launch: phase === 'post_configure_pre_launch' || phase === 'pre_launch',
    checked_after_runtime_smoke: checkedAfterRuntimeSmoke,
    checked_after_restart: phase === 'post_runtime_and_restart',
  };
  fs.mkdirSync(artifactsDir, { recursive: true });
  const receiptPath = path.join(artifactsDir, receiptName);
  writeJsonArtifact(receiptPath, receipt);
  if (receipt.status !== 'passed') {
    throw new Error(
      [
        `Packaged Full runtime integrity gate failed during ${phase}.`,
        `forbidden_python_bytecode=${pythonBytecode.paths.length}`,
        `inspection_errors=${pythonBytecode.errors.length}`,
        `codesign status=${codesign.status}`,
        `spctl status=${spctl.status}`,
        `receipt=${receiptPath}`,
        pythonBytecode.paths.length ? `forbidden paths:\n${pythonBytecode.paths.join('\n')}` : '',
        pythonBytecode.errors.length ? `inspection errors:\n${JSON.stringify(pythonBytecode.errors)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return receipt;
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

function readJsonRecord(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function isUsableFullRuntimeHome(runtimeHome) {
  return Boolean(runtimeHome && fs.existsSync(path.join(runtimeHome, 'bin', 'opl')));
}

function resolveManifestRuntimeHome(payloadRoot, manifest) {
  const candidates = [];
  for (const key of ['runtime_home', 'runtimeHome']) {
    const value = typeof manifest?.[key] === 'string' ? manifest[key].trim() : '';
    if (value) {
      candidates.push(path.isAbsolute(value) ? value : path.join(payloadRoot, value));
    }
  }
  for (const key of ['runtime_path', 'runtimePath']) {
    const value = typeof manifest?.[key] === 'string' ? manifest[key].trim() : '';
    if (value) candidates.push(path.join(payloadRoot, value));
  }
  return candidates.find(isUsableFullRuntimeHome) ?? null;
}

function describePackagedFullRuntime(appPath) {
  const payloadRoot = appPath ? path.join(appPath, 'Contents', 'Resources', FULL_RUNTIME_RESOURCE_DIR) : null;
  const manifestPath = payloadRoot ? path.join(payloadRoot, 'manifest', FULL_RUNTIME_MANIFEST) : null;
  const manifest = manifestPath ? readJsonRecord(manifestPath) : null;
  const directRuntimeHome = payloadRoot ? path.join(payloadRoot, 'runtime', 'current') : null;
  const manifestRuntimeHome = payloadRoot && manifest ? resolveManifestRuntimeHome(payloadRoot, manifest) : null;
  const runtimeHome = [directRuntimeHome, manifestRuntimeHome].find(isUsableFullRuntimeHome) ?? null;
  const oplPath = runtimeHome ? path.join(runtimeHome, 'bin', 'opl') : null;
  let missingReason = null;
  if (runtimeHome) {
    missingReason = null;
  } else if (!appPath) {
    missingReason = 'missing_app_path';
  } else if (!fs.existsSync(appPath)) {
    missingReason = 'missing_app_bundle';
  } else if (!payloadRoot || !fs.existsSync(payloadRoot)) {
    missingReason = 'missing_full_runtime_resource';
  } else if (!manifest) {
    missingReason = 'missing_or_invalid_manifest';
  } else {
    missingReason = 'missing_runtime_current_opl';
  }

  return {
    status: runtimeHome ? 'found' : 'missing',
    app_path: appPath ?? null,
    resource_root: payloadRoot,
    manifest_path: manifestPath,
    manifest_present: Boolean(manifest),
    runtime_home: runtimeHome,
    opl_path: oplPath,
    missing_reason: missingReason,
  };
}

function resolveFullRuntimeForSmoke(options = {}) {
  const packaged = describePackagedFullRuntime(options.appPath);
  if (packaged.runtime_home) return { ...packaged, source: 'packaged_app_resource' };
  if (options.appPath) return { ...packaged, source: null };
  const activeRuntimeHome = findLatestFullRuntimeHome();
  return {
    ...packaged,
    status: activeRuntimeHome ? 'found' : packaged.status,
    source: activeRuntimeHome ? 'activated_runtime_home' : null,
    runtime_home: activeRuntimeHome,
    opl_path: activeRuntimeHome ? path.join(activeRuntimeHome, 'bin', 'opl') : packaged.opl_path,
  };
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
    `export OPL_FULL_RUNTIME_PYCACHE_ROOT=${shellQuote(toRuntimeShellPath(resolvePackagedPythonCacheRoot()))}`,
    'export PYTHONDONTWRITEBYTECODE="1"',
    `export PYTHONPYCACHEPREFIX=${shellQuote(toRuntimeShellPath(resolvePackagedPythonCacheRoot()))}`,
    `export OPL_PREFILLED_NODE_MODULES_DIR=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'opl', 'node_modules')))}`,
    `export OPL_PACKAGED_SKILLS_ROOT=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'skills')))}`,
    `export OPL_MODULE_PATH_MEDAUTOSCIENCE=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'mas')))}`,
    `export OPL_MODULE_PATH_MEDAUTOGRANT=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'mag')))}`,
    `export OPL_MODULE_PATH_REDCUBE=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'rca')))}`,
    `export OPL_MODULE_PATH_OPLMETAAGENT=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'meta-agent')))}`,
    `export OPL_MODULE_PATH_OPLBOOKFORGE=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'modules', 'bookforge')))}`,
    `export OPL_CODEX_BIN=${shellQuote(toRuntimeShellPath(path.join(runtimeHome, 'bin', 'codex')))}`,
    fs.existsSync(hermesBin) ? `export OPL_HERMES_BIN=${shellQuote(toRuntimeShellPath(hermesBin))}` : '',
    `export PATH=${shellQuote(pathEntries)}:"$PATH"`,
  ]
    .filter(Boolean)
    .join(' && ');
}

class OplJsonCommandError extends Error {
  constructor(message, diagnostics, rawOutput = null) {
    super(message);
    this.name = 'OplJsonCommandError';
    this.diagnostics = diagnostics;
    this.rawOutput = rawOutput;
  }
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
    const commandPath = path.join(runtimeHome, 'bin', command);
    const shellCommand = [buildFullRuntimeCommandPrefix(runtimeHome), [commandPath, ...args].map(shellQuote).join(' ')]
      .filter(Boolean)
      .join(' && ');
    const probe = spawnSync(runtimeShellExecutable(), ['-lc', shellCommand], {
      encoding: 'utf8',
    });
    if (probe.status !== 0) {
      const commandInfo = fs.existsSync(commandPath)
        ? {
            path: commandPath,
            mode: (fs.statSync(commandPath).mode & 0o777).toString(8),
          }
        : { path: commandPath, missing: true };
      throw new Error(
        `${command} is not callable from the Full runtime PATH: ${
          probe.stderr || probe.stdout || probe.error?.message || `status=${probe.status} signal=${probe.signal}`
        }\ncommand: ${shellCommand}\ncommand_info: ${JSON.stringify(commandInfo)}`
      );
    }
  };
  assertFullRuntimeToolCallable('officecli', ['--version']);
  assertFullRuntimeToolCallable('mineru-open-api', ['version']);
}

function isNonRetryableFullRuntimeEquivalenceError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return NON_RETRYABLE_FULL_RUNTIME_EQUIVALENCE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function probeCodexCli(options = {}) {
  const command = options.command || process.env.OPL_CODEX_BIN?.trim() || 'codex';
  const probe = spawnSync(command, ['--version'], {
    encoding: 'utf8',
  });
  const version = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim() || null;
  return {
    command,
    detected: probe.status === 0,
    version: probe.status === 0 ? version : null,
  };
}

function assistantRouteIds(assistantRouteSmoke) {
  return Array.isArray(assistantRouteSmoke)
    ? assistantRouteSmoke.map((assistant) => assistant?.id).filter((id) => typeof id === 'string')
    : [];
}

function buildCodexFunctionalCheckReceipt(input = {}) {
  const codexCliProbe = input.codexCliProbe ?? probeCodexCli();
  const runtimeProfile = input.runtimeProfile ?? 'full';
  const requiredAssistantRoutes = OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => target.id);
  const checkedAssistantRoutes = assistantRouteIds(input.assistantRouteSmoke);
  const assistantTargetsPresent = requiredAssistantRoutes.every((id) => checkedAssistantRoutes.includes(id));
  const standardLaunchGatesPassed =
    runtimeProfile === 'standard' &&
    assistantTargetsPresent &&
    input.assistantRouteSmoke.every(
      (assistant) =>
        assistant?.verification_mode === 'launch_gate' &&
        assistant?.launch_gate?.selectable_before_selection === true &&
        assistant?.launch_gate?.launch_allowed === false &&
        assistant?.launch_gate?.send_blocked === true &&
        assistant?.launch_gate?.repair_hint_visible === true
    );
  const assistantRoutesPassed = runtimeProfile === 'full' && assistantTargetsPresent;
  const deterministicFieldsPassed = runtimeProfile === 'standard' ? standardLaunchGatesPassed : assistantRoutesPassed;
  const hasCredentials = Boolean(input.codexApiKey);
  const status = hasCredentials
    ? deterministicFieldsPassed
      ? 'passed'
      : 'failed'
    : deterministicFieldsPassed
      ? 'diagnostic_skipped'
      : 'blocked_missing_codex_credentials';

  return {
    schema: 'opl_codex_functional_check_receipt.v1',
    status,
    runtime_profile: runtimeProfile,
    ui_language: 'zh-CN',
    opl_flow_context_expected: {
      status: 'passed',
      context_id: 'opl-flow',
      deterministic: true,
    },
    user_agents_policy: {
      status: 'passed',
      agents_override_allowed: false,
      policy: 'App-owned post-install Codex context is not overridden by user AGENTS instructions',
      deterministic: true,
    },
    codex_cli_invokable: {
      status: codexCliProbe.detected ? 'passed' : 'missing',
      detected: codexCliProbe.detected,
      command: codexCliProbe.command,
      version: codexCliProbe.version,
      deterministic: true,
    },
    assistant_route_receipts_checked: {
      status: runtimeProfile === 'full' ? (assistantRoutesPassed ? 'passed' : 'failed') : 'not_applicable_standard',
      required: requiredAssistantRoutes,
      checked: runtimeProfile === 'full' ? checkedAssistantRoutes : [],
      deterministic: true,
    },
    assistant_launch_gates_checked: {
      status: runtimeProfile === 'standard' ? (standardLaunchGatesPassed ? 'passed' : 'failed') : 'not_applicable_full',
      required: requiredAssistantRoutes,
      checked: runtimeProfile === 'standard' ? checkedAssistantRoutes : [],
      deterministic: true,
    },
    skills_or_plugins_policy_checked: {
      status: 'passed',
      companion_skills_policy: 'codex_visible_companion_skills',
      domain_routes_policy: 'plugin_visible_domain_routes_not_companion_skill_mirrors',
      domain_routes: FULL_PLUGIN_ONLY_DOMAIN_SKILLS.map(([skillId]) => skillId),
      deterministic: true,
    },
    blocking_release_gate: {
      stable_vm_gate: 'receipt_file_exists_and_deterministic_fields_passed',
      deterministic_fields_passed: deterministicFieldsPassed,
      llm_invocation_required: false,
    },
    future_codex_invocation: {
      status: hasCredentials ? 'not_invoked' : 'diagnostic_skipped',
      reason: hasCredentials ? 'deterministic_receipt_only' : 'missing_codex_credentials',
    },
  };
}

function assertCodexFunctionalCheckReceipt(receipt) {
  if (!receipt || receipt.schema !== 'opl_codex_functional_check_receipt.v1') {
    throw new Error('Codex functional check receipt is missing or has an unexpected schema.');
  }
  if (receipt.blocking_release_gate?.deterministic_fields_passed !== true) {
    throw new Error('Codex functional check deterministic fields did not pass.');
  }
  if (receipt.blocking_release_gate?.llm_invocation_required !== false) {
    throw new Error('Codex functional check must not require LLM invocation for the VM gate.');
  }
  if (!['passed', 'diagnostic_skipped'].includes(receipt.status)) {
    throw new Error(`Codex functional check has release-blocking status: ${receipt.status ?? 'missing'}`);
  }
}

function buildCodexAiSelfCheckPrompt(input = {}) {
  const evidence = {
    runtime_profile: input.runtimeProfile ?? 'unknown',
    ui_language: input.uiLanguage ?? 'follow_app_locale',
    core_first_launch: input.coreFirstLaunch ?? null,
    first_run: input.firstRun
      ? {
          saw_codex_wizard: Boolean(input.firstRun.sawCodexWizard),
          submitted_codex_wizard: Boolean(input.firstRun.submittedCodexWizard),
          existing_launch_fallback: input.firstRun.existingLaunchFallback === true,
        }
      : null,
    gui_ready: input.guiReady ?? null,
    assistant_route_smoke: input.assistantRouteSmoke ?? [],
    codex_functional_check: input.codexFunctionalCheck ?? null,
    settings_smoke: input.settingsSmoke ?? null,
  };
  const targetState = {
    app_installed_after_programmatic_initialization: true,
    codex_cli_callable: true,
    ui_language_policy: 'Follow the current App UI locale; use Chinese only when the UI locale is zh-CN.',
    opl_flow_context: 'Session-scoped opl-flow context should be enabled for App-created Codex conversations.',
    user_agents_md_policy:
      'Respect user AGENTS.md and do not overwrite it; detect conflicts instead of duplicating rules.',
    assistant_routes:
      'MAS/MAG/RCA should route through Codex CLI builtin capability receipts from the App home surface.',
    oma_policy:
      'OPL Meta Agent should remain available as an OPL family capability without becoming the default route.',
    skills_plugins: 'Codex-visible companion skills and domain plugin skills should remain visible after install.',
    module_update_skill_plugin_continuity:
      'After module auto-update, Codex plugins and skills should still be registered and callable.',
  };
  const responseSchema = {
    status: 'passed | failed | needs_attention',
    checks: {
      codex_cli_callable: { status: 'passed | failed | needs_attention', evidence: 'string' },
      ui_language_policy: { status: 'passed | failed | needs_attention', evidence: 'string' },
      opl_flow_context: { status: 'passed | failed | needs_attention', evidence: 'string' },
      agents_md_non_mutation: { status: 'passed | failed | needs_attention', evidence: 'string' },
      mas_mag_rca_routes: { status: 'passed | failed | needs_attention', evidence: 'string' },
      oma_available_not_default: { status: 'passed | failed | needs_attention', evidence: 'string' },
      skills_plugins_available: { status: 'passed | failed | needs_attention', evidence: 'string' },
      module_update_skill_plugin_continuity: { status: 'passed | failed | needs_attention', evidence: 'string' },
    },
    recommended_actions: ['string'],
    release_gate_recommendation: 'do_not_block | promote_after_repeated_passes | investigate_before_stable',
  };

  return [
    'One Person Lab post-install AI self-check',
    '',
    'Programmatic initialization has already run. Codex CLI is now expected to be usable.',
    'Read the evidence and judge whether the installed OPL working mode matches the target state.',
    'This is an AI-first inspection stage after deterministic setup; do not replace deterministic initialization.',
    input.mode === 'fix'
      ? 'You may suggest or perform only narrow, reversible fixes inside the current workspace if the environment allows writes.'
      : 'Do not modify user files. Diagnose only and return actionable recommendations.',
    'Never overwrite user AGENTS.md. If user rules conflict with App-managed opl-flow context, report the conflict.',
    'Output strict JSON only. Do not wrap it in Markdown.',
    '',
    'Target state:',
    JSON.stringify(targetState, null, 2),
    '',
    'Evidence:',
    JSON.stringify(evidence, null, 2),
    '',
    'Required JSON response shape:',
    JSON.stringify(responseSchema, null, 2),
    '',
    'Important terms that must be considered: opl-flow, MAS/MAG/RCA, user AGENTS.md, module_update_skill_plugin_continuity.',
  ].join('\n');
}

function parseCodexJsonOutput(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_) {
      return null;
    }
  }
}

function codexAiSelfCheckStatusFromParsed(parsed) {
  const status = typeof parsed?.status === 'string' ? parsed.status : '';
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'needs_attention') return 'needs_attention';
  return 'needs_attention';
}

function buildSkippedCodexAiSelfCheckReceipt(input = {}) {
  const reason = input.reason || (input.requested ? 'missing_codex_config' : 'not_requested');
  const status =
    reason === 'not_requested'
      ? 'skipped_not_requested'
      : reason === 'missing_codex_config'
        ? 'skipped_missing_codex_config'
        : 'skipped_missing_codex_config';
  const codexCliProbe = input.codexCliProbe ?? probeCodexCli();
  return {
    schema: 'opl_codex_ai_self_check_receipt.v1',
    status,
    mode: input.mode || 'diagnose',
    mutations_allowed: input.mode === 'fix',
    blocking_release_gate: false,
    codex_cli: {
      command: codexCliProbe.command,
      detected: codexCliProbe.detected,
      version: codexCliProbe.version,
    },
    skip_reason: reason,
  };
}

function buildCodexAiSelfCheckReceipt(input = {}) {
  const codexCliProbe = input.codexCliProbe ?? probeCodexCli();
  const result = input.result ?? {};
  const parsed = result.parsed ?? parseCodexJsonOutput(result.stdout);
  const parsedStatus = codexAiSelfCheckStatusFromParsed(parsed);
  const processStatus =
    result.status === 'error'
      ? 'error'
      : parsedStatus === 'passed'
        ? 'passed'
        : parsedStatus === 'failed'
          ? 'failed'
          : 'needs_attention';
  return {
    schema: 'opl_codex_ai_self_check_receipt.v1',
    status: processStatus,
    mode: input.mode || 'diagnose',
    mutations_allowed: input.mode === 'fix',
    blocking_release_gate: false,
    codex_cli: {
      command: codexCliProbe.command,
      detected: codexCliProbe.detected,
      version: codexCliProbe.version,
    },
    prompt_target_state: {
      programmatic_initialization_first: true,
      ai_first_post_install_inspection: true,
      user_agents_md_overwrite_allowed: false,
      module_update_skill_plugin_continuity_checked: true,
    },
    codex_result: {
      parsed_status: parsedStatus,
      output_path: result.outputPath ?? null,
      stderr_path: result.stderrPath ?? null,
      parsed,
    },
  };
}

function runCodexAiSelfCheck(input = {}) {
  const artifacts = input.artifacts || process.cwd();
  fs.mkdirSync(artifacts, { recursive: true });
  const codexCliProbe = input.codexCliProbe ?? probeCodexCli();
  if (!input.requested) {
    return buildSkippedCodexAiSelfCheckReceipt({
      requested: false,
      reason: 'not_requested',
      mode: input.mode,
      codexCliProbe,
    });
  }
  if (!codexCliProbe.detected) {
    return buildSkippedCodexAiSelfCheckReceipt({
      requested: true,
      reason: 'missing_codex_config',
      mode: input.mode,
      codexCliProbe,
    });
  }

  const prompt = buildCodexAiSelfCheckPrompt(input);
  const promptPath = path.join(artifacts, 'codex-ai-self-check-prompt.txt');
  const outputPath = path.join(artifacts, 'codex-ai-self-check-output.json');
  const stderrPath = path.join(artifacts, 'codex-ai-self-check-stderr.txt');
  writeTextArtifact(promptPath, prompt, input.secret);
  const result = spawnSync(
    codexCliProbe.command,
    [
      'exec',
      '--sandbox',
      input.mode === 'fix' ? 'workspace-write' : 'read-only',
      '--output-last-message',
      outputPath,
      '-',
    ],
    {
      cwd: input.cwd || os.homedir(),
      input: prompt,
      encoding: 'utf8',
      env: process.env,
      timeout: input.timeoutMs || 300_000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? result.error?.message ?? '';
  writeTextArtifact(stderrPath, stderr, input.secret);
  const rawOutput = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : stdout;
  writeTextArtifact(outputPath, rawOutput, input.secret);
  const parsed = parseCodexJsonOutput(rawOutput);
  return buildCodexAiSelfCheckReceipt({
    requested: true,
    mode: input.mode,
    codexCliProbe,
    prompt,
    result: {
      status: result.status === 0 ? 'completed' : 'error',
      stdout: rawOutput,
      stderr,
      parsed,
      outputPath,
      stderrPath,
    },
  });
}

function resolveManagedOplBin(homeDir = os.homedir()) {
  return path.join(homeDir, '.opl', 'one-person-lab', 'bin');
}

function resolveManagedNodeBin(homeDir = os.homedir(), platform = process.platform, arch = process.arch) {
  if (platform !== 'darwin') return null;
  const nodeArch = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : null;
  if (!nodeArch) return null;
  const nodeBin = path.join(homeDir, '.opl', 'toolchain', `node-${MANAGED_NODE_VERSION}-darwin-${nodeArch}`, 'bin');
  return fs.existsSync(path.join(nodeBin, 'node')) && fs.existsSync(path.join(nodeBin, 'npm')) ? nodeBin : null;
}

function normalizePathEntries(entries) {
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    if (!entry) continue;
    for (const part of String(entry).split(path.delimiter)) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized.join(path.delimiter);
}

function buildStandardBootstrapPathPrefix(homeDir = os.homedir()) {
  return normalizePathEntries([
    resolveManagedOplBin(homeDir),
    resolveManagedNodeBin(homeDir),
    path.join(homeDir, '.npm-global', 'bin'),
    path.join(homeDir, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    process.env.PATH,
  ]);
}

function resolvePackagedStandardInstaller(appPath) {
  if (!appPath) return null;
  const installerPath = path.join(appPath, 'Contents', 'Resources', STANDARD_BOOTSTRAP_RESOURCE);
  return fs.existsSync(installerPath) && fs.statSync(installerPath).isFile() ? installerPath : null;
}

function buildStandardBootstrapCommand(installerPath) {
  return {
    command: '/bin/bash',
    args: [installerPath, '--headless', '--skip-packages'],
    redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
  };
}

function resolveOplBootstrapMaxBufferBytes(value) {
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : OPL_BOOTSTRAP_MAX_BUFFER_BYTES;
}

function runPackagedStandardBootstrapForSmoke(appPath, options = {}) {
  const installerPath = resolvePackagedStandardInstaller(appPath);
  if (!installerPath) {
    return {
      status: 'missing_installer',
      app_path: appPath ?? null,
      installer_path: appPath ? path.join(appPath, 'Contents', 'Resources', STANDARD_BOOTSTRAP_RESOURCE) : null,
    };
  }

  const bootstrap = buildStandardBootstrapCommand(installerPath);
  const maxBufferBytes = resolveOplBootstrapMaxBufferBytes(options.bootstrapMaxBufferBytes);
  const result = spawnSync(bootstrap.command, bootstrap.args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...buildCodexInstallPreseedEnv(options),
      PATH: buildStandardBootstrapPathPrefix(),
    },
    timeout: Math.max(OPL_BOOTSTRAP_TIMEOUT_MS, Number(options.timeoutMs) || 0),
    maxBuffer: maxBufferBytes,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const errorCode = result.error?.code ?? null;
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command: bootstrap.redactedCommand,
    installer_path: installerPath,
    exit_status: result.status,
    signal: result.signal ?? null,
    timed_out: errorCode === 'ETIMEDOUT',
    max_buffer_bytes: maxBufferBytes,
    buffer_exhausted: errorCode === 'ENOBUFS',
    error_code: errorCode,
    error: result.error?.message ?? null,
    stdout,
    stdout_bytes: Buffer.byteLength(stdout),
    stderr,
    stderr_bytes: Buffer.byteLength(stderr),
  };
}

function buildOplJsonShellCommand(args, options = {}) {
  const runtimeProfile = options.runtimeProfile ?? 'standard';
  const fullRuntime = runtimeProfile === 'full' ? resolveFullRuntimeForSmoke(options) : null;
  const runtimeHome = fullRuntime?.runtime_home ?? null;
  const testOplCommandPath = process.env.NODE_ENV === 'test' ? options.__testOplCommandPath : null;
  const pathPrefix = buildStandardBootstrapPathPrefix();
  const commandArgs = [
    testOplCommandPath || (runtimeHome ? toRuntimeShellPath(path.join(runtimeHome, 'bin', 'opl')) : 'opl'),
    ...args,
  ];
  const command =
    runtimeHome || testOplCommandPath
      ? [buildFullRuntimeCommandPrefix(runtimeHome), commandArgs.map(shellQuote).join(' ')].filter(Boolean).join(' && ')
      : [
          pathPrefix ? `export PATH=${shellQuote(pathPrefix)}` : '',
          'OPL_RESOLVED_PATH=$(command -v opl) && [ -n "$OPL_RESOLVED_PATH" ]',
          commandArgs.map(shellQuote).join(' '),
        ]
          .filter(Boolean)
          .join(' && ');
  return { command, runtimeHome, fullRuntime };
}

function resolveOplCommandPath(options = {}) {
  if (process.env.NODE_ENV === 'test' && options.__testOplCommandPath) return options.__testOplCommandPath;
  const fullRuntime = options.runtimeProfile === 'full' ? resolveFullRuntimeForSmoke(options) : null;
  if (fullRuntime?.opl_path) return fullRuntime.opl_path;
  const result = spawnSync(runtimeShellExecutable(), ['-lc', 'command -v opl'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: buildStandardBootstrapPathPrefix() },
    timeout: 5_000,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function resolveOplJsonMaxBufferBytes(value) {
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : OPL_JSON_MAX_BUFFER_BYTES;
}

function summarizeCommandOutput(value, maxBytes = OPL_JSON_DIAGNOSTIC_INLINE_BYTES) {
  const text = String(value ?? '');
  const bytes = Buffer.byteLength(text);
  if (bytes <= maxBytes) return { text, bytes, truncated: false };
  const prefix = Buffer.from(text).subarray(0, maxBytes).toString('utf8');
  return {
    text: `${prefix}\n...[truncated ${bytes - maxBytes} bytes; see raw output artifact]`,
    bytes,
    truncated: true,
  };
}

function runOplJsonOnce(args, options = {}) {
  const { command, runtimeHome, fullRuntime } = buildOplJsonShellCommand(args, options);
  const maxBufferBytes = resolveOplJsonMaxBufferBytes(options.maxBufferBytes);
  const result = spawnSync(runtimeShellExecutable(), ['-lc', command], {
    encoding: 'utf8',
    env: { ...process.env, OPL_OUTPUT: 'json', PATH: buildStandardBootstrapPathPrefix() },
    input: options.input ?? undefined,
    timeout: resolveOplProbeTimeoutMs(options.timeoutMs),
    maxBuffer: maxBufferBytes,
  });
  return { command, runtimeHome, fullRuntime, maxBufferBytes, result };
}

function runOplJson(args, options = {}) {
  let bootstrapAttempt = null;
  let probe = runOplJsonOnce(args, options);
  if (probe.result.status !== 0 && !probe.runtimeHome && options.appPath && options.runtimeProfile !== 'full') {
    bootstrapAttempt = runPackagedStandardBootstrapForSmoke(options.appPath, options);
    if (bootstrapAttempt.status === 'passed') {
      probe = runOplJsonOnce(args, options);
    }
  }

  const { command, runtimeHome, maxBufferBytes, result } = probe;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const stdoutSummary = summarizeCommandOutput(stdout);
  const stderrSummary = summarizeCommandOutput(stderr);
  const errorCode = result.error?.code ?? null;
  const bufferExhausted = errorCode === 'ENOBUFS';
  const diagnostics = {
    schema: 'opl_vm_smoke_opl_command_error.v1',
    args,
    command: `opl ${args.join(' ')}`,
    shell_command: command,
    runtime_home: runtimeHome,
    full_packaged_runtime: probe.fullRuntime ?? null,
    standard_bootstrap: bootstrapAttempt,
    managed_opl_bin: resolveManagedOplBin(),
    managed_node_bin: resolveManagedNodeBin(),
    opl_path: resolveOplCommandPath(options),
    shell_executable: runtimeShellExecutable(),
    status: result.status,
    signal: result.signal ?? null,
    timed_out: errorCode === 'ETIMEDOUT',
    timeout_ms: resolveOplProbeTimeoutMs(options.timeoutMs),
    max_buffer_bytes: maxBufferBytes,
    buffer_exhausted: bufferExhausted,
    error_code: errorCode,
    stdout: stdoutSummary.text,
    stdout_bytes: stdoutSummary.bytes,
    stdout_truncated: stdoutSummary.truncated,
    stderr: stderrSummary.text,
    stderr_bytes: stderrSummary.bytes,
    stderr_truncated: stderrSummary.truncated,
    error: result.error?.message ?? null,
  };
  const rawOutput = { stdout, stderr };
  if (bufferExhausted) {
    throw new OplJsonCommandError(
      `opl ${args.join(' ')} exceeded the ${maxBufferBytes}-byte output buffer (ENOBUFS); ` +
        `captured stdout_bytes=${stdoutSummary.bytes} stderr_bytes=${stderrSummary.bytes}.\ncommand: ${command}`,
      diagnostics,
      rawOutput
    );
  }
  if (errorCode === 'ETIMEDOUT') {
    throw new OplJsonCommandError(
      [
        `opl ${args.join(' ')} timed out after ${resolveOplProbeTimeoutMs(options.timeoutMs)}ms.`,
        stdout ? `stdout:\n${stdoutSummary.text}` : '',
        stderr ? `stderr:\n${stderrSummary.text}` : '',
        `command: ${command}`,
      ]
        .filter(Boolean)
        .join('\n'),
      diagnostics,
      rawOutput
    );
  }
  if (result.status !== 0) {
    const output =
      stderrSummary.text || stdoutSummary.text || `status=${result.status} signal=${result.signal ?? 'none'}`;
    throw new OplJsonCommandError(
      `opl ${args.join(' ')} failed:\n${output}\ncommand: ${command}`,
      diagnostics,
      rawOutput
    );
  }
  return stdout;
}

function parseOplJsonResult(raw, args) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw ?? ''));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`opl ${args.join(' ')} returned invalid JSON: ${message}`);
  }
}

function configureCodexApiKeyForSmoke(options, codexApiKey) {
  if (!codexApiKey) {
    return {
      status: 'skipped',
      reason: 'missing_codex_api_key',
    };
  }
  const args = ['system', 'configure-codex', '--api-key-stdin', '--json'];
  const runOplJsonImpl = options.__testHooks?.runOplJson ?? runOplJson;
  const raw = runOplJsonImpl(args, {
    ...options,
    input: `${codexApiKey}\n`,
  });
  const parsed = parseOplJsonResult(raw, args);
  return {
    status: 'configured',
    command: 'opl system configure-codex --api-key-stdin --json',
    result: parsed,
  };
}

function collectAppReleaseRuntimeEvidence(options, secret) {
  const runOplJsonImpl = options.__testHooks?.runOplJson ?? runOplJson;
  const artifacts = [
    {
      path: 'app-state-summary.json',
      args: ['app', 'state', '--profile', 'fast', '--json'],
    },
    {
      path: 'app-state-full.json',
      args: ['app', 'state', '--profile', 'full', '--json'],
    },
    {
      path: 'drilldown-full.json',
      args: ['runtime', 'app-operator-drilldown', '--detail', 'full', '--json'],
    },
    {
      path: 'action-dry-run-result.json',
      args: ['app', 'action', 'execute', '--action', RELEASE_EVIDENCE_ACTION_ID, '--dry-run', '--json'],
    },
    {
      path: 'action-execute-result.json',
      args: ['app', 'action', 'execute', '--action', RELEASE_EVIDENCE_ACTION_ID, '--json'],
    },
  ];
  const written = [];
  for (const artifact of artifacts) {
    const raw = runOplJsonImpl(artifact.args, { ...options, timeoutMs: options.timeoutMs });
    writeJsonArtifact(path.join(options.artifacts, artifact.path), parseOplJsonResult(raw, artifact.args), secret);
    written.push(artifact.path);
  }
  const summary = {
    surface_id: 'opl_app_release_runtime_evidence',
    status: 'passed',
    action_id: RELEASE_EVIDENCE_ACTION_ID,
    artifacts: written,
  };
  writeJsonArtifact(path.join(options.artifacts, 'app-release-runtime-evidence-summary.json'), summary, secret);
  return {
    status: summary.status,
    action_id: summary.action_id,
    artifacts: written,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expectedOplStateDir() {
  return process.env.OPL_STATE_DIR?.trim() || defaultOplStatePath();
}

function temporalSupervisorPlistPath() {
  return path.join(userHomeDir(), 'Library', 'LaunchAgents', `${TEMPORAL_SERVICE_SUPERVISOR_LABEL}.plist`);
}

function expectedTemporalDatabasePath() {
  return path.join(expectedOplStateDir(), 'family-runtime', 'temporal-server', 'temporal.sqlite');
}

function temporalLifecycleFromFastState(payload) {
  const appState = isRecord(payload?.app_state) ? payload.app_state : null;
  const provider = isRecord(appState?.provider) ? appState.provider : null;
  const temporal = isRecord(provider?.temporal) ? provider.temporal : null;
  const details = isRecord(temporal?.details) ? temporal.details : null;
  const workerReadiness = isRecord(details?.worker_readiness) ? details.worker_readiness : null;
  const lifecycle = isRecord(workerReadiness?.temporal_service_lifecycle)
    ? workerReadiness.temporal_service_lifecycle
    : null;
  const supervisor = isRecord(lifecycle?.supervisor) ? lifecycle.supervisor : null;
  if (!temporal || !workerReadiness || !lifecycle || !supervisor) {
    throw new Error('Fast App state is missing the Temporal service supervisor projection.');
  }
  return { temporal, workerReadiness, lifecycle, supervisor };
}

function assertTemporalSupervisorReady(payload, phase) {
  const state = temporalLifecycleFromFastState(payload);
  const errors = [];
  const expectedDatabase = expectedTemporalDatabasePath();
  if (state.workerReadiness.service_ready !== true) errors.push('service_ready is not true');
  if (state.workerReadiness.server_reachable !== true) errors.push('server_reachable is not true');
  if (state.supervisor.supported !== true) errors.push('supervisor.supported is not true');
  if (state.supervisor.applicable !== true) errors.push('supervisor.applicable is not true');
  if (state.supervisor.required !== true) errors.push('supervisor.required is not true');
  if (state.supervisor.installed !== true) errors.push('supervisor.installed is not true');
  if (state.supervisor.loaded !== true) errors.push('supervisor.loaded is not true');
  if (state.supervisor.ready !== true) errors.push('supervisor.ready is not true');
  if (state.supervisor.configuration_current !== true) errors.push('supervisor.configuration_current is not true');
  if (state.supervisor.process_state !== 'running') errors.push(`process_state is ${state.supervisor.process_state}`);
  if (!Number.isSafeInteger(state.supervisor.pid) || state.supervisor.pid <= 0) {
    errors.push(`pid is ${state.supervisor.pid}`);
  }
  if (state.supervisor.error !== null) errors.push(`error is ${state.supervisor.error}`);
  if (state.supervisor.run_at_load !== true) errors.push('run_at_load is not true');
  if (state.supervisor.keep_alive !== true) errors.push('keep_alive is not true');
  if (state.supervisor.schedule_independent !== true) errors.push('schedule_independent is not true');
  if (state.supervisor.database_path !== expectedDatabase) {
    errors.push(`database_path is ${state.supervisor.database_path}; expected ${expectedDatabase}`);
  }
  if (errors.length > 0) {
    throw new Error(`Temporal supervisor ${phase} readback is not ready: ${errors.join('; ')}`);
  }
  return state;
}

function summarizeTemporalSupervisorReadback(state) {
  return {
    service_ready: state.workerReadiness.service_ready,
    server_reachable: state.workerReadiness.server_reachable,
    service_status: state.lifecycle.service_status,
    supervisor: {
      surface_kind: state.supervisor.surface_kind,
      status: state.supervisor.status,
      installed: state.supervisor.installed,
      loaded: state.supervisor.loaded,
      ready: state.supervisor.ready,
      observed_at: state.supervisor.observed_at,
      error: state.supervisor.error,
      supported: state.supervisor.supported,
      applicable: state.supervisor.applicable,
      required: state.supervisor.required,
      configuration_current: state.supervisor.configuration_current,
      process_state: state.supervisor.process_state,
      pid: state.supervisor.pid,
      last_exit_status: state.supervisor.last_exit_status,
      last_exit_signal: state.supervisor.last_exit_signal,
      run_at_load: state.supervisor.run_at_load,
      keep_alive: state.supervisor.keep_alive,
      throttle_interval_seconds: state.supervisor.throttle_interval_seconds,
      address: state.supervisor.address,
      database_path: state.supervisor.database_path,
      launcher_source: state.supervisor.launcher_source,
      schedule_independent: state.supervisor.schedule_independent,
    },
  };
}

function assertAppActionExecution(payload, actionId) {
  const execution = isRecord(payload?.app_action_execution) ? payload.app_action_execution : null;
  if (!execution || execution.action_id !== actionId || execution.dry_run !== false) {
    throw new Error(`Temporal maintenance action ${actionId} did not return a live App action execution receipt.`);
  }
  const result = isRecord(execution.result) ? execution.result : null;
  const service = isRecord(result?.family_runtime_service) ? result.family_runtime_service : null;
  const status = isRecord(service?.status) ? service.status : null;
  const supervisor = isRecord(status?.supervisor) ? status.supervisor : null;
  const errors = [];
  if (!service) errors.push('result.family_runtime_service is missing');

  if (actionId === TEMPORAL_SERVICE_START_ACTION_ID) {
    if (service?.action !== 'start') errors.push(`action is ${service?.action}`);
    if (!['started_supervised', 'already_running'].includes(service?.start_status)) {
      errors.push(`start_status is ${service?.start_status}`);
    }
  } else if (actionId === TEMPORAL_SERVICE_RESTART_ACTION_ID) {
    if (service?.action !== 'restart') errors.push(`action is ${service?.action}`);
    if (service?.restart_status !== 'restarted') errors.push(`restart_status is ${service?.restart_status}`);
    if (service?.ready !== true) errors.push('ready is not true');
    if (service?.supervisor_pid_changed !== true) errors.push('supervisor_pid_changed is not true');
    if (!Number.isSafeInteger(service?.previous_supervisor_pid) || service.previous_supervisor_pid <= 0) {
      errors.push(`previous_supervisor_pid is ${service?.previous_supervisor_pid}`);
    }
    if (!Number.isSafeInteger(service?.supervisor_pid) || service.supervisor_pid <= 0) {
      errors.push(`supervisor_pid is ${service?.supervisor_pid}`);
    }
    if (service?.previous_supervisor_pid === service?.supervisor_pid) {
      errors.push('supervisor_pid did not change');
    }
  }

  if (status?.service_status !== 'running') errors.push(`status.service_status is ${status?.service_status}`);
  if (status?.server_reachable !== true) errors.push('status.server_reachable is not true');
  if (supervisor?.required !== true) errors.push('status.supervisor.required is not true');
  if (supervisor?.ready !== true) errors.push('status.supervisor.ready is not true');
  if (supervisor?.error !== null) errors.push(`status.supervisor.error is ${supervisor?.error}`);
  if (errors.length > 0) {
    throw new Error(`Temporal maintenance action ${actionId} result is not ready: ${errors.join('; ')}`);
  }
  return {
    action_id: execution.action_id,
    dry_run: execution.dry_run,
    delegated_surface: execution.delegated_surface,
    result: execution.result,
  };
}

function runTemporalMaintenanceAction(actionId, options) {
  const args = ['app', 'action', 'execute', '--action', actionId, '--json'];
  const runOplJsonImpl = options.__testHooks?.runOplJson ?? runOplJson;
  return assertAppActionExecution(
    parseOplJsonResult(runOplJsonImpl(args, { ...options, timeoutMs: options.timeoutMs }), args),
    actionId
  );
}

function readTemporalSupervisorPlist(plistPath, options = {}) {
  if (options.__testHooks?.readTemporalSupervisorPlist) {
    return options.__testHooks.readTemporalSupervisorPlist(plistPath);
  }
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `Unable to read Temporal supervisor plist: ${result.stderr || result.error?.message || `status=${result.status}`}`
    );
  }
  return JSON.parse(result.stdout);
}

function assertTemporalSupervisorPlist(plist, plistPath) {
  const expectedDatabase = expectedTemporalDatabasePath();
  const programArguments = Array.isArray(plist?.ProgramArguments) ? plist.ProgramArguments : [];
  const databaseArgumentIndex = programArguments.indexOf('--db-filename');
  const errors = [];
  if (plist?.Label !== TEMPORAL_SERVICE_SUPERVISOR_LABEL) errors.push(`Label is ${plist?.Label}`);
  if (plist?.RunAtLoad !== true) errors.push('RunAtLoad is not true');
  if (plist?.KeepAlive !== true) errors.push('KeepAlive is not true');
  if (programArguments.length < 4) errors.push('ProgramArguments is incomplete');
  if (!programArguments.includes('server') || !programArguments.includes('start-dev')) {
    errors.push('ProgramArguments does not start the Temporal development server');
  }
  if (databaseArgumentIndex < 0 || programArguments[databaseArgumentIndex + 1] !== expectedDatabase) {
    errors.push(`ProgramArguments --db-filename is not ${expectedDatabase}`);
  }
  if (errors.length > 0) {
    throw new Error(`Temporal supervisor plist ${plistPath} is invalid: ${errors.join('; ')}`);
  }
  return {
    path: plistPath,
    label: plist.Label,
    program_arguments: programArguments,
    run_at_load: plist.RunAtLoad,
    keep_alive: plist.KeepAlive,
    database_path: programArguments[databaseArgumentIndex + 1],
  };
}

function inspectTemporalSqlite(databasePath, options = {}) {
  if (options.__testHooks?.inspectTemporalSqlite) {
    return options.__testHooks.inspectTemporalSqlite(databasePath);
  }
  const stat = fs.statSync(databasePath);
  const header = fs.readFileSync(databasePath).subarray(0, 16).toString('binary');
  return {
    path: databasePath,
    exists: stat.isFile(),
    size_bytes: stat.size,
    file_identity: `${stat.dev}:${stat.ino}`,
    sqlite_header_valid: header === 'SQLite format 3\u0000',
  };
}

function assertTemporalSqlite(databasePath, options = {}) {
  const inspection = inspectTemporalSqlite(databasePath, options);
  if (
    inspection.path !== expectedTemporalDatabasePath() ||
    inspection.exists !== true ||
    !Number.isFinite(inspection.size_bytes) ||
    inspection.size_bytes <= 0 ||
    inspection.sqlite_header_valid !== true ||
    typeof inspection.file_identity !== 'string' ||
    !inspection.file_identity
  ) {
    throw new Error(`Temporal persistent SQLite proof is invalid: ${JSON.stringify(inspection)}`);
  }
  return inspection;
}

function temporalSupervisorLaunchctlReceipt(args, options = {}) {
  if (options.__testHooks?.runTemporalSupervisorLaunchctl) {
    return options.__testHooks.runTemporalSupervisorLaunchctl(args);
  }
  const timeout = args[0] === 'bootstrap' ? TEMPORAL_SERVICE_SUPERVISOR_TRANSITION_TIMEOUT_MS : 10_000;
  const result = spawnSync('launchctl', args, { encoding: 'utf8', timeout });
  return {
    args,
    status: result.status ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function runTemporalSupervisorLaunchctl(args, options = {}) {
  const receipt = temporalSupervisorLaunchctlReceipt(args, options);
  if (!temporalSupervisorLaunchctlSucceeded(receipt)) {
    throw new Error(`launchctl ${args.join(' ')} failed: ${receipt.stderr || `status=${receipt.status}`}`);
  }
  return receipt;
}

function temporalSupervisorLaunchctlSucceeded(receipt) {
  return receipt?.status === 0 && receipt?.signal === null;
}

function temporalSupervisorBootstrapRetryable(receipt) {
  return /input\/output error|operation now in progress|resource busy|service .* already loaded/i.test(
    receipt?.stderr ?? ''
  );
}

async function reloadTemporalSupervisorSession(plistPath, options = {}) {
  const launchctlTarget = `gui/${process.getuid()}/${TEMPORAL_SERVICE_SUPERVISOR_LABEL}`;
  const launchctlDomain = `gui/${process.getuid()}`;
  const sleepImpl = options.__testHooks?.sleep ?? sleep;
  const monotonicNowMs = options.__testHooks?.monotonicNowMs ?? Date.now;
  const deadline = monotonicNowMs() + TEMPORAL_SERVICE_SUPERVISOR_TRANSITION_TIMEOUT_MS;
  const bootout = runTemporalSupervisorLaunchctl(['bootout', launchctlTarget], options);

  let unloadReadback = temporalSupervisorLaunchctlReceipt(['print', launchctlTarget], options);
  while (temporalSupervisorLaunchctlSucceeded(unloadReadback) && monotonicNowMs() < deadline) {
    await sleepImpl(TEMPORAL_SERVICE_SUPERVISOR_TRANSITION_POLL_MS);
    unloadReadback = temporalSupervisorLaunchctlReceipt(['print', launchctlTarget], options);
  }
  if (temporalSupervisorLaunchctlSucceeded(unloadReadback)) {
    throw new Error(`Timed out waiting for launchd to unload ${TEMPORAL_SERVICE_SUPERVISOR_LABEL}.`);
  }

  const bootstrapAttempts = [];
  while (true) {
    const receipt = temporalSupervisorLaunchctlReceipt(['bootstrap', launchctlDomain, plistPath], options);
    bootstrapAttempts.push(receipt);
    if (temporalSupervisorLaunchctlSucceeded(receipt)) {
      return {
        bootout,
        unload_readback: unloadReadback,
        bootstrap: receipt,
        bootstrap_attempts: bootstrapAttempts,
      };
    }
    if (!temporalSupervisorBootstrapRetryable(receipt) || monotonicNowMs() >= deadline) {
      throw new Error(
        `launchctl bootstrap ${launchctlDomain} ${plistPath} failed: ${receipt.stderr || `status=${receipt.status}`}`
      );
    }
    await sleepImpl(Math.min(TEMPORAL_SERVICE_SUPERVISOR_TRANSITION_POLL_MS, Math.max(0, deadline - monotonicNowMs())));
  }
}

function terminateTemporalSupervisorPid(pid, options = {}) {
  if (options.__testHooks?.terminateTemporalSupervisorPid) {
    return options.__testHooks.terminateTemporalSupervisorPid(pid);
  }
  process.kill(pid, 'SIGTERM');
  return { pid, signal: 'SIGTERM', status: 'sent' };
}

async function waitForTemporalSupervisorReady(options, phase, previousPid = null) {
  const startedAt = Date.now();
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 0, 15_000), 90_000);
  const runOplJsonImpl = options.__testHooks?.runOplJson ?? runOplJson;
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const args = ['app', 'state', '--profile', 'fast', '--json'];
      const payload = parseOplJsonResult(
        runOplJsonImpl(args, { ...options, timeoutMs: Math.min(timeoutMs, 30_000) }),
        args
      );
      const state = assertTemporalSupervisorReady(payload, phase);
      if (previousPid === null || state.supervisor.pid !== previousPid) {
        return { payload, state };
      }
      lastError = new Error(`Temporal supervisor ${phase} retained the previous PID ${previousPid}.`);
    } catch (error) {
      lastError = error;
    }
    await (options.__testHooks?.sleep ?? sleep)(1_000);
  }
  throw new Error(
    `Timed out waiting for Temporal supervisor ${phase}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function collectTemporalServiceSupervisorProof(options, secret) {
  if (options.runtimeProfile !== 'full') {
    return {
      schema: 'opl_temporal_service_supervisor_proof.v1',
      status: 'not_applicable_standard',
      runtime_profile: options.runtimeProfile,
      applicable: false,
      required: false,
    };
  }

  const startAction = runTemporalMaintenanceAction(TEMPORAL_SERVICE_START_ACTION_ID, options);
  const initial = await waitForTemporalSupervisorReady(options, 'after_start');
  const initialReadback = summarizeTemporalSupervisorReadback(initial.state);
  const plistPath = options.__testTemporalSupervisorPlistPath || temporalSupervisorPlistPath();
  const plist = assertTemporalSupervisorPlist(readTemporalSupervisorPlist(plistPath, options), plistPath);
  const initialDatabase = assertTemporalSqlite(initial.state.supervisor.database_path, options);

  const keepAliveTermination = terminateTemporalSupervisorPid(initial.state.supervisor.pid, options);
  const keepAliveRecovered = await waitForTemporalSupervisorReady(
    options,
    'after_keep_alive_recovery',
    initial.state.supervisor.pid
  );
  const keepAliveReadback = summarizeTemporalSupervisorReadback(keepAliveRecovered.state);
  const keepAliveDatabase = assertTemporalSqlite(keepAliveRecovered.state.supervisor.database_path, options);
  if (
    keepAliveDatabase.path !== initialDatabase.path ||
    keepAliveDatabase.file_identity !== initialDatabase.file_identity
  ) {
    throw new Error('Temporal KeepAlive recovery did not preserve the exact persistent SQLite file.');
  }

  const restartAction = runTemporalMaintenanceAction(TEMPORAL_SERVICE_RESTART_ACTION_ID, options);
  const restarted = await waitForTemporalSupervisorReady(
    options,
    'after_restart',
    keepAliveRecovered.state.supervisor.pid
  );
  const restartedReadback = summarizeTemporalSupervisorReadback(restarted.state);
  const restartedDatabase = assertTemporalSqlite(restarted.state.supervisor.database_path, options);
  if (
    restartedDatabase.path !== initialDatabase.path ||
    restartedDatabase.file_identity !== initialDatabase.file_identity
  ) {
    throw new Error('Temporal restart did not preserve the exact persistent SQLite file.');
  }

  const sessionReload = await reloadTemporalSupervisorSession(plistPath, options);
  const reloaded = await waitForTemporalSupervisorReady(
    options,
    'after_session_reload',
    restarted.state.supervisor.pid
  );
  const reloadedReadback = summarizeTemporalSupervisorReadback(reloaded.state);
  const reloadedDatabase = assertTemporalSqlite(reloaded.state.supervisor.database_path, options);
  if (
    reloadedDatabase.path !== initialDatabase.path ||
    reloadedDatabase.file_identity !== initialDatabase.file_identity
  ) {
    throw new Error('Temporal launchd session reload did not preserve the exact persistent SQLite file.');
  }

  const proof = {
    schema: 'opl_temporal_service_supervisor_proof.v1',
    status: 'passed',
    runtime_profile: 'full',
    applicable: true,
    required: true,
    supervisor_label: TEMPORAL_SERVICE_SUPERVISOR_LABEL,
    start_action: startAction,
    restart_action: restartAction,
    plist,
    initial_readback: initialReadback,
    keep_alive_recovery: {
      termination: keepAliveTermination,
      readback: keepAliveReadback,
    },
    restart_readback: restartedReadback,
    session_reload: {
      ...sessionReload,
      readback: reloadedReadback,
    },
    persistent_database: {
      path: initialDatabase.path,
      sqlite_header_valid: initialDatabase.sqlite_header_valid,
      initial_size_bytes: initialDatabase.size_bytes,
      file_identity: initialDatabase.file_identity,
      same_file_after_keep_alive_recovery: keepAliveDatabase.file_identity === initialDatabase.file_identity,
      same_file_after_restart: restartedDatabase.file_identity === initialDatabase.file_identity,
      same_file_after_session_reload: reloadedDatabase.file_identity === initialDatabase.file_identity,
    },
  };
  writeJsonArtifact(path.join(options.artifacts, 'temporal-service-supervisor-proof.json'), proof, secret);
  return proof;
}

function firstRunAccessibilityExpectedLabels() {
  return [
    DEFAULT_LABELS.window,
    DEFAULT_LABELS.progress,
    DEFAULT_LABELS.blockersList,
    DEFAULT_LABELS.codexApiKeyMethod,
    DEFAULT_LABELS.codexApiKeyInput,
    DEFAULT_LABELS.codexConfigureButton,
    DEFAULT_LABELS.deferredEntry,
    DEFAULT_LABELS.readyEntry,
    DEFAULT_LABELS.beginnerSummary,
    DEFAULT_LABELS.primaryAction,
    DEFAULT_LABELS.technicalDetailsToggle,
    DEFAULT_LABELS.guidEntry,
    ...usableEntryAccessibilityMarkers().flatMap((marker) => marker.candidates),
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

function treeNodeTextValues(node) {
  return [node.name, node.description, node.title, node.value, node.help]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function treeContainsTextCandidate(tree, candidate) {
  return tree.some((node) =>
    treeNodeTextValues(node).some((value) => value === candidate || value.includes(candidate))
  );
}

function usableEntryAccessibilityMarkers() {
  return OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => ({
    id: target.id,
    label: target.badge,
    candidates: [target.badge, `@${target.shortName}`, target.shortName],
  }));
}

function detectUsableEntryAccessibility(tree) {
  if (treeContainsLabel(tree, DEFAULT_LABELS.guidEntry)) {
    return {
      entryKind: 'guid',
      labels: [DEFAULT_LABELS.guidEntry],
    };
  }

  const assistantLabels = usableEntryAccessibilityMarkers()
    .map((marker) => ({
      id: marker.id,
      label: marker.label,
      matched: marker.candidates.find((candidate) => treeContainsTextCandidate(tree, candidate)) ?? null,
    }))
    .filter((marker) => marker.matched);
  if (assistantLabels.length === OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.length) {
    return {
      entryKind: 'assistant_home',
      labels: assistantLabels.map((marker) => marker.label),
      matchedLabels: assistantLabels.map((marker) => marker.matched),
    };
  }

  return null;
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

function oplJsonCommandDiagnostics(error, rawOutputArtifacts = null) {
  const diagnostics = error instanceof OplJsonCommandError && error.diagnostics ? error.diagnostics : null;
  return {
    schema: 'opl_vm_smoke_opl_command_error_artifact.v1',
    message: error instanceof Error ? error.message : String(error),
    diagnostics,
    raw_output_artifacts: rawOutputArtifacts,
  };
}

function writeOplJsonCommandErrorArtifacts(basePath, error, secret) {
  const rawOutputArtifacts = {};
  if (error instanceof OplJsonCommandError && error.rawOutput) {
    for (const stream of ['stdout', 'stderr']) {
      const content = String(error.rawOutput[stream] ?? '');
      if (!content) continue;
      const target = `${basePath}.${stream}.log`;
      writeTextArtifact(target, content, secret);
      rawOutputArtifacts[stream] = path.basename(target);
    }
  }
  writeTextArtifact(`${basePath}.error.txt`, error instanceof Error ? error.message : String(error), secret);
  writeJsonArtifact(
    `${basePath}.error.json`,
    oplJsonCommandDiagnostics(error, Object.keys(rawOutputArtifacts).length > 0 ? rawOutputArtifacts : null),
    secret
  );
  return rawOutputArtifacts;
}

function captureOplJsonCommandErrorArtifacts(basePath, error, secret) {
  if (!(error instanceof OplJsonCommandError)) return null;
  const diagnostics = error.diagnostics ?? {};
  const summary = {
    status: 'captured',
    artifact_error_txt: `${path.basename(basePath)}.error.txt`,
    artifact_error_json: `${path.basename(basePath)}.error.json`,
    command: diagnostics.command ?? null,
    status_code: diagnostics.status ?? null,
    signal: diagnostics.signal ?? null,
    timed_out: diagnostics.timed_out ?? null,
  };
  if ('error_code' in diagnostics) summary.error_code = diagnostics.error_code ?? null;
  if ('buffer_exhausted' in diagnostics) summary.buffer_exhausted = diagnostics.buffer_exhausted === true;
  if ('max_buffer_bytes' in diagnostics) summary.max_buffer_bytes = diagnostics.max_buffer_bytes ?? null;
  try {
    const rawOutputArtifacts = writeOplJsonCommandErrorArtifacts(basePath, error, secret);
    return Object.keys(rawOutputArtifacts).length > 0
      ? { ...summary, raw_output_artifacts: rawOutputArtifacts }
      : summary;
  } catch (writeError) {
    const fallback = `${basePath}.error.write-error.txt`;
    fs.writeFileSync(fallback, writeError instanceof Error ? writeError.message : String(writeError), 'utf8');
    return {
      ...summary,
      status: 'write_failed',
      artifact_write_error: path.basename(fallback),
    };
  }
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

function warmGuideScreenCapturePermission(guideDir) {
  const target = path.join(guideDir, '.screencapture-warmup.png');
  spawnSync('screencapture', ['-x', target], { stdio: 'ignore' });
  fs.rmSync(target, { force: true });
  const cleanup = dismissGuideScreenCapturePermissionPrompt();
  return { status: 'completed', cleanup };
}

function dismissGuideScreenCapturePermissionPrompt() {
  const result = spawnSync('pkill', ['-x', 'UserNotificationCenter'], {
    encoding: 'utf8',
    timeout: 2_000,
  });
  if (result.status === 0) {
    return { status: 'dismissed', method: 'pkill', process: 'UserNotificationCenter' };
  }
  if (result.status === 1) {
    return { status: 'not_found', method: 'pkill', process: 'UserNotificationCenter' };
  }
  return {
    status: 'failed_nonblocking',
    exit_status: result.status,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    method: 'pkill',
    process: 'UserNotificationCenter',
  };
}

function captureGuideBrowserReleaseScreenshot(target) {
  const releaseUrl =
    process.env.OPL_GUIDE_RELEASE_URL || 'https://github.com/gaofeng21cn/one-person-lab-app/releases/latest';
  dismissGuideScreenCapturePermissionPrompt();
  run('open', ['-a', 'Safari', releaseUrl]);
  run('osascript', [
    '-e',
    [
      'tell application "Safari"',
      'activate',
      'delay 4',
      'if (count of windows) > 0 then set bounds of front window to {0, 0, 1920, 1080}',
      'delay 1',
      'end tell',
    ].join('\n'),
  ]);
  const result = spawnSync('screencapture', ['-x', target], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(`screencapture exited with ${result.status}`);
  }
  const systemPromptCleanup = dismissGuideScreenCapturePermissionPrompt();
  return {
    status: 'captured',
    target,
    source: releaseUrl,
    system_prompt_cleanup: systemPromptCleanup,
  };
}

function copyGuideScreenshot(source, target) {
  if (!source || !fs.existsSync(source)) {
    return { status: 'missing_source', source, target };
  }
  copyArtifact(source, target);
  return { status: 'copied', source, target };
}

function isGuideScreenshotEntryReady(entry) {
  return ['captured', 'copied'].includes(entry?.status);
}

function guideScreenshotSources(artifactsDir) {
  const firstRunBeginner = path.join(artifactsDir, 'first-run-beginner.png');
  const codexWizard = path.join(artifactsDir, 'codex-config-wizard.png');
  return {
    firstRunAccessSetup: fs.existsSync(codexWizard) ? codexWizard : firstRunBeginner,
    firstRunReady: firstRunBeginner,
  };
}

function writeGuideScreenshotsSummary(options, entries, secret, diagnostics = {}) {
  const summary = {
    surface_id: 'opl_user_guide_vm_screenshots',
    status: entries.every(isGuideScreenshotEntryReady) ? 'passed' : 'partial',
    source: 'macos_tart_vm_1920x1080_zh',
    release_url:
      process.env.OPL_GUIDE_RELEASE_URL || 'https://github.com/gaofeng21cn/one-person-lab-app/releases/latest',
    diagnostics,
    screenshots: entries,
  };
  writeJsonArtifact(path.join(options.artifacts, 'guide-screenshots-summary.json'), summary, secret);
  return summary;
}

async function captureGuideScreenshots(options, sources, secret) {
  const guideDir = path.join(options.artifacts, 'guide-screenshots');
  fs.mkdirSync(guideDir, { recursive: true });
  const screenCaptureWarmup = warmGuideScreenCapturePermission(guideDir);
  const entries = [];
  const capture = (name, operation) => {
    const target = path.join(guideDir, name);
    try {
      dismissGuideScreenCapturePermissionPrompt();
      entries.push({ name, ...operation(target) });
      dismissGuideScreenCapturePermissionPrompt();
    } catch (error) {
      entries.push({
        name,
        status: 'failed',
        target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  capture(GUIDE_SCREENSHOTS.release, (target) => captureGuideBrowserReleaseScreenshot(target));
  if (options.dmg) {
    capture(GUIDE_SCREENSHOTS.dmgInstall, (target) => captureGuideDmgWindow(options.dmg, target));
  }
  capture(GUIDE_SCREENSHOTS.firstRun, (target) => copyGuideScreenshot(sources.firstRunAccessSetup, target));
  capture(GUIDE_SCREENSHOTS.ready, (target) => copyGuideScreenshot(sources.firstRunReady, target));
  capture(GUIDE_SCREENSHOTS.researchEntry, (target) => copyGuideScreenshot(sources.assistantMas, target));
  capture(GUIDE_SCREENSHOTS.environment, (target) => copyGuideScreenshot(sources.settingsEnvironment, target));
  capture(GUIDE_SCREENSHOTS.firstResearch, (target) => copyGuideScreenshot(sources.assistantMas, target));
  capture(GUIDE_SCREENSHOTS.runtimeStatus, (target) => copyGuideScreenshot(sources.runtimeStatus, target));

  return writeGuideScreenshotsSummary(options, entries, secret, {
    screen_capture_warmup: screenCaptureWarmup,
  });
}

function submitCodexWizard(processName, apiKey) {
  const script = `
ObjC.import('stdlib');
const procName = ${JSON.stringify(processName)};
const methodLabel = ${JSON.stringify(DEFAULT_LABELS.codexApiKeyMethod)};
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
const method = findInWindows((element) => hasLabel(element, methodLabel));
if (!method) throw new Error('Codex API key method was not found');
try {
  method.actions.byName('AXPress').perform();
} catch (_) {
  method.click();
}
delay(0.2);
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
  if (options.bootstrapLaunchDiagnostics) {
    return false;
  }
  return (
    options.requireCodexConfigWizard === true || options.runtimeProfile === 'full' || Boolean(options.codexApiKeyFile)
  );
}

function shouldCheckFirstRunBeginnerUx(options) {
  return options.assertClean === true || options.requireCodexConfigWizard === true;
}

function shouldCaptureFullReleaseScreenshot(options) {
  return options.runtimeProfile === 'full' && shouldCheckFirstRunBeginnerUx(options);
}

function shouldCaptureFirstRunBeginnerScreenshot(firstRunBeginnerUx) {
  return Boolean(firstRunBeginnerUx) && firstRunBeginnerUx.status !== 'skipped_by_usable_entry';
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
    treeContainsLabel(state.lastTree, DEFAULT_LABELS.codexApiKeyMethod) ||
    (treeContainsLabel(state.lastTree, DEFAULT_LABELS.codexApiKeyInput) &&
      treeContainsLabel(state.lastTree, DEFAULT_LABELS.codexConfigureButton));
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
      lastSystemInitializeRaw = runOplJson(['system', 'initialize', '--json'], {
        ...options,
        appPath: options.appPath,
      });
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

function recordFullRuntimeEquivalenceProbe(writeSmokeEvent, attempt, probe, status, details = {}) {
  if (!writeSmokeEvent) return;
  writeSmokeEventSafely(writeSmokeEvent, 'full_runtime_equivalence_probe', status, {
    attempt,
    probe,
    ...details,
  });
}

async function runFullRuntimeEquivalenceProbe(writeSmokeEvent, attempt, probe, operation, details = {}) {
  const started = Date.now();
  recordFullRuntimeEquivalenceProbe(writeSmokeEvent, attempt, probe, 'started', details);
  try {
    const result = await operation();
    recordFullRuntimeEquivalenceProbe(writeSmokeEvent, attempt, probe, 'passed', {
      duration_ms: Date.now() - started,
    });
    return result;
  } catch (error) {
    recordFullRuntimeEquivalenceProbe(writeSmokeEvent, attempt, probe, 'failed', {
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function waitForFullFirstRunEquivalence(timeoutMs, options = {}) {
  const started = Date.now();
  let lastError = null;
  let lastSystemInitializeRaw = '';
  let lastModulesRaw = '';
  let attempt = 0;
  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    const remainingMs = timeoutMs - (Date.now() - started);
    if (remainingMs <= 1_000) break;
    const probeTimeoutMs = resolveOplProbeTimeoutMs(remainingMs - 1_000);
    try {
      lastSystemInitializeRaw = await runFullRuntimeEquivalenceProbe(
        options.writeSmokeEvent,
        attempt,
        'system_initialize',
        () =>
          runOplJson(['system', 'initialize', '--json'], {
            ...options,
            timeoutMs: probeTimeoutMs,
          }),
        {
          timeout_ms: probeTimeoutMs,
        }
      );
      lastModulesRaw = await runFullRuntimeEquivalenceProbe(
        options.writeSmokeEvent,
        attempt,
        'connect_modules',
        () =>
          runOplJson(OPL_CONNECT_MODULES_ARGS, {
            ...options,
            timeoutMs: probeTimeoutMs,
          }),
        {
          timeout_ms: probeTimeoutMs,
        }
      );
      await runFullRuntimeEquivalenceProbe(options.writeSmokeEvent, attempt, 'assert_equivalence', () =>
        assertFullFirstRunEquivalence(lastSystemInitializeRaw, lastModulesRaw, {
          runtimeHome: resolveFullRuntimeForSmoke(options).runtime_home,
        })
      );
      return {
        systemInitializeRaw: lastSystemInitializeRaw,
        modulesRaw: lastModulesRaw,
      };
    } catch (error) {
      lastError = error;
      if (isNonRetryableFullRuntimeEquivalenceError(error)) {
        recordFullRuntimeEquivalenceProbe(options.writeSmokeEvent, attempt, 'assert_equivalence', 'non_retryable', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
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
        treeContainsLabel(lastTree, DEFAULT_LABELS.codexApiKeyMethod) ||
        (treeContainsLabel(lastTree, DEFAULT_LABELS.codexApiKeyInput) &&
          treeContainsLabel(lastTree, DEFAULT_LABELS.codexConfigureButton));
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
      const usableEntry = detectUsableEntryAccessibility(lastTree);
      if (usableEntry) {
        return { tree: lastTree, ...usableEntry };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(2_000);
  }
  const detail =
    lastError instanceof Error
      ? lastError.message
      : JSON.stringify({
          expected: [DEFAULT_LABELS.guidEntry, ...usableEntryAccessibilityMarkers().map((marker) => marker.label)],
          sample: lastTree.slice(0, 20),
        });
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
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const guidEntry = document.querySelector('[data-testid="opl-guid-entry"], [aria-label="opl-guid-entry"]');
    const guidInput = document.querySelector('[data-testid="guid-input"]');
    const guidSendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const firstRunWindow = document.querySelector('[data-testid="opl-first-run-window"]');
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    const hashOk = window.location.hash.startsWith('#/guid');
    if (hashOk && visible(guidEntry) && visible(guidInput) && visible(guidSendButton) && !firstRunWindow && !appLoaderVisible) {
      return {
        hash: window.location.hash,
        entryKind: 'guid',
        labels: ['opl-guid-entry'],
        guidEntryVisible: true,
        guidInputVisible: true,
        guidSendButtonVisible: true,
        hasGuidInput: true,
        hasGuidSendButton: true,
      };
    }
    const assistantCards = ${JSON.stringify(OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => visibleHomeAssistantControlSelector(target)))}
      .map((selector) => [...document.querySelectorAll(selector)].find(visible))
      .filter(Boolean);
    return assistantCards.length === ${OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.length} && visible(guidInput) && visible(guidSendButton) && !firstRunWindow && !appLoaderVisible
      ? {
          hash: window.location.hash,
          entryKind: 'assistant_home',
          labels: ${JSON.stringify(OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => target.badge))},
          assistantCardsVisible: assistantCards.map((card) => card.getAttribute('data-testid')),
          guidEntryVisible: visible(guidEntry),
          guidInputVisible: visible(guidInput),
          guidSendButtonVisible: visible(guidSendButton),
          hasGuidInput: true,
          hasGuidSendButton: true,
        }
      : false;
  })()`;
}

function guidEntryNavigationExpression() {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const guidEntry = document.querySelector('[data-testid="opl-guid-entry"], [aria-label="opl-guid-entry"]');
    const guidInput = document.querySelector('[data-testid="guid-input"]');
    const guidSendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const firstRunWindow = document.querySelector('[data-testid="opl-first-run-window"]');
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    if (window.location.hash.startsWith('#/guid') && visible(guidEntry) && visible(guidInput) && visible(guidSendButton) && !firstRunWindow && !appLoaderVisible) {
      if (window.__oplFirstRunSmokeNavigationKind === 'deferred_entry') {
        return {
          hash: window.location.hash,
          entryKind: 'guid',
          labels: ['opl-guid-entry'],
          guidEntryVisible: true,
          guidInputVisible: true,
          guidSendButtonVisible: true,
          hasGuidInput: true,
          hasGuidSendButton: true,
          navigatedBy: 'deferred_entry',
        };
      }
      return {
        hash: window.location.hash,
        entryKind: 'guid',
        labels: ['opl-guid-entry'],
        guidEntryVisible: true,
        guidInputVisible: true,
        guidSendButtonVisible: true,
        hasGuidInput: true,
        hasGuidSendButton: true,
        navigatedBy: 'ready_entry',
      };
    }
    const assistantCards = ${JSON.stringify(OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => visibleHomeAssistantControlSelector(target)))}
      .map((selector) => [...document.querySelectorAll(selector)].find(visible))
      .filter(Boolean);
    if (assistantCards.length === ${OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.length} && visible(guidInput) && visible(guidSendButton) && !firstRunWindow && !appLoaderVisible) {
      return {
        hash: window.location.hash,
        entryKind: 'assistant_home',
        labels: ${JSON.stringify(OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => target.badge))},
        assistantCardsVisible: assistantCards.map((card) => card.getAttribute('data-testid')),
        guidEntryVisible: visible(guidEntry),
        guidInputVisible: true,
        guidSendButtonVisible: true,
        hasGuidInput: true,
        hasGuidSendButton: true,
        navigatedBy: 'usable_assistant_home',
      };
    }
    const deferredAnchor = document.querySelector('[data-testid="opl-first-run-enter-app"]');
    const deferredButton = deferredAnchor?.closest('button') || deferredAnchor;
    const readyAnchor = document.querySelector('[aria-label="opl-first-run-ready-entry"], [data-testid="opl-first-run-ready-entry"]');
    const readyButton = readyAnchor?.closest('button') || readyAnchor;
    const disabled = (button) =>
      !button ||
      button.disabled === true ||
      button.getAttribute('disabled') !== null ||
      button.getAttribute('aria-disabled') === 'true' ||
      button.className.includes('disabled');
    if (deferredButton && firstRunWindow && !appLoaderVisible && !disabled(deferredButton)) {
      window.__oplFirstRunSmokeNavigationKind = 'deferred_entry';
      deferredButton.click();
    } else if (readyButton && firstRunWindow && !appLoaderVisible && !disabled(readyButton)) {
      window.__oplFirstRunSmokeNavigationKind = 'ready_entry';
      readyButton.click();
    }
    return false;
  })()`;
}

function visibleHomeAssistantControlSelector(target) {
  return [target.id, target.shortcutId]
    .filter(Boolean)
    .flatMap((id) => [`[data-testid="home-starter-${id}"]`, `[data-testid="preset-pill-${id}"]`])
    .join(', ');
}

function homeAssistantStandardLaunchGateExpression(target) {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const card = [...document.querySelectorAll(${cdpString(visibleHomeAssistantControlSelector(target))})].find(visible);
    const input = document.querySelector('textarea[data-testid="guid-input"], input[data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const composer = document.querySelector('[data-testid="opl-guid-entry"]');
    if (!card || !visible(input) || !visible(sendButton) || !composer) return false;
    const control = card.closest('button') || card;
    const disabled = control.disabled === true
      || control.getAttribute('disabled') !== null
      || control.getAttribute('aria-disabled') === 'true'
      || String(control.className || '').includes('disabled');
    const readinessHint = control.getAttribute('title') || control.getAttribute('aria-description') || '';
    if (disabled) {
      return {
        status: 'failed',
        reason: 'starter_disabled_before_selection',
        assistant_id: ${cdpString(target.id)},
      };
    }
    if (!readinessHint.trim() || card.getAttribute('data-opl-launch-ready') !== 'false') return false;
    if (
      card.getAttribute('aria-pressed') !== 'true' ||
      composer.getAttribute('data-opl-active-shortcut') !== ${cdpString(target.shortcutId)}
    ) {
      control.click();
      return false;
    }
    const expectedDraft = ${cdpString(`Verify ${target.shortName} launch gate.`)};
    const attemptStore = window.__oplStandardLaunchGateAttempts || (window.__oplStandardLaunchGateAttempts = {});
    const attempt = attemptStore[${cdpString(target.id)}] || (attemptStore[${cdpString(target.id)}] = {});
    if (!attempt.input_filled) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (!nativeSetter) {
        return { status: 'failed', reason: 'input_setter_missing', assistant_id: ${cdpString(target.id)} };
      }
      nativeSetter.call(input, expectedDraft);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      attempt.input_filled = true;
      return false;
    }
    const visibleMessages = () => [...document.querySelectorAll('[data-testid="opl-agent-package-launch-blocked"]')].filter(visible);
    if (!attempt.send_clicked) {
      if (visibleMessages().length > 0 || sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true') {
        return false;
      }
      sendButton.click();
      attempt.send_clicked = true;
      return false;
    }
    const message = visibleMessages().find((node) =>
      node.getAttribute('data-opl-package-id') === ${cdpString(target.packageId)}
    );
    if (!message || !window.location.hash.startsWith('#/guid')) return false;
    const typedReason = message.getAttribute('data-opl-block-reason') || '';
    const repairActions = (message.getAttribute('data-opl-repair-actions') || '').split(',').filter(Boolean);
    if (!typedReason || repairActions.length === 0 || !message.textContent?.trim() || input.value !== expectedDraft) return false;
    return {
      status: 'passed',
      assistant_id: ${cdpString(target.id)},
      control_testid: card.getAttribute('data-testid'),
      visible: true,
      selectable_before_selection: true,
      selected: true,
      launch_allowed: false,
      send_blocked: true,
      package_id: ${cdpString(target.packageId)},
      typed_reason: typedReason,
      repair_actions: repairActions,
      draft_preserved: true,
      readiness_hint: readinessHint,
      repair_hint_visible: true,
      message_visible: true,
      route_hash: window.location.hash,
    };
  })()`;
}

function homeAssistantDeniedSelectorParts() {
  return ['[data-testid^="agent-pill-"]'];
}

function homeAssistantDeniedSelectorExpression() {
  return JSON.stringify(homeAssistantDeniedSelectorParts());
}

function homeAssistantWorkspaceContextExpression(workspace) {
  return `(() => {
    const composer = document.querySelector('[data-testid="opl-guid-entry"]');
    if (
      composer?.getAttribute('data-opl-workspace-selected') === 'true' &&
      composer?.getAttribute('data-opl-workspace-path') === ${cdpString(workspace)}
    ) {
      return {
        status: 'ready',
        target_workspace: ${cdpString(workspace)},
        workspace_selected: true,
      };
    }
    if (!window.location.hash.startsWith('#/guid')) {
      window.location.hash = '#/guid';
      return false;
    }
    const currentState = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
    const currentUserState = currentState.usr && typeof currentState.usr === 'object'
      ? currentState.usr
      : {};
    const nextState = {
      ...currentState,
      usr: { ...currentUserState, workspace: ${cdpString(workspace)} },
      key: 'opl-vm-workspace-' + Date.now(),
    };
    window.history.replaceState(nextState, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
    return false;
  })()`;
}

function homeAssistantRouteSelectionExpression(target) {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    if (!window.location.hash.startsWith('#/guid')) {
      window.location.hash = '#/guid';
      return false;
    }
    const card = [...document.querySelectorAll(${cdpString(visibleHomeAssistantControlSelector(target))})].find(visible);
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const composer = document.querySelector('[data-testid="opl-guid-entry"]');
    const control = card?.closest('button') || card;
    const disabled = control?.disabled === true
      || control?.getAttribute('disabled') !== null
      || control?.getAttribute('aria-disabled') === 'true'
      || String(control?.className || '').includes('disabled');
    if (!visible(card) || !visible(input) || !visible(sendButton) || disabled) return false;
    if (
      card.getAttribute('aria-pressed') === 'true' &&
      composer?.getAttribute('data-opl-active-shortcut') === ${cdpString(target.shortcutId)}
    ) {
      return {
        clickedAssistantId: ${cdpString(target.id)},
        cardText: card.textContent || '',
        alreadySelected: true,
      };
    }
    control.click();
    return {
      clickedAssistantId: ${cdpString(target.id)},
      cardText: card.textContent || '',
      alreadySelected: false,
    };
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
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const card = [...document.querySelectorAll(${cdpString(visibleHomeAssistantControlSelector(target))})].find(visible);
    const modelSelector = document.querySelector('[data-testid="guid-model-selector"]');
    const permissionSelector = document.querySelector('[data-testid^="agent-mode-selector-"], [data-testid="agent-mode-selector"]');
    const composer = document.querySelector('[data-testid="opl-guid-entry"]');
    const deniedVisible = ${homeAssistantDeniedSelectorExpression()}
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(visible)
      .map((node) => node.getAttribute('data-testid') || node.className || node.textContent?.slice(0, 80) || 'unknown');
    if (!visible(input) || !visible(sendButton) || !visible(card)) return false;
    if (card.getAttribute('aria-pressed') !== 'true') return false;
    const semanticState = {
      executor: composer?.getAttribute('data-opl-composer-executor') || null,
      active_shortcut_id: composer?.getAttribute('data-opl-active-shortcut') || null,
      model_reasoning_visible: composer?.getAttribute('data-opl-model-reasoning-visible') === 'true',
      permission_access_visible: composer?.getAttribute('data-opl-permission-access-visible') === 'true',
      executor_selector_visible: composer?.getAttribute('data-opl-executor-selector-visible') === 'true',
      workspace_selected: composer?.getAttribute('data-opl-workspace-selected') === 'true',
    };
    const missingControls = [];
    if (semanticState.active_shortcut_id !== ${cdpString(target.shortcutId)}) missingControls.push('active_shortcut_binding');
    if (!visible(modelSelector) || !semanticState.model_reasoning_visible) missingControls.push('model_reasoning');
    if (!visible(permissionSelector) || !semanticState.permission_access_visible) missingControls.push('permission_access');
    if (deniedVisible.length > 0 || semanticState.executor_selector_visible) missingControls.push('forbidden_executor_selector');
    if (semanticState.executor !== 'codex') missingControls.push('codex_executor');
    if (!semanticState.workspace_selected) missingControls.push('workspace_scope');
    if (missingControls.length > 0) {
      return {
        status: 'failed',
        reason: 'home_composer_contract_mismatch',
        missing_controls: missingControls,
        denied_visible: deniedVisible,
        composer_state: semanticState,
      };
    }
    return {
      status: 'ready',
      assistant_id: ${cdpString(target.id)},
      badge: ${cdpString(target.badge)},
      active_capability: semanticState.active_shortcut_id,
      selected_card_text: card.textContent || '',
      model_selector_visible: true,
      permission_selector_visible: true,
      executor_selectors_hidden: true,
      missing_controls: [],
      composer_state: semanticState,
    };
  })()`;
}

function homeAssistantCoreReadinessExpression(pendingAsFalse = true) {
  return `(() => {
    const cacheKey = 'opl.appState.fast.v1';
    const raw = window.localStorage.getItem(cacheKey);
    let envelope = null;
    let parseError = null;
    try {
      envelope = raw ? JSON.parse(raw) : null;
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    const payload = envelope?.payload ?? envelope;
    const appState = payload?.app_state ?? payload;
    const codex = appState?.core?.codex;
    const paths = appState?.paths;
    const workspaceRoot = paths?.workspace_root;
    const selectedWorkspace = workspaceRoot?.selected_path || paths?.workspace_root_path || null;
    const workspaceRootReady = Boolean(
      selectedWorkspace &&
        workspaceRoot?.exists === true &&
        workspaceRoot?.writable === true &&
        !['missing', 'blocking', 'disabled'].includes(workspaceRoot?.health_status)
    );
    const codexCliReady = Boolean(
      codex?.installed === true &&
        codex?.enabled !== false &&
        codex?.status !== 'disabled' &&
        codex?.version_status !== 'incompatible' &&
        !['missing', 'blocking', 'disabled'].includes(codex?.health_status)
    );
    const modelAccessReady = (codex?.model_access_ready ?? codex?.api_key_present) === true;
    const known = appState?.schema_version === 'opl_app_state.v1';
    const ready = known && workspaceRootReady && codexCliReady && modelAccessReady;
    const blockers = [];
    if (!known) blockers.push('app_state_unknown');
    if (known && !workspaceRootReady) blockers.push('workspace_root');
    if (known && !codexCliReady) blockers.push('codex_cli');
    if (known && !modelAccessReady) blockers.push('model_access');
    const state = {
      status: ready ? 'ready' : 'pending',
      reason: ready ? null : 'core_launch_prerequisites_not_ready',
      cache_key: cacheKey,
      cache_present: Boolean(raw),
      cache_loaded_at: envelope?.loadedAt ?? null,
      parse_error: parseError,
      known,
      workspace_root_ready: workspaceRootReady,
      codex_cli_ready: codexCliReady,
      model_access_ready: modelAccessReady,
      selected_workspace: selectedWorkspace,
      blockers,
    };
    return ${pendingAsFalse ? 'ready ? state : false' : 'state'};
  })()`;
}

function homeAssistantRouteSendWithoutActivationExpression(target, prompt) {
  return `(() => {
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const composer = document.querySelector('[data-testid="opl-guid-entry"]');
    if (!input || !sendButton || composer?.getAttribute('data-opl-workspace-selected') !== 'true') return false;
    if (input.value !== ${cdpString(prompt)}) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (!nativeSetter) throw new Error('Could not resolve native input value setter');
      nativeSetter.call(input, ${cdpString(prompt)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return false;
    }
    if (sendButton.disabled || sendButton.getAttribute('disabled') !== null || sendButton.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    const rect = sendButton.getBoundingClientRect();
    const clickPoint = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const hitTarget = document.elementFromPoint(clickPoint.x, clickPoint.y);
    if (!(hitTarget === sendButton || sendButton.contains(hitTarget))) return false;
    const diagnosticsKey = '__oplFullAssistantSendDiagnostics';
    const diagnostics = {
      installed_at: new Date().toISOString(),
      events: [],
      react_props_key: null,
      react_onclick_present: false,
      react_onclick_instrumented: false,
    };
    const describeTarget = (node) => node
      ? {
          tag_name: node.tagName || null,
          test_id: node.getAttribute?.('data-testid') || null,
          class_name: String(node.className || ''),
        }
      : null;
    const record = (phase, event = null, detail = {}) => {
      diagnostics.events.push({
        phase,
        at: new Date().toISOString(),
        event_type: event?.type || null,
        is_trusted: event?.isTrusted ?? null,
        default_prevented: event?.defaultPrevented ?? null,
        target: describeTarget(event?.target),
        current_target: describeTarget(event?.currentTarget),
        ...detail,
      });
    };
    document.addEventListener('click', (event) => record('document_capture', event), true);
    document.addEventListener('click', (event) => record('document_bubble', event));
    sendButton.addEventListener('click', (event) => record('button_capture', event), true);
    sendButton.addEventListener('click', (event) => record('button_bubble', event));
    const reactPropsKey = Object.keys(sendButton).find((key) => key.startsWith('__reactProps$')) || null;
    const reactProps = reactPropsKey ? sendButton[reactPropsKey] : null;
    diagnostics.react_props_key = reactPropsKey;
    diagnostics.react_onclick_present = typeof reactProps?.onClick === 'function';
    if (reactPropsKey && typeof reactProps?.onClick === 'function') {
      const originalOnClick = reactProps.onClick;
      const instrumentedProps = {
        ...reactProps,
        onClick(...args) {
          const event = args[0]?.nativeEvent || args[0] || null;
          record('react_onclick_enter', event);
          try {
            const result = originalOnClick.apply(this, args);
            record('react_onclick_return', event, { returned_thenable: Boolean(result?.then) });
            return result;
          } catch (error) {
            record('react_onclick_throw', event, {
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      };
      sendButton[reactPropsKey] = instrumentedProps;
      diagnostics.react_onclick_instrumented = true;
    }
    window[diagnosticsKey] = diagnostics;
    return {
      assistant_id: ${cdpString(target.id)},
      promptLength: ${prompt.length},
      interaction_path: 'guid_ui_cdp_pointer_send_without_shell_activation',
      shell_activation_allowed: false,
      prepared_at: Date.now(),
      click_point: clickPoint,
      hit_target: describeTarget(hitTarget),
      diagnostics: {
        react_props_key: diagnostics.react_props_key,
        react_onclick_present: diagnostics.react_onclick_present,
        react_onclick_instrumented: diagnostics.react_onclick_instrumented,
      },
    };
  })()`;
}

function homeAssistantRouteSendDiagnosticsExpression() {
  return `(() => {
    const diagnostics = window.__oplFullAssistantSendDiagnostics;
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const reactPropsKey = sendButton
      ? Object.keys(sendButton).find((key) => key.startsWith('__reactProps$')) || null
      : null;
    const reactProps = reactPropsKey ? sendButton[reactPropsKey] : null;
    return {
      installed: Boolean(diagnostics),
      installed_at: diagnostics?.installed_at ?? null,
      events: diagnostics?.events ?? [],
      current_react_props_key: reactPropsKey,
      current_react_onclick_present: typeof reactProps?.onClick === 'function',
      button_disabled: sendButton?.disabled ?? null,
      button_aria_disabled: sendButton?.getAttribute('aria-disabled') ?? null,
      button_aria_busy: sendButton?.getAttribute('aria-busy') ?? null,
      button_class_name: String(sendButton?.className || ''),
    };
  })()`;
}

function homeAssistantRouteSendStateExpression(target, prompt, clickedAt, pendingAsFalse = true) {
  return `(() => {
    const hash = window.location.hash;
    const routeMatch = hash.match(/^#\\/conversation\\/([^/?#]+)/);
    const input = document.querySelector('[data-testid="guid-input"] textarea, [data-testid="guid-input"]');
    const sendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const composer = document.querySelector('[data-testid="opl-guid-entry"]');
    const elapsedMs = Math.max(0, Date.now() - ${Number(clickedAt)});
    const loading = Boolean(
      sendButton &&
        (sendButton.disabled ||
          sendButton.getAttribute('disabled') !== null ||
          sendButton.getAttribute('aria-disabled') === 'true' ||
          sendButton.getAttribute('aria-busy') === 'true' ||
          sendButton.classList.contains('arco-btn-loading') ||
          sendButton.querySelector('.arco-icon-loading, [data-icon="loading"]'))
    );
    const messages = Array.from(
      document.querySelectorAll('[role="alert"], [role="status"], .arco-message, .arco-notification')
    )
      .map((element) => element.textContent?.trim() || '')
      .filter(Boolean)
      .slice(0, 5);
    const setupNotice = document.querySelector('[data-testid="opl-guid-setup-notice"]');
    const packageLaunchBlocker = document.querySelector('[data-testid="opl-agent-package-launch-blocked"]');
    const blockedReason = setupNotice
      ? 'core_launch_prerequisite_notice'
      : packageLaunchBlocker?.getAttribute('data-opl-block-reason') || null;
    const status = routeMatch ? 'routed' : blockedReason ? 'failed' : 'pending';
    const state = {
      status,
      reason: blockedReason,
      assistant_id: ${cdpString(target.id)},
      elapsed_ms: elapsedMs,
      hash,
      conversation_id: routeMatch ? decodeURIComponent(routeMatch[1]) : null,
      input_value: input?.value ?? null,
      input_matches_prompt: input?.value === ${cdpString(prompt)},
      send_loading: loading,
      messages,
      setup_notice: setupNotice?.textContent?.trim() || null,
      package_launch_blocker: packageLaunchBlocker?.textContent?.trim() || null,
      missing_controls: [],
      composer_state: {
        workspace_selected: composer?.getAttribute('data-opl-workspace-selected') ?? null,
        workspace_path: composer?.getAttribute('data-opl-workspace-path') ?? null,
        active_shortcut_id: composer?.getAttribute('data-opl-active-shortcut') ?? null,
        executor: composer?.getAttribute('data-opl-composer-executor') ?? null,
      },
    };
    return ${pendingAsFalse ? "status === 'pending' ? false : state" : 'state'};
  })()`;
}

function conversationRouteReceiptExpression(
  target,
  conversationId = null,
  expectedWorkspace = null,
  activeRoute = false
) {
  return `(async () => {
    const backendPort = window.__backendPort;
    if (!backendPort) return false;
    const routeMatch = ${activeRoute ? 'window.location.hash.match(/^#\\/conversation\\/([^/?#]+)/)' : 'null'};
    const expectedConversationId = ${
      conversationId
        ? cdpString(conversationId)
        : activeRoute
          ? 'routeMatch ? decodeURIComponent(routeMatch[1]) : null'
          : 'null'
    };
    if (${activeRoute ? 'true' : 'false'} && !expectedConversationId) return false;
    const conversationPath = expectedConversationId
      ? \`/api/conversations/\${encodeURIComponent(expectedConversationId)}\`
      : '/api/conversations?limit=10';
    const response = await fetch(\`http://127.0.0.1:\${backendPort}\${conversationPath}\`);
    if (!response.ok) {
      throw new Error(\`Conversation receipt lookup returned \${response.status}\`);
    }
    const payload = await response.json();
    const conversations = expectedConversationId ? [payload?.data || payload] : payload?.data?.items || payload?.items || [];
    const matched = conversations.find((conversation) => {
      const invocation = conversation?.extra?.opl_agent_package_invocation;
      const legacyRoute = conversation?.extra?.opl_assistant_route;
      const assistantMatches =
        invocation?.package_id === ${cdpString(target.packageId)} ||
        legacyRoute?.assistant_id === ${cdpString(target.id)};
      const conversationMatches = expectedConversationId ? conversation?.id === expectedConversationId : true;
      return assistantMatches && conversationMatches;
    });
    if (!matched) return false;
    const invocation = matched.extra.opl_agent_package_invocation;
    const activation = matched.extra.opl_agent_package_activation;
    const legacyRoute = matched.extra.opl_assistant_route;
    const invalid = [];
    if (!invocation) invalid.push('opl_agent_package_invocation');
    if (invocation?.route_kind !== 'agent_package_shortcut') invalid.push('route_kind');
    if (invocation?.executor !== 'codex_cli') invalid.push('executor');
    if (invocation?.package_id !== ${cdpString(target.packageId)}) invalid.push('package_id');
    if (invocation?.shortcut_id !== ${cdpString(target.shortcutId)}) invalid.push('shortcut_id');
    if (invocation?.codex_visible_entry !== ${cdpString(target.codexVisibleEntry)}) invalid.push('codex_visible_entry');
    const requiredSkillIds = ${JSON.stringify(target.requiredSkillIds)};
    if (!Array.isArray(invocation?.required_skill_ids) || !requiredSkillIds.every((id) => invocation.required_skill_ids.includes(id))) {
      invalid.push('required_skill_ids');
    }
    if (invocation?.source !== 'opl_app_home') invalid.push('source');
    if (legacyRoute?.route_kind !== 'builtin_capability') invalid.push('legacy_route_kind');
    if (legacyRoute?.assistant_short_name !== ${cdpString(target.shortName)}) invalid.push('legacy_assistant_short_name');
    if (matched.type !== 'acp') invalid.push('conversation_type');
    if (matched.extra?.backend !== 'codex') invalid.push('backend');
    if (activation !== undefined && activation !== null) invalid.push('shell_activation_leaked_into_conversation');
    ${
      expectedWorkspace
        ? `if (matched.extra?.workspace !== ${cdpString(expectedWorkspace)}) invalid.push('conversation_workspace');
    if (matched.extra?.is_temporary_workspace !== false) invalid.push('conversation_temporary_workspace');`
        : ''
    }
    if (invalid.length > 0) {
      throw new Error(\`Invalid OPL agent package launch receipt for ${target.id}: \${invalid.join(', ')} \${JSON.stringify({ type: matched.type, extra: matched.extra })}\`);
    }
    return {
      status: 'passed',
      conversation_id: matched.id,
      conversation_type: matched.type,
      backend: matched.extra.backend,
      workspace: matched.extra.workspace,
      route: invocation,
      shell_activation_absent: true,
      activation: null,
      legacy_route: legacyRoute ?? null,
    };
  })()`;
}

function latestConversationRouteReceiptExpression(target) {
  return conversationRouteReceiptExpression(target);
}

function activeConversationRouteReceiptExpression(target, expectedWorkspace) {
  return conversationRouteReceiptExpression(target, null, expectedWorkspace, true);
}

function requireAgentPackageStatus(payload, target) {
  const status = isRecord(payload?.opl_agent_package_status) ? payload.opl_agent_package_status : null;
  if (!status || status.package_id !== target.packageId) {
    throw new Error(`Package status readback did not resolve ${target.packageId}.`);
  }
  return status;
}

function lifecycleReceiptTargetsWorkspace(receipt, workspace) {
  if (!isRecord(receipt)) return false;
  const roots = [];
  if (isRecord(receipt.use_binding) && typeof receipt.use_binding.target_root === 'string') {
    roots.push(receipt.use_binding.target_root);
  }
  if (isRecord(receipt.scope_materialization) && typeof receipt.scope_materialization.target_root === 'string') {
    roots.push(receipt.scope_materialization.target_root);
  }
  if (Array.isArray(receipt.scope_materializations)) {
    for (const materialization of receipt.scope_materializations) {
      if (isRecord(materialization) && typeof materialization.target_root === 'string') {
        roots.push(materialization.target_root);
      }
    }
  }
  return roots.includes(workspace);
}

function agentPackageLifecycleSnapshot(payload, target, workspace) {
  const status = requireAgentPackageStatus(payload, target);
  const receipts = Array.isArray(status.lifecycle_receipts) ? status.lifecycle_receipts : [];
  const workspaceReceipts = receipts
    .filter(
      (receipt) =>
        isRecord(receipt) &&
        (receipt.action === 'activate' || receipt.action === 'use') &&
        lifecycleReceiptTargetsWorkspace(receipt, workspace)
    )
    .map((receipt) => ({
      action: receipt.action,
      receipt_ref: typeof receipt.receipt_ref === 'string' ? receipt.receipt_ref : null,
      recorded_at: typeof receipt.recorded_at === 'string' ? receipt.recorded_at : null,
    }))
    .filter((receipt) => receipt.receipt_ref)
    .sort((left, right) => left.receipt_ref.localeCompare(right.receipt_ref));
  const refsFor = (action) =>
    workspaceReceipts
      .filter((receipt) => receipt.action === action)
      .map((receipt) => receipt.receipt_ref)
      .sort();
  return {
    package_id: target.packageId,
    workspace,
    activate_receipt_refs: refsFor('activate'),
    use_receipt_refs: refsFor('use'),
    all_receipt_refs: workspaceReceipts.map((receipt) => receipt.receipt_ref).sort(),
  };
}

function readAgentPackageLifecycleState(options, target, workspace) {
  const args = [
    'packages',
    'status',
    '--package-id',
    target.packageId,
    '--scope',
    'workspace',
    '--target-workspace',
    workspace,
    '--json',
  ];
  const runOplJsonImpl = options.__testHooks?.runOplJson ?? runOplJson;
  const payload = parseOplJsonResult(runOplJsonImpl(args, { ...options, timeoutMs: options.timeoutMs }), args);
  return {
    args,
    payload,
    status: requireAgentPackageStatus(payload, target),
    snapshot: agentPackageLifecycleSnapshot(payload, target, workspace),
  };
}

function assertHomeAssistantRouteSendWithoutActivation(before, after) {
  const beforeRefs = new Set(before.all_receipt_refs);
  const newReceiptRefs = after.all_receipt_refs.filter((receiptRef) => !beforeRefs.has(receiptRef));
  if (newReceiptRefs.length > 0) {
    throw new Error(
      `Ordinary Home send created forbidden package activation/use receipts: ${newReceiptRefs.join(', ')}`
    );
  }
  return {
    status: 'passed',
    package_id: after.package_id,
    workspace: after.workspace,
    shell_activation_attempted: false,
    activation_or_use_receipts_added: false,
    receipt_count_before: before.all_receipt_refs.length,
    receipt_count_after: after.all_receipt_refs.length,
  };
}

function fullAssistantWorkspacePath() {
  return path.join(os.homedir(), 'OPL-Release-Smoke-Workspace');
}

function resolveMasQualificationProvisioningReceipt(receiptPath, workspace) {
  if (typeof receiptPath !== 'string' || !receiptPath.trim()) {
    throw new Error('Full MAS Stage activation requires --mas-study-provisioning-receipt before any provider starts.');
  }
  const resolvedReceiptPath = path.resolve(receiptPath);
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(resolvedReceiptPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `MAS qualification provisioning receipt is unreadable or invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!isRecord(receipt)) {
    throw new Error('MAS qualification provisioning receipt must be a JSON object.');
  }
  const invalid = [];
  if (receipt.surface_kind !== MAS_QUALIFICATION_PROVISIONING_RECEIPT_SURFACE) {
    invalid.push('surface_kind');
  }
  if (receipt.schema_version !== MAS_QUALIFICATION_PROVISIONING_RECEIPT_VERSION) {
    invalid.push('schema_version');
  }
  if (receipt.action_id !== MAS_QUALIFICATION_PROVISIONING_ACTION_ID) invalid.push('action_id');
  if (receipt.domain_truth_owner !== MAS_DOMAIN_TRUTH_OWNER) invalid.push('domain_truth_owner');
  if (receipt.domain_id !== MAS_DOMAIN_ID) invalid.push('domain_id');
  if (receipt.qualification_scope !== MAS_QUALIFICATION_SCOPE) invalid.push('qualification_scope');
  if (
    typeof receipt.receipt_ref !== 'string' ||
    !MAS_QUALIFICATION_PROVISIONING_RECEIPT_REF.test(receipt.receipt_ref)
  ) {
    invalid.push('receipt_ref');
  }
  if (receipt.single_use !== true) invalid.push('single_use');
  for (const field of ['stage_body_allowed', 'business_work_allowed', 'publication_allowed', 'submission_allowed']) {
    if (receipt[field] !== false) invalid.push(field);
  }
  const studyId = typeof receipt.study_id === 'string' ? receipt.study_id : '';
  if (!SAFE_STUDY_ID.test(studyId) || studyId === '.' || studyId === '..') invalid.push('study_id');
  if (receipt.canonical_study_root !== `studies/${studyId}`) invalid.push('canonical_study_root');
  if (receipt.lifecycle_state !== 'active') invalid.push('lifecycle_state');
  if (!Number.isInteger(receipt.lifecycle_generation) || receipt.lifecycle_generation < 1) {
    invalid.push('lifecycle_generation');
  }
  const expectedWorkspace = path.resolve(workspace);
  if (
    typeof receipt.workspace_root !== 'string' ||
    !path.isAbsolute(receipt.workspace_root) ||
    path.resolve(receipt.workspace_root) !== expectedWorkspace
  ) {
    invalid.push('workspace_root');
  }
  if (invalid.length > 0) {
    throw new Error(`MAS qualification provisioning receipt failed closed: ${invalid.join(', ')}`);
  }
  return {
    receipt_path: resolvedReceiptPath,
    receipt_ref: receipt.receipt_ref,
    study_id: studyId,
    canonical_study_root: receipt.canonical_study_root,
    lifecycle_state: receipt.lifecycle_state,
    lifecycle_generation: receipt.lifecycle_generation,
    workspace_root: expectedWorkspace,
  };
}

function resolveFrameworkStageRuntimeTarget(packageStatus, target) {
  const runtimeSource = isRecord(packageStatus.runtime_source_readiness)
    ? packageStatus.runtime_source_readiness
    : null;
  const checkoutPath =
    runtimeSource && typeof runtimeSource.checkout_path === 'string' && runtimeSource.checkout_path.trim()
      ? runtimeSource.checkout_path.trim()
      : null;
  if (!checkoutPath) {
    throw new Error(`Package ${target.packageId} has no Framework-owned runtime source checkout.`);
  }
  const manifestPath = path.join(checkoutPath, 'agent', 'stages', 'manifest.json');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const domainId =
    typeof manifest.target_domain_id === 'string' && manifest.target_domain_id.trim()
      ? manifest.target_domain_id.trim()
      : null;
  const stage = Array.isArray(manifest.stages)
    ? manifest.stages.find((candidate) => isRecord(candidate) && typeof candidate.stage_id === 'string')
    : null;
  const stageId = stage?.stage_id?.trim() || null;
  if (!domainId || !stageId) {
    throw new Error(`Package ${target.packageId} stage manifest does not declare a runtime domain and stage.`);
  }
  return {
    domain_id: domainId,
    stage_id: stageId,
    manifest_path: manifestPath,
    manifest_sha256: createHash('sha256').update(manifestBytes).digest('hex'),
  };
}

function frameworkStageRuntimeActivationExpression(input) {
  const stageRun = isRecord(input.result?.family_runtime_stage_run) ? input.result.family_runtime_stage_run : null;
  const stageRunInput = isRecord(stageRun?.stage_run_input) ? stageRun.stage_run_input : null;
  const workspaceLocator = isRecord(stageRunInput?.workspace_locator) ? stageRunInput.workspace_locator : null;
  const useBinding = isRecord(workspaceLocator?.package_use_binding) ? workspaceLocator.package_use_binding : null;
  const rootPackage = isRecord(useBinding?.root_package) ? useBinding.root_package : null;
  const errors = [];
  if (!stageRun) errors.push('family_runtime_stage_run');
  if (stageRunInput?.domain_id !== input.stageTarget.domain_id) errors.push('stage_domain_id');
  if (stageRunInput?.stage_id !== input.stageTarget.stage_id) errors.push('stage_id');
  if (workspaceLocator?.workspace_root !== input.workspace) errors.push('stage_workspace_locator');
  if (input.provisioning && workspaceLocator?.study_id !== input.provisioning.study_id) {
    errors.push('stage_study_id');
  }
  if (useBinding?.surface_kind !== 'opl_agent_package_use_binding.v1') errors.push('use_binding_surface_kind');
  if (useBinding?.scope !== 'workspace') errors.push('use_binding_scope');
  if (useBinding?.target_root !== input.workspace) errors.push('use_binding_target_root');
  if (rootPackage?.package_id !== input.target.packageId) errors.push('use_binding_package_id');
  if (typeof useBinding?.use_boundary_id !== 'string' || !useBinding.use_boundary_id) {
    errors.push('use_boundary_id');
  }
  if (typeof useBinding?.use_receipt_ref !== 'string' || !useBinding.use_receipt_ref) {
    errors.push('use_receipt_ref');
  }
  if (stageRun?.blocked_reason !== FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON) {
    errors.push('stage_body_blocker');
  }
  if (stageRun?.temporal_start !== null) errors.push('unexpected_temporal_start');
  const beforeUseRefs = new Set(input.beforeSnapshot.use_receipt_refs);
  const newUseReceiptRefs = input.afterSnapshot.use_receipt_refs.filter((receiptRef) => !beforeUseRefs.has(receiptRef));
  if (!newUseReceiptRefs.includes(useBinding?.use_receipt_ref)) errors.push('framework_use_receipt_readback');
  if (errors.length > 0) {
    throw new Error(
      `Framework Stage runtime activation evidence is invalid for ${input.target.id}: ${errors.join(', ')}`
    );
  }
  return {
    status: 'passed',
    activation_owner: 'one-person-lab_family_runtime',
    package_id: input.target.packageId,
    domain_id: input.stageTarget.domain_id,
    stage_id: input.stageTarget.stage_id,
    workspace_locator: input.workspace,
    study_id: input.provisioning?.study_id ?? null,
    provisioning_receipt_ref: input.provisioning?.receipt_ref ?? null,
    stage_manifest_path: input.stageTarget.manifest_path,
    stage_manifest_sha256: input.stageTarget.manifest_sha256,
    use_boundary_id: useBinding.use_boundary_id,
    use_receipt_ref: useBinding.use_receipt_ref,
    lifecycle_use_receipt_readback: true,
    stage_body_started: false,
    stage_body_blocked_reason: FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON,
  };
}

function runFrameworkStageRuntimeActivation(options, target, workspace, beforeState, provisioning = null) {
  const stageTarget = resolveFrameworkStageRuntimeTarget(beforeState.status, target);
  const workItemProvisioning =
    target.packageId === 'mas'
      ? (provisioning ?? resolveMasQualificationProvisioningReceipt(options.masStudyProvisioningReceipt, workspace))
      : null;
  const workspaceLocator = workItemProvisioning
    ? { workspace_root: workspace, study_id: workItemProvisioning.study_id }
    : { workspace_root: workspace };
  const args = [
    'family-runtime',
    'attempt',
    'create',
    '--domain',
    stageTarget.domain_id,
    '--stage',
    stageTarget.stage_id,
    '--workspace-locator',
    JSON.stringify(workspaceLocator),
    '--task',
    `opl-release-smoke-${target.id}`,
    '--executor-kind',
    'codex_cli',
    '--invocation-mode',
    'invocation',
    '--new-stage-run',
    '--start',
    '--blocked-reason',
    FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON,
    '--json',
  ];
  const runOplJsonImpl = options.__testHooks?.runOplJson ?? runOplJson;
  const result = parseOplJsonResult(runOplJsonImpl(args, { ...options, timeoutMs: options.timeoutMs }), args);
  const afterState = readAgentPackageLifecycleState(options, target, workspace);
  return frameworkStageRuntimeActivationExpression({
    target,
    workspace,
    stageTarget,
    result,
    beforeSnapshot: beforeState.snapshot,
    afterSnapshot: afterState.snapshot,
    provisioning: workItemProvisioning,
  });
}

function firstRunBeginnerUxExpression() {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const guidEntry = document.querySelector('[data-testid="opl-guid-entry"], [aria-label="opl-guid-entry"]');
    const guidInput = document.querySelector('[data-testid="guid-input"]');
    const guidSendButton = document.querySelector('[data-testid="guid-send-btn"]');
    const windowNode = document.querySelector('[data-testid="opl-first-run-window"]');
    const progressNode = document.querySelector('[data-testid="opl-first-run-progress"]');
    const primaryNode = document.querySelector('[data-testid="opl-first-run-beginner-primary"]');
    const summaryNode = document.querySelector('[data-testid="opl-first-run-beginner-summary"]');
    const actionNode = document.querySelector('[data-testid="opl-first-run-primary-action"]');
    const detailsNode = document.querySelector('[data-testid="opl-first-run-technical-details-toggle"]');
    const deferredEntryNode = document.querySelector('[data-testid="opl-first-run-enter-app"]');
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    if (window.location.hash.startsWith('#/guid') && visible(guidEntry) && visible(guidInput) && visible(guidSendButton) && !windowNode && !appLoaderVisible) {
      return {
        status: 'skipped_by_usable_entry',
        reason: 'usable_guid_entry_reached_before_beginner_capture',
        hash: window.location.hash,
        entryKind: 'guid',
        labels: ['opl-guid-entry'],
        guidEntryVisible: true,
        guidInputVisible: true,
        guidSendButtonVisible: true,
      };
    }
    const assistantCards = ${JSON.stringify(OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => visibleHomeAssistantControlSelector(target)))}
      .map((selector) => [...document.querySelectorAll(selector)].find(visible))
      .filter(Boolean);
    if (assistantCards.length === ${OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.length} && visible(guidInput) && visible(guidSendButton) && !windowNode && !appLoaderVisible) {
      return {
        status: 'skipped_by_usable_entry',
        reason: 'usable_assistant_home_reached_before_beginner_capture',
        hash: window.location.hash,
        entryKind: 'assistant_home',
        labels: ${JSON.stringify(OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((target) => target.badge))},
        assistantCardsVisible: assistantCards.map((card) => card.getAttribute('data-testid')),
        guidEntryVisible: visible(guidEntry),
        guidInputVisible: true,
        guidSendButtonVisible: true,
      };
    }
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
          status: 'captured',
          hash: window.location.hash,
          beginnerPrimaryVisible: true,
          summaryText: summaryNode.textContent.trim(),
          primaryTextLength: primaryText.length,
          deferredEntryVisible: visible(deferredEntryNode),
          technicalDetailsCollapsed: true,
        }
      : false;
  })()`;
}

function startupPreflightExpression() {
  return `(() => {
    const preflightNode = document.querySelector('[data-testid="opl-startup-preflight"]');
    const firstRunWindow = document.querySelector('[data-testid="opl-first-run-window"]');
    const guidEntry = document.querySelector('[data-testid="opl-guid-entry"], [aria-label="opl-guid-entry"]');
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    if (preflightNode && visible(preflightNode)) {
      const text = preflightNode.innerText || '';
      const expectedText = [
        /Starting One Person Lab|正在启动 One Person Lab/,
        /Desktop session|桌面会话/,
        /App configuration|应用配置/,
        /Initialization status|初始化状态/,
      ];
      const missingText = expectedText.filter((pattern) => !pattern.test(text)).map(String);
      return missingText.length === 0
        ? {
            hash: window.location.hash,
            startupPreflightVisible: true,
            textLength: text.length,
          }
        : false;
    }
    return firstRunWindow || guidEntry
      ? {
          hash: window.location.hash,
          startupPreflightSkippedBy: firstRunWindow ? 'first_run' : 'guid',
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

function copyArtifact(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

async function captureFullReleaseScreenshotEvidence(options, client, sourcePath = null) {
  if (!shouldCaptureFullReleaseScreenshot(options)) {
    return null;
  }
  const targetPath = path.join(options.artifacts, RELEASE_EVIDENCE_SCREENSHOTS.full);
  if (fs.existsSync(targetPath)) {
    return { status: 'already_present', target: targetPath };
  }
  if (sourcePath) {
    copyArtifact(sourcePath, targetPath);
    return { status: 'copied', target: targetPath, source: sourcePath };
  }
  await captureCdpScreenshot(client, targetPath);
  return { status: 'captured', target: targetPath, source: 'cdp_current_page' };
}

function serializeCdpRemoteObject(remoteObject) {
  if (!remoteObject || typeof remoteObject !== 'object') return null;
  if ('value' in remoteObject) return remoteObject.value;
  if (remoteObject.unserializableValue) return String(remoteObject.unserializableValue);
  if (remoteObject.description) return String(remoteObject.description);
  return remoteObject.type ?? null;
}

function createRendererBootstrapDiagnosticsCollector(client) {
  const events = [];
  const append = (event) => {
    events.push({
      ...event,
      collected_at: new Date().toISOString(),
    });
    if (events.length > 80) events.shift();
  };
  const unsubscribe = [
    client.on?.('Runtime.consoleAPICalled', (params) => {
      append({
        source: 'Runtime.consoleAPICalled',
        type: params.type ?? null,
        text: (params.args ?? [])
          .map(serializeCdpRemoteObject)
          .filter((value) => value !== null)
          .join(' '),
        url: params.stackTrace?.callFrames?.[0]?.url ?? null,
        line: params.stackTrace?.callFrames?.[0]?.lineNumber ?? null,
      });
    }),
    client.on?.('Runtime.exceptionThrown', (params) => {
      append({
        source: 'Runtime.exceptionThrown',
        text:
          params.exceptionDetails?.exception?.description ||
          params.exceptionDetails?.text ||
          params.exceptionDetails?.exception?.value ||
          null,
        url: params.exceptionDetails?.url ?? null,
        line: params.exceptionDetails?.lineNumber ?? null,
        column: params.exceptionDetails?.columnNumber ?? null,
      });
    }),
    client.on?.('Log.entryAdded', (params) => {
      append({
        source: 'Log.entryAdded',
        level: params.entry?.level ?? null,
        text: params.entry?.text ?? null,
        url: params.entry?.url ?? null,
        line: params.entry?.lineNumber ?? null,
      });
    }),
  ].filter(Boolean);
  return {
    events,
    stop() {
      for (const unsubscribeEvent of unsubscribe) unsubscribeEvent();
    },
  };
}

function rendererBootstrapDiagnosticsExpression() {
  return `(() => {
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const selectorState = {};
    for (const id of [
      'opl-startup-preflight',
      'opl-first-run-window',
      'opl-first-run-progress',
      'opl-first-run-enter-app',
      'opl-first-run-ready-entry',
      'opl-guid-entry',
      'app',
      'root',
    ]) {
      const node = document.querySelector('[data-testid="' + id + '"], [aria-label="' + id + '"], #' + CSS.escape(id));
      selectorState[id] = node
        ? {
            present: true,
            visible: visible(node),
            tagName: node.tagName,
            className: String(node.className || ''),
            textSample: String(node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 1000),
          }
        : { present: false };
    }
    const storageKeys = (storage) => {
      try {
        return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean).slice(0, 80);
      } catch (error) {
        return { error: String(error) };
      }
    };
    const scripts = [...document.scripts].map((script) => ({
      src: script.src || '',
      type: script.type || '',
      textLength: script.src ? 0 : (script.textContent || '').length,
    })).slice(0, 80);
    return {
      schema: 'opl_renderer_bootstrap_diagnostics.v1',
      location: {
        href: window.location.href,
        hash: window.location.hash,
        pathname: window.location.pathname,
      },
      readyState: document.readyState,
      title: document.title,
      bodyTextLength: document.body?.innerText?.length ?? 0,
      bodyTextSample: String(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 2000),
      bodyHtmlSample: String(document.body?.innerHTML || '').slice(0, 4000),
      selectorState,
      scripts,
      localStorageKeys: storageKeys(window.localStorage),
      sessionStorageKeys: storageKeys(window.sessionStorage),
      globals: {
        opl: typeof window.opl,
        OPL: typeof window.OPL,
        aionui: typeof window.aionui,
        AionUi: typeof window.AionUi,
        electron: typeof window.electron,
      },
      userAgent: navigator.userAgent,
      language: navigator.language,
    };
  })()`;
}

async function collectRendererBootstrapDiagnostics(client, target, events, options, secret, error) {
  const diagnostics = {
    schema: 'opl_renderer_bootstrap_diagnostics_bundle.v1',
    status: 'failed',
    cdp_target: target
      ? {
          id: target.id ?? null,
          type: target.type ?? null,
          title: target.title ?? null,
          url: target.url ?? null,
        }
      : null,
    error: error instanceof Error ? error.message : String(error),
    events,
    snapshot: null,
  };
  try {
    diagnostics.snapshot = await evaluateCdp(client, rendererBootstrapDiagnosticsExpression(), 10_000);
  } catch (snapshotError) {
    diagnostics.snapshot_error = snapshotError instanceof Error ? snapshotError.message : String(snapshotError);
  }
  writeJsonArtifact(path.join(options.artifacts, 'renderer-bootstrap-diagnostics.json'), diagnostics, secret);
  return diagnostics;
}

async function waitForGuidEntryViaCdp(options, secret) {
  const target = await waitForCdpPageTarget(options.cdpPort, cdpProbeTimeoutMs(options));
  const client = await openCdpClient(target.webSocketDebuggerUrl);
  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const startupPreflight = await waitForCdpPredicate(
      client,
      startupPreflightExpression(),
      Math.min(options.timeoutMs, 10_000),
      'OPL startup did not expose a preflight, first-run, or Guid surface'
    );
    writeJsonArtifact(path.join(options.artifacts, 'startup-preflight.json'), startupPreflight, secret);
    const firstRunBeginnerUx = shouldCheckFirstRunBeginnerUx(options)
      ? await waitForCdpPredicate(
          client,
          firstRunBeginnerUxExpression(),
          options.timeoutMs,
          'OPL first-run beginner screen did not expose the simplified primary layout'
        )
      : null;
    if (firstRunBeginnerUx) {
      writeJsonArtifact(path.join(options.artifacts, 'first-run-beginner-ux.json'), firstRunBeginnerUx, secret);
      if (shouldCaptureFirstRunBeginnerScreenshot(firstRunBeginnerUx)) {
        const beginnerScreenshotPath = path.join(options.artifacts, 'first-run-beginner.png');
        await captureCdpScreenshot(client, beginnerScreenshotPath);
        await captureFullReleaseScreenshotEvidence(options, client, beginnerScreenshotPath);
      }
    }
    const state = await waitForCdpPredicate(
      client,
      guidEntryNavigationExpression(),
      options.timeoutMs,
      'OPL usable entry did not become ready in the packaged app'
    );
    await captureFullReleaseScreenshotEvidence(options, client);
    return { state, startupPreflight, firstRunBeginnerUx, labels: state.labels ?? [DEFAULT_LABELS.guidEntry] };
  } finally {
    client.close();
  }
}

async function waitForBootstrapLaunchDiagnostics(options, secret) {
  let target = null;
  let client = null;
  let rendererCollector = null;
  let rendererDiagnostics = null;
  try {
    target = await waitForCdpPageTarget(options.cdpPort, cdpProbeTimeoutMs(options));
    client = await openCdpClient(target.webSocketDebuggerUrl);
    rendererCollector = createRendererBootstrapDiagnosticsCollector(client);
    await client.send('Runtime.enable');
    await client.send('Log.enable').catch(() => null);
    await client.send('Page.enable');
    let startupPreflight = null;
    try {
      startupPreflight = await waitForCdpPredicate(
        client,
        startupPreflightExpression(),
        Math.min(options.timeoutMs, 10_000),
        'OPL startup did not expose a preflight, first-run, or Guid surface'
      );
    } catch (error) {
      rendererDiagnostics = await collectRendererBootstrapDiagnostics(
        client,
        target,
        rendererCollector.events,
        options,
        secret,
        error
      );
      throw error;
    }
    const summary = {
      schema: 'opl_bootstrap_launch_diagnostics.v1',
      status: 'passed',
      mode: 'cdp',
      cdp_port: options.cdpPort,
      target: {
        id: target.id ?? null,
        type: target.type ?? null,
        title: target.title ?? null,
        url: target.url ?? null,
      },
      startup_preflight: startupPreflight,
      renderer_bootstrap_diagnostics: rendererDiagnostics,
    };
    writeJsonArtifact(path.join(options.artifacts, 'bootstrap-launch-diagnostics.json'), summary, secret);
    return summary;
  } catch (error) {
    if (client && !rendererDiagnostics) {
      rendererDiagnostics = await collectRendererBootstrapDiagnostics(
        client,
        target,
        rendererCollector?.events ?? [],
        options,
        secret,
        error
      ).catch(() => null);
    }
    const launchDiagnostics = collectLaunchDiagnostics(options, secret);
    const nativeModalSignature = detectNativeModalLaunchBlocker(options, launchDiagnostics);
    const summary = {
      schema: 'opl_bootstrap_launch_diagnostics.v1',
      status: 'failed',
      mode: 'cdp',
      cdp_port: options.cdpPort,
      target: target
        ? {
            id: target.id ?? null,
            type: target.type ?? null,
            title: target.title ?? null,
            url: target.url ?? null,
          }
        : null,
      error: error instanceof Error ? error.message : String(error),
      renderer_bootstrap_diagnostics: rendererDiagnostics,
      native_modal_launch_blocker: nativeModalSignature,
      launch_diagnostics: {
        app_processes: launchDiagnostics.app_processes ?? [],
        cdp_listener: launchDiagnostics.cdp_listener ?? null,
        cdp_targets: launchDiagnostics.cdp_targets ?? null,
        native_window_diagnostics: launchDiagnostics.native_window_diagnostics ?? null,
        main_bootstrap_fatal_artifacts: launchDiagnostics.main_bootstrap_fatal_artifacts ?? null,
      },
    };
    writeJsonArtifact(path.join(options.artifacts, 'bootstrap-launch-diagnostics.json'), summary, secret);
    if (nativeModalSignature.detected) {
      writeJsonArtifact(path.join(options.artifacts, 'native-modal-launch-blocker.json'), nativeModalSignature, secret);
    }
    throw error;
  } finally {
    rendererCollector?.stop();
    client?.close();
  }
}

async function captureEarlyLaunchDiagnostics(options, secret) {
  try {
    return await waitForBootstrapLaunchDiagnostics(options, secret);
  } catch (error) {
    return {
      schema: 'opl_bootstrap_launch_diagnostics_probe.v1',
      status: 'captured_failure',
      error: error instanceof Error ? error.message : String(error),
      artifact: 'bootstrap-launch-diagnostics.json',
      blocking_release_gate: false,
      rule: 'release_gate_captures_early_bootstrap_diagnostics_before_full_readiness_checks',
    };
  }
}

function readRendererBootstrapFatal(artifacts) {
  const diagnosticsPath = path.join(artifacts, 'renderer-bootstrap-diagnostics.json');
  if (!fs.existsSync(diagnosticsPath)) return null;
  try {
    const diagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'));
    const event = diagnostics.events?.find((entry) => entry?.source === 'Runtime.exceptionThrown');
    if (!event) return null;
    return {
      source: event.source,
      text: typeof event.text === 'string' ? event.text : 'Unknown renderer exception',
      url: event.url ?? null,
      line: event.line ?? null,
      column: event.column ?? null,
    };
  } catch {
    return null;
  }
}

function assertNoRendererBootstrapFatal(artifacts) {
  const fatal = readRendererBootstrapFatal(artifacts);
  if (!fatal) return;
  throw new Error(`Renderer bootstrap failed before usable entry: ${fatal.text}`);
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
    const launchDiagnostics = collectLaunchDiagnostics(options, secret);
    const nativeModalSignature = detectNativeModalLaunchBlocker(options, launchDiagnostics);
    if (nativeModalSignature.detected) {
      writeJsonArtifact(path.join(options.artifacts, 'native-modal-launch-blocker.json'), nativeModalSignature, secret);
      writeSmokeEventSafely(options.writeSmokeEvent, 'wait_guid_cdp_native_modal', 'failed', nativeModalSignature);
      throw new Error(
        [
          'Packaged app launch is blocked by a native modal before CDP/window readiness.',
          `cdp_error=${error instanceof Error ? error.message : String(error)}`,
          `app_pids=${nativeModalSignature.app_pids.join(',') || 'none'}`,
          `sample_paths=${nativeModalSignature.nsalert_sample_paths.join(',') || 'none'}`,
          `main_bootstrap_fatal_copied=${nativeModalSignature.main_bootstrap_fatal_artifacts.copied_count}`,
          `main_bootstrap_fatal_candidates=${nativeModalSignature.main_bootstrap_fatal_artifacts.candidates.join(',')}`,
        ].join('\n')
      );
    }
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

function unwrapBackendResponseEnvelope(value) {
  if (value && typeof value === 'object' && 'data' in value) {
    return value.data;
  }
  return value;
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
  const eventHandlers = new Map();
  let nextId = 1;

  socket.addEventListener('message', (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8');
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) {
      if (message.method && eventHandlers.has(message.method)) {
        for (const handler of eventHandlers.get(message.method)) {
          try {
            handler(message.params ?? {});
          } catch {
            // Diagnostic listeners must never break the primary smoke path.
          }
        }
      }
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
    send(method, params = {}, timeoutMs = DEFAULT_CDP_COMMAND_TIMEOUT_MS) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(`Timed out waiting for CDP response: ${method}`));
        }, timeoutMs);
      });
    },
    on(method, handler) {
      if (!eventHandlers.has(method)) eventHandlers.set(method, new Set());
      eventHandlers.get(method).add(handler);
      return () => {
        eventHandlers.get(method)?.delete(handler);
      };
    },
    close() {
      socket.close();
    },
  };
}

async function evaluateCdp(client, expression, timeoutMs = DEFAULT_CDP_COMMAND_TIMEOUT_MS) {
  const result = await client.send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    timeoutMs
  );
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'CDP evaluation failed';
    throw new Error(detail);
  }
  return result.result?.value;
}

async function dispatchCdpPointerClick(client, prepared) {
  const x = Number(prepared?.click_point?.x);
  const y = Number(prepared?.click_point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Could not resolve a finite CDP click point: ${JSON.stringify(prepared?.click_point ?? null)}`);
  }
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'none',
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  return {
    ...prepared,
    clicked_at: await evaluateCdp(client, 'Date.now()'),
    pointer: { x, y, button: 'left', click_count: 1 },
  };
}

async function waitForCdpPredicate(client, expression, timeoutMs, failureMessage, evaluateTimeoutMs) {
  const started = Date.now();
  let lastValue = null;
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastValue = await evaluateCdp(client, expression, evaluateTimeoutMs);
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  const failure = new Error(
    [
      failureMessage,
      lastError ? `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '',
      lastValue ? `Last value: ${JSON.stringify(lastValue).slice(0, 500)}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
  failure.lastState = lastValue;
  failure.lastError = lastError instanceof Error ? lastError.message : lastError ? String(lastError) : null;
  throw failure;
}

const SETTINGS_PAGE_SMOKE_TARGETS = [
  {
    id: 'general',
    hash: '#/settings/general',
    contentSelector: '[data-testid="settings-page-overview"]',
    navigationGroupId: 'overview',
    navigationDestinationId: 'overview_status',
  },
  {
    id: 'environment',
    hash: '#/settings/environment',
    contentSelector: '[data-testid="settings-page-maintenance"]',
    navigationGroupId: 'runtime_maintenance',
    navigationDestinationId: 'runtime_services',
  },
  {
    id: 'capabilities',
    hash: '#/settings/capabilities',
    contentSelector: '[data-testid="settings-page-capabilities"]',
    navigationGroupId: 'agents_capabilities',
    navigationDestinationId: 'capabilities',
  },
  {
    id: 'access',
    hash: '#/settings/access',
    contentSelector: '[data-testid="settings-page-models"]',
    navigationGroupId: 'account_models',
    navigationDestinationId: 'models',
  },
  {
    id: 'appearance',
    hash: '#/settings/appearance',
    contentSelector: '[data-testid="settings-page-preferences"]',
    navigationGroupId: 'preferences',
    navigationDestinationId: 'preferences',
  },
  {
    id: 'diagnostics',
    hash: '#/settings/environment?section=diagnostics',
    contentSelector: '[data-testid="settings-page-maintenance"]',
    navigationGroupId: 'runtime_maintenance',
    navigationDestinationId: 'logs_diagnostics',
  },
  {
    id: 'about',
    hash: '#/settings/about',
    contentSelector: '[data-testid="settings-page-about"]',
    navigation: 'secondary',
  },
];

function cdpString(value) {
  return JSON.stringify(value);
}

function settingsNavItemExpression(target) {
  if (target.navigation === 'secondary') return 'true';
  return `Boolean(document.querySelector('[data-settings-group-id=${cdpString(target.navigationGroupId)}]'))`;
}

function pageReadinessExpression(target) {
  return `(() => {
    const text = document.body?.innerText || '';
    const navPresent = ${settingsNavItemExpression(target)};
    const contentPresent = Boolean(document.querySelector(${cdpString(target.contentSelector)}));
    const appLoaderVisible = Boolean(document.querySelector('[class*="loader"], .arco-spin-loading'));
    const firstRunWindowVisible = Boolean(document.querySelector('[data-testid="opl-first-run-window"]'));
    const hashOk = window.location.hash === ${cdpString(target.hash)};
    return hashOk && navPresent && contentPresent && text.length > 80 && !appLoaderVisible && !firstRunWindowVisible
      ? {
          id: ${cdpString(target.id)},
          hash: window.location.hash,
          textLength: text.length,
          navPresent,
          contentSelector: ${cdpString(target.contentSelector)},
          contentPresent,
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
    const titleOk = /OPL Runtime Status|OPL 运行状态|Project Runtime Progress|项目运行进度|Project Runtime Overview|项目运行总览/.test(text);
    const summaryOk = /App\\/operator Drilldown|运行状态摘要|Task Overview|任务概览|In progress|进行中|Needs system handling|需要系统处理|Status Load|状态加载/.test(text);
    const loadedOk = /Loaded at|已加载于|Loaded|已加载/.test(text);
    const pagePresent = Boolean(document.querySelector('[data-testid="runtime-v2-page"]'));
    const refreshPresent = Boolean(document.querySelector('[data-testid="runtime-refresh-button"]'));
    const readyStatePresent = Boolean(document.querySelector('[data-testid="runtime-ready-state"]'));
    const emptyStatePresent = Boolean(document.querySelector('[data-testid="runtime-empty-state"]'));
    const statusRegionPresent = Boolean(document.querySelector('[data-testid="runtime-status-region"]'));
    const pageReady = Boolean(
      pagePresent &&
      refreshPresent &&
      ((readyStatePresent && statusRegionPresent) || emptyStatePresent)
    );
    return hashOk && titleOk && pageReady
      ? {
          hash: window.location.hash,
          titleReady: titleOk,
          summaryReady: summaryOk,
          loadedReady: loadedOk,
          state: emptyStatePresent ? 'empty' : 'ready',
          pageReady,
        }
      : false;
  })()`;
}

async function captureSettingsPage(client, target, options, secret) {
  await evaluateCdp(client, `window.location.hash = ${cdpString(target.hash)}`);
  let pageState;
  try {
    pageState = await waitForCdpPredicate(
      client,
      pageReadinessExpression(target),
      Math.min(Math.max(60_000, Math.floor(options.timeoutMs / 6)), 180_000),
      `Settings page did not become ready: ${target.id}`
    );
  } catch (error) {
    const diagnostic = await evaluateCdp(
      client,
      `(() => {
        const text = document.body?.innerText || '';
        return {
          id: ${cdpString(target.id)},
          expectedHash: ${cdpString(target.hash)},
          hash: window.location.hash,
          textLength: text.length,
          navPresent: ${settingsNavItemExpression(target)},
          navigation: ${cdpString(target.navigation ?? 'top_level')},
          navigationGroupId: ${cdpString(target.navigationGroupId ?? null)},
          navigationDestinationId: ${cdpString(target.navigationDestinationId ?? null)},
          contentSelector: ${cdpString(target.contentSelector)},
          contentPresent: Boolean(document.querySelector(${cdpString(target.contentSelector)})),
          loaderVisible: Boolean(document.querySelector('[class*="loader"], .arco-spin-loading')),
          firstRunWindowVisible: Boolean(document.querySelector('[data-testid="opl-first-run-window"]')),
          textSample: text.slice(0, 1000),
        };
      })()`
    ).catch((diagnosticError) => ({
      diagnostic_error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
    }));
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nSettings readiness diagnostic: ${JSON.stringify(diagnostic)}`
    );
  }
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

function runtimeActionEvidenceExpression() {
  return `(async () => {
    if (!window.location.hash.startsWith('#/runtime')) {
      window.location.hash = '#/runtime';
      return false;
    }
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const advancedDetailsPattern = /Advanced Details|高级信息|高级详情/;
    const safeActionPattern = /Safe Action Routes|安全动作/;
    const toggle = [...document.querySelectorAll('button, [role="button"], .arco-collapse-item-header, .arco-collapse-header')]
      .find((candidate) => advancedDetailsPattern.test(candidate.textContent || '') && visible(candidate));
    const safeActionContainers = [...document.querySelectorAll('main, section, .arco-card, [class*="runtime"], .arco-collapse-item-content')]
      .filter((node) => safeActionPattern.test(node.textContent || '') && visible(node));
    const safeActionsReady = safeActionContainers.some((node) =>
      [...node.querySelectorAll('button')].some((candidate) => /Dry Run|试运行/.test(candidate.textContent || '') && visible(candidate))
    );
    const expanded =
      toggle
        ? toggle.getAttribute('aria-expanded') === 'true' ||
          toggle.closest('.arco-collapse-item')?.className?.includes('active')
        : safeActionsReady;
    if (toggle && !expanded) {
      toggle.click();
      await wait(500);
      return false;
    }
    const actionSection = [...document.querySelectorAll('main, section, .arco-card, [class*="runtime"]')]
      .find((node) => safeActionPattern.test(node.textContent || '') && visible(node));
    const button = [...(actionSection || document).querySelectorAll('button')]
      .find((candidate) => /Dry Run|试运行/.test(candidate.textContent || '') && visible(candidate));
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    button.click();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const text = document.body?.innerText || '';
      const resultVisible = /Action Result|动作结果/.test(text);
      const completed = /Dry run completed|试运行完成/.test(text);
      const failed = /Dry run failed|试运行失败|command failed|命令失败/i.test(text);
      if (resultVisible || completed) {
        return {
          hash: window.location.hash,
          actionResultVisible: resultVisible,
          dryRunCompleted: completed,
          failed,
        };
      }
      await wait(250);
    }
    throw new Error('Timed out waiting for Runtime action dry-run evidence.');
  })()`;
}

async function captureRuntimeActionEvidence(client, options, secret) {
  const actionEvidence = await waitForCdpPredicate(
    client,
    runtimeActionEvidenceExpression(),
    RUNTIME_ACTION_EVIDENCE_TIMEOUT_MS,
    'Runtime action evidence dry-run did not become ready',
    RUNTIME_ACTION_EVIDENCE_TIMEOUT_MS
  );
  writeJsonArtifact(path.join(options.artifacts, 'runtime-action-evidence.json'), actionEvidence, secret);
  await captureCdpScreenshot(client, path.join(options.artifacts, RELEASE_EVIDENCE_SCREENSHOTS.action));
  return actionEvidence;
}

function maintenanceDiagnosticsStatusExpression() {
  return `(() => {
    const details = document.querySelector('[data-testid="settings-maintenance-technical-details"]');
    if (details) {
      return {
        diagnosticsVisible: true,
        triggerPresent: Boolean(document.querySelector('[data-testid="settings-maintenance-diagnostics-action"]')),
      };
    }
    const trigger = document.querySelector('[data-testid="settings-maintenance-diagnostics-action"]');
    if (!trigger) return false;
    if (trigger.dataset.oplVmSmokeOpened !== 'true') {
      trigger.dataset.oplVmSmokeOpened = 'true';
      trigger.click();
    }
    return false;
  })()`;
}

function buildAssistantRouteSmokeFailureSummary(options, assistantTarget, results, error) {
  const verificationMode = options.runtimeProfile === 'full' ? 'route_receipt' : 'launch_gate';
  const lastState = error instanceof Error ? (error.lastState ?? null) : null;
  return {
    surface_id: 'opl_packaged_gui_assistant_route_smoke',
    status: 'failed',
    cdp_port: options.cdpPort,
    runtime_profile: options.runtimeProfile,
    verification_mode: verificationMode,
    failed_assistant: assistantTarget.id,
    assistants: results,
    compiled_expectations: COMPILED_EXPECTATION_CONSUMPTION,
    error: error instanceof Error ? error.message : String(error),
    last_state: lastState,
    last_error: error instanceof Error ? (error.lastError ?? null) : null,
    missing_controls: Array.isArray(lastState?.missing_controls) ? lastState.missing_controls : [],
    composer_state: lastState?.composer_state ?? null,
    required_contract: {
      purpose_entries: OPL_ASSISTANT_ROUTE_SMOKE_TARGETS.map((item) => `home-starter-${item.id}`),
      standard_launch_gate:
        verificationMode === 'launch_gate'
          ? {
              visible: true,
              selectable_before_selection: true,
              launch_allowed: false,
              send_blocked: true,
              readiness_hint: 'repair',
            }
          : null,
      decision_controls_visible:
        verificationMode === 'route_receipt' ? ['guid-model-selector', 'agent-mode-selector-*'] : null,
      executor_selectors_hidden: ['agent-pill-*'],
      route_receipt:
        verificationMode === 'route_receipt'
          ? {
              route_kind: 'builtin_capability',
              executor: 'codex_cli',
              source: 'opl_app_home',
            }
          : null,
    },
  };
}

async function assertMaintenanceDiagnosticsStatus(client) {
  return await waitForCdpPredicate(
    client,
    maintenanceDiagnosticsStatusExpression(),
    30_000,
    'Maintenance diagnostics did not become ready'
  );
}

async function runSettingsSmoke(options, secret) {
  const hooks = options.__testHooks ?? {};
  const target = await (hooks.waitForCdpPageTarget ?? waitForCdpPageTarget)(options.cdpPort, options.timeoutMs);
  const client = await (hooks.openCdpClient ?? openCdpClient)(target.webSocketDebuggerUrl);
  const results = [];
  let runtimeActionEvidence = null;
  let runtimeActionEvidenceBlocker = null;
  try {
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    for (const pageTarget of SETTINGS_PAGE_SMOKE_TARGETS) {
      const pageState = await (hooks.captureSettingsPage ?? captureSettingsPage)(client, pageTarget, options, secret);
      const interactions = {};
      if (pageTarget.id === 'runtime') {
        interactions.settingsRuntimeRefresh = await (hooks.exerciseRuntimeRefresh ?? exerciseRuntimeRefresh)(
          client,
          '#/settings/runtime'
        );
      }
      if (pageTarget.id === 'diagnostics') {
        interactions.maintenanceDiagnostics = await (
          hooks.assertMaintenanceDiagnosticsStatus ?? assertMaintenanceDiagnosticsStatus
        )(client);
      }
      results.push({ ...pageState, interactions });
    }
    results.push({
      id: 'runtime-status',
      hash: '#/runtime',
      interactions: {
        runtimeRefresh: await (hooks.exerciseRuntimeRefresh ?? exerciseRuntimeRefresh)(client, '#/runtime'),
      },
    });
    await captureCdpScreenshot(client, path.join(options.artifacts, 'settings-pages', 'runtime-status.png'));
    try {
      runtimeActionEvidence = await (hooks.captureRuntimeActionEvidence ?? captureRuntimeActionEvidence)(
        client,
        options,
        secret
      );
    } catch (error) {
      runtimeActionEvidenceBlocker = {
        status: 'blocked',
        blocker_kind: 'runtime_action_evidence_unavailable',
        reason: error instanceof Error ? error.message : String(error),
        next_action:
          'Rerun packaged Runtime action evidence after the OPL App state exposes a safe action route in app_state.actions or app_state.operator.actions.',
      };
      writeJsonArtifact(
        path.join(options.artifacts, 'runtime-action-evidence-blocker.json'),
        runtimeActionEvidenceBlocker,
        secret
      );
    }
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
      runtime_action_evidence: runtimeActionEvidence,
      runtime_action_evidence_blocker: runtimeActionEvidenceBlocker,
    },
    secret
  );
  results.runtimeActionEvidence = runtimeActionEvidence;
  results.runtimeActionEvidenceBlocker = runtimeActionEvidenceBlocker;
  return results;
}

async function runAssistantRouteSmoke(options, secret) {
  const target = await waitForCdpPageTarget(options.cdpPort, options.timeoutMs);
  const client = await openCdpClient(target.webSocketDebuggerUrl);
  const rendererCollector = createRendererBootstrapDiagnosticsCollector(client);
  const results = [];
  const assistantWorkspace = options.runtimeProfile === 'full' ? options.assistantWorkspace : null;
  if (assistantWorkspace) fs.mkdirSync(assistantWorkspace, { recursive: true });
  const writeFailureSummary = (assistantTarget, error) => {
    writeJsonArtifact(
      path.join(options.artifacts, 'assistant-route-smoke-summary.json'),
      buildAssistantRouteSmokeFailureSummary(options, assistantTarget, results, error),
      secret
    );
  };
  try {
    await client.send('Runtime.enable');
    await client.send('Log.enable').catch(() => null);
    await client.send('Page.enable');
    for (const assistantTarget of OPL_ASSISTANT_ROUTE_SMOKE_TARGETS) {
      try {
        await evaluateCdp(client, "window.location.hash = '#/guid'");
        await waitForCdpPredicate(
          client,
          guidEntryReadinessExpression(),
          30_000,
          `Guid page did not become ready before assistant route smoke: ${assistantTarget.id}`
        );
        if (options.runtimeProfile !== 'full') {
          const launchGate = await waitForCdpPredicate(
            client,
            homeAssistantStandardLaunchGateExpression(assistantTarget),
            30_000,
            `Standard Home assistant did not expose a selectable send-time launch gate: ${assistantTarget.id}`
          );
          if (launchGate?.status === 'failed') {
            const error = new Error(`Standard Home assistant launch gate failed: ${JSON.stringify(launchGate)}`);
            error.lastState = launchGate;
            throw error;
          }
          await captureCdpScreenshot(
            client,
            path.join(options.artifacts, 'assistant-route-smoke', `${assistantTarget.codexVisibleEntry}.png`)
          );
          results.push({
            id: assistantTarget.id,
            assistant_id: assistantTarget.id,
            shortcut_id: assistantTarget.shortcutId,
            package_id: assistantTarget.packageId,
            codex_visible_entry: assistantTarget.codexVisibleEntry,
            required_skill_ids: assistantTarget.requiredSkillIds,
            badge: assistantTarget.badge,
            verification_mode: 'launch_gate',
            launch_gate: launchGate,
          });
          continue;
        }
        const workItemProvisioning =
          assistantTarget.packageId === 'mas'
            ? resolveMasQualificationProvisioningReceipt(options.masStudyProvisioningReceipt, assistantWorkspace)
            : null;
        const packageStateBeforeSend = readAgentPackageLifecycleState(options, assistantTarget, assistantWorkspace);
        const workspace = await waitForCdpPredicate(
          client,
          homeAssistantWorkspaceContextExpression(assistantWorkspace),
          30_000,
          `Could not prepare a workspace-scoped OPL assistant launch: ${assistantTarget.id}`
        );
        const selected = await waitForCdpPredicate(
          client,
          homeAssistantRouteSelectionExpression(assistantTarget),
          Math.min(options.timeoutMs, FULL_ASSISTANT_READINESS_TIMEOUT_MS),
          `Could not select OPL built-in assistant: ${assistantTarget.id}`
        );
        if (selected?.status === 'failed') {
          throw new Error(`OPL built-in assistant selection leaked selectors: ${JSON.stringify(selected)}`);
        }
        const ready = await waitForCdpPredicate(
          client,
          homeAssistantRouteReadyExpression(assistantTarget),
          30_000,
          `Selected OPL built-in assistant did not expose the selected Home capability state and composer decision controls: ${assistantTarget.id}`
        );
        if (ready?.status === 'failed') {
          const error = new Error(`Selected OPL Home composer contract failed: ${JSON.stringify(ready)}`);
          error.lastState = ready;
          throw error;
        }
        await captureCdpScreenshot(
          client,
          path.join(options.artifacts, 'assistant-route-smoke', `${assistantTarget.codexVisibleEntry}.png`)
        );
        let coreReadiness;
        try {
          coreReadiness = await waitForCdpPredicate(
            client,
            homeAssistantCoreReadinessExpression(),
            Math.min(options.timeoutMs, FULL_ASSISTANT_READINESS_TIMEOUT_MS),
            `Core launch prerequisites did not become ready before OPL assistant send: ${assistantTarget.id}`
          );
        } catch (error) {
          if (error instanceof Error) {
            error.lastState = await evaluateCdp(client, homeAssistantCoreReadinessExpression(false));
          }
          throw error;
        }
        const routePrompt = `Verify the packaged ${assistantTarget.shortName} workspace session and route receipt.`;
        const sendPrepared = await waitForCdpPredicate(
          client,
          homeAssistantRouteSendWithoutActivationExpression(assistantTarget, routePrompt),
          30_000,
          `Could not prepare a real pointer send through the OPL built-in assistant composer: ${assistantTarget.id}`
        );
        const sent = await dispatchCdpPointerClick(client, sendPrepared);
        let sendState;
        try {
          sendState = await waitForCdpPredicate(
            client,
            homeAssistantRouteSendStateExpression(assistantTarget, routePrompt, sent.clicked_at),
            Math.min(options.timeoutMs, FULL_ASSISTANT_SEND_TIMEOUT_MS),
            `OPL built-in assistant send did not reach a conversation route: ${assistantTarget.id}`
          );
        } catch (error) {
          if (error instanceof Error) {
            error.lastState = {
              ...(await evaluateCdp(
                client,
                homeAssistantRouteSendStateExpression(assistantTarget, routePrompt, sent.clicked_at, false)
              )),
              core_readiness: coreReadiness,
              send_diagnostics: await evaluateCdp(client, homeAssistantRouteSendDiagnosticsExpression()),
              renderer_events: rendererCollector.events,
            };
          }
          throw error;
        }
        if (sendState?.status === 'failed') {
          const lastState = {
            ...sendState,
            core_readiness: coreReadiness,
            send_diagnostics: await evaluateCdp(client, homeAssistantRouteSendDiagnosticsExpression()),
            renderer_events: rendererCollector.events,
          };
          const error = new Error(`OPL built-in assistant send failed: ${JSON.stringify(lastState)}`);
          error.lastState = lastState;
          throw error;
        }
        const receipt = await waitForCdpPredicate(
          client,
          activeConversationRouteReceiptExpression(assistantTarget, assistantWorkspace),
          45_000,
          `UI-created conversation did not expose matching workspace and route receipts: ${assistantTarget.id}`
        );
        const packageStateAfterSend = readAgentPackageLifecycleState(options, assistantTarget, assistantWorkspace);
        const ordinarySendActivation = assertHomeAssistantRouteSendWithoutActivation(
          packageStateBeforeSend.snapshot,
          packageStateAfterSend.snapshot
        );
        const frameworkStageActivation = runFrameworkStageRuntimeActivation(
          options,
          assistantTarget,
          assistantWorkspace,
          packageStateAfterSend,
          workItemProvisioning
        );
        results.push({
          id: assistantTarget.id,
          assistant_id: assistantTarget.id,
          shortcut_id: assistantTarget.shortcutId,
          package_id: assistantTarget.packageId,
          codex_visible_entry: assistantTarget.codexVisibleEntry,
          required_skill_ids: assistantTarget.requiredSkillIds,
          badge: assistantTarget.badge,
          verification_mode: 'route_receipt',
          interaction_path: 'workspace_guid_ui_send_without_shell_activation_then_conversation_get',
          workspace,
          selected,
          ready,
          core_readiness: coreReadiness,
          sent,
          send_state: sendState,
          send_diagnostics: await evaluateCdp(client, homeAssistantRouteSendDiagnosticsExpression()),
          receipt,
          ordinary_send_activation: ordinarySendActivation,
          framework_stage_runtime_activation: frameworkStageActivation,
        });
      } catch (error) {
        writeFailureSummary(assistantTarget, error);
        throw error;
      }
    }
  } finally {
    rendererCollector.stop();
    client.close();
  }
  const summary = {
    surface_id: 'opl_packaged_gui_assistant_route_smoke',
    status: 'passed',
    cdp_port: options.cdpPort,
    runtime_profile: options.runtimeProfile,
    verification_mode: options.runtimeProfile === 'full' ? 'route_receipt' : 'launch_gate',
    interaction_path:
      options.runtimeProfile === 'full'
        ? 'workspace_guid_ui_send_without_shell_activation_then_conversation_get'
        : 'launch_gate_only',
    assistants: results,
    compiled_expectations: COMPILED_EXPECTATION_CONSUMPTION,
  };
  writeJsonArtifact(path.join(options.artifacts, 'assistant-route-smoke-summary.json'), summary, secret);
  return results;
}

function unifiedLogPredicate(processName) {
  const escapedProcessName = processName.replace(/"/g, '\\"');
  return [
    `process == "${escapedProcessName}"`,
    `eventMessage CONTAINS[c] "${escapedProcessName}"`,
    'process CONTAINS[c] "Electron"',
    'subsystem CONTAINS[c] "LaunchServices"',
    'subsystem CONTAINS[c] "runningboard"',
    'subsystem CONTAINS[c] "TCC"',
    'process == "syspolicyd"',
  ].join(' OR ');
}

function captureUnifiedLog(processName, target) {
  const result = spawnSync(
    'log',
    ['show', '--last', '10m', '--style', 'compact', '--predicate', unifiedLogPredicate(processName)],
    {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );
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

function collectMainBootstrapFatalArtifacts(options, secret, targetDir = path.join(options.artifacts, 'launch-app')) {
  fs.mkdirSync(targetDir, { recursive: true });
  const candidates = defaultMainBootstrapFatalLogCandidates(options.processName);
  const copied = [];
  for (const [index, source] of candidates.entries()) {
    if (!fs.existsSync(source)) continue;
    const parent = path.basename(path.dirname(source)).replace(/[^A-Za-z0-9_.-]/g, '_') || `candidate-${index + 1}`;
    const target = path.join(targetDir, `main-bootstrap-fatal-${parent}.jsonl`);
    copyTextFileIfExists(source, target, secret);
    copied.push({ source, target });
  }
  const summary = {
    schema: 'aionui.main_bootstrap_fatal_artifacts.v1',
    candidates,
    copied,
    copied_count: copied.length,
  };
  writeJsonArtifact(path.join(targetDir, 'main-bootstrap-fatal-candidates.json'), summary, secret);
  return summary;
}

function isPathWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

function filesystemCollectionError(operation, source, error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null;
  return {
    type: 'filesystem_collection_error',
    operation,
    source,
    code,
    message: error instanceof Error ? error.message : String(error),
  };
}

function collectFailureArtifactSafely(writeSmokeEvent, source, operation) {
  try {
    return operation();
  } catch (error) {
    writeSmokeEventSafely(writeSmokeEvent, 'failure_artifact_collection', 'failed', {
      ...filesystemCollectionError('collect_artifact', source, error),
    });
    return null;
  }
}

function copyLogDirectory(sourceRoot, targetRoot, secret, summary) {
  const stack = [sourceRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      summary.errors.push(filesystemCollectionError('read_directory', current, error));
      continue;
    }
    for (const entry of entries) {
      const source = path.resolve(current, entry.name);
      if (!isPathWithinRoot(sourceRoot, source)) continue;
      let stats;
      try {
        stats = fs.lstatSync(source);
      } catch (error) {
        summary.errors.push(filesystemCollectionError('inspect_entry', source, error));
        continue;
      }
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        stack.push(source);
        continue;
      }
      if (!stats.isFile()) continue;
      const target = path.join(targetRoot, path.relative(sourceRoot, source));
      let content;
      try {
        content = fs.readFileSync(source, 'utf8');
      } catch (error) {
        summary.errors.push(filesystemCollectionError('read_file', source, error));
        continue;
      }
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        writeTextArtifact(target, content, secret);
        summary.copied.push({ source, target });
      } catch (error) {
        summary.errors.push(filesystemCollectionError('write_file', target, error));
      }
    }
  }
}

function collectAppLogArtifacts(options, secret, logRoots) {
  const roots = logRoots ?? [
    path.dirname(defaultFirstRunLogPath()),
    path.join(userHomeDir(), 'Library', 'Logs', 'AionUi'),
    path.join(userHomeDir(), 'Library', 'Logs', 'One Person Lab'),
    path.join(userHomeDir(), 'Library', 'Logs', 'cn.onepersonlab.opl'),
    path.join(defaultAppSupportPath(options.processName), 'logs'),
    path.join(userHomeDir(), 'Library', 'Application Support', 'AionUi', 'logs'),
  ];
  const seen = new Set();
  const targetDir = path.join(options.artifacts, 'app-logs');
  const summary = {
    schema: 'opl_vm_smoke_app_log_artifacts.v1',
    candidates: roots.map((logDir) => path.resolve(logDir)),
    copied: [],
    copied_count: 0,
    errors: [],
    error_count: 0,
  };
  for (const [index, logDir] of roots.entries()) {
    const sourceRoot = path.resolve(logDir);
    if (seen.has(sourceRoot) || !fs.existsSync(sourceRoot)) continue;
    let stats;
    try {
      stats = fs.lstatSync(sourceRoot);
    } catch (error) {
      summary.errors.push(filesystemCollectionError('inspect_root', sourceRoot, error));
      continue;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) continue;
    seen.add(sourceRoot);
    const safeRootName = path.basename(sourceRoot).replace(/[^A-Za-z0-9_.-]/g, '_') || 'logs';
    const targetRoot = path.join(targetDir, `${String(index + 1).padStart(2, '0')}-${safeRootName}`);
    copyLogDirectory(sourceRoot, targetRoot, secret, summary);
  }
  summary.copied_count = summary.copied.length;
  summary.error_count = summary.errors.length;
  fs.mkdirSync(targetDir, { recursive: true });
  writeJsonArtifact(path.join(targetDir, 'collection-summary.json'), summary, secret);
  return summary;
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

function parseProcessRows(psOutput, processName) {
  const rows = [];
  for (const line of String(psOutput || '')
    .split('\n')
    .slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/\/grep\s+/.test(trimmed)) continue;
    const match = /^(\d+)\s+(\d+)\s+(.*)$/.exec(trimmed);
    if (!match) continue;
    const args = match[3];
    if (!isPackagedAppProcessArgs(args, processName)) continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      args,
    });
  }
  return rows;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPackagedAppProcessArgs(args, processName) {
  const escapedName = escapeRegExp(processName);
  const mainExecutable = new RegExp(`(?:^|\\s)/[^\\n]*${escapedName}\\.app/Contents/MacOS/${escapedName}(?:\\s|$)`);
  const helperExecutable = new RegExp(
    `(?:^|\\s)/[^\\n]*${escapedName}\\.app/Contents/Frameworks/${escapedName} Helper(?: \\([^)]*\\))?\\.app/Contents/MacOS/${escapedName} Helper(?: \\([^)]*\\))?(?:\\s|$)`
  );
  return mainExecutable.test(args) || helperExecutable.test(args);
}

function writeProcessDiagnosticArtifacts(launchLogDir, processRows, secret) {
  const seenPids = new Set();
  for (const row of processRows) {
    if (!Number.isInteger(row.pid) || row.pid <= 0 || seenPids.has(row.pid)) continue;
    seenPids.add(row.pid);
    const prefix = path.join(launchLogDir, `process-${row.pid}`);
    const sample = commandDiagnostic('/usr/bin/sample', [String(row.pid), '5', '-file', `${prefix}-sample.txt`], {
      timeout: 8_000,
    });
    writeJsonArtifact(`${prefix}-sample-command.json`, sample, secret);
    const lsof = commandDiagnostic('lsof', ['-nP', '-p', String(row.pid)], { timeout: 8_000 });
    writeOptionalTextArtifact(`${prefix}-lsof.txt`, lsof.stdout || lsof.stderr || '', secret);
  }
}

function collectDiagnosticReports(options, secret) {
  const targetDir = path.join(options.artifacts, 'diagnostic-reports');
  const reportRoots = [
    path.join(userHomeDir(), 'Library', 'Logs', 'DiagnosticReports'),
    path.join('/Library', 'Logs', 'DiagnosticReports'),
  ];
  const namePattern = /(One Person Lab|AionUi|cn\.onepersonlab\.opl|Electron)/i;
  for (const root of reportRoots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !namePattern.test(entry.name)) continue;
      fs.mkdirSync(targetDir, { recursive: true });
      const source = path.join(root, entry.name);
      const safeRootName = `${path.basename(path.dirname(root))}-${path.basename(root)}`;
      const safeName = `${safeRootName}-${entry.name}`.replace(/[^A-Za-z0-9_.-]/g, '_');
      copyTextFileIfExists(source, path.join(targetDir, safeName), secret);
    }
  }
}

function commandDiagnostic(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 10_000,
    maxBuffer: options.maxBuffer ?? 5 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function nativeWindowDiagnosticsScript(processName) {
  return `
const procName = ${JSON.stringify(processName)};
const systemEvents = Application('System Events');
const maxDepth = 8;
const maxNodes = 400;
const alertRolePattern = /(AXAlert|AXDialog|AXSheet|AXWindow|AXStaticText|AXButton|AXGroup)/;
function tryRead(fn) {
  try {
    const value = fn();
    if (value === undefined || value === null) return null;
    return String(value);
  } catch (_) {
    return null;
  }
}
function readElement(element, depth) {
  const role = tryRead(() => element.role());
  return {
    role,
    subrole: tryRead(() => element.subrole()),
    name: tryRead(() => element.name()),
    description: tryRead(() => element.description()),
    title: tryRead(() => element.title()),
    value: tryRead(() => element.value()),
    help: tryRead(() => element.help()),
    position: tryRead(() => element.position()),
    size: tryRead(() => element.size()),
    depth,
  };
}
function nodeText(node) {
  return [node.name, node.description, node.title, node.value, node.help]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' | ');
}
function walk(element, depth, output) {
  if (depth > maxDepth || output.length >= maxNodes) return;
  const node = readElement(element, depth);
  output.push(node);
  let children = [];
  try {
    children = element.uiElements();
  } catch (_) {
    children = [];
  }
  for (const child of children) {
    if (output.length >= maxNodes) break;
    walk(child, depth + 1, output);
  }
}
function readCollection(collection) {
  const branches = [];
  for (let index = 0; index < collection.length; index += 1) {
    branches.push({
      index,
      nodes: readBranch(collection[index]),
    });
  }
  return branches;
}
function readBranch(element) {
  const nodes = [];
  walk(element, 0, nodes);
  return nodes;
}
function readProcess(processRef) {
  const result = {
    found: true,
    name: tryRead(() => processRef.name()),
    unix_id: tryRead(() => processRef.unixId()),
    frontmost: tryRead(() => processRef.frontmost()),
    visible: tryRead(() => processRef.visible()),
    windows: [],
    top_level_ui_elements: [],
    errors: [],
  };
  try {
    result.windows = readCollection(processRef.windows());
  } catch (error) {
    result.errors.push({ surface: 'windows', message: String(error) });
  }
  try {
    result.top_level_ui_elements = readCollection(processRef.uiElements());
  } catch (error) {
    result.errors.push({ surface: 'uiElements', message: String(error) });
  }
  return result;
}
function readVisibleProcessSummary(processRef) {
  const name = tryRead(() => processRef.name());
  const frontmost = tryRead(() => processRef.frontmost());
  const visible = tryRead(() => processRef.visible());
  let windowCount = null;
  let windowTitles = [];
  try {
    const windows = processRef.windows();
    windowCount = windows.length;
    for (let index = 0; index < windows.length && index < 8; index += 1) {
      const windowNode = readElement(windows[index], 0);
      windowTitles.push(nodeText(windowNode));
    }
  } catch (_) {
    windowCount = null;
  }
  return { name, frontmost, visible, window_count: windowCount, window_titles: windowTitles.filter(Boolean) };
}
let targetProcess = { found: false, name: procName };
try {
  const matchingProcesses = systemEvents.processes.whose({ name: procName })();
  if (matchingProcesses.length > 0) {
    targetProcess = readProcess(matchingProcesses[0]);
  }
} catch (error) {
  targetProcess = { found: false, name: procName, error: String(error) };
}
let frontmostProcesses = [];
try {
  const processes = systemEvents.processes.whose({ frontmost: true })();
  for (let index = 0; index < processes.length && frontmostProcesses.length < 8; index += 1) {
    const summary = readVisibleProcessSummary(processes[index]);
    frontmostProcesses.push(summary);
  }
} catch (_) {
  frontmostProcesses = [];
}
const allNodes = [];
if (targetProcess.found) {
  const branches = targetProcess.windows.concat(targetProcess.top_level_ui_elements);
  for (const branch of branches) {
    for (const node of branch.nodes || []) allNodes.push(node);
  }
}
const likelyAlertNodes = allNodes
  .map((node) => ({ role: node.role, subrole: node.subrole, text: nodeText(node), depth: node.depth }))
  .filter((node) => node.text && alertRolePattern.test(String(node.role || node.subrole || '')))
  .slice(0, 80);
JSON.stringify({
  schema: 'opl_packaged_gui_native_window_snapshot.v1',
  process_name: procName,
  target_process: targetProcess,
  frontmost_processes: frontmostProcesses,
  likely_alert_nodes: likelyAlertNodes,
});
`;
}

function captureNativeWindowDiagnostics(processName) {
  const script = nativeWindowDiagnosticsScript(processName);
  const result = spawnSync('osascript', ['-l', 'JavaScript', '-e', script], {
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  let parsed = null;
  let parseError = null;
  if (result.status === 0 && result.stdout) {
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    schema: 'opl_packaged_gui_native_window_diagnostics.v1',
    process_name: processName,
    collected_at: new Date().toISOString(),
    osascript: {
      command: 'osascript -l JavaScript -e <native-window-diagnostics>',
      status: result.status,
      signal: result.signal ?? null,
      error: result.error?.message ?? null,
      stderr: result.stderr ?? '',
      stdout_length: result.stdout?.length ?? 0,
      parse_error: parseError,
    },
    result: parsed,
  };
}

function summarizeNativeWindowDiagnostics(diagnostics) {
  const result = diagnostics?.result;
  const targetProcess = result?.target_process;
  const likelyAlertNodes = Array.isArray(result?.likely_alert_nodes) ? result.likely_alert_nodes : [];
  const frontmostProcesses = Array.isArray(result?.frontmost_processes) ? result.frontmost_processes.slice(0, 8) : [];
  const windowTitleText = [];
  for (const processSummary of frontmostProcesses) {
    if (!Array.isArray(processSummary?.window_titles)) continue;
    for (const title of processSummary.window_titles) {
      appendUniqueDiagnosticText(windowTitleText, title, 'frontmost_window_title', 12);
    }
  }
  const likelyAlertText = [];
  for (const node of likelyAlertNodes) {
    appendUniqueDiagnosticText(likelyAlertText, node?.text, 'accessibility_likely_alert', 12);
  }
  return {
    status: result ? 'passed' : 'failed',
    osascript_status: diagnostics?.osascript?.status ?? null,
    osascript_error: diagnostics?.osascript?.error ?? null,
    target_process_found: targetProcess?.found === true,
    target_process_window_count: Array.isArray(targetProcess?.windows) ? targetProcess.windows.length : null,
    target_process_ui_element_count: Array.isArray(targetProcess?.top_level_ui_elements)
      ? targetProcess.top_level_ui_elements.length
      : null,
    frontmost_processes: frontmostProcesses,
    window_title_text: windowTitleText,
    likely_alert_text: likelyAlertText,
  };
}

function collectLaunchDiagnostics(options, secret) {
  const launchLogDir = path.join(options.artifacts, 'launch-app');
  fs.mkdirSync(launchLogDir, { recursive: true });
  const processList = commandDiagnostic('/bin/ps', ['axo', 'pid,ppid,args']);
  const processRows = parseProcessRows(processList.stdout, options.processName);
  const uid = String(os.userInfo().uid);
  const nativeWindowDiagnostics = captureNativeWindowDiagnostics(options.processName);
  const mainBootstrapFatalArtifacts = collectMainBootstrapFatalArtifacts(options, secret, launchLogDir);
  const diagnostics = {
    schema: 'opl_packaged_gui_launch_diagnostics.v1',
    process_name: options.processName,
    cdp_port: options.cdpPort,
    launch_json_present: fs.existsSync(path.join(launchLogDir, 'launch.json')),
    aqua_session: {
      console_user: commandDiagnostic('/usr/sbin/scutil', ['show', 'State:/Users/ConsoleUser']),
      dev_console_owner: commandDiagnostic('/usr/bin/stat', ['-f', '%Su', '/dev/console']),
      launchctl_gui: commandDiagnostic('launchctl', ['print', `gui/${uid}`], { timeout: 10_000 }),
      who: commandDiagnostic('/usr/bin/who', []),
    },
    launchctl_env: {
      AIONUI_CDP_PORT: commandDiagnostic('launchctl', ['getenv', 'AIONUI_CDP_PORT']),
      OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: commandDiagnostic('launchctl', [
        'getenv',
        'OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL',
      ]),
      OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: commandDiagnostic('launchctl', [
        'getenv',
        'OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL',
      ]),
      OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: commandDiagnostic('launchctl', [
        'getenv',
        'OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR',
      ]),
    },
    process: processList,
    app_processes: processRows,
    cdp_listener: commandDiagnostic('lsof', ['-nP', `-iTCP:${options.cdpPort}`, '-sTCP:LISTEN']),
    cdp_targets: commandDiagnostic('/usr/bin/curl', [
      '-sS',
      '--connect-timeout',
      '2',
      '--max-time',
      '3',
      `http://127.0.0.1:${options.cdpPort}/json/list`,
    ]),
    native_window_diagnostics: summarizeNativeWindowDiagnostics(nativeWindowDiagnostics),
    main_bootstrap_fatal_artifacts: mainBootstrapFatalArtifacts,
  };
  writeJsonArtifact(path.join(launchLogDir, 'native-window-diagnostics.json'), nativeWindowDiagnostics, secret);
  writeJsonArtifact(path.join(launchLogDir, 'diagnostics.json'), diagnostics, secret);
  writeProcessDiagnosticArtifacts(launchLogDir, processRows, secret);
  copyTextFileIfExists(defaultCdpRegistryPath(), path.join(launchLogDir, 'cdp-registry.json'), secret);
  return diagnostics;
}

function detectNativeModalLaunchBlocker(options, diagnostics) {
  const launchLogDir = path.join(options.artifacts, 'launch-app');
  const appPids = (Array.isArray(diagnostics?.app_processes) ? diagnostics.app_processes : [])
    .map((row) => row?.pid)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  const nativeWindow = diagnostics?.native_window_diagnostics ?? {};
  const cdpAbsent =
    diagnostics?.cdp_listener?.status !== 0 &&
    /Timed out waiting for packaged app CDP target|Failed to connect|Couldn.t connect|ECONNREFUSED/i.test(
      `${diagnostics?.cdp_targets?.stderr ?? ''}\n${diagnostics?.cdp_targets?.error ?? ''}`
    );
  const noNativeWindowSurface =
    nativeWindow.target_process_found === true &&
    nativeWindow.target_process_window_count === 0 &&
    nativeWindow.target_process_ui_element_count === 0;
  const nsalertSamplePaths = [];
  for (const pid of appPids) {
    const samplePath = path.join(launchLogDir, `process-${pid}-sample.txt`);
    let sample = '';
    try {
      sample = fs.readFileSync(samplePath, 'utf8');
    } catch {
      sample = '';
    }
    if (/\-\[NSAlert runModal\]/.test(sample)) {
      nsalertSamplePaths.push(samplePath);
    }
  }
  const mainBootstrapFatalArtifacts = diagnostics?.main_bootstrap_fatal_artifacts ?? {
    schema: 'aionui.main_bootstrap_fatal_artifacts.v1',
    candidates: defaultMainBootstrapFatalLogCandidates(options.processName),
    copied: [],
    copied_count: 0,
  };
  const likelyAlertText = Array.isArray(nativeWindow.likely_alert_text) ? nativeWindow.likely_alert_text : [];
  const windowTitleText = Array.isArray(nativeWindow.window_title_text) ? nativeWindow.window_title_text : [];
  const bootstrapFatalText = collectBootstrapFatalText(mainBootstrapFatalArtifacts);
  const launchLogText = collectLaunchLogText(launchLogDir);
  const nativeModalText = collectNativeModalText(nativeWindow, bootstrapFatalText, launchLogText);

  return {
    schema: 'opl_packaged_gui_native_modal_launch_blocker.v1',
    detected: Boolean(cdpAbsent && appPids.length > 0 && nsalertSamplePaths.length > 0),
    cdp_absent: Boolean(cdpAbsent),
    app_process_alive: appPids.length > 0,
    no_native_window_surface: Boolean(noNativeWindowSurface),
    nsalert_run_modal_sample_found: nsalertSamplePaths.length > 0,
    app_pids: appPids,
    nsalert_sample_paths: nsalertSamplePaths,
    likely_alert_text: likelyAlertText,
    window_title_text: windowTitleText,
    bootstrap_fatal_text: bootstrapFatalText,
    launch_log_text: launchLogText,
    native_modal_text: nativeModalText,
    evidence_contract: {
      blocker_detection_rule: 'cdp_absent_and_app_process_alive_and_nsalert_run_modal_sample_found',
      text_sources: [
        'accessibility_likely_alert',
        'frontmost_window_title',
        'main_bootstrap_fatal.error.message',
        'main_bootstrap_fatal.error.stack',
        'launch_stderr',
        'launch_stdout',
      ],
      alert_text_required_when_accessibility_available: true,
    },
    native_window_diagnostics: nativeWindow,
    main_bootstrap_fatal_artifacts: mainBootstrapFatalArtifacts,
  };
}

function collectFailureArtifacts(options, codexApiKey, writeSmokeEvent) {
  const hooks = options.__testHooks ?? {};
  fs.mkdirSync(options.artifacts, { recursive: true });
  collectFailureArtifactSafely(writeSmokeEvent, 'launch-app', () =>
    (hooks.collectLaunchDiagnostics ?? collectLaunchDiagnostics)(options, codexApiKey)
  );
  try {
    writeJsonArtifact(
      path.join(options.artifacts, 'failure-accessibility-tree.json'),
      (hooks.queryAccessibility ?? queryAccessibility)(options.processName),
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
  collectFailureArtifactSafely(writeSmokeEvent, 'first-run.jsonl', () =>
    copyTextFileIfExists(firstRunLog, path.join(options.artifacts, 'first-run.jsonl'), codexApiKey)
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'main-bootstrap-fatal', () =>
    (hooks.collectMainBootstrapFatalArtifacts ?? collectMainBootstrapFatalArtifacts)(options, codexApiKey)
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'app-logs', () =>
    (hooks.collectAppLogArtifacts ?? collectAppLogArtifacts)(options, codexApiKey)
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'app-support-files.txt', () =>
    (hooks.collectFileListing ?? collectFileListing)(
      defaultAppSupportPath(options.processName),
      path.join(options.artifacts, 'app-support-files.txt')
    )
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'aionui-app-support-files.txt', () =>
    (hooks.collectFileListing ?? collectFileListing)(
      path.join(userHomeDir(), 'Library', 'Application Support', 'AionUi'),
      path.join(options.artifacts, 'aionui-app-support-files.txt')
    )
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'bundle-id-app-support-files.txt', () =>
    (hooks.collectFileListing ?? collectFileListing)(
      path.join(userHomeDir(), 'Library', 'Application Support', 'cn.onepersonlab.opl'),
      path.join(options.artifacts, 'bundle-id-app-support-files.txt')
    )
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'opl-state-files.txt', () =>
    (hooks.collectFileListing ?? collectFileListing)(
      defaultOplStatePath(),
      path.join(options.artifacts, 'opl-state-files.txt')
    )
  );
  collectFailureArtifactSafely(writeSmokeEvent, 'diagnostic-reports', () =>
    (hooks.collectDiagnosticReports ?? collectDiagnosticReports)(options, codexApiKey)
  );

  for (const [name, args] of [
    ['system-initialize.json', ['system', 'initialize', '--json']],
    ['modules.json', OPL_CONNECT_MODULES_ARGS],
  ]) {
    try {
      writeTextArtifact(
        path.join(options.artifacts, name),
        (hooks.runOplJson ?? runOplJson)(args, options),
        codexApiKey
      );
    } catch (error) {
      writeOplJsonCommandErrorArtifacts(path.join(options.artifacts, name), error, codexApiKey);
    }
  }

  collectFailureArtifactSafely(writeSmokeEvent, 'failure-first-launch.png', () =>
    (hooks.captureMacScreenArtifact ?? captureMacScreenArtifact)(
      path.join(options.artifacts, 'failure-first-launch.png')
    )
  );
  const unifiedLogPath = path.join(options.artifacts, 'unified-log.txt');
  collectFailureArtifactSafely(writeSmokeEvent, 'unified-log.txt', () => {
    (hooks.captureUnifiedLog ?? captureUnifiedLog)(options.processName, unifiedLogPath);
    if (fs.existsSync(unifiedLogPath)) {
      assertDoesNotContainSecret('unified-log.txt', fs.readFileSync(unifiedLogPath, 'utf8'), codexApiKey);
    }
  });
}

function collectFailureArtifactsForSmokeError(primaryError, options, codexApiKey, writeSmokeEvent) {
  const collector = options.__testHooks?.collectFailureArtifacts ?? collectFailureArtifacts;
  try {
    collector(options, codexApiKey, writeSmokeEvent);
  } catch (collectionError) {
    writeSmokeEventSafely(writeSmokeEvent, 'failure_artifacts', 'failed', {
      error: collectionError instanceof Error ? collectionError.message : String(collectionError),
    });
  }
  return primaryError;
}

async function main() {
  assertMacOS();
  const options = parseArgs(process.argv.slice(2));
  if (options.assistantRouteSmoke) {
    const compiled = loadCompiledAssistantRouteExpectations(
      process.env.OPL_FIRST_RUN_COMPILED_EXPECTATIONS,
      options.runtimeProfile,
      false
    );
    OPL_ASSISTANT_ROUTE_SMOKE_TARGETS = compiled.targets;
    COMPILED_EXPECTATION_CONSUMPTION = compiled.consumption;
  }
  const codexApiKey = readCodexApiKey(options);
  const writeSmokeEvent = createSmokeEventWriter(options.artifacts, codexApiKey);
  let codexInstallPreseed = codexInstallPreseedDiagnostics(options);
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    writeSmokeEventSafely(writeSmokeEvent, 'preflight', 'started', {
      runtime_profile: options.runtimeProfile,
      compiled_expectations: COMPILED_EXPECTATION_CONSUMPTION,
      settings_smoke: options.settingsSmoke,
      assistant_route_smoke: options.assistantRouteSmoke,
      cdp_port: options.cdpPort,
      assert_clean: options.assertClean,
      codex_ai_self_check: options.codexAiSelfCheck,
      codex_install_preseed: codexInstallPreseed,
      bootstrap_launch_diagnostics: options.bootstrapLaunchDiagnostics,
      timeouts: {
        smoke_ms: options.timeoutMs,
        codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
        codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
        host_deadline_epoch_ms: options.hostDeadlineEpochMs,
        host_deadline_safety_margin_ms: options.hostDeadlineEpochMs ? HOST_DEADLINE_SAFETY_MARGIN_MS : null,
      },
    });
    if (options.assertClean) {
      await runSmokePhase(writeSmokeEvent, 'assert_clean_state', () => assertCleanFirstRunState(options.processName));
    }
    writeSmokeEventSafely(writeSmokeEvent, 'preflight', 'passed');

    if (codexInstallPreseed.requested) {
      codexInstallPreseed = await runSmokePhase(
        writeSmokeEvent,
        'codex_install_preseed',
        () => installCodexPreseedLaunchEnvironment(options),
        {
          timeout_ms: options.codexInstallPhaseTimeoutMs,
          preseed: codexInstallPreseed,
        }
      );
    }

    const appPath = await runSmokePhase(
      writeSmokeEvent,
      options.dmg ? 'install_dmg' : 'resolve_app',
      () =>
        options.dmg
          ? installDmgApp(options.dmg, options.installDir, { timeout: options.codexInstallPhaseTimeoutMs })
          : options.app,
      {
        dmg: options.dmg,
        install_dir: options.installDir,
        timeout_ms: options.codexInstallPhaseTimeoutMs,
      }
    );
    if (!fs.existsSync(appPath)) throw new Error(`App bundle does not exist: ${appPath}`);
    options.appPath = appPath;
    const installedAppOptions = { ...options, appPath };
    let preLaunchPackagedRuntimeIntegrity = null;

    await runSmokePhase(writeSmokeEvent, 'verify_packaged_main_bootstrap', () =>
      assertPackagedMainBootstrap(appPath, options.artifacts)
    );

    if (codexApiKey && !options.bootstrapLaunchDiagnostics && !options.requireCodexConfigWizard) {
      const codexConfigurePath = path.join(options.artifacts, 'codex-configure.json');
      const codexConfigure = await runSmokePhase(
        writeSmokeEvent,
        'configure_codex_api_key',
        () => {
          try {
            return configureCodexApiKeyForSmoke(
              withPhaseTimeout(installedAppOptions, options.codexReadinessPhaseTimeoutMs),
              codexApiKey
            );
          } catch (error) {
            const diagnostics = captureOplJsonCommandErrorArtifacts(codexConfigurePath, error, codexApiKey);
            if (diagnostics) {
              writeSmokeEventSafely(writeSmokeEvent, 'configure_codex_api_key_diagnostics', diagnostics.status, {
                ...diagnostics,
              });
            }
            throw error;
          }
        },
        {
          source: 'codex_api_key_file',
          timeout_ms: options.codexReadinessPhaseTimeoutMs,
        }
      );
      writeJsonArtifact(codexConfigurePath, codexConfigure, codexApiKey);
    } else if (codexApiKey && options.requireCodexConfigWizard) {
      writeJsonArtifact(
        path.join(options.artifacts, 'codex-configure.json'),
        {
          status: 'deferred',
          reason: 'require_codex_config_wizard',
          launch_phase: 'gui_after_launch',
        },
        codexApiKey
      );
      writeSmokeEventSafely(writeSmokeEvent, 'configure_codex_api_key', 'deferred', {
        reason: 'require_codex_config_wizard',
        source: 'gui_wizard',
      });
    }

    if (shouldVerifyFullFirstRunEquivalence(options.runtimeProfile)) {
      const phase =
        codexApiKey && !options.bootstrapLaunchDiagnostics && !options.requireCodexConfigWizard
          ? 'post_configure_pre_launch'
          : 'pre_launch';
      preLaunchPackagedRuntimeIntegrity = await runSmokePhase(
        writeSmokeEvent,
        'packaged_runtime_integrity_pre_launch',
        () =>
          verifyPackagedRuntimeIntegrity(appPath, options.artifacts, {
            phase,
            receiptName: 'packaged-runtime-integrity-pre-launch.json',
            checkedAfterRuntimeSmoke: false,
          }),
        {
          phase,
          blocking_release_gate: true,
          checks: ['no_packaged_python_bytecode', 'deep_codesign', 'spctl'],
          timeout_ms: options.timeoutMs,
        }
      );
    }

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
    await runSmokePhase(writeSmokeEvent, 'verify_gatekeeper_launch_policy', () =>
      verifyGatekeeperLaunchPolicy(appPath, options.artifacts)
    );
    const launchStartedAtMs = Date.now() - 1_000;
    await runSmokePhase(writeSmokeEvent, 'launch_app', () => launchApp(appPath, options), {
      app_path: appPath,
      cdp_port: options.cdpPort,
      timeout_ms: options.codexInstallPhaseTimeoutMs,
    });
    if (options.bootstrapLaunchDiagnostics) {
      let bootstrapLaunchDiagnostics = null;
      try {
        bootstrapLaunchDiagnostics = await runSmokePhase(
          writeSmokeEvent,
          'bootstrap_launch_diagnostics',
          () => waitForBootstrapLaunchDiagnostics(installedAppOptions, codexApiKey),
          {
            timeout_ms: cdpProbeTimeoutMs(installedAppOptions),
            cdp_port: options.cdpPort,
          }
        );
      } catch (error) {
        const diagnosticsPath = path.join(options.artifacts, 'bootstrap-launch-diagnostics.json');
        if (fs.existsSync(diagnosticsPath)) {
          try {
            bootstrapLaunchDiagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'));
          } catch (_) {
            bootstrapLaunchDiagnostics = null;
          }
        }
        const failedSummary = {
          surface_id: 'opl_packaged_gui_first_run_smoke',
          status: 'failed',
          diagnostic_scope: 'bootstrap_launch_diagnostics',
          app_path: appPath,
          artifacts: options.artifacts,
          runtime_profile: options.runtimeProfile,
          bootstrap_launch_diagnostics: bootstrapLaunchDiagnostics ?? {
            schema: 'opl_bootstrap_launch_diagnostics.v1',
            status: 'failed',
            mode: 'cdp',
            cdp_port: options.cdpPort,
            error: error instanceof Error ? error.message : String(error),
          },
          codex_config_wizard_seen: false,
          codex_config_wizard_submitted: false,
          codex_api_key_present: Boolean(codexApiKey),
          codex_install_preseed: codexInstallPreseed,
          timeouts: {
            smoke_ms: options.timeoutMs,
            codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
            codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
            host_deadline_epoch_ms: options.hostDeadlineEpochMs,
            host_deadline_safety_margin_ms: options.hostDeadlineEpochMs ? HOST_DEADLINE_SAFETY_MARGIN_MS : null,
          },
          labels: [],
          settings_smoke: null,
          assistant_route_smoke: null,
          codex_functional_check: null,
          codex_ai_self_check: null,
          app_release_runtime_evidence: null,
        };
        writeJsonArtifact(path.join(options.artifacts, 'smoke-summary.json'), failedSummary, codexApiKey);
        writeSmokeEventSafely(writeSmokeEvent, 'summary', 'failed', {
          diagnostic_scope: 'bootstrap_launch_diagnostics',
          error: error instanceof Error ? error.message : String(error),
          bootstrap_launch_diagnostics: failedSummary.bootstrap_launch_diagnostics,
        });
        process.stdout.write(`${JSON.stringify(failedSummary, null, 2)}\n`);
        throw error;
      }
      const summary = {
        surface_id: 'opl_packaged_gui_first_run_smoke',
        status: 'passed',
        diagnostic_scope: 'bootstrap_launch_diagnostics',
        app_path: appPath,
        artifacts: options.artifacts,
        runtime_profile: options.runtimeProfile,
        bootstrap_launch_diagnostics: bootstrapLaunchDiagnostics,
        codex_config_wizard_seen: false,
        codex_config_wizard_submitted: false,
        codex_api_key_present: Boolean(codexApiKey),
        codex_install_preseed: codexInstallPreseed,
        timeouts: {
          smoke_ms: options.timeoutMs,
          codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
          codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
          host_deadline_epoch_ms: options.hostDeadlineEpochMs,
          host_deadline_safety_margin_ms: options.hostDeadlineEpochMs ? HOST_DEADLINE_SAFETY_MARGIN_MS : null,
        },
        labels: bootstrapLaunchDiagnostics.startup_preflight?.labels ?? [],
        settings_smoke: null,
        assistant_route_smoke: null,
        codex_functional_check: null,
        codex_ai_self_check: null,
        app_release_runtime_evidence: null,
      };
      writeJsonArtifact(path.join(options.artifacts, 'smoke-summary.json'), summary, codexApiKey);
      writeSmokeEventSafely(writeSmokeEvent, 'summary', 'passed', {
        diagnostic_scope: 'bootstrap_launch_diagnostics',
        labels: summary.labels,
      });
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return;
    }
    await runSmokePhase(
      writeSmokeEvent,
      'capture_early_launch_diagnostics',
      () => captureEarlyLaunchDiagnostics(installedAppOptions, codexApiKey),
      {
        timeout_ms: cdpProbeTimeoutMs(installedAppOptions),
        cdp_port: options.cdpPort,
        blocking_release_gate: false,
      }
    );
    assertNoRendererBootstrapFatal(options.artifacts);
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
              ...installedAppOptions,
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
      coreFirstLaunch = await waitForCoreFirstLaunchReady(
        withPhaseTimeout(installedAppOptions, options.codexReadinessPhaseTimeoutMs),
        codexApiKey
      );
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
            options.codexReadinessPhaseTimeoutMs,
            codexApiKey,
            options.artifacts,
            launchStartedAtMs
          ),
        {
          timeout_ms: options.codexReadinessPhaseTimeoutMs,
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
        () =>
          waitForUsableGuidEntry(
            withPhaseTimeout({ ...installedAppOptions, writeSmokeEvent }, options.codexReadinessPhaseTimeoutMs),
            codexApiKey
          ),
        {
          timeout_ms: options.codexReadinessPhaseTimeoutMs,
          cdp_probe_timeout_ms: cdpProbeTimeoutMs(withPhaseTimeout(options, options.codexReadinessPhaseTimeoutMs)),
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

    const codexFunctionalCheck = options.codexFunctionalCheck
      ? await runSmokePhase(
          writeSmokeEvent,
          'codex_functional_check',
          () => {
            const receipt = buildCodexFunctionalCheckReceipt({
              codexApiKey,
              runtimeProfile: options.runtimeProfile,
              assistantRouteSmoke,
            });
            assertCodexFunctionalCheckReceipt(receipt);
            writeJsonArtifact(
              path.join(options.artifacts, 'codex-functional-check-summary.json'),
              receipt,
              codexApiKey
            );
            return receipt;
          },
          {
            timeout_ms: options.timeoutMs,
          }
        )
      : null;

    const codexAiSelfCheck = options.codexAiSelfCheck
      ? await runSmokePhase(
          writeSmokeEvent,
          'codex_ai_self_check',
          () => {
            const receipt = runCodexAiSelfCheck({
              requested: true,
              mode: options.codexAiSelfCheckMode,
              runtimeProfile: options.runtimeProfile,
              uiLanguage: 'zh-CN',
              artifacts: options.artifacts,
              secret: codexApiKey,
              timeoutMs: options.codexAiSelfCheckTimeoutMs,
              coreFirstLaunch: coreFirstLaunch
                ? summarizeCoreFirstLaunch(coreFirstLaunch.systemInitializeRaw)
                : {
                    source: 'existing_guid_entry_probe',
                    status: guidEntry ? 'ready' : 'not_checked',
                  },
              firstRun,
              guiReady: guidEntry.cdpState ?? {
                mode: guidEntry.mode,
                labels: guidEntry.labels,
              },
              assistantRouteSmoke,
              codexFunctionalCheck,
              settingsSmoke: options.settingsSmoke
                ? {
                    status: 'passed',
                    pages: settingsSmoke.map((page) => page.id),
                  }
                : null,
            });
            writeJsonArtifact(path.join(options.artifacts, 'codex-ai-self-check-summary.json'), receipt, codexApiKey);
            return receipt;
          },
          {
            timeout_ms: options.codexAiSelfCheckTimeoutMs,
          }
        )
      : null;

    const guideScreenshots = options.guideScreenshots
      ? await runSmokePhase(
          writeSmokeEvent,
          'guide_screenshots',
          () =>
            captureGuideScreenshots(
              options,
              {
                ...guideScreenshotSources(options.artifacts),
                assistantMas: path.join(options.artifacts, 'assistant-route-smoke', 'mas.png'),
                settingsEnvironment: path.join(options.artifacts, 'settings-pages', 'environment.png'),
                runtimeStatus: path.join(options.artifacts, 'settings-pages', 'runtime-status.png'),
              },
              codexApiKey
            ),
          {
            output_dir: path.join(options.artifacts, 'guide-screenshots'),
          }
        )
      : null;

    if (fs.existsSync(firstRunLog)) {
      writeTextArtifact(
        path.join(options.artifacts, 'first-run.jsonl'),
        fs.readFileSync(firstRunLog, 'utf8'),
        codexApiKey
      );
    }

    let appReleaseRuntimeEvidence = null;
    let temporalServiceSupervisorProof = null;
    let packagedRuntimeIntegrity = null;
    if (shouldVerifyFullFirstRunEquivalence(options.runtimeProfile)) {
      const { systemInitializeRaw, modulesRaw } = await runSmokePhase(
        writeSmokeEvent,
        'full_runtime_equivalence',
        () =>
          waitForFullFirstRunEquivalence(
            options.codexReadinessPhaseTimeoutMs,
            withPhaseTimeout({ ...installedAppOptions, writeSmokeEvent }, options.codexReadinessPhaseTimeoutMs)
          ),
        {
          timeout_ms: options.codexReadinessPhaseTimeoutMs,
        }
      );
      writeTextArtifact(path.join(options.artifacts, 'system-initialize.json'), systemInitializeRaw, codexApiKey);
      writeTextArtifact(path.join(options.artifacts, 'modules.json'), modulesRaw, codexApiKey);
      temporalServiceSupervisorProof = await runSmokePhase(
        writeSmokeEvent,
        'temporal_service_supervisor_proof',
        () => collectTemporalServiceSupervisorProof(installedAppOptions, codexApiKey),
        {
          start_action_id: TEMPORAL_SERVICE_START_ACTION_ID,
          restart_action_id: TEMPORAL_SERVICE_RESTART_ACTION_ID,
          timeout_ms: options.timeoutMs,
        }
      );
      appReleaseRuntimeEvidence = await runSmokePhase(
        writeSmokeEvent,
        'app_release_runtime_evidence',
        () => collectAppReleaseRuntimeEvidence(installedAppOptions, codexApiKey),
        {
          action_id: RELEASE_EVIDENCE_ACTION_ID,
          timeout_ms: options.timeoutMs,
        }
      );
      packagedRuntimeIntegrity = await runSmokePhase(
        writeSmokeEvent,
        'packaged_runtime_integrity',
        () =>
          verifyPackagedRuntimeIntegrity(appPath, options.artifacts, {
            phase: 'post_runtime_and_restart',
            checkedAfterRuntimeSmoke: true,
          }),
        {
          phase: 'post_runtime_and_restart',
          blocking_release_gate: true,
          checks: ['no_packaged_python_bytecode', 'deep_codesign', 'spctl'],
          timeout_ms: options.timeoutMs,
        }
      );
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
      compiled_expectations: COMPILED_EXPECTATION_CONSUMPTION,
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
      codex_install_preseed: codexInstallPreseed,
      timeouts: {
        smoke_ms: options.timeoutMs,
        codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
        codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
        host_deadline_epoch_ms: options.hostDeadlineEpochMs,
        host_deadline_safety_margin_ms: options.hostDeadlineEpochMs ? HOST_DEADLINE_SAFETY_MARGIN_MS : null,
      },
      existing_launch_fallback: firstRun.existingLaunchFallback === true,
      guid_entry_probe: guidEntry.mode,
      labels: guidEntry.labels,
      settings_smoke: options.settingsSmoke
        ? {
            status: 'passed',
            pages: settingsSmoke.map((page) => page.id),
            runtime_action_evidence_status: settingsSmoke.runtimeActionEvidence
              ? 'passed'
              : settingsSmoke.runtimeActionEvidenceBlocker
                ? 'blocked'
                : 'not_requested',
            runtime_action_evidence_blocker: settingsSmoke.runtimeActionEvidenceBlocker,
          }
        : null,
      assistant_route_smoke: options.assistantRouteSmoke
        ? {
            status: 'passed',
            assistants: assistantRouteSmoke.map((assistant) => assistant.id),
          }
        : null,
      codex_functional_check: codexFunctionalCheck,
      codex_ai_self_check: codexAiSelfCheck,
      app_release_runtime_evidence: appReleaseRuntimeEvidence,
      temporal_service_supervisor_proof: temporalServiceSupervisorProof,
      packaged_runtime_integrity_pre_launch: preLaunchPackagedRuntimeIntegrity,
      packaged_runtime_integrity: packagedRuntimeIntegrity,
      guide_screenshots: guideScreenshots,
    };
    writeJsonArtifact(path.join(options.artifacts, 'smoke-summary.json'), summary, codexApiKey);
    writeSmokeEventSafely(writeSmokeEvent, 'summary', 'passed', {
      runtime_profile: options.runtimeProfile,
      guid_entry_probe: guidEntry.mode,
      settings_smoke: summary.settings_smoke?.status ?? null,
      assistant_route_smoke: summary.assistant_route_smoke?.status ?? null,
      codex_functional_check: summary.codex_functional_check?.status ?? null,
      codex_ai_self_check: summary.codex_ai_self_check?.status ?? null,
      app_release_runtime_evidence: summary.app_release_runtime_evidence?.status ?? null,
      temporal_service_supervisor_proof: summary.temporal_service_supervisor_proof?.status ?? null,
      packaged_runtime_integrity_pre_launch: summary.packaged_runtime_integrity_pre_launch?.status ?? null,
      packaged_runtime_integrity: summary.packaged_runtime_integrity?.status ?? null,
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    writeSmokeEventSafely(writeSmokeEvent, 'summary', 'failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw collectFailureArtifactsForSmokeError(error, options, codexApiKey, writeSmokeEvent);
  }
}

export const __test =
  process.env.NODE_ENV === 'test'
    ? {
        buildFullRuntimeCommandPrefix,
        buildPackagedPythonRuntimeEnv,
        resolvePackagedPythonCacheRoot,
        assertFullFirstRunEquivalence,
        assertFullCompanionSkillPayloads,
        captureMacScreenArtifact,
        findLatestFullRuntimeHome,
        isFirstRunCompletionEvent,
        isMainModule,
        RELEASE_EVIDENCE_ACTION_ID,
        RELEASE_EVIDENCE_SCREENSHOTS,
        RUNTIME_ACTION_EVIDENCE_TIMEOUT_MS,
        runtimeShellExecutable,
        OPL_CONNECT_MODULES_ARGS,
        OplJsonCommandError,
        oplJsonCommandDiagnostics,
        isNonRetryableFullRuntimeEquivalenceError,
        writeOplJsonCommandErrorArtifacts,
        captureOplJsonCommandErrorArtifacts,
        resolveOplProbeTimeoutMs,
        resolveOplJsonMaxBufferBytes,
        summarizeCommandOutput,
        OPL_JSON_MAX_BUFFER_BYTES,
        OPL_JSON_DIAGNOSTIC_INLINE_BYTES,
        eventTimestampMs,
        shouldProbeExistingGuidEntryBeforeFirstRun,
        cdpProbeTimeoutMs,
        createSmokeEventWriter,
        existingStateGuidProbeTimeoutMs,
        remainingGuidFallbackTimeoutMs,
        shouldWaitForFirstRunCompletion,
        waitForFullFirstRunEquivalence,
        shouldWaitForCoreFirstLaunchReady,
        configureCodexApiKeyForSmoke,
        shouldCaptureFullReleaseScreenshot,
        shouldCaptureFirstRunBeginnerScreenshot,
        shouldCheckFirstRunBeginnerUx,
        waitForCoreFirstLaunchReady,
        summarizeCoreFirstLaunch,
        parseSystemInitialize,
        parseArgs,
        buildCodexInstallPreseedEnv,
        codexInstallPreseedDiagnostics,
        boundTimeoutToHostDeadline,
        HOST_DEADLINE_SAFETY_MARGIN_MS,
        phaseDeadlineMs,
        remainingPhaseTimeoutMs,
        guidEntryReadinessExpression,
        guidEntryNavigationExpression,
        detectUsableEntryAccessibility,
        startupPreflightExpression,
        firstRunBeginnerUxExpression,
        firstRunAccessibilityExpectedLabels,
        runOplJson,
        describePackagedFullRuntime,
        resolveFullRuntimeForSmoke,
        resolveManagedOplBin,
        resolveManagedNodeBin,
        buildStandardBootstrapPathPrefix,
        resolvePackagedStandardInstaller,
        buildStandardBootstrapCommand,
        runPackagedStandardBootstrapForSmoke,
        buildOplJsonShellCommand,
        resolveOplCommandPath,
        buildLaunchAppArgs,
        detectPackagedMainBootstrap,
        assertPackagedMainBootstrap,
        buildLaunchExecutableArgs,
        buildPackagedAppLaunchBaseEnv,
        buildPackagedTemporalAddressEnv,
        buildLaunchAppEnv,
        launchEnvDiagnostics,
        parseProcessRows,
        nativeWindowDiagnosticsScript,
        summarizeNativeWindowDiagnostics,
        rendererBootstrapDiagnosticsExpression,
        createRendererBootstrapDiagnosticsCollector,
        collectRendererBootstrapDiagnostics,
        readRendererBootstrapFatal,
        assertNoRendererBootstrapFatal,
        collectLaunchLogText,
        collectMainBootstrapFatalArtifacts,
        collectAppLogArtifacts,
        collectFailureArtifactSafely,
        collectFailureArtifacts,
        collectFailureArtifactsForSmokeError,
        defaultMainBootstrapFatalLogCandidates,
        detectNativeModalLaunchBlocker,
        captureFullReleaseScreenshotEvidence,
        unifiedLogPredicate,
        parseCfBundleExecutableFromPlistText,
        resolveAppExecutablePath,
        collectLaunchDiagnostics,
        verifyGatekeeperLaunchPolicy,
        inspectPackagedPythonBytecode,
        verifyPackagedRuntimeIntegrity,
        shouldTerminateExistingApp,
        SETTINGS_PAGE_SMOKE_TARGETS,
        loadAssistantRouteSmokeTargets,
        loadCompiledAssistantRouteExpectations,
        OPL_ASSISTANT_ROUTE_SMOKE_TARGETS,
        FULL_ASSISTANT_READINESS_TIMEOUT_MS,
        FULL_ASSISTANT_SEND_TIMEOUT_MS,
        pageReadinessExpression,
        maintenanceDiagnosticsStatusExpression,
        runtimeActionEvidenceExpression,
        visibleRuntimeRefreshButtonExpression,
        runtimeStatusReadinessExpression,
        runSettingsSmoke,
        shouldVerifyFullFirstRunEquivalence,
        buildCodexFunctionalCheckReceipt,
        assertCodexFunctionalCheckReceipt,
        buildCodexAiSelfCheckPrompt,
        buildSkippedCodexAiSelfCheckReceipt,
        buildCodexAiSelfCheckReceipt,
        runCodexAiSelfCheck,
        collectAppReleaseRuntimeEvidence,
        collectTemporalServiceSupervisorProof,
        reloadTemporalSupervisorSession,
        assertAppActionExecution,
        assertTemporalSupervisorReady,
        assertTemporalSupervisorPlist,
        TEMPORAL_SERVICE_START_ACTION_ID,
        TEMPORAL_SERVICE_RESTART_ACTION_ID,
        TEMPORAL_SERVICE_SUPERVISOR_LABEL,
        parseCodexJsonOutput,
        probeCodexCli,
        unwrapBackendResponseEnvelope,
        buildAssistantRouteSmokeFailureSummary,
        dismissGuideScreenCapturePermissionPrompt,
        warmGuideScreenCapturePermission,
        isGuideScreenshotEntryReady,
        guideScreenshotSources,
        visibleHomeAssistantControlSelector,
        homeAssistantStandardLaunchGateExpression,
        homeAssistantWorkspaceContextExpression,
        homeAssistantRouteSelectionExpression,
        homeAssistantRouteReadyExpression,
        homeAssistantCoreReadinessExpression,
        homeAssistantRouteSendWithoutActivationExpression,
        homeAssistantRouteSendDiagnosticsExpression,
        homeAssistantRouteSendStateExpression,
        dispatchCdpPointerClick,
        conversationRouteReceiptExpression,
        activeConversationRouteReceiptExpression,
        latestConversationRouteReceiptExpression,
        agentPackageLifecycleSnapshot,
        readAgentPackageLifecycleState,
        assertHomeAssistantRouteSendWithoutActivation,
        resolveFrameworkStageRuntimeTarget,
        resolveMasQualificationProvisioningReceipt,
        fullAssistantWorkspacePath,
        frameworkStageRuntimeActivationExpression,
        runFrameworkStageRuntimeActivation,
        FRAMEWORK_STAGE_ACTIVATION_SMOKE_BLOCKED_REASON,
      }
    : undefined;

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

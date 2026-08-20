#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const requireFromShell = createRequire(import.meta.url);

const DEFAULT_GUEST_USER = process.env.OPL_FIRST_RUN_GUEST_USER || 'runner';
const DEFAULT_GUEST_NODE_VERSION = process.env.OPL_FIRST_RUN_GUEST_NODE_VERSION || '22.21.1';
const SCRIPT_DIR = path.dirname(fs.realpathSync(new URL(import.meta.url)));
const GUEST_SMOKE_SCRIPT_PATH = path.join(SCRIPT_DIR, 'opl-first-run-vm-smoke.mjs');
const PRODUCT_PROFILE_PATH = path.resolve(
  SCRIPT_DIR,
  '..',
  'packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json'
);
const SIGNAL_EXIT_CODES = new Map([
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143],
]);
const GUEST_SMOKE_HOST_TIMEOUT_GRACE_MS = 120_000;
const OPL_GATEWAY_BASE_URL = 'https://gateway.medopl.com/v1';
const OPL_GATEWAY_LEGACY_BASE_URLS = ['https://gflabtoken.cn/v1'];
const HOST_CODEX_PROVIDER_SOURCE = 'developer_host_codex_selected_provider';
const EXPLICIT_API_KEY_FILE_SOURCE = 'explicit_api_key_file';
const GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE = 'gateway_account_password_file';
const REQUIRED_ASSISTANT_ROUTE_IDS = ['mas', 'mag', 'rca'];
const HOMEBREW_CASK_CANDIDATE_PROFILES = new Map([
  [
    'homebrew-standard-cask',
    {
      caskToken: 'one-person-lab',
      fileName: 'one-person-lab.rb',
      runtimeProfile: 'standard',
      formulaPolicy: 'required',
    },
  ],
  [
    'homebrew-nightly-cask',
    {
      caskToken: 'one-person-lab-nightly',
      fileName: 'one-person-lab-nightly.rb',
      runtimeProfile: 'standard',
      formulaPolicy: 'required',
    },
  ],
  [
    'homebrew-full-cask',
    {
      caskToken: 'one-person-lab-full',
      fileName: 'one-person-lab-full.rb',
      runtimeProfile: 'full',
      formulaPolicy: 'forbidden',
    },
  ],
]);
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
  [
    'homebrew-nightly-cask',
    {
      runtimeProfile: 'standard',
      settingsSmoke: true,
      display: '1920x1080px',
      installMode: 'homebrew-cask',
      homebrewCask: 'one-person-lab-nightly',
    },
  ],
  [
    'homebrew-full-cask',
    {
      runtimeProfile: 'full',
      settingsSmoke: true,
      display: '1920x1080px',
      installMode: 'homebrew-cask',
      homebrewCask: 'one-person-lab-full',
    },
  ],
]);
const HOMEBREW_CONFLICTING_CASKS = new Map([
  ['one-person-lab', ['one-person-lab-full', 'one-person-lab-nightly']],
  ['one-person-lab-full', ['one-person-lab', 'one-person-lab-nightly']],
  ['one-person-lab-nightly', ['one-person-lab', 'one-person-lab-full']],
]);
const STAGE_TIMING_SLOWEST_LIMIT = 5;
const HOMEBREW_INSTALL_RETRYABLE_PATTERNS = [
  /curl:\s*\(18\)/i,
  /Transferred a partial file/i,
  /curl:\s*\(56\)/i,
  /Connection reset by peer/i,
  /Operation timed out/i,
  /Failed to connect/i,
];
const DEFAULT_HOMEBREW_INSTALL_MAX_ATTEMPTS = 3;
const DEFAULT_HOMEBREW_INSTALL_RETRY_DELAY_MS = 15_000;
const SIGNAL_GUEST_ARTIFACT_COPY_TIMEOUT_MS = 30_000;
const TART_CLEANUP_COMMAND_TIMEOUT_MS = 30_000;
const LOWERCASE_GIT_SHA = /^[0-9a-f]{40}$/;
const PUBLISHED_ARTIFACT_IDENTITY_FILE = 'published-artifact-identity.json';
const MANAGED_COMPUTER_USE_EXPECTED_IDENTITY = Object.freeze({
  productName: 'KimiCU',
  version: '0.5.4',
  sourceRef: 'one-person-lab-app/contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu',
  path: '/Applications/KimiCU.app',
  executable: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
  bundleId: 'ai.kimi.cu',
  teamId: '2J9472RW75',
  architecture: 'arm64',
});

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
  cleanupPromise: null,
  cleanupResult: null,
  vmCleanupReceipt: null,
  homebrewInstallAttempts: [],
};

const initialRuntimeState = { ...runtimeState };

function resetRuntimeStateForTest() {
  Object.assign(runtimeState, {
    ...initialRuntimeState,
    stageEvents: [],
    homebrewInstallAttempts: [],
  });
}

function setRuntimeStateForTest(state) {
  Object.assign(runtimeState, state);
}

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
  --codex-install-phase-timeout-ms <n>
                           Guest App install/first-launch Codex setup phase timeout.
                           Defaults to --smoke-timeout-ms.
  --codex-readiness-phase-timeout-ms <n>
                           Guest Codex readiness/initialize phase timeout.
                           Defaults to --smoke-timeout-ms.
  --codex-package-tarball <path>
                           Optional host Codex npm package tarball copied into
                           the guest and exposed to the guest smoke.
  --codex-platform-package-tarball <path>
                           Optional host Codex macOS platform package tarball
                           copied into the guest and exposed to the guest smoke.
  --codex-npm-cache-dir <path>
                           Optional host npm cache directory copied into the
                           guest and exposed through NPM_CONFIG_CACHE.
  --compiled-expectations <path>
                           App-owned compiled first-run expectation manifest copied
                           into the guest and consumed by the route smoke.
  --mas-study-provisioning-workspace <path>
                           Host-materialized MAS qualification workspace. It must use
                           the exact guest path <guest-workdir>/mas-provisioned-workspace.
  --mas-study-provisioning-receipt <path>
                           Domain-owned receipt inside the provisioning workspace.
  --bootstrap-launch-diagnostics
                           Only run packaged bootstrap and initial renderer/CDP
                           launch diagnostics inside the guest.
  --display <resolution>   Tart display resolution, for example 1920x1080px. Default: 1920x1080px.
  --smoke-profile <name>   Host-side smoke profile: ${Array.from(SMOKE_PROFILES.keys()).join(', ')}.
                           Default: full-gate.
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
  --expected-framework-sha <sha>
                           Exact published-cohort Framework commit. When omitted, the harness
                           derives it from published-artifact-identity.json in --artifacts.
  --install-mode <mode>     Install mode: dmg or homebrew-cask. Default: dmg.
  --require-gatekeeper      Preserve quarantine and require Gatekeeper in the guest smoke.
  --homebrew-tap <tap>      Homebrew tap for --install-mode homebrew-cask. Default: gaofeng21cn/one-person-lab.
  --homebrew-cask <name>    Homebrew cask to install. Default: one-person-lab.
  --homebrew-cask-file <path>
                           Pre-publication Standard, Nightly, or Full Cask candidate copied into a local guest tap.
  --require-codex-config-wizard
                           Fail unless the guest smoke sees and submits the Codex config wizard.
                           Defaults to false; Full gates still require Codex readiness through
                           opl system initialize and Full runtime equivalence.
  --no-require-codex-config-wizard
                           Do not require the Codex config wizard even when runtime-profile is full.
  --guide-screenshots      Accept the release workflow guide screenshot toggle as a host-side flag.
  --codex-api-key-file <path>
                           Optional host file containing a test Codex API key for
                           the explicit Provider compatibility lane. This overrides
                           automatic host Codex config discovery.
  --gateway-account-email-file <path>
  --gateway-account-password-file <path>
                           Protected clean-VM Gateway test account files. Both are required
                           together and values are never passed as CLI arguments.
  --host-codex-config <path>
                           Host Codex config.toml used for a requested AI self-check.
                           Defaults to $CODEX_HOME/config.toml or ~/.codex/config.toml.
                           The selected Provider Base URL and bearer token are staged
                           privately; neither value is written to plans or receipts.
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

function readPublishedArtifactExpectedFrameworkSha(artifactsDir) {
  const identityPath = path.join(artifactsDir, PUBLISHED_ARTIFACT_IDENTITY_FILE);
  const stat = fs.lstatSync(identityPath, { throwIfNoEntry: false });
  if (!stat) return null;
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0) {
    throw new Error(`${PUBLISHED_ARTIFACT_IDENTITY_FILE} must be a nonempty regular non-symlink file.`);
  }
  let identity;
  try {
    identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${PUBLISHED_ARTIFACT_IDENTITY_FILE} is not valid JSON: ${message}`);
  }
  const frameworkSha = identity?.cohort?.framework_sha;
  if (
    identity?.schema !== 'opl_app_post_publication_artifact_identity.v1' ||
    identity?.verified !== true ||
    !LOWERCASE_GIT_SHA.test(frameworkSha ?? '')
  ) {
    throw new Error(`${PUBLISHED_ARTIFACT_IDENTITY_FILE} does not bind a verified exact Framework SHA.`);
  }
  return frameworkSha;
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
    codexInstallPhaseTimeoutMs: null,
    codexReadinessPhaseTimeoutMs: null,
    codexPackageTarball: '',
    codexPlatformPackageTarball: '',
    codexNpmCacheDir: '',
    compiledExpectations: process.env.OPL_FIRST_RUN_COMPILED_EXPECTATIONS || '',
    masStudyProvisioningWorkspace: '',
    masStudyProvisioningReceipt: '',
    bootstrapLaunchDiagnostics: false,
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
    expectedFrameworkSha: '',
    requireGatekeeper: false,
    installMode: 'dmg',
    homebrewTap: 'gaofeng21cn/one-person-lab',
    homebrewCask: 'one-person-lab',
    homebrewCaskFile: '',
    requireCodexConfigWizard: null,
    codexApiKeyFile: process.env.OPL_FIRST_RUN_CODEX_API_KEY_FILE || '',
    gatewayAccountEmailFile: process.env.OPL_FIRST_RUN_GATEWAY_ACCOUNT_EMAIL_FILE || '',
    gatewayAccountPasswordFile: process.env.OPL_FIRST_RUN_GATEWAY_ACCOUNT_PASSWORD_FILE || '',
    hostCodexConfig:
      process.env.OPL_FIRST_RUN_HOST_CODEX_CONFIG ||
      path.join(process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex'), 'config.toml'),
    providerCredentialPresent: false,
    providerCredentialSource: null,
    providerCredentialResolution: null,
    codexProviderBaseUrl: null,
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
    if (arg === '--require-gatekeeper') {
      options.requireGatekeeper = true;
      explicit.add('requireGatekeeper');
      continue;
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
    if (arg === '--bootstrap-launch-diagnostics') {
      options.bootstrapLaunchDiagnostics = true;
      explicit.add('bootstrapLaunchDiagnostics');
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
    } else if (arg === '--codex-install-phase-timeout-ms') {
      options.codexInstallPhaseTimeoutMs = Number(value);
      explicit.add('codexInstallPhaseTimeoutMs');
    } else if (arg === '--codex-readiness-phase-timeout-ms') {
      options.codexReadinessPhaseTimeoutMs = Number(value);
      explicit.add('codexReadinessPhaseTimeoutMs');
    } else if (arg === '--codex-package-tarball') {
      options.codexPackageTarball = path.resolve(value);
      explicit.add('codexPackageTarball');
    } else if (arg === '--codex-platform-package-tarball') {
      options.codexPlatformPackageTarball = path.resolve(value);
      explicit.add('codexPlatformPackageTarball');
    } else if (arg === '--codex-npm-cache-dir') {
      options.codexNpmCacheDir = path.resolve(value);
      explicit.add('codexNpmCacheDir');
    } else if (arg === '--compiled-expectations') {
      options.compiledExpectations = path.resolve(value);
      explicit.add('compiledExpectations');
    } else if (arg === '--mas-study-provisioning-workspace') {
      options.masStudyProvisioningWorkspace = path.resolve(value);
      explicit.add('masStudyProvisioningWorkspace');
    } else if (arg === '--mas-study-provisioning-receipt') {
      options.masStudyProvisioningReceipt = path.resolve(value);
      explicit.add('masStudyProvisioningReceipt');
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
    } else if (arg === '--expected-framework-sha') {
      options.expectedFrameworkSha = value;
      explicit.add('expectedFrameworkSha');
    } else if (arg === '--install-mode') {
      options.installMode = value;
      explicit.add('installMode');
    } else if (arg === '--homebrew-tap') {
      options.homebrewTap = value;
      explicit.add('homebrewTap');
    } else if (arg === '--homebrew-cask') {
      options.homebrewCask = value;
      explicit.add('homebrewCask');
    } else if (arg === '--homebrew-cask-file') {
      options.homebrewCaskFile = path.resolve(value);
      explicit.add('homebrewCaskFile');
    } else if (arg === '--codex-ai-self-check-mode') {
      options.codexAiSelfCheckMode = value;
      explicit.add('codexAiSelfCheckMode');
    } else if (arg === '--codex-ai-self-check-timeout-ms') {
      options.codexAiSelfCheckTimeoutMs = Number(value);
      explicit.add('codexAiSelfCheckTimeoutMs');
    } else if (arg === '--codex-api-key-file') {
      options.codexApiKeyFile = path.resolve(value);
      explicit.add('codexApiKeyFile');
    } else if (arg === '--gateway-account-email-file') {
      options.gatewayAccountEmailFile = path.resolve(value);
      explicit.add('gatewayAccountEmailFile');
    } else if (arg === '--gateway-account-password-file') {
      options.gatewayAccountPasswordFile = path.resolve(value);
      explicit.add('gatewayAccountPasswordFile');
    } else if (arg === '--host-codex-config') {
      options.hostCodexConfig = path.resolve(value);
      explicit.add('hostCodexConfig');
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
  if (options.bootstrapLaunchDiagnostics) {
    for (const key of ['settingsSmoke', 'assistantRouteSmoke', 'codexFunctionalCheck', 'codexAiSelfCheck']) {
      if (!explicit.has(key)) options[key] = false;
    }
  }
  if (!options.sourceVm) throw new Error('--source-vm or OPL_FIRST_RUN_TART_SOURCE is required.');
  if (!['dmg', 'homebrew-cask'].includes(options.installMode)) {
    throw new Error('--install-mode must be one of: dmg, homebrew-cask.');
  }
  if (options.installMode === 'dmg' && !options.dmg) throw new Error('--dmg is required for --install-mode dmg.');
  if (options.installMode === 'homebrew-cask' && !options.homebrewCask) {
    throw new Error('--homebrew-cask is required for --install-mode homebrew-cask.');
  }
  if (options.homebrewCaskFile) validateHomebrewCaskCandidateProfile(options);
  if (!options.dryRun && options.homebrewCaskFile && !fs.existsSync(options.homebrewCaskFile)) {
    throw new Error(`Homebrew Cask candidate does not exist: ${options.homebrewCaskFile}`);
  }
  if (!options.dryRun && options.dmg && !fs.existsSync(options.dmg))
    throw new Error(`DMG does not exist: ${options.dmg}`);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be positive.');
  if (!Number.isFinite(options.smokeTimeoutMs) || options.smokeTimeoutMs <= 0) {
    throw new Error('--smoke-timeout-ms must be positive.');
  }
  if (options.codexInstallPhaseTimeoutMs === null) options.codexInstallPhaseTimeoutMs = options.smokeTimeoutMs;
  if (options.codexReadinessPhaseTimeoutMs === null) options.codexReadinessPhaseTimeoutMs = options.smokeTimeoutMs;
  if (!Number.isFinite(options.codexInstallPhaseTimeoutMs) || options.codexInstallPhaseTimeoutMs <= 0) {
    throw new Error('--codex-install-phase-timeout-ms must be positive.');
  }
  if (!Number.isFinite(options.codexReadinessPhaseTimeoutMs) || options.codexReadinessPhaseTimeoutMs <= 0) {
    throw new Error('--codex-readiness-phase-timeout-ms must be positive.');
  }
  validateCodexInstallPreseedOptions(options);
  if (options.compiledExpectations && !options.dryRun && !fs.existsSync(options.compiledExpectations)) {
    throw new Error(`Compiled first-run expectations do not exist: ${options.compiledExpectations}`);
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
  const publishedFrameworkSha = readPublishedArtifactExpectedFrameworkSha(options.artifacts);
  if (options.expectedFrameworkSha && publishedFrameworkSha && options.expectedFrameworkSha !== publishedFrameworkSha) {
    throw new Error('--expected-framework-sha does not match published-artifact-identity.json.');
  }
  options.expectedFrameworkSha = options.expectedFrameworkSha || publishedFrameworkSha || '';
  if (options.expectedFrameworkSha && !LOWERCASE_GIT_SHA.test(options.expectedFrameworkSha)) {
    throw new Error('--expected-framework-sha must be a lowercase 40-character Git commit SHA.');
  }
  if (!['diagnose', 'fix'].includes(options.codexAiSelfCheckMode)) {
    throw new Error('--codex-ai-self-check-mode must be one of: diagnose, fix.');
  }
  if (!Number.isFinite(options.codexAiSelfCheckTimeoutMs) || options.codexAiSelfCheckTimeoutMs <= 0) {
    throw new Error('--codex-ai-self-check-timeout-ms must be positive.');
  }
  if (options.requireCodexConfigWizard === null) options.requireCodexConfigWizard = false;
  if (options.requireCodexConfigWizard && !options.codexApiKeyFile) {
    throw new Error('--require-codex-config-wizard requires --codex-api-key-file or OPL_FIRST_RUN_CODEX_API_KEY_FILE.');
  }
  if (Boolean(options.gatewayAccountEmailFile) !== Boolean(options.gatewayAccountPasswordFile)) {
    throw new Error('--gateway-account-email-file and --gateway-account-password-file must be provided together.');
  }
  if (options.gatewayAccountEmailFile && options.codexApiKeyFile) {
    throw new Error('Gateway account qualification and explicit API key qualification are separate lanes.');
  }
  if (
    options.gatewayAccountEmailFile &&
    path.basename(options.gatewayAccountEmailFile) === path.basename(options.gatewayAccountPasswordFile)
  ) {
    throw new Error('Gateway account email and password files must have distinct basenames for guest staging.');
  }
  for (const [label, file] of [
    ['--gateway-account-email-file', options.gatewayAccountEmailFile],
    ['--gateway-account-password-file', options.gatewayAccountPasswordFile],
  ]) {
    if (file && !options.dryRun && !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`${label} must reference a readable file.`);
    }
  }
  resolveMasProvisioningTransport(options, !options.dryRun);
  if (
    options.bootstrapLaunchDiagnostics &&
    (options.settingsSmoke || options.assistantRouteSmoke || options.codexFunctionalCheck || options.codexAiSelfCheck)
  ) {
    throw new Error('--bootstrap-launch-diagnostics cannot be combined with secondary release smokes.');
  }
  if (options.bootstrapLaunchDiagnostics && options.requireCodexConfigWizard) {
    throw new Error('--bootstrap-launch-diagnostics cannot require the Codex configuration wizard.');
  }

  return options;
}

function resolveMasProvisioningTransport(options, requireFiles = true) {
  const required = options.runtimeProfile === 'full' && options.assistantRouteSmoke;
  const workspace = options.masStudyProvisioningWorkspace;
  const receipt = options.masStudyProvisioningReceipt;
  if (Boolean(workspace) !== Boolean(receipt)) {
    throw new Error(
      '--mas-study-provisioning-workspace and --mas-study-provisioning-receipt must be provided together.'
    );
  }
  if (required && !workspace) {
    throw new Error(
      'Full assistant route smoke requires a Framework-materialized MAS provisioning workspace and receipt.'
    );
  }
  if (!workspace) return null;

  const expectedWorkspace = path.resolve(options.guestWorkdir, 'mas-provisioned-workspace');
  if (workspace !== expectedWorkspace) {
    throw new Error(`--mas-study-provisioning-workspace must equal the guest path ${expectedWorkspace}.`);
  }
  const receiptRelative = path.relative(workspace, receipt);
  if (
    !receiptRelative ||
    receiptRelative === '..' ||
    receiptRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(receiptRelative)
  ) {
    throw new Error('--mas-study-provisioning-receipt must be contained in the provisioning workspace.');
  }
  if (requireFiles) {
    const workspaceStat = fs.lstatSync(workspace, { throwIfNoEntry: false });
    if (!workspaceStat?.isDirectory() || workspaceStat.isSymbolicLink()) {
      throw new Error(`MAS provisioning workspace must be a physical directory: ${workspace}`);
    }
    const receiptStat = fs.lstatSync(receipt, { throwIfNoEntry: false });
    if (!receiptStat?.isFile() || receiptStat.isSymbolicLink()) {
      throw new Error(`MAS provisioning receipt must be a physical file: ${receipt}`);
    }
  }
  return {
    workspace,
    receipt,
    receipt_relative_path: receiptRelative.split(path.sep).join('/'),
  };
}

function buildDryRunPlan(options) {
  const providerResolution = options.providerCredentialResolution ?? resolveHostCodexProviderCredential(options);
  const providerCredentialPresent = providerResolution.status === 'available';
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
    install_origin: isHomebrewFullCaskSmoke(options) ? 'homebrew_full_cask' : options.installMode,
    official_profile_desired_roots: officialProfileDesiredRoots(),
    expected_framework_sha: options.expectedFrameworkSha || null,
    artifacts: options.artifacts,
    guest_workdir: options.guestWorkdir,
    mas_study_provisioning: resolveMasProvisioningTransport(options, false),
    timeouts: {
      vm_boot_and_ssh_ms: options.timeoutMs,
      guest_smoke_ms: options.smokeTimeoutMs,
      guest_smoke_host_ms: guestSmokeHostTimeoutMs(options),
      guest_smoke_host_grace_ms: GUEST_SMOKE_HOST_TIMEOUT_GRACE_MS,
      codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
      codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
    },
    codex_install_preseed: codexInstallPreseedPlan(options),
    bootstrap_launch_diagnostics: options.bootstrapLaunchDiagnostics,
    display: options.display,
    settings_smoke: options.settingsSmoke,
    assistant_route_smoke: options.assistantRouteSmoke,
    codex_functional_check: options.codexFunctionalCheck,
    codex_ai_self_check: {
      requested: options.codexAiSelfCheck,
      mode: options.codexAiSelfCheckMode,
      blocking_release_gate: providerResolution.source === GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE,
    },
    cdp_port:
      options.bootstrapLaunchDiagnostics ||
      options.settingsSmoke ||
      options.assistantRouteSmoke ||
      Boolean(options.gatewayAccountEmailFile && options.gatewayAccountPasswordFile)
        ? options.cdpPort
        : null,
    runtime_profile: options.runtimeProfile,
    require_codex_config_wizard: options.requireCodexConfigWizard,
    provider_configuration: {
      status: providerCredentialPresent ? 'requested' : 'not_requested',
      requested: providerCredentialPresent,
      credential_present: providerCredentialPresent,
      credential_source: providerResolution.source,
      credential_resolution_status: providerResolution.status,
      credential_resolution_reason: providerResolution.reason,
      base_url_matches_opl_gateway: providerResolution.base_url_matches_opl_gateway,
      manual_user_input_required: false,
      mutation_performed: false,
      blocking_release_gate: providerResolution.source === GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE,
    },
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
  if (options.homebrewCaskFile) {
    const profile = validateHomebrewCaskCandidateProfile(options);
    return [`opl-local/cask-candidate/${profile.caskToken}`];
  }
  const caskToken = homebrewCaskToken(options.homebrewCask);
  const relatedCasks = HOMEBREW_CONFLICTING_CASKS.get(caskToken) || [];
  return Array.from(
    new Set([
      homebrewQualifiedCaskRef(options.homebrewTap, options.homebrewCask),
      ...relatedCasks.map((relatedCask) => homebrewQualifiedCaskRef(options.homebrewTap, relatedCask)),
    ])
  );
}

function matchingHomebrewCaskCandidateProfile(options) {
  const profile = HOMEBREW_CASK_CANDIDATE_PROFILES.get(options.smokeProfile);
  if (
    !profile ||
    options.installMode !== 'homebrew-cask' ||
    homebrewCaskToken(options.homebrewCask) !== profile.caskToken ||
    options.runtimeProfile !== profile.runtimeProfile
  ) {
    return null;
  }
  return profile;
}

function validateHomebrewCaskCandidateProfile(options) {
  const profile = HOMEBREW_CASK_CANDIDATE_PROFILES.get(options.smokeProfile);
  if (!profile) {
    throw new Error(
      `--homebrew-cask-file requires one of these smoke profiles: ${Array.from(
        HOMEBREW_CASK_CANDIDATE_PROFILES.keys()
      ).join(', ')}.`
    );
  }
  if (options.installMode !== 'homebrew-cask') {
    throw new Error(`--homebrew-cask-file requires ${options.smokeProfile} to use --install-mode homebrew-cask.`);
  }
  const caskToken = homebrewCaskToken(options.homebrewCask);
  if (caskToken !== profile.caskToken) {
    throw new Error(
      `--homebrew-cask-file requires ${options.smokeProfile} to use --homebrew-cask ${profile.caskToken}.`
    );
  }
  if (options.runtimeProfile !== profile.runtimeProfile) {
    throw new Error(
      `--homebrew-cask-file requires ${options.smokeProfile} to use --runtime-profile ${profile.runtimeProfile}.`
    );
  }
  if (path.basename(options.homebrewCaskFile) !== profile.fileName) {
    throw new Error(`--homebrew-cask-file for ${options.smokeProfile} must be named ${profile.fileName}.`);
  }
  return profile;
}

function officialProfileDesiredRoots() {
  const profile = JSON.parse(fs.readFileSync(PRODUCT_PROFILE_PATH, 'utf8'));
  const roots = profile?.official_profile?.desired_root_package_ids;
  if (!Array.isArray(roots) || roots.length === 0 || roots.some((root) => typeof root !== 'string' || !root.trim())) {
    throw new Error(`Official Profile desired roots are missing or invalid: ${PRODUCT_PROFILE_PATH}`);
  }
  return Array.from(new Set(roots.map((root) => root.trim())));
}

function isHomebrewFullCaskSmoke(options) {
  return matchingHomebrewCaskCandidateProfile(options)?.formulaPolicy === 'forbidden';
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

function normalizeProviderBaseUrl(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

function isOplGatewayProviderBaseUrl(value) {
  const normalized = normalizeProviderBaseUrl(value);
  return [OPL_GATEWAY_BASE_URL, ...OPL_GATEWAY_LEGACY_BASE_URLS].some(
    (candidate) => normalized === normalizeProviderBaseUrl(candidate)
  );
}

function publicProviderCredentialResolution(resolution) {
  return {
    status: resolution.status,
    source: resolution.source,
    reason: resolution.reason,
    config_path: resolution.config_path,
    selected_provider: resolution.selected_provider,
    base_url_present: resolution.base_url_present,
    base_url_matches_opl_gateway: resolution.base_url_matches_opl_gateway,
    credential_present: resolution.credential_present,
  };
}

function resolveHostCodexProviderCredential(options, includeSecret = false) {
  if (options.gatewayAccountEmailFile && options.gatewayAccountPasswordFile) {
    const emailPresent = Boolean(
      fs.statSync(options.gatewayAccountEmailFile, { throwIfNoEntry: false })?.isFile() &&
      fs.readFileSync(options.gatewayAccountEmailFile, 'utf8').trim()
    );
    const passwordPresent = Boolean(
      fs.statSync(options.gatewayAccountPasswordFile, { throwIfNoEntry: false })?.isFile() &&
      fs.readFileSync(options.gatewayAccountPasswordFile, 'utf8').trim()
    );
    const available = emailPresent && passwordPresent;
    return {
      status: available ? 'available' : 'unavailable',
      source: GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE,
      reason: available ? null : 'gateway_account_credential_file_empty',
      config_path: null,
      selected_provider: null,
      base_url: OPL_GATEWAY_BASE_URL,
      base_url_present: true,
      base_url_matches_opl_gateway: true,
      credential_present: available,
    };
  }
  if (options.codexApiKeyFile) {
    if (!fs.existsSync(options.codexApiKeyFile)) {
      return {
        status: 'unavailable',
        source: EXPLICIT_API_KEY_FILE_SOURCE,
        reason: 'explicit_api_key_file_absent',
        config_path: options.codexApiKeyFile,
        selected_provider: null,
        base_url: OPL_GATEWAY_BASE_URL,
        base_url_present: true,
        base_url_matches_opl_gateway: true,
        credential_present: false,
      };
    }
    const apiKey = fs.readFileSync(options.codexApiKeyFile, 'utf8').trim();
    return {
      status: apiKey ? 'available' : 'unavailable',
      source: EXPLICIT_API_KEY_FILE_SOURCE,
      reason: apiKey ? null : 'explicit_api_key_file_empty',
      config_path: options.codexApiKeyFile,
      selected_provider: null,
      base_url: OPL_GATEWAY_BASE_URL,
      base_url_present: true,
      base_url_matches_opl_gateway: true,
      credential_present: Boolean(apiKey),
      ...(includeSecret && apiKey ? { api_key: apiKey } : {}),
    };
  }

  if (!options.codexAiSelfCheck) {
    return {
      status: 'not_requested',
      source: null,
      reason: 'connected_provider_smoke_not_requested',
      config_path: null,
      selected_provider: null,
      base_url: null,
      base_url_present: false,
      base_url_matches_opl_gateway: null,
      credential_present: false,
    };
  }

  const configPath = options.hostCodexConfig;
  if (!configPath || !fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
    return {
      status: 'unavailable',
      source: HOST_CODEX_PROVIDER_SOURCE,
      reason: 'host_codex_config_absent',
      config_path: configPath || null,
      selected_provider: null,
      base_url: null,
      base_url_present: false,
      base_url_matches_opl_gateway: null,
      credential_present: false,
    };
  }

  let config;
  try {
    const { parse: parseToml } = requireFromShell('smol-toml');
    config = parseToml(fs.readFileSync(configPath, 'utf8'));
  } catch (_) {
    return {
      status: 'unavailable',
      source: HOST_CODEX_PROVIDER_SOURCE,
      reason: 'host_codex_config_invalid',
      config_path: configPath,
      selected_provider: null,
      base_url: null,
      base_url_present: false,
      base_url_matches_opl_gateway: null,
      credential_present: false,
    };
  }
  const selectedProvider = typeof config.model_provider === 'string' ? config.model_provider.trim() : '';
  const providers = config.model_providers && typeof config.model_providers === 'object' ? config.model_providers : {};
  const provider =
    selectedProvider && providers[selectedProvider] && typeof providers[selectedProvider] === 'object'
      ? providers[selectedProvider]
      : null;
  const baseUrl = typeof provider?.base_url === 'string' ? provider.base_url.trim() : '';
  const apiKey =
    typeof provider?.experimental_bearer_token === 'string' ? provider.experimental_bearer_token.trim() : '';
  const baseUrlMatches = isOplGatewayProviderBaseUrl(baseUrl);
  let reason = null;
  if (!selectedProvider || !provider) reason = 'selected_host_codex_provider_absent';
  else if (!baseUrl) reason = 'selected_host_codex_provider_base_url_absent';
  else if (!baseUrlMatches) reason = 'selected_host_codex_provider_base_url_mismatch';
  else if (!apiKey) reason = 'selected_host_codex_provider_api_key_absent';

  return {
    status: reason ? 'unavailable' : 'available',
    source: HOST_CODEX_PROVIDER_SOURCE,
    reason,
    config_path: configPath,
    selected_provider: selectedProvider || null,
    base_url: baseUrl || null,
    base_url_present: Boolean(baseUrl),
    base_url_matches_opl_gateway: baseUrl ? baseUrlMatches : null,
    credential_present: Boolean(apiKey),
    ...(includeSecret && !reason ? { api_key: apiKey } : {}),
  };
}

function prepareHostCodexApiKeyFile(options) {
  const resolution = resolveHostCodexProviderCredential(options, true);
  options.providerCredentialResolution = publicProviderCredentialResolution(resolution);
  options.providerCredentialPresent = resolution.status === 'available';
  options.providerCredentialSource = resolution.source;
  options.codexProviderBaseUrl = resolution.status === 'available' ? resolution.base_url : null;
  if (resolution.source === GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE) {
    if (resolution.status !== 'available') {
      throw new Error(`Gateway account credential files are unavailable: ${resolution.reason}.`);
    }
    return null;
  }
  if (resolution.status !== 'available') {
    if (resolution.source === EXPLICIT_API_KEY_FILE_SOURCE) {
      throw new Error(`Explicit Codex API key file is unavailable: ${resolution.reason}.`);
    }
    return null;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-codex-key-'));
  const keyPath = path.join(tempDir, 'codex-api-key.txt');
  fs.writeFileSync(keyPath, `${resolution.api_key}\n`, { encoding: 'utf8', mode: 0o600 });
  return {
    path: keyPath,
    temporary: true,
    tempDir,
    source: resolution.source,
    providerBaseUrl: resolution.base_url,
  };
}

function appendRuntimeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    process.stdout.write(`[tart-smoke] ${message}\n`);
  } catch (_) {
    // Keep file-backed diagnostics available when the host stdout stream fails.
  }
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

function summarizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    classification: error instanceof TartVmCleanupError ? 'vm_cleanup_failure' : 'qualification_stage_failure',
    type: error instanceof Error ? error.name : typeof error,
    code: error && typeof error === 'object' && 'code' in error ? String(error.code) : null,
    path: error && typeof error === 'object' && 'path' in error ? String(error.path) : null,
    message,
    retryable_homebrew_transport: isRetryableHomebrewInstallError(error),
  };
}

function isRetryableHomebrewInstallError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return HOMEBREW_INSTALL_RETRYABLE_PATTERNS.some((pattern) => pattern.test(message));
}

function homebrewInstallRetryDelayMs() {
  const raw = Number(process.env.OPL_HOMEBREW_INSTALL_RETRY_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return DEFAULT_HOMEBREW_INSTALL_RETRY_DELAY_MS;
}

async function installHomebrewCaskWithRetry(options, ip) {
  const attempts = [];
  const maxAttemptsRaw = Number(process.env.OPL_HOMEBREW_INSTALL_MAX_ATTEMPTS);
  const maxAttempts =
    Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0
      ? Math.floor(maxAttemptsRaw)
      : DEFAULT_HOMEBREW_INSTALL_MAX_ATTEMPTS;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = new Date().toISOString();
    appendRuntimeLog(`homebrew_cask_install_attempt=${attempt}/${maxAttempts}`);
    try {
      await sshWithRunOptions(options, ip, guestHomebrewInstallCommand(options), {
        label: `ssh homebrew_cask_install ${options.guestUser}@${ip}`,
        timeoutMs: options.timeoutMs,
      });
      const record = {
        attempt,
        status: 'passed',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        retryable_homebrew_transport: false,
      };
      attempts.push(record);
      runtimeState.homebrewInstallAttempts = attempts;
      return record;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableHomebrewInstallError(error);
      const record = {
        attempt,
        status: 'failed',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        retryable_homebrew_transport: retryable,
        error: error instanceof Error ? error.message : String(error),
      };
      attempts.push(record);
      runtimeState.homebrewInstallAttempts = attempts;
      appendRuntimeLog(`homebrew_cask_install_attempt_failed attempt=${attempt}/${maxAttempts} retryable=${retryable}`);
      if (!retryable || attempt >= maxAttempts) break;
      const delayMs = homebrewInstallRetryDelayMs();
      appendRuntimeLog(`homebrew_cask_install_retry_sleep_ms=${delayMs}`);
      await sleep(delayMs);
    }
  }
  throw lastError ?? new Error('Homebrew cask install failed without an error record.');
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

function hashFile(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function guestCodexPackageTarballPath(options) {
  if (!options.codexPackageTarball) return null;
  return `${options.guestWorkdir}/${path.basename(options.codexPackageTarball)}`;
}

function guestCodexPlatformPackageTarballPath(options) {
  if (!options.codexPlatformPackageTarball) return null;
  return `${options.guestWorkdir}/${path.basename(options.codexPlatformPackageTarball)}`;
}

function guestCodexNpmCacheDir(options) {
  if (!options.codexNpmCacheDir) return null;
  return `${options.guestWorkdir}/codex-npm-cache`;
}

function codexInstallPreseedPlan(options) {
  const tarballStats = options.codexPackageTarball ? fs.statSync(options.codexPackageTarball) : null;
  const platformTarballStats = options.codexPlatformPackageTarball
    ? fs.statSync(options.codexPlatformPackageTarball)
    : null;
  const cacheStats = options.codexNpmCacheDir ? fs.statSync(options.codexNpmCacheDir) : null;
  return {
    schema: 'opl_codex_install_preseed.v1',
    requested: Boolean(options.codexPackageTarball || options.codexPlatformPackageTarball || options.codexNpmCacheDir),
    package_tarball: {
      present: Boolean(tarballStats?.isFile()),
      basename: options.codexPackageTarball ? path.basename(options.codexPackageTarball) : null,
      guest_path: guestCodexPackageTarballPath(options),
      type: tarballStats ? (tarballStats.isFile() ? 'file' : tarballStats.isDirectory() ? 'directory' : 'other') : null,
      size_bytes: tarballStats?.isFile() ? tarballStats.size : null,
      sha256: tarballStats?.isFile() ? hashFile(options.codexPackageTarball) : null,
    },
    platform_package_tarball: {
      present: Boolean(platformTarballStats?.isFile()),
      basename: options.codexPlatformPackageTarball ? path.basename(options.codexPlatformPackageTarball) : null,
      guest_path: guestCodexPlatformPackageTarballPath(options),
      type: platformTarballStats
        ? platformTarballStats.isFile()
          ? 'file'
          : platformTarballStats.isDirectory()
            ? 'directory'
            : 'other'
        : null,
      size_bytes: platformTarballStats?.isFile() ? platformTarballStats.size : null,
      sha256: platformTarballStats?.isFile() ? hashFile(options.codexPlatformPackageTarball) : null,
    },
    npm_cache_dir: {
      present: Boolean(cacheStats?.isDirectory()),
      basename: options.codexNpmCacheDir ? path.basename(options.codexNpmCacheDir) : null,
      guest_path: guestCodexNpmCacheDir(options),
      type: cacheStats ? (cacheStats.isFile() ? 'file' : cacheStats.isDirectory() ? 'directory' : 'other') : null,
      size_bytes: cacheStats?.isDirectory() ? directorySizeBytes(options.codexNpmCacheDir) : null,
      sha256: null,
    },
    env: {
      opl_first_run_codex_package_tarball: Boolean(options.codexPackageTarball),
      opl_first_run_codex_platform_package_tarball: Boolean(options.codexPlatformPackageTarball),
      opl_first_run_codex_npm_cache_dir: Boolean(options.codexNpmCacheDir),
      npm_config_cache: Boolean(options.codexNpmCacheDir),
    },
  };
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

function guestSmokeHostDeadlineEpochMs(options, nowMs = Date.now()) {
  return nowMs + guestSmokeHostTimeoutMs(options);
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

async function copyGuestArtifactsForSignal(options) {
  if (!runtimeState.ip || !runtimeState.guestArtifactDir || runtimeState.copiedArtifacts) {
    return;
  }
  if (runtimeState.currentChild && !runtimeState.currentChild.killed) {
    runtimeState.currentChild.kill('SIGTERM');
    await sleep(1_000);
  }
  try {
    await scpFromGuestWithRunOptions(options, runtimeState.ip, runtimeState.guestArtifactDir, options.artifacts, {
      label: `scp signal_guest_artifacts ${options.guestUser}@${runtimeState.ip}`,
      timeoutMs: SIGNAL_GUEST_ARTIFACT_COPY_TIMEOUT_MS,
    });
    runtimeState.copiedArtifacts = true;
    appendRuntimeLog('copied_guest_artifacts_after_signal');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendRuntimeLog(`artifact_copy_after_signal_failed ${message}`);
  }
}

async function scpFromGuestWithRunOptions(options, ip, sourceDir, targetDir, runOptions) {
  fs.mkdirSync(targetDir, { recursive: true });
  const args = ['-r', '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null'];
  if (options.sshKey) args.push('-o', 'IdentitiesOnly=yes', '-i', options.sshKey);
  args.push(`${options.guestUser}@${ip}:${sourceDir}/`, targetDir);
  await runAsync('scp', args, runOptions);
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

async function copyCodexNpmCacheDirToGuest(options, ip) {
  if (!options.codexNpmCacheDir) return;
  const guestCacheDir = guestCodexNpmCacheDir(options);
  const tmpDir = `${guestCacheDir}.tmp-${process.pid}`;
  await ssh(options, ip, `rm -rf ${shellQuote(tmpDir)} ${shellQuote(guestCacheDir)} && mkdir -p ${shellQuote(tmpDir)}`);
  await runPipe('tar', ['-C', options.codexNpmCacheDir, '-cf', '-', '.'], 'ssh', [
    ...sshBaseArgs(options, ip),
    `tar -C ${shellQuote(tmpDir)} -xf -`,
  ]);
  await ssh(options, ip, `mv ${shellQuote(tmpDir)} ${shellQuote(guestCacheDir)}`);
}

function assertPhysicalProvisioningTree(root) {
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) {
        throw new Error(`MAS provisioning transport rejects symlinks: ${target}`);
      }
      if (stat.isDirectory()) visit(target);
      else if (!stat.isFile()) {
        throw new Error(`MAS provisioning transport accepts only files and directories: ${target}`);
      }
    }
  };
  visit(root);
}

async function copyMasProvisioningWorkspaceToGuest(options, ip) {
  const transport = resolveMasProvisioningTransport(options, true);
  if (!transport) return;
  assertPhysicalProvisioningTree(transport.workspace);
  await ssh(options, ip, `mkdir -p ${shellQuote(transport.workspace)}`);
  await runPipe('tar', ['-C', transport.workspace, '-cf', '-', '.'], 'ssh', [
    ...sshBaseArgs(options, ip),
    `tar -C ${shellQuote(transport.workspace)} -xf -`,
  ]);
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

class TartVmCleanupError extends Error {
  constructor(receipt) {
    const diagnostics = [
      ...Object.values(receipt.ancillary_actions ?? {}).map((action) => action?.failure?.message),
      receipt.actions?.stop?.failure?.message,
      receipt.actions?.delete?.failure?.message,
      receipt.inspection?.failure?.message,
      receipt.receipt_write?.failure?.message,
    ].filter(Boolean);
    super(
      `Tart VM cleanup failed (${receipt.failure_reasons.join(', ')})${diagnostics.length > 0 ? `: ${diagnostics.join(' | ')}` : '.'}`
    );
    this.name = 'TartVmCleanupError';
    this.code = 'VM_CLEANUP_FAILURE';
    this.receipt = receipt;
  }
}

function cleanupActionFailure(error, classification) {
  return {
    classification,
    type: error instanceof Error ? error.name : typeof error,
    code: error && typeof error === 'object' && 'code' in error ? String(error.code) : null,
    path: error && typeof error === 'object' && 'path' in error ? String(error.path) : null,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack || null : null,
  };
}

function runTartCleanupCommand(args) {
  const result = spawnSync('tart', args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: TART_CLEANUP_COMMAND_TIMEOUT_MS,
  });
  if (result.status === 0 && !result.error) return result.stdout ?? '';
  const error = new Error(
    [
      `tart ${args.join(' ')} exited with ${result.status}`,
      result.error ? `spawn error: ${result.error.message}` : '',
      result.stdout ? `stdout:\n${result.stdout}` : '',
      result.stderr ? `stderr:\n${result.stderr}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );
  if (result.error && typeof result.error === 'object' && 'code' in result.error) {
    error.code = String(result.error.code);
  }
  throw error;
}

function attemptTartCleanupAction(action, runAction) {
  try {
    runAction(action);
    return { action, attempted: true, status: 'passed', failure: null };
  } catch (error) {
    return {
      action,
      attempted: true,
      status: 'failed',
      failure: cleanupActionFailure(error, `vm_cleanup_${action}_failure`),
    };
  }
}

function isExactAlreadyStoppedFailure(stop, vmName) {
  if (stop.status !== 'failed' || typeof stop.failure?.message !== 'string') return false;
  const expectedMessage = [`tart stop ${vmName} exited with 2`, 'stderr:', `VM "${vmName}" is not running`].join('\n');
  return stop.failure.message.trimEnd() === expectedMessage;
}

function attemptAncillaryCleanupAction(action, required, runAction, classification) {
  if (!required) {
    return { action, attempted: false, status: 'skipped_not_required', failure: null };
  }
  try {
    runAction();
    return { action, attempted: true, status: 'passed', failure: null };
  } catch (error) {
    return {
      action,
      attempted: true,
      status: 'failed',
      failure: cleanupActionFailure(error, classification),
    };
  }
}

function inspectLocalTartVm(vmName) {
  const raw = runTartCleanupCommand(['list', '--source', 'local', '--format', 'json']);
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (_) {
    throw new Error('Tart local VM inventory is not valid JSON.');
  }
  if (!Array.isArray(entries)) {
    throw new Error('Tart local VM inventory must be an array.');
  }
  const matches = entries.filter((entry) => entry && typeof entry === 'object' && entry.Name === vmName);
  if (matches.length > 1) {
    throw new Error('Tart local VM inventory contains duplicate exact VM names.');
  }
  if (matches.length === 0) {
    return { present: false, running: false, state: 'absent' };
  }
  const entry = matches[0];
  return {
    present: true,
    running: entry.Running === true,
    state: typeof entry.State === 'string' ? entry.State.toLowerCase() : 'unknown',
  };
}

function stopAndDeleteVm(options, dependencies = {}) {
  const runAction = dependencies.runAction ?? ((action) => runTartCleanupCommand([action, options.vmName]));
  const inspectVm = dependencies.inspectVm ?? (() => inspectLocalTartVm(options.vmName));
  const stop = attemptTartCleanupAction('stop', runAction);
  const alreadyStopped = isExactAlreadyStoppedFailure(stop, options.vmName);
  const deletion = options.keepVm
    ? { action: 'delete', attempted: false, status: 'skipped_keep_vm', failure: null }
    : attemptTartCleanupAction('delete', runAction);

  let inspection;
  try {
    const observed = inspectVm();
    inspection = {
      status: 'passed',
      present: observed?.present === true,
      running: observed?.running === true,
      state: typeof observed?.state === 'string' ? observed.state : 'unknown',
      failure: null,
    };
  } catch (error) {
    inspection = {
      status: 'failed',
      present: null,
      running: null,
      state: 'unknown',
      failure: cleanupActionFailure(error, 'vm_cleanup_inspection_failure'),
    };
  }

  const acceptedAsIdempotent =
    alreadyStopped &&
    options.keepVm === false &&
    deletion.status === 'passed' &&
    inspection.status === 'passed' &&
    inspection.present === false &&
    inspection.state === 'absent';
  stop.already_stopped = alreadyStopped;
  stop.accepted_as_idempotent = acceptedAsIdempotent;

  const failureReasons = [];
  if (stop.status === 'failed' && !acceptedAsIdempotent) failureReasons.push('stop_action_failed');
  if (deletion.status === 'failed') failureReasons.push('delete_action_failed');
  if (inspection.status === 'failed') {
    failureReasons.push('final_state_inspection_failed');
  } else if (options.keepVm) {
    if (!inspection.present) failureReasons.push('kept_vm_missing');
    if (inspection.present && (inspection.running || inspection.state !== 'stopped')) {
      failureReasons.push('kept_vm_not_stopped');
    }
  } else {
    if (inspection.present) failureReasons.push('vm_still_present');
    if (!inspection.present && inspection.state !== 'absent') failureReasons.push('vm_final_state_not_absent');
  }

  const cleanupFinished = failureReasons.length === 0;
  const receipt = {
    schema: 'opl_tart_vm_cleanup_receipt.v1',
    status: cleanupFinished ? 'passed' : 'failed',
    classification: cleanupFinished ? null : 'vm_cleanup_failure',
    vm_name: options.vmName,
    keep_vm: options.keepVm,
    required_final_state: options.keepVm ? 'stopped_and_present' : 'absent',
    actions: { stop, delete: deletion },
    inspection,
    failure_reasons: failureReasons,
    cleanup_finished: cleanupFinished,
    completed_at: new Date().toISOString(),
  };
  return {
    receipt,
    error: cleanupFinished ? null : new TartVmCleanupError(receipt),
  };
}

function writeVmCleanupReceipt(options, receipt) {
  const receiptPath = path.join(options.artifacts, 'tart-vm-cleanup-receipt.json');
  fs.mkdirSync(options.artifacts, { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receiptPath;
}

function writeInterruptedSummary(signal) {
  const options = runtimeState.options;
  if (!options) return;
  try {
    fs.mkdirSync(options.artifacts, { recursive: true });
    const guestSummary = readGuestSmokeSummary(options.artifacts);
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
      codex_install_preseed: codexInstallPreseedPlan(options),
      guest_node_staging: runtimeState.guestNodeStaging,
      vm_cleanup: runtimeState.vmCleanupReceipt,
      stage_timing: buildStageTimingSummary(runtimeState.stageEvents),
      computer_use_qualification: guestSummary?.computer_use_qualification ?? null,
      temporal_service_supervisor_proof: guestSummary?.temporal_service_supervisor_proof ?? null,
      guest_summary: guestSummary,
    };
    fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  } catch (_) {
    // Best-effort diagnostics must not mask signal handling.
  }
}

function cleanupRuntime({
  copyGuestArtifacts = true,
  reason = 'cleanup',
  copyArtifacts = scpFromGuest,
  ancillaryCleanupDependencies = {},
  vmCleanupDependencies,
  writeCleanupReceipt = writeVmCleanupReceipt,
} = {}) {
  const options = runtimeState.options;
  if (!options) {
    return Promise.resolve({ artifactPullError: null, cleanupError: null, vmCleanupReceipt: null });
  }
  if (runtimeState.cleanupPromise) return runtimeState.cleanupPromise;
  if (runtimeState.cleanupResult) return Promise.resolve(runtimeState.cleanupResult);
  runtimeState.cleanupStarted = true;
  runtimeState.cleanupPromise = (async () => {
    appendRuntimeLog(`cleanup_started reason=${reason || 'cleanup'}`);
    let artifactPullError = null;

    if (copyGuestArtifacts && runtimeState.ip && runtimeState.guestArtifactDir && !runtimeState.copiedArtifacts) {
      try {
        await copyArtifacts(options, runtimeState.ip, runtimeState.guestArtifactDir, options.artifacts);
        runtimeState.copiedArtifacts = true;
        appendRuntimeLog('copied_guest_artifacts_after_failure');
      } catch (error) {
        artifactPullError = error;
        const message = error instanceof Error ? error.message : String(error);
        appendRuntimeLog(`artifact_copy_after_failure_failed ${message}`);
      }
    }

    const removeCredentialTemp =
      ancillaryCleanupDependencies.removeCredentialTemp ??
      ((tempDir) => fs.rmSync(tempDir, { recursive: true, force: true }));
    const terminateCurrentChild =
      ancillaryCleanupDependencies.terminateCurrentChild ?? ((child) => child.kill('SIGTERM'));
    const terminateTartProcess =
      ancillaryCleanupDependencies.terminateTartProcess ?? ((child) => child.kill('SIGTERM'));
    const credentialTempRequired = Boolean(
      runtimeState.codexApiKeyFile?.temporary && runtimeState.codexApiKeyFile.tempDir
    );
    const currentChildRequired = Boolean(runtimeState.currentChild && !runtimeState.currentChild.killed);
    const tartProcessRequired = Boolean(runtimeState.tartProcess && !runtimeState.tartProcess.killed);
    const ancillaryActions = {
      credential_temp_cleanup: attemptAncillaryCleanupAction(
        'credential_temp_cleanup',
        credentialTempRequired,
        () => removeCredentialTemp(runtimeState.codexApiKeyFile.tempDir),
        'vm_cleanup_credential_temp_failure'
      ),
      current_child_termination: attemptAncillaryCleanupAction(
        'current_child_termination',
        currentChildRequired,
        () => terminateCurrentChild(runtimeState.currentChild),
        'vm_cleanup_current_child_termination_failure'
      ),
      tart_process_termination: attemptAncillaryCleanupAction(
        'tart_process_termination',
        tartProcessRequired,
        () => terminateTartProcess(runtimeState.tartProcess),
        'vm_cleanup_tart_process_termination_failure'
      ),
    };
    const ancillaryFailureReasons = Object.entries(ancillaryActions)
      .filter(([, action]) => action.status === 'failed')
      .map(([action]) => `${action}_failed`);
    for (const action of Object.values(ancillaryActions)) {
      if (action.status !== 'failed') continue;
      appendRuntimeLog(
        `${action.action}_failed code=${action.failure.code ?? 'none'} path=${action.failure.path ?? 'none'} message=${action.failure.message}`
      );
    }
    const vmCleanup = stopAndDeleteVm(options, vmCleanupDependencies);
    const receipt = {
      ...vmCleanup.receipt,
      status: ancillaryFailureReasons.length === 0 && vmCleanup.receipt.status === 'passed' ? 'passed' : 'failed',
      classification:
        ancillaryFailureReasons.length === 0 && vmCleanup.receipt.status === 'passed' ? null : 'vm_cleanup_failure',
      ancillary_actions: ancillaryActions,
      failure_reasons: [...ancillaryFailureReasons, ...vmCleanup.receipt.failure_reasons],
      cleanup_finished: ancillaryFailureReasons.length === 0 && vmCleanup.receipt.cleanup_finished,
    };
    let cleanupError = receipt.cleanup_finished ? null : new TartVmCleanupError(receipt);
    runtimeState.vmCleanupReceipt = receipt;
    try {
      writeCleanupReceipt(options, receipt);
    } catch (error) {
      const receiptWriteFailure = cleanupActionFailure(error, 'vm_cleanup_receipt_write_failure');
      const failedReceipt = {
        ...receipt,
        status: 'failed',
        classification: 'vm_cleanup_failure',
        receipt_write: {
          status: 'failed',
          failure: receiptWriteFailure,
        },
        failure_reasons: [...receipt.failure_reasons, 'cleanup_receipt_write_failed'],
        cleanup_finished: false,
      };
      runtimeState.vmCleanupReceipt = failedReceipt;
      cleanupError = new TartVmCleanupError(failedReceipt);
      appendRuntimeLog(
        `vm_cleanup_receipt_write_failed code=${receiptWriteFailure.code ?? 'none'} path=${receiptWriteFailure.path ?? 'none'} message=${receiptWriteFailure.message}`
      );
    }
    const finalReceipt = runtimeState.vmCleanupReceipt;
    appendRuntimeLog(
      `vm_cleanup_result status=${finalReceipt.status} required_final_state=${finalReceipt.required_final_state} stop=${finalReceipt.actions.stop.status} delete=${finalReceipt.actions.delete.status} inspection=${finalReceipt.inspection.status}`
    );
    if (finalReceipt.cleanup_finished) appendRuntimeLog('cleanup_finished');
    const result = { artifactPullError, cleanupError, vmCleanupReceipt: finalReceipt };
    runtimeState.cleanupResult = result;
    return result;
  })();
  return runtimeState.cleanupPromise;
}

if (process.env.NODE_ENV !== 'test') {
  for (const signal of SIGNAL_EXIT_CODES.keys()) {
    process.once(signal, () => {
      appendRuntimeLog(`received_signal signal=${signal}`);
      copyGuestArtifactsForSignal(runtimeState.options)
        .finally(() => {
          return cleanupRuntime({ copyGuestArtifacts: false, reason: `signal:${signal}` });
        })
        .finally(() => {
          writeInterruptedSummary(signal);
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
  guestFrameworkInstallScriptPath = null,
  guestHostDeadlineEpochMs = guestSmokeHostDeadlineEpochMs(options),
  guestGatewayAccountEmailPath = null,
  guestGatewayAccountPasswordPath = null
) {
  const gatewayAccountRequested = Boolean(options.gatewayAccountEmailFile && options.gatewayAccountPasswordFile);
  const providerCredentialRequested =
    gatewayAccountRequested || options.providerCredentialPresent || Boolean(options.codexApiKeyFile);
  const providerCredentialSource =
    options.providerCredentialSource ??
    (gatewayAccountRequested
      ? GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE
      : options.codexApiKeyFile
        ? EXPLICIT_API_KEY_FILE_SOURCE
        : null);
  const providerBaseUrl =
    options.codexProviderBaseUrl ?? (gatewayAccountRequested || options.codexApiKeyFile ? OPL_GATEWAY_BASE_URL : null);
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
  const compiledExpectationsPath = options.compiledExpectations
    ? `${options.guestWorkdir}/app-first-run-compiled-expectations.json`
    : null;
  const homebrewCaskProfile = matchingHomebrewCaskCandidateProfile(options);
  const homebrewFullCaskSmoke = homebrewCaskProfile?.formulaPolicy === 'forbidden';
  const homebrewCaskSmoke = Boolean(homebrewCaskProfile);
  const homebrewInstallOrigin = homebrewFullCaskSmoke
    ? 'homebrew_full_cask'
    : homebrewCaskProfile?.caskToken === 'one-person-lab-nightly'
      ? 'homebrew_nightly_cask'
      : homebrewCaskProfile?.caskToken === 'one-person-lab'
        ? 'homebrew_standard_cask'
        : null;
  const officialRoots = officialProfileDesiredRoots();
  const homebrewFormulaStatePath = homebrewFullCaskSmoke
    ? `${options.guestWorkdir}/homebrew-full-formula-state.json`
    : null;
  const smokeArgs = [
    `${nodeCommand} ${shellQuote(guestScriptPath)}`,
    options.installMode === 'homebrew-cask'
      ? `--app ${shellQuote('/Applications/One Person Lab.app')}`
      : `--dmg ${shellQuote(guestDmgPath)}`,
    `--artifacts ${shellQuote(guestArtifactDir)}`,
    providerCredentialRequested && guestCodexApiKeyPath
      ? `--codex-api-key-file ${shellQuote(guestCodexApiKeyPath)}`
      : '',
    gatewayAccountRequested && guestGatewayAccountEmailPath
      ? `--gateway-account-email-file ${shellQuote(guestGatewayAccountEmailPath)}`
      : '',
    gatewayAccountRequested && guestGatewayAccountPasswordPath
      ? `--gateway-account-password-file ${shellQuote(guestGatewayAccountPasswordPath)}`
      : '',
    providerCredentialRequested && providerBaseUrl ? `--codex-provider-base-url ${shellQuote(providerBaseUrl)}` : '',
    providerCredentialRequested && providerCredentialSource
      ? `--provider-credential-source ${shellQuote(providerCredentialSource)}`
      : '',
    options.requireCodexConfigWizard ? '--require-codex-config-wizard' : '',
    '--assert-clean',
    options.requireGatekeeper ? '--require-gatekeeper' : '',
    `--process-name ${shellQuote(options.processName)}`,
    `--timeout-ms ${shellQuote(String(options.smokeTimeoutMs))}`,
    `--codex-install-phase-timeout-ms ${shellQuote(String(options.codexInstallPhaseTimeoutMs))}`,
    `--codex-readiness-phase-timeout-ms ${shellQuote(String(options.codexReadinessPhaseTimeoutMs))}`,
    `--host-deadline-epoch-ms ${shellQuote(String(guestHostDeadlineEpochMs))}`,
    options.codexPackageTarball ? `--codex-package-tarball ${shellQuote(guestCodexPackageTarballPath(options))}` : '',
    options.codexPlatformPackageTarball
      ? `--codex-platform-package-tarball ${shellQuote(guestCodexPlatformPackageTarballPath(options))}`
      : '',
    options.codexNpmCacheDir ? `--codex-npm-cache-dir ${shellQuote(guestCodexNpmCacheDir(options))}` : '',
    options.masStudyProvisioningWorkspace
      ? `--assistant-workspace ${shellQuote(options.masStudyProvisioningWorkspace)}`
      : '',
    options.masStudyProvisioningReceipt
      ? `--mas-study-provisioning-receipt ${shellQuote(options.masStudyProvisioningReceipt)}`
      : '',
    options.bootstrapLaunchDiagnostics ? '--bootstrap-launch-diagnostics' : '',
    options.settingsSmoke ? '--settings-smoke' : '',
    options.assistantRouteSmoke ? '--assistant-route-smoke' : '',
    options.codexFunctionalCheck ? '--codex-functional-check' : '',
    options.codexAiSelfCheck ? '--codex-ai-self-check' : '',
    options.codexAiSelfCheck ? `--codex-ai-self-check-mode ${shellQuote(options.codexAiSelfCheckMode)}` : '',
    options.codexAiSelfCheck
      ? `--codex-ai-self-check-timeout-ms ${shellQuote(String(options.codexAiSelfCheckTimeoutMs))}`
      : '',
    options.bootstrapLaunchDiagnostics ||
    options.settingsSmoke ||
    options.assistantRouteSmoke ||
    gatewayAccountRequested
      ? `--cdp-port ${shellQuote(String(options.cdpPort))}`
      : '',
    `--runtime-profile ${shellQuote(options.runtimeProfile)}`,
    options.expectedFrameworkSha ? `--expected-framework-sha ${shellQuote(options.expectedFrameworkSha)}` : '',
    homebrewInstallOrigin ? `--install-origin ${homebrewInstallOrigin}` : '',
    homebrewCaskSmoke ? `--homebrew-cask ${shellQuote(homebrewCaskToken(options.homebrewCask))}` : '',
    homebrewFormulaStatePath ? `--homebrew-formula-state ${shellQuote(homebrewFormulaStatePath)}` : '',
    ...officialRoots.map((root) => `--official-profile-root ${shellQuote(root)}`),
    options.guideScreenshots ? '--guide-screenshots' : '',
  ].join(' ');
  return [
    'set -euo pipefail',
    providerCredentialRequested ? '' : 'unset OPL_FIRST_RUN_CODEX_API_KEY_FILE',
    ...sourceArchiveEnv,
    compiledExpectationsPath
      ? `export OPL_FIRST_RUN_COMPILED_EXPECTATIONS=${shellQuote(compiledExpectationsPath)}`
      : '',
    smokeArgs,
  ]
    .filter(Boolean)
    .join('\n');
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

function guestHomebrewBootstrapCommand() {
  return `
set -euo pipefail
brew_ready=0
if command -v brew >/dev/null 2>&1 || [ -x /opt/homebrew/bin/brew ] || [ -x /usr/local/bin/brew ]; then
  brew_ready=1
fi

if ! xcode-select -p >/dev/null 2>&1 || ! /usr/bin/git --version >/dev/null 2>&1; then
  update_list="$(softwareupdate --list 2>&1 || true)"
  clt_label="$(printf '%s\n' "$update_list" | sed -n 's/^\\* Label: \\(Command Line Tools for Xcode.*\\)$/\\1/p' | tail -n 1)"
  if [ -z "$clt_label" ]; then
    echo "No Command Line Tools update is available for the clean Tart guest." >&2
    printf '%s\n' "$update_list" >&2
    exit 86
  fi
  sudo -n softwareupdate --install "$clt_label" --verbose
fi

if ! xcode-select -p >/dev/null 2>&1 && [ -d /Library/Developer/CommandLineTools ]; then
  sudo -n xcode-select --switch /Library/Developer/CommandLineTools
fi

if ! xcode-select -p >/dev/null 2>&1 || ! /usr/bin/git --version >/dev/null 2>&1; then
  echo "Command Line Tools installation completed without an active developer directory and Git." >&2
  exit 87
fi

if [ "$brew_ready" -eq 1 ]; then
  exit 0
fi

installer="$(mktemp -t opl-homebrew-install)"
trap 'rm -f "$installer"' EXIT
curl -fsSL --retry 3 --retry-all-errors --retry-delay 5 \
  https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh \
  -o "$installer"
NONINTERACTIVE=1 HOMEBREW_NO_ANALYTICS=1 /bin/bash "$installer"
test -x /opt/homebrew/bin/brew -o -x /usr/local/bin/brew
`;
}

function guestHomebrewInstallCommand(options) {
  const caskToken = homebrewCaskToken(options.homebrewCask);
  const caskProfile = matchingHomebrewCaskCandidateProfile(options);
  const homebrewFullCaskSmoke = caskProfile?.formulaPolicy === 'forbidden';
  const homebrewFormulaRequired = caskProfile?.formulaPolicy === 'required';
  const homebrewFormulaStatePath = `${options.guestWorkdir}/homebrew-full-formula-state.json`;
  const guestCaskCandidate = options.homebrewCaskFile
    ? `${options.guestWorkdir}/${path.basename(options.homebrewCaskFile)}`
    : null;
  const candidateProfile = guestCaskCandidate ? validateHomebrewCaskCandidateProfile(options) : null;
  const trustedCaskRefs = homebrewTrustedCaskRefs(options);
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
  echo "Homebrew bootstrap did not produce a usable brew binary in the transient VM." >&2
  exit 85
fi
eval "$("$BREW_BIN" shellenv)"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
export HOMEBREW_NO_ENV_HINTS=1
${
  guestCaskCandidate
    ? `${homebrewFormulaRequired ? `"$BREW_BIN" tap ${shellQuote(options.homebrewTap)}\n` : ''}"$BREW_BIN" tap-new opl-local/cask-candidate
tap_path="$("$BREW_BIN" --repository opl-local/cask-candidate)"
mkdir -p "$tap_path/Casks"
cp ${shellQuote(guestCaskCandidate)} "$tap_path/Casks/${candidateProfile.fileName}"
homebrew_cask_ref=opl-local/cask-candidate/${candidateProfile.caskToken}`
    : `"$BREW_BIN" tap ${shellQuote(options.homebrewTap)}
homebrew_cask_ref=${shellQuote(options.homebrewCask)}`
}
if "$BREW_BIN" trust --help >/dev/null 2>&1; then
${trustedCaskRefs.map((caskRef) => `  "$BREW_BIN" trust --cask ${shellQuote(caskRef)}`).join('\n')}
fi
${
  homebrewFullCaskSmoke
    ? `rm -f ${shellQuote(homebrewFormulaStatePath)}
if "$BREW_BIN" list --formula opl >/dev/null 2>&1; then
  echo "Full Cask clean install requires Formula opl to be absent before installation." >&2
  exit 1
fi`
    : ''
}
"$BREW_BIN" install --cask "$homebrew_cask_ref"
test -d "/Applications/One Person Lab.app"
"$BREW_BIN" list --cask ${shellQuote(caskToken)} >/dev/null
${
  homebrewFullCaskSmoke
    ? `if "$BREW_BIN" list --formula opl >/dev/null 2>&1; then
  echo "Full Cask must consume embedded Base and must not install Formula opl." >&2
  exit 1
fi
printf '%s\\n' '{"schema":"opl_homebrew_formula_state.v1","formula_opl_installed_before":false,"formula_opl_installed_after":false}' > ${shellQuote(homebrewFormulaStatePath)}`
    : `${
        homebrewFormulaRequired
          ? `if ! "$BREW_BIN" list --formula opl >/dev/null 2>&1; then
  echo "Standard and Nightly Casks must install Formula opl." >&2
  exit 1
fi`
          : ''
      }
xattr -dr com.apple.quarantine "/Applications/One Person Lab.app" 2>/dev/null || sudo xattr -dr com.apple.quarantine "/Applications/One Person Lab.app" 2>/dev/null || true`
}
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

function readGuestSourceIdentityArtifact(hostArtifactsDir, fileName) {
  const identityPath = path.join(hostArtifactsDir, 'artifacts', fileName);
  let stat;
  try {
    stat = fs.lstatSync(identityPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Guest source identity artifact is missing: ${fileName} (${message})`);
  }
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0) {
    throw new Error(`Guest source identity artifact must be a nonempty regular non-symlink file: ${fileName}`);
  }
  const parsed = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Guest source identity artifact must contain a JSON object: ${fileName}`);
  }
  return parsed;
}

function assertGuestReleaseSourceIdentity(options, guestSummary, hostArtifactsDir = null) {
  if (!options.expectedFrameworkSha) return;
  const common = (identity, schema) => {
    if (
      identity?.schema !== schema ||
      identity?.status !== 'passed' ||
      identity?.expected_framework_sha !== options.expectedFrameworkSha ||
      identity?.observed_framework_sha !== options.expectedFrameworkSha ||
      identity?.exact_match !== true
    ) {
      throw new Error('Guest release source identity does not match the expected Framework cohort.');
    }
  };
  const isStandard = options.runtimeProfile === 'standard';
  const field = isStandard ? 'installed_framework_source_identity' : 'full_runtime_source_identity';
  const fileName = isStandard ? 'installed-framework-source-identity.json' : 'full-runtime-source-identity.json';
  const schema = isStandard ? 'opl_framework_installed_source_identity.v1' : 'opl_full_runtime_source_identity.v1';
  const identity = guestSummary[field];
  common(identity, schema);
  if (isStandard && identity.install_mode !== 'archive') {
    throw new Error('Guest Standard source identity must report install_mode=archive.');
  }
  if (!isStandard && identity.source !== 'packaged_app_resource') {
    throw new Error('Guest Full source identity must come from the packaged App resource manifest.');
  }
  if (hostArtifactsDir) {
    const artifactIdentity = readGuestSourceIdentityArtifact(hostArtifactsDir, fileName);
    common(artifactIdentity, schema);
    if (JSON.stringify(artifactIdentity) !== JSON.stringify(identity)) {
      throw new Error(`Guest source identity summary and ${fileName} do not match.`);
    }
  }
}

function assertGuestSmokeSummary(options, guestSummary, hostArtifactsDir = null) {
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
  if (!options.bootstrapLaunchDiagnostics) {
    const computerUse = guestSummary.computer_use_qualification;
    const acceptance = computerUse?.acceptance;
    const requiredTools = Array.isArray(computerUse?.mcp?.required_tools)
      ? [...computerUse.mcp.required_tools].sort()
      : [];
    const observedTools = Array.isArray(computerUse?.mcp?.observed_tools)
      ? [...computerUse.mcp.observed_tools].sort()
      : [];
    const permissionAxes = [computerUse?.permissions?.accessibility, computerUse?.permissions?.screen_recording];
    const permissionProjectionConsistent =
      (computerUse?.state?.permission === 'granted' && permissionAxes.every((value) => value === 'granted')) ||
      (computerUse?.state?.permission === 'required' && permissionAxes.some((value) => value === 'required'));
    const readyConsistent =
      computerUse?.state?.permission === 'granted'
        ? computerUse?.state?.ready === true && computerUse?.state?.status === 'ready'
        : computerUse?.state?.permission === 'required' &&
          computerUse?.state?.ready === false &&
          computerUse?.state?.status === 'permission_required';
    const acceptancePassed = [
      acceptance?.lifecycle_ready,
      acceptance?.projection_identity_bound,
      acceptance?.bundle_identity_verified,
      acceptance?.service_ready,
      acceptance?.mcp_10_tools_exact,
      acceptance?.permission_details_valid,
      acceptance?.permission_projection_consistent,
      acceptance?.ready_consistent,
      acceptance?.standard_full_same_logic,
    ].every((passed) => passed === true);
    if (
      computerUse?.schema !== 'opl_computer_use_qualification.v1' ||
      computerUse?.status !== 'passed' ||
      computerUse?.runtime_profile !== options.runtimeProfile ||
      computerUse?.provider_id !== 'kimi-cu' ||
      computerUse?.product_name !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.productName ||
      computerUse?.version !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.version ||
      computerUse?.source_ref !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.sourceRef ||
      typeof computerUse?.source_sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(computerUse.source_sha256) ||
      computerUse?.state?.installed !== true ||
      computerUse?.state?.registered !== true ||
      computerUse?.state?.enabled !== true ||
      computerUse?.bundle?.identity_verified !== true ||
      computerUse?.bundle?.path !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.path ||
      computerUse?.bundle?.executable !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.executable ||
      computerUse?.bundle?.bundle_id !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.bundleId ||
      computerUse?.bundle?.version !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.version ||
      computerUse?.bundle?.team_id !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.teamId ||
      computerUse?.bundle?.architecture !== MANAGED_COMPUTER_USE_EXPECTED_IDENTITY.architecture ||
      computerUse?.service?.registered !== true ||
      computerUse?.service?.xpc_ping !== 'passed' ||
      computerUse?.mcp?.registered !== true ||
      computerUse?.mcp?.enabled !== true ||
      computerUse?.mcp?.server_id !== 'kimi-cu' ||
      computerUse?.mcp?.tools_exact !== true ||
      requiredTools.length !== 10 ||
      observedTools.length !== 10 ||
      JSON.stringify(requiredTools) !== JSON.stringify(observedTools) ||
      !permissionAxes.every((value) => value === 'granted' || value === 'required') ||
      !permissionProjectionConsistent ||
      !readyConsistent ||
      !acceptancePassed
    ) {
      throw new Error('Guest smoke did not prove the packaged KimiCU Computer Use qualification.');
    }
  }
  assertGuestReleaseSourceIdentity(options, guestSummary, hostArtifactsDir);
  const providerConfiguration = guestSummary.provider_configuration;
  const gatewayAccountRequested = Boolean(options.gatewayAccountEmailFile && options.gatewayAccountPasswordFile);
  const providerCredentialRequested =
    gatewayAccountRequested || options.providerCredentialPresent || Boolean(options.codexApiKeyFile);
  const expectedCredentialSource = providerCredentialRequested
    ? (options.providerCredentialSource ??
      (gatewayAccountRequested
        ? GATEWAY_ACCOUNT_PASSWORD_FILE_SOURCE
        : options.codexApiKeyFile
          ? EXPLICIT_API_KEY_FILE_SOURCE
          : null))
    : null;
  if (
    providerConfiguration?.blocking_release_gate !== gatewayAccountRequested ||
    providerConfiguration?.requested !== providerCredentialRequested ||
    providerConfiguration?.credential_present !== providerCredentialRequested ||
    providerConfiguration?.credential_source !== expectedCredentialSource ||
    providerConfiguration?.manual_user_input_required !== false
  ) {
    throw new Error('Guest Provider configuration summary does not match the resolved host credential request');
  }
  if (
    !providerCredentialRequested &&
    (providerConfiguration.status !== 'not_requested' || providerConfiguration.mutation_performed !== false)
  ) {
    throw new Error('Guest release smoke must leave Provider configuration not_requested without credentials');
  }
  if (
    gatewayAccountRequested &&
    (providerConfiguration.status !== 'configured' ||
      providerConfiguration.mutation_performed !== true ||
      guestSummary.gateway_account_login?.schema !== 'opl_gateway_account_clean_vm_login.v1' ||
      guestSummary.gateway_account_login?.status !== 'passed' ||
      guestSummary.gateway_account_login?.login_submitted !== true ||
      guestSummary.gateway_account_login?.model_access_confirmed !== true ||
      guestSummary.gateway_account_login?.readback?.status !== 'connected' ||
      guestSummary.gateway_account_login?.readback?.connection_mode !== 'account' ||
      guestSummary.gateway_account_login?.readback?.managed_key_present !== true ||
      guestSummary.gateway_account_login?.readback?.freshness !== 'fresh')
  ) {
    throw new Error('Guest smoke did not prove fresh Gateway account login through the packaged FirstRun UI.');
  }
  const expectedOfficialRoots = officialProfileDesiredRoots();
  const officialProfile = guestSummary.official_profile_first_install;
  if (
    !options.bootstrapLaunchDiagnostics &&
    (officialProfile?.schema !== 'opl_official_profile_clean_vm_first_install.v1' ||
      officialProfile?.status !== 'passed' ||
      officialProfile?.restore_action_invoked !== false ||
      JSON.stringify(officialProfile?.desired_root_package_ids) !== JSON.stringify(expectedOfficialRoots) ||
      JSON.stringify(officialProfile?.installed_root_package_ids) !== JSON.stringify(expectedOfficialRoots))
  ) {
    throw new Error('Guest clean-VM smoke did not prove Official Profile first-install convergence.');
  }
  if (options.runtimeProfile === 'full' && !options.bootstrapLaunchDiagnostics) {
    const proof = guestSummary.temporal_service_supervisor_proof;
    if (
      proof?.schema !== 'opl_temporal_service_supervisor_proof.v1' ||
      proof?.status !== 'passed' ||
      proof?.applicable !== true ||
      proof?.required !== true ||
      proof?.initial_readback?.supervisor?.ready !== true ||
      proof?.keep_alive_recovery?.readback?.supervisor?.ready !== true ||
      proof?.restart_readback?.supervisor?.ready !== true ||
      proof?.session_reload?.readback?.supervisor?.ready !== true ||
      proof?.persistent_database?.sqlite_header_valid !== true ||
      proof?.persistent_database?.same_file_after_keep_alive_recovery !== true ||
      proof?.persistent_database?.same_file_after_restart !== true ||
      proof?.persistent_database?.same_file_after_session_reload !== true
    ) {
      throw new Error('Guest Full smoke did not prove the required Temporal service supervisor lifecycle.');
    }
  }
  if (options.requireGatekeeper) {
    const gatekeeper = guestSummary.gatekeeper_launch_policy;
    if (
      gatekeeper?.status !== 'passed' ||
      gatekeeper?.gatekeeper_required !== true ||
      gatekeeper?.quarantine_removal_required !== false ||
      gatekeeper?.quarantine_mutation_performed !== false ||
      gatekeeper?.codesign?.status !== 0 ||
      gatekeeper?.spctl?.status !== 0
    ) {
      throw new Error('Guest production smoke did not prove unmodified Gatekeeper acceptance.');
    }
  }
  if (isHomebrewFullCaskSmoke(options)) {
    const expectedRoots = officialProfileDesiredRoots();
    const gatekeeper = guestSummary.gatekeeper_launch_policy;
    const proof = guestSummary.homebrew_full_cask;
    if (
      guestSummary.install_origin !== 'homebrew_full_cask' ||
      gatekeeper?.status !== 'passed' ||
      gatekeeper?.gatekeeper_required !== true ||
      gatekeeper?.quarantine_removal_required !== false ||
      gatekeeper?.quarantine_mutation_performed !== false ||
      gatekeeper?.codesign?.status !== 0 ||
      gatekeeper?.spctl?.status !== 0
    ) {
      throw new Error('Guest Full Cask smoke did not prove unmodified Homebrew Gatekeeper acceptance.');
    }
    if (
      proof?.schema !== 'opl_homebrew_full_cask_smoke.v1' ||
      proof?.status !== 'passed' ||
      proof?.homebrew?.cask !== 'one-person-lab-full' ||
      proof?.homebrew?.cask_installed !== true ||
      proof?.homebrew?.formula_opl_installed_before !== false ||
      proof?.homebrew?.formula_opl_installed_after !== false ||
      proof?.carrier?.selected_carrier !== 'packaged_full_runtime' ||
      proof?.carrier?.source !== 'packaged_app_resource' ||
      proof?.carrier?.active_framework_count !== 1 ||
      proof?.official_profile?.restore_action_invoked !== false ||
      JSON.stringify(proof?.official_profile?.desired_root_package_ids) !== JSON.stringify(expectedRoots) ||
      JSON.stringify(proof?.official_profile?.installed_root_package_ids) !== JSON.stringify(expectedRoots)
    ) {
      throw new Error('Guest Full Cask smoke did not prove embedded Base and Official Profile convergence.');
    }
  }
  const standardCaskProfile = matchingHomebrewCaskCandidateProfile(options);
  if (standardCaskProfile?.formulaPolicy === 'required') {
    const expectedRoots = officialProfileDesiredRoots();
    const expectedOrigin =
      standardCaskProfile.caskToken === 'one-person-lab-nightly' ? 'homebrew_nightly_cask' : 'homebrew_standard_cask';
    const expectedChannel = standardCaskProfile.caskToken === 'one-person-lab-nightly' ? 'nightly' : 'stable';
    const proof = guestSummary.homebrew_standard_cask;
    if (
      guestSummary.install_origin !== expectedOrigin ||
      proof?.schema !== 'opl_homebrew_standard_cask_smoke.v1' ||
      proof?.status !== 'passed' ||
      proof?.channel !== expectedChannel ||
      proof?.homebrew?.cask !== standardCaskProfile.caskToken ||
      proof?.homebrew?.cask_installed !== true ||
      proof?.homebrew?.formula_opl_installed_after !== true ||
      proof?.carrier?.selected_carrier !== 'homebrew_formula_opl' ||
      proof?.carrier?.active_framework_count !== 1 ||
      proof?.official_profile?.restore_action_invoked !== false ||
      JSON.stringify(proof?.official_profile?.desired_root_package_ids) !== JSON.stringify(expectedRoots) ||
      JSON.stringify(proof?.official_profile?.installed_root_package_ids) !== JSON.stringify(expectedRoots)
    ) {
      throw new Error('Guest Standard Cask smoke did not prove Formula opl and Official Profile convergence.');
    }
  }
  if (options.bootstrapLaunchDiagnostics) {
    if (guestSummary.diagnostic_scope !== 'bootstrap_launch_diagnostics') {
      throw new Error('Guest smoke did not run bootstrap launch diagnostics.');
    }
    if (guestSummary.bootstrap_launch_diagnostics?.status !== 'passed') {
      throw new Error('Guest bootstrap launch diagnostics did not pass.');
    }
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
      !REQUIRED_ASSISTANT_ROUTE_IDS.every((assistantId) => assistantIds.includes(assistantId))
    ) {
      throw new Error('Guest assistant route smoke summary did not record the required App package route ids.');
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
  assertGuestSmokeSummary(options, guestSummary, options.artifacts);
  const summary = {
    surface_id: 'opl_tart_gui_first_run_smoke',
    status: 'passed',
    smoke_profile: options.smokeProfile,
    vm_name: options.vmName,
    source_vm: options.sourceVm,
    display: options.display,
    runtime_profile: options.runtimeProfile,
    require_codex_config_wizard: options.requireCodexConfigWizard,
    bootstrap_launch_diagnostics: options.bootstrapLaunchDiagnostics,
    framework_source_archive: frameworkSourceArchivePlan(options),
    codex_install_preseed: codexInstallPreseedPlan(options),
    timeouts: {
      vm_boot_and_ssh_ms: options.timeoutMs,
      guest_smoke_ms: options.smokeTimeoutMs,
      codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
      codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
    },
    guest_ip: ip,
    guest_artifacts: guestArtifactDir,
    host_artifacts: options.artifacts,
    codex_config_wizard_seen: guestSummary?.codex_config_wizard_seen ?? null,
    codex_config_wizard_submitted: guestSummary?.codex_config_wizard_submitted ?? null,
    codex_api_key_present: guestSummary?.codex_api_key_present ?? null,
    provider_configuration: guestSummary?.provider_configuration ?? null,
    provider_credential_resolution: options.providerCredentialResolution ?? null,
    diagnostic_scope: guestSummary?.diagnostic_scope ?? null,
    bootstrap_launch_diagnostics_result: guestSummary?.bootstrap_launch_diagnostics ?? null,
    labels: guestSummary?.labels ?? [],
    settings_smoke: guestSummary?.settings_smoke ?? null,
    assistant_route_smoke: guestSummary?.assistant_route_smoke ?? null,
    codex_functional_check: guestSummary?.codex_functional_check ?? null,
    codex_ai_self_check: guestSummary?.codex_ai_self_check ?? null,
    computer_use_qualification: guestSummary?.computer_use_qualification ?? null,
    temporal_service_supervisor_proof: guestSummary?.temporal_service_supervisor_proof ?? null,
    guest_node_staging: runtimeState.guestNodeStaging,
    homebrew_install_attempts: runtimeState.homebrewInstallAttempts,
    vm_cleanup: runtimeState.vmCleanupReceipt,
    stage_timing: buildStageTimingSummary(runtimeState.stageEvents),
    guest_summary: guestSummary,
    installed_framework_source_identity: guestSummary?.installed_framework_source_identity ?? null,
    full_runtime_source_identity: guestSummary?.full_runtime_source_identity ?? null,
  };
  fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function writeFailedSummary(
  options,
  ip,
  guestArtifactDir,
  error,
  { primaryError = null, artifactPullError = null, cleanupError = null } = {}
) {
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
    bootstrap_launch_diagnostics: options.bootstrapLaunchDiagnostics,
    framework_source_archive: frameworkSourceArchivePlan(options),
    codex_install_preseed: codexInstallPreseedPlan(options),
    timeouts: {
      vm_boot_and_ssh_ms: options.timeoutMs,
      guest_smoke_ms: options.smokeTimeoutMs,
      codex_install_phase_ms: options.codexInstallPhaseTimeoutMs,
      codex_readiness_phase_ms: options.codexReadinessPhaseTimeoutMs,
    },
    guest_ip: ip || null,
    guest_artifacts: guestArtifactDir || null,
    host_artifacts: options.artifacts,
    copied_guest_artifacts: runtimeState.copiedArtifacts,
    codex_config_wizard_seen: guestSummary?.codex_config_wizard_seen ?? null,
    codex_config_wizard_submitted: guestSummary?.codex_config_wizard_submitted ?? null,
    provider_configuration: guestSummary?.provider_configuration ?? null,
    provider_credential_resolution: options.providerCredentialResolution ?? null,
    diagnostic_scope: guestSummary?.diagnostic_scope ?? null,
    bootstrap_launch_diagnostics_result: guestSummary?.bootstrap_launch_diagnostics ?? null,
    labels: guestSummary?.labels ?? [],
    settings_smoke: guestSummary?.settings_smoke ?? null,
    assistant_route_smoke: guestSummary?.assistant_route_smoke ?? null,
    codex_functional_check: guestSummary?.codex_functional_check ?? null,
    codex_ai_self_check: guestSummary?.codex_ai_self_check ?? null,
    computer_use_qualification: guestSummary?.computer_use_qualification ?? null,
    temporal_service_supervisor_proof: guestSummary?.temporal_service_supervisor_proof ?? null,
    guest_node_staging: runtimeState.guestNodeStaging,
    homebrew_install_attempts: runtimeState.homebrewInstallAttempts,
    error_classification: summarizeError(error),
    primary_error: primaryError ? summarizeError(primaryError) : null,
    artifact_pull_error: artifactPullError ? summarizeError(artifactPullError) : null,
    cleanup_error: cleanupError ? summarizeError(cleanupError) : null,
    vm_cleanup: runtimeState.vmCleanupReceipt,
    stage_timing: buildStageTimingSummary(runtimeState.stageEvents),
    guest_summary: guestSummary,
  };
  fs.writeFileSync(path.join(options.artifacts, 'tart-smoke-summary.json'), JSON.stringify(summary, null, 2));
}

function writeTerminalSummary(options, ip, guestArtifactDir, dependencies = {}) {
  const writeSuccessSummary = dependencies.writeSuccessSummary ?? writeSummary;
  setStage('write_summary');
  try {
    writeSuccessSummary(options, ip, guestArtifactDir);
  } catch (error) {
    const failure = cleanupActionFailure(error, 'write_summary_failure');
    appendRuntimeLog(
      `write_summary_failed code=${failure.code ?? 'none'} path=${failure.path ?? 'none'} message=${failure.message}`
    );
    throw writeTerminalFailureSummary(options, ip, guestArtifactDir, error, {}, dependencies);
  }
}

function writeTerminalFailureSummary(
  options,
  ip,
  guestArtifactDir,
  terminalError,
  failureContext = {},
  dependencies = {}
) {
  const writeFailureSummary = dependencies.writeFailureSummary ?? writeFailedSummary;
  try {
    writeFailureSummary(options, ip, guestArtifactDir, terminalError, failureContext);
  } catch (error) {
    const failure = cleanupActionFailure(error, 'write_failed_summary_failure');
    appendRuntimeLog(
      `write_failed_summary_failed code=${failure.code ?? 'none'} path=${failure.path ?? 'none'} message=${failure.message}`
    );
  }
  return terminalError;
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
  let primaryError = null;
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
    const guestCodexApiKeyPath = codexApiKeyFile ? `${options.guestWorkdir}/codex-api-key.txt` : null;
    const guestGatewayAccountEmailPath = options.gatewayAccountEmailFile
      ? `${options.guestWorkdir}/${path.basename(options.gatewayAccountEmailFile)}`
      : null;
    const guestGatewayAccountPasswordPath = options.gatewayAccountPasswordFile
      ? `${options.guestWorkdir}/${path.basename(options.gatewayAccountPasswordFile)}`
      : null;
    setStage('prepare_guest_workdir');
    await ssh(
      options,
      ip,
      `rm -rf ${shellQuote(options.guestWorkdir)} && mkdir -p ${shellQuote(options.guestWorkdir)}`
    );
    setStage('copy_inputs_to_guest');
    const guestFrameworkArchivePath = guestFrameworkSourceArchivePath(options);
    const guestFrameworkInstallerPath = guestFrameworkInstallScriptPath(options);
    const guestInputs = [resolveGuestSmokeScriptPath()];
    if (codexApiKeyFile) guestInputs.push(codexApiKeyFile.path);
    if (options.gatewayAccountEmailFile) guestInputs.push(options.gatewayAccountEmailFile);
    if (options.gatewayAccountPasswordFile) guestInputs.push(options.gatewayAccountPasswordFile);
    if (options.compiledExpectations) guestInputs.push(options.compiledExpectations);
    if (options.dmg) guestInputs.unshift(options.dmg);
    if (options.codexPackageTarball) guestInputs.push(options.codexPackageTarball);
    if (options.codexPlatformPackageTarball) guestInputs.push(options.codexPlatformPackageTarball);
    if (options.frameworkSourceArchive) guestInputs.push(options.frameworkSourceArchive);
    if (options.frameworkInstallScript) guestInputs.push(options.frameworkInstallScript);
    if (options.homebrewCaskFile) guestInputs.push(options.homebrewCaskFile);
    await scpToGuest(options, ip, guestInputs, options.guestWorkdir);
    if (options.codexNpmCacheDir) {
      setStage('copy_codex_npm_cache_dir');
      await copyCodexNpmCacheDirToGuest(options, ip);
    }
    if (options.masStudyProvisioningWorkspace) {
      setStage('copy_mas_provisioning_workspace');
      await copyMasProvisioningWorkspaceToGuest(options, ip);
    }
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
      setStage('prepare_homebrew_toolchain');
      await sshWithRunOptions(options, ip, guestHomebrewBootstrapCommand(), {
        label: `ssh prepare_homebrew_toolchain ${options.guestUser}@${ip}`,
        timeoutMs: options.timeoutMs,
      });
      setStage('homebrew_cask_install');
      await installHomebrewCaskWithRetry(options, ip);
    }
    setStage('run_guest_smoke');
    const guestHostTimeoutMs = guestSmokeHostTimeoutMs(options);
    const guestHostDeadlineEpochMs = guestSmokeHostDeadlineEpochMs(options);
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
        guestFrameworkInstallerPath,
        guestHostDeadlineEpochMs,
        guestGatewayAccountEmailPath,
        guestGatewayAccountPasswordPath
      ),
      {
        label: `ssh run_guest_smoke ${options.guestUser}@${ip}`,
        timeoutMs: guestHostTimeoutMs,
      }
    );
    setStage('copy_guest_artifacts');
    await scpFromGuest(options, ip, guestArtifactDir, options.artifacts);
    copiedArtifacts = true;
    runtimeState.copiedArtifacts = true;
    setStage('validate_guest_summary');
    assertGuestSmokeSummary(options, readGuestSmokeSummary(options.artifacts), options.artifacts);
  } catch (error) {
    primaryError = error;
  }

  runtimeState.ip = ip;
  runtimeState.guestArtifactDir = guestArtifactDir;
  runtimeState.copiedArtifacts = copiedArtifacts || runtimeState.copiedArtifacts;
  const cleanupResult = await cleanupRuntime({ copyGuestArtifacts: true, reason: 'finally' });
  const terminalError = selectFirstRunTartTerminalError(
    primaryError,
    cleanupResult.artifactPullError,
    cleanupResult.cleanupError
  );
  if (terminalError) {
    throw writeTerminalFailureSummary(options, ip, guestArtifactDir, terminalError, {
      primaryError,
      artifactPullError: cleanupResult.artifactPullError,
      cleanupError: cleanupResult.cleanupError,
    });
  }
  writeTerminalSummary(options, ip, guestArtifactDir);
}

function selectFirstRunTartTerminalError(primaryError, artifactPullError, cleanupError) {
  return primaryError || artifactPullError || cleanupError || null;
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
        assertGuestReleaseSourceIdentity,
        __resetRuntimeStateForTest: resetRuntimeStateForTest,
        __setRuntimeStateForTest: setRuntimeStateForTest,
        buildStageTimingSummary,
        codexInstallPreseedPlan,
        buildDryRunPlan,
        frameworkInstallScriptFinalizeCommand,
        frameworkSourceArchivePlan,
        guestCodexNpmCacheDir,
        guestCodexPlatformPackageTarballPath,
        guestCodexPackageTarballPath,
        guestFrameworkSourceArchivePath,
        guestHomebrewBootstrapCommand,
        guestHomebrewInstallCommand,
        guestNodeStagingPlan,
        guestSmokeHostDeadlineEpochMs,
        installHomebrewCaskWithRetry,
        isRetryableHomebrewInstallError,
        guestSmokeHostTimeoutMs,
        guestSmokeCommand,
        prepareHostCodexApiKeyFile,
        resolveHostCodexProviderCredential,
        copyMasProvisioningWorkspaceToGuest,
        homebrewTrustedCaskRefs,
        isHomebrewFullCaskSmoke,
        isMainModule,
        officialProfileDesiredRoots,
        parseArgs,
        readPublishedArtifactExpectedFrameworkSha,
        resolveMasProvisioningTransport,
        recordStageEvent,
        resolveGuestSmokeScriptPath,
        runAsync,
        cleanupRuntime,
        selectFirstRunTartTerminalError,
        stopAndDeleteVm,
        writeInterruptedSummary,
        writeFailedSummary,
        writeTerminalFailureSummary,
        writeTerminalSummary,
        writeVmCleanupReceipt,
        writeSummary,
      }
    : undefined;

if (isMainModule(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

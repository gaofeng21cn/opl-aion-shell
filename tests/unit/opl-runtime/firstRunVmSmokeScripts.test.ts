import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.NODE_ENV = 'test';

import { __test as tartSmoke } from '../../../scripts/opl-first-run-tart-smoke.mjs';
import { __test as vmSmoke } from '../../../scripts/opl-first-run-vm-smoke.mjs';

function writeFile(filePath: string, content: string, mode?: number) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  if (mode) fs.chmodSync(filePath, mode);
}

function fullMasProvisioningTransportArgs(guestWorkdir = '/tmp/opl-first-run-smoke') {
  const workspace = path.join(guestWorkdir, 'mas-provisioned-workspace');
  return [
    '--mas-study-provisioning-workspace',
    workspace,
    '--mas-study-provisioning-receipt',
    path.join(workspace, 'studies', 'qualification-study', 'provisioning-receipt.json'),
  ];
}

function runStableInstallerFixture(options: { args?: string[]; standardHttpCode?: string } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stable-installer-'));
  const binDir = path.join(root, 'bin');
  const curlLog = path.join(root, 'curl.log');
  const appPath = path.join(root, 'Applications', 'One Person Lab.app');
  const installerPath = path.join(process.cwd(), 'resources', 'opl-install.sh');
  const tag = 'v26.7.20-r1';
  const version = tag.slice(1);
  const standardName = `One-Person-Lab-${version}-mac-arm64.dmg`;
  const standardBytes = 'standard-dmg\n';
  const installerBytes = fs.readFileSync(installerPath);
  const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
  const assetUrl = (name: string) =>
    `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/${name}`;
  const componentManifest = {
    surface_kind: 'opl_app_component_manifest.v1',
    component_id: 'opl-app',
    version,
    release_tag: tag,
    release_url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/${tag}`,
    component_manifest_ref: assetUrl('opl-app-component-manifest.json'),
    component_manifest_digest: `sha256:${'a'.repeat(64)}`,
    primary_artifact: {
      name: standardName,
      digest: `sha256:${sha256(standardBytes)}`,
    },
    artifacts: [
      { name: standardName, digest: `sha256:${sha256(standardBytes)}`, ref: assetUrl(standardName) },
      {
        name: 'opl-install.sh',
        digest: `sha256:${sha256(installerBytes)}`,
        size: installerBytes.length,
        ref: assetUrl('opl-install.sh'),
      },
    ],
  };
  const manifestBytes = `${JSON.stringify(componentManifest)}\n`;
  const releaseRecord = {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: standardName,
        digest: `sha256:${sha256(standardBytes)}`,
        size: Buffer.byteLength(standardBytes),
        browser_download_url: assetUrl(standardName),
      },
      {
        name: 'opl-app-component-manifest.json',
        digest: `sha256:${sha256(manifestBytes)}`,
        size: Buffer.byteLength(manifestBytes),
        browser_download_url: assetUrl('opl-app-component-manifest.json'),
      },
      {
        name: 'opl-install.sh',
        digest: `sha256:${sha256(installerBytes)}`,
        size: installerBytes.length,
        browser_download_url: assetUrl('opl-install.sh'),
      },
    ],
  };
  const releaseRecordPath = path.join(root, 'github-release.json');
  const componentManifestPath = path.join(root, 'opl-app-component-manifest.json');
  const standardDmgPath = path.join(root, standardName);
  fs.writeFileSync(releaseRecordPath, `${JSON.stringify(releaseRecord)}\n`);
  fs.writeFileSync(componentManifestPath, manifestBytes);
  fs.writeFileSync(standardDmgPath, standardBytes);
  writeFile(
    path.join(binDir, 'uname'),
    '#!/usr/bin/env bash\nif [ "${1:-}" = "-m" ]; then printf "arm64\\n"; else printf "Darwin\\n"; fi\n',
    0o755
  );
  writeFile(
    path.join(binDir, 'plutil'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] !== '-extract' || !['raw', 'json'].includes(args[2]) || args[3] !== '-o' || args[4] !== '-') process.exit(2);
let value = JSON.parse(fs.readFileSync(args[5], 'utf8'));
for (const part of args[1].split('.')) {
  if (value == null || !(part in value)) process.exit(1);
  value = value[part];
}
if (args[2] === 'raw' && value === null) process.exit(1);
process.stdout.write(args[2] === 'json' ? JSON.stringify(value) : String(value));
`,
    0o755
  );
  writeFile(
    path.join(binDir, 'curl'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'output=""',
      'url=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    -o) shift; output="$1" ;;',
      '    https://*) url="$1" ;;',
      '  esac',
      '  shift',
      'done',
      'printf "%s\\n" "$url" >> "$OPL_TEST_CURL_LOG"',
      'case "$url" in',
      '  https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/*)',
      '    cp "$OPL_TEST_RELEASE_RECORD" "$output"',
      '    ;;',
      '  */opl-app-component-manifest.json)',
      '    cp "$OPL_TEST_COMPONENT_MANIFEST" "$output"',
      '    printf "200"',
      '    ;;',
      `  */${standardName})`,
      '    if [ "${OPL_TEST_STANDARD_HTTP_CODE:-200}" != "200" ]; then',
      '      printf "%s" "$OPL_TEST_STANDARD_HTTP_CODE"',
      '      exit 22',
      '    fi',
      '    cp "$OPL_TEST_STANDARD_DMG" "$output"',
      '    printf "200"',
      '    ;;',
      '  *)',
      '    printf "Unexpected URL: %s\\n" "$url" >&2',
      '    exit 97',
      '    ;;',
      'esac',
      '',
    ].join('\n'),
    0o755
  );
  writeFile(
    path.join(binDir, 'hdiutil'),
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [ "${1:-}" = "attach" ]; then',
      '  mount_dir=""',
      '  while [ "$#" -gt 0 ]; do',
      '    if [ "$1" = "-mountpoint" ]; then shift; mount_dir="$1"; fi',
      '    shift',
      '  done',
      '  mkdir -p "$mount_dir/One Person Lab.app"',
      'fi',
      '',
    ].join('\n'),
    0o755
  );
  writeFile(path.join(binDir, 'ditto'), '#!/usr/bin/env bash\ncp -R "$1" "$2"\n', 0o755);
  writeFile(
    path.join(binDir, 'xattr'),
    '#!/usr/bin/env bash\nif [ "${1:-}" = "-p" ]; then exit 1; fi\nexit 0\n',
    0o755
  );
  for (const command of ['codesign', 'spctl', 'open']) {
    writeFile(path.join(binDir, command), '#!/usr/bin/env bash\nexit 0\n', 0o755);
  }

  const result = spawnSync(
    '/bin/bash',
    [
      installerPath,
      '--stable-macos-install',
      '--release-tag',
      'v26.7.20-r1',
      '--no-open',
      '--yes',
      ...(options.args ?? []),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        OPL_LOCAL_APP_PATH: appPath,
        OPL_TEST_CURL_LOG: curlLog,
        OPL_TEST_RELEASE_RECORD: releaseRecordPath,
        OPL_TEST_COMPONENT_MANIFEST: componentManifestPath,
        OPL_TEST_STANDARD_DMG: standardDmgPath,
        OPL_TEST_STANDARD_HTTP_CODE: options.standardHttpCode ?? '200',
      },
    }
  );
  const curlUrls = fs.existsSync(curlLog) ? fs.readFileSync(curlLog, 'utf8').trim().split('\n').filter(Boolean) : [];
  const appInstalled = fs.existsSync(appPath);
  fs.rmSync(root, { recursive: true, force: true });
  return { result, curlUrls, appInstalled };
}

function writeRuntimeToolShim(runtimeHome: string, command: string, output: string) {
  if (process.platform === 'win32') {
    writeFile(path.join(runtimeHome, 'bin', command), `#!/usr/bin/env bash\necho "${output}"\n`, 0o755);
    writeFile(path.join(runtimeHome, 'bin', `${command}.cmd`), `@echo off\r\necho ${output}\r\n`, 0o755);
    return;
  }
  writeFile(path.join(runtimeHome, 'bin', command), `#!/usr/bin/env bash\necho "${output}"\n`, 0o755);
}

function createReadySystemInitialize() {
  return JSON.stringify({
    system_initialize: {
      setup_flow: {
        ready_to_launch: true,
        blocking_items: [],
      },
      readiness: {
        launch_ready: true,
        core_ready: true,
        domain_ready: true,
      },
      recommended_skills: {
        skills: [],
      },
    },
  });
}

function createPassedAssistantRouteSmokeSummary(assistantIds = ['mas', 'mag', 'rca']) {
  return {
    status: 'passed',
    assistants: assistantIds,
  };
}

function createPassedComputerUseQualification(runtimeProfile: string) {
  const tools = Array.from({ length: 10 }, (_, index) => `tool-${index}`);
  return {
    schema: 'opl_computer_use_qualification.v1',
    status: 'passed',
    runtime_profile: runtimeProfile,
    provider_id: 'kimi-cu',
    product_name: 'KimiCU',
    version: '0.5.4',
    source_ref: 'one-person-lab-app/contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu',
    source_sha256: 'a'.repeat(64),
    state: {
      installed: true,
      registered: true,
      enabled: true,
      permission: 'granted',
      ready: true,
      status: 'ready',
    },
    bundle: {
      path: '/Applications/KimiCU.app',
      executable: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
      bundle_id: 'ai.kimi.cu',
      version: '0.5.4',
      team_id: '2J9472RW75',
      architecture: 'arm64',
      identity_verified: true,
    },
    mcp: {
      server_id: 'kimi-cu',
      registered: true,
      enabled: true,
      config_path: '/Users/opl-test/.codex/config.toml',
      tools_exact: true,
      required_tools: tools,
      observed_tools: tools.toReversed(),
      functional_probe: {
        tool_name: 'list_apps',
        called: true,
        passed: true,
        result_kind: 'content',
      },
    },
    service: { registered: true, xpc_ping: 'passed' },
    permissions: { accessibility: 'granted', screen_recording: 'granted' },
    acceptance: {
      lifecycle_ready: true,
      projection_identity_bound: true,
      bundle_identity_verified: true,
      service_ready: true,
      mcp_10_tools_exact: true,
      mcp_list_apps_call_passed: true,
      codex_backend_configured: true,
      permission_details_valid: true,
      permission_projection_consistent: true,
      ready_consistent: true,
      standard_full_same_logic: true,
    },
  };
}

function createPassedTemporalServiceSupervisorProof() {
  const readySupervisor = { ready: true };
  return {
    schema: 'opl_temporal_service_supervisor_proof.v1',
    status: 'passed',
    applicable: true,
    required: true,
    initial_readback: { supervisor: readySupervisor },
    keep_alive_recovery: { readback: { supervisor: readySupervisor } },
    restart_readback: { supervisor: readySupervisor },
    session_reload: { readback: { supervisor: readySupervisor } },
    persistent_database: {
      sqlite_header_valid: true,
      same_file_after_keep_alive_recovery: true,
      same_file_after_restart: true,
      same_file_after_session_reload: true,
    },
  };
}

function createPassedHomebrewFullCaskProof(desiredRoots: string[]) {
  return {
    schema: 'opl_homebrew_full_cask_smoke.v1',
    status: 'passed',
    homebrew: {
      cask: 'one-person-lab-full',
      cask_installed: true,
      formula_opl_installed_before: false,
      formula_opl_installed_after: false,
    },
    carrier: {
      selected_carrier: 'packaged_full_runtime',
      source: 'packaged_app_resource',
      active_framework_count: 1,
    },
    official_profile: {
      desired_root_package_ids: desiredRoots,
      installed_root_package_ids: desiredRoots,
      restore_action_invoked: false,
    },
  };
}

function createPassedOfficialProfileFirstInstall() {
  const desiredRoots = tartSmoke.officialProfileDesiredRoots();
  return {
    schema: 'opl_official_profile_clean_vm_first_install.v1',
    status: 'passed',
    restore_action_invoked: false,
    desired_root_package_ids: desiredRoots,
    installed_root_package_ids: desiredRoots,
  };
}

function createPassedGatewayAccountLogin() {
  return {
    schema: 'opl_gateway_account_clean_vm_login.v1',
    status: 'passed',
    login_submitted: true,
    model_access_confirmed: true,
    readback: {
      status: 'connected',
      connection_mode: 'account',
      managed_key_present: true,
      freshness: 'fresh',
    },
  };
}

function assertGuestSmokeSummary(options: Record<string, unknown>, summary: Record<string, unknown>): void {
  const gatewayAccountRequested = Boolean(options.gatewayAccountEmailFile && options.gatewayAccountPasswordFile);
  const requested = Boolean(gatewayAccountRequested || options.providerCredentialPresent || options.codexApiKeyFile);
  const source = requested
    ? options.providerCredentialSource ||
      (gatewayAccountRequested
        ? 'gateway_account_password_file'
        : options.codexApiKeyFile
          ? 'explicit_api_key_file'
          : null)
    : null;
  tartSmoke.assertGuestSmokeSummary(options, {
    provider_configuration: {
      status: gatewayAccountRequested ? 'configured' : requested ? 'requested' : 'not_requested',
      requested,
      credential_source: source,
      credential_present: requested,
      provider_base_url_matches_host: options.codexProviderBaseUrl ? true : null,
      manual_user_input_required: false,
      mutation_performed: gatewayAccountRequested,
      blocking_release_gate: gatewayAccountRequested,
    },
    computer_use_qualification: createPassedComputerUseQualification(String(options.runtimeProfile)),
    gateway_account_login: gatewayAccountRequested ? createPassedGatewayAccountLogin() : null,
    official_profile_first_install: createPassedOfficialProfileFirstInstall(),
    ...summary,
  });
}

function writeRuntimeModule(
  runtimeHome: string,
  input: {
    moduleId: string;
    repoName: string;
    modulePath: string;
    payloadPaths: string[];
  }
) {
  const moduleRoot = path.join(runtimeHome, input.modulePath);
  writeFile(
    path.join(moduleRoot, 'opl-runtime-module.json'),
    `${JSON.stringify({ packaged_runtime: true, module_id: input.moduleId, repo_name: input.repoName })}\n`
  );
  for (const payloadPath of input.payloadPaths) {
    fs.mkdirSync(path.join(moduleRoot, payloadPath), { recursive: true });
  }
}

function writeDomainPlugin(runtimeHome: string, input: { modulePath: string; pluginName: string; skillId: string }) {
  const pluginRoot = path.join(runtimeHome, input.modulePath, 'plugins', input.pluginName);
  writeFile(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    `${JSON.stringify({ name: input.pluginName, skills: './skills/' })}\n`
  );
  writeFile(path.join(pluginRoot, 'skills', input.skillId, 'SKILL.md'), `# ${input.skillId}\n`);
}

function createFullRuntimeEquivalenceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-equivalence-'));
  const codexHome = path.join(root, 'codex-home');
  const runtimeHome = path.join(root, 'runtime', 'current');
  for (const moduleFixture of [
    {
      moduleId: 'medautoscience',
      repoName: 'med-autoscience',
      modulePath: path.join('modules', 'mas'),
      payloadPaths: ['agent', 'plugins'],
    },
    {
      moduleId: 'medautogrant',
      repoName: 'med-autogrant',
      modulePath: path.join('modules', 'mag'),
      payloadPaths: ['agent', 'plugins'],
    },
    {
      moduleId: 'redcube',
      repoName: 'redcube-ai',
      modulePath: path.join('modules', 'rca'),
      payloadPaths: ['agent', 'plugins'],
    },
    {
      moduleId: 'oplmetaagent',
      repoName: 'opl-meta-agent',
      modulePath: path.join('modules', 'meta-agent'),
      payloadPaths: [],
    },
    {
      moduleId: 'oplbookforge',
      repoName: 'opl-bookforge',
      modulePath: path.join('modules', 'bookforge'),
      payloadPaths: ['contracts'],
    },
  ]) {
    writeRuntimeModule(runtimeHome, moduleFixture);
  }
  for (const payloadPath of [
    path.join('contracts', 'action_catalog.json'),
    path.join('contracts', 'domain_descriptor.json'),
    path.join('contracts', 'foundry_provider.json'),
    path.join('contracts', 'pack_compiler_input.json'),
    path.join('agent', 'stages', 'manifest.json'),
    path.join('agent', 'primary_skill', 'SKILL.md'),
  ]) {
    writeFile(path.join(runtimeHome, 'modules', 'meta-agent', payloadPath), '{}\n');
  }
  for (const pluginFixture of [
    { modulePath: path.join('modules', 'mas'), pluginName: 'med-autoscience', skillId: 'med-autoscience' },
    { modulePath: path.join('modules', 'mag'), pluginName: 'med-autogrant', skillId: 'med-autogrant' },
    { modulePath: path.join('modules', 'rca'), pluginName: 'redcube-ai', skillId: 'redcube-ai' },
  ]) {
    writeDomainPlugin(runtimeHome, pluginFixture);
  }
  writeRuntimeToolShim(runtimeHome, 'officecli', 'officecli 1.0.0');
  writeRuntimeToolShim(runtimeHome, 'mineru-open-api', 'mineru-open-api version 1.0.0');
  return { root, codexHome, runtimeHome };
}

function createPackagedFullRuntimeAppFixture(frameworkSha = 'a'.repeat(40)) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-full-app-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const payloadRoot = path.join(appPath, 'Contents', 'Resources', 'opl-full-runtime');
  const runtimeHome = path.join(payloadRoot, 'runtime', 'current');
  const runtimeKey = `${process.platform}-${process.arch}`;
  const managedResourcesRoot = path.join(
    appPath,
    'Contents',
    'Resources',
    'bundled-aioncore',
    runtimeKey,
    'managed-resources'
  );
  const codexRoot = `cli/codex/0.146.0/${runtimeKey}`;
  const codexExecutable = 'vendor/bin/codex';
  const codexPath = path.join(managedResourcesRoot, codexRoot, codexExecutable);
  fs.mkdirSync(path.join(runtimeHome, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(payloadRoot, 'manifest'), { recursive: true });
  writeFile(codexPath, '#!/usr/bin/env bash\nprintf "codex 0.146.0\\n"\n', 0o755);
  writeFile(
    path.join(managedResourcesRoot, 'manifest.json'),
    `${JSON.stringify({
      clis: [
        {
          name: 'codex',
          platformDirectory: runtimeKey,
          root: codexRoot,
          executable: codexExecutable,
        },
      ],
    })}\n`
  );
  writeFile(
    path.join(payloadRoot, 'manifest', 'full-package-manifest.json'),
    `${JSON.stringify({
      manifest_version: 2,
      version: '26.6.21',
      components: { opl: { git_commit: frameworkSha } },
      resolved_refs: { opl_framework: { resolved_commit: frameworkSha } },
    })}\n`
  );
  return { root, appPath, runtimeHome, codexPath };
}

function installedFrameworkAppState(frameworkSha = 'b'.repeat(40)) {
  return {
    app_state: {
      release: {
        opl_framework_revision: frameworkSha,
        framework_revision: frameworkSha,
        framework_revision_source: 'installed_source_identity',
        installed_framework_source_sha: frameworkSha,
        installed_framework_source_identity_source: 'source_archive_url',
        installed_framework_source_identity: {
          schema: 'opl_framework_installed_source_identity.v1',
          framework_sha: frameworkSha,
          install_mode: 'archive',
          identity_source: 'source_archive_url',
        },
      },
    },
  };
}

function createPackagedAppWithMainEntry(content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-main-entry-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const mainEntryPath = path.join(appPath, 'Contents', 'Resources', 'app.asar', 'out', 'main', 'index.js');
  writeFile(mainEntryPath, content);
  return { root, appPath, mainEntryPath };
}

function createPackagedAppAsarArchive(content: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-packaged-main-asar-'));
  const appPath = path.join(root, 'One Person Lab.app');
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  writeFile(appAsarPath, content);
  return { root, appPath, appAsarPath };
}

describe('OPL first-run VM smoke scripts', () => {
  it('imports the release harness without a Shell node_modules tree', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-first-run-harness-cold-import-'));
    const scriptsDir = path.join(root, 'scripts');
    const source = path.join(process.cwd(), 'scripts', 'opl-first-run-tart-smoke.mjs');
    const target = path.join(scriptsDir, 'opl-first-run-tart-smoke.mjs');
    try {
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.copyFileSync(source, target);
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(target).href)})`],
        { encoding: 'utf8' }
      );
      expect(result.status, result.stderr).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('separates Full runtime equivalence from Codex-keyed core first-launch readiness', () => {
    expect(vmSmoke.shouldVerifyFullFirstRunEquivalence('standard')).toBe(false);
    expect(vmSmoke.shouldVerifyFullFirstRunEquivalence('full')).toBe(true);
    expect(
      vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'standard', requireCodexConfigWizard: false })
    ).toBe(false);
    expect(vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'full', requireCodexConfigWizard: false })).toBe(
      false
    );
    expect(
      vmSmoke.shouldWaitForFirstRunCompletion({ runtimeProfile: 'standard', requireCodexConfigWizard: true })
    ).toBe(false);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: true,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: false,
      })
    ).toBe(false);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: false,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: true,
      })
    ).toBe(true);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: false,
        runtimeProfile: 'full',
        requireCodexConfigWizard: false,
      })
    ).toBe(true);
    expect(
      vmSmoke.shouldWaitForCoreFirstLaunchReady({
        assertClean: true,
        runtimeProfile: 'standard',
        requireCodexConfigWizard: false,
        codexApiKeyFile: '/tmp/codex-api-key.txt',
      })
    ).toBe(true);
  });

  it('uses the packaged standard installer as the VM smoke bootstrap carrier', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-smoke-app-'));
    const appPath = path.join(appRoot, 'One Person Lab.app');
    const installerPath = path.join(appPath, 'Contents', 'Resources', 'opl-install.sh');
    writeFile(installerPath, '#!/usr/bin/env bash\nexit 0\n', 0o755);

    expect(vmSmoke.resolvePackagedStandardInstaller(appPath)).toBe(installerPath);
    expect(vmSmoke.buildStandardBootstrapCommand(installerPath)).toEqual({
      command: '/bin/bash',
      args: [installerPath, '--headless', '--skip-packages'],
      redactedCommand: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
    });
    expect(vmSmoke.resolvePackagedStandardInstaller(path.join(appRoot, 'Missing.app'))).toBeNull();
  });

  it('falls back to the same-tag Standard DMG only when the Release record lacks implicit Full', () => {
    const { result, curlUrls, appInstalled } = runStableInstallerFixture();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Full module is not appended to v26.7.20-r1');
    expect(curlUrls).toEqual([
      'https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/tags/v26.7.20-r1',
      'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.20-r1/opl-app-component-manifest.json',
      'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.20-r1/One-Person-Lab-26.7.20-r1-mac-arm64.dmg',
    ]);
    expect(appInstalled).toBe(true);
  }, 20_000);

  it('fails closed for an explicit missing Full module or a Standard download failure', () => {
    const explicitFull = runStableInstallerFixture({ args: ['--full'] });
    expect(explicitFull.result.status).not.toBe(0);
    expect(explicitFull.result.stderr).toContain('No same-tag Full module is published.');
    expect(explicitFull.curlUrls).toEqual([
      'https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/tags/v26.7.20-r1',
      'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.20-r1/opl-app-component-manifest.json',
    ]);
    expect(explicitFull.appInstalled).toBe(false);

    const downloadFailure = runStableInstallerFixture({ standardHttpCode: '500' });
    expect(downloadFailure.result.status).not.toBe(0);
    expect(downloadFailure.curlUrls).toEqual([
      'https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/tags/v26.7.20-r1',
      'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.20-r1/opl-app-component-manifest.json',
      'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.20-r1/One-Person-Lab-26.7.20-r1-mac-arm64.dmg',
    ]);
    expect(downloadFailure.appInstalled).toBe(false);
  }, 20_000);

  it('fails fast when the packaged App does not contain the main bootstrap fatal marker', () => {
    const current = createPackagedAppWithMainEntry(
      "console.log('aionui.main_bootstrap_fatal.v1');\nimport('./index-original.js');\n"
    );
    const old = createPackagedAppWithMainEntry("import('./index-original.js');\n");
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-marker-artifacts-'));
    try {
      expect(vmSmoke.detectPackagedMainBootstrap(current.appPath)).toMatchObject({
        schema: 'opl_packaged_app_bootstrap_marker.v1',
        app_path: current.appPath,
        app_asar_type: 'directory',
        main_entry_path: current.mainEntryPath,
        main_entry_present: true,
        fatal_marker: 'aionui.main_bootstrap_fatal.v1',
        fatal_marker_present: true,
      });
      expect(vmSmoke.assertPackagedMainBootstrap(current.appPath, artifacts)).toMatchObject({
        fatal_marker_present: true,
      });
      expect(vmSmoke.detectPackagedMainBootstrap(old.appPath)).toMatchObject({
        main_entry_present: true,
        fatal_marker_present: false,
      });
      expect(() => vmSmoke.assertPackagedMainBootstrap(old.appPath, artifacts)).toThrow(
        /main bootstrap fatal diagnostics marker/
      );
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'packaged-app-bootstrap-marker.json'), 'utf8'))
      ).toMatchObject({
        main_entry_present: true,
        fatal_marker_present: false,
      });
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
      fs.rmSync(old.root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('detects the main bootstrap fatal marker inside an archived app.asar file', () => {
    const current = createPackagedAppAsarArchive(
      `fake asar bytes before marker ${'aionui.main_bootstrap_fatal.v1'} after marker`
    );
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-marker-archive-artifacts-'));
    try {
      expect(vmSmoke.detectPackagedMainBootstrap(current.appPath)).toMatchObject({
        app_asar_path: current.appAsarPath,
        app_asar_present: true,
        app_asar_type: 'file',
        app_asar_size_bytes: expect.any(Number),
        main_entry_present: true,
        main_entry_size_bytes: null,
        main_entry_sha256: null,
        fatal_marker_present: true,
      });
      expect(vmSmoke.assertPackagedMainBootstrap(current.appPath, artifacts)).toMatchObject({
        app_asar_type: 'file',
        fatal_marker_present: true,
      });
    } finally {
      fs.rmSync(current.root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('resolves Full VM smoke commands from installed App packaged runtime resources', () => {
    const fixture = createPackagedFullRuntimeAppFixture();
    try {
      writeFile(
        path.join(fixture.runtimeHome, 'bin', 'opl'),
        '#!/usr/bin/env bash\nprintf \'{"ok":true,"args":["%s","%s","%s"]}\\n\' "$1" "$2" "$3"\n',
        0o755
      );

      const fullRuntime = vmSmoke.describePackagedFullRuntime(fixture.appPath);
      const command = vmSmoke.buildOplJsonShellCommand(['system', 'initialize', '--json'], {
        appPath: fixture.appPath,
        runtimeProfile: 'full',
      });
      const raw = vmSmoke.runOplJson(['system', 'initialize', '--json'], {
        appPath: fixture.appPath,
        runtimeProfile: 'full',
        timeoutMs: 10_000,
      });

      expect(fullRuntime).toMatchObject({
        status: 'found',
        runtime_home: fixture.runtimeHome,
        opl_path: path.join(fixture.runtimeHome, 'bin', 'opl'),
        missing_reason: null,
      });
      expect(
        vmSmoke.probeCodexCli({
          command: vmSmoke.resolvePackagedCodexCliForSmoke({
            appPath: fixture.appPath,
            runtimeProfile: 'full',
          }),
        })
      ).toMatchObject({
        command: fixture.codexPath,
        detected: true,
        version: 'codex 0.146.0',
      });
      expect(command.runtimeHome).toBe(fixture.runtimeHome);
      expect(command.fullRuntime).toMatchObject({
        source: 'packaged_app_resource',
        runtime_home: fixture.runtimeHome,
      });
      expect(command.command).toContain(path.join(fixture.runtimeHome, 'bin', 'opl'));
      expect(command.command).toContain(`export OPL_CODEX_BIN='${fixture.codexPath}'`);
      expect(command.command).toContain(`export OPL_CODEX_PLUGIN_BIN='${fixture.codexPath}'`);
      expect(command.command).toContain('system');
      expect(command.command).not.toContain('command -v opl');
      expect(JSON.parse(raw)).toEqual({
        ok: true,
        args: ['system', 'initialize', '--json'],
      });
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('binds Standard Framework readback to the App packaged Codex Plugin Manager', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-packaged-codex-'));
    const appPath = path.join(root, 'One Person Lab.app');
    const runtimeKey = `${process.platform}-${process.arch}`;
    const managedResourcesRoot = path.join(
      appPath,
      'Contents',
      'Resources',
      'bundled-aioncore',
      runtimeKey,
      'managed-resources'
    );
    const codexRoot = `cli/codex/0.146.0/${runtimeKey}`;
    const codexExecutable = 'vendor/bin/codex';
    const codexPath = path.join(managedResourcesRoot, codexRoot, codexExecutable);
    const oplPath = path.join(root, 'opl');
    try {
      writeFile(codexPath, '#!/usr/bin/env bash\n', 0o755);
      writeFile(oplPath, '#!/usr/bin/env bash\n', 0o755);
      writeFile(
        path.join(managedResourcesRoot, 'manifest.json'),
        `${JSON.stringify({
          clis: [
            {
              name: 'codex',
              platformDirectory: runtimeKey,
              root: codexRoot,
              executable: codexExecutable,
            },
          ],
        })}\n`
      );

      const command = vmSmoke.buildOplJsonShellCommand(['app', 'state', '--profile', 'fast', '--json'], {
        appPath,
        runtimeProfile: 'standard',
        codexHome: path.join(root, '.codex'),
        __testOplCommandPath: oplPath,
      });

      expect(vmSmoke.resolvePackagedCodexPluginManager(appPath)).toBe(codexPath);
      expect(
        vmSmoke.probeCodexCli({
          command: vmSmoke.resolvePackagedCodexCliForSmoke({ appPath, runtimeProfile: 'standard' }),
        })
      ).toMatchObject({ command: codexPath, detected: true });
      expect(command.command).toContain(`export CODEX_HOME='${path.join(root, '.codex')}'`);
      expect(command.command).toContain(`export OPL_CODEX_BIN='${codexPath}'`);
      expect(command.command).toContain(`export OPL_CODEX_PLUGIN_BIN='${codexPath}'`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds Full source identity to the packaged manifest Framework commit', () => {
    const frameworkSha = 'a'.repeat(40);
    const fixture = createPackagedFullRuntimeAppFixture(frameworkSha);
    try {
      writeFile(path.join(fixture.runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', 0o755);
      expect(vmSmoke.buildFullRuntimeSourceIdentity(fixture.appPath, frameworkSha)).toEqual({
        schema: 'opl_full_runtime_source_identity.v1',
        status: 'passed',
        source: 'packaged_app_resource',
        expected_framework_sha: frameworkSha,
        observed_framework_sha: frameworkSha,
        exact_match: true,
        manifest_path: path.join(
          fixture.appPath,
          'Contents',
          'Resources',
          'opl-full-runtime',
          'manifest',
          'full-package-manifest.json'
        ),
        manifest_version: 2,
        component_framework_sha: frameworkSha,
      });
      expect(() => vmSmoke.buildFullRuntimeSourceIdentity(fixture.appPath, 'c'.repeat(40))).toThrow(
        /Framework SHA mismatch/
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('binds Standard source identity to the installed Framework app-state projection', () => {
    const frameworkSha = 'b'.repeat(40);
    expect(
      vmSmoke.buildInstalledFrameworkSourceIdentity(installedFrameworkAppState(frameworkSha), frameworkSha)
    ).toEqual({
      schema: 'opl_framework_installed_source_identity.v1',
      status: 'passed',
      install_mode: 'archive',
      expected_framework_sha: frameworkSha,
      observed_framework_sha: frameworkSha,
      exact_match: true,
      identity_source: 'source_archive_url',
      evidence_source: 'opl app state --profile fast --json',
    });
    expect(() =>
      vmSmoke.buildInstalledFrameworkSourceIdentity(installedFrameworkAppState(frameworkSha), 'c'.repeat(40))
    ).toThrow(/Installed Framework SHA mismatch/);
    const gitIdentity = installedFrameworkAppState(frameworkSha);
    gitIdentity.app_state.release.installed_framework_source_identity.install_mode = 'git';
    expect(() => vmSmoke.buildInstalledFrameworkSourceIdentity(gitIdentity, frameworkSha)).toThrow(
      /install_mode=archive/
    );
  });

  it('consumes compatible installed identity extensions through the release projection', () => {
    const frameworkSha = 'b'.repeat(40);
    const projection = installedFrameworkAppState(frameworkSha);
    const identity = projection.app_state.release.installed_framework_source_identity as Record<string, unknown>;
    identity.schema = 'opl_framework_installed_source_identity.v2';
    identity.identity_source = 'framework_release_projection';
    identity.provenance_ref = 'framework-owner:release-source-identity';
    projection.app_state.release.installed_framework_source_identity_source = 'framework_release_projection';

    expect(vmSmoke.buildInstalledFrameworkSourceIdentity(projection, frameworkSha)).toMatchObject({
      status: 'passed',
      observed_framework_sha: frameworkSha,
      identity_source: 'framework_release_projection',
    });
  });

  it('always adds the CDP launch argument for GUI readiness and Settings smoke checks', () => {
    expect(
      vmSmoke.buildLaunchAppArgs('/Applications/One Person Lab.app', {
        settingsSmoke: true,
        cdpPort: 9230,
      })
    ).toContain('--aionui-cdp-port=9230');
    expect(
      vmSmoke.buildLaunchAppArgs('/Applications/One Person Lab.app', {
        settingsSmoke: false,
        cdpPort: 9230,
      })
    ).toContain('--aionui-cdp-port=9230');
  });

  it('targets current OPL Settings pages through stable structural anchors instead of localized copy', () => {
    const generalTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'general');
    const environmentTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'environment');
    const diagnosticsTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'diagnostics');
    const appearanceTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'appearance');

    expect(generalTarget?.hash).toBe('#/settings/general');
    expect(generalTarget?.contentSelector).toBe('[data-testid="settings-page-overview"]');
    expect(JSON.stringify(generalTarget)).not.toContain('Refresh status');
    expect(JSON.stringify(generalTarget)).not.toContain('刷新状态');
    expect(JSON.stringify(generalTarget)).not.toContain('打开运行状态');
    expect(environmentTarget?.hash).toBe('#/settings/environment');
    expect(environmentTarget?.contentSelector).toBe('[data-testid="settings-page-maintenance"]');
    expect(diagnosticsTarget).toMatchObject({
      hash: '#/settings/environment?section=diagnostics',
      contentSelector: '[data-testid="settings-page-maintenance"]',
      navigationGroupId: 'runtime_maintenance',
      navigationDestinationId: 'logs_diagnostics',
    });
    expect(appearanceTarget?.contentSelector).toBe('[data-testid="settings-page-preferences"]');
    expect(vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'advanced')).toBeUndefined();
    expect(vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.every((target) => !('requiredTextAny' in target))).toBe(true);
    expect(vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'about')?.navigation).toBe('secondary');
  });

  it('requires current navigation groups for top-level Settings pages but not App-owned secondary pages', () => {
    const generalTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'general');
    const aboutTarget = vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.find((target) => target.id === 'about');

    expect(
      Object.fromEntries(
        vmSmoke.SETTINGS_PAGE_SMOKE_TARGETS.filter((target) => target.navigation !== 'secondary').map((target) => [
          target.id,
          [target.navigationGroupId, target.navigationDestinationId],
        ])
      )
    ).toEqual({
      general: ['overview', 'overview_status'],
      environment: ['runtime_maintenance', 'runtime_services'],
      capabilities: ['agents_capabilities', 'capabilities'],
      access: ['account_models', 'models'],
      appearance: ['preferences', 'preferences'],
      diagnostics: ['runtime_maintenance', 'logs_diagnostics'],
    });
    expect(vmSmoke.pageReadinessExpression(generalTarget)).toContain(
      'document.querySelector(\'[data-settings-group-id="overview"]\')'
    );
    expect(vmSmoke.pageReadinessExpression(generalTarget)).toContain(
      'document.querySelector("[data-testid=\\"settings-page-overview\\"]")'
    );
    expect(vmSmoke.pageReadinessExpression(aboutTarget)).toContain('const navPresent = true;');
    expect(vmSmoke.pageReadinessExpression(aboutTarget)).not.toContain('data-settings-id="about"');
    expect(vmSmoke.pageReadinessExpression(generalTarget)).not.toContain('data-settings-id="general"');
    expect(vmSmoke.pageReadinessExpression(generalTarget)).not.toContain('Open Runtime Status');
  });

  it('keeps runtime refresh checks in packaged Settings and Runtime smokes', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain('settingsRuntimeRefresh');
    expect(scriptSource).toContain("'#/settings/environment'");
    expect(scriptSource).toContain("'#/runtime'");
  });

  it('writes release evidence screenshots from deterministic CDP smoke paths', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain("path.join('screenshots', 'full.png')");
    expect(scriptSource).toContain("path.join('screenshots', 'action.png')");
    expect(scriptSource).toContain('shouldCaptureFullReleaseScreenshot(options)');
    expect(scriptSource).toContain('runtime-action-evidence.json');
    expect(scriptSource).toContain('captureRuntimeActionEvidence(client, options, secret)');
  });

  it('terminates existing packaged app instances before launching a fresh smoke target', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('terminate_existing_app');
    expect(scriptSource).toContain('OPL_FIRST_RUN_KEEP_EXISTING_APP');
    expect(scriptSource).toContain('terminateExistingApp(options.processName)');
    expect(mainSource.indexOf('terminate_existing_app')).toBeLessThan(mainSource.indexOf("'launch_app'"));
  });

  it('checks Gatekeeper launch policy before opening the packaged app', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('verify_gatekeeper_launch_policy');
    expect(scriptSource).toContain("spctl', ['--assess', '--type', 'execute', '--verbose=4'");
    expect(scriptSource).toContain('gatekeeper-launch-policy.json');
    expect(scriptSource).toContain("xattr', ['-dr', 'com.apple.quarantine', targetApp]");
    expect(scriptSource).toContain('local_authorization_status: localAuthorizationStatus');
    expect(scriptSource).toContain("'rejected_allowed_unsigned'");
    expect(scriptSource).toContain("'failed_allowed_unsigned'");
    expect(scriptSource).toContain('if (!options.requireGatekeeper)');
    expect(scriptSource).toContain('if (!gatekeeperRequired && quarantineAttributeCount !== 0)');
    expect(scriptSource).toContain('Stable local authorization failed to clear quarantine before first launch.');
    expect(scriptSource).toContain('Production App failed the blocking Gatekeeper assessment before first launch.');
    expect(scriptSource).toContain('const blockingCodesignFailure = codesignRequired && codesign.status !== 0;');
    expect(mainSource).toContain('runtimeProfile: options.runtimeProfile');
    expect(scriptSource).toContain('if (blockingCodesignFailure)');
    expect(scriptSource).not.toContain('if (codesign.status !== 0 || spctl.status !== 0)');
    expect(mainSource.indexOf('verify_gatekeeper_launch_policy')).toBeLessThan(mainSource.indexOf("'launch_app'"));
  });

  it('keeps unsigned Standard launch diagnostics separate from Full and production signature gates', () => {
    const appPath = '/Applications/One Person Lab.app';
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-nightly-signature-policy-'));
    const unsigned = {
      runtimeProfile: 'standard',
      requireGatekeeper: false,
      countQuarantineAttributes: () => 0,
      spawnSync: () => ({ status: 1, stdout: '', stderr: 'unsigned Nightly fixture' }),
    };
    try {
      expect(vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, unsigned)).toMatchObject({
        status: 'passed',
        gatekeeper_required: false,
        quarantine_status: 'absent',
        local_authorization_status: 'failed_allowed_unsigned',
        codesign: { status: 1 },
        spctl: { status: 1 },
      });
      for (const override of [
        { runtimeProfile: 'full' },
        { runtimeProfile: undefined },
        { runtimeProfile: 'unknown' },
        { requireGatekeeper: true },
        { installOrigin: 'homebrew_full_cask' },
      ]) {
        expect(() => vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, { ...unsigned, ...override })).toThrow(
          /blocking deep codesign verification/
        );
        expect(JSON.parse(fs.readFileSync(path.join(artifacts, 'gatekeeper-launch-policy.json'), 'utf8')).status).toBe(
          'failed'
        );
      }
      expect(() =>
        vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, {
          ...unsigned,
          countQuarantineAttributes: () => 1,
        })
      ).toThrow(/failed to clear quarantine/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('preserves quarantine and requires Gatekeeper for production DMG smokes', () => {
    const appPath = '/Applications/One Person Lab.app';
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-gatekeeper-'));
    try {
      const passed = vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, {
        requireGatekeeper: true,
        countQuarantineAttributes: () => 2,
        spawnSync: (command: string) => ({ status: 0, stdout: '', stderr: command }),
      });
      expect(passed).toMatchObject({
        status: 'passed',
        install_origin: 'direct_app_or_dmg',
        gatekeeper_required: true,
        quarantine_removal_required: false,
        quarantine_mutation_performed: false,
        quarantine_status: 'present',
        codesign: { status: 0 },
        spctl: { status: 0 },
      });

      expect(() =>
        vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, {
          requireGatekeeper: true,
          countQuarantineAttributes: () => 1,
          spawnSync: (command: string) => ({ status: command === 'spctl' ? 1 : 0, stdout: '', stderr: '' }),
        })
      ).toThrow(/blocking Gatekeeper assessment/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('requires real Gatekeeper acceptance for Full Cask without requiring quarantine removal', () => {
    const appPath = '/Applications/One Person Lab.app';
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-full-gatekeeper-'));
    try {
      const passed = vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, {
        installOrigin: 'homebrew_full_cask',
        countQuarantineAttributes: () => 3,
        spawnSync: (command: string) => ({ status: 0, stdout: '', stderr: command }),
      });
      expect(passed).toMatchObject({
        status: 'passed',
        install_origin: 'homebrew_full_cask',
        gatekeeper_required: true,
        quarantine_removal_required: false,
        quarantine_mutation_performed: false,
        quarantine_status: 'present',
        codesign: { status: 0 },
        spctl: { status: 0 },
      });

      expect(() =>
        vmSmoke.verifyGatekeeperLaunchPolicy(appPath, artifacts, {
          installOrigin: 'homebrew_full_cask',
          countQuarantineAttributes: () => 1,
          spawnSync: (command: string) => ({ status: command === 'spctl' ? 1 : 0, stdout: '', stderr: '' }),
        })
      ).toThrow(/blocking Gatekeeper assessment/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('configures Codex from the API key file before the first packaged App launch', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('configureCodexApiKeyForSmoke');
    expect(scriptSource).toContain('!options.bootstrapLaunchDiagnostics');
    expect(mainSource.indexOf("'install_dmg'")).toBeLessThan(mainSource.indexOf("'configure_codex_api_key'"));
    expect(mainSource.indexOf("'configure_codex_api_key'")).toBeLessThan(mainSource.indexOf("'launch_app'"));
    expect(mainSource.indexOf("'launch_app'")).toBeLessThan(mainSource.indexOf("'wait_guid_entry'"));
  });

  it('selects the API Key compatibility method before submitting the first-run Codex wizard', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const submitSource = scriptSource.slice(
      scriptSource.indexOf('function submitCodexWizard('),
      scriptSource.indexOf('function readFirstRunEvents(')
    );

    expect(scriptSource).toContain("codexApiKeyMethod: 'opl-first-run-gateway-key-method'");
    expect(submitSource).toContain('const methodLabel = ${JSON.stringify(DEFAULT_LABELS.codexApiKeyMethod)};');
    expect(submitSource).toContain("if (!method) throw new Error('Codex API key method was not found')");
    expect(submitSource.indexOf("method.actions.byName('AXPress').perform()")).toBeLessThan(
      submitSource.indexOf('const labelledInput =')
    );
  });

  it('runs focused launch diagnostics after opening the packaged app before secondary release gates', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('--bootstrap-launch-diagnostics');
    expect(scriptSource).toContain('waitForBootstrapLaunchDiagnostics');
    expect(scriptSource).toContain('bootstrap-launch-diagnostics.json');
    expect(mainSource.indexOf("'launch_app'")).toBeLessThan(mainSource.indexOf("'bootstrap_launch_diagnostics'"));
    expect(mainSource.indexOf("'bootstrap_launch_diagnostics'")).toBeLessThan(mainSource.indexOf("'wait_guid_entry'"));
    const diagnosticsPhase = mainSource.indexOf("'bootstrap_launch_diagnostics'");
    const sourceIdentityPhase = mainSource.indexOf('runReleaseSourceIdentityPhase(', diagnosticsPhase);
    const diagnosticsReturn = mainSource.indexOf('return;', diagnosticsPhase);
    const diagnosticsSummary = mainSource.slice(diagnosticsPhase, diagnosticsReturn);

    expect(scriptSource).toContain("'release_source_identity'");
    expect(sourceIdentityPhase).toBeGreaterThan(diagnosticsPhase);
    expect(sourceIdentityPhase).toBeLessThan(diagnosticsReturn);
    expect(diagnosticsSummary).toContain('installed_framework_source_identity: releaseSourceIdentity');
    expect(diagnosticsSummary).toContain('full_runtime_source_identity: releaseSourceIdentity');
  });

  it('captures early bootstrap launch diagnostics on the full release gate before readiness waits', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
    const mainSource = scriptSource.slice(scriptSource.indexOf('async function main()'));

    expect(scriptSource).toContain('captureEarlyLaunchDiagnostics');
    expect(scriptSource).toContain("'capture_early_launch_diagnostics'");
    expect(scriptSource).toContain('blocking_release_gate: false');
    expect(scriptSource).toContain('release_gate_captures_early_bootstrap_diagnostics_before_full_readiness_checks');
    expect(scriptSource).toContain('bootstrap-launch-diagnostics.json');
    expect(mainSource.indexOf("'launch_app'")).toBeLessThan(mainSource.indexOf("'capture_early_launch_diagnostics'"));
    expect(mainSource.indexOf("'capture_early_launch_diagnostics'")).toBeLessThan(
      mainSource.indexOf("'wait_guid_entry'")
    );
  });

  it('scopes runtime refresh button probes to visible page buttons outside toast containers', () => {
    const expression = vmSmoke.visibleRuntimeRefreshButtonExpression();

    expect(expression).toContain('findVisibleRuntimeRefreshButton');
    expect(expression).toContain("candidate.closest('.arco-message, .arco-notification')");
    expect(expression).toContain('getBoundingClientRect');
    expect(expression).toContain("style.display !== 'none'");
    expect(expression).toContain("style.visibility !== 'hidden'");
  });

  it('waits for the Runtime Status page before probing its refresh button', () => {
    const expression = vmSmoke.runtimeStatusReadinessExpression();

    expect(expression).toContain("window.location.hash.startsWith('#/runtime')");
    expect(expression).toContain("window.location.hash = '#/runtime'");
    expect(expression).toContain('OPL Runtime Status');
    expect(expression).toContain('OPL 运行状态');
    expect(expression).toContain('Project Runtime Progress');
    expect(expression).toContain('项目运行进度');
    expect(expression).toContain('Project Runtime Overview');
    expect(expression).toContain('项目运行总览');
    expect(expression).toContain('App\\/operator Drilldown');
    expect(expression).toContain('运行状态摘要');
    expect(expression).toContain('Task Overview');
    expect(expression).toContain('任务概览');
    expect(expression).toContain('In progress');
    expect(expression).toContain('进行中');
    expect(expression).toContain('Needs system handling');
    expect(expression).toContain('需要系统处理');
    expect(expression).toContain('Status Load');
    expect(expression).toContain('状态加载');
    expect(expression).toContain('Loaded at');
  });

  it('uses POSIX-style PATH entries for Full runtime shell probes on Windows bash', () => {
    const prefix = vmSmoke.buildFullRuntimeCommandPrefix('C:\\Users\\tester\\runtime\\current');

    if (process.platform === 'win32') {
      expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='/c/Users/tester/runtime/current'");
      expect(prefix).toContain(
        "export OPL_PREFILLED_NODE_MODULES_DIR='/c/Users/tester/runtime/current/opl/node_modules'"
      );
      expect(prefix).toContain(
        "export PATH='/c/Users/tester/runtime/current/bin:/c/Users/tester/runtime/current/node/bin"
      );
      expect(prefix).not.toContain('runtime\\current');
      expect(prefix).not.toContain('current/bin;/c/');
    } else {
      expect(prefix).toContain("export OPL_FULL_RUNTIME_HOME='C:\\Users\\tester\\runtime\\current'");
      expect(prefix).toContain(
        "export OPL_PREFILLED_NODE_MODULES_DIR='C:\\Users\\tester\\runtime\\current/opl/node_modules'"
      );
      expect(prefix).toContain('current/bin');
    }
  });

  it('uses the canonical Connect modules surface with bounded OPL probes during Full VM smoke', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(vmSmoke.OPL_CONNECT_MODULES_ARGS).toEqual(['connect', 'modules', '--json']);
    expect(scriptSource).toContain("const OPL_CONNECT_MODULES_ARGS = ['connect', 'modules', '--json']");
    expect(scriptSource).toContain('runOplJson(OPL_CONNECT_MODULES_ARGS');
    expect(scriptSource).toContain("['modules.json', OPL_CONNECT_MODULES_ARGS]");
    expect(scriptSource).not.toContain("runOplJson(['modules'])");
    expect(scriptSource).not.toContain("['modules.json', ['modules']]");
    expect(scriptSource).toContain('timeout: resolveOplProbeTimeoutMs(options.timeoutMs)');
  });

  it('does not require the Codex config wizard for standard VM smokes by default', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--dry-run',
    ]);
    expect(options.requireCodexConfigWizard).toBe(false);
    expect(options.codexApiKeyFile).toBe('');
    expect(tartSmoke.prepareHostCodexApiKeyFile(options)).toBeNull();
    expect(tartSmoke.buildDryRunPlan(options).provider_configuration).toEqual({
      status: 'not_requested',
      requested: false,
      credential_present: false,
      credential_source: null,
      credential_resolution_status: 'not_requested',
      credential_resolution_reason: 'connected_provider_smoke_not_requested',
      base_url_matches_opl_gateway: null,
      manual_user_input_required: false,
      mutation_performed: false,
      blocking_release_gate: false,
    });

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).not.toContain('--require-codex-config-wizard');
    expect(command).not.toContain('--codex-api-key-file');
    expect(command).toContain('unset OPL_FIRST_RUN_CODEX_API_KEY_FILE');

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
      })
    ).not.toThrow();
  });

  it('requires Gateway credential files as a pair and keeps the account and API key lanes exclusive', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-account-files-'));
    const emailFile = path.join(root, 'email.txt');
    const passwordFile = path.join(root, 'password.txt');
    const apiKeyFile = path.join(root, 'api-key.txt');
    writeFile(emailFile, 'clean-vm@example.com\n', 0o600);
    writeFile(passwordFile, 'protected-password-value\n', 0o600);
    writeFile(apiKeyFile, 'explicit-api-key-value\n', 0o600);
    const tartBase = [
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--dry-run',
    ];
    const vmBase = ['--dmg', '/tmp/One-Person-Lab.dmg'];
    try {
      for (const args of [tartBase, vmBase]) {
        const parse = args === tartBase ? tartSmoke.parseArgs : vmSmoke.parseArgs;
        expect(() => parse([...args, '--gateway-account-email-file', emailFile])).toThrow(/must be provided together/);
        expect(() => parse([...args, '--gateway-account-password-file', passwordFile])).toThrow(
          /must be provided together/
        );
        expect(() =>
          parse([
            ...args,
            '--gateway-account-email-file',
            emailFile,
            '--gateway-account-password-file',
            passwordFile,
            '--codex-api-key-file',
            apiKeyFile,
          ])
        ).toThrow(/separate lanes/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes Gateway credentials to the guest by protected file path without exposing their values', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gateway-account-command-'));
    const email = 'clean-vm-account@example.com';
    const password = 'protected-password-value';
    const emailFile = path.join(root, 'email.txt');
    const passwordFile = path.join(root, 'password.txt');
    writeFile(emailFile, `${email}\n`, 0o600);
    writeFile(passwordFile, `${password}\n`, 0o600);
    try {
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--runtime-profile',
        'standard',
        '--gateway-account-email-file',
        emailFile,
        '--gateway-account-password-file',
        passwordFile,
        '--dry-run',
      ]);
      const command = tartSmoke.guestSmokeCommand(
        options,
        '/tmp/guest/One-Person-Lab.dmg',
        '/tmp/guest/opl-first-run-vm-smoke.mjs',
        '/tmp/guest/artifacts',
        null,
        null,
        null,
        Date.now() + 60_000,
        '/tmp/guest/email.txt',
        '/tmp/guest/password.txt'
      );

      expect(command).toContain("--gateway-account-email-file '/tmp/guest/email.txt'");
      expect(command).toContain("--gateway-account-password-file '/tmp/guest/password.txt'");
      expect(command).toContain("--cdp-port '9230'");
      expect(command).not.toContain('--codex-api-key-file');
      expect(command).not.toContain(email);
      expect(command).not.toContain(password);
      expect(tartSmoke.buildDryRunPlan(options).provider_configuration).toMatchObject({
        requested: true,
        credential_source: 'gateway_account_password_file',
        blocking_release_gate: true,
      });
      expect(tartSmoke.buildDryRunPlan(options).cdp_port).toBe(9230);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires fresh connected Gateway account readback from the packaged FirstRun UI', () => {
    const options = {
      runtimeProfile: 'standard',
      bootstrapLaunchDiagnostics: false,
      gatewayAccountEmailFile: '/tmp/email.txt',
      gatewayAccountPasswordFile: '/tmp/password.txt',
    };
    const passed = createPassedGatewayAccountLogin();

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        gateway_account_login: passed,
      })
    ).not.toThrow();

    for (const readback of [
      { ...passed.readback, status: undefined },
      { ...passed.readback, managed_key_present: undefined },
      { ...passed.readback, freshness: undefined },
    ]) {
      expect(() =>
        assertGuestSmokeSummary(options, {
          status: 'passed',
          runtime_profile: 'standard',
          gateway_account_login: { ...passed, readback },
        })
      ).toThrow(/fresh Gateway account login/);
    }
  });

  it.each(['standard', 'full'])('passes every Official Profile root to a direct %s DMG guest smoke', (profile) => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      `/tmp/One-Person-Lab-${profile}.dmg`,
      '--runtime-profile',
      profile,
      '--dry-run',
    ]);
    const command = tartSmoke.guestSmokeCommand(
      options,
      `/tmp/guest/One-Person-Lab-${profile}.dmg`,
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      null
    );

    for (const root of tartSmoke.officialProfileDesiredRoots()) {
      expect(command).toContain(`--official-profile-root '${root}'`);
    }
  });

  it('derives the exact Framework cohort from published artifact identity and forwards it to the guest', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-published-framework-identity-'));
    const frameworkSha = 'd'.repeat(40);
    try {
      writeFile(
        path.join(artifacts, 'published-artifact-identity.json'),
        `${JSON.stringify({
          schema: 'opl_app_post_publication_artifact_identity.v1',
          verified: true,
          cohort: { framework_sha: frameworkSha },
        })}\n`
      );
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--runtime-profile',
        'standard',
        '--artifacts',
        artifacts,
        '--dry-run',
      ]);
      expect(options.expectedFrameworkSha).toBe(frameworkSha);
      const command = tartSmoke.guestSmokeCommand(
        options,
        '/tmp/guest/One-Person-Lab.dmg',
        '/tmp/guest/opl-first-run-vm-smoke.mjs',
        '/tmp/guest/artifacts',
        null
      );
      expect(command).toContain(`--expected-framework-sha '${frameworkSha}'`);
      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--dmg',
          '/tmp/One-Person-Lab.dmg',
          '--runtime-profile',
          'standard',
          '--artifacts',
          artifacts,
          '--expected-framework-sha',
          'e'.repeat(40),
          '--dry-run',
        ])
      ).toThrow(/does not match published-artifact-identity/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('writes and validates the Standard installed Framework identity artifact from app state', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-framework-identity-'));
    const frameworkSha = 'b'.repeat(40);
    try {
      const result = vmSmoke.collectReleaseSourceIdentity(
        {
          runtimeProfile: 'standard',
          expectedFrameworkSha: frameworkSha,
          artifacts,
          timeoutMs: 10_000,
          __testHooks: { runOplJson: () => JSON.stringify(installedFrameworkAppState(frameworkSha)) },
        },
        null
      );
      expect(result.installed_framework_source_identity).toMatchObject({
        schema: 'opl_framework_installed_source_identity.v1',
        status: 'passed',
        install_mode: 'archive',
        observed_framework_sha: frameworkSha,
        exact_match: true,
      });
      const hostArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-framework-host-'));
      try {
        fs.mkdirSync(path.join(hostArtifacts, 'artifacts'), { recursive: true });
        fs.copyFileSync(
          path.join(artifacts, 'installed-framework-source-identity.json'),
          path.join(hostArtifacts, 'artifacts', 'installed-framework-source-identity.json')
        );
        const options = {
          runtimeProfile: 'standard',
          expectedFrameworkSha: frameworkSha,
          providerCredentialPresent: false,
          codexApiKeyFile: '',
        };
        expect(() =>
          tartSmoke.assertGuestSmokeSummary(
            options,
            {
              status: 'passed',
              runtime_profile: 'standard',
              provider_configuration: {
                status: 'not_requested',
                requested: false,
                credential_source: null,
                credential_present: false,
                manual_user_input_required: false,
                mutation_performed: false,
                blocking_release_gate: false,
              },
              computer_use_qualification: createPassedComputerUseQualification('standard'),
              official_profile_first_install: createPassedOfficialProfileFirstInstall(),
              installed_framework_source_identity: result.installed_framework_source_identity,
            },
            hostArtifacts
          )
        ).not.toThrow();
        const identityPath = path.join(hostArtifacts, 'artifacts', 'installed-framework-source-identity.json');
        const symlinkTarget = path.join(hostArtifacts, 'installed-framework-source-identity-target.json');
        fs.renameSync(identityPath, symlinkTarget);
        fs.symlinkSync(symlinkTarget, identityPath);
        expect(() =>
          tartSmoke.assertGuestSmokeSummary(
            options,
            {
              status: 'passed',
              runtime_profile: 'standard',
              provider_configuration: {
                status: 'not_requested',
                requested: false,
                credential_source: null,
                credential_present: false,
                manual_user_input_required: false,
                mutation_performed: false,
                blocking_release_gate: false,
              },
              computer_use_qualification: createPassedComputerUseQualification('standard'),
              official_profile_first_install: createPassedOfficialProfileFirstInstall(),
              installed_framework_source_identity: result.installed_framework_source_identity,
            },
            hostArtifacts
          )
        ).toThrow(/nonempty regular non-symlink/);
      } finally {
        fs.rmSync(hostArtifacts, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('writes and validates the Full identity artifact from the installed App packaged manifest', () => {
    const frameworkSha = 'a'.repeat(40);
    const fixture = createPackagedFullRuntimeAppFixture(frameworkSha);
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-framework-identity-'));
    try {
      writeFile(path.join(fixture.runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\n', 0o755);
      const result = vmSmoke.collectReleaseSourceIdentity(
        {
          runtimeProfile: 'full',
          expectedFrameworkSha: frameworkSha,
          artifacts,
          appPath: fixture.appPath,
        },
        null
      );
      expect(result.full_runtime_source_identity).toMatchObject({
        schema: 'opl_full_runtime_source_identity.v1',
        status: 'passed',
        source: 'packaged_app_resource',
        observed_framework_sha: frameworkSha,
        exact_match: true,
      });
      const hostArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-framework-host-'));
      try {
        fs.mkdirSync(path.join(hostArtifacts, 'artifacts'), { recursive: true });
        fs.copyFileSync(
          path.join(artifacts, 'full-runtime-source-identity.json'),
          path.join(hostArtifacts, 'artifacts', 'full-runtime-source-identity.json')
        );
        expect(() =>
          tartSmoke.assertGuestSmokeSummary(
            {
              runtimeProfile: 'full',
              expectedFrameworkSha: frameworkSha,
              providerCredentialPresent: false,
              codexApiKeyFile: '',
              bootstrapLaunchDiagnostics: false,
            },
            {
              status: 'passed',
              runtime_profile: 'full',
              provider_configuration: {
                status: 'not_requested',
                requested: false,
                credential_source: null,
                credential_present: false,
                manual_user_input_required: false,
                mutation_performed: false,
                blocking_release_gate: false,
              },
              computer_use_qualification: createPassedComputerUseQualification('full'),
              official_profile_first_install: createPassedOfficialProfileFirstInstall(),
              full_runtime_source_identity: result.full_runtime_source_identity,
              temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
            },
            hostArtifacts
          )
        ).not.toThrow();
      } finally {
        fs.rmSync(hostArtifacts, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('rejects missing or drifted Computer Use qualification at the Tart boundary', () => {
    const options = {
      runtimeProfile: 'standard',
      providerCredentialPresent: false,
      codexApiKeyFile: '',
      bootstrapLaunchDiagnostics: false,
    };

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        computer_use_qualification: null,
      })
    ).toThrow(/KimiCU Computer Use qualification/);

    const drifted = createPassedComputerUseQualification('standard');
    drifted.mcp.observed_tools = drifted.mcp.observed_tools.slice(1);
    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        computer_use_qualification: drifted,
      })
    ).toThrow(/KimiCU Computer Use qualification/);
  });

  it('forwards focused launch diagnostics into the guest without secondary release smokes', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--bootstrap-launch-diagnostics',
      '--dry-run',
    ]);

    expect(options.bootstrapLaunchDiagnostics).toBe(true);
    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.bootstrap_launch_diagnostics).toBe(true);
    expect(plan.settings_smoke).toBe(false);
    expect(plan.assistant_route_smoke).toBe(false);
    expect(plan.cdp_port).toBe(9230);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--bootstrap-launch-diagnostics');
    expect(command).toContain('--cdp-port');
    expect(command).not.toContain('--settings-smoke');
    expect(command).not.toContain('--assistant-route-smoke');
    expect(command).not.toContain('--codex-functional-check');
    expect(command).not.toContain('--codex-ai-self-check');
  });

  it('lets focused launch diagnostics override secondary smokes enabled by the host profile', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--smoke-profile',
      'no-clt-clean-vm',
      '--bootstrap-launch-diagnostics',
      '--dry-run',
    ]);

    expect(options.bootstrapLaunchDiagnostics).toBe(true);
    expect(options.settingsSmoke).toBe(false);
    expect(options.assistantRouteSmoke).toBe(false);
    expect(options.codexFunctionalCheck).toBe(false);
    expect(options.codexAiSelfCheck).toBe(false);
    expect(tartSmoke.buildDryRunPlan(options).settings_smoke).toBe(false);
  });

  it('rejects focused launch diagnostics when secondary release smokes are explicitly requested', () => {
    expect(() =>
      tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--runtime-profile',
        'standard',
        '--bootstrap-launch-diagnostics',
        '--settings-smoke',
        '--dry-run',
      ])
    ).toThrow('--bootstrap-launch-diagnostics cannot be combined with secondary release smokes.');
  });

  it('forwards assistant route smoke into the guest and requires its passed summary', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--assistant-route-smoke',
      '--dry-run',
    ]);

    expect(options.assistantRouteSmoke).toBe(true);

    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.assistant_route_smoke).toBe(true);
    expect(plan.cdp_port).toBe(9230);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--cdp-port');

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
      })
    ).not.toThrow();

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'standard',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        assistant_route_smoke: null,
      })
    ).toThrow(/assistant route smoke/);
  });

  it('fails closed when Full assistant smoke has no complete MAS provisioning transport', () => {
    const baseArgs = [
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--guest-workdir',
      '/tmp/opl-transport-guest',
      '--runtime-profile',
      'full',
      '--assistant-route-smoke',
      '--dry-run',
    ];
    const workspace = '/tmp/opl-transport-guest/mas-provisioned-workspace';
    const receipt = `${workspace}/studies/qualification-study/artifacts/controller/qualification/provisioning-receipt.json`;

    expect(() => tartSmoke.parseArgs(baseArgs)).toThrow('Framework-materialized MAS provisioning workspace');
    expect(() => tartSmoke.parseArgs([...baseArgs, '--mas-study-provisioning-workspace', workspace])).toThrow(
      'must be provided together'
    );
    expect(() => tartSmoke.parseArgs([...baseArgs, '--mas-study-provisioning-receipt', receipt])).toThrow(
      'must be provided together'
    );
  });

  it('requires the provisioning workspace to use the exact guest path and contain its receipt', () => {
    const baseArgs = [
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--guest-workdir',
      '/tmp/opl-transport-guest',
      '--runtime-profile',
      'full',
      '--assistant-route-smoke',
      '--dry-run',
    ];
    const workspace = '/tmp/opl-transport-guest/mas-provisioned-workspace';

    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--mas-study-provisioning-workspace',
        '/tmp/other-workspace',
        '--mas-study-provisioning-receipt',
        '/tmp/other-workspace/receipt.json',
      ])
    ).toThrow('must equal the guest path');
    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--mas-study-provisioning-workspace',
        workspace,
        '--mas-study-provisioning-receipt',
        '/tmp/outside-receipt.json',
      ])
    ).toThrow('must be contained in the provisioning workspace');
  });

  it('binds the Framework-materialized provisioning transport into the plan and guest command', () => {
    const workspace = '/tmp/opl-transport-guest/mas-provisioned-workspace';
    const receiptRelativePath =
      'studies/qualification-study/artifacts/controller/qualification/provisioning-receipt.json';
    const receipt = `${workspace}/${receiptRelativePath}`;
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--guest-workdir',
      '/tmp/opl-transport-guest',
      '--runtime-profile',
      'full',
      '--assistant-route-smoke',
      '--mas-study-provisioning-workspace',
      workspace,
      '--mas-study-provisioning-receipt',
      receipt,
      '--dry-run',
    ]);

    expect(tartSmoke.buildDryRunPlan(options).mas_study_provisioning).toEqual({
      workspace,
      receipt,
      receipt_relative_path: receiptRelativePath,
    });
    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/opl-transport-guest/One-Person-Lab.dmg',
      '/tmp/opl-transport-guest/opl-first-run-vm-smoke.mjs',
      '/tmp/opl-transport-guest/artifacts',
      '/tmp/opl-transport-guest/codex-api-key.txt'
    );
    expect(command).toContain(`--assistant-workspace '${workspace}'`);
    expect(command).toContain(`--mas-study-provisioning-receipt '${receipt}'`);
  });

  it('rejects symlinks in the MAS provisioning transport before any guest copy', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-provisioning-transport-'));
    const guestWorkdir = path.join(root, 'guest');
    const workspace = path.join(guestWorkdir, 'mas-provisioned-workspace');
    const receipt = path.join(workspace, 'receipt.json');
    const dmg = path.join(root, 'One-Person-Lab.dmg');
    try {
      writeFile(dmg, 'dmg fixture\n');
      writeFile(receipt, '{}\n');
      fs.symlinkSync(receipt, path.join(workspace, 'receipt-link.json'));
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        dmg,
        '--guest-workdir',
        guestWorkdir,
        '--runtime-profile',
        'full',
        '--assistant-route-smoke',
        '--mas-study-provisioning-workspace',
        workspace,
        '--mas-study-provisioning-receipt',
        receipt,
      ]);

      await expect(tartSmoke.copyMasProvisioningWorkspaceToGuest(options, '192.0.2.1')).rejects.toThrow(
        'transport rejects symlinks'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies and binds the App compiled expectation manifest into the guest smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--compiled-expectations',
      '/tmp/app-first-run-compiled-expectations.json',
      '--dry-run',
    ]);
    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );

    expect(options.compiledExpectations).toBe('/tmp/app-first-run-compiled-expectations.json');
    expect(command).toContain(
      "export OPL_FIRST_RUN_COMPILED_EXPECTATIONS='/tmp/opl-first-run-smoke/app-first-run-compiled-expectations.json'"
    );
  });

  it('forwards the release workflow guide screenshot toggle into the guest smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--guide-screenshots',
      '--dry-run',
    ]);

    expect(options.guideScreenshots).toBe(true);
    expect(tartSmoke.buildDryRunPlan(options).guide_screenshots).toBe(true);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--guide-screenshots');
    expect(vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--guide-screenshots']).guideScreenshots).toBe(true);
    expect(
      vmSmoke.isGuideScreenshotEntryReady({
        status: 'captured',
        finder_window_setup: { status: 'failed_nonblocking', stderr: 'Finder AppleEvent timed out' },
      })
    ).toBe(true);
    expect(vmSmoke.isGuideScreenshotEntryReady({ status: 'failed' })).toBe(false);
  });

  it('uses the Codex configuration wizard screenshot for the guide access setup page when available', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-guide-source-'));
    const firstRun = path.join(root, 'first-run-beginner.png');
    const wizard = path.join(root, 'codex-config-wizard.png');

    writeFile(firstRun, 'ready');
    expect(vmSmoke.guideScreenshotSources(root)).toEqual({
      firstRunAccessSetup: firstRun,
      firstRunReady: firstRun,
    });

    writeFile(wizard, 'wizard');
    expect(vmSmoke.guideScreenshotSources(root)).toEqual({
      firstRunAccessSetup: wizard,
      firstRunReady: firstRun,
    });
  });

  it('passes Codex functional check through the Tart host command and plan', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--assistant-route-smoke',
      '--codex-functional-check',
      ...fullMasProvisioningTransportArgs(),
      '--dry-run',
    ]);

    expect(options.codexFunctionalCheck).toBe(true);
    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.codex_functional_check).toBe(true);
    expect(plan.assistant_route_smoke).toBe(true);
    expect(plan.cdp_port).toBe(options.cdpPort);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--codex-functional-check');
  });

  it('passes Codex AI self-check through the Tart host command and plan as a diagnostic', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--codex-ai-self-check',
      ...fullMasProvisioningTransportArgs(),
      '--dry-run',
    ]);

    expect(options.codexAiSelfCheck).toBe(true);
    expect(options.codexFunctionalCheck).toBe(true);
    expect(options.assistantRouteSmoke).toBe(true);

    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.codex_ai_self_check).toEqual({
      requested: true,
      mode: 'diagnose',
      blocking_release_gate: false,
    });
    expect(plan.codex_functional_check).toBe(true);
    expect(plan.assistant_route_smoke).toBe(true);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--codex-functional-check');
    expect(command).toContain('--codex-ai-self-check');
  });

  it('bounds the host SSH command for long-running guest smokes', async () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--smoke-timeout-ms',
      '1000',
      '--dry-run',
    ]);

    expect(tartSmoke.guestSmokeHostTimeoutMs(options)).toBe(121_000);
    await expect(
      tartSmoke.runAsync(process.execPath, ['-e', 'setTimeout(() => {}, 10_000)'], {
        label: 'test-long-running-child',
        timeoutMs: 50,
      })
    ).rejects.toThrow(/test-long-running-child timed out after 50ms/);
  });

  it('passes Codex phase and host deadline budgets through Tart host plans and guest smoke commands', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--smoke-timeout-ms',
      '900000',
      '--codex-install-phase-timeout-ms',
      '240000',
      '--codex-readiness-phase-timeout-ms',
      '360000',
      '--dry-run',
    ]);

    expect(options.codexInstallPhaseTimeoutMs).toBe(240_000);
    expect(options.codexReadinessPhaseTimeoutMs).toBe(360_000);
    expect(tartSmoke.buildDryRunPlan(options).timeouts).toEqual({
      vm_boot_and_ssh_ms: 600_000,
      guest_smoke_ms: 900_000,
      guest_smoke_host_ms: 1_020_000,
      guest_smoke_host_grace_ms: 120_000,
      codex_install_phase_ms: 240_000,
      codex_readiness_phase_ms: 360_000,
    });
    expect(tartSmoke.guestSmokeHostDeadlineEpochMs(options, 1_000_000)).toBe(2_020_000);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt',
      null,
      null,
      2_020_000
    );
    expect(command).toContain("--codex-install-phase-timeout-ms '240000'");
    expect(command).toContain("--codex-readiness-phase-timeout-ms '360000'");
    expect(command).toContain("--host-deadline-epoch-ms '2020000'");
  });

  it('defaults Codex phase timeouts from the guest smoke timeout and rejects invalid phase budgets', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--smoke-timeout-ms',
      '900000',
      '--dry-run',
    ]);

    expect(options.codexInstallPhaseTimeoutMs).toBe(900_000);
    expect(options.codexReadinessPhaseTimeoutMs).toBe(900_000);
    expect(() =>
      tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-install-phase-timeout-ms',
        '0',
        '--dry-run',
      ])
    ).toThrow(/codex-install-phase-timeout-ms/);
    expect(() =>
      tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-readiness-phase-timeout-ms',
        '-1',
        '--dry-run',
      ])
    ).toThrow(/codex-readiness-phase-timeout-ms/);
  });

  it('parses guest Codex phase timeouts and shares a phase deadline across commands', () => {
    const options = vmSmoke.parseArgs([
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--timeout-ms',
      '900000',
      '--codex-install-phase-timeout-ms',
      '240000',
      '--codex-readiness-phase-timeout-ms',
      '360000',
    ]);

    expect(options.codexInstallPhaseTimeoutMs).toBe(240_000);
    expect(options.codexReadinessPhaseTimeoutMs).toBe(360_000);
    expect(
      vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--timeout-ms', '42']).codexInstallPhaseTimeoutMs
    ).toBe(42);
    expect(() =>
      vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--codex-readiness-phase-timeout-ms', '0'])
    ).toThrow(/codex-readiness-phase-timeout-ms/);

    const deadlineMs = vmSmoke.phaseDeadlineMs(10_000);
    expect(vmSmoke.remainingPhaseTimeoutMs(deadlineMs, 'install_dmg')).toBeLessThanOrEqual(10_000);
    expect(() => vmSmoke.remainingPhaseTimeoutMs(Date.now() - 1, 'install_dmg')).toThrow(/install_dmg timed out/);
  });

  it('parses and validates guest Codex install preseed inputs without leaking full paths in diagnostics', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-codex-preseed-'));
    try {
      const tarball = path.join(root, 'codex-package.tgz');
      const platformTarball = path.join(root, 'codex-platform-package.tgz');
      const cacheDir = path.join(root, 'npm-cache');
      writeFile(tarball, 'codex package tarball\n');
      writeFile(platformTarball, 'codex platform package tarball\n');
      writeFile(path.join(cacheDir, '_cacache', 'index-v5', 'entry'), 'cache entry\n');

      const options = vmSmoke.parseArgs([
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--codex-package-tarball',
        tarball,
        '--codex-platform-package-tarball',
        platformTarball,
        '--codex-npm-cache-dir',
        cacheDir,
      ]);

      expect(options.codexPackageTarball).toBe(tarball);
      expect(options.codexPlatformPackageTarball).toBe(platformTarball);
      expect(options.codexNpmCacheDir).toBe(cacheDir);
      expect(vmSmoke.buildCodexInstallPreseedEnv(options)).toMatchObject({
        OPL_FIRST_RUN_CODEX_PACKAGE_TARBALL: tarball,
        OPL_FIRST_RUN_CODEX_PLATFORM_PACKAGE_TARBALL: platformTarball,
        OPL_FIRST_RUN_CODEX_NPM_CACHE_DIR: cacheDir,
        NPM_CONFIG_CACHE: cacheDir,
        npm_config_cache: cacheDir,
      });
      const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');
      const launchAppSource = scriptSource.slice(
        scriptSource.indexOf('function launchApp('),
        scriptSource.indexOf('function verifyGatekeeperLaunchPolicy(')
      );
      expect(launchAppSource).toContain('buildCodexInstallPreseedEnv(options)');
      expect(launchAppSource).toContain("runWithDeadline('launchctl', ['setenv', key, value]");
      expect(launchAppSource).toContain('resolveAppExecutablePath(appPath)');
      expect(launchAppSource).toContain('buildLaunchExecutableArgs(options)');
      expect(launchAppSource).toContain('buildLaunchAppEnv(options)');
      expect(launchAppSource).toContain('env: launchEnv');
      expect(launchAppSource).toContain("strategy: 'direct_app_executable'");
      expect(scriptSource).toContain('buildPackagedAppLaunchBaseEnv(sourceEnv)');

      const diagnostics = vmSmoke.codexInstallPreseedDiagnostics(options);
      expect(diagnostics).toMatchObject({
        requested: true,
        package_tarball: {
          present: true,
          basename: 'codex-package.tgz',
          type: 'file',
          size_bytes: Buffer.byteLength('codex package tarball\n'),
        },
        platform_package_tarball: {
          present: true,
          basename: 'codex-platform-package.tgz',
          type: 'file',
          size_bytes: Buffer.byteLength('codex platform package tarball\n'),
        },
        npm_cache_dir: {
          present: true,
          basename: 'npm-cache',
          type: 'directory',
        },
      });
      expect(diagnostics.package_tarball.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(diagnostics.platform_package_tarball.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(diagnostics.npm_cache_dir.size_bytes).toBeGreaterThan(0);
      expect(JSON.stringify(diagnostics)).not.toContain(root);

      expect(() =>
        vmSmoke.parseArgs([
          '--dmg',
          '/tmp/One-Person-Lab.dmg',
          '--codex-package-tarball',
          path.join(root, 'missing.tgz'),
        ])
      ).toThrow(/codex-package-tarball/);
      expect(() =>
        vmSmoke.parseArgs([
          '--dmg',
          '/tmp/One-Person-Lab.dmg',
          '--codex-platform-package-tarball',
          path.join(root, 'missing-platform.tgz'),
        ])
      ).toThrow(/codex-platform-package-tarball/);
      expect(() => vmSmoke.parseArgs(['--dmg', '/tmp/One-Person-Lab.dmg', '--codex-npm-cache-dir', tarball])).toThrow(
        /codex-npm-cache-dir/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('forwards Codex install preseed inputs through Tart plans and guest smoke commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-codex-preseed-'));
    try {
      const tarball = path.join(root, 'codex-package.tgz');
      const platformTarball = path.join(root, 'codex-platform-package.tgz');
      const cacheDir = path.join(root, 'npm-cache');
      writeFile(tarball, 'codex package tarball\n');
      writeFile(platformTarball, 'codex platform package tarball\n');
      writeFile(path.join(cacheDir, '_cacache', 'entry'), 'cache entry\n');

      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--guest-workdir',
        '/tmp/guest',
        '--codex-package-tarball',
        tarball,
        '--codex-platform-package-tarball',
        platformTarball,
        '--codex-npm-cache-dir',
        cacheDir,
        '--dry-run',
      ]);

      expect(options.codexPackageTarball).toBe(tarball);
      expect(options.codexPlatformPackageTarball).toBe(platformTarball);
      expect(options.codexNpmCacheDir).toBe(cacheDir);

      const plan = tartSmoke.buildDryRunPlan(options);
      expect(plan.codex_install_preseed).toMatchObject({
        requested: true,
        package_tarball: {
          present: true,
          basename: 'codex-package.tgz',
          guest_path: '/tmp/guest/codex-package.tgz',
          type: 'file',
        },
        platform_package_tarball: {
          present: true,
          basename: 'codex-platform-package.tgz',
          guest_path: '/tmp/guest/codex-platform-package.tgz',
          type: 'file',
        },
        npm_cache_dir: {
          present: true,
          basename: 'npm-cache',
          guest_path: '/tmp/guest/codex-npm-cache',
          type: 'directory',
        },
      });
      expect(JSON.stringify(plan.codex_install_preseed)).not.toContain(root);

      const command = tartSmoke.guestSmokeCommand(
        options,
        '/tmp/guest/One-Person-Lab.dmg',
        '/tmp/guest/opl-first-run-vm-smoke.mjs',
        '/tmp/guest/artifacts',
        '/tmp/guest/codex-api-key.txt'
      );
      expect(command).toContain("--codex-package-tarball '/tmp/guest/codex-package.tgz'");
      expect(command).toContain("--codex-platform-package-tarball '/tmp/guest/codex-platform-package.tgz'");
      expect(command).toContain("--codex-npm-cache-dir '/tmp/guest/codex-npm-cache'");

      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--install-mode',
          'homebrew-cask',
          '--homebrew-cask',
          'one-person-lab',
          '--codex-package-tarball',
          path.join(root, 'missing.tgz'),
        ])
      ).toThrow(/codex-package-tarball/);
      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--install-mode',
          'homebrew-cask',
          '--homebrew-cask',
          'one-person-lab',
          '--codex-platform-package-tarball',
          path.join(root, 'missing-platform.tgz'),
        ])
      ).toThrow(/codex-platform-package-tarball/);
      expect(() =>
        tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--install-mode',
          'homebrew-cask',
          '--homebrew-cask',
          'one-person-lab',
          '--codex-npm-cache-dir',
          tarball,
        ])
      ).toThrow(/codex-npm-cache-dir/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('summarizes Tart host stage timings without depending on VM execution', () => {
    const at = (startedAtMs: number, stage: string) => ({
      stage,
      startedAtMs,
      startedAt: new Date(startedAtMs).toISOString(),
    });

    const summary = tartSmoke.buildStageTimingSummary(
      [at(1_000, 'clone_vm'), at(3_500, 'homebrew_cask_install'), at(9_000, 'run_guest_smoke')],
      12_500
    );

    expect(summary).toMatchObject({
      status: 'available',
      total_elapsed_ms: 11_500,
      last_stage: 'run_guest_smoke',
      stages: [
        { stage: 'clone_vm', duration_ms: 2_500 },
        { stage: 'homebrew_cask_install', duration_ms: 5_500 },
        { stage: 'run_guest_smoke', duration_ms: 3_500 },
      ],
      slowest_stages: [
        { stage: 'homebrew_cask_install', duration_ms: 5_500 },
        { stage: 'run_guest_smoke', duration_ms: 3_500 },
        { stage: 'clone_vm', duration_ms: 2_500 },
      ],
    });
  });

  it('retains a failed Tart stop after delete succeeds and exact VM absence is proven', () => {
    const actions: string[] = [];
    const cleanup = tartSmoke.stopAndDeleteVm(
      { vmName: 'opl-cleanup-stop-failure', keepVm: false },
      {
        runAction(action: string) {
          actions.push(action);
          if (action === 'stop') throw Object.assign(new Error('stop failed'), { code: 'STOP_FAILED' });
        },
        inspectVm() {
          return { present: false, running: false, state: 'absent' };
        },
      }
    );

    expect(actions).toEqual(['stop', 'delete']);
    expect(cleanup.receipt).toMatchObject({
      status: 'failed',
      classification: 'vm_cleanup_failure',
      required_final_state: 'absent',
      actions: {
        stop: {
          status: 'failed',
          failure: {
            classification: 'vm_cleanup_stop_failure',
            code: 'STOP_FAILED',
            message: 'stop failed',
          },
        },
        delete: { status: 'passed' },
      },
      inspection: { status: 'passed', present: false, state: 'absent' },
      failure_reasons: ['stop_action_failed'],
      cleanup_finished: false,
    });
    expect(cleanup.error).toMatchObject({ code: 'VM_CLEANUP_FAILURE' });
    expect(tartSmoke.selectFirstRunTartTerminalError(null, null, cleanup.error)).toBe(cleanup.error);
  });

  it('accepts an exact already-stopped result only after delete and exact absence both pass', () => {
    const vmName = 'opl-cleanup-already-stopped';
    const stopDiagnostic = [`tart stop ${vmName} exited with 2`, 'stderr:', `VM "${vmName}" is not running`].join('\n');
    const actions: string[] = [];
    const cleanup = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: false },
      {
        runAction(action: string) {
          actions.push(action);
          if (action === 'stop') throw new Error(stopDiagnostic);
        },
        inspectVm() {
          return { present: false, running: false, state: 'absent' };
        },
      }
    );

    expect(actions).toEqual(['stop', 'delete']);
    expect(cleanup.receipt).toMatchObject({
      status: 'passed',
      actions: {
        stop: {
          status: 'failed',
          already_stopped: true,
          accepted_as_idempotent: true,
          failure: {
            classification: 'vm_cleanup_stop_failure',
            message: stopDiagnostic,
          },
        },
        delete: { status: 'passed' },
      },
      inspection: { status: 'passed', present: false, state: 'absent' },
      failure_reasons: [],
      cleanup_finished: true,
    });
    expect(cleanup.error).toBeNull();
  });

  it('rejects already-stopped idempotency unless every cleanup proof is exact and successful', () => {
    const vmName = 'opl-cleanup-idempotency-rejected';
    const exactDiagnostic = [`tart stop ${vmName} exited with 2`, 'stderr:', `VM "${vmName}" is not running`].join(
      '\n'
    );
    const alreadyStoppedError = () => new Error(exactDiagnostic);

    const deleteFailed = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: false },
      {
        runAction(action: string) {
          if (action === 'stop') throw alreadyStoppedError();
          throw new Error('delete failed');
        },
        inspectVm() {
          return { present: false, running: false, state: 'absent' };
        },
      }
    );
    const inspectionFailed = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: false },
      {
        runAction(action: string) {
          if (action === 'stop') throw alreadyStoppedError();
        },
        inspectVm() {
          throw new Error('inventory unavailable');
        },
      }
    );
    const stillPresent = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: false },
      {
        runAction(action: string) {
          if (action === 'stop') throw alreadyStoppedError();
        },
        inspectVm() {
          return { present: true, running: false, state: 'stopped' };
        },
      }
    );
    const unknownState = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: false },
      {
        runAction(action: string) {
          if (action === 'stop') throw alreadyStoppedError();
        },
        inspectVm() {
          return { present: false, running: false, state: 'unknown' };
        },
      }
    );
    const keptVm = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: true },
      {
        runAction() {
          throw alreadyStoppedError();
        },
        inspectVm() {
          return { present: true, running: false, state: 'stopped' };
        },
      }
    );
    const nonExactDiagnostic = tartSmoke.stopAndDeleteVm(
      { vmName, keepVm: false },
      {
        runAction(action: string) {
          if (action === 'stop') {
            throw new Error(`tart stop ${vmName} exited with 2\nstderr:\nVM is not running`);
          }
        },
        inspectVm() {
          return { present: false, running: false, state: 'absent' };
        },
      }
    );

    expect(deleteFailed.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { already_stopped: true, accepted_as_idempotent: false } },
      failure_reasons: ['stop_action_failed', 'delete_action_failed'],
      cleanup_finished: false,
    });
    expect(inspectionFailed.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { already_stopped: true, accepted_as_idempotent: false } },
      inspection: { status: 'failed', state: 'unknown' },
      failure_reasons: ['stop_action_failed', 'final_state_inspection_failed'],
      cleanup_finished: false,
    });
    expect(stillPresent.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { already_stopped: true, accepted_as_idempotent: false } },
      failure_reasons: ['stop_action_failed', 'vm_still_present'],
      cleanup_finished: false,
    });
    expect(unknownState.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { already_stopped: true, accepted_as_idempotent: false } },
      failure_reasons: ['stop_action_failed', 'vm_final_state_not_absent'],
      cleanup_finished: false,
    });
    expect(keptVm.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { already_stopped: true, accepted_as_idempotent: false } },
      failure_reasons: ['stop_action_failed'],
      cleanup_finished: false,
    });
    expect(nonExactDiagnostic.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { already_stopped: false, accepted_as_idempotent: false } },
      failure_reasons: ['stop_action_failed'],
      cleanup_finished: false,
    });
  });

  it('fails closed when Tart delete fails even if the final inventory is already absent', () => {
    const cleanup = tartSmoke.stopAndDeleteVm(
      { vmName: 'opl-cleanup-delete-failure', keepVm: false },
      {
        runAction(action: string) {
          if (action === 'delete') throw Object.assign(new Error('delete failed'), { code: 'DELETE_FAILED' });
        },
        inspectVm() {
          return { present: false, running: false, state: 'absent' };
        },
      }
    );

    expect(cleanup.receipt).toMatchObject({
      status: 'failed',
      actions: { stop: { status: 'passed' }, delete: { status: 'failed' } },
      inspection: { present: false },
      failure_reasons: ['delete_action_failed'],
      cleanup_finished: false,
    });
  });

  it('requires independent exact VM absence and a successful inventory readback', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-tart-smoke.mjs'), 'utf8');
    const stillPresent = tartSmoke.stopAndDeleteVm(
      { vmName: 'opl-cleanup-present', keepVm: false },
      {
        runAction() {},
        inspectVm() {
          return { present: true, running: false, state: 'stopped' };
        },
      }
    );
    const unreadable = tartSmoke.stopAndDeleteVm(
      { vmName: 'opl-cleanup-unreadable', keepVm: false },
      {
        runAction() {},
        inspectVm() {
          throw Object.assign(new Error('tart list --source local --format json timed out'), { code: 'ETIMEDOUT' });
        },
      }
    );

    expect(stillPresent.receipt.failure_reasons).toEqual(['vm_still_present']);
    expect(stillPresent.receipt.inspection).toMatchObject({ status: 'passed', present: true });
    expect(unreadable.receipt.failure_reasons).toEqual(['final_state_inspection_failed']);
    expect(unreadable.receipt.inspection).toMatchObject({
      status: 'failed',
      failure: {
        classification: 'vm_cleanup_inspection_failure',
        code: 'ETIMEDOUT',
        message: 'tart list --source local --format json timed out',
      },
    });
    expect(scriptSource).toContain('const TART_CLEANUP_COMMAND_TIMEOUT_MS = 30_000;');
    expect(scriptSource).toContain('timeout: TART_CLEANUP_COMMAND_TIMEOUT_MS');
  });

  it('keeps the primary failure terminal while persisting typed cleanup evidence', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-primary-cleanup-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const primaryError = new Error('primary smoke failure');
    const artifactPullError = new Error('artifact pull failure');

    try {
      tartSmoke.__setRuntimeStateForTest({
        options,
        stage: 'run_guest_smoke',
        vmLogPath,
        cleanupStarted: false,
        cleanupResult: null,
      });
      const cleanup = await tartSmoke.cleanupRuntime({
        copyGuestArtifacts: false,
        reason: 'test_primary_failure',
        vmCleanupDependencies: {
          runAction(action: string) {
            if (action === 'delete') throw new Error('delete failed');
          },
          inspectVm() {
            return { present: true, running: false, state: 'stopped' };
          },
        },
      });
      expect(tartSmoke.selectFirstRunTartTerminalError(primaryError, artifactPullError, cleanup.cleanupError)).toBe(
        primaryError
      );
      expect(tartSmoke.selectFirstRunTartTerminalError(null, artifactPullError, cleanup.cleanupError)).toBe(
        artifactPullError
      );
      tartSmoke.writeFailedSummary(options, '', '', primaryError, {
        primaryError,
        artifactPullError,
        cleanupError: cleanup.cleanupError,
      });
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));
      const cleanupReceipt = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-vm-cleanup-receipt.json'), 'utf8'));
      const runtimeLog = fs.readFileSync(vmLogPath, 'utf8');
      expect(summary).toMatchObject({
        status: 'failed',
        error: 'primary smoke failure',
        error_classification: { classification: 'qualification_stage_failure' },
        primary_error: { message: 'primary smoke failure' },
        artifact_pull_error: { message: 'artifact pull failure' },
        cleanup_error: {
          classification: 'vm_cleanup_failure',
          code: 'VM_CLEANUP_FAILURE',
          message: expect.stringContaining('delete failed'),
        },
        vm_cleanup: {
          status: 'failed',
          failure_reasons: ['delete_action_failed', 'vm_still_present'],
        },
      });
      expect(cleanupReceipt).toEqual(cleanup.vmCleanupReceipt);
      expect(runtimeLog).toContain('vm_cleanup_result status=failed required_final_state=absent');
      expect(runtimeLog).not.toContain('cleanup_finished');
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('shares in-flight cleanup across reentry until VM absence is proven', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-cleanup-reentry-'));
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--vm-name',
      'opl-cleanup-reentry-fixture',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const actions: string[] = [];
    let releaseCopy = () => {};
    const copyBarrier = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });

    try {
      tartSmoke.__setRuntimeStateForTest({
        options,
        ip: '192.168.64.10',
        guestArtifactDir: '/tmp/guest/artifacts',
        copiedArtifacts: false,
        cleanupStarted: false,
        cleanupPromise: null,
        cleanupResult: null,
      });
      const cleanupOptions = {
        copyGuestArtifacts: true,
        reason: 'test_cleanup_reentry',
        copyArtifacts: () => copyBarrier,
        vmCleanupDependencies: {
          runAction(action: string) {
            actions.push(action);
          },
          inspectVm() {
            actions.push('inspect');
            return { present: false, running: false, state: 'absent' };
          },
        },
      };
      const firstCleanup = tartSmoke.cleanupRuntime(cleanupOptions);
      const reentrantCleanup = tartSmoke.cleanupRuntime({
        copyGuestArtifacts: false,
        reason: 'signal:SIGTERM',
      });
      let reentrantSettled = false;
      void reentrantCleanup.finally(() => {
        reentrantSettled = true;
      });

      await Promise.resolve();
      expect(firstCleanup).toBe(reentrantCleanup);
      expect(reentrantSettled).toBe(false);
      expect(actions).toEqual([]);

      releaseCopy();
      const [firstResult, reentrantResult] = await Promise.all([firstCleanup, reentrantCleanup]);
      expect(firstResult).toBe(reentrantResult);
      expect(actions).toEqual(['stop', 'delete', 'inspect']);
      expect(reentrantResult.vmCleanupReceipt).toMatchObject({
        status: 'passed',
        required_final_state: 'absent',
        inspection: { status: 'passed', present: false, state: 'absent' },
        cleanup_finished: true,
      });
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('continues through Tart absence verification after ancillary credential cleanup fails', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-ancillary-cleanup-failure-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const credentialTempDir = path.join(artifacts, 'credential-temp');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--vm-name',
      'opl-ancillary-cleanup-failure-fixture',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const actions: string[] = [];
    const credentialError = Object.assign(new Error(`EACCES: cannot remove '${credentialTempDir}'`), {
      code: 'EACCES',
      path: credentialTempDir,
    });

    try {
      tartSmoke.__setRuntimeStateForTest({
        options,
        vmLogPath,
        codexApiKeyFile: { temporary: true, tempDir: credentialTempDir },
        cleanupStarted: false,
        cleanupPromise: null,
        cleanupResult: null,
      });
      const cleanup = await tartSmoke.cleanupRuntime({
        copyGuestArtifacts: false,
        reason: 'test_ancillary_cleanup_failure',
        ancillaryCleanupDependencies: {
          removeCredentialTemp() {
            throw credentialError;
          },
        },
        vmCleanupDependencies: {
          runAction(action: string) {
            actions.push(action);
          },
          inspectVm() {
            actions.push('inspect');
            return { present: false, running: false, state: 'absent' };
          },
        },
      });
      tartSmoke.writeFailedSummary(options, '', '', cleanup.cleanupError, {
        cleanupError: cleanup.cleanupError,
      });
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));

      expect(actions).toEqual(['stop', 'delete', 'inspect']);
      expect(cleanup.cleanupError).toMatchObject({
        code: 'VM_CLEANUP_FAILURE',
        message: expect.stringContaining(credentialError.message),
      });
      expect(tartSmoke.selectFirstRunTartTerminalError(null, null, cleanup.cleanupError)).toBe(cleanup.cleanupError);
      expect(cleanup.vmCleanupReceipt).toMatchObject({
        status: 'failed',
        classification: 'vm_cleanup_failure',
        ancillary_actions: {
          credential_temp_cleanup: {
            status: 'failed',
            failure: {
              classification: 'vm_cleanup_credential_temp_failure',
              code: 'EACCES',
              path: credentialTempDir,
              message: credentialError.message,
            },
          },
        },
        actions: { stop: { status: 'passed' }, delete: { status: 'passed' } },
        inspection: { status: 'passed', present: false, state: 'absent' },
        failure_reasons: ['credential_temp_cleanup_failed'],
        cleanup_finished: false,
      });
      expect(summary).toMatchObject({
        status: 'failed',
        cleanup_error: {
          classification: 'vm_cleanup_failure',
          message: expect.stringContaining(credentialError.message),
        },
        vm_cleanup: cleanup.vmCleanupReceipt,
      });
      expect(fs.readFileSync(vmLogPath, 'utf8')).toContain(
        `credential_temp_cleanup_failed code=EACCES path=${credentialTempDir} message=${credentialError.message}`
      );
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('keeps the VM by stopping only and writes a secret-free successful cleanup receipt', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-keep-vm-cleanup-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--vm-name',
      'opl-keep-vm-fixture',
      '--artifacts',
      artifacts,
      '--keep-vm',
      '--dry-run',
    ]);
    const actions: string[] = [];

    try {
      tartSmoke.__setRuntimeStateForTest({ options, vmLogPath, cleanupStarted: false, cleanupResult: null });
      const cleanup = await tartSmoke.cleanupRuntime({
        copyGuestArtifacts: false,
        reason: 'test_keep_vm',
        vmCleanupDependencies: {
          runAction(action: string) {
            actions.push(action);
          },
          inspectVm() {
            return { present: true, running: false, state: 'stopped' };
          },
        },
      });
      const receiptPath = path.join(artifacts, 'tart-vm-cleanup-receipt.json');
      const receiptBytes = fs.readFileSync(receiptPath, 'utf8');

      expect(actions).toEqual(['stop']);
      expect(cleanup.cleanupError).toBeNull();
      expect(cleanup.vmCleanupReceipt).toMatchObject({
        schema: 'opl_tart_vm_cleanup_receipt.v1',
        status: 'passed',
        keep_vm: true,
        required_final_state: 'stopped_and_present',
        actions: { stop: { status: 'passed' }, delete: { status: 'skipped_keep_vm', attempted: false } },
        inspection: { present: true, running: false, state: 'stopped' },
        failure_reasons: [],
        cleanup_finished: true,
      });
      expect(JSON.parse(receiptBytes)).toEqual(cleanup.vmCleanupReceipt);
      expect(receiptBytes).not.toMatch(/api[_-]?key|token|secret/i);
      expect(fs.readFileSync(vmLogPath, 'utf8')).toContain(
        'vm_cleanup_result status=passed required_final_state=stopped_and_present'
      );
      expect(fs.readFileSync(vmLogPath, 'utf8')).toContain('cleanup_finished');
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('retains typed filesystem diagnostics when the VM cleanup receipt cannot be written', async () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-cleanup-receipt-write-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--vm-name',
      'opl-cleanup-receipt-write-fixture',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const receiptPath = path.join(artifacts, 'tart-vm-cleanup-receipt.json');
    const writeError = Object.assign(new Error(`EACCES: permission denied, open '${receiptPath}'`), {
      code: 'EACCES',
      path: receiptPath,
    });

    try {
      tartSmoke.__setRuntimeStateForTest({ options, vmLogPath, cleanupStarted: false, cleanupResult: null });
      const cleanup = await tartSmoke.cleanupRuntime({
        copyGuestArtifacts: false,
        reason: 'test_cleanup_receipt_write_failure',
        vmCleanupDependencies: {
          runAction() {},
          inspectVm() {
            return { present: false, running: false, state: 'absent' };
          },
        },
        writeCleanupReceipt() {
          throw writeError;
        },
      });
      tartSmoke.writeFailedSummary(options, '', '', cleanup.cleanupError, {
        cleanupError: cleanup.cleanupError,
      });
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));
      const runtimeLog = fs.readFileSync(vmLogPath, 'utf8');

      expect(cleanup.cleanupError).toMatchObject({
        code: 'VM_CLEANUP_FAILURE',
        message: expect.stringContaining(writeError.message),
      });
      expect(tartSmoke.selectFirstRunTartTerminalError(null, null, cleanup.cleanupError)).toBe(cleanup.cleanupError);
      expect(cleanup.vmCleanupReceipt).toMatchObject({
        status: 'failed',
        receipt_write: {
          status: 'failed',
          failure: {
            classification: 'vm_cleanup_receipt_write_failure',
            code: 'EACCES',
            path: receiptPath,
            message: writeError.message,
          },
        },
        failure_reasons: ['cleanup_receipt_write_failed'],
        cleanup_finished: false,
      });
      expect(summary).toMatchObject({
        status: 'failed',
        failure_stage: expect.any(String),
        cleanup_error: {
          classification: 'vm_cleanup_failure',
          code: 'VM_CLEANUP_FAILURE',
          message: expect.stringContaining(writeError.message),
        },
        vm_cleanup: cleanup.vmCleanupReceipt,
      });
      expect(runtimeLog).toContain(
        `vm_cleanup_receipt_write_failed code=EACCES path=${receiptPath} message=${writeError.message}`
      );
      expect(fs.existsSync(receiptPath)).toBe(false);
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('writes a failed summary after terminal success-summary I/O fails and preserves cleanup evidence', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-terminal-summary-write-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--vm-name',
      'opl-terminal-summary-write-fixture',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const summaryPath = path.join(artifacts, 'tart-smoke-summary.json');
    const summaryError = Object.assign(new Error(`EIO: output failed, write '${summaryPath}'`), {
      code: 'EIO',
      path: summaryPath,
    });
    const vmCleanupReceipt = {
      schema: 'opl_tart_vm_cleanup_receipt.v1',
      status: 'passed',
      cleanup_finished: true,
    };

    try {
      tartSmoke.__setRuntimeStateForTest({ options, vmLogPath, vmCleanupReceipt });
      expect(() =>
        tartSmoke.writeTerminalSummary(options, '', '', {
          writeSuccessSummary() {
            throw summaryError;
          },
        })
      ).toThrow(summaryError);
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      const runtimeLog = fs.readFileSync(vmLogPath, 'utf8');

      expect(summary).toMatchObject({
        status: 'failed',
        failure_stage: 'write_summary',
        error: summaryError.message,
        error_classification: {
          classification: 'qualification_stage_failure',
          code: 'EIO',
          path: summaryPath,
          message: summaryError.message,
        },
        vm_cleanup: vmCleanupReceipt,
      });
      expect(runtimeLog).toContain(`write_summary_failed code=EIO path=${summaryPath} message=${summaryError.message}`);
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not let failed-summary I/O replace the original success-summary error', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-terminal-summary-fallback-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const summaryError = Object.assign(new Error('terminal summary failed'), { code: 'EIO' });
    const fallbackError = Object.assign(new Error('failed summary also failed'), { code: 'ENOSPC' });

    try {
      tartSmoke.__setRuntimeStateForTest({ options, vmLogPath });
      expect(() =>
        tartSmoke.writeTerminalSummary(options, '', '', {
          writeSuccessSummary() {
            throw summaryError;
          },
          writeFailureSummary() {
            throw fallbackError;
          },
        })
      ).toThrow(summaryError);
      const runtimeLog = fs.readFileSync(vmLogPath, 'utf8');
      expect(runtimeLog).toContain('write_summary_failed code=EIO path=none message=terminal summary failed');
      expect(runtimeLog).toContain(
        'write_failed_summary_failed code=ENOSPC path=none message=failed summary also failed'
      );
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not let failed-summary I/O replace a selected primary terminal error', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-primary-summary-fallback-'));
    const vmLogPath = path.join(artifacts, 'tart-run.log');
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);
    const primaryError = Object.assign(new Error('primary smoke failure'), { code: 'PRIMARY_FAILED' });
    const summaryError = Object.assign(new Error('failed summary write failed'), { code: 'ENOSPC' });

    try {
      tartSmoke.__setRuntimeStateForTest({ options, vmLogPath });
      let observedError: unknown = null;
      try {
        throw tartSmoke.writeTerminalFailureSummary(
          options,
          '',
          '',
          primaryError,
          { primaryError },
          {
            writeFailureSummary() {
              throw summaryError;
            },
          }
        );
      } catch (error) {
        observedError = error;
      }
      expect(observedError).toBe(primaryError);
      expect(fs.readFileSync(vmLogPath, 'utf8')).toContain(
        'write_failed_summary_failed code=ENOSPC path=none message=failed summary write failed'
      );
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('requires the guest Codex functional check receipt when requested', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--codex-functional-check',
      ...fullMasProvisioningTransportArgs(),
      '--dry-run',
    ]);

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
        codex_functional_check: {
          status: 'diagnostic_skipped',
          blocking_release_gate: {
            deterministic_fields_passed: true,
            llm_invocation_required: false,
          },
        },
      })
    ).not.toThrow();

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
      })
    ).toThrow(/Codex functional check/);
  });

  it('does not fail the Tart release gate when optional Codex AI self-check is skipped', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--codex-ai-self-check',
      ...fullMasProvisioningTransportArgs(),
      '--dry-run',
    ]);

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
        codex_functional_check: {
          status: 'diagnostic_skipped',
          blocking_release_gate: {
            deterministic_fields_passed: true,
            llm_invocation_required: false,
          },
        },
        codex_ai_self_check: {
          schema: 'opl_codex_ai_self_check_receipt.v1',
          status: 'skipped_missing_codex_config',
          blocking_release_gate: false,
        },
      })
    ).not.toThrow();
  });

  it('passes an explicit current-source Framework archive into the packaged Tart smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--framework-source-archive',
      '/tmp/current-framework.tar.gz',
      '--framework-install-script',
      '/tmp/current-install.sh',
      '--guest-workdir',
      '/tmp/guest',
      '--dry-run',
    ]);

    expect(options.frameworkSourceArchive).toBe('/tmp/current-framework.tar.gz');

    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.framework_source_archive).toEqual({
      evidence_role: 'current_source_framework_archive',
      host_path: '/tmp/current-framework.tar.gz',
      guest_path: '/tmp/guest/current-framework.tar.gz',
      install_script_host_path: '/tmp/current-install.sh',
      install_script_guest_path: '/tmp/guest/opl-framework-install.sh',
      install_script_url: 'file:///tmp/guest/opl-framework-install.sh',
      install_source_mode: 'archive',
      source_archive_url: 'file:///tmp/guest/current-framework.tar.gz',
    });

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt',
      '/tmp/guest/current-framework.tar.gz',
      '/tmp/guest/opl-framework-install.sh'
    );
    expect(command).toContain('launchctl setenv OPL_INSTALL_SOURCE_MODE');
    expect(command).toContain('launchctl setenv OPL_SOURCE_ARCHIVE_URL');
    expect(command).toContain('launchctl setenv OPL_INSTALL_SCRIPT_URL');
    expect(command).toContain("export OPL_INSTALL_SOURCE_MODE='archive'");
    expect(command).toContain("export OPL_SOURCE_ARCHIVE_URL='file:///tmp/guest/current-framework.tar.gz'");
    expect(command).toContain("export OPL_INSTALL_SCRIPT_URL='file:///tmp/guest/opl-framework-install.sh'");

    expect(tartSmoke.frameworkInstallScriptFinalizeCommand(options)).toContain(
      "mv '/tmp/guest/current-install.sh' '/tmp/guest/opl-framework-install.sh'"
    );
    expect(tartSmoke.frameworkInstallScriptFinalizeCommand(options)).toContain(
      "chmod +x '/tmp/guest/opl-framework-install.sh'"
    );
  });

  it('writes a structured Tart summary when guest smoke fails after artifacts were copied', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-failed-summary-'));
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--settings-smoke',
      '--assistant-route-smoke',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);

    try {
      fs.mkdirSync(path.join(artifacts, 'artifacts'), { recursive: true });
      fs.writeFileSync(
        path.join(artifacts, 'artifacts', 'smoke-summary.json'),
        `${JSON.stringify({
          status: 'failed',
          runtime_profile: 'standard',
          settings_smoke: {
            status: 'passed',
            pages: ['overview', 'runtime'],
            runtime_action_evidence_status: 'blocked',
          },
          assistant_route_smoke: null,
        })}\n`
      );

      tartSmoke.writeFailedSummary(options, '192.168.64.10', '/tmp/guest/artifacts', new Error('guest failed'));
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));

      expect(summary).toMatchObject({
        surface_id: 'opl_tart_gui_first_run_smoke',
        status: 'failed',
        error: 'guest failed',
        runtime_profile: 'standard',
        guest_ip: '192.168.64.10',
        guest_artifacts: '/tmp/guest/artifacts',
        settings_smoke: {
          status: 'passed',
          runtime_action_evidence_status: 'blocked',
        },
      });
      expect(summary.stage_timing).toMatchObject({
        status: expect.stringMatching(/^(available|missing)$/),
        stages: expect.any(Array),
      });
      expect(summary.guest_summary.status).toBe('failed');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('writes interrupted Tart summary after signal artifact recovery state is updated', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-tart-interrupted-summary-'));
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--runtime-profile',
      'standard',
      '--settings-smoke',
      '--artifacts',
      artifacts,
      '--dry-run',
    ]);

    try {
      fs.mkdirSync(path.join(artifacts, 'artifacts'), { recursive: true });
      fs.writeFileSync(
        path.join(artifacts, 'artifacts', 'smoke-summary.json'),
        `${JSON.stringify({
          status: 'failed',
          runtime_profile: 'standard',
          labels: ['launch-app'],
          computer_use_qualification: createPassedComputerUseQualification('standard'),
        })}\n`
      );

      tartSmoke.__setRuntimeStateForTest({
        options,
        stage: 'run_guest_smoke',
        ip: '192.168.64.10',
        guestArtifactDir: '/tmp/guest/artifacts',
        copiedArtifacts: true,
      });
      tartSmoke.writeInterruptedSummary('SIGTERM');
      const summary = JSON.parse(fs.readFileSync(path.join(artifacts, 'tart-smoke-summary.json'), 'utf8'));

      expect(summary).toMatchObject({
        surface_id: 'opl_tart_gui_first_run_smoke',
        status: 'interrupted',
        signal: 'SIGTERM',
        stage: 'run_guest_smoke',
        guest_ip: '192.168.64.10',
        guest_artifacts: '/tmp/guest/artifacts',
        copied_guest_artifacts: true,
        computer_use_qualification: createPassedComputerUseQualification('standard'),
      });
      expect(summary.guest_summary).toMatchObject({
        status: 'failed',
        labels: ['launch-app'],
      });
    } finally {
      tartSmoke.__resetRuntimeStateForTest();
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not require the Codex config wizard for full VM smokes by default', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab-Full.dmg',
      '--runtime-profile',
      'full',
      '--dry-run',
    ]);
    expect(options.requireCodexConfigWizard).toBe(false);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab-Full.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).not.toContain('--require-codex-config-wizard');
    expect(command).not.toContain('--codex-api-key-file');

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
      })
    ).not.toThrow();
  });

  it('fails closed when a Full guest summary omits the Temporal supervisor proof', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab-Full.dmg',
      '--runtime-profile',
      'full',
      '--dry-run',
    ]);

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
      })
    ).toThrow(/Temporal service supervisor lifecycle/);
  });

  it('can still explicitly require the Codex config wizard for targeted wizard smokes', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab-Full.dmg',
      '--runtime-profile',
      'full',
      '--require-codex-config-wizard',
      '--codex-api-key-file',
      '/tmp/explicit-provider-compatibility-key.txt',
      '--dry-run',
    ]);
    expect(options.requireCodexConfigWizard).toBe(true);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab-Full.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--require-codex-config-wizard');
    expect(command).toContain('--codex-api-key-file');

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
      })
    ).toThrow(/Codex configuration wizard/);
  });

  it('rejects a targeted Codex wizard smoke without an explicit credential file', () => {
    expect(() =>
      tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab-Full.dmg',
        '--runtime-profile',
        'full',
        '--require-codex-config-wizard',
        '--dry-run',
      ])
    ).toThrow(/requires --codex-api-key-file/);
  });

  it('copies only an explicitly supplied Provider compatibility credential', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-provider-compatibility-'));
    const sourcePath = path.join(root, 'codex-api-key.txt');
    fs.writeFileSync(sourcePath, 'explicit-test-credential\n', 'utf8');
    let prepared: { path: string; tempDir: string } | null = null;
    try {
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab-Full.dmg',
        '--codex-api-key-file',
        sourcePath,
        '--dry-run',
      ]);
      prepared = tartSmoke.prepareHostCodexApiKeyFile(options);
      expect(prepared).not.toBeNull();
      expect(fs.readFileSync(prepared!.path, 'utf8')).toBe('explicit-test-credential\n');
      expect(tartSmoke.buildDryRunPlan(options).provider_configuration).toMatchObject({
        status: 'requested',
        requested: true,
        credential_present: true,
        mutation_performed: false,
        blocking_release_gate: false,
      });
    } finally {
      if (prepared) fs.rmSync(prepared.tempDir, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stages a requested connected VM credential from the selected developer host Codex Provider', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-host-codex-provider-'));
    const configPath = path.join(root, 'config.toml');
    writeFile(
      configPath,
      [
        'model_provider = "oplgateway"',
        '[model_providers.oplgateway]',
        'name = "OPL Gateway"',
        'base_url = "https://gateway.medopl.com/v1/"',
        'experimental_bearer_token = "host-selected-test-credential"',
        'wire_api = "responses"',
        '',
      ].join('\n'),
      0o600
    );
    let prepared: { path: string; tempDir: string } | null = null;
    try {
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--runtime-profile',
        'standard',
        '--codex-ai-self-check',
        '--host-codex-config',
        configPath,
        '--dry-run',
      ]);
      prepared = tartSmoke.prepareHostCodexApiKeyFile(options);
      expect(prepared).toMatchObject({
        source: 'developer_host_codex_selected_provider',
        providerBaseUrl: 'https://gateway.medopl.com/v1/',
      });
      expect(fs.readFileSync(prepared!.path, 'utf8')).toBe('host-selected-test-credential\n');
      expect(fs.statSync(prepared!.path).mode & 0o777).toBe(0o600);
      expect(options.providerCredentialPresent).toBe(true);
      expect(options.providerCredentialResolution).toMatchObject({
        status: 'available',
        source: 'developer_host_codex_selected_provider',
        base_url_matches_opl_gateway: true,
        credential_present: true,
      });

      const command = tartSmoke.guestSmokeCommand(
        options,
        '/tmp/guest/One-Person-Lab.dmg',
        '/tmp/guest/opl-first-run-vm-smoke.mjs',
        '/tmp/guest/artifacts',
        '/tmp/guest/codex-api-key.txt'
      );
      expect(command).toContain("--codex-provider-base-url 'https://gateway.medopl.com/v1/'");
      expect(command).toContain("--provider-credential-source 'developer_host_codex_selected_provider'");
      expect(command).toContain('--codex-api-key-file');
      expect(command).not.toContain('host-selected-test-credential');
      expect(tartSmoke.buildDryRunPlan(options).provider_configuration).toMatchObject({
        status: 'requested',
        credential_source: 'developer_host_codex_selected_provider',
        base_url_matches_opl_gateway: true,
        manual_user_input_required: false,
      });
    } finally {
      if (prepared) fs.rmSync(prepared.tempDir, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stages a requested connected VM credential from a legacy OPL Gateway URL without migrating it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-host-codex-provider-legacy-'));
    const configPath = path.join(root, 'config.toml');
    writeFile(
      configPath,
      [
        'model_provider = "gflabtoken"',
        '[model_providers.gflabtoken]',
        'name = "gflabtoken"',
        'base_url = "https://gflabtoken.cn/v1/"',
        'experimental_bearer_token = "legacy-host-credential"',
        '',
      ].join('\n'),
      0o600
    );
    let prepared: { path: string; tempDir: string } | null = null;
    try {
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--runtime-profile',
        'standard',
        '--codex-ai-self-check',
        '--host-codex-config',
        configPath,
        '--dry-run',
      ]);
      prepared = tartSmoke.prepareHostCodexApiKeyFile(options);
      expect(prepared).toMatchObject({
        source: 'developer_host_codex_selected_provider',
        providerBaseUrl: 'https://gflabtoken.cn/v1/',
      });
      expect(options.providerCredentialResolution).toMatchObject({
        status: 'available',
        selected_provider: 'gflabtoken',
        base_url_matches_opl_gateway: true,
      });
      expect(fs.readFileSync(prepared!.path, 'utf8')).toBe('legacy-host-credential\n');
    } finally {
      if (prepared) fs.rmSync(prepared.tempDir, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to reuse a selected host Codex key for a different Provider Base URL', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-host-codex-provider-mismatch-'));
    const configPath = path.join(root, 'config.toml');
    try {
      writeFile(
        configPath,
        [
          'model_provider = "custom"',
          '[model_providers.custom]',
          'base_url = "https://provider.example/v1"',
          'experimental_bearer_token = "must-not-be-staged"',
          '',
        ].join('\n'),
        0o600
      );
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--runtime-profile',
        'standard',
        '--codex-ai-self-check',
        '--host-codex-config',
        configPath,
        '--dry-run',
      ]);
      expect(tartSmoke.prepareHostCodexApiKeyFile(options)).toBeNull();
      expect(options.providerCredentialResolution).toMatchObject({
        status: 'unavailable',
        reason: 'selected_host_codex_provider_base_url_mismatch',
        credential_present: true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts the Framework-selected empty companion skill set while requiring packaged tools and domain plugins', () => {
    const fixture = createFullRuntimeEquivalenceFixture();
    try {
      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).not.toThrow();

      expect(fs.existsSync(path.join(fixture.codexHome, 'skills', 'officecli', 'SKILL.md'))).toBe(false);
      expect(fs.existsSync(path.join(fixture.runtimeHome, 'skills', 'officecli', 'SKILL.md'))).toBe(false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('passes assistant route smoke through the Tart host command and plan', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--assistant-route-smoke',
      ...fullMasProvisioningTransportArgs(),
      '--dry-run',
    ]);

    expect(options.assistantRouteSmoke).toBe(true);
    const plan = tartSmoke.buildDryRunPlan(options);
    expect(plan.assistant_route_smoke).toBe(true);
    expect(plan.cdp_port).toBe(options.cdpPort);

    const command = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/One-Person-Lab.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(command).toContain('--assistant-route-smoke');
    expect(command).toContain('--cdp-port');
  });

  it('resolves guest node root through symlinked node binaries before copying to the guest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-root-'));
    try {
      const linkedRoot = path.join(root, 'homebrew');
      const realRoot = path.join(root, 'Cellar', 'node', '26.0.0');
      fs.mkdirSync(path.join(linkedRoot, 'bin'), { recursive: true });
      fs.mkdirSync(path.join(realRoot, 'bin'), { recursive: true });
      writeFile(path.join(realRoot, 'bin', 'node'), '#!/bin/sh\n', 0o755);
      fs.symlinkSync(path.join(realRoot, 'bin', 'node'), path.join(linkedRoot, 'bin', 'node'));

      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--guest-node-root',
        linkedRoot,
        '--dry-run',
      ]);

      const expectedRoot = fs.realpathSync(realRoot);
      expect(options.guestNodeRoot).toBe(expectedRoot);
      expect(tartSmoke.buildDryRunPlan(options).guest_node_root).toBe(expectedRoot);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans guest node root staging as a content-hash reusable VM cache', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-cache-'));
    try {
      const nodeRoot = path.join(root, 'node-v22.21.1');
      writeFile(path.join(nodeRoot, 'bin', 'node'), '#!/bin/sh\n', 0o755);
      writeFile(path.join(nodeRoot, 'lib', 'node_modules', 'npm', 'package.json'), '{"name":"npm"}\n');

      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--dmg',
        '/tmp/One-Person-Lab.dmg',
        '--guest-node-root',
        nodeRoot,
        '--guest-workdir',
        '/tmp/guest',
        '--dry-run',
      ]);
      const staging = tartSmoke.guestNodeStagingPlan(options);

      expect(staging).toMatchObject({
        strategy: 'reuse_by_content_hash',
        cache_root: '/tmp/guest-node-cache',
        cache_hit: null,
        host_path: fs.realpathSync(nodeRoot),
      });
      expect(staging.content_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(staging.guest_root).toBe(`/tmp/guest-node-cache/${staging.content_hash}`);
      expect(staging.guest_node_command).toBe(`/tmp/guest-node-cache/${staging.content_hash}/bin/node`);
      expect(tartSmoke.buildDryRunPlan(options).guest_node_staging).toEqual(staging);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the canonical Homebrew binary path when SSH does not provide a login PATH', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--install-mode',
      'homebrew-cask',
      '--homebrew-cask',
      'gaofeng21cn/one-person-lab/one-person-lab',
      '--smoke-profile',
      'homebrew-standard-cask',
      '--dry-run',
    ]);

    expect(tartSmoke.buildDryRunPlan(options).homebrew_trusted_casks).toEqual([
      'gaofeng21cn/one-person-lab/one-person-lab',
      'gaofeng21cn/one-person-lab/one-person-lab-full',
      'gaofeng21cn/one-person-lab/one-person-lab-nightly',
    ]);
    expect(tartSmoke.homebrewTrustedCaskRefs(options)).toEqual([
      'gaofeng21cn/one-person-lab/one-person-lab',
      'gaofeng21cn/one-person-lab/one-person-lab-full',
      'gaofeng21cn/one-person-lab/one-person-lab-nightly',
    ]);
    const command = tartSmoke.guestHomebrewInstallCommand(options);
    expect(command).toContain('/opt/homebrew/bin/brew');
    expect(command).toContain('"$BREW_BIN" shellenv');
    expect(command).toContain('export HOMEBREW_NO_AUTO_UPDATE=1');
    expect(command).toContain('export HOMEBREW_NO_INSTALL_CLEANUP=1');
    expect(command).toContain('export HOMEBREW_NO_ENV_HINTS=1');
    expect(command).toContain('"$BREW_BIN" tap');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab\'');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab-full\'');
    expect(command).toContain('"$BREW_BIN" trust --cask \'gaofeng21cn/one-person-lab/one-person-lab-nightly\'');
    expect(command).not.toContain('"$BREW_BIN" trust gaofeng21cn/one-person-lab');
    expect(command).toContain('"$BREW_BIN" install --cask');
    expect(command).toContain('xattr -dr com.apple.quarantine "/Applications/One Person Lab.app"');
  });

  it('bootstraps Homebrew inside a transient clone when the single no-CLT base does not provide it', () => {
    const command = tartSmoke.guestHomebrewBootstrapCommand();

    expect(command).toContain('brew_ready=1');
    expect(command).toContain('if ! xcode-select -p >/dev/null 2>&1 || ! /usr/bin/git --version');
    expect(command).toContain('softwareupdate --list');
    expect(command).toContain('Command Line Tools for Xcode');
    expect(command).toContain('sudo -n softwareupdate --install "$clt_label" --verbose');
    expect(command).toContain('sudo -n xcode-select --switch /Library/Developer/CommandLineTools');
    expect(command).toContain('https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh');
    expect(command).toContain('NONINTERACTIVE=1 HOMEBREW_NO_ANALYTICS=1 /bin/bash "$installer"');
    expect(command).toContain('test -x /opt/homebrew/bin/brew -o -x /usr/local/bin/brew');
    expect(command.indexOf('/usr/bin/git --version')).toBeLessThan(command.indexOf('if [ "$brew_ready" -eq 1 ]'));
  });

  it('defines a Full Homebrew Cask profile that preserves quarantine and consumes embedded Base', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--smoke-profile',
      'homebrew-full-cask',
      '--dry-run',
    ]);
    const desiredRoots = tartSmoke.officialProfileDesiredRoots();
    const plan = tartSmoke.buildDryRunPlan(options);

    expect(options).toMatchObject({
      runtimeProfile: 'full',
      settingsSmoke: true,
      installMode: 'homebrew-cask',
      homebrewCask: 'one-person-lab-full',
    });
    expect(plan).toMatchObject({
      install_origin: 'homebrew_full_cask',
      official_profile_desired_roots: desiredRoots,
    });
    const installCommand = tartSmoke.guestHomebrewInstallCommand(options);
    expect(installCommand).toContain('"$BREW_BIN" list --cask \'one-person-lab-full\'');
    expect(installCommand).toContain('"$BREW_BIN" list --formula opl');
    expect(installCommand.indexOf('requires Formula opl to be absent before installation')).toBeLessThan(
      installCommand.indexOf('"$BREW_BIN" install --cask')
    );
    expect(installCommand.indexOf('must not install Formula opl')).toBeGreaterThan(
      installCommand.indexOf('"$BREW_BIN" install --cask')
    );
    expect(installCommand).toContain('opl_homebrew_formula_state.v1');
    expect(installCommand).toContain('Full Cask must consume embedded Base');
    expect(installCommand).not.toContain('xattr -dr');

    const guestCommand = tartSmoke.guestSmokeCommand(
      options,
      '/tmp/guest/unused.dmg',
      '/tmp/guest/opl-first-run-vm-smoke.mjs',
      '/tmp/guest/artifacts',
      '/tmp/guest/codex-api-key.txt'
    );
    expect(guestCommand).toContain('--install-origin homebrew_full_cask');
    expect(guestCommand).toContain("--homebrew-cask 'one-person-lab-full'");
    expect(guestCommand).toContain(
      "--homebrew-formula-state '/tmp/opl-first-run-smoke/homebrew-full-formula-state.json'"
    );
    for (const root of desiredRoots) expect(guestCommand).toContain(`--official-profile-root '${root}'`);
    expect(guestCommand).not.toContain('restore');
  });

  it.each([
    {
      profile: 'homebrew-standard-cask',
      caskToken: 'one-person-lab',
      fileName: 'one-person-lab.rb',
      runtimeProfile: 'standard',
    },
    {
      profile: 'homebrew-nightly-cask',
      caskToken: 'one-person-lab-nightly',
      fileName: 'one-person-lab-nightly.rb',
      runtimeProfile: 'standard',
    },
  ])(
    'installs a pre-publication $profile candidate from a local tap with Formula opl from the official tap',
    (candidateCase) => {
      const candidateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cask-candidate-'));
      const candidate = path.join(candidateDir, candidateCase.fileName);
      fs.writeFileSync(candidate, `cask "${candidateCase.caskToken}" do\nend\n`);
      try {
        const options = tartSmoke.parseArgs([
          '--source-vm',
          'clean-vm',
          '--smoke-profile',
          candidateCase.profile,
          '--homebrew-cask-file',
          candidate,
          '--dry-run',
        ]);
        const command = tartSmoke.guestHomebrewInstallCommand(options);
        expect(options).toMatchObject({
          homebrewCaskFile: candidate,
          homebrewCask: candidateCase.caskToken,
          runtimeProfile: candidateCase.runtimeProfile,
        });
        expect(tartSmoke.buildDryRunPlan(options).homebrew_trusted_casks).toEqual([
          `opl-local/cask-candidate/${candidateCase.caskToken}`,
        ]);
        expect(command).toContain('tap-new opl-local/cask-candidate');
        expect(command).toContain(`Casks/${candidateCase.fileName}`);
        expect(command).toContain(`homebrew_cask_ref=opl-local/cask-candidate/${candidateCase.caskToken}`);
        expect(command).toContain('install --cask "$homebrew_cask_ref"');
        expect(command).toContain('"$BREW_BIN" tap \'gaofeng21cn/one-person-lab\'');
        expect(command.indexOf('"$BREW_BIN" tap \'gaofeng21cn/one-person-lab\'')).toBeLessThan(
          command.indexOf('tap-new opl-local/cask-candidate')
        );
        expect(command).toContain(`trust --cask 'opl-local/cask-candidate/${candidateCase.caskToken}'`);
        expect(command).not.toContain("trust --cask 'gaofeng21cn/one-person-lab/");
        expect(command.indexOf('Standard and Nightly Casks must install Formula opl')).toBeGreaterThan(
          command.indexOf('install --cask "$homebrew_cask_ref"')
        );
        const guestCommand = tartSmoke.guestSmokeCommand(
          options,
          '/tmp/guest/unused.dmg',
          '/tmp/guest/opl-first-run-vm-smoke.mjs',
          '/tmp/guest/artifacts',
          '/tmp/guest/codex-api-key.txt'
        );
        const expectedOrigin =
          candidateCase.caskToken === 'one-person-lab-nightly' ? 'homebrew_nightly_cask' : 'homebrew_standard_cask';
        expect(guestCommand).toContain(`--install-origin ${expectedOrigin}`);
        expect(guestCommand).toContain(`--homebrew-cask '${candidateCase.caskToken}'`);
        for (const root of tartSmoke.officialProfileDesiredRoots()) {
          expect(guestCommand).toContain(`--official-profile-root '${root}'`);
        }
      } finally {
        fs.rmSync(candidateDir, { recursive: true, force: true });
      }
    }
  );

  it('installs a pre-publication Full Cask candidate without Formula opl from an isolated local tap', () => {
    const candidateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-cask-candidate-'));
    const candidate = path.join(candidateDir, 'one-person-lab-full.rb');
    fs.writeFileSync(candidate, 'cask "one-person-lab-full" do\nend\n');
    try {
      const options = tartSmoke.parseArgs([
        '--source-vm',
        'clean-vm',
        '--smoke-profile',
        'homebrew-full-cask',
        '--homebrew-cask-file',
        candidate,
        '--dry-run',
      ]);
      const command = tartSmoke.guestHomebrewInstallCommand(options);
      expect(command).toContain('tap-new opl-local/cask-candidate');
      expect(command).toContain('Casks/one-person-lab-full.rb');
      expect(command).toContain('homebrew_cask_ref=opl-local/cask-candidate/one-person-lab-full');
      expect(command).toContain('requires Formula opl to be absent before installation');
      expect(command).toContain('must not install Formula opl');
      expect(command).not.toContain('Standard and Nightly Casks must install Formula opl');
      expect(command).not.toContain('"$BREW_BIN" tap \'gaofeng21cn/one-person-lab\'');
    } finally {
      fs.rmSync(candidateDir, { recursive: true, force: true });
    }
  });

  it('rejects mismatched Homebrew Cask candidate profile, token, runtime, and filename combinations', () => {
    const baseArgs = ['--source-vm', 'clean-vm', '--dry-run'];
    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--smoke-profile',
        'homebrew-standard-cask',
        '--homebrew-cask-file',
        '/tmp/one-person-lab-full.rb',
      ])
    ).toThrow(/homebrew-standard-cask must be named one-person-lab\.rb/);
    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--smoke-profile',
        'homebrew-nightly-cask',
        '--homebrew-cask-file',
        '/tmp/one-person-lab.rb',
      ])
    ).toThrow(/homebrew-nightly-cask must be named one-person-lab-nightly\.rb/);
    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--smoke-profile',
        'homebrew-nightly-cask',
        '--homebrew-cask',
        'one-person-lab',
        '--homebrew-cask-file',
        '/tmp/one-person-lab-nightly.rb',
      ])
    ).toThrow(/homebrew-nightly-cask to use --homebrew-cask one-person-lab-nightly/);
    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--smoke-profile',
        'homebrew-nightly-cask',
        '--runtime-profile',
        'full',
        '--homebrew-cask-file',
        '/tmp/one-person-lab-nightly.rb',
      ])
    ).toThrow(/homebrew-nightly-cask to use --runtime-profile standard/);
    expect(() =>
      tartSmoke.parseArgs([
        ...baseArgs,
        '--install-mode',
        'homebrew-cask',
        '--homebrew-cask-file',
        '/tmp/one-person-lab.rb',
      ])
    ).toThrow(/requires one of these smoke profiles/);
  });

  it('validates guest Full Cask install-origin arguments as one coherent carrier profile', () => {
    expect(
      vmSmoke.parseArgs([
        '--app',
        '/Applications/One Person Lab.app',
        '--runtime-profile',
        'full',
        '--install-origin',
        'homebrew_full_cask',
        '--homebrew-cask',
        'one-person-lab-full',
        '--homebrew-formula-state',
        '/tmp/homebrew-full-formula-state.json',
        '--official-profile-root',
        'mas',
        '--official-profile-root',
        'mas',
        '--official-profile-root',
        'mag',
      ])
    ).toMatchObject({
      installOrigin: 'homebrew_full_cask',
      homebrewCask: 'one-person-lab-full',
      officialProfileRoots: ['mas', 'mag'],
    });
    expect(() =>
      vmSmoke.parseArgs([
        '--app',
        '/Applications/One Person Lab.app',
        '--runtime-profile',
        'standard',
        '--install-origin',
        'homebrew_full_cask',
        '--homebrew-cask',
        'one-person-lab-full',
        '--homebrew-formula-state',
        '/tmp/homebrew-full-formula-state.json',
        '--official-profile-root',
        'mas',
      ])
    ).toThrow(/requires Full runtime/);
  });

  it('requires Full Cask Gatekeeper, carrier, Formula absence, and Official Profile evidence', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--smoke-profile',
      'homebrew-full-cask',
      '--dry-run',
    ]);
    const desiredRoots = tartSmoke.officialProfileDesiredRoots();
    const passed = {
      status: 'passed',
      runtime_profile: 'full',
      install_origin: 'homebrew_full_cask',
      codex_config_wizard_submitted: false,
      settings_smoke: { status: 'passed', pages: ['environment'] },
      temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
      gatekeeper_launch_policy: {
        status: 'passed',
        gatekeeper_required: true,
        quarantine_removal_required: false,
        quarantine_mutation_performed: false,
        codesign: { status: 0 },
        spctl: { status: 0 },
      },
      homebrew_full_cask: createPassedHomebrewFullCaskProof(desiredRoots),
    };

    expect(() => assertGuestSmokeSummary(options, passed)).not.toThrow();
    expect(() =>
      assertGuestSmokeSummary(options, {
        ...passed,
        homebrew_full_cask: {
          ...passed.homebrew_full_cask,
          homebrew: { ...passed.homebrew_full_cask.homebrew, formula_opl_installed_after: true },
        },
      })
    ).toThrow(/embedded Base and Official Profile convergence/);
    expect(() =>
      assertGuestSmokeSummary(options, {
        ...passed,
        gatekeeper_launch_policy: { ...passed.gatekeeper_launch_policy, spctl: { status: 1 } },
      })
    ).toThrow(/unmodified Homebrew Gatekeeper acceptance/);
  });

  it('fails closed when an Official Profile desired root is not installed', () => {
    const desiredRoots = ['mas', 'mag'];
    expect(
      vmSmoke.officialProfileConvergenceFromFastState(
        {
          app_state: {
            agent_packages: {
              directory: {
                entries: desiredRoots.map((package_id) => ({ package_id, installed: true })),
              },
            },
          },
        },
        desiredRoots
      )
    ).toMatchObject({
      status: 'passed',
      desired_root_package_ids: desiredRoots,
      installed_root_package_ids: desiredRoots,
      restore_action_invoked: false,
    });
    expect(() =>
      vmSmoke.officialProfileConvergenceFromFastState(
        {
          app_state: {
            agent_packages: {
              directory: {
                entries: [
                  { package_id: 'mas', installed: true },
                  { package_id: 'mag', installed: false },
                ],
              },
            },
          },
        },
        desiredRoots
      )
    ).toThrow(/mag/);
  });

  it('collects a Full Cask receipt from the embedded runtime without a Formula carrier', () => {
    const fixture = createPackagedFullRuntimeAppFixture();
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-full-cask-receipt-'));
    try {
      writeFile(path.join(fixture.runtimeHome, 'bin', 'opl'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
      const formulaState = path.join(fixture.root, 'homebrew-full-formula-state.json');
      fs.writeFileSync(
        formulaState,
        `${JSON.stringify({
          schema: 'opl_homebrew_formula_state.v1',
          formula_opl_installed_before: false,
          formula_opl_installed_after: false,
        })}\n`
      );
      const desiredRoots = ['mas', 'mag'];
      const receipt = vmSmoke.collectHomebrewFullCaskProof(
        {
          appPath: fixture.appPath,
          artifacts,
          runtimeProfile: 'full',
          installOrigin: 'homebrew_full_cask',
          homebrewCask: 'one-person-lab-full',
          homebrewFormulaState: formulaState,
          officialProfileRoots: desiredRoots,
          timeoutMs: 10_000,
          __testHooks: {
            brewBin: '/fixture/brew',
            spawnSync: (_command: string, args: string[]) => ({
              status: args.includes('--formula') ? 1 : 0,
              stdout: '',
              stderr: '',
            }),
            runOplJson: () => ({
              app_state: {
                agent_packages: {
                  directory: {
                    entries: desiredRoots.map((package_id) => ({ package_id, installed: true })),
                  },
                },
              },
            }),
          },
        },
        null
      );

      expect(receipt).toMatchObject({
        status: 'passed',
        homebrew: {
          cask_installed: true,
          formula_opl_installed_before: false,
          formula_opl_installed_after: false,
        },
        carrier: {
          selected_carrier: 'packaged_full_runtime',
          source: 'packaged_app_resource',
          runtime_home: fixture.runtimeHome,
          active_framework_count: 1,
        },
        official_profile: {
          desired_root_package_ids: desiredRoots,
          installed_root_package_ids: desiredRoots,
          restore_action_invoked: false,
        },
      });
      expect(JSON.parse(fs.readFileSync(path.join(artifacts, 'homebrew-full-cask-smoke.json'), 'utf8'))).toEqual(
        receipt
      );
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it.each([
    { installOrigin: 'homebrew_standard_cask', cask: 'one-person-lab', channel: 'stable' },
    { installOrigin: 'homebrew_nightly_cask', cask: 'one-person-lab-nightly', channel: 'nightly' },
  ])('collects a $channel Standard Cask receipt with Formula opl and Official Profile convergence', (carrierCase) => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-standard-cask-receipt-'));
    const desiredRoots = ['mas', 'mag'];
    try {
      const receipt = vmSmoke.collectHomebrewStandardCaskProof(
        {
          artifacts,
          runtimeProfile: 'standard',
          installOrigin: carrierCase.installOrigin,
          homebrewCask: carrierCase.cask,
          officialProfileRoots: desiredRoots,
          timeoutMs: 10_000,
          __testHooks: {
            brewBin: '/fixture/brew',
            spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
            runOplJson: () => ({
              app_state: {
                agent_packages: {
                  directory: {
                    entries: desiredRoots.map((package_id) => ({ package_id, installed: true })),
                  },
                },
              },
            }),
          },
        },
        null
      );

      expect(receipt).toMatchObject({
        schema: 'opl_homebrew_standard_cask_smoke.v1',
        status: 'passed',
        channel: carrierCase.channel,
        homebrew: {
          cask: carrierCase.cask,
          cask_installed: true,
          formula_opl_installed_after: true,
        },
        carrier: {
          selected_carrier: 'homebrew_formula_opl',
          active_framework_count: 1,
        },
        official_profile: {
          desired_root_package_ids: desiredRoots,
          installed_root_package_ids: desiredRoots,
          restore_action_invoked: false,
        },
      });
      const artifact = path.join(artifacts, `homebrew-${carrierCase.channel}-standard-cask-smoke.json`);
      expect(JSON.parse(fs.readFileSync(artifact, 'utf8'))).toEqual(receipt);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('fails Standard Cask proof when Formula opl or an Official Profile root is missing', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-standard-cask-failure-'));
    const baseOptions = {
      artifacts,
      runtimeProfile: 'standard',
      installOrigin: 'homebrew_nightly_cask',
      homebrewCask: 'one-person-lab-nightly',
      officialProfileRoots: ['mas', 'mag'],
      timeoutMs: 10_000,
    };
    try {
      expect(() =>
        vmSmoke.collectHomebrewStandardCaskProof(
          {
            ...baseOptions,
            __testHooks: {
              brewBin: '/fixture/brew',
              spawnSync: (_command: string, args: string[]) => ({
                status: args.includes('--formula') ? 1 : 0,
                stdout: '',
                stderr: '',
              }),
            },
          },
          null
        )
      ).toThrow(/did not install Formula opl/);
      expect(() =>
        vmSmoke.collectHomebrewStandardCaskProof(
          {
            ...baseOptions,
            __testHooks: {
              brewBin: '/fixture/brew',
              spawnSync: () => ({ status: 0, stdout: '', stderr: '' }),
              runOplJson: () => ({
                app_state: {
                  agent_packages: {
                    directory: { entries: [{ package_id: 'mas', installed: true }] },
                  },
                },
              }),
            },
          },
          null
        )
      ).toThrow(/mag/);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('classifies transient Homebrew cask download failures for a bounded retry', () => {
    const partialDownload = new Error(
      'ssh homebrew_cask_install runner@127.0.0.1 exited with 1\nstderr:\ncurl: (18) Transferred a partial file'
    );
    const runtimeFailure = new Error('Timed out waiting for OPL core first-launch readiness');

    expect(tartSmoke.isRetryableHomebrewInstallError(partialDownload)).toBe(true);
    expect(tartSmoke.isRetryableHomebrewInstallError(runtimeFailure)).toBe(false);
  });

  it('writes structured OPL command diagnostics beside human-readable failure artifacts', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-command-diagnostics-'));
    try {
      const error = new vmSmoke.OplJsonCommandError('opl system initialize --json failed', {
        schema: 'opl_vm_smoke_opl_command_error.v1',
        args: ['system', 'initialize', '--json'],
        command: 'opl system initialize --json',
        shell_command: 'command -v opl >/dev/null && opl system initialize --json',
        runtime_home: '/tmp/runtime/current',
        standard_bootstrap: {
          status: 'passed',
          command: '/bin/bash <packaged-opl-install.sh> --headless --skip-packages',
        },
        managed_opl_bin: '/Users/tester/.opl/one-person-lab/bin',
        managed_node_bin: null,
        opl_path: '/Users/tester/.opl/one-person-lab/bin/opl',
        shell_executable: '/bin/zsh',
        status: 1,
        signal: null,
        timed_out: false,
        timeout_ms: 90_000,
        stdout: '{"partial":true}\n',
        stderr: 'runtime state not ready\n',
        error: null,
      });
      const basePath = path.join(artifacts, 'system-initialize.json');

      vmSmoke.writeOplJsonCommandErrorArtifacts(basePath, error, 'secret-token');

      expect(fs.readFileSync(`${basePath}.error.txt`, 'utf8')).toContain('opl system initialize --json failed');
      expect(JSON.parse(fs.readFileSync(`${basePath}.error.json`, 'utf8'))).toMatchObject({
        schema: 'opl_vm_smoke_opl_command_error_artifact.v1',
        message: 'opl system initialize --json failed',
        diagnostics: {
          schema: 'opl_vm_smoke_opl_command_error.v1',
          args: ['system', 'initialize', '--json'],
          command: 'opl system initialize --json',
          status: 1,
          standard_bootstrap: {
            status: 'passed',
          },
          opl_path: '/Users/tester/.opl/one-person-lab/bin/opl',
          timed_out: false,
          stdout: '{"partial":true}\n',
          stderr: 'runtime state not ready\n',
        },
      });
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('captures configure-codex command diagnostics without leaking the API key', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-configure-command-diagnostics-'));
    try {
      const error = new vmSmoke.OplJsonCommandError('opl system configure-codex --api-key-stdin --json failed', {
        schema: 'opl_vm_smoke_opl_command_error.v1',
        args: ['system', 'configure-codex', '--api-key-stdin', '--json'],
        command: 'opl system configure-codex --api-key-stdin --json',
        shell_command: 'command -v opl >/dev/null && opl system configure-codex --api-key-stdin --json',
        runtime_home: null,
        full_packaged_runtime: null,
        standard_bootstrap: { status: 'passed' },
        managed_opl_bin: '/Users/tester/.opl/one-person-lab/bin',
        managed_node_bin: null,
        opl_path: '/Users/tester/.opl/one-person-lab/bin/opl',
        shell_executable: '/bin/zsh',
        status: 1,
        signal: null,
        timed_out: false,
        timeout_ms: 90_000,
        stdout: '{"error":{"code":"unexpected_error"}}\n',
        stderr: 'config write failed\n',
        error: null,
      });
      const basePath = path.join(artifacts, 'codex-configure.json');

      const summary = vmSmoke.captureOplJsonCommandErrorArtifacts(basePath, error, 'secret-token');

      expect(summary).toEqual({
        status: 'captured',
        artifact_error_txt: 'codex-configure.json.error.txt',
        artifact_error_json: 'codex-configure.json.error.json',
        command: 'opl system configure-codex --api-key-stdin --json',
        status_code: 1,
        signal: null,
        timed_out: false,
      });
      expect(JSON.parse(fs.readFileSync(`${basePath}.error.json`, 'utf8'))).toMatchObject({
        diagnostics: {
          command: 'opl system configure-codex --api-key-stdin --json',
          stdout: '{"error":{"code":"unexpected_error"}}\n',
          stderr: 'config write failed\n',
        },
      });
      expect(JSON.stringify(summary)).not.toContain('config write failed');
      expect(JSON.stringify(summary)).not.toContain('secret-token');
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('collects bounded macOS launch diagnostics when packaged GUI boot never reaches CDP', () => {
    const scriptSource = fs.readFileSync(path.join(process.cwd(), 'scripts/opl-first-run-vm-smoke.mjs'), 'utf8');

    expect(scriptSource).toContain("commandDiagnostic('/usr/bin/sample'");
    expect(scriptSource).toContain('captureNativeWindowDiagnostics(options.processName)');
    expect(scriptSource).toContain("path.join(launchLogDir, 'native-window-diagnostics.json')");
    expect(scriptSource).toContain(
      'native_window_diagnostics: summarizeNativeWindowDiagnostics(nativeWindowDiagnostics)'
    );
    expect(scriptSource).toContain('opl_packaged_gui_native_window_diagnostics.v1');
    expect(scriptSource).toContain('likely_alert_text');
    expect(scriptSource).toContain("commandDiagnostic('launchctl', ['print', `gui/${uid}`]");
    expect(scriptSource).toContain("commandDiagnostic('/usr/sbin/scutil', ['show', 'State:/Users/ConsoleUser']");
    expect(scriptSource).toContain(
      '(hooks.collectDiagnosticReports ?? collectDiagnosticReports)(options, codexApiKey)'
    );
    expect(scriptSource).toContain("path.join(userHomeDir(), 'Library', 'Logs', 'DiagnosticReports')");
    expect(scriptSource).toContain("path.join('/Library', 'Logs', 'DiagnosticReports')");
    expect(scriptSource).toContain("path.join(defaultAppSupportPath(options.processName), 'logs')");
    expect(scriptSource).toContain("path.join(userHomeDir(), 'Library', 'Logs', 'cn.onepersonlab.opl')");
    expect(scriptSource).toContain('collectMainBootstrapFatalArtifacts(options, secret, launchLogDir)');
    expect(scriptSource).toContain("path.join(targetDir, 'main-bootstrap-fatal-candidates.json')");
    expect(scriptSource).toContain('main_bootstrap_fatal_artifacts: mainBootstrapFatalArtifacts');
    expect(vmSmoke.unifiedLogPredicate('One Person Lab')).toContain('LaunchServices');
    expect(vmSmoke.unifiedLogPredicate('One Person Lab')).toContain('runningboard');
    expect(vmSmoke.unifiedLogPredicate('One Person Lab')).toContain('syspolicyd');
  });

  it('collects early main bootstrap fatal logs from app support candidates', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-fatal-artifacts-'));
    const originalHome = process.env.HOME;
    try {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-bootstrap-fatal-home-'));
      process.env.HOME = home;
      const fatalLog = path.join(
        home,
        'Library',
        'Application Support',
        'One Person Lab',
        'main-bootstrap-fatal.jsonl'
      );
      fs.mkdirSync(path.dirname(fatalLog), { recursive: true });
      fs.writeFileSync(
        fatalLog,
        `${JSON.stringify({
          schema: 'aionui.main_bootstrap_fatal.v1',
          type: 'uncaughtException',
          error: { message: 'startup failure before BrowserWindow' },
        })}\n`,
        'utf8'
      );

      const summary = vmSmoke.collectMainBootstrapFatalArtifacts(
        { artifacts, processName: 'One Person Lab' },
        'secret'
      );
      expect(summary).toMatchObject({
        schema: 'aionui.main_bootstrap_fatal_artifacts.v1',
        copied_count: 1,
      });
      expect(summary.candidates).toContain(fatalLog);
      expect(summary.copied[0].target).toContain('main-bootstrap-fatal-One_Person_Lab.jsonl');
      expect(fs.readFileSync(summary.copied[0].target, 'utf8')).toContain('startup failure before BrowserWindow');
      expect(fs.existsSync(path.join(artifacts, 'launch-app', 'main-bootstrap-fatal-candidates.json'))).toBe(true);
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('collects date-nested app logs without collisions or following symlinks outside the log root', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-log-artifacts-'));
    try {
      const artifacts = path.join(workspace, 'artifacts');
      const firstLogRoot = path.join(workspace, 'first', 'logs');
      const secondLogRoot = path.join(workspace, 'second', 'logs');
      const relativeLogPath = path.join('2026', '07', '10', 'app.log');
      const outsideLog = path.join(workspace, 'outside.log');
      writeFile(path.join(firstLogRoot, relativeLogPath), 'first root log\n');
      writeFile(path.join(secondLogRoot, relativeLogPath), 'second root log\n');
      writeFile(outsideLog, 'outside log\n');
      fs.symlinkSync(outsideLog, path.join(firstLogRoot, '2026', '07', '10', 'outside.log'));

      vmSmoke.collectAppLogArtifacts({ artifacts, processName: 'One Person Lab' }, 'secret', [
        firstLogRoot,
        secondLogRoot,
      ]);

      expect(fs.readFileSync(path.join(artifacts, 'app-logs', '01-logs', relativeLogPath), 'utf8')).toBe(
        'first root log\n'
      );
      expect(fs.readFileSync(path.join(artifacts, 'app-logs', '02-logs', relativeLogPath), 'utf8')).toBe(
        'second root log\n'
      );
      expect(fs.existsSync(path.join(artifacts, 'app-logs', '01-logs', '2026', '07', '10', 'outside.log'))).toBe(false);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('keeps the primary smoke failure and continues log evidence after an unreadable root', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-log-unreadable-root-'));
    const originalReaddirSync = fs.readdirSync;
    const blockedRoot = path.join(workspace, 'blocked', 'logs');
    const healthyRoot = path.join(workspace, 'healthy', 'logs');
    const artifacts = path.join(workspace, 'artifacts');
    fs.mkdirSync(blockedRoot, { recursive: true });
    writeFile(path.join(healthyRoot, 'app.log'), 'healthy root log\n');
    vi.spyOn(fs, 'readdirSync').mockImplementation(((...args: unknown[]) => {
      if (path.resolve(String(args[0])) === blockedRoot) {
        throw Object.assign(new Error(`EACCES: permission denied, scandir '${blockedRoot}'`), { code: 'EACCES' });
      }
      return Reflect.apply(originalReaddirSync, fs, args);
    }) as typeof fs.readdirSync);

    try {
      const primaryError = new Error('primary smoke failure');
      const smokeEvents: Array<{ phase: string; status: string; error?: string }> = [];
      const observedError = vmSmoke.collectFailureArtifactsForSmokeError(
        primaryError,
        {
          artifacts,
          processName: 'One Person Lab',
          __testHooks: {
            collectFailureArtifacts() {
              vmSmoke.collectAppLogArtifacts({ artifacts, processName: 'One Person Lab' }, 'secret', [
                blockedRoot,
                healthyRoot,
              ]);
              throw new Error('secondary evidence failure');
            },
          },
        },
        'secret',
        (phase: string, status: string, details: { error?: string } = {}) => {
          smokeEvents.push({ phase, status, ...details });
        }
      );

      expect(observedError).toBe(primaryError);
      expect(smokeEvents).toContainEqual({
        phase: 'failure_artifacts',
        status: 'failed',
        error: 'secondary evidence failure',
      });
      expect(fs.readFileSync(path.join(artifacts, 'app-logs', '02-logs', 'app.log'), 'utf8')).toBe(
        'healthy root log\n'
      );
      expect(
        JSON.parse(fs.readFileSync(path.join(artifacts, 'app-logs', 'collection-summary.json'), 'utf8'))
      ).toMatchObject({
        schema: 'opl_vm_smoke_app_log_artifacts.v1',
        copied_count: 1,
        error_count: 1,
        errors: [
          {
            type: 'filesystem_collection_error',
            operation: 'read_directory',
            source: blockedRoot,
            code: 'EACCES',
          },
        ],
      });
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('continues later failure evidence after diagnostic report collection fails', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-failure-evidence-stages-'));
    const originalHome = process.env.HOME;
    const artifacts = path.join(workspace, 'artifacts');
    const laterEvidence: string[] = [];
    const smokeEvents: Array<Record<string, unknown>> = [];
    try {
      process.env.HOME = path.join(workspace, 'home');
      vmSmoke.collectFailureArtifacts(
        {
          artifacts,
          processName: 'One Person Lab',
          __testHooks: {
            collectLaunchDiagnostics: () => null,
            queryAccessibility: () => ({}),
            collectMainBootstrapFatalArtifacts: () => null,
            collectAppLogArtifacts: () => null,
            collectFileListing: () => null,
            collectDiagnosticReports() {
              throw Object.assign(new Error('EACCES: permission denied, scandir DiagnosticReports'), {
                code: 'EACCES',
              });
            },
            runOplJson: () => '{}',
            captureMacScreenArtifact(target: string) {
              laterEvidence.push(path.basename(target));
            },
            captureUnifiedLog(_processName: string, target: string) {
              laterEvidence.push(path.basename(target));
              writeFile(target, 'unified log\n');
            },
          },
        },
        'secret',
        (phase: string, status: string, details: Record<string, unknown> = {}) => {
          smokeEvents.push({ phase, status, ...details });
        }
      );

      expect(laterEvidence).toEqual(['failure-first-launch.png', 'unified-log.txt']);
      expect(smokeEvents).toContainEqual({
        phase: 'failure_artifact_collection',
        status: 'failed',
        type: 'filesystem_collection_error',
        operation: 'collect_artifact',
        source: 'diagnostic-reports',
        code: 'EACCES',
        message: 'EACCES: permission denied, scandir DiagnosticReports',
      });
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('records a vanished directory entry and continues collecting its siblings', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-log-vanished-entry-'));
    const originalReaddirSync = fs.readdirSync;
    const artifacts = path.join(workspace, 'artifacts');
    const logRoot = path.join(workspace, 'logs');
    const vanishedDir = path.join(logRoot, 'vanished');
    writeFile(path.join(vanishedDir, 'app.log'), 'vanishing log\n');
    writeFile(path.join(logRoot, 'stable.log'), 'stable log\n');
    let removed = false;
    vi.spyOn(fs, 'readdirSync').mockImplementation(((...args: unknown[]) => {
      const entries = Reflect.apply(originalReaddirSync, fs, args);
      if (!removed && path.resolve(String(args[0])) === logRoot) {
        removed = true;
        fs.rmSync(vanishedDir, { recursive: true, force: true });
      }
      return entries;
    }) as typeof fs.readdirSync);

    try {
      const summary = vmSmoke.collectAppLogArtifacts({ artifacts, processName: 'One Person Lab' }, 'secret', [logRoot]);

      expect(fs.readFileSync(path.join(artifacts, 'app-logs', '01-logs', 'stable.log'), 'utf8')).toBe('stable log\n');
      expect(summary).toMatchObject({
        copied_count: 1,
        error_count: 1,
        errors: [
          {
            type: 'filesystem_collection_error',
            operation: 'inspect_entry',
            source: vanishedDir,
            code: 'ENOENT',
          },
        ],
      });
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('records an unreadable log file and continues collecting sibling files', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-log-unreadable-file-'));
    const originalReadFileSync = fs.readFileSync;
    const artifacts = path.join(workspace, 'artifacts');
    const logRoot = path.join(workspace, 'logs');
    const blockedLog = path.join(logRoot, 'blocked.log');
    writeFile(blockedLog, 'blocked log\n');
    writeFile(path.join(logRoot, 'stable.log'), 'stable log\n');
    vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: unknown[]) => {
      if (path.resolve(String(args[0])) === blockedLog) {
        throw Object.assign(new Error(`EACCES: permission denied, open '${blockedLog}'`), { code: 'EACCES' });
      }
      return Reflect.apply(originalReadFileSync, fs, args);
    }) as typeof fs.readFileSync);

    try {
      const summary = vmSmoke.collectAppLogArtifacts({ artifacts, processName: 'One Person Lab' }, 'secret', [logRoot]);

      expect(fs.readFileSync(path.join(artifacts, 'app-logs', '01-logs', 'stable.log'), 'utf8')).toBe('stable log\n');
      expect(summary).toMatchObject({
        copied_count: 1,
        error_count: 1,
        errors: [
          {
            type: 'filesystem_collection_error',
            operation: 'read_file',
            source: blockedLog,
            code: 'EACCES',
          },
        ],
      });
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('detects the native modal launch blocker signature from launch diagnostics and process samples', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-modal-blocker-'));
    try {
      const launchLogDir = path.join(artifacts, 'launch-app');
      fs.mkdirSync(launchLogDir, { recursive: true });
      fs.writeFileSync(
        path.join(launchLogDir, 'process-8503-sample.txt'),
        '2603 -[NSAlert runModal]  (in AppKit) + 196\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(launchLogDir, 'stderr.log'),
        'A JavaScript error occurred in the main process\n',
        'utf8'
      );
      fs.writeFileSync(
        path.join(launchLogDir, 'main-bootstrap-fatal-One_Person_Lab.jsonl'),
        `${JSON.stringify({
          schema: 'aionui.main_bootstrap_fatal.v1',
          error: {
            message: 'Cannot find module ./main/index.js',
            stack: 'Error: Cannot find module ./main/index.js\n    at bootstrap',
          },
        })}\n`,
        'utf8'
      );

      const result = vmSmoke.detectNativeModalLaunchBlocker(
        { artifacts },
        {
          app_processes: [
            { pid: 8503, ppid: 714, args: '/Applications/One Person Lab.app/Contents/MacOS/One Person Lab' },
          ],
          cdp_listener: { status: 1 },
          cdp_targets: {
            status: 7,
            stderr: "curl: (7) Failed to connect to 127.0.0.1 port 9230: Couldn't connect to server\n",
          },
          native_window_diagnostics: {
            target_process_found: true,
            target_process_window_count: 0,
            target_process_ui_element_count: 0,
            likely_alert_text: [
              { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
            ],
            window_title_text: [{ source: 'frontmost_window_title', text: 'Error' }],
          },
          main_bootstrap_fatal_artifacts: {
            schema: 'aionui.main_bootstrap_fatal_artifacts.v1',
            candidates: ['/Users/runner/Library/Application Support/One Person Lab/main-bootstrap-fatal.jsonl'],
            copied: [
              {
                source: 'main-bootstrap-fatal.jsonl',
                target: path.join(launchLogDir, 'main-bootstrap-fatal-One_Person_Lab.jsonl'),
              },
            ],
            copied_count: 1,
          },
        }
      );

      expect(result).toMatchObject({
        schema: 'opl_packaged_gui_native_modal_launch_blocker.v1',
        detected: true,
        cdp_absent: true,
        app_process_alive: true,
        no_native_window_surface: true,
        nsalert_run_modal_sample_found: true,
        app_pids: [8503],
      });
      expect(result.nsalert_sample_paths[0]).toContain('process-8503-sample.txt');
      expect(result.likely_alert_text).toEqual([
        { source: 'accessibility_likely_alert', text: 'A JavaScript error occurred in the main process' },
      ]);
      expect(result.window_title_text).toEqual([{ source: 'frontmost_window_title', text: 'Error' }]);
      expect(result.bootstrap_fatal_text).toEqual(
        expect.arrayContaining([
          { source: 'main_bootstrap_fatal.error.message', text: 'Cannot find module ./main/index.js' },
        ])
      );
      expect(result.launch_log_text).toEqual([
        { source: 'launch_stderr', text: 'A JavaScript error occurred in the main process' },
      ]);
      expect(result.main_bootstrap_fatal_artifacts.copied_count).toBe(1);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('does not classify ordinary CDP startup delays as native modal blockers without an NSAlert sample', () => {
    const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-modal-negative-'));
    try {
      fs.mkdirSync(path.join(artifacts, 'launch-app'), { recursive: true });

      const result = vmSmoke.detectNativeModalLaunchBlocker(
        { artifacts },
        {
          app_processes: [{ pid: 8503 }],
          cdp_listener: { status: 1 },
          cdp_targets: { stderr: 'connect ECONNREFUSED 127.0.0.1:9230' },
          native_window_diagnostics: {
            target_process_found: true,
            target_process_window_count: 0,
            target_process_ui_element_count: 0,
          },
        }
      );

      expect(result.detected).toBe(false);
      expect(result.nsalert_run_modal_sample_found).toBe(false);
    } finally {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  });

  it('validates assistant route smoke independently from Settings smoke', () => {
    const options = tartSmoke.parseArgs([
      '--source-vm',
      'clean-vm',
      '--dmg',
      '/tmp/One-Person-Lab.dmg',
      '--assistant-route-smoke',
      ...fullMasProvisioningTransportArgs(),
      '--dry-run',
    ]);

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(),
      })
    ).not.toThrow();

    expect(() =>
      assertGuestSmokeSummary(options, {
        status: 'passed',
        runtime_profile: 'full',
        codex_config_wizard_submitted: false,
        settings_smoke: null,
        temporal_service_supervisor_proof: createPassedTemporalServiceSupervisorProof(),
        assistant_route_smoke: createPassedAssistantRouteSmokeSummary(['mas', 'mag']),
      })
    ).toThrow(/assistant route smoke/);
  });

  it('checks Full domain skills through packaged plugin surfaces, not retired Codex skill mirrors', () => {
    const fixture = createFullRuntimeEquivalenceFixture();
    try {
      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).not.toThrow();

      expect(fs.existsSync(path.join(fixture.codexHome, 'skills', 'med-autoscience', 'SKILL.md'))).toBe(false);
      fs.rmSync(path.join(fixture.runtimeHome, 'modules', 'mas', 'plugins', 'med-autoscience'), {
        recursive: true,
        force: true,
      });

      expect(() =>
        vmSmoke.assertFullFirstRunEquivalence(createReadySystemInitialize(), '{"modules":{"items":[]}}', {
          codexHome: fixture.codexHome,
          runtimeHome: fixture.runtimeHome,
        })
      ).toThrow(/domain plugin med-autoscience/);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('classifies missing packaged Full runtime payloads as non-retryable equivalence failures', () => {
    expect(
      vmSmoke.isNonRetryableFullRuntimeEquivalenceError(
        new Error(
          'OPL Full runtime domain plugin med-autogrant is missing packaged plugin manifest: /Applications/One Person Lab.app/Contents/Resources/opl-full-runtime/runtime/current/modules/mag/plugins/med-autogrant/.codex-plugin/plugin.json'
        )
      )
    ).toBe(true);
    expect(
      vmSmoke.isNonRetryableFullRuntimeEquivalenceError(
        new Error('OPL first-run initialize did not report a launchable core state')
      )
    ).toBe(false);
  });
});

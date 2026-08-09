import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { updaterQualificationInputDigest } from '../../../scripts/release/opl-updater-vm-smoke.mjs';
import {
  attemptUpdaterTartArtifactPull,
  cleanupUpdaterTartVm,
  parseUpdaterTartArgs,
  runAsync,
  selectUpdaterTartTerminalError,
  updaterTartArtifactPullPlan,
  updaterTartDryRunReceipt,
  updaterTartDryRunPlan,
  updaterTartFailureEvidence,
  updaterTartGuestExecutionBudget,
  updaterTartGuestReceiptMatches,
  updaterTartGuestCommand,
} from '../../../scripts/release/opl-updater-tart-smoke.mjs';

describe('updater Tart smoke contract', () => {
  it('keeps one candidate feed and one immutable Bundle across the host and guest boundary', () => {
    const options = parseUpdaterTartArgs([
      '--dry-run',
      '--source-vm',
      'macos-clean',
      '--old-dmg',
      '/tmp/old.dmg',
      '--feed-dir',
      '/tmp/feed',
      '--expected-current-display-version',
      '26.7.20',
      '--expected-current-version',
      '26.7.20',
      '--expected-display-version',
      '26.7.20-r1',
      '--expected-updater-version',
      '26.7.2001',
      '--guest-node-root',
      '/tmp/node',
      '--bundle-digest',
      `sha256:${'a'.repeat(64)}`,
      '--app-sha',
      'b'.repeat(40),
      '--shell-sha',
      'c'.repeat(40),
      '--framework-sha',
      'd'.repeat(40),
    ]);
    expect(options).not.toBeNull();
    const plan = updaterTartDryRunPlan(options!);
    expect(plan).toMatchObject({
      schema: 'opl_updater_tart_smoke_plan.v1',
      source_vm: 'macos-clean',
      expected_current_display_version: '26.7.20',
      expected_current_version: '26.7.20',
      expected_display_version: '26.7.20-r1',
      expected_updater_version: '26.7.2001',
      evidence_scope: 'release_qualification',
      latest_activation_allowed: false,
      release_mutation_performed: false,
      vm_created: false,
      bundle_digest: `sha256:${'a'.repeat(64)}`,
      app_sha: 'b'.repeat(40),
      shell_sha: 'c'.repeat(40),
      framework_sha: 'd'.repeat(40),
      guest_harness: {
        size_bytes: expect.any(Number),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  it('fails closed on any missing final identity and allows only explicit non-final rehearsal without them', () => {
    const rehearsalArgs = [
      '--dry-run',
      '--non-final',
      '--source-vm',
      'macos-clean',
      '--old-dmg',
      '/tmp/old.dmg',
      '--feed-dir',
      '/tmp/feed',
      '--expected-current-display-version',
      '26.7.20',
      '--expected-current-version',
      '26.7.20',
      '--expected-display-version',
      '26.7.20-r1',
      '--expected-updater-version',
      '26.7.2001',
      '--guest-node-root',
      '/tmp/node',
    ];
    expect(parseUpdaterTartArgs(rehearsalArgs)?.evidenceScope).toBe('non_final');

    const finalArgs = rehearsalArgs.filter((value) => value !== '--non-final');
    finalArgs.push(
      '--bundle-digest',
      `sha256:${'a'.repeat(64)}`,
      '--app-sha',
      'b'.repeat(40),
      '--shell-sha',
      'c'.repeat(40),
      '--framework-sha',
      'd'.repeat(40)
    );
    expect(parseUpdaterTartArgs(finalArgs)?.evidenceScope).toBe('release_qualification');
    for (const label of ['--bundle-digest', '--app-sha', '--shell-sha', '--framework-sha']) {
      const missing = [...finalArgs];
      const index = missing.indexOf(label);
      missing.splice(index, 2);
      expect(() => parseUpdaterTartArgs(missing), `${label} must fail closed`).toThrow(
        new RegExp(`${label} is required for release qualification`)
      );
    }
  });

  it('writes a byte-repeatable dry-run receipt that is always non-final and mutation-free', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-tart-dry-run-'));
    try {
      const options = parseUpdaterTartArgs([
        '--dry-run',
        '--non-final',
        '--source-vm',
        'macos-clean',
        '--vm-name',
        'opl-updater-template-rehearsal',
        '--old-dmg',
        '/tmp/old.dmg',
        '--feed-dir',
        '/tmp/feed',
        '--expected-current-display-version',
        '26.7.20',
        '--expected-current-version',
        '26.7.20',
        '--expected-display-version',
        '26.7.20-r1',
        '--expected-updater-version',
        '26.7.2001',
        '--guest-node-root',
        '/tmp/node',
      ])!;
      const plan = updaterTartDryRunPlan(options);
      const receipts = ['one', 'two'].map((name) => {
        const directory = path.join(root, name);
        fs.mkdirSync(directory);
        const planPath = path.join(directory, 'updater-tart-plan.json');
        fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
        return updaterTartDryRunReceipt(options, plan, planPath);
      });
      expect(receipts[0]).toEqual(receipts[1]);
      expect(receipts[0]).toMatchObject({
        status: 'planned',
        evidence_scope: 'non_final',
        requested_evidence_scope: 'non_final',
        latest_activation_allowed: false,
        release_mutation_performed: false,
        vm_created: false,
        template_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('requires an explicit candidate updater identity', () => {
    expect(() =>
      parseUpdaterTartArgs([
        '--dry-run',
        '--source-vm',
        'macos-clean',
        '--old-dmg',
        '/tmp/old.dmg',
        '--feed-dir',
        '/tmp/feed',
        '--expected-current-display-version',
        '26.7.20',
        '--expected-current-version',
        '26.7.20',
        '--expected-display-version',
        '26.7.20-r1',
        '--guest-node-root',
        '/tmp/node',
      ])
    ).toThrow(/--expected-updater-version is required/);
  });

  it('rejects a downgrade before allocating a Tart VM', () => {
    expect(() =>
      parseUpdaterTartArgs([
        '--dry-run',
        '--source-vm',
        'macos-clean',
        '--old-dmg',
        '/tmp/old.dmg',
        '--feed-dir',
        '/tmp/feed',
        '--expected-current-display-version',
        '26.7.20',
        '--expected-current-version',
        '26.7.20',
        '--expected-display-version',
        '26.7.20-r1',
        '--expected-updater-version',
        '26.7.19',
        '--guest-node-root',
        '/tmp/node',
      ])
    ).toThrow(/strictly newer/);
  });

  it('plans a guest artifact pull only after the VM has an address', () => {
    const options = {
      guestUser: 'runner',
      artifacts: '/tmp/host-artifacts',
    };
    expect(updaterTartArtifactPullPlan(options, '', '/tmp/guest-artifacts')).toEqual({
      enabled: false,
      source: null,
      destination: '/tmp/host-artifacts',
      guest_stdout: '/tmp/guest-artifacts/updater-vm-smoke.stdout.log',
      guest_stderr: '/tmp/guest-artifacts/updater-vm-smoke.stderr.log',
    });
    expect(updaterTartArtifactPullPlan(options, '192.0.2.10', '/tmp/guest-artifacts')).toEqual({
      enabled: true,
      source: 'runner@192.0.2.10:/tmp/guest-artifacts/.',
      destination: '/tmp/host-artifacts',
      guest_stdout: '/tmp/guest-artifacts/updater-vm-smoke.stdout.log',
      guest_stderr: '/tmp/guest-artifacts/updater-vm-smoke.stderr.log',
    });
  });

  it('persists guest harness stdout and stderr inside the finally-pulled artifact directory', () => {
    const command = updaterTartGuestCommand("'/tmp/node' '/tmp/harness.mjs'", '/tmp/guest artifacts');
    expect(command).toContain("mkdir -p '/tmp/guest artifacts'");
    expect(command).toContain("'/tmp/guest artifacts/updater-vm-smoke.stdout.log'");
    expect(command).toContain("2>'/tmp/guest artifacts/updater-vm-smoke.stderr.log'");
  });

  it('reserves host deadline budget for a typed guest failure receipt', () => {
    expect(updaterTartGuestExecutionBudget(90_000)).toEqual({
      guest_timeout_ms: 80_000,
      failure_receipt_grace_ms: 10_000,
    });
    expect(() => updaterTartGuestExecutionBudget(69_999)).toThrow(/typed failure receipt/);
  });

  it('keeps the primary guest failure when the finally artifact pull also fails', async () => {
    const primaryError = Object.assign(new Error('guest qualification timed out'), { code: 'ETIMEDOUT' });
    const pullError = Object.assign(new Error('artifact pull timed out'), { code: 'ETIMEDOUT' });
    const pull = await attemptUpdaterTartArtifactPull(async () => {
      throw pullError;
    });
    expect(pull.copied).toBe(false);
    expect(pull.error).toBe(pullError);
    expect(selectUpdaterTartTerminalError(primaryError, pull.error)).toBe(primaryError);
    expect((selectUpdaterTartTerminalError(primaryError, pull.error) as NodeJS.ErrnoException).code).toBe('ETIMEDOUT');
    expect(selectUpdaterTartTerminalError(null, pull.error)).toBe(pullError);
  });

  it('classifies qualification timeout, artifact recovery timeout, and cleanup failure distinctly', () => {
    const timeout = Object.assign(new Error('operation timed out'), { code: 'ETIMEDOUT' });
    expect(updaterTartFailureEvidence('qualification', timeout)).toMatchObject({
      classification: 'qualification_deadline_exceeded',
      code: 'ETIMEDOUT',
    });
    expect(updaterTartFailureEvidence('artifact_recovery', timeout)).toMatchObject({
      classification: 'artifact_recovery_timeout',
      code: 'ETIMEDOUT',
    });
    expect(updaterTartFailureEvidence('cleanup', new Error('delete failed'))).toMatchObject({
      classification: 'vm_cleanup_failure',
      code: null,
    });
  });

  it('returns ETIMEDOUT only after the timed-out child has exited', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-tart-timeout-'));
    const pidPath = path.join(tempDir, 'child.pid');
    let failure: unknown = null;
    try {
      await runAsync(
        process.execPath,
        [
          '-e',
          "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);",
          pidPath,
        ],
        { timeoutMs: 2_000 }
      );
    } catch (error) {
      failure = error;
    }
    try {
      expect(failure).toBeInstanceOf(Error);
      expect((failure as NodeJS.ErrnoException).code).toBe('ETIMEDOUT');
      const childPid = Number(fs.readFileSync(pidPath, 'utf8'));
      expect(Number.isInteger(childPid) && childPid > 0).toBe(true);
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records a successful finally artifact pull without inventing an error', async () => {
    let called = false;
    const pull = await attemptUpdaterTartArtifactPull(async () => {
      called = true;
    });
    expect(called).toBe(true);
    expect(pull).toEqual({ copied: true, error: null });
    expect(selectUpdaterTartTerminalError(null, pull.error)).toBeNull();
  });

  it('still deletes a disposable VM when the stop command fails', () => {
    const actions: string[] = [];
    const stopError = new Error('stop failed');
    const cleanupError = cleanupUpdaterTartVm((action) => {
      actions.push(action);
      if (action === 'stop') throw stopError;
    }, false);
    expect(actions).toEqual(['stop', 'delete']);
    expect(cleanupError).toBe(stopError);
  });

  it('accepts only a passed guest receipt bound to the exact cohort and identities', () => {
    const options = {
      evidenceScope: 'release_qualification',
      bundleDigest: `sha256:${'a'.repeat(64)}`,
      appSha: 'b'.repeat(40),
      shellSha: 'c'.repeat(40),
      frameworkSha: 'd'.repeat(40),
      expectedCurrentDisplayVersion: '26.7.20',
      expectedCurrentVersion: '26.7.20',
      expectedDisplayVersion: '26.7.20-r1',
      expectedUpdaterVersion: '26.7.2001',
    };
    const hostInput = {
      evidence_scope: options.evidenceScope,
      bundle_digest: options.bundleDigest,
      cohort: { app_sha: options.appSha, shell_sha: options.shellSha, framework_sha: options.frameworkSha },
      baseline: {
        display_version: options.expectedCurrentDisplayVersion,
        updater_version: options.expectedCurrentVersion,
        dmg: { size_bytes: 100, sha256: '1'.repeat(64) },
      },
      candidate: {
        display_version: options.expectedDisplayVersion,
        updater_version: options.expectedUpdaterVersion,
        feed: {
          metadata: { size_bytes: 101, sha256: '2'.repeat(64) },
          zip: { size_bytes: 123, sha256: 'f'.repeat(64) },
          blockmap: { size_bytes: 102, sha256: '3'.repeat(64) },
        },
      },
      harness: { size_bytes: 103, sha256: '4'.repeat(64) },
    };
    const baselineIdentity = {
      display_version: options.expectedCurrentDisplayVersion,
      updater_version: options.expectedCurrentVersion,
      release_tag: `v${options.expectedCurrentDisplayVersion}`,
      evidence: {
        source: 'installed_app_renderer_bundle',
        scanned_file_count: 1,
        matching_files: [{ path: 'out/renderer/index.js', size_bytes: 10, sha256: '5'.repeat(64) }],
        release_tag_derivation: 'v_prefix_of_embedded_display_version',
      },
    };
    const installedIdentity = {
      display_version: options.expectedDisplayVersion,
      updater_version: options.expectedUpdaterVersion,
      release_tag: `v${options.expectedDisplayVersion}`,
      evidence: {
        source: 'installed_app_renderer_bundle',
        scanned_file_count: 1,
        matching_files: [{ path: 'out/renderer/index.js', size_bytes: 11, sha256: '6'.repeat(64) }],
        release_tag_derivation: 'v_prefix_of_embedded_display_version',
      },
    };
    const runtimeCapabilities = {
      process_get_builtin_module: true,
      node_module_create_require: true,
      app_is_ready: true,
      node_http_create_server: true,
      updater_check_for_updates: true,
      updater_download_update: true,
      updater_quit_and_install: true,
      updater_native_event_listener: true,
      load_error: null,
    };
    const loaderProbe = {
      package_anchor: '/Applications/One Person Lab.app/Contents/Resources/app.asar/package.json',
      bare_http: { create_server_type: 'function' },
      node_http: { create_server_type: 'function' },
      mac_updater_http: { create_server_type: 'function' },
      identity: {
        bare_equals_node: true,
        bare_equals_mac_updater: true,
        node_equals_mac_updater: true,
      },
      mac_updater_cached: true,
      mac_updater_require_error: null,
      environment: {
        node_options_present: false,
        electron_run_as_node_present: false,
        electron_run_as_node_enabled: false,
      },
    };
    const nativeEventSource = 'electron-updater.MacUpdater.nativeUpdater';
    const exitTrigger = 'native_event_observed_then_post_quitAndInstall_microtask';
    const receipt = {
      schema: 'opl_updater_upgrade_qualification_receipt.v1',
      status: 'passed',
      evidence_scope: options.evidenceScope,
      latest_activation_allowed: true,
      release_mutation_performed: false,
      input: hostInput,
      input_digest: updaterQualificationInputDigest(hostInput),
      bundle_digest: options.bundleDigest,
      cohort: { app_sha: options.appSha, shell_sha: options.shellSha, framework_sha: options.frameworkSha },
      baseline: {
        display_version: options.expectedCurrentDisplayVersion,
        updater_version: options.expectedCurrentVersion,
        dmg: hostInput.baseline.dmg,
        installed_app_identity: baselineIdentity,
      },
      candidate: {
        display_version: options.expectedDisplayVersion,
        updater_version: options.expectedUpdaterVersion,
        feed: hostInput.candidate.feed,
      },
      qualification: {
        old_app_detected_update: true,
        same_candidate_zip_downloaded: true,
        expected_candidate_zip_sha256: 'f'.repeat(64),
        downloaded_candidate_zip_sha256: 'f'.repeat(64),
        expected_candidate_zip_size_bytes: 123,
        downloaded_candidate_zip_size_bytes: 123,
        install_exit: {
          arm: {
            native_event_source: nativeEventSource,
            listener_bound_before_download: true,
            same_native_updater: true,
            exit_trigger: exitTrigger,
          },
          schedule: {
            install_scheduled: true,
            current_version: options.expectedCurrentVersion,
            native_event_source: nativeEventSource,
            listener_bound_before_download: true,
            same_native_updater: true,
            native_event_observed_before_install_schedule: false,
            exit_trigger: exitTrigger,
          },
        },
        install_and_restart_completed: true,
        installed_app_version: options.expectedUpdaterVersion,
        installed_app_signature_valid: true,
        second_check_no_update: true,
        allow_downgrade: false,
        feed_transport: 'loopback_generic_same_artifact',
        old_app_disk_bytes_modified_before_updater: false,
        runtime_capabilities: { baseline: runtimeCapabilities, installed: runtimeCapabilities },
        loader_probes: { before_check: loaderProbe, before_download: loaderProbe },
        downloaded_candidate: {
          reported_paths: [`/cache/One-Person-Lab-${options.expectedDisplayVersion}-mac-arm64.zip`],
          zip: hostInput.candidate.feed.zip,
        },
        installed_app_identity: installedIdentity,
      },
      harness: hostInput.harness,
      feed_requests: [
        { method: 'GET', path: 'latest-mac.yml', range: null },
        { method: 'GET', path: `One-Person-Lab-${options.expectedDisplayVersion}-mac-arm64.zip`, range: null },
      ],
    };
    expect(updaterTartGuestReceiptMatches(receipt, options, hostInput)).toBe(true);
    const nonFinalOptions = { ...options, evidenceScope: 'non_final' };
    const nonFinalInput = { ...hostInput, evidence_scope: 'non_final' };
    const nonFinalReceipt = {
      ...receipt,
      evidence_scope: 'non_final',
      latest_activation_allowed: false,
      input: nonFinalInput,
      input_digest: updaterQualificationInputDigest(nonFinalInput),
    };
    expect(updaterTartGuestReceiptMatches(nonFinalReceipt, nonFinalOptions, nonFinalInput)).toBe(true);
    expect(
      updaterTartGuestReceiptMatches(
        { ...nonFinalReceipt, latest_activation_allowed: true },
        nonFinalOptions,
        nonFinalInput
      )
    ).toBe(false);
    for (const flag of [
      'old_app_detected_update',
      'same_candidate_zip_downloaded',
      'install_and_restart_completed',
      'installed_app_signature_valid',
      'second_check_no_update',
    ] as const) {
      for (const invalidValue of [false, undefined]) {
        expect(
          updaterTartGuestReceiptMatches(
            { ...receipt, qualification: { ...receipt.qualification, [flag]: invalidValue } },
            options,
            hostInput
          ),
          `must reject incomplete ${flag}`
        ).toBe(false);
      }
    }
    expect(
      updaterTartGuestReceiptMatches(
        { ...receipt, qualification: { ...receipt.qualification, same_candidate_zip_downloaded: false } },
        options,
        hostInput
      )
    ).toBe(false);
    expect(
      updaterTartGuestReceiptMatches(
        { ...receipt, qualification: { ...receipt.qualification, allow_downgrade: true } },
        options,
        hostInput
      )
    ).toBe(false);
    expect(
      updaterTartGuestReceiptMatches(
        {
          ...receipt,
          qualification: { ...receipt.qualification, old_app_disk_bytes_modified_before_updater: true },
        },
        options,
        hostInput
      )
    ).toBe(false);
    expect(
      updaterTartGuestReceiptMatches(
        {
          ...receipt,
          qualification: {
            ...receipt.qualification,
            runtime_capabilities: { ...receipt.qualification.runtime_capabilities, installed: null },
          },
        },
        options,
        hostInput
      )
    ).toBe(false);
    expect(
      updaterTartGuestReceiptMatches(
        {
          ...receipt,
          qualification: {
            ...receipt.qualification,
            loader_probes: { ...receipt.qualification.loader_probes, before_download: null },
          },
        },
        options,
        hostInput
      )
    ).toBe(false);
    expect(
      updaterTartGuestReceiptMatches(
        {
          ...receipt,
          qualification: {
            ...receipt.qualification,
            install_exit: {
              ...receipt.qualification.install_exit,
              arm: { ...receipt.qualification.install_exit.arm, listener_bound_before_download: false },
            },
          },
        },
        options,
        hostInput
      )
    ).toBe(false);
    expect(
      updaterTartGuestReceiptMatches(
        {
          ...receipt,
          qualification: {
            ...receipt.qualification,
            expected_candidate_zip_sha256: '8'.repeat(64),
            downloaded_candidate_zip_sha256: '8'.repeat(64),
            expected_candidate_zip_size_bytes: 124,
            downloaded_candidate_zip_size_bytes: 124,
          },
        },
        options,
        hostInput
      )
    ).toBe(false);
    const wrongInput = {
      ...hostInput,
      candidate: {
        ...hostInput.candidate,
        feed: { ...hostInput.candidate.feed, zip: { size_bytes: 123, sha256: '9'.repeat(64) } },
      },
    };
    expect(
      updaterTartGuestReceiptMatches(
        { ...receipt, input: wrongInput, input_digest: updaterQualificationInputDigest(wrongInput) },
        options,
        hostInput
      )
    ).toBe(false);
  });
});

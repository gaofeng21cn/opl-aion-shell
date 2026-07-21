import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  armUpdaterInstallExit,
  bindDownloadedZipEvidence,
  candidateZipQualification,
  cleanupMountedDmg,
  compareMachineVersions,
  dmgDetachAttempts,
  fileEvidence,
  InspectorClient,
  installedReleaseIdentityExpression,
  installedReleaseIdentityMatches,
  isUpdaterRuntimeReady,
  parseHttpRange,
  parseUpdaterVmArgs,
  requestUpdaterInstallExit,
  run,
  updaterEvidenceScopeAllowsLatest,
  updaterFailureEvidence,
  updaterExpression,
  updaterLoaderProbeExpression,
  updaterLoaderProbeIsHealthy,
  updaterQualificationInput,
  updaterQualificationInputDigest,
  updaterRuntimeCapabilityExpression,
  waitForInspector,
} from '../../../scripts/release/opl-updater-vm-smoke.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureArgs(): string[] {
  const root = mkdtempSync(join(tmpdir(), 'opl-updater-vm-test-'));
  roots.push(root);
  const dmg = join(root, 'old.dmg');
  const feed = join(root, 'feed');
  writeFileSync(dmg, 'old dmg');
  mkdirSync(feed);
  return [
    '--old-dmg',
    dmg,
    '--feed-dir',
    feed,
    '--expected-current-display-version',
    '26.7.20',
    '--expected-current-version',
    '26.7.20',
    '--expected-display-version',
    '26.7.20-r1',
    '--expected-updater-version',
    '26.7.2001',
    '--non-final',
    '--artifacts',
    join(root, 'artifacts'),
  ];
}

describe('updater VM smoke contract', () => {
  it('binds the legacy installed version to a distinct display and machine target', () => {
    const options = parseUpdaterVmArgs(fixtureArgs());
    expect(options?.expectedCurrentDisplayVersion).toBe('26.7.20');
    expect(options?.expectedCurrentVersion).toBe('26.7.20');
    expect(options?.expectedDisplayVersion).toBe('26.7.20-r1');
    expect(options?.expectedUpdaterVersion).toBe('26.7.2001');
    expect(options?.evidenceScope).toBe('non_final');
    expect(updaterEvidenceScopeAllowsLatest(options?.evidenceScope)).toBe(false);
  });

  it('requires every immutable identity for release qualification while allowing explicit non-final rehearsals', () => {
    const finalArgs = fixtureArgs().filter((value) => value !== '--non-final');
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
    const finalOptions = parseUpdaterVmArgs(finalArgs);
    expect(finalOptions?.evidenceScope).toBe('release_qualification');
    expect(updaterEvidenceScopeAllowsLatest(finalOptions?.evidenceScope)).toBe(true);

    for (const label of ['--bundle-digest', '--app-sha', '--shell-sha', '--framework-sha']) {
      const missing = [...finalArgs];
      const index = missing.indexOf(label);
      missing.splice(index, 2);
      expect(() => parseUpdaterVmArgs(missing), `${label} must fail closed`).toThrow(
        new RegExp(`${label} is required for release qualification`)
      );
    }
  });

  it('rejects a qualification that cannot prove a strictly newer machine identity', () => {
    const args = fixtureArgs();
    const targetIndex = args.indexOf('--expected-updater-version') + 1;
    args[targetIndex] = '26.7.20';
    expect(() => parseUpdaterVmArgs(args)).toThrow(/strictly newer machine version/);

    args[targetIndex] = '26.7.19';
    expect(() => parseUpdaterVmArgs(args)).toThrow(/strictly newer machine version/);
  });

  it('compares SemVer core segments as decimal integers', () => {
    expect(compareMachineVersions('26.7.900', '26.7.1000')).toBeLessThan(0);
    expect(compareMachineVersions('26.7.2001', '26.7.20')).toBeGreaterThan(0);
    expect(compareMachineVersions('26.8.100', '26.7.3109')).toBeGreaterThan(0);
  });

  it('serves complete, bounded, and suffix byte ranges for electron-updater', () => {
    expect(parseHttpRange(undefined, 100)).toBeNull();
    expect(parseHttpRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseHttpRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseHttpRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(() => parseHttpRange('bytes=100-101', 100)).toThrow(/Unsatisfiable/);
  });

  it('uses only the packaged native createRequire anchor and waits for every updater capability', () => {
    const packageAnchor = '/Applications/One Person Lab.app/Contents/Resources/app.asar/package.json';
    const sources = [
      updaterRuntimeCapabilityExpression(packageAnchor),
      updaterLoaderProbeExpression(packageAnchor),
      updaterExpression(packageAnchor, 'http://127.0.0.1:1234/', 'check'),
      updaterExpression(packageAnchor, 'http://127.0.0.1:1234/', 'download'),
      updaterExpression(packageAnchor, 'http://127.0.0.1:1234/', 'install'),
      updaterExpression(packageAnchor, 'http://127.0.0.1:1234/', 'quit'),
    ];
    for (const source of sources) {
      expect(source).toContain("process.getBuiltinModule('node:module')");
      expect(source).toContain('createRequire');
      expect(source).not.toMatch(/typeof\s+require\b/);
      expect(source).not.toContain('process.mainModule');
    }
    const installSource = updaterExpression(packageAnchor, 'http://127.0.0.1:1234/', 'install');
    const downloadSource = updaterExpression(packageAnchor, 'http://127.0.0.1:1234/', 'download');
    expect(downloadSource).toContain('armUpdaterInstallExit(autoUpdater, (code) => app.exit(code))');
    expect(downloadSource).toContain('listener_bound_before_download');
    expect(installSource).toMatch(/setTimeout\(\(\) => \{\s*requestUpdaterInstallExit\(autoUpdater\);\s*\}, 250\)/);
    expect(installSource).toContain('electron-updater.MacUpdater.nativeUpdater');
    expect(installSource).toContain('native_event_observed_then_post_quitAndInstall_microtask');
    expect(installSource).toContain('requestUpdaterInstallExit(autoUpdater)');
    expect(installSource).toContain('install_scheduled: true');

    const ready = {
      process_get_builtin_module: true,
      node_module_create_require: true,
      app_is_ready: true,
      node_http_create_server: true,
      updater_check_for_updates: true,
      updater_download_update: true,
      updater_quit_and_install: true,
      updater_native_event_listener: true,
    };
    expect(isUpdaterRuntimeReady(ready)).toBe(true);
    expect(isUpdaterRuntimeReady({ ...ready, app_is_ready: false })).toBe(false);
    expect(isUpdaterRuntimeReady({ ...ready, node_http_create_server: false })).toBe(false);
    expect(isUpdaterRuntimeReady({ ...ready, updater_download_update: false })).toBe(false);
    expect(isUpdaterRuntimeReady({ ...ready, updater_native_event_listener: false })).toBe(false);

    const loaderProbe = {
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
    };
    expect(updaterLoaderProbeIsHealthy(loaderProbe)).toBe(true);
    expect(
      updaterLoaderProbeIsHealthy({
        ...loaderProbe,
        mac_updater_http: { create_server_type: 'undefined' },
      })
    ).toBe(false);
    const loaderProbeSource = updaterLoaderProbeExpression(packageAnchor);
    expect(loaderProbeSource).toContain("packageLoader('http')");
    expect(loaderProbeSource).toContain("packageLoader('node:http')");
    expect(loaderProbeSource).toContain("require?.('http')");
    expect(loaderProbeSource).toContain('Object.getOwnPropertyDescriptor');
    expect(loaderProbeSource).toContain('electron_run_as_node_enabled');
  });

  it('binds before download and exits after quitAndInstall when the native event was already observed', () => {
    const nativeAutoUpdater = new EventEmitter();
    const events: string[] = [];
    const deferred: Array<() => void> = [];
    const exits: number[] = [];
    nativeAutoUpdater.on('update-downloaded', () => events.push('mac_updater_constructor_observed'));
    const autoUpdater = {
      nativeUpdater: nativeAutoUpdater,
      quitAndInstall: () => events.push('electron_updater_quit_requested'),
    };

    const strategy = armUpdaterInstallExit(
      autoUpdater,
      (code) => exits.push(code),
      (callback) => {
        events.push('exit_deferred');
        deferred.push(callback);
      }
    );
    expect(strategy).toEqual({
      native_event_source: 'electron-updater.MacUpdater.nativeUpdater',
      listener_bound_before_download: true,
      same_native_updater: true,
      exit_trigger: 'native_event_observed_then_post_quitAndInstall_microtask',
    });

    nativeAutoUpdater.emit('update-downloaded');
    expect(events).toEqual(['mac_updater_constructor_observed']);
    expect(exits).toEqual([]);

    expect(requestUpdaterInstallExit(autoUpdater)).toEqual({
      native_event_observed_before_install_request: true,
      install_requested: true,
      exit_scheduled: true,
    });
    expect(events).toEqual(['mac_updater_constructor_observed', 'electron_updater_quit_requested', 'exit_deferred']);
    expect(exits).toEqual([]);
    deferred[0]?.();
    expect(exits).toEqual([0]);
  });

  it('exits only after every listener finishes when the native event follows the install request', () => {
    const nativeAutoUpdater = new EventEmitter();
    const events: string[] = [];
    const deferred: Array<() => void> = [];
    const exits: number[] = [];
    nativeAutoUpdater.on('update-downloaded', () => events.push('mac_updater_constructor_observed'));
    const autoUpdater = {
      nativeUpdater: nativeAutoUpdater,
      quitAndInstall: () => {
        events.push('electron_updater_quit_requested');
        nativeAutoUpdater.on('update-downloaded', () => events.push('native_install_requested'));
      },
    };

    const strategy = armUpdaterInstallExit(
      autoUpdater,
      (code) => exits.push(code),
      (callback) => {
        events.push('exit_deferred');
        deferred.push(callback);
      }
    );
    expect(strategy).toEqual({
      native_event_source: 'electron-updater.MacUpdater.nativeUpdater',
      listener_bound_before_download: true,
      same_native_updater: true,
      exit_trigger: 'native_event_observed_then_post_quitAndInstall_microtask',
    });
    expect(requestUpdaterInstallExit(autoUpdater)).toEqual({
      native_event_observed_before_install_request: false,
      install_requested: true,
      exit_scheduled: false,
    });
    expect(events).toEqual(['electron_updater_quit_requested']);

    nativeAutoUpdater.emit('update-downloaded');
    expect(events).toEqual([
      'electron_updater_quit_requested',
      'mac_updater_constructor_observed',
      'exit_deferred',
      'native_install_requested',
    ]);
    expect(exits).toEqual([]);
    deferred[0]?.();
    expect(exits).toEqual([0]);
  });

  it('rejects an inspector evaluation when the app closes the socket before replying', async () => {
    const listeners = new Map<string, (event: { data?: string }) => void>();
    const socket = {
      addEventListener: (name: string, listener: (event: { data?: string }) => void) => listeners.set(name, listener),
      send: () => undefined,
      close: () => undefined,
    };
    const client = new InspectorClient(socket);
    const pending = client.call('Runtime.evaluate', { expression: 'true' });
    listeners.get('close')?.({});
    await expect(pending).rejects.toThrow(/closed before the pending evaluation completed/);
  });

  it('bounds an inspector evaluation that never receives a response', async () => {
    const socket = {
      addEventListener: () => undefined,
      send: () => undefined,
      close: () => undefined,
    };
    const client = new InspectorClient(socket);
    await expect(client.call('Runtime.evaluate', { expression: 'true' }, 5, 'bounded probe')).rejects.toThrow(
      /bounded probe timed out/
    );
  });

  it('aborts a stalled inspector HTTP probe at the absolute deadline', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('probe aborted')), { once: true });
      })) as typeof fetch;
    try {
      await expect(waitForInspector(12345, Date.now() + 15)).rejects.toThrow(/Timed out waiting/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('terminates a synchronous external command at the absolute deadline', () => {
    let failure: unknown = null;
    try {
      run(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {
        deadline: Date.now() + 20,
        label: 'Baseline App copy',
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/Baseline App copy:.*ETIMEDOUT/s);
    expect(updaterFailureEvidence('install_baseline', failure)).toMatchObject({
      classification: 'qualification_deadline_exceeded',
      code: 'ETIMEDOUT',
    });
  });

  it('falls back from a bounded normal DMG detach to one bounded forced detach', () => {
    expect(dmgDetachAttempts('/tmp/opl-updater-mount')).toEqual([
      ['detach', '/tmp/opl-updater-mount'],
      ['detach', '-force', '/tmp/opl-updater-mount'],
    ]);
  });

  it('removes the temporary mount after detach failure while preserving the primary failure', () => {
    const actions: string[] = [];
    const primaryError = new Error('attach failed');
    const detachError = new Error('detach failed');
    expect(
      cleanupMountedDmg(
        '/tmp/opl-updater-mount',
        Date.now() + 1_000,
        primaryError,
        () => {
          actions.push('detach');
          throw detachError;
        },
        () => actions.push('remove')
      )
    ).toBe(detachError);
    expect(actions).toEqual(['detach', 'remove']);

    expect(() =>
      cleanupMountedDmg(
        '/tmp/opl-updater-mount',
        Date.now() + 1_000,
        null,
        () => {
          throw detachError;
        },
        () => undefined
      )
    ).toThrow(detachError);
  });

  it('binds the actual downloaded ZIP bytes to the frozen feed digest and size', () => {
    const root = mkdtempSync(join(tmpdir(), 'opl-updater-zip-test-'));
    roots.push(root);
    const expectedZip = join(root, 'feed.zip');
    const downloadedZip = join(root, 'downloaded.zip');
    writeFileSync(expectedZip, 'exact frozen candidate bytes');
    writeFileSync(downloadedZip, 'exact frozen candidate bytes');

    const expectedEvidence = fileEvidence(expectedZip);
    const downloaded = bindDownloadedZipEvidence([downloadedZip], expectedEvidence);
    const qualification = candidateZipQualification(expectedEvidence, downloaded.zip);
    expect(qualification).toMatchObject({
      expected_candidate_zip_sha256: expectedEvidence.sha256,
      downloaded_candidate_zip_sha256: expectedEvidence.sha256,
      expected_candidate_zip_size_bytes: expectedEvidence.size_bytes,
      downloaded_candidate_zip_size_bytes: expectedEvidence.size_bytes,
      same_candidate_zip_downloaded: true,
    });

    writeFileSync(downloadedZip, 'different candidate bytes');
    expect(() => bindDownloadedZipEvidence([downloadedZip], expectedEvidence)).toThrow(/does not match/);
    expect(
      candidateZipQualification(expectedEvidence, {
        ...expectedEvidence,
        sha256: 'f'.repeat(64),
      }).same_candidate_zip_downloaded
    ).toBe(false);
    expect(
      candidateZipQualification(expectedEvidence, {
        ...expectedEvidence,
        size_bytes: expectedEvidence.size_bytes + 1,
      }).same_candidate_zip_downloaded
    ).toBe(false);
  });

  it('requires an installed renderer-byte readback for display and release-tag identity', () => {
    const packageAnchor = '/Applications/One Person Lab.app/Contents/Resources/app.asar/package.json';
    const source = installedReleaseIdentityExpression(packageAnchor, '26.7.20-r1');
    expect(source).toContain("source: 'installed_app_renderer_bundle'");
    expect(source).toContain("release_tag_derivation: 'v_prefix_of_embedded_display_version'");
    expect(source).not.toMatch(/typeof\s+require\b/);
    expect(source).not.toContain('process.mainModule');

    const identity = {
      updater_version: '26.7.2001',
      display_version: '26.7.20-r1',
      release_tag: 'v26.7.20-r1',
      evidence: { matching_files: [{ path: 'out/renderer/index.js', sha256: 'a'.repeat(64) }] },
    };
    expect(installedReleaseIdentityMatches(identity, '26.7.20-r1', '26.7.2001')).toBe(true);
    expect(installedReleaseIdentityMatches({ ...identity, release_tag: 'v26.7.20' }, '26.7.20-r1', '26.7.2001')).toBe(
      false
    );
  });

  it('binds machine-checkable input and typed failure evidence to the frozen cohort', () => {
    const options = {
      evidenceScope: 'release_qualification',
      bundleDigest: `sha256:${'a'.repeat(64)}`,
      appSha: 'a'.repeat(40),
      shellSha: 'b'.repeat(40),
      frameworkSha: 'c'.repeat(40),
      expectedCurrentDisplayVersion: '26.7.20',
      expectedCurrentVersion: '26.7.20',
      expectedDisplayVersion: '26.7.20-r1',
      expectedUpdaterVersion: '26.7.2001',
    };
    const input = updaterQualificationInput(
      options,
      {
        metadata: { size_bytes: 1, sha256: '1'.repeat(64) },
        zip: { size_bytes: 2, sha256: '2'.repeat(64) },
        blockmap: { size_bytes: 3, sha256: '3'.repeat(64) },
      },
      { size_bytes: 4, sha256: '4'.repeat(64) },
      { size_bytes: 5, sha256: '5'.repeat(64) }
    );
    expect(input.evidence_scope).toBe('release_qualification');
    expect(updaterQualificationInputDigest(input)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(updaterQualificationInputDigest({ b: 1, a: 2 })).toBe(updaterQualificationInputDigest({ a: 2, b: 1 }));
    expect(updaterFailureEvidence('download_candidate', new Error('network failed'))).toMatchObject({
      stage: 'download_candidate',
      classification: 'qualification_stage_failure',
      type: 'Error',
      message: 'network failed',
    });
    expect(
      updaterFailureEvidence(
        'install_candidate',
        new Error('Old app updater process did not exit before the qualification deadline.')
      )
    ).toMatchObject({
      classification: 'native_updater_exit_not_observed',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { collectBackendInstallDiagnostics } from '@/process/startup/backendInstallDiagnostics';
import {
  appendAutoUpdateDiagnosticEvent,
  appendInstallNotAppliedDiagnosticIfNeeded,
  appendPostAppUpdateReconcileResult,
  appendPostAppUpdateReconcileStartedIfNeeded,
} from '@/process/services/autoUpdateDiagnostics';

describe('collectBackendInstallDiagnostics', () => {
  it('records packaged runtime manifest and missing backend binary metadata', () => {
    const files = new Map<string, { mtimeMs: number; size: number; content?: string }>([
      ['C:\\AionUi\\resources', { mtimeMs: 1000, size: 0 }],
      ['C:\\AionUi\\resources\\bundled-aioncore\\win32-x64', { mtimeMs: 2000, size: 0 }],
      [
        'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\manifest.json',
        {
          mtimeMs: 3000,
          size: 88,
          content: JSON.stringify({
            version: 'v0.9.0',
            generatedAt: '2026-05-29T12:00:00.000Z',
            sourceType: 'download',
            files: ['aioncore.exe', 'managed-resources/'],
          }),
        },
      ],
    ]);

    const diagnostics = collectBackendInstallDiagnostics(
      {
        runtimeKey: 'win32-x64',
        binaryName: 'aioncore.exe',
        resourcesPath: 'C:\\AionUi\\resources',
        checkedBundledPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe',
      },
      {
        appVersion: '2.1.7',
        arch: 'x64',
        execPath: 'C:\\AionUi\\AionUi.exe',
        isPackaged: true,
        platform: 'win32',
        readFile: (filePath) => files.get(filePath)?.content,
        stat: (filePath) => files.get(filePath),
      }
    );

    expect(diagnostics).toEqual({
      appVersion: '2.1.7',
      arch: 'x64',
      binaryExists: false,
      binaryName: 'aioncore.exe',
      binaryPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe',
      bundledDirPath: 'C:\\AionUi\\resources\\bundled-aioncore',
      execPath: 'C:\\AionUi\\AionUi.exe',
      isPackaged: true,
      manifestExists: true,
      manifestFiles: ['aioncore.exe', 'managed-resources/'],
      manifestGeneratedAt: '2026-05-29T12:00:00.000Z',
      manifestPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64\\manifest.json',
      manifestSize: 88,
      manifestMtimeMs: 3000,
      manifestSourceType: 'download',
      manifestVersion: 'v0.9.0',
      platform: 'win32',
      resourcesDirMtimeMs: 1000,
      resourcesPath: 'C:\\AionUi\\resources',
      runtimeDirMtimeMs: 2000,
      runtimeDirPath: 'C:\\AionUi\\resources\\bundled-aioncore\\win32-x64',
      runtimeKey: 'win32-x64',
    });
  });
});

describe('appendAutoUpdateDiagnosticEvent', () => {
  it('keeps recent updater events and records quitAndInstall separately', () => {
    const state = appendAutoUpdateDiagnosticEvent(
      {
        currentAppVersion: '2.1.7',
        events: [],
      },
      {
        at: '2026-05-30T08:00:00.000Z',
        status: 'downloaded',
        version: '2.1.8',
      }
    );

    const next = appendAutoUpdateDiagnosticEvent(state, {
      at: '2026-05-30T08:01:00.000Z',
      status: 'quit-and-install',
    });

    expect(next).toEqual({
      currentAppVersion: '2.1.7',
      events: [
        {
          at: '2026-05-30T08:00:00.000Z',
          status: 'downloaded',
          version: '2.1.8',
        },
        {
          at: '2026-05-30T08:01:00.000Z',
          status: 'quit-and-install',
        },
      ],
      lastEvent: {
        at: '2026-05-30T08:01:00.000Z',
        status: 'quit-and-install',
      },
      lastQuitAndInstallAt: '2026-05-30T08:01:00.000Z',
    });
  });

  it('records when a downloaded update still is not applied after quitAndInstall', () => {
    const state = {
      currentAppVersion: '26.6.3',
      events: [
        {
          at: '2026-06-07T01:30:00.000Z',
          status: 'downloaded' as const,
          version: '26.6.5',
        },
        {
          at: '2026-06-07T01:31:00.000Z',
          status: 'quit-and-install' as const,
        },
      ],
      lastEvent: {
        at: '2026-06-07T01:31:00.000Z',
        status: 'quit-and-install' as const,
      },
      lastQuitAndInstallAt: '2026-06-07T01:31:00.000Z',
    };

    const next = appendInstallNotAppliedDiagnosticIfNeeded(state, {
      currentAppVersion: '26.6.3',
      now: () => new Date('2026-06-07T01:34:00.000Z'),
    });

    expect(next.lastEvent).toEqual({
      at: '2026-06-07T01:34:00.000Z',
      status: 'install-not-applied',
      version: '26.6.5',
      currentVersion: '26.6.3',
      reason: 'current_version_lower_than_downloaded_after_quit_and_install',
    });
    expect(next.events.at(-1)).toEqual(next.lastEvent);
  });

  it('does not record install-not-applied after the app reaches the downloaded version', () => {
    const state = {
      currentAppVersion: '26.6.5',
      events: [
        {
          at: '2026-06-07T01:30:00.000Z',
          status: 'downloaded' as const,
          version: '26.6.5',
        },
        {
          at: '2026-06-07T01:31:00.000Z',
          status: 'quit-and-install' as const,
        },
      ],
      lastEvent: {
        at: '2026-06-07T01:31:00.000Z',
        status: 'quit-and-install' as const,
      },
      lastQuitAndInstallAt: '2026-06-07T01:31:00.000Z',
    };

    const next = appendInstallNotAppliedDiagnosticIfNeeded(state, {
      currentAppVersion: '26.6.5',
      now: () => new Date('2026-06-07T01:34:00.000Z'),
    });

    expect(next).toEqual({
      ...state,
      currentAppVersion: '26.6.5',
    });
  });

  it('claims OPL Flow optimization once after the running App reaches the downloaded target', () => {
    const state = {
      currentAppVersion: '26.6.3',
      events: [
        {
          at: '2026-06-07T01:30:00.000Z',
          status: 'downloaded' as const,
          version: '26.6.5',
        },
        {
          at: '2026-06-07T01:31:00.000Z',
          status: 'quit-and-install' as const,
        },
      ],
      lastEvent: {
        at: '2026-06-07T01:31:00.000Z',
        status: 'quit-and-install' as const,
      },
      lastQuitAndInstallAt: '2026-06-07T01:31:00.000Z',
    };

    const first = appendPostAppUpdateReconcileStartedIfNeeded(state, {
      currentAppVersion: '26.6.5',
      now: () => new Date('2026-06-07T01:34:00.000Z'),
    });
    const repeated = appendPostAppUpdateReconcileStartedIfNeeded(first.state, {
      currentAppVersion: '26.6.5',
      now: () => new Date('2026-06-07T01:35:00.000Z'),
    });

    expect(first.claim).toEqual({ currentVersion: '26.6.5', targetVersion: '26.6.5' });
    expect(first.state.events.slice(-2).map((event) => event.status)).toEqual([
      'running_version_switched',
      'opl_flow_optimize_started',
    ]);
    expect(repeated.claim).toBeUndefined();
    expect(repeated.state.events).toEqual(first.state.events);
  });

  it('does not claim OPL Flow optimization before the running version switches', () => {
    const next = appendPostAppUpdateReconcileStartedIfNeeded(
      {
        currentAppVersion: '26.6.3',
        events: [
          { at: '2026-06-07T01:30:00.000Z', status: 'downloaded', version: '26.6.5' },
          { at: '2026-06-07T01:31:00.000Z', status: 'quit-and-install' },
        ],
      },
      { currentAppVersion: '26.6.3' }
    );

    expect(next.claim).toBeUndefined();
    expect(next.state.events).toHaveLength(2);
  });

  it('projects a Framework merge packet without claiming optimization completed', () => {
    const next = appendPostAppUpdateReconcileResult(
      {
        currentAppVersion: '26.6.5',
        events: [],
      },
      { currentVersion: '26.6.5', targetVersion: '26.6.5' },
      {
        ok: true,
        parsed: {
          workflow_package: {
            status: 'profile_merge_required',
            receipt_path: '/tmp/opl-flow-receipt.json',
            profile: {
              status: 'merge_required',
              merge_packet: '/tmp/opl-flow-merge-packet',
            },
          },
        },
      },
      { now: () => new Date('2026-06-07T01:36:00.000Z') }
    );

    expect(next.lastEvent).toMatchObject({
      mergePacketPath: '/tmp/opl-flow-merge-packet',
      profileStatus: 'merge_required',
      reason: 'profile_merge_required',
      receiptPath: '/tmp/opl-flow-receipt.json',
      status: 'opl_flow_optimize_attention_required',
      workflowStatus: 'profile_merge_required',
    });
  });

  it('records a Framework command failure without claiming optimization completed', () => {
    const next = appendPostAppUpdateReconcileResult(
      {
        currentAppVersion: '26.6.5',
        events: [],
      },
      { currentVersion: '26.6.5', targetVersion: '26.6.5' },
      {
        error: { message: 'managed update lock is held' },
        ok: false,
      },
      { now: () => new Date('2026-06-07T01:37:00.000Z') }
    );

    expect(next.lastEvent).toMatchObject({
      error: 'managed update lock is held',
      reason: 'framework_command_failed',
      status: 'opl_flow_optimize_failed',
    });
  });
});

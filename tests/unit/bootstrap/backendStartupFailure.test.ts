import { describe, expect, it, vi } from 'vitest';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';
import { detectStartupArchitectureMismatch } from '@/process/startup/architectureCompatibility';
import { recoverCorruptedDatabaseAfterUserConfirmation } from '@/process/startup/recoverCorruptedDatabase';
import {
  getBackendStartupFailureDialogRoute,
  buildStartupSupportIssueUrl,
  getDownloadLatestModalActionProps,
  getInstallationIntegrityDescription,
  getInstallationIntegrityModalActions,
  getInstallationIntegritySecondaryText,
  getInstallationIntegrityTitle,
} from '@/renderer/components/layout/InstallationIntegrityDialog';

const translateKey = (key: string) => key;
const translateStartupIssue = (key: string, options?: Record<string, string>) => {
  if (key === 'common.backendStartup.supportIssue.title') return '[Startup] One Person Lab local service failed';
  if (key === 'common.backendStartup.supportIssue.body') {
    return [
      `App version: ${options?.version}`,
      `Platform: ${options?.platform}`,
      `Architecture: ${options?.architecture}`,
      `Failure reason: ${options?.reason}`,
      `Backend boundary code: ${options?.boundaryCode}`,
      `Backend boundary stage: ${options?.boundaryStage}`,
    ].join('\n');
  }
  return key;
};

describe('classifyBackendStartupFailure', () => {
  it('classifies missing GLIBC symbols as an incompatible backend runtime', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      stderrTail:
        "/opt/AionUi/resources/bundled-aioncore/linux-x64/aioncore.bin: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found\n" +
        "/opt/AionUi/resources/bundled-aioncore/linux-x64/aioncore.bin: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.32' not found",
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incompatible_runtime',
      runtime: 'glibc',
      requiredVersions: ['2.32', '2.34'],
    });
  });

  it('keeps unrelated startup failures in the generic bucket', () => {
    const error = new Error('aioncore failed to start within timeout') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'health_timeout',
      stderrTail: 'database is locked',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
    });
  });

  it('classifies missing startup directory preparation as a startup directory failure', () => {
    const error = new Error('aioncore startup directory preparation failed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'spawn',
      workDir: 'D:\\ai\\AionUI\\workspace',
      causeMessage: 'ENOENT: no such file or directory, mkdir D:\\ai\\AionUI\\workspace',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_directory_unavailable',
      startupDirectoryIssueKind: 'missing_or_unavailable_directory',
    });
  });

  it('classifies startup directory permission failures separately from incomplete installs', () => {
    const error = new Error('aioncore startup directory preparation failed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'spawn',
      workDir: 'D:\\ai\\AionUI\\workspace',
      causeMessage: 'EPERM: operation not permitted, mkdir D:\\ai\\AionUI\\workspace',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_directory_unavailable',
      startupDirectoryIssueKind: 'permission_denied',
    });
  });

  it('does not classify a missing backend executable as a startup directory failure', () => {
    const error = new Error('aioncore process emitted an error before startup') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'spawn_error',
      binaryPath: 'D:\\apps\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe',
      causeMessage: 'spawn D:\\apps\\AionUi\\resources\\bundled-aioncore\\win32-x64\\aioncore.exe ENOENT',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: undefined,
      backendBoundaryStage: undefined,
    });
  });

  it('preserves backend bootstrap code and stage for generic startup failures', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      stderrTail: 'BOOTSTRAP_DATA_INIT_FAILED stage=database.open: failed to initialize application data',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.open',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.open',
    });
  });

  it('classifies recoverable database corruption before the generic startup bucket', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
      stderrTail:
        'BOOTSTRAP_DATA_INIT_FAILED stage=database.recoverable_corruption: failed to initialize application data',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });
  });

  it('classifies corruption-like database.open failures reported by AionCore 0.1.44 as recoverable', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.open',
      stderrTail:
        'BOOTSTRAP_DATA_INIT_FAILED stage=database.open databasePath=/tmp/aionui-backend.db: failed to initialize application data',
      stdoutTail:
        'bootstrap boundary failure code="BOOTSTRAP_DATA_INIT_FAILED" stage="database.open" error=Database query failed: error returned from database: (code: 26) file is not a database',
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.open',
    });
  });

  it('classifies packaged app resources missing from installation as incomplete installation', () => {
    const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'resolve_binary',
      isPackaged: true,
      runtimeKey: 'win32-x64',
      binaryName: 'aioncore.exe',
      bundledDirExists: false,
      runtimeDirExists: false,
      resourcesDirEntries: [
        'app-update.yml',
        'app.asar',
        'app.asar.unpacked/',
        'app.png',
        'elevate.exe',
        'manifest.webmanifest',
        'sw.js',
      ],
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incomplete_installation',
      incompleteInstallationKind: 'missing_directory_resources',
      missingBackendBinary: true,
      missingBundledAioncoreDir: true,
      missingHubDir: true,
      missingPetStatesDir: true,
      missingPwaDir: true,
      missingResources: ['bundled-aioncore/', 'bundled-aioncore/win32-x64/'],
      missingRuntimeDir: true,
    });
  });

  it('classifies packaged runtime directories without the backend binary as incomplete installation', () => {
    const error = new Error('aioncore startup failed while resolving backend binary') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'resolve_binary',
      isPackaged: true,
      runtimeKey: 'win32-x64',
      binaryName: 'aioncore.exe',
      bundledDirExists: true,
      runtimeDirExists: true,
      resourcesDirEntries: [
        'app-update.yml',
        'app.asar',
        'app.asar.unpacked/',
        'app.png',
        'bundled-aioncore/',
        'elevate.exe',
        'hub/',
        'manifest.webmanifest',
        'pet-states/',
        'pwa/',
        'sw.js',
      ],
      runtimeDirEntries: ['manifest.json'],
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_incomplete_installation',
      incompleteInstallationKind: 'missing_directory_resources',
      missingBackendBinary: true,
      missingBundledAioncoreDir: false,
      missingHubDir: false,
      missingPetStatesDir: false,
      missingPwaDir: false,
      missingResources: ['bundled-aioncore/win32-x64/managed-resources/', 'bundled-aioncore/win32-x64/aioncore.exe'],
      missingRuntimeDir: false,
    });
  });

  it('classifies packaged macOS architecture mismatches separately from generic startup failures', () => {
    const error = new Error('AionUi package architecture does not match this Mac') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'startup_architecture_check',
      platform: 'darwin',
      isPackaged: true,
      packageArch: 'x64',
      deviceArch: 'arm64',
      expectedDownloadArch: 'arm64',
      isRosettaTranslated: true,
    };

    expect(classifyBackendStartupFailure(error)).toEqual({
      reason: 'backend_package_architecture_mismatch',
      packageArch: 'x64',
      deviceArch: 'arm64',
      expectedDownloadArch: 'arm64',
      isRosettaTranslated: true,
    });
  });
});

describe('detectStartupArchitectureMismatch', () => {
  it('detects packaged macOS x64 builds running on Apple Silicon', () => {
    const mismatch = detectStartupArchitectureMismatch({
      arch: 'x64',
      isPackaged: true,
      platform: 'darwin',
      execFileSync: (command, args) => {
        expect(command).toBe('sysctl');
        if (args.join(' ') === '-in sysctl.proc_translated') return '1\n';
        if (args.join(' ') === '-in hw.optional.arm64') return '1\n';
        throw new Error(`unexpected args: ${args.join(' ')}`);
      },
    });

    expect(mismatch).toEqual({
      deviceArch: 'arm64',
      expectedDownloadArch: 'arm64',
      isPackaged: true,
      isRosettaTranslated: true,
      packageArch: 'x64',
      platform: 'darwin',
      stage: 'startup_architecture_check',
    });
  });

  it('allows packaged macOS x64 builds on Intel Macs', () => {
    const mismatch = detectStartupArchitectureMismatch({
      arch: 'x64',
      isPackaged: true,
      platform: 'darwin',
      execFileSync: (_command, args) => {
        if (args.join(' ') === '-in sysctl.proc_translated') return '0\n';
        if (args.join(' ') === '-in hw.optional.arm64') return '0\n';
        throw new Error(`unexpected args: ${args.join(' ')}`);
      },
    });

    expect(mismatch).toBeNull();
  });

  it('skips checks outside packaged macOS', () => {
    const mismatch = detectStartupArchitectureMismatch({
      arch: 'x64',
      isPackaged: false,
      platform: 'darwin',
      execFileSync: () => {
        throw new Error('sysctl should not be called');
      },
    });

    expect(mismatch).toBeNull();
  });
});

describe('getDownloadLatestModalActionProps', () => {
  it('hides the cancel action for blocking download-latest dialogs', () => {
    expect(getDownloadLatestModalActionProps(translateKey)).toMatchObject({
      okText: 'common.backendStartup.incompleteInstallation.downloadLatest',
      cancelButtonProps: {
        style: {
          display: 'none',
        },
      },
    });
  });
});

describe('getInstallationIntegrityModalActions', () => {
  it('uses a rebuild action instead of download for recoverable database corruption', () => {
    const onRecoverCorruptedDatabase = vi.fn();

    const actions = getInstallationIntegrityModalActions(translateKey, {
      diagnosticsKind: 'recoverable_database_corruption',
      onRecoverCorruptedDatabase,
    });

    expect(actions).toMatchObject({
      downloadText: undefined,
      recoverText: 'common.backendStartup.recoverableDatabaseCorruption.confirmRebuild',
      restartText: undefined,
      supportText: 'common.backendStartup.actions.openSupport',
    });
    actions.onRecoverCorruptedDatabase();
    expect(onRecoverCorruptedDatabase).toHaveBeenCalledOnce();
  });

  it.each(['startup_directory_permission_denied', 'startup_directory_unavailable', 'generic_startup_failure'] as const)(
    'offers restart and support recovery without an irrelevant install action for %s',
    (diagnosticsKind) => {
      expect(getInstallationIntegrityModalActions(translateKey, { diagnosticsKind })).toMatchObject({
        downloadText: undefined,
        recoverText: undefined,
        restartText: 'common.backendStartup.actions.restartApp',
        supportText: 'common.backendStartup.actions.openSupport',
      });
    }
  );

  it('routes download, support, and restart actions to the supplied executable handlers', async () => {
    const onDownloadLatest = vi.fn();
    const onOpenSupport = vi.fn();
    const onRestartApplication = vi.fn();
    const actions = getInstallationIntegrityModalActions(translateKey, {
      diagnosticsKind: 'generic_startup_failure',
      onDownloadLatest,
      onOpenSupport,
      onRestartApplication,
    });

    actions.onDownloadLatest();
    actions.onOpenSupport();
    await actions.onRestartApplication();

    expect(onDownloadLatest).toHaveBeenCalledOnce();
    expect(onOpenSupport).toHaveBeenCalledOnce();
    expect(onRestartApplication).toHaveBeenCalledOnce();
  });
});

describe('buildStartupSupportIssueUrl', () => {
  it('prefills a GitHub issue with non-sensitive startup diagnostics', () => {
    const issueUrl = new URL(
      buildStartupSupportIssueUrl(
        translateStartupIssue,
        'generic_startup_failure',
        {
          reason: 'backend_startup_failed',
          backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
          backendBoundaryStage: 'database.open',
        },
        { appVersion: '26.7.21', platform: 'darwin', architecture: 'arm64' }
      )
    );

    expect(`${issueUrl.origin}${issueUrl.pathname}`).toBe(
      'https://github.com/gaofeng21cn/one-person-lab-app/issues/new'
    );
    expect(issueUrl.searchParams.get('title')).toBe('[Startup] One Person Lab local service failed');
    expect(issueUrl.searchParams.get('body')).toContain('App version: 26.7.21');
    expect(issueUrl.searchParams.get('body')).toContain('Platform: darwin');
    expect(issueUrl.searchParams.get('body')).toContain('Architecture: arm64');
    expect(issueUrl.searchParams.get('body')).toContain('Failure reason: backend_startup_failed');
    expect(issueUrl.searchParams.get('body')).toContain('Backend boundary code: BOOTSTRAP_DATA_INIT_FAILED');
    expect(issueUrl.searchParams.get('body')).toContain('Backend boundary stage: database.open');
    expect(issueUrl.searchParams.get('body')).not.toMatch(/credential|\/Users\/|log body/i);
  });
});

describe('backend startup failure dialog routing', () => {
  it.each([
    [{ reason: 'backend_incompatible_runtime' }, { kind: 'incompatible_runtime' }],
    [
      { reason: 'backend_incomplete_installation' },
      { kind: 'installation_integrity', diagnosticsKind: 'incomplete_installation' },
    ],
    [{ reason: 'backend_package_architecture_mismatch' }, { kind: 'package_architecture_mismatch' }],
    [
      { reason: 'backend_recoverable_database_corruption' },
      { kind: 'installation_integrity', diagnosticsKind: 'recoverable_database_corruption' },
    ],
    [
      { reason: 'backend_startup_directory_unavailable', startupDirectoryIssueKind: 'permission_denied' },
      { kind: 'installation_integrity', diagnosticsKind: 'startup_directory_permission_denied' },
    ],
    [
      {
        reason: 'backend_startup_directory_unavailable',
        startupDirectoryIssueKind: 'missing_or_unavailable_directory',
      },
      { kind: 'installation_integrity', diagnosticsKind: 'startup_directory_unavailable' },
    ],
    [
      { reason: 'backend_startup_failed' },
      { kind: 'installation_integrity', diagnosticsKind: 'generic_startup_failure' },
    ],
  ] as const)('routes %s to a deterministic blocking surface', (failure, expectedRoute) => {
    expect(getBackendStartupFailureDialogRoute(failure as BackendStartupFailureInfo)).toEqual(expectedRoute);
  });

  it('does not render a failure dialog without a backend startup failure', () => {
    expect(getBackendStartupFailureDialogRoute(null)).toBeNull();
  });

  it('fails closed for a startup reason introduced by a newer main process', () => {
    const failure = { reason: 'backend_future_failure' } as unknown as BackendStartupFailureInfo;

    expect(getBackendStartupFailureDialogRoute(failure)).toEqual({
      kind: 'installation_integrity',
      diagnosticsKind: 'generic_startup_failure',
    });
  });

  it.each([
    ['startup_directory_permission_denied', 'common.backendStartup.startupDirectory.title'],
    ['startup_directory_unavailable', 'common.backendStartup.startupDirectory.title'],
    ['generic_startup_failure', 'common.backendStartup.genericFailure.title'],
  ] as const)('uses a specific title for %s', (diagnosticsKind, expectedKey) => {
    expect(getInstallationIntegrityTitle(translateKey, diagnosticsKind)).toBe(expectedKey);
  });

  it.each([
    [
      'startup_directory_permission_denied',
      'common.backendStartup.startupDirectory.permissionDeniedDescription',
      'common.backendStartup.startupDirectory.permissionDeniedAction',
    ],
    [
      'startup_directory_unavailable',
      'common.backendStartup.startupDirectory.unavailableDescription',
      'common.backendStartup.startupDirectory.unavailableAction',
    ],
    [
      'generic_startup_failure',
      'common.backendStartup.genericFailure.description',
      'common.backendStartup.genericFailure.action',
    ],
  ] as const)('uses specific description and action copy for %s', (diagnosticsKind, descriptionKey, actionKey) => {
    expect(getInstallationIntegrityDescription(translateKey, diagnosticsKind)).toBe(descriptionKey);
    expect(getInstallationIntegritySecondaryText(translateKey, diagnosticsKind)).toBe(actionKey);
  });
});

function makeRecoveryDeps(failure: BackendStartupFailureInfo | null) {
  return {
    getFailure: vi.fn(() => failure),
    stopBackend: vi.fn().mockResolvedValue(undefined),
    startBackendWithRecovery: vi.fn().mockResolvedValue(25808),
    markReady: vi.fn(),
    reloadMainWindow: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
  };
}

describe('recoverCorruptedDatabaseAfterUserConfirmation', () => {
  it('rejects recovery outside a recoverable database failure state', async () => {
    const deps = makeRecoveryDeps({ reason: 'backend_startup_failed' });

    await expect(recoverCorruptedDatabaseAfterUserConfirmation(deps)).rejects.toThrow(
      'backend_corrupted_database_recovery_not_available'
    );
    expect(deps.stopBackend).not.toHaveBeenCalled();
    expect(deps.startBackendWithRecovery).not.toHaveBeenCalled();
  });

  it('restarts with recovery and reloads only after a successful rebuild', async () => {
    const deps = makeRecoveryDeps({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });

    await recoverCorruptedDatabaseAfterUserConfirmation(deps);

    expect(deps.stopBackend).toHaveBeenCalledOnce();
    expect(deps.startBackendWithRecovery).toHaveBeenCalledOnce();
    expect(deps.markReady).toHaveBeenCalledWith(25808, 'backendManager.recoverCorruptedDatabase');
    expect(deps.reloadMainWindow).toHaveBeenCalledOnce();
  });

  it('does not mark ready or reload when the recovery restart fails', async () => {
    const deps = makeRecoveryDeps({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });
    deps.startBackendWithRecovery.mockRejectedValue(new Error('restart failed'));

    await expect(recoverCorruptedDatabaseAfterUserConfirmation(deps)).rejects.toThrow('restart failed');
    expect(deps.markReady).not.toHaveBeenCalled();
    expect(deps.reloadMainWindow).not.toHaveBeenCalled();
  });
});

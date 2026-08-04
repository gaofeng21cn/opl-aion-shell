/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';
import {
  getBackendStartupFailureDialogRoute,
  getInstallationIntegrityDescription,
  getInstallationIntegrityModalActions,
  getInstallationIntegritySecondaryText,
  getInstallationIntegrityTitle,
} from '@/renderer/components/layout/InstallationIntegrityDialog';

const translateKey = (key: string) => key;

describe('classifyBackendStartupFailure OPL Codex runtime errors', () => {
  it.each([
    'USER_AGENT_NOT_INSTALLED',
    'USER_AGENT_COMMAND_NOT_FOUND',
    'MANAGED_RUNTIME_UNAVAILABLE',
    'RUNTIME_ACTIVATION_REQUIRED',
  ])('preserves typed local runtime error %s as an incomplete installation', (code) => {
    expect(classifyBackendStartupFailure(Object.assign(new Error('local runtime unavailable'), { code }))).toEqual({
      reason: 'backend_incomplete_installation',
      incompleteInstallationKind: 'missing_backend_binary',
      missingBackendBinary: true,
      oplCodexRuntimeErrorCode: code,
    });
  });

  it('keeps an identity mismatch typed without misreporting a missing installation', () => {
    expect(
      classifyBackendStartupFailure(
        Object.assign(new Error('managed identity drifted'), { code: 'RUNTIME_IDENTITY_MISMATCH' })
      )
    ).toEqual({
      reason: 'backend_startup_failed',
      oplCodexRuntimeErrorCode: 'RUNTIME_IDENTITY_MISMATCH',
    });
  });
});

describe('classifyBackendStartupFailure transient concurrent startup', () => {
  it('classifies a peer-yield boundary without reporting data damage', () => {
    expect(
      classifyBackendStartupFailure({
        details: {
          backendBoundaryCode: 'BOOTSTRAP_PEER_ALREADY_RUNNING',
          backendBoundaryStage: 'instance_guard.acquire',
        },
      })
    ).toEqual({
      reason: 'backend_transient_concurrent_startup',
      backendBoundaryCode: 'BOOTSTRAP_PEER_ALREADY_RUNNING',
      backendBoundaryStage: 'instance_guard.acquire',
    });
  });

  it('classifies exhausted assistant bootstrap contention as transient', () => {
    expect(
      classifyBackendStartupFailure({
        details: {
          backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
          backendBoundaryStage: 'router.assistant.bootstrap.concurrency_contended',
        },
      })
    ).toEqual({
      reason: 'backend_transient_concurrent_startup',
      backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
      backendBoundaryStage: 'router.assistant.bootstrap.concurrency_contended',
    });
  });

  it('keeps a plain assistant bootstrap failure in the generic bucket', () => {
    expect(
      classifyBackendStartupFailure({
        details: {
          backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
          backendBoundaryStage: 'router.assistant.bootstrap',
        },
      })
    ).toEqual({
      reason: 'backend_startup_failed',
      backendBoundaryCode: 'BOOTSTRAP_SERVER_FAILED',
      backendBoundaryStage: 'router.assistant.bootstrap',
    });
  });

  it('keeps actual recoverable database corruption severe', () => {
    expect(
      classifyBackendStartupFailure({
        details: {
          backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
          backendBoundaryStage: 'database.recoverable_corruption',
        },
      })
    ).toEqual({
      reason: 'backend_recoverable_database_corruption',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.recoverable_corruption',
    });
  });

  it('routes transient contention to restart and support without install or rebuild actions', () => {
    const failure = {
      reason: 'backend_transient_concurrent_startup' as const,
      backendBoundaryCode: 'BOOTSTRAP_PEER_ALREADY_RUNNING',
      backendBoundaryStage: 'instance_guard.acquire',
    };

    expect(getBackendStartupFailureDialogRoute(failure)).toEqual({
      kind: 'installation_integrity',
      diagnosticsKind: 'transient_concurrent_startup',
    });
    expect(getInstallationIntegrityTitle(translateKey, 'transient_concurrent_startup')).toBe(
      'common.backendStartup.transientConcurrentStartup.title'
    );
    expect(getInstallationIntegrityDescription(translateKey, 'transient_concurrent_startup')).toBe(
      'common.backendStartup.transientConcurrentStartup.description'
    );
    expect(getInstallationIntegritySecondaryText(translateKey, 'transient_concurrent_startup')).toBe(
      'common.backendStartup.transientConcurrentStartup.action'
    );
    expect(
      getInstallationIntegrityModalActions(translateKey, { diagnosticsKind: 'transient_concurrent_startup' })
    ).toMatchObject({
      downloadText: undefined,
      recoverText: undefined,
      restartText: 'common.backendStartup.actions.restartApp',
      supportText: 'common.backendStartup.actions.openSupport',
    });
  });
});

describe('classifyBackendStartupFailure slow startup lifecycle', () => {
  it('classifies a listening process kept alive after health timeout as pending', () => {
    expect(
      classifyBackendStartupFailure({
        details: {
          stage: 'health_timeout',
          serverListeningObserved: true,
          healthTimeoutKeptAlive: true,
        },
      })
    ).toEqual({ reason: 'backend_startup_pending_slow' });
  });

  it('does not classify a killed health-timeout process as pending', () => {
    expect(
      classifyBackendStartupFailure({
        details: {
          stage: 'health_timeout',
          serverListeningObserved: true,
        },
      }).reason
    ).toBe('backend_startup_failed');
  });

  it('classifies a previously listening process that exits as an honest startup exit', () => {
    const failure = classifyBackendStartupFailure({
      details: {
        stage: 'early_exit',
        serverListeningObserved: true,
      },
    });

    expect(failure).toEqual({ reason: 'backend_startup_exited' });
    expect(getBackendStartupFailureDialogRoute(failure)).toEqual({
      kind: 'installation_integrity',
      diagnosticsKind: 'backend_exited',
    });
    expect(getInstallationIntegrityTitle(translateKey, 'backend_exited')).toBe('common.backendStartup.exited.title');
    expect(getInstallationIntegrityDescription(translateKey, 'backend_exited')).toBe(
      'common.backendStartup.exited.description'
    );
    expect(getInstallationIntegritySecondaryText(translateKey, 'backend_exited')).toBe(
      'common.backendStartup.exited.action'
    );
    expect(getInstallationIntegrityModalActions(translateKey, { diagnosticsKind: 'backend_exited' })).toMatchObject({
      downloadText: undefined,
      recoverText: undefined,
      restartText: 'common.backendStartup.actions.restartApp',
    });
  });

  it('does not route pending startup into a failure dialog', () => {
    expect(getBackendStartupFailureDialogRoute({ reason: 'backend_startup_pending_slow' })).toBeNull();
  });
});

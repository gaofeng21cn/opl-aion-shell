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

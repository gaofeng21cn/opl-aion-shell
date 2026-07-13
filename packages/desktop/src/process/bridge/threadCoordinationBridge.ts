/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import type {
  ThreadCoordinationExecuteRequest,
  ThreadCoordinationOverviewRequest,
  ThreadCoordinationReadRequest,
} from '@/common/types/codex/threadCoordination';
import {
  JsonlThreadCoordinationAuditStore,
  ThreadCoordinationService,
  type CodexThreadCoordinationPort,
} from '../services/threadCoordination';
import { createProductionCodexThreadCoordinationPort } from '../services/threadCoordination/codexAppServerPort';

let activePort: CodexThreadCoordinationPort | null = null;
let quitHandlerInstalled = false;

function auditPath(): string {
  return path.join(app.getPath('userData'), 'thread-coordination', 'audit.jsonl');
}

export function disposeThreadCoordinationBridge(): void {
  activePort?.dispose?.();
  activePort = null;
}

export function initThreadCoordinationBridge(
  port: CodexThreadCoordinationPort = createProductionCodexThreadCoordinationPort()
): void {
  disposeThreadCoordinationBridge();
  activePort = port;
  const service = new ThreadCoordinationService({
    port,
    auditStore: new JsonlThreadCoordinationAuditStore(auditPath()),
  });

  ipcBridge.threadCoordination.getOverview.provider((request: ThreadCoordinationOverviewRequest) =>
    service.getOverview(request)
  );
  ipcBridge.threadCoordination.readThread.provider(({ threadId }: ThreadCoordinationReadRequest) =>
    service.readThread(threadId)
  );
  ipcBridge.threadCoordination.execute.provider(({ request }: ThreadCoordinationExecuteRequest) =>
    service.execute(request)
  );
  if (!quitHandlerInstalled) {
    quitHandlerInstalled = true;
    app.on('before-quit', disposeThreadCoordinationBridge);
  }
}

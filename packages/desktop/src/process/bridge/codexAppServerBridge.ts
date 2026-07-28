/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { ipcBridge } from '@/common';
import { type CodexAppServerAdapter, createProductionCodexAppServerAdapter } from '../services/codexAppServer/adapter';

let activeAdapter: CodexAppServerAdapter | null = null;
let activeAdapterFactory: () => CodexAppServerAdapter = createProductionCodexAppServerAdapter;
let quitHandlerInstalled = false;

export function disposeCodexAppServerBridge(): void {
  activeAdapter?.dispose();
  activeAdapter = null;
}

function getActiveAdapter(): CodexAppServerAdapter {
  activeAdapter ??= activeAdapterFactory();
  return activeAdapter;
}

export function initCodexAppServerBridge(adapter?: CodexAppServerAdapter): void {
  disposeCodexAppServerBridge();
  activeAdapterFactory = adapter ? () => adapter : createProductionCodexAppServerAdapter;

  ipcBridge.codexThreads.list.provider((request) => getActiveAdapter().listThreads(request));
  ipcBridge.codexThreads.read.provider(({ threadId }) => getActiveAdapter().readThread(threadId));
  ipcBridge.codexThreads.start.provider((request) => getActiveAdapter().startThread(request));
  ipcBridge.codexThreads.resume.provider(({ threadId }) => getActiveAdapter().resumeThread(threadId));
  ipcBridge.codexThreads.fork.provider(({ threadId }) => getActiveAdapter().forkThread(threadId));
  ipcBridge.codexThreads.rename.provider(({ threadId, name }) => getActiveAdapter().renameThread(threadId, name));
  ipcBridge.codexThreads.updateSettings.provider(({ threadId, cwd }) =>
    getActiveAdapter().updateThreadSettings(threadId, cwd)
  );
  ipcBridge.codexThreads.archive.provider(({ threadId }) => getActiveAdapter().archiveThread(threadId));
  ipcBridge.codexThreads.unarchive.provider(({ threadId }) => getActiveAdapter().unarchiveThread(threadId));
  ipcBridge.codexThreads.delete.provider(({ threadId }) => getActiveAdapter().deleteThread(threadId));
  ipcBridge.codexThreads.startReview.provider((request) => getActiveAdapter().startReview(request));

  if (!quitHandlerInstalled) {
    quitHandlerInstalled = true;
    app.on('before-quit', disposeCodexAppServerBridge);
  }
}

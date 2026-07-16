/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import { ipcBridge } from '@/common';
import { type CodexAppServerAdapter, createProductionCodexAppServerAdapter } from '../services/codexAppServer/adapter';

let activeAdapter: CodexAppServerAdapter | null = null;
let quitHandlerInstalled = false;

export function disposeCodexAppServerBridge(): void {
  activeAdapter?.dispose();
  activeAdapter = null;
}

export function initCodexAppServerBridge(
  adapter: CodexAppServerAdapter = createProductionCodexAppServerAdapter()
): void {
  disposeCodexAppServerBridge();
  activeAdapter = adapter;

  ipcBridge.codexThreads.list.provider((request) => adapter.listThreads(request));
  ipcBridge.codexThreads.read.provider(({ threadId }) => adapter.readThread(threadId));
  ipcBridge.codexThreads.start.provider((request) => adapter.startThread(request));
  ipcBridge.codexThreads.resume.provider(({ threadId }) => adapter.resumeThread(threadId));
  ipcBridge.codexThreads.fork.provider(({ threadId }) => adapter.forkThread(threadId));
  ipcBridge.codexThreads.rename.provider(({ threadId, name }) => adapter.renameThread(threadId, name));
  ipcBridge.codexThreads.archive.provider(({ threadId }) => adapter.archiveThread(threadId));
  ipcBridge.codexThreads.unarchive.provider(({ threadId }) => adapter.unarchiveThread(threadId));
  ipcBridge.codexThreads.delete.provider(({ threadId }) => adapter.deleteThread(threadId));
  ipcBridge.codexThreads.startReview.provider((request) => adapter.startReview(request));

  if (!quitHandlerInstalled) {
    quitHandlerInstalled = true;
    app.on('before-quit', disposeCodexAppServerBridge);
  }
}

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { ipcBridge } from '@/common';
import { type CodexAppServerAdapter, createProductionCodexAppServerAdapter } from '../services/codexAppServer/adapter';
import { FileChannelBindingStore } from '../services/codexAppServer/channelBindings';

let activeAdapter: CodexAppServerAdapter | null = null;
let activeAdapterFactory: () => CodexAppServerAdapter = createDefaultAdapter;

function createDefaultAdapter(): CodexAppServerAdapter {
  const userDataPath = app.getPath('userData');
  const channelWorkspace = process.platform === 'win32' ? '/home/opl' : path.join(userDataPath, 'channel-workspace');
  if (process.platform !== 'win32') fs.mkdirSync(channelWorkspace, { recursive: true });
  return createProductionCodexAppServerAdapter({
    channelWorkspace,
    channelBindingStore: new FileChannelBindingStore(path.join(userDataPath, 'channel-bindings.json')),
  });
}

export async function disposeCodexAppServerBridge(): Promise<void> {
  const adapter = activeAdapter;
  activeAdapter = null;
  await adapter?.dispose();
}

function getActiveAdapter(): CodexAppServerAdapter {
  if (!activeAdapter) {
    activeAdapter = activeAdapterFactory();
    activeAdapter.setEventSink({
      response: (message) => ipcBridge.codexThreads.responseStream.emit(message),
      turnCompleted: (event) => ipcBridge.codexThreads.turnCompleted.emit(event),
    });
  }
  return activeAdapter;
}

/**
 * Exposes the already-installed canonical Codex adapter to narrowly scoped
 * domain consumers. Callers must not create a second app-server or task store.
 */
export function getActiveCodexAppServerAdapter(): CodexAppServerAdapter {
  return getActiveAdapter();
}

export function initCodexAppServerBridge(adapter?: CodexAppServerAdapter): void {
  void disposeCodexAppServerBridge();
  activeAdapterFactory = adapter ? () => adapter : createDefaultAdapter;

  ipcBridge.codexThreads.list.provider((request) => getActiveAdapter().listThreads(request));
  ipcBridge.codexThreads.read.provider(({ threadId, conversationId }) =>
    getActiveAdapter().readThread(threadId, conversationId)
  );
  ipcBridge.codexThreads.start.provider((request) => getActiveAdapter().startThread(request));
  ipcBridge.codexThreads.resume.provider(({ threadId }) => getActiveAdapter().resumeThread(threadId));
  ipcBridge.codexThreads.fork.provider(({ threadId }) => getActiveAdapter().forkThread(threadId));
  ipcBridge.codexThreads.rename.provider(({ threadId, name }) => getActiveAdapter().renameThread(threadId, name));
  ipcBridge.codexThreads.updateSettings.provider(({ threadId, cwd }) =>
    getActiveAdapter().updateThreadSettings(threadId, cwd)
  );
  ipcBridge.codexThreads.configure.provider((request) => getActiveAdapter().configureThread(request));
  ipcBridge.codexThreads.assignProjectAffinity.provider(({ threadId, projectId }) =>
    getActiveAdapter().assignProjectAffinity(threadId, projectId)
  );
  ipcBridge.codexThreads.archive.provider(({ threadId }) => getActiveAdapter().archiveThread(threadId));
  ipcBridge.codexThreads.unarchive.provider(({ threadId }) => getActiveAdapter().unarchiveThread(threadId));
  ipcBridge.codexThreads.delete.provider(({ threadId }) => getActiveAdapter().deleteThread(threadId));
  ipcBridge.codexThreads.startReview.provider((request) => getActiveAdapter().startReview(request));
  ipcBridge.codexThreads.startTurn.provider((request) => getActiveAdapter().startTurn(request));
  ipcBridge.codexThreads.interruptTurn.provider((request) => getActiveAdapter().interruptTurn(request));
  ipcBridge.codexThreads.respondApproval.provider((request) => getActiveAdapter().respondApproval(request));
  ipcBridge.codexThreads.pendingApprovals.provider(async ({ threadId, conversationId }) =>
    getActiveAdapter().listPendingApprovals(threadId, conversationId)
  );

  if (adapter) {
    getActiveAdapter();
  } else {
    void app
      .whenReady()
      .then(() => getActiveAdapter())
      .catch((error) => console.warn('[OPL] Codex App Server channel callback is unavailable:', error));
  }
}

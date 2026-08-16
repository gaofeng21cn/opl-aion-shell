import { app } from 'electron';
import { ipcBridge } from '@/common';
import type { RemoteCanonicalActionPort } from '../services/remote-companion/canonicalActionBridge';
import { RemoteCompanionService } from '../services/remote-companion/RemoteCompanionService';
import { readRemoteBrokerConfig, RemoteBrokerClient } from '../services/remote-companion/brokerClient';
import { ElectronRemoteCredentialStore } from '../services/remote-companion/credentialStore';
import { TencentCloudImAdapter } from '../services/remote-companion/tencentImAdapter';
import { getActiveCodexAppServerAdapter } from './codexAppServerBridge';

let activeService: RemoteCompanionService | null = null;
let disposeStateListener: (() => void) | null = null;

function createCanonicalPort(): RemoteCanonicalActionPort {
  const adapter = getActiveCodexAppServerAdapter();
  return {
    listThreads: () => adapter.listThreads({ includeArchived: false }),
    readThread: (threadId) => adapter.readThread(threadId),
    startTurn: (request) => adapter.startTurn(request),
    interruptTurn: (request) => adapter.interruptTurn(request),
  };
}

function getActiveService(): RemoteCompanionService {
  if (!activeService) {
    const brokerConfig = readRemoteBrokerConfig();
    const broker = new RemoteBrokerClient({ config: brokerConfig });
    activeService = new RemoteCompanionService({
      broker,
      brokerConfig,
      credentialStore: new ElectronRemoteCredentialStore(app.getPath('userData')),
      transport: new TencentCloudImAdapter(),
      canonical: createCanonicalPort(),
    });
    disposeStateListener = activeService.onStateChanged((state) => ipcBridge.remoteCompanion.stateChanged.emit(state));
  }
  return activeService;
}

export function initRemoteCompanionBridge(): void {
  ipcBridge.remoteCompanion.getState.provider(() => getActiveService().getState());
  ipcBridge.remoteCompanion.startPairing.provider((request) => getActiveService().startPairing(request));
  ipcBridge.remoteCompanion.pollPairing.provider((request) => getActiveService().pollPairing(request.pair_id));
  ipcBridge.remoteCompanion.confirmPairing.provider((request) => getActiveService().confirmPairing(request));
  ipcBridge.remoteCompanion.revokePairing.provider((request) => getActiveService().revokePair(request));
  ipcBridge.remoteCompanion.refreshPair.provider((request) => getActiveService().refreshPair(request.pair_id));
}

export function disposeRemoteCompanionBridge(): void {
  disposeStateListener?.();
  disposeStateListener = null;
  activeService?.dispose();
  activeService = null;
}

export const __remoteCompanionBridgeTest = {
  createCanonicalPort,
  reset: disposeRemoteCompanionBridge,
};

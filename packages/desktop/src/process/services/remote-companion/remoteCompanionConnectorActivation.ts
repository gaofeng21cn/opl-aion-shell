/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import type { CodexAppServerAdapter } from '../codexAppServer/adapter';
import { getActiveCodexAppServerAdapter } from '../../bridge/codexAppServerBridge';
import { CanonicalConversationBridge, type CanonicalConversationPort } from './canonicalConversationBridge';
import { ProtectedBlobAdapter, type ProtectedBlobAdapterOptions } from './protectedBlobAdapter';

export const REMOTE_COMPANION_CONNECTOR_ACTIVATION = 'remote_companion_connector' as const;

export type RemoteCompanionConnectorActivation = {
  activation: typeof REMOTE_COMPANION_CONNECTOR_ACTIVATION;
  packageId: string;
  conversation: CanonicalConversationBridge;
  protectedBlob: ProtectedBlobAdapter;
};

export type RemoteCompanionConnectorActivationOptions = {
  packageId: string;
  adapter?: CanonicalConversationPort | CodexAppServerAdapter;
  protectedBlob?: Omit<ProtectedBlobAdapterOptions, 'userDataPath' | 'packageId'>;
  userDataPath?: string;
};

export function createRemoteCompanionConnectorActivation(
  options: RemoteCompanionConnectorActivationOptions
): RemoteCompanionConnectorActivation {
  const adapter = options.adapter ?? getActiveCodexAppServerAdapter();
  const userDataPath = options.userDataPath ?? app.getPath('userData');
  return {
    activation: REMOTE_COMPANION_CONNECTOR_ACTIVATION,
    packageId: options.packageId,
    conversation: new CanonicalConversationBridge({ port: adapter }),
    protectedBlob: new ProtectedBlobAdapter({
      userDataPath,
      packageId: options.packageId,
      ...options.protectedBlob,
    }),
  };
}

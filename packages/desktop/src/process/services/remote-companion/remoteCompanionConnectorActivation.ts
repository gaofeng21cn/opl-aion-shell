/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import type { CodexAppServerAdapter } from '../codexAppServer/adapter';
import { getActiveCodexAppServerAdapter } from '../../bridge/codexAppServerBridge';
import {
  CanonicalConversationBridge,
  type CanonicalConversationFrameworkCallback,
  type CanonicalConversationPort,
} from './canonicalConversationBridge';
import {
  createProtectedBlobHost,
  ProtectedBlobAdapter,
  type ProtectedBlobAdapterOptions,
  type ProtectedBlobHost,
  type ProtectedBlobPort,
} from './protectedBlobAdapter';

export const REMOTE_COMPANION_CONNECTOR_ACTIVATION = 'remote_companion_connector' as const;

export type RemoteCompanionConnectorActivation = {
  activation: typeof REMOTE_COMPANION_CONNECTOR_ACTIVATION;
  packageId: string;
  conversation: CanonicalConversationBridge;
  conversationCallback: CanonicalConversationFrameworkCallback;
  protectedBlob: ProtectedBlobAdapter;
  protectedBlobPort: ProtectedBlobPort;
};

export type RemoteCompanionConnectorFrameworkActivation = {
  activation: typeof REMOTE_COMPANION_CONNECTOR_ACTIVATION;
  conversation: CanonicalConversationBridge;
  conversationCallback: CanonicalConversationFrameworkCallback;
  protectedBlobHost: ProtectedBlobHost;
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
  const conversation = new CanonicalConversationBridge({ port: adapter });
  const protectedBlob = new ProtectedBlobAdapter({
    userDataPath,
    packageId: options.packageId,
    ...options.protectedBlob,
  });
  return {
    activation: REMOTE_COMPANION_CONNECTOR_ACTIVATION,
    packageId: options.packageId,
    conversation,
    conversationCallback: conversation.frameworkCallback(),
    protectedBlob,
    protectedBlobPort: protectedBlob.frameworkPort(),
  };
}

export type RemoteCompanionConnectorFrameworkActivationOptions = {
  adapter?: CanonicalConversationPort | CodexAppServerAdapter;
  protectedBlob?: Omit<ProtectedBlobAdapterOptions, 'userDataPath' | 'packageId'>;
  userDataPath?: string;
};

export function createRemoteCompanionConnectorFrameworkActivation(
  options: RemoteCompanionConnectorFrameworkActivationOptions = {}
): RemoteCompanionConnectorFrameworkActivation {
  const adapter = options.adapter ?? getActiveCodexAppServerAdapter();
  const userDataPath = options.userDataPath ?? app.getPath('userData');
  const conversation = new CanonicalConversationBridge({ port: adapter });
  const protectedBlobHost = createProtectedBlobHost({
    userDataPath,
    ...options.protectedBlob,
  });
  return {
    activation: REMOTE_COMPANION_CONNECTOR_ACTIVATION,
    conversation,
    conversationCallback: conversation.frameworkCallback(),
    protectedBlobHost,
  };
}

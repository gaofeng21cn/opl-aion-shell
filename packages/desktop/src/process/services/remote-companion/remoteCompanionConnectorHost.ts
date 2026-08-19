/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { REMOTE_COMPANION_PROTOCOL_VERSION } from '@/common/types/remoteCompanion';
import {
  createRemoteCompanionConnectorFrameworkActivation,
  type RemoteCompanionConnectorFrameworkActivation,
} from './remoteCompanionConnectorActivation';
import type { CanonicalConversationPort } from './canonicalConversationBridge';
import type { CodexAppServerAdapter } from '../codexAppServer/adapter';

export const REMOTE_COMPANION_CONNECTOR_HOST_ACTION_BOUNDARY = 'opl.connect.remote-companion-connector-host' as const;

export type RemoteCompanionAccessRequest = Readonly<{
  package_id: string;
  ref: string;
  input?: Readonly<Record<string, unknown>>;
  confirmed?: boolean;
}>;

export type RemoteCompanionConnectorHostHandle = Readonly<{
  dispose(): void | Promise<void>;
  appStatePatch(): Readonly<Record<string, unknown>>;
  readRemoteCompanionAccess(input: RemoteCompanionAccessRequest): Promise<Readonly<Record<string, unknown>>>;
  executeRemoteCompanionAction(input: RemoteCompanionAccessRequest): Promise<Readonly<Record<string, unknown>>>;
}>;

type RemoteCompanionActivationContext = Readonly<{
  surface_kind: 'opl_remote_companion_activation_context.v1';
  package_id: string;
  environment: string;
  cohort_id: string;
  protocol_version: string;
  provider: string;
  service_origin: string;
  config_digest: string;
  config_summary: Readonly<Record<string, unknown>>;
  package_content_digest: string;
  package_artifact_digest: string;
}>;

export type RemoteCompanionConnectorHostBootstrap = (
  options: Readonly<{
    canonical_conversation_bridge: RemoteCompanionConnectorFrameworkActivation['conversationCallback'];
    protectedBlobHost: RemoteCompanionConnectorFrameworkActivation['protectedBlobHost'];
    activationContext: (
      descriptor: unknown
    ) => RemoteCompanionActivationContext | Promise<RemoteCompanionActivationContext>;
  }>
) => Promise<RemoteCompanionConnectorHostHandle>;

export type RemoteCompanionConnectorHostStartOptions = Readonly<{
  frameworkPackageRoot: string;
  adapter?: CanonicalConversationPort | CodexAppServerAdapter;
  userDataPath?: string;
  loadBootstrap?: (frameworkPackageRoot: string) => Promise<RemoteCompanionConnectorHostBootstrap>;
}>;

export type RemoteCompanionConnectorHostInitOptions = Readonly<{
  frameworkPackageRoot: string | null;
  adapter?: CanonicalConversationPort | CodexAppServerAdapter;
  userDataPath?: string;
  loadBootstrap?: (frameworkPackageRoot: string) => Promise<RemoteCompanionConnectorHostBootstrap>;
  logWarn?: (message: string) => void;
}>;

let activeRemoteCompanionConnectorHost: Promise<RemoteCompanionConnectorHostHandle | null> | null = null;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`Remote companion activation requires an exact ${field}.`);
  }
  return value;
}

function digest(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^sha256:[0-9a-f]{64}$/u.test(text)) {
    throw new Error(`Remote companion activation requires a sha256 ${field}.`);
  }
  return text;
}

function serviceOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Remote companion release cohort contains a non-JSON value.');
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function canonicalJsonProjection(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Remote companion release cohort contains a non-JSON number.');
    }
    if (
      typeof value === 'undefined' ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint'
    ) {
      throw new Error('Remote companion release cohort contains a non-JSON value.');
    }
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(canonicalJsonProjection));
  const object = value as Record<string, unknown>;
  return Object.freeze(
    Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalJsonProjection(object[key])])
    )
  );
}

function configDigest(input: {
  environment: string;
  cohortId: string;
  protocolVersion: string;
  provider: string;
  serviceOrigin: string;
  configSummary: Record<string, unknown>;
}): string {
  return `sha256:${crypto
    .createHash('sha256')
    .update(
      canonicalJson({
        environment: input.environment,
        cohort_id: input.cohortId,
        protocol_version: input.protocolVersion,
        provider: input.provider,
        service_origin: input.serviceOrigin,
        config_summary: input.configSummary,
      }),
      'utf8'
    )
    .digest('hex')}`;
}

const RELEASE_COHORT_PATH = 'release-cohort.json';
const RELEASE_COHORT_PROVIDER = 'ably';

type ReleaseCohort = Readonly<{
  environment: string;
  cohortId: string;
  protocolVersion: string;
  provider: string;
  serviceOrigin: string;
  configSummary: Record<string, unknown>;
  configDigest: string;
}>;

function readReleaseCohort(descriptorValue: unknown): ReleaseCohort {
  const descriptor = record(descriptorValue);
  const manifest = record(descriptor?.manifest);
  const contentLockPaths = manifest?.content_lock_paths;
  if (!Array.isArray(contentLockPaths) || !contentLockPaths.includes(RELEASE_COHORT_PATH)) {
    throw new Error(`Remote companion activation requires ${RELEASE_COHORT_PATH} in the Package content lock.`);
  }

  const sourcePath = requiredText(descriptor?.sourcePath, 'sourcePath');
  const packageRoot = path.resolve(sourcePath);
  let realPackageRoot: string;
  let releaseCohortPath: string;
  let realReleaseCohortPath: string;
  try {
    if (!fs.statSync(packageRoot).isDirectory()) throw new Error('Package source path is not a directory.');
    realPackageRoot = fs.realpathSync.native(packageRoot);
    releaseCohortPath = path.resolve(packageRoot, RELEASE_COHORT_PATH);
    if (releaseCohortPath === packageRoot || !releaseCohortPath.startsWith(`${packageRoot}${path.sep}`)) {
      throw new Error('Release cohort path escapes the Package.');
    }
    realReleaseCohortPath = fs.realpathSync.native(releaseCohortPath);
    if (
      realReleaseCohortPath === realPackageRoot ||
      !realReleaseCohortPath.startsWith(`${realPackageRoot}${path.sep}`) ||
      !fs.statSync(realReleaseCohortPath).isFile()
    ) {
      throw new Error('Release cohort path is unavailable or escapes the Package through a link.');
    }
  } catch (error) {
    throw new Error(
      `Remote companion activation cannot read the Package release cohort: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let releaseCohortValue: unknown;
  try {
    releaseCohortValue = JSON.parse(fs.readFileSync(realReleaseCohortPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Remote companion activation cannot parse ${RELEASE_COHORT_PATH}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const releaseCohort = record(releaseCohortValue);
  if (!releaseCohort) throw new Error(`Remote companion activation requires an object in ${RELEASE_COHORT_PATH}.`);

  const environment = requiredText(releaseCohort.environment, 'environment');
  const cohortId = requiredText(releaseCohort.cohort_id, 'cohort_id');
  const protocolVersion = requiredText(releaseCohort.protocol_version, 'protocol_version');
  if (protocolVersion !== REMOTE_COMPANION_PROTOCOL_VERSION) {
    throw new Error(`Remote companion activation requires protocol_version=${REMOTE_COMPANION_PROTOCOL_VERSION}.`);
  }
  const provider = requiredText(releaseCohort.provider, 'provider');
  if (provider !== RELEASE_COHORT_PROVIDER) {
    throw new Error(`Remote companion activation requires provider=${RELEASE_COHORT_PROVIDER}.`);
  }
  const serviceOriginValue = requiredText(releaseCohort.service_origin, 'service_origin');
  if (!serviceOrigin(serviceOriginValue)) {
    throw new Error('Remote companion activation requires a pathless HTTPS service_origin.');
  }
  const configSummary = record(releaseCohort.config_summary);
  if (!configSummary) throw new Error(`Remote companion activation requires config_summary in ${RELEASE_COHORT_PATH}.`);
  const declaredConfigDigest = digest(releaseCohort.config_digest, 'config_digest');
  const expectedConfigDigest = configDigest({
    environment,
    cohortId,
    protocolVersion,
    provider,
    serviceOrigin: serviceOriginValue,
    configSummary,
  });
  if (declaredConfigDigest !== expectedConfigDigest) {
    throw new Error(`Remote companion activation config_digest does not match ${RELEASE_COHORT_PATH}.`);
  }
  return {
    environment,
    cohortId,
    protocolVersion,
    provider,
    serviceOrigin: serviceOriginValue,
    configSummary: canonicalJsonProjection(configSummary) as Record<string, unknown>,
    configDigest: declaredConfigDigest,
  };
}

function descriptorActivationContext(descriptorValue: unknown): RemoteCompanionActivationContext {
  const descriptor = record(descriptorValue);
  const manifest = record(descriptor?.manifest);
  const packageId = requiredText(manifest?.package_id, 'package_id');
  const packageContentDigest = digest(manifest?.content_digest, 'package_content_digest');
  const packageArtifactDigest = digest(
    manifest?.artifact_digest ?? manifest?.package_artifact_digest ?? packageContentDigest,
    'package_artifact_digest'
  );
  const releaseCohort = readReleaseCohort(descriptorValue);
  return Object.freeze({
    surface_kind: 'opl_remote_companion_activation_context.v1',
    package_id: packageId,
    environment: releaseCohort.environment,
    cohort_id: releaseCohort.cohortId,
    protocol_version: releaseCohort.protocolVersion,
    provider: releaseCohort.provider,
    service_origin: releaseCohort.serviceOrigin,
    config_digest: releaseCohort.configDigest,
    config_summary: releaseCohort.configSummary,
    package_content_digest: packageContentDigest,
    package_artifact_digest: packageArtifactDigest,
  });
}

async function loadFrameworkBootstrap(frameworkPackageRoot: string): Promise<RemoteCompanionConnectorHostBootstrap> {
  const packageRoot = path.resolve(frameworkPackageRoot);
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
    name?: unknown;
    exports?: Record<string, unknown>;
  };
  if (packageJson.name !== 'opl-framework') {
    throw new Error('Selected remote companion Host carrier is not opl-framework.');
  }
  const exportPath = packageJson.exports?.['./cordis-profiles'];
  if (typeof exportPath !== 'string' || !exportPath.startsWith('./')) {
    throw new Error('Selected OPL Framework carrier has no public Cordis profiles export.');
  }
  const modulePath = path.resolve(packageRoot, exportPath);
  if (
    !modulePath.startsWith(`${packageRoot}${path.sep}`) ||
    !fs.existsSync(modulePath) ||
    !fs.statSync(modulePath).isFile()
  ) {
    throw new Error('Selected OPL Framework Cordis profiles export is unavailable.');
  }
  const module = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as {
    startCordisRemoteCompanionConnectorHost?: unknown;
  };
  if (typeof module.startCordisRemoteCompanionConnectorHost !== 'function') {
    throw new Error('Selected OPL Framework carrier lacks the remote companion Host bootstrap.');
  }
  return module.startCordisRemoteCompanionConnectorHost as RemoteCompanionConnectorHostBootstrap;
}

function validateHostHandle(value: unknown): asserts value is RemoteCompanionConnectorHostHandle {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.dispose !== 'function' ||
    typeof candidate.appStatePatch !== 'function' ||
    typeof candidate.readRemoteCompanionAccess !== 'function' ||
    typeof candidate.executeRemoteCompanionAction !== 'function'
  ) {
    throw new Error('OPL Framework remote companion Host bootstrap returned an invalid handle.');
  }
}

export async function startRemoteCompanionConnectorHost(
  options: RemoteCompanionConnectorHostStartOptions
): Promise<RemoteCompanionConnectorHostHandle | null> {
  const activation = createRemoteCompanionConnectorFrameworkActivation({
    adapter: options.adapter,
    userDataPath: options.userDataPath,
  });
  const bootstrap = await (options.loadBootstrap ?? loadFrameworkBootstrap)(options.frameworkPackageRoot);
  const handle = await bootstrap({
    canonical_conversation_bridge: activation.conversationCallback,
    protectedBlobHost: activation.protectedBlobHost,
    activationContext: descriptorActivationContext,
  });
  validateHostHandle(handle);
  return handle;
}

export function initRemoteCompanionConnectorHost(options: RemoteCompanionConnectorHostInitOptions): void {
  if (!options.frameworkPackageRoot) {
    setActiveRemoteCompanionConnectorHost(Promise.resolve(null));
    return;
  }
  const task = app
    .whenReady()
    .then(() =>
      startRemoteCompanionConnectorHost({
        frameworkPackageRoot: options.frameworkPackageRoot!,
        ...(options.adapter ? { adapter: options.adapter } : {}),
        ...(options.userDataPath ? { userDataPath: options.userDataPath } : {}),
        ...(options.loadBootstrap ? { loadBootstrap: options.loadBootstrap } : {}),
      })
    )
    .catch((error): null => {
      void (options.logWarn ?? console.warn)(
        `[AionUi:remote-companion] Framework connector Host unavailable: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    });
  setActiveRemoteCompanionConnectorHost(task);
}

export function setActiveRemoteCompanionConnectorHost(
  host: Promise<RemoteCompanionConnectorHostHandle | null> | null
): void {
  activeRemoteCompanionConnectorHost = host;
}

export async function readActiveRemoteCompanionAppStatePatch(): Promise<Readonly<Record<string, unknown>> | undefined> {
  try {
    return (await activeRemoteCompanionConnectorHost)?.appStatePatch();
  } catch {
    return undefined;
  }
}

function contributionEntries(host: RemoteCompanionConnectorHostHandle): Readonly<Record<string, unknown>>[] {
  const patch = host.appStatePatch();
  const projection = record(patch.ui_contributions);
  return Array.isArray(projection?.entries)
    ? projection.entries.filter((entry): entry is Record<string, unknown> => Boolean(record(entry)))
    : [];
}

function ownsRequest(
  host: RemoteCompanionConnectorHostHandle,
  request: RemoteCompanionAccessRequest,
  operation: 'read' | 'execute'
): boolean {
  return contributionEntries(host).some((entry) => {
    if (
      entry.package_id !== request.package_id ||
      entry.action_boundary !== REMOTE_COMPANION_CONNECTOR_HOST_ACTION_BOUNDARY
    )
      return false;
    const view = record(entry.view);
    if (!view || view.view_type !== 'remote_companion_access') return false;
    if (operation === 'read') return view.data_ref === request.ref;
    return (
      Array.isArray(entry.commands) &&
      entry.commands.some((command) => {
        const item = record(command);
        return item?.action_ref === request.ref;
      })
    );
  });
}

export async function runActiveRemoteCompanionAccess(
  request: RemoteCompanionAccessRequest,
  operation: 'read' | 'execute'
): Promise<Readonly<Record<string, unknown>> | undefined> {
  const host = await activeRemoteCompanionConnectorHost;
  if (!host || !ownsRequest(host, request, operation)) return undefined;
  return operation === 'read' ? host.readRemoteCompanionAccess(request) : host.executeRemoteCompanionAction(request);
}

export async function disposeRemoteCompanionConnectorHost(): Promise<void> {
  const hostPromise = activeRemoteCompanionConnectorHost;
  activeRemoteCompanionConnectorHost = null;
  try {
    await (await hostPromise)?.dispose();
  } catch {
    // Host teardown is best effort during app shutdown; the quit cleanup owns the timeout.
  }
}

export const __remoteCompanionConnectorHostTest = {
  canonicalJson,
  configDigest,
  descriptorActivationContext,
  loadFrameworkBootstrap,
  readReleaseCohort,
  ownsRequest,
  serviceOrigin,
};

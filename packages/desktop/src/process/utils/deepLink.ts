/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { ipcBridge } from '@/common';
import type { DeepLinkNavigatePayload } from '@/common/adapter/ipcBridge';
import { isOplAppDeepLinkRoute } from '@/common/config/oplProductProfile';

export const PROTOCOL_SCHEME = 'opl';
export const MAX_DEEP_LINK_URL_LENGTH = 2048;

const MAX_PENDING_DEEP_LINKS = 16;
const SENSITIVE_MARKER_PATTERN =
  /(?:^|[^a-z0-9])(?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|pass(?:word|wd)|secret|credentials?)(?:[^a-z0-9]|$)/i;
const SECRET_VALUE_PATTERN = /sk-|(?:^|[^a-z0-9])(?:bearer\s+|eyj|ghp_|github_pat_)/i;

export type DeepLinkRejectionReason =
  | 'url_too_long'
  | 'invalid_url'
  | 'invalid_scheme'
  | 'forbidden_authority'
  | 'fragment_not_allowed'
  | 'unknown_action'
  | 'missing_route'
  | 'duplicate_parameter'
  | 'unknown_parameter'
  | 'sensitive_data'
  | 'route_not_allowed'
  | 'invalid_payload';

export type DeepLinkParseResult =
  | { valid: true; payload: DeepLinkNavigatePayload }
  | { valid: false; reason: DeepLinkRejectionReason };

const reject = (reason: DeepLinkRejectionReason): DeepLinkParseResult => ({ valid: false, reason });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const containsSensitiveData = (value: string): boolean =>
  SENSITIVE_MARKER_PATTERN.test(value) || SECRET_VALUE_PATTERN.test(value);

/** Return whether a route is an exact App-owned navigation target. */
export const isAllowedDeepLinkRoute = (route: string): boolean => isOplAppDeepLinkRoute(route);

const logDeepLinkRejection = (reason: DeepLinkRejectionReason): void => {
  console.warn(`[DeepLink] rejected: ${reason}`);
};

/**
 * Parse and validate an OPL App deep link without retaining the original URL.
 */
export const parseDeepLinkUrl = (url: string): DeepLinkParseResult => {
  if (url.length > MAX_DEEP_LINK_URL_LENGTH) return reject('url_too_long');

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${PROTOCOL_SCHEME}:`) return reject('invalid_scheme');
    if (parsed.username || parsed.password || parsed.port) return reject('forbidden_authority');
    if (parsed.hash) return reject('fragment_not_allowed');
    if (parsed.hostname !== 'navigate' || parsed.pathname !== '') return reject('unknown_action');

    const parameterEntries = [...parsed.searchParams.entries()];
    if (parameterEntries.some(([key, value]) => containsSensitiveData(key) || containsSensitiveData(value))) {
      return reject('sensitive_data');
    }
    const parameterKeys = parameterEntries.map(([key]) => key);
    if (parameterKeys.some((key) => key !== 'route')) return reject('unknown_parameter');

    const routes = parsed.searchParams.getAll('route');
    if (routes.length === 0 || routes[0].length === 0) return reject('missing_route');
    if (routes.length !== 1) return reject('duplicate_parameter');

    const route = routes[0];
    if (!isAllowedDeepLinkRoute(route)) return reject('route_not_allowed');

    return { valid: true, payload: { action: 'navigate', params: { route } } };
  } catch {
    return reject('invalid_url');
  }
};

/** Validate an already-structured payload received from another app instance. */
export const validateDeepLinkPayload = (value: unknown): DeepLinkParseResult => {
  if (!isRecord(value) || Object.keys(value).length !== 2 || value.action !== 'navigate' || !isRecord(value.params)) {
    return reject('invalid_payload');
  }
  if (Object.keys(value.params).length !== 1 || typeof value.params.route !== 'string') {
    return reject('invalid_payload');
  }
  if (containsSensitiveData(value.params.route)) return reject('sensitive_data');
  if (!isAllowedDeepLinkRoute(value.params.route)) return reject('route_not_allowed');
  return { valid: true, payload: { action: 'navigate', params: { route: value.params.route } } };
};

/** Extract one validated OPL payload from process arguments. */
export const extractDeepLinkPayloadFromArgv = (argv: readonly string[]): DeepLinkNavigatePayload | null => {
  const candidate = argv.find((arg) => arg.toLowerCase().startsWith(`${PROTOCOL_SCHEME}:`));
  if (!candidate) return null;
  const result = parseDeepLinkUrl(candidate);
  if ('reason' in result) logDeepLinkRejection(result.reason);
  return result.valid ? result.payload : null;
};

/** Prefer the secret-free payload forwarded by Electron, then safely scan argv. */
export const extractSecondInstanceDeepLinkPayload = (
  argv: readonly string[],
  additionalData: unknown
): DeepLinkNavigatePayload | null => {
  if (isRecord(additionalData) && 'deepLinkPayload' in additionalData) {
    const result = validateDeepLinkPayload(additionalData.deepLinkPayload);
    if (result.valid) return result.payload;
    if ('reason' in result) logDeepLinkRejection(result.reason);
  }
  return extractDeepLinkPayloadFromArgv(argv);
};

let mainWindowRef: BrowserWindow | null = null;
let deepLinkConsumerReady = false;
let deepLinkBridgeRegistered = false;
const pendingDeepLinkPayloads: DeepLinkNavigatePayload[] = [];

export const setDeepLinkMainWindow = (win: BrowserWindow | null): void => {
  mainWindowRef = win;
  deepLinkConsumerReady = false;
};

export const getPendingDeepLinkPayloads = (): readonly DeepLinkNavigatePayload[] => [...pendingDeepLinkPayloads];

export const clearPendingDeepLinkPayloads = (): void => {
  pendingDeepLinkPayloads.length = 0;
};

export const takePendingDeepLinkPayloads = (): DeepLinkNavigatePayload[] => pendingDeepLinkPayloads.splice(0);

export const activateDeepLinkConsumer = (): DeepLinkNavigatePayload[] => {
  deepLinkConsumerReady = true;
  return takePendingDeepLinkPayloads();
};

export const registerDeepLinkBridge = (): void => {
  if (deepLinkBridgeRegistered) return;
  deepLinkBridgeRegistered = true;
  ipcBridge.deepLink.takePending.provider(async () => activateDeepLinkConsumer());
};

const queueDeepLinkPayload = (payload: DeepLinkNavigatePayload): void => {
  pendingDeepLinkPayloads.push(payload);
  if (pendingDeepLinkPayloads.length > MAX_PENDING_DEEP_LINKS) pendingDeepLinkPayloads.shift();
};

/**
 * Send the deep-link payload to the renderer via IPC bridge.
 * If the window isn't ready yet, queue it.
 */
export const handleDeepLinkPayload = (payload: DeepLinkNavigatePayload): void => {
  if (!mainWindowRef || mainWindowRef.isDestroyed() || !deepLinkConsumerReady) {
    queueDeepLinkPayload(payload);
    return;
  }

  ipcBridge.deepLink.received.emit(payload);
};

export const handleDeepLinkUrl = (url: string): DeepLinkParseResult => {
  const result = parseDeepLinkUrl(url);
  if (result.valid) {
    handleDeepLinkPayload(result.payload);
  } else if ('reason' in result) {
    logDeepLinkRejection(result.reason);
  }
  return result;
};

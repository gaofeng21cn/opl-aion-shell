import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  WebuiDataLifecycleError,
  type WebuiDataLifecycleExecuteRequest,
  type WebuiDataLifecycleRestoreRequest,
  type WebuiDataVolumeLifecycleManager,
} from './webuiDataLifecycle.js';

export const WEBUI_DATA_LIFECYCLE_ENDPOINTS = {
  capability: '/api/opl-storage/webui-data-volume/capability',
  plan: '/api/opl-storage/webui-data-volume/plan',
  execute: '/api/opl-storage/webui-data-volume/execute',
  restore: '/api/opl-storage/webui-data-volume/restore',
} as const;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_OPAQUE_VALUE_LENGTH = 4096;

type JsonRecord = Record<string, unknown>;

export type WebuiDataLifecycleAuthentication = 'authenticated' | 'unauthenticated' | 'unavailable';

export type WebuiDataLifecycleHttpOptions = {
  manager: WebuiDataVolumeLifecycleManager;
  authenticate: (req: IncomingMessage) => Promise<WebuiDataLifecycleAuthentication>;
};

class WebuiDataLifecycleRequestError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number
  ) {
    super(code);
  }
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function requestPath(req: IncomingMessage): string {
  return (req.url ?? '').split('?', 1)[0] ?? '';
}

function isLifecyclePath(value: string): boolean {
  return Object.values(WEBUI_DATA_LIFECYCLE_ENDPOINTS).includes(
    value as (typeof WEBUI_DATA_LIFECYCLE_ENDPOINTS)[keyof typeof WEBUI_DATA_LIFECYCLE_ENDPOINTS]
  );
}

function hasJsonContentType(req: IncomingMessage): boolean {
  const value = req.headers['content-type'];
  return typeof value === 'string' && value.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function hasSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readJsonBody(req: IncomingMessage): Promise<JsonRecord> {
  assertDeclaredBodySize(req);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      req.resume();
      throw new WebuiDataLifecycleRequestError('BODY_TOO_LARGE', 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!isRecord(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new WebuiDataLifecycleRequestError('INVALID_JSON_BODY', 400);
  }
}

function assertDeclaredBodySize(req: IncomingMessage): void {
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new WebuiDataLifecycleRequestError('BODY_TOO_LARGE', 413);
  }
}

function exactOpaqueString(body: JsonRecord, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_OPAQUE_VALUE_LENGTH) {
    throw new WebuiDataLifecycleRequestError('INVALID_REQUEST_BODY', 400);
  }
  return value;
}

function assertAllowedFields(body: JsonRecord, allowed: readonly string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new WebuiDataLifecycleRequestError('INVALID_REQUEST_BODY', 400);
  }
}

function executeRequest(body: JsonRecord): WebuiDataLifecycleExecuteRequest {
  const allowed = ['plan_id', 'plan_hash', 'exact_confirmation'] as const;
  assertAllowedFields(body, allowed);
  return {
    plan_id: exactOpaqueString(body, 'plan_id'),
    plan_hash: exactOpaqueString(body, 'plan_hash'),
    exact_confirmation: exactOpaqueString(body, 'exact_confirmation'),
  };
}

function restoreRequest(body: JsonRecord): WebuiDataLifecycleRestoreRequest {
  const allowed = ['receipt_ref'] as const;
  assertAllowedFields(body, allowed);
  return { receipt_ref: exactOpaqueString(body, 'receipt_ref') };
}

function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof WebuiDataLifecycleError) {
    writeJson(res, error.statusCode, {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.receiptRef ? { receipt_ref: error.receiptRef } : {}),
      },
    });
    return;
  }
  if (error instanceof WebuiDataLifecycleRequestError) {
    writeJson(res, error.statusCode, { success: false, error: { code: error.code } });
    return;
  }
  writeJson(res, 500, { success: false, error: { code: 'INTERNAL_ERROR' } });
}

/** Handle the carrier-owned WebUI data lifecycle ABI when it is explicitly injected. */
export async function handleWebuiDataLifecycleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: WebuiDataLifecycleHttpOptions
): Promise<boolean> {
  const route = requestPath(req);
  if (!isLifecyclePath(route)) return false;

  if (req.method !== 'POST') {
    writeJson(res, 405, { success: false, error: { code: 'METHOD_NOT_ALLOWED' } }, { allow: 'POST' });
    return true;
  }
  if (!hasJsonContentType(req)) {
    writeJson(res, 415, { success: false, error: { code: 'JSON_CONTENT_TYPE_REQUIRED' } });
    return true;
  }
  if (!hasSameOrigin(req)) {
    writeJson(res, 403, { success: false, error: { code: 'SAME_ORIGIN_REQUIRED' } });
    return true;
  }

  try {
    assertDeclaredBodySize(req);
  } catch (error) {
    writeError(res, error);
    return true;
  }

  const authentication = await options.authenticate(req).catch((): WebuiDataLifecycleAuthentication => 'unavailable');
  if (authentication !== 'authenticated') {
    writeJson(res, authentication === 'unavailable' ? 503 : 401, {
      success: false,
      error: { code: authentication === 'unavailable' ? 'AUTHENTICATION_UNAVAILABLE' : 'AUTHENTICATION_REQUIRED' },
    });
    return true;
  }

  try {
    const body = await readJsonBody(req);
    if (route === WEBUI_DATA_LIFECYCLE_ENDPOINTS.capability) {
      assertAllowedFields(body, []);
      writeJson(res, 200, options.manager.capability());
      return true;
    }
    if (route === WEBUI_DATA_LIFECYCLE_ENDPOINTS.plan) {
      assertAllowedFields(body, []);
      writeJson(res, 200, options.manager.plan());
      return true;
    }
    if (route === WEBUI_DATA_LIFECYCLE_ENDPOINTS.execute) {
      writeJson(res, 200, options.manager.execute(executeRequest(body)));
      return true;
    }
    writeJson(res, 200, options.manager.restore(restoreRequest(body)));
  } catch (error) {
    writeError(res, error);
  }
  return true;
}

export const __webuiDataLifecycleHttpTest = {
  hasSameOrigin,
  MAX_BODY_BYTES,
};

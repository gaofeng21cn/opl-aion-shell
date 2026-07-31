import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OPL_CODEX_RUNTIME_IDENTITY_SCHEMA = 'opl_codex_runtime_identity.v1' as const;
export const OPL_CODEX_RUNTIME_ERROR_CODES = [
  'USER_AGENT_NOT_INSTALLED',
  'USER_AGENT_COMMAND_NOT_FOUND',
  'MANAGED_RUNTIME_UNAVAILABLE',
  'RUNTIME_ACTIVATION_REQUIRED',
  'RUNTIME_IDENTITY_MISMATCH',
] as const;

export type OplCodexRuntimeErrorCode = (typeof OPL_CODEX_RUNTIME_ERROR_CODES)[number];

export type OplCodexRuntimeIdentity = {
  schema: typeof OPL_CODEX_RUNTIME_IDENTITY_SCHEMA;
  path: string;
  realpath: string;
  version: string;
  sha256: string;
  codex_home: string;
  runtime_key: string;
  runtime_cohort_ref: string;
  carrier: {
    kind: 'aioncore_managed_resources_projection';
    producer_manifest_sha256: string;
    projection_manifest_sha256: string;
    aioncore_native_readback: false;
  };
};

type CreateOplCodexRuntimeIdentityInput = {
  executablePath: string;
  version: string;
  codexHome: string;
  runtimeKey: string;
  producerManifestSha256: string;
  projectionManifestPath: string;
};

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const RAW_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export class OplCodexRuntimeError extends Error {
  readonly code: OplCodexRuntimeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: OplCodexRuntimeErrorCode, message: string, details?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = 'OplCodexRuntimeError';
    this.code = code;
    this.details = details;
  }
}

function runtimeError(code: OplCodexRuntimeErrorCode, message: string, details?: Record<string, unknown>): never {
  throw new OplCodexRuntimeError(code, message, details);
}

function fileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = fs.openSync(filePath, 'r');
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest('hex')}`;
}

function normalizeDigest(value: string, label: string): string {
  const normalized = value.startsWith('sha256:') ? value : `sha256:${value}`;
  if (!DIGEST_PATTERN.test(normalized)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', `${label} must be a lowercase SHA-256 digest`);
  }
  return normalized;
}

function requireAbsolutePath(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || !path.isAbsolute(normalized)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', `${label} must be an absolute path`);
  }
  return path.normalize(normalized);
}

function requireExecutableRealpath(executablePath: string): string {
  let realpath: string;
  try {
    realpath = fs.realpathSync(executablePath);
  } catch (error) {
    runtimeError('MANAGED_RUNTIME_UNAVAILABLE', `Codex executable is unavailable: ${executablePath}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!fs.statSync(realpath).isFile()) {
    runtimeError('MANAGED_RUNTIME_UNAVAILABLE', `Codex executable is not a regular file: ${realpath}`);
  }
  try {
    fs.accessSync(realpath, fs.constants.X_OK);
  } catch {
    runtimeError('USER_AGENT_COMMAND_NOT_FOUND', `Codex executable is not executable: ${realpath}`);
  }
  return realpath;
}

function cohortRefFor(identity: Omit<OplCodexRuntimeIdentity, 'runtime_cohort_ref'>): string {
  const payload = JSON.stringify({
    schema: identity.schema,
    version: identity.version,
    sha256: identity.sha256,
    runtime_key: identity.runtime_key,
    carrier: identity.carrier,
  });
  return `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', `runtime identity ${field} must be a non-empty string`);
  }
  return value.trim();
}

function assertExactKeys(record: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(record).toSorted();
  const canonical = [...expected].toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', `${label} fields do not match ${canonical.join(', ')}`);
  }
}

export function createOplCodexRuntimeIdentity(input: CreateOplCodexRuntimeIdentityInput): OplCodexRuntimeIdentity {
  const executablePath = requireAbsolutePath(input.executablePath, 'Codex executable path');
  const realpath = requireExecutableRealpath(executablePath);
  const version = input.version.trim();
  if (!version) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'Codex version must be non-empty');
  }
  if (!RAW_DIGEST_PATTERN.test(input.producerManifestSha256)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'producer manifest SHA-256 must be lowercase hexadecimal');
  }
  const codexHome = requireAbsolutePath(input.codexHome, 'CODEX_HOME');
  const projectionManifestPath = requireAbsolutePath(input.projectionManifestPath, 'projection manifest path');
  const identityWithoutCohort: Omit<OplCodexRuntimeIdentity, 'runtime_cohort_ref'> = {
    schema: OPL_CODEX_RUNTIME_IDENTITY_SCHEMA,
    path: executablePath,
    realpath,
    version,
    sha256: fileSha256(realpath),
    codex_home: codexHome,
    runtime_key: input.runtimeKey,
    carrier: {
      kind: 'aioncore_managed_resources_projection',
      producer_manifest_sha256: normalizeDigest(input.producerManifestSha256, 'producer manifest SHA-256'),
      projection_manifest_sha256: fileSha256(projectionManifestPath),
      aioncore_native_readback: false,
    },
  };
  return {
    ...identityWithoutCohort,
    runtime_cohort_ref: cohortRefFor(identityWithoutCohort),
  };
}

export function parseOplCodexRuntimeIdentity(value: unknown): OplCodexRuntimeIdentity {
  if (!isRecord(value)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'runtime identity must be a JSON object');
  }
  assertExactKeys(
    value,
    ['schema', 'path', 'realpath', 'version', 'sha256', 'codex_home', 'runtime_key', 'runtime_cohort_ref', 'carrier'],
    'runtime identity'
  );
  if (value.schema !== OPL_CODEX_RUNTIME_IDENTITY_SCHEMA) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', `runtime identity schema must be ${OPL_CODEX_RUNTIME_IDENTITY_SCHEMA}`);
  }
  if (!isRecord(value.carrier)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'runtime identity carrier must be an object');
  }
  assertExactKeys(
    value.carrier,
    ['kind', 'producer_manifest_sha256', 'projection_manifest_sha256', 'aioncore_native_readback'],
    'runtime identity carrier'
  );
  if (
    value.carrier.kind !== 'aioncore_managed_resources_projection' ||
    value.carrier.aioncore_native_readback !== false
  ) {
    runtimeError(
      'RUNTIME_IDENTITY_MISMATCH',
      'runtime identity carrier must be the AionCore-managed projection without native readback'
    );
  }

  const identity: OplCodexRuntimeIdentity = {
    schema: OPL_CODEX_RUNTIME_IDENTITY_SCHEMA,
    path: requireAbsolutePath(requiredString(value, 'path'), 'runtime identity path'),
    realpath: requireAbsolutePath(requiredString(value, 'realpath'), 'runtime identity realpath'),
    version: requiredString(value, 'version'),
    sha256: normalizeDigest(requiredString(value, 'sha256'), 'runtime identity SHA-256'),
    codex_home: requireAbsolutePath(requiredString(value, 'codex_home'), 'runtime identity CODEX_HOME'),
    runtime_key: requiredString(value, 'runtime_key'),
    runtime_cohort_ref: normalizeDigest(
      requiredString(value, 'runtime_cohort_ref'),
      'runtime identity cohort reference'
    ),
    carrier: {
      kind: 'aioncore_managed_resources_projection',
      producer_manifest_sha256: normalizeDigest(
        requiredString(value.carrier, 'producer_manifest_sha256'),
        'producer manifest SHA-256'
      ),
      projection_manifest_sha256: normalizeDigest(
        requiredString(value.carrier, 'projection_manifest_sha256'),
        'projection manifest SHA-256'
      ),
      aioncore_native_readback: false,
    },
  };
  const { runtime_cohort_ref: _runtimeCohortRef, ...identityWithoutCohort } = identity;
  if (identity.runtime_cohort_ref !== cohortRefFor(identityWithoutCohort)) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'runtime identity cohort reference does not match its carrier bytes');
  }
  return identity;
}

export function resolveOplCodexRuntimeIdentityFromEnv(
  env: NodeJS.ProcessEnv = process.env
): OplCodexRuntimeIdentity | null {
  const serialized = env.OPL_CODEX_RUNTIME_IDENTITY_JSON?.trim();
  if (!serialized) {
    if (env.OPL_CODEX_RUNTIME_COHORT_REF?.trim()) {
      runtimeError('RUNTIME_ACTIVATION_REQUIRED', 'runtime cohort is present without an activated identity');
    }
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'runtime identity JSON is invalid', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const identity = parseOplCodexRuntimeIdentity(parsed);
  if (env.OPL_CODEX_BIN?.trim() !== identity.path) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'OPL_CODEX_BIN does not match the activated runtime identity path');
  }
  if (env.CODEX_HOME?.trim() !== identity.codex_home) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'CODEX_HOME does not match the activated runtime identity');
  }
  if (env.OPL_CODEX_RUNTIME_COHORT_REF?.trim() !== identity.runtime_cohort_ref) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'runtime cohort environment does not match the activated identity');
  }

  const actualRealpath = requireExecutableRealpath(identity.path);
  if (actualRealpath !== identity.realpath) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'Codex executable realpath drifted after runtime activation');
  }
  if (fileSha256(actualRealpath) !== identity.sha256) {
    runtimeError('RUNTIME_IDENTITY_MISMATCH', 'Codex executable digest drifted after runtime activation');
  }
  return identity;
}

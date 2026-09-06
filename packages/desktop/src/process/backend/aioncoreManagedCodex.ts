import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createOplCodexRuntimeIdentity,
  OplCodexRuntimeError,
  type OplCodexRuntimeIdentity,
} from './oplCodexRuntimeIdentity';

type ResolveAioncoreManagedCodexInput = {
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
};

const MANAGED_RESOURCES_SCHEMA = 'opl_aioncore_managed_resources_projection.v1';
const REQUIRED_CODEX_PACKAGE = '@openai/codex';
const REQUIRED_CODEX_VERSION = '0.153.4';
const REQUIRED_OPL_VERIFIED_AIONCORE_VERSION = 'v0.2.1';
const REQUIRED_ABSENT_PATHS = [
  'cli/claude',
  'acp',
  'node_modules/@anthropic-ai/claude-code',
  'node_modules/claude-code',
  'claude',
];

export type AioncoreManagedCodexResolution = {
  runtimeKey: string;
  version: string;
  manifestPath: string;
  managedResourcesRoot: string;
  cliRoot: string;
  executablePath: string;
  identity: OplCodexRuntimeIdentity;
  env: NodeJS.ProcessEnv;
};

function fail(message: string): never {
  throw new OplCodexRuntimeError('MANAGED_RUNTIME_UNAVAILABLE', `AionCore managed Codex resolution failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readManifest(manifestPath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      fail(`manifest must be a JSON object: ${manifestPath}`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof OplCodexRuntimeError) {
      throw error;
    }
    fail(`cannot read manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireSafePosixRelativePath(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) {
    fail(`${field} must be a safe POSIX relative path`);
  }
  if (value.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail(`${field} must be a safe POSIX relative path`);
  }
  return value;
}

function requireRealPath(candidate: string, label: string): string {
  try {
    return fs.realpathSync(candidate);
  } catch (error) {
    fail(`${label} does not exist: ${candidate} (${error instanceof Error ? error.message : String(error)})`);
  }
}

function isPathInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizePath(executableDirectory: string, currentPath: string | undefined): string {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const entry of [executableDirectory, ...(currentPath ?? '').split(path.delimiter)]) {
    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    entries.push(normalized);
  }
  return entries.join(path.delimiter);
}

export function resolveAioncoreManagedCodex(
  input: ResolveAioncoreManagedCodexInput = {}
): AioncoreManagedCodexResolution {
  const platform = input.platform ?? process.platform;
  if (platform !== 'darwin' && platform !== 'linux') {
    fail(`unsupported platform ${platform}`);
  }

  const arch = input.arch ?? process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const resourcesPath = input.resourcesPath ?? process.resourcesPath;
  const managedResourcesRoot = path.join(resourcesPath, 'bundled-aioncore', runtimeKey, 'managed-resources');
  const manifestPath = path.join(managedResourcesRoot, 'manifest.json');
  const manifest = readManifest(manifestPath);

  if (manifest.schema !== MANAGED_RESOURCES_SCHEMA) {
    fail(`manifest schema must be ${MANAGED_RESOURCES_SCHEMA}: ${manifestPath}`);
  }
  if (manifest.runtimeKey !== runtimeKey) {
    fail(`manifest runtimeKey must be ${runtimeKey}: ${manifestPath}`);
  }

  if (
    !isRecord(manifest.source) ||
    manifest.source.schemaVersion !== 2 ||
    typeof manifest.source.manifestSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(manifest.source.manifestSha256) ||
    JSON.stringify(manifest.source.cliNames) !== JSON.stringify([]) ||
    !isRecord(manifest.projection) ||
    JSON.stringify(manifest.projection.includedCliNames) !== JSON.stringify(['codex']) ||
    JSON.stringify(manifest.projection.excludedCliNames) !== JSON.stringify(['claude']) ||
    JSON.stringify(manifest.projection.requiredAbsentPaths) !== JSON.stringify(REQUIRED_ABSENT_PATHS) ||
    !isRecord(manifest.projection.codexSource) ||
    manifest.projection.codexSource.package !== REQUIRED_CODEX_PACKAGE ||
    manifest.projection.codexSource.version !== REQUIRED_CODEX_VERSION ||
    manifest.projection.codexSource.packageSpec !==
      `${REQUIRED_CODEX_PACKAGE}@${REQUIRED_CODEX_VERSION}-${runtimeKey}` ||
    manifest.projection.codexSource.authority !== 'official_npm_platform_package' ||
    manifest.projection.codexSource.oplVerifiedAioncoreVersion !== REQUIRED_OPL_VERIFIED_AIONCORE_VERSION
  ) {
    fail(`manifest Codex-only projection policy is invalid: ${manifestPath}`);
  }
  for (const relativePath of REQUIRED_ABSENT_PATHS) {
    if (fs.existsSync(path.join(managedResourcesRoot, ...relativePath.split('/')))) {
      fail(`forbidden Claude/raw producer path is present: ${relativePath}`);
    }
  }

  const clis = Array.isArray(manifest.clis) ? manifest.clis : [];
  const codexEntries = clis.filter((entry) => isRecord(entry) && entry.name === 'codex');
  if (clis.length !== 1 || codexEntries.length !== 1) {
    fail(`manifest must contain exactly one Codex CLI entry: ${manifestPath}`);
  }

  const codex = codexEntries[0] as Record<string, unknown>;
  if (codex.platformDirectory !== runtimeKey) {
    fail(`Codex platformDirectory must be ${runtimeKey}: ${manifestPath}`);
  }
  const version = typeof codex.version === 'string' ? codex.version.trim() : '';
  if (version !== REQUIRED_CODEX_VERSION) {
    fail(`Codex version must be ${REQUIRED_CODEX_VERSION}: ${manifestPath}`);
  }

  const root = requireSafePosixRelativePath(codex.root, 'Codex root');
  const executable = requireSafePosixRelativePath(codex.executable, 'Codex executable');
  const cliRoot = path.resolve(managedResourcesRoot, ...root.split('/'));
  const executableCandidate = path.resolve(cliRoot, ...executable.split('/'));
  const realManagedResourcesRoot = requireRealPath(managedResourcesRoot, 'managed resources root');
  const executablePath = requireRealPath(executableCandidate, 'Codex executable');

  if (!isPathInside(executablePath, realManagedResourcesRoot)) {
    fail(`Codex executable escapes managed resources root: ${executableCandidate}`);
  }
  if (!fs.statSync(executablePath).isFile()) {
    fail(`Codex executable is not a regular file: ${executablePath}`);
  }
  try {
    fs.accessSync(executablePath, fs.constants.X_OK);
  } catch {
    fail(`Codex executable is not executable: ${executablePath}`);
  }

  const env = input.env ?? process.env;
  const homeDir = input.homeDir ?? os.homedir();
  const codexHome = env.CODEX_HOME?.trim() || path.join(homeDir, '.codex');
  const identity = createOplCodexRuntimeIdentity({
    executablePath,
    version,
    codexHome,
    runtimeKey,
    producerManifestSha256: (manifest.source as Record<string, unknown>).manifestSha256 as string,
    projectionManifestPath: manifestPath,
  });
  return {
    runtimeKey,
    version,
    manifestPath,
    managedResourcesRoot: realManagedResourcesRoot,
    cliRoot,
    executablePath,
    identity,
    env: {
      OPL_CODEX_BIN: identity.path,
      CODEX_HOME: identity.codex_home,
      OPL_CODEX_RUNTIME_IDENTITY_JSON: JSON.stringify(identity),
      OPL_CODEX_RUNTIME_COHORT_REF: identity.runtime_cohort_ref,
      PATH: normalizePath(path.dirname(identity.path), env.PATH),
    },
  };
}

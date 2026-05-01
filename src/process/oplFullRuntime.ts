import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const FULL_RUNTIME_RESOURCE_DIR = 'opl-full-runtime';
const FULL_RUNTIME_MANIFEST = 'full-package-manifest.json';
const INSTALL_MARKER = '.opl-full-runtime-installed.json';

export type OplFullRuntimeInstallResult = {
  version: string;
  runtimeHome: string;
  env: NodeJS.ProcessEnv;
};

type EnsurePackagedOplFullRuntimeInput = {
  isPackaged: boolean;
  resourcesPath?: string;
  homeDir?: string;
};

function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function resolvePythonBin(runtimeHome: string): string | null {
  const pythonRoot = path.join(runtimeHome, 'python');
  if (!fs.existsSync(pythonRoot)) {
    return null;
  }

  const candidates = fs.readdirSync(pythonRoot)
    .filter((entry) => entry.startsWith('cpython-'))
    .map((entry) => path.join(pythonRoot, entry, 'bin'))
    .filter((entry) => fs.existsSync(entry))
    .sort()
    .reverse();
  return candidates[0] ?? null;
}

function mergePathEntries(entries: string[], existingPath = process.env.PATH ?? '') {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const entry of [...entries, ...existingPath.split(path.delimiter)]) {
    if (!entry || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    merged.push(entry);
  }
  return merged.join(path.delimiter);
}

function buildRuntimeEnv(runtimeHome: string): NodeJS.ProcessEnv {
  const pythonBin = resolvePythonBin(runtimeHome);
  const pathEntries = [
    path.join(runtimeHome, 'bin'),
    path.join(runtimeHome, 'node', 'bin'),
    path.join(runtimeHome, 'uv', 'bin'),
    ...(pythonBin ? [pythonBin] : []),
  ];

  return {
    OPL_FULL_RUNTIME_HOME: runtimeHome,
    OPL_CODEX_BIN: path.join(runtimeHome, 'bin', 'codex'),
    OPL_HERMES_BIN: path.join(runtimeHome, 'bin', 'hermes'),
    OPL_MODULES_ROOT: path.join(runtimeHome, 'modules'),
    OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(runtimeHome, 'modules', 'mas'),
    OPL_MODULE_PATH_MEDDEEPSCIENTIST: path.join(runtimeHome, 'modules', 'mds'),
    PATH: mergePathEntries(pathEntries),
  };
}

function resolvePayload(resourcesPath: string): {
  version: string;
  payloadRoot: string;
  manifestPath: string;
  manifestSha256: string;
} | null {
  const payloadRoot = path.join(resourcesPath, FULL_RUNTIME_RESOURCE_DIR);
  const manifestPath = path.join(payloadRoot, 'manifest', FULL_RUNTIME_MANIFEST);
  const manifest = readJsonRecord(manifestPath);
  const version = typeof manifest?.version === 'string' ? manifest.version.trim() : '';
  if (!version) {
    return null;
  }

  const runtimePayload = path.join(payloadRoot, 'runtime', version);
  if (!fs.existsSync(runtimePayload) || !fs.statSync(runtimePayload).isDirectory()) {
    return null;
  }

  return {
    version,
    payloadRoot: runtimePayload,
    manifestPath,
    manifestSha256: sha256File(manifestPath),
  };
}

function resolveRuntimeInstallRoot(homeDir: string, version: string) {
  return path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime', version);
}

function markerMatches(markerPath: string, manifestSha256: string) {
  const marker = readJsonRecord(markerPath);
  return marker?.manifest_sha256 === manifestSha256;
}

function installRuntimePayload(payloadRoot: string, runtimeHome: string, version: string, manifestSha256: string) {
  const markerPath = path.join(runtimeHome, INSTALL_MARKER);
  if (fs.existsSync(runtimeHome) && markerMatches(markerPath, manifestSha256)) {
    return;
  }

  fs.mkdirSync(path.dirname(runtimeHome), { recursive: true });
  const tempTarget = `${runtimeHome}.tmp-${process.pid}`;
  fs.rmSync(tempTarget, { recursive: true, force: true });
  fs.cpSync(payloadRoot, tempTarget, {
    recursive: true,
    dereference: false,
    preserveTimestamps: true,
  });
  fs.writeFileSync(
    path.join(tempTarget, INSTALL_MARKER),
    `${JSON.stringify({
      version,
      manifest_sha256: manifestSha256,
      installed_at: new Date().toISOString(),
    }, null, 2)}\n`,
    'utf8'
  );
  fs.rmSync(runtimeHome, { recursive: true, force: true });
  fs.renameSync(tempTarget, runtimeHome);
}

export function applyOplFullRuntimeEnv(env: NodeJS.ProcessEnv): void {
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

export function ensurePackagedOplFullRuntime(
  input: EnsurePackagedOplFullRuntimeInput
): OplFullRuntimeInstallResult | null {
  if (!input.isPackaged) {
    return null;
  }

  const resourcesPath = input.resourcesPath ?? process.resourcesPath;
  const payload = resolvePayload(resourcesPath);
  if (!payload) {
    return null;
  }

  const homeDir = input.homeDir ?? os.homedir();
  const runtimeHome = resolveRuntimeInstallRoot(homeDir, payload.version);
  installRuntimePayload(payload.payloadRoot, runtimeHome, payload.version, payload.manifestSha256);
  return {
    version: payload.version,
    runtimeHome,
    env: buildRuntimeEnv(runtimeHome),
  };
}

export function buildOplFullRuntimeShellPrefix(runtimeHome: string | null | undefined): string {
  const normalized = runtimeHome?.trim();
  if (!normalized) {
    return '';
  }

  const pythonBin = resolvePythonBin(normalized);
  const pathEntries = [
    path.join(normalized, 'bin'),
    path.join(normalized, 'node', 'bin'),
    path.join(normalized, 'uv', 'bin'),
    ...(pythonBin ? [pythonBin] : []),
  ].join(path.delimiter);

  return [
    `export OPL_FULL_RUNTIME_HOME=${shellQuote(normalized)}`,
    `export OPL_MODULES_ROOT=${shellQuote(path.join(normalized, 'modules'))}`,
    `export OPL_MODULE_PATH_MEDAUTOSCIENCE=${shellQuote(path.join(normalized, 'modules', 'mas'))}`,
    `export OPL_MODULE_PATH_MEDDEEPSCIENTIST=${shellQuote(path.join(normalized, 'modules', 'mds'))}`,
    `export OPL_CODEX_BIN=${shellQuote(path.join(normalized, 'bin', 'codex'))}`,
    `export OPL_HERMES_BIN=${shellQuote(path.join(normalized, 'bin', 'hermes'))}`,
    `export PATH=${shellQuote(pathEntries)}:"$PATH"`,
  ].join(' && ');
}

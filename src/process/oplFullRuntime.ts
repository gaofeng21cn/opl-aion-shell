import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const FULL_RUNTIME_RESOURCE_DIR = 'opl-full-runtime';
const FULL_RUNTIME_MANIFEST = 'full-package-manifest.json';
const INSTALL_MARKER = '.opl-full-runtime-installed.json';
const ACTIVE_RUNTIME_DIR = 'current';
const ACTIVE_RUNTIME_POINTER = 'current.json';

export type OplFullRuntimeInstallResult = {
  version: string;
  runtimeHome: string;
  env: NodeJS.ProcessEnv;
  source: 'packaged_payload' | 'active_pointer';
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

function resolveRuntimeRoot(homeDir: string) {
  return path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime');
}

function resolveRuntimeInstallRoot(homeDir: string) {
  return path.join(resolveRuntimeRoot(homeDir), ACTIVE_RUNTIME_DIR);
}

function resolveRuntimePointerPath(homeDir: string) {
  return path.join(resolveRuntimeRoot(homeDir), ACTIVE_RUNTIME_POINTER);
}

function markerMatches(markerPath: string, manifestSha256: string) {
  const marker = readJsonRecord(markerPath);
  return marker?.manifest_sha256 === manifestSha256;
}

function readInstalledRuntimeVersion(runtimeHome: string): string | null {
  const marker = readJsonRecord(path.join(runtimeHome, INSTALL_MARKER));
  const version = typeof marker?.version === 'string' ? marker.version.trim() : '';
  return version || null;
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

function writeActiveRuntimePointer(homeDir: string, runtimeHome: string, version: string, manifestSha256: string) {
  const pointerPath = resolveRuntimePointerPath(homeDir);
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  fs.writeFileSync(
    pointerPath,
    `${JSON.stringify({
      runtime_version: version,
      runtime_home: runtimeHome,
      manifest_sha256: manifestSha256,
      activated_at: new Date().toISOString(),
      source: 'packaged_payload',
    }, null, 2)}\n`,
    'utf8'
  );
}

function isUsableRuntimeHome(runtimeHome: string) {
  return fs.existsSync(runtimeHome)
    && fs.statSync(runtimeHome).isDirectory()
    && fs.existsSync(path.join(runtimeHome, 'bin', 'opl'));
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

  const homeDir = input.homeDir ?? os.homedir();
  const resourcesPath = input.resourcesPath ?? process.resourcesPath;
  const payload = resolvePayload(resourcesPath);
  if (!payload) {
    return activateInstalledOplFullRuntime({ homeDir });
  }

  const runtimeHome = resolveRuntimeInstallRoot(homeDir);
  installRuntimePayload(payload.payloadRoot, runtimeHome, payload.version, payload.manifestSha256);
  writeActiveRuntimePointer(homeDir, runtimeHome, payload.version, payload.manifestSha256);
  return {
    version: payload.version,
    runtimeHome,
    env: buildRuntimeEnv(runtimeHome),
    source: 'packaged_payload',
  };
}

export function activateInstalledOplFullRuntime(
  input: { homeDir?: string } = {}
): OplFullRuntimeInstallResult | null {
  const homeDir = input.homeDir ?? os.homedir();
  const pointer = readJsonRecord(resolveRuntimePointerPath(homeDir));
  const pointerVersion = typeof pointer?.runtime_version === 'string' ? pointer.runtime_version.trim() : '';
  const runtimeHomeFromPointer =
    typeof pointer?.runtime_home === 'string' ? pointer.runtime_home.trim() : '';
  const activeRuntimeHome = resolveRuntimeInstallRoot(homeDir);
  if (isUsableRuntimeHome(activeRuntimeHome)) {
    return {
      version: readInstalledRuntimeVersion(activeRuntimeHome)
        || (runtimeHomeFromPointer === activeRuntimeHome ? pointerVersion : '')
        || ACTIVE_RUNTIME_DIR,
      runtimeHome: activeRuntimeHome,
      env: buildRuntimeEnv(activeRuntimeHome),
      source: 'active_pointer',
    };
  }

  const runtimeHome = runtimeHomeFromPointer || (pointerVersion ? path.join(resolveRuntimeRoot(homeDir), pointerVersion) : '');
  if (!pointerVersion || !runtimeHome || !isUsableRuntimeHome(runtimeHome)) {
    return null;
  }

  return {
    version: pointerVersion,
    runtimeHome,
    env: buildRuntimeEnv(runtimeHome),
    source: 'active_pointer',
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

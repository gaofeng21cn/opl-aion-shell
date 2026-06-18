import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

import { buildOplHostToolEnv } from './hostToolEnv';

const FULL_RUNTIME_RESOURCE_DIR = 'opl-full-runtime';
const FULL_RUNTIME_MANIFEST = 'full-package-manifest.json';
const INSTALL_MARKER = '.opl-full-runtime-installed.json';
const ACTIVE_RUNTIME_DIR = 'current';
const ACTIVE_RUNTIME_POINTER = 'current.json';
const SYSTEM_PATH_ENTRIES =
  process.platform === 'win32' ? [] : ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

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
      ? (parsed as Record<string, unknown>)
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

  const candidates = fs
    .readdirSync(pythonRoot)
    .filter((entry) => entry.startsWith('cpython-'))
    .map((entry) => path.join(pythonRoot, entry, 'bin'))
    .filter((entry) => fs.existsSync(entry))
    .sort()
    .reverse();
  return candidates[0] ?? null;
}

function existingFileEnv(name: string, filePath: string): NodeJS.ProcessEnv {
  return fs.existsSync(filePath) ? { [name]: filePath } : {};
}

function buildRuntimeEnv(runtimeHome: string): NodeJS.ProcessEnv {
  const pythonBin = resolvePythonBin(runtimeHome);
  const pathEntries = [
    path.join(runtimeHome, 'bin'),
    path.join(runtimeHome, 'node', 'bin'),
    path.join(runtimeHome, 'uv', 'bin'),
    ...(pythonBin ? [pythonBin] : []),
    ...SYSTEM_PATH_ENTRIES,
  ];

  return buildOplHostToolEnv({
    runtimeEnv: {
      OPL_FULL_RUNTIME_HOME: runtimeHome,
      OPL_PACKAGED_SKILLS_ROOT: path.join(runtimeHome, 'skills'),
      OPL_CODEX_BIN: path.join(runtimeHome, 'bin', 'codex'),
      OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER?.trim() || 'temporal',
      ...existingFileEnv('OPL_HERMES_BIN', path.join(runtimeHome, 'bin', 'hermes')),
      OPL_MODULE_PATH_MEDAUTOSCIENCE: path.join(runtimeHome, 'modules', 'mas'),
      OPL_MODULE_PATH_MEDAUTOGRANT: path.join(runtimeHome, 'modules', 'mag'),
      OPL_MODULE_PATH_REDCUBE: path.join(runtimeHome, 'modules', 'rca'),
      OPL_MODULE_PATH_OPLMETAAGENT: path.join(runtimeHome, 'modules', 'meta-agent'),
      OPL_MODULE_PATH_OPLBOOKFORGE: path.join(runtimeHome, 'modules', 'bookforge'),
      PATH: pathEntries.join(path.delimiter),
    },
  });
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

  const runtimePayload = path.join(payloadRoot, 'runtime', ACTIVE_RUNTIME_DIR);
  const legacyRuntimePayload = path.join(payloadRoot, 'runtime', version);
  const resolvedRuntimePayload =
    fs.existsSync(runtimePayload) && fs.statSync(runtimePayload).isDirectory() ? runtimePayload : legacyRuntimePayload;
  if (!fs.existsSync(resolvedRuntimePayload) || !fs.statSync(resolvedRuntimePayload).isDirectory()) {
    return null;
  }

  return {
    version,
    payloadRoot: resolvedRuntimePayload,
    manifestPath,
    manifestSha256: sha256File(manifestPath),
  };
}

function resolveRuntimeRoot(homeDir: string): string {
  return path.join(homeDir, 'Library', 'Application Support', 'OPL', 'runtime');
}

function resolveRuntimeInstallRoot(homeDir: string): string {
  return path.join(resolveRuntimeRoot(homeDir), ACTIVE_RUNTIME_DIR);
}

function resolveRuntimePointerPath(homeDir: string): string {
  return path.join(resolveRuntimeRoot(homeDir), ACTIVE_RUNTIME_POINTER);
}

function markerMatches(markerPath: string, manifestSha256: string): boolean {
  const marker = readJsonRecord(markerPath);
  return marker?.manifest_sha256 === manifestSha256;
}

function readInstalledRuntimeVersion(runtimeHome: string): string | null {
  const marker = readJsonRecord(path.join(runtimeHome, INSTALL_MARKER));
  const version = typeof marker?.version === 'string' ? marker.version.trim() : '';
  return version || null;
}

function installRuntimePayload(
  payloadRoot: string,
  runtimeHome: string,
  version: string,
  manifestSha256: string
): void {
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
  removeMacosQuarantineAttribute(tempTarget);
  fs.writeFileSync(
    path.join(tempTarget, INSTALL_MARKER),
    `${JSON.stringify(
      {
        version,
        manifest_sha256: manifestSha256,
        installed_at: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  fs.rmSync(runtimeHome, { recursive: true, force: true });
  fs.renameSync(tempTarget, runtimeHome);
}

function removeMacosQuarantineAttribute(root: string): void {
  if (process.platform !== 'darwin') {
    return;
  }
  const result = spawnSync('xattr', ['-dr', 'com.apple.quarantine', root], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status === 0 || /No such xattr/i.test(`${result.stderr || ''}${result.stdout || ''}`)) {
    return;
  }
  throw new Error(`Failed to remove com.apple.quarantine from Full runtime payload: ${result.stderr || result.stdout}`);
}

function writeActiveRuntimePointer(
  homeDir: string,
  runtimeHome: string,
  version: string,
  manifestSha256: string
): void {
  const pointerPath = resolveRuntimePointerPath(homeDir);
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  fs.writeFileSync(
    pointerPath,
    `${JSON.stringify(
      {
        runtime_version: version,
        runtime_home: runtimeHome,
        manifest_sha256: manifestSha256,
        activated_at: new Date().toISOString(),
        source: 'packaged_payload',
      },
      null,
      2
    )}\n`,
    'utf8'
  );
}

function isUsableRuntimeHome(runtimeHome: string): boolean {
  return (
    fs.existsSync(runtimeHome) &&
    fs.statSync(runtimeHome).isDirectory() &&
    fs.existsSync(path.join(runtimeHome, 'bin', 'opl'))
  );
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
    return activateInstalledOplFullRuntime({ homeDir: input.homeDir });
  }

  const homeDir = input.homeDir ?? os.homedir();
  const resourcesPath = input.resourcesPath ?? process.resourcesPath;
  const payload = resolvePayload(resourcesPath);
  if (!payload) {
    return null;
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

export function activateInstalledOplFullRuntime(input: { homeDir?: string } = {}): OplFullRuntimeInstallResult | null {
  const homeDir = input.homeDir ?? os.homedir();
  const pointer = readJsonRecord(resolveRuntimePointerPath(homeDir));
  const pointerVersion = typeof pointer?.runtime_version === 'string' ? pointer.runtime_version.trim() : '';
  const runtimeHomeFromPointer = typeof pointer?.runtime_home === 'string' ? pointer.runtime_home.trim() : '';
  const activeRuntimeHome = resolveRuntimeInstallRoot(homeDir);
  if (isUsableRuntimeHome(activeRuntimeHome)) {
    return {
      version:
        readInstalledRuntimeVersion(activeRuntimeHome) ||
        (runtimeHomeFromPointer === activeRuntimeHome ? pointerVersion : '') ||
        ACTIVE_RUNTIME_DIR,
      runtimeHome: activeRuntimeHome,
      env: buildRuntimeEnv(activeRuntimeHome),
      source: 'active_pointer',
    };
  }

  const runtimeHome =
    runtimeHomeFromPointer || (pointerVersion ? path.join(resolveRuntimeRoot(homeDir), pointerVersion) : '');
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
    ...SYSTEM_PATH_ENTRIES,
  ].join(path.delimiter);

  return [
    `export OPL_FULL_RUNTIME_HOME=${shellQuote(normalized)}`,
    `export OPL_PACKAGED_SKILLS_ROOT=${shellQuote(path.join(normalized, 'skills'))}`,
    'export OPL_FAMILY_RUNTIME_PROVIDER="${OPL_FAMILY_RUNTIME_PROVIDER:-temporal}"',
    `export OPL_MODULE_PATH_MEDAUTOSCIENCE=${shellQuote(path.join(normalized, 'modules', 'mas'))}`,
    `export OPL_MODULE_PATH_MEDAUTOGRANT=${shellQuote(path.join(normalized, 'modules', 'mag'))}`,
    `export OPL_MODULE_PATH_REDCUBE=${shellQuote(path.join(normalized, 'modules', 'rca'))}`,
    `export OPL_MODULE_PATH_OPLMETAAGENT=${shellQuote(path.join(normalized, 'modules', 'meta-agent'))}`,
    `export OPL_MODULE_PATH_OPLBOOKFORGE=${shellQuote(path.join(normalized, 'modules', 'bookforge'))}`,
    `export OPL_CODEX_BIN=${shellQuote(path.join(normalized, 'bin', 'codex'))}`,
    fs.existsSync(path.join(normalized, 'bin', 'hermes'))
      ? `export OPL_HERMES_BIN=${shellQuote(path.join(normalized, 'bin', 'hermes'))}`
      : '',
    `export PATH=${shellQuote(pathEntries)}:"$PATH"`,
  ]
    .filter(Boolean)
    .join(' && ');
}

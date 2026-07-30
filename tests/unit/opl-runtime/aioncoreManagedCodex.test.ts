import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveAioncoreManagedCodex } from '@/process/backend/aioncoreManagedCodex';

const RUNTIME_KEY = 'darwin-arm64';
const CODEX_ROOT = `cli/codex/0.144.6/${RUNTIME_KEY}`;
const CODEX_EXECUTABLE = 'codex-aarch64-apple-darwin/codex-aarch64-apple-darwin';
const tmpRoots: string[] = [];

type TestCli = {
  name: string;
  version: string;
  root: string;
  platformDirectory: string;
  executable: string;
};

type TestManifest = {
  schemaVersion: number;
  runtimeKey: string;
  clis: TestCli[];
};

function makeTempRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tmpRoots.push(root);
  return root;
}

function makeManifest(): TestManifest {
  return {
    schemaVersion: 2,
    runtimeKey: RUNTIME_KEY,
    clis: [
      {
        name: 'claude',
        version: '2.1.0',
        root: `cli/claude/2.1.0/${RUNTIME_KEY}`,
        platformDirectory: RUNTIME_KEY,
        executable: 'claude',
      },
      {
        name: 'codex',
        version: '0.144.6',
        root: CODEX_ROOT,
        platformDirectory: RUNTIME_KEY,
        executable: CODEX_EXECUTABLE,
      },
    ],
  };
}

function writeBundle(
  manifest: TestManifest,
  options: { createExecutable?: boolean; executableMode?: number } = {}
): {
  resourcesPath: string;
  managedResourcesRoot: string;
  executablePath: string;
} {
  const resourcesPath = makeTempRoot('aioncore-managed-codex');
  const managedResourcesRoot = path.join(resourcesPath, 'bundled-aioncore', RUNTIME_KEY, 'managed-resources');
  fs.mkdirSync(managedResourcesRoot, { recursive: true });
  fs.writeFileSync(path.join(managedResourcesRoot, 'manifest.json'), JSON.stringify(manifest), 'utf8');

  const codex = manifest.clis.find((entry) => entry.name === 'codex');
  const executablePath = codex
    ? path.resolve(managedResourcesRoot, ...codex.root.split('/'), ...codex.executable.split('/'))
    : path.join(managedResourcesRoot, 'missing-codex');
  if (codex && options.createExecutable !== false) {
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, '#!/usr/bin/env bash\n', {
      encoding: 'utf8',
      mode: options.executableMode ?? 0o755,
    });
    fs.chmodSync(executablePath, options.executableMode ?? 0o755);
  }

  return { resourcesPath, managedResourcesRoot, executablePath };
}

function resolve(resourcesPath: string, env: NodeJS.ProcessEnv = {}, homeDir = '/Users/operator') {
  return resolveAioncoreManagedCodex({
    resourcesPath,
    platform: 'darwin',
    arch: 'arm64',
    env,
    homeDir,
  });
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveAioncoreManagedCodex', () => {
  it('resolves the schema v2 Codex entry and builds a deduplicated environment', () => {
    const bundle = writeBundle(makeManifest());
    const executableDir = path.dirname(fs.realpathSync(bundle.executablePath));
    const result = resolve(bundle.resourcesPath, {
      CODEX_HOME: ' /managed/codex-home ',
      PATH: ['/usr/bin', executableDir, '/bin', '/usr/bin'].join(path.delimiter),
    });

    expect(result.runtimeKey).toBe(RUNTIME_KEY);
    expect(result.version).toBe('0.144.6');
    expect(result.managedResourcesRoot).toBe(fs.realpathSync(bundle.managedResourcesRoot));
    expect(result.executablePath).toBe(fs.realpathSync(bundle.executablePath));
    expect(result.env).toEqual({
      OPL_CODEX_BIN: fs.realpathSync(bundle.executablePath),
      CODEX_HOME: '/managed/codex-home',
      PATH: [executableDir, '/usr/bin', '/bin'].join(path.delimiter),
    });
  });

  it('defaults CODEX_HOME to the operator home', () => {
    const bundle = writeBundle(makeManifest());

    expect(resolve(bundle.resourcesPath, {}, '/home/operator').env.CODEX_HOME).toBe(
      path.join('/home/operator', '.codex')
    );
  });

  it('fails closed when the managed resources manifest is missing or invalid', () => {
    const missingResources = makeTempRoot('aioncore-managed-codex-missing-manifest');
    expect(() => resolve(missingResources)).toThrow(/cannot read manifest/);

    const invalidResources = makeTempRoot('aioncore-managed-codex-invalid-manifest');
    const managedResourcesRoot = path.join(invalidResources, 'bundled-aioncore', RUNTIME_KEY, 'managed-resources');
    fs.mkdirSync(managedResourcesRoot, { recursive: true });
    fs.writeFileSync(path.join(managedResourcesRoot, 'manifest.json'), '{invalid', 'utf8');
    expect(() => resolve(invalidResources)).toThrow(/cannot read manifest/);
  });

  it('rejects a runtimeKey mismatch', () => {
    const manifest = makeManifest();
    manifest.runtimeKey = 'linux-x64';
    const bundle = writeBundle(manifest);

    expect(() => resolve(bundle.resourcesPath)).toThrow(/runtimeKey must be darwin-arm64/);
  });

  it('rejects an unsupported manifest schema', () => {
    const manifest = makeManifest();
    manifest.schemaVersion = 1;
    const bundle = writeBundle(manifest);

    expect(() => resolve(bundle.resourcesPath)).toThrow(/schemaVersion must be 2/);
  });

  it('requires exactly one Codex CLI entry', () => {
    const missing = makeManifest();
    missing.clis = missing.clis.filter((entry) => entry.name !== 'codex');
    const missingBundle = writeBundle(missing);
    expect(() => resolve(missingBundle.resourcesPath)).toThrow(/exactly one Codex CLI entry/);

    const duplicate = makeManifest();
    duplicate.clis.push({ ...duplicate.clis.find((entry) => entry.name === 'codex')! });
    const duplicateBundle = writeBundle(duplicate);
    expect(() => resolve(duplicateBundle.resourcesPath)).toThrow(/exactly one Codex CLI entry/);
  });

  it('rejects Codex identity mismatches', () => {
    const platformMismatch = makeManifest();
    platformMismatch.clis.find((entry) => entry.name === 'codex')!.platformDirectory = 'linux-x64';
    const platformBundle = writeBundle(platformMismatch);
    expect(() => resolve(platformBundle.resourcesPath)).toThrow(/platformDirectory must be darwin-arm64/);

    const emptyVersion = makeManifest();
    emptyVersion.clis.find((entry) => entry.name === 'codex')!.version = ' ';
    const versionBundle = writeBundle(emptyVersion);
    expect(() => resolve(versionBundle.resourcesPath)).toThrow(/version must be non-empty/);
  });

  it.each(['../escape', '/absolute', 'cli\\codex', 'cli//codex', './cli'])(
    'rejects unsafe Codex root %s',
    (unsafeRoot) => {
      const manifest = makeManifest();
      manifest.clis.find((entry) => entry.name === 'codex')!.root = unsafeRoot;
      const bundle = writeBundle(manifest, { createExecutable: false });

      expect(() => resolve(bundle.resourcesPath)).toThrow(/Codex root must be a safe POSIX relative path/);
    }
  );

  it('rejects an unsafe Codex executable path', () => {
    const manifest = makeManifest();
    manifest.clis.find((entry) => entry.name === 'codex')!.executable = '../codex';
    const bundle = writeBundle(manifest, { createExecutable: false });

    expect(() => resolve(bundle.resourcesPath)).toThrow(/Codex executable must be a safe POSIX relative path/);
  });

  it('rejects a missing Codex executable', () => {
    const bundle = writeBundle(makeManifest(), { createExecutable: false });

    expect(() => resolve(bundle.resourcesPath)).toThrow(/Codex executable does not exist/);
  });

  const unixIt = process.platform === 'win32' ? it.skip : it;

  unixIt('rejects a non-executable Codex file', () => {
    const bundle = writeBundle(makeManifest(), { executableMode: 0o644 });

    expect(() => resolve(bundle.resourcesPath)).toThrow(/Codex executable is not executable/);
  });

  unixIt('rejects a Codex symlink that escapes managed resources', () => {
    const bundle = writeBundle(makeManifest(), { createExecutable: false });
    const externalRoot = makeTempRoot('external-codex');
    const externalExecutable = path.join(externalRoot, 'codex');
    fs.writeFileSync(externalExecutable, '#!/usr/bin/env bash\n', { encoding: 'utf8', mode: 0o755 });
    fs.mkdirSync(path.dirname(bundle.executablePath), { recursive: true });
    fs.symlinkSync(externalExecutable, bundle.executablePath);

    expect(() => resolve(bundle.resourcesPath)).toThrow(/escapes managed resources root/);
  });
});

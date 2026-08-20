import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveAioncoreManagedCodex } from '@/process/backend/aioncoreManagedCodex';
import {
  OPL_CODEX_RUNTIME_IDENTITY_SCHEMA,
  resolveOplCodexRuntimeIdentityFromEnv,
} from '@/process/backend/oplCodexRuntimeIdentity';

const RUNTIME_KEY = 'darwin-arm64';
const CODEX_VERSION = '0.146.0';
const CODEX_ROOT = `cli/codex/${CODEX_VERSION}/${RUNTIME_KEY}`;
const CODEX_EXECUTABLE = 'codex-aarch64-apple-darwin/codex-aarch64-apple-darwin';
const REQUIRED_ABSENT_PATHS = [
  'cli/claude',
  'acp',
  'node_modules/@anthropic-ai/claude-code',
  'node_modules/claude-code',
  'claude',
];
const tmpRoots: string[] = [];

type TestCli = {
  name: string;
  version: string;
  root: string;
  platformDirectory: string;
  executable: string;
};

type TestManifest = {
  schema: string;
  runtimeKey: string;
  source: {
    schemaVersion: number;
    manifestSha256: string;
    cliNames: string[];
  };
  projection: {
    includedCliNames: string[];
    excludedCliNames: string[];
    requiredAbsentPaths: string[];
    codexSource: {
      package: string;
      version: string;
      packageSpec: string;
      authority: string;
      verifiedByAioncore: string;
    };
  };
  clis: TestCli[];
};

function makeTempRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tmpRoots.push(root);
  return root;
}

function makeManifest(): TestManifest {
  return {
    schema: 'opl_aioncore_managed_resources_projection.v1',
    runtimeKey: RUNTIME_KEY,
    source: {
      schemaVersion: 2,
      manifestSha256: 'a'.repeat(64),
      cliNames: [],
    },
    projection: {
      includedCliNames: ['codex'],
      excludedCliNames: ['claude'],
      requiredAbsentPaths: REQUIRED_ABSENT_PATHS,
      codexSource: {
        package: '@openai/codex',
        version: CODEX_VERSION,
        packageSpec: `@openai/codex@${CODEX_VERSION}-${RUNTIME_KEY}`,
        authority: 'official_npm_platform_package',
        verifiedByAioncore: 'v0.1.70',
      },
    },
    clis: [
      {
        name: 'codex',
        version: CODEX_VERSION,
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
  it('resolves the OPL Codex-only projection and builds a deduplicated environment', () => {
    const bundle = writeBundle(makeManifest());
    const executableDir = path.dirname(fs.realpathSync(bundle.executablePath));
    const result = resolve(bundle.resourcesPath, {
      CODEX_HOME: ' /managed/codex-home ',
      PATH: ['/usr/bin', executableDir, '/bin', '/usr/bin'].join(path.delimiter),
    });

    expect(result.runtimeKey).toBe(RUNTIME_KEY);
    expect(result.version).toBe(CODEX_VERSION);
    expect(result.managedResourcesRoot).toBe(fs.realpathSync(bundle.managedResourcesRoot));
    expect(result.executablePath).toBe(fs.realpathSync(bundle.executablePath));
    expect(result.identity).toMatchObject({
      schema: OPL_CODEX_RUNTIME_IDENTITY_SCHEMA,
      path: fs.realpathSync(bundle.executablePath),
      realpath: fs.realpathSync(bundle.executablePath),
      version: CODEX_VERSION,
      codex_home: '/managed/codex-home',
      runtime_key: RUNTIME_KEY,
      carrier: {
        kind: 'aioncore_managed_resources_projection',
        producer_manifest_sha256: `sha256:${'a'.repeat(64)}`,
        aioncore_native_readback: false,
      },
    });
    expect(result.identity.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.identity.carrier.projection_manifest_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.identity.runtime_cohort_ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.env).toEqual({
      OPL_CODEX_BIN: result.identity.path,
      CODEX_HOME: '/managed/codex-home',
      OPL_CODEX_RUNTIME_IDENTITY_JSON: JSON.stringify(result.identity),
      OPL_CODEX_RUNTIME_COHORT_REF: result.identity.runtime_cohort_ref,
      PATH: [executableDir, '/usr/bin', '/bin'].join(path.delimiter),
    });
    expect(resolveOplCodexRuntimeIdentityFromEnv(result.env)).toEqual(result.identity);
  });

  it('defaults CODEX_HOME to the operator home', () => {
    const bundle = writeBundle(makeManifest());

    expect(resolve(bundle.resourcesPath, {}, '/home/operator').env.CODEX_HOME).toBe(
      path.join('/home/operator', '.codex')
    );
  });

  it('fails closed when the managed resources manifest is missing or invalid', () => {
    const missingResources = makeTempRoot('aioncore-managed-codex-missing-manifest');
    expect(() => resolve(missingResources)).toThrowError(
      expect.objectContaining({ code: 'MANAGED_RUNTIME_UNAVAILABLE' })
    );
    expect(() => resolve(missingResources)).toThrow(/cannot read manifest/);

    const invalidResources = makeTempRoot('aioncore-managed-codex-invalid-manifest');
    const managedResourcesRoot = path.join(invalidResources, 'bundled-aioncore', RUNTIME_KEY, 'managed-resources');
    fs.mkdirSync(managedResourcesRoot, { recursive: true });
    fs.writeFileSync(path.join(managedResourcesRoot, 'manifest.json'), '{invalid', 'utf8');
    expect(() => resolve(invalidResources)).toThrowError(
      expect.objectContaining({ code: 'MANAGED_RUNTIME_UNAVAILABLE' })
    );
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
    manifest.schema = 'aioncore.managed-resources.v1';
    const bundle = writeBundle(manifest);

    expect(() => resolve(bundle.resourcesPath)).toThrow(/manifest schema must be/);
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
    expect(() => resolve(versionBundle.resourcesPath)).toThrow(/Codex version must be 0\.146\.0/);
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

  it('rejects a stale bundled Claude path even when the projection manifest is valid', () => {
    const bundle = writeBundle(makeManifest());
    fs.mkdirSync(path.join(bundle.managedResourcesRoot, 'cli', 'claude'), { recursive: true });

    expect(() => resolve(bundle.resourcesPath)).toThrow(/forbidden Claude\/raw producer path is present/);
  });
});

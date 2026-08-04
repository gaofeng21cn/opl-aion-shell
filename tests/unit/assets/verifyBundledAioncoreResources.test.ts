import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

const NODE_VERSION = '24.11.0';
const CODEX_VERSION = '0.144.6';
const ABSENT_PATHS = [
  'cli/claude',
  'acp',
  'node_modules/@anthropic-ai/claude-code',
  'node_modules/claude-code',
  'claude',
];

const CODEX_EXECUTABLE_BY_RUNTIME: Record<string, string> = {
  'darwin-arm64': 'vendor/aarch64-apple-darwin/bin/codex',
  'darwin-x64': 'vendor/x86_64-apple-darwin/bin/codex',
  'linux-arm64': 'vendor/aarch64-unknown-linux-musl/bin/codex',
  'linux-x64': 'vendor/x86_64-unknown-linux-musl/bin/codex',
  'win32-arm64': 'vendor/aarch64-pc-windows-msvc/bin/codex.exe',
  'win32-x64': 'vendor/x86_64-pc-windows-msvc/bin/codex.exe',
};

function writeFile(filePath: string, contents = ''): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, { flush: true });
}

function writeJson(filePath: string, value: unknown): void {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function nodeRoot(runtimeKey: string): string {
  const suffix = runtimeKey.startsWith('win32-') ? runtimeKey.replace(/^win32-/, 'win-') : runtimeKey;
  return `node/node-v${NODE_VERSION}-${suffix}`;
}

function nodeExecutable(runtimeKey: string): string {
  return runtimeKey.startsWith('win32-') ? 'node.exe' : 'bin/node';
}

function npmExecutable(runtimeKey: string): string {
  return runtimeKey.startsWith('win32-') ? 'npm.cmd' : 'bin/npm';
}

function nodeNpmRuntimeFiles(runtimeKey: string): string[] {
  const npmRoot = runtimeKey.startsWith('win32-') ? 'node_modules/npm' : 'lib/node_modules/npm';
  return [
    npmExecutable(runtimeKey),
    runtimeKey.startsWith('win32-') ? 'npx.cmd' : 'bin/npx',
    `${npmRoot}/bin/npm-cli.js`,
    `${npmRoot}/bin/npx-cli.js`,
    `${npmRoot}/lib/cli.js`,
  ];
}

function codexExecutable(runtimeKey: string): string {
  const executable = CODEX_EXECUTABLE_BY_RUNTIME[runtimeKey];
  if (!executable) throw new Error(`Missing Codex fixture path for ${runtimeKey}`);
  return executable;
}

function directCliContract(runtimeKey: string) {
  const version = CODEX_VERSION;
  const executable = codexExecutable(runtimeKey);
  return {
    name: 'codex',
    version,
    root: `cli/codex/${version}/${runtimeKey}`,
    platformDirectory: runtimeKey,
    executable,
    requiredFiles: [],
    requiredDirectories: [executable.split('/').slice(0, 2).join('/')],
  };
}

function writeManagedResources(managedResourcesDir: string, runtimeKey: string): void {
  const node = {
    version: NODE_VERSION,
    root: nodeRoot(runtimeKey),
    executable: nodeExecutable(runtimeKey),
  };
  const clis = [directCliContract(runtimeKey)];

  writeFile(join(managedResourcesDir, ...node.root.split('/'), ...node.executable.split('/')), 'node');
  for (const relativePath of nodeNpmRuntimeFiles(runtimeKey)) {
    writeFile(join(managedResourcesDir, ...node.root.split('/'), ...relativePath.split('/')), relativePath);
  }
  for (const cli of clis) {
    const cliRoot = join(managedResourcesDir, ...cli.root.split('/'));
    writeFile(join(cliRoot, ...cli.executable.split('/')), cli.name);
    for (const requiredDirectory of cli.requiredDirectories) {
      mkdirSync(join(cliRoot, ...requiredDirectory.split('/')), { recursive: true });
    }
  }
  writeJson(join(managedResourcesDir, 'manifest.json'), {
    schema: 'opl_aioncore_managed_resources_projection.v1',
    runtimeKey,
    source: {
      schemaVersion: 2,
      manifestSha256: 'a'.repeat(64),
      cliNames: ['claude', 'codex'],
    },
    node,
    clis,
    projection: {
      includedCliNames: ['codex'],
      excludedCliNames: ['claude'],
      requiredAbsentPaths: ABSENT_PATHS,
    },
  });
}

function seedRuntime(resourcesDir: string, runtimeKey: string): string {
  const [platform, arch] = runtimeKey.split('-');
  const runtimeRoot = join(resourcesDir, 'bundled-aioncore', runtimeKey);
  const managedResourcesDir = join(runtimeRoot, 'managed-resources');
  writeFile(join(runtimeRoot, platform === 'win32' ? 'aioncore.exe' : 'aioncore'), 'aioncore');
  writeJson(join(runtimeRoot, 'manifest.json'), {
    platform,
    arch,
    version: 'v0.1.57',
    compatibility: { reportedVersion: '0.1.57' },
  });
  writeManagedResources(managedResourcesDir, runtimeKey);
  return managedResourcesDir;
}

describe('verifyBundledAioncoreResources', () => {
  let tmp: string;
  let resourcesDir: string;
  let managedResourcesDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-bundled-resources-'));
    resourcesDir = join(tmp, 'resources');
    managedResourcesDir = seedRuntime(resourcesDir, 'win32-x64');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes for the exact schema v2 Node and direct-CLI cohort', () => {
    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.runtimeKey).toBe('win32-x64');
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.sizeAccounting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'managed-node', present: true }),
        expect.objectContaining({ label: 'claude-cli', present: false }),
        expect.objectContaining({ label: 'codex-cli', present: true }),
      ])
    );
  });

  it('passes for the exact macOS arm64 layout', () => {
    const darwinResourcesDir = join(tmp, 'darwin-resources');
    seedRuntime(darwinResourcesDir, 'darwin-arm64');

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.checked).toEqual(
      expect.arrayContaining([
        'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/node',
        'bundled-aioncore/darwin-arm64/managed-resources/cli/codex/0.144.6/darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
      ])
    );
  });

  it('reports a missing managed Node executable', () => {
    rmSync(join(managedResourcesDir, ...nodeRoot('win32-x64').split('/'), 'node.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toEqual(
      expect.arrayContaining([
        'bundled-aioncore/win32-x64/managed-resources/node/*/node.exe',
        'bundled-aioncore/win32-x64/managed-resources/node/node-v24.11.0-win-x64/node.exe',
      ])
    );
  });

  it('reports a missing managed npm executable', () => {
    rmSync(join(managedResourcesDir, ...nodeRoot('win32-x64').split('/'), 'npm.cmd'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/node/*/npm.cmd');
  });

  it('reports an incomplete managed npm runtime library', () => {
    rmSync(join(managedResourcesDir, ...nodeRoot('win32-x64').split('/'), 'node_modules/npm/lib/cli.js'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toEqual(
      expect.arrayContaining([
        'bundled-aioncore/win32-x64/managed-resources/node/*/node_modules/npm/lib/cli.js',
        'bundled-aioncore/win32-x64/managed-resources/node/node-v24.11.0-win-x64/node_modules/npm/lib/cli.js',
      ])
    );
  });

  it.skipIf(process.platform === 'win32')('reports dangling managed-resource symlinks', () => {
    const darwinResourcesDir = join(tmp, 'darwin-dangling-resources');
    const darwinManagedResourcesDir = seedRuntime(darwinResourcesDir, 'darwin-arm64');
    const linkPath = join(darwinManagedResourcesDir, ...nodeRoot('darwin-arm64').split('/'), 'bin', 'corepack');
    symlinkSync('../lib/node_modules/corepack/dist/corepack.js', linkPath);

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/corepack'
    );
  });

  it.skipIf(process.platform === 'win32')('reports internal absolute managed-resource symlinks', () => {
    const darwinResourcesDir = join(tmp, 'darwin-absolute-symlink-resources');
    const darwinManagedResourcesDir = seedRuntime(darwinResourcesDir, 'darwin-arm64');
    const nodeDir = join(darwinManagedResourcesDir, ...nodeRoot('darwin-arm64').split('/'));
    const npmPath = join(nodeDir, 'bin', 'npm');
    const npmTarget = join(nodeDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    rmSync(npmPath);
    writeFile(npmTarget, 'npm');
    symlinkSync(npmTarget, npmPath);

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/npm'
    );
  });

  it('reports a missing direct Codex executable', () => {
    const codex = directCliContract('win32-x64');
    rmSync(join(managedResourcesDir, ...codex.root.split('/'), ...codex.executable.split('/')));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/cli/codex/0.144.6/win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe'
    );
  });

  it('rejects schema v1 ACP resources', () => {
    writeJson(join(managedResourcesDir, 'manifest.json'), {
      schema: 'aioncore.managed-resources.v1',
      runtimeKey: 'win32-x64',
      acpTools: [],
    });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json: projection schema/runtimeKey mismatch'
    );
  });

  it('rejects missing or duplicate direct CLI identities', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.clis = [manifest.clis[0], manifest.clis[0]];
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json: expected exactly codex direct CLI'
    );
  });

  it('rejects direct CLI version or path drift', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.clis.find((cli: { name: string }) => cli.name === 'codex').version = '0.143.0';
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json: invalid managed codex CLI identity'
    );
  });

  it('rejects a mismatched Node identity', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.node.version = '20.0.0';
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json: invalid managed Node identity'
    );
  });

  it('rejects legacy managed ACP bytes even with a valid v2 contract', () => {
    mkdirSync(join(managedResourcesDir, 'acp', 'codex-acp'), { recursive: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp: forbidden Claude/raw producer path is present'
    );
  });

  it('rejects extra on-disk direct CLI versions', () => {
    mkdirSync(join(managedResourcesDir, 'cli', 'codex', '0.143.0'), { recursive: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json: codex CLI directory versions do not match 0.144.6'
    );
  });

  it('rejects AionCore bytes from an older managed-resource cohort', () => {
    const manifestPath = join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.version = 'v0.1.50';
    manifest.compatibility.reportedVersion = '0.1.50';
    writeJson(manifestPath, manifest);

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/manifest.json: expected AionCore v0.1.57 for win32-x64 with reported version 0.1.57'
    );
  });
});

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const { __test__ } = require('../../../packages/shared-scripts/src/prepare-aioncore.js');

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-aioncore-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeUpstreamManagedResources(outputDir: string, runtimeKey: string) {
  const platform = runtimeKey.split('-')[0];
  const nodeSuffix = runtimeKey.startsWith('win32-') ? runtimeKey.replace(/^win32-/, 'win-') : runtimeKey;
  const nodeRoot = `node/node-v24.11.0-${nodeSuffix}`;
  const nodeExecutable = platform === 'win32' ? 'node.exe' : 'bin/node';
  const nodePath = path.join(outputDir, ...nodeRoot.split('/'), ...nodeExecutable.split('/'));
  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, path.basename(nodePath));
  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 2,
      runtimeKey,
      node: { version: '24.11.0', root: nodeRoot, executable: nodeExecutable },
      clis: [],
    })
  );
}

function writeCodexPackage(runtimeKey: string) {
  const executables: Record<string, string> = {
    'darwin-arm64': 'vendor/aarch64-apple-darwin/bin/codex',
    'linux-x64': 'vendor/x86_64-unknown-linux-musl/bin/codex',
  };
  const executable = executables[runtimeKey];
  if (!executable) throw new Error(`Unsupported Codex fixture ${runtimeKey}`);
  const packageDir = makeTempDir();
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: '@openai/codex', version: `0.151.0-${runtimeKey}` })
  );
  const executablePath = path.join(packageDir, ...executable.split('/'));
  fs.mkdirSync(path.dirname(executablePath), { recursive: true });
  fs.writeFileSync(executablePath, 'codex', { mode: 0o755 });
  return packageDir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('managed Codex ACP publisher policy', () => {
  it('uses the maintained ACP package and validates every OpenAI platform binary', () => {
    const script = fs.readFileSync(
      path.resolve(import.meta.dirname, '../../../scripts/prepare-managed-acp-tools.sh'),
      'utf8'
    );

    expect(script).toContain('AIONCORE_MANAGED_RESOURCES_MANIFEST is required.');
    expect(script).toContain("manifest.acpTools.filter((tool) => tool?.slug === 'codex-acp')");
    expect(script).not.toContain('CODEX_ACP_VERSION="${CODEX_ACP_VERSION:-');
    expect(script).toContain('codex-acp|@agentclientprotocol/codex-acp|${CODEX_ACP_VERSION}');
    expect(script).not.toContain('@zed-industries/codex-acp');
    for (const binaryPath of [
      '@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
      '@openai/codex-darwin-x64/vendor/x86_64-apple-darwin/bin/codex',
      '@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/bin/codex',
      '@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex',
      '@openai/codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe',
      '@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
    ]) {
      expect(script).toContain(binaryPath);
    }
  });
});

describe('prepare-aioncore compatibility gate', () => {
  it('statically validates a cross-platform target without executing its binary on the host', () => {
    const calls: string[][] = [];
    const result = __test__.resolveAioncoreCompatibility('/tmp/linux-aioncore', 'v0.1.50', {
      skipHostProbe: true,
      targetPlatform: 'linux',
      hostPlatform: 'win32',
      execFileSync(_command: string, args: string[]) {
        calls.push(args);
        throw new Error('cross-platform binary must not execute on the host');
      },
    });

    expect(result).toEqual({
      version: '0.1.50',
      requiredOptions: ['--recover-corrupted-database'],
    });
    expect(calls).toEqual([]);
  });

  it('accepts a target-prepared runtime manifest for cross-platform packaging', () => {
    const dir = makeTempDir();
    const runtimeDir = path.join(dir, 'linux-x64');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'manifest.json'),
      JSON.stringify({
        platform: 'linux',
        arch: 'x64',
        version: '0.1.50',
        compatibility: {
          reportedVersion: '0.1.50',
          requiredOptions: ['--recover-corrupted-database'],
        },
      })
    );

    expect(__test__.assertPreparedRuntimeManifestCompatibility(runtimeDir, 'linux', 'x64', '0.1.50')).toEqual({
      version: '0.1.50',
      requiredOptions: ['--recover-corrupted-database'],
    });
  });

  it('does not allow compatibility probes to be skipped for a native target', () => {
    expect(() =>
      __test__.resolveAioncoreCompatibility('/tmp/aioncore', 'v0.1.50', {
        skipHostProbe: true,
        targetPlatform: 'win32',
        hostPlatform: 'win32',
      })
    ).toThrow(/only be skipped for a cross-platform target/);
  });

  it('keeps the native Linux probe available for Windows cross-builds from Linux', () => {
    const calls: string[][] = [];
    expect(() =>
      __test__.resolveAioncoreCompatibility('/tmp/linux-aioncore', 'v0.1.50', {
        skipHostProbe: false,
        targetPlatform: 'linux',
        hostPlatform: 'linux',
        execFileSync(_command: string, args: string[]) {
          calls.push(args);
          return args[0] === '--version' ? 'aioncore 0.1.50\n' : 'Options:\n  --recover-corrupted-database\n';
        },
      })
    ).not.toThrow();
    expect(calls).toEqual([['--version'], ['--help']]);
  });

  it('accepts the pinned version only when the recovery flag is available', () => {
    const calls: string[][] = [];

    const result = __test__.assertAioncoreCompatibility('/tmp/aioncore', 'v0.1.53', {
      execFileSync(_command: string, args: string[]) {
        calls.push(args);
        return args[0] === '--version'
          ? 'aioncore 0.1.53\n'
          : 'Options:\n  --recover-corrupted-database\n  -V, --version\n';
      },
    });

    expect(result.version).toBe('0.1.53');
    expect(calls).toEqual([['--version'], ['--help']]);
  });

  it('rejects a binary whose reported version does not match the package pin', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', 'v0.1.53', {
        execFileSync() {
          return 'aioncore 0.1.28\n';
        },
      })
    ).toThrow(/expected 0\.1\.53, reported 0\.1\.28/);
  });

  it('rejects a binary that does not expose database recovery', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', 'v0.1.53', {
        execFileSync(_command: string, args: string[]) {
          return args[0] === '--version' ? 'aioncore 0.1.53\n' : 'Options:\n  -V, --version\n';
        },
      })
    ).toThrow(/missing required option --recover-corrupted-database/);
  });

  it('rejects an Actions artifact below the minimum recovery version without a release tag', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', null, {
        execFileSync(_command: string, args: string[]) {
          return args[0] === '--version'
            ? 'aioncore 0.1.48\n'
            : 'Options:\n  --recover-corrupted-database\n  -V, --version\n';
        },
      })
    ).toThrow(/requires AionCore >= 0\.1\.49, reported 0\.1\.48/);
  });

  it('rejects prerelease Actions artifacts to match the runtime recovery gate', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', null, {
        execFileSync() {
          return 'aioncore 0.1.49-rc.1\n';
        },
      })
    ).toThrow(/unrecognized --version output/);
  });

  it('accepts a target-executed prepared runtime manifest without requiring host WSL', () => {
    const runtimeDir = makeTempDir();
    fs.writeFileSync(
      path.join(runtimeDir, 'manifest.json'),
      JSON.stringify({
        platform: 'linux',
        arch: 'x64',
        version: 'v0.1.50',
        compatibility: {
          reportedVersion: '0.1.50',
          requiredOptions: ['--recover-corrupted-database'],
        },
      })
    );

    expect(__test__.assertPreparedRuntimeManifestCompatibility(runtimeDir, 'linux', 'x64', 'v0.1.50')).toEqual({
      version: '0.1.50',
      requiredOptions: ['--recover-corrupted-database'],
    });
  });

  it('rejects a prepared runtime manifest with a stale version or missing recovery support', () => {
    const runtimeDir = makeTempDir();
    const manifestPath = path.join(runtimeDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        platform: 'linux',
        arch: 'x64',
        version: 'v0.1.49',
        compatibility: {
          reportedVersion: '0.1.49',
          requiredOptions: [],
        },
      })
    );

    expect(() => __test__.assertPreparedRuntimeManifestCompatibility(runtimeDir, 'linux', 'x64', 'v0.1.50')).toThrow(
      /version mismatch/
    );

    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        platform: 'linux',
        arch: 'x64',
        version: 'v0.1.50',
        compatibility: {
          reportedVersion: '0.1.50',
          requiredOptions: [],
        },
      })
    );
    expect(() => __test__.assertPreparedRuntimeManifestCompatibility(runtimeDir, 'linux', 'x64', 'v0.1.50')).toThrow(
      /missing required option --recover-corrupted-database/
    );
  });
});

describe('prepare-aioncore official release archive integrity', () => {
  it('resolves exact official identities for every supported target', () => {
    const projectRoot = path.resolve(import.meta.dirname, '../../..');
    const targets = [
      ['darwin', 'arm64'],
      ['darwin', 'x64'],
      ['linux', 'arm64'],
      ['linux', 'x64'],
      ['win32', 'arm64'],
      ['win32', 'x64'],
    ];

    const assets = targets.map(([platform, arch]) =>
      __test__.resolveOfficialReleaseAsset(projectRoot, platform, arch, 'v0.2.1')
    );

    expect(new Set(assets.map((asset: { sha256: string }) => asset.sha256)).size).toBe(6);
    expect(assets).toContainEqual({
      runtimeKey: 'linux-x64',
      name: 'aioncore-v0.2.1-x86_64-unknown-linux-gnu.tar.gz',
      sha256: '57e6faf22213f1d6d5de7bd21a3f5328f1059f44d4595a14889c88fc57674057',
      url: 'https://github.com/iOfficeAI/AionCore/releases/download/v0.2.1/aioncore-v0.2.1-x86_64-unknown-linux-gnu.tar.gz',
    });
  });

  it('rejects an archive before extraction when its bytes do not match the official digest', () => {
    const projectRoot = path.resolve(import.meta.dirname, '../../..');
    let extractionAttempted = false;

    expect(() =>
      __test__.downloadAndExtract(projectRoot, 'linux', 'x64', 'v0.2.1', {
        downloadFile(_url: string, outputPath: string) {
          fs.writeFileSync(outputPath, 'wrong archive bytes');
        },
        extractArchive() {
          extractionAttempted = true;
        },
      })
    ).toThrow(/linux-x64 archive SHA-256 mismatch/);
    expect(extractionAttempted).toBe(false);
    expect(fs.existsSync(path.join(os.tmpdir(), 'aioncore-prepare', 'v0.2.1', 'linux-x64'))).toBe(false);
  });
});

describe('prepare-aioncore local-development source gate', () => {
  it('requires complete exact source provenance for a local binary', () => {
    const binaryPath = path.join(makeTempDir(), 'aioncore');
    fs.writeFileSync(binaryPath, 'binary');

    expect(() => __test__.resolveLocalAioncoreSource({ localBinaryPath: binaryPath })).toThrow(
      /requires binary path, HTTPS source URL, exact 40-character commit, and exact 40-character tree/
    );
  });

  it('binds a local binary to an exact commit and tree', () => {
    const binaryPath = path.join(makeTempDir(), 'aioncore');
    fs.writeFileSync(binaryPath, 'binary');
    const commit = 'a'.repeat(40);
    const tree = 'b'.repeat(40);

    expect(
      __test__.resolveLocalAioncoreSource({
        localBinaryPath: binaryPath,
        localSourceUrl: `https://github.com/iOfficeAI/AionCore/commit/${commit}`,
        localSourceRef: commit,
        localSourceTree: tree,
      })
    ).toEqual({
      binaryPath: fs.realpathSync(binaryPath),
      sourceDetail: {
        url: `https://github.com/iOfficeAI/AionCore/commit/${commit}`,
        commit,
        tree,
      },
    });
  });

  it('rejects non-HTTPS or abbreviated source identities', () => {
    const binaryPath = path.join(makeTempDir(), 'aioncore');
    fs.writeFileSync(binaryPath, 'binary');

    expect(() =>
      __test__.resolveLocalAioncoreSource({
        localBinaryPath: binaryPath,
        localSourceUrl: 'file:///tmp/AionCore',
        localSourceRef: 'abc123',
        localSourceTree: 'def456',
      })
    ).toThrow(/source URL must use HTTPS/);
  });

  it('rejects personal fork source identities', () => {
    const binaryPath = path.join(makeTempDir(), 'aioncore');
    fs.writeFileSync(binaryPath, 'binary');
    const commit = 'a'.repeat(40);

    expect(() =>
      __test__.resolveLocalAioncoreSource({
        localBinaryPath: binaryPath,
        localSourceUrl: `https://github.com/example-user/AionCore/commit/${commit}`,
        localSourceRef: commit,
        localSourceTree: 'b'.repeat(40),
      })
    ).toThrow(/exact official commit/);
  });
});

describe('prepare-aioncore download retry', () => {
  it('retries transient curl and wget failures, removing partial downloads before retry', () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, 'aioncore.tar.gz');
    const commands: string[] = [];
    const delays: number[] = [];

    __test__.downloadFile('https://example.invalid/aioncore.tar.gz', outputPath, {
      attempts: 2,
      retryDelayMs: 10,
      platform: 'darwin',
      sleep: (ms: number) => delays.push(ms),
      logger: { log() {}, warn() {} },
      execFileSync(command: string) {
        commands.push(command);
        if (commands.length <= 2) {
          fs.writeFileSync(outputPath, 'partial');
          throw new Error(`${command} transient failure`);
        }
        expect(fs.existsSync(outputPath)).toBe(false);
      },
    });

    expect(commands).toEqual(['curl', 'wget', 'curl']);
    expect(delays).toEqual([10]);
  });

  it('reports the final retry count when every download attempt fails', () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, 'aioncore.tar.gz');

    expect(() =>
      __test__.downloadFile('https://example.invalid/aioncore.tar.gz', outputPath, {
        attempts: 2,
        retryDelayMs: 1,
        platform: 'darwin',
        sleep() {},
        logger: { log() {}, warn() {} },
        execFileSync(command: string) {
          throw new Error(`${command} still down`);
        },
      })
    ).toThrow(/aioncore download failed after 2 attempts/);
  });

  it('uses the fallback for invalid positive integer environment values', () => {
    expect(__test__.parsePositiveInteger('3', 1)).toBe(3);
    expect(__test__.parsePositiveInteger('0', 4)).toBe(4);
    expect(__test__.parsePositiveInteger('not-a-number', 4)).toBe(4);
  });
});

describe('prepare-aioncore managed resources preparation', () => {
  it('uses release-build npm fetch defaults without overriding explicit environment values', () => {
    expect(__test__.getManagedResourcePrepareEnv({}).npm_config_fetch_timeout).toBe('600000');
    expect(__test__.getManagedResourcePrepareEnv({}).npm_config_fetch_retries).toBe('5');
    expect(__test__.getManagedResourcePrepareEnv({}).npm_config_audit).toBe('false');
    expect(__test__.getManagedResourcePrepareEnv({}).npm_config_fund).toBe('false');

    const env = __test__.getManagedResourcePrepareEnv({
      npm_config_fetch_timeout: '123',
      npm_config_fetch_retries: '2',
      npm_config_audit: 'true',
      npm_config_fund: 'true',
    });

    expect(env.npm_config_fetch_timeout).toBe('123');
    expect(env.npm_config_fetch_retries).toBe('2');
    expect(env.npm_config_audit).toBe('true');
    expect(env.npm_config_fund).toBe('true');
    expect(env.AIONUI_BUNDLED_MANAGED_RESOURCES).toBe('');
  });

  it('retries with a clean bundle while preserving prepared runtime data', () => {
    const dir = makeTempDir();
    const targetDir = path.join(dir, 'darwin-arm64');
    const binaryPath = path.join(targetDir, 'aioncore');
    const delays: number[] = [];
    let calls = 0;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(binaryPath, 'binary');

    const bundleOut = __test__.prepareManagedResources(binaryPath, targetDir, {
      attempts: 2,
      platform: 'darwin',
      arch: 'arm64',
      retryDelayMs: 10,
      sleep: (ms: number) => delays.push(ms),
      logger: { log() {}, warn() {} },
      codexPackageDir: writeCodexPackage('darwin-arm64'),
      execFileSync(_command: string, args: string[]) {
        calls += 1;
        const dataDir = args[args.indexOf('--data-dir') + 1];
        const outputDir = args[args.indexOf('--bundle-out') + 1];
        if (calls === 1) {
          fs.writeFileSync(path.join(dataDir, 'runtime-ready'), 'ready');
          fs.mkdirSync(path.join(outputDir, 'acp'), { recursive: true });
          fs.writeFileSync(path.join(outputDir, 'acp', 'partial'), 'partial');
          throw new Error('npm fetch reset');
        }

        expect(fs.existsSync(path.join(outputDir, 'acp', 'partial'))).toBe(false);
        expect(fs.readFileSync(path.join(dataDir, 'runtime-ready'), 'utf8')).toBe('ready');
        writeUpstreamManagedResources(outputDir, 'darwin-arm64');
      },
    });

    expect(calls).toBe(2);
    expect(delays).toEqual([10]);
    expect(bundleOut).toBe(path.join(targetDir, 'managed-resources'));
    expect(fs.existsSync(path.join(targetDir, '.prepare-data'))).toBe(false);
    expect(fs.readdirSync(targetDir).some((entry) => entry.startsWith('.managed-resources-staging-'))).toBe(false);
    const projection = JSON.parse(fs.readFileSync(path.join(bundleOut, 'manifest.json'), 'utf8'));
    expect(projection).toMatchObject({
      schema: 'opl_aioncore_managed_resources_projection.v1',
      runtimeKey: 'darwin-arm64',
      source: {
        schemaVersion: 2,
        cliNames: [],
      },
      projection: {
        includedCliNames: ['codex'],
        excludedCliNames: ['claude'],
        codexSource: {
          package: '@openai/codex',
          version: '0.151.0',
          packageSpec: '@openai/codex@0.151.0-darwin-arm64',
          verifiedByAioncore: 'v0.2.1',
        },
      },
    });
    expect(projection.source.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(projection.clis.map((entry: { name: string }) => entry.name)).toEqual(['codex']);
    expect(fs.existsSync(path.join(bundleOut, 'cli', 'claude'))).toBe(false);
  });

  it('validates managed Node against the explicit Linux target instead of the build host', () => {
    const dir = makeTempDir();
    const targetDir = path.join(dir, 'linux-x64');
    const binaryPath = path.join(targetDir, 'aioncore');
    let materializeCalls = 0;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(binaryPath, 'binary');

    const bundleOut = __test__.prepareManagedResources(binaryPath, targetDir, {
      attempts: 1,
      hostPlatform: 'win32',
      platform: 'linux',
      arch: 'x64',
      logger: { log() {}, warn() {} },
      codexPackageDir: writeCodexPackage('linux-x64'),
      execFileSync(_command: string, args: string[]) {
        if (args.includes('--materialize-internal-file-symlinks')) {
          materializeCalls += 1;
          return JSON.stringify({ materialized: [], hardLinked: [], copied: [], removedDangling: [] });
        }
        const outputDir = args[args.indexOf('--bundle-out') + 1];
        writeUpstreamManagedResources(outputDir, 'linux-x64');
      },
    });

    expect(bundleOut).toBe(path.join(targetDir, 'managed-resources'));
    expect(fs.existsSync(path.join(bundleOut, 'node', 'node-v24.11.0-linux-x64', 'bin', 'node'))).toBe(true);
    expect(materializeCalls).toBe(1);
  });

  it('does not publish or retain a partial projection when the Codex carrier identity is invalid', () => {
    const dir = makeTempDir();
    const stagingDir = path.join(dir, 'staging');
    const targetDir = path.join(dir, 'managed-resources');
    writeUpstreamManagedResources(stagingDir, 'darwin-arm64');

    const codexPackageDir = writeCodexPackage('darwin-arm64');
    fs.writeFileSync(
      path.join(codexPackageDir, 'package.json'),
      JSON.stringify({ name: '@openai/codex', version: '0.147.0-darwin-arm64' })
    );

    expect(() => __test__.projectManagedResources(stagingDir, targetDir, 'darwin-arm64', { codexPackageDir })).toThrow(
      /must be @openai\/codex@0\.151\.0-darwin-arm64/
    );
    expect(fs.existsSync(targetDir)).toBe(false);
    expect(fs.readdirSync(dir).some((entry) => entry.startsWith('managed-resources.projection-'))).toBe(false);
  });

  it('fails closed and removes partial output after all retries fail', () => {
    const dir = makeTempDir();
    const targetDir = path.join(dir, 'darwin-arm64');
    const binaryPath = path.join(targetDir, 'aioncore');
    let calls = 0;
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(binaryPath, 'binary');

    expect(() =>
      __test__.prepareManagedResources(binaryPath, targetDir, {
        attempts: 2,
        retryDelayMs: 1,
        sleep() {},
        logger: { log() {}, warn() {} },
        execFileSync(_command: string, args: string[]) {
          calls += 1;
          const bundleOut = args[args.indexOf('--bundle-out') + 1];
          fs.mkdirSync(path.join(bundleOut, 'acp'), { recursive: true });
          fs.writeFileSync(path.join(bundleOut, 'acp', 'partial'), 'partial');
          throw new Error(`npm fetch failed ${calls}`);
        },
      })
    ).toThrow(/failed after 2 attempts.*partial managed-resources directory was removed.*npm fetch failed 2/i);

    expect(calls).toBe(2);
    expect(fs.existsSync(path.join(targetDir, 'managed-resources'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, '.prepare-data'))).toBe(false);
  });
});

describe('prepare-aioncore prepared runtime cache', () => {
  it('writes byte-identical root manifests for independent materializations', () => {
    const manifestBytes = [makeTempDir(), makeTempDir()].map((projectRoot) => {
      const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', 'darwin-arm64');
      fs.mkdirSync(targetDir, { recursive: true });
      __test__.writePreparedRuntimeManifest(targetDir, {
        platform: 'darwin',
        arch: 'arm64',
        version: 'v0.1.53',
        sourceType: 'download',
        sourceDetail: {
          url: 'https://github.com/iOfficeAI/AionCore/releases/download/v0.1.53/aioncore-v0.1.53-aarch64-apple-darwin.tar.gz',
        },
        compatibility: {
          version: '0.1.53',
          requiredOptions: ['--recover-corrupted-database'],
        },
        binaryName: 'aioncore',
      });
      return fs.readFileSync(path.join(targetDir, 'manifest.json'));
    });

    expect(manifestBytes[0].equals(manifestBytes[1])).toBe(true);
    expect(crypto.createHash('sha256').update(manifestBytes[0]).digest('hex')).toBe(
      crypto.createHash('sha256').update(manifestBytes[1]).digest('hex')
    );
    expect(JSON.parse(manifestBytes[0].toString('utf8'))).not.toHaveProperty('generatedAt');
  });

  it('defaults the prepared runtime cache outside the project out directory', () => {
    const dir = makeTempDir();
    const homeDir = path.join(dir, 'home');
    const projectRoot = path.join(dir, 'project');

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });

    expect(__test__.defaultAioncoreCacheRoot({ platform: 'darwin', homeDir })).toBe(
      path.join(homeDir, 'Library', 'Caches', 'One Person Lab', 'aioncore')
    );

    const cachePaths = __test__.getAioncoreCachePaths(projectRoot, 'darwin-arm64', 'v0.1.53');
    expect(cachePaths.resourcesRoot.startsWith(path.join(projectRoot, 'out'))).toBe(false);
    expect(cachePaths.resourcesRoot).toMatch(/-opl-composed-codex-v2$/);
  });

  it('reuses a complete prepared runtime cache without downloading or preparing managed resources', () => {
    const dir = makeTempDir();
    const projectRoot = path.join(dir, 'project');
    const cacheRoot = path.join(dir, 'cache');
    const cacheRuntimeDir = path.join(
      cacheRoot,
      'darwin-arm64-v0.2.1-56fe721f956301d5a37bab5d34fdbdbc77148d9e679d884254b66589c8caf32d-opl-composed-codex-v2',
      'bundled-aioncore',
      'darwin-arm64'
    );
    const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', 'darwin-arm64');
    const cachedNodeRoot = path.join(cacheRuntimeDir, 'managed-resources', 'node', 'node-v24.11.0-darwin-arm64');
    const intakePath = path.join(projectRoot, 'contracts', 'aionui-upstream-intake.json');

    fs.mkdirSync(path.dirname(intakePath), { recursive: true });
    fs.copyFileSync(path.resolve(import.meta.dirname, '../../../contracts/aionui-upstream-intake.json'), intakePath);
    fs.mkdirSync(path.join(cachedNodeRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(cachedNodeRoot, 'lib', 'node_modules', 'npm', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(cachedNodeRoot, 'lib', 'node_modules', 'npm', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(cacheRuntimeDir, 'aioncore'), 'binary');
    fs.writeFileSync(
      path.join(cacheRuntimeDir, 'manifest.json'),
      JSON.stringify({
        platform: 'darwin',
        arch: 'arm64',
        version: 'v0.2.1',
        compatibility: { reportedVersion: '0.2.1' },
      })
    );
    fs.writeFileSync(path.join(cachedNodeRoot, 'bin', 'node'), 'node');
    fs.writeFileSync(path.join(cachedNodeRoot, 'bin', 'npm'), 'npm');
    fs.writeFileSync(path.join(cachedNodeRoot, 'bin', 'npx'), 'npx');
    fs.writeFileSync(path.join(cachedNodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'npm');
    fs.writeFileSync(path.join(cachedNodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'), 'npx');
    fs.writeFileSync(path.join(cachedNodeRoot, 'lib', 'node_modules', 'npm', 'lib', 'cli.js'), 'npm runtime');

    const managedResourcesDir = path.join(cacheRuntimeDir, 'managed-resources');
    const codexRoot = path.join(managedResourcesDir, 'cli', 'codex', '0.151.0', 'darwin-arm64');
    const codexExecutable = 'vendor/aarch64-apple-darwin/bin/codex';
    fs.mkdirSync(path.join(codexRoot, ...codexExecutable.split('/').slice(0, -1)), { recursive: true });
    fs.writeFileSync(path.join(codexRoot, ...codexExecutable.split('/')), 'codex');
    fs.writeFileSync(
      path.join(managedResourcesDir, 'manifest.json'),
      JSON.stringify({
        schema: 'opl_aioncore_managed_resources_projection.v1',
        runtimeKey: 'darwin-arm64',
        source: {
          schemaVersion: 2,
          manifestSha256: 'a'.repeat(64),
          cliNames: [],
        },
        node: {
          version: '24.11.0',
          root: 'node/node-v24.11.0-darwin-arm64',
          executable: 'bin/node',
        },
        clis: [
          {
            name: 'codex',
            version: '0.151.0',
            root: 'cli/codex/0.151.0/darwin-arm64',
            platformDirectory: 'darwin-arm64',
            executable: codexExecutable,
            requiredFiles: [],
            requiredDirectories: ['vendor/aarch64-apple-darwin'],
          },
        ],
        projection: {
          includedCliNames: ['codex'],
          excludedCliNames: ['claude'],
          requiredAbsentPaths: [
            'cli/claude',
            'acp',
            'node_modules/@anthropic-ai/claude-code',
            'node_modules/claude-code',
            'claude',
          ],
          codexSource: {
            package: '@openai/codex',
            version: '0.151.0',
            packageSpec: '@openai/codex@0.151.0-darwin-arm64',
            authority: 'official_npm_platform_package',
            verifiedByAioncore: 'v0.2.1',
          },
        },
      })
    );
    const previousCacheDir = process.env.AIONUI_AIONCORE_CACHE_DIR;
    process.env.AIONUI_AIONCORE_CACHE_DIR = cacheRoot;
    try {
      const result = __test__.prepareAioncore({
        projectRoot,
        platform: 'darwin',
        arch: 'arm64',
        version: 'v0.2.1',
        compatibilityExecFileSync(_command: string, args: string[]) {
          return args[0] === '--version'
            ? 'aioncore 0.2.1\n'
            : 'Options:\n  --recover-corrupted-database\n  -V, --version\n';
        },
      });

      expect(result.sourceType).toBe('cache');
      expect(fs.readFileSync(path.join(targetDir, 'aioncore'), 'utf8')).toBe('binary');
      expect(
        fs.existsSync(path.join(targetDir, 'managed-resources', 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'node'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(targetDir, 'managed-resources', 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'npm'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(targetDir, 'managed-resources', 'cli', 'claude', '2.1.215', 'darwin-arm64', 'claude'))
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(
            targetDir,
            'managed-resources',
            'cli',
            'codex',
            '0.151.0',
            'darwin-arm64',
            ...codexExecutable.split('/')
          )
        )
      ).toBe(true);
    } finally {
      if (previousCacheDir === undefined) {
        delete process.env.AIONUI_AIONCORE_CACHE_DIR;
      } else {
        process.env.AIONUI_AIONCORE_CACHE_DIR = previousCacheDir;
      }
    }
  });
});

describe('prepare-aioncore managed Node pruning', () => {
  it.skipIf(process.platform === 'win32')(
    'materializes internal file symlinks before a Windows packager traverses a Linux bundle',
    () => {
      const dir = makeTempDir();
      const managedResourcesDir = path.join(dir, 'managed-resources');
      const targetFile = path.join(managedResourcesDir, 'node_modules', 'tool', 'cli.js');
      const shimPath = path.join(managedResourcesDir, 'node_modules', '.bin', 'tool');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.mkdirSync(path.dirname(shimPath), { recursive: true });
      fs.writeFileSync(targetFile, '#!/usr/bin/env node\n');
      fs.symlinkSync('../tool/cli.js', shimPath);

      const result = __test__.materializeInternalFileSymlinks(managedResourcesDir);

      expect(fs.lstatSync(shimPath).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(shimPath, 'utf8')).toBe('#!/usr/bin/env node\n');
      expect(result.materialized).toEqual(['node_modules/.bin/tool']);
      expect([...result.hardLinked, ...result.copied]).toEqual(['node_modules/.bin/tool']);
    }
  );

  it.skipIf(process.platform === 'win32')('rejects managed resource symlinks that escape the bundle', () => {
    const dir = makeTempDir();
    const managedResourcesDir = path.join(dir, 'managed-resources');
    const outsideFile = path.join(dir, 'outside.js');
    const shimPath = path.join(managedResourcesDir, 'node_modules', '.bin', 'outside');
    fs.mkdirSync(path.dirname(shimPath), { recursive: true });
    fs.writeFileSync(outsideFile, 'outside');
    fs.symlinkSync(outsideFile, shimPath);

    expect(() => __test__.materializeInternalFileSymlinks(managedResourcesDir)).toThrow(/outside the bundle/);
  });

  it.skipIf(process.platform === 'win32')('removes dangling symlinks whose targets stay inside the bundle', () => {
    const dir = makeTempDir();
    const managedResourcesDir = path.join(dir, 'managed-resources');
    const shimPath = path.join(managedResourcesDir, 'node_modules', '.bin', 'missing');
    fs.mkdirSync(path.dirname(shimPath), { recursive: true });
    fs.symlinkSync('../missing/cli.js', shimPath);

    const result = __test__.materializeInternalFileSymlinks(managedResourcesDir);

    expect(fs.existsSync(shimPath)).toBe(false);
    expect(result.removedDangling).toEqual(['node_modules/.bin/missing']);
  });

  it('keeps npm payloads while pruning non-runtime Node resources', () => {
    const dir = makeTempDir();
    const managedResourcesDir = path.join(dir, 'managed-resources');
    const nodeVersionDir = path.join(managedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64');

    fs.mkdirSync(path.join(nodeVersionDir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(nodeVersionDir, 'include', 'node'), { recursive: true });
    fs.mkdirSync(path.join(nodeVersionDir, 'share', 'man'), { recursive: true });
    fs.mkdirSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'npm'), { recursive: true });
    fs.mkdirSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'corepack'), { recursive: true });
    fs.writeFileSync(path.join(nodeVersionDir, 'bin', 'node'), 'node');
    fs.writeFileSync(path.join(nodeVersionDir, 'bin', 'npm'), 'npm');
    fs.writeFileSync(path.join(nodeVersionDir, 'bin', 'npx'), 'npx');
    fs.writeFileSync(path.join(nodeVersionDir, 'bin', 'corepack'), 'corepack');
    fs.writeFileSync(path.join(nodeVersionDir, 'include', 'node', 'node.h'), 'headers');
    fs.writeFileSync(path.join(nodeVersionDir, 'share', 'man', 'node.1'), 'manual');
    fs.writeFileSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'package.json'), '{}');
    fs.writeFileSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'corepack', 'package.json'), '{}');

    const result = __test__.pruneManagedNodeRuntime(managedResourcesDir, 'darwin');

    expect(fs.existsSync(path.join(nodeVersionDir, 'bin', 'node'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'bin', 'npm'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'bin', 'npx'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'bin', 'corepack'))).toBe(false);
    expect(fs.existsSync(path.join(nodeVersionDir, 'include'))).toBe(false);
    expect(fs.existsSync(path.join(nodeVersionDir, 'share'))).toBe(false);
    expect(fs.existsSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'npm'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'corepack'))).toBe(false);
    expect(result.checkedExecutables).toEqual(['node/node-v24.11.0-darwin-arm64/bin/node']);
    expect(result.pruned).toEqual(
      expect.arrayContaining([
        'node/node-v24.11.0-darwin-arm64/include',
        'node/node-v24.11.0-darwin-arm64/share',
        'node/node-v24.11.0-darwin-arm64/lib/node_modules/corepack',
      ])
    );
    expect(result.pruned).not.toEqual(
      expect.arrayContaining([
        'node/node-v24.11.0-darwin-arm64/bin/npm',
        'node/node-v24.11.0-darwin-arm64/bin/npx',
        'node/node-v24.11.0-darwin-arm64/lib/node_modules/npm',
      ])
    );
  });

  it.skipIf(process.platform === 'win32')(
    'removes dangling package-manager symlinks after their payloads are pruned',
    () => {
      const dir = makeTempDir();
      const managedResourcesDir = path.join(dir, 'managed-resources');
      const nodeVersionDir = path.join(managedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64');

      fs.mkdirSync(path.join(nodeVersionDir, 'bin'), { recursive: true });
      fs.mkdirSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'corepack', 'dist'), { recursive: true });
      fs.writeFileSync(path.join(nodeVersionDir, 'bin', 'node'), 'node');
      fs.writeFileSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'corepack', 'dist', 'corepack.js'), 'corepack');
      fs.symlinkSync('../lib/node_modules/corepack/dist/corepack.js', path.join(nodeVersionDir, 'bin', 'corepack'));

      const result = __test__.pruneManagedNodeRuntime(managedResourcesDir, 'darwin');

      expect(fs.existsSync(path.join(nodeVersionDir, 'bin', 'node'))).toBe(true);
      expect(() => fs.lstatSync(path.join(nodeVersionDir, 'bin', 'corepack'))).toThrow();
      expect(fs.existsSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'corepack'))).toBe(false);
      expect(result.pruned).toEqual(
        expect.arrayContaining([
          'node/node-v24.11.0-darwin-arm64/lib/node_modules/corepack',
          'node/node-v24.11.0-darwin-arm64/bin/corepack',
        ])
      );
    }
  );

  it.skipIf(process.platform === 'win32')('normalizes internal absolute symlinks so bundles remain relocatable', () => {
    const dir = makeTempDir();
    const managedResourcesDir = path.join(dir, 'managed-resources');
    const nodeVersionDir = path.join(managedResourcesDir, 'node', 'node-v24.11.0-linux-arm64');

    fs.mkdirSync(path.join(nodeVersionDir, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(nodeVersionDir, 'bin', 'node'), 'node');
    fs.writeFileSync(path.join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'npm');
    fs.symlinkSync(
      path.join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(nodeVersionDir, 'bin', 'npm')
    );

    const result = __test__.pruneManagedNodeRuntime(managedResourcesDir, 'linux');

    expect(fs.readlinkSync(path.join(nodeVersionDir, 'bin', 'npm'))).toBe('../lib/node_modules/npm/bin/npm-cli.js');
    expect(result.normalizedSymlinks).toEqual(['node/node-v24.11.0-linux-arm64/bin/npm']);
  });

  it('keeps Windows npm payloads while pruning corepack', () => {
    const dir = makeTempDir();
    const managedResourcesDir = path.join(dir, 'managed-resources');
    const nodeVersionDir = path.join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64');

    fs.mkdirSync(path.join(nodeVersionDir, 'node_modules', 'npm'), { recursive: true });
    fs.mkdirSync(path.join(nodeVersionDir, 'node_modules', 'corepack'), { recursive: true });
    fs.writeFileSync(path.join(nodeVersionDir, 'node.exe'), 'node');
    fs.writeFileSync(path.join(nodeVersionDir, 'npm.cmd'), 'npm');
    fs.writeFileSync(path.join(nodeVersionDir, 'npx.cmd'), 'npx');
    fs.writeFileSync(path.join(nodeVersionDir, 'corepack.cmd'), 'corepack');
    fs.writeFileSync(path.join(nodeVersionDir, 'node_modules', 'npm', 'package.json'), '{}');
    fs.writeFileSync(path.join(nodeVersionDir, 'node_modules', 'corepack', 'package.json'), '{}');

    const result = __test__.pruneManagedNodeRuntime(managedResourcesDir, 'win32');

    expect(fs.existsSync(path.join(nodeVersionDir, 'node.exe'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'npm.cmd'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'npx.cmd'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'corepack.cmd'))).toBe(false);
    expect(fs.existsSync(path.join(nodeVersionDir, 'node_modules', 'npm'))).toBe(true);
    expect(fs.existsSync(path.join(nodeVersionDir, 'node_modules', 'corepack'))).toBe(false);
    expect(result.checkedExecutables).toEqual(['node/node-v24.11.0-win-x64/node.exe']);
  });

  it('rejects a managed Node bundle that has no runtime executable', () => {
    const dir = makeTempDir();
    const managedResourcesDir = path.join(dir, 'managed-resources');
    fs.mkdirSync(path.join(managedResourcesDir, 'node', 'node-v24.11.0-linux-x64', 'include'), { recursive: true });

    expect(() => __test__.pruneManagedNodeRuntime(managedResourcesDir, 'linux')).toThrow(
      /Managed Node runtime is missing required executable/
    );
  });
});

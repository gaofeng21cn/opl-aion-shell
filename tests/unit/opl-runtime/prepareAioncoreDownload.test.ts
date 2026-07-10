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

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('prepare-aioncore compatibility gate', () => {
  it('accepts the pinned version only when the recovery flag is available', () => {
    const calls: string[][] = [];

    const result = __test__.assertAioncoreCompatibility('/tmp/aioncore', 'v0.1.44', {
      execFileSync(_command: string, args: string[]) {
        calls.push(args);
        return args[0] === '--version'
          ? 'aioncore 0.1.44\n'
          : 'Options:\n  --recover-corrupted-database\n  -V, --version\n';
      },
    });

    expect(result.version).toBe('0.1.44');
    expect(calls).toEqual([['--version'], ['--help']]);
  });

  it('rejects a binary whose reported version does not match the package pin', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', 'v0.1.44', {
        execFileSync() {
          return 'aioncore 0.1.28\n';
        },
      })
    ).toThrow(/expected 0\.1\.44, reported 0\.1\.28/);
  });

  it('rejects a binary that does not expose database recovery', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', 'v0.1.44', {
        execFileSync(_command: string, args: string[]) {
          return args[0] === '--version' ? 'aioncore 0.1.44\n' : 'Options:\n  -V, --version\n';
        },
      })
    ).toThrow(/missing required option --recover-corrupted-database/);
  });

  it('rejects an Actions artifact below the minimum recovery version without a release tag', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', null, {
        execFileSync(_command: string, args: string[]) {
          return args[0] === '--version'
            ? 'aioncore 0.1.43\n'
            : 'Options:\n  --recover-corrupted-database\n  -V, --version\n';
        },
      })
    ).toThrow(/requires AionCore >= 0\.1\.44, reported 0\.1\.43/);
  });

  it('rejects prerelease Actions artifacts to match the runtime recovery gate', () => {
    expect(() =>
      __test__.assertAioncoreCompatibility('/tmp/aioncore', null, {
        execFileSync() {
          return 'aioncore 0.1.44-rc.1\n';
        },
      })
    ).toThrow(/unrecognized --version output/);
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
      retryDelayMs: 10,
      sleep: (ms: number) => delays.push(ms),
      logger: { log() {}, warn() {} },
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
        const nodeBin = path.join(outputDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin');
        fs.mkdirSync(nodeBin, { recursive: true });
        fs.writeFileSync(path.join(nodeBin, 'node'), 'node');
      },
    });

    expect(calls).toBe(2);
    expect(delays).toEqual([10]);
    expect(bundleOut).toBe(path.join(targetDir, 'managed-resources'));
    expect(fs.existsSync(path.join(targetDir, '.prepare-data'))).toBe(false);
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
  it('defaults the prepared runtime cache outside the project out directory', () => {
    const dir = makeTempDir();
    const homeDir = path.join(dir, 'home');
    const projectRoot = path.join(dir, 'project');

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });

    expect(__test__.defaultAioncoreCacheRoot({ platform: 'darwin', homeDir })).toBe(
      path.join(homeDir, 'Library', 'Caches', 'One Person Lab', 'aioncore')
    );

    const cachePaths = __test__.getAioncoreCachePaths(projectRoot, 'darwin-arm64', 'v0.1.44');
    expect(cachePaths.resourcesRoot.startsWith(path.join(projectRoot, 'out'))).toBe(false);
  });

  it('reuses a complete prepared runtime cache without downloading or preparing managed resources', () => {
    const dir = makeTempDir();
    const projectRoot = path.join(dir, 'project');
    const cacheRoot = path.join(dir, 'cache');
    const cacheRuntimeDir = path.join(cacheRoot, 'darwin-arm64-v0.1.44', 'bundled-aioncore', 'darwin-arm64');
    const targetDir = path.join(projectRoot, 'resources', 'bundled-aioncore', 'darwin-arm64');

    fs.mkdirSync(path.join(cacheRuntimeDir, 'managed-resources', 'node', 'node-v24.11.0-darwin-arm64', 'bin'), {
      recursive: true,
    });
    fs.writeFileSync(path.join(cacheRuntimeDir, 'aioncore'), 'binary');
    fs.writeFileSync(path.join(cacheRuntimeDir, 'manifest.json'), '{}');
    fs.writeFileSync(
      path.join(cacheRuntimeDir, 'managed-resources', 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'node'),
      'node'
    );
    fs.writeFileSync(
      path.join(cacheRuntimeDir, 'managed-resources', 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'npm'),
      'npm'
    );

    for (const tool of ['codex-acp', 'claude-agent-acp']) {
      const toolRoot = path.join(cacheRuntimeDir, 'managed-resources', 'acp', tool, '0.1.0', 'darwin-arm64');
      fs.mkdirSync(toolRoot, { recursive: true });
      fs.writeFileSync(path.join(toolRoot, 'manifest.json'), JSON.stringify({ entrypoint: 'index.js' }));
      fs.writeFileSync(path.join(toolRoot, 'index.js'), 'console.log("ok")');
    }
    fs.mkdirSync(
      path.join(
        cacheRuntimeDir,
        'managed-resources',
        'acp',
        'codex-acp',
        '0.1.0',
        'darwin-arm64',
        'node_modules',
        '.bin'
      ),
      {
        recursive: true,
      }
    );
    fs.symlinkSync(
      '../@zed-industries/codex-acp/bin/codex-acp.js',
      path.join(
        cacheRuntimeDir,
        'managed-resources',
        'acp',
        'codex-acp',
        '0.1.0',
        'darwin-arm64',
        'node_modules',
        '.bin',
        'codex-acp'
      )
    );

    const previousCacheDir = process.env.AIONUI_AIONCORE_CACHE_DIR;
    process.env.AIONUI_AIONCORE_CACHE_DIR = cacheRoot;
    try {
      const result = __test__.prepareAioncore({
        projectRoot,
        platform: 'darwin',
        arch: 'arm64',
        version: 'v0.1.44',
        compatibilityExecFileSync(_command: string, args: string[]) {
          return args[0] === '--version'
            ? 'aioncore 0.1.44\n'
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
        fs.readlinkSync(
          path.join(
            targetDir,
            'managed-resources',
            'acp',
            'codex-acp',
            '0.1.0',
            'darwin-arm64',
            'node_modules',
            '.bin',
            'codex-acp'
          )
        )
      ).toBe('../@zed-industries/codex-acp/bin/codex-acp.js');
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

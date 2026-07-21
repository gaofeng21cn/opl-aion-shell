import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  verifyBundledAioncoreResources,
} = require('../../../packages/shared-scripts/src/verify-bundled-aioncore-resources');

const CODEX_ACP_ENTRYPOINT = 'node_modules/@agentclientprotocol/codex-acp/dist/index.js';
const CODEX_ACP_VERSION = '1.1.4';
const CODEX_VERSION = '0.144.6';

function writeAioncoreManifest(resourcesDir: string, runtimeKey: string): void {
  const [platform, arch] = runtimeKey.split('-');
  writeFileSync(
    join(resourcesDir, 'bundled-aioncore', runtimeKey, 'manifest.json'),
    JSON.stringify({
      platform,
      arch,
      version: 'v0.1.49',
      compatibility: { reportedVersion: '0.1.49' },
    })
  );
}

function writeManagedCodexContract(managedResourcesDir: string, runtimeKey: string): string {
  const platformExecutableByRuntimeKey: Record<string, string> = {
    'darwin-arm64': 'node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
    'win32-x64': 'node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
  };
  const platformExecutable = platformExecutableByRuntimeKey[runtimeKey];
  if (!platformExecutable) throw new Error(`Missing Codex fixture path for ${runtimeKey}`);

  const root = `acp/codex-acp/${CODEX_ACP_VERSION}/${runtimeKey}`;
  const toolRoot = join(managedResourcesDir, ...root.split('/'));
  const platformPackageName = `@openai/codex-${runtimeKey}`;
  mkdirSync(join(toolRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'dist'), { recursive: true });
  mkdirSync(join(toolRoot, 'node_modules', '@openai', 'codex'), { recursive: true });
  mkdirSync(join(toolRoot, 'node_modules', '@openai', `codex-${runtimeKey}`), { recursive: true });
  mkdirSync(join(toolRoot, ...platformExecutable.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(
    join(toolRoot, 'manifest.json'),
    JSON.stringify({ entrypoint: CODEX_ACP_ENTRYPOINT, path_entries: ['node_modules/.bin'] })
  );
  writeFileSync(
    join(toolRoot, 'package.json'),
    JSON.stringify({ dependencies: { '@agentclientprotocol/codex-acp': CODEX_ACP_VERSION } })
  );
  writeFileSync(join(toolRoot, 'package-lock.json'), '{}');
  writeFileSync(join(toolRoot, ...CODEX_ACP_ENTRYPOINT.split('/')), 'console.log("codex-acp")');
  writeFileSync(
    join(toolRoot, 'node_modules', '@agentclientprotocol', 'codex-acp', 'package.json'),
    JSON.stringify({
      name: '@agentclientprotocol/codex-acp',
      version: CODEX_ACP_VERSION,
      bin: { 'codex-acp': 'dist/index.js' },
    })
  );
  writeFileSync(
    join(toolRoot, 'node_modules', '@openai', 'codex', 'package.json'),
    JSON.stringify({
      name: '@openai/codex',
      version: CODEX_VERSION,
      optionalDependencies: {
        [platformPackageName]: `npm:@openai/codex@${CODEX_VERSION}-${runtimeKey}`,
      },
    })
  );
  writeFileSync(
    join(toolRoot, 'node_modules', '@openai', `codex-${runtimeKey}`, 'package.json'),
    JSON.stringify({ name: '@openai/codex', version: `${CODEX_VERSION}-${runtimeKey}` })
  );
  writeFileSync(join(toolRoot, ...platformExecutable.split('/')), 'codex');
  writeFileSync(
    join(managedResourcesDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      runtimeKey,
      acpTools: [
        {
          slug: 'codex-acp',
          version: CODEX_ACP_VERSION,
          packageName: '@agentclientprotocol/codex-acp',
          root,
          platformDirectory: runtimeKey,
          manifest: 'manifest.json',
          entrypoint: CODEX_ACP_ENTRYPOINT,
          pathEntries: ['node_modules/.bin'],
          requiredFiles: ['package.json', 'package-lock.json'],
          requiredDirectories: ['node_modules'],
          platformExecutable,
        },
      ],
    })
  );
  return toolRoot;
}

describe('verifyBundledAioncoreResources', () => {
  let tmp: string;
  let resourcesDir: string;
  let managedResourcesDir: string;
  let codexRoot: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-bundled-resources-'));
    resourcesDir = join(tmp, 'resources');
    managedResourcesDir = join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'managed-resources');

    mkdirSync(join(resourcesDir, 'bundled-aioncore', 'win32-x64'), { recursive: true });
    writeFileSync(join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'aioncore.exe'), '', { flush: true });
    writeAioncoreManifest(resourcesDir, 'win32-x64');

    const nodeRoot = join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64');
    mkdirSync(nodeRoot, { recursive: true });
    writeFileSync(join(nodeRoot, 'node.exe'), '', { flush: true });
    writeFileSync(join(nodeRoot, 'npm.cmd'), '', { flush: true });

    codexRoot = writeManagedCodexContract(managedResourcesDir, 'win32-x64');

    const claudeRoot = join(managedResourcesDir, 'acp', 'claude-agent-acp', '0.13.0', 'win32-x64');
    mkdirSync(claudeRoot, { recursive: true });
    writeFileSync(
      join(claudeRoot, 'manifest.json'),
      JSON.stringify({ entrypoint: 'claude-agent-acp.exe', path_entries: [] }),
      { flush: true }
    );
    writeFileSync(join(claudeRoot, 'claude-agent-acp.exe'), '', { flush: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('passes when node, npm, and managed ACP entrypoints exist', () => {
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
        expect.objectContaining({
          label: 'managed-node',
          path: 'bundled-aioncore/win32-x64/managed-resources/node',
          present: true,
        }),
        expect.objectContaining({
          label: 'codex-acp',
          path: 'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp',
          present: true,
        }),
        expect.objectContaining({
          label: 'claude-agent-acp',
          path: 'bundled-aioncore/win32-x64/managed-resources/acp/claude-agent-acp',
          present: true,
        }),
      ])
    );
  });

  it('reports missing managed node runtime executable', () => {
    rmSync(join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64', 'node.exe'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/node/*/node.exe');
  });

  it('reports missing managed npm runtime executable', () => {
    rmSync(join(managedResourcesDir, 'node', 'node-v24.11.0-win-x64', 'npm.cmd'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/win32-x64/managed-resources/node/*/npm.cmd');
  });

  it('passes for non-Windows node runtime layout', () => {
    const darwinResourcesDir = join(tmp, 'darwin-resources');
    const darwinManagedResourcesDir = join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'managed-resources');

    mkdirSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64'), { recursive: true });
    writeFileSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'aioncore'), '', { flush: true });
    writeAioncoreManifest(darwinResourcesDir, 'darwin-arm64');
    mkdirSync(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin'), { recursive: true });
    writeFileSync(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'node'), '', {
      flush: true,
    });
    writeFileSync(join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64', 'bin', 'npm'), '', {
      flush: true,
    });

    writeManagedCodexContract(darwinManagedResourcesDir, 'darwin-arm64');

    const darwinClaudeRoot = join(darwinManagedResourcesDir, 'acp', 'claude-agent-acp', '0.13.0', 'darwin-arm64');
    mkdirSync(darwinClaudeRoot, { recursive: true });
    writeFileSync(join(darwinClaudeRoot, 'manifest.json'), JSON.stringify({ entrypoint: 'claude-agent-acp' }), {
      flush: true,
    });
    writeFileSync(join(darwinClaudeRoot, 'claude-agent-acp'), '', { flush: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toEqual([]);
    expect(result.checked).toContain('bundled-aioncore/darwin-arm64/managed-resources/node/*/bin/node');
    expect(result.checked).toContain('bundled-aioncore/darwin-arm64/managed-resources/node/*/bin/npm');
  });

  it('reports missing non-Windows managed node runtime executable', () => {
    const linuxResourcesDir = join(tmp, 'linux-resources');
    const linuxManagedResourcesDir = join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'managed-resources');

    mkdirSync(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64'), { recursive: true });
    writeFileSync(join(linuxResourcesDir, 'bundled-aioncore', 'linux-x64', 'aioncore'), '', { flush: true });
    writeAioncoreManifest(linuxResourcesDir, 'linux-x64');
    mkdirSync(join(linuxManagedResourcesDir, 'node', 'node-v24.11.0-linux-x64'), { recursive: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir: linuxResourcesDir,
      electronPlatformName: 'linux',
      targetArch: 'x64',
    });

    expect(result.missing).toContain('bundled-aioncore/linux-x64/managed-resources/node/*/bin/node');
    expect(result.missing).toContain('bundled-aioncore/linux-x64/managed-resources/node/*/bin/npm');
  });

  it.skipIf(process.platform === 'win32')('reports dangling managed Node symlinks before codesign reaches them', () => {
    const darwinResourcesDir = join(tmp, 'darwin-dangling-resources');
    const darwinManagedResourcesDir = join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'managed-resources');
    const nodeVersionDir = join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64');

    mkdirSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64'), { recursive: true });
    writeFileSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'aioncore'), '', { flush: true });
    writeAioncoreManifest(darwinResourcesDir, 'darwin-arm64');
    mkdirSync(join(nodeVersionDir, 'bin'), { recursive: true });
    writeFileSync(join(nodeVersionDir, 'bin', 'node'), '', { flush: true });
    writeFileSync(join(nodeVersionDir, 'bin', 'npm'), '', { flush: true });
    symlinkSync('../lib/node_modules/corepack/dist/corepack.js', join(nodeVersionDir, 'bin', 'corepack'));

    writeManagedCodexContract(darwinManagedResourcesDir, 'darwin-arm64');

    const darwinClaudeRoot = join(darwinManagedResourcesDir, 'acp', 'claude-agent-acp', '0.13.0', 'darwin-arm64');
    mkdirSync(darwinClaudeRoot, { recursive: true });
    writeFileSync(join(darwinClaudeRoot, 'manifest.json'), JSON.stringify({ entrypoint: 'claude-agent-acp' }), {
      flush: true,
    });
    writeFileSync(join(darwinClaudeRoot, 'claude-agent-acp'), '', { flush: true });

    const result = verifyBundledAioncoreResources({
      resourcesDir: darwinResourcesDir,
      electronPlatformName: 'darwin',
      targetArch: 'arm64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/corepack'
    );
  });

  it.skipIf(process.platform === 'win32')(
    'reports internal absolute managed Node symlinks before packaging them',
    () => {
      const darwinResourcesDir = join(tmp, 'darwin-absolute-symlink-resources');
      const darwinManagedResourcesDir = join(
        darwinResourcesDir,
        'bundled-aioncore',
        'darwin-arm64',
        'managed-resources'
      );
      const nodeVersionDir = join(darwinManagedResourcesDir, 'node', 'node-v24.11.0-darwin-arm64');

      mkdirSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64'), { recursive: true });
      writeFileSync(join(darwinResourcesDir, 'bundled-aioncore', 'darwin-arm64', 'aioncore'), '', { flush: true });
      writeAioncoreManifest(darwinResourcesDir, 'darwin-arm64');
      mkdirSync(join(nodeVersionDir, 'bin'), { recursive: true });
      mkdirSync(join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'bin'), { recursive: true });
      writeFileSync(join(nodeVersionDir, 'bin', 'node'), '', { flush: true });
      writeFileSync(join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), '', { flush: true });
      symlinkSync(
        join(nodeVersionDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        join(nodeVersionDir, 'bin', 'npm')
      );

      writeManagedCodexContract(darwinManagedResourcesDir, 'darwin-arm64');

      const darwinClaudeRoot = join(darwinManagedResourcesDir, 'acp', 'claude-agent-acp', '0.13.0', 'darwin-arm64');
      mkdirSync(darwinClaudeRoot, { recursive: true });
      writeFileSync(join(darwinClaudeRoot, 'manifest.json'), JSON.stringify({ entrypoint: 'claude-agent-acp' }), {
        flush: true,
      });
      writeFileSync(join(darwinClaudeRoot, 'claude-agent-acp'), '', { flush: true });

      const result = verifyBundledAioncoreResources({
        resourcesDir: darwinResourcesDir,
        electronPlatformName: 'darwin',
        targetArch: 'arm64',
      });

      expect(result.missing).toContain(
        'bundled-aioncore/darwin-arm64/managed-resources/node/node-v24.11.0-darwin-arm64/bin/npm'
      );
    }
  );

  it('reports missing managed ACP manifest', () => {
    rmSync(join(codexRoot, 'manifest.json'));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      'bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/*/win32-x64/manifest.json'
    );
  });

  it('reports missing managed ACP entrypoint declared by manifest', () => {
    rmSync(join(codexRoot, ...CODEX_ACP_ENTRYPOINT.split('/')));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      `bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/${CODEX_ACP_VERSION}/win32-x64/${CODEX_ACP_ENTRYPOINT}`
    );
  });

  it('rejects a managed manifest that points Codex at the legacy ACP package', () => {
    const manifestPath = join(managedResourcesDir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.acpTools[0].packageName = '@zed-industries/codex-acp';
    writeFileSync(manifestPath, JSON.stringify(manifest));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      'bundled-aioncore/win32-x64/managed-resources/manifest.json: invalid maintained Codex ACP identity'
    );
  });

  it('rejects AionCore and ACP versions from the superseded Full image', () => {
    const aioncoreManifestPath = join(resourcesDir, 'bundled-aioncore', 'win32-x64', 'manifest.json');
    const aioncoreManifest = JSON.parse(readFileSync(aioncoreManifestPath, 'utf8'));
    aioncoreManifest.version = 'v0.1.44';
    aioncoreManifest.compatibility.reportedVersion = '0.1.44';
    writeFileSync(aioncoreManifestPath, JSON.stringify(aioncoreManifest));

    const managedManifestPath = join(managedResourcesDir, 'manifest.json');
    const managedManifest = JSON.parse(readFileSync(managedManifestPath, 'utf8'));
    managedManifest.acpTools[0].version = '1.1.2';
    writeFileSync(managedManifestPath, JSON.stringify(managedManifest));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toEqual(
      expect.arrayContaining([
        expect.stringContaining('expected AionCore v0.1.49'),
        'bundled-aioncore/win32-x64/managed-resources/manifest.json: invalid maintained Codex ACP identity',
      ])
    );
  });

  it('rejects managed Codex versions other than the AionCore 0.1.49 payload', () => {
    const codexPackagePath = join(codexRoot, 'node_modules', '@openai', 'codex', 'package.json');
    const codexPackage = JSON.parse(readFileSync(codexPackagePath, 'utf8'));
    codexPackage.version = '0.143.0';
    writeFileSync(codexPackagePath, JSON.stringify(codexPackage));

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.invalid).toContain(
      `bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/${CODEX_ACP_VERSION}/win32-x64/node_modules/@openai/codex/package.json: expected Codex ${CODEX_VERSION} for win32-x64`
    );
  });

  it('requires the target-platform Codex binary declared by AionCore', () => {
    rmSync(
      join(
        codexRoot,
        'node_modules',
        '@openai',
        'codex-win32-x64',
        'vendor',
        'x86_64-pc-windows-msvc',
        'bin',
        'codex.exe'
      )
    );

    const result = verifyBundledAioncoreResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.missing).toContain(
      `bundled-aioncore/win32-x64/managed-resources/acp/codex-acp/${CODEX_ACP_VERSION}/win32-x64/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`
    );
  });
});

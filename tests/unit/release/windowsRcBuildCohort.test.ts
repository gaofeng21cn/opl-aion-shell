import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateWindowsRcBuildCohort } from '../../../scripts/release/generate-windows-rc-build-cohort.mjs';

const roots: string[] = [];

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function seedWindowsRcCohortFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-rc-cohort-'));
  roots.push(root);
  const shellSha = '1'.repeat(40);
  const shellTree = '2'.repeat(40);
  const appSha = '3'.repeat(40);
  const appTree = '4'.repeat(40);
  const frameworkSha = '5'.repeat(40);
  const releaseVersion = '26.7.28-rc.3';
  const runtimeKey = 'linux-x64';
  const packagedResourcesRoot = 'out/win-unpacked/resources';
  const managedResourcesRoot = `${packagedResourcesRoot}/bundled-aioncore/linux-x64/managed-resources`;
  const codex = {
    name: 'codex',
    version: '0.146.0',
    root: 'cli/codex/0.146.0/linux-x64',
    platformDirectory: runtimeKey,
    executable: 'vendor/x86_64-unknown-linux-musl/bin/codex',
    requiredFiles: [],
    requiredDirectories: ['vendor/x86_64-unknown-linux-musl'],
  };
  const managedManifest = {
    schema: 'opl_aioncore_managed_resources_projection.v1',
    runtimeKey,
    source: {
      schemaVersion: 2,
      manifestSha256: 'a'.repeat(64),
      cliNames: [],
    },
    node: {
      version: '24.11.0',
      root: 'node/node-v24.11.0-linux-x64',
      executable: 'bin/node',
    },
    clis: [codex],
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
        version: '0.146.0',
        packageSpec: '@openai/codex@0.146.0-linux-x64',
        authority: 'official_npm_platform_package',
        verifiedByAioncore: 'v0.1.72',
      },
    },
  };

  write(root, `out/One-Person-Lab-${releaseVersion}-win-x64.exe`, 'installer');
  write(root, 'out/win-unpacked/One Person Lab.exe', 'application');
  write(root, 'out/win-unpacked/resources/app.asar.unpacked/node_modules/node-addon-api/nothing.c', '');
  write(
    root,
    `${packagedResourcesRoot}/opl-linux/product.json`,
    JSON.stringify({
      schema: 'opl_linux_product_manifest.v1',
      framework_ref: frameworkSha,
      native_windows_executor_fallback_allowed: false,
    })
  );
  write(root, `${packagedResourcesRoot}/bundled-aioncore/linux-x64/aioncore`, 'aioncore');
  write(root, `${packagedResourcesRoot}/bundled-aioncore/linux-x64/manifest.json`, '{}');
  write(root, `${managedResourcesRoot}/manifest.json`, JSON.stringify(managedManifest));
  write(root, `${managedResourcesRoot}/node/node-v24.11.0-linux-x64/bin/node`, 'node');
  write(root, `${managedResourcesRoot}/node/node-v24.11.0-linux-x64/bin/npm`, 'npm launcher');
  write(root, `${managedResourcesRoot}/node/node-v24.11.0-linux-x64/bin/npx`, 'npx launcher');
  write(root, `${managedResourcesRoot}/node/node-v24.11.0-linux-x64/lib/node_modules/npm/bin/npm-cli.js`, 'npm');
  write(root, `${managedResourcesRoot}/node/node-v24.11.0-linux-x64/lib/node_modules/npm/bin/npx-cli.js`, 'npx');
  write(root, `${managedResourcesRoot}/node/node-v24.11.0-linux-x64/lib/node_modules/npm/lib/cli.js`, 'npm runtime');
  write(root, `${managedResourcesRoot}/${codex.root}/${codex.executable}`, 'codex');

  const options = {
    rootDir: root,
    env: {
      OPL_WINDOWS_RC_RELEASE_VERSION: releaseVersion,
      OPL_WINDOWS_RC_APP_SHA: appSha,
      OPL_WINDOWS_RC_APP_TREE: appTree,
      OPL_WINDOWS_RC_SHELL_SHA: shellSha,
      OPL_WINDOWS_RC_PLATFORM: 'windows-x64',
      OPL_WINDOWS_RC_ARCH: 'x64',
      OPL_WINDOWS_RC_ARTIFACT_NAME: 'windows-build-x64-1111111',
      GITHUB_RUN_ID: '30340000000',
      GITHUB_RUN_ATTEMPT: '1',
    },
    git: (...args: string[]) => (args.at(-1) === 'HEAD^{tree}' ? shellTree : shellSha),
  };

  return {
    root,
    options,
    releaseVersion,
    frameworkSha,
    appSha,
    appTree,
    shellSha,
    shellTree,
    managedResourcesRoot,
    managedManifest,
    codex,
  };
}

describe('Windows RC build cohort', () => {
  it('keeps the packaged Framework URLs bound to the exact product ref', () => {
    const product = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../resources/opl-linux/product.json'), 'utf8')
    );

    expect(product.framework_ref).toMatch(/^[0-9a-f]{40}$/);
    expect(product.framework_install_script_url).toBe(
      `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${product.framework_ref}/install.sh`
    );
    expect(product.framework_source_archive_url).toBe(
      `https://github.com/gaofeng21cn/one-person-lab/archive/${product.framework_ref}.tar.gz`
    );
  });

  it('seals exact source, installer, packaged tree, and WSL2 runtime identities', () => {
    const { root, options, releaseVersion, frameworkSha, appSha, appTree, shellSha, shellTree, codex } =
      seedWindowsRcCohortFixture();
    const cohort = generateWindowsRcBuildCohort(options);

    expect(cohort).toMatchObject({
      schema: 'opl_windows_rc_build_cohort.v1',
      status: 'sealed',
      release: {
        quality: 'preview',
        display_version: releaseVersion,
        latest_allowed: false,
        stable_updater_allowed: false,
      },
      source: {
        app: { sha: appSha, tree: appTree },
        shell: { sha: shellSha, tree: shellTree },
        framework_sha: frameworkSha,
      },
      target: {
        platform: 'win32',
        arch: 'x64',
        runtime_key: 'linux-x64',
      },
      runtime: {
        execution_substrate: 'dedicated_opl_linux_wsl2',
        wsl2_only_terminal_claim: true,
        native_windows_executor_fallback_allowed: false,
      },
      actions: {
        run_id: '30340000000',
        run_attempt: '1',
        artifact_name: 'windows-build-x64-1111111',
      },
    });
    expect(cohort.artifact.path).toBe(`out/One-Person-Lab-${releaseVersion}-win-x64.exe`);
    expect(cohort.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(cohort.packaged_tree).toMatchObject({
      path: 'out/win-unpacked',
      digest_contract: 'sha256(relative_path+NUL+size+NUL+file_sha256+LF)',
    });
    expect(cohort.packaged_tree.file_count).toBeGreaterThan(2);
    expect(cohort.runtime.managed_node).toMatchObject({
      path: 'out/win-unpacked/resources/bundled-aioncore/linux-x64/managed-resources/node/node-v24.11.0-linux-x64/bin/node',
      size_bytes: 4,
    });
    expect(cohort.runtime.managed_node.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(cohort.runtime.managed_node_tree).toMatchObject({
      path: 'out/win-unpacked/resources/bundled-aioncore/linux-x64/managed-resources/node/node-v24.11.0-linux-x64',
      file_count: 6,
      digest_contract: 'sha256(relative_path+NUL+size+NUL+file_sha256+LF)',
    });
    expect(cohort.runtime.managed_npm_launcher.path).toMatch(/\/bin\/npm$/);
    expect(cohort.runtime.managed_npx_launcher.path).toMatch(/\/bin\/npx$/);
    expect(cohort.runtime.managed_npm_cli.path).toMatch(/\/npm\/bin\/npm-cli\.js$/);
    expect(cohort.runtime.managed_npx_cli.path).toMatch(/\/npm\/bin\/npx-cli\.js$/);
    expect(cohort.runtime.managed_npm_runtime.path).toMatch(/\/npm\/lib\/cli\.js$/);
    expect(cohort.runtime.codex.path).toBe(
      `out/win-unpacked/resources/bundled-aioncore/linux-x64/managed-resources/${codex.root}/${codex.executable}`
    );

    write(root, `out/One-Person-Lab-${releaseVersion}-win-x64.exe`, '');
    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      `Required cohort file is empty: out${path.sep}One-Person-Lab-${releaseVersion}-win-x64.exe`
    );

    write(root, `out/One-Person-Lab-${releaseVersion}-win-x64.exe`, 'installer');
    fs.rmSync(path.join(root, 'out/win-unpacked/resources/bundled-aioncore/linux-x64/manifest.json'));
    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      `Required cohort file is missing or not a regular file: out${path.sep}win-unpacked${path.sep}resources${path.sep}bundled-aioncore${path.sep}linux-x64${path.sep}manifest.json`
    );
  });

  it('rejects a packaged Node carrier with an incomplete npm runtime', () => {
    const { root, options, managedResourcesRoot } = seedWindowsRcCohortFixture();
    fs.rmSync(path.join(root, managedResourcesRoot, 'node/node-v24.11.0-linux-x64/lib/node_modules/npm/lib/cli.js'));

    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      /Required cohort file is missing or not a regular file: .*npm.*lib.*cli\.js/
    );
  });

  it('rejects legacy, ambiguous, or inconsistent managed Codex layouts', () => {
    const { root, options, managedResourcesRoot, managedManifest, codex } = seedWindowsRcCohortFixture();
    const manifestPath = `${managedResourcesRoot}/manifest.json`;

    write(
      root,
      manifestPath,
      JSON.stringify({ schema: 'aioncore.managed-resources.v1', runtimeKey: 'linux-x64', acpTools: [] })
    );
    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      'Managed resources manifest must use opl_aioncore_managed_resources_projection.v1 for linux-x64'
    );

    write(root, manifestPath, JSON.stringify({ ...managedManifest, clis: [...managedManifest.clis, codex] }));
    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      'Expected one OPL projection managed Codex CLI entry, found 2'
    );

    write(
      root,
      manifestPath,
      JSON.stringify({
        ...managedManifest,
        clis: managedManifest.clis.map((entry) =>
          entry.name === 'codex' ? { ...entry, root: 'acp/codex-acp/0.146.0/linux-x64' } : entry
        ),
      })
    );
    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      'Managed Codex CLI identity is inconsistent with the schema-v2 layout'
    );

    write(root, manifestPath, JSON.stringify(managedManifest));
    write(
      root,
      `${managedResourcesRoot}/acp/codex-acp/1/linux-x64/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`,
      'legacy-codex'
    );
    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      'Managed resources manifest contains forbidden Claude/raw producer path: acp'
    );
  });

  it('rejects packaged Claude bytes even when the projection manifest is valid', () => {
    const { root, options, managedResourcesRoot } = seedWindowsRcCohortFixture();
    write(root, `${managedResourcesRoot}/cli/claude/2.1.215/linux-x64/claude`, 'claude');

    expect(() => generateWindowsRcBuildCohort(options)).toThrow(
      'Managed resources manifest contains forbidden Claude/raw producer path: cli/claude'
    );
  });

  it('rejects a non-RC version before creating a preview seal', () => {
    expect(() =>
      generateWindowsRcBuildCohort({
        rootDir: '/tmp/unused',
        env: { OPL_WINDOWS_RC_RELEASE_VERSION: '26.7.28' },
        git: () => '',
      })
    ).toThrow('OPL_WINDOWS_RC_RELEASE_VERSION is missing or invalid');
  });

  it('keeps exact Windows source inputs, manifest generation, and upload in the manual build contract', () => {
    const reusable = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/_build-reusable.yml'), 'utf8');
    const manual = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/build-manual.yml'), 'utf8');

    for (const input of [
      'windows_rc_release_version',
      'windows_rc_app_sha',
      'windows_rc_app_tree',
      'windows_rc_shell_sha',
    ]) {
      expect(reusable).toContain(`${input}:`);
      expect(manual).toContain(`${input}:`);
    }
    expect(manual).not.toContain('inputs.branch');
    expect(reusable).not.toContain('inputs.ref');
    expect(reusable).toContain('Verify prepared Linux managed Node runtime');
    expect(reusable).toContain('select(.source.cliNames == [])');
    expect(reusable).not.toContain('select(.source.cliNames == ["claude", "codex"])');
    expect(reusable).toContain('"$node_bin/npm" --version');
    expect(reusable).toContain('"$node_bin/npx" --version');
    expect(reusable).toContain('lib/node_modules/npm/lib/cli.js');
    expect(reusable).toContain('node scripts/release/generate-windows-rc-build-cohort.mjs');
    expect(reusable).toContain('out/opl-windows-rc-build-cohort.json');
    expect(reusable.match(/if: matrix\.platform == 'windows-x64'/g)).toHaveLength(1);
    expect(reusable).toContain("matrix.platform == 'windows-x64' &&");
  });
});

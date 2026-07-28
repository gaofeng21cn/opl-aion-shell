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

describe('Windows RC build cohort', () => {
  it('seals exact source, installer, packaged tree, and WSL2 runtime identities', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-rc-cohort-'));
    roots.push(root);
    const shellSha = '1'.repeat(40);
    const shellTree = '2'.repeat(40);
    const appSha = '3'.repeat(40);
    const appTree = '4'.repeat(40);
    const frameworkSha = '5'.repeat(40);
    const releaseVersion = '26.7.28-rc.3';

    write(root, `out/One-Person-Lab-${releaseVersion}-win-x64.exe`, 'installer');
    write(root, 'out/win-unpacked/One Person Lab.exe', 'application');
    write(
      root,
      'resources/opl-linux/product.json',
      JSON.stringify({
        schema: 'opl_linux_product_manifest.v1',
        framework_ref: frameworkSha,
        native_windows_executor_fallback_allowed: false,
      })
    );
    write(root, 'resources/bundled-aioncore/linux-x64/aioncore', 'aioncore');
    write(root, 'resources/bundled-aioncore/linux-x64/manifest.json', '{}');
    write(root, 'resources/bundled-aioncore/linux-x64/managed-resources/manifest.json', '{}');
    write(
      root,
      'resources/bundled-aioncore/linux-x64/managed-resources/acp/codex-acp/1/linux-x64/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex',
      'codex'
    );

    const cohort = generateWindowsRcBuildCohort({
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
    });

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
      file_count: 1,
      digest_contract: 'sha256(relative_path+NUL+size+NUL+file_sha256+LF)',
    });
    expect(cohort.runtime.codex.path).toContain('@openai/codex-linux-x64/vendor/');
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
    expect(manual).toContain(
      "ref: ${{ (startsWith(inputs.platform, 'windows') || inputs.platform == 'all') && inputs.windows_rc_shell_sha || inputs.branch }}"
    );
    expect(reusable).toContain('node scripts/release/generate-windows-rc-build-cohort.mjs');
    expect(reusable).toContain('out/opl-windows-rc-build-cohort.json');
    expect(reusable.match(/if: matrix\.platform == 'windows-x64'/g)).toHaveLength(1);
    expect(reusable).toContain("matrix.platform == 'windows-x64' &&");
  });
});

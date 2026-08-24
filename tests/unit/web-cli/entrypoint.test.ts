import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const entrypointPath = path.resolve(__dirname, '../../../resources/opl-webui-entrypoint.sh');

describe.skipIf(process.platform === 'win32')('OPL WebUI Docker entrypoint', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-entrypoint-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeFixture(): {
    dataDir: string;
    projectsDir: string;
    manifestPath: string;
    seedDir: string;
    webBin: string;
    officialProfileBin: string;
    fakeBin: string;
  } {
    const dataDir = path.join(tmp, 'data');
    const projectsDir = path.join(tmp, 'projects');
    const seedDir = path.join(tmp, 'seed');
    const manifestPath = path.join(tmp, 'image-manifest.json');
    const fakeBin = path.join(tmp, 'bin');
    const webBin = path.join(tmp, 'aionui-web');
    const officialProfileBin = path.join(tmp, 'opl-official-profile-apply');
    fs.mkdirSync(path.join(seedDir, 'payload'), { recursive: true });
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schema: 'dev.onepersonlab.opl-webui-image-manifest.v1',
          image_role: 'opl_webui_runtime_image',
          webui_package: { name: '@aionui/web-cli', version: '2.1.17' },
          data_dir: dataDir,
          projects_dir: projectsDir,
          seed_strategy: 'payload_manifest',
        },
        null,
        2
      ) + '\n'
    );
    const components = ['opl_framework', 'codex_cli', 'companion_skills', 'domain_modules'].map((id) => ({
      id,
      version: '2.1.17',
      source: 'image_manifest',
      payload_path: `payload/${id}`,
      receipt_kind: `${id}_seed_payload_receipt`,
      source_fingerprint: `sha256:${id}`,
    }));
    fs.writeFileSync(
      path.join(seedDir, 'metadata.json'),
      JSON.stringify(
        {
          schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
          strategy: 'payload_manifest',
          components,
          full_profile: {
            components,
          },
          payload_dir: 'payload',
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(
      path.join(fakeBin, 'opl'),
      `#!/usr/bin/env sh
printf '%s\\n' "$OPL_IMAGE_MANIFEST_PATH" > "${tmp}/maintenance-manifest-path"
printf '%s\\n' "$OPL_IMAGE_SEED_DIR" > "${tmp}/maintenance-seed-dir"
printf '%s\\n' "$*" >> "${tmp}/maintenance-args"
`
    );
    fs.chmodSync(path.join(fakeBin, 'opl'), 0o755);
    fs.writeFileSync(
      officialProfileBin,
      `#!/usr/bin/env sh
printf '%s\\n' "$*" >> "${tmp}/official-profile-args"
if [ "\${OPL_TEST_PROFILE_FAIL:-}" = "1" ]; then
  printf '%s\\n' '{"official_profile_package_apply":{"status":"failed"}}'
  exit 17
fi
printf '%s\\n' '{"official_profile_package_apply":{"status":"completed"}}'
`
    );
    fs.chmodSync(officialProfileBin, 0o755);
    fs.writeFileSync(
      webBin,
      `#!/usr/bin/env sh
printf '%s\\n' "$*" > "${tmp}/webui-args"
printf '%s\\n' "\${OPL_WEBUI_USERNAME:-}" > "${tmp}/webui-username"
`
    );
    fs.chmodSync(webBin, 0o755);
    return { dataDir, projectsDir, manifestPath, seedDir, webBin, officialProfileBin, fakeBin };
  }

  function writeSlimFixture() {
    const fixture = writeFixture();
    const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.image_profile = 'webui-slim';
    manifest.seed_strategy = 'metadata_only';
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(
      path.join(fixture.seedDir, 'metadata.json'),
      JSON.stringify(
        {
          schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
          strategy: 'metadata_only',
          image_profile: 'webui-slim',
          components: [],
        },
        null,
        2
      ) + '\n'
    );
    return fixture;
  }

  it('preflights writable mounts, validates manifest and seed, runs maintenance, then starts WebUI', () => {
    const fixture = writeFixture();
    const result = spawnSync('sh', [entrypointPath, 'start', '--remote', '--port', '3000'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        AIONUI_DATA_DIR: fixture.dataDir,
        OPL_DATA_DIR: fixture.dataDir,
        OPL_PROJECTS_DIR: fixture.projectsDir,
        OPL_WORKSPACE_ROOT: fixture.projectsDir,
        OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
        OPL_IMAGE_SEED_DIR: fixture.seedDir,
        AIONUI_WEB_BIN: fixture.webBin,
        OPL_OFFICIAL_PROFILE_APPLY_BIN: fixture.officialProfileBin,
      },
    });

    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'maintenance-args'), 'utf8').trim().split(/\r?\n/)).toEqual([
      `system seed-apply --from ${fixture.seedDir} --data-dir ${fixture.dataDir} --projects-dir ${fixture.projectsDir} --json`,
      'system startup-maintenance --scope runtime_substrate --json',
    ]);
    expect(fs.readFileSync(path.join(tmp, 'maintenance-manifest-path'), 'utf8').trim()).toBe(fixture.manifestPath);
    expect(fs.readFileSync(path.join(tmp, 'maintenance-seed-dir'), 'utf8').trim()).toBe(fixture.seedDir);
    expect(fs.readFileSync(path.join(tmp, 'official-profile-args'), 'utf8').trim()).toMatch(
      /^--intent first_install --profile embedded --opl-bin /
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(fixture.dataDir, '.official-profile-first-install-complete'), 'utf8'))
        .official_profile_package_apply.status
    ).toBe('completed');
    expect(fs.readFileSync(path.join(tmp, 'webui-args'), 'utf8').trim()).toBe('start --remote --port 3000');
  });

  it('applies a missing first-install marker once for existing data, then preserves Package choices', () => {
    const fixture = writeFixture();
    fs.mkdirSync(fixture.dataDir, { recursive: true });
    fs.writeFileSync(path.join(fixture.dataDir, 'existing-user.db'), 'preserve\n');
    const env = {
      ...process.env,
      PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      AIONUI_DATA_DIR: fixture.dataDir,
      OPL_DATA_DIR: fixture.dataDir,
      OPL_PROJECTS_DIR: fixture.projectsDir,
      OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
      OPL_IMAGE_SEED_DIR: fixture.seedDir,
      AIONUI_WEB_BIN: fixture.webBin,
      OPL_OFFICIAL_PROFILE_APPLY_BIN: fixture.officialProfileBin,
    };

    const first = spawnSync('sh', [entrypointPath, 'start'], { encoding: 'utf8', env });
    const second = spawnSync('sh', [entrypointPath, 'start'], { encoding: 'utf8', env });

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(second.stderr).toContain('preserving user Package choices');
    expect(fs.readFileSync(path.join(tmp, 'official-profile-args'), 'utf8').trim().split(/\r?\n/)).toHaveLength(1);
    expect(fs.readFileSync(path.join(fixture.dataDir, 'existing-user.db'), 'utf8')).toBe('preserve\n');
  });

  it('records Official Profile failure, starts WebUI, and waits for an explicit retry', () => {
    const fixture = writeFixture();
    const env = {
      ...process.env,
      PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      AIONUI_DATA_DIR: fixture.dataDir,
      OPL_DATA_DIR: fixture.dataDir,
      OPL_PROJECTS_DIR: fixture.projectsDir,
      OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
      OPL_IMAGE_SEED_DIR: fixture.seedDir,
      AIONUI_WEB_BIN: fixture.webBin,
      OPL_OFFICIAL_PROFILE_APPLY_BIN: fixture.officialProfileBin,
      OPL_TEST_PROFILE_FAIL: '1',
    };

    const first = spawnSync('sh', [entrypointPath, 'start'], { encoding: 'utf8', env });
    const second = spawnSync('sh', [entrypointPath, 'start'], { encoding: 'utf8', env });

    expect(first.status).toBe(0);
    expect(first.stderr).toContain('"status":"failed"');
    expect(first.stderr).toContain('Official Profile first-install failed with status 17; continuing WebUI');
    expect(second.status).toBe(0);
    expect(second.stderr).toContain('Official Profile first-install previously failed; waiting for an explicit retry');
    expect(fs.existsSync(path.join(fixture.dataDir, '.official-profile-first-install-complete'))).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(fixture.dataDir, '.official-profile-first-install-attempt-result'), 'utf8'))
        .official_profile_package_apply.status
    ).toBe('failed');
    expect(fs.readFileSync(path.join(tmp, 'official-profile-args'), 'utf8').trim().split(/\r?\n/)).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmp, 'webui-args'), 'utf8').trim()).toBe('start');
  });

  it('skips seed apply for slim metadata-only images and still starts maintenance and WebUI', () => {
    const fixture = writeSlimFixture();

    const result = spawnSync('sh', [entrypointPath, 'start'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        AIONUI_DATA_DIR: fixture.dataDir,
        OPL_DATA_DIR: fixture.dataDir,
        OPL_PROJECTS_DIR: fixture.projectsDir,
        OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
        OPL_IMAGE_SEED_DIR: fixture.seedDir,
        AIONUI_WEB_BIN: fixture.webBin,
        OPL_OFFICIAL_PROFILE_APPLY_BIN: fixture.officialProfileBin,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('slim seed metadata detected; skipping OPL seed apply');
    expect(fs.readFileSync(path.join(tmp, 'maintenance-args'), 'utf8').trim()).toBe(
      'system startup-maintenance --scope runtime_substrate --json'
    );
    expect(fs.existsSync(path.join(tmp, 'official-profile-args'))).toBe(false);
    expect(fs.readFileSync(path.join(tmp, 'webui-args'), 'utf8').trim()).toBe('start');
  });

  it('fails clearly when metadata-only seed is used without the slim image profile', () => {
    const fixture = writeFixture();
    fs.writeFileSync(
      path.join(fixture.seedDir, 'metadata.json'),
      JSON.stringify({ schema: 'dev.onepersonlab.opl-webui-image-seed.v1', strategy: 'metadata_only' }) + '\n'
    );

    const result = spawnSync('sh', [entrypointPath, 'start'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        AIONUI_DATA_DIR: fixture.dataDir,
        OPL_DATA_DIR: fixture.dataDir,
        OPL_PROJECTS_DIR: fixture.projectsDir,
        OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
        OPL_IMAGE_SEED_DIR: fixture.seedDir,
        AIONUI_WEB_BIN: fixture.webBin,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('seed metadata strategy must be payload-capable');
    expect(fs.existsSync(path.join(tmp, 'webui-args'))).toBe(false);
  });

  it('fails closed when a Gateway API key is provided without a WebUI password', () => {
    const fixture = writeFixture();

    const result = spawnSync('sh', [entrypointPath, 'start'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        AIONUI_DATA_DIR: fixture.dataDir,
        OPL_DATA_DIR: fixture.dataDir,
        OPL_PROJECTS_DIR: fixture.projectsDir,
        OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
        OPL_IMAGE_SEED_DIR: fixture.seedDir,
        AIONUI_WEB_BIN: fixture.webBin,
        OPL_GATEWAY_API_KEY: 'sk-test-secret',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cloud WebUI deployment requires OPL_WEBUI_PASSWORD_FILE or OPL_WEBUI_PASSWORD');
    expect(result.stderr).not.toContain('sk-test-secret');
    expect(fs.existsSync(path.join(tmp, 'webui-args'))).toBe(false);
  });

  it('accepts cloud password and Gateway API key secrets without printing secret values', () => {
    const fixture = writeFixture();
    const passwordFile = path.join(tmp, 'webui-password');
    const gatewayKeyFile = path.join(tmp, 'gateway-api-key');
    fs.writeFileSync(passwordFile, 'ConfiguredPassword123\n');
    fs.writeFileSync(gatewayKeyFile, 'sk-test-secret\n');

    const result = spawnSync('sh', [entrypointPath, 'start'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
        AIONUI_DATA_DIR: fixture.dataDir,
        OPL_DATA_DIR: fixture.dataDir,
        OPL_PROJECTS_DIR: fixture.projectsDir,
        OPL_IMAGE_MANIFEST_PATH: fixture.manifestPath,
        OPL_IMAGE_SEED_DIR: fixture.seedDir,
        AIONUI_WEB_BIN: fixture.webBin,
        OPL_OFFICIAL_PROFILE_APPLY_BIN: fixture.officialProfileBin,
        OPL_WEBUI_DEPLOYMENT_MODE: 'cloud',
        OPL_WEBUI_PASSWORD_FILE: passwordFile,
        OPL_GATEWAY_API_KEY_FILE: gatewayKeyFile,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('WebUI password auth configured for username opl');
    expect(result.stderr).toContain('OPL Gateway API key secret detected');
    expect(result.stderr).not.toContain('ConfiguredPassword123');
    expect(result.stderr).not.toContain('sk-test-secret');
    expect(fs.readFileSync(path.join(tmp, 'webui-username'), 'utf8').trim()).toBe('opl');
  });
});

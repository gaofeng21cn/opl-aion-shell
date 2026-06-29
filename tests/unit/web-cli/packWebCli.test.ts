import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  buildOplImageManifest,
  buildOplImageSeedMetadata,
  copyBundledAioncoreForTarball,
  writeOplImageResources,
} = require('../../../scripts/pack-web-cli.js');

describe('pack-web-cli OPL image resources', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-web-pack-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps Docker OPL shim as a direct executable wrapper', () => {
    const dockerfile = fs.readFileSync(path.join(__dirname, '../../../Dockerfile'), 'utf8');

    expect(dockerfile).toContain('exec /opt/opl/seed/payload/opl_framework/bin/opl "$@"');
    expect(dockerfile).not.toContain('exec node /opt/opl/seed/payload/opl_framework/bin/opl "$@"');
  });

  it('builds the Docker/WebUI image manifest contract', () => {
    expect(
      buildOplImageManifest({
        packageName: '@aionui/web-cli',
        version: '2.1.17',
        runtimeKey: 'linux-x64',
      })
    ).toMatchObject({
      schema: 'dev.onepersonlab.opl-webui-image-manifest.v1',
      image_role: 'opl_webui_runtime_image',
      image_profile: 'webui-full',
      base_image_family: 'node:22-bookworm-slim',
      webui_package: { name: '@aionui/web-cli', version: '2.1.17' },
      bundled_aioncore: { platforms: ['linux-x64'], path: 'bundled-aioncore' },
      bootstrap: { path: 'opl-install.sh' },
      data_dir: '/data',
      projects_dir: '/projects',
      seed_strategy: 'payload_manifest',
      seed_dir: '/opt/opl/seed',
      seed_metadata: '/opt/opl/seed/metadata.json',
      environment: {
        OPL_IMAGE_MANIFEST_PATH: '/opt/opl/image-manifest.json',
        OPL_IMAGE_SEED_DIR: '/opt/opl/seed',
        OPL_DATA_DIR: '/data',
        OPL_PROJECTS_DIR: '/projects',
        OPL_WORKSPACE_ROOT: '/projects',
      },
    });
  });

  it('builds slim Docker/WebUI image manifest and metadata without seed payload components', () => {
    const manifest = buildOplImageManifest({
      packageName: '@aionui/web-cli',
      version: '2.1.17',
      runtimeKey: 'linux-x64',
      profile: 'webui-slim',
    });
    const seed = buildOplImageSeedMetadata({ version: '2.1.17', profile: 'webui-slim' });

    expect(manifest).toMatchObject({
      image_profile: 'webui-slim',
      seed_strategy: 'metadata_only',
      data_dir: '/data',
      projects_dir: '/projects',
    });
    expect(seed).toMatchObject({
      strategy: 'metadata_only',
      image_profile: 'webui-slim',
      components: [],
      data_dir: '/data',
      projects_dir: '/projects',
    });
  });

  it('writes manifest, seed metadata, and executable entrypoint into staging', () => {
    const projectRoot = path.join(tmp, 'repo');
    const tarballContentDir = path.join(tmp, 'staging', 'aionui-web');
    fs.mkdirSync(path.join(projectRoot, 'resources'), { recursive: true });
    fs.mkdirSync(tarballContentDir, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'resources', 'opl-webui-entrypoint.sh'), '#!/usr/bin/env sh\n');

    writeOplImageResources({
      projectRoot,
      tarballContentDir,
      srcPkg: { name: '@aionui/web-cli' },
      version: '2.1.17',
      runtimeKey: 'linux-x64',
    });

    const manifest = JSON.parse(fs.readFileSync(path.join(tarballContentDir, 'opl-image-manifest.json'), 'utf8'));
    const seed = JSON.parse(fs.readFileSync(path.join(tarballContentDir, 'opl-image-seed', 'metadata.json'), 'utf8'));
    const entrypointMode = fs.statSync(path.join(tarballContentDir, 'opl-webui-entrypoint.sh')).mode & 0o777;

    expect(manifest.bundled_aioncore.platforms).toEqual(['linux-x64']);
    expect(seed).toEqual(buildOplImageSeedMetadata({ version: '2.1.17' }));
    expect(seed.components.map((component: { id: string }) => component.id).sort()).toEqual([
      'codex_cli',
      'companion_skills',
      'domain_modules',
      'opl_framework',
    ]);
    expect(seed.full_profile.components).toEqual(seed.components);
    expect(fs.statSync(path.join(tarballContentDir, 'opl-image-seed', 'payload')).isDirectory()).toBe(true);
    expect(entrypointMode).toBe(0o755);
  });

  it('copies a Framework-provided seed metadata and payload directory when present', () => {
    const projectRoot = path.join(tmp, 'repo');
    const tarballContentDir = path.join(tmp, 'staging', 'aionui-web');
    const seedSourceDir = path.join(projectRoot, 'resources', 'opl-image-seed');
    fs.mkdirSync(path.join(seedSourceDir, 'payload', 'framework'), { recursive: true });
    fs.mkdirSync(tarballContentDir, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'resources', 'opl-webui-entrypoint.sh'), '#!/usr/bin/env sh\n');
    const components = [
      {
        id: 'opl_framework',
        version: 'framework-ref',
        source: 'framework-lane',
        payload_path: 'payload/framework/seed.json',
        receipt_kind: 'framework_seed_payload_receipt',
        source_fingerprint: 'sha256:framework',
      },
    ];
    fs.writeFileSync(
      path.join(seedSourceDir, 'metadata.json'),
      JSON.stringify(
        {
          schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
          strategy: 'payload_preheated',
          components,
          full_profile: { components },
          payload_dir: 'payload',
        },
        null,
        2
      ) + '\n'
    );
    fs.writeFileSync(path.join(seedSourceDir, 'payload', 'framework', 'seed.json'), '{"ok":true}\n');

    writeOplImageResources({
      projectRoot,
      tarballContentDir,
      srcPkg: { name: '@aionui/web-cli' },
      version: '2.1.17',
      runtimeKey: 'linux-x64',
    });

    const seed = JSON.parse(fs.readFileSync(path.join(tarballContentDir, 'opl-image-seed', 'metadata.json'), 'utf8'));
    expect(seed.strategy).toBe('payload_preheated');
    expect(seed.full_profile.components[0].source_fingerprint).toBe('sha256:framework');
    expect(
      fs.readFileSync(path.join(tarballContentDir, 'opl-image-seed', 'payload', 'framework', 'seed.json'), 'utf8')
    ).toBe('{"ok":true}\n');
  });

  it('preserves preheated full seed payload integrity fields', () => {
    const projectRoot = path.join(tmp, 'repo');
    const tarballContentDir = path.join(tmp, 'staging', 'aionui-web');
    const seedSourceDir = path.join(projectRoot, 'resources', 'opl-image-seed');
    fs.mkdirSync(path.join(seedSourceDir, 'payload', 'opl_framework', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(seedSourceDir, 'payload', 'codex_cli', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(seedSourceDir, 'payload', 'companion_skills'), { recursive: true });
    fs.mkdirSync(path.join(seedSourceDir, 'payload', 'domain_modules'), { recursive: true });
    fs.mkdirSync(tarballContentDir, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'resources', 'opl-webui-entrypoint.sh'), '#!/usr/bin/env sh\n');
    fs.writeFileSync(path.join(seedSourceDir, 'payload', 'opl_framework', 'bin', 'opl'), '#!/usr/bin/env sh\n');
    fs.writeFileSync(path.join(seedSourceDir, 'payload', 'codex_cli', 'bin', 'codex'), '#!/usr/bin/env sh\n');
    fs.writeFileSync(path.join(seedSourceDir, 'payload', 'companion_skills', 'index.json'), '{}\n');
    fs.writeFileSync(path.join(seedSourceDir, 'payload', 'domain_modules', 'README.txt'), 'managed\n');
    const components = ['opl_framework', 'codex_cli', 'companion_skills', 'domain_modules'].map((id) => ({
      id,
      version: '2.1.17',
      source: 'image_preheated_payload',
      payload_path: `payload/${id}`,
      receipt_kind: `${id}_seed_payload_receipt`,
      sha256: `sha256-${id}`,
      size_bytes: 12,
    }));
    fs.writeFileSync(
      path.join(seedSourceDir, 'metadata.json'),
      JSON.stringify(
        {
          schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
          strategy: 'payload_preheated',
          components,
          full_profile: { components },
          payload_dir: 'payload',
        },
        null,
        2
      ) + '\n'
    );

    writeOplImageResources({
      projectRoot,
      tarballContentDir,
      srcPkg: { name: '@aionui/web-cli' },
      version: '2.1.17',
      runtimeKey: 'linux-x64',
    });

    const seed = JSON.parse(fs.readFileSync(path.join(tarballContentDir, 'opl-image-seed', 'metadata.json'), 'utf8'));
    expect(seed.strategy).toBe('payload_preheated');
    expect(seed.components).toHaveLength(4);
    for (const entry of seed.components) {
      expect(entry.sha256).toMatch(/^sha256-/);
      expect(entry.size_bytes).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(tarballContentDir, 'opl-image-seed', entry.payload_path))).toBe(true);
    }
  });

  it.skipIf(process.platform === 'win32')(
    'relativizes preheated seed payload symlinks for Docker runtime relocation',
    () => {
      const projectRoot = path.join(tmp, 'repo');
      const payloadDir = path.join(projectRoot, 'resources', 'opl-image-seed', 'payload');
      const frameworkBinDir = path.join(payloadDir, 'opl_framework', 'bin');
      const frameworkTargetDir = path.join(payloadDir, 'opl_framework', 'node_modules', 'acorn', 'bin');
      const codexBinDir = path.join(payloadDir, 'codex_cli', 'bin');
      const companionDir = path.join(payloadDir, 'companion_skills');
      const modulesDir = path.join(payloadDir, 'domain_modules');
      fs.mkdirSync(projectRoot, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ version: '2.1.17' }) + '\n');
      fs.mkdirSync(frameworkBinDir, { recursive: true });
      fs.mkdirSync(frameworkTargetDir, { recursive: true });
      fs.mkdirSync(codexBinDir, { recursive: true });
      fs.mkdirSync(companionDir, { recursive: true });
      fs.mkdirSync(modulesDir, { recursive: true });
      fs.writeFileSync(path.join(frameworkTargetDir, 'acorn'), '#!/usr/bin/env node\n');
      fs.symlinkSync(path.join(frameworkTargetDir, 'acorn'), path.join(frameworkBinDir, 'acorn'));
      fs.writeFileSync(path.join(codexBinDir, 'codex'), '#!/usr/bin/env sh\n');
      fs.writeFileSync(path.join(companionDir, 'index.json'), '{}\n');
      fs.writeFileSync(path.join(modulesDir, 'README.txt'), 'managed\n');

      const result = require('node:child_process').spawnSync(
        'node',
        [path.join(__dirname, '../../../scripts/prepare-opl-image-seed.js')],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            OPL_IMAGE_SEED_PROJECT_ROOT: projectRoot,
          },
          encoding: 'utf8',
        }
      );

      expect(result.status).toBe(0);
      const link = fs.readlinkSync(path.join(frameworkBinDir, 'acorn'));
      expect(path.isAbsolute(link)).toBe(false);
      expect(fs.realpathSync(path.join(frameworkBinDir, 'acorn'))).toBe(
        fs.realpathSync(path.join(frameworkTargetDir, 'acorn'))
      );
      const seed = JSON.parse(
        fs.readFileSync(path.join(projectRoot, 'resources', 'opl-image-seed', 'metadata.json'), 'utf8')
      );
      expect(seed.components.find((entry: { id: string }) => entry.id === 'opl_framework').sha256).toMatch(
        /^[a-f0-9]{64}$/
      );
    }
  );

  it.skipIf(process.platform === 'win32')(
    'keeps copied preheated seed payload symlinks relocatable in the web-cli staging dir',
    () => {
      const projectRoot = path.join(tmp, 'repo');
      const tarballContentDir = path.join(tmp, 'staging', 'aionui-web');
      const seedSourceDir = path.join(projectRoot, 'resources', 'opl-image-seed');
      const payloadDir = path.join(seedSourceDir, 'payload');
      const frameworkBinDir = path.join(payloadDir, 'opl_framework', 'bin');
      const frameworkTargetDir = path.join(payloadDir, 'opl_framework', 'node_modules', 'acorn', 'bin');
      fs.mkdirSync(frameworkBinDir, { recursive: true });
      fs.mkdirSync(frameworkTargetDir, { recursive: true });
      fs.mkdirSync(path.join(payloadDir, 'codex_cli', 'bin'), { recursive: true });
      fs.mkdirSync(path.join(payloadDir, 'companion_skills'), { recursive: true });
      fs.mkdirSync(path.join(payloadDir, 'domain_modules'), { recursive: true });
      fs.mkdirSync(tarballContentDir, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'resources', 'opl-webui-entrypoint.sh'), '#!/usr/bin/env sh\n');
      fs.writeFileSync(path.join(frameworkTargetDir, 'acorn'), '#!/usr/bin/env node\n');
      fs.symlinkSync(path.join(frameworkTargetDir, 'acorn'), path.join(frameworkBinDir, 'acorn'));
      fs.writeFileSync(path.join(payloadDir, 'codex_cli', 'bin', 'codex'), '#!/usr/bin/env sh\n');
      fs.writeFileSync(path.join(payloadDir, 'companion_skills', 'index.json'), '{}\n');
      fs.writeFileSync(path.join(payloadDir, 'domain_modules', 'README.txt'), 'managed\n');
      fs.writeFileSync(
        path.join(seedSourceDir, 'metadata.json'),
        JSON.stringify({
          schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
          strategy: 'payload_preheated',
          components: [],
          full_profile: { components: [] },
          payload_dir: 'payload',
        }) + '\n'
      );

      writeOplImageResources({
        projectRoot,
        tarballContentDir,
        srcPkg: { name: '@aionui/web-cli' },
        version: '2.1.17',
        runtimeKey: 'linux-x64',
      });

      const stagedLinkPath = path.join(tarballContentDir, 'opl-image-seed', 'payload', 'opl_framework', 'bin', 'acorn');
      const stagedLink = fs.readlinkSync(stagedLinkPath);
      expect(path.isAbsolute(stagedLink)).toBe(false);
      expect(fs.realpathSync(stagedLinkPath)).toBe(
        fs.realpathSync(
          path.join(
            tarballContentDir,
            'opl-image-seed',
            'payload',
            'opl_framework',
            'node_modules',
            'acorn',
            'bin',
            'acorn'
          )
        )
      );
    }
  );

  it('ignores Framework-provided payloads for slim image resources', () => {
    const projectRoot = path.join(tmp, 'repo');
    const tarballContentDir = path.join(tmp, 'staging', 'aionui-web');
    const seedSourceDir = path.join(projectRoot, 'resources', 'opl-image-seed');
    fs.mkdirSync(path.join(seedSourceDir, 'payload', 'framework'), { recursive: true });
    fs.mkdirSync(tarballContentDir, { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'resources', 'opl-webui-entrypoint.sh'), '#!/usr/bin/env sh\n');
    fs.writeFileSync(
      path.join(seedSourceDir, 'metadata.json'),
      JSON.stringify({ schema: 'dev.onepersonlab.opl-webui-image-seed.v1', strategy: 'payload_preheated' }) + '\n'
    );

    writeOplImageResources({
      projectRoot,
      tarballContentDir,
      srcPkg: { name: '@aionui/web-cli' },
      version: '2.1.17',
      runtimeKey: 'linux-x64',
      profile: 'webui-slim',
    });

    const manifest = JSON.parse(fs.readFileSync(path.join(tarballContentDir, 'opl-image-manifest.json'), 'utf8'));
    const seed = JSON.parse(fs.readFileSync(path.join(tarballContentDir, 'opl-image-seed', 'metadata.json'), 'utf8'));
    expect(manifest.image_profile).toBe('webui-slim');
    expect(manifest.seed_strategy).toBe('metadata_only');
    expect(seed.strategy).toBe('metadata_only');
    expect(seed.components).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('copies bundled aioncore with relocatable managed Node npm symlinks', () => {
    const backendSrc = path.join(tmp, 'repo', 'resources', 'bundled-aioncore', 'linux-arm64');
    const backendDest = path.join(tmp, 'staging', 'aionui-web', 'bundled-aioncore', 'linux-arm64');
    const srcNodeRoot = path.join(backendSrc, 'managed-resources', 'node', 'node-v24.11.0-linux-arm64');
    const destNodeRoot = path.join(backendDest, 'managed-resources', 'node', 'node-v24.11.0-linux-arm64');

    fs.mkdirSync(path.join(srcNodeRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(srcNodeRoot, 'lib', 'node_modules', 'npm', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(srcNodeRoot, 'bin', 'node'), 'node');
    fs.writeFileSync(path.join(srcNodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'npm');
    fs.symlinkSync(
      path.join(srcNodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(srcNodeRoot, 'bin', 'npm')
    );

    copyBundledAioncoreForTarball({ backendSrc, backendDest });

    expect(fs.readlinkSync(path.join(destNodeRoot, 'bin', 'npm'))).toBe('../lib/node_modules/npm/bin/npm-cli.js');
    expect(fs.realpathSync(path.join(destNodeRoot, 'bin', 'npm'))).toBe(
      fs.realpathSync(path.join(destNodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
    );
  });
});

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
      base_image_family: 'node:22-bookworm-slim',
      webui_package: { name: '@aionui/web-cli', version: '2.1.17' },
      bundled_aioncore: { platforms: ['linux-x64'], path: 'bundled-aioncore' },
      bootstrap: { path: 'opl-install.sh' },
      data_dir: '/data',
      projects_dir: '/projects',
      seed_strategy: 'metadata_only',
      seed_dir: 'opl-image-seed',
      environment: {
        OPL_IMAGE_MANIFEST_PATH: '/app/aionui-web/opl-image-manifest.json',
        OPL_IMAGE_SEED_DIR: '/app/aionui-web/opl-image-seed',
        OPL_DATA_DIR: '/data',
        OPL_PROJECTS_DIR: '/projects',
        OPL_WORKSPACE_ROOT: '/projects',
      },
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
    expect(seed).toEqual(buildOplImageSeedMetadata());
    expect(entrypointMode).toBe(0o755);
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

    expect(fs.readlinkSync(path.join(destNodeRoot, 'bin', 'npm'))).toBe(
      '../lib/node_modules/npm/bin/npm-cli.js'
    );
    expect(fs.realpathSync(path.join(destNodeRoot, 'bin', 'npm'))).toBe(
      fs.realpathSync(path.join(destNodeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
    );
  });
});

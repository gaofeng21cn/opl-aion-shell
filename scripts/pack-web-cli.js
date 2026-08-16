#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { normalizeInternalSymlinks, prepareAioncore } = require('../packages/shared-scripts/src/prepare-aioncore.js');
const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function buildNativeWebuiArtifactMetadata({ version, platform, arch, tarballName, sha256 }) {
  return {
    schema: 'dev.onepersonlab.opl-native-webui-artifact.v1',
    owner: 'one-person-lab-app',
    producer: 'opl-aion-shell',
    artifact_role: 'opl_native_webui_runtime',
    runtime_form: 'native_webui',
    version,
    platform,
    architecture: arch,
    entrypoint: 'aionui-web',
    bootstrap_entrypoint: 'opl-install.sh',
    official_profile_entrypoint: 'opl-official-profile-apply',
    container_adapter: 'opl-webui-entrypoint.sh',
    tarball: tarballName,
    sha256,
  };
}

function serializeNativeWebuiArtifactMetadata(metadata) {
  const lines = [
    `${metadata.sha256}  ${metadata.tarball}`,
    `schema=${metadata.schema}`,
    `owner=${metadata.owner}`,
    `producer=${metadata.producer}`,
    `artifact_role=${metadata.artifact_role}`,
    `runtime_form=${metadata.runtime_form}`,
    `version=${metadata.version}`,
    `platform=${metadata.platform}`,
    `architecture=${metadata.architecture}`,
    `entrypoint=${metadata.entrypoint}`,
    `bootstrap_entrypoint=${metadata.bootstrap_entrypoint}`,
    `official_profile_entrypoint=${metadata.official_profile_entrypoint}`,
    `container_adapter=${metadata.container_adapter}`,
    `tarball=${metadata.tarball}`,
    `sha256=${metadata.sha256}`,
  ];
  return `${lines.join('\n')}\n`;
}

function copySeedSourceIfPresent(projectRoot, seedDir) {
  const sourceDir = path.join(projectRoot, 'resources', 'opl-image-seed');
  if (!fs.existsSync(sourceDir)) return false;
  if (!fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`OPL image seed source must be a directory: ${sourceDir}`);
  }
  fs.cpSync(sourceDir, seedDir, { recursive: true });
  return true;
}

function normalizeSeedPayloadSymlinks(payloadDir, sourceRootDir = payloadDir) {
  if (!fs.existsSync(payloadDir)) return;
  normalizeInternalSymlinks(payloadDir, { sourceRootDir });
  const stack = [payloadDir];
  let broken = '';
  while (stack.length > 0 && !broken) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(current);
      const resolved = path.resolve(path.dirname(current), target);
      if (!fs.existsSync(resolved)) broken = current;
    }
  }
  if (broken) {
    throw new Error(`OPL image seed payload contains broken symlink after relocation: ${broken}`);
  }
}

function buildSeedComponent(id, version) {
  return {
    id,
    version,
    source: 'image_manifest',
    payload_path: `payload/${id}`,
    receipt_kind: `${id}_seed_payload_receipt`,
    source_fingerprint: `opl-webui-seed:${id}:${version}`,
  };
}

function normalizeOplWebuiImageProfile(value) {
  if (!value || value === 'webui-full' || value === 'full') return 'webui-full';
  if (value === 'webui-slim' || value === 'slim') return 'webui-slim';
  throw new Error(`Unsupported OPL WebUI image profile: ${value}`);
}

function buildOplImageSeedMetadata({ version = '0.0.0', profile = 'webui-full' } = {}) {
  const normalizedProfile = normalizeOplWebuiImageProfile(profile);
  if (normalizedProfile === 'webui-slim') {
    return {
      schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
      strategy: 'metadata_only',
      image_profile: 'webui-slim',
      applies_to: 'docker-webui-runtime-image',
      data_dir: '/data',
      projects_dir: '/projects',
      components: [],
      slim_profile: {
        components: [],
        note: 'Slim WebUI images contain the browser entrypoint, AionCore, bootstrap, and metadata only. OPL fills runtime components through startup maintenance.',
      },
      note: 'Slim seed metadata is for developer/CI images and must not be promoted as stable/latest beginner default.',
    };
  }
  const components = [
    buildSeedComponent('opl_framework', version),
    buildSeedComponent('codex_cli', version),
    buildSeedComponent('companion_skills', version),
    buildSeedComponent('domain_modules', version),
  ];
  return {
    schema: 'dev.onepersonlab.opl-webui-image-seed.v1',
    strategy: 'payload_manifest',
    image_profile: 'webui-full',
    applies_to: 'docker-webui-runtime-image',
    data_dir: '/data',
    projects_dir: '/projects',
    components,
    full_profile: {
      components,
    },
    payload_dir: 'payload',
    note: 'Framework seed application is owned by OPL. This package exposes a stable manifest plus payload directory for Framework-owned payloads.',
  };
}

function buildOplImageManifest({ packageName, version, runtimeKey, profile = 'webui-full' }) {
  const normalizedProfile = normalizeOplWebuiImageProfile(profile);
  const isSlim = normalizedProfile === 'webui-slim';
  return {
    schema: 'dev.onepersonlab.opl-webui-image-manifest.v1',
    image_role: 'opl_webui_runtime_image',
    image_profile: normalizedProfile,
    base_image_family: 'node:22-bookworm-slim',
    webui_package: {
      name: packageName,
      version,
    },
    bundled_aioncore: {
      platforms: [runtimeKey],
      path: 'bundled-aioncore',
    },
    bootstrap: {
      path: 'opl-install.sh',
      mode: 'standard_complete_without_modules',
    },
    data_dir: '/data',
    projects_dir: '/projects',
    seed_strategy: isSlim ? 'metadata_only' : 'payload_manifest',
    seed_dir: '/opt/opl/seed',
    seed_metadata: '/opt/opl/seed/metadata.json',
    environment: {
      OPL_IMAGE_MANIFEST_PATH: '/opt/opl/image-manifest.json',
      OPL_IMAGE_SEED_DIR: '/opt/opl/seed',
      OPL_DATA_DIR: '/data',
      OPL_PROJECTS_DIR: '/projects',
      OPL_WORKSPACE_ROOT: '/projects',
    },
  };
}

function writeOplImageResources({
  projectRoot,
  tarballContentDir,
  srcPkg,
  version,
  runtimeKey,
  profile = 'webui-full',
}) {
  const normalizedProfile = normalizeOplWebuiImageProfile(profile);
  const seedDir = path.join(tarballContentDir, 'opl-image-seed');
  const seedPayloadDir = path.join(seedDir, 'payload');
  fs.mkdirSync(seedDir, { recursive: true });
  const copiedSeedSource = normalizedProfile === 'webui-full' && copySeedSourceIfPresent(projectRoot, seedDir);
  fs.mkdirSync(seedPayloadDir, { recursive: true });
  if (copiedSeedSource) {
    normalizeSeedPayloadSymlinks(seedPayloadDir, path.join(projectRoot, 'resources', 'opl-image-seed', 'payload'));
  }
  if (!copiedSeedSource || !fs.existsSync(path.join(seedDir, 'metadata.json'))) {
    writeJson(path.join(seedDir, 'metadata.json'), buildOplImageSeedMetadata({ version, profile: normalizedProfile }));
  }
  writeJson(
    path.join(tarballContentDir, 'opl-image-manifest.json'),
    buildOplImageManifest({ packageName: srcPkg.name, version, runtimeKey, profile: normalizedProfile })
  );

  fs.copyFileSync(
    path.join(projectRoot, 'resources', 'opl-webui-entrypoint.sh'),
    path.join(tarballContentDir, 'opl-webui-entrypoint.sh')
  );
  fs.chmodSync(path.join(tarballContentDir, 'opl-webui-entrypoint.sh'), 0o755);
}

function copyBundledAioncoreForTarball({ backendSrc, backendDest }) {
  fs.mkdirSync(path.dirname(backendDest), { recursive: true });
  fs.cpSync(backendSrc, backendDest, { recursive: true });
  normalizeInternalSymlinks(backendDest, { sourceRootDir: backendSrc });
}

function readOfficialProfileRoots(projectRoot) {
  const profilePath = path.join(
    projectRoot,
    'packages/desktop/src/common/config/oplProductProfile/oplProductProfile.generated.json'
  );
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const roots = profile?.official_profile?.desired_root_package_ids;
  if (!Array.isArray(roots) || roots.length === 0 || roots.some((root) => typeof root !== 'string' || !root.trim())) {
    throw new Error(`Official Profile desired roots are invalid: ${profilePath}`);
  }
  return [...new Set(roots.map((root) => root.trim()))];
}

function buildOfficialProfileApplyHelper({ projectRoot, stagingDir, executablePath, bunTarget }) {
  const sourceRoot = path.join(stagingDir, 'official-profile-helper-src');
  const profileContractDir = path.join(sourceRoot, 'app-product-profile');
  fs.mkdirSync(profileContractDir, { recursive: true });
  fs.copyFileSync(
    path.join(projectRoot, 'resources', 'official-profile-package-apply.ts'),
    path.join(sourceRoot, 'official-profile-package-apply.ts')
  );
  const roots = readOfficialProfileRoots(projectRoot);
  fs.writeFileSync(
    path.join(profileContractDir, 'profile-contract.ts'),
    `export function readAppProductProfile() { return ${JSON.stringify({
      official_profile: {
        apply_on: ['first_install', 'explicit_restore'],
        desired_root_package_ids: roots,
      },
    })}; }\n`
  );
  execFileSync(
    'bun',
    [
      'build',
      '--compile',
      `--target=${bunTarget}`,
      `--outfile=${executablePath}`,
      path.join(sourceRoot, 'official-profile-package-apply.ts'),
    ],
    { cwd: projectRoot, stdio: 'inherit' }
  );
}

if (require.main !== module) {
  module.exports = {
    buildNativeWebuiArtifactMetadata,
    buildOplImageManifest,
    buildOplImageSeedMetadata,
    copySeedSourceIfPresent,
    copyBundledAioncoreForTarball,
    buildOfficialProfileApplyHelper,
    normalizeSeedPayloadSymlinks,
    normalizeOplWebuiImageProfile,
    readOfficialProfileRoots,
    serializeNativeWebuiArtifactMetadata,
    writeOplImageResources,
  };
  return;
}

const projectRoot = path.resolve(__dirname, '..');
const platform = process.env.PACK_PLATFORM || process.platform;
const arch = process.env.PACK_ARCH || process.arch;
const version = require('../package.json').version;
const imageProfile = normalizeOplWebuiImageProfile(process.env.OPL_WEBUI_IMAGE_PROFILE);

// Normalize platform/arch names for tarball filename
const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'win' };
const archMap = { arm64: 'arm64', x64: 'x86_64', ia32: 'x86' };
const normalizedPlatform = platformMap[platform] || platform;
const normalizedArch = archMap[arch] || arch;

const tarballName = `one-person-lab-webui-${version}-${normalizedPlatform}-${normalizedArch}.tar.gz`;
const distDir = path.join(projectRoot, 'dist-web-cli');
const tarballPath = path.join(distDir, tarballName);

console.log(`Packing web-cli for ${platform}-${arch}...`);

// 1. Prepare bundled-aioncore
console.log('1. Preparing aioncore...');
prepareAioncore({
  projectRoot,
  platform,
  arch,
  version: resolveAioncoreVersion(projectRoot),
});

// 2. Create staging dir
console.log('3. Creating staging dir...');
const stagingDir = path.join(distDir, 'staging');
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

const tarballContentDir = path.join(stagingDir, 'aionui-web');
fs.mkdirSync(tarballContentDir, { recursive: true });

// 4. Compile web-cli into a standalone executable with bun
// Produces a single binary (~100MB) that bundles bun runtime + all deps, so
// the tarball has no node_modules and the user needs no Node installation.
console.log('4. Compiling web-cli into standalone executable...');
// Map our platform/arch to bun's --target naming
const bunTargetPlatform = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[platform] || platform;
const bunTargetArch = { arm64: 'arm64', x64: 'x64', ia32: 'x64' }[arch] || arch;
const bunTarget = `bun-${bunTargetPlatform}-${bunTargetArch}`;
const executableName = platform === 'win32' ? 'aionui-web.exe' : 'aionui-web';
const executablePath = path.join(tarballContentDir, executableName);
const webCliEntry = path.join(projectRoot, 'packages/web-cli/src/index.ts');
execFileSync('bun', ['build', '--compile', `--target=${bunTarget}`, `--outfile=${executablePath}`, webCliEntry], {
  cwd: projectRoot,
  stdio: 'inherit',
});
console.log(`  → ${executablePath}`);

// 5. Copy package.json with repo-root version stamped in (for runtime lookup)
// The source packages/web-cli/package.json is pinned to "0.0.0" as a workspace
// package and never gets bumped; stamping the real repo version here lets
// `aionui-web version` match the tarball filename.
const srcPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'packages/web-cli/package.json'), 'utf8'));
srcPkg.version = version;
fs.writeFileSync(path.join(tarballContentDir, 'package.json'), JSON.stringify(srcPkg, null, 2) + '\n');

// 6. Copy static files (SPA) from desktop renderer build output
// Note: electron-vite writes to the repo-root `out/`, NOT packages/desktop/out/
console.log('6. Copying static files...');
const rendererOutDir = path.join(projectRoot, 'out/renderer');
const staticDest = path.join(tarballContentDir, 'static');
if (fs.existsSync(rendererOutDir)) {
  fs.cpSync(rendererOutDir, staticDest, { recursive: true });
} else {
  throw new Error(`Desktop renderer output not found at ${rendererOutDir}. Run bunx electron-vite build first.`);
}

// 7. Copy bundled-aioncore
const runtimeKey = `${platform}-${arch}`;
const backendSrc = path.join(projectRoot, 'resources/bundled-aioncore', runtimeKey);
const backendDest = path.join(tarballContentDir, 'bundled-aioncore', runtimeKey);
if (!fs.existsSync(backendSrc)) {
  throw new Error(`Backend bundle dir missing at ${backendSrc}. Ensure prepareAioncore succeeded.`);
}
copyBundledAioncoreForTarball({ backendSrc, backendDest });

// 8. Copy the standard OPL bootstrap installer used by Docker/WebUI first-run.
const oplInstallerSrc = path.join(projectRoot, 'resources', 'opl-install.sh');
if (!fs.existsSync(oplInstallerSrc)) {
  throw new Error(
    `OPL bootstrap installer missing at ${oplInstallerSrc}. Run the App release payload preparation first.`
  );
}
fs.copyFileSync(oplInstallerSrc, path.join(tarballContentDir, 'opl-install.sh'));
fs.chmodSync(path.join(tarballContentDir, 'opl-install.sh'), 0o755);
const officialProfileExecutable =
  platform === 'win32' ? 'opl-official-profile-apply.exe' : 'opl-official-profile-apply';
buildOfficialProfileApplyHelper({
  projectRoot,
  stagingDir,
  executablePath: path.join(tarballContentDir, officialProfileExecutable),
  bunTarget,
});
writeOplImageResources({ projectRoot, tarballContentDir, srcPkg, version, runtimeKey, profile: imageProfile });

// 9. Create tarball
fs.mkdirSync(distDir, { recursive: true });
execFileSync('tar', ['-czf', path.basename(tarballPath), '-C', stagingDir, 'aionui-web'], {
  cwd: path.dirname(tarballPath),
  stdio: 'inherit',
});

console.log(`✅ Tarball created: ${tarballPath}`);

// 10. Generate the checksum plus OPL-owned immutable artifact identity.
const checksumPath = `${tarballPath}.sha256`;
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(tarballPath));
const digest = hash.digest('hex');
const artifactMetadata = buildNativeWebuiArtifactMetadata({
  version,
  platform: normalizedPlatform,
  arch: normalizedArch,
  tarballName: path.basename(tarballPath),
  sha256: digest,
});
fs.writeFileSync(checksumPath, serializeNativeWebuiArtifactMetadata(artifactMetadata));
console.log(`✅ OPL artifact metadata created: ${checksumPath}`);

console.log('Done!');

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const {
  buildNativeWebuiArtifactMetadata,
  serializeNativeWebuiArtifactMetadata,
} = require('../../../scripts/pack-web-cli.js');

const repoRoot = path.resolve(__dirname, '../../..');
const installerPath = path.join(repoRoot, 'scripts', 'install-web.sh');

describe.skipIf(process.platform === 'win32')('OPL Native WebUI distribution', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-webui-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function createArtifact(
    metadataOwner = 'one-person-lab-app',
    version = '9.8.7'
  ): {
    home: string;
    mirror: string;
    version: string;
  } {
    const home = path.join(tmp, 'home');
    const mirrorRoot = path.join(tmp, 'mirror');
    const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
    const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    const tarballName = `one-person-lab-webui-${version}-${platform}-${architecture}.tar.gz`;
    const releaseDir = path.join(mirrorRoot, `v${version}`);
    const payloadRoot = path.join(tmp, 'payload', 'aionui-web');
    fs.mkdirSync(payloadRoot, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(releaseDir, { recursive: true });
    fs.writeFileSync(path.join(payloadRoot, 'aionui-web'), `#!/usr/bin/env sh\nprintf '${version}\\n'\n`);
    fs.chmodSync(path.join(payloadRoot, 'aionui-web'), 0o755);
    fs.writeFileSync(path.join(payloadRoot, 'package.json'), `${JSON.stringify({ version })}\n`);
    fs.writeFileSync(
      path.join(payloadRoot, 'opl-install.sh'),
      '#!/usr/bin/env sh\nprintf "%s\\n" "$*" >> "$OPL_TEST_BOOTSTRAP_LOG"\nmkdir -p "$HOME/.local/bin"\n'
    );
    fs.chmodSync(path.join(payloadRoot, 'opl-install.sh'), 0o755);
    fs.writeFileSync(
      path.join(payloadRoot, 'opl-official-profile-apply'),
      '#!/usr/bin/env sh\nprintf "%s\\n" "$*" >> "$OPL_TEST_PROFILE_LOG"\n[ "${OPL_TEST_PROFILE_FAIL:-0}" != "1" ]\n'
    );
    fs.chmodSync(path.join(payloadRoot, 'opl-official-profile-apply'), 0o755);
    const tarballPath = path.join(releaseDir, tarballName);
    const tarResult = spawnSync('tar', ['-czf', tarballPath, '-C', path.dirname(payloadRoot), 'aionui-web'], {
      encoding: 'utf8',
    });
    expect(tarResult.status).toBe(0);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(tarballPath)).digest('hex');
    const metadata = buildNativeWebuiArtifactMetadata({
      version,
      platform,
      arch: architecture,
      tarballName,
      sha256,
    });
    metadata.owner = metadataOwner;
    fs.writeFileSync(`${tarballPath}.sha256`, serializeNativeWebuiArtifactMetadata(metadata));
    const fakeOpl = path.join(home, '.local', 'bin', 'opl');
    fs.mkdirSync(path.dirname(fakeOpl), { recursive: true });
    fs.writeFileSync(fakeOpl, '#!/usr/bin/env sh\nexit 0\n');
    fs.chmodSync(fakeOpl, 0o755);
    return { home, mirror: `file://${mirrorRoot}`, version };
  }

  function installArtifact(fixture: ReturnType<typeof createArtifact>, extraEnv: NodeJS.ProcessEnv = {}) {
    const bootstrapLog = path.join(tmp, 'bootstrap.log');
    const profileLog = path.join(tmp, 'profile.log');
    const result = spawnSync(
      'bash',
      [installerPath, '--mirror', fixture.mirror, '--version', fixture.version, '--no-path'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixture.home,
          SHELL: '/bin/bash',
          OPL_TEST_BOOTSTRAP_LOG: bootstrapLog,
          OPL_TEST_PROFILE_LOG: profileLog,
          ...extraEnv,
        },
      }
    );
    return { result, bootstrapLog, profileLog };
  }

  function createRecordingDownloader(): { binDir: string; logPath: string } {
    const binDir = path.join(tmp, 'fake-bin');
    const logPath = path.join(tmp, 'download.log');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'curl'), '#!/usr/bin/env sh\nprintf "%s\\n" "$@" > "$DOWNLOAD_LOG"\nexit 42\n');
    fs.chmodSync(path.join(binDir, 'curl'), 0o755);
    return { binDir, logPath };
  }

  function probeRemoteMirror(mirror: string): { result: ReturnType<typeof spawnSync>; logPath: string } {
    const { binDir, logPath } = createRecordingDownloader();
    const home = path.join(tmp, 'remote-home');
    fs.mkdirSync(home, { recursive: true });
    const result = spawnSync('bash', [installerPath, '--mirror', mirror, '--version', '9.8.7', '--probe-artifact'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DOWNLOAD_LOG: logPath,
        HOME: home,
        PATH: `${binDir}${path.delimiter}/usr/bin${path.delimiter}/bin`,
        SHELL: '/bin/bash',
      },
    });
    return { result, logPath };
  }

  it('installs an OPL-owned artifact into non-root user paths and keeps identity metadata', () => {
    const fixture = createArtifact();
    const probe = spawnSync(
      'bash',
      [installerPath, '--mirror', fixture.mirror, '--version', fixture.version, '--probe-artifact'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixture.home,
          SHELL: '/bin/bash',
        },
      }
    );
    expect(probe.status).toBe(0);
    expect(probe.stdout).toContain('OPL Native WebUI artifact is present');
    expect(fs.existsSync(path.join(fixture.home, '.local', 'share', 'one-person-lab', 'webui', 'runtime'))).toBe(false);

    const { result, bootstrapLog, profileLog } = installArtifact(fixture);

    expect(result.status).toBe(0);
    const runtimeDir = path.join(fixture.home, '.local', 'share', 'one-person-lab', 'webui', 'runtime');
    const versionDir = path.join(runtimeDir, 'versions', fixture.version);
    expect(fs.statSync(path.join(versionDir, 'aionui-web')).mode & 0o111).not.toBe(0);
    expect(fs.readlinkSync(path.join(runtimeDir, 'current'))).toBe(`versions/${fixture.version}`);
    expect(fs.realpathSync(path.join(fixture.home, '.local', 'bin', 'aionui-web'))).toBe(
      fs.realpathSync(path.join(runtimeDir, 'current', 'aionui-web'))
    );
    expect(fs.readFileSync(path.join(versionDir, 'opl-native-webui-artifact.sha256'), 'utf8')).toContain(
      'runtime_form=native_webui'
    );
    expect(fs.readFileSync(bootstrapLog, 'utf8').trim()).toBe('--headless --skip-packages');
    expect(fs.readFileSync(profileLog, 'utf8')).toContain('--intent first_install --profile embedded --opl-bin');
  });

  it('updates and rolls back atomically without reapplying Official Profile or changing persistent data', () => {
    const first = createArtifact('one-person-lab-app', '9.8.7');
    const firstInstall = installArtifact(first);
    expect(firstInstall.result.status).toBe(0);
    const dataDir = path.join(first.home, '.local', 'share', 'one-person-lab', 'webui', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'user.db'), 'persistent-data\n');
    const projectsDir = path.join(first.home, 'OnePersonLab', 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });
    fs.writeFileSync(path.join(projectsDir, 'project.txt'), 'persistent-project\n');

    const second = createArtifact('one-person-lab-app', '9.8.8');
    second.home = first.home;
    const update = installArtifact(second);
    expect(update.result.status).toBe(0);
    const runtimeDir = path.join(first.home, '.local', 'share', 'one-person-lab', 'webui', 'runtime');
    expect(fs.readlinkSync(path.join(runtimeDir, 'current'))).toBe('versions/9.8.8');
    expect(fs.readlinkSync(path.join(runtimeDir, 'previous'))).toBe('versions/9.8.7');
    expect(fs.readFileSync(update.profileLog, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(fs.readFileSync(path.join(dataDir, 'user.db'), 'utf8')).toBe('persistent-data\n');
    expect(fs.readFileSync(path.join(projectsDir, 'project.txt'), 'utf8')).toBe('persistent-project\n');

    const rollback = spawnSync('bash', [installerPath, '--install-dir', runtimeDir, '--rollback'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: first.home, SHELL: '/bin/bash' },
    });
    expect(rollback.status).toBe(0);
    expect(fs.readlinkSync(path.join(runtimeDir, 'current'))).toBe('versions/9.8.7');
    expect(fs.readlinkSync(path.join(runtimeDir, 'previous'))).toBe('versions/9.8.8');
    expect(fs.readFileSync(path.join(dataDir, 'user.db'), 'utf8')).toBe('persistent-data\n');
    expect(fs.readFileSync(path.join(projectsDir, 'project.txt'), 'utf8')).toBe('persistent-project\n');
  });

  it('keeps the previous active version when first-install Official Profile setup fails', () => {
    const fixture = createArtifact();
    const { result } = installArtifact(fixture, { OPL_TEST_PROFILE_FAIL: '1' });
    const runtimeDir = path.join(fixture.home, '.local', 'share', 'one-person-lab', 'webui', 'runtime');

    expect(result.status).toBe(1);
    expect(fs.existsSync(path.join(runtimeDir, 'current'))).toBe(false);
    expect(fs.existsSync(path.join(runtimeDir, '.official-profile-first-install-complete'))).toBe(false);
    expect(fs.existsSync(path.join(runtimeDir, 'versions', fixture.version))).toBe(true);
  });

  it('fails closed before extraction when artifact ownership does not match OPL', () => {
    const fixture = createArtifact('iOfficeAI');
    const result = spawnSync(
      'bash',
      [installerPath, '--mirror', fixture.mirror, '--version', fixture.version, '--no-path'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixture.home,
          SHELL: '/bin/bash',
        },
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('metadata owner mismatch');
    expect(fs.existsSync(path.join(fixture.home, '.local', 'share', 'one-person-lab', 'webui', 'runtime'))).toBe(false);
  });

  it.each([
    'https://example.com/releases/download',
    'http://github.com/gaofeng21cn/one-person-lab-app/releases/download',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v9.8.7',
  ])('rejects untrusted or version-qualified remote base before metadata download: %s', (mirror) => {
    const { result, logPath } = probeRemoteMirror(mirror);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported artifact base');
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it.each(['../escape', '9.8', '9.8.7/../../escape', 'latest/escape'])(
    'rejects a path-unsafe version before creating runtime directories: %s',
    (version) => {
      const fixture = createArtifact();
      const result = spawnSync(
        'bash',
        [installerPath, '--mirror', fixture.mirror, '--version', version, '--probe-artifact'],
        {
          encoding: 'utf8',
          env: { ...process.env, HOME: fixture.home, SHELL: '/bin/bash' },
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Version must be a path-safe semantic version');
      expect(fs.existsSync(path.join(fixture.home, '.local', 'share', 'one-person-lab', 'webui', 'runtime'))).toBe(
        false
      );
    }
  );

  it.each([
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download',
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/',
  ])('accepts the exact official base and appends the version directory exactly once: %s', (officialBase) => {
    const { result, logPath } = probeRemoteMirror(officialBase);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OPL artifact metadata download failed');
    const downloaderArgs = fs.readFileSync(logPath, 'utf8');
    expect(downloaderArgs).toContain(
      'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v9.8.7/one-person-lab-webui-9.8.7-'
    );
    expect(downloaderArgs).not.toContain('/releases/download//');
    expect(downloaderArgs).not.toContain('/v9.8.7/v9.8.7/');
  });

  it('normalizes a development file base trailing slash and rejects an embedded version directory', () => {
    const fixture = createArtifact();
    const probe = spawnSync(
      'bash',
      [installerPath, '--mirror', `${fixture.mirror}/`, '--version', fixture.version, '--probe-artifact'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixture.home,
          SHELL: '/bin/bash',
        },
      }
    );
    expect(probe.status).toBe(0);

    const embeddedVersion = spawnSync(
      'bash',
      [
        installerPath,
        '--mirror',
        `${fixture.mirror}/v${fixture.version}`,
        '--version',
        fixture.version,
        '--probe-artifact',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: fixture.home,
          SHELL: '/bin/bash',
        },
      }
    );
    expect(embeddedVersion.status).toBe(1);
    expect(embeddedVersion.stderr).toContain('Artifact base must not include a version directory');
  });

  it('declares host-native defaults separately from explicit container paths', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'packages', 'web-cli', 'src', 'index.ts'), 'utf8');
    const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
    const installer = fs.readFileSync(installerPath, 'utf8');

    expect(source).toContain("path.join(DEFAULT_NATIVE_ROOT, 'data')");
    expect(source).toContain("path.join(os.homedir(), 'OnePersonLab', 'projects')");
    expect(source).not.toContain("return '/projects'");
    expect(dockerfile).toContain('ENV AIONUI_DATA_DIR=/data');
    expect(dockerfile).toContain('ENV OPL_PROJECTS_DIR=/projects');
    expect(dockerfile).toContain('ENV OPL_WEBUI_RECOVERY_DIR=/recovery');
    expect(installer).toContain('gaofeng21cn/one-person-lab-app/releases/download');
    expect(installer).not.toContain('gaofeng21cn/opl-aion-shell/releases/download');
    expect(installer).not.toContain('iOfficeAI/AionUi/releases/download');
  });

  it('quotes caller-supplied BIN_DIR when updating a POSIX shell profile', () => {
    const fixture = createArtifact();
    const marker = path.join(tmp, 'profile-injection-marker');
    const binDir = path.join(fixture.home, `bin-$(touch ${marker})-'quoted`);
    const profilePath = path.join(fixture.home, '.bashrc');
    fs.writeFileSync(profilePath, '# user profile\n');

    const result = spawnSync('bash', [installerPath, '--mirror', fixture.mirror, '--version', fixture.version], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BIN_DIR: binDir,
        HOME: fixture.home,
        OPL_TEST_BOOTSTRAP_LOG: path.join(tmp, 'bootstrap.log'),
        OPL_TEST_PROFILE_LOG: path.join(tmp, 'profile.log'),
        SHELL: '/bin/bash',
      },
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);
    const profile = fs.readFileSync(profilePath, 'utf8');
    expect(profile).toContain("export PATH='");
    const sourceResult = spawnSync('/bin/bash', ['-c', 'source "$1"; printf "%s" "$PATH"', 'bash', profilePath], {
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin' },
    });
    expect(sourceResult.status).toBe(0);
    expect(sourceResult.stdout.split(path.delimiter)[0]).toBe(binDir);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects newline characters in BIN_DIR before writing a shell profile', () => {
    const fixture = createArtifact();
    const profilePath = path.join(fixture.home, '.bashrc');
    fs.writeFileSync(profilePath, '# user profile\n');

    const result = spawnSync('bash', [installerPath, '--mirror', fixture.mirror, '--version', fixture.version], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BIN_DIR: `${fixture.home}/bin\ninjected`,
        HOME: fixture.home,
        OPL_TEST_BOOTSTRAP_LOG: path.join(tmp, 'bootstrap.log'),
        OPL_TEST_PROFILE_LOG: path.join(tmp, 'profile.log'),
        SHELL: '/bin/bash',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('BIN_DIR must not contain newline or carriage-return characters');
    expect(fs.readFileSync(profilePath, 'utf8')).toBe('# user profile\n');
  });
});

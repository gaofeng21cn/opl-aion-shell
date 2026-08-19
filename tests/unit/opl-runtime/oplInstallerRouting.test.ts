import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const installerPath = path.join(repoRoot, 'resources', 'opl-install.sh');

describe.skipIf(process.platform === 'win32')('OPL installer runtime routing', () => {
  let root: string;
  let binDir: string;
  let curlLog: string;
  let baseArgsLog: string;
  let containerArgsLog: string;
  let releaseDir: string;

  function sha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  function writeExecutable(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    fs.chmodSync(filePath, 0o755);
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-installer-routing-'));
    binDir = path.join(root, 'bin');
    curlLog = path.join(root, 'curl.log');
    baseArgsLog = path.join(root, 'base-args.log');
    containerArgsLog = path.join(root, 'container-args.log');
    releaseDir = path.join(root, 'release');
    fs.mkdirSync(releaseDir, { recursive: true });
    const tag = 'v26.8.14';
    const version = tag.slice(1);
    const standardName = `One-Person-Lab-${version}-mac-arm64.dmg`;
    const standardBytes = 'standard-dmg\n';
    const containerInstaller = ['#!/usr/bin/env bash', 'printf "%s\\n" "$@" > "$OPL_TEST_CONTAINER_ARGS_LOG"', ''].join(
      '\n'
    );
    const installerBytes = fs.readFileSync(installerPath);
    const assetUrl = (name: string) =>
      `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/${name}`;
    const manifest = {
      surface_kind: 'opl_app_component_manifest.v1',
      component_id: 'opl-app',
      version,
      release_tag: tag,
      release_url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/${tag}`,
      component_manifest_ref: assetUrl('opl-app-component-manifest.json'),
      component_manifest_digest: `sha256:${'a'.repeat(64)}`,
      primary_artifact: {
        name: standardName,
        digest: `sha256:${sha256(standardBytes)}`,
      },
      artifacts: [
        { name: standardName, digest: `sha256:${sha256(standardBytes)}`, ref: assetUrl(standardName) },
        {
          name: 'opl-install.sh',
          digest: `sha256:${sha256(installerBytes)}`,
          size: installerBytes.length,
          ref: assetUrl('opl-install.sh'),
        },
      ],
    };
    const manifestBytes = `${JSON.stringify(manifest)}\n`;
    const releaseRecord = {
      tag_name: tag,
      draft: false,
      prerelease: false,
      assets: [
        {
          name: standardName,
          digest: `sha256:${sha256(standardBytes)}`,
          size: Buffer.byteLength(standardBytes),
          browser_download_url: assetUrl(standardName),
        },
        {
          name: 'opl-app-component-manifest.json',
          digest: `sha256:${sha256(manifestBytes)}`,
          size: Buffer.byteLength(manifestBytes),
          browser_download_url: assetUrl('opl-app-component-manifest.json'),
        },
        {
          name: 'opl-install.sh',
          digest: `sha256:${sha256(installerBytes)}`,
          size: installerBytes.length,
          browser_download_url: assetUrl('opl-install.sh'),
        },
        {
          name: 'install-docker-webui.sh',
          digest: `sha256:${sha256(containerInstaller)}`,
          size: Buffer.byteLength(containerInstaller),
          browser_download_url: assetUrl('install-docker-webui.sh'),
        },
      ],
    };
    fs.writeFileSync(path.join(releaseDir, 'github-release.json'), `${JSON.stringify(releaseRecord)}\n`);
    fs.writeFileSync(path.join(releaseDir, 'opl-app-component-manifest.json'), manifestBytes);
    fs.writeFileSync(path.join(releaseDir, 'install-docker-webui.sh'), containerInstaller);
    writeExecutable(
      path.join(binDir, 'uname'),
      [
        '#!/usr/bin/env bash',
        'if [ "${1:-}" = "-m" ]; then',
        '  printf "%s\\n" "$OPL_TEST_MACHINE"',
        'else',
        '  printf "%s\\n" "$OPL_TEST_UNAME"',
        'fi',
        '',
      ].join('\n')
    );
    writeExecutable(
      path.join(binDir, 'curl'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "%s\\n" "$*" >> "$OPL_TEST_CURL_LOG"',
        'output=""',
        'url=""',
        'while [ "$#" -gt 0 ]; do',
        '  case "$1" in',
        '    -o) shift; output="$1" ;;',
        '    https://*) url="$1" ;;',
        '  esac',
        '  shift',
        'done',
        'case "$url" in',
        '  "$OPL_INSTALL_SCRIPT_URL")',
        "    cat <<'SCRIPT'",
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$@" > "$OPL_TEST_BASE_ARGS_LOG"',
        'SCRIPT',
        '    ;;',
        '  https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/*)',
        '    cp "$OPL_TEST_RELEASE_DIR/github-release.json" "$output"',
        '    ;;',
        '  https://github.com/gaofeng21cn/one-person-lab-app/releases/download/*/opl-app-component-manifest.json)',
        '    cp "$OPL_TEST_RELEASE_DIR/opl-app-component-manifest.json" "$output"',
        '    printf "200"',
        '    ;;',
        '  https://github.com/gaofeng21cn/one-person-lab-app/releases/download/*/install-docker-webui.sh)',
        '    cp "$OPL_TEST_RELEASE_DIR/install-docker-webui.sh" "$output"',
        '    printf "200"',
        '    ;;',
        '  *)',
        '    printf "Unexpected installer URL: %s\\n" "$url" >&2',
        '    exit 97',
        '    ;;',
        'esac',
        '',
      ].join('\n')
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function runInstaller(platform: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
    return spawnSync('/bin/bash', [installerPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
        OPL_INSTALL_SCRIPT_URL: 'https://test.invalid/base',
        OPL_INSTALLER_CACHE_DIR: path.join(root, 'installer-cache'),
        OPL_TEST_BASE_ARGS_LOG: baseArgsLog,
        OPL_TEST_CONTAINER_ARGS_LOG: containerArgsLog,
        OPL_TEST_CURL_LOG: curlLog,
        OPL_TEST_RELEASE_DIR: releaseDir,
        OPL_TEST_UNAME: platform,
        OPL_TEST_MACHINE: platform === 'Darwin' ? 'arm64' : 'x86_64',
        ...extraEnv,
      },
    });
  }

  it.each([
    { platform: 'Darwin', args: [], route: 'desktop' },
    { platform: 'Linux', args: [], route: 'linux-desktop' },
    { platform: 'MINGW64_NT-10.0', args: [], route: 'container-webui' },
    { platform: 'Linux', args: ['--server'], route: 'container-webui' },
    { platform: 'Linux', args: ['--isolated'], route: 'container-webui' },
    { platform: 'Darwin', args: ['--headless'], route: 'headless' },
  ])('resolves $platform $args to $route without downloading', ({ platform, args, route }) => {
    const result = runInstaller(platform, [...args, '--print-install-route']);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(route);
    expect(fs.existsSync(curlLog)).toBe(false);
  });

  it('fails closed for invalid forms, invalid scenario combinations, and unsupported platforms', () => {
    const cases = [
      {
        result: runInstaller('Linux', ['--runtime-form', 'invalid', '--print-install-route']),
        message: 'Unsupported runtime form: invalid',
      },
      {
        result: runInstaller('Linux', ['--server', '--desktop', '--print-install-route']),
        message: 'Server or isolated installs require the Container WebUI runtime form.',
      },
      {
        result: runInstaller('FreeBSD', ['--print-install-route']),
        message: 'Unsupported platform for OPL App installer: FreeBSD',
      },
    ];

    for (const { result, message } of cases) {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
    }
    expect(fs.existsSync(curlLog)).toBe(false);
  });

  it('routes the deprecated Native WebUI alias to the packaged Desktop WebUI without downloading', () => {
    const nativeTemp = path.join(root, 'native-temp');
    fs.mkdirSync(nativeTemp);

    const result = runInstaller('Linux', ['--native-webui', '--print-install-route'], {
      TMPDIR: nativeTemp,
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('linux-desktop-webui');
    expect(result.stderr).toContain('--native-webui is deprecated; using the packaged Desktop WebUI mode.');
    expect(fs.readdirSync(nativeTemp)).toEqual([]);
    expect(fs.existsSync(curlLog)).toBe(false);
  });

  it('installs Desktop with --with-app and without an implicit --skip-packages', () => {
    const result = runInstaller('Darwin', ['--desktop', '--custom-flag', 'custom-value']);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(baseArgsLog, 'utf8').trim().split('\n')).toEqual([
      '--custom-flag',
      'custom-value',
      '--with-app',
    ]);
    expect(fs.existsSync(containerArgsLog)).toBe(false);
  });

  it('keeps explicit headless installs on Base with --skip-packages', () => {
    const result = runInstaller('Linux', ['--headless']);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(baseArgsLog, 'utf8').trim().split('\n')).toEqual(['--headless', '--skip-packages']);
    expect(fs.existsSync(containerArgsLog)).toBe(false);
  });

  it('does not add --skip-packages when headless has an explicit package selection', () => {
    const result = runInstaller('Linux', ['--headless', '--package', 'mas']);

    expect(result.status).toBe(0);
    expect(fs.readFileSync(baseArgsLog, 'utf8').trim().split('\n')).toEqual(['--package', 'mas', '--headless']);
  });

  it('forwards only supported confirmation and open flags to Container WebUI', () => {
    const result = runInstaller('Linux', ['--container-webui', '--yes', '--no-open']);

    expect(result.status, result.stderr).toBe(0);
    expect(fs.readFileSync(containerArgsLog, 'utf8').trim().split('\n')).toEqual(['--yes', '--no-open']);
    expect(fs.existsSync(baseArgsLog)).toBe(false);
  });
});

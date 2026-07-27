import { spawnSync } from 'node:child_process';
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
    writeExecutable(path.join(binDir, 'uname'), '#!/usr/bin/env bash\nprintf "%s\\n" "$OPL_TEST_UNAME"\n');
    writeExecutable(
      path.join(binDir, 'curl'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'printf "%s\\n" "$*" >> "$OPL_TEST_CURL_LOG"',
        'url="${!#}"',
        'case "$url" in',
        '  "$OPL_INSTALL_SCRIPT_URL")',
        "    cat <<'SCRIPT'",
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$@" > "$OPL_TEST_BASE_ARGS_LOG"',
        'SCRIPT',
        '    ;;',
        '  "$OPL_DOCKER_WEBUI_INSTALLER_URL")',
        "    cat <<'SCRIPT'",
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$@" > "$OPL_TEST_CONTAINER_ARGS_LOG"',
        'SCRIPT',
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
        OPL_DOCKER_WEBUI_INSTALLER_URL: 'https://test.invalid/container',
        OPL_INSTALL_SCRIPT_URL: 'https://test.invalid/base',
        OPL_TEST_BASE_ARGS_LOG: baseArgsLog,
        OPL_TEST_CONTAINER_ARGS_LOG: containerArgsLog,
        OPL_TEST_CURL_LOG: curlLog,
        OPL_TEST_UNAME: platform,
        ...extraEnv,
      },
    });
  }

  it.each([
    { platform: 'Darwin', args: [], route: 'desktop' },
    { platform: 'Linux', args: [], route: 'container-webui' },
    { platform: 'MINGW64_NT-10.0', args: [], route: 'container-webui' },
    { platform: 'Linux', args: ['--server'], route: 'container-webui' },
    { platform: 'Linux', args: ['--isolated'], route: 'container-webui' },
    { platform: 'Darwin', args: ['--headless'], route: 'headless' },
  ])('resolves $platform $args to $route without downloading', ({ platform, args, route }) => {
    const result = runInstaller(platform, [...args, '--print-install-route']);

    expect(result.status).toBe(0);
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

  it('requires a verified Native WebUI artifact without probing or downloading', () => {
    const nativeTemp = path.join(root, 'native-temp');
    fs.mkdirSync(nativeTemp);

    const result = runInstaller('Linux', ['--native-webui', '--print-install-route'], {
      TMPDIR: nativeTemp,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('A verified OPL Native WebUI artifact is required');
    expect(result.stderr).toContain('Provide mirror/version plus an exact verifier URL and SHA256');
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

    expect(result.status).toBe(0);
    expect(fs.readFileSync(containerArgsLog, 'utf8').trim().split('\n')).toEqual(['--yes', '--no-open']);
    expect(fs.existsSync(baseArgsLog)).toBe(false);
  });
});

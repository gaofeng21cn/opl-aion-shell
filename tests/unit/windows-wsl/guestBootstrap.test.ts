import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const bootstrapRoot = path.resolve(__dirname, '../../../resources/opl-linux/bootstrap');

function read(name: string): string {
  return fs.readFileSync(path.join(bootstrapRoot, name), 'utf8');
}

describe('OPL Linux guest bootstrap', () => {
  it('gives the opl owner exclusive write access to runtime operation records', () => {
    const script = read('install-opl-linux.sh');
    expect(script).toContain('install -d -o "$guest_user" -g "$guest_user" -m 0700 "$state_root"');
  });

  it('installs jq before parsing the product manifest', () => {
    const script = read('install-opl-linux.sh');
    const dependencyInstall = script.indexOf('apt-get install -y --no-install-recommends');
    const manifestRead = script.indexOf('framework_ref="$(jq -er');
    expect(dependencyInstall).toBeGreaterThan(-1);
    expect(manifestRead).toBeGreaterThan(dependencyInstall);
  });

  it('uses one owner-bound Framework PATH on execution and inspection routes', () => {
    const expected =
      '/home/opl/.opl/one-person-lab/bin:/home/opl/.npm-global/bin:/home/opl/.local/bin:/usr/local/bin:/usr/bin:/bin';
    for (const name of ['opl-runtime-exec', 'opl-runtime-control', 'opl-runtime-inspect']) {
      expect(read(name)).toContain(`export PATH="${expected}"`);
    }
    const runtimeExec = read('opl-runtime-exec');
    expect(runtimeExec.indexOf(`export PATH="${expected}"`)).toBeLessThan(
      runtimeExec.indexOf('program="$(command -v opl || true)"')
    );
    expect(runtimeExec).toContain('export OPL_CODEX_BIN=/usr/local/bin/codex');
    expect(runtimeExec).toContain('codex="$OPL_CODEX_BIN"');
  });

  it('preserves stdin for detached runtime programs', () => {
    const runtimeExec = read('opl-runtime-exec');
    expect(runtimeExec).toContain('setsid "$program" "$@" <&0 &');

    const payload = '{"group_id":"group-1"}';
    const detached = spawnSync('bash', ['-c', 'setsid cat <&0 & child=$!; wait "$child"'], {
      encoding: 'utf8',
      input: payload,
    });
    expect(detached.status).toBe(0);
    expect(detached.stdout).toBe(payload);
  });

  it('binds the packaged Codex realpath to one inspected command identity', () => {
    const installer = read('install-opl-linux.sh');
    expect(installer).toContain('ln -sfn "$codex_realpath" /usr/local/bin/codex');
    expect(installer).toContain('codex_command_digest: $codex_command_digest');

    const inspect = read('opl-runtime-inspect');
    expect(inspect).toContain('export OPL_CODEX_BIN=/usr/local/bin/codex');
    expect(inspect).toContain('codex_command_realpath="$(readlink -f "$codex_command_path")"');
    expect(inspect).toContain('"sha256:$codex_command_sha256" != "$identity_codex_digest"');
  });

  it('counts operation records without feeding filenames into jq', () => {
    const script = read('opl-runtime-inspect');
    expect(script).toContain('--argjson active_operation_count "$active_operation_count"');
    expect(script).toContain('active_operation_count: $active_operation_count');
    expect(script).not.toContain('[inputs]');
  });

  it('projects the exact installed runtime entrypoint cohort in guest identity', () => {
    const script = read('opl-runtime-inspect');
    expect(script).toContain('for name in opl-runtime-control opl-runtime-exec opl-runtime-inspect; do');
    expect(script).toContain('bootstrap_digest: ("sha256:" + $bootstrap_sha256)');
  });
});

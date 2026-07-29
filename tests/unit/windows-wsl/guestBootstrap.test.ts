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

  it.skipIf(process.platform !== 'linux')('preserves stdin for detached runtime programs', () => {
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
    expect(installer).toContain('managed_codex_path()');
    expect(installer).toContain('select(.schemaVersion == 2 and .runtimeKey == "linux-x64")');
    expect(installer).toContain('codex_path="$(managed_codex_path "$carrier_root/current")"');
    expect(installer).toContain('ln -sfn "$codex_realpath" /usr/local/bin/codex');
    expect(installer).toContain('codex_command_digest: $codex_command_digest');

    const inspect = read('opl-runtime-inspect');
    expect(inspect).toContain('export OPL_CODEX_BIN=/usr/local/bin/codex');
    expect(inspect).toContain('codex_command_realpath="$(readlink -f "$codex_command_path")"');
    expect(inspect).toContain('"sha256:$codex_command_sha256" != "$identity_codex_digest"');
  });

  it('repairs an incomplete carrier activation and verifies managed Node on every startup', () => {
    const installer = read('install-opl-linux.sh');
    expect(installer).toContain('if ! runtime_activation_complete "$activation"; then');
    expect(installer).toContain('Repairing incomplete packaged Linux runtime activation');
    expect(installer).toContain('normalize_managed_node_launchers "$pending"');
    expect(installer).toContain('ln -s "$command_target" "$managed_node_bin/$command_name"');
    expect(installer).toContain('"$managed_node_bin/npm" --version');
    expect(installer).toContain('"$managed_node_bin/npx" --version');
    expect(installer).toContain('chmod 0755 \\');
    expect(installer).toContain('if ! runtime_activation_complete "$pending"; then');

    const inspect = read('opl-runtime-inspect');
    expect(inspect).toContain('.node.executable | select(type == "string" and . == "bin/node")');
    expect(inspect).toContain('if [[ ! -x "$managed_node" ]]; then');
    expect(inspect).toContain('actual_node_version="$("$managed_node" --version 2>/dev/null || true)"');
    expect(inspect).toContain('for command_name in npm npx; do');
    expect(inspect).toContain('managed_npm_version: $managed_npm_version');
    expect(inspect).toContain('managed_npx_version: $managed_npx_version');
  });

  it('counts operation records without feeding filenames into jq', () => {
    const script = read('opl-runtime-inspect');
    expect(script).toContain('--argjson active_operation_count "$active_operation_count"');
    expect(script).toContain('active_operation_count: $active_operation_count');
    expect(script).not.toContain('[inputs]');
  });

  it('records the final Framework executable identity and reconciles only verified stale records', () => {
    const runtimeExec = read('opl-runtime-exec');
    expect(runtimeExec).toContain('expected_executable="$(readlink -f "$node_path")"');
    expect(runtimeExec).toContain('"$(readlink -f "/proc/$child_pid/exe")" != "$expected_executable"');
    expect(runtimeExec).toContain('trap cleanup_record EXIT');

    const runtimeControl = read('opl-runtime-control');
    expect(runtimeControl).toContain('Runtime operation record is invalid or not owned by OPL Linux.');
    expect(runtimeControl).toContain('[[ ! -r "/proc/$pid/stat" ]]');
    expect(runtimeControl).toContain('collect_operation_pids');
    expect(runtimeControl).toContain('stale_record_reconciled');
    expect(runtimeControl).toContain('Runtime operation identity no longer matches the live process.');
  });

  it('projects the exact installed runtime entrypoint cohort in guest identity', () => {
    const script = read('opl-runtime-inspect');
    expect(script).toContain('for name in opl-runtime-control opl-runtime-exec opl-runtime-inspect; do');
    expect(script).toContain('bootstrap_digest: ("sha256:" + $bootstrap_sha256)');
  });
});

#!/usr/bin/env bash
set -euo pipefail

runtime_source="${1:?Linux AionCore runtime source is required}"
bootstrap_source="${2:?OPL Linux bootstrap source is required}"
framework_installer="${3:?Framework installer is required}"
product_manifest="${4:?OPL Linux product manifest is required}"

identity_dir=/etc/opl
identity_file="$identity_dir/identity.json"
carrier_root=/opt/opl/carrier
bootstrap_root=/opt/opl/bootstrap
state_root=/var/lib/opl/runtime-state
receipt_root=/var/lib/opl/receipts
guest_user=opl

if [[ ! -f "$runtime_source/manifest.json" ]] ||
  [[ ! -f "$runtime_source/aioncore" ]] ||
  [[ ! -f "$runtime_source/managed-resources/manifest.json" ]]; then
  printf 'The packaged Linux runtime seed is incomplete.\n' >&2
  exit 1
fi
if [[ ! -f "$framework_installer" ]]; then
  printf 'The packaged Framework installer is missing.\n' >&2
  exit 1
fi
if [[ ! -f "$product_manifest" ]]; then
  printf 'The packaged OPL Linux product manifest is missing.\n' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl file jq procps tar
framework_ref="$(jq -er '.framework_ref | select(test("^[0-9a-f]{40}$"))' "$product_manifest")"

if ! id "$guest_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$guest_user"
fi

install -d -m 0755 "$identity_dir" "$carrier_root/store/sha256" "$carrier_root/activations"
install -d -m 0755 "$bootstrap_root" "$receipt_root"
install -d -o "$guest_user" -g "$guest_user" -m 0700 "$state_root"
install -d -o "$guest_user" -g "$guest_user" -m 0700 \
  "/home/$guest_user/.codex" \
  "/home/$guest_user/.local/share/one-person-lab" \
  "/home/$guest_user/.local/state/one-person-lab/logs" \
  "/home/$guest_user/.local/state/one-person-lab/work" \
  "/home/$guest_user/.cache/one-person-lab" \
  "/home/$guest_user/code"

runtime_manifest_sha256="$(sha256sum "$runtime_source/manifest.json" | awk '{print $1}')"
activation="$carrier_root/store/sha256/$runtime_manifest_sha256"

managed_codex_path() {
  local root="$1"
  local manifest="$root/managed-resources/manifest.json"
  local relative_path
  [[ -f "$manifest" ]] || return 1
  relative_path="$(
    jq -er '
      select(.schemaVersion == 2 and .runtimeKey == "linux-x64")
      | [.clis[]? | select(.name == "codex")] as $matches
      | select($matches | length == 1)
      | $matches[0]
      | select(.platformDirectory == "linux-x64")
      | (.root + "/" + .executable)
      | select(test("^cli/codex/[0-9]+\\.[0-9]+\\.[0-9]+/linux-x64/vendor/[A-Za-z0-9._-]+/bin/codex$"))
    ' "$manifest"
  )" || return 1
  printf '%s/%s\n' "$root/managed-resources" "$relative_path"
}

runtime_activation_complete() {
  local root="$1"
  local managed_node managed_node_bin codex_path
  [[ -f "$root/manifest.json" ]] || return 1
  [[ -x "$root/aioncore" ]] || return 1
  [[ -f "$root/managed-resources/manifest.json" ]] || return 1
  managed_node="$(find "$root/managed-resources/node" -type f -path '*/bin/node' -print -quit 2>/dev/null)"
  [[ -n "$managed_node" ]] && [[ -x "$managed_node" ]] || return 1
  managed_node_bin="$(dirname "$managed_node")"
  [[ -x "$managed_node_bin/npm" ]] && [[ -x "$managed_node_bin/npx" ]] || return 1
  codex_path="$(managed_codex_path "$root")" || return 1
  [[ -n "$codex_path" ]] && [[ -x "$codex_path" ]]
}

if ! runtime_activation_complete "$activation"; then
  if [[ -d "$activation" ]]; then
    printf 'Repairing incomplete packaged Linux runtime activation: %s\n' "$activation" >&2
    rm -rf "$activation"
  fi
  pending="$activation.pending.$$"
  rm -rf "$pending"
  install -d -m 0755 "$pending"
  cp -a "$runtime_source/." "$pending/"
  pending_node="$(find "$pending/managed-resources/node" -type f -path '*/bin/node' -print -quit 2>/dev/null)"
  pending_node_bin="$(dirname "${pending_node:-/missing}")"
  pending_codex="$(managed_codex_path "$pending")" || pending_codex=''
  if [[ -z "$pending_node" ]] ||
    [[ ! -f "$pending_node_bin/npm" ]] ||
    [[ ! -f "$pending_node_bin/npx" ]] ||
    [[ -z "$pending_codex" ]]; then
    printf 'The packaged Linux runtime seed is missing a managed executable.\n' >&2
    rm -rf "$pending"
    exit 1
  fi
  chmod 0755 \
    "$pending/aioncore" \
    "$pending_node" \
    "$pending_node_bin/npm" \
    "$pending_node_bin/npx" \
    "$pending_codex"
  actual_manifest_sha256="$(sha256sum "$pending/manifest.json" | awk '{print $1}')"
  if [[ "$actual_manifest_sha256" != "$runtime_manifest_sha256" ]]; then
    printf 'Linux runtime manifest changed while staging.\n' >&2
    rm -rf "$pending"
    exit 1
  fi
  if ! runtime_activation_complete "$pending"; then
    printf 'The packaged Linux runtime activation failed integrity verification.\n' >&2
    rm -rf "$pending"
    exit 1
  fi
  mv "$pending" "$activation"
fi

ln -sfn "$activation" "$carrier_root/current.pending"
mv -Tf "$carrier_root/current.pending" "$carrier_root/current"
managed_node="$(find "$carrier_root/current/managed-resources/node" -type f -path '*/bin/node' -print -quit)"
if [[ -z "$managed_node" ]] || [[ ! -x "$managed_node" ]]; then
  printf 'The packaged Linux managed Node.js executable is missing.\n' >&2
  exit 1
fi
managed_node_bin="$(dirname "$managed_node")"
for command_name in node npm npx; do
  command_path="$managed_node_bin/$command_name"
  if [[ ! -e "$command_path" ]]; then
    printf 'The packaged Linux managed Node.js command is missing: %s\n' "$command_name" >&2
    exit 1
  fi
  ln -sfn "$command_path" "/usr/local/bin/$command_name"
done
install -m 0755 "$bootstrap_source/opl-runtime-exec" "$bootstrap_root/opl-runtime-exec"
install -m 0755 "$bootstrap_source/opl-runtime-control" "$bootstrap_root/opl-runtime-control"
install -m 0755 "$bootstrap_source/opl-runtime-inspect" "$bootstrap_root/opl-runtime-inspect"
install -m 0755 "$framework_installer" "$bootstrap_root/opl-install.sh"
install -m 0644 "$product_manifest" "$identity_dir/product.json"

guest_install_id=''
if [[ -f "$identity_file" ]]; then
  guest_install_id="$(jq -r '.guest_install_id // empty' "$identity_file" 2>/dev/null || true)"
fi
if [[ -z "$guest_install_id" ]]; then
  guest_install_id="$(cat /proc/sys/kernel/random/uuid)"
fi

aioncore_sha256="$(sha256sum "$carrier_root/current/aioncore" | awk '{print $1}')"
codex_path="$(managed_codex_path "$carrier_root/current")" || codex_path=''
if [[ -z "$codex_path" ]] || [[ ! -x "$codex_path" ]]; then
  printf 'The packaged Linux Codex executable is missing.\n' >&2
  exit 1
fi
codex_realpath="$(readlink -f "$codex_path")"
if [[ "$codex_realpath" != "$activation/"* ]]; then
  printf 'The packaged Linux Codex executable escaped its carrier activation.\n' >&2
  exit 1
fi
ln -sfn "$codex_realpath" /usr/local/bin/codex
codex_command_path=/usr/local/bin/codex
codex_command_realpath="$(readlink -f "$codex_command_path")"
if [[ "$codex_command_realpath" != "$codex_realpath" ]]; then
  printf 'The Linux Codex command does not resolve to the packaged executable.\n' >&2
  exit 1
fi
codex_sha256="$(sha256sum "$codex_realpath" | awk '{print $1}')"

jq -n \
  --arg guest_install_id "$guest_install_id" \
  --arg carrier_activation_digest "sha256:$runtime_manifest_sha256" \
  --arg aioncore_digest "sha256:$aioncore_sha256" \
  --arg codex_digest "sha256:$codex_sha256" \
  --arg codex_path "$codex_realpath" \
  --arg codex_command_path "$codex_command_path" \
  --arg codex_realpath "$codex_realpath" \
  --arg codex_command_digest "sha256:$codex_sha256" \
  --arg framework_ref "$framework_ref" \
  '{
    schema: "opl_linux_guest_identity.v1",
    logical_distribution: "OPL-Linux",
    physical_distribution: "OPL-Linux",
    distribution_generation: 1,
    guest_install_id: $guest_install_id,
    architecture: "x86_64",
    guest_user: "opl",
    carrier_activation_digest: $carrier_activation_digest,
    aioncore_digest: $aioncore_digest,
    codex_digest: $codex_digest,
    codex_path: $codex_path,
    codex_command_path: $codex_command_path,
    codex_realpath: $codex_realpath,
    codex_command_digest: $codex_command_digest,
    framework_ref: $framework_ref,
    codex_home: "/home/opl/.codex",
    workspace_root: "/home/opl/code",
    native_windows_executor_fallback_allowed: false
  }' >"$identity_file.pending"
chmod 0644 "$identity_file.pending"
mv "$identity_file.pending" "$identity_file"

chown -R "$guest_user:$guest_user" "/home/$guest_user"
printf '{"status":"carrier_ready","identity":"%s"}\n' "$identity_file"

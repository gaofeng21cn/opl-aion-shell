#!/usr/bin/env bash
set -euo pipefail

runtime_source="${1:?Linux AionCore runtime source is required}"
bootstrap_source="${2:?OPL Linux bootstrap source is required}"
framework_installer="${3:?Framework installer is required}"

identity_dir=/etc/opl
identity_file="$identity_dir/identity.json"
carrier_root=/opt/opl/carrier
bootstrap_root=/opt/opl/bootstrap
state_root=/var/lib/opl/runtime-state
receipt_root=/var/lib/opl/receipts
guest_user=opl

if [[ ! -f "$runtime_source/manifest.json" ]] ||
  [[ ! -x "$runtime_source/aioncore" ]] ||
  [[ ! -f "$runtime_source/managed-resources/manifest.json" ]]; then
  printf 'The packaged Linux runtime seed is incomplete.\n' >&2
  exit 1
fi
if [[ ! -f "$framework_installer" ]]; then
  printf 'The packaged Framework installer is missing.\n' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl file jq procps

if ! id "$guest_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$guest_user"
fi

install -d -m 0755 "$identity_dir" "$carrier_root/store/sha256" "$carrier_root/activations"
install -d -m 0755 "$bootstrap_root" "$state_root" "$receipt_root"
install -d -o "$guest_user" -g "$guest_user" -m 0700 \
  "/home/$guest_user/.codex" \
  "/home/$guest_user/.local/share/one-person-lab" \
  "/home/$guest_user/.local/state/one-person-lab/logs" \
  "/home/$guest_user/.cache/one-person-lab" \
  "/home/$guest_user/code"

runtime_manifest_sha256="$(sha256sum "$runtime_source/manifest.json" | awk '{print $1}')"
activation="$carrier_root/store/sha256/$runtime_manifest_sha256"
if [[ ! -d "$activation" ]]; then
  pending="$activation.pending.$$"
  rm -rf "$pending"
  install -d -m 0755 "$pending"
  cp -a "$runtime_source/." "$pending/"
  actual_manifest_sha256="$(sha256sum "$pending/manifest.json" | awk '{print $1}')"
  if [[ "$actual_manifest_sha256" != "$runtime_manifest_sha256" ]]; then
    printf 'Linux runtime manifest changed while staging.\n' >&2
    rm -rf "$pending"
    exit 1
  fi
  mv "$pending" "$activation"
fi

ln -sfn "$activation" "$carrier_root/current.pending"
mv -Tf "$carrier_root/current.pending" "$carrier_root/current"
install -m 0755 "$bootstrap_source/opl-runtime-exec" "$bootstrap_root/opl-runtime-exec"
install -m 0755 "$bootstrap_source/opl-runtime-control" "$bootstrap_root/opl-runtime-control"
install -m 0755 "$bootstrap_source/opl-runtime-inspect" "$bootstrap_root/opl-runtime-inspect"
install -m 0755 "$framework_installer" "$bootstrap_root/opl-install.sh"

guest_install_id=''
if [[ -f "$identity_file" ]]; then
  guest_install_id="$(jq -r '.guest_install_id // empty' "$identity_file" 2>/dev/null || true)"
fi
if [[ -z "$guest_install_id" ]]; then
  guest_install_id="$(cat /proc/sys/kernel/random/uuid)"
fi

aioncore_sha256="$(sha256sum "$carrier_root/current/aioncore" | awk '{print $1}')"
codex_path="$(
  find "$carrier_root/current/managed-resources" \
    -type f \
    -path '*/@openai/codex-linux-x64/vendor/*/bin/codex' \
    -print -quit
)"
if [[ -z "$codex_path" ]] || [[ ! -x "$codex_path" ]]; then
  printf 'The packaged Linux Codex executable is missing.\n' >&2
  exit 1
fi
codex_sha256="$(sha256sum "$codex_path" | awk '{print $1}')"

jq -n \
  --arg guest_install_id "$guest_install_id" \
  --arg carrier_activation_digest "sha256:$runtime_manifest_sha256" \
  --arg aioncore_digest "sha256:$aioncore_sha256" \
  --arg codex_digest "sha256:$codex_sha256" \
  --arg codex_path "$codex_path" \
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
    codex_home: "/home/opl/.codex",
    workspace_root: "/home/opl/code",
    native_windows_executor_fallback_allowed: false
  }' >"$identity_file.pending"
chmod 0644 "$identity_file.pending"
mv "$identity_file.pending" "$identity_file"

chown -R "$guest_user:$guest_user" "/home/$guest_user"
printf '{"status":"carrier_ready","identity":"%s"}\n' "$identity_file"

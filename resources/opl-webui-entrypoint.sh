#!/usr/bin/env sh
set -eu

: "${AIONUI_DATA_DIR:=/data}"
: "${OPL_DATA_DIR:=${AIONUI_DATA_DIR}}"
: "${OPL_PROJECTS_DIR:=/projects}"
: "${OPL_WORKSPACE_ROOT:=${OPL_PROJECTS_DIR}}"
: "${OPL_IMAGE_MANIFEST_PATH:=/opt/opl/image-manifest.json}"
: "${OPL_IMAGE_SEED_DIR:=/opt/opl/seed}"
: "${AIONUI_WEB_BIN:=/app/aionui-web/aionui-web}"
: "${OPL_OFFICIAL_PROFILE_APPLY_BIN:=/app/aionui-web/opl-official-profile-apply}"
: "${OPL_OFFICIAL_PROFILE_FIRST_INSTALL_MARKER:=${OPL_DATA_DIR}/.official-profile-first-install-complete}"

export AIONUI_DATA_DIR
export OPL_DATA_DIR
export OPL_PROJECTS_DIR
export OPL_WORKSPACE_ROOT
export OPL_IMAGE_MANIFEST_PATH
export OPL_IMAGE_SEED_DIR

log() {
  printf '%s\n' "[opl-webui-entrypoint] $*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

env_value() {
  eval "printf '%s' \"\${$1:-}\""
}

lower_value() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

validate_secret_file() {
  var_name="$1"
  file="$(env_value "${var_name}")"
  [ -n "${file}" ] || return 1
  [ -r "${file}" ] || fail "${var_name} is not readable: ${file}"
  [ -s "${file}" ] || fail "${var_name} is empty: ${file}"
  return 0
}

has_secret() {
  value_name="$1"
  file_name="$2"
  if validate_secret_file "${file_name}"; then
    return 0
  fi
  value="$(env_value "${value_name}")"
  [ -n "${value}" ]
}

ensure_writable_dir() {
  dir="$1"
  label="$2"
  mkdir -p "${dir}" || fail "cannot create ${label}: ${dir}"
  probe="${dir}/.opl-webui-write-test-$$"
  : > "${probe}" || fail "${label} is not writable: ${dir}"
  rm -f "${probe}" || fail "cannot remove ${label} write probe: ${probe}"
}

deployment_mode="$(lower_value "$(env_value OPL_WEBUI_DEPLOYMENT_MODE)")"
auth_mode="$(lower_value "$(env_value OPL_WEBUI_AUTH_MODE)")"
requires_password_auth=0
has_webui_password=0
has_gateway_api_key=0

case "${deployment_mode}" in
  "" | local | local_auto | local-auto | auto) ;;
  cloud | server | remote) requires_password_auth=1 ;;
  *) fail "unsupported OPL_WEBUI_DEPLOYMENT_MODE: ${deployment_mode}" ;;
esac

case "${auth_mode}" in
  "" | local_auto | local-auto | auto) ;;
  password | required) requires_password_auth=1 ;;
  *) fail "unsupported OPL_WEBUI_AUTH_MODE: ${auth_mode}" ;;
esac

if has_secret OPL_WEBUI_PASSWORD OPL_WEBUI_PASSWORD_FILE; then
  has_webui_password=1
  requires_password_auth=1
fi

if has_secret OPL_GATEWAY_API_KEY OPL_GATEWAY_API_KEY_FILE; then
  has_gateway_api_key=1
  requires_password_auth=1
fi

if [ "${requires_password_auth}" = "1" ] && [ "${has_webui_password}" != "1" ]; then
  fail "cloud WebUI deployment requires OPL_WEBUI_PASSWORD_FILE or OPL_WEBUI_PASSWORD; OPL Gateway API key does not replace the WebUI login password"
fi

if [ "${requires_password_auth}" = "1" ]; then
  : "${OPL_WEBUI_USERNAME:=opl}"
  export OPL_WEBUI_USERNAME
  log "WebUI password auth configured for username ${OPL_WEBUI_USERNAME}"
  if [ "${has_gateway_api_key}" = "1" ]; then
    log "OPL Gateway API key secret detected"
  fi
fi

ensure_writable_dir "${AIONUI_DATA_DIR}" "AIONUI_DATA_DIR"
ensure_writable_dir "${OPL_DATA_DIR}" "OPL_DATA_DIR"
ensure_writable_dir "${OPL_PROJECTS_DIR}" "OPL_PROJECTS_DIR"

[ -f "${OPL_IMAGE_MANIFEST_PATH}" ] || fail "image manifest not found: ${OPL_IMAGE_MANIFEST_PATH}"
[ -d "${OPL_IMAGE_SEED_DIR}" ] || fail "seed directory not found: ${OPL_IMAGE_SEED_DIR}"
[ -x "${AIONUI_WEB_BIN}" ] || fail "WebUI launcher is not executable: ${AIONUI_WEB_BIN}"

node <<'NODE'
const fs = require('fs');
const manifestPath = process.env.OPL_IMAGE_MANIFEST_PATH;
const seedDir = process.env.OPL_IMAGE_SEED_DIR;
const fail = (message) => {
  console.error(`[opl-webui-entrypoint] ERROR: ${message}`);
  process.exit(1);
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot parse JSON at ${file}: ${error.message}`);
  }
};
const manifest = readJson(manifestPath);
for (const key of ['schema', 'image_role', 'webui_package', 'data_dir', 'projects_dir', 'seed_strategy']) {
  if (manifest[key] === undefined || manifest[key] === null || manifest[key] === '') {
    fail(`image manifest missing required field: ${key}`);
  }
}
if (manifest.data_dir !== process.env.OPL_DATA_DIR) {
  fail(`image manifest data_dir ${manifest.data_dir} does not match OPL_DATA_DIR ${process.env.OPL_DATA_DIR}`);
}
if (manifest.projects_dir !== process.env.OPL_PROJECTS_DIR) {
  fail(`image manifest projects_dir ${manifest.projects_dir} does not match OPL_PROJECTS_DIR ${process.env.OPL_PROJECTS_DIR}`);
}
const isSlim = manifest.image_profile === 'webui-slim' || manifest.profile === 'slim';
if (isSlim && manifest.seed_strategy !== 'metadata_only') {
  fail(`slim image manifest seed_strategy must be metadata_only, got ${manifest.seed_strategy}`);
}
if (!isSlim && !['payload_manifest', 'payload_preheated'].includes(manifest.seed_strategy)) {
  fail(`image manifest seed_strategy ${manifest.seed_strategy} is not supported`);
}
const seedMetadataPath = `${seedDir}/metadata.json`;
if (!fs.existsSync(seedMetadataPath)) {
  fail(`seed metadata not found: ${seedMetadataPath}`);
}
const seedMetadata = readJson(seedMetadataPath);
if (seedMetadata.schema !== 'dev.onepersonlab.opl-webui-image-seed.v1') {
  fail(`seed metadata schema is unsupported: ${seedMetadata.schema}`);
}
if (isSlim) {
  if (seedMetadata.strategy !== 'metadata_only') {
    fail(`slim seed metadata strategy must be metadata_only, got ${seedMetadata.strategy}`);
  }
  console.log(`[opl-webui-entrypoint] slim seed metadata ok: ${seedMetadataPath}`);
  process.exit(0);
}
if (!['payload_manifest', 'payload_preheated'].includes(seedMetadata.strategy)) {
  fail(`seed metadata strategy must be payload-capable, got ${seedMetadata.strategy}`);
}
const requiredComponentIds = ['opl_framework', 'codex_cli', 'companion_skills', 'domain_modules'];
const components = Array.isArray(seedMetadata.components)
  ? seedMetadata.components
  : seedMetadata.full_profile?.components;
if (!Array.isArray(components)) {
  fail('seed metadata full_profile.components must be an array');
}
for (const id of requiredComponentIds) {
  const component = components.find((item) => item && item.id === id);
  if (!component) {
    fail(`seed metadata missing full profile component: ${id}`);
  }
  for (const key of ['version', 'source', 'payload_path', 'receipt_kind']) {
    if (typeof component[key] !== 'string' || component[key].trim() === '') {
      fail(`seed metadata component ${id} missing ${key}`);
    }
  }
  if (
    (typeof component.sha256 !== 'string' || component.sha256.trim() === '') &&
    (typeof component.source_fingerprint !== 'string' || component.source_fingerprint.trim() === '')
  ) {
    fail(`seed metadata component ${id} must include sha256 or source_fingerprint`);
  }
}
const payloadDir = `${seedDir}/${seedMetadata.payload_dir || 'payload'}`;
if (!fs.existsSync(payloadDir) || !fs.statSync(payloadDir).isDirectory()) {
  fail(`seed payload directory not found: ${payloadDir}`);
}
console.log(`[opl-webui-entrypoint] image manifest ok: ${manifestPath}`);
console.log(`[opl-webui-entrypoint] seed metadata ok: ${seedMetadataPath}`);
NODE

if command -v opl >/dev/null 2>&1; then
  seed_strategy="$(node -e "const fs=require('fs'); const p=process.env.OPL_IMAGE_MANIFEST_PATH; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(j.seed_strategy || '')")"
  if [ "${seed_strategy}" = "metadata_only" ]; then
    log "slim seed metadata detected; skipping OPL seed apply"
  else
    log "running OPL seed apply"
    opl system seed-apply \
      --from "${OPL_IMAGE_SEED_DIR}" \
      --data-dir "${OPL_DATA_DIR}" \
      --projects-dir "${OPL_PROJECTS_DIR}" \
      --json || fail "OPL seed apply failed"
  fi
  log "running OPL runtime substrate startup maintenance"
  opl system startup-maintenance --scope runtime_substrate --json || fail "OPL startup maintenance failed"
  if [ "${seed_strategy}" != "metadata_only" ]; then
    if [ -e "${OPL_OFFICIAL_PROFILE_FIRST_INSTALL_MARKER}" ]; then
      [ -f "${OPL_OFFICIAL_PROFILE_FIRST_INSTALL_MARKER}" ] \
        || fail "Official Profile first-install marker is not a file: ${OPL_OFFICIAL_PROFILE_FIRST_INSTALL_MARKER}"
      log "Official Profile first-install marker already exists; preserving user Package choices"
    else
      [ -x "${OPL_OFFICIAL_PROFILE_APPLY_BIN}" ] \
        || fail "Official Profile helper is not executable: ${OPL_OFFICIAL_PROFILE_APPLY_BIN}"
      marker_temp="${OPL_OFFICIAL_PROFILE_FIRST_INSTALL_MARKER}.$$"
      log "applying the App Official Profile for first install"
      if "${OPL_OFFICIAL_PROFILE_APPLY_BIN}" \
        --intent first_install \
        --profile embedded \
        --opl-bin "$(command -v opl)" > "${marker_temp}"; then
        cat "${marker_temp}"
        mv "${marker_temp}" "${OPL_OFFICIAL_PROFILE_FIRST_INSTALL_MARKER}" \
          || fail "cannot record Official Profile first-install completion"
        log "Official Profile first-install completed"
      else
        profile_status="$?"
        cat "${marker_temp}" >&2 || true
        rm -f "${marker_temp}" || true
        fail "Official Profile first-install failed with status ${profile_status}"
      fi
    fi
  fi
else
  log "OPL maintenance CLI not found; skipping startup maintenance"
fi

log "starting WebUI"
exec "${AIONUI_WEB_BIN}" "$@"

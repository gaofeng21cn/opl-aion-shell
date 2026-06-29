#!/usr/bin/env sh
set -eu

: "${AIONUI_DATA_DIR:=/data}"
: "${OPL_DATA_DIR:=${AIONUI_DATA_DIR}}"
: "${OPL_PROJECTS_DIR:=/projects}"
: "${OPL_WORKSPACE_ROOT:=${OPL_PROJECTS_DIR}}"
: "${OPL_IMAGE_MANIFEST_PATH:=/opt/opl/image-manifest.json}"
: "${OPL_IMAGE_SEED_DIR:=/opt/opl/seed}"
: "${AIONUI_WEB_BIN:=/app/aionui-web/aionui-web}"

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

ensure_writable_dir() {
  dir="$1"
  label="$2"
  mkdir -p "${dir}" || fail "cannot create ${label}: ${dir}"
  probe="${dir}/.opl-webui-write-test-$$"
  : > "${probe}" || fail "${label} is not writable: ${dir}"
  rm -f "${probe}" || fail "cannot remove ${label} write probe: ${probe}"
}

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
if (manifest.seed_strategy === 'metadata_only') {
  fail('image manifest seed_strategy must be payload-capable, not metadata_only');
}
if (!['payload_manifest', 'payload_preheated'].includes(manifest.seed_strategy)) {
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
if (seedMetadata.strategy === 'metadata_only') {
  fail('seed metadata strategy must be payload-capable, not metadata_only');
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
  log "running OPL seed apply"
  opl system seed-apply \
    --from "${OPL_IMAGE_SEED_DIR}" \
    --data-dir "${OPL_DATA_DIR}" \
    --projects-dir "${OPL_PROJECTS_DIR}" \
    --json || fail "OPL seed apply failed"
  log "running OPL startup maintenance"
  opl system startup-maintenance --json || fail "OPL startup maintenance failed"
else
  log "OPL maintenance CLI not found; skipping startup maintenance"
fi

log "starting WebUI"
exec "${AIONUI_WEB_BIN}" "$@"

#!/usr/bin/env sh
set -eu

: "${AIONUI_DATA_DIR:=/data}"
: "${OPL_DATA_DIR:=${AIONUI_DATA_DIR}}"
: "${OPL_PROJECTS_DIR:=/projects}"
: "${OPL_WORKSPACE_ROOT:=${OPL_PROJECTS_DIR}}"
: "${OPL_IMAGE_MANIFEST_PATH:=/app/aionui-web/opl-image-manifest.json}"
: "${OPL_IMAGE_SEED_DIR:=/app/aionui-web/opl-image-seed}"

export AIONUI_DATA_DIR
export OPL_DATA_DIR
export OPL_PROJECTS_DIR
export OPL_WORKSPACE_ROOT
export OPL_IMAGE_MANIFEST_PATH
export OPL_IMAGE_SEED_DIR

mkdir -p "${AIONUI_DATA_DIR}" "${OPL_DATA_DIR}" "${OPL_PROJECTS_DIR}"

exec /app/aionui-web/aionui-web "$@"

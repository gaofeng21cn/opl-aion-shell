#!/usr/bin/env bash
set -euo pipefail

OPL_INSTALL_SCRIPT_URL=${OPL_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh}
OPL_APP_INSTALL_MODE=${OPL_APP_INSTALL_MODE:-app-first}

INSTALL_ARGS=()
COMPLETE_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --complete)
      COMPLETE_INSTALL=1
      ;;
    --app-first)
      COMPLETE_INSTALL=0
      ;;
    *)
      INSTALL_ARGS+=("$arg")
      ;;
  esac
done

arg_present() {
  local expected="$1"
  for arg in "${INSTALL_ARGS[@]}"; do
    if [ "$arg" = "$expected" ]; then
      return 0
    fi
  done
  return 1
}

if ! command -v curl >/dev/null 2>&1; then
  printf 'Missing required command: curl\n' >&2
  exit 1
fi

if [ "$COMPLETE_INSTALL" != "1" ] && [ "$OPL_APP_INSTALL_MODE" = "app-first" ]; then
  if ! arg_present "--skip-modules"; then
    INSTALL_ARGS+=("--skip-modules")
  fi
fi

curl -fsSL "$OPL_INSTALL_SCRIPT_URL" | bash -s -- "${INSTALL_ARGS[@]}"

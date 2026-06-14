#!/usr/bin/env bash
set -euo pipefail

OPL_INSTALL_SCRIPT_URL=${OPL_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh}
OPL_APP_INSTALL_MODE=${OPL_APP_INSTALL_MODE:-app-first}
OPL_LOCAL_APP_PATH=${OPL_LOCAL_APP_PATH:-/Applications/One Person Lab.app}
OPL_APP_RELEASE_REPO=${OPL_APP_RELEASE_REPO:-gaofeng21cn/one-person-lab-app}
OPL_APP_DOCS_REF=${OPL_APP_DOCS_REF:-main}

INSTALL_ARGS=()
COMPLETE_INSTALL=0
AUTHORIZE_LOCAL_APP=0
AUTHORIZE_LOCAL_APP_ONLY=0
AUTHORIZE_LOCAL_APP_YES=${OPL_AUTHORIZE_LOCAL_APP_YES:-0}
STABLE_MACOS_INSTALL=0
STABLE_MACOS_PACKAGE_PROFILE=${OPL_STABLE_MACOS_PACKAGE_PROFILE:-full}
STABLE_MACOS_RELEASE_TAG=${OPL_STABLE_MACOS_RELEASE_TAG:-}
STABLE_MACOS_DMG_URL=${OPL_STABLE_MACOS_DMG_URL:-}
STABLE_MACOS_DMG_PATH=${OPL_STABLE_MACOS_DMG_PATH:-}
STABLE_MACOS_OPEN=${OPL_STABLE_MACOS_OPEN:-1}
STABLE_MACOS_WORK_DIR=''

usage() {
  cat <<'USAGE'
Usage:
  install.sh [--complete|--app-first] [OPL install args...]
  install.sh --stable-macos-install [--full|--standard] [--release-tag vX.Y.Z] [--yes]
  install.sh --authorize-local-app-only [--app-path "/Applications/One Person Lab.app"] [--yes]

Options:
  --complete                 Run complete framework/module setup from the terminal.
  --app-first                Keep the default App-first setup and defer modules.
  --stable-macos-install     Download, copy, locally authorize, and open the Stable App.
  --full                     Use the Full first-install DMG for --stable-macos-install.
  --standard                 Use the standard App DMG for --stable-macos-install.
  --release-tag <tag>        GitHub Release tag for --stable-macos-install. Defaults to latest.
  --dmg-url <url>            Download a specific DMG URL for --stable-macos-install.
  --dmg-path <path>          Install from a local DMG path for --stable-macos-install.
  --authorize-local-app      After setup, remove macOS quarantine from a local App bundle.
  --authorize-local-app-only Only run the local App authorization helper.
  --app-path <path>          App bundle path for the local authorization helper.
  --open                    Open the App after --stable-macos-install. This is the default.
  --no-open                 Do not open the App after --stable-macos-install.
  --yes                     Confirm local App authorization non-interactively.

The Stable macOS install path uses local authorization and does not require Apple Developer ID signing.
USAGE
}

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --complete)
      COMPLETE_INSTALL=1
      ;;
    --app-first)
      COMPLETE_INSTALL=0
      ;;
    --stable-macos-install)
      STABLE_MACOS_INSTALL=1
      ;;
    --full)
      STABLE_MACOS_PACKAGE_PROFILE=full
      ;;
    --standard)
      STABLE_MACOS_PACKAGE_PROFILE=standard
      ;;
    --release-tag)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --release-tag\n' >&2
        exit 1
      fi
      STABLE_MACOS_RELEASE_TAG="$1"
      ;;
    --release-tag=*)
      STABLE_MACOS_RELEASE_TAG="${arg#--release-tag=}"
      ;;
    --dmg-url)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --dmg-url\n' >&2
        exit 1
      fi
      STABLE_MACOS_DMG_URL="$1"
      ;;
    --dmg-url=*)
      STABLE_MACOS_DMG_URL="${arg#--dmg-url=}"
      ;;
    --dmg-path)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --dmg-path\n' >&2
        exit 1
      fi
      STABLE_MACOS_DMG_PATH="$1"
      ;;
    --dmg-path=*)
      STABLE_MACOS_DMG_PATH="${arg#--dmg-path=}"
      ;;
    --authorize-local-app)
      AUTHORIZE_LOCAL_APP=1
      ;;
    --authorize-local-app-only)
      AUTHORIZE_LOCAL_APP=1
      AUTHORIZE_LOCAL_APP_ONLY=1
      ;;
    --app-path)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --app-path\n' >&2
        exit 1
      fi
      OPL_LOCAL_APP_PATH="$1"
      ;;
    --app-path=*)
      OPL_LOCAL_APP_PATH="${arg#--app-path=}"
      ;;
    --yes)
      AUTHORIZE_LOCAL_APP_YES=1
      ;;
    --open)
      STABLE_MACOS_OPEN=1
      ;;
    --no-open)
      STABLE_MACOS_OPEN=0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      INSTALL_ARGS+=("$arg")
      ;;
  esac
  shift
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

is_macos() {
  [ "$(uname -s)" = "Darwin" ]
}

count_quarantine_attrs() {
  local target="$1"
  local count=0
  local item
  while IFS= read -r -d '' item; do
    if xattr -p com.apple.quarantine "$item" >/dev/null 2>&1; then
      count=$((count + 1))
    fi
  done < <(find "$target" -print0)
  printf '%s\n' "$count"
}

confirm_local_app_authorization() {
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    printf 'Local App authorization needs confirmation. Re-run with --yes when using a non-interactive installer.\n' >&2
    exit 1
  fi
  {
    printf 'One Person Lab will remove macOS quarantine from this local App bundle:\n'
    printf '  %s\n' "$OPL_LOCAL_APP_PATH"
    printf 'This clears the local quarantine marker so the App and nested tools launch without repeated System Settings approval.\n'
    printf 'Type "authorize" to continue: '
  } > /dev/tty
  local reply
  if ! IFS= read -r reply < /dev/tty; then
    printf 'Local App authorization needs a controlling terminal, or pass --yes for explicit non-interactive confirmation.\n' >&2
    exit 1
  fi
  if [ "$reply" != "authorize" ]; then
    printf 'Local App authorization cancelled.\n' >&2
    exit 1
  fi
}

diagnostic_status() {
  local label="$1"
  shift
  if "$@" >/tmp/opl-local-app-authorization."$label".log 2>&1; then
    printf 'passed\n'
  else
    printf 'failed\n'
  fi
}

print_stable_macos_next_steps() {
  local repo_url="https://github.com/$OPL_APP_RELEASE_REPO"
  local docs_url="$repo_url/blob/$OPL_APP_DOCS_REF/docs/user-guides/site/index.html"
  local pdf_url="$repo_url/blob/$OPL_APP_DOCS_REF/docs/user-guides/macos-app-install-slides.pdf"
  local pptx_url="$repo_url/blob/$OPL_APP_DOCS_REF/docs/user-guides/macos-app-install-slides.pptx"
  local releases_url="$repo_url/releases/latest"

  printf 'Next steps:\n'
  printf '  1. If the App is not already open, open: %s\n' "$OPL_LOCAL_APP_PATH"
  printf '  2. Follow the first-run screen until One Person Lab is ready to launch.\n'
  printf '  3. User guide: %s\n' "$docs_url"
  printf '  4. Shareable PDF: %s\n' "$pdf_url"
  printf '  5. Shareable PPTX: %s\n' "$pptx_url"
  printf '  6. Latest release assets: %s\n' "$releases_url"
  printf 'If macOS still asks for repeated approval, re-run:\n'
  printf '  curl -fsSL https://raw.githubusercontent.com/%s/%s/install.sh | bash -s -- --authorize-local-app-only --app-path "%s" --yes\n' "$OPL_APP_RELEASE_REPO" "$OPL_APP_DOCS_REF" "$OPL_LOCAL_APP_PATH"
}

run_with_sudo_fallback() {
  local label="$1"
  shift
  if "$@" >/tmp/opl-stable-macos-install."$label".log 2>&1; then
    return 0
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    cat /tmp/opl-stable-macos-install."$label".log >&2 || true
    return 1
  fi
  printf 'Retrying %s with administrator permission.\n' "$label" >&2
  sudo "$@" >>/tmp/opl-stable-macos-install."$label".log 2>&1
}

ensure_app_target_path() {
  case "$OPL_LOCAL_APP_PATH" in
    /*.app)
      ;;
    *)
      printf 'App path must be an absolute .app bundle path: %s\n' "$OPL_LOCAL_APP_PATH" >&2
      exit 1
      ;;
  esac
}

authorize_local_app() {
  if ! is_macos; then
    printf 'Local App authorization is macOS-only.\n' >&2
    exit 1
  fi
  ensure_app_target_path
  if [ ! -d "$OPL_LOCAL_APP_PATH" ]; then
    printf 'App bundle not found: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    printf 'Copy One Person Lab.app into /Applications first, or pass --app-path <path>.\n' >&2
    exit 1
  fi
  if ! command -v xattr >/dev/null 2>&1; then
    printf 'Missing required command: xattr\n' >&2
    exit 1
  fi
  if ! command -v find >/dev/null 2>&1; then
    printf 'Missing required command: find\n' >&2
    exit 1
  fi

  confirm_local_app_authorization

  local before_quarantine
  local after_quarantine
  local codesign_status
  local spctl_status
  before_quarantine=$(count_quarantine_attrs "$OPL_LOCAL_APP_PATH")
  run_with_sudo_fallback xattr xattr -dr com.apple.quarantine "$OPL_LOCAL_APP_PATH" || {
    printf 'Failed to remove macOS quarantine from: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    cat /tmp/opl-stable-macos-install.xattr.log >&2 || true
    exit 1
  }
  after_quarantine=$(count_quarantine_attrs "$OPL_LOCAL_APP_PATH")

  if command -v codesign >/dev/null 2>&1; then
    codesign_status=$(diagnostic_status codesign codesign --verify --deep --strict --verbose=2 "$OPL_LOCAL_APP_PATH")
  else
    codesign_status='skipped_missing_codesign'
  fi
  if command -v spctl >/dev/null 2>&1; then
    spctl_status=$(diagnostic_status spctl spctl --assess --type execute --verbose=4 "$OPL_LOCAL_APP_PATH")
  else
    spctl_status='skipped_missing_spctl'
  fi

  printf 'One Person Lab local App authorization finished.\n'
  printf '  app_path: %s\n' "$OPL_LOCAL_APP_PATH"
  printf '  quarantine_before: %s\n' "$before_quarantine"
  printf '  quarantine_after: %s\n' "$after_quarantine"
  printf '  codesign_status: %s\n' "$codesign_status"
  printf '  spctl_status: %s\n' "$spctl_status"
  if [ "$after_quarantine" != "0" ]; then
    printf 'Some quarantine attributes remain. Inspect /tmp/opl-local-app-authorization.xattr.log and retry from an administrator account.\n' >&2
    exit 1
  fi
  if [ "$spctl_status" != "passed" ]; then
    printf 'Gatekeeper assessment did not pass. The Stable install path records this as an unsigned local-authorization diagnostic after quarantine removal.\n' >&2
  fi
}

confirm_stable_macos_install() {
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    printf 'Stable macOS install needs confirmation. Re-run with --yes when using a non-interactive installer.\n' >&2
    exit 1
  fi
  {
    printf 'One Person Lab will install this Stable App bundle with local macOS authorization:\n'
    printf '  %s\n' "$OPL_LOCAL_APP_PATH"
    printf 'This may replace an existing App at that path, remove recursive quarantine, and open the App.\n'
    printf 'Type "install" to continue: '
  } > /dev/tty
  local reply
  if ! IFS= read -r reply < /dev/tty; then
    printf 'Stable macOS install needs a controlling terminal, or pass --yes for explicit non-interactive confirmation.\n' >&2
    exit 1
  fi
  if [ "$reply" != "install" ]; then
    printf 'Stable macOS install cancelled.\n' >&2
    exit 1
  fi
}

resolve_latest_release_tag() {
  local latest_url effective_url tag
  latest_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/latest"
  effective_url=$(curl -fsSIL -o /dev/null -w '%{url_effective}' "$latest_url")
  tag="${effective_url##*/}"
  case "$tag" in
    v*)
      printf '%s\n' "$tag"
      ;;
    *)
      printf 'Could not resolve latest One Person Lab App release tag from: %s\n' "$effective_url" >&2
      exit 1
      ;;
  esac
}

release_asset_name() {
  local tag="$1"
  local profile="$2"
  local version="${tag#v}"
  case "$profile" in
    full)
      printf 'One-Person-Lab-Full-%s-mac-arm64.dmg\n' "$version"
      ;;
    standard)
      printf 'One-Person-Lab-%s-mac-arm64.dmg\n' "$version"
      ;;
    *)
      printf 'Unsupported --stable-macos-install package profile: %s\n' "$profile" >&2
      printf 'Expected one of: full, standard\n' >&2
      exit 1
      ;;
  esac
}

download_or_use_dmg() {
  local work_dir="$1"
  local tag asset_name url dmg_path
  if [ -n "$STABLE_MACOS_DMG_PATH" ]; then
    if [ ! -f "$STABLE_MACOS_DMG_PATH" ]; then
      printf 'DMG path not found: %s\n' "$STABLE_MACOS_DMG_PATH" >&2
      exit 1
    fi
    printf '%s\n' "$STABLE_MACOS_DMG_PATH"
    return 0
  fi

  if [ -n "$STABLE_MACOS_DMG_URL" ]; then
    url="$STABLE_MACOS_DMG_URL"
    asset_name="${url##*/}"
  else
    tag="$STABLE_MACOS_RELEASE_TAG"
    if [ -z "$tag" ]; then
      tag=$(resolve_latest_release_tag)
    fi
    asset_name=$(release_asset_name "$tag" "$STABLE_MACOS_PACKAGE_PROFILE")
    url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
  fi
  dmg_path="$work_dir/$asset_name"
  printf 'Downloading One Person Lab App DMG:\n  %s\n' "$url" >&2
  curl --http1.1 --connect-timeout 20 --max-time 1800 --retry 3 --retry-delay 2 --retry-all-errors -fL "$url" -o "$dmg_path"
  printf '%s\n' "$dmg_path"
}

copy_app_from_dmg() {
  local dmg_path="$1"
  local work_dir="$2"
  local mount_dir="$work_dir/mount"
  local source_app
  mkdir -p "$mount_dir"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/tmp/opl-stable-macos-install.hdiutil-attach.log
  source_app=$(find "$mount_dir" -maxdepth 2 -type d -name '*.app' -print -quit)
  if [ -z "$source_app" ]; then
    printf 'Mounted DMG did not contain an App bundle.\n' >&2
    exit 1
  fi
  ensure_app_target_path
  run_with_sudo_fallback mkdir mkdir -p "$(dirname "$OPL_LOCAL_APP_PATH")" || {
    printf 'Failed to prepare App target directory: %s\n' "$(dirname "$OPL_LOCAL_APP_PATH")" >&2
    exit 1
  }
  if [ -e "$OPL_LOCAL_APP_PATH" ]; then
    run_with_sudo_fallback remove-existing-app rm -rf "$OPL_LOCAL_APP_PATH" || {
      printf 'Failed to replace existing App bundle: %s\n' "$OPL_LOCAL_APP_PATH" >&2
      exit 1
    }
  fi
  run_with_sudo_fallback copy-app ditto "$source_app" "$OPL_LOCAL_APP_PATH" || {
    printf 'Failed to copy App bundle into: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    exit 1
  }
  hdiutil detach "$mount_dir" >/tmp/opl-stable-macos-install.hdiutil-detach.log 2>&1 || true
}

stable_macos_install() {
  if ! is_macos; then
    printf 'Stable macOS App install is macOS-only.\n' >&2
    exit 1
  fi
  for required_command in curl hdiutil ditto find xattr; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      printf 'Missing required command: %s\n' "$required_command" >&2
      exit 1
    fi
  done
  ensure_app_target_path
  confirm_stable_macos_install

  local dmg_path
  STABLE_MACOS_WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opl-stable-macos-install.XXXXXX")
  cleanup_stable_macos_install() {
    if [ -n "$STABLE_MACOS_WORK_DIR" ] && [ -d "$STABLE_MACOS_WORK_DIR/mount" ]; then
      hdiutil detach "$STABLE_MACOS_WORK_DIR/mount" >/tmp/opl-stable-macos-install.hdiutil-detach.log 2>&1 || true
    fi
    if [ -n "$STABLE_MACOS_WORK_DIR" ]; then
      rm -rf "$STABLE_MACOS_WORK_DIR"
    fi
  }
  trap cleanup_stable_macos_install EXIT

  dmg_path=$(download_or_use_dmg "$STABLE_MACOS_WORK_DIR")
  copy_app_from_dmg "$dmg_path" "$STABLE_MACOS_WORK_DIR"
  AUTHORIZE_LOCAL_APP_YES=1
  authorize_local_app

  if [ "$STABLE_MACOS_OPEN" = "1" ]; then
    if open "$OPL_LOCAL_APP_PATH"; then
      printf 'One Person Lab App opened.\n'
    else
      printf 'The App was installed and locally authorized, but macOS did not open it automatically. Open it manually from: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    fi
  fi
  printf 'One Person Lab Stable macOS install finished.\n'
  print_stable_macos_next_steps
}

if [ "$STABLE_MACOS_INSTALL" = "1" ]; then
  stable_macos_install
  exit 0
fi

if [ "$AUTHORIZE_LOCAL_APP_ONLY" = "1" ]; then
  authorize_local_app
  exit 0
fi

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

if [ "$AUTHORIZE_LOCAL_APP" = "1" ]; then
  authorize_local_app
fi

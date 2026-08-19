#!/usr/bin/env bash
set -euo pipefail

OPL_INSTALL_SCRIPT_URL=${OPL_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh}
OPL_LOCAL_APP_PATH=${OPL_LOCAL_APP_PATH:-/Applications/One Person Lab.app}
OPL_APP_RELEASE_REPO=${OPL_APP_RELEASE_REPO:-gaofeng21cn/one-person-lab-app}
OPL_APP_DOCS_REF=${OPL_APP_DOCS_REF:-main}
OPL_INSTALLER_CACHE_DIR=${OPL_INSTALLER_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/one-person-lab/installers}
OPL_APP_SOURCE_REF=${OPL_APP_SOURCE_REF:-}
OPL_SHELL_SOURCE_REF=${OPL_SHELL_SOURCE_REF:-}
OPL_FRAMEWORK_SOURCE_REF=${OPL_FRAMEWORK_SOURCE_REF:-}
OPL_APP_RELEASE_SELECTOR=${OPL_APP_RELEASE_SELECTOR:-latest}
OPL_FROZEN_RELEASE_TAG=${OPL_FROZEN_RELEASE_TAG:-}
OPL_RELEASE_VERSION=${OPL_RELEASE_VERSION:-}
OPL_RELEASE_REPO=${OPL_RELEASE_REPO:-${OPL_APP_RELEASE_REPO}}
OPL_CONTAINER_WEBUI_TAG=${OPL_CONTAINER_WEBUI_TAG:-}
OPL_INSTALL_RUNTIME_FORM=${OPL_INSTALL_RUNTIME_FORM:-auto}
export OPL_RELEASE_VERSION OPL_RELEASE_REPO OPL_FRAMEWORK_SOURCE_REF

INSTALL_ARGS=()
AUTHORIZE_LOCAL_APP=0
AUTHORIZE_LOCAL_APP_ONLY=0
AUTHORIZE_LOCAL_APP_YES=${OPL_AUTHORIZE_LOCAL_APP_YES:-0}
STABLE_MACOS_INSTALL=0
STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=0
if [ -n "${OPL_STABLE_MACOS_PACKAGE_PROFILE+x}" ]; then
  STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=1
fi
STABLE_MACOS_PACKAGE_PROFILE=${OPL_STABLE_MACOS_PACKAGE_PROFILE:-full}
STABLE_MACOS_RELEASE_TAG=${OPL_STABLE_MACOS_RELEASE_TAG:-}
STABLE_MACOS_DMG_URL=${OPL_STABLE_MACOS_DMG_URL:-}
STABLE_MACOS_DMG_PATH=${OPL_STABLE_MACOS_DMG_PATH:-}
STABLE_MACOS_DMG_SHA256=${OPL_STABLE_MACOS_DMG_SHA256:-}
STABLE_MACOS_OPEN=${OPL_STABLE_MACOS_OPEN:-1}
STABLE_MACOS_WORK_DIR=''
STABLE_MACOS_RESOLVED_DMG_PATH=''
STABLE_MACOS_RESOLVED_DMG_SHA256=''
STABLE_MACOS_RELEASE_RECORD_PATH=''
STABLE_MACOS_RELEASE_PRERELEASE=''
STABLE_MACOS_COMPONENT_MANIFEST_PATH=''
STABLE_MACOS_COMPONENT_MANIFEST_SHA256=''
STABLE_MACOS_FULL_MANIFEST_PATH=''
STABLE_MACOS_RELEASE_QUALITY_ASSERTED=0
STABLE_MACOS_RELEASE_QUALITY=''
LINUX_DESKTOP_WORK_DIR=''
DESKTOP_WEBUI_MODE=0
INSTALL_SCENARIO=${OPL_INSTALL_SCENARIO:-personal}
PRINT_INSTALL_ROUTE=0
OPEN_OPTION_EXPLICIT=''

usage() {
  cat <<'USAGE'
Usage:
  install.sh [OPL install args...]
  install.sh [--runtime-form auto|desktop|webui|container-webui|headless] [--standard|--full]
  install.sh [--server|--isolated|--headless]
  install.sh --stable-macos-install [--full|--standard] [--release-tag vX.Y.Z] [--yes]
  install.sh --authorize-local-app-only [--app-path "/Applications/One Person Lab.app"] [--yes]

Options:
  By default, personal macOS and Linux x86_64 hosts install the platform
  Desktop payload. --webui starts the packaged Desktop bytes in browser mode.
  Server and isolated hosts use Container WebUI.
  --runtime-form <form>      Select auto, desktop, webui, container-webui, or headless.
  --desktop                 Require the platform Desktop payload.
  --webui                   Prefer the installed Desktop payload in WebUI mode.
  --native-webui            Deprecated alias for --webui.
  --container-webui         Use the Container WebUI installer.
  --server                  Select the Container WebUI server path.
  --isolated                Select the Container WebUI isolation path.
  --headless                Install OPL Base only, without an App runtime form.
  --print-install-route     Resolve and print the selected route without installing.
  --stable-macos-install     Download, copy, locally authorize, and open the App release.
  --full                     Require the Full Desktop density. macOS selects the exact Full DMG;
                             Linux fails closed because no Linux Full carrier is published.
  --standard                 Require the Standard Desktop density for the selected platform.
  --release-tag <tag>        GitHub Release tag for --stable-macos-install. Defaults to latest.
  --dmg-url <url>            Download a specific DMG URL for --stable-macos-install.
  --dmg-path <path>          Install from a local DMG path for --stable-macos-install.
  --dmg-sha256 <digest>      Required SHA256 for a custom DMG URL or local DMG path.
  --authorize-local-app      After setup, remove macOS quarantine from a local App bundle.
  --authorize-local-app-only Only run the local App authorization helper.
  --app-path <path>          App bundle path for the local authorization helper.
  --open                    Open the App after --stable-macos-install. This is the default.
  --no-open                 Do not open the App after --stable-macos-install.
  --yes                     Confirm local App authorization non-interactively.

The macOS App install path uses local authorization and does not require Apple Developer ID signing.
For an official GitHub Release, it verifies the component manifest and displays the
actual Stable or Preview quality. A custom DMG source has no asserted release quality.
Without an explicit package profile, the legacy-named option prefers Full and falls
back to Standard only when the Full asset is not yet published.
USAGE
}

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --stable-macos-install)
      STABLE_MACOS_INSTALL=1
      ;;
    --full)
      STABLE_MACOS_PACKAGE_PROFILE=full
      STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=1
      ;;
    --standard)
      STABLE_MACOS_PACKAGE_PROFILE=standard
      STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT=1
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
    --dmg-sha256)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --dmg-sha256\n' >&2
        exit 1
      fi
      STABLE_MACOS_DMG_SHA256="$1"
      ;;
    --dmg-sha256=*)
      STABLE_MACOS_DMG_SHA256="${arg#--dmg-sha256=}"
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
      OPEN_OPTION_EXPLICIT=--open
      ;;
    --no-open)
      STABLE_MACOS_OPEN=0
      OPEN_OPTION_EXPLICIT=--no-open
      ;;
    --runtime-form)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --runtime-form\n' >&2
        exit 1
      fi
      OPL_INSTALL_RUNTIME_FORM="$1"
      ;;
    --runtime-form=*)
      OPL_INSTALL_RUNTIME_FORM="${arg#--runtime-form=}"
      ;;
    --desktop)
      OPL_INSTALL_RUNTIME_FORM=desktop
      ;;
    --webui|--browser)
      OPL_INSTALL_RUNTIME_FORM=webui
      ;;
    --native-webui)
      printf '%s\n' '--native-webui is deprecated; using the packaged Desktop WebUI mode.' >&2
      OPL_INSTALL_RUNTIME_FORM=webui
      ;;
    --container-webui)
      OPL_INSTALL_RUNTIME_FORM=container-webui
      ;;
    --server)
      INSTALL_SCENARIO=server
      ;;
    --isolated|--isolation)
      INSTALL_SCENARIO=isolated
      ;;
    --headless)
      OPL_INSTALL_RUNTIME_FORM=headless
      ;;
    --print-install-route)
      PRINT_INSTALL_ROUTE=1
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

if [ -n "$OPL_FROZEN_RELEASE_TAG" ]; then
  if [ -n "$STABLE_MACOS_RELEASE_TAG" ] && [ "$STABLE_MACOS_RELEASE_TAG" != "$OPL_FROZEN_RELEASE_TAG" ]; then
    printf 'This version-frozen installer is bound to Release tag %s.\n' "$OPL_FROZEN_RELEASE_TAG" >&2
    exit 1
  fi
  STABLE_MACOS_RELEASE_TAG="$OPL_FROZEN_RELEASE_TAG"
fi

arg_present() {
  local expected="$1"
  if [ "${#INSTALL_ARGS[@]}" -eq 0 ]; then
    return 1
  fi
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

platform_family() {
  case "$(uname -s)" in
    Darwin)
      printf 'macos\n'
      ;;
    Linux)
      printf 'linux\n'
      ;;
    MINGW*|MSYS*|CYGWIN*)
      printf 'windows\n'
      ;;
    *)
      printf 'unsupported\n'
      ;;
  esac
}

normalize_runtime_form() {
  case "$OPL_INSTALL_RUNTIME_FORM" in
    auto)
      printf 'auto\n'
      ;;
    desktop)
      printf 'desktop\n'
      ;;
    webui|browser)
      printf 'webui\n'
      ;;
    native|native-webui|native_webui)
      printf '%s\n' 'native-webui is deprecated; using the packaged Desktop WebUI mode.' >&2
      printf 'webui\n'
      ;;
    container|container-webui|container_webui|docker)
      printf 'container-webui\n'
      ;;
    headless|base|base-only|base_only)
      printf 'headless\n'
      ;;
    *)
      printf 'Unsupported runtime form: %s\n' "$OPL_INSTALL_RUNTIME_FORM" >&2
      return 1
      ;;
  esac
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf 'shasum or sha256sum is required for SHA256 verification.\n' >&2
    return 1
  fi
}

cleanup_installer() {
  if [ -n "$LINUX_DESKTOP_WORK_DIR" ]; then
    rm -rf "$LINUX_DESKTOP_WORK_DIR"
  fi
}

linux_desktop_target_supported() {
  [ "$(platform_family)" = linux ] && { [ "$(uname -m)" = x86_64 ] || [ "$(uname -m)" = amd64 ]; }
}

resolve_install_route() {
  local platform runtime_form machine
  platform=$(platform_family)
  runtime_form=$(normalize_runtime_form) || return 1
  machine=$(uname -m)

  if [ "$platform" = "unsupported" ]; then
    printf 'Unsupported platform for OPL App installer: %s\n' "$(uname -s)" >&2
    exit 1
  fi
  case "$INSTALL_SCENARIO" in
    personal|server|isolated)
      ;;
    *)
      printf 'Unsupported install scenario: %s\n' "$INSTALL_SCENARIO" >&2
      exit 1
      ;;
  esac

  if [ "$runtime_form" = "headless" ]; then
    printf 'headless\n'
    return
  fi
  if [ "$INSTALL_SCENARIO" = "server" ] || [ "$INSTALL_SCENARIO" = "isolated" ]; then
    if [ "$runtime_form" != "auto" ] && [ "$runtime_form" != "webui" ] && [ "$runtime_form" != "container-webui" ]; then
      printf 'Server or isolated installs require the Container WebUI runtime form.\n' >&2
      exit 1
    fi
    printf 'container-webui\n'
    return
  fi

  case "$runtime_form" in
    desktop)
      if [ "$platform" = macos ] && [ "$machine" = arm64 ]; then
        printf 'desktop\n'
      elif linux_desktop_target_supported; then
        printf 'linux-desktop\n'
      else
        printf 'Desktop installation is currently supported only on macOS arm64 and Linux x86_64.\n' >&2
        exit 1
      fi
      ;;
    container-webui)
      printf 'container-webui\n'
      ;;
    webui)
      if [ "$platform" = macos ] && [ "$machine" = arm64 ]; then
        printf 'desktop-webui\n'
      elif linux_desktop_target_supported; then
        printf 'linux-desktop-webui\n'
      elif [ "$platform" = windows ]; then
        printf 'container-webui\n'
      else
        printf 'Desktop WebUI is currently supported only on macOS arm64 and Linux x86_64.\n' >&2
        exit 1
      fi
      ;;
    auto)
      case "$platform" in
        macos)
          if [ "$machine" = arm64 ]; then
            printf 'desktop\n'
          else
            printf 'Desktop installation is currently supported only on macOS arm64 and Linux x86_64.\n' >&2
            exit 1
          fi
          ;;
        linux)
          if linux_desktop_target_supported; then
            printf 'linux-desktop\n'
          else
            printf 'Desktop installation is currently supported only on macOS arm64 and Linux x86_64.\n' >&2
            exit 1
          fi
          ;;
        windows)
          printf 'container-webui\n'
          ;;
      esac
      ;;
  esac
}

validate_install_density_for_route() {
  local selected_route="$1"
  case "$selected_route" in
    linux-desktop|linux-desktop-webui)
      if [ "$STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT" = "1" ] \
        && [ "$STABLE_MACOS_PACKAGE_PROFILE" = "full" ]; then
        printf 'Full Desktop density is not published for Linux x86_64; use --standard or select a published macOS Full carrier.\n' >&2
        return 1
      fi
      ;;
  esac
}

print_resolved_install_route() {
  local selected_route="$1"
  case "$selected_route" in
    desktop|desktop-webui|linux-desktop|linux-desktop-webui)
      if [ "$STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT" = "1" ]; then
        printf '%s-%s\n' "$selected_route" "$STABLE_MACOS_PACKAGE_PROFILE"
        return
      fi
      ;;
  esac
  printf '%s\n' "$selected_route"
}

desktop_release_asset_selection_requested() {
  [ "$STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT" = "1" ] \
    || [ -n "$OPL_FROZEN_RELEASE_TAG" ] \
    || [ -n "$STABLE_MACOS_RELEASE_TAG" ] \
    || [ -n "$STABLE_MACOS_DMG_URL" ] \
    || [ -n "$STABLE_MACOS_DMG_PATH" ]
}

install_desktop_bootstrap() {
  if ! arg_present "--with-app"; then
    INSTALL_ARGS+=("--with-app")
  fi
  export OPL_RELEASE_VERSION OPL_RELEASE_REPO
  curl -fsSL "$OPL_INSTALL_SCRIPT_URL" | bash -s -- "${INSTALL_ARGS[@]}"
}

find_linux_desktop_executable() {
  local package_name="$1"
  local candidate selected=''
  while IFS= read -r candidate; do
    case "$(basename "$candidate")" in
      'One Person Lab'|one-person-lab|aionui)
        if [ -z "$selected" ]; then
          selected="$candidate"
        fi
        ;;
    esac
  done < <(dpkg -L "$package_name" 2>/dev/null | LC_ALL=C sort)
  if [ -n "$selected" ]; then
    printf '%s\n' "$selected"
    return 0
  fi
  return 1
}

install_linux_desktop() {
  local record_path tag version asset_name package_path package_name executable
  local mac_asset_name mac_asset_sha256
  for required_command in curl python3 dpkg dpkg-deb apt-get; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      printf 'Linux Desktop install requires: %s\n' "$required_command" >&2
      return 1
    fi
  done
  LINUX_DESKTOP_WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opl-linux-desktop-install.XXXXXX") || return 1
  if [ -z "$STABLE_MACOS_RELEASE_TAG" ]; then
    resolve_latest_release_tag "$LINUX_DESKTOP_WORK_DIR" >/dev/null || return 1
  else
    resolve_release_record "$LINUX_DESKTOP_WORK_DIR" || return 1
  fi
  record_path="$STABLE_MACOS_RELEASE_RECORD_PATH"
  tag="$STABLE_MACOS_RELEASE_TAG"
  version="${tag#v}"
  mac_asset_name=$(release_asset_name "$tag" standard)
  resolve_release_asset "$record_path" "$mac_asset_name" || return 1
  mac_asset_sha256="$RELEASE_ASSET_SHA256"
  download_and_validate_component_manifest \
    "$LINUX_DESKTOP_WORK_DIR" "$record_path" "$tag" "$mac_asset_name" "$mac_asset_sha256" || return 1
  asset_name="One-Person-Lab-${version}-linux-x64.deb"
  package_path="$LINUX_DESKTOP_WORK_DIR/$asset_name"
  resolve_release_asset "$record_path" "$asset_name" || {
    printf 'Selected Desktop Release has no unique Linux x64 package: %s\n' "$asset_name" >&2
    return 1
  }
  [ "$RELEASE_ASSET_URL" = "https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name" ] || {
    printf 'Linux Desktop asset URL is not bound to the selected Desktop Release.\n' >&2
    return 1
  }
  download_release_file "$RELEASE_ASSET_URL" "$package_path" 'Linux Desktop package' || return 1
  verify_file_sha256 "$package_path" "$RELEASE_ASSET_SHA256" 'Linux Desktop package' || return 1
  verify_file_size "$package_path" "$RELEASE_ASSET_SIZE_BYTES" 'Linux Desktop package' || return 1
  package_name=$(dpkg-deb -f "$package_path" Package 2>/dev/null) || return 1
  [ -n "$package_name" ] || return 1
  run_with_sudo_fallback linux-desktop apt-get install -y "$package_path" || {
    printf 'Linux Desktop package installation failed.\n' >&2
    return 1
  }
  executable=$(find_linux_desktop_executable "$package_name") || {
    printf 'Linux Desktop package installed but its executable could not be located.\n' >&2
    return 1
  }
  printf 'Installed Linux Desktop payload: %s\n' "$executable"
  if [ "$STABLE_MACOS_OPEN" = '1' ]; then
    if [ "$DESKTOP_WEBUI_MODE" = '1' ]; then
      nohup "$executable" --webui >/tmp/opl-linux-desktop-webui.log 2>&1 &
    else
      nohup "$executable" >/tmp/opl-linux-desktop.log 2>&1 &
    fi
  fi
  rm -rf "$LINUX_DESKTOP_WORK_DIR"
  LINUX_DESKTOP_WORK_DIR=''
}

install_headless_base() {
  if ! arg_present "--headless"; then
    INSTALL_ARGS+=("--headless")
  fi
  if ! arg_present "--skip-packages" && ! arg_present "--package" && ! arg_present "--packages"; then
    INSTALL_ARGS+=("--skip-packages")
  fi
  curl -fsSL "$OPL_INSTALL_SCRIPT_URL" | bash -s -- "${INSTALL_ARGS[@]}"
}

install_container_webui() {
  local container_args=()
  if [ "${#INSTALL_ARGS[@]}" -gt 0 ]; then
    container_args=("${INSTALL_ARGS[@]}")
  fi
  if [ -n "$OPL_CONTAINER_WEBUI_TAG" ]; then
    container_args+=("--tag" "$OPL_CONTAINER_WEBUI_TAG")
  fi
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    container_args+=("--yes")
  fi
  if [ "$OPEN_OPTION_EXPLICIT" = "--no-open" ]; then
    container_args+=("--no-open")
  fi
  acquire_docker_webui_installer || return 1
  if [ "${#container_args[@]}" -eq 0 ]; then
    bash "$DOCKER_WEBUI_INSTALLER_PATH"
  else
    bash "$DOCKER_WEBUI_INSTALLER_PATH" "${container_args[@]}"
  fi
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
  printf 'If macOS still asks for repeated approval, use a reviewed source checkout and run:\n'
  printf '  ./install.sh --authorize-local-app-only --app-path "%s" --yes\n' "$OPL_LOCAL_APP_PATH"
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
    printf 'macOS App install needs confirmation. Re-run with --yes when using a non-interactive installer.\n' >&2
    exit 1
  fi
  {
    printf 'One Person Lab will install this App bundle with local macOS authorization:\n'
    printf '  %s\n' "$OPL_LOCAL_APP_PATH"
    printf 'This may replace an existing App at that path, remove recursive quarantine, and open the App.\n'
    printf 'Type "install" to continue: '
  } > /dev/tty
  local reply
  if ! IFS= read -r reply < /dev/tty; then
    printf 'macOS App install needs a controlling terminal, or pass --yes for explicit non-interactive confirmation.\n' >&2
    exit 1
  fi
  if [ "$reply" != "install" ]; then
    printf 'macOS App install cancelled.\n' >&2
    exit 1
  fi
}

validate_sha256_value() {
  case "$1" in
    *[!0-9a-f]*|'')
      return 1
      ;;
  esac
  [ "${#1}" -eq 64 ]
}

validate_positive_integer() {
  case "$1" in
    *[!0-9]*|'')
      return 1
      ;;
  esac
  [ "$1" -gt 0 ]
}

validate_release_tag() {
  case "$1" in
    v[0-9A-Za-z._-]*)
      ;;
    *)
      return 1
      ;;
  esac
  case "$1" in
    *[!0-9A-Za-z._-]*)
      return 1
      ;;
  esac
}

validate_git_sha() {
  case "$1" in
    *[!0-9a-f]*|'')
      return 1
      ;;
  esac
  [ "${#1}" -eq 40 ]
}

release_record_value() {
  local record_path="$1"
  local key_path="$2"
  if command -v plutil >/dev/null 2>&1; then
    if plutil -extract "$key_path" raw -o - "$record_path"; then
      return 0
    fi
  fi
  python3 - "$record_path" "$key_path" <<'PY'
import json
import sys

value = json.load(open(sys.argv[1], encoding='utf-8'))
for part in sys.argv[2].split('.'):
    value = value[int(part)] if isinstance(value, list) else value[part]
if value is None:
    print('null')
elif value is True:
    print('true')
elif value is False:
    print('false')
elif isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(',', ':')))
else:
    print(value)
PY
}

download_release_record() {
  local selector="$1"
  local record_path="$2"
  local endpoint api_path curl_error_path curl_status=0
  if ! command -v plutil >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
    printf 'plutil or python3 is required to verify the exact GitHub Release record.\n' >&2
    return 1
  fi
  if [ "$selector" = "latest" ]; then
    api_path="repos/$OPL_APP_RELEASE_REPO/releases/latest"
  else
    validate_release_tag "$selector" || {
      printf 'Invalid GitHub Release tag: %s\n' "$selector" >&2
      return 1
    }
    api_path="repos/$OPL_APP_RELEASE_REPO/releases/tags/$selector"
  fi
  endpoint="https://api.github.com/$api_path"
  curl_error_path="${record_path}.curl.stderr"
  if curl -fsSL \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: one-person-lab-installer' \
    "$endpoint" \
    -o "$record_path" \
    2>"$curl_error_path"; then
    rm -f "$curl_error_path"
    return 0
  else
    curl_status=$?
  fi
  rm -f "$record_path"
  if command -v gh >/dev/null 2>&1 \
    && GH_PROMPT_DISABLED=1 gh api --hostname github.com \
      -H 'Accept: application/vnd.github+json' \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "$api_path" >"$record_path"; then
    rm -f "$curl_error_path"
    printf 'Anonymous GitHub Release API request failed; used authenticated gh fallback.\n' >&2
    return 0
  fi
  rm -f "$record_path"
  if [ -f "$curl_error_path" ]; then
    cat "$curl_error_path" >&2
    rm -f "$curl_error_path"
  fi
  return "$curl_status"
}

resolve_release_record() {
  local work_dir="$1"
  local requested_tag="$STABLE_MACOS_RELEASE_TAG"
  local selector="${requested_tag:-latest}"
  local record_path="$work_dir/github-release.json"
  local resolved_tag draft prerelease
  download_release_record "$selector" "$record_path" || return 1
  resolved_tag=$(release_record_value "$record_path" tag_name) || {
    printf 'GitHub Release record does not contain tag_name.\n' >&2
    return 1
  }
  validate_release_tag "$resolved_tag" || {
    printf 'GitHub Release record returned an invalid tag: %s\n' "$resolved_tag" >&2
    return 1
  }
  if [ -n "$requested_tag" ] && [ "$resolved_tag" != "$requested_tag" ]; then
    printf 'GitHub Release record tag mismatch: expected %s, got %s.\n' "$requested_tag" "$resolved_tag" >&2
    return 1
  fi
  draft=$(release_record_value "$record_path" draft) || {
    printf 'GitHub Release record does not contain draft state.\n' >&2
    return 1
  }
  if [ "$draft" != "false" ]; then
    printf 'macOS App install requires a published GitHub Release record.\n' >&2
    return 1
  fi
  prerelease=$(release_record_value "$record_path" prerelease) || {
    printf 'GitHub Release record does not contain prerelease state.\n' >&2
    return 1
  }
  case "$prerelease" in
    true|false)
      ;;
    *)
      printf 'GitHub Release record has an invalid prerelease state.\n' >&2
      return 1
      ;;
  esac
  STABLE_MACOS_RELEASE_TAG="$resolved_tag"
  STABLE_MACOS_RELEASE_RECORD_PATH="$record_path"
  STABLE_MACOS_RELEASE_PRERELEASE="$prerelease"
}

resolve_latest_release_tag() {
  local work_dir="$1"
  resolve_release_record "$work_dir" || return 1
  printf '%s\n' "$STABLE_MACOS_RELEASE_TAG"
}

RELEASE_ASSET_URL=''
RELEASE_ASSET_SHA256=''
RELEASE_ASSET_SIZE_BYTES=''

resolve_release_asset() {
  local record_path="$1"
  local expected_name="$2"
  local index=0 name digest url size matches=0
  RELEASE_ASSET_URL=''
  RELEASE_ASSET_SHA256=''
  RELEASE_ASSET_SIZE_BYTES=''
  while name=$(release_record_value "$record_path" "assets.$index.name" 2>/dev/null); do
    if [ "$name" = "$expected_name" ]; then
      matches=$((matches + 1))
      digest=$(release_record_value "$record_path" "assets.$index.digest") || return 1
      url=$(release_record_value "$record_path" "assets.$index.browser_download_url") || return 1
      size=$(release_record_value "$record_path" "assets.$index.size") || return 1
      case "$digest" in
        sha256:*)
          digest="${digest#sha256:}"
          ;;
        *)
          return 1
          ;;
      esac
      validate_sha256_value "$digest" || return 1
      validate_positive_integer "$size" || return 1
      RELEASE_ASSET_SHA256="$digest"
      RELEASE_ASSET_URL="$url"
      RELEASE_ASSET_SIZE_BYTES="$size"
    fi
    index=$((index + 1))
  done
  [ "$matches" -eq 1 ]
}

download_release_page() {
  local page="$1"
  local record_path="$2"
  local api_path="repos/$OPL_APP_RELEASE_REPO/releases?per_page=100&page=$page"
  local endpoint="https://api.github.com/$api_path"
  local curl_error_path="${record_path}.curl.stderr"
  local curl_status=0
  if curl -fsSL \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: one-person-lab-installer' \
    "$endpoint" \
    -o "$record_path" \
    2>"$curl_error_path"; then
    rm -f "$curl_error_path"
    return 0
  else
    curl_status=$?
  fi
  rm -f "$record_path"
  if command -v gh >/dev/null 2>&1 \
    && GH_PROMPT_DISABLED=1 gh api --hostname github.com \
      -H 'Accept: application/vnd.github+json' \
      -H 'X-GitHub-Api-Version: 2022-11-28' \
      "$api_path" >"$record_path"; then
    rm -f "$curl_error_path"
    printf 'Anonymous GitHub Release API request failed; used authenticated gh fallback.\n' >&2
    return 0
  fi
  rm -f "$record_path"
  if [ -f "$curl_error_path" ]; then
    cat "$curl_error_path" >&2
    rm -f "$curl_error_path"
  fi
  return "$curl_status"
}

require_caller_dmg_sha256() {
  if ! validate_sha256_value "$STABLE_MACOS_DMG_SHA256"; then
    printf 'Custom DMG URL or path requires --dmg-sha256 with 64 lowercase hexadecimal characters.\n' >&2
    return 1
  fi
}

verify_resolved_dmg() {
  local dmg_path="$1"
  local expected_sha256="$2"
  verify_file_sha256 "$dmg_path" "$expected_sha256" 'DMG'
}

verify_file_sha256() {
  local file_path="$1"
  local expected_sha256="$2"
  local label="$3"
  local actual_sha256
  actual_sha256=$(sha256_file "$file_path") || return 1
  if [ "$actual_sha256" != "$expected_sha256" ]; then
    printf '%s SHA256 mismatch: expected %s, got %s.\n' "$label" "$expected_sha256" "$actual_sha256" >&2
    return 1
  fi
}

verify_file_size() {
  local file_path="$1"
  local expected_size="$2"
  local label="$3"
  local actual_size
  validate_positive_integer "$expected_size" || {
    printf '%s expected size is invalid: %s.\n' "$label" "$expected_size" >&2
    return 1
  }
  actual_size=$(wc -c < "$file_path" | tr -d ' ') || return 1
  if [ "$actual_size" != "$expected_size" ]; then
    printf '%s size mismatch: expected %s, got %s.\n' "$label" "$expected_size" "$actual_size" >&2
    return 1
  fi
}

release_asset_name() {
  local tag="$1"
  local profile="$2"
  local version
  case "$profile" in
    full)
      version="${tag#v}"
      printf 'One-Person-Lab-Full-%s-mac-arm64.dmg\n' "$version"
      ;;
    standard)
      version="${tag#v}"
      printf 'One-Person-Lab-%s-mac-arm64.dmg\n' "$version"
      ;;
    *)
      printf 'Unsupported --stable-macos-install package profile: %s\n' "$profile" >&2
      printf 'Expected one of: full, standard\n' >&2
      exit 1
      ;;
  esac
}

DOWNLOAD_HTTP_CODE=''

download_release_file() {
  local url="$1"
  local output_path="$2"
  local label="$3"
  local curl_status=0
  DOWNLOAD_HTTP_CODE=''
  printf 'Downloading One Person Lab App %s:\n  %s\n' "$label" "$url" >&2
  DOWNLOAD_HTTP_CODE=$(curl --http1.1 --connect-timeout 20 --max-time 1800 --retry 3 --retry-delay 2 -fsSL -w '%{http_code}' "$url" -o "$output_path") || curl_status=$?
  if [ "$curl_status" -eq 0 ]; then
    return 0
  fi
  rm -f "$output_path"
  return "$curl_status"
}

docker_webui_installer_cache_paths() {
  DOCKER_WEBUI_INSTALLER_CACHE_PATH="$OPL_INSTALLER_CACHE_DIR/install-docker-webui.sh"
  DOCKER_WEBUI_INSTALLER_CACHE_IDENTITY_PATH="$OPL_INSTALLER_CACHE_DIR/install-docker-webui.identity.json"
}

validate_cached_docker_webui_installer() {
  local identity_path installer_path schema repository tag name url sha256 size expected_url
  docker_webui_installer_cache_paths
  identity_path="$DOCKER_WEBUI_INSTALLER_CACHE_IDENTITY_PATH"
  installer_path="$DOCKER_WEBUI_INSTALLER_CACHE_PATH"
  [ -f "$identity_path" ] && [ ! -L "$identity_path" ] \
    && [ -f "$installer_path" ] && [ ! -L "$installer_path" ] || return 1
  schema=$(release_record_value "$identity_path" schema 2>/dev/null) || return 1
  repository=$(release_record_value "$identity_path" repository 2>/dev/null) || return 1
  tag=$(release_record_value "$identity_path" release_tag 2>/dev/null) || return 1
  name=$(release_record_value "$identity_path" asset.name 2>/dev/null) || return 1
  url=$(release_record_value "$identity_path" asset.url 2>/dev/null) || return 1
  sha256=$(release_record_value "$identity_path" asset.sha256 2>/dev/null) || return 1
  size=$(release_record_value "$identity_path" asset.size_bytes 2>/dev/null) || return 1
  [ "$schema" = 'opl_verified_installer_cache.v1' ] \
    && [ "$repository" = "$OPL_APP_RELEASE_REPO" ] \
    && validate_release_tag "$tag" \
    && [ "$name" = 'install-docker-webui.sh' ] \
    && validate_sha256_value "$sha256" \
    && validate_positive_integer "$size" || return 1
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$name"
  [ "$url" = "$expected_url" ] || return 1
  verify_file_sha256 "$installer_path" "$sha256" 'Cached Docker/WebUI installer' || return 1
  verify_file_size "$installer_path" "$size" 'Cached Docker/WebUI installer' || return 1
  DOCKER_WEBUI_INSTALLER_PATH="$installer_path"
  DOCKER_WEBUI_INSTALLER_CACHE_TAG="$tag"
}

write_verified_docker_webui_installer_cache() {
  local source_path="$1"
  local tag="$2"
  local url="$3"
  local sha256="$4"
  local size="$5"
  local temporary_installer temporary_identity
  docker_webui_installer_cache_paths
  mkdir -p "$OPL_INSTALLER_CACHE_DIR" || return 1
  temporary_installer="$DOCKER_WEBUI_INSTALLER_CACHE_PATH.new.$$"
  temporary_identity="$DOCKER_WEBUI_INSTALLER_CACHE_IDENTITY_PATH.new.$$"
  cp "$source_path" "$temporary_installer" || return 1
  chmod 0755 "$temporary_installer" || return 1
  cat > "$temporary_identity" <<EOF
{
  "schema": "opl_verified_installer_cache.v1",
  "repository": "$OPL_APP_RELEASE_REPO",
  "release_tag": "$tag",
  "asset": {
    "name": "install-docker-webui.sh",
    "url": "$url",
    "sha256": "$sha256",
    "size_bytes": $size
  }
}
EOF
  verify_file_sha256 "$temporary_installer" "$sha256" 'Docker/WebUI installer cache candidate' \
    && verify_file_size "$temporary_installer" "$size" 'Docker/WebUI installer cache candidate' \
    && mv -f "$temporary_installer" "$DOCKER_WEBUI_INSTALLER_CACHE_PATH" \
    && mv -f "$temporary_identity" "$DOCKER_WEBUI_INSTALLER_CACHE_IDENTITY_PATH" || {
      rm -f "$temporary_installer" "$temporary_identity"
      return 1
    }
  DOCKER_WEBUI_INSTALLER_PATH="$DOCKER_WEBUI_INSTALLER_CACHE_PATH"
  DOCKER_WEBUI_INSTALLER_CACHE_TAG="$tag"
}

download_verified_docker_webui_installer() {
  local work_dir="$1"
  local record_path tag standard_asset_name standard_asset_sha256 asset_name asset_url asset_sha256 asset_size candidate
  resolve_release_record "$work_dir" || return 1
  record_path="$STABLE_MACOS_RELEASE_RECORD_PATH"
  tag="$STABLE_MACOS_RELEASE_TAG"
  standard_asset_name=$(release_asset_name "$tag" standard)
  resolve_release_asset "$record_path" "$standard_asset_name" || return 1
  standard_asset_sha256="$RELEASE_ASSET_SHA256"
  download_and_validate_component_manifest \
    "$work_dir" "$record_path" "$tag" "$standard_asset_name" "$standard_asset_sha256" || return 1

  asset_name='install-docker-webui.sh'
  resolve_release_asset "$record_path" "$asset_name" || {
    printf 'GitHub Release record has no unique digest-bound Docker/WebUI installer asset.\n' >&2
    return 1
  }
  asset_url="$RELEASE_ASSET_URL"
  asset_sha256="$RELEASE_ASSET_SHA256"
  asset_size="$RELEASE_ASSET_SIZE_BYTES"
  [ "$asset_url" = "https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name" ] || {
    printf 'Docker/WebUI installer URL is not bound to the selected exact Release.\n' >&2
    return 1
  }
  candidate="$work_dir/$asset_name"
  download_release_file "$asset_url" "$candidate" 'Docker/WebUI installer' || return 1
  verify_file_sha256 "$candidate" "$asset_sha256" 'Docker/WebUI installer' || return 1
  verify_file_size "$candidate" "$asset_size" 'Docker/WebUI installer' || return 1
  write_verified_docker_webui_installer_cache \
    "$candidate" "$tag" "$asset_url" "$asset_sha256" "$asset_size"
}

acquire_docker_webui_installer() {
  local work_dir
  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/opl-docker-webui-acquire.XXXXXX") || return 1
  if download_verified_docker_webui_installer "$work_dir"; then
    rm -rf "$work_dir"
    return 0
  fi
  rm -rf "$work_dir"
  printf 'Exact Release acquisition was unavailable or rejected; checking the previously verified installer cache.\n' >&2
  if validate_cached_docker_webui_installer; then
    printf 'Using previously verified Docker/WebUI installer cache from %s.\n' "$DOCKER_WEBUI_INSTALLER_CACHE_TAG" >&2
    return 0
  fi
  printf 'No valid verified Docker/WebUI installer cache is available; no new or unverified installer bytes were executed.\n' >&2
  return 1
}

component_manifest_value() {
  local manifest_path="$1"
  local key_path="$2"
  release_record_value "$manifest_path" "$key_path"
}

component_manifest_array_json() {
  local manifest_path="$1"
  local key_path="$2"
  if command -v plutil >/dev/null 2>&1; then
    plutil -extract "$key_path" json -o - "$manifest_path"
    return
  fi
  python3 - "$manifest_path" "$key_path" <<'PY'
import json
import sys

value = json.load(open(sys.argv[1], encoding='utf-8'))
for part in sys.argv[2].split('.'):
    value = value[int(part)] if isinstance(value, list) else value[part]
print(json.dumps(value, separators=(',', ':')))
PY
}

component_manifest_has_exact_artifact() {
  local manifest_path="$1"
  local asset_name="$2"
  local asset_sha256="$3"
  local tag="$4"
  local expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
  local index=0 name digest ref matches=0
  while name=$(component_manifest_value "$manifest_path" "artifacts.$index.name" 2>/dev/null); do
    if [ "$name" = "$asset_name" ]; then
      digest=$(component_manifest_value "$manifest_path" "artifacts.$index.digest") || return 1
      ref=$(component_manifest_value "$manifest_path" "artifacts.$index.ref") || return 1
      if [ "$digest" = "sha256:$asset_sha256" ] && [ "$ref" = "$expected_url" ]; then
        matches=$((matches + 1))
      fi
    fi
    index=$((index + 1))
  done
  [ "$matches" -eq 1 ]
}

component_manifest_exact_artifact_identity() {
  local manifest_path="$1"
  local asset_name="$2"
  local expected_url="$3"
  local index=0 name digest ref size matches=0 matched_digest='' matched_size=''
  while name=$(component_manifest_value "$manifest_path" "artifacts.$index.name" 2>/dev/null); do
    if [ "$name" = "$asset_name" ]; then
      digest=$(component_manifest_value "$manifest_path" "artifacts.$index.digest") || return 1
      ref=$(component_manifest_value "$manifest_path" "artifacts.$index.ref") || return 1
      size=$(component_manifest_value "$manifest_path" "artifacts.$index.size") || return 1
      if [ "$ref" = "$expected_url" ]; then
        matches=$((matches + 1))
        matched_digest="$digest"
        matched_size="$size"
      fi
    fi
    index=$((index + 1))
  done
  [ "$matches" -eq 1 ] || return 1
  printf '%s\t%s\n' "$matched_digest" "$matched_size"
}

verify_additive_installer_receipt_chain() {
  local record_path="$1"
  local tag="$2"
  local installer_name="$3"
  local original_sha256="$4"
  local current_sha256="$5"
  local current_size="$6"
  local work_dir="$7"
  local original_size="$8"
  local receipt_dir="$work_dir/additive-installer-receipts"
  local chain_path="$receipt_dir/chain.tsv"
  local index=0 name receipt_path receipt_url receipt_sha256 receipt_size
  local release_id release_target receipt_count=0
  local receipt_release_id receipt_tag receipt_target receipt_source_run receipt_source_commit
  local receipt_public_name receipt_previous_id receipt_previous_name receipt_previous_size receipt_previous_digest
  local receipt_next_name receipt_next_size receipt_next_digest receipt_remaining
  local chain_sha256="$original_sha256" chain_size="$original_size" used=0 matches
  local next_sha256 next_size previous_sha256 previous_size

  release_id=$(release_record_value "$record_path" id) || return 1
  release_target=$(release_record_value "$record_path" target_commitish) || return 1
  validate_positive_integer "$release_id" || return 1
  validate_git_sha "$release_target" || return 1
  mkdir -p "$receipt_dir"
  : > "$chain_path"

  while name=$(release_record_value "$record_path" "assets.$index.name" 2>/dev/null); do
    if [[ ! "$name" =~ ^opl-additive-repair-[0-9a-f]{12}\.json$ ]]; then
      index=$((index + 1))
      continue
    fi
    receipt_sha256=$(release_record_value "$record_path" "assets.$index.digest") || return 1
    receipt_url=$(release_record_value "$record_path" "assets.$index.browser_download_url") || return 1
    receipt_size=$(release_record_value "$record_path" "assets.$index.size") || return 1
    case "$receipt_sha256" in sha256:*) receipt_sha256="${receipt_sha256#sha256:}" ;; *) return 1 ;; esac
    validate_sha256_value "$receipt_sha256" || return 1
    validate_positive_integer "$receipt_size" || return 1
    [ "$receipt_url" = "https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$name" ] || return 1
    receipt_path="$receipt_dir/$name"
    download_release_file "$receipt_url" "$receipt_path" 'additive installer repair receipt' || return 1
    verify_file_sha256 "$receipt_path" "$receipt_sha256" 'Additive installer repair receipt' || return 1
    verify_file_size "$receipt_path" "$receipt_size" 'Additive installer repair receipt' || return 1

    [ "$(release_record_value "$receipt_path" schema)" = 'opl_app_stable_additive_repair.v1' ] || return 1
    [ "$(release_record_value "$receipt_path" status)" = 'complete' ] || return 1
    receipt_release_id=$(release_record_value "$receipt_path" release.id) || return 1
    receipt_tag=$(release_record_value "$receipt_path" release.tag) || return 1
    receipt_target=$(release_record_value "$receipt_path" release.target_commitish) || return 1
    [ "$receipt_release_id" = "$release_id" ] || return 1
    [ "$receipt_tag" = "$tag" ] || return 1
    [ "$receipt_target" = "$release_target" ] || return 1
    [ "$(release_record_value "$receipt_path" release.draft)" = false ] || return 1
    [ "$(release_record_value "$receipt_path" release.prerelease)" = false ] || return 1
    receipt_source_run=$(release_record_value "$receipt_path" source_run_id) || return 1
    receipt_source_commit=$(release_record_value "$receipt_path" repair_source_commit) || return 1
    validate_positive_integer "$receipt_source_run" || return 1
    validate_git_sha "$receipt_source_commit" || return 1
    [ "${receipt_source_commit:0:12}.json" = "${name#opl-additive-repair-}" ] || return 1
    receipt_public_name=$(release_record_value "$receipt_path" public_receipt) || return 1
    [ "$receipt_public_name" = "$name" ] || return 1
    receipt_remaining=$(component_manifest_array_json "$receipt_path" remaining) || return 1
    [ "$receipt_remaining" = '[]' ] || return 1

    receipt_previous_id=$(release_record_value "$receipt_path" replacement.previous.id) || return 1
    receipt_previous_name=$(release_record_value "$receipt_path" replacement.previous.name) || return 1
    receipt_previous_size=$(release_record_value "$receipt_path" replacement.previous.size) || return 1
    receipt_previous_digest=$(release_record_value "$receipt_path" replacement.previous.digest) || return 1
    receipt_next_name=$(release_record_value "$receipt_path" replacement.next.name) || return 1
    receipt_next_size=$(release_record_value "$receipt_path" replacement.next.size) || return 1
    receipt_next_digest=$(release_record_value "$receipt_path" replacement.next.digest) || return 1
    validate_positive_integer "$receipt_previous_id" || return 1
    [ "$receipt_previous_name" = "$installer_name" ] || return 1
    [ "$receipt_next_name" = "$installer_name" ] || return 1
    validate_positive_integer "$receipt_previous_size" || return 1
    validate_positive_integer "$receipt_next_size" || return 1
    case "$receipt_previous_digest" in sha256:*) receipt_previous_digest="${receipt_previous_digest#sha256:}" ;; *) return 1 ;; esac
    case "$receipt_next_digest" in sha256:*) receipt_next_digest="${receipt_next_digest#sha256:}" ;; *) return 1 ;; esac
    validate_sha256_value "$receipt_previous_digest" || return 1
    validate_sha256_value "$receipt_next_digest" || return 1
    [ "$receipt_previous_digest" != "$receipt_next_digest" ] || return 1
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "$name" "$receipt_previous_digest" "$receipt_previous_size" "$receipt_next_digest" "$receipt_next_size" \
      >> "$chain_path"
    receipt_count=$((receipt_count + 1))
    index=$((index + 1))
  done

  [ "$receipt_count" -gt 0 ] || return 1
  while [ "$chain_sha256" != "$current_sha256" ] || [ "$chain_size" != "$current_size" ]; do
    matches=0
    next_sha256=''
    next_size=''
    while IFS=$'\t' read -r name previous_sha256 previous_size receipt_next_digest receipt_next_size; do
      if [ "$previous_sha256" = "$chain_sha256" ] && [ "$previous_size" = "$chain_size" ]; then
        matches=$((matches + 1))
        next_sha256="$receipt_next_digest"
        next_size="$receipt_next_size"
      fi
    done < "$chain_path"
    [ "$matches" -eq 1 ] || return 1
    chain_sha256="$next_sha256"
    chain_size="$next_size"
    used=$((used + 1))
    [ "$used" -le "$receipt_count" ] || return 1
  done
  [ "$used" -eq "$receipt_count" ]
}

verify_release_installer_bootstrap() {
  local record_path="$1"
  local manifest_path="$2"
  local tag="$3"
  local work_dir="$4"
  local installer_name="${0##*/}"
  local expected_url current_sha256 current_size original_identity original_sha256 original_size

  case "$installer_name" in
    opl-app-installer.sh|opl-install.sh)
      ;;
    *)
      return 0
      ;;
  esac
  if [ ! -f "$0" ] || [ -L "$0" ]; then
    printf 'Release installer bootstrap must be a regular file: %s\n' "$0" >&2
    return 1
  fi
  resolve_release_asset "$record_path" "$installer_name" || {
    printf 'GitHub Release record has no unique digest-bound installer bootstrap asset.\n' >&2
    return 1
  }
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$installer_name"
  if [ "$RELEASE_ASSET_URL" != "$expected_url" ]; then
    printf 'GitHub Release installer bootstrap URL mismatch.\n' >&2
    return 1
  fi
  current_sha256="$RELEASE_ASSET_SHA256"
  current_size="$RELEASE_ASSET_SIZE_BYTES"
  if component_manifest_has_exact_artifact \
    "$manifest_path" "$installer_name" "$current_sha256" "$tag"; then
    verify_file_sha256 "$0" "$current_sha256" 'Installer bootstrap'
    return
  fi
  original_identity=$(component_manifest_exact_artifact_identity \
    "$manifest_path" "$installer_name" "$expected_url") || {
    printf 'Component manifest does not bind one original installer bootstrap from the selected Release.\n' >&2
    return 1
  }
  original_sha256="${original_identity%%$'\t'*}"
  original_size="${original_identity#*$'\t'}"
  case "$original_sha256" in sha256:*) original_sha256="${original_sha256#sha256:}" ;; *) return 1 ;; esac
  validate_sha256_value "$original_sha256" || return 1
  validate_positive_integer "$original_size" || return 1
  verify_additive_installer_receipt_chain \
    "$record_path" "$tag" "$installer_name" "$original_sha256" "$current_sha256" "$current_size" "$work_dir" "$original_size" || {
    printf 'Current installer bootstrap is not connected to the component manifest by one exact additive repair receipt chain.\n' >&2
    return 1
  }
  verify_file_sha256 "$0" "$current_sha256" 'Installer bootstrap'
}

download_and_validate_component_manifest() {
  local work_dir="$1"
  local record_path="$2"
  local tag="$3"
  local standard_asset_name="$4"
  local standard_asset_sha256="$5"
  local manifest_path expected_url quality build_trigger preview_kind stable_qualified non_stable_notice
  local release_version version release_tag primary_name primary_digest manifest_ref release_url manifest_digest
  local skipped_gates failed_gates manifest_asset_sha256 manifest_asset_size

  if ! resolve_release_asset "$record_path" 'opl-app-component-manifest.json'; then
    printf 'GitHub Release record has no unique digest-bound App component manifest asset.\n' >&2
    return 1
  fi
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/opl-app-component-manifest.json"
  if [ "$RELEASE_ASSET_URL" != "$expected_url" ]; then
    printf 'GitHub Release component manifest URL mismatch.\n' >&2
    return 1
  fi
  manifest_asset_size="$RELEASE_ASSET_SIZE_BYTES"
  manifest_path="$work_dir/opl-app-component-manifest.json"
  download_release_file "$RELEASE_ASSET_URL" "$manifest_path" 'component manifest' || return 1
  verify_file_sha256 "$manifest_path" "$RELEASE_ASSET_SHA256" 'Component manifest' || return 1
  verify_file_size "$manifest_path" "$manifest_asset_size" 'Component manifest' || return 1
  manifest_asset_sha256="$RELEASE_ASSET_SHA256"

  [ "$(component_manifest_value "$manifest_path" surface_kind)" = 'opl_app_component_manifest.v1' ] || {
    printf 'Component manifest surface kind is invalid.\n' >&2
    return 1
  }
  [ "$(component_manifest_value "$manifest_path" component_id)" = 'opl-app' ] || {
    printf 'Component manifest component id is invalid.\n' >&2
    return 1
  }
  release_tag=$(component_manifest_value "$manifest_path" release_tag) || return 1
  release_version=$(component_manifest_value "$manifest_path" release_version 2>/dev/null || true)
  version=$(component_manifest_value "$manifest_path" version) || return 1
  primary_name=$(component_manifest_value "$manifest_path" primary_artifact.name) || return 1
  primary_digest=$(component_manifest_value "$manifest_path" primary_artifact.digest) || return 1
  manifest_ref=$(component_manifest_value "$manifest_path" component_manifest_ref) || return 1
  release_url=$(component_manifest_value "$manifest_path" release_url) || return 1
  manifest_digest=$(component_manifest_value "$manifest_path" component_manifest_digest) || return 1
  [ "$release_tag" = "$tag" ] || {
    printf 'Component manifest release tag does not match the selected GitHub Release.\n' >&2
    return 1
  }
  [ "$version" = "${tag#v}" ] || {
    printf 'Component manifest version does not match the selected GitHub Release.\n' >&2
    return 1
  }
  if [ -n "$release_version" ] && [ "$release_version" != "${tag#v}" ]; then
    printf 'Component manifest release version does not match the selected GitHub Release.\n' >&2
    return 1
  fi
  [ "$primary_name" = "$standard_asset_name" ] && [ "$primary_digest" = "sha256:$standard_asset_sha256" ] || {
    printf 'Component manifest primary Standard DMG identity does not match the selected Release.\n' >&2
    return 1
  }
  component_manifest_has_exact_artifact "$manifest_path" "$standard_asset_name" "$standard_asset_sha256" "$tag" || {
    printf 'Component manifest does not bind one exact Standard DMG artifact from the selected Release.\n' >&2
    return 1
  }
  [ "$manifest_ref" = "$expected_url" ] || {
    printf 'Component manifest reference does not match its exact GitHub Release asset URL.\n' >&2
    return 1
  }
  [ "$release_url" = "https://github.com/$OPL_APP_RELEASE_REPO/releases/tag/$tag" ] || {
    printf 'Component manifest release URL does not match the selected GitHub Release.\n' >&2
    return 1
  }
  case "$manifest_digest" in
    sha256:*)
      validate_sha256_value "${manifest_digest#sha256:}" || {
        printf 'Component manifest identity digest is invalid.\n' >&2
        return 1
      }
      ;;
    *)
      printf 'Component manifest identity digest is invalid.\n' >&2
      return 1
      ;;
  esac

  quality=$(component_manifest_value "$manifest_path" quality_status 2>/dev/null || true)
  build_trigger=$(component_manifest_value "$manifest_path" build_trigger 2>/dev/null || true)
  preview_kind=$(component_manifest_value "$manifest_path" preview_kind 2>/dev/null || true)
  stable_qualified=$(component_manifest_value "$manifest_path" qualification_disclosure.stable_qualified 2>/dev/null || true)
  non_stable_notice=$(component_manifest_value "$manifest_path" qualification_disclosure.non_stable_notice 2>/dev/null || true)
  skipped_gates=$(component_manifest_array_json "$manifest_path" qualification_disclosure.skipped_gates 2>/dev/null || true)
  failed_gates=$(component_manifest_array_json "$manifest_path" qualification_disclosure.failed_gates 2>/dev/null || true)

  if [ -z "$quality$build_trigger$preview_kind$stable_qualified$non_stable_notice$skipped_gates$failed_gates" ]; then
    [ "$STABLE_MACOS_RELEASE_PRERELEASE" = false ] || {
      printf 'A legacy component manifest cannot describe a prerelease App.\n' >&2
      return 1
    }
    printf 'Release quality: unasserted legacy release (V3 Stable/Preview metadata unavailable).\n'
    printf 'Legacy release manifest predates V3 qualification disclosure.\n'
  else
    [ -n "$quality" ] && [ -n "$build_trigger" ] && [ -n "$preview_kind" ] \
      && [ -n "$stable_qualified" ] && [ -n "$non_stable_notice" ] \
      && [ -n "$skipped_gates" ] && [ -n "$failed_gates" ] || {
      printf 'Component manifest must provide every V3 quality and qualification disclosure field.\n' >&2
      return 1
    }
    case "$quality:$build_trigger:$preview_kind:$stable_qualified:$non_stable_notice:$STABLE_MACOS_RELEASE_PRERELEASE" in
      stable:manual:null:true:false:false|stable:automated:null:true:false:false)
        [ "$skipped_gates" = '[]' ] || {
          printf 'Stable component manifest must not claim skipped qualification gates.\n' >&2
          return 1
        }
        printf 'Release quality: Stable\n'
        ;;
      preview:manual:dev:false:true:false)
        [ "$skipped_gates" != '[]' ] || {
          printf 'Preview component manifest must disclose skipped qualification gates.\n' >&2
          return 1
        }
        printf 'Release quality: Preview (Dev)\n'
        ;;
      preview:automated:nightly:false:true:true)
        [ "$skipped_gates" != '[]' ] || {
          printf 'Preview component manifest must disclose skipped qualification gates.\n' >&2
          return 1
        }
        printf 'Release quality: Preview (Nightly)\n'
        ;;
      *)
        printf 'Component manifest has an invalid quality, trigger, preview-kind, disclosure, or release-prerelease combination.\n' >&2
        return 1
        ;;
    esac
    if [ "$quality" = preview ]; then
      printf 'Non-Stable release: full Stable qualification is not asserted.\n'
    fi
    printf 'Skipped qualification gates: %s\n' "$skipped_gates"
    printf 'Failed qualification gates: %s\n' "$failed_gates"
  fi
  printf 'Latest pointer selects this exact release but does not change its declared quality.\n'
  verify_release_installer_bootstrap "$record_path" "$manifest_path" "$tag" "$work_dir" || return 1

  STABLE_MACOS_COMPONENT_MANIFEST_PATH="$manifest_path"
  STABLE_MACOS_COMPONENT_MANIFEST_SHA256="$manifest_asset_sha256"
  STABLE_MACOS_RELEASE_QUALITY_ASSERTED=1
  STABLE_MACOS_RELEASE_QUALITY="$quality"
}

download_and_validate_full_manifest() {
  local work_dir="$1"
  local record_path="$2"
  local standard_tag="$3"
  local asset_name="$4"
  local asset_sha256="$5"
  local asset_size="$6"
  local manifest_path expected_url schema package_kind owner_authority version release_version primary_name expected_version
  local manifest_asset_size standard_attestation_sha manifest_attestation_sha
  local index=0 name sha256 size_bytes normalized_sha256 matches=0
  resolve_release_asset "$record_path" 'opl-release-manifest.json' || {
    printf 'Standard Release has no unique digest-bound Full public manifest asset.\n' >&2
    return 1
  }
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$standard_tag/opl-release-manifest.json"
  [ "$RELEASE_ASSET_URL" = "$expected_url" ] || {
    printf 'Full manifest URL does not match the exact Standard Release asset.\n' >&2
    return 1
  }
  manifest_asset_size="$RELEASE_ASSET_SIZE_BYTES"
  manifest_path="$work_dir/opl-release-manifest.json"
  download_release_file "$RELEASE_ASSET_URL" "$manifest_path" 'Full release manifest' || return 1
  verify_file_sha256 "$manifest_path" "$RELEASE_ASSET_SHA256" 'Full release manifest' || return 1
  verify_file_size "$manifest_path" "$manifest_asset_size" 'Full release manifest' || return 1

  schema=$(component_manifest_value "$manifest_path" schema 2>/dev/null || true)
  package_kind=$(component_manifest_value "$manifest_path" package_kind 2>/dev/null || true)
  owner_authority=$(component_manifest_value "$manifest_path" owner_authority 2>/dev/null || true)
  version=$(component_manifest_value "$manifest_path" version 2>/dev/null || true)
  release_version=$(component_manifest_value "$manifest_path" release_version 2>/dev/null || true)
  primary_name=$(component_manifest_value "$manifest_path" primary_install_asset 2>/dev/null || true)
  validate_release_tag "$standard_tag" || return 1
  expected_version="${standard_tag#v}"
  [ "$schema" = opl_public_release_manifest.v1 ] \
    && [ "$package_kind" = opl_full_first_install_macos_arm64 ] \
    && [ "$owner_authority" = one-person-lab-app ] \
    && [ "$version" = "$expected_version" ] \
    && [ "$release_version" = "$expected_version" ] \
    && [ "$primary_name" = "$asset_name" ] || {
      printf 'Full carrier public manifest does not match its own Release version and asset identity.\n' >&2
    return 1
  }
  while name=$(component_manifest_value "$manifest_path" "assets.$index.name" 2>/dev/null); do
    if [ "$name" = "$asset_name" ]; then
      sha256=$(component_manifest_value "$manifest_path" "assets.$index.sha256" 2>/dev/null || true)
      size_bytes=$(component_manifest_value "$manifest_path" "assets.$index.size_bytes" 2>/dev/null || true)
      normalized_sha256="${sha256#sha256:}"
      if validate_sha256_value "$normalized_sha256" \
        && validate_positive_integer "$size_bytes" \
        && [ "$normalized_sha256" = "$asset_sha256" ] \
        && [ "$size_bytes" = "$asset_size" ]; then
        matches=$((matches + 1))
      fi
    fi
    index=$((index + 1))
  done
  [ "$matches" -eq 1 ] || {
      printf 'Full public manifest does not bind the exact Full DMG digest and size.\n' >&2
      return 1
    }
  resolve_release_asset "$record_path" 'opl-release-attestation.json' || {
    printf 'Standard Release has no unique unified attestation.\n' >&2
    return 1
  }
  standard_attestation_sha="$RELEASE_ASSET_SHA256"
  manifest_attestation_sha=$(component_manifest_value "$manifest_path" carrier_context.standard_attestation.sha256 2>/dev/null || true)
  [ "$manifest_attestation_sha" = "sha256:$standard_attestation_sha" ] || {
    printf 'Full public manifest does not bind the exact Standard release attestation.\n' >&2
    return 1
  }
  STABLE_MACOS_FULL_MANIFEST_PATH="$manifest_path"
}

download_or_use_dmg() {
  local work_dir="$1"
  local record_path tag asset_name url expected_url dmg_path download_status expected_sha256 expected_size
  local standard_asset_name standard_asset_sha256
  STABLE_MACOS_RESOLVED_DMG_PATH=''
  STABLE_MACOS_RESOLVED_DMG_SHA256=''
  STABLE_MACOS_RELEASE_QUALITY_ASSERTED=0
  STABLE_MACOS_RELEASE_QUALITY=''
  STABLE_MACOS_FULL_MANIFEST_PATH=''
  if [ -n "$STABLE_MACOS_DMG_PATH" ] || [ -n "$STABLE_MACOS_DMG_URL" ]; then
    require_caller_dmg_sha256 || return 1
    if [ -n "$STABLE_MACOS_DMG_PATH" ]; then
      if [ ! -f "$STABLE_MACOS_DMG_PATH" ]; then
        printf 'DMG path not found: %s\n' "$STABLE_MACOS_DMG_PATH" >&2
        return 1
      fi
      STABLE_MACOS_RESOLVED_DMG_PATH="$STABLE_MACOS_DMG_PATH"
    else
      asset_name="${STABLE_MACOS_DMG_URL##*/}"
      [ -n "$asset_name" ] || asset_name='custom.dmg'
      dmg_path="$work_dir/$asset_name"
      download_release_file "$STABLE_MACOS_DMG_URL" "$dmg_path" 'custom DMG' || return 1
      STABLE_MACOS_RESOLVED_DMG_PATH="$dmg_path"
    fi
    STABLE_MACOS_RESOLVED_DMG_SHA256="$STABLE_MACOS_DMG_SHA256"
    verify_resolved_dmg "$STABLE_MACOS_RESOLVED_DMG_PATH" "$STABLE_MACOS_RESOLVED_DMG_SHA256" || return 1
    printf 'Release quality: not asserted for a custom DMG source.\n'
    return 0
  fi

  if [ -z "$STABLE_MACOS_RELEASE_TAG" ]; then
    resolve_latest_release_tag "$work_dir" >/dev/null || return 1
  else
    resolve_release_record "$work_dir" || return 1
  fi
  record_path="$STABLE_MACOS_RELEASE_RECORD_PATH"
  tag="$STABLE_MACOS_RELEASE_TAG"
  standard_asset_name=$(release_asset_name "$tag" standard)
  resolve_release_asset "$record_path" "$standard_asset_name" || {
    printf 'GitHub Release record has no unique digest-bound Standard DMG asset: %s\n' "$standard_asset_name" >&2
    return 1
  }
  standard_asset_sha256="$RELEASE_ASSET_SHA256"
  download_and_validate_component_manifest \
    "$work_dir" "$record_path" "$tag" "$standard_asset_name" "$standard_asset_sha256" || return 1

  if [ "$STABLE_MACOS_PACKAGE_PROFILE" = full ]; then
    asset_name=$(release_asset_name "$tag" full)
    if resolve_release_asset "$record_path" "$asset_name"; then
      if [ "$STABLE_MACOS_RELEASE_PRERELEASE" != false ] \
        || [ "$STABLE_MACOS_RELEASE_QUALITY" != stable ]; then
        printf 'A same-tag Full module requires one qualified non-prerelease Standard Release.\n' >&2
        return 1
      fi
      expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
      [ "$RELEASE_ASSET_URL" = "$expected_url" ] || {
        printf 'Full DMG URL does not match its exact Standard Release asset.\n' >&2
        return 1
      }
      expected_sha256="$RELEASE_ASSET_SHA256"
      expected_size="$RELEASE_ASSET_SIZE_BYTES"
      download_and_validate_full_manifest \
        "$work_dir" "$record_path" "$tag" \
        "$asset_name" "$expected_sha256" "$expected_size" || return 1
      resolve_release_asset "$record_path" "$asset_name" || return 1
      [ "$RELEASE_ASSET_URL" = "$expected_url" ] \
        && [ "$RELEASE_ASSET_SHA256" = "$expected_sha256" ] \
        && [ "$RELEASE_ASSET_SIZE_BYTES" = "$expected_size" ] || {
        printf 'Full DMG identity changed while validating its same-tag public manifest.\n' >&2
        return 1
      }
    else
      if [ "$STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT" = 0 ]; then
        asset_name="$standard_asset_name"
        printf 'Full module is not appended to %s; continuing with the Standard DMG.\n' "$tag" >&2
        resolve_release_asset "$record_path" "$asset_name" || return 1
        expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
        expected_sha256="$RELEASE_ASSET_SHA256"
        expected_size="$RELEASE_ASSET_SIZE_BYTES"
      else
        printf 'No same-tag Full module is published.\n' >&2
        return 1
      fi
    fi
  else
    asset_name="$standard_asset_name"
    resolve_release_asset "$record_path" "$asset_name" || return 1
    expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
    expected_sha256="$RELEASE_ASSET_SHA256"
    expected_size="$RELEASE_ASSET_SIZE_BYTES"
  fi
  expected_url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
  if [ "$RELEASE_ASSET_URL" != "$expected_url" ]; then
    printf 'GitHub Release asset URL mismatch for %s.\n' "$asset_name" >&2
    return 1
  fi
  expected_sha256="${expected_sha256:-$RELEASE_ASSET_SHA256}"

  url="$RELEASE_ASSET_URL"
  dmg_path="$work_dir/$asset_name"
  if download_release_file "$url" "$dmg_path" 'DMG'; then
    STABLE_MACOS_RESOLVED_DMG_PATH="$dmg_path"
  else
    download_status=$?
    return "$download_status"
  fi

  STABLE_MACOS_RESOLVED_DMG_SHA256="$expected_sha256"
  verify_resolved_dmg "$STABLE_MACOS_RESOLVED_DMG_PATH" "$STABLE_MACOS_RESOLVED_DMG_SHA256" || return 1
  verify_file_size "$STABLE_MACOS_RESOLVED_DMG_PATH" "$expected_size" 'DMG' || return 1
}

copy_app_from_dmg() {
  local dmg_path="$1"
  local work_dir="$2"
  local mount_dir="$work_dir/mount"
  local source_app
  local source_apps=()
  mkdir -p "$mount_dir"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/tmp/opl-stable-macos-install.hdiutil-attach.log
  while IFS= read -r candidate; do source_apps+=("$candidate"); done < <(
    find "$mount_dir" -maxdepth 2 -type d -name '*.app' -print | LC_ALL=C sort
  )
  if [ "${#source_apps[@]}" -ne 1 ]; then
    printf 'Mounted DMG must contain exactly one App bundle; found %s.\n' "${#source_apps[@]}" >&2
    exit 1
  fi
  source_app="${source_apps[0]}"
  if [ ! -d "$source_app" ] || [ -L "$source_app" ]; then
    printf 'Mounted DMG App bundle path is invalid.\n' >&2
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
  if [ "$(uname -m)" != arm64 ]; then
    printf 'Stable macOS App install is currently supported only on macOS arm64.\n' >&2
    exit 1
  fi
  for required_command in curl hdiutil ditto find plutil xattr; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      printf 'Missing required command: %s\n' "$required_command" >&2
      exit 1
    fi
  done
  ensure_app_target_path
  confirm_stable_macos_install

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

  download_or_use_dmg "$STABLE_MACOS_WORK_DIR"
  copy_app_from_dmg "$STABLE_MACOS_RESOLVED_DMG_PATH" "$STABLE_MACOS_WORK_DIR"
  AUTHORIZE_LOCAL_APP_YES=1
  authorize_local_app

  if [ "$STABLE_MACOS_OPEN" = "1" ]; then
    if open "$OPL_LOCAL_APP_PATH"; then
      printf 'One Person Lab App opened.\n'
    else
      printf 'The App was installed and locally authorized, but macOS did not open it automatically. Open it manually from: %s\n' "$OPL_LOCAL_APP_PATH" >&2
    fi
  fi
  printf 'One Person Lab macOS App install finished.\n'
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

trap cleanup_installer EXIT
SELECTED_INSTALL_ROUTE=$(resolve_install_route) || exit 1
validate_install_density_for_route "$SELECTED_INSTALL_ROUTE" || exit 1
if [ "$PRINT_INSTALL_ROUTE" = "1" ]; then
  print_resolved_install_route "$SELECTED_INSTALL_ROUTE"
  exit 0
fi

case "$SELECTED_INSTALL_ROUTE" in
  desktop)
    if desktop_release_asset_selection_requested; then
      stable_macos_install
    else
      install_desktop_bootstrap
    fi
    ;;
  desktop-webui)
    STABLE_MACOS_WEBUI_MODE=1
    stable_macos_install
    ;;
  linux-desktop)
    install_linux_desktop
    ;;
  linux-desktop-webui)
    DESKTOP_WEBUI_MODE=1
    install_linux_desktop
    ;;
  container-webui)
    install_container_webui
    ;;
  headless)
    install_headless_base
    ;;
  *)
    printf 'Internal installer routing error: %s\n' "$SELECTED_INSTALL_ROUTE" >&2
    exit 1
    ;;
esac

if [ "$AUTHORIZE_LOCAL_APP" = "1" ]; then
  authorize_local_app
fi

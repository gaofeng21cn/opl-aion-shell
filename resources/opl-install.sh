#!/usr/bin/env bash
set -euo pipefail

OPL_INSTALL_SCRIPT_URL=${OPL_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh}
OPL_LOCAL_APP_PATH=${OPL_LOCAL_APP_PATH:-/Applications/One Person Lab.app}
OPL_APP_RELEASE_REPO=${OPL_APP_RELEASE_REPO:-gaofeng21cn/one-person-lab-app}
OPL_APP_DOCS_REF=${OPL_APP_DOCS_REF:-main}
OPL_DOCKER_WEBUI_INSTALLER_URL=${OPL_DOCKER_WEBUI_INSTALLER_URL:-https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/scripts/install-docker-webui.sh}
OPL_NATIVE_WEBUI_INSTALLER_URL=${OPL_NATIVE_WEBUI_INSTALLER_URL:-}
OPL_NATIVE_WEBUI_INSTALLER_SHA256=${OPL_NATIVE_WEBUI_INSTALLER_SHA256:-}
OPL_NATIVE_WEBUI_MIRROR=${OPL_NATIVE_WEBUI_MIRROR:-}
OPL_NATIVE_WEBUI_VERSION=${OPL_NATIVE_WEBUI_VERSION:-}
OPL_INSTALL_RUNTIME_FORM=${OPL_INSTALL_RUNTIME_FORM:-auto}

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
STABLE_MACOS_OPEN=${OPL_STABLE_MACOS_OPEN:-1}
STABLE_MACOS_WORK_DIR=''
INSTALL_SCENARIO=${OPL_INSTALL_SCENARIO:-personal}
PRINT_INSTALL_ROUTE=0
OPEN_OPTION_EXPLICIT=''

usage() {
  cat <<'USAGE'
Usage:
  install.sh [OPL install args...]
  install.sh [--runtime-form auto|desktop|native-webui|container-webui|headless]
  install.sh [--server|--isolated|--headless]
  install.sh --stable-macos-install [--full|--standard] [--release-tag vX.Y.Z] [--yes]
  install.sh --authorize-local-app-only [--app-path "/Applications/One Person Lab.app"] [--yes]

Options:
  By default, route macOS personal hosts to Desktop, Linux personal hosts to a
  verified OPL Native WebUI artifact or the Container WebUI fallback, and
  server/isolated hosts to Container WebUI.
  --runtime-form <form>      Select auto, desktop, native-webui, container-webui, or headless.
  --desktop                 Require the macOS Desktop/bootstrap path.
  --native-webui            Require a verified OPL Native WebUI artifact.
  --container-webui         Use the Container WebUI installer.
  --server                  Select the Container WebUI server path.
  --isolated                Select the Container WebUI isolation path.
  --headless                Install OPL Base only, without an App runtime form.
  --native-mirror <url>     Candidate OPL Native WebUI release mirror.
  --native-version <ver>    Candidate OPL Native WebUI immutable version.
  --native-installer-url <url>
                            Exact verifier script URL.
  --native-installer-sha256 <digest>
                            Required SHA256 for the verifier script bytes.
  --print-install-route     Resolve and print the selected route without installing.
  --stable-macos-install     Download, copy, locally authorize, and open the Stable App.
  --full                     Require the Full first-install DMG for --stable-macos-install.
  --standard                 Require the standard App DMG for --stable-macos-install.
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
Without an explicit package profile, Stable prefers Full and falls back to Standard only when the Full asset is not yet published.
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
    --native-webui)
      OPL_INSTALL_RUNTIME_FORM=native-webui
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
    --native-mirror)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-mirror\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_MIRROR="$1"
      ;;
    --native-mirror=*)
      OPL_NATIVE_WEBUI_MIRROR="${arg#--native-mirror=}"
      ;;
    --native-version)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-version\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_VERSION="$1"
      ;;
    --native-version=*)
      OPL_NATIVE_WEBUI_VERSION="${arg#--native-version=}"
      ;;
    --native-installer-url)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-installer-url\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_INSTALLER_URL="$1"
      ;;
    --native-installer-url=*)
      OPL_NATIVE_WEBUI_INSTALLER_URL="${arg#--native-installer-url=}"
      ;;
    --native-installer-sha256)
      shift
      if [ "$#" -eq 0 ]; then
        printf 'Missing value for --native-installer-sha256\n' >&2
        exit 1
      fi
      OPL_NATIVE_WEBUI_INSTALLER_SHA256="$1"
      ;;
    --native-installer-sha256=*)
      OPL_NATIVE_WEBUI_INSTALLER_SHA256="${arg#--native-installer-sha256=}"
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
    native|native-webui|native_webui)
      printf 'native-webui\n'
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

NATIVE_INSTALLER_PATH=''

validate_native_mirror() {
  case "$OPL_NATIVE_WEBUI_MIRROR" in
    file://*)
      return 0
      ;;
    https://github.com/gaofeng21cn/one-person-lab-app/releases/download|https://github.com/gaofeng21cn/one-person-lab-app/releases/download/)
      return 0
      ;;
    http://*|https://*)
      printf 'Remote Native WebUI mirror must be the One Person Lab App GitHub Release base namespace.\n' >&2
      return 1
      ;;
    *)
      printf 'Native WebUI mirror must be the App GitHub Release base URL or an explicit file:// development candidate.\n' >&2
      return 1
      ;;
  esac
}

native_mirror_is_local_development() {
  case "$OPL_NATIVE_WEBUI_MIRROR" in
    file://*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_native_version() {
  case "$OPL_NATIVE_WEBUI_VERSION" in
    ''|*[!0-9A-Za-z._-]*)
      printf 'Native WebUI version must use only letters, numbers, dots, underscores, or hyphens.\n' >&2
      return 1
      ;;
  esac
}

expected_native_installer_url() {
  printf '%s/v%s/install-web.sh\n' "${OPL_NATIVE_WEBUI_MIRROR%/}" "$OPL_NATIVE_WEBUI_VERSION"
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    printf 'shasum or sha256sum is required to verify the Native WebUI verifier.\n' >&2
    return 1
  fi
}

cleanup_native_installer() {
  if [ -n "$NATIVE_INSTALLER_PATH" ]; then
    rm -f "$NATIVE_INSTALLER_PATH"
  fi
}

prepare_native_installer() {
  if [ -n "$NATIVE_INSTALLER_PATH" ]; then
    return 0
  fi
  if [ -z "$OPL_NATIVE_WEBUI_MIRROR" ] || [ -z "$OPL_NATIVE_WEBUI_VERSION" ]; then
    return 1
  fi
  validate_native_mirror || return 1
  validate_native_version || return 1
  if [ -z "$OPL_NATIVE_WEBUI_INSTALLER_URL" ] || [ -z "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" ]; then
    printf 'Native WebUI verifier requires an explicit URL and caller-supplied SHA256.\n' >&2
    return 1
  fi
  local expected_installer_url
  expected_installer_url=$(expected_native_installer_url)
  if [ "$OPL_NATIVE_WEBUI_INSTALLER_URL" != "$expected_installer_url" ]; then
    printf 'Native WebUI verifier URL must be the install-web.sh asset from the selected App Release version.\n' >&2
    return 1
  fi
  case "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" in
    *[!0-9a-f]*|'')
      printf 'Native WebUI verifier SHA256 must be 64 lowercase hexadecimal characters.\n' >&2
      return 1
      ;;
  esac
  if [ "${#OPL_NATIVE_WEBUI_INSTALLER_SHA256}" -ne 64 ]; then
    printf 'Native WebUI verifier SHA256 must be 64 lowercase hexadecimal characters.\n' >&2
    return 1
  fi
  NATIVE_INSTALLER_PATH=$(mktemp "${TMPDIR:-/tmp}/opl-native-webui-installer.XXXXXX")
  if ! curl -fsSL "$OPL_NATIVE_WEBUI_INSTALLER_URL" -o "$NATIVE_INSTALLER_PATH"; then
    cleanup_native_installer
    NATIVE_INSTALLER_PATH=''
    return 1
  fi
  local actual_sha256
  actual_sha256=$(sha256_file "$NATIVE_INSTALLER_PATH") || return 1
  if [ "$actual_sha256" != "$OPL_NATIVE_WEBUI_INSTALLER_SHA256" ]; then
    printf 'Native WebUI verifier SHA256 mismatch.\n' >&2
    cleanup_native_installer
    NATIVE_INSTALLER_PATH=''
    return 1
  fi
  if ! grep -Fq -- 'dev.onepersonlab.opl-native-webui-artifact.v1' "$NATIVE_INSTALLER_PATH" ||
    ! grep -Fq -- '--probe-artifact' "$NATIVE_INSTALLER_PATH"; then
    printf 'Native WebUI verifier does not implement the OPL immutable artifact guard.\n' >&2
    cleanup_native_installer
    NATIVE_INSTALLER_PATH=''
    return 1
  fi
}

verified_native_artifact_available() {
  prepare_native_installer || return 1
  bash "$NATIVE_INSTALLER_PATH" \
    --mirror "$OPL_NATIVE_WEBUI_MIRROR" \
    --version "$OPL_NATIVE_WEBUI_VERSION" \
    --probe-artifact >/dev/null 2>&1
}

resolve_install_route() {
  local platform runtime_form
  platform=$(platform_family)
  runtime_form=$(normalize_runtime_form) || return 1

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
    if [ "$runtime_form" != "auto" ] && [ "$runtime_form" != "container-webui" ]; then
      printf 'Server or isolated installs require the Container WebUI runtime form.\n' >&2
      exit 1
    fi
    printf 'container-webui\n'
    return
  fi

  case "$runtime_form" in
    desktop)
      if [ "$platform" != "macos" ]; then
        printf 'Desktop installation is currently supported only on macOS.\n' >&2
        exit 1
      fi
      printf 'desktop\n'
      ;;
    native-webui)
      if [ "$platform" != "linux" ]; then
        printf 'The Native WebUI development candidate is currently implemented only for Linux hosts.\n' >&2
        exit 1
      fi
      if ! verified_native_artifact_available; then
        printf 'A verified OPL Native WebUI artifact is required for --native-webui.\n' >&2
        printf 'Provide mirror/version plus an exact verifier URL and SHA256 for an OPL-owned immutable candidate.\n' >&2
        exit 1
      fi
      printf 'native-webui\n'
      ;;
    container-webui)
      printf 'container-webui\n'
      ;;
    auto)
      case "$platform" in
        macos)
          printf 'desktop\n'
          ;;
        linux)
          if native_mirror_is_local_development; then
            printf 'Local Native WebUI candidates require explicit --native-webui selection; using Container WebUI.\n' >&2
            printf 'container-webui\n'
          elif verified_native_artifact_available; then
            printf 'native-webui\n'
          else
            printf 'OPL Native WebUI is not yet available as a verified artifact; using Container WebUI.\n' >&2
            printf 'container-webui\n'
          fi
          ;;
        windows)
          printf 'container-webui\n'
          ;;
      esac
      ;;
  esac
}

install_desktop_bootstrap() {
  if ! arg_present "--with-app"; then
    INSTALL_ARGS+=("--with-app")
  fi
  curl -fsSL "$OPL_INSTALL_SCRIPT_URL" | bash -s -- "${INSTALL_ARGS[@]}"
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
  if [ "$AUTHORIZE_LOCAL_APP_YES" = "1" ]; then
    container_args+=("--yes")
  fi
  if [ "$OPEN_OPTION_EXPLICIT" = "--no-open" ]; then
    container_args+=("--no-open")
  fi
  if [ "${#container_args[@]}" -eq 0 ]; then
    curl -fsSL "$OPL_DOCKER_WEBUI_INSTALLER_URL" | bash -s --
  else
    curl -fsSL "$OPL_DOCKER_WEBUI_INSTALLER_URL" | bash -s -- "${container_args[@]}"
  fi
}

install_native_webui() {
  prepare_native_installer || {
    printf 'OPL Native WebUI installer or immutable candidate metadata is unavailable.\n' >&2
    exit 1
  }
  bash "$NATIVE_INSTALLER_PATH" \
    --mirror "$OPL_NATIVE_WEBUI_MIRROR" \
    --version "$OPL_NATIVE_WEBUI_VERSION"
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

DOWNLOAD_HTTP_CODE=''

download_release_dmg() {
  local url="$1"
  local dmg_path="$2"
  local curl_status=0
  DOWNLOAD_HTTP_CODE=''
  printf 'Downloading One Person Lab App DMG:\n  %s\n' "$url" >&2
  DOWNLOAD_HTTP_CODE=$(curl --http1.1 --connect-timeout 20 --max-time 1800 --retry 3 --retry-delay 2 -fsSL -w '%{http_code}' "$url" -o "$dmg_path") || curl_status=$?
  if [ "$curl_status" -eq 0 ]; then
    return 0
  fi
  rm -f "$dmg_path"
  return "$curl_status"
}

download_or_use_dmg() {
  local work_dir="$1"
  local tag asset_name url dmg_path download_status
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
  if download_release_dmg "$url" "$dmg_path"; then
    printf '%s\n' "$dmg_path"
    return 0
  else
    download_status=$?
  fi

  if [ -z "$STABLE_MACOS_DMG_URL" ] && [ "$STABLE_MACOS_PACKAGE_PROFILE" = "full" ] && [ "$STABLE_MACOS_PACKAGE_PROFILE_EXPLICIT" = "0" ] && [ "$DOWNLOAD_HTTP_CODE" = "404" ]; then
    asset_name=$(release_asset_name "$tag" standard)
    url="https://github.com/$OPL_APP_RELEASE_REPO/releases/download/$tag/$asset_name"
    dmg_path="$work_dir/$asset_name"
    printf 'Full DMG is not published for %s; continuing with the Standard DMG.\n' "$tag" >&2
    if download_release_dmg "$url" "$dmg_path"; then
      printf '%s\n' "$dmg_path"
      return 0
    else
      return $?
    fi
  fi

  return "$download_status"
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

trap cleanup_native_installer EXIT
SELECTED_INSTALL_ROUTE=$(resolve_install_route) || exit 1
if [ "$PRINT_INSTALL_ROUTE" = "1" ]; then
  printf '%s\n' "$SELECTED_INSTALL_ROUTE"
  exit 0
fi

case "$SELECTED_INSTALL_ROUTE" in
  desktop)
    install_desktop_bootstrap
    ;;
  native-webui)
    install_native_webui
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

#!/usr/bin/env bash
# ============================================================================
# One Person Lab Native WebUI — Host-Native Installation Script
# ============================================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/opl-aion-shell/main/scripts/install-web.sh | bash
#   # Or specify version:
#   VERSION=1.0.0 bash install-web.sh
#   # Or install to custom directory:
#   INSTALL_DIR=/opt/aionui-web bash install-web.sh
# ============================================================================

set -euo pipefail

# ─── Default Configuration ──────────────────────────────────────────────────
VERSION="${VERSION:-__VERSION__}"
# Note: CI runs `sed "s/__VERSION__/<ver>/g"` on this file, replacing both
# occurrences above into e.g. "1.9.19". The resolve_version() function uses a
# regex-based check (looks for letters) to detect the unreplaced placeholder,
# so never add a literal "__VERSION__" string to any comparison below.
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.local/share/one-person-lab/webui/runtime}"
BIN_DIR="${BIN_DIR:-${HOME}/.local/bin}"
OFFICIAL_RELEASE_BASE="https://github.com/gaofeng21cn/one-person-lab-app/releases/download"
MIRROR="${MIRROR:-${OFFICIAL_RELEASE_BASE}}"
CREATE_SYMLINK="${CREATE_SYMLINK:-1}"
UPDATE_PATH="${UPDATE_PATH:-1}"
PROBE_ARTIFACT="${PROBE_ARTIFACT:-0}"
ROLLBACK="${ROLLBACK:-0}"
TEMP_DIR=""
VERSIONS_DIR=""
CURRENT_LINK=""
PREVIOUS_LINK=""
TARGET_DIR=""
FIRST_INSTALL_MARKER=""

# ─── Color Definitions ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Helper Functions ───────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[✓]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✗]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

banner() {
    echo -e "${CYAN}${BOLD}"
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║   One Person Lab Native WebUI (No Electron)  ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ─── Parse Command-Line Arguments ───────────────────────────────────────────
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --version)
                VERSION="$2"
                shift 2
                ;;
            --mirror)
                MIRROR="$2"
                shift 2
                ;;
            --install-dir)
                INSTALL_DIR="$2"
                shift 2
                ;;
            --no-symlink)
                CREATE_SYMLINK=0
                shift
                ;;
            --no-path)
                UPDATE_PATH=0
                shift
                ;;
            --probe-artifact)
                PROBE_ARTIFACT=1
                shift
                ;;
            --rollback)
                ROLLBACK=1
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                warn "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

show_help() {
    cat <<EOF
Usage: install-web.sh [OPTIONS]

Options:
  --version <version>       Specify version to install (default: latest or CI-embedded)
  --mirror <url>            Specify mirror URL (default: GitHub releases)
  --install-dir <path>      Specify installation directory (default: ~/.local/share/one-person-lab/webui/runtime)
  --no-symlink              Do not create symlink in ~/.local/bin
  --no-path                 Do not add PATH to shell profile
  --probe-artifact          Verify that an OPL-owned artifact exists without installing it
  --rollback                Atomically switch current and previous installed versions
  --help                    Show this help message

Environment Variables:
  VERSION                   Version to install (same as --version)
  INSTALL_DIR               Installation directory (same as --install-dir)
  MIRROR                    Mirror URL (same as --mirror)

Examples:
  # Install latest version
  curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/opl-aion-shell/main/scripts/install-web.sh | bash

  # Install specific version
  VERSION=1.0.0 bash install-web.sh

  # Install to custom directory
  INSTALL_DIR="\$HOME/opt/opl-webui" bash install-web.sh

  # Use local file mirror (for offline installation)
  MIRROR=file:///path/to/releases bash install-web.sh
EOF
}

# ─── Core Functions ────────────────────────────────────────────────────────
detect_platform_arch() {
    local os_type="$(uname -s)"
    local machine="$(uname -m)"

    # Map OS type
    case "$os_type" in
        Darwin)
            PLATFORM="darwin"
            ;;
        Linux)
            PLATFORM="linux"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            PLATFORM="win"
            ;;
        *)
            die "Unsupported OS: $os_type (only Darwin, Linux, Windows supported)"
            ;;
    esac

    # Map architecture
    case "$machine" in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            die "Unsupported architecture: $machine (only x86_64/amd64 and aarch64/arm64 supported)"
            ;;
    esac

    info "Detected platform: ${BOLD}${PLATFORM}-${ARCH}${NC}"

    # Build tarball filename
    TARBALL_NAME="one-person-lab-webui-${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
    CHECKSUM_NAME="${TARBALL_NAME}.sha256"
}

resolve_version() {
    # Trigger GitHub API resolution when:
    # - VERSION is "latest" (explicit)
    # - VERSION still contains the CI placeholder pattern (letters/underscores,
    #   i.e. sed did NOT run and we have the raw "__VERSION__" token)
    # Note: a real version number is digits+dots only, so `[a-zA-Z_]` is a
    # reliable marker of "placeholder". We avoid literal "__VERSION__" here
    # because the CI sed replacement rewrites every occurrence in this file,
    # including the comparison string.
    if [[ "$VERSION" == "latest" || "$VERSION" == "__VERSION__" ]]; then
        info "Resolving the latest OPL Shell version from GitHub API..."

        if command -v curl &>/dev/null; then
            VERSION=$(curl -fsSL "https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/latest" \
                | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
        elif command -v wget &>/dev/null; then
            VERSION=$(wget -qO- "https://api.github.com/repos/gaofeng21cn/one-person-lab-app/releases/latest" \
                | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')
        else
            die "curl or wget is required to resolve version. Please install curl or wget."
        fi

        if [[ -z "$VERSION" ]]; then
            die "Failed to resolve latest version. Please specify version manually: VERSION=1.0.0 bash $0"
        fi

        info "Latest version: ${BOLD}v${VERSION}${NC}"
    else
        info "Using specified version: ${BOLD}v${VERSION}${NC}"
    fi

    # Rebuild tarball name (VERSION may have changed)
    TARBALL_NAME="one-person-lab-webui-${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
    CHECKSUM_NAME="${TARBALL_NAME}.sha256"
}

validate_version_identity() {
    if [[ ! "$VERSION" =~ ^[0-9]+(\.[0-9]+){2}([+-][0-9A-Za-z][0-9A-Za-z.-]*)?$ ]]; then
        die "Version must be a path-safe semantic version, got: $VERSION"
    fi
}

validate_distribution_base() {
    case "$MIRROR" in
        "$OFFICIAL_RELEASE_BASE"|"$OFFICIAL_RELEASE_BASE/")
            # Keep URL construction deterministic: prepare_download appends the
            # immutable release tag exactly once.
            MIRROR="$OFFICIAL_RELEASE_BASE"
            ;;
        file://*)
            [[ -n "${MIRROR#file://}" ]] || die "file:// development mirror must include a path"
            # Local file mirrors are a development-only escape hatch. Normalize
            # one trailing slash so the version directory is still appended once.
            if [[ "$MIRROR" != "file:///" ]]; then
                MIRROR="${MIRROR%/}"
            fi
            if [[ "$MIRROR" =~ /v[0-9][^/]*$ ]]; then
                die "Artifact base must not include a version directory; the installer appends the resolved version exactly once"
            fi
            ;;
        *)
            die "Unsupported artifact base: expected ${OFFICIAL_RELEASE_BASE} (optional trailing slash) or file:// development path"
            ;;
    esac
}

prepare_download() {
    TEMP_DIR="$(mktemp -d)"
    TARBALL_PATH="${TEMP_DIR}/${TARBALL_NAME}"
    CHECKSUM_PATH="${TEMP_DIR}/${CHECKSUM_NAME}"

    # Build download URL
    # MIRROR formats:
    #   - GitHub: https://github.com/gaofeng21cn/one-person-lab-app/releases/download
    #   - file: file:///path/to/releases
    if [[ "$MIRROR" == file://* ]]; then
        # Local file mirror (for offline installation or testing)
        local base_path="${MIRROR#file://}"
        TARBALL_URL="file://${base_path}/v${VERSION}/${TARBALL_NAME}"
        CHECKSUM_URL="file://${base_path}/v${VERSION}/${CHECKSUM_NAME}"
    else
        # GitHub releases
        TARBALL_URL="${MIRROR}/v${VERSION}/${TARBALL_NAME}"
        CHECKSUM_URL="${MIRROR}/v${VERSION}/${CHECKSUM_NAME}"
    fi

    info "Downloading OPL artifact metadata ${BOLD}${CHECKSUM_NAME}${NC}..."
    if [[ "$CHECKSUM_URL" == file://* ]]; then
        local src_path="${CHECKSUM_URL#file://}"
        if [[ ! -f "$src_path" ]]; then
            die "OPL artifact metadata not found at local mirror: $src_path"
        fi
        cp "$src_path" "$CHECKSUM_PATH"
    else
        if command -v curl &>/dev/null; then
            curl -fSL -o "$CHECKSUM_PATH" "$CHECKSUM_URL" || die "OPL artifact metadata download failed"
        elif command -v wget &>/dev/null; then
            wget -q -O "$CHECKSUM_PATH" "$CHECKSUM_URL" || die "OPL artifact metadata download failed"
        fi
    fi
}

artifact_field() {
    local key="$1"
    awk -F= -v expected="$key" '$1 == expected { print substr($0, index($0, "=") + 1); found += 1 } END { if (found != 1) exit 1 }' "$CHECKSUM_PATH"
}

require_artifact_field() {
    local key="$1"
    local expected="$2"
    local actual
    actual="$(artifact_field "$key")" || die "OPL artifact metadata must contain exactly one $key field"
    if [[ "$actual" != "$expected" ]]; then
        die "OPL artifact metadata $key mismatch: expected $expected, got $actual"
    fi
}

verify_artifact_metadata() {
    local checksum_line checksum_filename metadata_checksum
    checksum_line="$(head -n 1 "$CHECKSUM_PATH")"
    checksum_filename="$(printf '%s\n' "$checksum_line" | awk '{print $2}')"
    metadata_checksum="$(printf '%s\n' "$checksum_line" | awk '{print $1}')"
    [[ "$metadata_checksum" =~ ^[a-f0-9]{64}$ ]] || die "OPL artifact metadata checksum is invalid"
    [[ "$checksum_filename" == "$TARBALL_NAME" ]] || die "OPL artifact metadata filename mismatch"

    require_artifact_field schema "dev.onepersonlab.opl-native-webui-artifact.v1"
    require_artifact_field owner "one-person-lab-app"
    require_artifact_field producer "opl-aion-shell"
    require_artifact_field artifact_role "opl_native_webui_runtime"
    require_artifact_field runtime_form "native_webui"
    require_artifact_field version "$VERSION"
    require_artifact_field platform "$PLATFORM"
    require_artifact_field architecture "$ARCH"
    require_artifact_field entrypoint "aionui-web"
    require_artifact_field bootstrap_entrypoint "opl-install.sh"
    require_artifact_field official_profile_entrypoint "opl-official-profile-apply"
    require_artifact_field container_adapter "opl-webui-entrypoint.sh"
    require_artifact_field tarball "$TARBALL_NAME"
    require_artifact_field sha256 "$metadata_checksum"
    EXPECTED_CHECKSUM="$metadata_checksum"
    success "Verified OPL-owned artifact metadata"
}

probe_tarball() {
    if [[ "$TARBALL_URL" == file://* ]]; then
        [[ -f "${TARBALL_URL#file://}" ]] || die "Tarball not found at local mirror: ${TARBALL_URL#file://}"
    elif command -v curl &>/dev/null; then
        curl -fsSIL "$TARBALL_URL" >/dev/null || die "OPL Native WebUI artifact is not available: $TARBALL_URL"
    elif command -v wget &>/dev/null; then
        wget --spider -q "$TARBALL_URL" || die "OPL Native WebUI artifact is not available: $TARBALL_URL"
    else
        die "curl or wget is required. Please install curl or wget."
    fi
    success "OPL Native WebUI artifact is present for ${PLATFORM}-${ARCH}"
}

download_tarball() {
    info "Downloading ${BOLD}${TARBALL_NAME}${NC}..."
    info "URL: $TARBALL_URL"

    if [[ "$TARBALL_URL" == file://* ]]; then
        cp "${TARBALL_URL#file://}" "$TARBALL_PATH"
    elif command -v curl &>/dev/null; then
        curl -fSL --progress-bar -o "$TARBALL_PATH" "$TARBALL_URL" || die "Download failed"
    elif command -v wget &>/dev/null; then
        wget --show-progress -q -O "$TARBALL_PATH" "$TARBALL_URL" || die "Download failed"
    else
        die "curl or wget is required. Please install curl or wget."
    fi

    local size
    size=$(du -h "$TARBALL_PATH" | cut -f1)
    success "Downloaded tarball ($size)"
}

verify_checksum() {
    info "Verifying SHA256 checksum..."

    local actual_checksum
    if command -v shasum &>/dev/null; then
        actual_checksum=$(shasum -a 256 "$TARBALL_PATH" | awk '{print $1}')
    elif command -v sha256sum &>/dev/null; then
        actual_checksum=$(sha256sum "$TARBALL_PATH" | awk '{print $1}')
    else
        die "shasum or sha256sum is required to verify immutable OPL artifact bytes"
    fi

    if [[ "$actual_checksum" != "$EXPECTED_CHECKSUM" ]]; then
        error "Checksum mismatch!"
        error "Expected: $EXPECTED_CHECKSUM"
        error "Actual:   $actual_checksum"
        die "Tarball may be corrupted. Please try again."
    fi

    success "Checksum verified: ${EXPECTED_CHECKSUM:0:16}..."
}

configure_install_layout() {
    VERSIONS_DIR="${INSTALL_DIR}/versions"
    CURRENT_LINK="${INSTALL_DIR}/current"
    PREVIOUS_LINK="${INSTALL_DIR}/previous"
    TARGET_DIR="${VERSIONS_DIR}/${VERSION}"
    FIRST_INSTALL_MARKER="${INSTALL_DIR}/.official-profile-first-install-complete"
}

validate_runtime_link() {
    local link_path="$1"
    local label="$2"
    local target
    [[ -L "$link_path" ]] || die "${label} is not a symlink: $link_path"
    target="$(readlink "$link_path")"
    case "$target" in
        versions/*) ;;
        *) die "${label} must point inside ${VERSIONS_DIR}: $target" ;;
    esac
    [[ -x "${INSTALL_DIR}/${target}/aionui-web" ]] || die "${label} target is not executable: ${INSTALL_DIR}/${target}/aionui-web"
    printf '%s\n' "$target"
}

atomic_link() {
    local target="$1"
    local link_path="$2"
    local temp_link="$(dirname "$link_path")/.$(basename "$link_path").$$.tmp"
    ln -s "$target" "$temp_link"
    if [[ "$(uname -s)" == "Darwin" ]]; then
        mv -fh "$temp_link" "$link_path"
    else
        mv -Tf "$temp_link" "$link_path"
    fi
}

preflight_activation() {
    mkdir -p "$VERSIONS_DIR"
    if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
        die "Current runtime path exists but is not a symlink: $CURRENT_LINK"
    fi
    if [[ -e "$PREVIOUS_LINK" && ! -L "$PREVIOUS_LINK" ]]; then
        die "Previous runtime path exists but is not a symlink: $PREVIOUS_LINK"
    fi
    if [[ -e "${BIN_DIR}/aionui-web" && ! -L "${BIN_DIR}/aionui-web" ]]; then
        die "File already exists at ${BIN_DIR}/aionui-web (not a symlink). Please remove it manually."
    fi
    if [[ "$CREATE_SYMLINK" == "1" ]]; then
        mkdir -p "$BIN_DIR"
    fi
}

extract_tarball() {
    info "Preparing ${BOLD}${TARGET_DIR}${NC}..."

    if [[ -d "$TARGET_DIR" ]]; then
        if [[ -f "${TARGET_DIR}/opl-native-webui-artifact.sha256" ]] \
            && [[ "$(<"$CHECKSUM_PATH")" == "$(<"${TARGET_DIR}/opl-native-webui-artifact.sha256")" ]] \
            && [[ -x "${TARGET_DIR}/aionui-web" ]] \
            && [[ -x "${TARGET_DIR}/opl-install.sh" ]] \
            && [[ -x "${TARGET_DIR}/opl-official-profile-apply" ]]; then
            success "Version v${VERSION} is already installed with matching immutable metadata"
            return
        fi
        die "Version directory already exists with different or incomplete bytes: $TARGET_DIR"
    fi

    local extract_temp="${TEMP_DIR}/extract"
    local pending_dir="${VERSIONS_DIR}/.${VERSION}.$$.pending"
    mkdir -p "$extract_temp"

    info "Extracting tarball..."
    tar -xzf "$TARBALL_PATH" -C "$extract_temp" || die "Failed to extract tarball"

    if [[ ! -d "${extract_temp}/aionui-web" ]]; then
        die "Tarball structure is invalid (missing aionui-web/ directory)"
    fi

    # Set executable permission on the bun-compiled standalone binary
    chmod +x "${extract_temp}/aionui-web/aionui-web" 2>/dev/null || true
    chmod +x "${extract_temp}/aionui-web/opl-install.sh" 2>/dev/null || true
    chmod +x "${extract_temp}/aionui-web/opl-official-profile-apply" 2>/dev/null || true

    # On macOS, strip the quarantine xattr Safari/Chrome/curl-downloaded files
    # inherit — otherwise Gatekeeper kills unsigned Mach-O binaries with a
    # "damaged, can't be opened" dialog. This is standard practice for CLI
    # tools distributed as tarballs (bun, deno, rustup do the same).
    if command -v xattr &>/dev/null; then
        xattr -dr com.apple.quarantine "${extract_temp}/aionui-web" 2>/dev/null || true
    fi

    [[ -x "${extract_temp}/aionui-web/aionui-web" ]] || die "Artifact entrypoint is missing or not executable"
    [[ -x "${extract_temp}/aionui-web/opl-install.sh" ]] || die "Artifact Base bootstrap is missing or not executable"
    [[ -x "${extract_temp}/aionui-web/opl-official-profile-apply" ]] || die "Artifact Official Profile consumer is missing or not executable"
    cp "$CHECKSUM_PATH" "${extract_temp}/aionui-web/opl-native-webui-artifact.sha256"
    mv "${extract_temp}/aionui-web" "$pending_dir"
    mv "$pending_dir" "$TARGET_DIR"
    success "Prepared version v${VERSION}"
}

create_symlink() {
    local symlink_path="${BIN_DIR}/aionui-web"
    local target_path="${CURRENT_LINK}/aionui-web"

    info "Creating symlink: ${BOLD}${symlink_path}${NC} -> ${target_path}"

    if [[ -L "$symlink_path" ]]; then
        if [[ "$(readlink "$symlink_path")" == "$target_path" ]]; then
            success "Symlink already points to the active runtime"
            return
        fi
    fi

    atomic_link "$target_path" "$symlink_path" || die "Failed to create symlink"

    success "Symlink created: $symlink_path"
}

run_first_install_setup() {
    if [[ -e "$FIRST_INSTALL_MARKER" ]]; then
        info "Official Profile first-install marker already exists; preserving user Package choices"
        return
    fi

    info "Installing OPL Base for Native WebUI..."
    bash "${TARGET_DIR}/opl-install.sh" --headless --skip-packages

    local opl_bin="${OPL_BIN:-}"
    if [[ -z "$opl_bin" ]]; then
        opl_bin="$(command -v opl 2>/dev/null || true)"
    fi
    if [[ -z "$opl_bin" && -x "${HOME}/.local/bin/opl" ]]; then
        opl_bin="${HOME}/.local/bin/opl"
    fi
    [[ -n "$opl_bin" && -x "$opl_bin" ]] || die "OPL Base installed without a callable opl CLI; Official Profile cannot be applied"

    info "Applying the App Official Profile for first install..."
    "${TARGET_DIR}/opl-official-profile-apply" --intent first_install --profile embedded --opl-bin "$opl_bin"
    : > "$FIRST_INSTALL_MARKER"
    success "Official Profile first-install completed"
}

activate_version() {
    local old_current=""
    if [[ -L "$CURRENT_LINK" ]]; then
        old_current="$(validate_runtime_link "$CURRENT_LINK" "Current runtime")"
    fi
    local new_current="versions/${VERSION}"
    if [[ "$old_current" == "$new_current" ]]; then
        success "v${VERSION} is already active"
        return
    fi
    if [[ -n "$old_current" ]]; then
        atomic_link "$old_current" "$PREVIOUS_LINK"
    fi
    atomic_link "$new_current" "$CURRENT_LINK"
    success "Activated v${VERSION}"
}

rollback_version() {
    configure_install_layout
    preflight_activation
    [[ -L "$CURRENT_LINK" ]] || die "No active Native WebUI version is available to roll back"
    [[ -L "$PREVIOUS_LINK" ]] || die "No previous Native WebUI version is available to roll back"
    local current_target previous_target
    current_target="$(validate_runtime_link "$CURRENT_LINK" "Current runtime")"
    previous_target="$(validate_runtime_link "$PREVIOUS_LINK" "Previous runtime")"
    atomic_link "$previous_target" "$CURRENT_LINK"
    atomic_link "$current_target" "$PREVIOUS_LINK"
    success "Rolled back to ${previous_target#versions/}; previous now points to ${current_target#versions/}"
}

update_shell_profile() {
    case "$BIN_DIR" in
        *$'\n'*|*$'\r'*) die "BIN_DIR must not contain newline or carriage-return characters" ;;
    esac
    # Check if BIN_DIR is already in PATH
    if [[ ":$PATH:" == *":${BIN_DIR}:"* ]]; then
        info "PATH already contains ${BOLD}${BIN_DIR}${NC}"
        return
    fi

    info "Adding ${BOLD}${BIN_DIR}${NC} to PATH in shell profile..."

    # Detect current shell
    local shell_name
    shell_name="$(basename "$SHELL")"

    local profile_file=""
    case "$shell_name" in
        bash)
            if [[ -f "$HOME/.bashrc" ]]; then
                profile_file="$HOME/.bashrc"
            elif [[ -f "$HOME/.bash_profile" ]]; then
                profile_file="$HOME/.bash_profile"
            fi
            ;;
        zsh)
            profile_file="$HOME/.zshrc"
            ;;
        fish)
            profile_file="$HOME/.config/fish/config.fish"
            ;;
        *)
            warn "Unknown shell: $shell_name. Please manually add ${BIN_DIR} to PATH."
            return
            ;;
    esac

    if [[ -z "$profile_file" ]]; then
        warn "Shell profile not found. Please manually add ${BIN_DIR} to PATH."
        return
    fi

    # Single-quote the path for POSIX shells so profile sourcing cannot execute
    # shell syntax embedded in a caller-supplied BIN_DIR.
    local quoted_bin_dir
    local path_line
    quoted_bin_dir=$(printf '%s' "$BIN_DIR" | sed "s/'/'\\\\''/g")
    path_line="export PATH='${quoted_bin_dir}':\$PATH"

    # Check if configuration already exists
    if grep -Fq -- "$BIN_DIR" "$profile_file" 2>/dev/null; then
        info "PATH configuration already exists in $profile_file"
        return
    fi

    # Add to profile
    printf '\n%s\n%s\n' "# Added by aionui-web installer" "$path_line" >> "$profile_file"

    success "Added PATH to $profile_file"
    warn "Please restart your shell or run: source $profile_file"
}

print_summary() {
    echo ""
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  One Person Lab Native WebUI v${VERSION} Installed${NC}"
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}📍 Active runtime:${NC}          ${CURRENT_LINK} -> versions/${VERSION}"
    echo -e "  ${BOLD}📍 Persistent data:${NC}         ${HOME}/.local/share/one-person-lab/webui/data"
    if [[ "$CREATE_SYMLINK" == "1" ]]; then
        echo -e "  ${BOLD}📍 Symlink:${NC}                ${BIN_DIR}/aionui-web"
    fi
    echo ""
    echo -e "  ${BOLD}🚀 Usage:${NC}"
    echo ""
    if [[ "$CREATE_SYMLINK" == "1" && ":$PATH:" == *":${BIN_DIR}:"* ]]; then
        echo "    # Start AionUi WebUI"
        echo "    aionui-web start"
        echo ""
        echo "    # Check version"
        echo "    aionui-web version"
    else
        echo "    # Start AionUi WebUI (using full path)"
        echo "    ${CURRENT_LINK}/aionui-web start"
        echo ""
        echo "    # Or add symlink to PATH:"
        if [[ "$CREATE_SYMLINK" == "1" ]]; then
            echo "    export PATH=\"${BIN_DIR}:\$PATH\""
        else
            echo "    ln -s ${CURRENT_LINK}/aionui-web ~/.local/bin/aionui-web"
            echo "    export PATH=\"~/.local/bin:\$PATH\""
        fi
    fi
    echo ""
    echo -e "  ${BOLD}Documentation:${NC}  https://github.com/gaofeng21cn/one-person-lab-app"
    echo -e "  ${BOLD}Report issues:${NC}  https://github.com/gaofeng21cn/opl-aion-shell/issues"
    echo ""
    echo -e "  ${BOLD}🗑️  Uninstall:${NC}"
    echo ""
    echo "    # Remove installation directory"
    echo "    rm -rf ${INSTALL_DIR}"
    if [[ "$CREATE_SYMLINK" == "1" ]]; then
        echo ""
        echo "    # Remove symlink"
        echo "    rm ${BIN_DIR}/aionui-web"
    fi
    if [[ "$UPDATE_PATH" == "1" ]]; then
        echo ""
        echo "    # Remove PATH configuration from shell profile"
        echo "    # (manually edit ~/.bashrc or ~/.zshrc)"
    fi
    echo ""
}

# ─── Main Flow ──────────────────────────────────────────────────────────────
main() {
    banner
    parse_args "$@"

    if [[ "$ROLLBACK" == "1" ]]; then
        if [[ "$PROBE_ARTIFACT" == "1" ]]; then
            die "--rollback cannot be combined with --probe-artifact"
        fi
        rollback_version
        if [[ "$CREATE_SYMLINK" == "1" ]]; then
            create_symlink
        fi
        return
    fi

    # Step 1: Reject untrusted or version-qualified artifact bases before any
    # metadata request. prepare_download owns the single version-path append.
    validate_distribution_base

    # Step 2: Detect platform and architecture
    detect_platform_arch

    # Step 3: Resolve version (if VERSION is __VERSION__ or latest)
    resolve_version
    validate_version_identity
    configure_install_layout

    # Step 4: Require OPL-owned immutable artifact metadata.
    prepare_download
    verify_artifact_metadata
    probe_tarball
    if [[ "$PROBE_ARTIFACT" == "1" ]]; then
        return
    fi
    preflight_activation

    # Step 5: Download tarball
    download_tarball

    # Step 6: Verify SHA256 checksum
    verify_checksum

    # Step 7: Extract tarball
    extract_tarball

    # Step 8: Update shell profile PATH
    if [[ "$UPDATE_PATH" == "1" ]]; then
        update_shell_profile
    fi

    # Step 9: First install owns Base + Official Profile. Updates preserve the
    # user's Package choices and never reapply the profile.
    if [[ ! -L "$CURRENT_LINK" ]]; then
        run_first_install_setup
    fi

    # Step 10: Activation is the final runtime mutation so an earlier failure leaves
    # the previously active version unchanged.
    activate_version

    # Step 11: Point the stable user command at current/aionui-web.
    if [[ "$CREATE_SYMLINK" == "1" ]]; then
        create_symlink
    fi

    # Step 12: Print summary
    print_summary
}

# Execute
main "$@"

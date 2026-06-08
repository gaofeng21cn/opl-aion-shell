#!/usr/bin/env bash

set -euo pipefail

ARTIFACTS_DIR="${1:-build-artifacts}"
OUTPUT_DIR="${2:-release-assets}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

is_macos_arm64_distributable() {
  local file="$1"
  local base
  local parent
  base="$(basename "$file")"
  parent="$(basename "$(dirname "$file")")"

  if [ "$parent" = "macos-build-arm64" ]; then
    return 0
  fi

  case "$base" in
    *-mac-arm64.dmg | *-mac-arm64.zip | *-mac-arm64.dmg.blockmap | *-mac-arm64.zip.blockmap)
      return 0
      ;;
  esac

  return 1
}

# macOS GitHub runners still invoke Bash 3 for `shell: bash`; avoid Bash 4-only mapfile/readarray.
ALL_DISTRIBUTABLES=()
while IFS= read -r file; do
  ALL_DISTRIBUTABLES+=("$file")
done < <(find "$ARTIFACTS_DIR" -type f \( \
  -name "*.dmg" -o \
  -name "*.zip" -o \
  -name "*.blockmap" -o \
  -name "standard-gatekeeper-launch-policy.json" \
\) | sort)

DISTRIBUTABLES=()
for file in "${ALL_DISTRIBUTABLES[@]}"; do
  if is_macos_arm64_distributable "$file"; then
    DISTRIBUTABLES+=("$file")
  fi
done

if [ "${#DISTRIBUTABLES[@]}" -eq 0 ]; then
  echo "::error::No macOS arm64 distributables found under $ARTIFACTS_DIR"
  exit 1
fi

DUPLICATE_BASENAMES=$(for file in "${DISTRIBUTABLES[@]}"; do basename "$file"; done | sort | uniq -d || true)
if [ -n "$DUPLICATE_BASENAMES" ]; then
  echo "::error::Found duplicate distributable basenames that would be overwritten in flat output:"
  echo "$DUPLICATE_BASENAMES"
  exit 1
fi

for file in "${DISTRIBUTABLES[@]}"; do
  cp -f "$file" "$OUTPUT_DIR/"
done

find_macos_arm64_latest() {
  local nested
  local flat

  nested=$(find "$ARTIFACTS_DIR" -type f -path "*/macos-build-arm64/*" -name "latest-mac.yml" | sort | head -n 1 || true)
  if [ -n "$nested" ]; then
    echo "$nested"
    return
  fi

  flat="$ARTIFACTS_DIR/latest-mac.yml"
  if [ -f "$flat" ]; then
    echo "$flat"
    return
  fi
}

MAC_ARM64_LATEST=$(find_macos_arm64_latest)

[ -n "$MAC_ARM64_LATEST" ] && cp -f "$MAC_ARM64_LATEST" "$OUTPUT_DIR/latest-mac.yml"
[ -n "$MAC_ARM64_LATEST" ] && cp -f "$MAC_ARM64_LATEST" "$OUTPUT_DIR/latest-arm64-mac.yml"

MISSING=0
for required in latest-mac.yml latest-arm64-mac.yml; do
  if [ ! -f "$OUTPUT_DIR/$required" ]; then
    echo "::error::Missing required updater metadata: $required"
    MISSING=1
  fi
done

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

ls -lh "$OUTPUT_DIR"

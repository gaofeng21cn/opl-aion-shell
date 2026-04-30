#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
ERRORS=0

for f in latest.yml latest-mac.yml latest-linux.yml latest-linux-arm64.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing canonical metadata: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

extract_ref_file() {
  local metadata_file="$1"
  local ref
  ref=$(grep -E '^path:' "$metadata_file" | head -n 1 | sed -E 's/^path:[[:space:]]*//')
  if [ -z "$ref" ]; then
    ref=$(grep -E '^[[:space:]]*-?[[:space:]]*url:' "$metadata_file" | head -n 1 | sed -E 's/^[[:space:]]*-?[[:space:]]*url:[[:space:]]*//')
  fi
  echo "$ref"
}

assert_metadata_points_to_existing_file() {
  local metadata_name="$1"
  local expected_pattern="$2"
  local metadata_path="$OUTPUT_DIR/$metadata_name"

  local ref_file
  ref_file=$(extract_ref_file "$metadata_path")

  if [ -z "$ref_file" ]; then
    echo "FAIL: $metadata_name has no path/url entry"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [[ ! "$ref_file" =~ $expected_pattern ]]; then
    echo "FAIL: $metadata_name points to unexpected file: $ref_file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  if [ ! -f "$OUTPUT_DIR/$ref_file" ]; then
    echo "FAIL: $metadata_name references missing file: $ref_file"
    ERRORS=$((ERRORS + 1))
    return
  fi

  echo "PASS: $metadata_name -> $ref_file"
}

assert_metadata_points_to_existing_file "latest.yml" "(win-x64|win32-x64|x64)"
assert_metadata_points_to_existing_file "latest-mac.yml" "(mac-(x64|universal)|darwin-(x64|universal)|x64|universal)"
assert_metadata_points_to_existing_file "latest-linux.yml" "(linux|AppImage|deb)"
assert_metadata_points_to_existing_file "latest-linux-arm64.yml" "(arm64|aarch64)"

for f in latest-win-arm64.yml latest-arm64-mac.yml; do
  if [ ! -f "$OUTPUT_DIR/$f" ]; then
    echo "FAIL: missing arch-specific updater metadata: $f"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $f exists"
  fi
done

assert_metadata_points_to_existing_file "latest-arm64-mac.yml" "(mac-(arm64|universal)|darwin-(arm64|universal)|arm64|universal)"

MAC_DMG_COUNT=$(find "$OUTPUT_DIR" -maxdepth 1 -type f \( -name "*-mac-universal.dmg" -o -name "*-mac-x64.dmg" -o -name "*-mac-arm64.dmg" \) | wc -l | tr -d ' ')
if [ "$MAC_DMG_COUNT" -eq 0 ]; then
  echo "FAIL: missing macOS dmg distributable"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: macOS dmg distributable present"
fi

assert_any_distributable() {
  local label="$1"
  local pattern="$2"
  local count
  count=$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name "$pattern" | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    echo "FAIL: missing distributable: $label ($pattern)"
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: $label distributable present"
  fi
}

assert_any_distributable "Windows x64" "*win-x64.exe"
assert_any_distributable "Windows arm64" "*win-arm64.exe"
assert_any_distributable "Linux x64" "*linux-x64.deb"
assert_any_distributable "Linux arm64" "*linux-arm64.deb"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors found"
  exit 1
fi

echo "ALL CHECKS PASSED"

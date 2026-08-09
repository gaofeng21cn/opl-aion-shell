#!/usr/bin/env bash

set -euo pipefail

OUTPUT_DIR="${1:-release-assets}"
ERRORS=0

for required in latest-mac.yml latest-arm64-mac.yml; do
  if [ ! -f "$OUTPUT_DIR/$required" ]; then
    echo "FAIL: missing required updater metadata: $required"
    ERRORS=$((ERRORS + 1))
  fi
done

if [ "$ERRORS" -eq 0 ] && ! cmp -s "$OUTPUT_DIR/latest-mac.yml" "$OUTPUT_DIR/latest-arm64-mac.yml"; then
  echo "FAIL: latest-mac.yml and latest-arm64-mac.yml must be byte-identical"
  ERRORS=$((ERRORS + 1))
fi

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

if [ -f "$OUTPUT_DIR/latest-mac.yml" ]; then
  assert_metadata_points_to_existing_file "latest-mac.yml" "(mac-arm64|darwin-arm64|arm64)"
fi
if [ -f "$OUTPUT_DIR/latest-arm64-mac.yml" ]; then
  assert_metadata_points_to_existing_file "latest-arm64-mac.yml" "(mac-arm64|darwin-arm64|arm64)"
fi

MAC_DMG_COUNT=$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name "*-mac-arm64.dmg" | wc -l | tr -d ' ')
if [ "$MAC_DMG_COUNT" -eq 0 ]; then
  echo "FAIL: missing macOS dmg distributable"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: macOS dmg distributable present"
fi

MAC_ZIP_COUNT=$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name "*-mac-arm64.zip" | wc -l | tr -d ' ')
if [ "$MAC_ZIP_COUNT" -eq 0 ]; then
  echo "FAIL: missing macOS arm64 zip distributable"
  ERRORS=$((ERRORS + 1))
else
  echo "PASS: macOS arm64 zip distributable present"
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS errors found"
  exit 1
fi

echo "ALL CHECKS PASSED"

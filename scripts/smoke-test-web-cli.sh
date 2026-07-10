#!/bin/bash
set -e

TARBALL_PATH=$1

if [ -z "$TARBALL_PATH" ]; then
  echo "Usage: $0 <tarball-path>"
  exit 1
fi

echo "========================================"
echo "Smoke test for web-cli tarball"
echo "========================================"
echo "Tarball: $TARBALL_PATH"

# 1. Extract tarball
echo ""
echo "1. Extracting tarball..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$TARBALL_PATH" -C "$TEMP_DIR"

# 2. Verify directory structure
echo ""
echo "2. Verifying directory structure..."
if [ ! -d "$TEMP_DIR/aionui-web" ]; then
  echo "❌ Missing aionui-web directory"
  exit 1
fi

cd "$TEMP_DIR/aionui-web"

# New layout (bun compile standalone binary):
#   aionui-web/
#   ├── aionui-web           ← single compiled executable (no bin/, no dist/, no node_modules)
#   ├── package.json         ← for version lookup
#   ├── static/              ← SPA assets
#   └── bundled-aioncore/<plat-arch>/...
for dir in static bundled-aioncore; do
  if [ ! -d "$dir" ]; then
    echo "❌ Missing $dir directory"
    exit 1
  fi
  echo "✓ Found $dir/"
done

if [ ! -f "package.json" ]; then
  echo "❌ Missing package.json"
  exit 1
fi
echo "✓ Found package.json"

# 3. Check executable
echo ""
echo "3. Checking executable..."
if [ ! -x "aionui-web" ]; then
  echo "❌ aionui-web is not executable"
  exit 1
fi
echo "✓ aionui-web is executable"

# 4. Test version command
echo ""
echo "4. Testing version command..."
VERSION=$(./aionui-web version)
if [ -z "$VERSION" ]; then
  echo "❌ version command returned empty"
  exit 1
fi
echo "✓ Version: $VERSION"

# 5. Test backend binary
echo ""
echo "5. Checking backend binary..."
BACKEND_DIR="bundled-aioncore/$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/aarch64/arm64/; s/x86_64/x64/')"
BACKEND_BINARY="$BACKEND_DIR/aioncore"
if [ ! -x "$BACKEND_BINARY" ]; then
  echo "❌ Backend binary missing or not executable: $BACKEND_BINARY"
  exit 1
fi
if ! BACKEND_VERSION_OUTPUT=$("$BACKEND_BINARY" --version 2>&1); then
  echo "❌ Backend binary failed to report its version"
  echo "$BACKEND_VERSION_OUTPUT"
  exit 1
fi
REPORTED_BACKEND_VERSION=${BACKEND_VERSION_OUTPUT#aioncore }
if [ -f "$BACKEND_DIR/manifest.json" ]; then
  BACKEND_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$BACKEND_DIR/manifest.json" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  EXPECTED_BACKEND_VERSION=${BACKEND_VERSION#v}
  if [ "$REPORTED_BACKEND_VERSION" != "$EXPECTED_BACKEND_VERSION" ]; then
    echo "❌ Backend version mismatch: expected $EXPECTED_BACKEND_VERSION, reported $REPORTED_BACKEND_VERSION"
    exit 1
  fi
fi
echo "✓ Backend version: $REPORTED_BACKEND_VERSION"
if ! BACKEND_HELP=$("$BACKEND_BINARY" --help 2>&1); then
  echo "❌ Backend binary failed to exec (--help returned non-zero)"
  echo "$BACKEND_HELP" | head -5
  exit 1
fi
if ! echo "$BACKEND_HELP" | grep -q -- '--recover-corrupted-database'; then
  echo "❌ Backend binary is missing --recover-corrupted-database"
  exit 1
fi
echo "✓ Backend binary exposes --recover-corrupted-database"

# 6. HTTP-level smoke: start web-cli, curl the root, check for SPA shell
echo ""
echo "6. Testing HTTP server responds with SPA index..."
HTTP_PORT=25899
DATA_DIR="$(mktemp -d)/aionui-web-data"
# Full-stack start: backend is bundled, so we can also exercise /login below.
# If the bundled backend is missing the CLI falls back to frontend-only mode
# and later login probe is skipped.
./aionui-web start --port "$HTTP_PORT" --data-dir "$DATA_DIR" > /tmp/aionui-web.log 2>&1 &
SERVER_PID=$!

# Wait up to 30s for HTTP to come up. With backend spawned, first start spends
# time on SQLite migrations on slower CI runners.
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${HTTP_PORT}/" > /tmp/aionui-web.html 2>/dev/null; then
    break
  fi
  sleep 1
done

if [ ! -s /tmp/aionui-web.html ]; then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "❌ HTTP probe failed — no response body. Server log:"
  cat /tmp/aionui-web.log
  exit 1
fi

# Look for the SPA shell signature — <html + <div id="root" or similar marker
if grep -q '<html' /tmp/aionui-web.html && grep -qE '<(div id="root"|script)' /tmp/aionui-web.html; then
  echo "✓ HTTP root returns SPA index ($(wc -c < /tmp/aionui-web.html) bytes)"
else
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "❌ HTTP root response does not look like SPA index:"
  head -20 /tmp/aionui-web.html
  echo "---server log---"
  cat /tmp/aionui-web.log
  exit 1
fi

# 7. Auth-setup smoke: verify stdout announces browser auto-login, then call
#    /api/auth/user without manually posting credentials. The WebUI should
#    create a session cookie through its startup credential path.
#    Skip when the bundled backend was unavailable — there's no /login to call.
echo ""
echo "7. Testing browser auto-login..."
if grep -q 'Backend binary not found' /tmp/aionui-web.log; then
  echo "⚠️  frontend-only mode detected (no bundled backend) — skipping auto-login probe"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
else
  # Wait up to 20s for the browser auto-login readiness line — the backend
  # needs to finish migrations before startup credentials are ready.
  AUTO_LOGIN_READY=""
  for i in $(seq 1 20); do
    AUTO_LOGIN_READY=$(grep -oE 'Browser login is configured automatically for username "[^"]+"' /tmp/aionui-web.log | head -1 || true)
    if [ -n "$AUTO_LOGIN_READY" ]; then
      break
    fi
    sleep 1
  done

  if [ -z "$AUTO_LOGIN_READY" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    echo "❌ Never saw browser auto-login readiness in stdout."
    echo "---server log---"
    cat /tmp/aionui-web.log
    exit 1
  fi
  echo "✓ Browser auto-login was configured"

  AUTH_RESP_HEADERS=$(mktemp)
  AUTH_RESP_BODY=$(mktemp)
  HTTP_CODE=$(curl -sS -o "$AUTH_RESP_BODY" -D "$AUTH_RESP_HEADERS" -w '%{http_code}' \
    "http://127.0.0.1:${HTTP_PORT}/api/auth/user" || echo "000")

  # Stop the server before asserting so we don't leak a process on failure.
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true

  if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ /api/auth/user returned HTTP $HTTP_CODE"
    echo "---headers---"
    cat "$AUTH_RESP_HEADERS"
    echo "---body---"
    cat "$AUTH_RESP_BODY"
    echo "---server log---"
    cat /tmp/aionui-web.log
    exit 1
  fi

  if ! grep -q '"success":[[:space:]]*true' "$AUTH_RESP_BODY"; then
    echo "❌ /api/auth/user returned 200 but body had no success:true"
    cat "$AUTH_RESP_BODY"
    exit 1
  fi

  if ! grep -iq '^set-cookie:' "$AUTH_RESP_HEADERS"; then
    echo "❌ /api/auth/user returned success but no Set-Cookie header"
    cat "$AUTH_RESP_HEADERS"
    exit 1
  fi
  echo "✓ Browser auto-login succeeded (HTTP 200 + Set-Cookie present)"
fi

# Cleanup
cd -
rm -rf "$TEMP_DIR"

echo ""
echo "========================================"
echo "✅ Smoke test passed!"
echo "========================================"

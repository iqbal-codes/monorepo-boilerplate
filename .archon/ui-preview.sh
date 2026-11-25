#!/usr/bin/env bash
# Starts the web app on a free port and prints URL= and PID= for factory-slice
# UX verification. Pass --with-api (or PREVIEW_WITH_API=1) for full-stack E2E
# with apps/server (:3000) and apps/web (:3001). Safe to run more than once.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
SERVER_DIR="$ROOT/apps/server"

WITH_API="${PREVIEW_WITH_API:-0}"
for arg in "$@"; do
  case "$arg" in
    --with-api) WITH_API=1 ;;
    *)
      echo "ui-preview: unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

# Pick a free port so parallel slices and a running dev server do not collide.
# curl exit 7 means the connection was refused, so nothing is listening there.
pick_port() {
  local port code
  for port in $(seq 4100 4199); do
    code=0
    curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$port/" || code=$?
    if [ "$code" -eq 7 ]; then
      printf '%s' "$port"
      return 0
    fi
  done
  return 1
}

wait_for_http() {
  local url="$1"
  local pid="$2"
  local log="$3"
  local label="$4"
  for _ in $(seq 1 120); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "ui-preview: $label exited; log follows" >&2
      tail -n 20 "$log" >&2
      return 1
    fi
    if curl -sf -o /dev/null --max-time 2 "$url"; then
      return 0
    fi
    sleep 1
  done
  echo "ui-preview: timed out waiting for $label ($url); log follows" >&2
  tail -n 20 "$log" >&2
  return 1
}

if [ ! -f "$WEB_DIR/.env" ] || [ ! -f "$SERVER_DIR/.env" ]; then
  bun "$ROOT/scripts/env-init.ts" >/dev/null 2>&1 || true
fi

if [ "$WITH_API" = "1" ]; then
  API_PORT=3000
  WEB_PORT=3001
  API_LOG="${TMPDIR:-/tmp}/archon-e2e-api-$API_PORT.log"
  WEB_LOG="${TMPDIR:-/tmp}/archon-e2e-web-$WEB_PORT.log"

  API_PID=""
  if ! curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$API_PORT/"; then
    cd "$SERVER_DIR"
    setsid bun run --hot src/index.ts >"$API_LOG" 2>&1 < /dev/null &
    API_PID=$!
    if ! wait_for_http "http://127.0.0.1:$API_PORT/" "$API_PID" "$API_LOG" "api server"; then
      kill -- -"$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true
      exit 1
    fi
  fi

  cd "$WEB_DIR"
  setsid bunx --bun vp dev --port "$WEB_PORT" --strictPort --host localhost >"$WEB_LOG" 2>&1 < /dev/null &
  WEB_PID=$!
  if ! wait_for_http "http://localhost:$WEB_PORT/" "$WEB_PID" "$WEB_LOG" "web dev server"; then
    kill -- -"$WEB_PID" 2>/dev/null || kill "$WEB_PID" 2>/dev/null || true
    [ -n "$API_PID" ] && { kill -- -"$API_PID" 2>/dev/null || kill "$API_PID" 2>/dev/null || true; }
    exit 1
  fi

  E2E_EMAIL="${PREVIEW_E2E_EMAIL:-dev@example.com}"
  E2E_PASSWORD="${PREVIEW_E2E_PASSWORD:-Password123!}"
  curl -s -o /dev/null -X POST "http://127.0.0.1:$API_PORT/api/auth/sign-up/email" \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:$WEB_PORT" \
    -d "{\"name\":\"Dev User\",\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\"}" || true

  printf 'URL=http://localhost:%s\nPID=%s\nWEB_LOG=%s\nAPI_URL=http://localhost:%s\nAPI_PID=%s\nAPI_LOG=%s\nE2E_EMAIL=%s\nE2E_PASSWORD=%s\n' \
    "$WEB_PORT" "$WEB_PID" "$WEB_LOG" "$API_PORT" "$API_PID" "$API_LOG" "$E2E_EMAIL" "$E2E_PASSWORD"
  exit 0
fi

PORT="$(pick_port)" || {
  echo "ui-preview: no free port in 4100-4199" >&2
  exit 1
}

LOG="${TMPDIR:-/tmp}/archon-ui-preview-$PORT.log"

cd "$WEB_DIR"

bunx --bun vp dev --port "$PORT" --strictPort --host 127.0.0.1 >"$LOG" 2>&1 &
LAUNCH_PID=$!

cleanup() {
  kill "$LAUNCH_PID" 2>/dev/null || true
}
trap cleanup INT TERM

if wait_for_http "http://127.0.0.1:$PORT/" "$LAUNCH_PID" "$LOG" "dev server"; then
  # The launcher spawns the real server as a child, so report the process that
  # owns the port; stopping it stops the preview.
  PID="$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
  printf 'URL=http://127.0.0.1:%s\nPID=%s\n' "$PORT" "${PID:-$LAUNCH_PID}"
  exit 0
fi

cleanup
exit 1

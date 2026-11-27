#!/usr/bin/env bash
# Starts an isolated web preview server on a free port and prints URL= and PID=
# for UX/E2E verification. Pass --with-api (or PREVIEW_WITH_API=1) for
# full-stack verification with apps/server and apps/web on free ports.
# Pass --ephemeral-db (implies --with-api) to boot, push, and seed a disposable
# postgres:18 Docker container that is automatically stopped on `kill "$PID"`.
# Optional overrides: PREVIEW_WEB_PORT, PREVIEW_API_PORT, PREVIEW_DATABASE_URL.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
SERVER_DIR="$ROOT/apps/server"

WITH_API="${PREVIEW_WITH_API:-0}"
EPHEMERAL_DB=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --with-api) WITH_API=1 ;;
    --ephemeral-db)
      EPHEMERAL_DB=1
      WITH_API=1
      ;;
    --check) CHECK_ONLY=1 ;;
    *)
      echo "ui-preview: unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

# Pick a free port across IPv4/IPv6 so parallel slices and local dev servers never collide.
pick_port() {
  local start="${1:-4100}"
  local end="${2:-4199}"
  local port
  for port in $(seq "$start" "$end"); do
    if command -v ss >/dev/null 2>&1; then
      if [ -z "$(ss -ltnH "sport = :$port" 2>/dev/null)" ]; then
        printf '%s' "$port"
        return 0
      fi
    else
      local code=0
      curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$port/" || code=$?
      if [ "$code" -eq 7 ]; then
        printf '%s' "$port"
        return 0
      fi
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
      tail -n 20 "$log" >&2 || true
      return 1
    fi
    if curl -sf -o /dev/null --max-time 2 "$url"; then
      return 0
    fi
    sleep 1
  done
  echo "ui-preview: timed out waiting for $label ($url); log follows" >&2
  tail -n 20 "$log" >&2 || true
  return 1
}

start_session() {
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@"
  else
    bun -e '
      import { spawn } from "node:child_process";
      const [command, ...args] = process.argv.slice(1);
      spawn(command, args, { detached: true, stdio: "ignore" }).unref();
    ' -- "$@"
  fi
}

if [ -x "$ROOT/node_modules/.bin/vp" ]; then
  VP_BIN="$ROOT/node_modules/.bin/vp"
elif command -v vp >/dev/null 2>&1; then
  VP_BIN="$(command -v vp)"
else
  echo "ui-preview: vp not found (node_modules not installed; run bun install first)" >&2
  exit 1
fi

if [ "$CHECK_ONLY" = "1" ]; then
  if [ ! -d "$ROOT/node_modules" ]; then
    echo "ui-preview: node_modules not installed (run bun install first)" >&2
    exit 1
  fi
  exit 0
fi

if [ ! -f "$WEB_DIR/.env" ] || [ ! -f "$SERVER_DIR/.env" ]; then
  bun "$ROOT/scripts/env-init.ts" >/dev/null 2>&1 || true
fi

if [ "$WITH_API" = "1" ]; then
  EPHEMERAL_CONTAINER=""
  DB_URL="${PREVIEW_DATABASE_URL:-}"
  cleanup_ephemeral_on_boot_fail() {
    if [ -n "$EPHEMERAL_CONTAINER" ]; then
      docker stop --time 2 "$EPHEMERAL_CONTAINER" >/dev/null 2>&1 || docker rm -f "$EPHEMERAL_CONTAINER" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_ephemeral_on_boot_fail EXIT

  if [ "$EPHEMERAL_DB" = "1" ]; then
    if ! command -v docker >/dev/null 2>&1; then
      echo "ui-preview: docker is required for --ephemeral-db" >&2
      exit 1
    fi
    DB_PASS="preview-$(date +%s)-$$"
    EPHEMERAL_CONTAINER="$(docker run --rm -d -p 127.0.0.1::5432 -e POSTGRES_DB=preview -e POSTGRES_PASSWORD="$DB_PASS" postgres:18)"
    DB_PORT="$(docker port "$EPHEMERAL_CONTAINER" 5432/tcp | awk -F: 'END{print $NF}')"
    if [ -z "$DB_PORT" ]; then
      echo "ui-preview: failed to resolve ephemeral Postgres port" >&2
      exit 1
    fi
    DB_URL="postgresql://postgres:${DB_PASS}@127.0.0.1:${DB_PORT}/preview"
    READY=0
    for _ in $(seq 1 60); do
      if docker exec "$EPHEMERAL_CONTAINER" pg_isready -h 127.0.0.1 -d preview >/dev/null 2>&1; then
        READY=1
        break
      fi
      sleep 0.5
    done
    if [ "$READY" != "1" ]; then
      echo "ui-preview: timed out waiting for ephemeral Postgres" >&2
      exit 1
    fi
    (cd "$ROOT" && DATABASE_URL="$DB_URL" bun run db:push >/dev/null && DATABASE_URL="$DB_URL" bun run db:seed >/dev/null)
  fi

  API_PORT="${PREVIEW_API_PORT:-$(pick_port 4200 4299)}" || {
    echo "ui-preview: no free API port in 4200-4299" >&2
    exit 1
  }
  WEB_PORT="${PREVIEW_WEB_PORT:-$(pick_port 4100 4199)}" || {
    echo "ui-preview: no free web port in 4100-4199" >&2
    exit 1
  }

  API_URL="http://localhost:$API_PORT"
  WEB_URL="http://localhost:$WEB_PORT"
  API_LOG="${TMPDIR:-/tmp}/archon-e2e-api-$API_PORT.log"
  WEB_LOG="${TMPDIR:-/tmp}/archon-e2e-web-$WEB_PORT.log"
  META_FILE="$(mktemp "${TMPDIR:-/tmp}/archon-e2e-meta.XXXXXX")"

  # Supervise both children in one session (`PGID == SUP_PID`) so `kill "$PID"` tears down API, Web, Vite children, and any ephemeral Postgres container.
  start_session bash -c '
    set -euo pipefail
    api_dir="$1" web_dir="$2" api_port="$3" web_port="$4" api_url="$5" web_url="$6" api_log="$7" web_log="$8" meta_file="$9" db_url="${10:-}" vp_bin="${11}" ephemeral_container="${12:-}"

    if [ -n "$db_url" ]; then
      (cd "$api_dir" && exec env PORT="$api_port" BETTER_AUTH_URL="$api_url" CORS_ORIGIN="$web_url" DATABASE_URL="$db_url" bun run --hot src/index.ts >"$api_log" 2>&1 < /dev/null) &
    else
      (cd "$api_dir" && exec env PORT="$api_port" BETTER_AUTH_URL="$api_url" CORS_ORIGIN="$web_url" bun run --hot src/index.ts >"$api_log" 2>&1 < /dev/null) &
    fi
    api_pid=$!

    (cd "$web_dir" && exec env VITE_SERVER_URL="$api_url" "$vp_bin" dev --port "$web_port" --strictPort --host localhost >"$web_log" 2>&1 < /dev/null) &
    web_pid=$!

    printf "SUP_PID=%s\nAPI_PID=%s\nWEB_PID=%s\n" "$$" "$api_pid" "$web_pid" >"$meta_file"

    cleanup() {
      trap "" TERM INT EXIT
      rm -f "$meta_file"
      if [ -n "$ephemeral_container" ]; then
        docker stop --time 2 "$ephemeral_container" >/dev/null 2>&1 || docker rm -f "$ephemeral_container" >/dev/null 2>&1 || true
      fi
      kill -TERM -- -"$$" 2>/dev/null || true
      exit 0
    }
    trap cleanup TERM INT EXIT

    while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
      sleep 1
    done
    cleanup
  ' _ "$SERVER_DIR" "$WEB_DIR" "$API_PORT" "$WEB_PORT" "$API_URL" "$WEB_URL" "$API_LOG" "$WEB_LOG" "$META_FILE" "$DB_URL" "$VP_BIN" "$EPHEMERAL_CONTAINER" >/dev/null 2>&1 < /dev/null &

  for _ in $(seq 1 40); do
    [ -s "$META_FILE" ] && break
    sleep 0.1
  done
  if [ ! -s "$META_FILE" ]; then
    rm -f "$META_FILE"
    echo "ui-preview: supervisor failed to start" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$META_FILE"

  if ! wait_for_http "http://127.0.0.1:$API_PORT/" "$API_PID" "$API_LOG" "api server"; then
    kill "$SUP_PID" 2>/dev/null || true
    exit 1
  fi
  if ! wait_for_http "$WEB_URL/" "$WEB_PID" "$WEB_LOG" "web dev server"; then
    kill "$SUP_PID" 2>/dev/null || true
    exit 1
  fi

  # Supervisor now owns $EPHEMERAL_CONTAINER cleanup.
  trap - EXIT

  E2E_EMAIL="${PREVIEW_E2E_EMAIL:-dev@example.com}"
  E2E_PASSWORD="${PREVIEW_E2E_PASSWORD:-Password123!}"
  curl -s -o /dev/null -X POST "http://127.0.0.1:$API_PORT/api/auth/sign-up/email" \
    -H "Content-Type: application/json" \
    -H "Origin: $WEB_URL" \
    -d "{\"name\":\"Dev User\",\"email\":\"$E2E_EMAIL\",\"password\":\"$E2E_PASSWORD\"}" || true

  printf 'URL=%s\nPID=%s\nWEB_LOG=%s\nAPI_URL=%s\nAPI_PID=%s\nAPI_LOG=%s\nE2E_EMAIL=%s\nE2E_PASSWORD=%s\nEPHEMERAL_CONTAINER=%s\n' \
    "$WEB_URL" "$SUP_PID" "$WEB_LOG" "$API_URL" "$API_PID" "$API_LOG" "$E2E_EMAIL" "$E2E_PASSWORD" "$EPHEMERAL_CONTAINER"
  exit 0
fi

PORT="${PREVIEW_WEB_PORT:-$(pick_port 4100 4199)}" || {
  echo "ui-preview: no free port in 4100-4199" >&2
  exit 1
}

LOG="${TMPDIR:-/tmp}/archon-ui-preview-$PORT.log"
META_FILE="$(mktemp "${TMPDIR:-/tmp}/archon-ui-meta.XXXXXX")"

start_session bash -c '
  set -euo pipefail
  web_dir="$1" port="$2" log="$3" meta_file="$4" vp_bin="$5"
  (cd "$web_dir" && exec "$vp_bin" dev --port "$port" --strictPort --host 127.0.0.1 >"$log" 2>&1 < /dev/null) &
  web_pid=$!
  printf "SUP_PID=%s\nWEB_PID=%s\n" "$$" "$web_pid" >"$meta_file"
  cleanup() {
    trap "" TERM INT EXIT
    rm -f "$meta_file"
    kill -TERM -- -"$$" 2>/dev/null || true
    exit 0
  }
  trap cleanup TERM INT EXIT
  wait "$web_pid" || true
  cleanup
' _ "$WEB_DIR" "$PORT" "$LOG" "$META_FILE" "$VP_BIN" >/dev/null 2>&1 < /dev/null &

for _ in $(seq 1 40); do
  [ -s "$META_FILE" ] && break
  sleep 0.1
done
if [ ! -s "$META_FILE" ]; then
  rm -f "$META_FILE"
  echo "ui-preview: preview supervisor failed to start" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$META_FILE"

if wait_for_http "http://127.0.0.1:$PORT/" "$WEB_PID" "$LOG" "dev server"; then
  printf 'URL=http://127.0.0.1:%s\nPID=%s\n' "$PORT" "$SUP_PID"
  exit 0
fi

kill "$SUP_PID" 2>/dev/null || true
exit 1

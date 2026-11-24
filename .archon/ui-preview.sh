#!/usr/bin/env bash
# Starts the web app on a free port and prints URL= and PID= for factory-slice
# UX verification. Run from the repository root; safe to run more than once.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"

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

PORT="$(pick_port)" || {
  echo "ui-preview: no free port in 4100-4199" >&2
  exit 1
}

LOG="${TMPDIR:-/tmp}/archon-ui-preview-$PORT.log"

cd "$WEB_DIR"

# The app reads VITE_SERVER_URL at startup; fall back to the local API so the
# preview renders even when only the web app is running.
if [ ! -f .env ]; then
  bun "$ROOT/scripts/env-init.ts" >/dev/null 2>&1 || true
fi

bunx --bun vp dev --port "$PORT" --strictPort --host 127.0.0.1 >"$LOG" 2>&1 &
LAUNCH_PID=$!

cleanup() {
  kill "$LAUNCH_PID" 2>/dev/null || true
}
trap cleanup INT TERM

# Wait for the server to answer before handing the URL to the caller.
for _ in $(seq 1 120); do
  if ! kill -0 "$LAUNCH_PID" 2>/dev/null; then
    echo "ui-preview: dev server exited; log follows" >&2
    tail -n 20 "$LOG" >&2
    exit 1
  fi
  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
    # The launcher spawns the real server as a child, so report the process that
    # owns the port; stopping it stops the preview.
    PID="$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
    printf 'URL=http://127.0.0.1:%s\nPID=%s\n' "$PORT" "${PID:-$LAUNCH_PID}"
    exit 0
  fi
  sleep 1
done

echo "ui-preview: timed out waiting for port $PORT; log follows" >&2
tail -n 20 "$LOG" >&2
cleanup
exit 1

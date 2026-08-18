#!/usr/bin/env bash
# Start the CritKey Pro backend (port 3001) and Vite frontend (port 5173) together.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "========================================"
echo "  Starting CritKey Pro"
echo "========================================"
echo "  Backend:  http://localhost:3001"
echo "  Frontend: http://localhost:5173"
echo "========================================"
echo "  Press Ctrl+C to stop both servers."
echo "========================================"
echo ""

# Give each server its own process group so Ctrl+C / cleanup stops npm and its children.
set -m

cleanup() {
  echo ""
  echo "Stopping CritKey Pro..."
  trap - EXIT INT TERM
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill -TERM -"$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill -TERM -"$FRONTEND_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run dev --prefix "$ROOT/server" &
SERVER_PID=$!

npm run dev --prefix "$ROOT/rubric-grader" &
FRONTEND_PID=$!

wait

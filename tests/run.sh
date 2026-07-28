#!/usr/bin/env bash
# Runs the assistant's tests. Starts the two local servers it needs, runs
# every suite, and stops the servers again whatever happens.
#
#   ./tests/run.sh          everything
#   ./tests/run.sh unit     just the two fast ones, no browser needed
#
# The end-to-end suite needs Playwright:  npm install  (inside tests/)
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SITE_PORT=8321
STUB_PORT=8322
FAILED=0

free_port() {
  if command -v fuser >/dev/null 2>&1; then fuser -k "$1/tcp" >/dev/null 2>&1
  elif command -v lsof >/dev/null 2>&1; then lsof -ti "tcp:$1" 2>/dev/null | xargs -r kill
  fi
}
cleanup() {
  [ -n "${SITE_PID:-}" ] && kill "$SITE_PID" 2>/dev/null
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  return 0
}
trap cleanup EXIT

run() {   # run <name> <command...>
  echo ""
  echo "── $1 ─────────────────────────────────"
  shift
  if "$@"; then :; else FAILED=1; fi
}

run "brain (no browser)" node "$HERE/brain.test.js"
run "api request shape (no browser)" node "$HERE/ai.test.js"
run "provider presets (no browser)" node "$HERE/providers.test.js"
run "streaming (no browser)" node "$HERE/streaming.test.js"
run "scanned pages (no browser)" node "$HERE/ocr.test.js"
run "hostile input & edge cases (no browser)" node "$HERE/explore.js"

if [ "${1:-all}" = "unit" ]; then
  echo ""
  [ "$FAILED" -eq 0 ] && echo "unit suites passed" || echo "SOMETHING FAILED"
  exit "$FAILED"
fi

if [ ! -d "$HERE/node_modules/playwright" ]; then
  echo ""
  echo "Skipping the end-to-end suite: Playwright is not installed."
  echo "  cd tests && npm install"
  exit "$FAILED"
fi

free_port "$SITE_PORT"; free_port "$STUB_PORT"; sleep 1

( cd "$ROOT/site" && python3 -m http.server "$SITE_PORT" >/dev/null 2>&1 ) &
SITE_PID=$!
node "$HERE/stub-provider.js" >/dev/null 2>&1 &
STUB_PID=$!
sleep 2

run "assistant end to end (real canon, real browser)" node "$HERE/assistant.e2e.js"
run "scanned pages end to end (real PDF, real browser)" node "$HERE/ocr.e2e.js"

echo ""
if [ "$FAILED" -eq 0 ]; then echo "ALL SUITES PASSED"; else echo "SOMETHING FAILED"; fi
exit "$FAILED"

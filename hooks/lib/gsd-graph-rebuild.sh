#!/usr/bin/env bash
# gsd-graph — detached incremental project sync for auto_update hook
#
# Usage:
#   gsd-graph-rebuild.sh <STATUS_FILE> <LOCK_FILE> <HEAD_SHA> <MS_START> <GSD_GRAPH_BIN> <STORE_DIR>
#
# Runs: gsd-graph --dir <STORE_DIR> sync   (incremental; corpus auto-resolved)
# Never fails the parent hook (caller already detached).

set -uo pipefail

STATUS_FILE="${1:?STATUS_FILE required}"
LOCK_FILE="${2:?LOCK_FILE required}"
HEAD_SHA="${3:?HEAD_SHA required}"
MS_START="${4:?MS_START required}"
GSD_GRAPH_BIN="${5:?GSD_GRAPH_BIN required}"
STORE_DIR="${6:-.gsd-graph}"

echo "$$" > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# shellcheck disable=SC2086
$GSD_GRAPH_BIN --dir "$STORE_DIR" sync >/tmp/gsd-graph-sync.$$.out 2>/tmp/gsd-graph-sync.$$.err
EXIT_CODE=$?

MS_END=$(node -e 'process.stdout.write(String(Date.now()))' 2>/dev/null || echo "$MS_START")
DURATION=$((MS_END - MS_START))
STATUS_NAME="ok"
[ "$EXIT_CODE" -eq 0 ] || STATUS_NAME="failed"
TS_END=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

GSD_STATUS_TS="$TS_END" \
GSD_STATUS_NAME="$STATUS_NAME" \
GSD_EXIT_CODE="$EXIT_CODE" \
GSD_DURATION="$DURATION" \
GSD_HEAD_SHA="$HEAD_SHA" \
GSD_STATUS_FILE="$STATUS_FILE" \
node -e '
  const fs = require("node:fs");
  const status = {
    ts: process.env.GSD_STATUS_TS,
    status: process.env.GSD_STATUS_NAME,
    exit_code: parseInt(process.env.GSD_EXIT_CODE, 10),
    duration_ms: parseInt(process.env.GSD_DURATION, 10),
    head_at_build: process.env.GSD_HEAD_SHA,
    mode: "sync",
  };
  fs.writeFileSync(process.env.GSD_STATUS_FILE, JSON.stringify(status, null, 2) + "\n");
' 2>/dev/null || true

rm -f /tmp/gsd-graph-sync.$$.out /tmp/gsd-graph-sync.$$.err 2>/dev/null || true
exit 0

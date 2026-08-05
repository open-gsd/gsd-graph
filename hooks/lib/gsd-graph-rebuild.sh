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

OUT_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-graph-sync.XXXXXX.out")
ERR_FILE=$(mktemp "${TMPDIR:-/tmp}/gsd-graph-sync.XXXXXX.err")
# shellcheck disable=SC2086
$GSD_GRAPH_BIN --dir "$STORE_DIR" sync >"$OUT_FILE" 2>"$ERR_FILE"
EXIT_CODE=$?

MS_END=$(node -e 'process.stdout.write(String(Date.now()))' 2>/dev/null || echo "$MS_START")
DURATION=$((MS_END - MS_START))
STATUS_NAME="ok"
[ "$EXIT_CODE" -eq 0 ] || STATUS_NAME="failed"
TS_END=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")

# On failure, persist logs under the store for post-mortems instead of
# discarding them; last failure only (overwritten by the next one).
STDERR_TAIL=""
if [ "$EXIT_CODE" -ne 0 ]; then
  cp "$OUT_FILE" "$STORE_DIR/.last-sync-failure.out" 2>/dev/null || true
  cp "$ERR_FILE" "$STORE_DIR/.last-sync-failure.err" 2>/dev/null || true
  STDERR_TAIL=$(tail -c 2000 "$ERR_FILE" 2>/dev/null || echo "")
fi

GSD_STATUS_TS="$TS_END" \
GSD_STATUS_NAME="$STATUS_NAME" \
GSD_EXIT_CODE="$EXIT_CODE" \
GSD_DURATION="$DURATION" \
GSD_HEAD_SHA="$HEAD_SHA" \
GSD_STATUS_FILE="$STATUS_FILE" \
GSD_STDERR_TAIL="$STDERR_TAIL" \
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
  if (status.status === "failed") {
    status.stderr_tail = process.env.GSD_STDERR_TAIL || "";
    status.failure_logs = [".last-sync-failure.out", ".last-sync-failure.err"];
  }
  fs.writeFileSync(process.env.GSD_STATUS_FILE, JSON.stringify(status, null, 2) + "\n");
' 2>/dev/null || true

rm -f "$OUT_FILE" "$ERR_FILE" 2>/dev/null || true
exit 0

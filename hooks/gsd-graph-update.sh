#!/usr/bin/env bash
# gsd-graph — PostToolUse hook: auto-rebuild project graph after HEAD advances
#
# OPT-IN: no-op unless BOTH enabled and auto_update are true in either:
#   .gsd-graph/config.json  (primary — written by `gsd-graph enable`)
#   .planning/config.json → gsd_graph  (optional GSD host)
#
# Gates (fast-fail order):
#   1. stdin tool_name == Bash
#   2. command looks HEAD-advancing (git commit/merge/pull/… or gsd-tools query commit)
#   3. not CI
#   4. inside git repo
#   5. current branch is default (git.base_branch | main|master|trunk)
#   6. enabled + auto_update
#   7. gsd-graph CLI resolvable
#   8. no rebuild lock in flight
#
# On success: detaches hooks/lib/gsd-graph-rebuild.sh (incremental `gsd-graph sync`).
# Always exits 0 — never blocks the user-facing tool call.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REBUILD_SH="${HOOK_DIR}/lib/gsd-graph-rebuild.sh"

INPUT=$(cat 2>/dev/null || true)
[ -n "$INPUT" ] || exit 0

TOOL_INFO=$(printf '%s' "$INPUT" | node -e '
let d = "";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const p = JSON.parse(d);
    process.stdout.write((p.tool_name || "") + "\n" + (p.tool_input?.command || ""));
  } catch { process.stdout.write("\n"); }
});
' 2>/dev/null || printf '\n')
TOOL_NAME=$(printf '%s\n' "$TOOL_INFO" | sed -n '1p')
COMMAND=$(printf '%s\n' "$TOOL_INFO" | sed -n '2,$p')

[ "$TOOL_NAME" = "Bash" ] || exit 0

case "$COMMAND" in
  *"git commit"*|*"git merge"*|*"git pull"*|*"git rebase --continue"*|*"git cherry-pick"*) ;;
  *"gsd-tools query commit"|*"gsd-tools query commit "*) ;;
  *) exit 0 ;;
esac

[ -z "${CI:-}" ] || exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

DEFAULT_BRANCH=""
if [ -f .planning/config.json ]; then
  DEFAULT_BRANCH=$(node -e '
try {
  const c = require("./.planning/config.json");
  process.stdout.write(c.git?.base_branch || "");
} catch { process.stdout.write(""); }
' 2>/dev/null || echo "")
fi
if [ -z "$DEFAULT_BRANCH" ]; then
  for b in main master trunk; do
    if git show-ref --verify --quiet "refs/heads/$b" 2>/dev/null; then
      DEFAULT_BRANCH="$b"
      break
    fi
  done
fi
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
[ -n "$DEFAULT_BRANCH" ] || exit 0
[ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ] || exit 0

# Gate: enabled + auto_update (store config first, then .planning)
ENABLED=$(node -e '
const fs = require("fs");
function flags(obj) {
  if (!obj || typeof obj !== "object") return null;
  return { enabled: obj.enabled === true, auto_update: obj.auto_update === true, store_dir: typeof obj.store_dir === "string" ? obj.store_dir : null };
}
let g = null;
try {
  if (fs.existsSync("./.gsd-graph/config.json")) {
    g = flags(JSON.parse(fs.readFileSync("./.gsd-graph/config.json", "utf8")));
  }
} catch {}
if (!g || (!g.enabled && !g.auto_update)) {
  try {
    if (fs.existsSync("./.planning/config.json")) {
      const c = JSON.parse(fs.readFileSync("./.planning/config.json", "utf8"));
      g = flags(c.gsd_graph || {});
    }
  } catch {}
}
process.stdout.write(g && g.enabled && g.auto_update ? "1" : "0");
' 2>/dev/null || echo "0")
[ "$ENABLED" = "1" ] || exit 0

# Resolve gsd-graph CLI
GSD_GRAPH_BIN=""
if command -v gsd-graph >/dev/null 2>&1; then
  GSD_GRAPH_BIN="$(command -v gsd-graph)"
elif [ -f "$(pwd)/node_modules/.bin/gsd-graph" ]; then
  GSD_GRAPH_BIN="$(pwd)/node_modules/.bin/gsd-graph"
elif [ -f "$(pwd)/bin/gsd-graph.js" ]; then
  GSD_GRAPH_BIN="$(command -v node) $(pwd)/bin/gsd-graph.js"
else
  # Walk up for monorepo local package
  CANDIDATE="$(pwd)"
  for _ in 1 2 3 4 5; do
    if [ -f "$CANDIDATE/node_modules/@opengsd/gsd-graph/bin/gsd-graph.js" ]; then
      GSD_GRAPH_BIN="$(command -v node) $CANDIDATE/node_modules/@opengsd/gsd-graph/bin/gsd-graph.js"
      break
    fi
    CANDIDATE="$(dirname "$CANDIDATE")"
  done
fi
[ -n "$GSD_GRAPH_BIN" ] || exit 0

STORE_DIR=$(node -e '
const fs = require("fs");
let store = ".gsd-graph";
try {
  if (fs.existsSync("./.gsd-graph/config.json")) {
    const c = JSON.parse(fs.readFileSync("./.gsd-graph/config.json", "utf8"));
    if (typeof c.store_dir === "string" && c.store_dir) store = c.store_dir;
  }
} catch {}
try {
  if (fs.existsSync("./.planning/config.json")) {
    const c = JSON.parse(fs.readFileSync("./.planning/config.json", "utf8"));
    if (c.gsd_graph && typeof c.gsd_graph.store_dir === "string" && c.gsd_graph.store_dir) {
      store = c.gsd_graph.store_dir;
    }
  }
} catch {}
process.stdout.write(store);
' 2>/dev/null || echo ".gsd-graph")

mkdir -p "$STORE_DIR"
LOCK_FILE="$STORE_DIR/.sync.lock"
STATUS_FILE="$STORE_DIR/.last-sync-status.json"

if [ -f "$LOCK_FILE" ]; then
  OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi

HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
MS_START=$(node -e 'process.stdout.write(String(Date.now()))' 2>/dev/null || echo "0")

node -e '
const fs = require("fs");
fs.writeFileSync(process.argv[1], JSON.stringify({
  ts: new Date().toISOString(),
  status: "running",
  head_at_build: process.argv[2] || null,
}, null, 2) + "\n");
' "$STATUS_FILE" "$HEAD_SHA" 2>/dev/null || true

# Detach rebuild (setsid when available)
if command -v setsid >/dev/null 2>&1; then
  setsid bash "$REBUILD_SH" "$STATUS_FILE" "$LOCK_FILE" "$HEAD_SHA" "$MS_START" "$GSD_GRAPH_BIN" "$STORE_DIR" >/dev/null 2>&1 &
else
  nohup bash "$REBUILD_SH" "$STATUS_FILE" "$LOCK_FILE" "$HEAD_SHA" "$MS_START" "$GSD_GRAPH_BIN" "$STORE_DIR" >/dev/null 2>&1 &
fi

exit 0

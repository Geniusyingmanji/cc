#!/usr/bin/env bash
set -euo pipefail

# cron has no $USER; fall back to id -un (set -u safe)
USER="${USER:-$(id -un)}"

BASE="/mdr5/guest/users/zhouyan/share/quantaalpha/ymj"
DIR="$BASE/cc-connect-server"
CONFIG="$DIR/config.toml"
LOG="$DIR/logs/cc-connect.log"
PID_FILE="$DIR/run/cc-connect.pid"
CC="$DIR/node_modules/.bin/cc-connect"
PROC_PATTERN="cc-connect .*--config $CONFIG"

source "$BASE/node-env.sh"
source "$HOME/.proxy_sufe"

export PATH="$DIR/bin:$HOME/.local/bin:$PATH"
export CLAUDE_CONFIG_DIR="$DIR/claude-home"
export HERMES_BASE="$DIR"
export HERMES_STATE_DIR="$DIR/hermes_state"
export HERMES_WORK_DIR="$BASE"
export HERMES_DEFAULT_PROVIDER="claudecode"
export HERMES_CODEX_REAL="$HOME/.local/bin/codex-real"
export HERMES_CLAUDE_BIN="$HOME/.local/bin/claude"
export HERMES_CLAUDE_MODEL="claude-opus-4-8"
export HERMES_CLAUDE_EFFORT="high"
export HERMES_CLAUDE_PERMISSION_MODE="bypassPermissions"

if [[ -f "$DIR/.env" ]]; then
  set -a
  source "$DIR/.env"
  set +a
fi

mkdir -p "$DIR/logs" "$DIR/run" "$DIR/data"

require_config() {
  local missing=0
  for var in FEISHU_APP_ID FEISHU_APP_SECRET FEISHU_ALLOW_FROM FEISHU_ADMIN_FROM; do
    if [[ -z "${!var:-}" ]]; then
      echo "missing $var in $DIR/.env" >&2
      missing=1
    fi
  done
  [[ "$missing" -eq 0 ]]
}

running_pid() {
  pgrep -u "$USER" -f "$PROC_PATTERN" | head -1 || true
}

is_running() {
  [[ -n "$(running_pid)" ]]
}

cmd="${1:-status}"
case "$cmd" in
  start)
    require_config
    if is_running; then
      echo "cc-connect already running pid=$(running_pid)"
      exit 0
    fi
    cd "$DIR"
    nohup "$CC" --force --config "$CONFIG" >> "$LOG" 2>&1 </dev/null &
    echo "$!" > "$PID_FILE"
    echo "started cc-connect pid=$!"
    ;;
  stop)
    pid="$(running_pid)"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    pkill -u "$USER" -f "$PROC_PATTERN" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "stopped cc-connect"
    ;;
  restart)
    "$0" stop
    sleep 2
    "$0" start
    ;;
  status)
    pid="$(running_pid)"
    if [[ -n "$pid" ]]; then
      echo "cc-connect: UP pid=$pid"
    else
      echo "cc-connect: DOWN"
    fi
    "$CC" --version 2>&1 | head -5
    ;;
  logs)
    tail -n "${2:-80}" "$LOG"
    ;;
  follow)
    tail -f "$LOG"
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status|logs [n]|follow}" >&2
    exit 2
    ;;
esac

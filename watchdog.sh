#!/usr/bin/env bash
set -euo pipefail

BASE="/mdr5/guest/users/zhangshuo/zyf"
DIR="$BASE/cc-connect-server"
LOG="$DIR/logs/watchdog.log"

# cron has no $USER; fall back to id -un (set -u safe)
USER="${USER:-$(id -un)}"

mkdir -p "$DIR/logs"

# match manage.sh PROC_PATTERN (actual cmdline has --force before --config)
if ! pgrep -u "$USER" -f "cc-connect .*--config $DIR/config.toml" >/dev/null; then
  echo "$(date -Is) cc-connect is down; starting" >> "$LOG"
  "$DIR/manage.sh" start >> "$LOG" 2>&1 || true
fi

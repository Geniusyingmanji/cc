#!/usr/bin/env bash
# Boot-time starter: wait for mihomo proxy, then start cc-connect.
# Installed in crontab as @reboot. Safe to re-run (manage.sh start is idempotent).
set -euo pipefail

DIR="/mdr5/guest/users/zhangshuo/zyf/cc-connect-server"
LOG="$DIR/logs/watchdog.log"

# cron has no $USER; fall back to id -un (set -u safe)
USER="${USER:-$(id -un)}"

mkdir -p "$DIR/logs"

# Wait up to 120s for mihomo proxy (claude subprocesses need 127.0.0.1:7899)
proxy_ready=no
for _ in $(seq 1 24); do
  if (exec 3<>/dev/tcp/127.0.0.1/7899) 2>/dev/null; then
    exec 3>&- 3<&- || true
    proxy_ready=yes
    break
  fi
  sleep 5
done
echo "$(date -Is) boot: proxy_ready=$proxy_ready; starting cc-connect" >> "$LOG"

"$DIR/manage.sh" start >> "$LOG" 2>&1

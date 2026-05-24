#!/usr/bin/env bash
set -euo pipefail

# Example only. Keep real API keys and proxy credentials outside Git.
DIR="${CC_CONNECT_DIR:-$HOME/workspace-gzy/zyf/cc-connect-server}"
CC="$DIR/node_modules/.bin/cc-connect"
CONFIG="${CC_CONNECT_CONFIG:-config.toml}"
LOG="${CC_CONNECT_LOG:-/tmp/cc-connect.log}"

cd "$DIR"

if ! pgrep -f "cc-connect --config $CONFIG" >/dev/null; then
  nohup "$CC" --config "$CONFIG" >> "$LOG" 2>&1 </dev/null &
  echo "started cc-connect pid=$!"
else
  echo "cc-connect already running"
fi

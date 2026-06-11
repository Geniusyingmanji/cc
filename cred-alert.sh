#!/usr/bin/env bash
# Alert via Feishu DM when the isolated claude credentials have expired
# (means the Mac->sufe sync chain is broken and claudecode will 401).
# Cron: every 15 min. Dedup: one alert per 2h while expired.
set -euo pipefail

D="/mdr5/guest/users/zhouyan/share/quantaalpha/ymj/cc-connect-server"
CRED="$D/claude-home/.credentials.json"
STATE="$D/run/cred-alert.last"

set -a; source "$D/.env"; set +a

now=$(date +%s)
exp=$(python3 -c "import json;print(json.load(open(\"$CRED\"))[\"claudeAiOauth\"][\"expiresAt\"]//1000)" 2>/dev/null || echo 0)

if [ "$exp" -gt "$now" ]; then
  rm -f "$STATE"
  exit 0
fi

last=$(cat "$STATE" 2>/dev/null || echo 0)
[ $((now - last)) -lt 7200 ] && exit 0

expired_h=$(( (now - exp) / 3600 ))
TOKEN=$(curl -s -m 10 -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$FEISHU_APP_ID\",\"app_secret\":\"$FEISHU_APP_SECRET\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get(\"tenant_access_token\",\"\"))")
[ -z "$TOKEN" ] && exit 1

MSG="[cc-connect 告警] sufe claude 凭证已过期 ${expired_h}h, claudecode 调用将 401。请在 Mac 上跑: ~/bin/sync-claude-credentials.sh (或检查 launchd 同步日志)"
PAYLOAD=$(python3 - "$FEISHU_ADMIN_FROM" "$MSG" <<'PY'
import json, sys
print(json.dumps({"receive_id": sys.argv[1], "msg_type": "text",
                  "content": json.dumps({"text": sys.argv[2]}, ensure_ascii=False)}, ensure_ascii=False))
PY
)
curl -s -m 10 -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null
echo "$now" > "$STATE"

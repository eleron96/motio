#!/bin/bash
# Warms Metabase query cache for the "Motio — Пульс" dashboard.
# Runs 2x/day via /etc/cron.d/motio-metabase-warm — 10:00 and 16:00 UTC
# (= 13:00 and 19:00 MSK). Cache TTL is 12h, so the two runs cover the day.
#
# Hits each card's /api/card/:id/query endpoint sequentially with a 2s gap
# so the DB is not hit in parallel. Total runtime ≈ 65s for 27 cards.
#
# Deploy steps:
#   1. Put this script at /opt/new_toggl/scripts/warm-metabase-cache.sh
#   2. Create a Metabase API key (Admin → Authentication → API Keys)
#      and save it to /root/.metabase_api_key (chmod 600).
#   3. Install cron entry:
#        cat > /etc/cron.d/motio-metabase-warm <<EOF
#        SHELL=/bin/bash
#        PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
#        0 10 * * * root /opt/new_toggl/scripts/warm-metabase-cache.sh
#        0 16 * * * root /opt/new_toggl/scripts/warm-metabase-cache.sh
#        EOF

set -euo pipefail
KEY_FILE=/root/.metabase_api_key
LOG=/var/log/metabase-warm.log
CARDS="27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53"

if [ ! -r "$KEY_FILE" ]; then
  echo "$(date -u +%FT%TZ) FATAL: $KEY_FILE missing" >> "$LOG"
  exit 1
fi
KEY=$(cat "$KEY_FILE")

echo "$(date -u +%FT%TZ) warm-start" >> "$LOG"
OK=0; FAIL=0
for cid in $CARDS; do
  if docker run --rm --network motio-metabase \
       curlimages/curl:latest \
       -sS --max-time 90 -o /dev/null -w "%{http_code}" \
       -X POST \
       -H "x-api-key: $KEY" \
       -H "Content-Type: application/json" \
       -d "{}" \
       "http://metabase:3000/api/card/$cid/query" | grep -q "^202\|^200$"; then
    OK=$((OK+1))
  else
    FAIL=$((FAIL+1))
    echo "$(date -u +%FT%TZ) card $cid FAILED" >> "$LOG"
  fi
  sleep 2
done

echo "$(date -u +%FT%TZ) warm-done ok=$OK fail=$FAIL" >> "$LOG"

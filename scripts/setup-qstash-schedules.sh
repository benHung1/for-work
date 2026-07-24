#!/usr/bin/env bash
# 在本機執行一次，建立準點的 QStash 排程（取代 Vercel Hobby Cron）
# 需要環境變數：QSTASH_TOKEN、CRON_SECRET，可選 REMINDER_SECRET、APP_URL
set -euo pipefail

APP_URL="${APP_URL:-https://for-work-kohl.vercel.app}"
QSTASH_URL="${QSTASH_URL:-https://qstash.upstash.io}"
REMINDER_SECRET="${REMINDER_SECRET:-$CRON_SECRET}"

if [[ -z "${QSTASH_TOKEN:-}" || -z "${CRON_SECRET:-}" ]]; then
  echo "請先 export QSTASH_TOKEN 與 CRON_SECRET"
  exit 1
fi

echo "建立早上 08:55（Asia/Taipei）→ /api/cron"
curl -sS -X POST "${QSTASH_URL}/v2/schedules/${APP_URL}/api/cron" \
  -H "Authorization: Bearer ${QSTASH_TOKEN}" \
  -H "Upstash-Cron: 55 8 * * *" \
  -H "Upstash-Tz: Asia/Taipei" \
  -H "Upstash-Method: GET" \
  -H "Upstash-Forward-Authorization: Bearer ${CRON_SECRET}"
echo

echo "建立晚上 18:25（Asia/Taipei）→ /api/remind"
curl -sS -X POST "${QSTASH_URL}/v2/schedules/${APP_URL}/api/remind" \
  -H "Authorization: Bearer ${QSTASH_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Upstash-Cron: 25 18 * * *" \
  -H "Upstash-Tz: Asia/Taipei" \
  -H "Upstash-Method: POST" \
  -H "Upstash-Forward-Authorization: Bearer ${REMINDER_SECRET}" \
  -d '{"phase":"evening"}'
echo

echo "完成。請到 Upstash Console → QStash → Schedules 確認兩筆排程。"

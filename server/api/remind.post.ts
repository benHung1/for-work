import { isTaiwanOffDay } from '../utils/taiwanHolidays'

const NOTIFICATION_REPEAT_COUNT = 5

async function sendLineMessage(userId: string, message: string) {
  for (let i = 0; i < NOTIFICATION_REPEAT_COUNT; i++) {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw createError({
        statusCode: 502,
        message: `LINE push failed: ${res.status} ${text}`,
      })
    }
  }
}

export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.REMINDER_SECRET || process.env.CRON_SECRET
  const authHeader = getHeader(event, 'authorization')
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody<{ phase?: string; checkinId?: string }>(event)
  const userId = process.env.LINE_USER_ID!
  const force = getQuery(event).force === '1'

  // 固定下班提醒（由早上 cron + QStash 排程，不依賴打卡回覆）
  if (body?.phase === 'evening' || !body?.checkinId) {
    if (!force && isTaiwanOffDay()) {
      return { status: 'skipped_off_day' }
    }

    await sendLineMessage(
      userId,
      '⏰ 已經到下班時間了！記得去 Flygo 打下班卡！\n\n打完卡後回覆任意訊息，我就會記錄下班打卡。'
    )
    return { status: 'evening_clock_out_reminder_sent' }
  }

  // 相容舊的 checkinId 呼叫（若還有殘留 QStash 訊息）
  return { status: 'ignored_legacy_checkin_reminder', checkinId: body.checkinId }
})

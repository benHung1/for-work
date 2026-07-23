import { scheduleEveningReminder } from '../utils/scheduleDelayedReminder'
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
      const errorText = await res.text()
      throw createError({
        statusCode: 502,
        message: `LINE push failed: ${res.status} ${errorText}`,
      })
    }
  }
}

export default defineEventHandler(async (event) => {
  // Vercel Cron（UTC）：`55 0 * * *` = 台灣 08:55 上班提醒
  // 接著用 QStash 延遲 570 分 → 台灣 18:25 下班提醒（不依賴使用者是否回覆）
  const authHeader = getHeader(event, 'authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const now = new Date()
  const userId = process.env.LINE_USER_ID!
  const query = getQuery(event)
  const force = query.force === '1'

  if (!force && isTaiwanOffDay(now)) {
    return { status: 'skipped_off_day' }
  }

  if (force) {
    await sendLineMessage(userId, '🧪 測試通知：Cron 與 LINE 推播正常')
    return { status: 'forced_test_message_sent' }
  }

  await sendLineMessage(userId, '🔔 打卡！記得去 Flygo 打上班卡！')

  try {
    await scheduleEveningReminder(event)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron] schedule_evening_reminder_failed', { error: message })
    return {
      status: 'morning_sent_but_evening_schedule_failed',
      error: message,
    }
  }

  return { status: 'morning_clock_in_reminder_sent_and_evening_scheduled' }
})

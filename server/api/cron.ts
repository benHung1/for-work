import { scheduleEveningReminder } from '../utils/scheduleDelayedReminder'
import { isTaiwanOffDay } from '../utils/taiwanHolidays'
import { pushLineTextToMany } from '../utils/linePush'
import { listActiveSubscriberIds } from '../utils/subscribers'

export default defineEventHandler(async (event) => {
  // Vercel Cron（UTC）：`55 0 * * *` = 台灣 08:55 上班提醒
  // 接著用 QStash 延遲 570 分 → 台灣 18:25 下班提醒
  const authHeader = getHeader(event, 'authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const now = new Date()
  const query = getQuery(event)
  const force = query.force === '1'
  const userIds = await listActiveSubscriberIds()

  if (userIds.length === 0) {
    return { status: 'no_subscribers' }
  }

  if (!force && isTaiwanOffDay(now)) {
    return { status: 'skipped_off_day', subscribers: userIds.length }
  }

  if (force) {
    const result = await pushLineTextToMany(userIds, '🧪 測試通知：Cron 與 LINE 推播正常')
    return { status: 'forced_test_message_sent', ...result, subscribers: userIds.length }
  }

  const result = await pushLineTextToMany(
    userIds,
    '加油！　上班就是為了下班～記得去 Flygo 打上班卡！'
  )

  try {
    await scheduleEveningReminder(event)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron] schedule_evening_reminder_failed', { error: message })
    return {
      status: 'morning_sent_but_evening_schedule_failed',
      error: message,
      ...result,
      subscribers: userIds.length,
    }
  }

  return {
    status: 'morning_clock_in_reminder_sent_and_evening_scheduled',
    ...result,
    subscribers: userIds.length,
  }
})

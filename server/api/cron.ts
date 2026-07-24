import { isTaiwanOffDay } from '../utils/taiwanHolidays'
import { pushLineTextToMany } from '../utils/linePush'
import { listActiveSubscriberIds } from '../utils/subscribers'

/**
 * 上班提醒（應由 QStash Schedule 準點觸發，勿依賴 Vercel Hobby Cron）。
 * 建議排程：cron `55 8 * * *`、timezone `Asia/Taipei`
 */
export default defineEventHandler(async (event) => {
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

  // 下班改由獨立 QStash Schedule（18:25 Asia/Taipei）觸發 /api/remind
  // 不再用「早上延遲 570 分」，避免早上晚到時下班也跟著晚
  return {
    status: 'morning_clock_in_reminder_sent',
    ...result,
    subscribers: userIds.length,
  }
})

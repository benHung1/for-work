import { isTaiwanOffDay } from '../utils/taiwanHolidays'
import { pushLineTextToMany } from '../utils/linePush'
import { listActiveSubscriberIds } from '../utils/subscribers'

export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.REMINDER_SECRET || process.env.CRON_SECRET
  const authHeader = getHeader(event, 'authorization')
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody<{ phase?: string; checkinId?: string }>(event)
  const force = getQuery(event).force === '1'

  // 固定下班提醒（由早上 cron + QStash 排程）
  if (body?.phase === 'evening' || !body?.checkinId) {
    if (!force && isTaiwanOffDay()) {
      return { status: 'skipped_off_day' }
    }

    const userIds = await listActiveSubscriberIds()
    if (userIds.length === 0) {
      return { status: 'no_subscribers' }
    }

    const result = await pushLineTextToMany(
      userIds,
      '恭喜～又熬過一天！ 記得去 Flygo 打下班卡！'
    )
    return {
      status: 'evening_clock_out_reminder_sent',
      ...result,
      subscribers: userIds.length,
    }
  }

  return { status: 'ignored_legacy_checkin_reminder', checkinId: body.checkinId }
})

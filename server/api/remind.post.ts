import { isTaiwanOffDay } from '../utils/taiwanHolidays'
import { pushLineTextToMany } from '../utils/linePush'
import { listActiveSubscriberIds } from '../utils/subscribers'

/**
 * 下班提醒（應由 QStash Schedule 準點觸發）。
 * 建議排程：cron `25 18 * * *`、timezone `Asia/Taipei`、body `{"phase":"evening"}`
 */
export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.REMINDER_SECRET || process.env.CRON_SECRET
  const authHeader = getHeader(event, 'authorization')
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // QStash schedule / 手動測試都可能沒 body
  let body: { phase?: string; checkinId?: string } = {}
  try {
    body = (await readBody(event)) || {}
  } catch {
    body = {}
  }

  const force = getQuery(event).force === '1'

  if (!force && isTaiwanOffDay()) {
    return { status: 'skipped_off_day' }
  }

  const userIds = await listActiveSubscriberIds()
  if (userIds.length === 0) {
    return { status: 'no_subscribers' }
  }

  if (body?.checkinId && body?.phase !== 'evening') {
    return { status: 'ignored_legacy_checkin_reminder', checkinId: body.checkinId }
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
})

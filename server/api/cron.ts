import { createClient } from '@supabase/supabase-js'
import { taipeiDayBoundsUtc } from '../utils/taipeiDay'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)
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
  // Vercel Cron 表達式為 UTC：vercel.json `55 0 * * *` = 台灣時間每日 08:55（無夏令時間）
  // 確保只有 Vercel Cron 能呼叫這支 API
  const authHeader = getHeader(event, 'authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const now = new Date()
  const userId = process.env.LINE_USER_ID!
  const query = getQuery(event)
  const force = query.force === '1'

  // 找「台灣日曆今天」有上班打卡、但還沒下班打卡的紀錄
  const { start: taipeiDayStart, end: taipeiDayEnd } = taipeiDayBoundsUtc()

  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .is('clock_out_at', null)
    .gte('clock_in_at', taipeiDayStart)
    .lt('clock_in_at', taipeiDayEnd)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!checkin) {
    if (force) {
      await sendLineMessage(userId, '🧪 測試通知：Cron 與 LINE 推播正常')
      return { status: 'forced_test_message_sent' }
    }
    await sendLineMessage(userId, '🔔 打卡！ 打卡! 打卡')
    return { status: 'morning_clock_in_reminder_sent' }
  }

  const clockInAt = new Date(checkin.clock_in_at)
  const diffMs = now.getTime() - clockInAt.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  // 9.5 小時後開始提醒；force=1 可強制測試
  if (diffHours >= 9.5 || force) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const overMinutes = Math.floor((diffHours - 9.5) * 60)

    let message = ''
    if (force) {
      message = '🧪 測試通知：Cron 已成功觸發提醒流程'
    } else if (overMinutes === 0) {
      message = '⏰ 已經上班 9.5 小時了！記得去 Flygo 打下班卡！'
    } else {
      message = `🔔 你已經超時 ${overMinutes} 分鐘了！快去打下班卡！\n\n打完卡後回覆任意訊息，我就會記錄下班打卡。`
    }

    await sendLineMessage(userId, message)
    return { status: 'reminded', overMinutes }
  }

  return { status: 'not_yet', hoursWorked: diffHours.toFixed(2) }
})
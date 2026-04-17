import { createClient } from '@supabase/supabase-js'

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

  const body = await readBody<{ checkinId?: string }>(event)
  const checkinId = body?.checkinId
  if (!checkinId) {
    throw createError({ statusCode: 400, message: 'Missing checkinId' })
  }

  const { data: checkin, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('id', checkinId)
    .single()

  if (error || !checkin) {
    return { status: 'checkin_not_found' }
  }

  if (checkin.clock_out_at) {
    return { status: 'already_clocked_out' }
  }

  const workedMs = Date.now() - new Date(checkin.clock_in_at).getTime()
  const workedHours = workedMs / (1000 * 60 * 60)
  if (workedHours < 9.5) {
    return { status: 'too_early', hoursWorked: workedHours.toFixed(2) }
  }

  const overMinutes = Math.floor((workedHours - 9.5) * 60)
  const message =
    overMinutes <= 0
      ? '⏰ 已經上班 9.5 小時了！記得去 Flygo 打下班卡！'
      : `🔔 你已經超時 ${overMinutes} 分鐘了！快去打下班卡！\n\n打完卡後回覆任意訊息，我就會記錄下班打卡。`

  await sendLineMessage(checkin.user_id, message)
  return { status: 'reminded', overMinutes }
})

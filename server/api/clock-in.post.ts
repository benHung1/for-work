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

async function scheduleDelayedReminder(event: any, checkinId: string) {
  const rawHost = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host')
  if (!rawHost) {
    throw createError({ statusCode: 500, message: 'Host header missing' })
  }

  const normalizedHost = (rawHost.split(',')[0] || '')
    .trim()
    .replace(/^https?:\/\//, '')
  const protocolHeader = getHeader(event, 'x-forwarded-proto') || 'https'
  const normalizedProtocol = (protocolHeader.split(',')[0] || '').trim() || 'https'
  const reminderUrl = `${normalizedProtocol}://${normalizedHost}/api/remind`
  const qstashToken = process.env.QSTASH_TOKEN
  const qstashBaseUrl = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(
    /\/$/,
    ''
  )
  const reminderSecret = process.env.REMINDER_SECRET || process.env.CRON_SECRET

  if (!qstashToken || !reminderSecret) {
    throw createError({
      statusCode: 500,
      message: 'QSTASH_TOKEN or REMINDER_SECRET is missing',
    })
  }

  const res = await fetch(`${qstashBaseUrl}/v2/publish/${reminderUrl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qstashToken}`,
      'Content-Type': 'application/json',
      'Upstash-Delay': '570m',
      'Upstash-Method': 'POST',
      'Upstash-Forward-Authorization': `Bearer ${reminderSecret}`,
    },
    body: JSON.stringify({ checkinId }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: 502,
      message: `Failed to schedule reminder: ${res.status} ${text} (destination=${reminderUrl})`,
    })
  }
}

export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.CLOCK_IN_SECRET
  if (expectedSecret) {
    const authHeader = getHeader(event, 'authorization')
    if (authHeader !== `Bearer ${expectedSecret}`) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const userId = process.env.LINE_USER_ID!

  // 檢查今天是否已有打卡紀錄
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: latestToday } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('clock_in_at', today.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (latestToday?.clock_out_at) {
    return { status: 'already_completed_today' }
  }

  if (latestToday) {
    return { status: 'already_clocked_in' }
  }

  // 建立上班打卡記錄
  const { data: inserted, error } = await supabase
    .from('checkins')
    .insert({
      user_id: userId,
      clock_in_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !inserted?.id) {
    throw createError({
      statusCode: 500,
      message: error?.message || 'Failed to create check-in record',
    })
  }

  await scheduleDelayedReminder(event, inserted.id)

  // 通知你 Bot 已收到
  await sendLineMessage(
    userId,
    '✅ 偵測到你到公司了！記得在 Flygo 打上班卡，9.5 小時後會提醒你打下班卡 🕐'
  )

  return { status: 'ok' }
})
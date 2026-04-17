import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)
const NOTIFICATION_REPEAT_COUNT = 5

async function sendLineMessage(message: string) {
  for (let i = 0; i < NOTIFICATION_REPEAT_COUNT; i++) {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: process.env.LINE_USER_ID,
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
  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host')
  if (!host) {
    throw createError({ statusCode: 500, message: 'Host header missing' })
  }

  const protocol = getHeader(event, 'x-forwarded-proto') || 'https'
  const reminderUrl = `${protocol}://${host}/api/remind`
  const qstashToken = process.env.QSTASH_TOKEN
  const reminderSecret = process.env.REMINDER_SECRET || process.env.CRON_SECRET

  if (!qstashToken || !reminderSecret) {
    throw createError({
      statusCode: 500,
      message: 'QSTASH_TOKEN or REMINDER_SECRET is missing',
    })
  }

  const res = await fetch(
    `https://qstash.upstash.io/v2/publish/${encodeURIComponent(reminderUrl)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
        'Upstash-Delay': '570m',
        'Upstash-Forward-Authorization': `Bearer ${reminderSecret}`,
      },
      body: JSON.stringify({ checkinId }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: 502,
      message: `Failed to schedule reminder: ${res.status} ${text}`,
    })
  }
}

export default defineEventHandler(async (event) => {
  const body = await readRawBody(event)
  const signature = getHeader(event, 'x-line-signature')

  // 驗證 LINE 簽名
  const hmac = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(body!)
    .digest('base64')

  if (hmac !== signature) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const payload = JSON.parse(body!)
  const events = payload.events

  for (const e of events) {
    if (e.type !== 'message' || e.message.type !== 'text') continue

    const userId = process.env.LINE_USER_ID!
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 任意文字都視為「已完成打卡回報」：
    // - 今天尚未有上班紀錄 => 建立 clock_in
    // - 今天已有未下班紀錄 => 補上 clock_out
    const { data: activeCheckin } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .is('clock_out_at', null)
      .gte('clock_in_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!activeCheckin) {
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
      await sendLineMessage('✅ 已收到回覆，已記錄上班打卡！')
      continue
    }

    await supabase
      .from('checkins')
      .update({ clock_out_at: new Date().toISOString() })
      .eq('id', activeCheckin.id)

    await sendLineMessage('✅ 已收到回覆，已記錄下班打卡，辛苦了！')
  }

  return { status: 'ok' }
})
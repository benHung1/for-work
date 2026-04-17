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

  const res = await fetch(
    `${qstashBaseUrl}/v2/publish/${encodeURIComponent(reminderUrl)}`,
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
      message: `Failed to schedule reminder: ${res.status} ${text} (destination=${reminderUrl})`,
    })
  }
}

export default defineEventHandler(async (event) => {
  const body = await readRawBody(event)
  const signature = getHeader(event, 'x-line-signature')
  console.log('[webhook] request_received', {
    hasBody: Boolean(body),
    hasSignature: Boolean(signature),
  })

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
  console.log('[webhook] payload_summary', {
    eventsCount: Array.isArray(events) ? events.length : 0,
  })

  for (const e of events) {
    console.log('[webhook] event_received', {
      type: e?.type,
      messageType: e?.message?.type,
      sourceType: e?.source?.type,
      sourceUserId: e?.source?.userId,
    })
    if (e.type !== 'message' || e.message.type !== 'text') {
      console.log('[webhook] event_skipped_non_text_message')
      continue
    }

    const userId = process.env.LINE_USER_ID!
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // 任意文字都視為打卡回報，但一天最多一組上下班：
    // - 今天沒有紀錄 => 建立 clock_in
    // - 今天有未下班紀錄 => 補上 clock_out
    // - 今天已完整上下班 => 不再重開新紀錄
    const { data: latestTodayCheckin } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('clock_in_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestTodayCheckin) {
      console.log('[webhook] creating_clock_in_record')
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

      let reminderScheduled = true
      try {
        await scheduleDelayedReminder(event, inserted.id)
        console.log('[webhook] clock_in_record_created_and_reminder_scheduled', {
          checkinId: inserted.id,
        })
      } catch (err: any) {
        reminderScheduled = false
        console.error('[webhook] schedule_reminder_failed', {
          checkinId: inserted.id,
          error: err?.message || String(err),
        })
      }

      if (reminderScheduled) {
        await sendLineMessage('✅ 已收到回覆，已記錄上班打卡！')
      } else {
        await sendLineMessage('✅ 已記錄上班打卡，但延遲提醒排程失敗，請稍後重試一次。')
      }
      continue
    }

    if (!latestTodayCheckin.clock_out_at) {
      console.log('[webhook] closing_active_checkin', { checkinId: latestTodayCheckin.id })
      await supabase
        .from('checkins')
        .update({ clock_out_at: new Date().toISOString() })
        .eq('id', latestTodayCheckin.id)

      await sendLineMessage('✅ 已收到回覆，已記錄下班打卡，辛苦了！')
      continue
    }

    console.log('[webhook] checkin_already_completed_today', {
      checkinId: latestTodayCheckin.id,
    })
    await sendLineMessage('✅ 今天上下班都已記錄完成，不用再打卡囉！')
  }

  return { status: 'ok' }
})
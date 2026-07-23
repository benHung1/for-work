import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

/** 上班提醒後固定隔 9.5 小時（570 分）觸發下班提醒 → 08:55 → 18:25 */
const EVENING_DELAY = '570m'

/**
 * 由早上 cron 呼叫：不論使用者有沒有回覆 LINE，都排定下班提醒。
 */
export async function scheduleEveningReminder(event: H3Event): Promise<void> {
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
      'Upstash-Delay': EVENING_DELAY,
      'Upstash-Method': 'POST',
      'Upstash-Forward-Authorization': `Bearer ${reminderSecret}`,
    },
    body: JSON.stringify({ phase: 'evening' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      statusCode: 502,
      message: `Failed to schedule reminder: ${res.status} ${text} (destination=${reminderUrl})`,
    })
  }
}

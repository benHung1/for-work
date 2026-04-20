import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

export async function scheduleDelayedReminder(
  event: H3Event,
  checkinId: string
): Promise<void> {
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

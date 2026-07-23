import crypto from 'crypto'
import { parseLineUserTextMessageEvents } from '../utils/lineWebhook'

/**
 * LINE Webhook：只驗簽、吃掉事件。
 * 提醒改由平日 cron（08:55 / 18:25）單向推播，不需使用者回覆。
 */
export default defineEventHandler(async (event) => {
  const body = await readRawBody(event)
  const signature = getHeader(event, 'x-line-signature')

  const hmac = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(body!)
    .digest('base64')

  if (hmac !== signature) {
    throw createError({ statusCode: 401, message: 'Invalid signature' })
  }

  const textEvents = parseLineUserTextMessageEvents(body!)
  console.log('[webhook] ignored_user_messages', { eventsCount: textEvents.length })

  return { status: 'ok' }
})

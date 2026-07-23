import crypto from 'crypto'
import { parseLineSubscriptionEvents } from '../utils/lineWebhook'
import { pushLineText } from '../utils/linePush'
import { activateSubscriber, deactivateSubscriber } from '../utils/subscribers'

/**
 * LINE Webhook：加好友／傳訊 → 訂閱；封鎖 → 取消訂閱。
 * 平日提醒仍由 cron 單向推播，不需回覆內容。
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

  const events = parseLineSubscriptionEvents(body!)
  console.log('[webhook] events', { count: events.length })

  for (const e of events) {
    const userId = e.source?.userId
    if (!userId) continue

    if (e.type === 'unfollow') {
      console.log('[webhook] deactivate', { userId })
      await deactivateSubscriber(userId)
      continue
    }

    // follow 或任意文字 → 註冊／重新啟用
    console.log('[webhook] activate', { userId, type: e.type })
    await activateSubscriber(userId)

    if (e.type === 'follow') {
      await pushLineText(
        userId,
        '✅ 已訂閱打卡提醒！\n平日 08:55 提醒上班、18:25 提醒下班。\n不用回覆訊息，封鎖帳號即可停止通知。',
        { repeat: 1 }
      )
    }
  }

  return { status: 'ok' }
})

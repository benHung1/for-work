import crypto from 'crypto'
import { parseLineSubscriptionEvents } from '../utils/lineWebhook'
import { pushLineText } from '../utils/linePush'
import { insertIncomingMessage } from '../utils/messages'
import { activateSubscriber, deactivateSubscriber } from '../utils/subscribers'

/**
 * LINE Webhook：加好友／傳訊 → 訂閱；文字訊息寫入 messages；封鎖 → 取消訂閱。
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

    console.log('[webhook] activate', { userId, type: e.type })
    await activateSubscriber(userId)

    if (e.type === 'message') {
      console.log('[webhook] store_message', { userId })
      await insertIncomingMessage({
        userId,
        text: e.message.text,
        lineMessageId: e.message.id,
      })
    }

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

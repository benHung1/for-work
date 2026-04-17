import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

async function sendLineMessage(message: string) {
  await fetch('https://api.line.me/v2/bot/message/push', {
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

    const text = e.message.text.trim()
    const userId = process.env.LINE_USER_ID!

    // 你回「打卡了」→ 記錄下班時間，停止提醒
    if(text.includes('打卡了')) {
      const { data } = await supabase
        .from('checkins')
        .select('*')
        .eq('user_id', userId)
        .is('clock_out_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        await supabase
          .from('checkins')
          .update({ clock_out_at: new Date().toISOString() })
          .eq('id', data.id)

        await sendLineMessage('✅ 收工！下班打卡記錄完成，辛苦了！')
      } else {
        await sendLineMessage('找不到今天的上班紀錄，確認一下？')
      }
    }

    // 你回「上班」→ 手動觸發上班打卡（不靠 GPS 的備用方案）
    if (text.includes('上班了')) {
      await supabase.from('checkins').insert({
        user_id: userId,
        clock_in_at: new Date().toISOString(),
      })
      await sendLineMessage('✅ 上班打卡記錄！9.5 小時後會提醒你打下班卡 🕐')
    }
  }

  return { status: 'ok' }
})
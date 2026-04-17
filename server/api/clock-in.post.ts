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
  const userId = process.env.LINE_USER_ID!

  // 檢查今天是否已經打過上班卡
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: existing } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('clock_in_at', today.toISOString())
    .limit(1)
    .single()

  if (existing) {
    return { status: 'already_clocked_in' }
  }

  // 建立上班打卡記錄
  const { error } = await supabase.from('checkins').insert({
    user_id: userId,
    clock_in_at: new Date().toISOString(),
  })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  // 通知你 Bot 已收到
  await sendLineMessage(
    userId,
    '✅ 偵測到你到公司了！記得在 Flygo 打上班卡，9.5 小時後會提醒你打下班卡 🕐'
  )

  return { status: 'ok' }
})
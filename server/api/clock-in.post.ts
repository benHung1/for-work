import { createClient } from '@supabase/supabase-js'
import { taipeiDayBoundsUtc } from '../utils/taipeiDay'
import { haversineMeters } from '../utils/geo'
import { scheduleDelayedReminder } from '../utils/scheduleDelayedReminder'

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

/** 內湖基湖路32號參考點；可用 COMPANY_LATITUDE / COMPANY_LONGITUDE 覆寫 */
const DEFAULT_COMPANY_LAT = 25.080826
const DEFAULT_COMPANY_LNG = 121.56482

function firstFiniteNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c
    if (typeof c === 'string' && c.trim() !== '') {
      const n = Number(c)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

export default defineEventHandler(async (event) => {
  const expectedSecret = process.env.CLOCK_IN_SECRET
  if (expectedSecret) {
    const authHeader = getHeader(event, 'authorization')
    if (authHeader !== `Bearer ${expectedSecret}`) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  }

  const query = getQuery(event)
  let body: Record<string, unknown> = {}
  try {
    body = (await readBody(event)) as Record<string, unknown>
  } catch {
    body = {}
  }

  const lat = firstFiniteNumber(
    body.latitude,
    body.lat,
    query.latitude,
    query.lat
  )
  const lng = firstFiniteNumber(
    body.longitude,
    body.lng,
    body.lon,
    query.longitude,
    query.lng,
    query.lon
  )

  if (lat === undefined || lng === undefined) {
    throw createError({
      statusCode: 400,
      message: '缺少座標：請在 POST body 或 query 帶上 latitude、longitude（或 lat、lng）',
    })
  }

  const companyLat = Number(process.env.COMPANY_LATITUDE ?? DEFAULT_COMPANY_LAT)
  const companyLng = Number(process.env.COMPANY_LONGITUDE ?? DEFAULT_COMPANY_LNG)
  const radiusM = Number(process.env.COMPANY_RADIUS_METERS ?? 50)

  if (!Number.isFinite(companyLat) || !Number.isFinite(companyLng) || !Number.isFinite(radiusM)) {
    throw createError({ statusCode: 500, message: '公司座標或半徑設定無效' })
  }

  const distanceM = haversineMeters(lat, lng, companyLat, companyLng)
  if (distanceM > radiusM) {
    throw createError({
      statusCode: 403,
      message: `不在公司 ${radiusM} 公尺範圍內（約 ${Math.round(distanceM)} 公尺）`,
    })
  }

  const userId = process.env.LINE_USER_ID!

  // 檢查「台灣日曆今天」是否已有打卡紀錄
  const { start: taipeiDayStart, end: taipeiDayEnd } = taipeiDayBoundsUtc()

  const { data: latestToday } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('clock_in_at', taipeiDayStart)
    .lt('clock_in_at', taipeiDayEnd)
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
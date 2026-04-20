const TAIPEI_TZ = 'Asia/Taipei'

/**
 * 以台灣日曆「當天」的 [start, end)（UTC ISO），供 Supabase timestamptz 查詢。
 */
export function taipeiDayBoundsUtc(now = new Date()): { start: string; end: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const start = new Date(`${ymd}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

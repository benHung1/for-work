const TAIPEI_TZ = 'Asia/Taipei'

/** 台灣日曆 YYYY-MM-DD */
export function getTaipeiYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** 台灣星期：0=日 … 6=六（與 Date#getDay 相同語意） */
export function getTaipeiWeekday(now = new Date()): number {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TZ,
    weekday: 'short',
  }).format(now)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[wd] ?? 0
}

/** 台灣時、分（24h） */
export function getTaipeiHourMinute(now = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  return { hour, minute }
}

/**
 * 以台灣日曆「當天」的 [start, end)（UTC ISO），供 Supabase timestamptz 查詢。
 */
export function taipeiDayBoundsUtc(now = new Date()): { start: string; end: string } {
  const ymd = getTaipeiYmd(now)
  const start = new Date(`${ymd}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

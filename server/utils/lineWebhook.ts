function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** LINE Messaging API：使用者傳入文字訊息事件（僅供 webhook 使用之最小欄位） */
export type LineUserTextMessageEvent = {
  type: 'message'
  message: { type: 'text' }
  source?: { type?: string; userId?: string }
}

export function parseLineUserTextMessageEvents(body: string): LineUserTextMessageEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    return []
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.events)) {
    return []
  }
  const out: LineUserTextMessageEvent[] = []
  for (const item of parsed.events) {
    if (!isRecord(item) || item.type !== 'message') continue
    const message = item.message
    if (!isRecord(message) || message.type !== 'text') continue
    const evt: LineUserTextMessageEvent = {
      type: 'message',
      message: { type: 'text' },
    }
    const source = item.source
    if (isRecord(source)) {
      evt.source = {
        type: typeof source.type === 'string' ? source.type : undefined,
        userId: typeof source.userId === 'string' ? source.userId : undefined,
      }
    }
    out.push(evt)
  }
  return out
}

export function getUnknownErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

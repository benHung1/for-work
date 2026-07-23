function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type LineSource = { type?: string; userId?: string }

export type LineFollowEvent = {
  type: 'follow'
  source?: LineSource
}

export type LineUnfollowEvent = {
  type: 'unfollow'
  source?: LineSource
}

export type LineUserTextMessageEvent = {
  type: 'message'
  message: { type: 'text' }
  source?: LineSource
}

export type LineSubscriptionEvent =
  | LineFollowEvent
  | LineUnfollowEvent
  | LineUserTextMessageEvent

function parseSource(source: unknown): LineSource | undefined {
  if (!isRecord(source)) return undefined
  return {
    type: typeof source.type === 'string' ? source.type : undefined,
    userId: typeof source.userId === 'string' ? source.userId : undefined,
  }
}

/** follow / unfollow / 文字訊息（用來註冊訂閱者） */
export function parseLineSubscriptionEvents(body: string): LineSubscriptionEvent[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body) as unknown
  } catch {
    return []
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.events)) {
    return []
  }

  const out: LineSubscriptionEvent[] = []
  for (const item of parsed.events) {
    if (!isRecord(item) || typeof item.type !== 'string') continue

    if (item.type === 'follow') {
      out.push({ type: 'follow', source: parseSource(item.source) })
      continue
    }

    if (item.type === 'unfollow') {
      out.push({ type: 'unfollow', source: parseSource(item.source) })
      continue
    }

    if (item.type === 'message') {
      const message = item.message
      if (!isRecord(message) || message.type !== 'text') continue
      out.push({
        type: 'message',
        message: { type: 'text' },
        source: parseSource(item.source),
      })
    }
  }
  return out
}

export function getUnknownErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

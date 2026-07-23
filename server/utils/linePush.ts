const NOTIFICATION_REPEAT_COUNT = 5

export async function pushLineText(
  userId: string,
  message: string,
  options?: { repeat?: number }
): Promise<void> {
  const repeat = options?.repeat ?? NOTIFICATION_REPEAT_COUNT
  for (let i = 0; i < repeat; i++) {
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
        message: `LINE push failed (${userId}): ${res.status} ${text}`,
      })
    }
  }
}

export async function pushLineTextToMany(
  userIds: string[],
  message: string,
  options?: { repeat?: number }
): Promise<{ sent: number; failed: string[] }> {
  const failed: string[] = []
  let sent = 0
  for (const userId of userIds) {
    try {
      await pushLineText(userId, message, options)
      sent += 1
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[linePush] send_failed', { userId, error: msg })
      failed.push(userId)
    }
  }
  return { sent, failed }
}

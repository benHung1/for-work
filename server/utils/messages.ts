import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
}

export async function insertIncomingMessage(input: {
  userId: string
  text: string
  lineMessageId?: string
}): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('messages').insert({
    user_id: input.userId,
    text: input.text,
    line_message_id: input.lineMessageId ?? null,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to insert message: ${error.message}`,
    })
  }
}

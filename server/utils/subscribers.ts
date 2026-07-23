import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
}

/** 啟用中的訂閱者；並把舊的 LINE_USER_ID 算進去（相容單人時期） */
export async function listActiveSubscriberIds(): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('subscribers')
    .select('user_id')
    .eq('active', true)

  if (error) {
    console.error('[subscribers] list_failed', { error: error.message })
  }

  const ids = new Set<string>()
  for (const row of data ?? []) {
    if (row?.user_id) ids.add(row.user_id)
  }

  const envId = process.env.LINE_USER_ID
  if (envId) ids.add(envId)

  return [...ids]
}

export async function activateSubscriber(userId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('subscribers').upsert(
    {
      user_id: userId,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to activate subscriber: ${error.message}`,
    })
  }
}

export async function deactivateSubscriber(userId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('subscribers')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) {
    throw createError({
      statusCode: 500,
      message: `Failed to deactivate subscriber: ${error.message}`,
    })
  }
}

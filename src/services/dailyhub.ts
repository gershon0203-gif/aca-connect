import { getSupabaseClient, isDemoMode } from '@/lib/supabase'
import { delay } from './latency'
import type { DailyHubPost } from '@/types'

interface Row {
  id: string
  title: string
  content: string
  post_date: string
  created_by: string | null
  created_at: string
}

function mapRow(row: Row): DailyHubPost {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    postDate: row.post_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listDailyHubPosts(): Promise<DailyHubPost[]> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return []
  }
  const { data, error } = await supabase
    .from('daily_hub_posts')
    .select('id, title, content, post_date, created_by, created_at')
    .order('post_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as Row))
}

export async function createDailyHubPost(input: {
  title: string
  content: string
  postDate: string
}): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return
  }
  const { error } = await supabase.from('daily_hub_posts').insert({
    title: input.title.trim(),
    content: input.content.trim(),
    post_date: input.postDate,
  })
  if (error) throw new Error(error.message)
}

export async function deleteDailyHubPost(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return
  }
  const { error } = await supabase.from('daily_hub_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

import { getSupabaseClient, isDemoMode } from '@/lib/supabase'
import { delay } from './latency'
import type { ChurchEvent } from '@/types'

interface EventRow {
  id: string
  title: string
  description: string | null
  event_date: string
  event_time: string | null
  location: string | null
  created_by: string | null
  created_at: string
}

function mapRow(row: EventRow): ChurchEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    eventDate: row.event_date,
    eventTime: row.event_time,
    location: row.location,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listEvents(): Promise<ChurchEvent[]> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return []
  }
  const { data, error } = await supabase
    .from('church_events')
    .select('id, title, description, event_date, event_time, location, created_by, created_at')
    .order('event_date', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => mapRow(r as EventRow))
}

export async function createEvent(input: {
  title: string
  description: string
  eventDate: string
  eventTime: string | null
  location: string | null
}): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return
  }
  const { error } = await supabase.from('church_events').insert({
    title: input.title.trim(),
    description: input.description.trim() || null,
    event_date: input.eventDate,
    event_time: input.eventTime,
    location: input.location?.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return
  }
  const { error } = await supabase.from('church_events').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

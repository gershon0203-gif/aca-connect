import { getSupabaseClient, isDemoMode } from '@/lib/supabase'
import { delay } from './latency'
import type { ChatMessage, ChatChannel } from '@/types'

interface ChatRow {
  id: string
  channel: ChatChannel
  sender_id: string
  recipient_id: string | null
  body: string
  reply_to: string | null
  created_at: string
}

function mapRow(row: ChatRow, senderName: string): ChatMessage {
  return {
    id: row.id,
    channel: row.channel,
    senderId: row.sender_id,
    senderName,
    recipientId: row.recipient_id,
    body: row.body,
    replyTo: row.reply_to,
    createdAt: row.created_at,
  }
}

export async function listGroupMessages(limit = 100): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return []
  }
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, channel, sender_id, recipient_id, body, reply_to, created_at')
    .eq('channel', 'group')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  // Resolve sender names
  const ids = Array.from(new Set((data ?? []).map((r) => r.sender_id)))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids)
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? 'Member']))
  return (data ?? []).map((r) => mapRow(r as ChatRow, nameMap.get(r.sender_id) ?? 'Member'))
}

export async function listPrivateMessages(
  otherUserId: string,
  limit = 100,
): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return []
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, channel, sender_id, recipient_id, body, reply_to, created_at')
    .eq('channel', 'private')
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  const ids = Array.from(new Set((data ?? []).map((r) => r.sender_id)))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', ids)
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? 'Member']))
  return (data ?? []).map((r) => mapRow(r as ChatRow, nameMap.get(r.sender_id) ?? 'Member'))
}

export async function sendGroupMessage(body: string, replyTo?: string | null): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return null
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      channel: 'group',
      sender_id: user.id,
      body: body.trim(),
      reply_to: replyTo ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const messageId = data?.id ? String(data.id) : null
  if (messageId) void notifyChatPush(messageId)
  return messageId
}

export async function sendPrivateMessage(
  recipientUserId: string,
  body: string,
  replyTo?: string | null,
): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return null
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      channel: 'private',
      sender_id: user.id,
      recipient_id: recipientUserId,
      body: body.trim(),
      reply_to: replyTo ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const messageId = data?.id ? String(data.id) : null
  if (messageId) void notifyChatPush(messageId)
  return messageId
}

/**
 * Best-effort FCM delivery for a newly inserted chat message.
 *
 * The Edge Function re-reads the message with the service-role client, verifies
 * that the caller is its sender, and derives the recipients/title/body itself.
 * The client therefore cannot spoof a chat push or its destination. A push
 * failure must never make sending the message fail.
 */
async function notifyChatPush(messageId: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  try {
    const { error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        notification_type: 'chat_message',
        message_id: messageId,
      },
    })
    if (error) {
      console.warn('Chat push was not delivered:', error.message)
    }
  } catch (error) {
    console.warn(
      'Chat push was not delivered:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export async function listPrivateConversations(): Promise<{ userId: string; name: string }[]> {
  const supabase = getSupabaseClient()
  if (!supabase || isDemoMode) {
    await delay(200)
    return []
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('chat_messages')
    .select('sender_id, recipient_id')
    .eq('channel', 'private')
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
  if (error) throw new Error(error.message)
  const others = new Set<string>()
  for (const r of data ?? []) {
    if (r.sender_id !== user.id) others.add(r.sender_id)
    if (r.recipient_id !== user.id && r.recipient_id) others.add(r.recipient_id)
  }
  if (others.size === 0) return []
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', Array.from(others))
  return (profiles ?? []).map((p) => ({ userId: p.id, name: p.full_name ?? 'Member' }))
}
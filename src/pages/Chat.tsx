import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/FormField'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import {
  listGroupMessages,
  listPrivateConversations,
  listPrivateMessages,
  sendGroupMessage,
  sendPrivateMessage,
} from '@/services/chat'
import { getSupabaseClient } from '@/lib/supabase'
import type { ChatMessage } from '@/types'
import { formatDateTime } from '@/lib/format'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function ChatPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'group' | 'private'>('group')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [privateWith, setPrivateWith] = useState<string | null>(null)

  // Deep link from a chat push: /chat?tab=private&with=<sender-user-id>.
  // Only a valid UUID is accepted; anything else is ignored.
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    const withParam = searchParams.get('with')
    if (tabParam === 'private') setTab('private')
    if (withParam && UUID_RE.test(withParam)) setPrivateWith(withParam)
  }, [searchParams])

  const group = useAsync(() => listGroupMessages(), [tab])
  const convos = useAsync(() => listPrivateConversations(), [tab])
  const privateMsgs = useAsync(
    () => (privateWith ? listPrivateMessages(privateWith) : Promise.resolve([])),
    [privateWith],
  )

  // Real-time refresh for group chat
  useEffect(() => {
    if (tab !== 'group') return
    const supabase = getSupabaseClient()
    if (!supabase) return
    const channel = supabase
      .channel('group-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        group.reload()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleSend = async (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    setSending(true)
    try {
      if (tab === 'group') {
        await sendGroupMessage(body)
        group.reload()
      } else if (privateWith) {
        await sendPrivateMessage(privateWith, body)
        privateMsgs.reload()
      }
      setBody('')
    } catch (error) {
      toast({
        title: 'Could not send message',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  const messages: ChatMessage[] =
    tab === 'group'
      ? group.status === 'success'
        ? group.data
        : []
      : privateMsgs.status === 'success'
        ? privateMsgs.data
        : []

  return (
    <>
      <Header title="Chat" subtitle="Common group chat and private messages." onMenuClick={openMenu} />
      <Page className="space-y-4">
        <div className="flex gap-2">
          <Button variant={tab === 'group' ? 'primary' : 'secondary'} onClick={() => setTab('group')}>
            Group chat
          </Button>
          <Button variant={tab === 'private' ? 'primary' : 'secondary'} onClick={() => setTab('private')}>
            Private chat
          </Button>
        </div>

        {tab === 'private' && (
          <Card className="p-3">
            <p className="mb-2 text-xs font-semibold text-navy-500">Conversations</p>
            <div className="flex flex-wrap gap-2">
              {(convos.status === 'success' ? convos.data : []).map((c) => (
                <Button
                  key={c.userId}
                  size="sm"
                  variant={privateWith === c.userId ? 'primary' : 'secondary'}
                  onClick={() => setPrivateWith(c.userId)}
                >
                  {c.name}
                </Button>
              ))}
              {convos.status === 'success' && convos.data.length === 0 && (
                <p className="text-sm text-navy-400">No private conversations yet.</p>
              )}
            </div>
          </Card>
        )}

        <Card className="flex h-[420px] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-navy-400">No messages yet.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="rounded-xl bg-cream-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-navy-900">{m.senderName}</span>
                  <span className="text-xs text-navy-400">{formatDateTime(m.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-navy-800">{m.body}</p>
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} className="flex gap-2 border-t border-cream-200 p-3">
            <Input
              label="Message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type a message…"
              className="flex-1"
            />
            <Button type="submit" loading={sending} disabled={!body.trim()}>
              Send
            </Button>
          </form>
        </Card>
      </Page>
    </>
  )
}

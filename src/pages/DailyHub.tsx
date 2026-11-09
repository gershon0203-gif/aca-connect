import { useState, type FormEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/FormField'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import { listDailyHubPosts, createDailyHubPost, deleteDailyHubPost } from '@/services/dailyhub'
import type { DailyHubPost } from '@/types'
import { formatDate } from '@/lib/format'
import { Newspaper } from 'lucide-react'

export default function DailyHubPage() {
  const { openMenu } = useAppShell()
  const { user } = useAuth()
  const { toast } = useToast()
  const isAdmin = user?.role === 'super_admin'
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [postDate, setPostDate] = useState('')
  const [saving, setSaving] = useState(false)
  const posts = useAsync(() => listDailyHubPosts(), [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      await createDailyHubPost({
        title,
        content,
        postDate: postDate || new Date().toISOString().slice(0, 10),
      })
      setTitle('')
      setContent('')
      setPostDate('')
      posts.reload()
      toast({ title: 'Post published', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Could not publish',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteDailyHubPost(id)
      posts.reload()
      toast({ title: 'Post removed', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Could not remove post',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const list: DailyHubPost[] = posts.status === 'success' ? posts.data : []

  return (
    <>
      <Header title="Daily Hub" subtitle="Church updates and daily information." onMenuClick={openMenu} />
      <Page className="space-y-5">
        {isAdmin && (
          <Card className="p-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <Textarea label="Content" value={content} onChange={(e) => setContent(e.target.value)} required />
              <Input type="date" label="Date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
              <Button type="submit" loading={saving}>Publish</Button>
            </form>
          </Card>
        )}
        {posts.status === 'loading' && <p className="text-sm text-navy-400">Loading…</p>}
        {posts.status === 'success' && list.length === 0 && (
          <Card>
            <EmptyState icon={Newspaper} title="No updates yet" description="Daily hub posts will appear here." />
          </Card>
        )}
        <div className="space-y-3">
          {list.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-semibold text-navy-900">{p.title}</h3>
                  <p className="text-xs text-navy-400">{formatDate(p.postDate)}</p>
                  <p className="mt-2 text-sm text-navy-700 whitespace-pre-wrap">{p.content}</p>
                </div>
                {isAdmin && (
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(p.id)}>
                    Remove
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Page>
    </>
  )
}

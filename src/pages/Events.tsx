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
import { listEvents, createEvent, deleteEvent } from '@/services/events'
import type { ChurchEvent } from '@/types'
import { formatDate } from '@/lib/format'
import { CalendarDays } from 'lucide-react'

export default function EventsPage() {
  const { openMenu } = useAppShell()
  const { user } = useAuth()
  const { toast } = useToast()
  const isAdmin = user?.role === 'super_admin'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const events = useAsync(() => listEvents(), [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !eventDate) return
    setSaving(true)
    try {
      await createEvent({
        title,
        description,
        eventDate,
        eventTime: eventTime || null,
        location: location || null,
      })
      setTitle('')
      setDescription('')
      setEventDate('')
      setEventTime('')
      setLocation('')
      events.reload()
      toast({ title: 'Event created', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Could not create event',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteEvent(id)
      events.reload()
      toast({ title: 'Event removed', variant: 'success' })
    } catch (err) {
      toast({
        title: 'Could not remove event',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const list: ChurchEvent[] = events.status === 'success' ? events.data : []

  return (
    <>
      <Header title="Church Events" subtitle="Upcoming church events and gatherings." onMenuClick={openMenu} />
      <Page className="space-y-5">
        {isAdmin && (
          <Card className="p-4">
            <form onSubmit={handleCreate} className="space-y-3">
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input type="date" label="Date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                <Input type="time" label="Time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <Button type="submit" loading={saving}>Add event</Button>
            </form>
          </Card>
        )}

        {events.status === 'loading' && <p className="text-sm text-navy-400">Loading events…</p>}
        {events.status === 'success' && list.length === 0 && (
          <Card>
            <EmptyState icon={CalendarDays} title="No events yet" description="Church events will appear here." />
          </Card>
        )}
        <div className="space-y-3">
          {list.map((ev) => (
            <Card key={ev.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-semibold text-navy-900">{ev.title}</h3>
                  <p className="text-sm text-navy-500">
                    {formatDate(ev.eventDate)}
                    {ev.eventTime ? ` · ${ev.eventTime}` : ''}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </p>
                  {ev.description && <p className="mt-2 text-sm text-navy-700">{ev.description}</p>}
                </div>
                {isAdmin && (
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(ev.id)}>
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

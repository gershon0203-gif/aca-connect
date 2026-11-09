import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  BellRing,
  CheckCheck,
  ClipboardList,
  HandHeart,
  Inbox,
  MailOpen,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import {
  listMyNotifications,
  listNotificationHistory,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_CHANGED_EVENT,
} from '@/services/notifications'
import { isSuperAdminRole } from '@/lib/roles'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationType } from '@/types'

const TYPE_META: Record<
  NotificationType,
  { label: string; tone: 'success' | 'gold' | 'navy'; icon: typeof Bell }
> = {
  attendance_reminder: {
    label: 'Attendance',
    tone: 'success',
    icon: ClipboardList,
  },
  prayer_reminder: { label: 'Prayer', tone: 'gold', icon: HandHeart },
  chat_message: { label: 'Chat', tone: 'navy', icon: MailOpen },
}

/** Stable empty list so memo dependencies do not change while loading. */
const EMPTY_NOTIFICATIONS: AppNotification[] = []

/**
 * In-app notification centre.
 *
 * The inbox query is scoped to the signed-in user; Row Level Security enforces
 * the same rule server-side. The super admin additionally sees a delivery
 * history, which is also the only way `recipientName`/`recipientEmail` are
 * populated.
 */
export default function NotificationsPage() {
  const { openMenu } = useAppShell()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'inbox' | 'history'>('inbox')
  const [marking, setMarking] = useState(false)

  const isAdmin = isSuperAdminRole(user?.role)
  const inbox = useAsync(
    () => (user ? listMyNotifications(user.id) : Promise.resolve([])),
    [user?.id],
  )
  const history = useAsync(
    () => (isAdmin ? listNotificationHistory() : Promise.resolve([])),
    [isAdmin, user?.id],
  )

  const inboxData =
    inbox.status === 'success' ? inbox.data : EMPTY_NOTIFICATIONS

  useEffect(() => {
    const reload = () => {
      inbox.reload()
      if (isAdmin) history.reload()
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, reload)
    window.addEventListener('focus', reload)
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, reload)
      window.removeEventListener('focus', reload)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user?.id])

  const unread = useMemo(
    () => inboxData.filter((item) => !item.isRead).length,
    [inboxData],
  )

  const handleOpen = async (notification: AppNotification) => {
    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.id)
        inbox.reload()
      } catch (error) {
        toast({
          title: 'Could not mark that as read',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'error',
        })
      }
    }
    if (notification.destination) navigate(notification.destination)
  }

  const handleMarkAll = async () => {
    if (!user) return
    setMarking(true)
    try {
      const count = await markAllNotificationsRead(user.id)
      toast({
        title:
          count > 0
            ? `${count} notification${count === 1 ? '' : 's'} marked read`
            : 'Nothing to mark',
        variant: 'success',
      })
      inbox.reload()
    } catch (error) {
      toast({
        title: 'Could not mark all as read',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setMarking(false)
    }
  }

  const historyColumns: Array<Column<AppNotification>> = [
    {
      key: 'recipient',
      header: 'Recipient',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-navy-900">
            {row.recipientName || 'Unnamed account'}
          </p>
          {row.recipientEmail && (
            <p className="truncate text-xs text-navy-400">{row.recipientEmail}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge tone={TYPE_META[row.type].tone}>
          {TYPE_META[row.type].label}
        </Badge>
      ),
    },
    {
      key: 'title',
      header: 'Message',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-navy-900">{row.title}</p>
          <p className="line-clamp-2 text-xs text-navy-500">{row.message}</p>
        </div>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      cellClassName: 'hidden lg:table-cell',
      render: (row) => (
        <span className="text-navy-500">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'read',
      header: 'Read',
      align: 'right',
      render: (row) =>
        row.isRead ? (
          <Badge tone="neutral">Read</Badge>
        ) : (
          <Badge tone="warning">Unread</Badge>
        ),
    },
  ]

  return (
    <>
      <Header
        title="Notifications"
        subtitle="Attendance and prayer reminders sent to your account."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex self-start rounded-xl border border-cream-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setTab('inbox')}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
                tab === 'inbox'
                  ? 'bg-navy-900 text-white'
                  : 'text-navy-600 hover:text-navy-900',
              )}
            >
              <Inbox className="size-4" />
              Inbox
              {unread > 0 && (
                <span className="rounded-full bg-gold-500 px-1.5 text-xs font-semibold text-navy-950">
                  {unread}
                </span>
              )}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setTab('history')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition',
                  tab === 'history'
                    ? 'bg-navy-900 text-white'
                    : 'text-navy-600 hover:text-navy-900',
                )}
              >
                <ClipboardList className="size-4" />
                Delivery history
              </button>
            )}
          </div>

          {tab === 'inbox' && (
            <Button
              variant="secondary"
              icon={<CheckCheck className="size-4" />}
              onClick={handleMarkAll}
              loading={marking}
              disabled={unread === 0}
            >
              Mark all read
            </Button>
          )}
        </div>

        {tab === 'inbox' && (
          <Card className="overflow-hidden">
            {inbox.status === 'loading' && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {inbox.status === 'error' && (
              <EmptyState
                icon={Bell}
                title="Could not load your notifications"
                description={inbox.error}
                action={<Button onClick={inbox.reload}>Try again</Button>}
              />
            )}

            {inbox.status === 'success' && inbox.data.length === 0 && (
              <EmptyState
                icon={MailOpen}
                title="You're all caught up"
                description="Attendance and prayer reminders will appear here when they are sent."
              />
            )}

            {inbox.status === 'success' && inbox.data.length > 0 && (
              <ul className="divide-y divide-cream-200">
                {inbox.data.map((item) => {
                  const meta = TYPE_META[item.type]
                  const Icon = meta.icon
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleOpen(item)}
                        className={cn(
                          'flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-cream-50',
                          !item.isRead && 'bg-gold-50/50',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl',
                            item.isRead
                              ? 'bg-cream-200 text-navy-400'
                              : 'bg-navy-900 text-gold-400',
                          )}
                        >
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'truncate text-sm',
                                item.isRead
                                  ? 'font-medium text-navy-700'
                                  : 'font-semibold text-navy-900',
                              )}
                            >
                              {item.title}
                            </span>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {!item.isRead && (
                              <span
                                className="size-2 rounded-full bg-gold-500"
                                aria-label="Unread"
                              />
                            )}
                          </span>
                          <span className="mt-1 block text-sm text-navy-500">
                            {item.message}
                          </span>
                          <span className="mt-1 block text-xs text-navy-400">
                            {formatRelative(item.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === 'history' && isAdmin && (
          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Delivery history</CardTitle>
                <p className="text-sm text-navy-500">
                  Every in-app reminder sent by an administrator.
                </p>
              </div>
              <Badge tone="navy">
                <BellRing className="size-3" />
                In-app only
              </Badge>
            </CardHeader>

            {history.status === 'loading' && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}

            {history.status === 'error' && (
              <EmptyState
                icon={ClipboardList}
                title="Could not load delivery history"
                description={history.error}
                action={<Button onClick={history.reload}>Try again</Button>}
              />
            )}

            {history.status === 'success' && history.data.length === 0 && (
              <EmptyState
                icon={BellRing}
                title="Nothing sent yet"
                description="Manual attendance and prayer reminders will be listed here with their recipients."
              />
            )}

            {history.status === 'success' && history.data.length > 0 && (
              <DataTable
                columns={historyColumns}
                rows={history.data}
                getRowId={(row) => row.id}
                caption="Notification delivery history"
              />
            )}
          </Card>
        )}
      </Page>
    </>
  )
}

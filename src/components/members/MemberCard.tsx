import { Home, Mail, MapPin, MoreHorizontal, Pencil, Phone, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { fullName, formatDate } from '@/lib/format'
import type { Member } from '@/types'

interface MemberCardProps {
  member: Member
  /** Resolved household name, when the member belongs to a family. */
  familyName?: string
  onSelect?: (member: Member) => void
  /** Rendered only when provided — viewers without permission see no actions. */
  onEdit?: (member: Member) => void
  onRemove?: (member: Member) => void
}

export function MemberCard({
  member,
  familyName,
  onSelect,
  onEdit,
  onRemove,
}: MemberCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const hasActions = Boolean(onEdit || onRemove)

  return (
    <article
      onClick={onSelect ? () => onSelect(member) : undefined}
      className={cn(
        'relative flex flex-col rounded-2xl border border-cream-300 bg-white p-5 shadow-soft transition',
        onSelect &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lifted',
      )}
    >
      <div className="flex items-start gap-3.5">
        <Avatar
          firstName={member.firstName}
          lastName={member.lastName}
          src={member.avatarUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-navy-900">
                {fullName(member.firstName, member.lastName)}
              </h3>
              <p className="truncate text-xs text-navy-400">{member.id}</p>
            </div>
            <div
              ref={menuRef}
              className="relative flex shrink-0 items-center gap-2"
              onClick={(event) => event.stopPropagation()}
            >
              <StatusBadge status={member.status} />
              {hasActions && (
                <>
                  <button
                    type="button"
                    aria-label={`Actions for ${fullName(member.firstName, member.lastName)}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                    className="rounded-lg border border-cream-300 bg-white p-1.5 text-navy-400 transition hover:border-navy-300 hover:text-navy-800"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute top-full right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-cream-300 bg-white py-1 shadow-lifted"
                    >
                      {onEdit && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false)
                            onEdit(member)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-navy-700 transition hover:bg-cream-100"
                        >
                          <Pencil className="size-4" />
                          Edit member
                        </button>
                      )}
                      {onRemove && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false)
                            onRemove(member)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 className="size-4" />
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="mt-1 text-sm text-navy-500 capitalize">
            {member.role.replace('-', ' ')}
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm text-navy-600">
        <div className="flex items-center gap-2">
          <Mail className="size-4 shrink-0 text-navy-300" aria-hidden="true" />
          <span className="truncate">{member.email}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="size-4 shrink-0 text-navy-300" aria-hidden="true" />
          <span className="truncate">{member.phone}</span>
        </div>
        {member.address || member.city ? (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-navy-300" aria-hidden="true" />
            <span className="truncate">
              {[member.address, member.city].filter(Boolean).join(', ')}
            </span>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-cream-200 pt-4">
        {familyName && (
          <Badge tone="navy">
            <Home className="size-3" aria-hidden="true" />
            {familyName}
          </Badge>
        )}
        {member.baptismStatus === 'baptised' && <Badge tone="success">Baptised</Badge>}
        {member.ministries.map((ministry) => (
          <Badge key={ministry} tone="neutral">
            {ministry}
          </Badge>
        ))}
        <span className="ml-auto text-xs text-navy-400">
          {formatDate(member.joinedAt)}
        </span>
      </div>
    </article>
  )
}

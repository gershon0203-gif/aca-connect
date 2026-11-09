import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { fullName } from '@/lib/format'

/** The minimal shape the picker needs from a member. */
export interface LinkableMember {
  id: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
}

interface MemberLinkerProps {
  /** Candidate members to choose from (already loaded by the parent). */
  members: LinkableMember[]
  value: string | null
  onChange: (code: string | null) => void
  placeholder?: string
  /** Member codes that cannot be selected (e.g. the member themselves). */
  exclude?: string[]
  /** Show a control to clear the current selection. */
  allowClear?: boolean
  disabled?: boolean
  'aria-label'?: string
}

/**
 * Searchable member picker. A small self-contained combobox: it never fetches
 * anything, it only filters the list it is handed, so it stays scoped to
 * whatever records the caller was allowed to load.
 */
export function MemberLinker({
  members,
  value,
  onChange,
  placeholder = 'Choose a member…',
  exclude = [],
  allowClear = false,
  disabled = false,
  'aria-label': ariaLabel = 'Choose a member',
}: MemberLinkerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const excludeSet = useMemo(() => new Set(exclude), [exclude])

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return members
      .filter((m) => !excludeSet.has(m.id))
      .filter((m) => {
        if (!needle) return true
        return (
          fullName(m.firstName, m.lastName).toLowerCase().includes(needle) ||
          m.id.toLowerCase().includes(needle)
        )
      })
      .slice(0, 50)
  }, [members, excludeSet, query])

  const selected = value ? members.find((m) => m.id === value) ?? null : null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-11 w-full items-center gap-2.5 rounded-xl border border-cream-300 bg-white px-3.5 text-left text-sm transition',
          'hover:border-navy-200 focus:border-navy-400 focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-cream-100',
        )}
      >
        {selected ? (
          <>
            <Avatar
              firstName={selected.firstName}
              lastName={selected.lastName}
              src={selected.avatarUrl}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate text-navy-900">
              {fullName(selected.firstName, selected.lastName)}
              <span className="ml-2 font-mono text-xs text-navy-400">
                {selected.id}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 truncate text-navy-300">{placeholder}</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-navy-400" />
      </button>

      {allowClear && selected && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Clear selection"
          className="absolute top-1/2 right-9 -translate-y-1/2 rounded-md p-1 text-navy-300 transition hover:bg-cream-200 hover:text-navy-700"
        >
          <X className="size-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-cream-300 bg-white shadow-lifted">
          <div className="relative border-b border-cream-200">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-navy-300"
              aria-hidden="true"
            />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search members…"
              className="h-10 w-full bg-transparent pr-3 pl-9 text-sm text-navy-900 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {candidates.length === 0 && (
              <li className="px-4 py-3 text-sm text-navy-400">
                No members match &ldquo;{query}&rdquo;.
              </li>
            )}
            {candidates.map((member) => {
              const active = member.id === value
              return (
                <li key={member.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(member.id)
                      setOpen(false)
                      setQuery('')
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition',
                      active
                        ? 'bg-cream-100 text-navy-900'
                        : 'text-navy-700 hover:bg-cream-50',
                    )}
                  >
                    <Avatar
                      firstName={member.firstName}
                      lastName={member.lastName}
                      src={member.avatarUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {fullName(member.firstName, member.lastName)}
                    </span>
                    <span className="font-mono text-xs text-navy-400">
                      {member.id}
                    </span>
                    {active && <Check className="size-4 text-navy-700" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

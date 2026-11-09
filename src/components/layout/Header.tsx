import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { SearchInput } from '@/components/ui/SearchInput'
import { Button } from '@/components/ui/Button'
import { InstallAppButton } from '@/components/system/InstallAppButton'
import { NotificationBell } from './NotificationBell'
import { DesktopWindowControls } from '@/components/system/DesktopWindowControls'
import { useAuth } from '@/context/auth-context'
import { isDemoMode } from '@/lib/supabase'
import { DEMO_NOTICE } from '@/lib/demo-data'

interface HeaderProps {
  title: string
  subtitle?: string
  onMenuClick: () => void
  onAddMember?: () => void
}

export function Header({
  title,
  subtitle,
  onMenuClick,
  onAddMember,
}: HeaderProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [firstName, ...rest] = (user?.name ?? 'Guest').split(' ')

  const submitSearch = (value: string) => {
    if (!value.trim()) return
    navigate(`/members?q=${encodeURIComponent(value.trim())}`)
  }

  return (
    <header className="safe-top sticky top-0 z-30 border-b border-cream-300 bg-cream-100/85 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:py-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl border border-cream-300 bg-white p-2.5 text-navy-700 transition hover:border-navy-300 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-lg font-semibold text-navy-900 sm:text-xl">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden truncate text-sm text-navy-500 sm:block">
              {subtitle}
            </p>
          )}
        </div>

        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={submitSearch}
          placeholder="Search members…"
          className="hidden w-64 md:block xl:w-80"
        />

        <button
          type="button"
          onClick={() => submitSearch(query)}
          className="rounded-xl border border-cream-300 bg-white p-2.5 text-navy-700 transition hover:border-navy-300 md:hidden"
          aria-label="Search members"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>

        {onAddMember && (
          <Button
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={onAddMember}
            className="hidden sm:inline-flex"
          >
            Add member
          </Button>
        )}

        <InstallAppButton />

        <NotificationBell />

        {isDemoMode && (
          <span
            className="hidden items-center gap-2 rounded-full border border-gold-200 bg-gold-50 px-3 py-1.5 text-xs font-medium text-gold-800 xl:inline-flex"
            title={DEMO_NOTICE}
          >
            Demo data
          </span>
        )}

        <DesktopWindowControls />

        <Avatar
          firstName={firstName}
          lastName={rest.join(' ')}
          size="sm"
          className="ring-2 ring-white"
        />
      </div>

      <SearchInput
        value={query}
        onChange={setQuery}
        onSubmit={submitSearch}
        placeholder="Search members, families, ministries…"
        label="Search members"
        className="px-4 pb-3 md:hidden"
        inputClassName="h-10"
      />
    </header>
  )
}

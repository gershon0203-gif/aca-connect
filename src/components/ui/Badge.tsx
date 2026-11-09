import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { MEMBER_STATUS_LABELS } from '@/lib/member-status'
import type { MemberStatus } from '@/types'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'navy' | 'gold'

const TONES: Record<Tone, string> = {
  neutral: 'bg-cream-200 text-navy-700',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  danger: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  navy: 'bg-navy-100 text-navy-800',
  gold: 'bg-gold-100 text-gold-800',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
      {...props}
    />
  )
}

const STATUS_TONE: Record<MemberStatus, Tone> = {
  active: 'success',
  new: 'gold',
  inactive: 'neutral',
  transferred: 'navy',
}

export function StatusBadge({ status }: { status: MemberStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{MEMBER_STATUS_LABELS[status]}</Badge>
}

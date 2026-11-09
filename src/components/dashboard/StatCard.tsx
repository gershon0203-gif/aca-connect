import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { Stat } from '@/types'

export function StatCard({ stat }: { stat: Stat }) {
  const positive = stat.delta >= 0
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-navy-500">{stat.label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-display text-3xl leading-none font-semibold text-navy-900">
          {stat.value}
        </p>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
            positive
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-600',
          )}
        >
          {positive ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {Math.abs(stat.delta)}%
        </span>
      </div>
      <p className="mt-3 text-xs text-navy-400">{stat.hint}</p>
    </Card>
  )
}

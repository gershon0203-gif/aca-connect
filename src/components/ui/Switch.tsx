import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Switch({ label, description, checked, onChange }: SwitchProps) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-navy-800">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-sm text-navy-500">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
          checked ? 'bg-navy-900' : 'bg-navy-200',
        )}
      >
        <span
          className={cn(
            'inline-block size-4.5 rounded-full bg-white shadow transition',
            checked ? 'translate-x-5.5' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}

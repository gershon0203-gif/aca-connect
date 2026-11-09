import { useId } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
  inputClassName?: string
}

export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search…',
  label = 'Search',
  className,
  inputClassName,
}: SearchInputProps) {
  const id = useId()
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-navy-300"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.(value)
        }}
        placeholder={placeholder}
        className={cn(
          'h-11 w-full rounded-xl border border-cream-300 bg-white pr-10 pl-11 text-sm text-navy-900 transition placeholder:text-navy-300 hover:border-navy-200 focus:border-navy-400 focus:outline-none',
          '[&::-webkit-search-cancel-button]:appearance-none',
          inputClassName,
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1 text-navy-300 transition hover:bg-cream-200 hover:text-navy-700"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

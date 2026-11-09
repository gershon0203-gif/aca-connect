import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ToastContext,
  type Toast,
  type ToastContextValue,
  type ToastVariant,
} from './toast-context'

const VARIANT_ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
} as const

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'text-emerald-600',
  error: 'text-red-500',
  info: 'text-navy-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'info' }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, title, description, variant }])
      window.setTimeout(() => dismiss(id), 4200)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[22rem]"
      >
        {toasts.map((t) => {
          const Icon = VARIANT_ICON[t.variant]
          return (
            <div
              key={t.id}
              role="status"
              className="animate-fade-up pointer-events-auto flex items-start gap-3 rounded-xl border border-cream-300 bg-white p-4 shadow-lifted"
            >
              <Icon
                className={cn(
                  'mt-0.5 size-5 shrink-0',
                  VARIANT_CLASSES[t.variant],
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-sm text-navy-500">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-m-1 rounded-lg p-1 text-navy-300 transition hover:bg-cream-200 hover:text-navy-700"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

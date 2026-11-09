import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade-in absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-description' : undefined}
        tabIndex={-1}
        className={cn(
          'animate-fade-up safe-bottom relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-lifted outline-none sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4">
          <div>
            <h2
              id="modal-title"
              className="font-display text-lg font-semibold text-navy-900"
            >
              {title}
            </h2>
            {description && (
              <p
                id="modal-description"
                className="mt-0.5 text-sm text-navy-500"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-m-1 rounded-lg p-1.5 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-cream-200 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  /** Shows a busy state and blocks dismissal while the action runs. */
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

/**
 * Accessible confirmation step for destructive actions. Cancellation (X, ESC,
 * backdrop) keeps the item safe; confirming passes control to the caller, which
 * owns the actual data-access call.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      description={typeof description === 'string' ? description : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            tone === 'danger'
              ? 'bg-red-50 text-red-600'
              : 'bg-navy-100 text-navy-700',
          )}
        >
          <AlertTriangle className="size-5" />
        </span>
        <div className="text-sm text-navy-600">{description}</div>
      </div>
    </Modal>
  )
}

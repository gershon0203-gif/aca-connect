import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

export interface ToastContextValue {
  toast: (
    input: Omit<Toast, 'id' | 'variant'> & { variant?: ToastVariant },
  ) => void
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

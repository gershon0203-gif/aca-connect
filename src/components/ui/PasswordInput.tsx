import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from './FormField'

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: string
  error?: string
  leadingIcon?: ReactNode
}

/**
 * A password field with an accessible show/hide toggle. Wraps the shared
 * `Input` so it inherits the same validation and styling.
 */
export function PasswordInput({ leadingIcon, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      leadingIcon={leadingIcon}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="rounded-lg p-1.5 text-navy-400 transition hover:text-navy-700"
        >
          {visible ? (
            <EyeOff className="size-4.5" />
          ) : (
            <Eye className="size-4.5" />
          )}
        </button>
      }
    />
  )
}

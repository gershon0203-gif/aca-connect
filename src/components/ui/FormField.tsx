import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FieldShellProps {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium text-navy-800"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-navy-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

const controlClasses =
  'h-11 w-full rounded-xl border border-cream-300 bg-white px-3.5 text-sm text-navy-900 transition placeholder:text-navy-300 hover:border-navy-200 focus:border-navy-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-cream-100 disabled:text-navy-400'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  leadingIcon?: ReactNode
  /** Interactive element rendered at the end of the control (e.g. show password). */
  trailing?: ReactNode
}

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  trailing,
  required,
  className,
  id,
  ...props
}: InputProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-navy-300">
            {leadingIcon}
          </span>
        )}
        <input
          id={fieldId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
          }
          className={cn(
            controlClasses,
            leadingIcon ? 'pl-10' : undefined,
            trailing ? 'pr-11' : undefined,
            error && 'border-red-300 focus:border-red-400',
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="absolute top-1/2 right-1.5 -translate-y-1/2">
            {trailing}
          </span>
        )}
      </div>
    </FieldShell>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
  options: Array<{ value: string; label: string }>
  placeholder?: string
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  required,
  className,
  id,
  ...props
}: SelectProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <div className="relative">
        <select
          id={fieldId}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
          }
          className={cn(
            controlClasses,
            'appearance-none pr-10',
            error && 'border-red-300',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-navy-400"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
}

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  id,
  ...props
}: TextareaProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <textarea
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={
          error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined
        }
        className={cn(
          controlClasses,
          'h-auto min-h-24 resize-y py-2.5',
          error && 'border-red-300',
          className,
        )}
        {...props}
      />
    </FieldShell>
  )
}

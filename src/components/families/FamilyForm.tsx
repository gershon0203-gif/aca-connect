import { useState, type FormEvent } from 'react'
import { isDemoMode } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/FormField'
import type { FamilyDetail, FamilyInput } from '@/types'

interface FamilyFormProps {
  mode: 'create' | 'edit'
  initial: FamilyDetail | null
  onCancel: () => void
  /** Performs the real write; rejects with a message on failure. */
  onSubmit: (input: FamilyInput) => Promise<void>
}

interface FormValues {
  name: string
  address: string
  notes: string
}

function initialValues(initial: FamilyDetail | null): FormValues {
  return {
    name: initial?.name ?? '',
    address: initial?.address ?? '',
    notes: initial?.notes ?? '',
  }
}

export function FamilyForm({
  mode,
  initial,
  onCancel,
  onSubmit,
}: FamilyFormProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(initial))
  const [nameError, setNameError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const set = (key: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    if (key === 'name') setNameError(undefined)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = values.name.trim()
    if (!name) {
      setNameError('A household name is required.')
      setSubmitError('Please correct the highlighted field.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit({
        name,
        address: values.address,
        notes: values.notes,
      })
      // The parent closes the form on success.
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      <Input
        label="Household name"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        error={nameError}
        hint="Usually the family surname, e.g. “Daniel Family”."
        required
        disabled={submitting}
      />

      <Input
        label="Address"
        value={values.address}
        onChange={(e) => set('address', e.target.value)}
        disabled={submitting}
      />

      <Textarea
        label="Notes"
        value={values.notes}
        onChange={(e) => set('notes', e.target.value)}
        placeholder="Anything worth remembering about this household…"
        disabled={submitting}
      />

      <div className="flex flex-col gap-3 border-t border-cream-200 pt-5">
        <p className="text-xs text-navy-400">
          {isDemoMode
            ? 'Demo workspace · this household is stored in memory for this session only.'
            : 'This household will be saved to the connected database.'}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {mode === 'create' ? 'Add household' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  )
}

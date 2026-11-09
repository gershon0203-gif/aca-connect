import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/FormField'
import { MemberLinker } from './MemberLinker'
import {
  RELATIONSHIP_TYPE_OPTIONS,
} from '@/lib/family-relationships'
import { fullName } from '@/lib/format'
import type { Member, MemberRelationshipType } from '@/types'

export interface RelationshipDraft {
  relatedCode: string
  type: MemberRelationshipType
  label: string | null
}

interface RelationshipEditorProps {
  /** The member being viewed — always the subject of the new relationship. */
  member: Member
  /** Candidate members to relate to (already loaded by the parent). */
  members: Member[]
  /** Codes already related to this member (cannot be chosen again). */
  exclude: string[]
  onCancel: () => void
  onSubmit: (draft: RelationshipDraft) => Promise<void>
}

/**
 * Add a typed relationship to a member. The viewed member is the subject: for
 * `parent`/`guardian` they are the senior party; for `spouse`/`sibling` the
 * direction does not matter; for `other` a short label is required.
 */
export function RelationshipEditor({
  member,
  members,
  exclude,
  onCancel,
  onSubmit,
}: RelationshipEditorProps) {
  const [type, setType] = useState<MemberRelationshipType>('spouse')
  const [relatedCode, setRelatedCode] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [errors, setErrors] = useState<{
    relatedCode?: string
    label?: string
  }>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const subjectName = fullName(member.firstName, member.lastName)

  const hint = (() => {
    switch (type) {
      case 'parent':
        return `${subjectName} is the parent of the member you choose.`
      case 'guardian':
        return `${subjectName} is the guardian of the member you choose.`
      case 'spouse':
        return `Record the marriage once — it will be shown on both records.`
      case 'sibling':
        return `${subjectName} and the chosen member are brothers or sisters.`
      default:
        return 'Describe how the two members are connected.'
    }
  })()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: { relatedCode?: string; label?: string } = {}
    if (!relatedCode) next.relatedCode = 'Choose a member.'
    if (type === 'other' && !label.trim()) {
      next.label = 'Add a short description for this relationship.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setSubmitError('Please complete the form.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit({
        relatedCode: relatedCode!,
        type,
        label: type === 'other' ? label.trim() : null,
      })
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

      <Select
        label="Relationship"
        value={type}
        onChange={(event) =>
          setType(event.target.value as MemberRelationshipType)
        }
        options={RELATIONSHIP_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        hint={hint}
        disabled={submitting}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-navy-800">
          {type === 'parent' || type === 'guardian'
            ? 'Their child / ward'
            : 'Related member'}
          <span className="ml-0.5 text-red-500" aria-hidden="true">
            *
          </span>
        </span>
        <MemberLinker
          members={members}
          value={relatedCode}
          onChange={setRelatedCode}
          exclude={[member.id, ...exclude]}
          disabled={submitting}
          aria-label="Choose the related member"
        />
        {errors.relatedCode ? (
          <p className="text-xs font-medium text-red-600">{errors.relatedCode}</p>
        ) : null}
      </div>

      {type === 'other' && (
        <Input
          label="Relationship label"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value)
            setErrors((prev) => ({ ...prev, label: undefined }))
          }}
          error={errors.label}
          placeholder="e.g. Cousin, Godparent, In-law"
          maxLength={40}
          disabled={submitting}
        />
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-cream-200 pt-5 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Add relationship
        </Button>
      </div>
    </form>
  )
}

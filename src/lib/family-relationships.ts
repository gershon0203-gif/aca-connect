import type { MemberRelationshipType } from '@/types'

/**
 * Relationship presentation helpers
 * ==================================
 *
 * The database stores a relationship once per pair, from a canonical direction
 * (for `parent`/`guardian` the subject is the senior side). These pure helpers
 * turn a stored type + whether the viewed member is the subject into the label
 * a person expects to read beside the *other* member's name.
 */

export interface RelationshipTypeOption {
  value: MemberRelationshipType
  /** Short label for the type picker. */
  label: string
  /** One-line explanation shown under the picker. */
  hint: string
}

export const RELATIONSHIP_TYPE_OPTIONS: RelationshipTypeOption[] = [
  {
    value: 'spouse',
    label: 'Spouse',
    hint: 'Husband or wife (recorded once for the couple).',
  },
  {
    value: 'parent',
    label: 'Parent',
    hint: 'This member is the parent of the chosen member.',
  },
  {
    value: 'sibling',
    label: 'Sibling',
    hint: 'Brother or sister.',
  },
  {
    value: 'guardian',
    label: 'Guardian',
    hint: 'This member is the guardian of the chosen member.',
  },
  {
    value: 'other',
    label: 'Other',
    hint: 'Any other relationship — describe it in the label.',
  },
]

const TYPE_LABEL: Record<MemberRelationshipType, string> = {
  spouse: 'Spouse',
  parent: 'Parent',
  sibling: 'Sibling',
  guardian: 'Guardian',
  other: 'Related',
}

/** The generic label for a relationship type. */
export function relationshipTypeLabel(type: MemberRelationshipType): string {
  return TYPE_LABEL[type]
}

/**
 * The label to show beside the *other* member, read from the viewed member's
 * point of view. E.g. a stored `parent` where the viewed member is the parent
 * reads "Child"; when the viewed member is the child it reads "Parent".
 */
export function describeRelationship(
  type: MemberRelationshipType,
  subjectIsViewed: boolean,
  label?: string | null,
): string {
  switch (type) {
    case 'parent':
      return subjectIsViewed ? 'Child' : 'Parent'
    case 'guardian':
      return subjectIsViewed ? 'Ward' : 'Guardian'
    case 'other':
      return label?.trim() || 'Related'
    default:
      return TYPE_LABEL[type]
  }
}

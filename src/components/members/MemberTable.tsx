import { ChevronRight, Home, Pencil, Trash2 } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Avatar } from '@/components/ui/Avatar'
import { StatusBadge, Badge } from '@/components/ui/Badge'
import { fullName, formatDate } from '@/lib/format'
import type { Member } from '@/types'

interface MemberTableProps {
  members: Member[]
  /** Resolved household names keyed by family ID. */
  familyNames?: Record<string, string>
  onSelect?: (member: Member) => void
  /** Omitted entirely for viewers without manage permission. */
  onEdit?: (member: Member) => void
  onRemove?: (member: Member) => void
}

export function MemberTable({
  members,
  familyNames = {},
  onSelect,
  onEdit,
  onRemove,
}: MemberTableProps) {
  const columns: Array<Column<Member>> = [
    {
      key: 'name',
      header: 'Member',
      render: (member) => (
        <div className="flex items-center gap-3">
          <Avatar
            firstName={member.firstName}
            lastName={member.lastName}
            src={member.avatarUrl}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-navy-900">
              {fullName(member.firstName, member.lastName)}
            </p>
            <p className="truncate text-xs text-navy-400">{member.id}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      cellClassName: 'hidden lg:table-cell',
      headerClassName: 'hidden lg:table-cell',
      render: (member) => (
        <div className="min-w-0">
          <p className="truncate text-navy-700">{member.email}</p>
          <p className="truncate text-xs text-navy-400">{member.phone}</p>
        </div>
      ),
    },
    {
      key: 'family',
      header: 'Household',
      cellClassName: 'hidden xl:table-cell',
      headerClassName: 'hidden xl:table-cell',
      render: (member) =>
        member.familyId && familyNames[member.familyId] ? (
          <span className="inline-flex items-center gap-1.5 truncate text-navy-600">
            <Home className="size-3.5 shrink-0 text-navy-300" aria-hidden="true" />
            {familyNames[member.familyId]}
          </span>
        ) : (
          <span className="text-navy-300">—</span>
        ),
    },
    {
      key: 'ministries',
      header: 'Ministries',
      cellClassName: 'hidden xl:table-cell',
      headerClassName: 'hidden xl:table-cell',
      render: (member) =>
        member.ministries.length > 0 ? (
          <span className="truncate text-navy-600">
            {member.ministries.join(', ')}
          </span>
        ) : (
          <span className="text-navy-300">—</span>
        ),
    },
    {
      key: 'joined',
      header: 'Joined',
      cellClassName: 'hidden md:table-cell',
      headerClassName: 'hidden md:table-cell',
      render: (member) => (
        <span className="text-navy-600">{formatDate(member.joinedAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (member) => (
        <div className="flex items-center justify-end gap-3">
          {member.baptismStatus === 'baptised' && (
            <Badge tone="success" className="hidden xl:inline-flex">
              Baptised
            </Badge>
          )}
          <StatusBadge status={member.status} />
        </div>
      ),
    },
  ]

  if (onEdit || onRemove) {
    columns.push({
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (member) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {onEdit && (
            <button
              type="button"
              aria-label={`Edit ${fullName(member.firstName, member.lastName)}`}
              onClick={() => onEdit(member)}
              className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
            >
              <Pencil className="size-4" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${fullName(member.firstName, member.lastName)}`}
              onClick={() => onRemove(member)}
              className="rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <ChevronRight className="size-4 text-navy-300" aria-hidden="true" />
        </div>
      ),
    })
  }

  return (
    <DataTable
      columns={columns}
      rows={members}
      getRowId={(member) => member.id}
      onRowClick={onSelect}
      caption="Church members"
    />
  )
}

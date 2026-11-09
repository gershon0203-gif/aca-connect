import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  /** Tailwind classes controlling responsive visibility, e.g. `hidden md:table-cell`. */
  cellClassName?: string
  headerClassName?: string
  align?: 'left' | 'right' | 'center'
}

interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  caption?: string
}

const ALIGN: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  onRowClick,
  caption,
}: DataTableProps<T>) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-cream-200 bg-cream-50/60">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-5 py-3 text-xs font-semibold tracking-wide text-navy-400 uppercase',
                  ALIGN[column.align ?? 'left'],
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-200">
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'transition',
                onRowClick &&
                  'cursor-pointer hover:bg-cream-50 focus-within:bg-cream-50',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-5 py-3.5 align-middle text-navy-700',
                    ALIGN[column.align ?? 'left'],
                    column.cellClassName,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

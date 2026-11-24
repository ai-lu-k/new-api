/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { Row, TableState } from '@tanstack/react-table'

/** The parts of a `Row` that identify it across two result sets. */
type RowIdentity = Pick<Row<unknown>, 'id' | 'index' | 'original'>

/**
 * Identity of one row for the list handoff (`data-diff-key`).
 *
 * TanStack falls back to the row *index* when the table declares no
 * `getRowId`, and an index repeats on every page: page 2 would look like the
 * same twenty rows, so the handoff would move nothing and drop nothing. In that
 * case the entity id carried by the row data is used instead. Rows without one
 * keep the index and simply do not animate across pages.
 */
export function getRowDiffKey(row: RowIdentity): string {
  if (row.id !== String(row.index)) return row.id

  const original: unknown = row.original
  if (original && typeof original === 'object' && 'id' in original) {
    const id = (original as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }

  return row.id
}

/**
 * One string that changes exactly when the visible result set changes.
 *
 * The row ids alone are not enough: with server-side pagination every page
 * hands back rows `0…n-1`, so paging would look like "the same list". Sorting,
 * filtering and the page itself are part of the signature, while selection,
 * column visibility or a drawer opening are not — those must not run the
 * handoff (motion contract §10.1).
 */
export function getListEntranceSignature(
  rows: readonly RowIdentity[],
  state: Partial<TableState> | undefined
): string {
  return [
    state?.pagination?.pageIndex ?? 0,
    state?.pagination?.pageSize ?? 0,
    JSON.stringify(state?.sorting ?? []),
    JSON.stringify(state?.columnFilters ?? []),
    String(state?.globalFilter ?? ''),
    // The same identity the handoff keys on: with an index-keyed table the
    // ids alone repeat on every page, so a re-ordered or re-fetched list would
    // look unchanged.
    rows.map((row) => getRowDiffKey(row)).join(','),
  ].join('|')
}

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
import type { QueryClient } from '@tanstack/react-query'

/** Every read the hub's writes can make stale: accounts, tasks and history. */
const ACCOUNT_STATE_QUERIES: string[][] = [
  ['workbuddy', 'accounts'],
  ['workbuddy', 'tasks'],
  ['workbuddy', 'activity-history'],
]

/**
 * Refreshes what a write to the hub invalidates. A check-in or a task run
 * changes an account's streak and credits, so the task snapshot, the account
 * table and the activity history all have to be re-read together.
 */
export async function invalidateAccountState(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all(
    ACCOUNT_STATE_QUERIES.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey })
    )
  )
}

/** Refreshes the scheduler panel after a toggle or a manual trigger. */
export async function invalidateScheduler(
  queryClient: QueryClient
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['workbuddy', 'scheduler'] })
}

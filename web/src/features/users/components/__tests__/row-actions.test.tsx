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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

import type { User } from '../../types'
import { DataTableRowActions } from '../data-table-row-actions'
import { UsersProvider } from '../users-provider'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})

const target: User = {
  id: 2,
  username: 'managed-user',
  display_name: '',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
}

const ROW_COLUMNS: ColumnDef<User>[] = [
  { id: 'username', accessorKey: 'username' },
]

function RowActions(props: { user: User }) {
  const table = useReactTable({
    data: [props.user],
    columns: ROW_COLUMNS,
    getCoreRowModel: getCoreRowModel(),
  })
  return <DataTableRowActions row={table.getRowModel().rows[0]} />
}

function renderRowActions() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <UsersProvider>
            <RowActions user={target} />
          </UsersProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
  return client
}

async function openMenuAndChoose(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Open menu' }))
  await userEvent.click(screen.getByRole('menuitem', { name }))
}

afterEach(() => {
  cleanup()
})

it('asks before promoting an account and shows the resulting role', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  renderRowActions()
  await openMenuAndChoose('Promote')
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('managed-user')).toBeInTheDocument()
  expect(
    within(dialog).getByText('Role: User → Administrator')
  ).toBeInTheDocument()
  // Nothing is sent until the operator confirms.
  expect(post).not.toHaveBeenCalled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Promote' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/manage', {
      id: 2,
      action: 'promote',
    })
  )
})

it('cancelling the confirmation leaves the account untouched', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  renderRowActions()
  await openMenuAndChoose('Disable')
  const dialog = await screen.findByRole('alertdialog')
  expect(
    within(dialog).getByText('Status: Enabled → Disabled')
  ).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
  expect(post).not.toHaveBeenCalled()
})

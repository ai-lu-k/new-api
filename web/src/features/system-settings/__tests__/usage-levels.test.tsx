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
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../components/settings-page-context'
import {
  parseUsageLevelThresholds,
  usageLevelSchema,
} from '../general/usage-level-schema'
import { UsageLevelSettingsSection } from '../general/usage-level-settings-section'

let client: QueryClient | undefined
afterEach(() => {
  client?.clear()
  document.querySelector('#actions')?.remove()
  vi.restoreAllMocks()
})

describe('usage level threshold settings', () => {
  it('uses defaults for absent or malformed settings and rejects invalid milestone sequences', () => {
    expect(parseUsageLevelThresholds('')).toEqual([10, 50, 200, 1000, 5000])
    expect(parseUsageLevelThresholds('null')).toEqual([10, 50, 200, 1000, 5000])
    expect(parseUsageLevelThresholds('[2,20,80,500,2000]')).toEqual([
      2, 20, 80, 500, 2000,
    ])
    for (const thresholds of [
      [0, 50, 200, 1000, 5000],
      [10, 10, 200, 1000, 5000],
      [50, 10, 200, 1000, 5000],
      [10.5, 50, 200, 1000, 5000],
      [10, 50, 200, 1000, 1_000_000_001],
      [10, 50],
    ]) {
      expect(usageLevelSchema.safeParse({ thresholds }).success).toBe(false)
    }
  })

  it('prevents invalid saves and publishes all five valid thresholds together', async () => {
    const update = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    function Page() {
      return (
        <SettingsPageProvider
          actionsContainer={document.querySelector<HTMLDivElement>('#actions')}
          suppressSectionHeader={false}
        >
          <UsageLevelSettingsSection defaultValue='[10,50,200,1000,5000]' />
        </SettingsPageProvider>
      )
    }
    const actions = document.createElement('div')
    actions.id = 'actions'
    document.body.append(actions)
    const root = createRootRoute({ component: Page })
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const view = render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    const input = await screen.findByRole('spinbutton', {
      name: 'Threshold for LV2',
    })
    await user.clear(input)
    await user.type(input, '50')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(
      await screen.findByText(
        'Use increasing whole numbers from 1 to 1,000,000,000.'
      )
    ).toBeVisible()
    expect(update).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, '20')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('/api/option/', {
        key: 'usage_level.thresholds',
        value: '[20,50,200,1000,5000]',
      })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save Changes' })
      ).toBeDisabled()
    )
    view.unmount()
    client.clear()
    actions.remove()
  })
})
